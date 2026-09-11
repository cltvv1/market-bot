require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { chromium } = require('playwright-core');
const { getBotToken } = require('nestjs-telegraf');
const { DataSource } = require('typeorm');
const { configureApplication } = require('../src/app.bootstrap');
const { MESSENGER_SERVICE } = require('../src/messenger/messenger.types');
const { AdminAuthService } = require('../src/admin/admin-auth.service');
const { RegistrationRequestEntity } = require('../src/registrations/entities/registration.entity');
const { RegistrationFieldEntity } = require('../src/registrations/entities/registration-field.entity');
const { RegistrationEvidenceEntity } = require('../src/registrations/entities/registration-evidence.entity');
const { RegistrationRequirementEntity } = require('../src/registrations/entities/registration-requirement.entity');
const { CustomerWebSessionEntity } = require('../src/web-session/entities/customer-web-session.entity');
const { UserEntity } = require('../src/users/entities/user.entity');
const { AuditEventEntity } = require('../src/audit/entities/audit-event.entity');
const { FilesService } = require('../src/files/files.service');
const { REGISTRATION_FIELD_SEEDS } = require('../src/database/seed-data');
const { createTestPassword } = require('../test/test-password');

async function main() {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.BOT_POLLING_ENABLED, 'false');
    assert.equal(process.env.OUTBOUND_DELIVERY_WORKER_ENABLED, 'false');
    assert.equal(process.env.MAX_BOT_TOKEN || '', '');
    assert.match(process.env.TEST_DB_NAME || '', /(?:_test|test_)|(?:_ci_)/);
    process.env.SERVE_BUILT_UI = 'true';
    process.env.TRUST_PROXY = '1';
    const { AppModule } = require('../src/app.module');
    let providerCalls = 0;
    const fake = { sendMessage: async () => { providerCalls++; }, sendDocument: async () => { providerCalls++; }, sendImage: async () => { providerCalls++; } };
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MESSENGER_SERVICE).useValue(fake).compile();
    const app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApplication(app);
    app.get(getBotToken()).stop = () => undefined;
    let browser;
    try {
        await app.listen(0, '127.0.0.1');
        const base = await app.getUrl();
        const db = app.get(DataSource);
        const suffix = randomBytes(5).toString('hex');
        const password = createTestPassword(['client-registration-browser']);
        const auth = app.get(AdminAuthService);
        const operator = await auth.createStaff({ login: `customer-reg-operator-${suffix}`, displayName: 'Анна · демо-оператор', password, roles: ['operator'] });
        const engineer = await auth.createStaff({ login: `customer-reg-engineer-${suffix}`, displayName: 'Михаил · демо-инженер', password, roles: ['engineer'] });
        await db.manager.upsert(RegistrationFieldEntity, REGISTRATION_FIELD_SEEDS, ['name']);
        const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean).find(candidate => fs.existsSync(candidate));
        assert.ok(executablePath, 'Chrome or Chromium is required');
        browser = await chromium.launch({ executablePath, headless: true });
        const errors = []; const checks = []; let sequence = 0;
        const check = title => { checks.push(title); process.stdout.write(`PASS client registration browser: ${title}\n`); };
        const shots = process.env.FE_REG2_SCREENSHOT_DIR;
        if (shots) fs.mkdirSync(shots, { recursive: true });
        const screenshot = async (page, name) => { if (shots) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(shots, name), fullPage: true }); } };
        async function newPage(context) {
            if (!context) {
                context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', extraHTTPHeaders: { 'X-Forwarded-For': `10.117.0.${++sequence}` } });
                await context.route('**/*', route => {
                    const url = new URL(route.request().url());
                    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
                });
            }
            const page = await context.newPage();
            page.setDefaultTimeout(15_000);
            page.on('pageerror', error => errors.push(error.name));
            return page;
        }
        const customer = await newPage();
        const before = { users: await db.manager.count(UserEntity), registrations: await db.manager.count(RegistrationRequestEntity), audit: await db.manager.count(AuditEventEntity) };
        assert.equal((await customer.goto(`${base}/site/cash-registration`)).status(), 200);
        await customer.getByRole('button', { name: 'Начать новую регистрацию', exact: true }).waitFor();
        assert.equal(await db.manager.count(UserEntity), before.users);
        assert.equal(await db.manager.count(RegistrationRequestEntity), before.registrations);
        assert.equal(await db.manager.count(AuditEventEntity), before.audit);
        await screenshot(customer, 'registration-landing-desktop.png');
        check('anonymous landing renders without creating user, registration or Audit');
        let creates = 0;
        customer.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/registrations/drafts')) creates++; });
        await customer.getByRole('button', { name: 'Начать новую регистрацию', exact: true }).evaluate(button => { button.click(); button.click(); });
        await customer.waitForURL(/\/site\/registrations\/\d+\/edit$/);
        const id = Number(/registrations\/(\d+)/.exec(customer.url())[1]);
        const detailUrl = `${base}/site/registrations/${id}`;
        const editUrl = `${detailUrl}/edit`;
        const api = `${base}/api/client/registrations/${id}`;
        const field = (page, name) => page.locator(`#registration-field-${name}`);
        await field(customer, 'orgName').fill('Демо-мастерская «Контур»');
        await customer.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
        await customer.getByText('Черновик сохранён', { exact: true }).waitFor();
        assert.equal(creates, 1);
        await customer.reload();
        await field(customer, 'orgName').waitFor();
        assert.equal(await field(customer, 'orgName').inputValue(), 'Демо-мастерская «Контур»');
        await customer.getByRole('button', { name: 'Проверить и отправить' }).click();
        assert.equal(await field(customer, 'innKpp').getAttribute('aria-invalid'), 'true');
        assert.equal(await field(customer, 'innKpp').evaluate(element => element === document.activeElement), true);
        check('double start creates one draft; partial save and reload resume; missing required focuses field');
        await customer.goto(`${base}/site/cash-registration`);
        await customer.getByRole('link', { name: new RegExp(`Продолжить черновик #${id}`) }).click();
        await field(customer, 'innKpp').fill('0000000000');
        await field(customer, 'phoneToCall').fill('+7 (000) 000-00-00');
        await field(customer, 'urAdress').fill('Демонстрационный адрес, помещение для проверки анкеты');
        await field(customer, 'kktModel').fill('АТОЛ 30Ф');
        await customer.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
        await customer.getByText('Черновик сохранён', { exact: true }).waitFor();
        await screenshot(customer, 'registration-draft-desktop.png');
        await customer.setViewportSize({ width: 390, height: 844 });
        await screenshot(customer, 'registration-draft-mobile.png');
        assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await customer.setViewportSize({ width: 1440, height: 1000 });
        const second = await newPage(customer.context());
        await second.goto(editUrl); await field(second, 'orgName').waitFor();
        await field(customer, 'kktName').fill('Сохранённая торговая точка');
        await customer.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
        await customer.getByText('Черновик сохранён', { exact: true }).waitFor();
        await field(second, 'kktName').fill('Ввод во второй вкладке');
        await second.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
        await second.getByRole('heading', { name: 'Сверьте сохранённые данные' }).waitFor();
        assert.equal(await field(second, 'kktName').inputValue(), 'Ввод во второй вкладке');
        assert.equal(await second.getByRole('button', { name: 'Сохранить черновик', exact: true }).isDisabled(), true);
        await second.getByRole('button', { name: 'Загрузить сохранённые значения' }).click();
        assert.equal(await field(second, 'kktName').inputValue(), 'Сохранённая торговая точка');
        check('two draft tabs: stale save keeps local input and requires explicit reconciliation');
        let submissions = 0;
        await customer.route(`${api}/submit`, async route => { submissions++; const response = await route.fetch(); assert.equal(response.status(), 201); await route.abort('failed'); });
        await customer.getByRole('button', { name: 'Проверить и отправить' }).click();
        await customer.getByRole('button', { name: 'Отправить анкету', exact: true }).evaluate(button => { button.click(); button.click(); });
        await customer.waitForURL(detailUrl);
        await customer.getByText('Передана на проверку', { exact: true }).waitFor();
        assert.equal(submissions, 1); await customer.unroute(`${api}/submit`);
        assert.equal((await db.manager.findOneByOrFail(RegistrationRequestEntity, { id })).status, 'new');
        assert.equal(await db.manager.count(RegistrationRequestEntity), before.registrations + 1);
        check('lost submit response recovers committed registration, without automatic duplicate submit');
        await customer.getByRole('link', { name: 'Мои регистрации', exact: true }).click();
        await customer.getByRole('heading', { name: 'Мои регистрации', exact: true }).waitFor();
        await customer.reload(); await customer.getByRole('heading', { name: 'Мои регистрации', exact: true }).waitFor();
        await screenshot(customer, 'registration-list-desktop.png');
        await customer.goBack(); await customer.goForward();
        await customer.goto(detailUrl);
        await customer.getByText('Передана на проверку', { exact: true }).waitFor();
        check('owned list, reload, direct detail and Back/Forward use server state');
        const admin = await newPage();
        const adminUrl = `${base}/admin/requests/registrations/${id}?tab=readiness`;
        await admin.goto(adminUrl);
        await admin.locator('input[autocomplete="username"]').fill(operator.login);
        await admin.locator('input[autocomplete="current-password"]').fill(password);
        await admin.getByRole('button', { name: 'Войти', exact: true }).click();
        await admin.getByRole('tab', { name: 'Комплектность', exact: true }).waitFor();
        const card = (page, kind) => page.getByRole('article', { name: kind, exact: true });
        const kkt = 'Заводской номер ККТ', fn = 'Номер фискального накопителя', ofd = 'Код активации ОФД';
        async function refresh(page, client = true) {
            const response = page.waitForResponse(r => r.url() === (client ? api : `${base}/admin/api/registrations/${id}`) && r.ok());
            await page.getByRole('button', { name: client ? 'Обновить анкету' : 'Обновить данные', exact: true }).click();
            await response;
        }
        async function modal(trigger, title, fill) {
            await trigger.click(); const dialog = admin.getByRole('dialog'); await dialog.waitFor();
            if (fill) await fill(dialog);
            await dialog.getByRole('button', { name: title, exact: true }).click();
            await dialog.waitFor({ state: 'hidden' });
        }
        async function requestData(kind, message) {
            await card(admin, kind).locator('summary').click();
            await modal(card(admin, kind).getByRole('button', { name: 'Запросить у клиента', exact: true }), 'Запросить у клиента', dialog => dialog.getByLabel('Текст запроса клиенту').fill(message));
        }
        async function verify(kind) {
            await modal(card(admin, kind).getByRole('button', { name: 'Подтвердить проверку', exact: true }), 'Подтвердить проверку');
            await card(admin, kind).getByText('Проверено', { exact: true }).waitFor();
        }
        await requestData(kkt, 'Пожалуйста, передайте заводской номер кассы.');
        await refresh(customer);
        await card(customer, kkt).getByText('Пожалуйста, передайте заводской номер кассы.', { exact: true }).waitFor();
        await screenshot(customer, 'registration-detail-request-desktop.png');
        await card(customer, kkt).getByLabel('Передать номер', { exact: true }).fill('DEMO-KKT-001');
        await card(customer, kkt).getByRole('button', { name: 'Отправить данные', exact: true }).click();
        await card(customer, kkt).getByText('Получено, ожидает проверки', { exact: true }).waitFor();
        await card(customer, kkt).getByLabel('Передать номер', { exact: true }).fill('UNSENT-CUSTOMER-TEXT');
        await refresh(admin, false);
        await modal(card(admin, kkt).getByRole('button', { name: 'Внести значение', exact: true }), 'Внести значение', dialog => dialog.getByLabel('Значение', { exact: true }).fill('DEMO-KKT-002'));
        await card(customer, kkt).getByRole('button', { name: 'Отправить данные', exact: true }).click();
        await card(customer, kkt).getByRole('button', { name: 'Проверено, разрешить повторную отправку' }).waitFor();
        assert.equal(await card(customer, kkt).getByLabel('Передать номер', { exact: true }).inputValue(), 'UNSENT-CUSTOMER-TEXT');
        assert.equal(await card(customer, kkt).getByRole('button', { name: 'Отправить данные', exact: true }).isDisabled(), true);
        check('stale requirement response returns conflict, keeps input and never retries');
        await refresh(admin, false); await verify(kkt); await refresh(customer);
        await card(customer, kkt).getByText('Проверено сотрудником', { exact: true }).waitFor();
        check('operator request -> customer value -> provided -> separate operator verification');
        await requestData(fn, 'Пришлите фото или документ с номером фискального накопителя.');
        await refresh(customer);
        const file = { name: 'Демонстрационное-подтверждение-ФН.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSynthetic browser evidence\n%%EOF') };
        await card(customer, fn).getByLabel('Подтверждение: фото или документ').setInputFiles(file);
        let uploads = 0;
        const uploadUrl = `${api}/requirements/fiscal_drive_serial/evidence`;
        await customer.route(uploadUrl, async route => { uploads++; const result = await route.fetch(); assert.equal(result.status(), 201); await route.abort('failed'); });
        await card(customer, fn).getByRole('button', { name: 'Передать файл', exact: true }).evaluate(button => { button.click(); button.click(); });
        await card(customer, fn).getByRole('button', { name: 'Проверено, разрешить повторную отправку' }).waitFor();
        assert.equal(uploads, 1);
        assert.equal(await card(customer, fn).getByLabel('Подтверждение: фото или документ').evaluate(input => input.files[0]?.name), file.name);
        await card(customer, fn).getByText(file.name, { exact: true }).waitFor();
        await customer.unroute(uploadUrl);
        const download = customer.waitForEvent('download');
        await card(customer, fn).getByRole('button', { name: `Скачать ${file.name}`, exact: true }).click();
        assert.equal(await (await download).failure(), null);
        await refresh(admin, false);
        await modal(card(admin, fn).getByRole('button', { name: 'Внести значение', exact: true }), 'Внести значение', dialog => dialog.getByLabel('Значение', { exact: true }).fill('DEMO-FN-001'));
        await verify(fn);
        check('lost evidence response keeps File and refreshes attachment list; one upload and owner download');
        await modal(admin.getByRole('button', { name: 'Способ подключения ОФД', exact: true }), 'Способ подключения ОФД', dialog => dialog.getByRole('combobox', { name: 'Способ подключения', exact: true }).selectOption('customer_has_code'));
        await requestData(ofd, 'Передайте код активации ОФД.');
        await refresh(customer);
        const rawCode = randomBytes(20).toString('hex');
        await card(customer, ofd).getByLabel('Передать код ОФД').fill(rawCode);
        await card(customer, ofd).getByRole('button', { name: 'Отправить данные', exact: true }).click();
        await card(customer, ofd).getByText('Получено, ожидает проверки', { exact: true }).waitFor();
        assert.equal(await card(customer, ofd).getByLabel('Передать код ОФД').inputValue(), '');
        assert.equal((await customer.locator('body').innerText()).includes(rawCode), false);
        assert.equal(JSON.stringify(await (await customer.request.get(api)).json()).includes(rawCode), false);
        await refresh(admin, false); await verify(ofd); await refresh(customer);
        await customer.getByText('Данные комплектны', { exact: true }).waitFor();
        await modal(admin.getByRole('button', { name: 'Передать инженеру', exact: true }), 'Передать инженеру', dialog => dialog.getByRole('combobox', { name: 'Инженер', exact: true }).selectOption(String(engineer.id)));
        await refresh(customer);
        await customer.getByText('Передана инженеру', { exact: true }).waitFor();
        await customer.getByText(/Это не подтверждение регистрации кассы в ФНС/).waitFor();
        assert.equal(await customer.locator('.cr-response').count(), 0);
        assert.equal(await customer.getByRole('alert').count(), 0, 'Resolved readonly requirements must not retain old mutation errors');
        check('OFD stays masked; all checks ready; existing handoff yields honest readonly customer status');
        // Negative polling fixtures do not replace the real customer/operator workflow above.
        const processed = await (await customer.request.get(api)).json();
        const activeDetail = { ...processed, registration: { ...processed.registration, status: 'new', handedOffAt: null } };
        async function pollingPage() {
            const page = await newPage();
            await page.context().addCookies(await customer.context().cookies());
            await page.clock.install();
            return page;
        }
        for (const status of [400, 401, 403, 404]) {
            const page = await pollingPage();
            let reads = 0;
            await page.route(api, route => {
                reads++;
                return route.fulfill({ status: reads === 1 ? 200 : status, json: reads === 1 ? activeDetail : { message: 'Synthetic denied read' } });
            });
            await page.goto(detailUrl);
            await page.getByText('Передана на проверку', { exact: true }).waitFor();
            await page.clock.runFor(31_000);
            await page.getByRole('alert').waitFor();
            assert.equal(reads, 2);
            await page.clock.runFor(250_000);
            await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            await page.clock.runFor(1);
            assert.equal(reads, 2);
            await page.close();
            check(`polling stops after ${status}, including visibility changes`);
        }
        {
            const page = await pollingPage();
            let reads = 0, release, started;
            const blocked = new Promise(resolve => { release = resolve; });
            const reached = new Promise(resolve => { started = resolve; });
            await page.route(api, async route => {
                reads++;
                if (reads === 2) { started(); await blocked; }
                await route.fulfill({ json: activeDetail });
            });
            await page.goto(detailUrl);
            await page.getByText('Передана на проверку', { exact: true }).waitFor();
            await page.clock.runFor(31_000); await reached;
            await page.evaluate(() => { for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('visibilitychange')); });
            await page.clock.runFor(10_000);
            assert.equal(reads, 2);
            assert.equal(await page.getByRole('button', { name: 'Обновить анкету', exact: true }).isDisabled(), true);
            release();
            await page.waitForFunction(() => !document.querySelector('button[aria-label="Обновить анкету"]').disabled);
            await page.close();
            check('slow polling read is single-flight across repeated visibility events');
        }
        {
            const page = await pollingPage();
            let reads = 0;
            await page.route(api, route => {
                reads++;
                return route.fulfill({ status: reads === 2 ? 500 : 200, json: reads === 1 ? activeDetail : reads === 2 ? { message: 'Synthetic transient failure' } : processed });
            });
            await page.goto(detailUrl);
            await page.getByText('Передана на проверку', { exact: true }).waitFor();
            await page.clock.runFor(31_000); await page.getByRole('alert').waitFor();
            await page.clock.runFor(59_000); assert.equal(reads, 2);
            await page.clock.runFor(2_000);
            await page.getByText('Передана инженеру', { exact: true }).waitFor();
            assert.equal(reads, 3);
            await page.clock.runFor(250_000); assert.equal(reads, 3);
            await page.close();
            check('transient polling failure backs off; processed result stops subsequent polling');
        }
        const evidence = await db.manager.findOneByOrFail(RegistrationEvidenceEntity, { registrationId: id });
        await app.get(FilesService).logicalDelete(evidence.storedFileId);
        await refresh(customer); await customer.getByText('Файл недоступен', { exact: true }).waitFor();
        check('retired evidence has no usable download button');
        const foreign = await newPage();
        await foreign.goto(`${base}/site/cash-registration`);
        await foreign.getByRole('button', { name: 'Начать новую регистрацию', exact: true }).click();
        await foreign.waitForURL(/\/site\/registrations\/\d+\/edit$/);
        await foreign.goto(detailUrl); await foreign.getByRole('alert').waitFor();
        assert.equal(await foreign.locator('.cr-application').count(), 0);
        check('independent foreign customer context cannot see the registration');
        const draftCustomer = await newPage();
        await draftCustomer.goto(`${base}/site/cash-registration`);
        await draftCustomer.getByRole('button', { name: 'Начать новую регистрацию', exact: true }).click();
        await draftCustomer.waitForURL(/\/site\/registrations\/\d+\/edit$/);
        await field(draftCustomer, 'orgName').fill('Демонстрационная организация с очень длинным наименованием '.repeat(4));
        await field(draftCustomer, 'urAdress').fill('Демонстрационный адрес и длинное название помещения '.repeat(5));
        for (const [width, height] of [[1440, 1000], [1280, 800], [768, 1024], [390, 844]]) {
            await draftCustomer.setViewportSize({ width, height }); await customer.setViewportSize({ width, height });
            for (const page of [draftCustomer, customer]) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
            await field(draftCustomer, 'orgName').focus(); await draftCustomer.keyboard.press('Tab');
            assert.equal(await field(draftCustomer, 'ogrn').evaluate(input => input === document.activeElement), true);
            if (width === 390) await screenshot(customer, 'registration-detail-mobile.png');
            check(`${width}x${height}: form/detail, long fields, no overflow and keyboard focus`);
        }
        const row = await db.manager.findOneByOrFail(RegistrationRequestEntity, { id });
        await db.manager.update(CustomerWebSessionEntity, { userId: row.userId }, { expiresAt: new Date(Date.now() - 1000) });
        await customer.getByRole('button', { name: 'Обновить анкету', exact: true }).click();
        await customer.getByText(/Эта сессия браузера больше недоступна/).waitFor();
        assert.equal(await customer.locator('.cr-application').count(), 0);
        const usersAfterExpiry = await db.manager.count(UserEntity);
        await customer.reload(); await customer.getByText(/Эта сессия браузера больше недоступна/).waitFor();
        assert.equal(await db.manager.count(UserEntity), usersAfterExpiry);
        check('expired session clears private data and reload does not silently create identity');
        assert.equal(providerCalls, 0, 'No messenger provider calls');
        assert.equal(errors.length, 0, 'No browser runtime errors');
        process.stdout.write(`Client registration browser smoke passed: ${checks.length} checks.\n`);
    } catch (error) {
        const page = browser?.contexts()[0]?.pages()[0];
        if (page) await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'vitma-fe-reg2-browser-failure.png'), fullPage: true, mask: [page.locator('input'), page.locator('textarea')] });
        throw error;
    } finally { await browser?.close(); await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
