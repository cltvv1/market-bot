import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import type { Telegraf } from 'telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { MESSENGER_SERVICE } from '../src/messenger/messenger.types';
import { RegistrationFieldEntity } from '../src/registrations/entities/registration-field.entity';
import { RegistrationRequestEntity } from '../src/registrations/entities/registration.entity';
import { RegistrationRequirementEntity } from '../src/registrations/entities/registration-requirement.entity';
import { RegistrationEvidenceEntity } from '../src/registrations/entities/registration-evidence.entity';
import { RegistrationDataRequestEntity } from '../src/registrations/entities/registration-data-request.entity';
import { RegistrationClientReadService } from '../src/registrations/registration-client-read.service';
import { RegistrationReadinessService } from '../src/registrations/registration-readiness.service';
import { AuditService } from '../src/audit/audit.service';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { FilesService } from '../src/files/files.service';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { PdfGeneratorService } from '../src/pdf/pdf.service';
import { WebSessionService } from '../src/web-session/web-session.service';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminUserEntity } from '../src/admin/entities/admin-user.entity';
import { OutboundDeliveryEntity } from '../src/outbound-deliveries/entities/outbound-delivery.entity';
import { AdminNotificationsService } from '../src/admin/admin-notifications.service';
import { createTestPassword } from './test-password';
import {
    registrationPrecondition,
    type RegistrationCommandContext,
} from '../src/registrations/registration-admin-policy';
import { OrganizationEntity } from '../src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from '../src/organizations/entities/organization-member.entity';

