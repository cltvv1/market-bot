const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { NestFactory } = require('@nestjs/core');
const { getBotToken } = require('nestjs-telegraf');
const { DataSource } = require('typeorm');
const PDFDocument = require('pdfkit');
const { AppModule } = require('../../../src/app.module');
const { ServiceRequestsService } = require('../../../src/service-requests/service-requests.service');
const { ServiceRequestEntity } = require('../../../src/service-requests/entities/service-request.entity');
const { RegistrationRequestEntity } = require('../../../src/registrations/entities/registration.entity');
const { AdminUserEntity } = require('../../../src/admin/entities/admin-user.entity');
const { FilesService } = require('../../../src/files/files.service');

async function main() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.TEST_DB_NAME, 'vitma_fe1b_review_test');
  assert.equal(process.env.TEST_DB_HOST, '127.0.0.1');
  assert.equal(process.env.TEST_DB_PORT, '55437');
  assert.equal(process.env.BOT_POLLING_ENABLED, 'false');
  assert.equal(process.env.OUTBOUND_DELIVERY_WORKER_ENABLED, 'false');
  assert.equal(process.env.MAX_BOT_TOKEN || '', '');
  assert.equal(path.basename(process.env.FILE_STORAGE_ROOT || ''), 'vitma-fe1b-review-storage');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  app.get(getBotToken()).stop = () => undefined;
  try {
    const db = app.get(DataSource);
    const service = app.get(ServiceRequestsService);
    const files = app.get(FilesService);
    const staff = await db.getRepository(AdminUserEntity).findOneByOrFail({ login: 'fe1b-review' });
    const engineer = await db.getRepository(AdminUserEntity).findOneByOrFail({ login: 'fe1b-engineer' });
    const registrations = db.getRepository(RegistrationRequestEntity);
    if (!(await registrations.findOneBy({ chatId: 'fe1b-legacy-demo' }))) {
      await registrations.save(registrations.create({ chatId: 'fe1b-legacy-demo', platform: 'web', orgName: 'ООО «Демонстрационная регистрация»', status: 'new', innKpp: '0000000000', phone: '+7 (000) 000-00-00', email: 'demo@example.test', taxSystem: 'УСН', kktModel: 'АТОЛ 30Ф', priority: 'high' }));
    }
    const doc = new PDFDocument();
    const chunks = [];
    const complete = new Promise((resolve, reject) => { doc.on('data', data => chunks.push(data)); doc.on('end', resolve); doc.on('error', reject); });
    doc.text('FE-1B SYNTHETIC INVOICE. NOT FOR PAYMENT.');
    doc.end();
    await complete;
    const buffer = Buffer.concat(chunks);
    const invoicePath = path.join(os.tmpdir(), 'vitma-fe1b-browser-invoice.pdf');
    await fs.writeFile(invoicePath, buffer);
    const requests = db.getRepository(ServiceRequestEntity);
    const marker = 'FE-1B extended synthetic fixture';
    const alreadyExtended = await requests.findOneBy({ operatorComment: marker });
    const result = [];
    for (const status of ['review_required', 'invoice_required', 'waiting_payment', 'paid', 'scheduled', 'in_progress', 'closed', 'cancelled']) {
      if (alreadyExtended) break;
      const { request } = await service.createManual(staff.id, { serviceTypeCode: 'fn_replacement', source: 'admin', initialStatus: 'submitted', contactSnapshot: { name: `Демо: ${status}`, phone: '+7 (000) 000-00-00' }, answers: {} });
      await requests.update(request.id, { status, operatorComment: marker, assignedEngineerId: engineer.id, priority: 'high' });
      result.push({ id: request.id, status });
    }
    const { request } = await service.createManual(staff.id, { serviceTypeCode: 'firmware_update', source: 'admin', initialStatus: 'submitted', contactSnapshot: { name: 'Демо: недоступный файл', phone: '+7 (000) 000-00-00' }, answers: {} });
    const unavailable = await files.saveBuffer({ purpose: 'service-invoice', buffer, originalName: 'Недоступный-демо-счёт.pdf', mimeType: 'application/pdf', createdByStaffId: staff.id });
    await requests.update(request.id, { status: 'invoice_required' });
    await service.attachInvoice(request.id, unavailable.id, staff.id);
    await files.logicalDelete(unavailable.id);
    const identity = { chatId: '990000000002', platform: 'max', name: 'Демо: полный путь оплаты' };
    const { request: payment } = await service.start(identity, 'fn_replacement');
    for (const answer of ['0000000000', 'DEMO-FE1B-TEST', '15', '+7 (000) 000-00-00']) await service.answer(identity, payment.id, answer);
    await service.confirmPrice(identity, payment.id);
    await requests.update(payment.id, { assignedEngineerId: engineer.id, responsibleOperatorStaffId: staff.id });
    const invoice = await files.saveBuffer({ purpose: 'service-invoice', buffer, originalName: 'Демо-счёт.pdf', mimeType: 'application/pdf', createdByStaffId: staff.id });
    await service.attachInvoice(payment.id, invoice.id, staff.id);
    await service.attachPaymentProof(identity, { buffer, fileName: 'Демо-платёжка.pdf', mimeType: 'application/pdf' });
    console.log(JSON.stringify({ synthetic: true, requests: result, paymentWorkflowId: payment.id, unavailableRequestId: request.id, invoicePath }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
