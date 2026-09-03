const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('ts-node').register({compilerOptions:{jsx:'react-jsx'}});
const {createElement} = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {visibleNavigation, unavailableRoutes, legacyRoutes} = require('../app/navigation');
const {DocumentRow} = require('../features/service-requests/ServiceDocuments');
const api = require('../api');
const {executeAction, conflictMessage, commandError, formText} = require('../features/service-requests/service-api');
const read = file => fs.readFileSync(path.resolve(file),'utf8');

test('a single production entry and router replace admin reference dispatch', () => {
    assert.match(read('admin-ui/src/main.tsx'), /AdminApp/);
    assert.doesNotMatch(read('admin-ui/src/main.tsx'), /reference|REFERENCE_DEV_SERVER/);
    assert.equal(fs.existsSync('admin-ui/src/App.tsx'), false);
    assert.equal(fs.existsSync('admin-ui/src/reference/ReferenceAdminApp.tsx'), false);
    assert.match(read('admin-ui/src/app/AdminApp.tsx'), /basename="\/admin"/);
    assert.doesNotMatch(read('admin-ui/src/legacy/LegacyAdminSections.tsx'), /function (App|ServiceRequests|ServiceDetail|Login)\(/);
    assert.equal(Object.keys(legacyRoutes).length, 9);
});
test('permission-filtered navigation, disabled domains, sales and engineer separation', () => {
    const labels = permissions => visibleNavigation(permissions).flatMap(group=>group.items.map(item=>item.label));
    assert.ok(labels(['serviceRequests.read.assigned']).includes('Сервисные заявки'));
    assert.ok(!labels(['orders.read.all']).includes('Сервисные заявки'));
    assert.ok(!labels(['orders.read.all']).includes('Моя работа'));
    assert.ok(!labels(['serviceRequests.read.assigned']).includes('Сотрудники'));
    assert.equal(unavailableRoutes.size,4);
    assert.match(read('admin-ui/src/app/AdminApp.tsx'), /admin-nav-disabled/);
    assert.match(read('admin-ui/src/app/AdminApp.tsx'), /aria-disabled="true"/);
});
test('client reference stays dev-server-only and production client is unchanged', () => {
    assert.match(read('client-ui/src/main.tsx'), /import\.meta\.env\.DEV/);
    assert.match(read('client-ui/src/main.tsx'), /REFERENCE_DEV_SERVER/);
    assert.match(read('client-ui/vite.config.ts'), /command === 'serve'/);
    if (fs.existsSync('client-ui/dist/site.js')) assert.doesNotMatch(read('client-ui/dist/site.js'), /FE-1A|reference-client|ReferenceClientApp/);
});
test('new CSS is scoped; no green palette tokens or client CSS imports', () => {
    for (const dir of ['admin-ui/src/app','admin-ui/src/features/service-requests']) for (const file of fs.readdirSync(dir)) {
        const content = read(`${dir}/${file}`);
        assert.doesNotMatch(content, /(?:#(?:0f766e|16a34a|10b981|22c55e|059669)|\b(?:emerald|teal|green)-\d|client-ui\/)/i);
    }
    const postcss = require('postcss');
    assert.match(read('admin-ui/src/app/admin-shell.css'), /select:not\(:where\(\.legacy-admin-root \*\)\)/);
    postcss.parse(read('admin-ui/src/legacy/legacy-admin.css')).walkRules(rule=>{
        if (rule.parent.type==='atrule' && /keyframes$/.test(rule.parent.name)) return;
        for (const selector of rule.selectors) assert.ok(selector.startsWith('.legacy-admin-root'),selector);
    });
});
test('unavailable documents do not expose a link, available documents use protected URLs', () => {
    const file = {id:1,kind:'invoice',originalName:'Invoice.pdf',mimeType:'application/pdf',sizeBytes:100,createdAt:'2026-09-03T00:00:00Z',downloadable:false,downloadUrl:null};
    assert.doesNotMatch(renderToStaticMarkup(createElement(DocumentRow,{document:file})), /href=/);
    const html = renderToStaticMarkup(createElement(DocumentRow,{document:{...file,downloadable:true,downloadUrl:'/admin/api/service-requests/1/invoice'}}));
    assert.match(html,/href="\/admin\/api\/service-requests\/1\/invoice"/);
    assert.doesNotMatch(html,/objectKey|provider|token/);
});
test('commands serialize the server-projected version and use dedicated endpoints', async () => {
    const calls=[]; const originalPost=api.post; const originalUpload=api.upload;
    api.post=async (url,body)=>{calls.push({url,body});return {};};
    api.upload=async (url,body)=>{calls.push({url,body});return {};};
    try {
        for (const [id,endpoint] of [['assign_engineer','assign-engineer'],['update_operator_state','operator-state'],['schedule_visit','schedule'],['reschedule_visit','schedule'],['confirm_payment','transition']]) {
            await executeAction(5,{id,expectedVersion:7,targetStatus:'paid'},{assignedEngineerId:2});
            assert.equal(calls.at(-1).url,`/admin/api/service-requests/5/${endpoint}`);
            assert.equal(calls.at(-1).body.expectedVersion,7);
        }
        for (const id of ['upload_invoice','replace_invoice']) {
            await executeAction(5,{id,expectedVersion:7},{},new File(['%PDF-test'],'invoice.pdf',{type:'application/pdf'}));
            assert.equal(calls.at(-1).url,'/admin/api/service-requests/5/invoice-file');
            assert.equal(calls.at(-1).body.get('expectedVersion'),'7');
        }
        await executeAction(5,{id:'add_internal_note',expectedVersion:7},{text:'synthetic'});
        assert.equal(calls.at(-1).body.visibility,'internal');
        assert.equal(calls.at(-1).body.expectedVersion,undefined);
    } finally {api.post=originalPost;api.upload=originalUpload;}
});
test('409 is not retried and has a safe localized message', () => {
    assert.equal(commandError(new api.ApiError('internal',409)), conflictMessage);
    assert.doesNotMatch(commandError(new Error('private diagnostics')),/private diagnostics/);
    const form=new FormData(); form.set('file',new File(['x'],'x.pdf'));form.set('name',' Demo ');
    assert.equal(formText(form,'file'),''); assert.equal(formText(form,'name'),'Demo');
    const source=read('admin-ui/src/features/service-requests/ActionDialog.tsx');
    assert.match(source,/status === 409/);assert.match(source,/onChanged\(\)/);assert.match(source,/onClose\(\)/);
});
test('detail uses server policy, keyboard tabs and history-preserving URL navigation', () => {
    const source=read('admin-ui/src/features/service-requests/ServiceDetail.tsx');
    assert.match(source,/workflow\.actions/);assert.match(source,/workflow\.primaryActionId/);
    assert.match(source,/aria-selected/);assert.match(source,/ArrowRight/);assert.match(source,/aria-controls/);
    assert.doesNotMatch(source,/ALLOWED_TRANSITIONS|replace: true/);
    const queue=read('admin-ui/src/features/service-requests/ServiceQueue.tsx');
    assert.match(queue,/hasNext/);assert.match(queue,/responsibleStaffId/);assert.match(queue,/scope/);
    assert.doesNotMatch(queue,/filterResult|staff\/engineers|\.slice\(/);
});
