import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const chromeCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const executablePath = chromeCandidates.find((candidate) =>
    fs.existsSync(candidate),
);
if (!executablePath) throw new Error('Chrome or Edge executable was not found');

const outputDir = path.resolve('.tmp', 'site-smoke');
const baseUrl = process.env.SITE_SMOKE_BASE_URL || 'http://localhost:3000';
const skipBackend = process.env.SITE_SMOKE_SKIP_BACKEND === 'true';
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];

async function attachDiagnostics(page) {
    page.on('console', (message) => {
        if (message.type() === 'error')
            errors.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
}

try {
    const desktop = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
    });
    await attachDiagnostics(desktop);
    await desktop.goto(`${baseUrl}/site/`, {
        waitUntil: 'networkidle',
    });
    await desktop.getByRole('heading', { level: 1 }).waitFor();
    await desktop.screenshot({
        path: path.join(outputDir, 'home-desktop.png'),
        fullPage: true,
    });
    await desktop
        .getByRole('button', { name: 'Заказать обратный звонок' })
        .click();
    await desktop.locator('[role="dialog"]').waitFor();
    await desktop
        .locator('[role="dialog"]')
        .getByRole('button', { name: 'Закрыть' })
        .click();

    await desktop.goto(`${baseUrl}/site/search?q=касса`, {
        waitUntil: 'networkidle',
    });
    await desktop.locator('.search-results').waitFor();
    if ((await desktop.getByRole('button', { name: /Добавить/ }).count()) === 0)
        throw new Error('Global search returned no product results');

    await desktop.goto(`${baseUrl}/site/solutions`, {
        waitUntil: 'networkidle',
    });
    await desktop.locator('.solution-list article').first().waitFor();
    if ((await desktop.locator('.solution-list article').count()) !== 4)
        throw new Error('Business solutions page is incomplete');

    await desktop.goto(`${baseUrl}/site/catalog`, {
        waitUntil: 'networkidle',
    });
    await desktop.getByRole('article').first().waitFor();
    if ((await desktop.getByRole('article').count()) < 20)
        throw new Error('Catalog has fewer than 20 products');
    await desktop.screenshot({
        path: path.join(outputDir, 'catalog-desktop.png'),
        fullPage: true,
    });
    await desktop
        .getByRole('article')
        .first()
        .getByRole('button', { name: /Добавить/ })
        .click();
    await desktop
        .getByRole('link', { name: /Корзина, товаров:/ })
        .click();
    await desktop.locator('.cart-item').first().waitFor();

    await desktop.goto(`${baseUrl}/site/service`, {
        waitUntil: 'networkidle',
    });
    await desktop
        .getByRole('heading', {
            name: 'Сервисный центр для кассового оборудования',
        })
        .waitFor();
    await desktop.screenshot({
        path: path.join(outputDir, 'service-desktop.png'),
        fullPage: true,
    });

    await desktop.goto(`${baseUrl}/site/service/request`, {
        waitUntil: 'networkidle',
    });
    await desktop
        .getByLabel('Вид сервисной заявки')
        .selectOption('kkt_remote_work');
    await desktop.getByLabel('Название организации').fill('ООО Демо');
    await desktop.getByLabel('ИНН').fill('2460000000');
    await desktop.getByLabel('Контактное лицо').fill('Анна Петрова');
    await desktop.getByLabel('Телефон').fill('9131234567');
    await desktop.getByLabel('Email').fill('demo@example.ru');
    await desktop.getByRole('button', { name: /Продолжить/ }).click();
    await desktop.getByLabel('Модель').fill('АТОЛ 30Ф');
    await desktop.getByRole('button', { name: /Продолжить/ }).click();
    await desktop
        .getByLabel('Подробное описание')
        .fill('Касса перестала печатать чеки после обновления программы.');
    await desktop.getByRole('button', { name: /Продолжить/ }).click();
    await desktop.getByText(/согласен на обработку/).click();
    await desktop.getByRole('button', { name: /Отправить заявку/ }).click();
    await desktop.getByText(/Заявка отправлена/).waitFor();

    if (!skipBackend) {
        await desktop.goto(`${baseUrl}/site/cash-registration`, {
            waitUntil: 'networkidle',
        });
        await desktop
            .getByRole('heading', { name: 'Регистрация онлайн-кассы' })
            .waitFor();
        await desktop.getByLabel(/название организации/i).waitFor();
    }

    const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
    });
    await attachDiagnostics(mobile);
    await mobile.goto(`${baseUrl}/site/`, {
        waitUntil: 'networkidle',
    });
    await mobile.screenshot({
        path: path.join(outputDir, 'home-390.png'),
        fullPage: true,
    });
    const menuButton = mobile.locator(
        'button[aria-controls="site-navigation"]',
    );
    await menuButton.click();
    if ((await menuButton.getAttribute('aria-expanded')) !== 'true')
        throw new Error('Mobile menu did not open');
    await menuButton.press('Escape');
    if ((await menuButton.getAttribute('aria-expanded')) !== 'false')
        throw new Error('Mobile menu did not close with Escape');

    await mobile.goto(`${baseUrl}/site/catalog`, {
        waitUntil: 'networkidle',
    });
    await mobile.getByRole('article').first().waitFor();
    const overflow = await mobile.evaluate(
        () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
    );
    if (overflow)
        throw new Error('Horizontal overflow detected on mobile catalog');
    await mobile.getByRole('button', { name: 'Фильтры', exact: true }).click();
    const filtersDialog = mobile.getByRole('dialog', {
        name: 'Фильтры каталога',
    });
    await filtersDialog.waitFor();
    await filtersDialog.getByLabel('1С').check();
    await mobile.screenshot({
        path: path.join(outputDir, 'catalog-390-filters.png'),
        fullPage: false,
    });
    await filtersDialog.getByRole('button', { name: 'Применить' }).click();
    await mobile
        .getByRole('button', { name: '1С', exact: true })
        .waitFor();
    await mobile.getByLabel('Поиск в каталоге').fill('нет-такого-товара');
    await mobile.getByRole('heading', { name: 'Ничего не найдено' }).waitFor();
    await mobile.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await mobile.getByRole('article').first().waitFor();

    await mobile.goto(`${baseUrl}/site/service`, {
        waitUntil: 'networkidle',
    });
    await mobile
        .getByRole('heading', {
            name: 'Сервисный центр для кассового оборудования',
        })
        .waitFor();
    const serviceOverflow = await mobile.evaluate(
        () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
    );
    if (serviceOverflow)
        throw new Error('Horizontal overflow detected on mobile service page');
    await mobile.screenshot({
        path: path.join(outputDir, 'service-390.png'),
        fullPage: true,
    });

    if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
    console.log(`Site smoke test passed. Screenshots: ${outputDir}`);
} finally {
    await browser.close();
}
