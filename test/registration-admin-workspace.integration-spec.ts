import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { type AdminRole } from '../src/admin/entities/admin-user-role.entity';
import { AuditService } from '../src/audit/audit.service';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { FilesService } from '../src/files/files.service';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { MESSENGER_SERVICE } from '../src/messenger/messenger.types';
import { PdfGeneratorService } from '../src/pdf/pdf.service';
import { EquipmentKitEntity } from '../src/assets/entities/equipment-kit.entity';
import { RegistrationRequestEntity } from '../src/registrations/entities/registration.entity';
import { RegistrationRequirementEntity } from '../src/registrations/entities/registration-requirement.entity';
import { RegistrationEvidenceEntity } from '../src/registrations/entities/registration-evidence.entity';
import { RegistrationDataRequestEntity } from '../src/registrations/entities/registration-data-request.entity';
import { RegistrationReadinessService } from '../src/registrations/registration-readiness.service';
import { RegistrationAdminReadService } from '../src/registrations/registration-admin-read.service';
import {
    REGISTRATION_REQUIREMENT_KINDS,
    type RegistrationRequirementKind,
} from '../src/registrations/registration.types';
import * as policy from '../src/registrations/registration-admin-policy';

type Detail = Awaited<ReturnType<RegistrationAdminReadService['details']>>;
type Queue = Awaited<ReturnType<RegistrationAdminReadService['list']>>;
const origin = 'http://localhost:5173';
const syntheticPdf = Buffer.from(
    '%PDF-1.4\nsynthetic registration evidence\n%%EOF',
);

