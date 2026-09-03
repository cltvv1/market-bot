// Synthetic data only. Run after ci:database, which resets the isolated test DB.
const path = require('node:path');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { getBotToken } = require('nestjs-telegraf');
const PDFDocument = require('pdfkit');
const { AppModule } = require('../../../src/app.module');
const { AdminAuthService } = require('../../../src/admin/admin-auth.service');
const { AdminService } = require('../../../src/admin/admin.service');
const { ServiceRequestsService } = require('../../../src/service-requests/service-requests.service');
const { FilesService } = require('../../../src/files/files.service');

async function pdf(text) {
  const document = new PDFDocument();
  const chunks = [];
  const ready = new Promise((resolve, reject) => {
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.fontSize(16).text('FE-1B SYNTHETIC DOCUMENT').moveDown().text(text);
  document.end();
  return ready;
}
async function main() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.TEST_DB_NAME, 'vitma_fe1b_review_test');
  assert.equal(process.env.TEST_DB_HOST, '127.0.0.1');
  assert.equal(process.env.TEST_DB_PORT, '55437');
  assert.equal(process.env.BOT_POLLING_ENABLED, 'false');
  assert.equal(process.env.OUTBOUND_DELIVERY_WORKER_ENABLED, 'false');
  assert.equal(process.env.MAX_BOT_TOKEN || '', '');
  assert.equal(path.basename(process.env.FILE_STORAGE_ROOT || ''), 'vitma-fe1b-review-storage');
  const password = process.env.FE1B_REVIEW_PASSWORD;
  assert.ok(typeof password === 'string' && password.length >= 16, 'Set FE1B_REVIEW_PASSWORD (at least 16 characters) for the disposable review accounts');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  app.get(getBotToken()).stop = () => undefined;
  try {
    const auth = app.get(AdminAuthService);
    const service = app.get(ServiceRequestsService);
    const adminService = app.get(AdminService);
    const files = app.get(FilesService);
    assert.equal((await service.listForAdmin('all')).length, 0, 'Use an empty isolated test DB');
    const admin = await auth.createStaff({ login: 'fe1b-review', displayName: 'Анна · демо-оператор', roles: ['superadmin'], password });
    const engineer = await auth.createStaff({ login: 'fe1b-engineer', displayName: 'Михаил · демо-инженер', roles: ['engineer'], password });
    await auth.createStaff({ login: 'fe1b-sales', displayName: 'Демо-менеджер', roles: ['sales_manager'], password });
    await auth.createStaff({ login: 'fe1b-empty', displayName: 'Демо-инженер без назначений', roles: ['engineer'], password });
    await auth.createStaff({ login: 'fe1b-operator', displayName: 'Демо-оператор', roles: ['operator'], password });
    const names = ['Тестовая мастерская «Контур»', 'Демо-магазин «Северная точка»', 'Демонстрационная организация с очень длинным наименованием для проверки интерфейса на небольшом экране', 'Демо-студия «Форма»'];
    const ids = [];
    for (let index = 0; index < 35; index++) {
      const data = await service.createManual(admin.id, {
        serviceTypeCode: index % 2 ? 'firmware_update' : 'kkt_remote_work',
        source: index % 2 ? 'phone' : 'admin', initialStatus: 'submitted',
        contactSnapshot: { name: `Демо-клиент ${index + 1}`, phone: '+7 (000) 000-00-00', email: 'client@example.test', preferredChannel: 'phone' },
        organizationSnapshot: { name: names[index % names.length], inn: '0000000000' },
        equipmentSnapshot: { model: 'АТОЛ 30Ф', serialNumber: `DEMO-KKT-${index + 1}` },
        locationSnapshot: { address: 'Демонстрационный адрес, помещение 1' },
        answers: {},
      });
      const id = data.request.id;
      ids.push(id);
      await service.updateOperatorState(id, { priority: index % 4 === 0 ? 'urgent' : index % 4 === 1 ? 'high' : 'normal' }, admin.id);
      if (index % 4 === 0) await service.transitionByStaff(admin.id, id, 'clarification_required');
      if (index % 4 === 1) {
        await service.transitionByStaff(admin.id, id, 'in_progress');
        if (index > 5) await service.transitionByStaff(admin.id, id, 'completed');
      }
    }
    const identity = { chatId: '990000000001', platform: 'max', name: 'ООО «Демо. Кассовые решения»' };
    const { request: payment } = await service.start(identity, 'fn_replacement');
    for (const value of ['0000000000', 'DEMO-KKT-00014', '15', '+7 (000) 000-00-00']) await service.answer(identity, payment.id, value);
    await service.confirmPrice(identity, payment.id);
    await service.updateOperatorState(payment.id, { priority: 'high', operatorComment: 'Проверить поступление средств перед согласованием визита.' }, admin.id);
    await adminService.assignEngineer(payment.id, engineer.id, admin.id);
    const invoice = await files.saveBuffer({ purpose: 'service-invoice', buffer: await pdf('Invoice. Demo FN replacement. 15900 RUB. Not for payment.'), originalName: 'Счёт-DEMO-014.pdf', mimeType: 'application/pdf', createdByStaffId: admin.id });
    await service.attachInvoice(payment.id, invoice.id, admin.id);
    await service.attachPaymentProof(identity, { buffer: await pdf('Payment proof. Synthetic example. No real payment.'), fileName: 'Платёжное-поручение-DEMO-014.pdf', mimeType: 'application/pdf' });
    await service.addStaffMessage(admin.id, payment.id, 'Счёт подготовлен. После оплаты приложите платёжное поручение.', 'customer');
    await service.addStaffMessage(admin.id, payment.id, 'Перед выездом связаться с контактным лицом.', 'internal');
    console.log(JSON.stringify({ paymentRequestId: payment.id, requests: ids.length + 1, login: admin.login, synthetic: true }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
