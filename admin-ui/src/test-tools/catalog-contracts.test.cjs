const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('ts-node').register({ compilerOptions: { jsx: 'react-jsx' } });
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const catalog = require('../features/catalog/api');
const api = require('../api');
const { productForm, productPayload, productChanges } = require('../features/catalog/CatalogProductPage');
const { categoryHierarchy } = require('../features/catalog/CatalogCategoryPage');
const { ProductFacts, ListEditor } = require('../features/catalog/components/CatalogFields');
const { visibleNavigation, unavailableRoutes } = require('../app/navigation');
const { CATALOG_AVAILABILITY_STATUSES, CATALOG_VAT_RATES } = require('../../../src/catalog/catalog.types');
const read = path => fs.readFileSync(path, 'utf8');

test('Catalog activates only the current shell routes, with role-filtered navigation', () => {
    assert.equal(unavailableRoutes.has('/admin/catalog/products'), false);
    assert.equal(unavailableRoutes.has('/admin/catalog/support'), true);
    const paths = permissions => visibleNavigation(permissions).flatMap(group => group.items.map(item => item.target));
    assert.ok(paths(['catalog.read']).includes('/admin/catalog/categories'));
    assert.ok(!paths(['tickets.read']).includes('/admin/catalog/products'));
    const source = read('admin-ui/src/app/AdminApp.tsx');
    for (const route of ['catalog/products', 'catalog/products/new', 'catalog/products/:id', 'catalog/categories']) assert.ok(source.includes(`path="${route}"`));
    assert.doesNotMatch(read('admin-ui/src/legacy/LegacyAdminSections.tsx'), /CatalogProductPage|catalog\/products/);
});
test('bounded ID parsing occurs before numeric conversion', () => {
    for (const id of ['0', '-1', '+1', '01', '1e3', '1.5', '2147483648', '9'.repeat(1000)]) assert.equal(catalog.validId(id), false);
    assert.equal(catalog.validId('2147483647'), true);
});
test('queue adapter retains canonical server filters and bounds page/search', () => {
    const query = catalog.queueQuery(new URLSearchParams('search=demo&category=kkt&availability=low_stock&active=inactive&publication=published&page=2&limit=999'));
    assert.equal(query.get('page'), '2'); assert.equal(query.get('limit'), '20');
    assert.equal(query.get('active'), 'inactive'); assert.equal(query.get('publication'), 'published');
    assert.equal(catalog.queueQuery(new URLSearchParams('active=yes&publication=no&page=1e3')).get('page'), '1');
    assert.equal(catalog.queueQuery(new URLSearchParams('availability=unknown')).has('availability'), false);
});
test('Catalog money converts exact minor units with null distinct from zero', () => {
    for (const [input, result] of [['', null], ['0', 0], ['0,01', 1], ['21474836.47', 2147483647]]) assert.equal(catalog.priceToMinor(input), result);
    for (const input of ['21474836.48', '-1', '1e3', '1.005', 'Infinity', 'NaN']) assert.throws(() => catalog.priceToMinor(input));
    assert.equal(catalog.priceInput(2147483647), '21474836.47');
    assert.equal(catalog.priceLabel(null), 'По запросу'); assert.notEqual(catalog.priceLabel(0), 'По запросу');
});
test('frontend consumes the existing backend availability and VAT values', () => {
    const types = require('../features/catalog/types');
    assert.deepEqual(types.CATALOG_AVAILABILITY_STATUSES, CATALOG_AVAILABILITY_STATUSES);
    assert.deepEqual(types.CATALOG_VAT_RATES, CATALOG_VAT_RATES);
    for (const value of CATALOG_AVAILABILITY_STATUSES) assert.ok(types.availabilityLabels[value]);
});
test('aliases and spec keys fail explicitly instead of silently overwriting', () => {
    assert.throws(() => catalog.validateLists(['Еж', 'Ёж'], []));
    assert.throws(() => catalog.validateLists(['---'], []));
    assert.throws(() => catalog.validateLists([], [['Model', 'a'], ['Model', 'b']]));
    assert.doesNotThrow(() => catalog.validateLists(['Demo'], [['Model', ''] ]));
});
test('partial edit leaves aliases and concurrent unrelated fields untouched', () => {
    const base = { ...productForm(null), categoryId: '1', name: 'A', sku: 'DEMO', slug: 'demo', aliases: ['keep me'], specifications: [['Model', 'A']], features: [''] };
    assert.deepEqual(productChanges({ ...base, name: 'B' }, base), { name: 'B' });
    const payload = productPayload(base);
    assert.deepEqual(payload.aliases, ['keep me']); assert.deepEqual(payload.features, ['']);
    for (const field of ['id', 'updatedAt', 'oneCSyncedAt', 'isPublished', 'category']) assert.equal(Object.hasOwn(payload, field), false);
});
test('publication commands carry captured entity and dependency tokens', async () => {
    const calls = []; const original = api.api; api.api = async (...args) => { calls.push(args); return {}; };
    try {
        await catalog.productCommand({ id: 7, expectedUpdatedAt: 'a', expectedCategoryUpdatedAt: 'b' }, 'publish');
        assert.equal(calls[0][0], '/admin/api/catalog/products/7/publish');
        assert.deepEqual(JSON.parse(calls[0][1].body), { expectedUpdatedAt: 'a', expectedCategoryUpdatedAt: 'b' });
        await catalog.categoryCommand({ id: 2, expectedUpdatedAt: 'c' }, 'unpublish');
        assert.deepEqual(JSON.parse(calls[1][1].body), { expectedUpdatedAt: 'c' });
    } finally { api.api = original; }
});
test('status presentation separates hidden category, active and availability', () => {
    const html = renderToStaticMarkup(createElement(ProductFacts, { product: { isActive: true, isPublished: true, category: { isPublished: false }, effectivePublicVisibility: false, availabilityStatus: 'low_stock', displayPriceMinor: 0 } }));
    assert.match(html, /Активен/); assert.match(html, /Опубликован, но категория скрыта/); assert.match(html, /Осталось мало/);
});
test('hierarchy is deterministic and protected against malformed cycles in read data', () => {
    const rows = [{ id: 2, parentId: 1 }, { id: 1, parentId: null }, { id: 3, parentId: 2 }];
    assert.deepEqual(categoryHierarchy(rows).map(item => [item.row.id, item.depth]), [[1, 0], [2, 1], [3, 2]]);
    assert.equal(categoryHierarchy([{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }]).length, 2);
});
test('list controls have accessible names and bounded row sizes', () => {
    const html = renderToStaticMarkup(createElement(ListEditor, { label: 'Особенности', values: ['A'], limit: 30, maxLength: 500, disabled: false, onChange() {} }));
    assert.match(html, /maxLength="500"/i); assert.match(html, /aria-label="Удалить: Особенности 1"/);
});
test('mutation recovery keeps values mounted and forbids blind replay', () => {
    const source = read('admin-ui/src/features/catalog/use-catalog-mutation.ts');
    assert.match(source, /submitting.current/); assert.match(source, /setUncertain/); assert.match(source, /setReconciled/); assert.match(source, /acknowledge/);
    assert.doesNotMatch(source, /setInterval|localStorage|sessionStorage/);
    assert.match(read('admin-ui/src/features/catalog/CatalogProductPage.tsx'), /last.current/);
});
test('error mapping does not echo arbitrary server diagnostics', () => {
    for (const status of [400, 401, 403, 404, 409, 500]) assert.doesNotMatch(catalog.catalogError(new api.ApiError('SQLSTATE secret internal constraint', status)), /SQLSTATE|secret|constraint/);
});
test('styles remain scoped, neutral and without client changes', () => {
    const css = read('admin-ui/src/features/catalog/catalog.css');
    assert.doesNotMatch(css, /gradient|glass|#[0-9a-f]{3,8}\b/i);
    assert.match(css, /overflow:\s*auto/); assert.match(css, /minmax\(0,\s*1fr\)/);
});
