const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('ts-node').register({ compilerOptions: { jsx: 'react-jsx' } });
const { parseCart, hydrateCart, cartTotals, moneyMinor, orderable, checkoutPayload, initialCheckout } = require('../features/store/model');
const { storeApi, storeId, downloadOrderDocument, storeError } = require('../features/store/api');
const { ClientApiError, beginNewSession } = require('../api/client-session');
const { createAttempt, submitAttempt } = require('../features/store/checkout/attempt');
const { paymentProofError } = require('../features/store/orders/OrderPaymentProof');
const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; delete global.window; });
const product = { id: 1, name: 'Synthetic', displayPriceMinor: 101, availabilityStatus: 'in_stock' };
const read = path => fs.readFileSync(path, 'utf8');

// Exercise the hook's request lifecycle without a DOM dependency; browser tests cover effects and navigation.
function readHarness() {
    const slots = []; let index = 0;
    const react = {
        useRef(value) { const i = index++; return slots[i] ??= { current: value }; },
        useState(value) { const i = index++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
        useCallback(fn) { return fn; }, useEffect() {},
    };
    const source = require('typescript').transpileModule(read('client-ui/src/features/store/use-store-read.ts'), { compilerOptions: { module: require('typescript').ModuleKind.CommonJS, target: require('typescript').ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    require('node:vm').runInNewContext(source, { exports: module.exports, require: name => { assert.equal(name, 'react'); return react; }, AbortController });
    return (key, fetcher) => { index = 0; return module.exports.useStoreRead(key, fetcher); };
}
test('current catalog/owner read errors leave loading and expose typed error', async () => {
    for (const status of [400, 401, 404, 429, 500]) {
        const render = readHarness(); const failure = new ClientApiError(status, 'REQUEST_FAILED');
        const fetcher = () => Promise.reject(failure);
        await render('current', fetcher).refresh();
        const state = render('current', fetcher);
        assert.equal(state.loading, false); assert.equal(state.error, failure); assert.equal(state.data, null);
    }
});
test('late old success/error cannot overwrite newer response', async () => {
    for (const fails of [false, true]) {
        const render = readHarness(); let finish;
        const old = render('old', () => new Promise((resolve, reject) => { finish = fails ? reject : resolve; })).refresh();
        const next = () => Promise.resolve('new-result');
        await render('new', next).refresh(); finish(fails ? new Error('old') : 'old-result'); await old;
        const state = render('new', next);
        assert.equal(state.data, 'new-result'); assert.equal(state.error, null); assert.equal(state.loading, false);
    }
});
test('changed route hides previous data before its effect runs', async () => {
    const render = readHarness(); const fetcher = () => Promise.resolve('old-result');
    await render('old', fetcher).refresh();
    const state = render('new', fetcher);
    assert.equal(state.data, null); assert.equal(state.loading, true);
});
test('production store has no static catalog, fake order service or fake order storage', () => {
    assert.equal(fs.existsSync('client-ui/src/data/catalog.ts'), false);
    assert.doesNotMatch(read('client-ui/src/services/client.ts'), /orderService|vitma_order_|makeNumber/);
    const app = read('client-ui/src/App.tsx');
    for (const route of ['catalog', 'catalog/:slug', 'cart', 'checkout', 'orders', 'orders/:id']) assert.ok(app.includes(`path="${route}"`));
    assert.equal((app.match(/<WebSessionBoundary>/g) || []).length, 1);
    assert.match(app, /<WebSessionBoundary>\s*<OrganizationsPage/);
});
test('malformed or oversized stored cart cannot crash or become truth', () => {
    for (const raw of [null, '', '{', 'null', '{}', '42', '"a"', ' '.repeat(100001)]) assert.deepEqual(parseCart(raw), []);
});
test('cart strips stale metadata and ignores invalid primitives/IDs/quantities', () => {
    const input = [null, 2, { productId: '1', quantity: 1 }, { productId: 0, quantity: 1 }, { productId: 2147483648, quantity: 1 }, { productId: 1, quantity: .5 }, { productId: 1, quantity: 1001 }, { productId: 1, quantity: 0 }, { productId: 1, quantity: 2, price: 1, name: 'stale', availabilityStatus: 'in_stock', __proto__: { x: 1 } }];
    assert.deepEqual(parseCart(JSON.stringify(input)), [{ productId: 1, quantity: 2 }]);
});
test('first valid duplicate wins deterministically, at most 100 unique rows', () => {
    const input = [{ productId: 1, quantity: 2 }, { productId: 1, quantity: 900 }, ...Array.from({ length: 150 }, (_, n) => ({ productId: n + 2, quantity: 1 }))];
    const parsed = parseCart(JSON.stringify(input));
    assert.equal(parsed.length, 100); assert.deepEqual(parsed[0], { productId: 1, quantity: 2 });
});
test('maximum valid cart ID and quantity are preserved', () => {
    assert.deepEqual(parseCart('[{"productId":2147483647,"quantity":1000}]'), [{ productId: 2147483647, quantity: 1000 }]);
});
test('missing/unpublished hydration entries remain explicit and block checkout', () => {
    const lines = [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 1 }];
    const items = hydrateCart(lines, [product]);
    assert.equal(items.length, 2); assert.equal(items[1].product, null); assert.equal(cartTotals(items).blocked, true);
});
test('current backend price replaces any obsolete cart metadata', () => {
    const lines = parseCart('[{"productId":1,"quantity":2,"price":999}]');
    assert.equal(cartTotals(hydrateCart(lines, [{ ...product, displayPriceMinor: 205 }])).subtotal, '410');
});
test('null-price partial total does not impersonate a complete price', () => {
    const result = cartTotals([{ product, productId: 1, quantity: 2 }, { product: { ...product, displayPriceMinor: null }, productId: 2, quantity: 1 }]);
    assert.equal(result.subtotal, '202'); assert.equal(result.unpriced, true); assert.equal(result.blocked, false);
});
test('zero remains a real zero, exact multiplication and bigint formatting', () => {
    assert.equal(moneyMinor(0), '0,00 ₽'); assert.equal(moneyMinor(null), 'Цена по запросу');
    const total = cartTotals([{ product: { ...product, displayPriceMinor: 2147483647 }, productId: 1, quantity: 1000 }]);
    assert.equal(total.subtotal, '2147483647000'); assert.equal(moneyMinor('99999999999999999999').endsWith(',99 ₽'), true);
});
test('all four availability states follow backend intake eligibility', () => {
    for (const availabilityStatus of ['in_stock', 'low_stock', 'on_request']) assert.equal(orderable({ ...product, availabilityStatus }), true);
    assert.equal(orderable({ ...product, availabilityStatus: 'unavailable' }), false); assert.equal(orderable(null), false);
});
test('individual checkout does not submit organization or optional blank email', () => {
    const payload = checkoutPayload({ ...initialCheckout, customerType: 'individual', name: ' Name ', phone: '+1 2345' }, [{ productId: 1, quantity: 2, price: 123 }]);
    assert.deepEqual(payload, { customerType: 'individual', contact: { name: 'Name', phone: '+1 2345' }, delivery: { type: 'pickup' }, items: [{ productId: 1, quantity: 2 }] });
});
test('manual organization maps exact snapshot and transport_company enum', () => {
    const payload = checkoutPayload({ ...initialCheckout, organizationName: ' Demo ', inn: '1234567890', kpp: '123456789', name: 'Client', phone: '12345', deliveryType: 'transport_company', city: ' City ', address: '', deliveryComment: 'Dock', comment: 'Note' }, [{ productId: 1, quantity: 1 }]);
    assert.deepEqual(payload.organization, { name: 'Demo', inn: '1234567890', kpp: '123456789' });
    assert.deepEqual(payload.delivery, { type: 'transport_company', city: 'City', comment: 'Dock' });
    for (const key of ['payment', 'price', 'status', 'managerId', 'organizationId']) assert.equal(key in payload, false);
});
test('approved organization uses only ID without manual snapshot override', () => {
    const payload = checkoutPayload({ ...initialCheckout, organizationId: '7', organizationName: 'Do not send' }, [{ productId: 1, quantity: 1 }]);
    assert.equal(payload.organizationId, 7); assert.equal('organization' in payload, false);
});
test('checkout cannot send invalid or empty cart', () => {
    for (const lines of [[], [{ productId: 1, quantity: Infinity }], [{ productId: NaN, quantity: 2 }], Array.from({ length: 101 }, () => ({ productId: 1, quantity: 1 }))]) assert.throws(() => checkoutPayload(initialCheckout, lines));
});
test('public catalog/detail/resolve never create or send session credentials', async () => {
    const calls = []; global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({ items: [] }); };
    await storeApi.categories(); await storeApi.products('page=2'); await storeApi.product('demo'); await storeApi.resolve([1, 2]);
    assert.equal(calls.length, 4); assert.ok(calls.every(([url, init]) => !url.includes('session') && init.credentials === 'omit'));
    assert.deepEqual(JSON.parse(calls[3][1].body), { ids: [1, 2] });
});
test('owner list/detail without session fail without creating identity', async () => {
    const calls = []; global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}, { status: 401 }); };
    await assert.rejects(storeApi.orders('page=2'), error => error.status === 401);
    await assert.rejects(storeApi.order(1), error => error.status === 401);
    assert.equal(calls.length, 2); assert.ok(calls.every(([url, init]) => url === '/api/client/session' && !init.method));
});
test('checkout reuses shared explicit session primitive', () => {
    assert.equal(require('../features/store/api').beginNewSession, beginNewSession);
    assert.doesNotMatch(read('client-ui/src/pages/CheckoutPage.tsx'), /ensureWebSession|localStorage|sessionStorage/);
});
test('submit pins immutable payload and UUID across explicit response-loss retry', async () => {
    const payload = checkoutPayload({ ...initialCheckout, customerType: 'individual', name: 'Demo', phone: '12345' }, [{ productId: 1, quantity: 1 }]);
    const attempt = createAttempt(payload, 'same-session'); payload.items[0].quantity = 5;
    const posts = []; global.fetch = async (url, init) => {
        if (url.endsWith('/session')) return Response.json({ expiresAt: 'same-session' });
        posts.push(init); if (posts.length === 1) throw new Error('response lost');
        return Response.json({ id: 44 });
    };
    await assert.rejects(submitAttempt(attempt), error => error.uncertain);
    assert.equal(posts.length, 1);
    assert.equal((await submitAttempt(attempt)).id, 44);
    assert.equal(posts[0].body, posts[1].body); assert.equal(JSON.parse(posts[0].body).items[0].quantity, 1);
    assert.equal(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
    assert.match(posts[0].headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
    assert.equal(posts[0].credentials, 'include');
});
test('observed replacement of session blocks exact-attempt replay', async () => {
    const attempt = createAttempt(checkoutPayload(initialCheckout, [{ productId: 1, quantity: 1 }]), 'old');
    let posts = 0; global.fetch = async (_url, init) => { if (init.method === 'POST') posts++; return Response.json({ expiresAt: 'new' }); };
    await assert.rejects(submitAttempt(attempt), error => error.status === 401); assert.equal(posts, 0);
});
test('new materially changed checkout attempt has a different key', () => {
    const a = createAttempt(checkoutPayload(initialCheckout, [{ productId: 1, quantity: 1 }]), 'session');
    const b = createAttempt(checkoutPayload(initialCheckout, [{ productId: 1, quantity: 2 }]), 'session');
    assert.notEqual(a.key, b.key);
});
test('payment proof multipart uses existing endpoint and expectedVersion', async () => {
    let call; global.fetch = async (url, init) => { call = [url, init]; return Response.json({ status: 'waiting_payment' }); };
    const result = await storeApi.proof(3, 9, new File(['synthetic'], 'proof.pdf', { type: 'application/pdf' }));
    assert.equal(call[0], '/api/client/orders/3/payment-proofs'); assert.equal(call[1].body.get('expectedVersion'), '9');
    assert.equal(call[1].headers, undefined); assert.equal(result.status, 'waiting_payment');
});
test('proof UX accepts existing types and rejects mismatch, oversize and empty files', () => {
    for (const [name, type] of [['p.pdf', 'application/pdf'], ['p.jpg', 'image/jpeg'], ['p.png', 'image/png'], ['p.webp', 'image/webp']]) assert.equal(paymentProofError({ name, type, size: 5 }), null);
    for (const file of [{ name: 'a.pdf', type: 'text/plain', size: 5 }, { name: 'a.exe', type: '', size: 5 }, { name: 'a.pdf', type: '', size: 0 }, { name: 'a.pdf', type: '', size: 20 * 1024 * 1024 + 1 }]) assert.ok(paymentProofError(file));
});
test('invalid client order IDs fail before a request', () => {
    assert.equal(storeId('2147483647'), 2147483647);
    for (const id of ['0', '01', '+1', '-1', '1e3', '1.5', 'NaN', '2147483648']) assert.throws(() => storeId(id));
});
test('document downloads stay on owner-scoped current origin routes', async () => {
    global.window = { location: { origin: 'https://example.test' } }; let calls = 0;
    global.fetch = async () => { calls++; return Response.json({}); };
    for (const url of ['https://other.test/api/client/orders/1/documents/1/download', '/api/files/1', '/api/client/orders/2147483648/documents/1/download', '/api/client/orders/1/documents/1/download?secret=x']) await assert.rejects(downloadOrderDocument(url, 'proof.pdf'));
    assert.equal(calls, 0); delete global.window;
});
test('HTTP HTML errors are typed and never displayed or retried automatically', async () => {
    let calls = 0; global.fetch = async () => { calls++; return new Response('<html>SQL private</html>', { status: 503 }); };
    await assert.rejects(storeApi.submit({}, 'key'), error => error instanceof ClientApiError && error.uncertain && !storeError(error).includes('SQL'));
    assert.equal(calls, 1);
});
test('status labels match canonical eight statuses, without fake paid/shipped states', () => {
    assert.deepEqual(Object.keys(require('../features/store/model').orderLabels), ['submitted', 'in_review', 'confirmed', 'waiting_payment', 'paid', 'fulfilled', 'completed', 'cancelled']);
});
