const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('ts-node').register({ compilerOptions: { jsx: 'react-jsx' } });
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const api = require('../api');
const orders = require('../features/orders/api');
const { OrderActionButton } = require('../features/orders/OrderActions');
const { OrderHistory } = require('../features/orders/OrderPanels');
const { visibleNavigation, unavailableRoutes } = require('../app/navigation');
const read = file => fs.readFileSync(`admin-ui/src/${file}`, 'utf8');

test('orders production routes enabled only through existing orders permission', () => {
    assert.equal(unavailableRoutes.has('/admin/sales/orders'), false);
    assert.ok(visibleNavigation(['orders.read.all']).some(group => group.items.some(item => item.target === '/admin/sales/orders')));
    assert.ok(!visibleNavigation(['registrations.read', 'serviceRequests.read.assigned']).some(group => group.items.some(item => item.target === '/admin/sales/orders')));
    assert.match(read('app/AdminApp.tsx'), /path="sales\/orders\/:id"/);
});
test('queue adapter has bounded server pagination and validated filters', () => {
    assert.equal(orders.orderQueueQuery(new URLSearchParams('status=paid&scope=mine&page=2&limit=999')).toString(), 'status=paid&scope=mine&page=2&limit=20');
    assert.equal(orders.orderQueueQuery(new URLSearchParams('status=__proto__&scope=bad&page=100001')).toString(), 'page=1&limit=20');
    assert.equal(orders.orderQueueQuery(new URLSearchParams(`search=${'x'.repeat(201)}`)).get('search').length, 200);
});
test('money is lossless decimal-string/BigInt, including values above Number precision', () => {
    assert.equal(orders.minorFromInput('999999999999999999,99'), '99999999999999999999');
    assert.equal(orders.priceInput('9007199254740993'), '90071992547409.93');
    assert.equal(orders.minorFromInput('0.01'), '1');
    assert.equal(orders.minorFromInput(''), null);
    for (const value of ['-1', 'NaN', '1e3', '1.001', '1.2.3']) assert.throws(() => orders.minorFromInput(value));
    assert.ok(orders.money('9007199254740993').endsWith(',93 ₽'));
});
test('every command sends captured expectedVersion and exactly its canonical route', async () => {
    const calls = []; const original = api.api;
    api.api = async (...args) => { calls.push(args); return {}; };
    try {
        for (const [action, route] of Object.entries({assign:'assign',review:'start-review',quote:'quote',confirm:'confirm',invoice:'invoices',payment:'confirm-payment',fulfill:'fulfill',complete:'complete'})) {
            await orders.orderCommand(3, action, 7, { expectedVersion: 999 });
            const [path, options] = calls.at(-1);
            assert.equal(path, `/admin/api/orders/3/${route}`);
            assert.equal(JSON.parse(options.body).expectedVersion, 7);
            assert.equal(options.method, action === 'quote' ? 'PUT' : 'POST');
        }
        const form = new FormData(); form.set('file', new Blob(['synthetic'], { type: 'application/pdf' }), 'demo.pdf');
        await orders.orderCommand(3, 'invoice', 8, form);
        assert.equal(calls.at(-1)[1].body.get('expectedVersion'), '8');
    } finally { api.api = original; }
});
test('download URL is strictly scoped to this order and document', () => {
    assert.equal(orders.orderDocumentUrl(2, 4, '/admin/api/orders/2/documents/4/download'), '/admin/api/orders/2/documents/4/download');
    for (const url of ['https://example.test/file', '/admin/api/files/4', '/admin/api/orders/3/documents/4/download']) assert.equal(orders.orderDocumentUrl(2, 4, url), null);
});
test('safe errors do not expose server diagnostics', () => {
    for (const status of [400,401,403,404,409,413,429,500]) assert.doesNotMatch(orders.orderError(new api.ApiError('private URL', status)), /private URL/);
    assert.doesNotMatch(orders.orderError(new Error('private URL')), /private URL/);
});
test('blocked server actions are disabled and explain their reason', () => {
    const html = renderToStaticMarkup(createElement(OrderActionButton, { action: 'quote', decision: { allowed: false, reason: 'assignment' }, onClick() {} }));
    assert.match(html, /disabled/); assert.match(html, /aria-describedby/); assert.match(html, /назначенному менеджеру/);
});
test('conflict/unknown forms retain input, explicit reconciliation and no mutation retries', () => {
    const source = read('features/orders/OrderActions.tsx');
    assert.match(source, /setUncertain/); assert.match(source, /needsReview/); assert.match(source, /submitting.current/); assert.match(source, /setVersion\(order.version\)/);
    assert.doesNotMatch(source, /setInterval|localStorage|sessionStorage/);
    assert.match(read('features/orders/OrderDetailPage.tsx'), /selection\?\.order/);
});
test('tabs and detail keep URL context, history is not a global audit view', () => {
    const source = read('features/orders/OrderDetailPage.tsx');
    assert.match(source, /queueUrl/); assert.match(source, /key=\{id\}/); assert.match(source, /ArrowRight/); assert.match(source, /aria-controls/);
    assert.doesNotMatch(source, /audit-events|localStorage|sessionStorage/);
    const html = renderToStaticMarkup(createElement(OrderHistory, { order: { history: { hasMore: false, limit: 100 }, events: [
        { id: 1, type: 'quote_updated', metadata: { revision: 3 }, createdAt: '2026-09-15T00:00:00Z' },
        { id: 2, type: 'invoice_replaced', metadata: { quoteRevision: 3, documentRevision: 2 }, createdAt: '2026-09-15T00:00:00Z' },
    ] } }));
    assert.match(html, /Редакция предложения 3/);
    assert.match(html, /Редакция счёта 2/);
});
test('orders CSS remains scoped and uses foundation colors', () => {
    const css = read('features/orders/orders.css');
    require('postcss').parse(css).walkRules(rule => { for (const selector of rule.selectors) assert.ok(selector.startsWith('.vitma-admin-app .ord-') || selector.startsWith('.vitma-admin-app :is(.ord-')); });
    assert.doesNotMatch(css, /#[0-9a-f]|gradient|green|teal|emerald|slate/i);
});
