const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('ts-node').register({ compilerOptions: { jsx: 'react-jsx' } });
const { registrationApi, registrationId, downloadRegistrationEvidence } = require('../features/registration/api');
const { ClientApiError, beginNewSession } = require('../api/client-session');
const { beginNewSession: serviceBegin } = require('../features/service/api');
const { registrationFormErrors, RegistrationFormRenderer } = require('../features/registration/RegistrationFormRenderer');
const { registrationEvidenceError, RegistrationRequirementPanel } = require('../features/registration/RegistrationRequirementPanel');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; delete global.window; });
const read = file => fs.readFileSync(file, 'utf8');
const fields = [
    { name: 'orgName', label: '<Organization>', step: 2, required: true, inputKind: 'text', maxLength: 10000 },
    { name: 'phoneToCall', label: 'Contact', step: 3, required: true, inputKind: 'tel', maxLength: 10000 },
    { name: 'bankReqs', label: 'Bank', step: 4, required: false, inputKind: 'textarea', maxLength: 10000 },
];
test('canonical registration routes use one router and remove old monolith/auto-bootstrap helper', () => {
    const app = read('client-ui/src/App.tsx');
    for (const route of ['cash-registration', 'registrations', 'registrations/:id', 'registrations/:id/edit']) assert.ok(app.includes(`path="${route}"`));
    assert.equal((app.match(/<BrowserRouter/g) || []).length, 1);
    assert.equal(fs.existsSync('client-ui/src/pages/CashRegistrationPage.tsx'), false);
    assert.doesNotMatch(read('client-ui/src/services/client.ts'), /registrationService|RegistrationChecklistDto/);
    for (const file of fs.readdirSync('client-ui/src/features/registration').filter(name => /tsx?$/.test(name)))
        assert.doesNotMatch(read(`client-ui/src/features/registration/${file}`), /localStorage|sessionStorage|ensureWebSession/);
});
test('bounded registration identifiers reject coercion before any request', () => {
    assert.equal(registrationId('2147483647'), 2147483647);
    for (const value of [undefined, '', '0', '-1', '01', '+1', '1.5', '1e3', 'Infinity', '2147483648', '999999999999']) assert.throws(() => registrationId(value), ClientApiError);
});
test('draft validation allows partial/empty values, submit requires current required fields', () => {
    assert.deepEqual(registrationFormErrors(fields, {}, false), {});
    assert.deepEqual(Object.keys(registrationFormErrors(fields, {}, true)), ['orgName', 'phoneToCall']);
    assert.ok(registrationFormErrors(fields, { orgName: 'x'.repeat(10001) }, false).orgName);
});
test('form uses safe labels, bound inputs, maxlength and accessible inline errors', () => {
    const html = renderToStaticMarkup(createElement(RegistrationFormRenderer, { fields, values: { orgName: 'Saved' }, errors: { orgName: 'Required' }, onChange() {} }));
    assert.ok(html.includes('&lt;Organization&gt;'));
    assert.ok(html.includes('value="Saved"'));
    assert.ok(html.includes('aria-describedby="registration-field-orgName-error"'));
    assert.ok(html.includes('maxLength="10000"'));
    assert.ok(html.includes('<textarea'));
});
test('long existing values stay complete and can be saved with another field', async () => {
    for (const length of [1500, 10000]) {
        const values = { orgName: 'x'.repeat(length), phoneToCall: 'Updated contact' };
        assert.deepEqual(registrationFormErrors(fields, values, true), {});
        const html = renderToStaticMarkup(createElement(RegistrationFormRenderer, { fields, values, errors: {}, onChange() {} }));
        assert.ok(html.includes(`value="${values.orgName}"`));
        global.fetch = async (_url, init) => {
            assert.deepEqual(JSON.parse(init.body).values, values);
            return Response.json({});
        };
        await registrationApi.save(7, 'timestamp', values);
    }
});
test('401 list/detail never create a new identity or return an empty list', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}, { status: 401 }); };
    await assert.rejects(registrationApi.list(), error => error.status === 401);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], '/api/client/session');
    assert.equal(calls[0][1].method, undefined);
});
test('service and registration explicitly share the same single-flight session creation', async () => {
    assert.equal(serviceBegin, beginNewSession);
    let posts = 0;
    global.fetch = async (_url, init) => { if (init.method === 'POST') posts++; return Response.json({}, { status: init.method === 'POST' ? 201 : 401 }); };
    await Promise.all([serviceBegin(), beginNewSession(), beginNewSession()]);
    assert.equal(posts, 1);
});
test('draft and submit pin updatedAt; web value pins requirement version', async () => {
    const calls = [];
    global.fetch = async (url, init) => { calls.push([url, init]); return Response.json({}); };
    await registrationApi.save(7, 'timestamp', { orgName: '' });
    await registrationApi.submit(7, 'timestamp');
    await registrationApi.value(7, 'ofd_code', 'synthetic', 9);
    assert.deepEqual(JSON.parse(calls[0][1].body), { expectedUpdatedAt: 'timestamp', values: { orgName: '' } });
    assert.equal(calls[0][1].method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[1][1].body), { expectedUpdatedAt: 'timestamp' });
    assert.deepEqual(JSON.parse(calls[2][1].body), { expectedRequirementVersion: 9, value: 'synthetic' });
    assert.ok(calls.every(([, init]) => init.cache === 'no-store' && init.credentials === 'include'));
});
test('evidence multipart pins version and browser supplies content type boundary', async () => {
    let call;
    global.fetch = async (url, init) => { call = [url, init]; return Response.json({}, { status: 409 }); };
    await assert.rejects(registrationApi.evidence(8, 'kkt_serial', new File(['synthetic'], 'x.pdf'), 17), error => error.status === 409);
    assert.equal(call[0], '/api/client/registrations/8/requirements/kkt_serial/evidence');
    assert.equal(call[1].body.get('expectedRequirementVersion'), '17');
    assert.equal(call[1].body.get('file').name, 'x.pdf'); assert.equal(call[1].headers, undefined);
});
test('evidence UX rejects empty/oversized/mismatched files and accepts supported formats', () => {
    for (const [name, type] of [['x.pdf', 'application/pdf'], ['x.jpg', 'image/jpeg'], ['x.png', 'image/png'], ['x.webp', 'image/webp']]) assert.equal(registrationEvidenceError({ name, type, size: 5 }), null);
    for (const file of [{ name: 'x.pdf', type: 'application/pdf', size: 0 }, { name: 'x.pdf', size: 15 * 1024 * 1024 + 1 }, { name: 'x.pdf', type: 'text/plain', size: 5 }, { name: 'x.exe', size: 5 }]) assert.ok(registrationEvidenceError(file));
});
test('OFD input is blank even when masked current value is displayed; readonly removes mutation controls', () => {
    const props = { id: 1, item: { id: 2, kind: 'ofd_code', status: 'provided', version: 2, value: '****tail', canProvideValue: true, canUploadEvidence: true }, evidence: [], requests: [], refresh() {} };
    const render = input => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(RegistrationRequirementPanel, input)));
    const html = render(props);
    assert.ok(html.includes('****tail')); assert.ok(html.includes('value=""')); assert.ok(!html.includes('value="****tail"'));
    const readonly = render({ ...props, item: { ...props.item, status: 'verified', canProvideValue: false, canUploadEvidence: false } });
    assert.ok(!readonly.includes('Отправить данные')); assert.ok(!readonly.includes('type="file"'));
});
test('evidence downloader rejects foreign origin, query, malformed and out-of-range paths before fetch', async () => {
    global.window = { location: { origin: 'https://example.test' } };
    let calls = 0; global.fetch = async () => { calls++; return Response.json({}); };
    for (const url of ['https://foreign.test/api/client/registrations/1/evidence/1', '/api/client/registrations/1/evidence/1?token=secret', '/api/files/1', '/api/client/registrations/2147483648/evidence/1'])
        await assert.rejects(downloadRegistrationEvidence(url, 'x.pdf'));
    assert.equal(calls, 0); delete global.window;
});
test('HTML failures are safe, uncertain and never automatically retried', async () => {
    let calls = 0;
    global.fetch = async () => { calls++; return new Response('<html>private SQL</html>', { status: 500 }); };
    await assert.rejects(registrationApi.submit(1, 'date'), error => error.uncertain && !error.message.includes('SQL'));
    assert.equal(calls, 1);
});