const origin = 'http://localhost:5173';
const pdf = Buffer.from('%PDF-1.4\nSynthetic registration\n%%EOF');
type Detail = Awaited<ReturnType<RegistrationClientReadService['details']>>;
type OwnerList = Awaited<ReturnType<RegistrationClientReadService['list']>>;
function gate() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}
describe('FE-REG-2 owned registrations', () => {
    let app: INestApplication<App>;
    let db: DataSource;
    let customerSequence = 0;
    let renderPdf: jest.SpyInstance;
    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(MESSENGER_SERVICE)
            .useValue({
                sendMessage: jest.fn(),
                sendDocument: jest.fn(),
                sendImage: jest.fn(),
            })
            .compile();
        app = module.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        db = app.get(DataSource);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
    });
    beforeEach(async () => {
        jest.restoreAllMocks();
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
        renderPdf = jest
            .spyOn(app.get(PdfGeneratorService), 'generateRegistrationPdf')
            .mockResolvedValue(pdf);
        const tables: Array<{ tablename: string }> = await db.query(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'typeorm_migrations'",
        );
        await db.query(
            `TRUNCATE TABLE ${tables.map((row) => `"${row.tablename.replaceAll('"', '""')}"`).join(',')} RESTART IDENTITY CASCADE`,
        );
        await db.manager.save(RegistrationFieldEntity, [
            { name: 'orgName', label: 'Organization', step: 2 },
            { name: 'innKpp', label: 'INN', step: 3 },
            { name: 'phoneToCall', label: 'Contact', step: 4 },
            { name: 'kktModel', label: 'Model', step: 5 },
            { name: 'equipmentPhoto', label: 'Photo', step: 6 },
        ]);
    });
    afterAll(async () => {
        await app?.close();
    });
    async function customer() {
        const agent = request.agent(app.getHttpServer());
        agent.set('Origin', origin);
        agent.set(
            'X-Forwarded-For',
            `10.112.${Math.floor(++customerSequence / 200)}.${(customerSequence % 200) + 1}`,
        );
        await agent.post('/api/client/session').send({}).expect(201);
        return agent;
    }
    it('does not create identity on an unauthenticated owner read', async () => {
        await request(app.getHttpServer())
            .get('/api/client/registrations')
            .expect(401);
        expect(await db.manager.count(RegistrationRequestEntity)).toBe(0);
    });
    it('explicit repeated start resumes one owned draft; list and reload preserve it', async () => {
        const agent = await customer();
        const first = await agent
            .post('/api/client/registrations/drafts')
            .send({})
            .expect(201);
        const second = await agent
            .post('/api/client/registrations/drafts')
            .send({})
            .expect(201);
        expect((second.body as Detail).registration.id).toBe(
            (first.body as Detail).registration.id,
        );
        const list = await agent.get('/api/client/registrations').expect(200);
        expect((list.body as OwnerList).items).toHaveLength(1);
        expect((list.body as OwnerList).limit).toBe(50);
        expect((list.body as OwnerList).items[0].canResumeDraft).toBe(true);
        const detail = await agent
            .get(
                `/api/client/registrations/${(first.body as Detail).registration.id}`,
            )
            .expect(200);
        expect((detail.body as Detail).checklistAvailable).toBe(true);
        const legacy = await agent
            .get(
                `/api/client/registrations/${(first.body as Detail).registration.id}/checklist`,
            )
            .expect(200);
        expect(legacy.headers['cache-control']).toBe('private, no-store');
        expect(
            (detail.body as Detail).form.fields.map(
                (field: { name: string }) => field.name,
            ),
        ).not.toContain('equipmentPhoto');
    });
    async function fixture(submit = false) {
        const agent = await customer();
        const response = await agent
            .post('/api/client/registrations/drafts')
            .send({})
            .expect(201);
        let data = response.body as Detail;
        const base = `/api/client/registrations/${data.registration.id}`;
        if (submit) {
            data = (
                await agent
                    .patch(`${base}/draft`)
                    .send({
                        expectedUpdatedAt:
                            data.customerWorkflow.expectedUpdatedAt,
                        values: {
                            orgName: 'Synthetic organization',
                            innKpp: '123',
                            phoneToCall: '100',
                            kktModel: 'Test model',
                        },
                    })
                    .expect(200)
            ).body as Detail;
            data = (
                await agent
                    .post(`${base}/submit`)
                    .send({
                        expectedUpdatedAt:
                            data.customerWorkflow.expectedUpdatedAt,
                    })
                    .expect(201)
            ).body as Detail;
        }
        return { agent, data, base, id: data.registration.id };
    }
    async function staff() {
        const account = await app.get(AdminAuthService).createStaff({
            login: 'registration-review',
            displayName: 'Synthetic operator',
            password: createTestPassword(['registration-review']),
            roles: ['operator'],
        });
        await db.manager.update(AdminUserEntity, account.id, {
            telegramChatId: 'synthetic-staff-chat',
            notifyRegistrations: true,
        });
        return account;
    }
    it('concurrent starts commit one draft and one complete checklist/audit', async () => {
        const agent = await customer();
        const results = await Promise.all(
            Array.from({ length: 3 }, () =>
                agent
                    .post('/api/client/registrations/drafts')
                    .send({})
                    .expect(201),
            ),
        );
        expect(
            new Set(results.map((r) => (r.body as Detail).registration.id))
                .size,
        ).toBe(1);
        expect(
            results.every((r) => (r.body as Detail).checklistAvailable),
        ).toBe(true);
        expect(await db.manager.count(RegistrationRequirementEntity)).toBe(3);
        expect(
            await db.manager.countBy(AuditEventEntity, {
                action: 'registration.checklist.initialized',
            }),
        ).toBe(1);
    });
    it('saves partial drafts, clears explicit optional/required fields and preserves omitted fields', async () => {
        const { agent, data, base, id } = await fixture();
        const first = await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: { orgName: '  Saved  ', kktModel: 'Model' },
            })
            .expect(200);
        expect((first.body as Detail).application.orgName).toBe('Saved');
        await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: (first.body as Detail).customerWorkflow
                    .expectedUpdatedAt,
                values: { kktModel: '', orgName: '  ' },
            })
            .expect(200);
        const row = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id },
        );
        expect(row.orgName).toBeNull();
        expect(row.kktModel).toBeNull();
        expect(row.status).toBe('draft');
        expect(row.pdfFileId).toBeNull();
    });
    it('two tabs with the same draft precondition have one winner', async () => {
        const { agent, data, base } = await fixture();
        const results = await Promise.all(
            ['A', 'B'].map((orgName) =>
                agent.patch(`${base}/draft`).send({
                    expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                    values: { orgName },
                }),
            ),
        );
        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        expect(
            await db.manager.countBy(AuditEventEntity, {
                action: 'registration.draft.saved',
            }),
        ).toBe(1);
    });
    it.each(['orgName', 'innKpp', 'phoneToCall'])(
        'submit requires %s on the server without PDF or status mutation',
        async (missing) => {
            const { agent, data, base, id } = await fixture();
            const values: Record<string, string> = {
                orgName: 'A',
                innKpp: '123',
                phoneToCall: '100',
            };
            delete values[missing];
            const saved = await agent
                .patch(`${base}/draft`)
                .send({
                    expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                    values,
                })
                .expect(200);
            await agent
                .post(`${base}/submit`)
                .send({
                    expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                        .expectedUpdatedAt,
                })
                .expect(400);
            expect(renderPdf).not.toHaveBeenCalled();
            expect(
                (
                    await db.manager.findOneByOrFail(
                        RegistrationRequestEntity,
                        { id },
                    )
                ).status,
            ).toBe('draft');
        },
    );
    it.each([
        'equipmentPhoto',
        'status',
        'readiness',
        'userId',
        'organizationId',
        'ofdProvisionMode',
        'pdfFileId',
        'unknown',
    ])('draft rejects protected/unknown field %s', async (key) => {
        const { agent, data, base } = await fixture();
        await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: { [key]: 'x' },
            })
            .expect(400);
    });
    it('draft validates types and lengths, without silent truncation', async () => {
        const { agent, data, base } = await fixture();
        for (const values of [
            { orgName: 12 },
            { orgName: null },
            { orgName: 'x'.repeat(10001) },
            { bankReqs: 'x'.repeat(10001) },
        ])
            await agent
                .patch(`${base}/draft`)
                .send({
                    expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                    values,
                })
                .expect(400);
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
        '999999999999999999999',
    ])('bounds client IDs before domain reads: %s', async (id) => {
        const agent = await customer();
        const owner = jest.spyOn(
            app.get(RegistrationClientReadService),
            'owner',
        );
        const response = await agent
            .get(`/api/client/registrations/${encodeURIComponent(id)}`)
            .expect(400);
        expect((response.body as { code: string }).code).toBe(
            'VALIDATION_ERROR',
        );
        await agent
            .get(
                `/api/client/registrations/1/evidence/${encodeURIComponent(id)}`,
            )
            .expect(400);
        const storage = jest.spyOn(app.get(FilesService), 'saveBuffer');
        await agent
            .post(
                `/api/client/registrations/${encodeURIComponent(id)}/requirements/kkt_serial/evidence`,
            )
            .field('expectedRequirementVersion', '1')
            .attach('file', pdf, 'evidence.pdf')
            .expect(400);
        expect(owner).not.toHaveBeenCalled();
        expect(storage).not.toHaveBeenCalled();
    });
    it('foreign and missing records have indistinguishable responses and no side effects', async () => {
        const { id, base } = await fixture();
        const foreign = await customer();
        const count = await db.manager.count(AuditEventEntity);
        const denied = await foreign.get(base).expect(404);
        const absent = await foreign
            .get('/api/client/registrations/2147483647')
            .expect(404);
        expect((denied.body as { message: string }).message).toBe(
            (absent.body as { message: string }).message,
        );
        await foreign
            .patch(`${base}/draft`)
            .send({ expectedUpdatedAt: new Date().toISOString(), values: {} })
            .expect(404);
        await foreign
            .post(`${base}/submit`)
            .send({ expectedUpdatedAt: new Date().toISOString() })
            .expect(404);
        const storage = jest.spyOn(app.get(FilesService), 'saveBuffer');
        await foreign
            .post(
                `/api/client/registrations/${id}/requirements/kkt_serial/evidence`,
            )
            .field('expectedRequirementVersion', '1')
            .attach('file', pdf, 'evidence.pdf')
            .expect(404);
        expect(storage).not.toHaveBeenCalled();
        expect(await db.manager.count(AuditEventEntity)).toBe(count);
    });
    it('owner uses userId; null-user compatibility is exact web chat only', async () => {
        const { agent, id, base } = await fixture();
        await db.manager.update(RegistrationRequestEntity, id, {
            chatId: 'old-chat',
        });
        await agent.get(base).expect(200);
        await db.manager.update(RegistrationRequestEntity, id, {
            userId: null,
        });
        await agent.get(base).expect(404);
        const owned = await app.get(WebSessionService).create();
        await db.manager.update(RegistrationRequestEntity, id, {
            chatId: owned.principal.chatId,
        });
        await expect(
            app.get(RegistrationClientReadService).details(owned.principal, id),
        ).resolves.toBeDefined();
        await db.manager.update(RegistrationRequestEntity, id, {
            platform: 'max',
            userId: owned.principal.userId,
        });
        await expect(
            app.get(RegistrationClientReadService).details(owned.principal, id),
        ).rejects.toMatchObject({ status: 404 });
    });
    it('active representative of the same organization cannot read another owner registration', async () => {
        const { agent, id, base } = await fixture();
        const other = await fixture();
        const otherRow = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id: other.id },
        );
        const organization = await db.manager.save(OrganizationEntity, {
            inn: '0000000000',
            name: 'Synthetic shared organization',
        });
        await db.manager.update(RegistrationRequestEntity, id, {
            organizationId: organization.id,
        });
        await db.manager.save(OrganizationMemberEntity, {
            organizationId: organization.id,
            userId: otherRow.userId,
            role: 'representative',
            status: 'active',
        });
        await agent.get(base).expect(200);
        await other.agent.get(base).expect(404);
        const list = (
            await other.agent.get('/api/client/registrations').expect(200)
        ).body as OwnerList;
        expect(list.items.map((item) => item.id)).not.toContain(id);
    });
    it('legacy/malformed checklist reads never repair or write audit', async () => {
        const { agent, id, base, data } = await fixture();
        await db.manager.delete(RegistrationRequirementEntity, {
            registrationId: id,
            kind: 'ofd_code',
        });
        const before = await db.manager.count(AuditEventEntity);
        for (const url of [base, `${base}/checklist`]) {
            const result = await agent.get(url).expect(200);
            expect((result.body as Detail).checklistAvailable).toBe(false);
            expect((result.body as Detail).customerWorkflow.canEditDraft).toBe(
                false,
            );
        }
        await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: {},
            })
            .expect(409);
        expect(await db.manager.count(RegistrationRequirementEntity)).toBe(2);
        expect(await db.manager.count(AuditEventEntity)).toBe(before);
    });
    it('list caps at 50, orders by creation/id and excludes another identity', async () => {
        const { agent, id } = await fixture();
        const root = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id },
        );
        for (let i = 0; i < 54; i++)
            await db.manager.save(RegistrationRequestEntity, {
                platform: 'web',
                userId: root.userId,
                chatId: root.chatId,
                status: 'processed',
                orgName: `Test ${i}`,
                createdAt: new Date(1700000000000 + i),
            });
        await fixture();
        const result = await agent.get('/api/client/registrations').expect(200);
        expect((result.body as OwnerList).items).toHaveLength(50);
        expect((result.body as OwnerList).items[0].id).toBe(id);
        const serialized = JSON.stringify(result.body);
        for (const key of [
            'chatId',
            'pdfFileId',
            'userId',
            'bankReqs',
            'priority',
        ])
            expect(serialized).not.toContain(`"${key}"`);
    });
    it.each(['', 'https://foreign.invalid'])(
        'all 8 mutations reject missing/foreign Origin (%s) before writes',
        async (source) => {
            const { agent, base, data } = await fixture();
            const withoutOrigin = <T extends request.Test>(call: T) =>
                source ? call.set('Origin', source) : call.unset('Origin');
            const before = await db.manager.count(AuditEventEntity);
            const storage = jest.spyOn(app.get(FilesService), 'saveBuffer');
            for (const url of [
                '/api/client/registrations/drafts',
                '/api/client/registrations/start',
                '/api/client/registrations/answer',
                '/api/client/registrations/form',
                `${base}/submit`,
                `${base}/requirements/kkt_serial/value`,
            ])
                await withoutOrigin(agent.post(url)).send({}).expect(403);
            await withoutOrigin(agent.patch(`${base}/draft`))
                .send({
                    expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                    values: {},
                })
                .expect(403);
            await withoutOrigin(
                agent.post(`${base}/requirements/kkt_serial/evidence`),
            )
                .field('expectedRequirementVersion', '1')
                .attach('file', pdf, 'evidence.pdf')
                .expect(403);
            expect(storage).not.toHaveBeenCalled();
            expect(await db.manager.count(AuditEventEntity)).toBe(before);
        },
    );
    it('submitted readonly application preserves checklist and enqueues one text/document pair', async () => {
        await staff();
        const { agent, id, base, data } = await fixture(true);
        expect(data.registration.status).toBe('new');
        expect(data.registration.readiness).toBe('incomplete');
        expect(data.requirements.every((r) => r.status === 'missing')).toBe(
            true,
        );
        await agent
            .post(`${base}/submit`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
            })
            .expect(409);
        await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: { orgName: 'Changed' },
            })
            .expect(409);
        expect(await db.manager.count(OutboundDeliveryEntity)).toBe(2);
        expect(
            await db.manager.countBy(AuditEventEntity, {
                action: 'registration.submitted',
                targetId: String(id),
            }),
        ).toBe(1);
        const row = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id },
        );
        expect(row.pdfFileId).toBeTruthy();
        expect(JSON.stringify(data)).not.toContain('pdfFileId');
    });
    it('double submit generates outside locks; one attachment wins and loser is retired', async () => {
        await staff();
        const { agent, data, base, id } = await fixture();
        const saved = await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: { orgName: 'Test', innKpp: '123', phoneToCall: '100' },
            })
            .expect(200);
        const both = gate();
        const finish = gate();
        let entered = 0;
        jest.spyOn(
            app.get(PdfGeneratorService),
            'generateRegistrationPdf',
        ).mockImplementation(async () => {
            if (++entered === 2) both.release();
            await finish.promise;
            return pdf;
        });
        const body = {
            expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                .expectedUpdatedAt,
        };
        const pending = Promise.all([
            agent
                .post(`${base}/submit`)
                .send(body)
                .then((r) => r),
            agent
                .post(`${base}/submit`)
                .send(body)
                .then((r) => r),
        ]);
        await both.promise;
        finish.release();
        expect((await pending).map((r) => r.status).sort()).toEqual([201, 409]);
        const files = await db.manager.find(StoredFileEntity);
        expect(files.map((f) => f.status).sort()).toEqual([
            'active',
            'deleted',
        ]);
        expect(await db.manager.count(OutboundDeliveryEntity)).toBe(2);
        const row = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id },
        );
        expect(files.find((f) => f.status === 'active')!.id).toBe(
            row.pdfFileId,
        );
    });
    it('saving while PDF is generating is not blocked and stale submit cannot overwrite', async () => {
        const { agent, data, base, id } = await fixture();
        const saved = await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: {
                    orgName: 'Before',
                    innKpp: '123',
                    phoneToCall: '100',
                },
            })
            .expect(200);
        const entered = gate();
        const finish = gate();
        jest.spyOn(
            app.get(PdfGeneratorService),
            'generateRegistrationPdf',
        ).mockImplementation(async () => {
            entered.release();
            await finish.promise;
            return pdf;
        });
        const pending = agent
            .post(`${base}/submit`)
            .send({
                expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                    .expectedUpdatedAt,
            })
            .then((r) => r);
        await entered.promise;
        try {
            await agent
                .patch(`${base}/draft`)
                .send({
                    expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                        .expectedUpdatedAt,
                    values: { orgName: 'After' },
                })
                .expect(200);
        } finally {
            finish.release();
        }
        expect((await pending).status).toBe(409);
        const row = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id },
        );
        expect(row.orgName).toBe('After');
        expect(row.status).toBe('draft');
        expect(row.pdfFileId).toBeNull();
        expect(
            (await db.manager.findOneByOrFail(StoredFileEntity, {})).status,
        ).toBe('deleted');
    });
    it('submit rolls back on audit failure without attaching its new document', async () => {
        const { agent, data, base, id } = await fixture();
        const saved = await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: { orgName: 'Test', innKpp: '123', phoneToCall: '100' },
            })
            .expect(200);
        const record = app
            .get(AuditService)
            .record.bind(app.get(AuditService)) as AuditService['record'];
        jest.spyOn(app.get(AuditService), 'record').mockImplementation(
            (input, manager) => {
                if (input.action === 'registration.submitted')
                    throw new Error('Synthetic audit failure');
                return record(input, manager);
            },
        );
        await agent
            .post(`${base}/submit`)
            .send({
                expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                    .expectedUpdatedAt,
            })
            .expect(500);
        expect(
            (
                await db.manager.findOneByOrFail(RegistrationRequestEntity, {
                    id,
                })
            ).status,
        ).toBe('draft');
        expect(await db.manager.count(OutboundDeliveryEntity)).toBe(0);
        expect(
            (await db.manager.findOneByOrFail(StoredFileEntity, {})).status,
        ).toBe('deleted');
    });
    it('legacy form cannot bypass required fields; valid form uses the canonical submit', async () => {
        const agent = await customer();
        await agent
            .post('/api/client/registrations/form')
            .send({ values: {} })
            .expect(400);
        expect(await db.manager.count(RegistrationRequestEntity)).toBe(0);
        const result = await agent
            .post('/api/client/registrations/form')
            .send({
                values: { orgName: 'Test', innKpp: '123', phoneToCall: '100' },
            })
            .expect(201);
        expect((result.body as { status: string }).status).toBe('completed');
        expect((result.body as { data: { status: string } }).data.status).toBe(
            'new',
        );
    });
    it.each([1500, 10000, 10001])(
        'compatibility form preserves the historical %i-character boundary',
        async (length) => {
            const agent = await customer();
            const orgName = 'x'.repeat(length);
            await agent
                .post('/api/client/registrations/form')
                .send({
                    values: { orgName, innKpp: '123', phoneToCall: '100' },
                })
                .expect(length <= 10000 ? 201 : 400);
            if (length > 10000) {
                expect(await db.manager.count(RegistrationRequestEntity)).toBe(
                    0,
                );
                expect(renderPdf).not.toHaveBeenCalled();
            } else {
                const row = await db.manager.findOneByOrFail(
                    RegistrationRequestEntity,
                    {},
                );
                expect(row.orgName).toBe(orgName);
                expect(row.status).toBe('new');
                expect(renderPdf).toHaveBeenCalledWith(
                    expect.objectContaining({ orgName }),
                    expect.any(Array),
                    expect.any(Object),
                );
            }
        },
    );
    it.each([1500, 10000, 10001])(
        'compatibility answer preserves the historical %i-character boundary',
        async (length) => {
            const agent = await customer();
            await agent
                .post('/api/client/registrations/start')
                .send({})
                .expect(201);
            const row = await db.manager.findOneByOrFail(
                RegistrationRequestEntity,
                {},
            );
            expect(row.currentStep).toBe(2);
            const orgName = 'x'.repeat(length);
            await agent
                .post('/api/client/registrations/answer')
                .send({ value: orgName })
                .expect(length <= 10000 ? 201 : 400);
            const detail = (
                await agent
                    .get(`/api/client/registrations/${row.id}`)
                    .expect(200)
            ).body as Detail;
            expect(detail.application.orgName).toBe(
                length <= 10000 ? orgName : '',
            );
            expect(detail.registration.currentStep).toBe(
                length <= 10000 ? 3 : 2,
            );
            await agent
                .get(`/api/client/registrations/${row.id}/checklist`)
                .expect(200);
        },
    );
    it.each([1500, 10000, 10001])(
        'canonical draft preserves the historical %i-character boundary through submit',
        async (length) => {
            const { agent, data, base } = await fixture();
            const orgName = 'x'.repeat(length);
            await agent
                .patch(`${base}/draft`)
                .send({
                    expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                    values: { orgName, innKpp: '123', phoneToCall: '100' },
                })
                .expect(length <= 10000 ? 200 : 400);
            const detail = (await agent.get(base).expect(200)).body as Detail;
            expect(detail.application.orgName).toBe(
                length <= 10000 ? orgName : '',
            );
            if (length <= 10000) {
                await agent
                    .post(`${base}/submit`)
                    .send({
                        expectedUpdatedAt:
                            detail.customerWorkflow.expectedUpdatedAt,
                    })
                    .expect(201);
                expect(renderPdf).toHaveBeenCalledWith(
                    expect.objectContaining({ orgName }),
                    expect.any(Array),
                    expect.any(Object),
                );
            } else {
                expect(detail.customerWorkflow.expectedUpdatedAt).toBe(
                    data.customerWorkflow.expectedUpdatedAt,
                );
                expect(renderPdf).not.toHaveBeenCalled();
            }
        },
    );
    it('compatibility resume preserves an existing long value while saving another field', async () => {
        const { agent, base, id } = await fixture();
        const orgName = 'x'.repeat(1500);
        // Represent a draft persisted before the canonical web routes existed.
        await db.manager.update(RegistrationRequestEntity, id, { orgName });
        const detail = (await agent.get(base).expect(200)).body as Detail;
        expect(detail.application.orgName).toBe(orgName);
        const saved = (
            await agent
                .patch(`${base}/draft`)
                .send({
                    expectedUpdatedAt:
                        detail.customerWorkflow.expectedUpdatedAt,
                    values: {
                        orgName: detail.application.orgName,
                        kktModel: 'Updated model',
                    },
                })
                .expect(200)
        ).body as Detail;
        expect(saved.application.orgName).toBe(orgName);
        expect(saved.application.kktModel).toBe('Updated model');
        const reloaded = (await agent.get(base).expect(200)).body as Detail;
        expect(reloaded.application.orgName).toBe(orgName);
        expect(
            reloaded.form.fields.every((field) => field.maxLength === 10000),
        ).toBe(true);
    });
    it('missing required field definitions disable editing without a read repair', async () => {
        const { agent, base, data } = await fixture();
        await db.manager.delete(RegistrationFieldEntity, {
            name: 'phoneToCall',
        });
        const count = await db.manager.count(AuditEventEntity);
        const current = (await agent.get(base).expect(200)).body as Detail;
        expect(current.form.available).toBe(false);
        expect(current.customerWorkflow.canEditDraft).toBe(false);
        await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: { orgName: 'A' },
            })
            .expect(409);
        expect(await db.manager.count(AuditEventEntity)).toBe(count);
    });
    it('definition changes retain saved values; phase B rejects a changed field definition', async () => {
        const { agent, base, data, id } = await fixture();
        const saved = await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: {
                    orgName: 'A',
                    innKpp: '1',
                    phoneToCall: '2',
                    kktModel: 'Keep',
                },
            })
            .expect(200);
        await db.manager.delete(RegistrationFieldEntity, { name: 'kktModel' });
        expect(
            ((await agent.get(base).expect(200)).body as Detail).application
                .kktModel,
        ).toBe('Keep');
        const entered = gate();
        const finish = gate();
        jest.spyOn(
            app.get(PdfGeneratorService),
            'generateRegistrationPdf',
        ).mockImplementation(async () => {
            entered.release();
            await finish.promise;
            return pdf;
        });
        const pending = agent
            .post(`${base}/submit`)
            .send({
                expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                    .expectedUpdatedAt,
            })
            .then((r) => r);
        await entered.promise;
        try {
            await db.manager.update(
                RegistrationFieldEntity,
                { name: 'orgName' },
                { label: 'Changed current definition' },
            );
        } finally {
            finish.release();
        }
        expect((await pending).status).toBe(409);
        expect(
            (
                await db.manager.findOneByOrFail(RegistrationRequestEntity, {
                    id,
                })
            ).kktModel,
        ).toBe('Keep');
    });
    it('notification failure rolls back status and intents and preserves the previous PDF', async () => {
        const { agent, base, data, id } = await fixture();
        await staff();
        const previous = await app.get(FilesService).saveBuffer({
            purpose: 'generated-pdf',
            buffer: pdf,
            originalName: 'previous.pdf',
            mimeType: 'application/pdf',
            serverGenerated: true,
            metadata: { registrationId: id },
        });
        await db.manager.update(RegistrationRequestEntity, id, {
            pdfFileId: previous.id,
        });
        const current = (await agent.get(base).expect(200)).body as Detail;
        const saved = await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: current.customerWorkflow.expectedUpdatedAt,
                values: { orgName: 'A', innKpp: '1', phoneToCall: '2' },
            })
            .expect(200);
        jest.spyOn(
            app.get(AdminNotificationsService),
            'notifyDocument',
        ).mockRejectedValue(new Error('Synthetic enqueue failure'));
        await agent
            .post(`${base}/submit`)
            .send({
                expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                    .expectedUpdatedAt,
            })
            .expect(500);
        const row = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id },
        );
        expect(row.status).toBe(data.registration.status);
        expect(row.pdfFileId).toBe(previous.id);
        expect(await db.manager.count(OutboundDeliveryEntity)).toBe(0);
        expect((await app.get(FilesService).get(previous.id))?.status).toBe(
            'active',
        );
        expect(
            (await db.manager.find(StoredFileEntity))
                .filter((file) => file.id !== previous.id)
                .map((file) => file.status),
        ).toEqual(['deleted']);
    });
    it('PDF rendering failure leaves the saved draft intact without files or intents', async () => {
        const { agent, base, data, id } = await fixture();
        const saved = await agent
            .patch(`${base}/draft`)
            .send({
                expectedUpdatedAt: data.customerWorkflow.expectedUpdatedAt,
                values: { orgName: 'A', innKpp: '1', phoneToCall: '2' },
            })
            .expect(200);
        jest.spyOn(
            app.get(PdfGeneratorService),
            'generateRegistrationPdf',
        ).mockRejectedValue(new Error('Synthetic render failure'));
        await agent
            .post(`${base}/submit`)
            .send({
                expectedUpdatedAt: (saved.body as Detail).customerWorkflow
                    .expectedUpdatedAt,
            })
            .expect(500);
        expect(
            (
                await db.manager.findOneByOrFail(RegistrationRequestEntity, {
                    id,
                })
            ).status,
        ).toBe('draft');
        expect(await db.manager.count(StoredFileEntity)).toBe(0);
        expect(await db.manager.count(OutboundDeliveryEntity)).toBe(0);
    });
    it('detail is one coherent database snapshot across concurrent requirement/root changes', async () => {
        const { id } = await fixture(true);
        const root = await db.manager.findOneByOrFail(
            RegistrationRequestEntity,
            { id },
        );
        const principal = {
            userId: root.userId,
            chatId: root.chatId,
        } as import('../src/web-session/web-session.types').WebSessionPrincipal;
        const read = app.get(RegistrationClientReadService);
        const owner = read.owner.bind(
            read,
        ) as RegistrationClientReadService['owner'];
        const entered = gate();
        const finish = gate();
        jest.spyOn(read, 'owner').mockImplementation(async (...args) => {
            const row = await owner(...args);
            entered.release();
            await finish.promise;
            return row;
        });
        const pending = read.details(principal, id);
        await entered.promise;
        try {
            await db.transaction(async (manager) => {
                await manager.update(RegistrationRequestEntity, id, {
                    status: 'processed',
                    readiness: 'ready',
                });
                await manager.update(
                    RegistrationRequirementEntity,
                    { registrationId: id },
                    { status: 'verified' },
                );
            });
        } finally {
            finish.release();
        }
        const snapshot = await pending;
        expect(snapshot.registration.status).toBe('new');
        expect(
            snapshot.requirements.every((item) => item.status === 'missing'),
        ).toBe(true);
    });
    it.each([
        'missing',
        'deleted',
        'rejected',
        'binding',
        'purpose',
        'removed',
        'foreign-evidence',
    ] as const)(
        'owner download rejects %s evidence without read effects',
        async (variant) => {
            const { agent, base, data } = await fixture(true);
            const response = await agent
                .post(`${base}/requirements/kkt_serial/evidence`)
                .field(
                    'expectedRequirementVersion',
                    String(data.requirements[0].version),
                )
                .attach('file', pdf, 'evidence.pdf')
                .expect(201);
            const evidence = (response.body as Detail).evidence[0];
            const link = await db.manager.findOneByOrFail(
                RegistrationEvidenceEntity,
                { id: evidence.id },
            );
            const stored = await db.manager.findOneByOrFail(StoredFileEntity, {
                id: link.storedFileId,
            });
            if (variant === 'missing')
                jest.spyOn(app.get(FilesService), 'exists').mockResolvedValue(
                    false,
                );
            if (variant === 'deleted' || variant === 'rejected')
                await db.manager.update(StoredFileEntity, stored.id, {
                    status: variant,
                });
            if (variant === 'binding')
                await db.manager.update(StoredFileEntity, stored.id, {
                    metadata: {
                        ...stored.metadata,
                        registrationId: 2147483647,
                    },
                });
            if (variant === 'purpose')
                await db.manager.update(StoredFileEntity, stored.id, {
                    metadata: { ...stored.metadata, purpose: 'generated-pdf' },
                });
            if (variant === 'removed')
                await db.manager.update(
                    RegistrationEvidenceEntity,
                    evidence.id,
                    { removedAt: new Date() },
                );
            const before = await db.manager.count(AuditEventEntity);
            const target =
                variant === 'foreign-evidence'
                    ? `/api/client/registrations/${(await fixture(true)).id}/evidence/${evidence.id}`
                    : evidence.downloadUrl;
            const checkpoint = await db.manager.count(AuditEventEntity);
            await agent.get(target).expect(404);
            expect(await db.manager.count(AuditEventEntity)).toBe(checkpoint);
            if (variant !== 'foreign-evidence') {
                const detail = (await agent.get(base).expect(200))
                    .body as Detail;
                expect(detail.evidence.every((file) => !file.available)).toBe(
                    true,
                );
                if (variant === 'binding' || variant === 'purpose') {
                    expect(JSON.stringify(detail.evidence)).not.toContain(
                        stored.originalName,
                    );
                }
                expect(await db.manager.count(AuditEventEntity)).toBe(before);
            }
        },
    );
    it('requirement value uses mandatory version, answers request and does not verify', async () => {
        const { agent, id, base, data } = await fixture(true);
        const actor = await staff();
        const readiness = app.get(RegistrationReadinessService);
        await readiness.requestData(
            id,
            'kkt_serial',
            actor.id,
            'Synthetic request',
        );
        const detail = (await agent.get(base).expect(200)).body as Detail;
        const requirement = detail.requirements.find(
            (r) => r.kind === 'kkt_serial',
        )!;
        await agent
            .post(`${base}/requirements/kkt_serial/value`)
            .send({ value: 'New' })
            .expect(400);
        await agent
            .post(`${base}/requirements/kkt_serial/value`)
            .send({
                value: 'New',
                expectedRequirementVersion: data.requirements[0].version,
            })
            .expect(409);
        const result = await agent
            .post(`${base}/requirements/kkt_serial/value`)
            .send({
                value: 'New',
                expectedRequirementVersion: requirement.version,
            })
            .expect(201);
        const updated = (result.body as Detail).requirements.find(
            (r) => r.kind === 'kkt_serial',
        )!;
        expect(updated.version).toBe(requirement.version + 1);
        expect(updated.status).toBe('provided');
        expect(updated.source).toBe('customer_input');
        expect(
            (
                await db.manager.findOneByOrFail(
                    RegistrationDataRequestEntity,
                    { requirementId: requirement.id },
                )
            ).status,
        ).toBe('answered');
        await readiness.verify(id, 'kkt_serial', actor.id);
        await agent
            .post(`${base}/requirements/kkt_serial/value`)
            .send({
                value: 'Late',
                expectedRequirementVersion: updated.version,
            })
            .expect(409);
    });
    it('invalid version/body/file shape never creates StoredFile or changes a requirement', async () => {
        const { agent, base, data } = await fixture(true);
        const storage = jest.spyOn(app.get(FilesService), 'saveBuffer');
        for (const expectedRequirementVersion of [
            undefined,
            null,
            true,
            0,
            -1,
            1.2,
            2147483648,
            ['1'],
            {},
        ]) {
            await agent
                .post(`${base}/requirements/kkt_serial/value`)
                .send({ value: 'Invalid', expectedRequirementVersion })
                .expect(400);
        }
        await agent
            .post(`${base}/requirements/kkt_serial/evidence`)
            .attach('file', pdf, 'missing-version.pdf')
            .expect(400);
        await agent
            .post(`${base}/requirements/kkt_serial/evidence`)
            .field('expectedRequirementVersion', '1')
            .field('expectedRequirementVersion', '1')
            .attach('file', pdf, 'duplicate-version.pdf')
            .expect(400);
        await agent
            .post(`${base}/requirements/kkt_serial/evidence`)
            .field('expectedRequirementVersion', '1')
            .attach('file', pdf, 'one.pdf')
            .attach('file', pdf, 'two.pdf')
            .expect(400);
        expect(storage).not.toHaveBeenCalled();
        const current = (await agent.get(base).expect(200)).body as Detail;
        expect(current.requirements).toEqual(data.requirements);
    });
    it('two customer tabs have one requirement value winner', async () => {
        const { agent, base, data } = await fixture(true);
        const responses = await Promise.all(
            ['A', 'B'].map((value) =>
                agent.post(`${base}/requirements/kkt_serial/value`).send({
                    value,
                    expectedRequirementVersion: data.requirements[0].version,
                }),
            ),
        );
        expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    });
    it.each([
        ['value', 'verify', 'customer'],
        ['value', 'verify', 'staff'],
        ['evidence', 'verify', 'customer'],
        ['evidence', 'verify', 'staff'],
        ['value', 're-request', 'customer'],
        ['value', 're-request', 'staff'],
    ] as const)(
        'PostgreSQL barrier: customer %s vs staff %s, %s reaches the lock first',
        async (operation, action, first) => {
            const { agent, base, id } = await fixture(true);
            const actor = await staff();
            const readiness = app.get(RegistrationReadinessService);
            await readiness.provideStaffValue(
                id,
                'kkt_serial',
                actor.id,
                'Initial',
            );
            const registration = await db.manager.findOneByOrFail(
                RegistrationRequestEntity,
                { id },
            );
            const requirements = await db.manager.findBy(
                RegistrationRequirementEntity,
                { registrationId: id },
            );
            const context: RegistrationCommandContext = {
                staffId: actor.id,
                action,
                precondition: registrationPrecondition(
                    action,
                    registration,
                    requirements,
                    'kkt_serial',
                ),
            };
            const version = requirements.find(
                (item) => item.kind === 'kkt_serial',
            )!.version;
            const barrier = db.createQueryRunner();
            await barrier.connect();
            await barrier.startTransaction();
            await barrier.query(
                'SELECT id FROM registration_requests WHERE id=$1 FOR UPDATE',
                [id],
            );
            const customerCommand = () =>
                (operation === 'value'
                    ? agent.post(`${base}/requirements/kkt_serial/value`).send({
                          value: 'Customer',
                          expectedRequirementVersion: version,
                      })
                    : agent
                          .post(`${base}/requirements/kkt_serial/evidence`)
                          .field('expectedRequirementVersion', String(version))
                          .attach('file', pdf, 'race.pdf')
                ).then((response) => response.status);
            const staffCommand = () =>
                (action === 'verify'
                    ? readiness.verify(
                          id,
                          'kkt_serial',
                          actor.id,
                          undefined,
                          context,
                      )
                    : readiness.revokeVerification(
                          id,
                          'kkt_serial',
                          actor.id,
                          'Please check the number',
                          context,
                      )
                ).then(
                    () => 201,
                    (error: unknown) => (error as { status: number }).status,
                );
            const waiters = async (count: number) => {
                for (let attempt = 0; attempt < 150; attempt++) {
                    const rows = await db.query<Array<{ count: number }>>(
                        'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid)) > 0',
                    );
                    if (rows[0].count >= count) return;
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
                throw new Error(
                    'Commands did not reach the PostgreSQL root lock',
                );
            };
            let a: Promise<number> | undefined, b: Promise<number> | undefined;
            try {
                a = first === 'customer' ? customerCommand() : staffCommand();
                await waiters(1);
                b = first === 'customer' ? staffCommand() : customerCommand();
                await waiters(2);
            } finally {
                await barrier.commitTransaction();
                await barrier.release();
                // Drain commands before the next test truncates its isolated database.
                await Promise.allSettled([a, b]);
            }
            expect((await Promise.all([a, b])).sort()).toEqual([201, 409]);
            const current = await db.manager.findOneByOrFail(
                RegistrationRequirementEntity,
                { registrationId: id, kind: 'kkt_serial' },
            );
            expect(current.status).toBe(
                first === 'customer'
                    ? 'provided'
                    : action === 'verify'
                      ? 'verified'
                      : 'requested',
            );
            expect(current.value).toBe(
                first === 'customer' && operation === 'value'
                    ? 'Customer'
                    : 'Initial',
            );
            const requests = await db.manager.findBy(
                RegistrationDataRequestEntity,
                { registrationId: id },
            );
            expect(requests).toHaveLength(
                action === 're-request' && first === 'staff' ? 1 : 0,
            );
            if (requests[0]) expect(requests[0].status).toBe('delivered');
            expect(await db.manager.count(RegistrationEvidenceEntity)).toBe(
                operation === 'evidence' && first === 'customer' ? 1 : 0,
            );
        },
    );
    it.each(['draft', 'processed'] as const)(
        'web value/evidence reject %s before storage but internal bot draft remains supported',
        async (status) => {
            const { agent, base, id } = await fixture();
            await db.manager.update(RegistrationRequestEntity, id, { status });
            const storage = jest.spyOn(app.get(FilesService), 'saveBuffer');
            await agent
                .post(`${base}/requirements/kkt_serial/value`)
                .send({ value: 'x', expectedRequirementVersion: 1 })
                .expect(409);
            await agent
                .post(`${base}/requirements/kkt_serial/evidence`)
                .field('expectedRequirementVersion', '1')
                .attach('file', pdf, 'evidence.pdf')
                .expect(409);
            expect(storage).not.toHaveBeenCalled();
        },
    );
    it('customer evidence is context-bound, downloadable, private and masked in the projection', async () => {
        const { agent, id, base, data } = await fixture(true);
        const result = await agent
            .post(`${base}/requirements/kkt_serial/evidence`)
            .field(
                'expectedRequirementVersion',
                String(data.requirements[0].version),
            )
            .attach('file', pdf, 'Подтверждение.pdf')
            .expect(201);
        const evidence = (result.body as Detail).evidence[0];
        expect(evidence.available).toBe(true);
        const download = await agent.get(evidence.downloadUrl).expect(200);
        expect(download.headers['content-disposition']).toContain(
            "filename*=UTF-8''",
        );
        expect(download.headers['cache-control']).toContain('no-store');
        expect(download.headers['x-content-type-options']).toBe('nosniff');
        expect(download.body).toEqual(pdf);
        const foreign = await customer();
        await foreign.get(evidence.downloadUrl).expect(404);
        const raw = 'synthetic-code-private';
        await db.manager.update(
            RegistrationRequirementEntity,
            { registrationId: id, kind: 'ofd_code' },
            { value: raw, operatorComment: 'Private staff note' },
        );
        const detail = await agent.get(base).expect(200);
        for (const secret of [
            raw,
            'Private staff note',
            'objectKey',
            'metadata',
            'verifiedByStaffId',
            'responseToken',
            'assignedEngineerId',
        ])
            expect(JSON.stringify(detail.body)).not.toContain(secret);
        await db.manager.update(RegistrationEvidenceEntity, evidence.id, {
            visibility: 'staff',
        });
        await agent.get(evidence.downloadUrl).expect(404);
    });
    it('stale upload retires its StoredFile without replacing verified data', async () => {
        const { agent, id, base, data } = await fixture(true);
        const actor = await staff();
        const readiness = app.get(RegistrationReadinessService);
        const entered = gate();
        const finish = gate();
        const files = app.get(FilesService);
        const save = files.saveBuffer.bind(files) as FilesService['saveBuffer'];
        jest.spyOn(files, 'saveBuffer').mockImplementation(async (input) => {
            const stored = await save(input);
            entered.release();
            await finish.promise;
            return stored;
        });
        const pending = agent
            .post(`${base}/requirements/kkt_serial/evidence`)
            .field(
                'expectedRequirementVersion',
                String(data.requirements[0].version),
            )
            .attach('file', pdf, 'late.pdf')
            .then((r) => r);
        await entered.promise;
        try {
            await readiness.provideStaffValue(
                id,
                'kkt_serial',
                actor.id,
                'Staff',
            );
            await readiness.verify(id, 'kkt_serial', actor.id);
        } finally {
            finish.release();
        }
        expect((await pending).status).toBe(409);
        expect(await db.manager.count(RegistrationEvidenceEntity)).toBe(0);
        const stored = await db.manager.find(StoredFileEntity);
        expect(
            stored
                .filter((f) => f.metadata?.purpose === 'registration-evidence')
                .map((f) => f.status),
        ).toEqual(['deleted']);
    });
});
