/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import { Readable } from 'node:stream';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { StoredFileEntity } from '../src/files/entities/stored-file.entity';
import { FILE_POLICIES } from '../src/files/file-policies';
import { ServiceRequestAttachmentEntity } from '../src/service-requests/entities/service-request-attachment.entity';

const ADMIN_ORIGIN = 'http://localhost:5173';
const ADMIN_PASSWORD = 'Strong!Password2026';

describe('SEC-R1 HTTP resource protection', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let adminAuth: AdminAuthService;
    let ip = 140;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.listen(0, '127.0.0.1');
        dataSource = app.get(DataSource);
        adminAuth = app.get(AdminAuthService);
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
        await agent
            .post('/api/client/session')
            .set('X-Forwarded-For', `10.140.0.${++ip}`)
            .send({})
            .expect(201);
        return agent;
    }

    async function submittedRequest() {
        const agent = await browser();
        await agent.get('/api/client/service-requests/types').expect(200);
        const draft = await agent
            .post('/api/client/service-requests/drafts')
            .send({
                serviceTypeCode: 'firmware_update',
                contactSnapshot: {
                    name: 'Security test client',
                    phone: '+79991234567',
                    email: 'security@example.test',
                    preferredChannel: 'phone',
                },
                organizationSnapshot: {
                    verified: false,
                    name: 'Security test organization',
                    inn: '2460000000',
                },
                locationSnapshot: { city: 'Красноярск' },
                equipmentSnapshot: { type: 'Касса', model: 'АТОЛ 30Ф' },
                answers: {
                    clientType: 'organization',
                    organization: 'Security test organization',
                    inn: '2460000000',
                    contactName: 'Security test client',
                    phone: '+79991234567',
                    email: 'security@example.test',
                    city: 'Красноярск',
                    equipmentType: 'Касса',
                    equipmentModel: 'АТОЛ 30Ф',
                    urgency: 'normal',
                    helpFormat: 'remote',
                    description:
                        'Нужно обновить прошивку кассы и проверить настройки.',
                    consent: true,
                },
            })
            .expect(201);
        const submitted = await agent
            .post(`/api/client/service-requests/drafts/${draft.body.id}/submit`)
            .send({
                expectedVersion: draft.body.version,
                idempotencyKey: `sec-r1-submit-${draft.body.id}-0001`,
            })
            .expect(201);
        return { agent, draft, submitted };
    }

    function pdf(size: number) {
        const value = Buffer.alloc(size);
        value.write('%PDF-1.7\n', 0, 'ascii');
        return value;
    }

    async function counts() {
        return {
            files: await dataSource.getRepository(StoredFileEntity).count(),
            attachments: await dataSource
                .getRepository(ServiceRequestAttachmentEntity)
                .count(),
        };
    }

    it('applies one login limit while arbitrary cookies rotate', async () => {
        const sourceIp = `10.140.0.${++ip}`;
        for (let index = 0; index < 10; index += 1) {
            await request(app.getHttpServer())
                .post('/admin/api/login')
                .set('X-Forwarded-For', sourceIp)
                .set('Cookie', `attacker=${index}`)
                .send({
                    login: 'unknown-sec-r1-user',
                    password: 'Wrong!Password2026',
                })
                .expect(401);
        }
        const limited = await request(app.getHttpServer())
            .post('/admin/api/login')
            .set('X-Forwarded-For', sourceIp)
            .set('Cookie', 'attacker=rotated-again')
            .send({
                login: 'unknown-sec-r1-user',
                password: 'Wrong!Password2026',
            })
            .expect(429);
        expect(limited.body.code).toBe('RATE_LIMITED');
    });

    it('rejects an invalid public bearer before an oversized upload mutates storage', async () => {
        const before = await counts();
        const limit = FILE_POLICIES['service-attachment'].maxBytes;
        const boundary = 'sec-r1-invalid-token';
        let emitted = 0;
        const body = Readable.from(
            (async function* () {
                yield Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="oversized.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
                );
                while (emitted <= limit) {
                    const chunk = pdf(Math.min(64 * 1024, limit + 1 - emitted));
                    emitted += chunk.length;
                    yield chunk;
                    await new Promise<void>((resolve) => setImmediate(resolve));
                }
                yield Buffer.from(`\r\n--${boundary}--\r\n`);
            })(),
        );
        const response = await fetch(
            `${await app.getUrl()}/api/public/service-requests/${'x'.repeat(48)}/messages/attachments`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                },
                body: body as unknown as BodyInit,
                duplex: 'half',
            } as RequestInit & { duplex: 'half' },
        );
        expect(response.status).toBe(404);
        const payload = (await response.json()) as Record<string, unknown>;
        expect(payload).not.toHaveProperty('stack');
        expect(emitted).toBeLessThan(limit);
        expect(await counts()).toEqual(before);
    });

    it('rejects a valid bearer upload above policy max with 413 and no mutation', async () => {
        const { submitted } = await submittedRequest();
        const before = await counts();
        const limit = FILE_POLICIES['service-attachment'].maxBytes;
        const response = await request(app.getHttpServer())
            .post(
                `/api/public/service-requests/${submitted.body.publicToken}/messages/attachments`,
            )
            .attach('file', pdf(limit + 1), {
                filename: 'oversized.pdf',
                contentType: 'application/pdf',
            })
            .expect(413);
        expect(response.body).toMatchObject({
            code: 'PAYLOAD_TOO_LARGE',
            errors: [],
        });
        expect(response.body).not.toHaveProperty('stack');
        expect(await counts()).toEqual(before);
    });

    it('accepts a valid file close to the configured boundary', async () => {
        const { submitted } = await submittedRequest();
        const limit = FILE_POLICIES['service-attachment'].maxBytes;
        const uploaded = await request(app.getHttpServer())
            .post(
                `/api/public/service-requests/${submitted.body.publicToken}/messages/attachments`,
            )
            .attach('file', pdf(limit - 1024), {
                filename: 'boundary.pdf',
                contentType: 'application/pdf',
            });
        expect(uploaded.body).toEqual(
            expect.objectContaining({ kind: 'message' }),
        );
        expect(uploaded.status).toBe(201);
        expect(await counts()).toEqual({ files: 1, attachments: 1 });
    });

    it('rejects extra files, fields, parts, and nested names without mutation', async () => {
        const { agent, submitted } = await submittedRequest();
        const url = `/api/public/service-requests/${submitted.body.publicToken}/messages/attachments`;
        const before = await counts();

        await request(app.getHttpServer())
            .post(url)
            .attach('file', pdf(64), {
                filename: 'one.pdf',
                contentType: 'application/pdf',
            })
            .attach('file', pdf(64), {
                filename: 'two.pdf',
                contentType: 'application/pdf',
            })
            .expect(400);
        await request(app.getHttpServer())
            .post(url)
            .field('extra', 'not allowed')
            .attach('file', pdf(64), {
                filename: 'field.pdf',
                contentType: 'application/pdf',
            })
            .expect(400);
        await agent.post('/api/client/tickets/open').send({}).expect(201);
        const nested = await agent
            .post('/api/client/tickets/media')
            .field('a[b][c]', 'not allowed')
            .attach('file', pdf(64), {
                filename: 'nested.pdf',
                contentType: 'application/pdf',
            })
            .expect(400);
        expect(nested.body.code).toBe('INVALID_MULTIPART');
        expect(await counts()).toEqual(before);
    });

    it('handles malformed multipart and remains healthy', async () => {
        const { submitted } = await submittedRequest();
        const before = await counts();
        const boundary = 'sec-r1-malformed-boundary';
        const malformed = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="bad.pdf"',
            'Content-Type: application/pdf',
            '',
            '%PDF-1.7 incomplete',
        ].join('\r\n');
        await request(app.getHttpServer())
            .post(
                `/api/public/service-requests/${submitted.body.publicToken}/messages/attachments`,
            )
            .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
            .send(malformed)
            .expect(400);
        expect(await counts()).toEqual(before);
        await request(app.getHttpServer()).get('/health/live').expect(200);
    });

    it('rejects a foreign customer target before file business processing', async () => {
        const owner = await browser();
        const stranger = await browser();
        await owner.get('/api/client/service-requests/types').expect(200);
        const draft = await owner
            .post('/api/client/service-requests/drafts')
            .send({
                serviceTypeCode: 'firmware_update',
                contactSnapshot: {
                    name: 'Owner',
                    phone: '+79991234567',
                },
                answers: { contactName: 'Owner' },
            })
            .expect(201);
        const before = await counts();
        await stranger
            .post(
                `/api/client/service-requests/drafts/${draft.body.id}/attachments`,
            )
            .attach('file', pdf(64), {
                filename: 'foreign.pdf',
                contentType: 'application/pdf',
            })
            .expect(404);
        expect(await counts()).toEqual(before);
    });

    it('rejects an unauthorized admin role before file business processing', async () => {
        await adminAuth.createStaff({
            login: 'sec-r1-sales',
            displayName: 'SEC R1 sales',
            password: ADMIN_PASSWORD,
            roles: ['sales_manager'],
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', `10.140.0.${++ip}`)
            .send({ login: 'sec-r1-sales', password: ADMIN_PASSWORD })
            .expect(201);
        const before = await counts();
        await agent
            .post('/admin/api/service-requests/999/invoice-file')
            .set('Origin', ADMIN_ORIGIN)
            .attach('file', pdf(64), {
                filename: 'unauthorized.pdf',
                contentType: 'application/pdf',
            })
            .expect(403);
        expect(await counts()).toEqual(before);
    });
});
