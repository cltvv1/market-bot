const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('ts-node').register({ compilerOptions: { jsx: 'react-jsx' } });
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const api = require('../api');
const { registrationQuery, registrationCommand, registrationError, downloadRegistrationFile } = require('../features/registrations/api');
const { RegistrationDocumentRow } = require('../features/registrations/RegistrationDocumentsTab');
const { RegistrationActionButton } = require('../features/registrations/RegistrationActions');
const { visibleNavigation, legacyRoutes } = require('../app/navigation');
const read = file => fs.readFileSync(`admin-ui/src/${file}`, 'utf8');

test('registration production routes replace legacy renderer and preserve shell', () => {
    const app = read('app/AdminApp.tsx');
    assert.match(app, /path="requests\/registrations"/);
    assert.match(app, /path="requests\/registrations\/:id"/);
    assert.equal(legacyRoutes.registrations, undefined);
    assert.doesNotMatch(read('legacy/LegacyAdminSections.tsx'), /function (Registrations|RegistrationDetail|AdminRequirement|PrioritySelect)\(/);
    assert.ok(read('legacy/LegacyAdminSections.tsx').includes("`/requests/registrations${id ? `/${id}` : ''}`"));
});
test('query adapter preserves bounded server filters and local closed alias only', () => {
    const query = registrationQuery(new URLSearchParams('status=closed&page=2&limit=25&selected=8&platform=max&priority=high&readiness=ready&assignedEngineerId=1'));
    assert.equal(query.get('status'), 'processed');
    assert.equal(query.get('page'), '2');
    assert.equal(query.has('selected'), false);
    assert.equal(query.has('assignedEngineerId'), false);
    const source = read('features/registrations/RegistrationQueuePage.tsx');
    assert.match(source, /hasNext/); assert.match(source, /selectedId/);
    assert.doesNotMatch(source, /filterResult|\.slice\(|assets\/|staff\/engineers/);
});
test('registration navigation preserves permission union and sales separation', () => {
    const targets = permissions => visibleNavigation(permissions).flatMap(group => group.items.map(item => item.target));
    assert.ok(targets(['registrations.read.assigned']).includes('/admin/requests/registrations'));
    assert.ok(targets(['registrations.read']).includes('/admin/requests/registrations'));
    assert.ok(!targets(['orders.read.all']).includes('/admin/requests/registrations'));
});
test('commands preserve immutable server preconditions and dedicated routes', async () => {
    const calls = []; const original = api.post;
    api.post = async (url, body) => { calls.push({ url, body }); return {}; };
    try {
        const precondition = { expectedStatus: 'new', expectedHandedOffAt: null, expectedRequirementVersion: 3 };
        const selection = { action: { id: 'verify', precondition }, requirement: { kind: 'kkt_serial' } };
        await registrationCommand(12, selection, { precondition: { expectedRequirementVersion: 99 }, kind: 'ofd_code' });
        assert.equal(calls[0].url, '/admin/api/registrations/12/verify');
        assert.deepEqual(calls[0].body.precondition, precondition);
        assert.equal(calls[0].body.kind, 'kkt_serial');
        await registrationCommand(12, { action: { id: 'remove-evidence', precondition }, evidenceId: 8 }, {});
        assert.equal(calls[1].url, '/admin/api/registrations/12/evidence/8/remove');
    } finally { api.post = original; }
});
test('errors are localized, not provider diagnostics, and conflict forms retain captured snapshot', () => {
    assert.doesNotMatch(registrationError(new Error('private diagnostics')), /private diagnostics/);
    assert.match(registrationError(new api.ApiError('secret', 409)), /данные|измен/i);
    const source = read('features/registrations/RegistrationActions.tsx');
    assert.match(source, /useState\(selection\)/); assert.match(source, /reviewRequired/);
    assert.match(source, /status === 409/); assert.match(source, /setSnapshot/);
    assert.doesNotMatch(source, /setInterval|localStorage|sessionStorage/);
});
test('document availability and reasons are server driven; unsafe download URLs are rejected', async () => {
    const html = renderToStaticMarkup(createElement(RegistrationDocumentRow, { file: { originalName: 'synthetic.pdf', mimeType: 'application/pdf', sizeBytes: 123, downloadable: false, downloadUrl: null, unavailableReason: 'Файл недоступен' } }));
    assert.doesNotMatch(html, /<button|href=/); assert.match(html, /Файл недоступен/);
    await assert.rejects(downloadRegistrationFile('https://example.test/private', 'synthetic.pdf'));
    await assert.rejects(downloadRegistrationFile('/admin/api/files/1', 'synthetic.pdf'));
});
test('permitted but blocked actions explain why; absent permissions render nothing', () => {
    assert.equal(renderToStaticMarkup(createElement(RegistrationActionButton, { onAction: () => {} })), '');
    const html = renderToStaticMarkup(createElement(RegistrationActionButton, { action: { id: 'handoff', allowed: false, reason: 'Нужна проверка' }, onAction: () => {} }));
    assert.match(html, /disabled/); assert.match(html, /aria-describedby/); assert.match(html, /Нужна проверка/);
});
test('readiness is not recomputed in React; tabs are URL-based and old ID reads are isolated', () => {
    const source = read('features/registrations/RegistrationDetailPage.tsx');
    assert.match(source, /key=\{id\}/); assert.match(source, /workflow.actions/);
    assert.match(source, /aria-controls/); assert.match(source, /ArrowRight/);
    assert.doesNotMatch(source, /computeRegistrationReadiness|audit-events|customer-card/);
});
test('OFD reveal is explicit, abortable, and never stored in browser storage', () => {
    const source = read('features/registrations/RegistrationRequirementCard.tsx');
    assert.match(source, /ofd-value/); assert.match(source, /cache: 'no-store'/);
    assert.match(source, /AbortController/); assert.match(source, /vitma:forbidden/);
    assert.match(source, /setRevealed\(null\)/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
});
test('registration styling is scoped and preserves approved neutral palette', () => {
    const css = read('features/registrations/registrations.css');
    const postcss = require('postcss');
    postcss.parse(css).walkRules(rule => {
        for (const selector of rule.selectors) assert.ok(selector.startsWith('.reg-'), selector);
    });
    assert.doesNotMatch(css, /#(?:0f766e|16a34a|10b981|22c55e|059669)|green|emerald|teal/i);
});
