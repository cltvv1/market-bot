import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AdminAuthService } from '../../src/admin/admin-auth.service';
import type { AdminRole } from '../../src/admin/entities/admin-user-role.entity';
import type { CatalogService } from '../../src/catalog/catalog.service';

export type CatalogProduct = Awaited<
    ReturnType<CatalogService['getAdminProduct']>
>;
export type CatalogCategory = Awaited<
    ReturnType<CatalogService['createCategory']>
>;

export async function catalogWorkspaceFixture(app: INestApplication<App>) {
    const db = app.get(DataSource);
    const auth = app.get(AdminAuthService);
    const password = randomUUID() + '!Aa1';
    const origin = 'http://localhost:5173';
    let sequence = 0;
    const suffix = randomUUID().slice(0, 8);
    async function staff(role: AdminRole) {
        const login = `cat-${role}-${suffix}`;
        const user = await auth.createStaff({
            login,
            displayName: `Catalog demo ${role}`,
            password,
            roles: [role],
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .send({ login, password })
            .expect(201);
        return { user, agent };
    }
    const sales = await staff('sales_manager');
    const admin = await staff('superadmin');
    const operator = await staff('operator');
    const engineer = await staff('engineer');
    const command = (
        path: string,
        body: object = {},
        method: 'post' | 'patch' = 'post',
        agent = sales.agent,
    ) =>
        agent[method](`/admin/api/catalog/${path}`)
            .set('Origin', origin)
            .send(body);
    const read = async (id: number) =>
        (await sales.agent.get(`/admin/api/catalog/products/${id}`).expect(200))
            .body as CatalogProduct;
    const categories = async () =>
        (await sales.agent.get('/admin/api/catalog/categories').expect(200))
            .body as CatalogCategory[];
    async function category(published = true) {
        const slug = `category-${suffix}-${++sequence}`;
        let row = (
            await command('categories', { slug, name: `Demo ${slug}` }).expect(
                201,
            )
        ).body as CatalogCategory;
        if (published)
            row = (
                await command(`categories/${row.id}/publish`, {
                    expectedUpdatedAt: row.expectedUpdatedAt,
                }).expect(201)
            ).body as CatalogCategory;
        return row;
    }
    async function product(cat?: CatalogCategory) {
        cat ??= await category();
        const slug = `product-${suffix}-${++sequence}`;
        return (
            await command('products', {
                categoryId: cat.id,
                slug,
                sku: slug,
                name: `Demo ${slug}`,
                displayPriceMinor: 120050,
                vatRate: 2000,
                availabilityStatus: 'in_stock',
                aliases: [`alias ${slug}`],
            }).expect(201)
        ).body as CatalogProduct;
    }
    return {
        db,
        auth,
        password,
        origin,
        sales,
        admin,
        operator,
        engineer,
        command,
        read,
        categories,
        category,
        product,
    };
}

export async function raceAtCatalogLock(
    db: DataSource,
    table: 'catalog_products' | 'catalog_categories',
    id: number,
    commands: Array<() => PromiseLike<request.Response>>,
) {
    const blocker = db.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    const [{ pid }] = (await blocker.query(
        'SELECT pg_backend_pid() AS pid',
    )) as Array<{ pid: number }>;
    await blocker.query(`SELECT id FROM "${table}" WHERE id = $1 FOR UPDATE`, [
        id,
    ]);
    const pending = commands.map((command) => Promise.resolve(command()));
    try {
        const deadline = Date.now() + 15000;
        let blocked = 0;
        while (Date.now() < deadline) {
            const [{ count }] = await db.query<Array<{ count: number }>>(
                `WITH RECURSIVE blocked AS (
                SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))
                UNION SELECT activity.pid FROM pg_stat_activity activity JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
            ) SELECT COUNT(*)::int AS count FROM blocked`,
                [pid],
            );
            blocked = count;
            if (blocked >= commands.length) break;
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
        assert.ok(
            blocked >= commands.length,
            'Both commands reached PostgreSQL row-lock barrier',
        );
    } finally {
        await blocker.rollbackTransaction();
        await blocker.release();
    }
    return Promise.all(pending);
}
