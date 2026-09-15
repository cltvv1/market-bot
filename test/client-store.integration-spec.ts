import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApplication } from '../src/app.bootstrap';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/catalog/catalog.service';
import { CatalogProductEntity } from '../src/catalog/entities/catalog-product.entity';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { OrderEventEntity } from '../src/orders/entities/order-event.entity';
import { catalogWorkspaceFixture } from './helpers/catalog-workspace-fixture';

jest.setTimeout(30000);
describe('FE-STORE-1 public cart and canonical intake on PostgreSQL', () => {
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
    const publicResolve = (ids: unknown, extra: object = {}) =>
        request(app.getHttpServer())
            .post('/api/catalog/products/resolve')
            .send({ ids, ...extra });
    const publicBody = (response: request.Response) =>
        response.body as { items: Array<Record<string, unknown>> };
    async function published() {
        const product = await f.product();
        await f
            .command(`products/${product.id}/publish`, {
                expectedUpdatedAt: product.expectedUpdatedAt,
                expectedCategoryUpdatedAt: product.expectedCategoryUpdatedAt,
            })
            .expect(201);
        return product;
    }
    it.each(
        [
            [],
            [0],
            [-1],
            [1.2],
            ['1'],
            [2147483648],
            [1, 1],
            Array.from({ length: 101 }, (_, i) => i + 1),
        ].map((ids) => [ids]),
    )('rejects invalid batch %j before service/SQL', async (ids) => {
        const spy = jest.spyOn(
            app.get(CatalogService),
            'resolvePublicProducts',
        );
        try {
            await publicResolve(ids).expect(400);
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });
    it('rejects unknown fields and accepts maximum bounded missing ID without leaking it', async () => {
        await publicResolve([1], { admin: true }).expect(400);
        const result = await publicResolve([2147483647]).expect(201);
        expect(result.body).toEqual({ items: [] });
        expect(result.headers['set-cookie']).toBeUndefined();
    });
    it('hydrates only public-visible rows, safely sorted by ID with no admin fields', async () => {
        const a = await published();
        const b = await published();
        const hidden = await f.product();
        const result = await publicResolve([b.id, hidden.id, a.id]).expect(201);
        const rows = publicBody(result).items;
        expect(rows.map((row) => row.id)).toEqual([a.id, b.id]);
        for (const row of rows)
            for (const key of [
                'isActive',
                'isPublished',
                'oneCRef',
                'oneCSyncedAt',
                'actions',
                'expectedUpdatedAt',
                'aliases',
            ])
                expect(row).not.toHaveProperty(key);
        expect(result.headers['set-cookie']).toBeUndefined();
        await f.command(`categories/${a.categoryId}/unpublish`).expect(201);
        expect((await publicResolve([a.id]).expect(201)).body).toEqual({
            items: [],
        });
        await f
            .command(`products/${b.id}`, { isActive: false }, 'patch')
            .expect(200);
        expect((await publicResolve([b.id]).expect(201)).body).toEqual({
            items: [],
        });
    });
    it('hydrates changed price, zero/null prices and real unavailable status without stale metadata', async () => {
        const row = await published();
        for (const price of [1599, 0, null]) {
            await f
                .command(
                    `products/${row.id}`,
                    { displayPriceMinor: price },
                    'patch',
                )
                .expect(200);
            const result = await publicResolve([row.id]).expect(201);
            expect(publicBody(result).items[0].displayPriceMinor).toBe(price);
        }
        await f
            .command(
                `products/${row.id}`,
                { availabilityStatus: 'unavailable' },
                'patch',
            )
            .expect(200);
        expect(
            publicBody(await publicResolve([row.id]).expect(201)).items[0]
                .availabilityStatus,
        ).toBe('unavailable');
    });
    it('same-user exact replay after lost response retains one order, one event and one Audit', async () => {
        const row = await published();
        const agent = request.agent(app.getHttpServer());
        await agent.post('/api/client/session').send({}).expect(201);
        const payload = {
            customerType: 'individual',
            contact: { name: 'Synthetic customer', phone: '12345' },
            delivery: { type: 'transport_company', city: 'Synthetic city' },
            items: [{ productId: row.id, quantity: 2 }],
        };
        const key = randomUUID();
        const submit = (body = payload, suppliedKey = key) =>
            agent
                .post('/api/client/orders')
                .set('Origin', f.origin)
                .set('Idempotency-Key', suppliedKey)
                .send(body);
        const first = await submit().expect(201);
        const firstBody = first.body as { id: number; lines: unknown[] };
        await f
            .command(`products/${row.id}`, { displayPriceMinor: 0 }, 'patch')
            .expect(200);
        const replay = await submit().expect(201);
        expect(replay.body).toMatchObject({
            id: firstBody.id,
            lines: firstBody.lines,
        });
        await submit({
            ...payload,
            items: [{ productId: row.id, quantity: 3 }],
        }).expect(409);
        expect(
            await f.db
                .getRepository(OrderEventEntity)
                .countBy({ orderId: firstBody.id, type: 'submitted' }),
        ).toBe(1);
        expect(
            await f.db.getRepository(AuditEventEntity).countBy({
                targetId: String(firstBody.id),
                targetType: 'order',
                action: 'order.submitted',
            }),
        ).toBe(1);
        const second = await submit(payload, randomUUID()).expect(201);
        expect(second.body).not.toMatchObject({ id: firstBody.id });
        const other = request.agent(app.getHttpServer());
        await other.post('/api/client/session').send({}).expect(201);
        await other.get(`/api/client/orders/${firstBody.id}`).expect(404);
    });
    it.each(['in_stock', 'low_stock', 'on_request', 'unavailable'] as const)(
        'intake stays authoritative for availability %s',
        async (availability) => {
            const row = await published();
            await f.db.getRepository(CatalogProductEntity).update(row.id, {
                availabilityStatus: availability,
                displayPriceMinor: null,
            });
            const agent = request.agent(app.getHttpServer());
            await agent.post('/api/client/session').send({}).expect(201);
            const result = await agent
                .post('/api/client/orders')
                .set('Origin', f.origin)
                .set('Idempotency-Key', randomUUID())
                .send({
                    customerType: 'individual',
                    contact: { name: 'Synthetic', phone: '+1 2345' },
                    delivery: { type: 'pickup' },
                    items: [{ productId: row.id, quantity: 1 }],
                })
                .expect(availability === 'unavailable' ? 409 : 201);
            if (availability !== 'unavailable')
                expect(result.body).toMatchObject({
                    hasUnpricedItems: true,
                    catalogTotalMinor: null,
                });
        },
    );
});
