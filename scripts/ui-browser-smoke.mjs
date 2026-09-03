import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { verifyAdminWorkspace } from '../admin-ui/src/test-tools/browser-workflows.mjs';

const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath)
    throw new Error('A Chrome or Chromium executable was not found');

const baseUrl = process.env.UI_SMOKE_BASE_URL || 'http://127.0.0.1:3210';
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const failedResponses = [];
const adminMeUrl = `${baseUrl}/admin/api/me`;
try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
    });
    await page.route('**/favicon.ico', (route) =>
        route.fulfill({ status: 204, body: '' }),
    );
    page.on('console', (message) => {
        if (message.type() === 'error') {
            const location = message.location().url;
            if (location === adminMeUrl && message.text().includes('401')) {
                return;
            }
            errors.push(
                `console: ${message.text()}${location ? ` (${location})` : ''}`,
            );
        }
    });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('response', (response) => {
        if (response.status() >= 400) {
            failedResponses.push(`${response.status()} ${response.url()}`);
        }
    });

    for (const route of ['/site', '/site/catalog']) {
        const response = await page.goto(`${baseUrl}${route}`, {
            waitUntil: 'networkidle',
        });
        if (!response?.ok())
            throw new Error(`${route} returned ${response?.status()}`);
        await page.locator('#root').waitFor();
    }

    await page.goto(`${baseUrl}/admin/requests/service`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Вход для сотрудников' }).waitFor();
    await page
        .locator('input[autocomplete="username"]')
        .fill(process.env.UI_SMOKE_ADMIN_LOGIN || '');
    await page
        .locator('input[autocomplete="current-password"]')
        .fill(process.env.UI_SMOKE_ADMIN_PASSWORD || '');
    const queueLoaded = page.waitForResponse(
        (response) =>
            response.url().includes('/admin/api/service-requests?') &&
            response.status() === 200,
    );
    await Promise.all([
        page.getByRole('button', { name: 'Войти', exact: true }).click(),
        queueLoaded,
    ]);
    const workflowChecks = await verifyAdminWorkspace(page, baseUrl);
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await page.getByRole('heading', { name: 'Вход для сотрудников' }).waitFor();

    if (errors.length)
        throw new Error(
            `Browser console errors:\n${errors.join('\n')}\nFailed responses:\n${failedResponses.join('\n')}`,
        );
    process.stdout.write(
        `Browser smoke passed for client routes, nested admin login/logout and ${workflowChecks.length} production workspace checks.\n${workflowChecks.join('\n')}\n`,
    );
} finally {
    await browser.close();
}
