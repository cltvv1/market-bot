/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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
import { OrderEventEntity } from '../src/orders/entities/order-event.entity';
import { OrderLineEntity } from '../src/orders/entities/order-line.entity';
import { OrderQuoteEntity } from '../src/orders/entities/order-quote.entity';
import { OrderEntity } from '../src/orders/entities/order.entity';
import { ORDER_MONEY_MAX_MINOR_TEXT } from '../src/orders/order.types';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { CustomerWebSessionEntity } from '../src/web-session/entities/customer-web-session.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';

interface Browser {
    agent: ReturnType<typeof request.agent>;
    userId: number;
    ip: string;
}

describe('CO-3A sales workspace on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let ipCounter = 10;
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
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    function nextIp() {
        ipCounter += 1;
        return `10.93.0.${ipCounter}`;
    }

    function nextKey() {
        keyCounter += 1;
        return `10000000-0000-4000-8000-${String(keyCounter).padStart(12, '0')}`;
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

    async function category(published = true) {
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
        const repository = dataSource.getRepository(CatalogCategoryEntity);
        return repository.save(
            repository.create({
                parentId: null,
                name: `Category ${suffix}`,
                slug: `category-${suffix}`,
                description: null,
                sortOrder: 0,
                isPublished: published,
                oneCRef: null,
            }),
        );
    }

    async function product(
        options: Partial<CatalogProductEntity> = {},
        categoryPublished = true,
    ) {
        const productCategory = await category(categoryPublished);
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
        const repository = dataSource.getRepository(CatalogProductEntity);
        return repository.save(
            repository.create({
                categoryId: productCategory.id,
                sku: `CO3-${suffix}`,
                slug: `co3-${suffix}`,
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
                ...options,
                categoryId: productCategory.id,
            }),
        );
    }

    function orderBody(items: Array<{ productId: number; quantity: number }>) {
        return {
            customerType: 'individual',
            contact: {
                name: 'Иван Петров',
                phone: '+7 999 123-45-67',
                email: 'buyer@example.com',
            },
            delivery: { type: 'pickup' },
            comment: 'Исходный запрос клиента',
            items,
        };
    }

    async function submit(
        client: Browser,
        products: Array<{ id: number; quantity?: number }>,
        key = nextKey(),
    ) {
        return client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', key)
            .send(
                orderBody(
                    products.map((item) => ({
                        productId: item.id,
                        quantity: item.quantity ?? 1,
                    })),
                ),
            )
            .expect(201);
    }

    const postCommand = (
        agent: ReturnType<typeof request.agent>,
        path: string,
        body: Record<string, unknown>,
        origin = ORIGIN,
    ) => agent.post(path).set('Origin', origin).send(body);

    const putCommand = (
        agent: ReturnType<typeof request.agent>,
        path: string,
        body: Record<string, unknown>,
        origin = ORIGIN,
    ) => agent.put(path).set('Origin', origin).send(body);

    it('creates the assignment and quote schema with authoritative constraints', async () => {
        const columns: Array<{ table_name: string; column_name: string }> =
            await dataSource.query(
                `SELECT table_name, column_name FROM information_schema.columns
                 WHERE table_schema = 'public' AND (
                   (table_name = 'orders' AND column_name IN ('assignedManagerId','assignedAt','confirmedAt'))
                   OR table_name IN ('order_quotes','order_quote_lines'))`,
            );
        expect(new Set(columns.map((row) => row.table_name))).toEqual(
            new Set(['orders', 'order_quotes', 'order_quote_lines']),
        );

        const constraints: Array<{ conname: string; definition: string }> =
            await dataSource.query(
                `SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
             WHERE conrelid IN ('orders'::regclass,'order_quotes'::regclass,'order_quote_lines'::regclass,'order_events'::regclass)`,
            );
        const names = constraints.map((row) => row.conname);
        expect(names).toEqual(
            expect.arrayContaining([
                'FK_orders_assigned_manager',
                'CK_order_quotes_confirmation_shape',
                'CK_order_quote_lines_catalog_money_shape',
                'CK_order_quote_lines_quoted_money_shape',
                'CK_order_events_type',
            ]),
        );
        const definitions = new Map(
            constraints.map((constraint) => [
                constraint.conname,
                constraint.definition,
            ]),
        );
        expect(definitions.get('FK_orders_assigned_manager')).toContain(
            'ON DELETE RESTRICT',
        );
        expect(definitions.get('CK_order_quotes_confirmation_shape')).toContain(
            'confirmedByStaffId',
        );
        expect(
            definitions.get('CK_order_quote_lines_quoted_money_shape'),
        ).toContain('quotedLineTotalMinor');
        expect(definitions.get('CK_order_events_type')).toEqual(
            expect.stringContaining('manager_reassigned'),
        );

        const indexes: Array<{ indexname: string }> = await dataSource.query(
            `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
             AND tablename IN ('orders','order_quotes','order_quote_lines')`,
        );
        expect(indexes.map((row) => row.indexname)).toEqual(
            expect.arrayContaining([
                'IDX_orders_assigned_manager',
                'IDX_orders_workspace',
                'UQ_order_quotes_order',
                'UQ_order_quote_lines_quote_product',
                'UQ_order_quote_lines_quote_position',
                'UQ_order_quote_lines_quote_source',
            ]),
        );
    });

    it('starts review atomically and initializes a draft from immutable order lines', async () => {
        const client = await browser();
        const priced = await product();
        const unpriced = await product({ displayPriceMinor: null });
        const created = await submit(client, [
            { id: priced.id, quantity: 2 },
            { id: unpriced.id },
        ]);
        const originalLines = await dataSource
            .getRepository(OrderLineEntity)
            .find({
                where: { orderId: created.body.id },
                order: { position: 'ASC' },
            });
        const manager = await staff('co3-start', ['sales_manager']);

        const reviewed = await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);

        expect(reviewed.body).toEqual(
            expect.objectContaining({
                status: 'in_review',
                version: 2,
                assignedManager: expect.objectContaining({
                    id: manager.user.id,
                }),
                quote: expect.objectContaining({
                    status: 'draft',
                    revision: 1,
                    hasUnpricedItems: true,
                    quotedTotalMinor: null,
                }),
            }),
        );
        expect(reviewed.body.quote.lines).toEqual([
            expect.objectContaining({
                sourceOrderLineId: originalLines[0].id,
                quantity: 2,
                quotedUnitPriceMinor: '3100000',
            }),
            expect.objectContaining({
                sourceOrderLineId: originalLines[1].id,
                quotedUnitPriceMinor: null,
            }),
        ]);
        expect(
            await dataSource.getRepository(OrderLineEntity).find({
                where: { orderId: created.body.id },
                order: { position: 'ASC' },
            }),
        ).toMatchObject(originalLines);
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: created.body.id, type: 'review_started' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetType: 'order',
                    targetId: String(created.body.id),
                    action: 'order.review.started',
                },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(OutboundDeliveryEntity).count(),
        ).toBe(0);
    });

    it('supports assignment, reassignment, no-op commands, and current manager authority', async () => {
        const client = await browser();
        const item = await product();
        const created = await submit(client, [{ id: item.id }]);
        const first = await staff('co3-first', ['sales_manager']);
        const second = await staff('co3-second', ['sales_manager']);

        const assigned = await postCommand(
            first.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 1, managerId: first.user.id },
        ).expect(201);
        expect(assigned.body.version).toBe(2);
        const noOp = await postCommand(
            first.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 2, managerId: first.user.id },
        ).expect(201);
        expect(noOp.body.version).toBe(2);

        const reviewed = await postCommand(
            first.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 2 },
        ).expect(201);
        expect(reviewed.body.version).toBe(3);
        const repeated = await postCommand(
            first.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 3 },
        ).expect(201);
        expect(repeated.body.version).toBe(3);
        expect(await dataSource.getRepository(OrderQuoteEntity).count()).toBe(
            1,
        );

        await postCommand(
            second.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 3 },
        ).expect(409);
        const reassigned = await postCommand(
            second.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 3, managerId: second.user.id },
        ).expect(201);
        expect(reassigned.body).toEqual(
            expect.objectContaining({
                version: 4,
                assignedManager: expect.objectContaining({
                    id: second.user.id,
                }),
                quote: expect.objectContaining({ revision: 1 }),
            }),
        );

        const updateBody = {
            expectedVersion: 4,
            internalComment: 'Новый менеджер продолжил работу',
            lines: [
                {
                    productId: item.id,
                    quantity: 1,
                    quotedUnitPriceMinor: '3000000',
                },
            ],
        };
        await putCommand(
            first.agent,
            `/admin/api/orders/${created.body.id}/quote`,
            updateBody,
        ).expect(409);
        await putCommand(
            second.agent,
            `/admin/api/orders/${created.body.id}/quote`,
            updateBody,
        ).expect(200);
    });

    it('rejects disabled or ineligible targets and permits eligible post-confirm reassignment', async () => {
        const client = await browser();
        const item = await product();
        const created = await submit(client, [{ id: item.id }]);
        const root = await staff('co3-root-eligibility', ['superadmin']);
        const operator = await staff('co3-operator-target', ['operator']);
        const eligible = await staff('co3-eligible-target', ['sales_manager']);
        const disabled = await staff('co3-disabled-target', ['sales_manager']);
        await auth.setActive(disabled.user.id, false);

        await postCommand(
            root.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 1, managerId: operator.user.id },
        ).expect(409);
        await postCommand(
            root.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 1, managerId: disabled.user.id },
        ).expect(409);
        const absent = await postCommand(
            root.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 1, managerId: 2_147_483_647 },
        );
        expect([404, 409]).toContain(absent.status);
        expect(
            (
                await dataSource
                    .getRepository(OrderEntity)
                    .findOneByOrFail({ id: created.body.id })
            ).version,
        ).toBe(1);

        await postCommand(
            root.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);
        await postCommand(
            root.agent,
            `/admin/api/orders/${created.body.id}/confirm`,
            { expectedVersion: 2 },
        ).expect(201);
        await postCommand(
            root.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 3, managerId: eligible.user.id },
        ).expect(201);
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: created.body.id }),
        ).toMatchObject({
            status: 'confirmed',
            version: 4,
            assignedManagerId: eligible.user.id,
        });
    });

    it('fully replaces a draft quote while preserving original and added product snapshots', async () => {
        const client = await browser();
        const original = await product({ name: 'Исходная касса' });
        const added = await product({
            name: 'Внутренний товар',
            isPublished: false,
        });
        const created = await submit(client, [
            { id: original.id, quantity: 2 },
        ]);
        const originalLine = await dataSource
            .getRepository(OrderLineEntity)
            .findOneByOrFail({ orderId: created.body.id });
        const manager = await staff('co3-quote', ['sales_manager']);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);

        await dataSource
            .getRepository(CatalogProductEntity)
            .update(original.id, {
                name: 'Каталог изменён после заказа',
                isPublished: false,
                isActive: false,
            });
        const updated = await putCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/quote`,
            {
                expectedVersion: 2,
                internalComment: ' Согласовано по телефону ',
                lines: [
                    {
                        productId: added.id,
                        quantity: 3,
                        quotedUnitPriceMinor: null,
                    },
                    {
                        productId: original.id,
                        quantity: 1,
                        quotedUnitPriceMinor: '2900000',
                    },
                ],
            },
        ).expect(200);

        expect(updated.body).toEqual(
            expect.objectContaining({
                version: 3,
                quote: expect.objectContaining({
                    revision: 2,
                    hasUnpricedItems: true,
                    quotedTotalMinor: null,
                    internalComment: 'Согласовано по телефону',
                }),
            }),
        );
        expect(updated.body.quote.lines).toEqual([
            expect.objectContaining({
                productId: added.id,
                sourceOrderLineId: null,
                nameSnapshot: 'Внутренний товар',
                quantity: 3,
            }),
            expect.objectContaining({
                productId: original.id,
                sourceOrderLineId: originalLine.id,
                nameSnapshot: 'Исходная касса',
                quantity: 1,
                quotedUnitPriceMinor: '2900000',
            }),
        ]);
        expect(
            await dataSource.getRepository(OrderLineEntity).findOneByOrFail({
                id: originalLine.id,
            }),
        ).toMatchObject({
            nameSnapshot: 'Исходная касса',
            quantity: 2,
            catalogUnitPriceMinor: '3100000',
        });
        const clientDraft = await client.agent
            .get(`/api/client/orders/${created.body.id}`)
            .set('X-Forwarded-For', client.ip)
            .expect(200);
        expect(clientDraft.body.confirmedQuote).toBeNull();
        expect(JSON.stringify(clientDraft.body)).not.toContain(
            'Согласовано по телефону',
        );
    });

    it('uses the internal added-product eligibility policy for quote replacements', async () => {
        const client = await browser();
        const original = await product();
        const published = await product({ name: 'Published internal product' });
        const unpublished = await product({
            name: 'Unpublished internal product',
            isPublished: false,
        });
        const hiddenCategory = await product(
            { name: 'Product in hidden category' },
            false,
        );
        const inactive = await product({ isActive: false });
        const unavailable = await product({
            availabilityStatus: 'unavailable',
        });
        const created = await submit(client, [{ id: original.id }]);
        const manager = await staff('co3-product-policy', ['sales_manager']);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);

        const allowed = await putCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/quote`,
            {
                expectedVersion: 2,
                lines: [published, unpublished, hiddenCategory].map((item) => ({
                    productId: item.id,
                    quantity: 1,
                    quotedUnitPriceMinor: '1000',
                })),
            },
        ).expect(200);
        expect(allowed.body.quote.lines).toHaveLength(3);
        expect(allowed.body).toEqual(
            expect.objectContaining({
                version: 3,
                quote: expect.objectContaining({ revision: 2 }),
            }),
        );
        const eventCount = await dataSource
            .getRepository(OrderEventEntity)
            .count({ where: { orderId: created.body.id } });
        const auditCount = await dataSource
            .getRepository(AuditEventEntity)
            .count({
                where: {
                    targetType: 'order',
                    targetId: String(created.body.id),
                },
            });

        for (const productId of [inactive.id, unavailable.id, 2_147_483_647]) {
            await putCommand(
                manager.agent,
                `/admin/api/orders/${created.body.id}/quote`,
                {
                    expectedVersion: 3,
                    lines: [
                        {
                            productId,
                            quantity: 1,
                            quotedUnitPriceMinor: '1000',
                        },
                    ],
                },
            ).expect(409);
        }
        expect(
            await dataSource
                .getRepository(OrderEntity)
                .findOneByOrFail({ id: created.body.id }),
        ).toMatchObject({ version: 3 });
        expect(
            await dataSource
                .getRepository(OrderQuoteEntity)
                .findOneByOrFail({ orderId: created.body.id }),
        ).toMatchObject({ revision: 2 });
        expect(
            await dataSource
                .getRepository(OrderEventEntity)
                .count({ where: { orderId: created.body.id } }),
        ).toBe(eventCount);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: {
                    targetType: 'order',
                    targetId: String(created.body.id),
                },
            }),
        ).toBe(auditCount);
    });

    it('rolls back invalid quote replacements without changing revision, version, events, or audit', async () => {
        const client = await browser();
        const item = await product();
        const created = await submit(client, [{ id: item.id }]);
        const manager = await staff('co3-rollback', ['sales_manager']);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);

        const before = await dataSource
            .getRepository(OrderQuoteEntity)
            .findOneOrFail({
                where: { orderId: created.body.id },
                relations: { lines: true },
            });
        const eventCount = await dataSource
            .getRepository(OrderEventEntity)
            .count();
        const auditCount = await dataSource
            .getRepository(AuditEventEntity)
            .count();
        for (const body of [
            {
                expectedVersion: 2,
                lines: [
                    {
                        productId: item.id,
                        quantity: 1,
                        quotedUnitPriceMinor: '-1',
                    },
                ],
            },
            {
                expectedVersion: 2,
                lines: [
                    {
                        productId: item.id,
                        quantity: 2,
                        quotedUnitPriceMinor: ORDER_MONEY_MAX_MINOR_TEXT,
                    },
                ],
            },
            {
                expectedVersion: 2,
                lines: [
                    {
                        productId: item.id,
                        quantity: 1,
                        quotedUnitPriceMinor: '1',
                    },
                    {
                        productId: item.id,
                        quantity: 2,
                        quotedUnitPriceMinor: '2',
                    },
                ],
            },
        ]) {
            await putCommand(
                manager.agent,
                `/admin/api/orders/${created.body.id}/quote`,
                body,
            ).expect(400);
        }

        const after = await dataSource
            .getRepository(OrderQuoteEntity)
            .findOneOrFail({
                where: { orderId: created.body.id },
                relations: { lines: true },
            });
        expect(after.revision).toBe(before.revision);
        expect(after.lines).toMatchObject(before.lines);
        expect(
            (
                await dataSource
                    .getRepository(OrderEntity)
                    .findOneByOrFail({ id: created.body.id })
            ).version,
        ).toBe(2);
        expect(await dataSource.getRepository(OrderEventEntity).count()).toBe(
            eventCount,
        );
        expect(await dataSource.getRepository(AuditEventEntity).count()).toBe(
            auditCount,
        );
    });

    it('requires resolved prices, confirms exactly once, and exposes only the safe client projection', async () => {
        const client = await browser();
        const item = await product({ displayPriceMinor: null });
        const created = await submit(client, [{ id: item.id }]);
        const manager = await staff('co3-confirm', ['sales_manager']);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/confirm`,
            { expectedVersion: 2 },
        ).expect(409);

        await putCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/quote`,
            {
                expectedVersion: 2,
                internalComment: 'Не показывать клиенту',
                lines: [
                    {
                        productId: item.id,
                        quantity: 2,
                        quotedUnitPriceMinor: '1500000',
                    },
                ],
            },
        ).expect(200);
        await dataSource
            .getRepository(OrderQuoteEntity)
            .update({ orderId: created.body.id }, { hasUnpricedItems: true });
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/confirm`,
            { expectedVersion: 3 },
        ).expect(409);
        await dataSource
            .getRepository(OrderQuoteEntity)
            .update({ orderId: created.body.id }, { hasUnpricedItems: false });
        const confirmed = await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/confirm`,
            { expectedVersion: 3 },
        ).expect(201);
        expect(confirmed.body).toEqual(
            expect.objectContaining({
                status: 'confirmed',
                version: 4,
                confirmedAt: expect.any(String),
                quote: expect.objectContaining({
                    status: 'confirmed',
                    revision: 2,
                    quotedTotalMinor: '3000000',
                }),
            }),
        );
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/confirm`,
            { expectedVersion: 3 },
        ).expect(409);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/assign`,
            { expectedVersion: 4, managerId: manager.user.id },
        ).expect(201);

        const clientDetail = await client.agent
            .get(`/api/client/orders/${created.body.id}`)
            .set('X-Forwarded-For', client.ip)
            .expect(200);
        expect(clientDetail.body.confirmedQuote).toEqual(
            expect.objectContaining({
                revision: 2,
                currency: 'RUB',
                quotedTotalMinor: '3000000',
                lines: [
                    expect.objectContaining({
                        productId: item.id,
                        quantity: 2,
                        quotedUnitPriceMinor: '1500000',
                        quotedLineTotalMinor: '3000000',
                    }),
                ],
            }),
        );
        const serialized = JSON.stringify(clientDetail.body);
        for (const forbidden of [
            'internalComment',
            'sourceOrderLineId',
            'createdByStaff',
            'updatedByStaff',
            'confirmedByStaff',
            'assignedManager',
            'Не показывать клиенту',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
        expect(
            (clientDetail.body.events as Array<{ type: string }>).map(
                (event) => event.type,
            ),
        ).toEqual(['submitted', 'review_started', 'confirmed']);
        expect(
            await dataSource.getRepository(OutboundDeliveryEntity).count(),
        ).toBe(0);
    });

    it('keeps CO-2 idempotent replay compatible after assignment and confirmation', async () => {
        const client = await browser();
        const item = await product();
        const key = nextKey();
        const created = await submit(client, [{ id: item.id }], key);
        const manager = await staff('co3-replay', ['sales_manager']);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/confirm`,
            { expectedVersion: 2 },
        ).expect(201);

        const replay = await client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', key)
            .send(orderBody([{ productId: item.id, quantity: 1 }]))
            .expect(201);
        expect(replay.body).toEqual(
            expect.objectContaining({
                id: created.body.id,
                status: 'confirmed',
                version: 3,
                confirmedQuote: expect.objectContaining({
                    quotedTotalMinor: '3100000',
                }),
            }),
        );
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(1);
        expect(await dataSource.getRepository(OrderQuoteEntity).count()).toBe(
            1,
        );
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { type: 'submitted' },
            }),
        ).toBe(1);
    });

    it('supports all, mine, and unassigned admin workspace scopes', async () => {
        const firstClient = await browser();
        const secondClient = await browser();
        const item = await product();
        const firstOrder = await submit(firstClient, [{ id: item.id }]);
        const secondOrder = await submit(secondClient, [{ id: item.id }]);
        const manager = await staff('co3-scopes', ['sales_manager']);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${firstOrder.body.id}/assign`,
            { expectedVersion: 1, managerId: manager.user.id },
        ).expect(201);

        const mine = await manager.agent
            .get('/admin/api/orders?scope=mine')
            .expect(200);
        const mineItems = mine.body.items as Array<{ id: number }>;
        expect(mineItems.map((order) => order.id)).toEqual([
            firstOrder.body.id,
        ]);
        const unassigned = await manager.agent
            .get('/admin/api/orders?scope=unassigned')
            .expect(200);
        const unassignedItems = unassigned.body.items as Array<{ id: number }>;
        expect(unassignedItems.map((order) => order.id)).toEqual([
            secondOrder.body.id,
        ]);
        const all = await manager.agent
            .get('/admin/api/orders?scope=all')
            .expect(200);
        const allItems = all.body.items as Array<{ id: number }>;
        expect(allItems.map((order) => order.id)).toEqual([
            secondOrder.body.id,
            firstOrder.body.id,
        ]);
        expect(JSON.stringify(all.body)).not.toContain('idempotencyKey');
        expect(JSON.stringify(all.body)).not.toContain('internalComment');
    });

    it('enforces RBAC, current roles, session, origin, IDs, and expectedVersion', async () => {
        const client = await browser();
        const item = await product();
        const created = await submit(client, [{ id: item.id }]);
        const sales = await staff('co3-security-sales', ['sales_manager']);
        const operator = await staff('co3-security-operator', ['operator']);
        const engineer = await staff('co3-security-engineer', ['engineer']);
        const disabled = await staff('co3-security-disabled', [
            'sales_manager',
        ]);
        await auth.setActive(disabled.user.id, false);

        for (const denied of [operator, engineer]) {
            await postCommand(
                denied.agent,
                `/admin/api/orders/${created.body.id}/start-review`,
                { expectedVersion: 1 },
            ).expect(403);
        }
        await request(app.getHttpServer())
            .post(`/admin/api/orders/${created.body.id}/start-review`)
            .set('Origin', ORIGIN)
            .send({ expectedVersion: 1 })
            .expect(401);
        await postCommand(
            disabled.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(401);
        await postCommand(
            sales.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
            'https://attacker.example',
        ).expect(403);
        await sales.agent
            .post(`/admin/api/orders/${created.body.id}/start-review`)
            .send({ expectedVersion: 1 })
            .expect(403);
        await postCommand(
            sales.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 'bad' },
        ).expect(400);
        await postCommand(
            sales.agent,
            `/admin/api/orders/${2_147_483_648}/start-review`,
            { expectedVersion: 1 },
        ).expect(400);
        await postCommand(
            sales.agent,
            `/admin/api/orders/${2_147_483_647}/start-review`,
            { expectedVersion: 1 },
        ).expect(404);

        await auth.setRoles(sales.user.id, ['operator']);
        await postCommand(
            sales.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(403);

        const unionClient = await browser();
        const unionOrder = await submit(unionClient, [{ id: item.id }]);
        const multiRole = await staff('co3-security-multi-role', [
            'operator',
            'sales_manager',
        ]);
        await postCommand(
            multiRole.agent,
            `/admin/api/orders/${unionOrder.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);
        expect(
            (
                await dataSource
                    .getRepository(OrderEntity)
                    .findOneByOrFail({ id: created.body.id })
            ).version,
        ).toBe(1);
    });

    it('rolls back start-review when the transactional AuditEvent insert fails', async () => {
        const client = await browser();
        const item = await product();
        const created = await submit(client, [{ id: item.id }]);
        const manager = await staff('co3-audit-rollback', ['sales_manager']);
        await dataSource.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "CK_test_reject_order_review" CHECK ("action" <> 'order.review.started') NOT VALID`,
        );
        try {
            await postCommand(
                manager.agent,
                `/admin/api/orders/${created.body.id}/start-review`,
                { expectedVersion: 1 },
            ).expect(409);
        } finally {
            await dataSource.query(
                `ALTER TABLE "audit_events" DROP CONSTRAINT "CK_test_reject_order_review"`,
            );
        }
        expect(
            await dataSource.getRepository(OrderEntity).findOneByOrFail({
                id: created.body.id,
            }),
        ).toMatchObject({
            status: 'submitted',
            version: 1,
            assignedManagerId: null,
        });
        expect(await dataSource.getRepository(OrderQuoteEntity).count()).toBe(
            0,
        );
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { orderId: created.body.id },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: { action: 'order.review.started' },
            }),
        ).toBe(0);
    });

    it('serializes concurrent start-review commands through the order row lock', async () => {
        const client = await browser();
        const item = await product();
        const created = await submit(client, [{ id: item.id }]);
        const first = await staff('co3-race-start-a', ['sales_manager']);
        const second = await staff('co3-race-start-b', ['sales_manager']);

        const results = await Promise.all([
            postCommand(
                first.agent,
                `/admin/api/orders/${created.body.id}/start-review`,
                { expectedVersion: 1 },
            ),
            postCommand(
                second.agent,
                `/admin/api/orders/${created.body.id}/start-review`,
                { expectedVersion: 1 },
            ),
        ]);
        expect(results.map((result) => result.status).sort()).toEqual([
            201, 409,
        ]);
        expect(await dataSource.getRepository(OrderQuoteEntity).count()).toBe(
            1,
        );
        expect(
            await dataSource.getRepository(OrderEventEntity).count({
                where: { type: 'review_started' },
            }),
        ).toBe(1);
        expect(
            await dataSource.getRepository(AuditEventEntity).count({
                where: { action: 'order.review.started' },
            }),
        ).toBe(1);
    });

    it('allows exactly one concurrent quote update and one update-or-confirm winner', async () => {
        const client = await browser();
        const item = await product();
        const created = await submit(client, [{ id: item.id }]);
        const manager = await staff('co3-race-quote', ['sales_manager']);
        await postCommand(
            manager.agent,
            `/admin/api/orders/${created.body.id}/start-review`,
            { expectedVersion: 1 },
        ).expect(201);

        const update = (price: string) =>
            putCommand(
                manager.agent,
                `/admin/api/orders/${created.body.id}/quote`,
                {
                    expectedVersion: 2,
                    lines: [
                        {
                            productId: item.id,
                            quantity: 1,
                            quotedUnitPriceMinor: price,
                        },
                    ],
                },
            );
        const updates = await Promise.all([
            update('3000000'),
            update('2900000'),
        ]);
        expect(updates.map((result) => result.status).sort()).toEqual([
            200, 409,
        ]);
        const quote = await dataSource
            .getRepository(OrderQuoteEntity)
            .findOneByOrFail({ orderId: created.body.id });
        expect(quote.revision).toBe(2);
        expect(['3000000', '2900000']).toContain(
            quote.quotedPricedSubtotalMinor,
        );

        const current = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: created.body.id });
        const mixed = await Promise.all([
            putCommand(
                manager.agent,
                `/admin/api/orders/${created.body.id}/quote`,
                {
                    expectedVersion: current.version,
                    lines: [
                        {
                            productId: item.id,
                            quantity: 2,
                            quotedUnitPriceMinor: '2800000',
                        },
                    ],
                },
            ),
            postCommand(
                manager.agent,
                `/admin/api/orders/${created.body.id}/confirm`,
                { expectedVersion: current.version },
            ),
        ]);
        const mixedStatuses = mixed.map((result) => result.status);
        expect(mixedStatuses.filter((status) => status === 409)).toHaveLength(
            1,
        );
        expect(
            mixedStatuses.filter((status) => status === 200 || status === 201),
        ).toHaveLength(1);
        const finalOrder = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: created.body.id });
        expect(finalOrder.version).toBe(current.version + 1);
        expect(['in_review', 'confirmed']).toContain(finalOrder.status);
    });
});
