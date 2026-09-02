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
import { OrderDocumentEntity } from '../src/orders/entities/order-document.entity';
import { OrderEventEntity } from '../src/orders/entities/order-event.entity';
import { OrderEntity } from '../src/orders/entities/order.entity';
import { OrderQuoteEntity } from '../src/orders/entities/order-quote.entity';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { CustomerWebSessionEntity } from '../src/web-session/entities/customer-web-session.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';
const PDF = Buffer.from('%PDF-1.7\nsynthetic CO-3C invoice');

interface Browser {
    agent: ReturnType<typeof request.agent>;
    userId: number;
    ip: string;
}

interface PaidFixture {
    client: Browser;
    manager: Awaited<ReturnType<typeof staffFixture>>;
    orderId: number;
    version: number;
    submissionKey: string;
    submissionBody: Record<string, unknown>;
}

let staffFixture: (
    login: string,
    roles: AdminRole[],
) => Promise<{
    user: Awaited<ReturnType<AdminAuthService['createStaff']>>;
    agent: ReturnType<typeof request.agent>;
}>;

describe('CO-3C fulfillment and completion on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let ipCounter = 80;
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
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
        staffFixture = async (login, roles) => {
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
        };
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
        return `10.95.0.${ipCounter}`;
    }

    function nextKey() {
        keyCounter += 1;
        return `30000000-0000-4000-8000-${String(keyCounter).padStart(12, '0')}`;
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
                sku: `CO3C-${suffix}`,
                slug: `co3c-${suffix}`,
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

    async function paidOrder(
        login: string,
        options: {
            customerType?: 'individual' | 'organization';
            deliveryType?: 'pickup' | 'courier' | 'transport_company';
        } = {},
    ): Promise<PaidFixture> {
        const client = await browser();
        const item = await product();
        const manager = await staffFixture(login, ['sales_manager']);
        const customerType = options.customerType ?? 'individual';
        const deliveryType = options.deliveryType ?? 'pickup';
        const submissionKey = nextKey();
        const submissionBody: Record<string, unknown> = {
            customerType,
            ...(customerType === 'organization'
                ? {
                      organization: {
                          name: 'VITMA Test LLC',
                          inn: '7701234567',
                      },
                  }
                : {}),
            contact: {
                name: 'Test Customer',
                phone: '+7 999 123-45-67',
                email: 'buyer@example.com',
            },
            delivery:
                deliveryType === 'pickup'
                    ? { type: deliveryType }
                    : {
                          type: deliveryType,
                          city: 'Krasnoyarsk',
                          ...(deliveryType === 'courier'
                              ? { address: 'Mira 1' }
                              : {}),
                      },
            items: [{ productId: item.id, quantity: 2 }],
        };
        const created = await client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', submissionKey)
            .send(submissionBody)
            .expect(201);
        const orderId = Number(created.body.id);
        await post(manager.agent, orderId, 'start-review', {
            expectedVersion: 1,
        }).expect(201);
        await post(manager.agent, orderId, 'confirm', {
            expectedVersion: 2,
        }).expect(201);
        const invoiced = await manager.agent
            .post(`/admin/api/orders/${orderId}/invoices`)
            .set('Origin', ORIGIN)
            .field('expectedVersion', '3')
            .attach('file', PDF, {
                filename: 'invoice.pdf',
                contentType: 'application/pdf',
            })
            .expect(201);
        const paymentReceivedAt = new Date(Date.now() - 60_000).toISOString();
        const paid = await post(manager.agent, orderId, 'confirm-payment', {
            expectedVersion: invoiced.body.version,
            source: 'bank_statement',
            paymentReceivedAt,
            comment: 'Internal bank check',
        }).expect(201);
        return {
            client,
            manager,
            orderId,
            version: paid.body.version,
            submissionKey,
            submissionBody,
        };
    }

    function post(
        agent: ReturnType<typeof request.agent>,
        orderId: number,
        command: string,
        body: Record<string, unknown>,
        origin = ORIGIN,
    ) {
        const call = agent
            .post(`/admin/api/orders/${orderId}/${command}`)
            .send(body);
        return origin ? call.set('Origin', origin) : call;
    }

    function fulfill(fixture: PaidFixture, body: Record<string, unknown> = {}) {
        return post(fixture.manager.agent, fixture.orderId, 'fulfill', {
            expectedVersion: fixture.version,
            method: 'pickup',
            ...body,
        });
    }

    it('creates append-only fulfillment/completion columns, checks, FKs, and indexes', async () => {
        const columns: Array<{ column_name: string }> = await dataSource.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'orders'
               AND column_name IN (
                 'fulfilledAt','fulfilledByStaffId','fulfillmentMethod',
                 'fulfillmentRecipientName','fulfillmentCarrierName',
                 'fulfillmentTrackingNumber','fulfillmentComment','completedAt',
                 'completedByStaffId','realizationNumber','realizationDate',
                 'finalDocumentsDeliveryMethod','finalDocumentKinds',
                 'finalDocumentsDeliveredAt','completionComment')`,
        );
        expect(columns).toHaveLength(15);
        const constraints: Array<{ conname: string }> = await dataSource.query(
            `SELECT conname FROM pg_constraint WHERE conrelid = 'orders'::regclass
               AND conname IN (
                 'CK_orders_fulfillment_method','CK_orders_fulfillment_shape',
                 'CK_orders_fulfillment_optional_strings','CK_orders_fulfillment_conditions',
                 'CK_orders_final_documents_delivery_method','CK_orders_final_document_kinds',
                 'CK_orders_completion_shape','CK_orders_completion_conditions',
                 'CK_orders_completion_other_comment','FK_orders_fulfilled_by_staff',
                 'FK_orders_completed_by_staff')`,
        );
        expect(constraints).toHaveLength(11);
        const indexes: Array<{ indexname: string }> = await dataSource.query(
            `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
               AND indexname IN ('IDX_orders_fulfilled_at','IDX_orders_completed_at',
                                 'IDX_orders_realization_number')`,
        );
        expect(indexes).toHaveLength(3);
    });

    it('fulfills and completes an organization order without changing commercial facts', async () => {
        const fixture = await paidOrder('co3c-happy', {
            customerType: 'organization',
            deliveryType: 'transport_company',
        });
        const before = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        const quoteBefore = await dataSource
            .getRepository(OrderQuoteEntity)
            .findOneByOrFail({ orderId: fixture.orderId });
        const documentsBefore = await dataSource
            .getRepository(OrderDocumentEntity)
            .find({ where: { orderId: fixture.orderId } });
        const outboundBefore = await dataSource
            .getRepository(OutboundDeliveryEntity)
            .count();

        const fulfilled = await fulfill(fixture, {
            method: 'transport_company',
            carrierName: 'Business Lines',
            trackingNumber: 'KRK-123456',
            comment: 'Transferred at the Krasnoyarsk terminal',
        }).expect(201);
        expect(fulfilled.body).toEqual(
            expect.objectContaining({
                status: 'fulfilled',
                version: fixture.version + 1,
                fulfillment: expect.objectContaining({
                    method: 'transport_company',
                    fulfilledByStaff: expect.objectContaining({
                        id: fixture.manager.user.id,
                    }),
                    carrierName: 'Business Lines',
                    trackingNumber: 'KRK-123456',
                }),
            }),
        );

        const completed = await post(
            fixture.manager.agent,
            fixture.orderId,
            'complete',
            {
                expectedVersion: fixture.version + 1,
                realizationNumber: '  РТУ-15/2026 ',
                realizationDate: '2026-08-28',
                documentDeliveryMethod: 'edo',
                documentKinds: ['act', 'upd'],
                comment: 'Sent through EDO',
            },
        ).expect(201);
        expect(completed.body).toEqual(
            expect.objectContaining({
                status: 'completed',
                version: fixture.version + 2,
                realizationNumber: 'РТУ-15/2026',
                completion: expect.objectContaining({
                    realizationNumber: 'РТУ-15/2026',
                    realizationDate: '2026-08-28',
                    documentDeliveryMethod: 'edo',
                    documentKinds: ['upd', 'act'],
                    completedByStaff: expect.objectContaining({
                        id: fixture.manager.user.id,
                    }),
                }),
            }),
        );

        const after = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        expect(after.paymentReceivedAt).toEqual(before.paymentReceivedAt);
        expect(after.paymentConfirmedAt).toEqual(before.paymentConfirmedAt);
        expect(after.invoiceIssuedAt).toEqual(before.invoiceIssuedAt);
        const quoteAfter = await dataSource
            .getRepository(OrderQuoteEntity)
            .findOneByOrFail({ orderId: fixture.orderId });
        expect(quoteAfter.revision).toBe(quoteBefore.revision);
        expect(quoteAfter.updatedAt).toEqual(quoteBefore.updatedAt);
        expect(
            await dataSource.getRepository(OrderDocumentEntity).find({
                where: { orderId: fixture.orderId },
            }),
        ).toEqual(documentsBefore);
        expect(
            await dataSource.getRepository(OutboundDeliveryEntity).count(),
        ).toBe(outboundBefore);

        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'fulfilled' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'completed' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.fulfilled',
                },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.completed',
                },
            }),
        ).toBe(1);

        const client = await fixture.client.agent
            .get(`/api/client/orders/${fixture.orderId}`)
            .set('X-Forwarded-For', fixture.client.ip)
            .expect(200);
        expect(client.body.fulfillment).toEqual(
            expect.objectContaining({
                method: 'transport_company',
                carrierName: 'Business Lines',
                trackingNumber: 'KRK-123456',
            }),
        );
        expect(client.body.fulfillment).not.toHaveProperty('comment');
        expect(client.body.fulfillment).not.toHaveProperty('fulfilledByStaff');
        expect(client.body.completion).toEqual(
            expect.objectContaining({
                realizationNumber: 'РТУ-15/2026',
                documentKinds: ['upd', 'act'],
            }),
        );
        expect(client.body.completion).not.toHaveProperty('comment');
        expect(client.body.completion).not.toHaveProperty('completedByStaff');

        const search = await fixture.manager.agent
            .get('/admin/api/orders')
            .query({ search: 'РТУ-15/2026', status: 'completed' })
            .expect(200);
        expect(search.body.items).toHaveLength(1);
        expect(search.body.items[0]).toEqual(
            expect.objectContaining({
                id: fixture.orderId,
                fulfilledAt: expect.any(String),
                completedAt: expect.any(String),
                realizationNumber: 'РТУ-15/2026',
            }),
        );
        await fulfill(
            { ...fixture, version: completed.body.version },
            {},
        ).expect(409);
        await post(fixture.manager.agent, fixture.orderId, 'complete', {
            expectedVersion: completed.body.version,
            realizationNumber: 'REPEAT-1',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo',
            documentKinds: ['upd'],
        }).expect(409);
    });

    it('enforces fulfillment methods, delivery changes, and absolute chronology', async () => {
        const fixture = await paidOrder('co3c-fulfillment-rules');
        await fulfill(fixture, { method: 'transport_company' }).expect(400);
        await fulfill(fixture, { method: 'service_only' }).expect(400);
        await fulfill(fixture, {
            method: 'service_only',
            comment: 'Service complete',
            carrierName: 'Unexpected carrier',
        }).expect(400);
        await fulfill(fixture, { method: 'courier' }).expect(400);
        await fulfill(fixture, {
            fulfilledAt: '2026-02-30T05:00:00Z',
        }).expect(400);

        const stored = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        await fulfill(fixture, {
            fulfilledAt: new Date(
                (stored.paymentReceivedAt as Date).getTime() - 1,
            ).toISOString(),
        }).expect(409);
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: fixture.orderId }),
        ).toMatchObject({
            status: 'paid',
            version: fixture.version,
            fulfilledAt: null,
        });

        await fulfill(fixture, {
            method: 'mixed',
            comment: 'Goods transferred and installation completed',
        }).expect(201);
    });

    it('rejects a zero-year fulfillment timestamp without side effects', async () => {
        const fixture = await paidOrder('co3c-zero-year-fulfillment');
        const before = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        const quoteBefore = await dataSource
            .getRepository(OrderQuoteEntity)
            .findOneByOrFail({ orderId: fixture.orderId });
        const documentsBefore = await dataSource
            .getRepository(OrderDocumentEntity)
            .find({
                where: { orderId: fixture.orderId },
                order: { id: 'ASC' },
            });

        await fulfill(fixture, {
            fulfilledAt: '0000-01-01T00:00:00Z',
        }).expect(400);

        const after = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        expect(after).toMatchObject({
            status: 'paid',
            version: fixture.version,
            fulfilledAt: null,
            fulfilledByStaffId: null,
            fulfillmentMethod: null,
            fulfillmentRecipientName: null,
            fulfillmentCarrierName: null,
            fulfillmentTrackingNumber: null,
            fulfillmentComment: null,
        });
        expect(after.paymentReceivedAt).toEqual(before.paymentReceivedAt);
        expect(after.paymentConfirmedAt).toEqual(before.paymentConfirmedAt);
        expect(after.invoiceIssuedAt).toEqual(before.invoiceIssuedAt);
        expect(
            await dataSource
                .getRepository(OrderQuoteEntity)
                .findOneByOrFail({ orderId: fixture.orderId }),
        ).toEqual(quoteBefore);
        expect(
            await dataSource.getRepository(OrderDocumentEntity).find({
                where: { orderId: fixture.orderId },
                order: { id: 'ASC' },
            }),
        ).toEqual(documentsBefore);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'fulfilled' },
            }),
        ).toBe(0);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.fulfilled',
                },
            }),
        ).toBe(0);
    });

    it('rejects zero-year completion dates and persists the year-one boundary', async () => {
        const fixture = await paidOrder('co3c-zero-year-completion');
        const fulfilledResponse = await fulfill(fixture).expect(201);
        const before = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        const quoteBefore = await dataSource
            .getRepository(OrderQuoteEntity)
            .findOneByOrFail({ orderId: fixture.orderId });
        const documentsBefore = await dataSource
            .getRepository(OrderDocumentEntity)
            .find({
                where: { orderId: fixture.orderId },
                order: { id: 'ASC' },
            });
        const base = {
            expectedVersion: fulfilledResponse.body.version as number,
            realizationNumber: 'R-0001',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo',
            documentKinds: ['upd'],
        };

        await post(fixture.manager.agent, fixture.orderId, 'complete', {
            ...base,
            realizationDate: '0000-01-01',
        }).expect(400);
        await post(fixture.manager.agent, fixture.orderId, 'complete', {
            ...base,
            documentsDeliveredAt: '0000-01-01T00:00:00Z',
        }).expect(400);

        const rejected = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        expect(rejected).toMatchObject({
            status: 'fulfilled',
            version: fulfilledResponse.body.version,
            completedAt: null,
            completedByStaffId: null,
            realizationNumber: null,
            realizationDate: null,
            finalDocumentsDeliveryMethod: null,
            finalDocumentKinds: null,
            finalDocumentsDeliveredAt: null,
            completionComment: null,
        });
        expect(rejected.paymentReceivedAt).toEqual(before.paymentReceivedAt);
        expect(rejected.paymentConfirmedAt).toEqual(before.paymentConfirmedAt);
        expect(rejected.invoiceIssuedAt).toEqual(before.invoiceIssuedAt);
        expect(rejected.fulfilledAt).toEqual(before.fulfilledAt);
        expect(rejected.fulfilledByStaffId).toBe(before.fulfilledByStaffId);
        expect(rejected.fulfillmentMethod).toBe(before.fulfillmentMethod);
        expect(
            await dataSource
                .getRepository(OrderQuoteEntity)
                .findOneByOrFail({ orderId: fixture.orderId }),
        ).toEqual(quoteBefore);
        expect(
            await dataSource.getRepository(OrderDocumentEntity).find({
                where: { orderId: fixture.orderId },
                order: { id: 'ASC' },
            }),
        ).toEqual(documentsBefore);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'completed' },
            }),
        ).toBe(0);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetId: String(fixture.orderId),
                    action: 'order.completed',
                },
            }),
        ).toBe(0);

        const completed = await post(
            fixture.manager.agent,
            fixture.orderId,
            'complete',
            { ...base, realizationDate: '0001-01-01' },
        ).expect(201);
        expect(completed.body.completion.realizationDate).toBe('0001-01-01');
        expect(
            (
                await dataSource
                    .getRepository(OrderEntity)
                    .findOneByOrFail({ id: fixture.orderId })
            ).realizationDate,
        ).toBe('0001-01-01');
    });

    it('validates realization and final-document rules including not-required', async () => {
        const individual = await paidOrder('co3c-not-required');
        const individualFulfilled = await fulfill(individual).expect(201);
        const version = individualFulfilled.body.version as number;
        const base = {
            expectedVersion: version,
            realizationNumber: '0000-000123',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo',
            documentKinds: ['upd'],
        };
        await post(individual.manager.agent, individual.orderId, 'complete', {
            ...base,
            realizationDate: '2026-02-30',
        }).expect(400);
        await post(individual.manager.agent, individual.orderId, 'complete', {
            ...base,
            documentKinds: ['upd', 'upd'],
        }).expect(400);
        await post(individual.manager.agent, individual.orderId, 'complete', {
            ...base,
            documentKinds: ['other'],
        }).expect(400);
        await post(individual.manager.agent, individual.orderId, 'complete', {
            ...base,
            documentDeliveryMethod: 'not_required',
            documentKinds: [],
        }).expect(400);
        const completed = await post(
            individual.manager.agent,
            individual.orderId,
            'complete',
            {
                ...base,
                documentDeliveryMethod: 'not_required',
                documentKinds: [],
                comment: 'Final documents are not applicable',
            },
        ).expect(201);
        expect(completed.body.completion).toMatchObject({
            realizationNumber: '0000-000123',
            documentDeliveryMethod: 'not_required',
            documentKinds: [],
            documentsDeliveredAt: null,
        });

        const organization = await paidOrder('co3c-org-not-required', {
            customerType: 'organization',
        });
        const orgFulfilled = await fulfill(organization).expect(201);
        await post(
            organization.manager.agent,
            organization.orderId,
            'complete',
            {
                expectedVersion: orgFulfilled.body.version,
                realizationNumber: 'ORG-1',
                realizationDate: '2026-08-28',
                documentDeliveryMethod: 'not_required',
                documentKinds: [],
                comment: 'Not applicable',
            },
        ).expect(409);
    });

    it('keeps authority assignment-based and supports phase-aware reassignment', async () => {
        const fixture = await paidOrder('co3c-old-manager');
        const root = await staffFixture('co3c-root', ['superadmin']);
        const next = await staffFixture('co3c-next-manager', ['sales_manager']);
        const operator = await staffFixture('co3c-operator', ['operator']);

        await fulfill(
            { ...fixture, manager: root },
            { expectedVersion: fixture.version },
        ).expect(409);
        await post(root.agent, fixture.orderId, 'assign', {
            expectedVersion: fixture.version,
            managerId: operator.user.id,
        }).expect(409);
        const reassigned = await post(root.agent, fixture.orderId, 'assign', {
            expectedVersion: fixture.version,
            managerId: next.user.id,
        }).expect(201);
        expect(reassigned.body).toMatchObject({
            status: 'paid',
            version: fixture.version + 1,
            assignedManager: { id: next.user.id },
        });
        await fulfill(fixture, {
            expectedVersion: fixture.version + 1,
        }).expect(409);
        const fulfilled = await fulfill(
            { ...fixture, manager: next, version: fixture.version + 1 },
            {},
        ).expect(201);

        const rootAssignment = await post(
            root.agent,
            fixture.orderId,
            'assign',
            {
                expectedVersion: fulfilled.body.version,
                managerId: root.user.id,
            },
        ).expect(201);
        await post(next.agent, fixture.orderId, 'complete', {
            expectedVersion: rootAssignment.body.version,
            realizationNumber: 'R-1',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'paper',
            documentKinds: ['act'],
        }).expect(409);
        const completed = await post(root.agent, fixture.orderId, 'complete', {
            expectedVersion: rootAssignment.body.version,
            realizationNumber: 'R-1',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'paper',
            documentKinds: ['act'],
        }).expect(201);
        await post(root.agent, fixture.orderId, 'assign', {
            expectedVersion: completed.body.version,
            managerId: next.user.id,
        }).expect(409);
    });

    it('enforces session, origin, current RBAC, IDs, assignment, and expectedVersion', async () => {
        const fixture = await paidOrder('co3c-security');
        const operator = await staffFixture('co3c-security-operator', [
            'operator',
        ]);
        await post(operator.agent, fixture.orderId, 'fulfill', {
            expectedVersion: fixture.version,
            method: 'pickup',
        }).expect(403);
        await post(
            fixture.manager.agent,
            fixture.orderId,
            'fulfill',
            { expectedVersion: fixture.version, method: 'pickup' },
            '',
        ).expect(403);
        await request(app.getHttpServer())
            .post(`/admin/api/orders/${fixture.orderId}/fulfill`)
            .set('Origin', ORIGIN)
            .send({ expectedVersion: fixture.version, method: 'pickup' })
            .expect(401);
        await post(fixture.manager.agent, 2_147_483_647, 'fulfill', {
            expectedVersion: fixture.version,
            method: 'pickup',
        }).expect(404);
        await fixture.manager.agent
            .post('/admin/api/orders/2147483648/fulfill')
            .set('Origin', ORIGIN)
            .send({ expectedVersion: fixture.version, method: 'pickup' })
            .expect(400);
        await fulfill(fixture, { expectedVersion: fixture.version - 1 }).expect(
            409,
        );

        await auth.setRoles(fixture.manager.user.id, ['operator']);
        await fulfill(fixture).expect(403);
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: fixture.orderId }),
        ).toMatchObject({ status: 'paid', version: fixture.version });
    });

    it('rejects invalid source states without mutation, events, or audit', async () => {
        const fixture = await paidOrder('co3c-state-matrix');
        const eventsBefore = await dataSource
            .getRepository(OrderEventEntity)
            .count({ where: { orderId: fixture.orderId } });
        const auditsBefore = await dataSource
            .getRepository(AuditEventEntity)
            .count({ where: { targetId: String(fixture.orderId) } });

        await post(fixture.manager.agent, fixture.orderId, 'complete', {
            expectedVersion: fixture.version,
            realizationNumber: 'INVALID-STATE',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo',
            documentKinds: ['upd'],
        }).expect(409);

        for (const status of [
            'submitted',
            'in_review',
            'confirmed',
            'waiting_payment',
            'fulfilled',
            'completed',
            'cancelled',
        ]) {
            await dataSource.query(
                `UPDATE "orders" SET "status" = $1 WHERE "id" = $2`,
                [status, fixture.orderId],
            );
            await fulfill(fixture).expect(409);
        }
        const after = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        expect(after.version).toBe(fixture.version);
        expect(after.fulfilledAt).toBeNull();
        expect(after.completedAt).toBeNull();
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId },
            }),
        ).toBe(eventsBefore);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: { targetId: String(fixture.orderId) },
            }),
        ).toBe(auditsBefore);
    });

    it('serializes concurrent fulfill and complete commands to one winner', async () => {
        const fixture = await paidOrder('co3c-concurrency');
        const fulfillmentResults = await Promise.all([
            fulfill(fixture),
            fulfill(fixture),
        ]);
        expect(fulfillmentResults.map((item) => item.status).sort()).toEqual([
            201, 409,
        ]);
        const fulfilled = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fixture.orderId });
        expect(fulfilled).toMatchObject({
            status: 'fulfilled',
            version: fixture.version + 1,
        });

        const body = {
            expectedVersion: fulfilled.version,
            realizationNumber: 'CONCURRENT-1',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo',
            documentKinds: ['upd'],
        };
        const completionResults = await Promise.all([
            post(fixture.manager.agent, fixture.orderId, 'complete', body),
            post(fixture.manager.agent, fixture.orderId, 'complete', body),
        ]);
        expect(completionResults.map((item) => item.status).sort()).toEqual([
            201, 409,
        ]);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'fulfilled' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'completed' },
            }),
        ).toBe(1);
    });

    it('serializes fulfill/complete against reassignment without mixed authority', async () => {
        const fulfillRace = await paidOrder('co3c-fulfill-reassign-race');
        const fulfillTarget = await staffFixture('co3c-fulfill-race-target', [
            'sales_manager',
        ]);
        const fulfillResults = await Promise.all([
            fulfill(fulfillRace),
            post(fulfillRace.manager.agent, fulfillRace.orderId, 'assign', {
                expectedVersion: fulfillRace.version,
                managerId: fulfillTarget.user.id,
            }),
        ]);
        expect(fulfillResults.map((item) => item.status).sort()).toEqual([
            201, 409,
        ]);
        const fulfillFinal = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: fulfillRace.orderId });
        expect(fulfillFinal.version).toBe(fulfillRace.version + 1);
        expect(
            (fulfillFinal.status === 'fulfilled' &&
                fulfillFinal.assignedManagerId ===
                    fulfillRace.manager.user.id) ||
                (fulfillFinal.status === 'paid' &&
                    fulfillFinal.assignedManagerId === fulfillTarget.user.id),
        ).toBe(true);

        const completeRace = await paidOrder('co3c-complete-reassign-race');
        const fulfilled = await fulfill(completeRace).expect(201);
        const completeTarget = await staffFixture('co3c-complete-race-target', [
            'sales_manager',
        ]);
        const completeBody = {
            expectedVersion: fulfilled.body.version,
            realizationNumber: 'RACE-1',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo',
            documentKinds: ['upd'],
        };
        const completeResults = await Promise.all([
            post(
                completeRace.manager.agent,
                completeRace.orderId,
                'complete',
                completeBody,
            ),
            post(completeRace.manager.agent, completeRace.orderId, 'assign', {
                expectedVersion: fulfilled.body.version,
                managerId: completeTarget.user.id,
            }),
        ]);
        expect(completeResults.map((item) => item.status).sort()).toEqual([
            201, 409,
        ]);
        const completeFinal = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: completeRace.orderId });
        expect(completeFinal.version).toBe(fulfilled.body.version + 1);
        expect(
            (completeFinal.status === 'completed' &&
                completeFinal.assignedManagerId ===
                    completeRace.manager.user.id) ||
                (completeFinal.status === 'fulfilled' &&
                    completeFinal.assignedManagerId === completeTarget.user.id),
        ).toBe(true);
    });

    it('rolls back fulfillment and completion when transactional AuditEvent fails', async () => {
        const fulfillment = await paidOrder('co3c-fulfill-rollback');
        await dataSource.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "CK_test_reject_fulfill"
             CHECK ("action" <> 'order.fulfilled') NOT VALID`,
        );
        try {
            await fulfill(fulfillment).expect(409);
        } finally {
            await dataSource.query(
                `ALTER TABLE "audit_events" DROP CONSTRAINT "CK_test_reject_fulfill"`,
            );
        }
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: fulfillment.orderId }),
        ).toMatchObject({
            status: 'paid',
            version: fulfillment.version,
            fulfilledAt: null,
        });

        const completion = await paidOrder('co3c-complete-rollback');
        const fulfilled = await fulfill(completion).expect(201);
        await dataSource.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "CK_test_reject_complete"
             CHECK ("action" <> 'order.completed') NOT VALID`,
        );
        try {
            await post(
                completion.manager.agent,
                completion.orderId,
                'complete',
                {
                    expectedVersion: fulfilled.body.version,
                    realizationNumber: 'ROLLBACK-1',
                    realizationDate: '2026-08-28',
                    documentDeliveryMethod: 'edo',
                    documentKinds: ['upd'],
                },
            ).expect(409);
        } finally {
            await dataSource.query(
                `ALTER TABLE "audit_events" DROP CONSTRAINT "CK_test_reject_complete"`,
            );
        }
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: completion.orderId }),
        ).toMatchObject({
            status: 'fulfilled',
            version: fulfilled.body.version,
            completedAt: null,
        });
    });

    it('preserves completed state on CO-2 idempotent replay', async () => {
        const fixture = await paidOrder('co3c-replay');
        const fulfilled = await fulfill(fixture).expect(201);
        const completed = await post(
            fixture.manager.agent,
            fixture.orderId,
            'complete',
            {
                expectedVersion: fulfilled.body.version,
                realizationNumber: 'REPLAY-1',
                realizationDate: '2026-08-28',
                documentDeliveryMethod: 'paper',
                documentKinds: ['act'],
            },
        ).expect(201);
        const replay = await fixture.client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', fixture.client.ip)
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', fixture.submissionKey)
            .send(fixture.submissionBody)
            .expect(201);
        expect(replay.body).toEqual(
            expect.objectContaining({
                id: fixture.orderId,
                status: 'completed',
                version: completed.body.version,
                fulfillment: expect.any(Object),
                completion: expect.objectContaining({
                    realizationNumber: 'REPLAY-1',
                }),
            }),
        );
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(1);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: fixture.orderId, type: 'submitted' },
            }),
        ).toBe(1);
    });
});
