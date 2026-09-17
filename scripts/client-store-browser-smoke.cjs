require('reflect-metadata');
const { fixture: fileFixture } = require('../test/fixtures/files.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const PDFDocument = require('pdfkit');
const { Test } = require('@nestjs/testing');
const { chromium } = require('playwright-core');
const { getBotToken } = require('nestjs-telegraf');
const { configureApplication } = require('../src/app.bootstrap');
const { MESSENGER_SERVICE } = require('../src/messenger/messenger.types');
const { OrderEntity } = require('../src/orders/entities/order.entity');
const { OrderDocumentEntity } = require('../src/orders/entities/order-document.entity');
const { OrdersService } = require('../src/orders/orders.service');
const { OrganizationEntity } = require('../src/organizations/entities/organization.entity');
const { OrganizationMemberEntity } = require('../src/organizations/entities/organization-member.entity');
const { CustomerWebSessionEntity } = require('../src/web-session/entities/customer-web-session.entity');
const { catalogWorkspaceFixture } = require('../test/helpers/catalog-workspace-fixture');

async function main() {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.BOT_POLLING_ENABLED, 'false');
    assert.equal(process.env.OUTBOUND_DELIVERY_WORKER_ENABLED, 'false');
    assert.equal(process.env.MAX_BOT_TOKEN || '', '');
    assert.match(process.env.TEST_DB_NAME || '', /test/);
    process.env.SERVE_BUILT_UI = 'true'; process.env.TRUST_PROXY = '1';
    const { AppModule } = require('../src/app.module');
    let providerCalls = 0;
    const fake = { sendMessage: async () => { providerCalls++; }, sendDocument: async () => { providerCalls++; }, sendImage: async () => { providerCalls++; } };
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MESSENGER_SERVICE).useValue(fake).compile();
    const app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApplication(app); app.get(getBotToken()).stop = () => undefined;
    let browser; let lastPage;
    const checks = []; const errors = [];
    const check = title => { checks.push(title); process.stdout.write(`PASS client store browser: ${title}\n`); };
    try {
        await app.listen(0, '127.0.0.1');
        const base = await app.getUrl();
        const f = await catalogWorkspaceFixture(app);
        const suffix = randomUUID().slice(0, 8);
        const category = await f.category();
        let product = await f.product(category);
        product = (await f.command(`products/${product.id}`, { name: `Демо-терминал Вектор ${suffix}`, brand: 'Демо', shortDescription: 'Синтетическая позиция для проверки магазина.', features: ['Поддержка настройки', 'Для торговой точки'], specifications: { Модель: 'Вектор Demo' }, packageContents: ['Терминал', 'Блок питания'], displayPriceMinor: 1299050 }, 'patch').expect(200)).body;
        await f.command(`products/${product.id}/publish`, { expectedUpdatedAt: product.expectedUpdatedAt, expectedCategoryUpdatedAt: product.expectedCategoryUpdatedAt }).expect(201);
        const zero = await f.product(category);
        await f.command(`products/${zero.id}`, { name: `Демо-консультация ${suffix}`, displayPriceMinor: 0 }, 'patch').expect(200);
        await f.command(`products/${zero.id}/publish`).expect(201);
        const unknown = await f.product(category);
        await f.command(`products/${unknown.id}`, { name: `Демо-комплект ${suffix}`, displayPriceMinor: null, availabilityStatus: 'on_request' }, 'patch').expect(200);
        await f.command(`products/${unknown.id}/publish`).expect(201);
        const hidden = await f.product(category);
        const pdf = await new Promise((resolve, reject) => {
            const document = new PDFDocument(); const chunks = [];
            document.on('data', chunk => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject);
            document.text('SYNTHETIC INVOICE - NOT A REAL DOCUMENT'); document.end();
        });
        const png = fileFixture('image.png');
        const executablePath = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean).find(file => fs.existsSync(file));
        assert.ok(executablePath, 'Chrome or Chromium is required');
        browser = await chromium.launch({ executablePath, headless: true });
        async function context() {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
            await ctx.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === base || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort(); });
            return ctx;
        }
        async function pageIn(ctx) {
            const page = await ctx.newPage(); lastPage = page;
            page.on('pageerror', error => errors.push(error.message));
            return page;
        }
        const customer = await context(); const page = await pageIn(customer);
        let sessionPosts = 0; const orderPosts = [];
        page.on('request', request => {
            if (new URL(request.url()).pathname === '/api/client/session' && request.method() === 'POST') sessionPosts++;
            if (new URL(request.url()).pathname === '/api/client/orders' && request.method() === 'POST') orderPosts.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
        });
        async function goto(pathname, target = page) { lastPage = target; const response = await target.goto(base + pathname); assert.equal(response.status(), 200); }
        async function capture(name, target = page) {
            await target.evaluate(() => { window.scrollTo(0, 0); return new Promise(requestAnimationFrame); });
            assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow: ${name}`);
            if (process.env.FE_STORE1_SCREENSHOTS) {
                fs.mkdirSync(process.env.FE_STORE1_SCREENSHOTS, { recursive: true });
                await target.screenshot({ path: path.join(process.env.FE_STORE1_SCREENSHOTS, name), fullPage: true });
            }
        }
        async function cartStorage(target = page) { return target.evaluate(() => JSON.parse(localStorage.getItem('vitma_cart') || '[]')); }
        async function add(row, target = page) {
            await goto(`/site/catalog/${row.slug}`, target);
            await target.getByRole('button', { name: 'В корзину', exact: true }).click();
            await target.waitForFunction(id => JSON.parse(localStorage.getItem('vitma_cart') || '[]').some(line => line.productId === id), row.id);
        }
        async function checkout(target = page, organization = true) {
            await goto('/site/checkout', target);
            await target.getByRole('heading', { name: 'Оформление заказа', exact: true }).waitFor();
            if (organization) {
                await target.getByLabel('Наименование организации', { exact: false }).fill('Демо-мастерская Контур');
                await target.getByLabel('ИНН', { exact: false }).fill('1234567890');
            } else await target.getByLabel('Физлицо', { exact: true }).check();
            await target.getByLabel('Контактное лицо', { exact: false }).fill('Демо-покупатель');
            await target.getByLabel('Телефон', { exact: false }).fill('+7 000 000-00-00');
            await target.getByLabel('Способ получения', { exact: false }).selectOption('transport_company');
            await target.getByLabel('Город', { exact: false }).fill('Демо-город');
            await target.getByLabel('Адрес', { exact: false }).fill('Демонстрационный адрес');
        }
        async function submit(target = page) {
            const response = target.waitForResponse(response => response.url() === base + '/api/client/orders' && response.request().method() === 'POST');
            await target.getByRole('button', { name: 'Передать заказ менеджеру', exact: true }).click();
            const result = await response; assert.equal(result.status(), 201); const row = await result.json();
            await target.waitForURL(base + `/site/orders/${row.id}`);
            await target.getByRole('heading', { name: row.orderNumber, exact: true }).waitFor();
            await target.getByRole('heading', { name: 'Состав заказа', exact: true }).waitFor();
            return row;
        }
        async function refreshOrder(target = page) {
            const response = target.waitForResponse(response => response.url() === base + new URL(target.url()).pathname.replace('/site/', '/api/client/') && response.request().method() === 'GET');
            await target.getByRole('button', { name: 'Обновить заказ', exact: true }).click();
            const result = await response; assert.equal(result.status(), 200); const row = await result.json();
            await target.getByText(require('../client-ui/src/features/store/model').orderLabels[row.status], { exact: true }).first().waitFor();
            return row;
        }
        await goto(`/site/catalog?category=${category.slug}`);
        await page.getByRole('link', { name: product.name, exact: true }).waitFor();
        assert.equal(await page.getByRole('link', { name: hidden.name, exact: true }).count(), 0);
        await capture('store-catalog-desktop.png');
        check('canonical admin publication controls public storefront and draft products stay hidden');
        await page.getByLabel('Поиск в каталоге', { exact: true }).fill(product.sku);
        await page.getByRole('button', { name: 'Найти', exact: true }).last().click();
        await page.waitForURL(url => url.searchParams.get('search') === product.sku);
        await page.getByRole('link', { name: product.name, exact: true }).waitFor();
        await page.reload(); await page.getByRole('link', { name: product.name, exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('category'), category.slug);
        check('real SQL search/category filters survive URL reload');
        // Deliberately update both filters before the next React render.
        await page.evaluate(slug => {
            const panel = document.querySelector('.store-filters');
            const selects = panel.querySelectorAll('select');
            selects[0].value = slug; selects[0].dispatchEvent(new Event('change', { bubbles: true }));
            selects[1].value = 'in_stock'; selects[1].dispatchEvent(new Event('change', { bubbles: true }));
        }, category.slug);
        await page.waitForURL(url => url.searchParams.get('category') === category.slug && url.searchParams.get('availability') === 'in_stock' && url.searchParams.get('search') === product.sku);
        await page.getByRole('link', { name: product.name, exact: true }).click();
        await page.getByRole('heading', { name: product.name, exact: true }).waitFor();
        await page.reload(); await page.getByRole('heading', { name: product.name, exact: true }).waitFor();
        await capture('store-product-desktop.png');
        await page.goBack(); await page.getByRole('link', { name: product.name, exact: true }).waitFor(); await page.goForward();
        await page.getByRole('heading', { name: product.name, exact: true }).waitFor();
        check('rapid filter updates, product deep-link reload and Back/Forward preserve route facts');
        await add(product); await goto('/site/cart'); await page.getByRole('link', { name: product.name, exact: true }).waitFor();
        await page.reload(); await page.getByRole('link', { name: product.name, exact: true }).waitFor();
        assert.deepEqual(await cartStorage(), [{ productId: product.id, quantity: 1 }]); assert.equal(sessionPosts, 0);
        check('catalog/product/cart do not bootstrap sessions; cart reload persists IDs/quantities only');
        await f.command(`products/${product.id}`, { displayPriceMinor: 1499050 }, 'patch').expect(200);
        await page.getByRole('button', { name: 'Обновить цены', exact: true }).click();
        await page.waitForFunction(() => /14\s*990,50/.test(document.querySelector('.store-cart-total')?.textContent || ''));
        await capture('store-cart-desktop.png');
        check('cart hydration reflects actual backend price change');
        await add(unknown); await add(zero); await goto('/site/cart');
        await page.getByText('Некоторые позиции требуют расчёта менеджером.', { exact: true }).waitFor();
        await page.getByText('0,00 ₽', { exact: true }).waitFor();
        await page.getByRole('button', { name: `Удалить позицию ${unknown.id}`, exact: true }).click();
        await page.getByRole('button', { name: `Удалить позицию ${zero.id}`, exact: true }).click();
        check('on-request null price stays orderable with partial total; zero stays zero');
        await checkout(); assert.equal(sessionPosts, 0); await capture('store-checkout-desktop.png');
        const row = await submit();
        assert.equal(sessionPosts, 1); assert.equal(orderPosts.length, 1);
        assert.match(orderPosts[0].key, /^[0-9a-f-]{36}$/);
        assert.deepEqual(orderPosts[0].body.items, [{ productId: product.id, quantity: 1 }]);
        assert.equal(orderPosts[0].body.delivery.type, 'transport_company');
        assert.equal('email' in orderPosts[0].body.contact, false);
        for (const field of ['payment', 'price', 'status', 'managerId']) assert.equal(field in orderPosts[0].body, false);
        assert.deepEqual(await cartStorage(), []);
        await capture('store-order-detail-desktop.png');
        check('explicit submit creates one WebSession and canonical Order with real number, exact DTO and UUID');
        const staffCtx = await context(); const staff = await pageIn(staffCtx);
        await goto('/admin/sales/orders', staff);
        await staff.getByRole('heading', { name: 'Вход для сотрудников', exact: true }).waitFor();
        await staff.locator('input[autocomplete="username"]').fill(f.sales.user.login);
        await staff.locator('input[autocomplete="current-password"]').fill(f.password);
        await staff.getByRole('button', { name: 'Войти', exact: true }).click();
        await staff.getByLabel('Поиск', { exact: true }).fill(row.orderNumber);
        await staff.getByRole('button', { name: 'Найти заказы', exact: true }).click();
        await staff.locator(`[data-order-id="${row.id}"] a`).click();
        await staff.getByRole('tab', { name: 'Обзор', exact: true }).waitFor();
        async function action(name, fill) {
            await staff.getByRole('button', { name, exact: true }).click();
            const modal = staff.getByRole('dialog'); await modal.waitFor(); if (fill) await fill(modal);
            await modal.getByRole('button', { name, exact: true }).click(); await modal.waitFor({ state: 'hidden' });
        }
        await action('Начать согласование');
        await refreshOrder(); await page.getByText('Менеджер проверяет заказ', { exact: true }).first().waitFor();
        await staff.getByRole('tab', { name: 'Предложение', exact: true }).click();
        await action('Изменить предложение', modal => modal.getByLabel(`Цена: ${product.name}`, { exact: true }).fill('14000,00'));
        await refreshOrder(); assert.equal(await page.getByRole('heading', { name: 'Согласованное предложение', exact: true }).count(), 0);
        check('same Order reaches production Admin Orders; draft quote is not leaked to customer');
        await action('Согласовать заказ'); await refreshOrder();
        await page.getByRole('heading', { name: 'Согласованное предложение', exact: true }).waitFor();
        await page.getByRole('heading', { name: 'Итого: 14 000,00 ₽', exact: true }).waitFor();
        await staff.getByRole('tab', { name: 'Оплата', exact: true }).click();
        await action('Загрузить счёт', modal => modal.locator('input[type=file]').setInputFiles({ name: 'Демо-счёт.pdf', mimeType: 'application/pdf', buffer: pdf }));
        await refreshOrder(); await page.getByText('Ожидается оплата', { exact: true }).first().waitFor();
        const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Скачать', exact: true }).click();
        const downloaded = await download; assert.equal(downloaded.suggestedFilename(), 'Демо-счёт.pdf');
        assert.deepEqual(fs.readFileSync(await downloaded.path()), pdf);
        check('confirmed quote and scoped invoice download reflect real manager actions');
        await page.locator('input[type=file]').setInputFiles({ name: 'Демо-платёжка.png', mimeType: 'image/png', buffer: png });
        const proofResponse = page.waitForResponse(response => response.url().endsWith(`/api/client/orders/${row.id}/payment-proofs`) && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Отправить платёжное поручение', exact: true }).click();
        const proof = await proofResponse; assert.equal(proof.status(), 201); assert.equal((await proof.json()).status, 'waiting_payment');
        await page.getByText('Платёжное поручение получено. Подтверждение оплаты ожидается от менеджера.', { exact: true }).waitFor();
        await staff.getByRole('button', { name: 'Обновить данные', exact: true }).click();
        await staff.getByText('Демо-платёжка.png', { exact: true }).waitFor();
        await capture('store-order-payment-desktop.png');
        check('real customer payment proof reaches manager and does not auto-confirm payment');
        let proofPosts = 0;
        const proofPath = `${base}/api/client/orders/${row.id}/payment-proofs`;
        await page.route(proofPath, async route => { proofPosts++; const response = await route.fetch(); assert.equal(response.status(), 201); await route.abort('failed'); });
        await page.locator('input[type=file]').setInputFiles({ name: 'Демо-платёжка-повтор.pdf', mimeType: 'application/pdf', buffer: pdf });
        await page.getByRole('button', { name: 'Отправить платёжное поручение', exact: true }).click();
        await page.getByText('Демо-платёжка-повтор.pdf', { exact: true }).waitFor();
        await page.getByText('Платёжное поручение получено. Подтверждение оплаты ожидается от менеджера.', { exact: true }).waitFor();
        assert.equal(proofPosts, 1); await page.unroute(proofPath);
        check('lost payment-proof response reconciles by server document hash without duplicate upload');
        let rejectedProofPosts = 0;
        await page.route(proofPath, route => { rejectedProofPosts++; return route.fulfill({ status: 409, json: { code: 'CONFLICT' } }); });
        const detailPath = `${base}/api/client/orders/${row.id}`;
        await page.route(detailPath, route => route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } }));
        await page.locator('input[type=file]').setInputFiles({ name: 'Демо-неотправленная.pdf', mimeType: 'application/pdf', buffer: pdf });
        await page.getByRole('button', { name: 'Отправить платёжное поручение', exact: true }).click();
        await page.getByText(/Проверьте документы заказа перед повтором/).waitFor();
        await page.getByText(/Не удалось подтвердить результат запроса/).waitFor();
        assert.equal(await page.locator('input[type=file]').evaluate(input => input.files[0].name), 'Демо-неотправленная.pdf');
        assert.equal(await page.getByRole('button', { name: 'Документа нет, разрешить повтор', exact: true }).count(), 0);
        await page.unroute(detailPath); await refreshOrder();
        await page.getByRole('button', { name: 'Перечитать заказ', exact: true }).click();
        await page.getByRole('button', { name: 'Документа нет, разрешить повтор', exact: true }).click();
        assert.equal(rejectedProofPosts, 1);
        assert.equal(await page.locator('input[type=file]').evaluate(input => input.files[0].name), 'Демо-неотправленная.pdf');
        await page.unroute(proofPath);
        check('proof conflict and failed reread retain selected File and require successful explicit reconciliation without automatic upload');
        await staff.getByRole('button', { name: 'Обновить данные', exact: true }).click();
        await staff.getByText('Демо-платёжка-повтор.pdf', { exact: true }).waitFor();
        await action('Подтвердить оплату', modal => modal.getByLabel('Основание', { exact: true }).selectOption('payment_order'));
        await refreshOrder(); await page.getByRole('heading', { name: 'Оплата подтверждена', exact: true }).waitFor();
        await staff.getByRole('tab', { name: 'Исполнение', exact: true }).click();
        await action('Подтвердить исполнение', async modal => {
            await modal.getByLabel('Получатель', { exact: true }).fill('Демо-получатель');
            await modal.getByLabel('Перевозчик', { exact: true }).fill('Демо-перевозчик');
            await modal.getByLabel('Трек-номер', { exact: true }).fill('DEMO-TRACK');
        });
        await refreshOrder(); await page.getByText('Заказ исполнен', { exact: true }).first().waitFor();
        await action('Завершить заказ', async modal => { await modal.getByLabel('Номер реализации', { exact: true }).fill('DEMO-STORE-001'); await modal.getByLabel('Дата реализации', { exact: true }).fill(new Date().toISOString().slice(0, 10)); await modal.getByLabel('Акт', { exact: true }).check(); });
        await refreshOrder(); await page.getByRole('heading', { name: 'Заказ завершён', exact: true }).waitFor();
        assert.equal((await f.db.getRepository(OrderEntity).findOneByOrFail({ id: row.id })).status, 'completed');
        check('manager payment, fulfillment and completion are reflected as real customer states');
        await goto('/site/orders'); await page.getByRole('link').filter({ hasText: row.orderNumber }).waitFor();
        await page.getByLabel('Статус заказа', { exact: false }).selectOption('completed'); await page.reload();
        assert.equal(new URL(page.url()).searchParams.get('status'), 'completed');
        await page.getByRole('link').filter({ hasText: row.orderNumber }).click(); await page.getByRole('heading', { name: row.orderNumber, exact: true }).waitFor();
        check('owner Orders list/status URL and detail deep link use real paginated API');
        const owner = (await f.db.getRepository(OrderEntity).findOneByOrFail({ id: row.id })).createdByUserId;
        const organizationRepo = f.db.getRepository(OrganizationEntity);
        const organization = await organizationRepo.save(organizationRepo.create({ name: 'Демо-организация с подтверждённым доступом', inn: '1234567890', kpp: null, isVerified: true }));
        const membershipRepo = f.db.getRepository(OrganizationMemberEntity);
        await membershipRepo.save(membershipRepo.create({ organizationId: organization.id, userId: owner, status: 'active', role: 'representative', confirmedAt: new Date() }));
        await add(product); await checkout();
        await page.getByLabel('Моя организация', { exact: false }).selectOption(String(organization.id));
        assert.equal(await page.getByLabel('Наименование организации', { exact: false }).count(), 0);
        const linkedOrder = await submit();
        assert.equal(orderPosts.at(-1).body.organizationId, organization.id); assert.equal('organization' in orderPosts.at(-1).body, false);
        assert.equal((await f.db.getRepository(OrderEntity).findOneByOrFail({ id: linkedOrder.id })).organizationId, organization.id);
        check('approved membership is selectable and canonical checkout sends only authorized organizationId');
        const ownerSession = await f.db.getRepository(CustomerWebSessionEntity).findOneByOrFail({ userId: owner });
        for (let i = 0; i < 19; i++) await app.get(OrdersService).submit({ customerType: 'individual', contact: { name: 'Pagination demo', phone: '12345' }, delivery: { type: 'pickup' }, items: [{ productId: product.id, quantity: 1 }] }, randomUUID(), { userId: owner, sessionId: ownerSession.id, platform: 'web', expiresAt: ownerSession.expiresAt });
        await goto('/site/orders'); await page.locator('.store-order-row').first().waitFor();
        assert.equal(await page.locator('.store-order-row').count(), 20);
        await page.getByRole('button', { name: 'Следующая страница', exact: true }).click();
        await page.getByText('Страница 2 из 2 · Всего 21', { exact: true }).waitFor();
        assert.equal(await page.locator('.store-order-row').count(), 1);
        await page.reload(); await page.getByRole('link').filter({ hasText: row.orderNumber }).waitFor();
        await page.goBack(); await page.getByText('Страница 1 из 2 · Всего 21', { exact: true }).waitFor();
        check('real owner Orders paginate on server and preserve page through reload and Back');
        const paginatedCategory = await f.category();
        for (let i = 0; i < 13; i++) { const item = await f.product(paginatedCategory); await f.command(`products/${item.id}/publish`).expect(201); }
        await goto(`/site/catalog?category=${paginatedCategory.slug}`); await page.getByText('Страница 1 из 2 · Всего 13', { exact: true }).waitFor();
        assert.equal(await page.locator('.store-product-card').count(), 12);
        await page.getByRole('button', { name: 'Следующая страница', exact: true }).click();
        await page.getByText('Страница 2 из 2 · Всего 13', { exact: true }).waitFor();
        assert.equal(await page.locator('.store-product-card').count(), 1);
        await page.reload(); await page.getByText('Страница 2 из 2 · Всего 13', { exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('category'), paginatedCategory.slug);
        check('real public Catalog pagination is bounded and keeps category/page through reload');
        // Separate checkout with a committed response deliberately lost in transit.
        const lostContext = await context(); const lost = await pageIn(lostContext);
        await add(product, lost); await checkout(lost, false);
        let attempts = []; let committed;
        await lost.route(`${base}/api/client/orders`, async route => {
            if (route.request().method() !== 'POST') return route.continue();
            attempts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
            const response = await route.fetch(); assert.equal(response.status(), 201); committed = await response.json();
            return attempts.length === 1 ? route.abort('failed') : route.fulfill({ response });
        });
        await lost.getByRole('button', { name: 'Передать заказ менеджеру', exact: true }).click();
        await lost.getByRole('heading', { name: 'Результат отправки пока не подтверждён', exact: true }).waitFor();
        assert.equal((await cartStorage(lost)).length, 1); assert.equal(attempts.length, 1);
        assert.equal(await lost.getByLabel('Контактное лицо', { exact: false }).isDisabled(), true);
        await lost.getByRole('button', { name: 'Повторить тот же запрос', exact: true }).click();
        await lost.waitForURL(base + `/site/orders/${committed.id}`);
        // Navigation can precede CartProvider's passive persistence effect.
        await lost.waitForFunction(() => localStorage.getItem('vitma_cart') === '[]');
        assert.equal(attempts.length, 2); assert.deepEqual(attempts[0], attempts[1]); assert.deepEqual(await cartStorage(lost), []);
        assert.equal(await f.db.getRepository(OrderEntity).countBy({ idempotencyKey: attempts[0].key }), 1);
        check('lost committed checkout response preserves cart and explicit exact-key replay recovers one Order');
        const disappeared = await context(); const missing = await pageIn(disappeared);
        await add(product, missing); await f.command(`products/${product.id}/unpublish`).expect(201);
        await goto('/site/cart', missing); await missing.getByText('Товар больше недоступен', { exact: true }).waitFor();
        assert.equal(await missing.getByRole('link', { name: 'Оформить заказ', exact: false }).count(), 0);
        await missing.getByRole('button', { name: `Удалить позицию ${product.id}`, exact: true }).click();
        await missing.getByText('В корзине пока нет товаров.', { exact: true }).waitFor();
        await f.command(`products/${product.id}/publish`).expect(201);
        check('unpublished cart entry remains explicit until removal and blocks checkout');
        await goto('/site/orders', missing); await missing.getByText(/Эта сессия браузера больше недоступна/).waitFor();
        assert.equal((await disappeared.cookies()).some(cookie => cookie.name === 'vitma_web_session'), false);
        await add(product, missing); await checkout(missing, false); const newOrder = await submit(missing);
        const foreign = await disappeared.request.get(`${base}/api/client/orders/${row.id}`); assert.equal(foreign.status(), 404);
        assert.notEqual(newOrder.id, row.id);
        await disappeared.clearCookies();
        await missing.getByRole('button', { name: 'Обновить заказ', exact: true }).click();
        await missing.getByText(/Эта сессия браузера больше недоступна/).waitFor();
        assert.equal(await missing.locator('.store-order-lines').count(), 0);
        assert.equal(await missing.locator('input[type=file]').count(), 0);
        assert.equal(await missing.getByRole('heading', { name: newOrder.orderNumber, exact: true }).count(), 0);
        await goto(`/site/orders/${newOrder.id}`, missing);
        await missing.getByText(/Эта сессия браузера больше недоступна/).waitFor();
        assert.equal((await disappeared.cookies()).some(cookie => cookie.name === 'vitma_web_session'), false);
        check('owner list/detail session loss never bootstraps; explicit new checkout cannot read previous owner Orders');
        // A delayed old response must not replace the next route's products.
        let release; let entered;
        const held = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { entered = resolve; });
        await page.route('**/api/catalog/products?**', async route => {
            const query = new URL(route.request().url()).searchParams;
            if (query.get('search') === 'held-older-query') { entered(); await held; return route.fulfill({ json: { items: [product], total: 1, page: 1, limit: 12, totalPages: 1 } }); }
            return route.continue();
        });
        await goto('/site/catalog?search=held-older-query'); await started;
        await page.getByLabel('Поиск в каталоге', { exact: true }).fill('no-product-' + suffix);
        await page.getByRole('button', { name: 'Найти', exact: true }).last().click();
        await page.getByText('По этим условиям товары не найдены.', { exact: true }).waitFor(); release();
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.equal(await page.getByRole('link', { name: product.name, exact: true }).count(), 0);
        await page.unroute('**/api/catalog/products?**');
        check('controlled stale search response cannot overwrite latest URL result');
        await goto('/site/catalog?page=2147483648');
        await page.getByText('Проверьте поля, параметры запроса и формат файла.', { exact: true }).waitFor();
        await goto('/site/catalog/missing-product-' + suffix);
        await page.getByText('Товар, заказ или документ недоступен.', { exact: true }).waitFor();
        check('invalid catalog query and missing product render safe errors instead of indefinite loading');
        const tab = await pageIn(customer);
        await add(product); await goto('/site/cart', tab); await tab.getByRole('link', { name: product.name, exact: true }).waitFor();
        await page.evaluate(() => localStorage.setItem('vitma_cart', JSON.stringify([{ productId: 2147483647, quantity: 2, name: 'stale name', price: 1 }])));
        await tab.getByText('Товар больше недоступен', { exact: true }).waitFor();
        assert.equal(await tab.getByText('stale name', { exact: true }).count(), 0);
        check('cross-tab cart storage is validated and stale product metadata is never rendered');
        await tab.close();
        await page.evaluate(id => localStorage.setItem('vitma_cart', JSON.stringify([{ productId: id, quantity: 1 }])), product.id);
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 800 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(viewport);
            for (const [route, ready] of [[`/site/catalog?category=${category.slug}`, '.store-product-card'], [`/site/catalog/${product.slug}`, '.store-product-detail'], ['/site/cart', '.store-cart-line'], ['/site/checkout', '.store-checkout'], ['/site/orders', '.store-order-row'], [`/site/orders/${row.id}`, '.store-order-lines']]) {
                await goto(route); await page.locator(ready).first().waitFor();
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} at ${viewport.width}`);
            }
            if (viewport.width === 390) {
                await capture('store-mobile.png'); await goto(`/site/catalog?category=${category.slug}`); await page.locator('.store-product-card').first().waitFor();
                await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
                await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
                assert.equal(await page.getByRole('button', { name: 'Фильтры', exact: true }).evaluate(element => element === document.activeElement), true);
                await capture('store-catalog-mobile.png');
            }
            check(`catalog/product/cart/checkout/orders/payment-proof layout at ${viewport.width}x${viewport.height}`);
        }
        assert.equal(await f.db.getRepository(OrderDocumentEntity).countBy({ orderId: row.id, type: 'payment_proof' }), 2);
        assert.equal(providerCalls, 0); assert.deepEqual(errors, []);
        check('no real provider calls, no browser exceptions, payment documents remain canonical');
        if (process.env.FE_STORE1_EXTRA_SMOKE === 'true') {
            const run = require('node:util').promisify(require('node:child_process').execFile);
            const result = await run(process.execPath, ['scripts/site-smoke.mjs'], { env: { ...process.env, SITE_SMOKE_BASE_URL: base }, windowsHide: true });
            process.stdout.write(result.stdout);
        }
        process.stdout.write(`Client store browser workflow: ${checks.length} checks passed.\n`);
    } catch (error) {
        if (lastPage && !lastPage.isClosed()) {
            process.stderr.write(`Store browser failed at ${new URL(lastPage.url()).pathname}\n`);
            if (process.env.FE_STORE1_SCREENSHOTS) await lastPage.screenshot({ path: path.join(process.env.FE_STORE1_SCREENSHOTS, 'failure.png'), fullPage: true }).catch(() => undefined);
        }
        throw error;
    } finally { if (browser) await browser.close(); await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
