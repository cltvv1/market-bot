import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function verifyPublicAccess(browser, owner, context, baseUrl, id, read, checks) {
    const secrets = [];
    const contexts = [];
    const root = `${baseUrl}/api/public/service-requests`;
    const key = 'vitma-service-public-access-v1';
    const accessPosts = [];
    const browserErrors = [];
    const track = req => { if (req.method() === 'POST' && req.url().endsWith(`/${id}/public-access`)) accessPosts.push(req); };
    owner.on('request', track);
    async function captureSafeState(name) {
        const previous = owner.viewportSize();
        for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
            await owner.setViewportSize({ width, height });
            await owner.locator('#public-access-heading').scrollIntoViewIfNeeded();
            assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
            if (process.env.SEC_R3B_SCREENSHOTS) {
                fs.mkdirSync(process.env.SEC_R3B_SCREENSHOTS, { recursive: true });
                await owner.locator('section[aria-labelledby="public-access-heading"]').screenshot({ path: path.join(process.env.SEC_R3B_SCREENSHOTS, `${name}-${size}.png`) });
            }
        }
        if (previous) await owner.setViewportSize(previous);
    }
    async function generatedLink(button) {
        await owner.getByRole('button', { name: button, exact: true }).click();
        await owner.getByLabel('Новая ссылка', { exact: true }).waitFor();
        await owner.waitForLoadState('networkidle');
        const link = await owner.getByLabel('Новая ссылка', { exact: true }).inputValue();
        const parsed = new URL(link);
        const token = parsed.hash.slice('#access='.length);
        secrets.push(token);
        assert.equal(parsed.pathname, '/site/service/status');
        assert.equal(parsed.search, '');
        assert.equal(/^[A-Za-z0-9_-]{43}$/.test(token), true);
        return { link, token };
    }
    async function stored(page, token, expectedPublic) {
        const values = await page.evaluate(() => ({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) }));
        assert.equal(values.local.some(([, value]) => value.includes(token)), false);
        const keys = values.session.filter(([, value]) => value.includes(token)).map(([name]) => name);
        assert.deepEqual(keys, expectedPublic ? [key] : []);
    }
    async function open(link, token) {
        const isolated = await browser.newContext(); contexts.push(isolated);
        await isolated.route('**/*', route => {
            const url = new URL(route.request().url());
            return url.origin === new URL(baseUrl).origin || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
        });
        const page = await isolated.newPage();
        page.on('pageerror', error => browserErrors.push(error.message));
        const requests = [];
        page.on('request', req => requests.push({ url: req.url(), headers: req.headers() }));
        await page.goto(`${baseUrl}/site/service`, { waitUntil: 'networkidle' });
        await page.goto(link, { waitUntil: 'networkidle' });
        await page.getByText(/Ограниченный просмотр по ссылке/).waitFor();
        assert.equal(page.url().includes(token), false);
        assert.equal(requests.some(req => req.url.includes(token)), false);
        assert.equal(requests.some(req => req.url.endsWith('/status') && req.headers.authorization === `Bearer ${token}`), true);
        assert.equal(requests.some(req => (req.headers.referer || '').includes(token)), false);
        assert.equal((await isolated.cookies()).length, 0);
        await stored(page, token, true);
        return { isolated, page, requests };
    }
    async function denied(isolated, token, attachmentId) {
        const headers = { Authorization: `Bearer ${token}` };
        assert.equal((await isolated.request.get(`${root}/status`, { headers })).status(), 401);
        assert.equal((await isolated.request.post(`${root}/messages`, { headers, data: { text: 'Denied synthetic reply' } })).status(), 401);
        assert.equal((await isolated.request.post(`${root}/messages/attachments`, { headers, multipart: { file: { name: 'denied.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic') } } })).status(), 401);
        assert.equal((await isolated.request.get(`${root}/attachments/${attachmentId}`, { headers })).status(), 401);
    }
    try {
        await owner.getByRole('tab', { name: 'Обзор', exact: true }).click();
        await owner.getByRole('button', { name: 'Создать ссылку', exact: true }).waitFor();
        await captureSafeState('public-access-disabled');
        checks.push('submitted request has disabled public access until explicit owner action');
        const first = await generatedLink('Создать ссылку');
        await stored(owner, first.token, false);
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await owner.getByRole('button', { name: 'Копировать ссылку', exact: true }).click();
        await owner.getByText('Ссылка скопирована.', { exact: true }).waitFor();
        assert.equal((await owner.evaluate(() => navigator.clipboard.readText())) === first.link, true);
        await owner.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
        await owner.getByRole('button', { name: 'Копировать ссылку', exact: true }).click();
        await owner.getByText('Выделите ссылку и скопируйте её вручную.', { exact: true }).waitFor();
        await owner.evaluate(() => { delete navigator.clipboard; });
        checks.push('explicit random share link copies fragment only and stays out of owner storage');
        const firstPublic = await open(first.link, first.token);
        checks.push('independent public browser scrubs fragment before API, uses Authorization and creates no identity');
        await firstPublic.page.reload({ waitUntil: 'networkidle' });
        await firstPublic.page.getByText(/Ограниченный просмотр по ссылке/).waitFor();
        await firstPublic.page.goBack({ waitUntil: 'networkidle' });
        assert.equal(firstPublic.page.url().includes(first.token), false);
        await firstPublic.page.goForward({ waitUntil: 'networkidle' });
        await firstPublic.page.getByText(/Ограниченный просмотр по ссылке/).waitFor();
        assert.equal(firstPublic.page.url().includes(first.token), false);
        await stored(firstPublic.page, first.token, true);
        checks.push('public reload uses only the single session key; Back/Forward never resurrects the bearer URL');
        assert.equal(await firstPublic.page.locator('#payment-proof-file').count(), 0);
        assert.equal((await firstPublic.page.content()).includes('demo-proof-unknown.pdf'), false);
        await firstPublic.page.getByLabel('Сообщение сотруднику', { exact: true }).fill('Демо: ответ по публичной ссылке.');
        await firstPublic.page.getByLabel('Обычный файл к обращению', { exact: true }).setInputFiles({ name: 'public-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic public attachment') });
        await firstPublic.page.getByRole('button', { name: 'Отправить ответ', exact: true }).click();
        await firstPublic.page.getByText('public-fixture.txt', { exact: true }).waitFor();
        assert.equal((await read()).messages.filter(item => item.text === 'Демо: ответ по публичной ссылке.').length, 1);
        assert.equal((await firstPublic.isolated.request.get(`${root}/payment-proof`, { headers: { Authorization: `Bearer ${first.token}` } })).status(), 404);
        checks.push('public link reads/replies/uploads without owner identity or payment-proof access');
        const downloadReady = firstPublic.page.waitForEvent('download');
        await firstPublic.page.locator('li').filter({ hasText: 'public-fixture.txt' }).getByRole('button', { name: 'Скачать файл' }).click();
        const download = await downloadReady;
        assert.equal(download.suggestedFilename(), 'public-fixture.txt');
        await download.delete();
        assert.equal(firstPublic.requests.some(req => req.url.includes(first.token)), false);
        const attachment = (await read()).attachments.find(item => item.file.originalName === 'public-fixture.txt');
        checks.push('public download uses authenticated fetch and a blob URL, never bearer href');
        const next = await generatedLink('Создать новую ссылку');
        assert.equal(first.token === next.token, false);
        await denied(firstPublic.isolated, first.token, attachment.id);
        await firstPublic.page.getByRole('button', { name: 'Обновить статус', exact: true }).click();
        await firstPublic.page.getByText(/Ссылка больше не действует/).waitFor();
        await stored(firstPublic.page, first.token, false);
        checks.push('rotation instantly denies old reads/messages/uploads/downloads and clears public session access');
        const secondPublic = await open(next.link, next.token);
        await owner.getByRole('button', { name: 'Отключить доступ', exact: true }).click();
        await owner.getByRole('button', { name: 'Создать ссылку', exact: true }).waitFor();
        await denied(secondPublic.isolated, next.token, attachment.id);
        await secondPublic.page.getByRole('button', { name: 'Обновить статус', exact: true }).click();
        await secondPublic.page.getByText(/Ссылка больше не действует/).waitFor();
        await stored(secondPublic.page, next.token, false);
        await read();
        checks.push('revoke immediately denies all public surfaces, clears session bearer and preserves owner access');
        const count = accessPosts.length;
        await owner.route(`**/${id}/public-access`, async route => {
            if (route.request().method() !== 'POST') return route.continue();
            const result = await route.fetch();
            assert.equal(result.status(), 201);
            await route.abort('connectionreset');
        }, { times: 1 });
        await owner.getByRole('button', { name: 'Создать ссылку', exact: true }).click();
        await owner.getByText(/Доступ включён, но новая ссылка не получена/).waitFor();
        await owner.waitForLoadState('networkidle');
        assert.equal(accessPosts.length, count + 1);
        assert.equal(await owner.getByLabel('Новая ссылка', { exact: true }).count(), 0);
        await captureSafeState('public-access-reconcile');
        checks.push('lost committed issuance response rereads safe state without automatically replaying POST');
        const recovered = await generatedLink('Создать новую ссылку');
        const recoveredPublic = await open(recovered.link, recovered.token);
        await owner.getByRole('button', { name: 'Отключить доступ', exact: true }).click();
        await owner.getByRole('button', { name: 'Создать ссылку', exact: true }).waitFor();
        await denied(recoveredPublic.isolated, recovered.token, attachment.id);
        for (const secret of secrets) await stored(owner, secret, false);
        checks.push('explicit rotation recovers a lost secret; final revoke leaves no persisted owner link');
        assert.equal(browserErrors.length, 0, 'No public browser page errors');
        await owner.getByRole('tab', { name: 'Документы', exact: true }).click();
    } catch (error) {
        let message = error instanceof Error ? error.message : 'Public access browser failure';
        for (const secret of secrets) message = message.replaceAll(secret, '[redacted]');
        throw new Error(message);
    } finally {
        owner.off('request', track);
        for (const isolated of contexts) await isolated.close();
    }
}
