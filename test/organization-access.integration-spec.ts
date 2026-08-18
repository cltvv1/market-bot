/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
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

const PASSWORD = 'Strong!Password2026';
const ORIGIN = 'http://localhost:5173';

describe('organization access approval', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let auth: AdminAuthService;
    let ip = 30;

    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        dataSource = app.get(DataSource);
        auth = app.get(AdminAuthService);
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

    const nextIp = () => `10.30.0.${++ip}`;

    async function browser() {
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/api/client/session')
            .set('X-Forwarded-For', nextIp())
            .send({})
            .expect(201);
        return agent;
    }

    async function staff(
        login: string,
        roles: Array<'operator' | 'engineer' | 'sales_manager' | 'superadmin'>,
    ) {
        await auth.createStaff({
            login,
            displayName: login,
            password: PASSWORD,
            roles,
        });
        const agent = request.agent(app.getHttpServer());
        await agent
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login, password: PASSWORD })
            .expect(201);
        return agent;
    }

    it('creates a pending request without granting organization membership', async () => {
        const client = await browser();
        const submitted = await client
            .post('/api/client/organizations/link-by-inn')
            .send({
                inn: '2460000000',
                organizationName: 'Test organization',
                name: 'Test representative',
            })
            .expect(201);

        expect(submitted.body.status).toBe('pending');
        expect(submitted.body.requestedRole).toBe('representative');
        expect(submitted.body.organization.inn).not.toBe('2460000000');
        expect(
            await dataSource.getRepository('organization_members').count(),
        ).toBe(0);
        expect(
            await client
                .get('/api/client/organizations')
                .expect(200)
                .then((response) => response.body),
        ).toEqual([]);
    });

    it('returns the same pending request and isolates requests by web session', async () => {
        const first = await browser();
        const second = await browser();
        const payload = {
            inn: '2460000000',
            organizationName: 'Test organization',
        };
        const initial = await first
            .post('/api/client/organizations/link-by-inn')
            .send(payload)
            .expect(201);
        const duplicate = await first
            .post('/api/client/organizations/link-by-inn')
            .send(payload)
            .expect(201);

        expect(duplicate.body.id).toBe(initial.body.id);
        expect(
            await dataSource
                .getRepository('organization_access_requests')
                .count(),
        ).toBe(1);
        expect(
            (
                await first
                    .get('/api/client/organizations/access-requests')
                    .expect(200)
            ).body,
        ).toHaveLength(1);
        expect(
            (
                await second
                    .get('/api/client/organizations/access-requests')
                    .expect(200)
            ).body,
        ).toEqual([]);
        await second
            .get(`/api/client/organizations/access-requests/${initial.body.id}`)
            .expect(404);
    });

    it('allows operator approval as representative and rejects other staff roles', async () => {
        const client = await browser();
        const submitted = await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000' })
            .expect(201);
        const engineer = await staff('engineer-access', ['engineer']);
        const sales = await staff('sales-access', ['sales_manager']);
        await engineer
            .get('/admin/api/organization-access-requests')
            .expect(403);
        await sales.get('/admin/api/organization-access-requests').expect(403);
        await engineer
            .post(
                `/admin/api/organization-access-requests/${submitted.body.id}/approve`,
            )
            .set('Origin', ORIGIN)
            .send({})
            .expect(403);
        await sales
            .post(
                `/admin/api/organization-access-requests/${submitted.body.id}/approve`,
            )
            .set('Origin', ORIGIN)
            .send({})
            .expect(403);

        const operator = await staff('operator-access', ['operator']);
        await operator
            .post(
                `/admin/api/organization-access-requests/${submitted.body.id}/approve`,
            )
            .set('Origin', ORIGIN)
            .send({ reviewComment: 'Identity checked' })
            .expect(201);

        const members = await dataSource
            .getRepository('organization_members')
            .find();
        expect(members).toHaveLength(1);
        expect(members[0]).toMatchObject({
            role: 'representative',
            status: 'active',
        });
        expect(
            (await client.get('/api/client/organizations').expect(200)).body,
        ).toHaveLength(1);

        await operator
            .post(
                `/admin/api/organization-access-requests/${submitted.body.id}/approve`,
            )
            .set('Origin', ORIGIN)
            .send({})
            .expect(201);
        expect(
            await dataSource.getRepository('organization_members').count(),
        ).toBe(1);
    });

    it('rejects unknown public fields and invalid INN values', async () => {
        const client = await browser();
        await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '123', userId: 1 })
            .expect(400);
        await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000', userId: 1 })
            .expect(400);
        await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000', role: 'owner' })
            .expect(400);
    });

    it('reuses an existing organization without exposing its protected assets', async () => {
        const organization = await dataSource
            .getRepository('organizations')
            .save({
                inn: '2460000000',
                kpp: null,
                name: 'Existing organization',
            });
        await dataSource.getRepository('cash_registers').save({
            organizationId: organization.id,
            serialNumber: 'KKT-TEST-1',
            status: 'active',
        });
        const client = await browser();
        const submitted = await client
            .post('/api/client/organizations/link-by-inn')
            .send({
                inn: '2460000000',
                organizationName: 'Untrusted replacement name',
            })
            .expect(201);

        expect(submitted.body.organization.name).toBe('Existing organization');
        expect(await dataSource.getRepository('organizations').count()).toBe(1);
        await client
            .get(`/api/client/organizations/${organization.id}/assets`)
            .expect(404);
        expect(
            await dataSource.getRepository('audit_events').count({
                where: {
                    action: 'organization_access.denied',
                    result: 'denied',
                },
            }),
        ).toBe(1);
    });

    it('supports cancellation and a new request after rejection without creating membership', async () => {
        const client = await browser();
        const first = await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000' })
            .expect(201);
        const cancelled = await client
            .post(
                `/api/client/organizations/access-requests/${first.body.id}/cancel`,
            )
            .send({})
            .expect(201);
        expect(cancelled.body.status).toBe('cancelled');

        const second = await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000' })
            .expect(201);
        expect(second.body.id).not.toBe(first.body.id);
        const operator = await staff('operator-reject', ['operator']);
        const rejected = await operator
            .post(
                `/admin/api/organization-access-requests/${second.body.id}/reject`,
            )
            .set('Origin', ORIGIN)
            .send({ reviewComment: 'Could not verify authority' })
            .expect(201);
        expect(rejected.body).toMatchObject({
            status: 'rejected',
            reviewComment: 'Could not verify authority',
        });
        expect(
            await dataSource.getRepository('organization_members').count(),
        ).toBe(0);

        const third = await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000' })
            .expect(201);
        expect(third.body.status).toBe('pending');
        expect(third.body.id).not.toBe(second.body.id);
        const auditActions = (
            await dataSource.getRepository('audit_events').find()
        ).map((event) => event.action);
        expect(auditActions).toEqual(
            expect.arrayContaining([
                'organization_access.submitted',
                'organization_access.cancelled',
                'organization_access.rejected',
            ]),
        );
    });

    it('allows superadmin review and blocks a deactivated operator', async () => {
        const client = await browser();
        const first = await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000' })
            .expect(201);
        const disabledRecord = await auth.createStaff({
            login: 'operator-disabled',
            displayName: 'operator-disabled',
            password: PASSWORD,
            roles: ['operator'],
        });
        const disabled = request.agent(app.getHttpServer());
        await disabled
            .post('/admin/api/login')
            .set('X-Forwarded-For', nextIp())
            .send({ login: 'operator-disabled', password: PASSWORD })
            .expect(201);
        await auth.setActive(disabledRecord.id, false);
        await disabled
            .post(
                `/admin/api/organization-access-requests/${first.body.id}/approve`,
            )
            .set('Origin', ORIGIN)
            .send({})
            .expect(401);

        const root = await staff('root-access', ['superadmin']);
        await root
            .post(
                `/admin/api/organization-access-requests/${first.body.id}/approve`,
            )
            .set('Origin', ORIGIN)
            .send({})
            .expect(201);
    });

    it('serializes concurrent submissions and approvals without duplicate side effects', async () => {
        const client = await browser();
        const [first, second] = await Promise.all([
            client
                .post('/api/client/organizations/link-by-inn')
                .send({ inn: '2460000000' }),
            client
                .post('/api/client/organizations/link-by-inn')
                .send({ inn: '2460000000' }),
        ]);
        expect([first.status, second.status]).toEqual([201, 201]);
        expect(first.body.id).toBe(second.body.id);
        expect(
            await dataSource
                .getRepository('organization_access_requests')
                .count(),
        ).toBe(1);

        const operator = await staff('operator-concurrent', ['operator']);
        const [approvedA, approvedB] = await Promise.all([
            operator
                .post(
                    `/admin/api/organization-access-requests/${first.body.id}/approve`,
                )
                .set('Origin', ORIGIN)
                .send({}),
            operator
                .post(
                    `/admin/api/organization-access-requests/${first.body.id}/approve`,
                )
                .set('Origin', ORIGIN)
                .send({}),
        ]);
        expect([approvedA.status, approvedB.status]).toEqual([201, 201]);
        expect(
            await dataSource.getRepository('organization_members').count(),
        ).toBe(1);
        expect(
            await dataSource
                .getRepository('audit_events')
                .count({ where: { action: 'organization_access.approved' } }),
        ).toBe(1);
        expect(
            await dataSource.getRepository('audit_events').count({
                where: { action: 'organization_membership.created' },
            }),
        ).toBe(1);
    });

    it('keeps service requests available without organization membership', async () => {
        const client = await browser();
        await client
            .post('/api/client/organizations/link-by-inn')
            .send({ inn: '2460000000' })
            .expect(201);
        const service = await client
            .post('/api/client/service-requests/start')
            .send({
                serviceTypeCode: 'firmware_update',
            })
            .expect(201);
        expect(service.body.request.organizationId).toBeNull();
        expect(
            await dataSource.getRepository('organization_members').count(),
        ).toBe(0);
    });
});
