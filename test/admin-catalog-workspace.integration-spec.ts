import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { CatalogService } from '../src/catalog/catalog.service';
import { AuditService } from '../src/audit/audit.service';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { AdminUserRoleEntity } from '../src/admin/entities/admin-user-role.entity';
import { CatalogProductEntity } from '../src/catalog/entities/catalog-product.entity';
import {
    catalogWorkspaceFixture,
    raceAtCatalogLock,
    type CatalogProduct,
    type CatalogCategory,
} from './helpers/catalog-workspace-fixture';

jest.setTimeout(30000);
describe('FE-CAT-1 production Catalog on PostgreSQL', () => {
    let app: INestApplication<App>;
    let f: Awaited<ReturnType<typeof catalogWorkspaceFixture>>;
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = module.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
        f = await catalogWorkspaceFixture(app);
    });
    afterAll(async () => {
        if (app) await app.close();
    });
    const auditCount = (targetType: string, id: number) =>
        f.db
            .getRepository(AuditEventEntity)
            .countBy({ targetType, targetId: String(id), result: 'success' });
    const snapshot = (row: CatalogProduct) => ({
        expectedUpdatedAt: row.expectedUpdatedAt,
        expectedCategoryUpdatedAt: row.expectedCategoryUpdatedAt,
    });

    it('protects every command/read with existing catalog permissions', async () => {
        const row = await f.product();
        const reads = ['categories', 'products', `products/${row.id}`];
        const mutations = [
            ['categories', 'post'],
            [`categories/${row.categoryId}`, 'patch'],
            [`categories/${row.categoryId}/publish`, 'post'],
            [`categories/${row.categoryId}/unpublish`, 'post'],
            ['products', 'post'],
            [`products/${row.id}`, 'patch'],
            [`products/${row.id}/publish`, 'post'],
            [`products/${row.id}/unpublish`, 'post'],
        ] as const;
        for (const path of reads) {
            await f.admin.agent.get(`/admin/api/catalog/${path}`).expect(200);
            await f.sales.agent.get(`/admin/api/catalog/${path}`).expect(200);
            await f.operator.agent
                .get(`/admin/api/catalog/${path}`)
                .expect(403);
            await f.engineer.agent
                .get(`/admin/api/catalog/${path}`)
                .expect(403);
            await request(app.getHttpServer())
                .get(`/admin/api/catalog/${path}`)
                .expect(401);
        }
        for (const [path, method] of mutations) {
            await f.command(path, {}, method, f.operator.agent).expect(403);
            await f.command(path, {}, method, f.engineer.agent).expect(403);
        }
        await f
            .command(
                `products/${row.id}`,
                {
                    expectedUpdatedAt: row.expectedUpdatedAt,
                    brand: 'Admin edit',
                },
                'patch',
                f.admin.agent,
            )
            .expect(200);
        await f.sales.agent
            .patch(`/admin/api/catalog/products/${row.id}`)
            .set('Origin', 'https://invalid.example.test')
            .send({ name: 'bad' })
            .expect(403);
    });
    it('reauthorizes role removal while the editor is open', async () => {
        const row = await f.product();
        await f.db
            .getRepository(AdminUserRoleEntity)
            .delete({ userId: f.sales.user.id });
        try {
            await f
                .command(
                    `products/${row.id}`,
                    { name: 'bad', expectedUpdatedAt: row.expectedUpdatedAt },
                    'patch',
                )
                .expect(403);
        } finally {
            await f.db
                .getRepository(AdminUserRoleEntity)
                .save({ userId: f.sales.user.id, role: 'sales_manager' });
        }
        expect((await f.read(row.id)).name).toBe(row.name);
    });
    it.each([
        '0',
        '-1',
        '1.5',
        '+1',
        '1e3',
        '1abc',
        'Infinity',
        'NaN',
        '2147483648',
        '9007199254740992',
        '9'.repeat(100),
        '01',
    ])('rejects path %s before domain service', async (id) => {
        const service = app.get(CatalogService);
        const spies = [
            jest.spyOn(service, 'getAdminProduct'),
            jest.spyOn(service, 'updateProduct'),
            jest.spyOn(service, 'setProductPublished'),
            jest.spyOn(service, 'updateCategory'),
            jest.spyOn(service, 'setCategoryPublished'),
        ];
        try {
            for (const kind of ['categories', 'products']) {
                for (const suffix of ['', '/publish', '/unpublish']) {
                    const response = await f
                        .command(
                            `${kind}/${encodeURIComponent(id)}${suffix}`,
                            {},
                            suffix ? 'post' : 'patch',
                        )
                        .expect(400);
                    expect((response.body as { code: string }).code).toBe(
                        'VALIDATION_ERROR',
                    );
                    expect(JSON.stringify(response.body)).not.toMatch(
                        /SQLSTATE|QueryFailedError|out of range/,
                    );
                }
            }
            await f.sales.agent
                .get(`/admin/api/catalog/products/${encodeURIComponent(id)}`)
                .expect(400);
            for (const spy of spies) expect(spy).not.toHaveBeenCalled();
        } finally {
            spies.forEach((spy) => spy.mockRestore());
        }
    });
    it('allows maximum int32 through validation but returns missing 404 everywhere', async () => {
        for (const kind of ['categories', 'products']) {
            await f.command(`${kind}/2147483647`, {}, 'patch').expect(404);
            await f.command(`${kind}/2147483647/publish`).expect(404);
            await f.command(`${kind}/2147483647/unpublish`).expect(404);
        }
        await f.sales.agent
            .get('/admin/api/catalog/products/2147483647')
            .expect(404);
    });
    it('rejects out-of-range foreign keys and malformed preconditions before SQL', async () => {
        const row = await f.product();
        await f
            .command('categories', {
                name: 'Demo',
                slug: 'bad-parent',
                parentId: 2147483648,
            })
            .expect(400);
        await f
            .command(
                `categories/${row.categoryId}`,
                { parentId: 2147483648 },
                'patch',
            )
            .expect(400);
        await f
            .command('products', {
                name: 'Demo',
                sku: 'BAD',
                slug: 'bad',
                categoryId: 2147483648,
            })
            .expect(400);
        await f
            .command(`products/${row.id}`, { categoryId: 2147483648 }, 'patch')
            .expect(400);
        for (const expectedUpdatedAt of [
            null,
            '',
            'not-a-date',
            '2026-02-30T00:00:00.000Z',
        ])
            await f
                .command(`products/${row.id}/publish`, { expectedUpdatedAt })
                .expect(400);
    });
    it('preserves aliases and full content limits on partial updates, including zero price', async () => {
        let row = await f.product();
        const aliases = row.aliases;
        row = (
            await f
                .command(
                    `products/${row.id}`,
                    {
                        expectedUpdatedAt: row.expectedUpdatedAt,
                        displayPriceMinor: 0,
                        description: 'x'.repeat(20000),
                        features: [''],
                        specifications: { ['a'.repeat(100)]: 'b'.repeat(500) },
                    },
                    'patch',
                )
                .expect(200)
        ).body as CatalogProduct;
        expect(row.aliases).toEqual(aliases);
        expect(row.displayPriceMinor).toBe(0);
        expect(row.description).toHaveLength(20000);
        const old = row.expectedUpdatedAt;
        const edited = (
            await f
                .command(
                    `products/${row.id}`,
                    { expectedUpdatedAt: old, aliases: ['different alias'] },
                    'patch',
                )
                .expect(200)
        ).body as CatalogProduct;
        expect(edited.expectedUpdatedAt > old).toBe(true);
        await f
            .command(
                `products/${row.id}`,
                { expectedUpdatedAt: old, name: 'stale' },
                'patch',
            )
            .expect(409);
        await f
            .command(`products/${row.id}`, { aliases: ['Еж', 'Ёж'] }, 'patch')
            .expect(409);
        expect((await f.read(row.id)).aliases).toEqual(['different alias']);
    });
    it('reconciles a lost create response with a unique admin-only exact SKU read', async () => {
        const row = await f.product();
        const result = await f.sales.agent
            .get(
                `/admin/api/catalog/products?${new URLSearchParams({ sku: row.sku.toLowerCase(), limit: '1' })}`,
            )
            .expect(200);
        expect(
            (result.body as { items: CatalogProduct[] }).items.map(
                (item) => item.id,
            ),
        ).toEqual([row.id]);
        await request(app.getHttpServer())
            .get(`/api/catalog/products?sku=${row.sku}`)
            .expect(400);
        await f
            .command(`products/${row.id}`, { categoryId: null }, 'patch')
            .expect(400);
    });
    it('does not clear omitted nullable fields or category parent through DTO class properties', async () => {
        const parent = await f.category();
        const child = (
            await f
                .command('categories', {
                    name: 'Retain child',
                    slug: `retain-child-${parent.id}`,
                    parentId: parent.id,
                    description: 'keep description',
                    oneCRef: 'DEMO-REF',
                })
                .expect(201)
        ).body as CatalogCategory;
        const edited = (
            await f
                .command(
                    `categories/${child.id}`,
                    {
                        name: 'Renamed child',
                        expectedUpdatedAt: child.expectedUpdatedAt,
                    },
                    'patch',
                )
                .expect(200)
        ).body as CatalogCategory;
        expect(edited.parentId).toBe(parent.id);
        expect(edited.description).toBe('keep description');
        expect(edited.oneCRef).toBe('DEMO-REF');
        let product = await f.product(child);
        product = (
            await f
                .command(
                    `products/${product.id}`,
                    {
                        brand: 'DEMO BRAND',
                        shortDescription: 'short',
                        description: 'long',
                        oneCRef: 'DEMO-REF',
                        displayPriceMinor: 0,
                    },
                    'patch',
                )
                .expect(200)
        ).body as CatalogProduct;
        const renamed = (
            await f
                .command(
                    `products/${product.id}`,
                    {
                        name: 'Only this changes',
                        expectedUpdatedAt: product.expectedUpdatedAt,
                    },
                    'patch',
                )
                .expect(200)
        ).body as CatalogProduct;
        expect(renamed).toMatchObject({
            brand: 'DEMO BRAND',
            shortDescription: 'short',
            description: 'long',
            oneCRef: 'DEMO-REF',
            displayPriceMinor: 0,
        });
        const cleared = (
            await f
                .command(
                    `products/${product.id}`,
                    { brand: null, displayPriceMinor: null },
                    'patch',
                )
                .expect(200)
        ).body as CatalogProduct;
        expect(cleared.brand).toBeNull();
        expect(cleared.displayPriceMinor).toBeNull();
        expect(cleared.description).toBe('long');
    });
    it('protects two writes inside the same millisecond', async () => {
        const row = await f.product();
        const future = new Date(Date.now() + 100000);
        await f.db
            .getRepository(CatalogProductEntity)
            .update(row.id, { updatedAt: future });
        const current = await f.read(row.id);
        const one = (
            await f
                .command(
                    `products/${row.id}`,
                    {
                        expectedUpdatedAt: current.expectedUpdatedAt,
                        brand: 'one',
                    },
                    'patch',
                )
                .expect(200)
        ).body as CatalogProduct;
        expect(new Date(one.expectedUpdatedAt).getTime()).toBe(
            future.getTime() + 1,
        );
        await f
            .command(
                `products/${row.id}`,
                { expectedUpdatedAt: current.expectedUpdatedAt, brand: 'two' },
                'patch',
            )
            .expect(409);
    });
    it('keeps publication/active/category visibility distinct and public API safe', async () => {
        const cat = await f.category(false);
        let row = await f.product(cat);
        expect(row.actions.publish.reason).toBe('category_hidden');
        await f
            .command(`products/${row.id}/publish`, snapshot(row))
            .expect(409);
        await f
            .command(`categories/${cat.id}/publish`, {
                expectedUpdatedAt: cat.expectedUpdatedAt,
            })
            .expect(201);
        await f
            .command(`products/${row.id}/publish`, snapshot(row))
            .expect(409);
        row = await f.read(row.id);
        expect(row.actions.publish.allowed).toBe(true);
        row = (
            await f
                .command(`products/${row.id}/publish`, snapshot(row))
                .expect(201)
        ).body as CatalogProduct;
        expect(row.effectivePublicVisibility).toBe(true);
        const visible = await request(app.getHttpServer())
            .get(`/api/catalog/products/${row.slug}`)
            .expect(200);
        expect(JSON.stringify(visible.body)).not.toMatch(
            /expectedUpdatedAt|oneCRef|actions|aliases/,
        );
        const currentCategory = (await f.categories()).find(
            (item) => item.id === cat.id,
        )!;
        await f
            .command(`categories/${cat.id}/unpublish`, {
                expectedUpdatedAt: currentCategory.expectedUpdatedAt,
            })
            .expect(201);
        row = await f.read(row.id);
        expect(row.isPublished).toBe(true);
        expect(row.effectivePublicVisibility).toBe(false);
        await request(app.getHttpServer())
            .get(`/api/catalog/products/${row.slug}`)
            .expect(404);
        await f.command(`categories/${cat.id}/publish`).expect(201);
        await request(app.getHttpServer())
            .get(`/api/catalog/products/${row.slug}`)
            .expect(200);
        row = (
            await f
                .command(
                    `products/${row.id}`,
                    {
                        expectedUpdatedAt: row.expectedUpdatedAt,
                        isActive: false,
                    },
                    'patch',
                )
                .expect(200)
        ).body as CatalogProduct;
        expect(row.isPublished).toBe(false);
        expect(row.actions.publish.reason).toBe('inactive');
        await f
            .command(`products/${row.id}/publish`, snapshot(row))
            .expect(409);
        row = (
            await f
                .command(`products/${row.id}`, { isActive: true }, 'patch')
                .expect(200)
        ).body as CatalogProduct;
        expect(row.isPublished).toBe(false);
    });
    it('adds only admin filters and keeps Orders list response compatible', async () => {
        const cat = await f.category();
        const a = await f.product(cat);
        const b = await f.product(cat);
        await f.command(`products/${a.id}/publish`).expect(201);
        await f
            .command(`products/${b.id}`, { isActive: false }, 'patch')
            .expect(200);
        const response = await f.sales.agent
            .get(
                `/admin/api/catalog/products?category=${cat.slug}&active=active&publication=published&limit=1`,
            )
            .expect(200);
        const body = response.body as {
            items: CatalogProduct[];
            total: number;
            totalPages: number;
        };
        expect(body.total).toBe(1);
        expect(body.totalPages).toBe(1);
        expect(body.items[0]).toMatchObject({
            id: a.id,
            name: a.name,
            sku: a.sku,
            displayPriceMinor: a.displayPriceMinor,
            isActive: true,
            availabilityStatus: 'in_stock',
        });
        await f.sales.agent
            .get('/admin/api/catalog/products?active=garbage')
            .expect(400);
        const publicList = await request(app.getHttpServer())
            .get(
                `/api/catalog/products?category=${cat.slug}&search=${a.sku}&availability=in_stock&limit=1`,
            )
            .expect(200);
        expect(
            (publicList.body as typeof body).items.map((row) => row.id),
        ).toEqual([a.id]);
        await request(app.getHttpServer())
            .get('/api/catalog/products?active=inactive')
            .expect(400);
    });
    it.each(['edit/edit', 'edit/publish', 'publish/deactivate'])(
        'serializes product %s with one 409 and no false Audit',
        async (race) => {
            const row = await f.product();
            const before = await auditCount('catalog_product', row.id);
            const edit = (values: object) =>
                f.command(
                    `products/${row.id}`,
                    { expectedUpdatedAt: row.expectedUpdatedAt, ...values },
                    'patch',
                );
            const publish = () =>
                f.command(`products/${row.id}/publish`, snapshot(row));
            const commands =
                race === 'edit/edit'
                    ? [
                          () => edit({ name: 'Winner A' }),
                          () => edit({ name: 'Winner B' }),
                      ]
                    : race === 'edit/publish'
                      ? [() => edit({ brand: 'changed' }), publish]
                      : [publish, () => edit({ isActive: false })];
            const outcomes = await raceAtCatalogLock(
                f.db,
                'catalog_products',
                row.id,
                commands,
            );
            expect(outcomes.map((result) => result.status).sort()).toEqual([
                race === 'edit/edit' ? 200 : expect.any(Number),
                409,
            ]);
            expect(
                outcomes.filter((result) => result.status < 300),
            ).toHaveLength(1);
            expect(await auditCount('catalog_product', row.id)).toBe(
                before + 1,
            );
            expect(
                (await f.read(row.id)).expectedUpdatedAt >
                    row.expectedUpdatedAt,
            ).toBe(true);
        },
    );
    it.each(['edit/edit', 'publish/edit', 'unpublish/edit'])(
        'serializes category %s with one 409 and no false Audit',
        async (race) => {
            const row = await f.category(race !== 'publish/edit');
            const before = await auditCount('catalog_category', row.id);
            const edit = (name: string) =>
                f.command(
                    `categories/${row.id}`,
                    { expectedUpdatedAt: row.expectedUpdatedAt, name },
                    'patch',
                );
            const first =
                race === 'edit/edit'
                    ? () => edit('A')
                    : () =>
                          f.command(
                              `categories/${row.id}/${race.startsWith('unpublish') ? 'unpublish' : 'publish'}`,
                              { expectedUpdatedAt: row.expectedUpdatedAt },
                          );
            const outcomes = await raceAtCatalogLock(
                f.db,
                'catalog_categories',
                row.id,
                [first, () => edit('B')],
            );
            expect(
                outcomes.filter((result) => result.status < 300),
            ).toHaveLength(1);
            expect(
                outcomes.filter((result) => result.status === 409),
            ).toHaveLength(1);
            expect(await auditCount('catalog_category', row.id)).toBe(
                before + 1,
            );
        },
    );
    it('orders category publication against product publication using the dependency snapshot', async () => {
        const cat = await f.category(false);
        const row = await f.product(cat);
        const before = await auditCount('catalog_product', row.id);
        const outcomes = await raceAtCatalogLock(
            f.db,
            'catalog_categories',
            cat.id,
            [
                () =>
                    f.command(`categories/${cat.id}/publish`, {
                        expectedUpdatedAt: cat.expectedUpdatedAt,
                    }),
                () => f.command(`products/${row.id}/publish`, snapshot(row)),
            ],
        );
        expect(outcomes.map((result) => result.status)).toEqual([201, 409]);
        expect(await auditCount('catalog_product', row.id)).toBe(before);
        const fresh = await f.read(row.id);
        await f
            .command(`products/${row.id}/publish`, snapshot(fresh))
            .expect(201);
    });
    it('rejects hierarchy cycles and rolls back domain mutation if Audit fails', async () => {
        const cat = await f.category();
        const child = (
            await f
                .command('categories', {
                    name: 'Child',
                    slug: `child-${cat.id}`,
                    parentId: cat.id,
                })
                .expect(201)
        ).body as CatalogCategory;
        await f
            .command(`categories/${cat.id}`, { parentId: child.id }, 'patch')
            .expect(409);
        const row = await f.product(cat);
        const spy = jest
            .spyOn(app.get(AuditService), 'record')
            .mockRejectedValueOnce(new Error('synthetic audit failure'));
        try {
            await f
                .command(
                    `products/${row.id}`,
                    {
                        name: 'must rollback',
                        expectedUpdatedAt: row.expectedUpdatedAt,
                    },
                    'patch',
                )
                .expect(500);
        } finally {
            spy.mockRestore();
        }
        const reread = await f.read(row.id);
        expect(reread.name).toBe(row.name);
        expect(reread.expectedUpdatedAt).toBe(row.expectedUpdatedAt);
    });
});
