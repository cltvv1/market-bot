/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import {
    ServiceRequestEntity,
    type ServiceRequestStatus,
} from '../src/service-requests/entities/service-request.entity';
import { ServiceRequestEventEntity } from '../src/service-requests/entities/service-request-event.entity';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { FilesService } from '../src/files/files.service';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { ServiceRequestAttachmentEntity } from '../src/service-requests/entities/service-request-attachment.entity';
import { UiServingService } from '../src/ui/ui-serving.service';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';

const origin = 'http://localhost:5173';
const password = 'Fe1b!TestPassword2026';
const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
);

describe('production admin ServiceRequest workspace', () => {
    let app: INestApplication<App>;
    let db: DataSource;
    let ip = 1;
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = module.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        db = app.get(DataSource);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
    });
    beforeEach(async () => {
        const tables: Array<{ tablename: string }> = await db.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'typeorm_migrations'",
        );
        await db.query(
            `TRUNCATE ${tables.map((item) => `"${item.tablename.replaceAll('"', '""')}"`).join(',')} RESTART IDENTITY CASCADE`,
        );
    });
    afterAll(async () => {
        await app?.close();
    });
    async function staff(
        roles: Array<'operator' | 'engineer' | 'sales_manager' | 'superadmin'>,
        login = `staff${++ip}`,
    ) {
        const created = await app.get(AdminAuthService).createStaff({
            login,
            displayName: `Demo ${login}`,
            password,
            roles,
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', `10.91.0.${++ip}`)
            .send({ login, password })
            .expect(201);
        return { agent, id: created.id };
    }
    async function fixture(
        agent: ReturnType<typeof request.agent>,
        status: ServiceRequestStatus = 'submitted',
    ) {
        const result = await agent
            .post('/admin/api/service-requests/manual')
            .set('Origin', origin)
            .send({
                source: 'phone',
                serviceTypeCode: 'firmware_update',
                initialStatus: 'submitted',
                contactSnapshot: {
                    name: 'Demo contact',
                    phone: '+79990000000',
                    preferredChannel: 'phone',
                },
                answers: { description: 'Synthetic service request' },
            })
            .expect(201);
        const row = await db
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: result.body.request.id });
        if (row.status !== status)
            await db
                .getRepository(ServiceRequestEntity)
                .update(row.id, { status });
        return db
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: row.id });
    }
    const get = (agent: ReturnType<typeof request.agent>, id: number) =>
        agent.get(`/admin/api/service-requests/${id}`);
    const command = (
        agent: ReturnType<typeof request.agent>,
        id: number,
        action: string,
        body: object,
    ) =>
        agent
            .post(`/admin/api/service-requests/${id}/${action}`)
            .set('Origin', origin)
            .send(body);

    async function awaitBlockedCommands(count: number) {
        // The held row is the barrier. Wait for real PostgreSQL lock waiters, not a timing delay.
        for (let attempt = 0; attempt < 1000; attempt++) {
            const rows: Array<{ count: string }> = await db.query(
                "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE 'SELECT%ServiceRequestEntity%'",
            );
            if (Number(rows[0].count) >= count) return;
        }
        throw new Error('Commands did not reach the database lock barrier');
    }

    async function visibilityFixtures(
        operator: Awaited<ReturnType<typeof staff>>,
        engineerId: number,
    ) {
        const repo = db.getRepository(ServiceRequestEntity);
        const base = await fixture(operator.agent, 'draft');
        await repo.update(base.id, {
            currentStep: 0,
            responsibleOperatorStaffId: null,
            assignedEngineerId: null,
            operatorComment: null,
            createdAt: new Date('2026-09-01T00:00:00Z'),
        });
        const { id: _id, ...copy } = await repo.findOneByOrFail({
            id: base.id,
        });
        void _id;
        const add = (
            name: string,
            fields: Partial<ServiceRequestEntity> = {},
        ) =>
            repo.save(
                repo.create({
                    ...copy,
                    requestNumber: `VIS-${name}`,
                    ...fields,
                }),
            );
        const pristine = [
            base.id,
            (await add('pristine-2')).id,
            (await add('pristine-3')).id,
        ];
        const telegram = await add('telegram', {
            platform: 'telegram',
            source: 'telegram',
            currentStep: 1,
        });
        const max = await add('max', {
            platform: 'max',
            source: 'max',
            currentStep: 1,
        });
        const owned = await add('owned', {
            responsibleOperatorStaffId: operator.id,
            priority: 'high',
        });
        const assigned = await add('assigned', {
            assignedEngineerId: engineerId,
        });
        const commented = await add('commented', {
            operatorComment: 'Synthetic operator note',
        });
        // Preserve IS NOT NULL semantics, including legacy empty comments.
        const emptyComment = await add('empty-comment', {
            operatorComment: '',
        });
        const drafts = [
            telegram,
            max,
            owned,
            assigned,
            commented,
            emptyComment,
        ].map((row) => row.id);
        const submitted = [
            await add('submitted-1', { status: 'submitted' }),
            await add('submitted-2', { status: 'submitted' }),
        ];
        const working = await add('working', { status: 'in_progress' });
        const terminal = [] as number[];
        for (const status of ['completed', 'closed', 'cancelled'] as const)
            terminal.push((await add(status, { status })).id);
        const active = [
            ...drafts,
            ...submitted.map((row) => row.id),
            working.id,
        ];
        return {
            pristine,
            telegram,
            max,
            owned,
            assigned,
            drafts,
            submitted,
            active,
            all: [...active, ...terminal],
        };
    }

    it.each(['active', 'all', 'draft'] as const)(
        'applies canonical draft visibility and assigned-only authorization for status=%s',
        async (status) => {
            const operator = await staff(['operator']);
            const engineer = await staff(['engineer']);
            const otherEngineer = await staff(['engineer']);
            const rows = await visibilityFixtures(operator, engineer.id);
            const expected = status === 'draft' ? rows.drafts : rows[status];
            const ids = (response: request.Response) =>
                (response.body.items as Array<{ id: number }>).map(
                    (row) => row.id,
                );
            const list = (session: typeof operator, extra = '') =>
                session.agent
                    .get(`/admin/api/service-requests?status=${status}${extra}`)
                    .expect(200);
            const visible = await list(operator);
            expect(ids(visible)).toEqual([...expected].sort((a, b) => b - a));
            expect(visible.body.total).toBe(expected.length);
            expect(ids(await list(operator, '&scope=mine'))).toEqual([
                rows.owned.id,
            ]);
            expect(
                ids(
                    await list(
                        operator,
                        `&priority=high&platform=web&scope=mine&responsibleStaffId=${operator.id}`,
                    ),
                ),
            ).toEqual([rows.owned.id]);
            expect(
                ids(await list(operator, '&platform=max&scope=unassigned')),
            ).toEqual([rows.max.id]);
            for (const extra of [
                '',
                '&scope=all',
                '&scope=mine',
                `&responsibleStaffId=${engineer.id}`,
            ]) {
                const own = await list(engineer, extra);
                expect(ids(own)).toEqual([rows.assigned.id]);
                expect(own.body.total).toBe(1);
            }
            for (const extra of [
                '&scope=all',
                `&responsibleStaffId=${engineer.id}`,
            ]) {
                const denied = await list(otherEngineer, extra);
                expect(ids(denied)).toEqual([]);
                expect(denied.body.total).toBe(0);
            }
            await otherEngineer.agent
                .get(
                    `/admin/api/service-requests?status=${status}&assignedEngineerId=${engineer.id}`,
                )
                .expect(400);
            expect(
                ids(
                    await list(
                        engineer,
                        `&scope=unassigned&responsibleStaffId=${operator.id}`,
                    ),
                ),
            ).toEqual([]);
            await get(otherEngineer.agent, rows.assigned.id).expect(404);
            const legacy = await app
                .get(ServiceRequestsService)
                .listForAdmin(status);
            expect(legacy.map((row) => row.id).sort((a, b) => b - a)).toEqual(
                [...expected].sort((a, b) => b - a),
            );
            expect(
                (
                    await app
                        .get(ServiceRequestsService)
                        .listForAdmin(status, undefined, engineer.id)
                ).map((row) => row.id),
            ).toEqual([rows.assigned.id]);
        },
    );

    it.each(['active', 'all', 'draft'] as const)(
        'counts and paginates only admin-visible matching rows for status=%s',
        async (status) => {
            const operator = await staff(['operator']);
            const rows = await visibilityFixtures(
                operator,
                (await staff(['engineer'])).id,
            );
            const expected = (
                status === 'draft' ? rows.drafts : rows[status]
            ).sort((a, b) => b - a);
            const acrossPages: number[] = [];
            const limit = 4;
            for (
                let page = 1;
                page <= Math.ceil(expected.length / limit) + 1;
                page++
            ) {
                const result = await operator.agent
                    .get(
                        `/admin/api/service-requests?status=${status}&limit=${limit}&page=${page}`,
                    )
                    .expect(200);
                const ids = (result.body.items as Array<{ id: number }>).map(
                    (row) => row.id,
                );
                expect(result.body).toMatchObject({
                    page,
                    limit,
                    total: expected.length,
                    hasNext: page * limit < expected.length,
                });
                expect(ids).toEqual(
                    expected.slice((page - 1) * limit, page * limit),
                );
                acrossPages.push(...ids);
            }
            expect(acrossPages).toEqual(expected);
            expect(acrossPages.some((id) => rows.pristine.includes(id))).toBe(
                false,
            );
            const submitted = await operator.agent
                .get('/admin/api/service-requests?status=submitted')
                .expect(200);
            expect(submitted.body.total).toBe(rows.submitted.length);
            expect(
                (submitted.body.items as Array<{ id: number }>).map(
                    (row) => row.id,
                ),
            ).toEqual(
                rows.submitted.map((row) => row.id).sort((a, b) => b - a),
            );
        },
    );

    it('keeps a manual draft owned by its operator visible after repeated active queue reads', async () => {
        const operator = await staff(['operator']);
        const created = await operator.agent
            .post('/admin/api/service-requests/manual')
            .set('Origin', origin)
            .send({
                source: 'phone',
                serviceTypeCode: 'firmware_update',
                contactSnapshot: {
                    name: 'Synthetic manual customer',
                    phone: '+79990000000',
                    preferredChannel: 'phone',
                },
                answers: { description: 'Manual draft visibility regression' },
            })
            .expect(201);
        const id = created.body.request.id as number;
        expect(
            await db
                .getRepository(ServiceRequestEntity)
                .findOneByOrFail({ id }),
        ).toMatchObject({
            status: 'draft',
            currentStep: 0,
            responsibleOperatorStaffId: operator.id,
        });
        await get(operator.agent, id).expect(200);
        for (let repeat = 0; repeat < 2; repeat++) {
            const queue = await operator.agent
                .get('/admin/api/service-requests?status=active&scope=mine')
                .expect(200);
            expect(queue.body.total).toBe(1);
            expect(queue.body.items[0]).toMatchObject({ id, status: 'draft' });
        }
    });

    async function raceCommands(
        id: number,
        start: () => Array<Promise<request.Response>>,
    ) {
        const holder = db.createQueryRunner();
        await holder.connect();
        await holder.startTransaction();
        await holder.manager
            .getRepository(ServiceRequestEntity)
            .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
        const calls = start();
        try {
            await awaitBlockedCommands(calls.length);
        } finally {
            await holder.commitTransaction();
            await holder.release();
            await Promise.all(calls);
        }
        return Promise.all(calls);
    }

    it('paginates and filters only authorized rows with safe identities and stable ordering', async () => {
        const operator = await staff(['operator']);
        const engineer = await staff(['engineer']);
        const row = await fixture(operator.agent);
        for (let n = 0; n < 30; n++) {
            const { id: _id, ...copy } = row;
            void _id;
            await db.getRepository(ServiceRequestEntity).save({
                ...copy,
                requestNumber: `DEMO-${n}`,
                assignedEngineerId: n % 2 ? engineer.id : null,
                responsibleOperatorStaffId: n % 2 ? operator.id : null,
                priority: n % 2 ? 'high' : 'normal',
            });
        }
        const first = await operator.agent
            .get('/admin/api/service-requests?status=all&limit=10')
            .expect(200);
        expect(first.body).toMatchObject({
            page: 1,
            limit: 10,
            total: 31,
            hasNext: true,
        });
        const second = await operator.agent
            .get('/admin/api/service-requests?status=all&limit=10&page=2')
            .expect(200);
        expect(
            (second.body.items as Array<{ id: number }>).some((item) =>
                (first.body.items as Array<{ id: number }>).some(
                    (other: { id: number }) => item.id === other.id,
                ),
            ),
        ).toBe(false);
        const filtered = await operator.agent
            .get(
                '/admin/api/service-requests?priority=high&scope=mine&platform=web',
            )
            .expect(200);
        expect(filtered.body.total).toBe(15);
        expect(filtered.body.items[0].assignedEngineer).toEqual({
            id: engineer.id,
            displayName: expect.any(String),
            isActive: true,
        });
        const unassigned = await operator.agent
            .get('/admin/api/service-requests?scope=unassigned')
            .expect(200);
        expect(unassigned.body.total).toBe(15);
        const assigned = await engineer.agent
            .get('/admin/api/service-requests?scope=all&status=all')
            .expect(200);
        expect(assigned.body.total).toBe(15);
        const widened = await engineer.agent
            .get(
                `/admin/api/service-requests?scope=unassigned&responsibleStaffId=${operator.id}`,
            )
            .expect(200);
        expect(widened.body.total).toBe(0);
        for (const field of [
            'publicTokenHash',
            'submitIdempotencyKey',
            'chatId',
            'passwordHash',
            'roles',
            'sessionId',
            'objectKey',
            'answers',
            'operatorComment',
        ])
            expect(JSON.stringify(first.body.items)).not.toContain(
                `"${field}"`,
            );
        for (const query of [
            'page=0',
            'page=100001',
            'limit=101',
            'limit=0',
            'responsibleStaffId=-1',
            'priority=invalid',
            'scope=other',
        ])
            await operator.agent
                .get(`/admin/api/service-requests?${query}`)
                .expect(400);
        await (await staff(['sales_manager'])).agent
            .get('/admin/api/service-requests')
            .expect(403);
    });

    it('returns identical object-level 404, safe detail and action projection', async () => {
        const operator = await staff(['operator']);
        const engineer = await staff(['engineer']);
        const row = await fixture(operator.agent);
        const denied = await get(engineer.agent, row.id).expect(404);
        const missing = await get(engineer.agent, 999999).expect(404);
        expect(denied.body.message).toBe(missing.body.message);
        await command(operator.agent, row.id, 'assign-engineer', {
            assignedEngineerId: engineer.id,
            expectedVersion: row.version,
        }).expect(201);
        const detail = await get(engineer.agent, row.id).expect(200);
        expect(detail.body.workflow.actions).toEqual([]);
        expect(detail.body.request.assignedEngineer.id).toBe(engineer.id);
        for (const field of [
            'publicTokenHash',
            'submitIdempotencyKey',
            'objectKey',
            'passwordHash',
            'recipientChatId',
            'chatId',
        ])
            expect(JSON.stringify(detail.body)).not.toContain(`"${field}"`);
        await command(engineer.agent, row.id, 'operator-state', {
            priority: 'high',
            expectedVersion: row.version + 1,
        }).expect(403);
    });

    it('requires expectedVersion and rejects stale state edits without duplicate effects', async () => {
        const operator = await staff(['operator']);
        const engineer = await staff(['engineer']);
        const row = await fixture(operator.agent);
        await command(operator.agent, row.id, 'operator-state', {
            priority: 'high',
        }).expect(400);
        await command(operator.agent, row.id, 'transition', {
            status: 'review_required',
        }).expect(400);
        await command(operator.agent, row.id, 'assign-engineer', {
            assignedEngineerId: engineer.id,
        }).expect(400);
        const changed = await command(
            operator.agent,
            row.id,
            'operator-state',
            { priority: 'high', expectedVersion: row.version },
        ).expect(201);
        expect(changed.body.request.version).toBe(row.version + 1);
        await command(operator.agent, row.id, 'operator-state', {
            priority: 'urgent',
            expectedVersion: row.version,
        }).expect(409);
        const repeated = await command(
            operator.agent,
            row.id,
            'operator-state',
            { priority: 'high', expectedVersion: changed.body.request.version },
        ).expect(201);
        expect(repeated.body.request.version).toBe(
            changed.body.request.version,
        );
        expect(
            await db.getRepository(ServiceRequestEventEntity).countBy({
                serviceRequestId: row.id,
                type: 'operator_state_updated',
            }),
        ).toBe(1);
        expect(
            await db.getRepository(AuditEventEntity).countBy({
                targetId: String(row.id),
                action: 'service_request.operator_state.update',
            }),
        ).toBe(1);
    });

    it('uses real row locking: two simultaneous transitions have one winner', async () => {
        const operator = await staff(['operator']);
        const row = await fixture(operator.agent);
        const holder = db.createQueryRunner();
        await holder.connect();
        await holder.startTransaction();
        await holder.manager.getRepository(ServiceRequestEntity).findOne({
            where: { id: row.id },
            lock: { mode: 'pessimistic_write' },
        });
        const calls = ['review_required', 'invoice_required'].map((status) =>
            command(operator.agent, row.id, 'transition', {
                status,
                expectedVersion: row.version,
            }).then((result) => result),
        );
        try {
            await awaitBlockedCommands(2);
        } finally {
            await holder.commitTransaction();
            await holder.release();
            await Promise.all(calls);
        }
        const responses = await Promise.all(calls);
        expect(responses.map((result) => result.status).sort()).toEqual([
            201, 409,
        ]);
        expect(
            (
                await db
                    .getRepository(ServiceRequestEntity)
                    .findOneByOrFail({ id: row.id })
            ).version,
        ).toBe(row.version + 1);
        expect(
            await db
                .getRepository(ServiceRequestEventEntity)
                .countBy({ serviceRequestId: row.id, type: 'status_changed' }),
        ).toBe(1);
        expect(
            await db.getRepository(AuditEventEntity).countBy({
                targetId: String(row.id),
                action: 'service_request.status.transition',
            }),
        ).toBe(1);
    });

    it('validates PDF, cleans losing uploads, and preserves the current invoice', async () => {
        const operator = await staff(['operator']);
        const row = await fixture(operator.agent, 'invoice_required');
        const invoice = (buffer: Buffer, name = 'invoice.pdf') =>
            operator.agent
                .post(`/admin/api/service-requests/${row.id}/invoice-file`)
                .set('Origin', origin)
                .field('expectedVersion', row.version)
                .attach('file', buffer, {
                    filename: name,
                    contentType: 'application/pdf',
                });
        await invoice(Buffer.from('not a pdf')).expect(400);
        await invoice(pdf, 'invoice.exe').expect(400);
        const responses = await raceCommands(row.id, () => [
            invoice(pdf).then((result) => result),
            invoice(pdf).then((result) => result),
        ]);
        expect(responses.map((result) => result.status).sort()).toEqual([
            201, 409,
        ]);
        const detail = await get(operator.agent, row.id).expect(200);
        expect(detail.body.request.status).toBe('waiting_payment');
        expect(detail.body.documents.invoice).toMatchObject({
            originalName: 'invoice.pdf',
            downloadable: true,
            customerVisible: true,
        });
        expect(
            await db
                .getRepository(StoredFileEntity)
                .countBy({ status: 'active' }),
        ).toBe(1);
        expect(
            await db
                .getRepository(StoredFileEntity)
                .countBy({ status: 'rejected' }),
        ).toBe(1);
        expect(
            await db
                .getRepository(AuditEventEntity)
                .countBy({ action: 'service_request.invoice.upload' }),
        ).toBe(1);
    });

    it('rolls back state, event and outbound if audit insertion fails', async () => {
        const operator = await staff(['operator']);
        const row = await fixture(operator.agent, 'in_progress');
        await db
            .getRepository(ServiceRequestEntity)
            .update(row.id, { platform: 'max', chatId: 'synthetic-recipient' });
        const fresh = await db
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: row.id });
        await db.query(
            `ALTER TABLE audit_events ADD CONSTRAINT fe1b_test_audit_failure CHECK (action <> 'service_request.status.transition')`,
        );
        try {
            await command(operator.agent, row.id, 'transition', {
                status: 'completed',
                expectedVersion: fresh.version,
            }).expect(500);
            expect(
                await db
                    .getRepository(ServiceRequestEntity)
                    .findOneByOrFail({ id: row.id }),
            ).toMatchObject({ status: 'in_progress', version: fresh.version });
            expect(
                await db
                    .getRepository(ServiceRequestEventEntity)
                    .countBy({ type: 'status_changed' }),
            ).toBe(0);
            expect(await db.getRepository(OutboundDeliveryEntity).count()).toBe(
                0,
            );
        } finally {
            await db.query(
                'ALTER TABLE audit_events DROP CONSTRAINT fe1b_test_audit_failure',
            );
        }
    });

    it('requires canonical payment proof and keeps internal notes staff-only after closure', async () => {
        const operator = await staff(['operator']);
        const row = await fixture(operator.agent, 'waiting_payment');
        const blocked = await get(operator.agent, row.id).expect(200);
        expect(
            (
                blocked.body.workflow.actions as Array<{
                    id: string;
                    allowed: boolean;
                }>
            ).find((item: { id: string }) => item.id === 'confirm_payment'),
        ).toMatchObject({
            allowed: false,
            reasonCode: 'PAYMENT_PROOF_REQUIRED',
        });
        await command(operator.agent, row.id, 'transition', {
            status: 'paid',
            expectedVersion: row.version,
        }).expect(400);
        const proof = await app.get(FilesService).saveBuffer({
            purpose: 'payment-proof',
            buffer: pdf,
            originalName: 'proof.pdf',
            mimeType: 'application/pdf',
        });
        await db
            .getRepository(ServiceRequestEntity)
            .update(row.id, { paymentProofFileId: proof.id });
        const ready = await get(operator.agent, row.id).expect(200);
        expect(
            (
                ready.body.workflow.actions as Array<{
                    id: string;
                    allowed: boolean;
                }>
            ).find((item: { id: string }) => item.id === 'confirm_payment')
                ?.allowed,
        ).toBe(true);
        await command(operator.agent, row.id, 'transition', {
            status: 'paid',
            expectedVersion: ready.body.workflow.expectedVersion,
        }).expect(201);
        await db
            .getRepository(ServiceRequestEntity)
            .update(row.id, { status: 'closed' });
        await command(operator.agent, row.id, 'messages', {
            text: 'Customer reply',
            visibility: 'customer',
        }).expect(400);
        await command(operator.agent, row.id, 'messages', {
            text: 'Internal note',
            visibility: 'internal',
        }).expect(201);
        await command(operator.agent, row.id, 'messages', {
            text: '  ',
            visibility: 'internal',
        }).expect(400);
        expect(await db.getRepository(OutboundDeliveryEntity).count()).toBe(0);
    });

    it.each(['assignment-state', 'state-schedule'] as const)(
        'serializes concurrent %s commands without a lost update',
        async (kind) => {
            const operator = await staff(['operator']);
            const engineer = await staff(['engineer']);
            const row = await fixture(
                operator.agent,
                kind === 'state-schedule' ? 'paid' : 'submitted',
            );
            if (kind === 'state-schedule')
                await command(operator.agent, row.id, 'assign-engineer', {
                    assignedEngineerId: engineer.id,
                    expectedVersion: row.version,
                }).expect(201);
            const current = await db
                .getRepository(ServiceRequestEntity)
                .findOneByOrFail({ id: row.id });
            const version = current.version;
            const responses = await raceCommands(row.id, () => [
                command(operator.agent, row.id, 'operator-state', {
                    priority: 'urgent',
                    expectedVersion: version,
                }).then((result) => result),
                command(
                    operator.agent,
                    row.id,
                    kind === 'state-schedule' ? 'schedule' : 'assign-engineer',
                    kind === 'state-schedule'
                        ? {
                              visitAddress: 'Synthetic address',
                              visitTime: '2026-10-01T05:30:00Z',
                              expectedVersion: version,
                          }
                        : {
                              assignedEngineerId: engineer.id,
                              expectedVersion: version,
                          },
                ).then((result) => result),
            ]);
            expect(responses.map((result) => result.status).sort()).toEqual([
                201, 409,
            ]);
            expect(
                (
                    await db
                        .getRepository(ServiceRequestEntity)
                        .findOneByOrFail({ id: row.id })
                ).version,
            ).toBe(version + 1);
            const eventCount = await db
                .getRepository(ServiceRequestEventEntity)
                .countBy({ serviceRequestId: row.id });
            expect(eventCount).toBe(kind === 'state-schedule' ? 3 : 2);
        },
    );

    it('keeps command authorization consistent with action projection and rejects forged transitions', async () => {
        const operator = await staff(['operator']);
        const engineer = await staff(['engineer']);
        const sales = await staff(['sales_manager']);
        const root = await staff(['superadmin']);
        const row = await fixture(operator.agent);
        for (const session of [operator, root]) {
            const detail = await get(session.agent, row.id).expect(200);
            expect(detail.body.workflow.actions).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'mark_invoice_required',
                        allowed: true,
                    }),
                ]),
            );
            for (const status of ['waiting_payment', 'scheduled'])
                await command(session.agent, row.id, 'transition', {
                    status,
                    expectedVersion: row.version,
                }).expect(400);
        }
        for (const session of [engineer, sales])
            for (const [action, body] of [
                ['transition', { status: 'invoice_required' }],
                ['assign-engineer', { assignedEngineerId: engineer.id }],
                ['operator-state', { priority: 'high' }],
                [
                    'schedule',
                    { visitAddress: 'X', visitTime: '2026-10-01T05:30:00Z' },
                ],
                ['messages', { text: 'Private' }],
            ] as const)
                await command(session.agent, row.id, action, {
                    ...body,
                    expectedVersion: row.version,
                }).expect(403);
        expect(
            (
                await db
                    .getRepository(ServiceRequestEntity)
                    .findOneByOrFail({ id: row.id })
            ).version,
        ).toBe(row.version);
        expect(
            await db
                .getRepository(AuditEventEntity)
                .countBy({ action: 'permission.denied' }),
        ).toBeGreaterThan(0);
    });

    it('schedules/reschedules only with valid version, timestamp and active engineer; terminal commands are guarded', async () => {
        const operator = await staff(['operator']);
        const engineer = await staff(['engineer']);
        const row = await fixture(operator.agent, 'paid');
        const schedule = {
            visitAddress: 'Synthetic address',
            visitTime: '2026-10-01T05:30:00Z',
            expectedVersion: row.version,
        };
        await command(operator.agent, row.id, 'schedule', schedule).expect(400);
        await command(operator.agent, row.id, 'assign-engineer', {
            assignedEngineerId: engineer.id,
            expectedVersion: row.version,
        }).expect(201);
        let version = row.version + 1;
        for (const input of [
            {
                ...schedule,
                expectedVersion: version,
                visitTime: '2026-10-01T05:30',
            },
            { ...schedule, expectedVersion: version, visitAddress: ' ' },
            { ...schedule, expectedVersion: undefined },
        ])
            await command(operator.agent, row.id, 'schedule', input).expect(
                400,
            );
        await command(operator.agent, row.id, 'schedule', {
            ...schedule,
            expectedVersion: version,
        }).expect(201);
        version++;
        await command(operator.agent, row.id, 'schedule', {
            ...schedule,
            expectedVersion: version,
        }).expect(201);
        expect(
            (
                await db
                    .getRepository(ServiceRequestEntity)
                    .findOneByOrFail({ id: row.id })
            ).version,
        ).toBe(version);
        await command(operator.agent, row.id, 'schedule', {
            ...schedule,
            visitTime: '2026-10-02T05:30:00Z',
            expectedVersion: version,
        }).expect(201);
        version++;
        for (const status of ['in_progress', 'completed', 'closed']) {
            await command(operator.agent, row.id, 'transition', {
                status,
                expectedVersion: version,
            }).expect(201);
            version++;
        }
        await command(operator.agent, row.id, 'transition', {
            status: 'closed',
            expectedVersion: version,
        }).expect(400);
        await command(operator.agent, row.id, 'assign-engineer', {
            assignedEngineerId: engineer.id,
            expectedVersion: version,
        }).expect(400);
        expect(
            (
                await db
                    .getRepository(ServiceRequestEntity)
                    .findOneByOrFail({ id: row.id })
            ).version,
        ).toBe(version);
    });

    it('retains previous invoices until replacement commits and rejects staged files when audit rolls back', async () => {
        const operator = await staff(['operator']);
        const row = await fixture(operator.agent, 'invoice_required');
        const upload = (version: number) =>
            operator.agent
                .post(`/admin/api/service-requests/${row.id}/invoice-file`)
                .set('Origin', origin)
                .field('expectedVersion', version)
                .attach('file', pdf, {
                    filename: 'invoice.pdf',
                    contentType: 'application/pdf',
                });
        await upload(row.version).expect(201);
        const current = await db
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: row.id });
        await db.query(
            "ALTER TABLE audit_events ADD CONSTRAINT fe1b_test_invoice_audit_failure CHECK (action <> 'service_request.invoice.upload') NOT VALID",
        );
        try {
            await upload(current.version).expect(500);
        } finally {
            await db.query(
                'ALTER TABLE audit_events DROP CONSTRAINT fe1b_test_invoice_audit_failure',
            );
        }
        const retained = await db
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: row.id });
        expect(retained.version).toBe(current.version);
        expect(retained.invoiceStoredFileId).toBe(current.invoiceStoredFileId);
        expect(
            await db
                .getRepository(StoredFileEntity)
                .countBy({ status: 'pending' }),
        ).toBe(0);
        expect(
            await db
                .getRepository(StoredFileEntity)
                .countBy({ status: 'rejected' }),
        ).toBe(1);
        await upload(current.version).expect(201);
        const detail = await get(operator.agent, row.id).expect(200);
        expect(detail.body.documents.invoice.id).not.toBe(
            current.invoiceStoredFileId,
        );
        expect(
            await db.getRepository(ServiceRequestAttachmentEntity).findOneBy({
                serviceRequestId: row.id,
                storedFileId: current.invoiceStoredFileId!,
                kind: 'invoice',
            }),
        ).toMatchObject({ customerVisible: false });
        expect(
            await db
                .getRepository(AuditEventEntity)
                .countBy({ action: 'service_request.invoice.upload' }),
        ).toBe(2);
    });

    it('does not confuse generic attachments with canonical payment proof and enforces file download scope', async () => {
        const operator = await staff(['operator']);
        const engineer = await staff(['engineer']);
        const row = await fixture(operator.agent, 'waiting_payment');
        const file = await app.get(FilesService).saveBuffer({
            purpose: 'service-attachment',
            buffer: pdf,
            originalName: 'ordinary.pdf',
            mimeType: 'application/pdf',
        });
        await db.getRepository(ServiceRequestAttachmentEntity).save({
            serviceRequestId: row.id,
            storedFileId: file.id,
            kind: 'message',
            customerVisible: true,
        });
        const detail = await get(operator.agent, row.id).expect(200);
        expect(detail.body.documents.paymentProof).toBeNull();
        await command(operator.agent, row.id, 'transition', {
            status: 'paid',
            expectedVersion: row.version,
        }).expect(400);
        const attachment = detail.body.attachments[0] as {
            downloadUrl: string;
        };
        await engineer.agent.get(attachment.downloadUrl).expect(404);
        await command(operator.agent, row.id, 'assign-engineer', {
            assignedEngineerId: engineer.id,
            expectedVersion: row.version,
        }).expect(201);
        await engineer.agent.get(attachment.downloadUrl).expect(200);
        await app.get(FilesService).logicalDelete(file.id);
        const missing = await get(operator.agent, row.id).expect(200);
        expect(missing.body.attachments[0]).toMatchObject({
            downloadable: false,
            downloadUrl: null,
            unavailableReasonCode: 'FILE_UNAVAILABLE',
        });
    });

    it('serves only owned SPA routes without shadowing API, assets or unknown endpoints', async () => {
        const html = jest
            .spyOn(app.get(UiServingService), 'getEntryHtml')
            .mockReturnValue('<html>synthetic admin</html>');
        try {
            for (const route of [
                'work',
                'requests/service',
                'requests/service/1',
                'requests/registrations',
                'requests/tickets',
                'customers/access',
                'customers/organizations',
                'customers/equipment',
                'integrations/signals',
                'integrations/runs',
                'settings/staff',
                'settings/notifications',
                'settings/audit',
            ])
                await request(app.getHttpServer())
                    .get(`/admin/${route}`)
                    .expect(200)
                    .expect('Content-Type', /text\/html/)
                    .expect('Cache-Control', 'no-store');
            await request(app.getHttpServer()).get('/admin/api/me').expect(401);
            for (const route of [
                'unknown',
                'api/nonexistent',
                'requests/service/1/unknown',
                'reference/service-requests',
                'missing.js',
            ])
                await request(app.getHttpServer())
                    .get(`/admin/${route}`)
                    .expect(404);
            expect(html).toHaveBeenCalledTimes(13);
        } finally {
            html.mockRestore();
        }
    });
});
