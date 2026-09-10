const assert = require('node:assert/strict');
const path = require('node:path');
const { NestFactory } = require('@nestjs/core');
const { getBotToken } = require('nestjs-telegraf');
const { AppModule } = require('../../../src/app.module');
const { AdminAuthService } = require('../../../src/admin/admin-auth.service');
async function main() {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.equal(process.env.TEST_DB_NAME, 'vitma_fe1c_review_test');
    assert.equal(process.env.TEST_DB_HOST, '127.0.0.1');
    assert.equal(process.env.BOT_POLLING_ENABLED, 'false');
    assert.equal(process.env.OUTBOUND_DELIVERY_WORKER_ENABLED, 'false');
    assert.equal(process.env.MAX_BOT_TOKEN || '', '');
    assert.equal(path.basename(process.env.FILE_STORAGE_ROOT || ''), 'vitma-fe1c-review-storage');
    const password = process.env.FE1C_REVIEW_PASSWORD;
    assert.ok(typeof password === 'string' && password.length >= 16, 'Supply an external disposable FE1C_REVIEW_PASSWORD');
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    app.get(getBotToken()).stop = () => undefined;
    try {
        const auth = app.get(AdminAuthService);
        await auth.createStaff({ login: 'fe1c-review', displayName: 'Демо-оператор FE-1C', roles: ['superadmin'], password });
        await auth.createStaff({ login: 'fe1c-engineer', displayName: 'Demo engineer', roles: ['engineer'], password });
        process.stdout.write('Isolated FE-1C review staff created. No credentials printed.\n');
    } finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
