import { INestApplication, NestInterceptor, Type } from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { WebSessionService } from '../src/web-session/web-session.service';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { ServiceRequestEventEntity } from '../src/service-requests/entities/service-request-event.entity';
import { ServiceRequestAttachmentEntity } from '../src/service-requests/entities/service-request-attachment.entity';
import { ServiceRequestMessageEntity } from '../src/service-requests/entities/service-request-message.entity';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { AuditService } from '../src/audit/audit.service';
import { FilesService } from '../src/files/files.service';
import {
    FILE_STORAGE_PORT,
    FileStoragePort,
} from '../src/files/file-storage.types';
import { PublicServiceRequestsController } from '../src/service-requests/public-service-requests.controller';
import {
    ServiceRequestPublicAccessService,
    publicAccessHash,
} from '../src/service-requests/service-request-public-access.service';
import { RevokeLegacyServiceRequestPublicAccess1789516800000 } from '../src/database/migrations/1789516800000-RevokeLegacyServiceRequestPublicAccess';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { createTestPassword } from './test-password';

describe('SEC-R3B public access', () => {
    let app: INestApplication<App>;
    let db: DataSource;
    let session: Awaited<ReturnType<WebSessionService['create']>>;
    let cookie: string;
    let id: number;
    let version: number;
    let tables: string[];
    let ip = 0;
    let writes: jest.SpyInstance;
    let multer: jest.SpyInstance;
    const root = '/api/client/service-requests';
    const publicRoot = '/api/public/service-requests';
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = module.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        db = app.get(DataSource);
        writes = jest.spyOn(
            app.get<FileStoragePort>(FILE_STORAGE_PORT),
            'write',
        );
        const [interceptor] = Reflect.getMetadata(
            INTERCEPTORS_METADATA,
            Object.getOwnPropertyDescriptor(
                PublicServiceRequestsController.prototype,
                'addMessageAttachment',
            )!.value as object,
        ) as Type<NestInterceptor>[];
        multer = jest.spyOn(app.get<NestInterceptor>(interceptor), 'intercept');
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
        const rows: Array<{ table_name: string }> = await db.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'typeorm_migrations'",
        );
        tables = rows.map(
            (row) => '"' + row.table_name.replaceAll('"', '""') + '"',
        );
    });
    afterAll(async () => {
        if (app) await app.close();
    });
    beforeEach(async () => {
        await db.query(
            `TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
        );
        session = await app.get(WebSessionService).create();
        cookie = `${app.get(WebSessionService).getCookieName()}=${session.token}`;
        const draft = await app
            .get(ServiceRequestsService)
            .createWebDraft(session.principal, {
                serviceTypeCode: 'firmware_update',
                contactSnapshot: {
                    name: 'Synthetic customer',
                    phone: '+79999999999',
                    preferredChannel: 'phone',
                },
                answers: {
                    clientType: 'individual',
                    contactName: 'Synthetic customer',
                    phone: '+79999999999',
                    city: 'Test city',
                    equipmentType: 'Касса',
                    equipmentModel: 'Synthetic',
                    urgency: 'normal',
                    helpFormat: 'remote',
                    description: 'Synthetic service request',
                    consent: true,
                },
            });
        id = draft.id;
        version = draft.version;
        jest.clearAllMocks();
    });
    function owner() {
        const agent = request.agent(app.getHttpServer());
        agent
            .set('Cookie', cookie)
            .set('Origin', 'http://localhost:5174')
            .set('X-Forwarded-For', `10.151.0.${++ip}`);
        return agent;
    }
    async function submit() {
        return owner()
            .post(`${root}/drafts/${id}/submit`)
            .send({ expectedVersion: version, idempotencyKey: '00000000' })
            .expect(201);
    }
    async function current() {
        return db.getRepository(ServiceRequestEntity).findOneByOrFail({ id });
    }
    async function issue() {
        const result = await owner()
            .post(`${root}/${id}/public-access`)
            .send({ expectedVersion: (await current()).version })
            .expect(201);
        return result.body as {
            enabled: boolean;
            version: number;
            token: string;
        };
    }
    function publicAgent(token: string) {
        return request
            .agent(app.getHttpServer())
            .set('Authorization', `Bearer ${token}`)
            .set('X-Forwarded-For', `10.152.0.${++ip}`);
    }
    async function snapshot() {
        const rows: unknown = await db.query(
            tables
                .map(
                    (table) =>
                        `SELECT jsonb_build_object('table', '${table}', 'rows', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)) AS value FROM ${table} t`,
                )
                .join(' UNION ALL '),
        );
        return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    }
    function noStore(
        headers: Record<string, string>,
        cache = 'private, no-store',
    ) {
        expect(headers['cache-control']).toBe(cache);
        expect(headers.pragma).toBe('no-cache');
        if (cache.startsWith('private'))
            expect(headers.vary.split(/,\s*/)).toContain('Authorization');
    }
    it('does not issue a capability on weak-key submit or idempotent replay', async () => {
        const first = await submit();
        const replay = await submit();
        expect('publicToken' in (first.body as object)).toBe(false);
        expect('publicToken' in (replay.body as object)).toBe(false);
        const row = await db
            .getRepository(ServiceRequestEntity)
            .findOneByOrFail({ id });
        expect(row.publicTokenHash).toBeNull();
        expect(
            await db
                .getRepository(ServiceRequestEventEntity)
                .countBy({ serviceRequestId: id, type: 'submitted' }),
        ).toBe(1);
    });
    it('exposes safe owner state and rejects an absent public Authorization header', async () => {
        await submit();
        const state = await owner()
            .get(`${root}/${id}/public-access`)
            .expect(200);
        expect(state.body).toMatchObject({ enabled: false });
        await request(app.getHttpServer())
            .get(`${publicRoot}/status`)
            .expect(401);
    });
    it('issues random access only explicitly, stores only hash, and audits transactionally without secrets', async () => {
        await submit();
        const before = await current();
        const events = await db
            .getRepository(ServiceRequestEventEntity)
            .count();
        const response = await owner()
            .post(`${root}/${id}/public-access`)
            .send({ expectedVersion: before.version })
            .expect(201);
        noStore(response.headers as Record<string, string>, 'no-store');
        const issued = response.body as { token: string; version: number };
        expect(/^[A-Za-z0-9_-]{43}$/.test(issued.token)).toBe(true);
        expect(Buffer.from(issued.token, 'base64url').length).toBe(32);
        const row = await current();
        expect(row.publicTokenHash === publicAccessHash(issued.token)).toBe(
            true,
        );
        expect(row.version).toBe(before.version + 1);
        const audit = await db.getRepository(AuditEventEntity).find();
        expect(
            audit.some(
                (item) => item.action === 'service_request.public_access.issue',
            ),
        ).toBe(true);
        expect(JSON.stringify(row).includes(issued.token)).toBe(false);
        expect(JSON.stringify(audit).includes(issued.token)).toBe(false);
        expect(JSON.stringify(audit).includes(row.publicTokenHash!)).toBe(
            false,
        );
        expect(await db.getRepository(ServiceRequestEventEntity).count()).toBe(
            events,
        );
        const state = await owner()
            .get(`${root}/${id}/public-access`)
            .expect(200);
        expect(Object.keys(state.body as object).sort()).toEqual([
            'enabled',
            'version',
        ]);
        const replay = await submit();
        expect('publicToken' in (replay.body as object)).toBe(false);
        expect((await current()).publicTokenHash === row.publicTokenHash).toBe(
            true,
        );
        expect((await current()).version).toBe(row.version);
    });
    it.each(['post', 'delete', 'get'] as const)(
        'requires exact owner for %s, never staff or organization identity',
        async (method) => {
            await submit();
            const other = await app.get(WebSessionService).create();
            const before = await snapshot();
            await request(app.getHttpServer())
                [method](`${root}/${id}/public-access`)
                .set(
                    'Cookie',
                    `${app.get(WebSessionService).getCookieName()}=${other.token}`,
                )
                .set('Origin', 'http://localhost:5174')
                .send({ expectedVersion: (await current()).version })
                .expect(404);
            await request(app.getHttpServer())
                [method](`${root}/${id}/public-access`)
                .set('Origin', 'http://localhost:5174')
                .send({ expectedVersion: 1 })
                .expect(401);
            expect(await snapshot()).toBe(before);
        },
    );
    it.each(['issue', 'rotate', 'revoke'])(
        'rejects foreign Origin for %s without any domain or audit change',
        async (action) => {
            await submit();
            if (action !== 'issue') await issue();
            const before = await snapshot();
            await owner()
                [action === 'revoke' ? 'delete' : 'post'](
                    `${root}/${id}/public-access`,
                )
                .set('Origin', 'https://foreign.example')
                .send({ expectedVersion: (await current()).version })
                .expect(403);
            expect(await snapshot()).toBe(before);
        },
    );
    it('rotates immediately and returns raw secret only once, not in status or events', async () => {
        await submit();
        const first = await issue();
        await publicAgent(first.token).get(`${publicRoot}/status`).expect(200);
        const second = await issue();
        expect(
            publicAccessHash(first.token) === publicAccessHash(second.token),
        ).toBe(false);
        await publicAgent(first.token).get(`${publicRoot}/status`).expect(401);
        await publicAgent(first.token)
            .post(`${publicRoot}/messages`)
            .send({ text: 'Denied' })
            .expect(401);
        const status = await publicAgent(second.token)
            .get(`${publicRoot}/status`)
            .expect(200);
        noStore(status.headers as Record<string, string>);
        for (const secret of [
            first.token,
            second.token,
            publicAccessHash(second.token),
            '00000000',
        ])
            expect(JSON.stringify(status.body).includes(secret)).toBe(false);
        expect(
            (await db.getRepository(AuditEventEntity).find()).some(
                (item) =>
                    item.action === 'service_request.public_access.rotate',
            ),
        ).toBe(true);
    });
    it('valid public text and attachment stay request-scoped, no-store and available to owner', async () => {
        await submit();
        const { token } = await issue();
        const message = await publicAgent(token)
            .post(`${publicRoot}/messages`)
            .send({ text: 'Public fixture message' })
            .expect(201);
        noStore(message.headers as Record<string, string>);
        const upload = await publicAgent(token)
            .post(`${publicRoot}/messages/attachments`)
            .attach('file', Buffer.from('Synthetic document'), {
                filename: 'fixture.txt',
                contentType: 'text/plain',
            })
            .expect(201);
        noStore(upload.headers as Record<string, string>);
        const attachment = await db
            .getRepository(ServiceRequestAttachmentEntity)
            .findOneByOrFail({ id: (upload.body as { id: number }).id });
        expect(attachment.serviceRequestId).toBe(id);
        const download = await publicAgent(token)
            .get(`${publicRoot}/attachments/${attachment.id}`)
            .expect(200);
        noStore(download.headers as Record<string, string>);
        expect(download.headers['x-content-type-options']).toBe('nosniff');
        expect(
            download.headers['content-disposition'].startsWith('attachment'),
        ).toBe(true);
        const detail = await owner().get(`${root}/${id}`).expect(200);
        expect(JSON.stringify(detail.body)).toContain('Public fixture message');
        expect(multer).toHaveBeenCalledTimes(1);
        expect(writes).toHaveBeenCalledTimes(1);
    });
    it('revoke denies every public surface before Multer/storage and is idempotent', async () => {
        await submit();
        const issued = await issue();
        await owner()
            .delete(`${root}/${id}/public-access`)
            .send({ expectedVersion: issued.version })
            .expect(200);
        const row = await current();
        expect(row.publicTokenHash).toBeNull();
        expect(row.version).toBe(issued.version + 1);
        await owner()
            .delete(`${root}/${id}/public-access`)
            .send({ expectedVersion: issued.version })
            .expect(200);
        expect((await current()).version).toBe(row.version);
        const before = await snapshot();
        await publicAgent(issued.token).get(`${publicRoot}/status`).expect(401);
        await publicAgent(issued.token)
            .post(`${publicRoot}/messages`)
            .send({ text: 'Denied' })
            .expect(401);
        await publicAgent(issued.token)
            .post(`${publicRoot}/messages/attachments`)
            .set('Content-Type', 'multipart/form-data; boundary=invalid')
            .send('not multipart')
            .expect(401);
        await publicAgent(issued.token)
            .get(`${publicRoot}/attachments/1`)
            .expect(401);
        expect(multer).not.toHaveBeenCalled();
        expect(writes).not.toHaveBeenCalled();
        expect(await snapshot()).toBe(before);
        await owner().get(`${root}/${id}`).expect(200);
        expect(
            (await db.getRepository(AuditEventEntity).find()).filter(
                (item) =>
                    item.action === 'service_request.public_access.revoke',
            ),
        ).toHaveLength(1);
    });
    it.each(['closed', 'cancelled'] as const)(
        'public capability cannot bypass %s message restrictions',
        async (status) => {
            await submit();
            const { token } = await issue();
            await db.getRepository(ServiceRequestEntity).update(id, { status });
            await publicAgent(token)
                .post(`${publicRoot}/messages`)
                .send({ text: 'Denied' })
                .expect(400);
            await publicAgent(token)
                .post(`${publicRoot}/messages/attachments`)
                .attach('file', Buffer.from('Synthetic'), 'fixture.txt')
                .expect(400);
            expect(multer).not.toHaveBeenCalled();
            expect(writes).not.toHaveBeenCalled();
        },
    );
    it.each(['query', 'body', 'cookie', 'legacy path'])(
        'does not accept bearer from %s',
        async (location) => {
            await submit();
            const { token } = await issue();
            const client = request(app.getHttpServer());
            if (location === 'query')
                await client
                    .get(`${publicRoot}/status`)
                    .query({ token })
                    .expect(401);
            if (location === 'body')
                await client
                    .post(`${publicRoot}/messages`)
                    .send({ text: 'Denied', token })
                    .expect(401);
            if (location === 'cookie')
                await client
                    .get(`${publicRoot}/status`)
                    .set('Cookie', `token=${token}`)
                    .expect(401);
            if (location === 'legacy path') {
                await client.get(`${publicRoot}/${token}`).expect(404);
                await client
                    .post(`${publicRoot}/${token}/messages`)
                    .send({ text: 'Denied' })
                    .expect(404);
                await client
                    .post(`${publicRoot}/${token}/messages/attachments`)
                    .expect(404);
                await client
                    .get(`${publicRoot}/${token}/attachments/1`)
                    .expect(404);
            }
        },
    );
    it.each([
        '/api/client/service-requests',
        '/api/client/organizations',
        '/api/client/orders',
        '/api/client/registrations',
        '/api/client/session',
    ])('public bearer cannot create identity or read %s', async (path) => {
        await submit();
        const { token } = await issue();
        const response = await publicAgent(token).get(path);
        expect([401, 404]).toContain(response.status);
        expect(response.headers['set-cookie']).toBeUndefined();
    });
    it('public projection and downloads hide payment proof, internal attachments and foreign request files', async () => {
        await submit();
        const { token } = await issue();
        const file = await app.get(FilesService).saveBuffer({
            purpose: 'service-attachment',
            buffer: Buffer.from('Synthetic'),
            originalName: 'fixture.txt',
            mimeType: 'text/plain',
        });
        const repo = db.getRepository(ServiceRequestAttachmentEntity);
        const proof = await repo.save({
            serviceRequestId: id,
            storedFileId: file.id,
            kind: 'payment_proof',
            customerVisible: true,
        });
        const internal = await repo.save({
            serviceRequestId: id,
            storedFileId: file.id,
            kind: 'message',
            customerVisible: false,
        });
        await db.getRepository(ServiceRequestMessageEntity).save({
            serviceRequestId: id,
            authorType: 'staff',
            visibility: 'internal',
            text: 'private-marker',
        });
        await db
            .getRepository(ServiceRequestEntity)
            .update(id, { operatorComment: 'private-marker' });
        const otherRow = await current();
        Reflect.deleteProperty(otherRow, 'id');
        otherRow.requestNumber = 'SR-OTHER';
        otherRow.publicTokenHash = null;
        otherRow.submitIdempotencyKey = null;
        await db.getRepository(ServiceRequestEntity).save(otherRow);
        const other = await repo.save({
            serviceRequestId: otherRow.id,
            storedFileId: file.id,
            kind: 'message',
            customerVisible: true,
        });
        for (const attachment of [proof, internal, other])
            await publicAgent(token)
                .get(`${publicRoot}/attachments/${attachment.id}`)
                .expect(404);
        const response = await publicAgent(token)
            .get(`${publicRoot}/status`)
            .expect(200);
        for (const forbidden of [
            'private-marker',
            'publicTokenHash',
            'submitIdempotencyKey',
            'payment_proof',
            'operatorComment',
        ])
            expect(JSON.stringify(response.body).includes(forbidden)).toBe(
                false,
            );
    });
    it('invalidates legacy hashes without changing owner data, versions or unrelated rows', async () => {
        await submit();
        const legacy = createHash('sha256')
            .update(`${session.principal.userId}:${id}:00000000`)
            .digest('base64url');
        await db
            .getRepository(ServiceRequestEntity)
            .update(id, { publicTokenHash: publicAccessHash(legacy) });
        const before = await current();
        const events = await db.getRepository(ServiceRequestEventEntity).find();
        const runner = db.createQueryRunner();
        try {
            await new RevokeLegacyServiceRequestPublicAccess1789516800000().up(
                runner,
            );
        } finally {
            await runner.release();
        }
        const after = await current();
        expect(after).toEqual({ ...before, publicTokenHash: null });
        expect(
            await db.getRepository(ServiceRequestEventEntity).find(),
        ).toEqual(events);
        await publicAgent(legacy).get(`${publicRoot}/status`).expect(401);
        await owner().get(`${root}/${id}`).expect(200);
    });
    it('rolls hash and business version back if transactional Audit fails', async () => {
        await submit();
        const before = await current();
        const audit = jest
            .spyOn(app.get(AuditService), 'record')
            .mockRejectedValueOnce(new Error('Synthetic audit failure'));
        try {
            await owner()
                .post(`${root}/${id}/public-access`)
                .send({ expectedVersion: before.version })
                .expect(500);
            expect(await current()).toEqual(before);
        } finally {
            audit.mockRestore();
        }
    });
    it('rechecks revocation after upload preflight but before storage under the root lock', async () => {
        await submit();
        const issued = await issue();
        const access = await app
            .get(ServiceRequestPublicAccessService)
            .resolve(issued.token);
        const requests = app.get(ServiceRequestsService);
        const original =
            requests.assertPublicMessageAttachmentUploadAccess.bind(
                requests,
            ) as ServiceRequestsService['assertPublicMessageAttachmentUploadAccess'];
        let release!: () => void;
        let arrived!: () => void;
        const paused = new Promise<void>((resolve) => {
            arrived = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const preflight = jest
            .spyOn(requests, 'assertPublicMessageAttachmentUploadAccess')
            .mockImplementationOnce(async (context) => {
                const row = await original(context);
                arrived();
                await gate;
                return row;
            });
        const upload = Promise.allSettled([
            requests.addPublicMessageAttachment(access, {
                buffer: Buffer.from('Synthetic'),
                originalName: 'fixture.txt',
                mimeType: 'text/plain',
            }),
        ]);
        try {
            await paused;
            await owner()
                .delete(`${root}/${id}/public-access`)
                .send({ expectedVersion: issued.version })
                .expect(200);
        } finally {
            release();
            preflight.mockRestore();
        }
        const [result] = await upload;
        expect(result.status).toBe('rejected');
        expect(
            ((result as PromiseRejectedResult).reason as Error).message,
        ).toBe('Public access is unavailable');
        expect(writes).not.toHaveBeenCalled();
    });
    it.each(['status', 'message', 'download'] as const)(
        'previously resolved %s context cannot outlive revocation',
        async (operation) => {
            await submit();
            const issued = await issue();
            const access = await app
                .get(ServiceRequestPublicAccessService)
                .resolve(issued.token);
            await owner()
                .delete(`${root}/${id}/public-access`)
                .send({ expectedVersion: issued.version })
                .expect(200);
            const before = await snapshot();
            const service = app.get(ServiceRequestsService);
            await expect(
                operation === 'status'
                    ? service.getPublicStatus(access)
                    : operation === 'message'
                      ? service.addPublicMessage(access, 'Denied')
                      : service.openPublicAttachment(access, 1),
            ).rejects.toThrow('Public access is unavailable');
            expect(await snapshot()).toBe(before);
            expect(writes).not.toHaveBeenCalled();
        },
    );
    it.each(['rotate', 'revoke', 'business'] as const)(
        'serializes rotate versus %s on the PostgreSQL root version',
        async (other) => {
            await submit();
            await issue();
            const before = await current();
            const staff =
                other === 'business'
                    ? await app.get(AdminAuthService).createStaff({
                          login: 'race-operator',
                          displayName: 'Synthetic',
                          password: createTestPassword(),
                          roles: ['superadmin'],
                      })
                    : null;
            const gate = db.createQueryRunner();
            await gate.startTransaction();
            await gate.query(
                'SELECT id FROM service_requests WHERE id=$1 FOR UPDATE',
                [id],
            );
            const access = app.get(ServiceRequestPublicAccessService);
            const one = access.mutate(
                session.principal,
                id,
                before.version,
                false,
            );
            const two =
                other === 'business'
                    ? app
                          .get(ServiceRequestsService)
                          .transitionByStaff(
                              staff!.id,
                              id,
                              'review_required',
                              before.version,
                          )
                    : access.mutate(
                          session.principal,
                          id,
                          before.version,
                          other === 'revoke',
                      );
            const both = Promise.allSettled([one, two]);
            let waiting = 0;
            try {
                const deadline = Date.now() + 10000;
                while (Date.now() < deadline) {
                    const rows: Array<{ count: string }> = await db.query(
                        "SELECT count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
                    );
                    waiting = Number(rows[0].count);
                    if (waiting >= 2) break;
                }
            } finally {
                await gate.commitTransaction();
                await gate.release();
            }
            const results = await both;
            expect(waiting).toBeGreaterThanOrEqual(2);
            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            const rejected = results.find(
                (result) => result.status === 'rejected',
            ) as PromiseRejectedResult;
            expect(
                (rejected.reason as { getStatus(): number }).getStatus(),
            ).toBe(409);
            expect((await current()).version).toBe(before.version + 1);
        },
        25000,
    );
});
