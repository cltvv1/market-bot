/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import * as fs from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import type { AdminRole } from '../src/admin/entities/admin-user-role.entity';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { configureApplication } from '../src/app.bootstrap';
import { AppModule } from '../src/app.module';
import { CatalogCategoryEntity } from '../src/catalog/entities/catalog-category.entity';
import { CatalogProductEntity } from '../src/catalog/entities/catalog-product.entity';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { FileLifecycleService } from '../src/files/file-lifecycle.service';
import { StoredFileReferenceInspector } from '../src/files/stored-file-reference-inspector';
import { OrderDocumentEntity } from '../src/orders/entities/order-document.entity';
import { OrderEventEntity } from '../src/orders/entities/order-event.entity';
import { OrderEntity } from '../src/orders/entities/order.entity';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { CustomerWebSessionEntity } from '../src/web-session/entities/customer-web-session.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';
const PDF = Buffer.from('%PDF-1.7\nsynthetic invoice');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);

interface Browser {
    agent: ReturnType<typeof request.agent>;
    userId: number;
    ip: string;
}

describe('CO-3B invoice and payment workflow on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let references: StoredFileReferenceInspector;
    let lifecycle: FileLifecycleService;
    let ipCounter = 30;
    let keyCounter = 0;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        dataSource = app.get(DataSource);
        auth = app.get(AdminAuthService);
        references = app.get(StoredFileReferenceInspector);
        lifecycle = app.get(FileLifecycleService);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
               AND table_name <> 'typeorm_migrations' ORDER BY table_name`,
        );
        await dataSource.query(
            `TRUNCATE TABLE ${tables
                .map(
                    ({ table_name }) =>
                        `"public"."${table_name.replaceAll('"', '""')}"`,
                )
                .join(', ')} RESTART IDENTITY CASCADE`,
        );
        fs.rmSync(process.env.FILE_STORAGE_ROOT as string, {
            recursive: true,
            force: true,
        });
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    function nextIp() {
        ipCounter += 1;
        return `10.94.0.${ipCounter}`;
    }

    function nextKey() {
        keyCounter += 1;
        return `20000000-0000-4000-8000-${String(keyCounter).padStart(12, '0')}`;
    }

    async function browser(): Promise<Browser> {
        const agent = request.agent(app.getHttpServer());
        const ip = nextIp();
        await agent
            .post('/api/client/session')
            .set('X-Forwarded-For', ip)
            .send({})
            .expect(201);
        const [session] = await dataSource
            .getRepository(CustomerWebSessionEntity)
            .find({ order: { id: 'DESC' }, take: 1 });
        if (!session) throw new Error('Web session fixture was not created');
        return { agent, userId: session.userId, ip };
    }

    async function staff(login: string, roles: AdminRole[]) {
        const user = await auth.createStaff({
            login,
            displayName: login,
            password: PASSWORD,
            roles,
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login, password: PASSWORD })
            .expect(201);
        return { user, agent };
    }

    async function product() {
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
        const categories = dataSource.getRepository(CatalogCategoryEntity);
        const category = await categories.save(
            categories.create({
                parentId: null,
                name: `Category ${suffix}`,
                slug: `category-${suffix}`,
                description: null,
                sortOrder: 0,
                isPublished: true,
                oneCRef: null,
            }),
        );
        const products = dataSource.getRepository(CatalogProductEntity);
        return products.save(
            products.create({
                categoryId: category.id,
                sku: `CO3B-${suffix}`,
                slug: `co3b-${suffix}`,
                name: `Product ${suffix}`,
                brand: 'VITMA',
                shortDescription: null,
                description: null,
                displayPriceMinor: 3_100_000,
                vatRate: 2000,
                availabilityStatus: 'in_stock',
                features: [],
                specifications: {},
                packageContents: [],
                isActive: true,
                isPublished: true,
                isPopular: false,
                isNew: false,
                oneCRef: null,
                oneCSyncedAt: null,
            }),
        );
    }

    async function confirmedOrder(login: string) {
        const client = await browser();
        const item = await product();
        const manager = await staff(login, ['sales_manager']);
        const created = await client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', nextKey())
            .send({
                customerType: 'individual',
                contact: {
                    name: 'Test Customer',
                    phone: '+7 999 123-45-67',
                    email: 'buyer@example.com',
                },
                delivery: { type: 'pickup' },
                items: [{ productId: item.id, quantity: 2 }],
            })
            .expect(201);
        await manager.agent
            .post(`/admin/api/orders/${created.body.id}/start-review`)
            .set('Origin', ORIGIN)
            .send({ expectedVersion: 1 })
            .expect(201);
        const confirmed = await manager.agent
            .post(`/admin/api/orders/${created.body.id}/confirm`)
            .set('Origin', ORIGIN)
            .send({ expectedVersion: 2 })
            .expect(201);
        return {
            client,
            manager,
            orderId: created.body.id as number,
            version: confirmed.body.version as number,
        };
    }

    function uploadInvoice(
        agent: ReturnType<typeof request.agent>,
        orderId: number,
        version: number,
        name = 'invoice.pdf',
    ) {
        return agent
            .post(`/admin/api/orders/${orderId}/invoices`)
            .set('Origin', ORIGIN)
            .field('expectedVersion', String(version))
            .attach('file', PDF, {
                filename: name,
                contentType: 'application/pdf',
            });
    }

    function uploadProof(
        client: Browser,
        orderId: number,
        version: number,
        name = 'payment.jpg',
    ) {
        return client.agent
            .post(`/api/client/orders/${orderId}/payment-proofs`)
            .set('X-Forwarded-For', client.ip)
            .set('Origin', ORIGIN)
            .field('expectedVersion', String(version))
            .attach('file', JPEG, {
                filename: name,
                contentType: 'image/jpeg',
            });
    }

    it('creates the document and payment schema with authoritative constraints', async () => {
        const columns: Array<{ column_name: string }> = await dataSource.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'orders'
               AND column_name IN ('invoiceIssuedAt','paymentReceivedAt','paymentConfirmedAt',
                   'paymentConfirmedByStaffId','paymentConfirmationSource','paymentConfirmationComment')`,
        );
        expect(columns).toHaveLength(6);
        const constraints: Array<{ conname: string; definition: string }> =
            await dataSource.query(
                `SELECT conname, pg_get_constraintdef(oid) AS definition
                 FROM pg_constraint
                 WHERE conrelid IN ('orders'::regclass,'order_documents'::regclass,'order_events'::regclass)`,
            );
        const definitions = new Map(
            constraints.map((item) => [item.conname, item.definition]),
        );
        expect(definitions.get('CK_order_documents_actor_shape')).toContain(
            'uploadedByStaffId',
        );
        expect(
            definitions.get('CK_order_documents_commercial_shape'),
        ).toContain('quoteRevisionSnapshot');
        expect(definitions.get('CK_order_events_type')).toContain(
            'invoice_replaced',
        );
        const indexes: Array<{ indexname: string; indexdef: string }> =
            await dataSource.query(
                `SELECT indexname, indexdef FROM pg_indexes
                 WHERE schemaname = 'public' AND tablename = 'order_documents'`,
            );
        expect(
            indexes.find(
                (index) =>
                    index.indexname === 'UQ_order_documents_active_invoice',
            )?.indexdef,
        ).toContain("(type)::text = 'invoice'::text");
        expect(
            indexes.find(
                (index) =>
                    index.indexname === 'UQ_order_documents_active_invoice',
            )?.indexdef,
        ).toContain("(status)::text = 'active'::text");
    });

    it('issues the first invoice and exposes only context-bound safe projections', async () => {
        const fixture = await confirmedOrder('co3b-first');
        const issued = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            fixture.version,
            'Счёт 1.pdf',
        ).expect(201);
        expect(issued.body).toEqual(
            expect.objectContaining({
                status: 'waiting_payment',
                version: fixture.version + 1,
                invoiceRevision: 1,
                documents: expect.objectContaining({
                    invoices: [
                        expect.objectContaining({
                            type: 'invoice',
                            status: 'active',
                            revision: 1,
                            amountMinorSnapshot: '6200000',
                            currency: 'RUB',
                        }),
                    ],
                }),
            }),
        );
        const order = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        expect(order).toMatchObject({
            status: 'waiting_payment',
            version: fixture.version + 1,
            invoiceIssuedAt: expect.any(Date),
        });
        const document = await dataSource
            .getRepository(OrderDocumentEntity)
            .findOneOrFail({
                where: { orderId: fixture.orderId, type: 'invoice' },
                relations: { storedFile: true },
            });
        expect(document.storedFile).toMatchObject({
            status: 'active',
            createdByStaffId: fixture.manager.user.id,
            metadata: expect.objectContaining({
                purpose: 'order-invoice',
                orderId: fixture.orderId,
                orderDocumentId: document.id,
                orderDocumentType: 'invoice',
                documentRevision: 1,
            }),
        });
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'invoice_issued' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetType: 'order',
                    targetId: String(fixture.orderId),
                    action: 'order.invoice.issued',
                },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(OutboundDeliveryEntity).count(),
        ).toBe(0);

        const clientDetail = await fixture.client.agent
            .get(`/api/client/orders/${fixture.orderId}`)
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(200);
        expect(clientDetail.body.documents.currentInvoice).toEqual(
            expect.objectContaining({
                id: document.id,
                revision: 1,
                originalName: 'Счёт 1.pdf',
                downloadUrl: `/api/client/orders/${fixture.orderId}/documents/${document.id}/download`,
                available: true,
            }),
        );
        const serialized = JSON.stringify(clientDetail.body.documents);
        for (const forbidden of [
            'storedFileId',
            'objectKey',
            'createdByStaffId',
            'uploadedByStaffId',
            'metadata',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
        const download = await fixture.client.agent
            .get(
                `/api/client/orders/${fixture.orderId}/documents/${document.id}/download`,
            )
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(200);
        expect(download.headers['content-type']).toContain('application/pdf');
        expect(download.headers['content-length']).toBe(String(PDF.length));
        expect(download.headers['content-disposition']).toContain(
            'attachment;',
        );
        expect(download.headers['cache-control']).toBe('private, no-store');
        expect(download.headers['x-content-type-options']).toBe('nosniff');
        const foreign = await browser();
        await foreign.agent
            .get(
                `/api/client/orders/${fixture.orderId}/documents/${document.id}/download`,
            )
            .set('X-Forwarded-For', foreign.ip)
            .expect(404);
        await fixture.manager.agent
            .get(
                `/admin/api/orders/${fixture.orderId}/documents/${document.id}/download`,
            )
            .expect(200);
        await dataSource
            .getRepository(StoredFileEntity)
            .update(document.storedFileId, {
                metadata: {
                    ...document.storedFile.metadata,
                    orderDocumentId: document.id + 1,
                },
            });
        const mismatched = await fixture.client.agent
            .get(`/api/client/orders/${fixture.orderId}`)
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(200);
        expect(mismatched.body.documents.currentInvoice).toEqual(
            expect.objectContaining({ available: false, downloadUrl: null }),
        );
        await fixture.client.agent
            .get(
                `/api/client/orders/${fixture.orderId}/documents/${document.id}/download`,
            )
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(404);
    });

    it('replaces an invoice while preserving immutable history and lifecycle references', async () => {
        const fixture = await confirmedOrder('co3b-replace');
        const first = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            fixture.version,
            'invoice-1.pdf',
        ).expect(201);
        const issuedAt = (
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: fixture.orderId })
        ).invoiceIssuedAt;
        const replaced = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            Number(first.body.version),
            'invoice-2.pdf',
        ).expect(201);
        expect(replaced.body).toEqual(
            expect.objectContaining({
                status: 'waiting_payment',
                version: first.body.version + 1,
                invoiceRevision: 2,
            }),
        );
        const documents = await dataSource
            .getRepository(OrderDocumentEntity)
            .find({
                where: { orderId: fixture.orderId, type: 'invoice' },
                relations: { storedFile: true },
                order: { revision: 'ASC' },
            });
        expect(documents).toHaveLength(2);
        expect(documents[0]).toMatchObject({
            revision: 1,
            status: 'superseded',
            supersededAt: expect.any(Date),
        });
        expect(documents[1]).toMatchObject({
            revision: 2,
            status: 'active',
            supersededAt: null,
        });
        expect(documents[0].storedFile.status).toBe('active');
        expect(
            (
                await dataSource
                    .getRepository(OrderEntity)
                    .findOneByOrFail({ id: fixture.orderId })
            ).invoiceIssuedAt,
        ).toEqual(issuedAt);
        expect(
            (await references.findReferences(documents[0].storedFileId)).map(
                (reference) => `${reference.tableName}.${reference.columnName}`,
            ),
        ).toContain('order_documents.storedFileId');
        await fixture.client.agent
            .get(
                `/api/client/orders/${fixture.orderId}/documents/${documents[0].id}/download`,
            )
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(404);
        await fixture.manager.agent
            .get(
                `/admin/api/orders/${fixture.orderId}/documents/${documents[0].id}/download`,
            )
            .expect(200);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'invoice_replaced' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.invoice.replaced',
                },
            }),
        ).toBe(1);
        await dataSource
            .getRepository(StoredFileEntity)
            .update(documents[0].storedFileId, {
                status: 'corrupt',
                corruptAt: new Date('2026-08-26T00:00:00.000Z'),
                purgeAfter: new Date('2026-08-27T00:00:00.000Z'),
            });
        const lifecycleReport = await lifecycle.reconcile({
            apply: true,
            now: new Date('2026-08-28T00:00:00.000Z'),
        });
        expect(lifecycleReport.blockedByReference).toContainEqual(
            expect.objectContaining({ fileId: documents[0].storedFileId }),
        );
        expect(
            (
                await dataSource
                    .getRepository(StoredFileEntity)
                    .findOneByOrFail({ id: documents[0].storedFileId })
            ).purgedAt,
        ).toBeNull();
        expect(
            fs.existsSync(
                `${process.env.FILE_STORAGE_ROOT}/${documents[0].storedFile.objectKey}`,
            ),
        ).toBe(true);
    });

    it('accepts multiple payment proofs without marking the order paid', async () => {
        const fixture = await confirmedOrder('co3b-proof');
        const invoiced = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            fixture.version,
        ).expect(201);
        const first = await uploadProof(
            fixture.client,
            fixture.orderId,
            Number(invoiced.body.version),
            'proof-1.jpg',
        ).expect(201);
        const second = await uploadProof(
            fixture.client,
            fixture.orderId,
            Number(first.body.version),
            'proof-2.jpg',
        ).expect(201);
        expect(second.body).toEqual(
            expect.objectContaining({
                status: 'waiting_payment',
                version: first.body.version + 1,
                payment: null,
                documents: expect.objectContaining({
                    paymentProofs: [
                        expect.objectContaining({ revision: 1 }),
                        expect.objectContaining({ revision: 2 }),
                    ],
                }),
            }),
        );
        const proofs = await dataSource
            .getRepository(OrderDocumentEntity)
            .find({
                where: {
                    orderId: fixture.orderId,
                    type: 'payment_proof',
                },
                relations: { storedFile: true },
                order: { revision: 'ASC' },
            });
        expect(proofs).toHaveLength(2);
        expect(proofs.every((proof) => proof.status === 'active')).toBe(true);
        expect(
            proofs.every(
                (proof) =>
                    proof.storedFile.createdByCustomerId ===
                    fixture.client.userId,
            ),
        ).toBe(true);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: {
                    orderId: fixture.orderId,
                    type: 'payment_proof_received',
                },
            }),
        ).toBe(2);
        const proofDownload = await fixture.client.agent
            .get(
                `/api/client/orders/${fixture.orderId}/documents/${proofs[0].id}/download`,
            )
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(200);
        expect(proofDownload.headers['content-type']).toContain('image/jpeg');
        await fixture.manager.agent
            .get(
                `/admin/api/orders/${fixture.orderId}/documents/${proofs[0].id}/download`,
            )
            .expect(200);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.payment_proof.uploaded',
                },
            }),
        ).toBe(2);
        expect(
            await dataSource.getRepository(OutboundDeliveryEntity).count(),
        ).toBe(0);
    });

    it('confirms payment manually without requiring a proof or physical invoice bytes', async () => {
        const fixture = await confirmedOrder('co3b-payment');
        const invoiced = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            fixture.version,
        ).expect(201);
        const document = await dataSource
            .getRepository(OrderDocumentEntity)
            .findOneOrFail({
                where: { orderId: fixture.orderId, type: 'invoice' },
                relations: { storedFile: true },
            });
        const fullPath = `${process.env.FILE_STORAGE_ROOT}/${document.storedFile.objectKey}`;
        fs.rmSync(fullPath, { force: true });
        const receivedAt = '2026-08-27T05:00:00.000Z';
        const paid = await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: invoiced.body.version,
                source: 'bank_statement',
                paymentReceivedAt: receivedAt,
                comment: '  Bank credit confirmed  ',
            })
            .expect(201);
        expect(paid.body).toEqual(
            expect.objectContaining({
                status: 'paid',
                version: invoiced.body.version + 1,
                paymentConfirmation: expect.objectContaining({
                    receivedAt,
                    source: 'bank_statement',
                    comment: 'Bank credit confirmed',
                    confirmedByStaff: expect.objectContaining({
                        id: fixture.manager.user.id,
                    }),
                }),
            }),
        );
        const clientDetail = await fixture.client.agent
            .get(`/api/client/orders/${fixture.orderId}`)
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(200);
        expect(clientDetail.body.payment).toEqual(
            expect.objectContaining({ receivedAt }),
        );
        expect(JSON.stringify(clientDetail.body)).not.toContain(
            'bank_statement',
        );
        expect(JSON.stringify(clientDetail.body)).not.toContain(
            'Bank credit confirmed',
        );
        await fixture.client.agent
            .get(
                `/api/client/orders/${fixture.orderId}/documents/${document.id}/download`,
            )
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(404);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'payment_confirmed' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.payment.confirmed',
                },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(OutboundDeliveryEntity).count(),
        ).toBe(0);
    });

    it('requires an absolute payment timestamp without mutating rejected commands', async () => {
        const fixture = await confirmedOrder('co3b-absolute-payment-time');
        const invoiced = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            fixture.version,
        ).expect(201);
        const orderBefore = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        const documentsBefore = await dataSource
            .getRepository(OrderDocumentEntity)
            .find({
                where: { orderId: fixture.orderId },
                order: { id: 'ASC' },
            });
        const quoteBefore: unknown[] = await dataSource.query(
            `SELECT * FROM "order_quotes" WHERE "orderId" = $1`,
            [fixture.orderId],
        );

        for (const paymentReceivedAt of ['2026-08-27', '2026-08-27T05:00:00']) {
            await fixture.manager.agent
                .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
                .set('Origin', ORIGIN)
                .send({
                    expectedVersion: invoiced.body.version,
                    source: 'bank_statement',
                    paymentReceivedAt,
                })
                .expect(400);
        }

        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: fixture.orderId }),
        ).toMatchObject({
            status: 'waiting_payment',
            version: orderBefore.version,
            paymentReceivedAt: null,
            paymentConfirmedAt: null,
            paymentConfirmedByStaffId: null,
            paymentConfirmationSource: null,
            paymentConfirmationComment: null,
        });
        expect(
            await dataSource.getRepository(OrderDocumentEntity).find({
                where: { orderId: fixture.orderId },
                order: { id: 'ASC' },
            }),
        ).toEqual(documentsBefore);
        expect(
            await dataSource.query(
                `SELECT * FROM "order_quotes" WHERE "orderId" = $1`,
                [fixture.orderId],
            ),
        ).toEqual(quoteBefore);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'payment_confirmed' },
            }),
        ).toBe(0);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.payment.confirmed',
                },
            }),
        ).toBe(0);

        const paid = await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: invoiced.body.version,
                source: 'bank_statement',
                paymentReceivedAt: '2026-08-27T12:00:00+07:00',
            })
            .expect(201);
        expect(paid.body.paymentConfirmation.receivedAt).toBe(
            '2026-08-27T05:00:00.000Z',
        );
        expect(
            (
                await dataSource
                    .getRepository(OrderEntity)
                    .findOneByOrFail({ id: fixture.orderId })
            ).paymentReceivedAt,
        ).toEqual(new Date('2026-08-27T05:00:00.000Z'));
    });

    it('denies RBAC, assignment, ownership, origin, and invalid content before attachment', async () => {
        const fixture = await confirmedOrder('co3b-security');
        const otherManager = await staff('co3b-other-manager', [
            'sales_manager',
        ]);
        const operator = await staff('co3b-operator', ['operator']);
        const files = dataSource.getRepository(StoredFileEntity);

        await uploadInvoice(
            otherManager.agent,
            fixture.orderId,
            fixture.version,
        ).expect(409);
        await uploadInvoice(
            operator.agent,
            fixture.orderId,
            fixture.version,
        ).expect(403);
        expect(await files.count()).toBe(0);
        await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/invoices`)
            .set('Origin', 'https://attacker.example')
            .field('expectedVersion', String(fixture.version))
            .attach('file', PDF, {
                filename: 'invoice.pdf',
                contentType: 'application/pdf',
            })
            .expect(403);
        expect(await files.count()).toBe(0);
        await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/invoices`)
            .set('Origin', ORIGIN)
            .field('expectedVersion', String(fixture.version))
            .attach('file', Buffer.from('not a pdf'), {
                filename: 'invoice.pdf',
                contentType: 'application/pdf',
            })
            .expect(400);
        expect(await files.count()).toBe(0);

        const invoiced = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            fixture.version,
        ).expect(201);
        await operator.agent
            .get(
                `/admin/api/orders/${fixture.orderId}/documents/${invoiced.body.documents.invoices[0].id}/download`,
            )
            .expect(403);
        await otherManager.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: invoiced.body.version,
                source: 'bank_statement',
            })
            .expect(409);
        await operator.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: invoiced.body.version,
                source: 'bank_statement',
            })
            .expect(403);
        await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: invoiced.body.version,
                source: 'invented_source',
            })
            .expect(400);
        const foreign = await browser();
        const countBeforeForeignProof = await files.count();
        await uploadProof(
            foreign,
            fixture.orderId,
            Number(invoiced.body.version),
        ).expect(404);
        expect(await files.count()).toBe(countBeforeForeignProof);
        await request(app.getHttpServer())
            .get(`/admin/api/orders/${fixture.orderId}`)
            .expect(401);
    });

    it('serializes concurrent invoices and rejects the losing pending file', async () => {
        const fixture = await confirmedOrder('co3b-race');
        const results = await Promise.all([
            uploadInvoice(
                fixture.manager.agent,
                fixture.orderId,
                fixture.version,
                'race-a.pdf',
            ),
            uploadInvoice(
                fixture.manager.agent,
                fixture.orderId,
                fixture.version,
                'race-b.pdf',
            ),
        ]);
        expect(results.map((result) => result.status).sort()).toEqual([
            201, 409,
        ]);
        expect(
            await dataSource.getRepository(OrderDocumentEntity).count({
                where: {
                    orderId: fixture.orderId,
                    type: 'invoice',
                    status: 'active',
                },
            }),
        ).toBe(1);
        const stored = await dataSource.getRepository(StoredFileEntity).find({
            order: { id: 'ASC' },
        });
        expect(stored.map((file) => file.status).sort()).toEqual([
            'active',
            'rejected',
        ]);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'invoice_issued' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.invoice.issued',
                },
            }),
        ).toBe(1);
    });

    it('rolls back invoice attachment and rejects pending storage when audit fails', async () => {
        const fixture = await confirmedOrder('co3b-rollback');
        await dataSource.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "CK_test_reject_order_invoice"
             CHECK ("action" <> 'order.invoice.issued') NOT VALID`,
        );
        try {
            await uploadInvoice(
                fixture.manager.agent,
                fixture.orderId,
                fixture.version,
            ).expect(409);
        } finally {
            await dataSource.query(
                `ALTER TABLE "audit_events" DROP CONSTRAINT "CK_test_reject_order_invoice"`,
            );
        }
        expect(
            await dataSource.getRepository(OrderDocumentEntity).count(),
        ).toBe(0);
        expect(
            await dataSource
                .getRepository(StoredFileEntity)
                .findOneByOrFail({ id: 1 }),
        ).toMatchObject({ status: 'rejected' });
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: fixture.orderId }),
        ).toMatchObject({ status: 'confirmed', version: fixture.version });
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'invoice_issued' },
            }),
        ).toBe(0);
    });

    it('rejects stale or impossible payment transitions without side effects', async () => {
        const fixture = await confirmedOrder('co3b-invalid-payment');
        await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: fixture.version,
                source: 'bank_statement',
            })
            .expect(409);
        const invoiced = await uploadInvoice(
            fixture.manager.agent,
            fixture.orderId,
            fixture.version,
        ).expect(201);
        await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: fixture.version,
                source: 'bank_statement',
            })
            .expect(409);
        await fixture.manager.agent
            .post(`/admin/api/orders/${fixture.orderId}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: invoiced.body.version,
                source: 'bank_statement',
                paymentReceivedAt: '2999-01-01T00:00:00.000Z',
            })
            .expect(400);
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: fixture.orderId }),
        ).toMatchObject({
            status: 'waiting_payment',
            version: invoiced.body.version,
            paymentConfirmedAt: null,
        });
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'payment_confirmed' },
            }),
        ).toBe(0);
    });

    it('replays the original CO-2 submission without changing paid state', async () => {
        const client = await browser();
        const item = await product();
        const manager = await staff('co3b-replay', ['sales_manager']);
        const key = nextKey();
        const body = {
            customerType: 'individual',
            contact: {
                name: 'Replay Customer',
                phone: '+7 999 000-00-01',
                email: 'replay@example.com',
            },
            delivery: { type: 'pickup' },
            items: [{ productId: item.id, quantity: 1 }],
        };
        const created = await client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', key)
            .send(body)
            .expect(201);
        await manager.agent
            .post(`/admin/api/orders/${created.body.id}/start-review`)
            .set('Origin', ORIGIN)
            .send({ expectedVersion: 1 })
            .expect(201);
        await manager.agent
            .post(`/admin/api/orders/${created.body.id}/confirm`)
            .set('Origin', ORIGIN)
            .send({ expectedVersion: 2 })
            .expect(201);
        const invoiced = await uploadInvoice(
            manager.agent,
            Number(created.body.id),
            3,
        ).expect(201);
        const paid = await manager.agent
            .post(`/admin/api/orders/${created.body.id}/confirm-payment`)
            .set('Origin', ORIGIN)
            .send({
                expectedVersion: invoiced.body.version,
                source: 'customer_confirmation',
            })
            .expect(201);
        const eventCount = await dataSource
            .getRepository(OrderEventEntity)
            .count({ where: { orderId: created.body.id } });
        const replay = await client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', key)
            .send(body)
            .expect(201);
        expect(replay.body).toEqual(
            expect.objectContaining({
                id: created.body.id,
                status: 'paid',
                version: paid.body.version,
                documents: expect.objectContaining({
                    currentInvoice: expect.objectContaining({ revision: 1 }),
                }),
                payment: expect.objectContaining({
                    confirmedAt: expect.any(String),
                }),
            }),
        );
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(1);
        expect(
            await dataSource.getRepository(OrderDocumentEntity).count(),
        ).toBe(1);
        expect(
            await dataSource
                .getRepository(OrderEventEntity)
                .count({ where: { orderId: created.body.id } }),
        ).toBe(eventCount);
    });
});