describe('FE-REG-1 registration admin workspace', () => {
    let app: INestApplication<App>;
    let db: DataSource;
    let readiness: RegistrationReadinessService;
    let operator: Awaited<ReturnType<typeof staff>>;
    let registration: RegistrationRequestEntity;
    const messenger = {
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sendImage: jest.fn(),
        sendDocument: jest.fn(),
    };
    let sequence = 0;
    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(MESSENGER_SERVICE)
            .useValue(messenger)
            .compile();
        app = module.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        db = app.get(DataSource);
        readiness = app.get(RegistrationReadinessService);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
    });
    beforeEach(async () => {
        jest.restoreAllMocks();
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
        messenger.sendMessage.mockReset().mockResolvedValue(undefined);
        const tables: Array<{ tablename: string }> = await db.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'typeorm_migrations'",
        );
        await db.query(
            `TRUNCATE TABLE ${tables.map((row) => `"${row.tablename.replaceAll('"', '""')}"`).join(',')} RESTART IDENTITY CASCADE`,
        );
        operator = await staff(['operator']);
        registration = await fixture();
    });
    afterAll(async () => {
        await app?.close();
    });
    async function staff(roles: AdminRole[]) {
        const password = `Aa7!${randomBytes(24).toString('base64url')}`;
        const login = `registration-staff-${++sequence}`;
        const account = await app.get(AdminAuthService).createStaff({
            login,
            displayName: 'Synthetic employee',
            password,
            roles,
        });
        const agent = request.agent(app.getHttpServer());
        agent.set('Origin', origin);
        agent.set(
            'X-Forwarded-For',
            `10.111.${Math.floor(sequence / 200)}.${(sequence % 200) + 1}`,
        );
        await agent
            .post('/admin/api/login')
            .send({ login, password })
            .expect(201);
        return { id: account.id, agent };
    }
    async function fixture(
        patch: Partial<RegistrationRequestEntity> = {},
        initialize = true,
    ) {
        const row = await db.getRepository(RegistrationRequestEntity).save({
            platform: 'web',
            chatId: `synthetic-${++sequence}`,
            status: 'new',
            orgName: 'Synthetic organization',
            innKpp: '2460000000',
            kktModel: 'Test KKT',
            ofdProvisionMode: 'customer_has_code',
            ...patch,
        });
        if (initialize) await readiness.initialize(row.id);
        return row;
    }
    async function detail(actor = operator, id = registration.id) {
        const response = await actor.agent
            .get(`/admin/api/registrations/${id}`)
            .expect(200);
        return response.body as Detail;
    }
    function actionBody(
        data: Detail,
        action: policy.RegistrationAdminActionId,
        kind?: RegistrationRequirementKind,
    ) {
        const actions = kind
            ? data.requirements.find((item) => item.kind === kind)!.actions
            : data.workflow.actions;
        return {
            ...(kind ? { kind } : {}),
            precondition: actions.find((item) => item.id === action)!
                .precondition,
        };
    }
    async function command(
        action: policy.RegistrationAdminActionId,
        values: Record<string, unknown> = {},
        kind?: RegistrationRequirementKind,
        id = registration.id,
    ) {
        const data = await detail(operator, id);
        return operator.agent
            .post(`/admin/api/registrations/${id}/${action}`)
            .send({ ...values, ...actionBody(data, action, kind) });
    }
    async function ready(id = registration.id) {
        for (const kind of REGISTRATION_REQUIREMENT_KINDS) {
            await readiness.provideStaffValue(
                id,
                kind,
                operator.id,
                `synthetic-${kind}`,
            );
            await readiness.verify(id, kind, operator.id);
        }
    }
    async function evidence(kind: RegistrationRequirementKind = 'kkt_serial') {
        return readiness.uploadEvidence(
            { platform: registration.platform, chatId: registration.chatId },
            registration.id,
            kind,
            {
                buffer: syntheticPdf,
                fileName: 'evidence.pdf',
                mimeType: 'application/pdf',
            },
        );
    }
    it('paginates after status, channel, priority and readiness filters and excludes drafts from all', async () => {
        await fixture({ status: 'draft' });
        await fixture(
            {
                status: 'processed',
                platform: 'max',
                priority: 'high',
                readiness: 'ready',
            },
            false,
        );
        const all = (
            await operator.agent
                .get('/admin/api/registrations?status=all&limit=1&page=1')
                .expect(200)
        ).body as Queue;
        expect(all.total).toBe(2);
        expect(all.hasNext).toBe(true);
        expect(all.items).toHaveLength(1);
        const filtered = (
            await operator.agent
                .get(
                    '/admin/api/registrations?status=all&platform=max&priority=high&readiness=ready',
                )
                .expect(200)
        ).body as Queue;
        expect(filtered.total).toBe(1);
        expect(Object.keys(filtered.items[0])).not.toEqual(
            expect.arrayContaining([
                'bankReqs',
                'chatId',
                'pdfFileId',
                'requirements',
            ]),
        );
        await operator.agent
            .get('/admin/api/registrations?limit=101')
            .expect(400);
        await operator.agent
            .get('/admin/api/registrations?status=closed')
            .expect(400);
    });
    it('scopes engineer totals, detail, options, OFD and downloads without widening through queries', async () => {
        const engineer = await staff(['engineer']);
        const assigned = await fixture({ assignedEngineerId: engineer.id });
        const queue = (
            await engineer.agent
                .get('/admin/api/registrations?status=all')
                .expect(200)
        ).body as Queue;
        expect(queue.total).toBe(1);
        expect(queue.items[0].id).toBe(assigned.id);
        expect(
            (await detail(engineer, assigned.id)).workflow.actions,
        ).toHaveLength(0);
        for (const id of [registration.id, 999999]) {
            await engineer.agent
                .get(`/admin/api/registrations/${id}`)
                .expect(404);
            await engineer.agent
                .get(`/admin/api/registrations/${id}/pdf`)
                .expect(404);
            await engineer.agent
                .get(`/admin/api/registrations/${id}/ofd-value`)
                .expect(404);
        }
        await engineer.agent
            .get(`/admin/api/registrations/${assigned.id}/options`)
            .expect(403);
        await engineer.agent
            .get('/admin/api/registrations?assignedEngineerId=1')
            .expect(400);
    });
    it('retains permission unions and denies sales, disabled employees and revoked assignment', async () => {
        const sales = await staff(['sales_manager']);
        await sales.agent.get('/admin/api/registrations').expect(403);
        const union = await staff(['sales_manager', 'engineer']);
        await db
            .getRepository(RegistrationRequestEntity)
            .update(registration.id, { assignedEngineerId: union.id });
        await detail(union);
        await db
            .getRepository(RegistrationRequestEntity)
            .update(registration.id, { assignedEngineerId: null });
        await union.agent
            .get(`/admin/api/registrations/${registration.id}`)
            .expect(404);
        await db
            .getRepository(AdminUserEntity)
            .update(operator.id, { isActive: false });
        await operator.agent.get('/admin/api/registrations').expect(401);
    });
    it('reads incomplete/draft checklists without writing requirements or Audit even on forbidden access', async () => {
        const row = await fixture({ status: 'draft' }, false);
        const before = await db.getRepository(AuditEventEntity).count();
        const data = await detail(operator, row.id);
        expect(data.checklistAvailable).toBe(false);
        expect(
            data.workflow.actions.find((item) => item.id === 'handoff')
                ?.allowed,
        ).toBe(false);
        expect(
            await db
                .getRepository(RegistrationRequirementEntity)
                .countBy({ registrationId: row.id }),
        ).toBe(0);
        expect(await db.getRepository(AuditEventEntity).count()).toBe(before);
        const engineer = await staff(['engineer']);
        const afterLogin = await db.getRepository(AuditEventEntity).count();
        await engineer.agent
            .get(`/admin/api/registrations/${row.id}`)
            .expect(404);
        expect(await db.getRepository(AuditEventEntity).count()).toBe(
            afterLogin,
        );
    });
    it('masks OFD in ordinary reads and mutation responses but provides a scoped no-store reveal', async () => {
        const secret = randomBytes(20).toString('hex');
        const response = await command(
            'provide-value',
            { value: secret, source: 'operator_input' },
            'ofd_code',
        );
        expect(response.status).toBe(201);
        expect(JSON.stringify(response.body).includes(secret)).toBe(false);
        const requestData = await command(
            'request-data',
            { text: 'Provide the missing KKT number' },
            'kkt_serial',
        );
        expect(JSON.stringify(requestData.body)).not.toMatch(
            /responseToken|objectKey|passwordHash|storedFileId/,
        );
        const reveal = await operator.agent
            .get(`/admin/api/registrations/${registration.id}/ofd-value`)
            .expect(200);
        expect((reveal.body as { value: string }).value === secret).toBe(true);
        expect(reveal.headers['cache-control']).toBe('private, no-store');
        const audit = await db.getRepository(AuditEventEntity).find();
        expect(JSON.stringify(audit).includes(secret)).toBe(false);
    });
    it('rejects stale verification after a customer changed the displayed value', async () => {
        await readiness.provideValue(
            { platform: 'web', chatId: registration.chatId },
            registration.id,
            'kkt_serial',
            'first',
        );
        const old = actionBody(await detail(), 'verify', 'kkt_serial');
        await readiness.provideValue(
            { platform: 'web', chatId: registration.chatId },
            registration.id,
            'kkt_serial',
            'second',
        );
        await operator.agent
            .post(`/admin/api/registrations/${registration.id}/verify`)
            .send(old)
            .expect(409);
        const current = await detail();
        expect(current.requirements[0].status).toBe('provided');
        expect(current.requirements[0].verifiedBy).toBeNull();
    });
    it('allows one winner for concurrent operator edits/checks', async () => {
        await readiness.provideStaffValue(
            registration.id,
            'kkt_serial',
            operator.id,
            'first',
        );
        const data = await detail();
        const results = await Promise.all([
            operator.agent
                .post(`/admin/api/registrations/${registration.id}/verify`)
                .send(actionBody(data, 'verify', 'kkt_serial')),
            operator.agent
                .post(
                    `/admin/api/registrations/${registration.id}/provide-value`,
                )
                .send({
                    ...actionBody(data, 'provide-value', 'kkt_serial'),
                    value: 'second',
                }),
        ]);
        expect(results.map((item) => item.status).sort()).toEqual([201, 409]);
    });
    it('requires explicit reasons and value/source verification prerequisites', async () => {
        expect((await command('verify', {}, 'kkt_serial')).status).toBe(409);
        expect(
            (await command('not-required', { reason: ' ' }, 'kkt_serial'))
                .status,
        ).toBe(400);
        expect(
            (await command('ofd-mode', { mode: 'not_applicable', reason: ' ' }))
                .status,
        ).toBe(400);
        expect(
            (
                await command(
                    'provide-value',
                    { value: 'number', source: 'internal_registry' },
                    'kkt_serial',
                )
            ).status,
        ).toBe(400);
        expect(
            (
                await command(
                    'not-required',
                    { reason: 'Synthetic explicit exemption' },
                    'kkt_serial',
                )
            ).status,
        ).toBe(201);
    });
    it('request retries reuse the existing request and revoke verification atomically', async () => {
        await db
            .getRepository(RegistrationRequestEntity)
            .update(registration.id, { platform: 'max' });
        messenger.sendMessage.mockRejectedValueOnce(
            new Error('fake unavailable'),
        );
        const failed = (
            await command(
                'request-data',
                { text: 'Synthetic request' },
                'kkt_serial',
            )
        ).body as Detail;
        expect(failed.dataRequests[0].status).toBe('delivery_failed');
        const retried = (await command('request-data', {}, 'kkt_serial'))
            .body as Detail;
        expect(retried.dataRequests).toHaveLength(1);
        expect(retried.dataRequests[0].status).toBe('delivered');
        expect(messenger.sendMessage).toHaveBeenCalledTimes(2);
        await readiness.provideStaffValue(
            registration.id,
            'kkt_serial',
            operator.id,
            'number',
        );
        await readiness.verify(registration.id, 'kkt_serial', operator.id);
        const again = (
            await command(
                're-request',
                { text: 'Please check the number again' },
                'kkt_serial',
            )
        ).body as Detail;
        expect(again.requirements[0].status).toBe('requested');
        expect(again.requirements[0].verifiedBy).toBeNull();
        expect(
            await db
                .getRepository(RegistrationDataRequestEntity)
                .countBy({ registrationId: registration.id }),
        ).toBe(2);
    });
    it('rolls back value mutation and re-request if transaction Audit fails', async () => {
        const audit = jest
            .spyOn(app.get(AuditService), 'record')
            .mockRejectedValue(new Error('fake audit unavailable'));
        await expect(
            readiness.provideStaffValue(
                registration.id,
                'kkt_serial',
                operator.id,
                'number',
            ),
        ).rejects.toThrow('fake audit');
        expect(
            (
                await db
                    .getRepository(RegistrationRequirementEntity)
                    .findOneByOrFail({
                        registrationId: registration.id,
                        kind: 'kkt_serial',
                    })
            ).value,
        ).toBeNull();
        audit.mockRestore();
        await readiness.provideStaffValue(
            registration.id,
            'kkt_serial',
            operator.id,
            'number',
        );
        await readiness.verify(registration.id, 'kkt_serial', operator.id);
        const before = await detail();
        jest.spyOn(app.get(AuditService), 'record').mockRejectedValue(
            new Error('fake audit unavailable'),
        );
        await expect(
            readiness.revokeVerification(
                registration.id,
                'kkt_serial',
                operator.id,
                'explicit reason',
            ),
        ).rejects.toThrow('fake audit');
        const after = await detail();
        expect(after.requirements[0].status).toBe('verified');
        expect(after.requirements[0].version).toBe(
            before.requirements[0].version,
        );
        expect(after.dataRequests).toHaveLength(0);
    });
    it('locks a kit against concurrent links and never imports verified data or stale verifier facts', async () => {
        const second = await fixture();
        await ready();
        const kit = await db.getRepository(EquipmentKitEntity).save({
            cashRegisterSerial: 'kit-kkt',
            fiscalDriveSerial: 'kit-fn',
            ofdActivationCode: randomBytes(12).toString('hex'),
            status: 'stock',
        });
        const firstData = await detail();
        const secondData = await detail(operator, second.id);
        const barrier = db.createQueryRunner();
        await barrier.connect();
        await barrier.startTransaction();
        await barrier.query(
            'SELECT id FROM equipment_kits WHERE id=$1 FOR UPDATE',
            [kit.id],
        );
        const pending = [registration.id, second.id].map((id, index) =>
            operator.agent
                .post(`/admin/api/registrations/${id}/equipment-kit`)
                .send({
                    ...actionBody(
                        index ? secondData : firstData,
                        'equipment-kit',
                    ),
                    kitId: kit.id,
                })
                .then((result) => result),
        );
        try {
            const deadline = Date.now() + 2000;
            let waiting = 0;
            while (waiting < 2 && Date.now() < deadline) {
                const rows: Array<{ count: number }> = await db.query(
                    "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%equipment_kits%'",
                );
                waiting = rows[0].count;
            }
            expect(waiting).toBe(2);
        } finally {
            await barrier.commitTransaction();
            await barrier.release();
        }
        const results = await Promise.all(pending);
        expect(results.map((item) => item.status).sort()).toEqual([201, 409]);
        const winner = results.find((item) => item.status === 201)!
            .body as Detail;
        expect(
            winner.requirements.every(
                (item) =>
                    item.status === 'provided' &&
                    !item.verifiedAt &&
                    !item.verifiedBy,
            ),
        ).toBe(true);
        const options = await operator.agent
            .get(`/admin/api/registrations/${second.id}/options`)
            .expect(200);
        expect(JSON.stringify(options.body).includes('ofdActivationCode')).toBe(
            false,
        );
    });
    it('upload and evidence removal invalidate stale verification; unlink does not delete a shared file', async () => {
        await readiness.provideStaffValue(
            registration.id,
            'kkt_serial',
            operator.id,
            'number',
        );
        const before = await detail();
        const file = await evidence();
        await operator.agent
            .post(`/admin/api/registrations/${registration.id}/verify`)
            .send(actionBody(before, 'verify', 'kkt_serial'))
            .expect(409);
        await readiness.linkEvidence(
            registration.id,
            file.id,
            'fiscal_drive_serial',
            operator.id,
        );
        await readiness.verify(registration.id, 'kkt_serial', operator.id);
        const data = await detail();
        await operator.agent
            .post(
                `/admin/api/registrations/${registration.id}/evidence/${file.id}/remove`,
            )
            .send(actionBody(data, 'remove-evidence'))
            .expect(201);
        expect((await detail()).requirements[0].status).toBe('provided');
        expect(
            (await app.get(FilesService).get(file.storedFileId)).status,
        ).toBe('active');
        await operator.agent
            .get(`/admin/api/registration-evidence/${file.id}/file`)
            .expect(404);
        expect(
            await db
                .getRepository(RegistrationEvidenceEntity)
                .countBy({ storedFileId: file.storedFileId }),
        ).toBe(2);
    });
    it('protects evidence download scope and uses private attachment headers', async () => {
        const file = await evidence();
        const engineer = await staff(['engineer']);
        await engineer.agent
            .get(`/admin/api/registration-evidence/${file.id}/file`)
            .expect(404);
        await db
            .getRepository(RegistrationRequestEntity)
            .update(registration.id, { assignedEngineerId: engineer.id });
        const response = await engineer.agent
            .get(`/admin/api/registration-evidence/${file.id}/file`)
            .expect(200);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['content-disposition']).toMatch(/^attachment/);
        await app.get(FilesService).logicalDelete(file.storedFileId);
        await engineer.agent
            .get(`/admin/api/registration-evidence/${file.id}/file`)
            .expect(404);
    });
    it('keeps handoff gated, rejects a stale ready snapshot, and preserves internal no-op semantics', async () => {
        expect((await command('handoff')).status).toBe(409);
        await ready();
        const checked = await detail();
        expect(checked.registration.status).toBe('new');
        expect(checked.pdf).toBeNull();
        await readiness.provideStaffValue(
            registration.id,
            'kkt_serial',
            operator.id,
            'changed',
        );
        await operator.agent
            .post(`/admin/api/registrations/${registration.id}/handoff`)
            .send(actionBody(checked, 'handoff'))
            .expect(409);
        await readiness.verify(registration.id, 'kkt_serial', operator.id);
        const engineer = await staff(['engineer']);
        const done = (await command('handoff', { engineerId: engineer.id }))
            .body as Detail;
        expect(done.registration.status).toBe('processed');
        expect(done.registration.handedOffAt).toBeTruthy();
        const repeat = (await command('handoff', { engineerId: operator.id }))
            .body as Detail;
        expect(repeat.registration.handedOffAt).toBe(
            done.registration.handedOffAt,
        );
        expect(
            (await command('operator-state', { status: 'new' })).status,
        ).toBe(400);
    });
    it('rejects stale priority and missing preconditions including direct legacy HTTP calls', async () => {
        const before = await detail();
        expect(
            (await command('operator-state', { priority: 'high' })).status,
        ).toBe(201);
        await operator.agent
            .post(`/admin/api/registrations/${registration.id}/operator-state`)
            .send({ ...actionBody(before, 'operator-state'), priority: 'low' })
            .expect(409);
        await operator.agent
            .post(`/admin/api/registrations/${registration.id}/verify`)
            .send({ kind: 'kkt_serial' })
            .expect(400);
        await operator.agent
            .post(`/admin/api/registrations/${registration.id}/operator-state`)
            .send({
                ...actionBody(await detail(), 'operator-state'),
                status: 'processed',
            })
            .expect(400);
    });
    it.each([
        ['verify', 're-request'],
        ['provide-value', 'handoff'],
        ['remove-evidence', 'verify'],
    ] as const)(
        'serializes %s against %s with controlled PostgreSQL lock barriers',
        async (firstAction, secondAction) => {
            await readiness.provideStaffValue(
                registration.id,
                'kkt_serial',
                operator.id,
                'original',
            );
            const proof = await evidence();
            if (secondAction === 'handoff') await ready();
            const view = await detail();
            const firstKind =
                firstAction === 'remove-evidence' ? undefined : 'kkt_serial';
            const secondKind =
                secondAction === 'handoff' ? undefined : 'kkt_serial';
            let entered!: () => void;
            let release!: () => void;
            let competing!: () => void;
            const locked = new Promise<void>((resolve) => {
                entered = resolve;
            });
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            const contender = new Promise<void>((resolve) => {
                competing = resolve;
            });
            const original = policy.lockRegistrationCommand;
            const spy = jest
                .spyOn(policy, 'lockRegistrationCommand')
                .mockImplementation(async (...args) => {
                    if (args[2]?.action === secondAction) competing();
                    const row = await original(...args);
                    if (args[2]?.action === firstAction) {
                        entered();
                        await gate;
                    }
                    return row;
                });
            const endpoint =
                firstAction === 'remove-evidence'
                    ? `evidence/${proof.id}/remove`
                    : firstAction;
            const first = operator.agent
                .post(`/admin/api/registrations/${registration.id}/${endpoint}`)
                .send({
                    ...actionBody(view, firstAction, firstKind),
                    value:
                        firstAction === 'provide-value' ? 'changed' : undefined,
                })
                .then((result) => result.status);
            try {
                await locked;
                const second = operator.agent
                    .post(
                        `/admin/api/registrations/${registration.id}/${secondAction}`,
                    )
                    .send({
                        ...actionBody(view, secondAction, secondKind),
                        text:
                            secondAction === 're-request'
                                ? 'Review changed document'
                                : undefined,
                    })
                    .then((result) => result.status);
                await contender;
                release();
                expect(await first).toBe(201);
                expect(await second).toBe(409);
            } finally {
                release();
                spy.mockRestore();
            }
        },
    );
    it('advances evidence versions even when a provided canonical value does not change', async () => {
        await readiness.provideStaffValue(
            registration.id,
            'kkt_serial',
            operator.id,
            'same value',
        );
        const first = await evidence();
        const second = await evidence();
        const before = await detail();
        const version = before.requirements.find(
            (item) => item.kind === 'kkt_serial',
        )!.version;
        await operator.agent
            .post(
                `/admin/api/registrations/${registration.id}/evidence/${first.id}/remove`,
            )
            .send(actionBody(before, 'remove-evidence'))
            .expect(201);
        const after = await detail();
        expect(
            after.requirements.find((item) => item.kind === 'kkt_serial')!
                .version,
        ).toBeGreaterThan(version);
        expect(after.evidence.map((item) => item.id)).toEqual([second.id]);
        await operator.agent
            .post(`/admin/api/registrations/${registration.id}/verify`)
            .send(actionBody(before, 'verify', 'kkt_serial'))
            .expect(409);
    });
    it('invalidates verification when linking another active evidence and refuses unavailable files', async () => {
        const proof = await evidence();
        await readiness.provideStaffValue(
            registration.id,
            'fiscal_drive_serial',
            operator.id,
            'synthetic',
        );
        await readiness.verify(
            registration.id,
            'fiscal_drive_serial',
            operator.id,
        );
        const data = (
            await command(
                'link-evidence',
                { evidenceId: proof.id },
                'fiscal_drive_serial',
            )
        ).body as Detail;
        const requirement = data.requirements.find(
            (item) => item.kind === 'fiscal_drive_serial',
        )!;
        expect(requirement.status).toBe('provided');
        expect(requirement.verifiedBy).toBeNull();
        await app.get(FilesService).logicalDelete(proof.storedFileId);
        expect(
            (
                await command(
                    'link-evidence',
                    { evidenceId: proof.id },
                    'ofd_code',
                )
            ).status,
        ).toBe(404);
    });
    it('does not create a checklist when a foreign customer reads a draft', async () => {
        const row = await fixture({ status: 'draft' }, false);
        await expect(
            readiness.clientDetails(
                { platform: 'web', chatId: 'foreign' },
                row.id,
            ),
        ).rejects.toMatchObject({ status: 404 });
        expect(
            await db
                .getRepository(RegistrationRequirementEntity)
                .countBy({ registrationId: row.id }),
        ).toBe(0);
    });
    it('does not keep a transaction open while the provider is called or overwrite a concurrent answer', async () => {
        registration = await fixture({ platform: 'max' });
        messenger.sendMessage.mockImplementationOnce(async () => {
            await readiness.provideValue(
                { platform: 'max', chatId: registration.chatId },
                registration.id,
                'kkt_serial',
                'answered during delivery',
            );
        });
        expect(
            (
                await command(
                    'request-data',
                    { text: 'Provide number' },
                    'kkt_serial',
                )
            ).status,
        ).toBe(201);
        const data = await detail();
        expect(data.dataRequests[0].status).toBe('answered');
        expect(
            data.requirements.find((item) => item.kind === 'kkt_serial')!
                .status,
        ).toBe('provided');
    });
    it('projects all canonical requirement states, consistent input fields, and safe action reasons', async () => {
        let data = await detail();
        expect(data.registration.readiness).toBe('incomplete');
        expect(data.requirements[0].status).toBe('missing');
        expect(
            data.requirements[0].actions.find(
                (item) => item.id === 'provide-value',
            )!.inputFields,
        ).toContainEqual({ name: 'value', required: true });
        expect((await command('request-data', {}, 'kkt_serial')).status).toBe(
            201,
        );
        data = await detail();
        expect(data.registration.readiness).toBe('awaiting_customer');
        await readiness.provideValue(
            { platform: 'web', chatId: registration.chatId },
            registration.id,
            'kkt_serial',
            'demo',
        );
        for (const kind of ['fiscal_drive_serial', 'ofd_code'] as const)
            await readiness.markNotRequired(
                registration.id,
                kind,
                operator.id,
                'Explicit synthetic scenario',
            );
        data = await detail();
        expect(data.registration.readiness).toBe('awaiting_verification');
        expect(data.requirements.map((item) => item.status)).toEqual([
            'provided',
            'not_required',
            'not_required',
        ]);
        expect((await command('verify', {}, 'kkt_serial')).status).toBe(201);
        expect((await detail()).registration.readiness).toBe('ready');
        await readiness.setOfdMode(
            registration.id,
            'purchase_from_vitma',
            operator.id,
        );
        data = await detail();
        const reRequest = data.requirements
            .find((item) => item.kind === 'ofd_code')!
            .actions.find((item) => item.id === 're-request')!;
        expect(reRequest.allowed).toBe(false);
        expect(
            (
                await command(
                    're-request',
                    { text: 'Should not ask customer for VITMA code' },
                    'ofd_code',
                )
            ).status,
        ).toBe(409);
    });
    it('does not attach an outdated PDF after generation overlaps a value change', async () => {
        await ready();
        const old = await app.get(FilesService).saveBuffer({
            purpose: 'generated-pdf',
            buffer: syntheticPdf,
            originalName: 'old.pdf',
            mimeType: 'application/pdf',
            serverGenerated: true,
            metadata: { registrationId: registration.id, draft: true },
        });
        await db
            .getRepository(RegistrationRequestEntity)
            .update(registration.id, { pdfFileId: old.id });
        let entered!: () => void;
        let release!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        jest.spyOn(
            app.get(PdfGeneratorService),
            'generateRegistrationPdf',
        ).mockImplementation(async () => {
            entered();
            await gate;
            return syntheticPdf;
        });
        const body = actionBody(await detail(), 'final-pdf');
        const generation = operator.agent
            .post(`/admin/api/registrations/${registration.id}/final-pdf`)
            .send(body)
            .then((response) => response.status);
        await started;
        await readiness.provideStaffValue(
            registration.id,
            'kkt_serial',
            operator.id,
            'new number',
        );
        release();
        expect(await generation).toBe(409);
        expect(
            (
                await db
                    .getRepository(RegistrationRequestEntity)
                    .findOneByOrFail({ id: registration.id })
            ).pdfFileId,
        ).toBe(old.id);
        const files = await db.getRepository(StoredFileEntity).find();
        expect(
            files
                .filter((item) => item.id !== old.id)
                .every((item) => item.status === 'deleted'),
        ).toBe(true);
        expect((await app.get(FilesService).get(old.id)).status).toBe('active');
    });
    it('generates a final PDF once for an unchanged snapshot with no readiness equivalence', async () => {
        await ready();
        const generator = jest
            .spyOn(app.get(PdfGeneratorService), 'generateRegistrationPdf')
            .mockResolvedValue(syntheticPdf);
        const first = (await command('final-pdf')).body as Detail;
        expect(first.pdf?.classification).toBe('final');
        expect(first.registration.status).toBe('new');
        expect((await command('final-pdf')).status).toBe(201);
        expect(generator).toHaveBeenCalledTimes(1);
        await operator.agent
            .get(`/admin/api/registrations/${registration.id}/pdf`)
            .expect(200);
    });
});
