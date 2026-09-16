const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('ts-node').register({ compilerOptions: { jsx: 'react-jsx' } });
const { formErrors, visibleField, editableAnswers, fileError, submitKey } = require('../features/service/form');
const { serviceApi, beginNewSession, checkSession, publicStatus, ServiceApiError } = require('../features/service/api');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const { ServiceFormRenderer } = require('../features/service/ServiceFormRenderer');
const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; });
const read = file => fs.readFileSync(file, 'utf8');
const form = { id: 1, version: 1, supported: true, status: 'retired', schema: { maxAttachments: 5, fields: [
    { key: 'kind', type: 'select', required: true, label: 'Вид', options: [{ value: 'one', label: 'Один' }] },
    { key: 'name', type: 'text', required: true, maxLength: 8, label: 'Имя', condition: { field: 'kind', equals: 'one' } },
    { key: 'consent', type: 'boolean', required: true, label: 'Согласие' },
] } };
test('production routes use one router and no auto session bootstrap on service landing', () => {
    const app = read('client-ui/src/App.tsx');
    assert.equal((app.match(/<BrowserRouter/g) || []).length, 1);
    for (const path of ['service', 'service/request', 'service/requests', 'service/requests/:id', 'service/requests/:id/edit', 'service/status']) assert.ok(app.includes(`path="${path}"`));
    assert.doesNotMatch(read('client-ui/src/main.tsx'), /WebSessionBoundary|REFERENCE_DEV_SERVER/);
    assert.doesNotMatch(read('client-ui/src/features/service/ServiceLandingPage.tsx'), /serviceApi|fetch\(|ensureWebSession/);
    assert.equal(fs.existsSync('client-ui/src/reference/ReferenceClientApp.tsx'), false);
});
test('legacy service fake, local truth, token writes and collapsed status mapping are removed', () => {
    const client = read('client-ui/src/services/client.ts');
    assert.doesNotMatch(client, /demoRequests|serviceRequestService|vitma_service|toClientServiceStatus/);
    assert.doesNotMatch(client, /orderService|vitma_order_/);
    assert.match(client, /callbackService/);
    assert.equal(fs.existsSync('client-ui/src/pages/ServiceRequestPage.tsx'), false);
});
test('conditional visibility uses strict equality, private absent fields cannot be submitted', () => {
    assert.equal(visibleField({ condition: { field: 'x', equals: 1 } }, { x: '1' }), false);
    assert.deepEqual(editableAnswers(form, { kind: 'two', name: 'old', staff: 'secret' }), { kind: 'two', name: null, consent: null });
});
test('validation distinguishes incomplete draft from submit and never grants consent', () => {
    assert.deepEqual(formErrors(form, {}, false), {});
    assert.ok(formErrors(form, { kind: 'one', name: '', consent: false }, true).consent);
    assert.ok(formErrors(form, { kind: 'one', name: 'too long answer', consent: true }, true).name);
    assert.deepEqual(formErrors(form, { kind: 'one', name: 'Анна', consent: true }, true), {});
});
test('all current field types render accessible controls without evaluating schema or HTML', () => {
    const types = ['text', 'textarea', 'phone', 'email', 'number', 'boolean', 'date', 'select', 'multiselect', 'address', 'organization', 'equipment', 'display', 'file_instruction'];
    const schema = { ...form, schema: { fields: types.map((type, i) => ({ key: `f${i}`, type, label: `<unsafe-${type}>`, options: [{ value: 'x', label: 'X' }] })) } };
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ServiceFormRenderer, { form: schema, answers: {}, onChange() {}, errors: { f0: 'Ошибка' } })));
    assert.ok(html.includes('aria-describedby="service-field-f0-error"'));
    assert.ok(html.includes('type="date"'));
    assert.ok(html.includes('type="number"'));
    assert.ok(html.includes('&lt;unsafe-text&gt;'));
    assert.ok(!html.includes('<unsafe-'));
    assert.ok(!html.includes(' checked=""'));
});
test('file UX rejects invalid extension, mismatched MIME, empty and oversize', () => {
    const policy = { extensions: ['.pdf'], mimeTypes: ['application/pdf'], maxBytes: 20 };
    assert.equal(fileError({ name: 'x.pdf', type: 'application/pdf', size: 12 }, policy), null);
    for (const file of [{ name: 'x.exe', type: 'application/pdf', size: 12 }, { name: 'x.pdf', type: 'text/plain', size: 12 }, { name: 'x.pdf', type: '', size: 0 }, { name: 'x.pdf', type: '', size: 21 }]) assert.ok(fileError(file, policy));
});
test('owner 401 does not create identity or fall back to bearer', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}, { status: 401 }); };
    await assert.rejects(serviceApi.detail(7), error => error instanceof ServiceApiError && error.status === 401);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/client/session');
    assert.equal(calls[0][1].method, undefined);
});
test('explicit new session bootstrap is single-flight', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); await new Promise(resolve => setTimeout(resolve, 5)); return Response.json({}, { status: init.method === 'POST' ? 201 : 401 }); };
    await Promise.all([beginNewSession(), beginNewSession(), beginNewSession()]);
    assert.equal(calls.filter(([, init]) => init.method === 'POST').length, 1);
});
test('network failure on session is not absence and never creates a new owner', async () => {
    let count = 0;
    global.fetch = async () => { count++; throw new TypeError('offline'); };
    await assert.rejects(beginNewSession(), error => error.status === 0 && error.uncertain);
    assert.equal(count, 1);
});
test('another bootstrap during pending POST shares the same new identity', async () => {
    let release;
    let posted;
    const started = new Promise(resolve => { posted = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    let posts = 0;
    global.fetch = async (_url, init) => {
        if (init.method !== 'POST') return Response.json({}, { status: 401 });
        posts++; posted(); await pending;
        return Response.json({}, { status: 201 });
    };
    const first = beginNewSession();
    await started;
    const second = beginNewSession();
    assert.equal(first, second);
    release(); await Promise.all([first, second]);
    assert.equal(posts, 1);
});
test('owner/public transports are explicit, private reads use no-store', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}); };
    await checkSession(); await publicStatus('synthetic-token');
    assert.equal(calls[0][1].credentials, 'include');
    assert.equal(calls[0][1].cache, 'no-store');
    assert.equal(calls[1][1].credentials, 'omit');
});
test('proof multipart pins version and has no manual Content-Type or generic fallback', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}, { status: 409 }); };
    await assert.rejects(serviceApi.upload(12, 'proof', new File(['synthetic'], 'x.pdf', { type: 'application/pdf' }), 37), error => error.status === 409);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], '/api/client/service-requests/12/payment-proof');
    assert.equal(calls[0][1].body.get('expectedVersion'), '37');
    assert.equal(calls[0][1].headers, undefined);
});
test('HTML and SQL errors never surface as customer error copy', async () => {
    global.fetch = async () => new Response('<html>SQL secret</html>', { status: 500, headers: { 'Content-Type': 'text/html' } });
    await assert.rejects(serviceApi.message(1, 'synthetic'), error => error.uncertain && !error.message.includes('SQL'));
});
test('submit retry storage contains only draft-scoped UUID, no answers or access token', () => {
    const saved = new Map();
    global.sessionStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
    const key = submitKey(123);
    assert.match(key, /^[0-9a-f-]{36}$/);
    assert.equal(submitKey(123), key);
    assert.deepEqual([...saved.keys()], ['vitma_service_submit_123']);
    delete global.sessionStorage;
});
test('service styling is scoped, neutral and retains approved reference foundation', () => {
    const css = read('client-ui/src/features/service/service.css');
    assert.doesNotMatch(css, /--green|gradient\(/);
    assert.match(read('client-ui/src/features/service/ServiceLayout.tsx'), /reference\/foundation.css/);
    assert.match(css, /\.ref-client/);
});

const access = require('../features/service/public-access-session');
const { publicReply, publicFile, downloadPublic } = require('../features/service/api');
const syntheticBearer = 'A'.repeat(43);
function accessBrowser(t, href) {
    const saved = new Map();
    const steps = [];
    global.sessionStorage = {
        getItem: key => saved.get(key) || null,
        setItem: (key, value) => { steps.push('store'); saved.set(key, value); },
        removeItem: key => saved.delete(key),
    };
    global.window = {
        location: new URL(href),
        history: { state: { idx: 2 }, replaceState(state, _unused, url) {
            assert.deepEqual(state, { idx: 2 });
            steps.push('replace'); window.location = new URL(url, window.location.origin);
        } },
    };
    access.clearPublicAccess();
    t.after(() => { access.clearPublicAccess(); delete global.window; delete global.sessionStorage; });
    return { saved, steps };
}
test('share bootstrap replaces history before storing the only session-scoped bearer', t => {
    const { saved, steps } = accessBrowser(t, `https://example.test/site/service/status?number=SR-1#access=${syntheticBearer}`);
    access.bootstrapPublicAccess();
    assert.equal(window.location.href, 'https://example.test/site/service/status?number=SR-1');
    assert.deepEqual(steps, ['replace', 'store']);
    assert.deepEqual([...saved], [[access.PUBLIC_ACCESS_KEY, syntheticBearer]]);
    assert.equal(access.readPublicAccess(), syntheticBearer);
    assert.equal(access.invalidPublicAccess(), false);
    assert.equal(access.publicShareLink(syntheticBearer), `https://example.test/site/service/status#access=${syntheticBearer}`);
});
test('legacy query and malformed fragments are scrubbed but never become access', t => {
    const { saved } = accessBrowser(t, 'https://example.test/site/service/status');
    for (const suffix of [`?token=${syntheticBearer}`, `?accessToken=${syntheticBearer}`, `#access=${syntheticBearer}x`, `#access=${'B'.repeat(43)}`]) {
        window.location = new URL(`https://example.test/site/service/status${suffix}`);
        access.bootstrapPublicAccess();
        assert.equal(window.location.href, 'https://example.test/site/service/status');
        assert.equal(access.readPublicAccess(), null);
        assert.equal(access.invalidPublicAccess(), true);
        assert.equal(saved.size, 0);
    }
});
test('blocked browser storage falls back only to memory', t => {
    accessBrowser(t, `https://example.test/site/service/status#access=${syntheticBearer}`);
    global.sessionStorage = new Proxy({}, { get() { throw new Error('Storage denied'); } });
    access.bootstrapPublicAccess();
    assert.equal(window.location.hash, '');
    assert.equal(access.readPublicAccess(), syntheticBearer);
    access.clearPublicAccess();
    assert.equal(access.readPublicAccess(), null);
});
test('all public API calls use fixed URLs, Authorization and no cookies or caching', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}, { status: url.endsWith('/8') ? 404 : 200 }); };
    await publicStatus(syntheticBearer);
    await publicReply(syntheticBearer, 'Synthetic message');
    await publicFile(syntheticBearer, new File(['Synthetic'], 'test.txt', { type: 'text/plain' }));
    await assert.rejects(downloadPublic(syntheticBearer, 8, 'test.txt'));
    assert.deepEqual(calls.map(([url]) => url), ['/status', '/messages', '/messages/attachments', '/attachments/8'].map(path => `/api/public/service-requests${path}`));
    for (const [, init] of calls) {
        assert.equal(init.headers.Authorization, `Bearer ${syntheticBearer}`);
        assert.equal(init.credentials, 'omit');
        assert.equal(init.cache, 'no-store');
    }
    assert.deepEqual(JSON.parse(calls[1][1].body), { text: 'Synthetic message' });
    assert.deepEqual([...calls[2][1].body.keys()], ['file']);
});
test('public 401 clears session access; owner mutation is never retried automatically', async t => {
    const { saved } = accessBrowser(t, `https://example.test/site/service/status#access=${syntheticBearer}`);
    access.bootstrapPublicAccess();
    let calls = 0;
    global.fetch = async () => { calls++; return Response.json({}, { status: 401 }); };
    await assert.rejects(publicStatus(syntheticBearer), error => error.status === 401);
    assert.equal(saved.size, 0);
    assert.equal(access.readPublicAccess(), null);
    assert.equal(access.invalidPublicAccess(), true);
    calls = 0;
    global.fetch = async () => { calls++; throw new TypeError('Lost response'); };
    await assert.rejects(serviceApi.issuePublicAccess(1, 3), error => error.uncertain);
    assert.equal(calls, 1);
});
test('owner lifecycle mutations pin root version and never transmit a bearer', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({ enabled: false, version: 4 }); };
    await serviceApi.publicAccess(1);
    await serviceApi.issuePublicAccess(1, 4);
    await serviceApi.revokePublicAccess(1, 5);
    assert.equal(calls[1][0], '/api/client/service-requests/1/public-access');
    assert.equal(calls[1][1].method, undefined);
    for (const [index, method, version] of [[2, 'POST', 4], [3, 'DELETE', 5]]) {
        assert.equal(calls[index][1].method, method);
        assert.equal(calls[index][1].credentials, 'include');
        assert.equal(calls[index][1].cache, 'no-store');
        assert.deepEqual(JSON.parse(calls[index][1].body), { expectedVersion: version });
        assert.equal(calls[index][1].headers.Authorization, undefined);
    }
});
