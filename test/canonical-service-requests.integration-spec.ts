/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { ServiceFormService } from '../src/service-requests/service-form.service';
import { ServiceTypeEntity } from '../src/service-requests/entities/service-type.entity';
import { ServiceFormVersionEntity } from '../src/service-requests/entities/service-form-version.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { ServiceRequestMessageEntity } from '../src/service-requests/entities/service-request-message.entity';
import { OrganizationMemberEntity } from '../src/organizations/entities/organization-member.entity';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import type { ServiceFormSchema } from '../src/service-requests/service-form.types';

const ADMIN_ORIGIN = 'http://localhost:5173';
const ADMIN_PASSWORD = 'Strong!Password2026';

interface ServiceTypeResponse {
    code: string;
    formVersion: {
        id: number;
        version: number;
        status: string;
        schema: ServiceFormSchema;
    };
}

describe('canonical service requests', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let adminAuth: AdminAuthService;
    let forms: ServiceFormService;
    let ip = 80;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        dataSource = app.get(DataSource);
        adminAuth = app.get(AdminAuthService);
        forms = app.get(ServiceFormService);
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
        const names = tables
            .map(
                ({ table_name }) =>
                    `"public"."${table_name.replaceAll('"', '""')}"`,
            )
            .join(', ');
        await dataSource.query(
            `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
        );
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    async function browser() {
        const agent = request.agent(app.getHttpServer());
        agent.set('Origin', 'http://localhost:5174');
        agent.set('X-Forwarded-For', `10.80.0.${++ip}`);
        await agent.post('/api/client/session').send({}).expect(201);
        return agent;
    }

    async function staff(
        login: string,
        roles: Array<'operator' | 'engineer' | 'sales_manager' | 'superadmin'>,
    ) {
        await adminAuth.createStaff({
            login,
            displayName: login,
            password: ADMIN_PASSWORD,
            roles,
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', `10.80.0.${++ip}`)
            .send({ login, password: ADMIN_PASSWORD })
            .expect(201);
        return agent;
    }

    const completeDraft = () => ({
        serviceTypeCode: 'firmware_update',
        contactSnapshot: {
            name: 'Тестовый клиент',
            phone: '+7 (999) 123-45-67',
            email: 'client@example.test',
            preferredChannel: 'phone',
        },
        organizationSnapshot: {
            verified: false,
            name: 'Тестовая организация',
            inn: '2460000000',
        },
        locationSnapshot: { city: 'Красноярск' },
        equipmentSnapshot: { type: 'Касса', model: 'АТОЛ 30Ф' },
        answers: {
            clientType: 'organization',
            organization: 'Тестовая организация',
            inn: '2460000000',
            contactName: 'Тестовый клиент',
            phone: '+7 (999) 123-45-67',
            email: 'client@example.test',
            city: 'Красноярск',
            equipmentType: 'Касса',
            equipmentModel: 'АТОЛ 30Ф',
            urgency: 'normal',
            helpFormat: 'remote',
            description: 'Нужно обновить прошивку кассы и проверить настройки.',
            consent: true,
        },
    });

    const privateAnswers = {
        staffOnly: 'synthetic-private-answer',
        dependentStaff: 'synthetic-private-dependent',
        transitiveStaff: 'synthetic-private-transitive',
    };

    function expectPrivateValuesAbsent(body: unknown) {
        const json = JSON.stringify(body);
        for (const [key, value] of Object.entries(privateAnswers)) {
            expect(json.includes(key)).toBe(false);
            expect(json.includes(value)).toBe(false);
        }
        for (const marker of [
            'unknownAnswer',
            'synthetic-unknown-answer',
            'synthetic-internal-comment',
            'synthetic-internal-message',
        ])
            expect(json.includes(marker)).toBe(false);
    }

    async function privateDraftFixture() {
        const owner = await browser();
        const draft = await owner
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        const repository = dataSource.getRepository(ServiceRequestEntity);
        const row = await repository.findOneByOrFail({ id: draft.body.id });
        const versions = dataSource.getRepository(ServiceFormVersionEntity);
        const form = await versions.findOneByOrFail({ id: row.formVersionId });
        // Test-only V1 fixture: domain-valid staff values must survive serialization.
        form.schema.fields.push(
            {
                key: 'staffOnly',
                type: 'text',
                label: 'Private',
                customerVisible: false,
            },
            {
                key: 'transitiveStaff',
                type: 'text',
                label: 'Transitive',
                condition: {
                    field: 'dependentStaff',
                    equals: privateAnswers.dependentStaff,
                },
            },
            {
                key: 'dependentStaff',
                type: 'text',
                label: 'Dependent',
                condition: {
                    field: 'staffOnly',
                    equals: privateAnswers.staffOnly,
                },
            },
            { key: 'publicChoice', type: 'text', label: 'Choice' },
            {
                key: 'publicConditional',
                type: 'text',
                label: 'Conditional',
                condition: { field: 'publicChoice', equals: 'yes' },
            },
            {
                key: 'unmatchedConditional',
                type: 'text',
                label: 'Unmatched',
                condition: { field: 'publicChoice', equals: 'no' },
            },
            { key: 'visibleInV1', type: 'text', label: 'Pinned public value' },
        );
        await versions.save(form);
        row.answers = {
            ...row.answers,
            ...privateAnswers,
            publicChoice: 'yes',
            publicConditional: 'synthetic-public-conditional',
            unmatchedConditional: 'synthetic-unmatched-conditional',
            visibleInV1: 'synthetic-public-v1',
        };
        row.operatorComment = 'synthetic-internal-comment';
        await repository.save(row);
        await dataSource.getRepository(ServiceRequestMessageEntity).save({
            serviceRequestId: row.id,
            authorType: 'staff',
            visibility: 'internal',
            text: 'synthetic-internal-message',
        });
        const type = await dataSource
            .getRepository(ServiceTypeEntity)
            .findOneByOrFail({ code: 'firmware_update' });
        const v2 = await forms.createDraftVersion(type, {
            ...form.schema,
            fields: form.schema.fields.map((field) => ({
                ...field,
                customerVisible: field.key !== 'visibleInV1',
            })),
        });
        await forms.publishVersion(v2.id);
        return { owner, row, form };
    }

    it('publishes a versioned server form', async () => {
        const client = await browser();
        const response = await client
            .get('/api/client/service-requests/types')
            .expect(200);
        const type = (response.body as ServiceTypeResponse[]).find(
            (item) => item.code === 'firmware_update',
        );
        expect(type).toBeDefined();
        if (!type) throw new Error('Expected firmware form');
        expect(type.formVersion).toMatchObject({
            version: 1,
            status: 'published',
        });
        expect(type.formVersion.schema.fields).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: 'contactName' }),
                expect.objectContaining({ key: 'description' }),
            ]),
        );
    });

    it('edits only draft forms, publishes a new version, and preserves old request references', async () => {
        const client = await browser();
        const types = await client
            .get('/api/client/service-requests/types')
            .expect(200);
        const current = (types.body as ServiceTypeResponse[]).find(
            (item) => item.code === 'firmware_update',
        );
        expect(current).toBeDefined();
        if (!current) throw new Error('Expected firmware form');
        const request = await client
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        const type = await dataSource
            .getRepository(ServiceTypeEntity)
            .findOneByOrFail({ code: 'firmware_update' });
        const schema = {
            ...current.formVersion.schema,
            fields: current.formVersion.schema.fields.map(
                (field: { key: string; label: string }) =>
                    field.key === 'description'
                        ? { ...field, label: 'Новое описание задачи' }
                        : field,
            ),
        };
        const draftVersion = await forms.createDraftVersion(type, schema);
        expect(draftVersion.status).toBe('draft');
        const edited = await forms.updateDraftVersion(draftVersion.id, schema);
        const published = await forms.publishVersion(edited.id);
        expect(published).toMatchObject({ status: 'published', version: 2 });
        await expect(
            forms.updateDraftVersion(published.id, schema),
        ).rejects.toThrow('Only a draft');
        const previous = await dataSource
            .getRepository(ServiceFormVersionEntity)
            .findOneByOrFail({ id: current.formVersion.id });
        expect(previous.status).toBe('retired');
        const storedRequest = await dataSource
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: request.body.id });
        expect(storedRequest.formVersionId).toBe(current.formVersion.id);
        const resumed = await client
            .get(`/api/client/service-requests/${request.body.id}`)
            .expect(200);
        expect(resumed.body.form).toMatchObject({
            id: current.formVersion.id,
            version: 1,
            status: 'retired',
            supported: true,
        });
        expect(
            (
                resumed.body.form.schema.fields as Array<{
                    key: string;
                    label: string;
                }>
            ).find((field) => field.key === 'description')?.label,
        ).not.toBe('Новое описание задачи');
    });

    it('keeps owner answers, snapshots and version coherent; rejects stale edits and preserves no-op versions', async () => {
        const owner = await browser();
        const draft = await owner
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        const saved = await owner
            .patch(`/api/client/service-requests/drafts/${draft.body.id}`)
            .send({
                expectedVersion: draft.body.version,
                answers: {
                    contactName: 'Новый контакт',
                    phone: '+79990000001',
                    city: 'Новый город',
                    equipmentModel: 'Новая модель',
                },
            })
            .expect(200);
        expect(saved.body.version).toBe(draft.body.version + 1);
        expect(saved.body.contactSnapshot).toMatchObject({
            name: 'Новый контакт',
            phone: '+79990000001',
        });
        expect(saved.body.locationSnapshot.city).toBe('Новый город');
        expect(saved.body.equipmentSnapshot.model).toBe('Новая модель');
        const noop = await owner
            .patch(`/api/client/service-requests/drafts/${draft.body.id}`)
            .send({
                expectedVersion: saved.body.version,
                answers: {},
            })
            .expect(200);
        expect(noop.body.version).toBe(saved.body.version);
        await owner
            .patch(`/api/client/service-requests/drafts/${draft.body.id}`)
            .send({
                expectedVersion: draft.body.version,
                answers: { contactName: 'Старое окно' },
            })
            .expect(409);
        await owner
            .patch(`/api/client/service-requests/drafts/${draft.body.id}`)
            .send({
                expectedVersion: saved.body.version,
                answers: { contactName: 'Ответ' },
                contactSnapshot: { name: 'Другой снимок' },
            })
            .expect(400);
        const detail = await owner
            .get(`/api/client/service-requests/${draft.body.id}`)
            .expect(200);
        expect(detail.headers['cache-control']).toBe('private, no-store');
        expect(detail.body.request).toMatchObject({
            version: saved.body.version,
            answers: { contactName: 'Новый контакт' },
            contactSnapshot: { name: 'Новый контакт' },
        });
        expect(detail.body.customerWorkflow.editDraft.allowed).toBe(true);
        expect(detail.body.request).not.toHaveProperty('userId');
        expect(detail.body.request).not.toHaveProperty('operatorComment');
    });

    it('rejects missing/cross origin owner commands and malformed uploads before body parsing', async () => {
        const owner = await browser();
        await owner
            .post('/api/client/service-requests/drafts')
            .unset('Origin')
            .send(completeDraft())
            .expect(403);
        await owner
            .post('/api/client/service-requests/drafts')
            .set('Origin', 'https://foreign.example.test')
            .send(completeDraft())
            .expect(403);
        const draft = await owner
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        await owner
            .post(
                `/api/client/service-requests/drafts/${draft.body.id}/attachments`,
            )
            .unset('Origin')
            .set('Content-Type', 'multipart/form-data; boundary=missing')
            .send('broken')
            .expect(403);
        expect(await dataSource.getRepository(StoredFileEntity).count()).toBe(
            0,
        );
        const foreign = await browser();
        const forbidden = await foreign
            .get(`/api/client/service-requests/${draft.body.id}`)
            .expect(404);
        const missing = await foreign
            .get('/api/client/service-requests/2147483647')
            .expect(404);
        expect(forbidden.body.message).toBe(missing.body.message);
    });

    it('filters private and conditional form values and uses events rather than internal comments as history', async () => {
        const { owner, row, form } = await privateDraftFixture();
        const resumed = await owner
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        expect(resumed.body).toMatchObject({ id: row.id, created: false });
        expectPrivateValuesAbsent(resumed.body);
        expect(resumed.body.answers.visibleInV1).toBe('synthetic-public-v1');
        expect(resumed.body.answers.publicConditional).toBe(
            'synthetic-public-conditional',
        );
        expect(
            JSON.stringify(resumed.body).includes(
                'synthetic-unmatched-conditional',
            ),
        ).toBe(false);
        const patched = await owner
            .patch(`/api/client/service-requests/drafts/${row.id}`)
            .send({
                expectedVersion: row.version,
                answers: { clientType: 'individual', publicChoice: 'no' },
            })
            .expect(200);
        expectPrivateValuesAbsent(patched.body);
        expect(patched.body.answers).not.toHaveProperty('publicConditional');
        const detail = await owner
            .get(`/api/client/service-requests/${row.id}`)
            .expect(200);
        expectPrivateValuesAbsent(detail.body);
        expect(detail.body.form).toMatchObject({
            id: form.id,
            version: 1,
            status: 'retired',
        });
        expect(detail.body.request.answers.visibleInV1).toBe(
            'synthetic-public-v1',
        );
        expect(detail.body.request.answers).not.toHaveProperty('organization');
        expect(detail.body.request.answers).not.toHaveProperty(
            'publicConditional',
        );
        expect(detail.body.customerWorkflow).toBeDefined();
        const stored = await dataSource
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: row.id });
        expect(stored.answers).toMatchObject(privateAnswers);
        expect(detail.body.events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: 'draft_created' }),
            ]),
        );
    });

    it.each(['first submit', 'submit replay', 'public detail'])(
        'applies pinned customer answer privacy to %s without deleting staff data',
        async (surface) => {
            const { owner, row, form } = await privateDraftFixture();
            const before = await owner
                .get(`/api/client/service-requests/${row.id}`)
                .expect(200);
            expectPrivateValuesAbsent(before.body);
            expect(before.body.request.answers).toMatchObject({
                description: completeDraft().answers.description,
                publicConditional: 'synthetic-public-conditional',
                visibleInV1: 'synthetic-public-v1',
            });
            expect(
                JSON.stringify(before.body).includes(
                    'synthetic-unmatched-conditional',
                ),
            ).toBe(false);
            const command = {
                expectedVersion: row.version,
                idempotencyKey: randomUUID(),
            };
            const submitted = await owner
                .post(`/api/client/service-requests/drafts/${row.id}/submit`)
                .send(command)
                .expect(201);
            const response =
                surface === 'submit replay'
                    ? await owner
                          .post(
                              `/api/client/service-requests/drafts/${row.id}/submit`,
                          )
                          .send(command)
                          .expect(201)
                    : surface === 'public detail'
                      ? await request(app.getHttpServer())
                            .get(
                                `/api/public/service-requests/${submitted.body.publicToken}`,
                            )
                            .expect(200)
                      : submitted;
            expectPrivateValuesAbsent(response.body);
            expect(response.body.request.answers).toMatchObject({
                description: completeDraft().answers.description,
                publicConditional: 'synthetic-public-conditional',
                visibleInV1: 'synthetic-public-v1',
            });
            expect(
                JSON.stringify(response.body).includes(
                    'synthetic-unmatched-conditional',
                ),
            ).toBe(false);
            for (const key of [
                'customerWorkflow',
                'expectedVersion',
                'paymentProofFileId',
                'paymentProof',
                'publicTokenHash',
                'operatorComment',
            ]) {
                expect(JSON.stringify(response.body).includes(`"${key}"`)).toBe(
                    false,
                );
            }
            if (surface === 'submit replay')
                expect(
                    response.body.publicToken === submitted.body.publicToken,
                ).toBe(true);
            const stored = await dataSource
                .getRepository(ServiceRequestEntity)
                .findOneByOrFail({ id: row.id });
            expect(stored.formVersionId).toBe(form.id);
            expect(stored.answers).toMatchObject(privateAnswers);
            expect(stored.operatorComment).toBe('synthetic-internal-comment');
            const pinned = await dataSource
                .getRepository(ServiceFormVersionEntity)
                .findOneByOrFail({ id: form.id });
            expect(
                pinned.schema.fields.find((field) => field.key === 'staffOnly')
                    ?.customerVisible,
            ).toBe(false);
            const operator = await staff('privacy-operator', ['operator']);
            const staffView = await operator
                .get(`/admin/api/service-requests/${row.id}`)
                .expect(200);
            expect(staffView.body.request.answers).toMatchObject(
                privateAnswers,
            );
            expect(JSON.stringify(staffView.body)).toContain(
                'synthetic-internal-comment',
            );
            const after = await owner
                .get(`/api/client/service-requests/${row.id}`)
                .expect(200);
            expectPrivateValuesAbsent(after.body);
            expect(after.body.customerWorkflow).toBeDefined();
        },
    );

    it('excludes unknown persisted answers from owner and public reads without deleting them', async () => {
        const { owner, row } = await privateDraftFixture();
        const submitted = await owner
            .post(`/api/client/service-requests/drafts/${row.id}/submit`)
            .send({
                expectedVersion: row.version,
                idempotencyKey: randomUUID(),
            })
            .expect(201);
        const repository = dataSource.getRepository(ServiceRequestEntity);
        const stored = await repository.findOneByOrFail({ id: row.id });
        stored.answers.unknownAnswer = 'synthetic-unknown-answer';
        await repository.save(stored);
        const ownerView = await owner
            .get(`/api/client/service-requests/${row.id}`)
            .expect(200);
        const publicView = await request(app.getHttpServer())
            .get(`/api/public/service-requests/${submitted.body.publicToken}`)
            .expect(200);
        for (const response of [ownerView, publicView]) {
            expectPrivateValuesAbsent(response.body);
            expect(response.body.request.answers.visibleInV1).toBe(
                'synthetic-public-v1',
            );
        }
        const unchanged = await repository.findOneByOrFail({ id: row.id });
        expect(unchanged.answers).toEqual(stored.answers);
        expect(unchanged.answers).toMatchObject(privateAnswers);
        await request(app.getHttpServer())
            .post(
                `/api/public/service-requests/${submitted.body.publicToken}/messages`,
            )
            .send({
                text: 'Synthetic public reply after privacy projection',
            })
            .expect(201);
    });

    it('creates, submits, and reads one request using session or bearer token', async () => {
        const owner = await browser();
        const stranger = await browser();
        await owner.get('/api/client/service-requests/types').expect(200);
        const draft = await owner
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        expect(draft.body).toMatchObject({
            status: 'draft',
            customerStatus: 'received',
            version: 1,
        });

        const submitted = await owner
            .post(`/api/client/service-requests/drafts/${draft.body.id}/submit`)
            .send({
                expectedVersion: draft.body.version,
                idempotencyKey: 'integration-submit-0001',
            })
            .expect(201);
        expect(submitted.body.request.customerStatus).toBe('received');
        expect(submitted.body.request).not.toHaveProperty('status');
        expect(submitted.body.request).not.toHaveProperty('priority');
        expect(submitted.body.request).not.toHaveProperty('version');
        expect(submitted.body.request.requestNumber).toMatch(
            /^SR-\d{8}-[A-F0-9]{8}$/,
        );
        expect(submitted.body.publicToken).toMatch(/^[A-Za-z0-9_-]{32,100}$/);

        await owner
            .get(`/api/client/service-requests/${draft.body.id}`)
            .expect(200);
        await stranger
            .get(`/api/client/service-requests/${draft.body.id}`)
            .expect(404);
        expect(
            (await stranger.get('/api/client/service-requests').expect(200))
                .body,
        ).toEqual([]);
        await request(app.getHttpServer())
            .get(
                `/api/public/service-requests/${submitted.body.request.requestNumber}`,
            )
            .expect(400);
        const publicView = await request(app.getHttpServer())
            .get(`/api/public/service-requests/${submitted.body.publicToken}`)
            .expect(200);
        expect(publicView.body.request.requestNumber).toBe(
            submitted.body.request.requestNumber,
        );
        expect(publicView.body.request).not.toHaveProperty('status');
        expect(publicView.body.request).not.toHaveProperty('priority');
        expect(publicView.body.request).not.toHaveProperty('version');
        expect(publicView.body.request).not.toHaveProperty('operatorComment');
        expect(publicView.body.request).not.toHaveProperty('publicTokenHash');
        expect(publicView.body.request).not.toHaveProperty(
            'submitIdempotencyKey',
        );

        const row = await dataSource
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id: draft.body.id });
        expect(row.publicTokenHash).not.toBe(submitted.body.publicToken);
        expect(row.publicTokenHash).toHaveLength(64);
        expect(row.organizationId).toBeNull();
        expect(row.organizationSnapshot).toMatchObject({
            verified: false,
            inn: '2460000000',
        });
        expect(
            await dataSource.getRepository(OrganizationMemberEntity).count(),
        ).toBe(0);
    });

    it('returns one resumable draft when creation races for the same customer and type', async () => {
        const client = await browser();
        await client.get('/api/client/service-requests/types').expect(200);
        const [first, second] = await Promise.all([
            client
                .post('/api/client/service-requests/drafts')
                .send(completeDraft()),
            client
                .post('/api/client/service-requests/drafts')
                .send(completeDraft()),
        ]);
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.id).toBe(first.body.id);
        expect(
            await dataSource.getRepository(ServiceRequestEntity).count(),
        ).toBe(1);
    });

    it('makes submit idempotent and rejects stale draft updates', async () => {
        const client = await browser();
        await client.get('/api/client/service-requests/types').expect(200);
        const draft = await client
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        const updated = await client
            .patch(`/api/client/service-requests/drafts/${draft.body.id}`)
            .send({
                answers: { software: 'Frontol' },
                expectedVersion: draft.body.version,
            })
            .expect(200);
        const repeatedUpdate = await client
            .patch(`/api/client/service-requests/drafts/${draft.body.id}`)
            .send({
                answers: { software: 'Frontol' },
                expectedVersion: draft.body.version,
            })
            .expect(200);
        expect(repeatedUpdate.body.version).toBe(updated.body.version);
        await client
            .patch(`/api/client/service-requests/drafts/${draft.body.id}`)
            .send({
                answers: { software: '1С' },
                expectedVersion: draft.body.version,
            })
            .expect(409);
        const payload = {
            expectedVersion: updated.body.version,
            idempotencyKey: 'integration-submit-0002',
        };
        const [first, repeated] = await Promise.all([
            client
                .post(
                    `/api/client/service-requests/drafts/${draft.body.id}/submit`,
                )
                .send(payload),
            client
                .post(
                    `/api/client/service-requests/drafts/${draft.body.id}/submit`,
                )
                .send(payload),
        ]);
        expect(first.status).toBe(201);
        expect(repeated.status).toBe(201);
        expect(repeated.body.publicToken).toBe(first.body.publicToken);
        expect(
            await dataSource.getRepository(ServiceRequestEntity).count(),
        ).toBe(1);
        expect(
            await dataSource.getRepository(ServiceRequestMessageEntity).count(),
        ).toBe(1);
    });

    it('validates complete forms and stores safe attachments through FileStorage', async () => {
        const client = await browser();
        await client.get('/api/client/service-requests/types').expect(200);
        const incomplete = await client
            .post('/api/client/service-requests/drafts')
            .send({
                serviceTypeCode: 'firmware_update',
                contactSnapshot: { name: 'Клиент', phone: '+79991234567' },
                answers: { contactName: 'Клиент' },
            })
            .expect(201);
        await client
            .post(
                `/api/client/service-requests/drafts/${incomplete.body.id}/submit`,
            )
            .send({
                expectedVersion: incomplete.body.version,
                idempotencyKey: 'integration-submit-0003',
            })
            .expect(400);

        const attached = await client
            .post(
                `/api/client/service-requests/drafts/${incomplete.body.id}/attachments`,
            )
            .attach('file', Buffer.from('%PDF-1.7\ntest'), {
                filename: '../../unsafe-name.pdf',
                contentType: 'application/pdf',
            })
            .expect(201);
        expect(attached.body.file.originalName).toBe('unsafe-name.pdf');
        const stored = await dataSource
            .getRepository(StoredFileEntity)
            .findOneByOrFail({ id: attached.body.file.id });
        expect(stored.objectKey).toMatch(
            /^service-attachment\/\d{4}\/\d{2}\/[0-9a-f-]+$/,
        );
        expect(stored.objectKey).not.toContain('unsafe-name');
        for (let index = 0; index < 4; index += 1) {
            await client
                .post(
                    `/api/client/service-requests/drafts/${incomplete.body.id}/attachments`,
                )
                .attach('file', Buffer.from(`%PDF-1.7\n${index}`), {
                    filename: `document-${index}.pdf`,
                    contentType: 'application/pdf',
                })
                .expect(201);
        }
        await client
            .post(
                `/api/client/service-requests/drafts/${incomplete.body.id}/attachments`,
            )
            .attach('file', Buffer.from('%PDF-1.7\nover-limit'), {
                filename: 'over-limit.pdf',
                contentType: 'application/pdf',
            })
            .expect(400);
        await client
            .post(
                `/api/client/service-requests/drafts/${incomplete.body.id}/attachments`,
            )
            .attach('file', Buffer.from('MZ executable'), {
                filename: 'unsafe.exe',
                contentType: 'application/octet-stream',
            })
            .expect(400);
        await client
            .delete(
                `/api/client/service-requests/drafts/${incomplete.body.id}/attachments/${attached.body.id}`,
            )
            .expect(200);
        expect(
            await dataSource.getRepository(StoredFileEntity).findOneByOrFail({
                id: attached.body.file.id,
            }),
        ).toMatchObject({ status: 'deleted' });
    });

    it('rejects unknown fields instead of flattening them into legacy text', async () => {
        const client = await browser();
        await client.get('/api/client/service-requests/types').expect(200);
        await client
            .post('/api/client/service-requests/drafts')
            .send({
                ...completeDraft(),
                answers: {
                    ...completeDraft().answers,
                    injectedAdminComment: 'not allowed',
                },
            })
            .expect(400);
    });

    it('keeps a post-submit customer file in the canonical message history', async () => {
        const owner = await browser();
        const stranger = await browser();
        await owner.get('/api/client/service-requests/types').expect(200);
        const draft = await owner
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        const submitted = await owner
            .post(`/api/client/service-requests/drafts/${draft.body.id}/submit`)
            .send({
                expectedVersion: draft.body.version,
                idempotencyKey: 'integration-submit-file-0001',
            })
            .expect(201);
        const uploaded = await request(app.getHttpServer())
            .post(
                `/api/public/service-requests/${submitted.body.publicToken}/messages/attachments`,
            )
            .attach('file', Buffer.from('%PDF-1.7\npayment'), {
                filename: 'payment.pdf',
                contentType: 'application/pdf',
            })
            .expect(201);
        expect(uploaded.body).toMatchObject({
            kind: 'message',
            customerVisible: true,
            file: { originalName: 'payment.pdf' },
        });
        await stranger
            .get(
                `/api/client/service-requests/${draft.body.id}/attachments/${uploaded.body.id}`,
            )
            .expect(404);
        await request(app.getHttpServer())
            .get(
                `/api/public/service-requests/${submitted.body.publicToken}/attachments/${uploaded.body.id}`,
            )
            .expect(200)
            .expect('Content-Type', 'application/pdf');
        const publicView = await request(app.getHttpServer())
            .get(`/api/public/service-requests/${submitted.body.publicToken}`)
            .expect(200);
        expect(publicView.body.attachments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: uploaded.body.id,
                    kind: 'message',
                }),
            ]),
        );
        expect(
            await dataSource.getRepository(ServiceRequestMessageEntity).count({
                where: {
                    serviceRequestId: draft.body.id,
                    storedFileId: uploaded.body.file.id,
                },
            }),
        ).toBe(1);
    });

    it('applies admin RBAC to manual creation and customer-visible history', async () => {
        const owner = await browser();
        await owner.get('/api/client/service-requests/types').expect(200);
        const draft = await owner
            .post('/api/client/service-requests/drafts')
            .send(completeDraft())
            .expect(201);
        const submitted = await owner
            .post(`/api/client/service-requests/drafts/${draft.body.id}/submit`)
            .send({
                expectedVersion: draft.body.version,
                idempotencyKey: 'integration-submit-0004',
            })
            .expect(201);
        const engineer = await staff('canonical-engineer', ['engineer']);
        await engineer
            .post(`/admin/api/service-requests/${draft.body.id}/messages`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ text: 'Недоступное действие' })
            .expect(403);
        const sales = await staff('canonical-sales', ['sales_manager']);
        await sales
            .post('/admin/api/service-requests/manual')
            .set('Origin', ADMIN_ORIGIN)
            .send({
                source: 'phone',
                serviceTypeCode: 'kkt_remote_work',
                contactSnapshot: {
                    name: 'Клиент',
                    phone: '+79991234567',
                },
            })
            .expect(403);

        const operator = await staff('canonical-operator', ['operator']);
        await operator
            .post(`/admin/api/service-requests/${draft.body.id}/messages`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ text: 'Ответ клиенту', visibility: 'customer' })
            .expect(201);
        await operator
            .post(`/admin/api/service-requests/${draft.body.id}/messages`)
            .set('Origin', ADMIN_ORIGIN)
            .send({ text: 'Внутренняя заметка', visibility: 'internal' })
            .expect(201);
        const publicView = await request(app.getHttpServer())
            .get(`/api/public/service-requests/${submitted.body.publicToken}`)
            .expect(200);
        const publicMessages = publicView.body.messages as Array<{
            text: string;
        }>;
        expect(publicMessages.map((item) => item.text)).toContain(
            'Ответ клиенту',
        );
        expect(publicMessages.map((item) => item.text)).not.toContain(
            'Внутренняя заметка',
        );

        const manual = await operator
            .post('/admin/api/service-requests/manual')
            .set('Origin', ADMIN_ORIGIN)
            .send({
                source: 'phone',
                serviceTypeCode: 'kkt_remote_work',
                initialStatus: 'review_required',
                contactSnapshot: {
                    name: 'Клиент по телефону',
                    phone: '+79991234567',
                },
                answers: {
                    contactName: 'Клиент по телефону',
                    phone: '+79991234567',
                    description: 'Клиент позвонил оператору.',
                },
            })
            .expect(201);
        expect(manual.body.request).toMatchObject({
            source: 'phone',
            status: 'review_required',
        });
    });
});
