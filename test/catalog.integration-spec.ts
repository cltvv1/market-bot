/* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import request, { type Response } from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import type { AdminRole } from '../src/admin/entities/admin-user-role.entity';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { configureApplication } from '../src/app.bootstrap';
import { AppModule } from '../src/app.module';
import { CatalogCategoryEntity } from '../src/catalog/entities/catalog-category.entity';
import { CatalogProductAliasEntity } from '../src/catalog/entities/catalog-product-alias.entity';
import { CatalogProductEntity } from '../src/catalog/entities/catalog-product.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';

describe('catalog foundation on migrated PostgreSQL', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let ip = 80;

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

    const nextIp = () => `10.80.0.${++ip}`;

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
        return { agent, user };
    }

    function mutate(
        agent: ReturnType<typeof request.agent>,
        method: 'post' | 'patch',
        path: string,
    ) {
        return agent[method](path).set('Origin', ORIGIN);
    }

    async function createCategory(
        agent: ReturnType<typeof request.agent>,
        slug: string,
        options: {
            parentId?: number;
            publish?: boolean;
            sortOrder?: number;
        } = {},
    ) {
        const created = await mutate(
            agent,
            'post',
            '/admin/api/catalog/categories',
        )
            .send({
                name: `Category ${slug}`,
                slug,
                parentId: options.parentId,
                sortOrder: options.sortOrder,
            })
            .expect(201);
        if (options.publish) {
            await mutate(
                agent,
                'post',
                `/admin/api/catalog/categories/${created.body.id}/publish`,
            ).expect(201);
        }
        return created.body as { id: number; slug: string };
    }

    async function createProduct(
        agent: ReturnType<typeof request.agent>,
        categoryId: number,
        input: Record<string, unknown> = {},
    ) {
        const suffix = String(input.suffix ?? Math.floor(Math.random() * 1e8));
        const payload = {
            categoryId,
            sku: `vm-${suffix}`,
            slug: `product-${suffix}`,
            name: `Product ${suffix}`,
            brand: 'VITMA',
            displayPriceMinor: 3_100_000,
            vatRate: 2000,
            availabilityStatus: 'in_stock',
            features: ['Feature'],
            specifications: { Model: suffix },
            packageContents: ['Product'],
            aliases: [`Alias ${suffix}`],
            ...input,
        };
        delete payload.suffix;
        return mutate(agent, 'post', '/admin/api/catalog/products')
            .send(payload)
            .expect(201);
    }

    async function publishProduct(
        agent: ReturnType<typeof request.agent>,
        id: number,
    ) {
        return mutate(
            agent,
            'post',
            `/admin/api/catalog/products/${id}/publish`,
        ).expect(201);
    }

    async function expectPostgresCode(
        operation: Promise<unknown>,
        expectedCode: string,
    ) {
        await expect(operation).rejects.toMatchObject({
            driverError: { code: expectedCode },
        });
    }

    it('creates catalog tables, foreign keys, checks, and indexes', async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_name LIKE 'catalog_%'
             ORDER BY table_name`,
        );
        expect(tables.map(({ table_name }) => table_name)).toEqual([
            'catalog_categories',
            'catalog_product_aliases',
            'catalog_products',
        ]);

        const constraints: Array<{ conname: string }> = await dataSource.query(
            `SELECT conname FROM pg_constraint
             WHERE conname LIKE 'CK_catalog_%' OR conname LIKE 'FK_catalog_%'
             ORDER BY conname`,
        );
        expect(constraints.map(({ conname }) => conname)).toEqual(
            expect.arrayContaining([
                'CK_catalog_categories_not_self_parent',
                'CK_catalog_products_availability',
                'CK_catalog_products_price_nonnegative',
                'CK_catalog_products_vat_rate',
                'FK_catalog_categories_parent',
                'FK_catalog_product_aliases_product',
                'FK_catalog_products_category',
            ]),
        );
    });

    it('enforces slug, SKU, FK, money, and normalized alias constraints in PostgreSQL', async () => {
        const categories = dataSource.getRepository(CatalogCategoryEntity);
        const products = dataSource.getRepository(CatalogProductEntity);
        const aliases = dataSource.getRepository(CatalogProductAliasEntity);
        const category = await categories.save(
            categories.create({
                name: 'Cash registers',
                slug: 'cash-registers',
                parentId: null,
                description: null,
                sortOrder: 0,
                isPublished: true,
                oneCRef: null,
            }),
        );
        await expectPostgresCode(
            categories.save(
                categories.create({
                    ...category,
                    id: undefined,
                    name: 'Duplicate',
                }),
            ),
            '23505',
        );

        const base = products.create({
            categoryId: category.id,
            sku: 'VM-1001',
            slug: 'atol-30f',
            name: 'ATOL 30F',
            brand: 'ATOL',
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
        });
        const product = await products.save(base);
        await expectPostgresCode(
            products.save(
                products.create({ ...base, id: undefined, sku: 'VM-1002' }),
            ),
            '23505',
        );
        await expectPostgresCode(
            products.save(
                products.create({
                    ...base,
                    id: undefined,
                    slug: 'atol-55f',
                }),
            ),
            '23505',
        );
        await expectPostgresCode(
            products.save(
                products.create({
                    ...base,
                    id: undefined,
                    sku: 'VM-BAD-FK',
                    slug: 'bad-fk',
                    categoryId: 999_999,
                }),
            ),
            '23503',
        );
        await expectPostgresCode(
            products.save(
                products.create({
                    ...base,
                    id: undefined,
                    sku: 'VM-NEGATIVE',
                    slug: 'negative',
                    displayPriceMinor: -1,
                }),
            ),
            '23514',
        );

        await aliases.save({
            productId: product.id,
            alias: 'TLP 100',
            normalizedAlias: 'TLP100',
        });
        await expectPostgresCode(
            aliases.save({
                productId: product.id,
                alias: 'TLP-100',
                normalizedAlias: 'TLP100',
            }),
            '23505',
        );
    });

    it('prevents category self-parenting and application-level cycles', async () => {
        const { agent } = await staff('catalog-cycle', ['sales_manager']);
        const root = await createCategory(agent, 'root');
        const child = await createCategory(agent, 'child', {
            parentId: root.id,
        });

        await mutate(agent, 'patch', `/admin/api/catalog/categories/${root.id}`)
            .send({ parentId: root.id })
            .expect(409);
        await mutate(agent, 'patch', `/admin/api/catalog/categories/${root.id}`)
            .send({ parentId: child.id })
            .expect(409);
    });

    it('returns only published categories in deterministic order', async () => {
        const { agent } = await staff('catalog-categories', ['sales_manager']);
        await createCategory(agent, 'second', { publish: true, sortOrder: 20 });
        await createCategory(agent, 'hidden', { sortOrder: 0 });
        await createCategory(agent, 'first-b', {
            publish: true,
            sortOrder: 10,
        });
        await createCategory(agent, 'first-a', {
            publish: true,
            sortOrder: 10,
        });

        const response = await request(app.getHttpServer())
            .get('/api/catalog/categories')
            .expect(200);
        expect(
            response.body.map((item: { slug: string }) => item.slug),
        ).toEqual(['first-a', 'first-b', 'second']);
        expect(response.body[0]).not.toHaveProperty('oneCRef');
        expect(response.body[0]).not.toHaveProperty('isPublished');
    });

    it('supports bounded pagination and category, availability, and all search fields', async () => {
        const { agent } = await staff('catalog-search', ['sales_manager']);
        const cash = await createCategory(agent, 'cash', { publish: true });
        const scanners = await createCategory(agent, 'scanners', {
            publish: true,
        });
        const first = await createProduct(agent, cash.id, {
            suffix: '1001',
            sku: 'VM-CASH-1001',
            slug: 'atol-sigma',
            name: 'ATOL Sigma',
            brand: 'ATOL',
            availabilityStatus: 'in_stock',
            aliases: ['Sigma касса'],
        });
        const second = await createProduct(agent, scanners.id, {
            suffix: '2001',
            sku: 'VM-SCAN-2001',
            slug: 'mertech-scan',
            name: 'Barcode reader',
            brand: 'MERTECH',
            availabilityStatus: 'low_stock',
            aliases: ['TLP 100 Terra Nova'],
        });
        await publishProduct(agent, first.body.id);
        await publishProduct(agent, second.body.id);

        const assertions: Array<[string, string]> = [
            ['search=Sigma', 'atol-sigma'],
            ['search=VM-SCAN', 'mertech-scan'],
            ['search=MERTECH', 'mertech-scan'],
            ['search=TLP100', 'mertech-scan'],
            ['category=cash', 'atol-sigma'],
            ['availability=low_stock', 'mertech-scan'],
        ];
        for (const [query, expectedSlug] of assertions) {
            const result = await request(app.getHttpServer())
                .get(`/api/catalog/products?${query}`)
                .expect(200);
            expect(result.body.items).toHaveLength(1);
            expect(result.body.items[0].slug).toBe(expectedSlug);
        }

        const paged = await request(app.getHttpServer())
            .get('/api/catalog/products?page=2&limit=1')
            .expect(200);
        expect(paged.body).toMatchObject({
            total: 2,
            page: 2,
            limit: 1,
            totalPages: 2,
        });
        expect(paged.body.items).toHaveLength(1);
        await request(app.getHttpServer())
            .get('/api/catalog/products?limit=101')
            .expect(400);
        const punctuation = await request(app.getHttpServer())
            .get('/api/catalog/products?search=%21%21%21')
            .expect(200);
        expect(punctuation.body.items).toEqual([]);
    });

    it('never exposes unpublished, inactive, or unpublished-category products', async () => {
        const { agent } = await staff('catalog-visibility', ['sales_manager']);
        const visibleCategory = await createCategory(agent, 'visible', {
            publish: true,
        });
        const hiddenCategory = await createCategory(agent, 'hidden');
        const visible = await createProduct(agent, visibleCategory.id, {
            suffix: 'visible',
            slug: 'visible-product',
        });
        const draft = await createProduct(agent, visibleCategory.id, {
            suffix: 'draft',
            slug: 'draft-product',
        });
        const hiddenByCategory = await createProduct(agent, hiddenCategory.id, {
            suffix: 'hidden-category',
            slug: 'hidden-category-product',
        });
        await publishProduct(agent, visible.body.id);
        await mutate(
            agent,
            'post',
            `/admin/api/catalog/products/${hiddenByCategory.body.id}/publish`,
        ).expect(409);
        await dataSource
            .getRepository(CatalogProductEntity)
            .update(hiddenByCategory.body.id, { isPublished: true });

        const initial = await request(app.getHttpServer())
            .get('/api/catalog/products')
            .expect(200);
        expect(
            initial.body.items.map((item: { slug: string }) => item.slug),
        ).toEqual(['visible-product']);
        await request(app.getHttpServer())
            .get(`/api/catalog/products/${draft.body.slug}`)
            .expect(404);
        await request(app.getHttpServer())
            .get('/api/catalog/products/hidden-category-product')
            .expect(404);

        await mutate(
            agent,
            'patch',
            `/admin/api/catalog/products/${visible.body.id}`,
        )
            .send({ isActive: false })
            .expect(200);
        await request(app.getHttpServer())
            .get('/api/catalog/products/visible-product')
            .expect(404);
    });

    it('roundtrips null, zero, and exact integer minor-unit prices and rejects fractions', async () => {
        const { agent } = await staff('catalog-money', ['sales_manager']);
        const category = await createCategory(agent, 'money', {
            publish: true,
        });
        const noPrice = await createProduct(agent, category.id, {
            suffix: 'no-price',
            slug: 'no-price',
            displayPriceMinor: null,
        });
        const free = await createProduct(agent, category.id, {
            suffix: 'zero',
            slug: 'zero-price',
            displayPriceMinor: 0,
        });
        const exact = await createProduct(agent, category.id, {
            suffix: 'exact',
            slug: 'exact-price',
            displayPriceMinor: 2_147_483_647,
        });
        await Promise.all(
            [noPrice, free, exact].map((response) =>
                publishProduct(agent, response.body.id),
            ),
        );
        const list = await request(app.getHttpServer())
            .get('/api/catalog/products?limit=10')
            .expect(200);
        const prices = Object.fromEntries(
            list.body.items.map(
                (item: { slug: string; displayPriceMinor: number | null }) => [
                    item.slug,
                    item.displayPriceMinor,
                ],
            ),
        );
        expect(prices).toMatchObject({
            'no-price': null,
            'zero-price': 0,
            'exact-price': 2_147_483_647,
        });

        await mutate(agent, 'post', '/admin/api/catalog/products')
            .send({
                categoryId: category.id,
                sku: 'VM-FRACTION',
                slug: 'fraction-price',
                name: 'Fraction',
                displayPriceMinor: 10.5,
            })
            .expect(400);
        await mutate(agent, 'post', '/admin/api/catalog/products')
            .send({
                categoryId: category.id,
                sku: 'VM-NEGATIVE',
                slug: 'negative-price',
                name: 'Negative',
                displayPriceMinor: -1,
            })
            .expect(400);
    });

    it('replaces aliases transactionally and maps duplicate normalized aliases to conflict', async () => {
        const { agent } = await staff('catalog-aliases', ['sales_manager']);
        const category = await createCategory(agent, 'aliases');
        const product = await createProduct(agent, category.id, {
            suffix: 'alias',
            aliases: ['TLP 100'],
        });

        await mutate(
            agent,
            'patch',
            `/admin/api/catalog/products/${product.body.id}`,
        )
            .send({ aliases: ['TLP 100', 'TLP-100'] })
            .expect(409);
        const stored = await dataSource
            .getRepository(CatalogProductAliasEntity)
            .find({ where: { productId: product.body.id } });
        expect(stored.map((alias) => alias.alias)).toEqual(['TLP 100']);
    });

    it('enforces catalog permissions for sales, superadmin, operator, engineer, and disabled staff', async () => {
        const sales = await staff('catalog-sales', ['sales_manager']);
        const root = await staff('catalog-root', ['superadmin']);
        const operator = await staff('catalog-operator', ['operator']);
        const engineer = await staff('catalog-engineer', ['engineer']);

        await sales.agent.get('/admin/api/catalog/categories').expect(200);
        await createCategory(sales.agent, 'sales-created');
        await root.agent.get('/admin/api/catalog/products').expect(200);
        await createCategory(root.agent, 'root-created');

        for (const denied of [operator.agent, engineer.agent]) {
            await denied.get('/admin/api/catalog/categories').expect(403);
            await mutate(denied, 'post', '/admin/api/catalog/categories')
                .send({
                    name: 'Denied',
                    slug: `denied-${nextIp().split('.').pop()}`,
                })
                .expect(403);
        }
        expect(
            await dataSource.getRepository(CatalogCategoryEntity).count(),
        ).toBe(2);

        await auth.setActive(sales.user.id, false);
        await sales.agent.get('/admin/api/catalog/categories').expect(401);
    });

    it('records compact transactional audit events for catalog mutations', async () => {
        const { agent } = await staff('catalog-audit', ['sales_manager']);
        const category = await createCategory(agent, 'audit', {
            publish: true,
        });
        const product = await createProduct(agent, category.id, {
            suffix: 'audit',
            description:
                'This large body must not be copied into audit metadata',
            specifications: { SecretDetail: 'Not audit metadata' },
        });
        await publishProduct(agent, product.body.id);

        const events = await dataSource.getRepository(AuditEventEntity).find({
            where: { targetType: 'catalog_product' },
            order: { id: 'ASC' },
        });
        expect(events.map((event) => event.action)).toEqual([
            'catalog.product.create',
            'catalog.product.publish',
        ]);
        expect(events[0].metadata).toEqual({
            sku: 'VM-AUDIT',
            slug: 'product-audit',
        });
        expect(JSON.stringify(events)).not.toContain('SecretDetail');
    });

    it('returns controlled conflicts for concurrent duplicate SKU and slug writes', async () => {
        const { agent } = await staff('catalog-conflicts', ['sales_manager']);
        const category = await createCategory(agent, 'conflicts');
        const payload = {
            categoryId: category.id,
            sku: 'VM-CONCURRENT',
            slug: 'concurrent-product',
            name: 'Concurrent product',
        };
        const [first, second] = await Promise.all([
            mutate(agent, 'post', '/admin/api/catalog/products').send(payload),
            mutate(agent, 'post', '/admin/api/catalog/products').send(payload),
        ]);
        expect([first.status, second.status].sort()).toEqual([201, 409]);
        const rejected = [first, second].find(
            (item) => item.status === 409,
        ) as Response;
        expect(rejected.body).toMatchObject({ code: 'CONFLICT' });
        expect(JSON.stringify(rejected.body)).not.toContain('duplicate key');
        expect(
            await dataSource.getRepository(CatalogProductEntity).count(),
        ).toBe(1);
    });
});
