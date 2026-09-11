const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { DataSource } = require('typeorm');
const PDFDocument = require('pdfkit');
const { AdminAuthService } = require('../../../src/admin/admin-auth.service');
const { AdminUserEntity } = require('../../../src/admin/entities/admin-user.entity');
const { RegistrationRequestEntity } = require('../../../src/registrations/entities/registration.entity');
const { RegistrationReadinessService } = require('../../../src/registrations/registration-readiness.service');
const { EquipmentKitEntity } = require('../../../src/assets/entities/equipment-kit.entity');
const { createTestPassword } = require('../../../test/test-password');

async function evidencePdf() {
    const doc = new PDFDocument();
    const chunks = [];
    const result = new Promise((resolve, reject) => {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
    doc.text('SYNTHETIC REGISTRATION EVIDENCE. NOT A REAL DOCUMENT.');
    doc.end();
    return result;
}

async function seedRegistrationWorkspace(app, review = false) {
    assert.equal(process.env.NODE_ENV, 'test');
    assert.match(process.env.TEST_DB_NAME || '', /(?:_test|test_)|(?:_ci_)/);
    assert.equal(process.env.BOT_POLLING_ENABLED, 'false');
    assert.equal(process.env.OUTBOUND_DELIVERY_WORKER_ENABLED, 'false');
    assert.equal(process.env.MAX_BOT_TOKEN || '', '');
    const db = app.get(DataSource);
    const auth = app.get(AdminAuthService);
    const readiness = app.get(RegistrationReadinessService);
    const suffix = randomBytes(5).toString('hex');
    const password = review ? process.env.FE_REG1_REVIEW_PASSWORD : createTestPassword(['operator', 'engineer', 'foreign', 'sales']);
    assert.ok(password && password.length >= 16, 'Provide a runtime review password');
    const actors = {};
    for (const [name, role, displayName] of [
        ['operator', 'operator', 'Анна · демо-оператор'],
        ['engineer', 'engineer', 'Михаил · демо-инженер'],
        ['foreign', 'engineer', 'Демо-инженер без назначений'],
        ['sales', 'sales_manager', 'Демо-менеджер'],
    ]) {
        actors[name] = await auth.createStaff({ login: `reg-${name}-${suffix}`, displayName, password, roles: [role] });
    }
    if (review) {
        actors.admin = await db.getRepository(AdminUserEntity).findOneBy({ login: 'vitma-admin' }) || await auth.createStaff({ login: 'vitma-admin', displayName: 'Администратор ВИТМА', password, roles: ['superadmin'] });
    }
    async function create(orgName, patch = {}) {
        const row = await db.getRepository(RegistrationRequestEntity).save({
            chatId: `reg-demo-${randomBytes(8).toString('hex')}`, platform: 'web', status: 'new',
            orgName, innKpp: '0000000000', kktModel: 'АТОЛ 30Ф', kktName: 'Демо-касса',
            ofdProvisionMode: 'customer_has_code', phoneToCall: '+7 (000) 000-00-00',
            email: 'demo@example.test', kktAdress: 'Демонстрационный адрес, помещение 1',
            urAdress: 'Демонстрационный адрес', taxSystem: 'УСН', nds: 'Без НДС', ...patch,
        });
        await readiness.initialize(row.id);
        return row;
    }
    const main = await create('Демо-мастерская «Контур»', { priority: 'high' });
    const kitRegistration = await create('Демо-магазин «Северная точка»', { priority: 'urgent' });
    const failed = await create('Демо-студия «Форма»', { platform: 'max' });
    const long = await create('Демонстрационная организация с очень длинным наименованием для проверки интерфейса регистрации кассы на небольшом экране');
    const kit = await db.getRepository(EquipmentKitEntity).save({ status: 'stock', cashRegisterModel: 'АТОЛ 30Ф', cashRegisterSerial: 'DEMO-KKT-002', fiscalDriveSerial: 'DEMO-FN-002', ofdActivationCode: randomBytes(20).toString('hex') });
    const identity = row => ({ platform: row.platform, chatId: row.chatId });
    const buffer = await evidencePdf();
    const evidence = await readiness.uploadEvidence(identity(long), long.id, 'kkt_serial', { buffer, fileName: 'Демонстрационный-документ-с-длинным-наименованием-для-проверки-отображения-и-скачивания.pdf', mimeType: 'application/pdf' });
    return { actors, password, main, kitRegistration, failed, long, kit, evidence, buffer, identity };
}
module.exports = { seedRegistrationWorkspace };
