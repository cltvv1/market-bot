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
import { AdminSessionEntity } from '../src/admin/entities/admin-session.entity';
import { AuditEventEntity } from '../src/audit/entities/audit-event.entity';
import { CustomerWebSessionEntity } from '../src/web-session/entities/customer-web-session.entity';

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';

describe('security foundation API contracts', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let ipCounter = 10;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        dataSource = app.get(DataSource);
        auth = app.get(AdminAuthService);
        const telegramBot = app.get<Telegraf>(getBotToken());
        jest.spyOn(telegramBot, 'stop').mockImplementation(() => undefined);
    });

    beforeEach(async () => {
        const tables: Array<{ table_name: string }> = await dataSource.query(
            `SELECT table_name
             FROM information_schema.tables
             WHERE table_schema = 'public'
               AND table_type = 'BASE TABLE'
               AND table_name <> 'typeorm_migrations'
             ORDER BY table_name`,
        );
        const list = tables
            .map(
                ({ table_name }) =>
                    `"public"."${table_name.replaceAll('"', '""')}"`,
            )
            .join(', ');
        await dataSource.query(
            `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
        );
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    function nextIp() {
        ipCounter += 1;
        return `10.20.0.${ipCounter}`;
    }

    async function createStaff(
        login: string,
        roles: Array<'operator' | 'engineer' | 'sales_manager' | 'superadmin'>,
    ) {
        return auth.createStaff({
            login,
            displayName: login,
            password: PASSWORD,
            roles,
        });
    }

    async function login(login: string, password = PASSWORD) {
        const agent = request.agent(app.getHttpServer());
        const response = await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login, password })
            .expect(201);
        return { agent, response };
    }

    async function createBrowserSession() {
        const agent = request.agent(app.getHttpServer());
        const response = await agent
            .post('/api/client/session')
            .set('X-Forwarded-For', nextIp())
            .send({})
            .expect(201);
        return { agent, response };
    }

    const completeServiceRequest = () => ({
        serviceTypeCode: 'firmware_update',
        contactSnapshot: {
            name: 'Security test client',
            phone: '+7 (999) 123-45-67',
            preferredChannel: 'phone',
        },
        answers: {
            clientType: 'individual',
            contactName: 'Security test client',
            phone: '+7 (999) 123-45-67',
            city: 'Krasnoyarsk',
            equipmentType: 'Касса',
            equipmentModel: 'ATOL 30F',
            urgency: 'normal',
            helpFormat: 'remote',
            description: 'Characterization request for access isolation.',
            consent: true,
        },
    });

    async function submitServiceRequest(
        browser: Awaited<ReturnType<typeof createBrowserSession>>,
        idempotencyKey: string,
    ) {
        await browser.agent
            .get('/api/client/service-requests/types')
            .expect(200);
        const draft = await browser.agent
            .post('/api/client/service-requests/drafts')
            .send(completeServiceRequest())
            .expect(201);
        const draftBody = draft.body as { id: number; version: number };
        const submitted = await browser.agent
            .post(`/api/client/service-requests/drafts/${draftBody.id}/submit`)
            .send({
                expectedVersion: draftBody.version,
                idempotencyKey,
            })
            .expect(201);
        return submitted.body.request as { id: number };
    }

    it('does not create or accept known fallback admin credentials', async () => {
        await request(app.getHttpServer())
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login: 'admin', password: 'admin' })
            .expect(401);
        expect(await dataSource.getRepository('admin_users').count()).toBe(0);

        await request(app.getHttpServer())
            .get('/admin/api/summary?token=admin')
            .set('x-admin-token', 'admin')
            .expect(401);
    });

    it('creates a server-side admin session with hardened cookie flags', async () => {
        await createStaff('root-user', ['superadmin']);
        const { agent, response } = await login('root-user');
        const cookie = response.headers['set-cookie']?.[0] || '';
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Strict');
        expect(cookie).toContain('Path=/admin');
        expect(cookie).not.toContain('Secure');

        const current = await agent.get('/admin/api/me').expect(200);
        expect(current.body.admin.roles).toEqual(['superadmin']);
        expect(current.body.admin.passwordHash).toBeUndefined();
    });

    it('expires, logs out, revokes and disables admin sessions', async () => {
        const staff = await createStaff('operator-one', ['operator']);
        const first = await login('operator-one');
        await dataSource
            .getRepository(AdminSessionEntity)
            .update(
                { userId: staff.id },
                { expiresAt: new Date(Date.now() - 1_000) },
            );
        await first.agent.get('/admin/api/me').expect(401);

        const second = await login('operator-one');
        await second.agent
            .post('/admin/api/logout')
            .set('Origin', ORIGIN)
            .send({})
            .expect(201);
        await second.agent.get('/admin/api/me').expect(401);

        const third = await login('operator-one');
        await auth.resetPassword(staff.id, 'Another!Password2026');
        await third.agent.get('/admin/api/me').expect(401);

        const fourth = await login('operator-one', 'Another!Password2026');
        await auth.setActive(staff.id, false);
        await fourth.agent.get('/admin/api/me').expect(401);
    });

    it('supports multiple roles and protects the last active superadmin', async () => {
        const root = await createStaff('root-user', ['superadmin', 'operator']);
        expect((await auth.getStaff(root.id)).roles.sort()).toEqual([
            'operator',
            'superadmin',
        ]);
        await expect(auth.setRoles(root.id, ['operator'])).rejects.toThrow(
            'last active superadmin',
        );
        await expect(auth.setActive(root.id, false)).rejects.toThrow(
            'last active superadmin',
        );
    });

    it('enforces RBAC and same-origin protection on mutations', async () => {
        await createStaff('operator-one', ['operator']);
        const { agent } = await login('operator-one');
        await agent.get('/admin/api/registrations').expect(200);
        await agent.get('/admin/api/staff').expect(403);
        await agent
            .post('/admin/api/equipment-kits')
            .send({ cashRegisterModel: 'Test' })
            .expect(403);
        await agent
            .post('/admin/api/equipment-kits')
            .set('Origin', 'https://attacker.example')
            .send({ cashRegisterModel: 'Test' })
            .expect(403);
        await agent
            .post('/admin/api/equipment-kits')
            .set('Origin', ORIGIN)
            .send({ cashRegisterModel: 'Test' })
            .expect(201);

        await createStaff('sales-one', ['sales_manager']);
        const sales = await login('sales-one');
        await sales.agent.get('/admin/api/service-requests').expect(403);
    });

    it('records redacted audit events and restricts the global audit log', async () => {
        await createStaff('root-user', ['superadmin']);
        await createStaff('operator-one', ['operator']);

        await request(app.getHttpServer())
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({
                login: 'operator-one',
                password: 'Definitely!Wrong2026',
            })
            .expect(401);

        const operator = await login('operator-one');
        await operator.agent.get('/admin/api/audit-events').expect(403);

        const root = await login('root-user');
        await root.agent
            .post('/admin/api/staff')
            .set('Origin', ORIGIN)
            .send({
                login: 'created-through-api',
                displayName: 'Created through API',
                password: 'Another!Password2026',
                roles: ['operator'],
            })
            .expect(201);

        const response = await root.agent
            .get('/admin/api/audit-events?limit=100')
            .expect(200);
        const actions = response.body.items.map(
            (event: AuditEventEntity) => event.action,
        );
        expect(actions).toEqual(
            expect.arrayContaining([
                'admin.login',
                'permission.denied',
                'staff.create',
            ]),
        );

        const serialized = JSON.stringify(response.body);
        expect(serialized).not.toContain('Definitely!Wrong2026');
        expect(serialized).not.toContain('Another!Password2026');
        expect(
            response.body.items.find(
                (event: AuditEventEntity) =>
                    event.action === 'admin.login' &&
                    event.result === 'failure',
            )?.reason,
        ).toBe('invalid_credentials');
    });

    it('allows only the ticket owner or permitted staff to download a stored file', async () => {
        const operator = await createStaff('operator-one', ['operator']);
        await createStaff('engineer-one', ['engineer']);
        const browserA = await createBrowserSession();
        const browserB = await createBrowserSession();
        const opened = await browserA.agent
            .post('/api/client/tickets/open')
            .send({})
            .expect(201);
        const ticketId = opened.body.data.id;

        await browserA.agent
            .post('/api/client/tickets/media')
            .attach(
                'file',
                Buffer.from([
                    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
                ]),
                { filename: 'photo.jpg', contentType: 'image/jpeg' },
            )
            .expect(201);
        const messages = await browserA.agent
            .get(`/api/client/tickets/${ticketId}/messages`)
            .expect(200);
        const fileMessage = messages.body.find(
            (message: { storedFileId?: number }) => message.storedFileId,
        );
        expect(fileMessage.storedFileId).toEqual(expect.any(Number));

        await browserA.agent
            .get(`/api/client/ticket-messages/${fileMessage.id}/file`)
            .expect(200)
            .expect('Content-Type', 'image/jpeg');
        await browserB.agent
            .get(`/api/client/ticket-messages/${fileMessage.id}/file`)
            .expect(400);

        const engineer = await login('engineer-one');
        await engineer.agent
            .get(`/admin/api/ticket-messages/${fileMessage.id}/file`)
            .expect(403);
        const operatorSession = await login(operator.login);
        await operatorSession.agent
            .get(`/admin/api/ticket-messages/${fileMessage.id}/file`)
            .expect(200)
            .expect('Content-Type', 'image/jpeg');
    });

    it('shows engineers only their assigned service requests', async () => {
        await createStaff('root-user', ['superadmin']);
        const engineer = await createStaff('engineer-one', ['engineer']);
        await createStaff('engineer-two', ['engineer']);
        const browserA = await createBrowserSession();
        const browserB = await createBrowserSession();
        const first = await submitServiceRequest(
            browserA,
            'security-engineer-request-0001',
        );
        const second = await submitServiceRequest(
            browserB,
            'security-engineer-request-0002',
        );
        const root = await login('root-user');
        const detail = await root.agent
            .get(`/admin/api/service-requests/${first.id}`)
            .expect(200);
        await root.agent
            .post(`/admin/api/service-requests/${first.id}/assign-engineer`)
            .set('Origin', ORIGIN)
            .send({
                assignedEngineerId: engineer.id,
                expectedVersion: Number(detail.body.workflow.expectedVersion),
            })
            .expect(201);

        const engineerSession = await login('engineer-one');
        const list = await engineerSession.agent
            .get('/admin/api/service-requests?status=all')
            .expect(200);
        expect(list.body.items.map((item: { id: number }) => item.id)).toEqual([
            first.id,
        ]);
        await engineerSession.agent
            .get(`/admin/api/service-requests/${second.id}`)
            .expect(404);
        await engineerSession.agent.get('/admin/api/organizations').expect(403);
    });

    it('isolates independent browser sessions and ignores client-selected identity', async () => {
        const browserA = await createBrowserSession();
        const browserB = await createBrowserSession();
        const created = await submitServiceRequest(
            browserA,
            'security-session-request-0001',
        );
        const ticket = await browserA.agent
            .post('/api/client/tickets/open')
            .send({})
            .expect(201);

        const own = await browserA.agent
            .get('/api/client/service-requests')
            .expect(200);
        const foreign = await browserB.agent
            .get('/api/client/service-requests')
            .expect(200);
        expect(own.body).toHaveLength(1);
        expect(foreign.body).toHaveLength(0);

        await browserB.agent
            .post(`/api/client/service-requests/${created.id}/answers`)
            .send({ value: 'Попытка доступа' })
            .expect(404);
        const tampered = await browserB.agent
            .post('/api/client/service-requests/drafts')
            .send({
                ...completeServiceRequest(),
                platform: 'telegram',
                chatId: '123',
            })
            .expect(400);
        expect(tampered.body.code).toBe('VALIDATION_ERROR');

        await browserB.agent
            .post(`/api/client/tickets/${ticket.body.data.id}/messages`)
            .send({ text: 'Попытка доступа к чужому диалогу' })
            .expect(400);
    });

    it('restores a web session and rejects expired or revoked sessions', async () => {
        const browser = await createBrowserSession();
        await browser.agent.get('/api/client/session').expect(200);
        const session = await dataSource
            .getRepository(CustomerWebSessionEntity)
            .findOneByOrFail({ id: 1 });
        session.expiresAt = new Date(Date.now() - 1_000);
        await dataSource.getRepository(CustomerWebSessionEntity).save(session);
        await browser.agent.get('/api/client/session').expect(401);

        const revoked = await createBrowserSession();
        await revoked.agent
            .post('/api/client/session/revoke')
            .send({})
            .expect(201);
        await revoked.agent.get('/api/client/session').expect(401);
    });

    it('keeps current web registration and ticket starts functional', async () => {
        const browser = await createBrowserSession();
        await browser.agent
            .post('/api/client/registrations/start')
            .send({})
            .expect(201);
        await browser.agent
            .post('/api/client/tickets/open')
            .send({})
            .expect(201);
        expect(
            await dataSource.getRepository('registration_requests').count(),
        ).toBe(1);
        expect(await dataSource.getRepository('tickets').count()).toBe(1);
    });

    it('returns stable validation errors and security headers', async () => {
        const invalid = await request(app.getHttpServer())
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login: '', password: '', unexpected: true })
            .expect(400);
        expect(invalid.body).toEqual(
            expect.objectContaining({
                statusCode: 400,
                code: 'VALIDATION_ERROR',
                requestId: expect.any(String),
                errors: expect.any(Array),
            }),
        );
        const live = await request(app.getHttpServer())
            .get('/health/live')
            .expect(200);
        expect(live.headers['x-content-type-options']).toBe('nosniff');
        await request(app.getHttpServer()).get('/health/ready').expect(200);
    });

    it('returns HTTP 429 for a measured public-session limit', async () => {
        const ip = nextIp();
        let last: request.Response | undefined;
        for (let index = 0; index < 21; index += 1) {
            last = await request(app.getHttpServer())
                .post('/api/client/session')
                .set('X-Forwarded-For', ip)
                .send({});
        }
        expect(last?.status).toBe(429);
        expect(last?.body.code).toBe('RATE_LIMITED');
    });
});
