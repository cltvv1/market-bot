/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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
import { OrderEntity } from '../src/orders/entities/order.entity';
import { OrganizationAccessRequestEntity } from '../src/organizations/entities/organization-access-request.entity';
import { OrganizationMemberEntity } from '../src/organizations/entities/organization-member.entity';
import { OrganizationEntity } from '../src/organizations/entities/organization.entity';
import { CustomerWebSessionEntity } from '../src/web-session/entities/customer-web-session.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';

interface Browser {
    agent: ReturnType<typeof request.agent>;
    userId: number;
    sessionId: number;
    ip: string;
}

describe('CO-2 order intake foundation on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let ipCounter = 100;
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
        return `10.92.0.${ipCounter}`;
    }

    function nextKey() {
        keyCounter += 1;
        return `00000000-0000-4000-8000-${String(keyCounter).padStart(12, '0')}`;
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
        return {
            agent,
            userId: session.userId,
            sessionId: session.id,
            ip,
        };
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

    async function category(published = true, suffix = String(Date.now())) {
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
        productCategory?: CatalogCategoryEntity,
    ) {
        const currentCategory = productCategory ?? (await category());
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
        const repository = dataSource.getRepository(CatalogProductEntity);
        return repository.save(
            repository.create({
                categoryId: currentCategory.id,
                sku: `VM-${suffix}`,
                slug: `product-${suffix}`,
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
            }),
        );
    }

    async function organization(
        member?: Browser,
        values: Partial<OrganizationEntity> = {},
    ) {
        const organizations = dataSource.getRepository(OrganizationEntity);
        const item = await organizations.save(
            organizations.create({
                inn: '2460000000',
                kpp: '246001001',
                ogrn: '1022400000000',
                name: 'ООО Витма Тест',
                legalAddress: 'Красноярск, ул. Тестовая, 1',
                actualAddress: 'Красноярск, ул. Тестовая, 2',
                taxSystem: 'ОСНО',
                isVerified: true,
                lastSyncedAt: null,
                ...values,
            }),
        );
        if (member) {
            const members = dataSource.getRepository(OrganizationMemberEntity);
            await members.save(
                members.create({
                    organizationId: item.id,
                    userId: member.userId,
                    role: 'representative',
                    status: 'active',
                    confirmedAt: new Date(),
                }),
            );
        }
        return item;
    }

    const individualBody = (
        items: Array<{ productId: number; quantity: number }>,
    ) => ({
        customerType: 'individual',
        contact: {
            name: 'Иван Петров',
            phone: '+7 (999) 123-45-67',
            email: 'client@example.com',
        },
        delivery: { type: 'pickup' },
        comment: 'Позвонить перед подтверждением',
        items,
    });

    const linkedBody = (
        organizationId: number,
        items: Array<{ productId: number; quantity: number }>,
    ) => ({
        customerType: 'organization',
        organizationId,
        contact: {
            name: 'Иван Петров',
            phone: '+7 (999) 123-45-67',
            email: 'client@example.com',
        },
        delivery: {
            type: 'courier',
            city: 'Красноярск',
            address: 'ул. Ленина, 1',
        },
        comment: 'Позвонить перед подтверждением',
        items,
    });

    function submit(
        client: Browser,
        body: Record<string, unknown>,
        idempotencyKey = nextKey(),
        origin = ORIGIN,
    ) {
        return client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Origin', origin)
            .set('Idempotency-Key', idempotencyKey)
            .send(body);
    }

    async function expectPostgresCode(
        operation: Promise<unknown>,
        code: string,
    ) {
        await expect(operation).rejects.toMatchObject({
            driverError: { code },
        });
    }

    it('creates the relational schema, FKs, unique indexes, and authoritative checks', async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name LIKE 'order%'
             ORDER BY table_name`,
        );
        expect(tables.map((row) => row.table_name)).toEqual([
            'order_events',
            'order_lines',
            'orders',
        ]);

        const constraints: Array<{ conname: string }> = await dataSource.query(
            `SELECT conname FROM pg_constraint
             WHERE conrelid IN ('orders'::regclass, 'order_lines'::regclass, 'order_events'::regclass)
             ORDER BY conname`,
        );
        expect(constraints.map((row) => row.conname)).toEqual(
            expect.arrayContaining([
                'FK_orders_created_by_user',
                'FK_orders_organization',
                'FK_order_lines_order',
                'FK_order_lines_product',
                'FK_order_events_order',
                'FK_order_events_actor_user',
                'FK_order_events_actor_staff',
                'CK_orders_customer_shape',
                'CK_order_lines_quantity',
                'CK_order_lines_money_shape',
                'CK_order_lines_vat_rate',
                'CK_order_events_actor_identity',
            ]),
        );
        const indexes: Array<{ indexname: string }> = await dataSource.query(
            `SELECT indexname FROM pg_indexes
             WHERE schemaname = 'public' AND tablename IN ('orders','order_lines','order_events')`,
        );
        expect(indexes.map((row) => row.indexname)).toEqual(
            expect.arrayContaining([
                'UQ_orders_user_idempotency',
                'UQ_order_lines_order_product',
                'UQ_order_lines_order_position',
            ]),
        );

        const client = await browser();
        const catalogProduct = await product();
        const created = await submit(
            client,
            individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
        ).expect(201);
        await expectPostgresCode(
            dataSource.query(
                `UPDATE "order_lines" SET "quantity" = 0 WHERE "orderId" = $1`,
                [created.body.id],
            ),
            '23514',
        );
        await expectPostgresCode(
            dataSource.query(
                `UPDATE "order_lines" SET "vatRateSnapshot" = 600 WHERE "orderId" = $1`,
                [created.body.id],
            ),
            '23514',
        );
        await expectPostgresCode(
            dataSource.query(
                `UPDATE "order_lines" SET "catalogUnitPriceMinor" = -1 WHERE "orderId" = $1`,
                [created.body.id],
            ),
            '23514',
        );
        await expectPostgresCode(
            dataSource.query(
                `UPDATE "orders" SET "customerType" = 'organization' WHERE "id" = $1`,
                [created.body.id],
            ),
            '23514',
        );
        await expectPostgresCode(
            dataSource.query(
                `UPDATE "order_events" SET "actorUserId" = NULL WHERE "orderId" = $1`,
                [created.body.id],
            ),
            '23514',
        );
    });

    it('submits a linked organization order with snapshots, timeline, and compact transactional audit', async () => {
        const client = await browser();
        const linked = await organization(client);
        const catalogProduct = await product();
        const response = await submit(
            client,
            linkedBody(linked.id, [
                { productId: catalogProduct.id, quantity: 2 },
            ]),
        ).expect(201);

        expect(response.body).toEqual(
            expect.objectContaining({
                orderNumber: 'VM-00000001',
                status: 'submitted',
                version: 1,
                customerType: 'organization',
                organization: expect.objectContaining({
                    id: linked.id,
                    name: linked.name,
                    inn: linked.inn,
                }),
                contact: {
                    name: 'Иван Петров',
                    phone: '+79991234567',
                    email: 'client@example.com',
                },
                catalogPricedSubtotalMinor: '6200000',
                catalogTotalMinor: '6200000',
                hasUnpricedItems: false,
                currency: 'RUB',
            }),
        );
        expect(response.body).not.toHaveProperty('idempotencyKey');
        expect(response.body).not.toHaveProperty('submissionFingerprint');
        expect(response.body.lines[0]).toEqual(
            expect.objectContaining({
                skuSnapshot: catalogProduct.sku,
                nameSnapshot: catalogProduct.name,
                catalogUnitPriceMinor: '3100000',
                catalogLineTotalMinor: '6200000',
                vatRateSnapshot: 2000,
                quantity: 2,
            }),
        );
        expect(response.body.events).toHaveLength(1);
        expect(response.body.events[0]).toEqual(
            expect.objectContaining({
                type: 'submitted',
                fromStatus: null,
                toStatus: 'submitted',
                visibility: 'customer',
            }),
        );

        const order = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: response.body.id });
        expect(order.createdByUserId).toBe(client.userId);
        expect(order.organizationNameSnapshot).toBe(linked.name);
        expect(await dataSource.getRepository(OrderLineEntity).count()).toBe(1);
        expect(await dataSource.getRepository(OrderEventEntity).count()).toBe(
            1,
        );
        const audit = await dataSource
            .getRepository(AuditEventEntity)
            .findOneByOrFail({ action: 'order.submitted' });
        expect(audit.actorCustomerId).toBe(client.userId);
        expect(audit.actorSessionId).toBeNull();
        expect(audit.actorWebSessionId).toBe(client.sessionId);
        expect(audit.metadata).toEqual({
            orderNumber: 'VM-00000001',
            customerType: 'organization',
            organizationId: linked.id,
            lineCount: 1,
            hasUnpricedItems: false,
        });
        expect(JSON.stringify(audit)).not.toContain('client@example.com');
        expect(
            await dataSource.getRepository('outbound_deliveries').count(),
        ).toBe(0);
    });

    it('denies a foreign linked organization without leaking it or creating partial rows', async () => {
        const owner = await browser();
        const attacker = await browser();
        const linked = await organization(owner);
        const catalogProduct = await product();
        await submit(
            attacker,
            linkedBody(linked.id, [
                { productId: catalogProduct.id, quantity: 1 },
            ]),
        )
            .expect(404)
            .expect(({ body }) => {
                expect(JSON.stringify(body)).not.toContain(linked.inn);
                expect(JSON.stringify(body)).not.toContain(linked.name);
            });
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(0);
        expect(await dataSource.getRepository(OrderLineEntity).count()).toBe(0);
        expect(await dataSource.getRepository(OrderEventEntity).count()).toBe(
            0,
        );
        expect(
            await dataSource
                .getRepository(AuditEventEntity)
                .count({ where: { action: 'order.submitted' } }),
        ).toBe(0);
    });

    it('stores a manual organization snapshot without creating access or membership', async () => {
        const client = await browser();
        const catalogProduct = await product();
        const beforeOrganizations = await dataSource
            .getRepository(OrganizationEntity)
            .count();
        const response = await submit(client, {
            customerType: 'organization',
            organization: {
                name: ' ООО Новая компания ',
                inn: '2460000000',
                kpp: '246001001',
                ogrn: '1022400000000',
                legalAddress: 'Красноярск, ул. Новая, 1',
                actualAddress: 'Красноярск, ул. Новая, 2',
                taxSystem: 'УСН',
            },
            contact: {
                name: 'Пётр Иванов',
                phone: '89991234567',
                email: 'NEW@EXAMPLE.COM',
            },
            delivery: { type: 'transport_company', city: 'Красноярск' },
            items: [{ productId: catalogProduct.id, quantity: 1 }],
        }).expect(201);
        expect(response.body.organization).toEqual(
            expect.objectContaining({
                id: null,
                name: 'ООО Новая компания',
                inn: '2460000000',
            }),
        );
        expect(response.body.contact.email).toBe('new@example.com');
        expect(await dataSource.getRepository(OrganizationEntity).count()).toBe(
            beforeOrganizations,
        );
        expect(
            await dataSource.getRepository(OrganizationMemberEntity).count(),
        ).toBe(0);
        expect(
            await dataSource
                .getRepository(OrganizationAccessRequestEntity)
                .count(),
        ).toBe(0);
    });

    it('accepts an individual order and rejects every organization shape on it', async () => {
        const client = await browser();
        const catalogProduct = await product();
        await submit(
            client,
            individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
        )
            .expect(201)
            .expect(({ body }) => {
                expect(body.organization).toBeNull();
            });
        await submit(client, {
            ...individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            organizationId: 1,
        }).expect(400);
        await submit(client, {
            ...individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            organization: { name: 'ООО Лишнее', inn: '2460000000' },
        }).expect(400);
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(1);
    });

    it('enforces catalog publication and availability atomically', async () => {
        const client = await browser();
        const publishedCategory = await category(true, 'published');
        const hiddenCategory = await category(false, 'hidden');
        const valid = await product(
            { availabilityStatus: 'in_stock' },
            publishedCategory,
        );
        const rejected = [
            await product({ isPublished: false }, publishedCategory),
            await product({ isActive: false }, publishedCategory),
            await product({}, hiddenCategory),
            await product(
                { availabilityStatus: 'unavailable' },
                publishedCategory,
            ),
        ];
        for (const item of rejected) {
            await submit(
                client,
                individualBody([{ productId: item.id, quantity: 1 }]),
            ).expect(409);
        }
        await submit(
            client,
            individualBody([{ productId: 999999, quantity: 1 }]),
        ).expect(409);
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(0);

        const onRequest = await product(
            { availabilityStatus: 'on_request' },
            publishedCategory,
        );
        const lowStock = await product(
            { availabilityStatus: 'low_stock' },
            publishedCategory,
        );
        for (const item of [valid, onRequest, lowStock]) {
            await submit(
                client,
                individualBody([{ productId: item.id, quantity: 1 }]),
            ).expect(201);
        }
        const beforeMixed = await dataSource.getRepository(OrderEntity).count();
        await submit(
            client,
            individualBody([
                { productId: valid.id, quantity: 1 },
                { productId: rejected[0].id, quantity: 1 },
            ]),
        ).expect(409);
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(
            beforeMixed,
        );
    });

    it('rejects duplicate products and all client-selected commercial fields', async () => {
        const client = await browser();
        const catalogProduct = await product({
            displayPriceMinor: 1_234_500,
            vatRate: 1000,
        });
        await submit(
            client,
            individualBody([
                { productId: catalogProduct.id, quantity: 1 },
                { productId: catalogProduct.id, quantity: 2 },
            ]),
        ).expect(400);
        for (const [field, value] of Object.entries({
            price: 1,
            total: 1,
            vatRate: 0,
            productName: 'Tampered',
            status: 'paid',
            assignedManagerId: 1,
            oneCOrderNumber: '1C-1',
        })) {
            await submit(client, {
                ...individualBody([
                    { productId: catalogProduct.id, quantity: 1 },
                ]),
                [field]: value,
            }).expect(400);
        }
        const accepted = await submit(
            client,
            individualBody([{ productId: catalogProduct.id, quantity: 2 }]),
        ).expect(201);
        expect(accepted.body.lines[0]).toEqual(
            expect.objectContaining({
                nameSnapshot: catalogProduct.name,
                catalogUnitPriceMinor: '1234500',
                catalogLineTotalMinor: '2469000',
                vatRateSnapshot: 1000,
            }),
        );
    });

    it('keeps exact large money and explicit price-on-request semantics', async () => {
        const client = await browser();
        const priced = await product({ displayPriceMinor: 2_000_000_000 });
        const unpriced = await product({ displayPriceMinor: null });
        const response = await submit(
            client,
            individualBody([
                { productId: priced.id, quantity: 1000 },
                { productId: unpriced.id, quantity: 2 },
            ]),
        ).expect(201);
        expect(response.body.catalogPricedSubtotalMinor).toBe('2000000000000');
        expect(response.body.hasUnpricedItems).toBe(true);
        expect(response.body.catalogTotalMinor).toBeNull();
        expect(response.body.lines).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    productId: priced.id,
                    catalogUnitPriceMinor: '2000000000',
                    catalogLineTotalMinor: '2000000000000',
                }),
                expect.objectContaining({
                    productId: unpriced.id,
                    catalogUnitPriceMinor: null,
                    catalogLineTotalMinor: null,
                }),
            ]),
        );
        const stored = await dataSource
            .getRepository(OrderEntity)
            .findOneByOrFail({ id: response.body.id });
        expect(stored.catalogPricedSubtotalMinor).toBe('2000000000000');
    });

    it('keeps product and organization snapshots immutable', async () => {
        const client = await browser();
        const linked = await organization(client);
        const catalogProduct = await product();
        const created = await submit(
            client,
            linkedBody(linked.id, [
                { productId: catalogProduct.id, quantity: 1 },
            ]),
        ).expect(201);

        catalogProduct.name = 'Changed product';
        catalogProduct.sku = 'CHANGED-SKU';
        catalogProduct.displayPriceMinor = 1;
        catalogProduct.vatRate = 0;
        await dataSource
            .getRepository(CatalogProductEntity)
            .save(catalogProduct);
        linked.name = 'ООО Изменённое';
        linked.legalAddress = 'Новый адрес';
        await dataSource.getRepository(OrganizationEntity).save(linked);

        const detail = await client.agent
            .get(`/api/client/orders/${created.body.id}`)
            .set('X-Forwarded-For', client.ip)
            .expect(200);
        expect(detail.body.organization.name).toBe('ООО Витма Тест');
        expect(detail.body.organization.legalAddress).toBe(
            'Красноярск, ул. Тестовая, 1',
        );
        expect(detail.body.lines[0].nameSnapshot).toBe(
            created.body.lines[0].nameSnapshot,
        );
        expect(detail.body.lines[0].skuSnapshot).toBe(
            created.body.lines[0].skuSnapshot,
        );
        expect(detail.body.lines[0].catalogUnitPriceMinor).toBe('3100000');
        expect(detail.body.lines[0].vatRateSnapshot).toBe(2000);
    });

    it('replays sequential and concurrent submissions exactly once', async () => {
        const client = await browser();
        const firstProduct = await product();
        const secondProduct = await product();
        const body = individualBody([
            { productId: firstProduct.id, quantity: 1 },
            { productId: secondProduct.id, quantity: 2 },
        ]);
        const sequentialKey = nextKey();
        const first = await submit(client, body, sequentialKey).expect(201);
        const replay = await submit(
            client,
            { ...body, items: [...body.items].reverse() },
            sequentialKey,
        ).expect(201);
        expect(replay.body.id).toBe(first.body.id);
        expect(replay.body.orderNumber).toBe(first.body.orderNumber);

        const concurrentKey = nextKey();
        const [left, right] = await Promise.all([
            submit(client, body, concurrentKey),
            submit(client, body, concurrentKey),
        ]);
        expect([left.status, right.status]).toEqual([201, 201]);
        expect(left.body.id).toBe(right.body.id);
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(2);
        expect(await dataSource.getRepository(OrderLineEntity).count()).toBe(4);
        expect(await dataSource.getRepository(OrderEventEntity).count()).toBe(
            2,
        );
        expect(
            await dataSource
                .getRepository(AuditEventEntity)
                .count({ where: { action: 'order.submitted' } }),
        ).toBe(2);
    });

    it('conflicts on key reuse with a changed payload and scopes equal keys per user', async () => {
        const firstClient = await browser();
        const secondClient = await browser();
        const catalogProduct = await product();
        const sharedKey = nextKey();
        const first = await submit(
            firstClient,
            individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            sharedKey,
        ).expect(201);
        await submit(
            firstClient,
            individualBody([{ productId: catalogProduct.id, quantity: 2 }]),
            sharedKey,
        ).expect(409);
        const second = await submit(
            secondClient,
            individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            sharedKey,
        ).expect(201);
        expect(second.body.id).not.toBe(first.body.id);
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(2);
        expect(await dataSource.getRepository(OrderEventEntity).count()).toBe(
            2,
        );
    });

    it('enforces creator ownership, bounded pagination, status filter, and deterministic order', async () => {
        const owner = await browser();
        const otherMember = await browser();
        const linked = await organization(owner);
        await dataSource.getRepository(OrganizationMemberEntity).save({
            organizationId: linked.id,
            userId: otherMember.userId,
            role: 'representative',
            status: 'active',
            confirmedAt: new Date(),
        });
        const catalogProduct = await product();
        const first = await submit(
            owner,
            linkedBody(linked.id, [
                { productId: catalogProduct.id, quantity: 1 },
            ]),
        ).expect(201);
        const second = await submit(
            owner,
            linkedBody(linked.id, [
                { productId: catalogProduct.id, quantity: 2 },
            ]),
        ).expect(201);

        await otherMember.agent
            .get(`/api/client/orders/${first.body.id}`)
            .set('X-Forwarded-For', otherMember.ip)
            .expect(404);
        const foreignList = await otherMember.agent
            .get('/api/client/orders')
            .set('X-Forwarded-For', otherMember.ip)
            .expect(200);
        expect(foreignList.body.items).toHaveLength(0);

        const ownList = await owner.agent
            .get('/api/client/orders?status=submitted&page=1&limit=1')
            .set('X-Forwarded-For', owner.ip)
            .expect(200);
        expect(ownList.body).toEqual(
            expect.objectContaining({
                total: 2,
                page: 1,
                limit: 1,
                totalPages: 2,
            }),
        );
        expect(ownList.body.items[0].id).toBe(second.body.id);
        await owner.agent
            .get('/api/client/orders?limit=101')
            .set('X-Forwarded-For', owner.ip)
            .expect(400);
        await owner.agent
            .get('/api/client/orders?status=unknown')
            .set('X-Forwarded-For', owner.ip)
            .expect(400);
    });

    it('exposes parameterized read-only admin search only to sales managers and superadmins', async () => {
        const client = await browser();
        const linked = await organization(client);
        const catalogProduct = await product();
        const created = await submit(
            client,
            linkedBody(linked.id, [
                { productId: catalogProduct.id, quantity: 1 },
            ]),
        ).expect(201);

        const sales = await staff('sales-orders', ['sales_manager']);
        for (const search of [
            created.body.orderNumber,
            linked.inn,
            linked.name as string,
            '+79991234567',
            'client@example.com',
        ]) {
            const found = await sales.agent
                .get(`/admin/api/orders?search=${encodeURIComponent(search)}`)
                .expect(200);
            const items = found.body.items as Array<{ id: number }>;
            expect(items.map((item) => item.id)).toContain(created.body.id);
            expect(JSON.stringify(found.body)).not.toContain('idempotencyKey');
            expect(JSON.stringify(found.body)).not.toContain(
                'submissionFingerprint',
            );
        }
        await sales.agent
            .get(`/admin/api/orders/${created.body.id}`)
            .expect(200);
        const root = await staff('root-orders', ['superadmin']);
        await root.agent.get('/admin/api/orders').expect(200);
        const operator = await staff('operator-orders', ['operator']);
        await operator.agent.get('/admin/api/orders').expect(403);
        const engineer = await staff('engineer-orders', ['engineer']);
        await engineer.agent.get('/admin/api/orders').expect(403);

        const disabled = await staff('disabled-sales', ['sales_manager']);
        await auth.setActive(disabled.user.id, false);
        await disabled.agent.get('/admin/api/orders').expect(401);
        await sales.agent
            .post(`/admin/api/orders/${created.body.id}/confirm`)
            .set('Origin', ORIGIN)
            .send({})
            .expect(404);
    });

    it('rolls back order, lines, timeline, and audit on a transactional audit failure', async () => {
        const client = await browser();
        const catalogProduct = await product();
        await dataSource.query(
            `ALTER TABLE "audit_events" ADD CONSTRAINT "CK_test_reject_order_submit" CHECK ("action" <> 'order.submitted') NOT VALID`,
        );
        try {
            await submit(
                client,
                individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            ).expect(409);
        } finally {
            await dataSource.query(
                `ALTER TABLE "audit_events" DROP CONSTRAINT "CK_test_reject_order_submit"`,
            );
        }
        expect(await dataSource.getRepository(OrderEntity).count()).toBe(0);
        expect(await dataSource.getRepository(OrderLineEntity).count()).toBe(0);
        expect(await dataSource.getRepository(OrderEventEntity).count()).toBe(
            0,
        );
        expect(
            await dataSource
                .getRepository(AuditEventEntity)
                .count({ where: { action: 'order.submitted' } }),
        ).toBe(0);
    });

    it('requires web identity, UUID idempotency, same-origin mutation, and stable IP rate limiting', async () => {
        const catalogProduct = await product();
        await request(app.getHttpServer())
            .post('/api/client/orders')
            .set('Origin', ORIGIN)
            .set('Idempotency-Key', nextKey())
            .send(
                individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            )
            .expect(401);

        const client = await browser();
        await submit(
            client,
            individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            nextKey(),
            'https://attacker.example',
        ).expect(403);
        await client.agent
            .post('/api/client/orders')
            .set('X-Forwarded-For', client.ip)
            .set('Idempotency-Key', nextKey())
            .send(
                individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            )
            .expect(403);
        await submit(
            client,
            individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            'not-a-uuid',
        ).expect(400);
        await submit(client, {
            customerType: 'individual',
            delivery: { type: 'pickup' },
            items: [{ productId: catalogProduct.id, quantity: 1 }],
        }).expect(400);
        await submit(client, {
            customerType: 'individual',
            contact: { name: 'Иван Петров', phone: '+79991234567' },
            items: [{ productId: catalogProduct.id, quantity: 1 }],
        }).expect(400);
        await submit(client, {
            ...individualBody([{ productId: catalogProduct.id, quantity: 1 }]),
            userId: 999,
            chatId: 'attacker',
            platform: 'telegram',
        }).expect(400);

        const rotatingClients = await Promise.all(
            Array.from({ length: 11 }, () => browser()),
        );
        const rateIp = '10.250.0.1';
        const statuses: number[] = [];
        for (const rotating of rotatingClients) {
            const response = await rotating.agent
                .post('/api/client/orders')
                .set('X-Forwarded-For', rateIp)
                .set('Origin', ORIGIN)
                .set('Idempotency-Key', 'invalid')
                .send(
                    individualBody([
                        { productId: catalogProduct.id, quantity: 1 },
                    ]),
                );
            statuses.push(response.status);
        }
        expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400));
        expect(statuses[10]).toBe(429);
    });
});
