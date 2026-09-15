import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { AdminUserRoleEntity } from '../src/admin/entities/admin-user-role.entity';
import { OrderEntity } from '../src/orders/entities/order.entity';
import { OrderEventEntity } from '../src/orders/entities/order-event.entity';
import { OrderDocumentEntity } from '../src/orders/entities/order-document.entity';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { FilesService } from '../src/files/files.service';
import type { OrderDetail } from '../admin-ui/src/features/orders/types';
import {
    orderWorkspaceFixture,
    raceAtOrderLock,
} from './helpers/order-workspace-fixture';

jest.setTimeout(30000);

describe('FE-ORD-1 admin Orders workspace on PostgreSQL', () => {
    let app: INestApplication<App>;
    let f: Awaited<ReturnType<typeof orderWorkspaceFixture>>;
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
        f = await orderWorkspaceFixture(app);
    });
    afterAll(async () => {
        if (app) await app.close();
    });
    it('exposes narrow eligible assignees without generic staff.read or sensitive fields', async () => {
        const row = await f.create();
        await f.sales.agent.get('/admin/api/staff/engineers').expect(403);
        const response = await f.sales.agent
            .get(`/admin/api/orders/${row.id}/assignees`)
            .expect(200);
        const body = response.body as {
            items: Array<{ id: number; displayName: string }>;
            version: number;
        };
        expect(body.items.map((item) => item.id)).toEqual(
            expect.arrayContaining([
                f.sales.user.id,
                f.admin.user.id,
                f.second.user.id,
            ]),
        );
        expect(body.items.map((item) => item.id)).not.toContain(
            f.operator.user.id,
        );
        expect(body.items.map((item) => item.id)).not.toContain(
            f.engineer.user.id,
        );
        expect(
            body.items.every(
                (item) =>
                    Object.keys(item).sort().join(',') === 'displayName,id',
            ),
        ).toBe(true);
        await f.db
            .getRepository(AdminUserEntity)
            .update(f.second.user.id, { isActive: false });
        try {
            const options = (
                await f.sales.agent
                    .get(`/admin/api/orders/${row.id}/assignees`)
                    .expect(200)
            ).body as typeof body;
            expect(options.items.map((item) => item.id)).not.toContain(
                f.second.user.id,
            );
            await f
                .command(f.admin.agent, row.id, 'assign', row.version, {
                    managerId: f.second.user.id,
                })
                .expect(409);
        } finally {
            await f.db
                .getRepository(AdminUserEntity)
                .update(f.second.user.id, { isActive: true });
        }
    });
    it('denies operator/engineer/anonymous queue, detail, options and downloads', async () => {
        const row = await f.prepare('waiting_payment');
        for (const path of [
            '/admin/api/orders',
            `/admin/api/orders/${row.id}`,
            `/admin/api/orders/${row.id}/assignees`,
            row.documents.invoices[0].downloadUrl!,
        ]) {
            await f.operator.agent.get(path).expect(403);
            await f.engineer.agent.get(path).expect(403);
            await request(app.getHttpServer()).get(path).expect(401);
        }
        await f.admin.agent.get(`/admin/api/orders/${row.id}`).expect(200);
        await f.sales.agent.get('/admin/api/orders/2147483647').expect(404);
        await f.sales.agent.get('/admin/api/orders/2147483648').expect(400);
    });
    it('reauthorizes sessions after role removal without mutating business state', async () => {
        const row = await f.create();
        await f.db
            .getRepository(AdminUserRoleEntity)
            .delete({ userId: f.second.user.id });
        try {
            await f
                .command(f.second.agent, row.id, 'start-review', row.version)
                .expect(403);
        } finally {
            await f.db
                .getRepository(AdminUserRoleEntity)
                .save({ userId: f.second.user.id, role: 'sales_manager' });
        }
        expect((await f.read(row.id)).version).toBe(row.version);
    });
    it('provides real bounded queue filtering and deterministic pagination without documents', async () => {
        const rows = [await f.create(), await f.create(), await f.create()];
        const search = `queue-ord-demo-${rows[0].id}`;
        const tie = new Date('2020-01-01T00:00:00Z');
        for (const row of rows)
            await f.db.getRepository(OrderEntity).update(row.id, {
                createdAt: tie,
                contactEmailSnapshot: `${search}@example.test`,
            });
        await f
            .command(
                f.admin.agent,
                rows[0].id,
                'assign',
                (await f.read(rows[0].id)).version,
                {
                    managerId: f.sales.user.id,
                },
            )
            .expect(201);
        const list = async (query: string) =>
            (
                await f.sales.agent
                    .get(`/admin/api/orders?search=${search}&${query}`)
                    .expect(200)
            ).body as { items: OrderDetail[]; total: number };
        expect(
            (await list('limit=2&page=1')).items.map((row) => row.id),
        ).toEqual([rows[2].id, rows[1].id]);
        expect(
            (await list('limit=2&page=2')).items.map((row) => row.id),
        ).toEqual([rows[0].id]);
        expect((await list('scope=mine')).total).toBe(1);
        expect((await list('scope=unassigned')).total).toBe(2);
        expect((await list('status=paid')).total).toBe(0);
        expect((await list('limit=100')).items[0]).not.toHaveProperty(
            'documents',
        );
        await f.sales.agent.get('/admin/api/orders?limit=101').expect(400);
        await f.sales.agent.get('/admin/api/orders?status=unknown').expect(400);
    });
    it('rejects an invoice that became stale after physical write and retains the previous document', async () => {
        const row = await f.prepare('waiting_payment');
        const files = app.get(FilesService);
        const original = files.savePendingBuffer.bind(
            files,
        ) as FilesService['savePendingBuffer'];
        let release!: () => void;
        let written!: () => void;
        const wait = new Promise<void>((resolve) => {
            release = resolve;
        });
        const reached = new Promise<void>((resolve) => {
            written = resolve;
        });
        let pendingId = 0;
        const spy = jest
            .spyOn(files, 'savePendingBuffer')
            .mockImplementation(async (...args) => {
                const file = await original(...args);
                pendingId = file.id;
                written();
                await wait;
                return file;
            });
        const upload = f
            .invoice(row.id, row.version)
            .then((response) => response);
        try {
            await reached;
            await f
                .command(f.admin.agent, row.id, 'assign', row.version, {
                    managerId: f.second.user.id,
                })
                .expect(201);
        } finally {
            release();
            spy.mockRestore();
        }
        expect((await upload).status).toBe(409);
        expect(
            await f.db
                .getRepository(StoredFileEntity)
                .findOneByOrFail({ id: pendingId }),
        ).toMatchObject({ status: 'rejected' });
        const detail = await f.read(row.id);
        expect(detail.documents.invoices).toHaveLength(1);
        expect(detail.documents.invoices[0].id).toBe(
            row.documents.invoices[0].id,
        );
        expect(detail.documents.invoices[0].available).toBe(true);
        expect(detail.version).toBe(row.version + 1);
    });
    it('download remains scoped to an order and a proof never implies paid', async () => {
        const row = await f.prepare('waiting_payment');
        const stranger = await f.create();
        await f.sales.agent
            .get(
                `/admin/api/orders/${stranger.id}/documents/${row.documents.invoices[0].id}/download`,
            )
            .expect(404);
        await f.client
            .post(`/api/client/orders/${row.id}/payment-proofs`)
            .set('Origin', f.origin)
            .field('expectedVersion', row.version)
            .attach('file', f.buffer, {
                filename: 'proof.pdf',
                contentType: 'application/pdf',
            })
            .expect(201);
        const detail = await f.read(row.id);
        expect(detail.status).toBe('waiting_payment');
        expect(detail.paymentConfirmation).toBeNull();
        expect(detail.documents.paymentProofs).toHaveLength(1);
        expect(detail.documents.paymentProofs[0].available).toBe(true);
        expect(detail.actions.payment.allowed).toBe(true);
    });
    it.each([
        'submitted',
        'in_review',
        'confirmed',
        'waiting_payment',
        'paid',
        'fulfilled',
        'completed',
    ] as const)('projects live canonical %s facts', async (status) => {
        const row = await f.prepare(status);
        const detail = await f.read(row.id);
        const enabled = Object.entries(detail.actions)
            .filter(([, decision]) => decision.allowed)
            .map(([name]) => name);
        const expected = {
            submitted: ['assign', 'review'],
            in_review: ['assign', 'review', 'quote', 'confirm'],
            confirmed: ['assign', 'invoice'],
            waiting_payment: ['assign', 'invoice', 'payment'],
            paid: ['assign', 'fulfill'],
            fulfilled: ['assign', 'complete'],
            completed: [],
        };
        expect(enabled).toEqual(expected[status]);
        expect(JSON.stringify(detail)).not.toMatch(
            /objectKey|sha256|absolutePath|storagePath|providerUrl/,
        );
    });
    it('keeps historical cancelled read-only and bounds metadata/history without audit.read', async () => {
        const row = await f.create();
        await f.db
            .getRepository(OrderEntity)
            .update(row.id, { status: 'cancelled' });
        for (let index = 0; index < 103; index++)
            await f.db.getRepository(OrderEventEntity).save({
                orderId: row.id,
                type: 'cancelled',
                actorType: 'system',
                visibility: 'staff',
                metadata: {
                    quoteRevision: index,
                    objectKey: 'do-not-project',
                    providerUrl: 'https://example.test/private',
                },
            });
        const detail = await f.read(row.id);
        expect(detail.events).toHaveLength(100);
        expect(detail.history.hasMore).toBe(true);
        expect(
            Object.values(detail.actions).every((item) => !item.allowed),
        ).toBe(true);
        expect(detail.events[0].id).toBeLessThan(detail.events[99].id);
        expect(JSON.stringify(detail)).not.toContain('do-not-project');
        await f.sales.agent.get('/admin/api/audit-events').expect(403);
    });
    it('reports a physically missing document unavailable and rejects download', async () => {
        const row = await f.prepare('waiting_payment');
        const files = app.get(FilesService);
        const spy = jest.spyOn(files, 'exists').mockResolvedValue(false);
        try {
            const detail = await f.read(row.id);
            expect(detail.documents.invoices[0]).toMatchObject({
                available: false,
                downloadUrl: null,
            });
        } finally {
            spy.mockRestore();
        }
        const document = await f.db
            .getRepository(OrderDocumentEntity)
            .findOneByOrFail({ id: row.documents.invoices[0].id });
        const file = await f.db
            .getRepository(StoredFileEntity)
            .findOneByOrFail({ id: document.storedFileId });
        // Object keys are changed only in this synthetic negative fixture.
        await f.db
            .getRepository(StoredFileEntity)
            .update(file.id, { objectKey: `missing/${file.id}.pdf` });
        await f.sales.agent
            .get(row.documents.invoices[0].downloadUrl!)
            .expect(404);
    });
    it.each([
        'assignment',
        'quote',
        'stale-quote',
        'invoice',
        'payment',
        'fulfill',
        'complete',
    ] as const)(
        'serializes %s races at an explicit PostgreSQL lock barrier',
        async (scenario) => {
            const target = {
                assignment: 'submitted',
                quote: 'in_review',
                'stale-quote': 'in_review',
                invoice: 'confirmed',
                payment: 'waiting_payment',
                fulfill: 'paid',
                complete: 'fulfilled',
            } as const;
            const row = await f.prepare(target[scenario]);
            const assign = () =>
                f.command(f.admin.agent, row.id, 'assign', row.version, {
                    managerId: f.second.user.id,
                });
            const first = () =>
                scenario === 'assignment'
                    ? f.command(f.admin.agent, row.id, 'assign', row.version, {
                          managerId: f.sales.user.id,
                      })
                    : scenario === 'quote' || scenario === 'stale-quote'
                      ? f.quote(row.id, row.version, '3200000')
                      : scenario === 'invoice'
                        ? f.invoice(row.id, row.version)
                        : scenario === 'payment'
                          ? f.command(
                                f.sales.agent,
                                row.id,
                                'confirm-payment',
                                row.version,
                                { source: 'bank_statement' },
                            )
                          : scenario === 'fulfill'
                            ? f.command(
                                  f.sales.agent,
                                  row.id,
                                  'fulfill',
                                  row.version,
                                  { method: 'pickup' },
                              )
                            : f.command(
                                  f.sales.agent,
                                  row.id,
                                  'complete',
                                  row.version,
                                  {
                                      realizationNumber: 'DEMO-RACE',
                                      realizationDate: new Date()
                                          .toISOString()
                                          .slice(0, 10),
                                      documentDeliveryMethod: 'paper',
                                      documentKinds: ['act'],
                                  },
                              );
            const results = await raceAtOrderLock(f.db, row.id, [
                first,
                scenario === 'stale-quote'
                    ? () => f.quote(row.id, row.version, '3300000')
                    : assign,
            ]);
            expect(
                results.filter((result) => [200, 201].includes(result.status)),
            ).toHaveLength(1);
            expect(
                results.filter((result) => result.status === 409),
            ).toHaveLength(1);
            expect((await f.read(row.id)).version).toBe(row.version + 1);
        },
    );
});
