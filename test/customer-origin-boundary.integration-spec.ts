import {
    INestApplication,
    NestInterceptor,
    RequestMethod,
    Type,
} from '@nestjs/common';
import {
    GUARDS_METADATA,
    INTERCEPTORS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Telegraf } from 'telegraf';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.bootstrap';
import { AdminSessionGuard } from '../src/admin/admin-auth.guard';
import { IntegrationBridgeGuard } from '../src/integrations/integration-bridge.guard';
import { WebMutationOriginGuard } from '../src/web-session/web-mutation-origin.guard';
import { WebSessionGuard } from '../src/web-session/web-session.guard';
import { WebSessionService } from '../src/web-session/web-session.service';
import { ClientWorkflowService } from '../src/client/client-workflow.service';
import { OrganizationAccessService } from '../src/organizations/organization-access.service';
import { OrganizationEntity } from '../src/organizations/entities/organization.entity';
import { OrganizationMemberEntity } from '../src/organizations/entities/organization-member.entity';
import { CashRegisterEntity } from '../src/assets/entities/cash-register.entity';
import {
    FILE_STORAGE_PORT,
    FileStoragePort,
} from '../src/files/file-storage.types';
import { MESSENGER_SERVICE } from '../src/messenger/messenger.types';
import {
    customerMutationInventory,
    exemptMutationInventory,
    excludedMutationCounts,
    multipartCustomerRoutes,
} from './helpers/customer-mutation-inventory';

const ORIGIN = 'http://localhost:5174';
const cookieRows = Object.entries(customerMutationInventory).flatMap(
    ([controller, rows]) =>
        rows.map(([handler, method, route, protectedAtBaseline]) => ({
            controller,
            handler,
            method,
            route,
            protectedAtBaseline,
        })),
);
const exemptRows = Object.entries(exemptMutationInventory).flatMap(
    ([controller, rows]) =>
        rows.map(([handler, method, route]) => ({
            controller,
            handler,
            method,
            route,
        })),
);
interface Route {
    controller: string;
    handler: string;
    method: string;
    route: string;
    guards: unknown[];
    interceptors: Type<NestInterceptor>[];
}

function mutationRoutes(app: INestApplication): Route[] {
    const routes: Route[] = [];
    const scanner = new MetadataScanner();
    for (const module of app.get(ModulesContainer).values()) {
        for (const wrapper of module.controllers.values()) {
            const controller = wrapper.metatype;
            if (!controller) continue;
            const proto = controller.prototype as Record<string, unknown>;
            for (const handler of scanner.getAllMethodNames(proto)) {
                const fn = proto[handler];
                if (typeof fn !== 'function') continue;
                const method = Reflect.getMetadata(
                    METHOD_METADATA,
                    fn,
                ) as RequestMethod;
                if (
                    ![
                        RequestMethod.POST,
                        RequestMethod.PUT,
                        RequestMethod.PATCH,
                        RequestMethod.DELETE,
                        RequestMethod.ALL,
                    ].includes(method)
                )
                    continue;
                const prefixes = [
                    Reflect.getMetadata(PATH_METADATA, controller) as
                        | string
                        | string[],
                ].flat();
                const paths = [
                    Reflect.getMetadata(PATH_METADATA, fn) as string | string[],
                ].flat();
                for (const prefix of prefixes)
                    for (const path of paths)
                        routes.push({
                            controller: controller.name,
                            handler,
                            method: RequestMethod[method],
                            route:
                                '/' +
                                [prefix, path]
                                    .filter((part) => part && part !== '/')
                                    .join('/'),
                            guards: [
                                ...((Reflect.getMetadata(
                                    GUARDS_METADATA,
                                    controller,
                                ) as unknown[]) ?? []),
                                ...((Reflect.getMetadata(
                                    GUARDS_METADATA,
                                    fn,
                                ) as unknown[]) ?? []),
                            ],
                            interceptors:
                                (Reflect.getMetadata(
                                    INTERCEPTORS_METADATA,
                                    fn,
                                ) as Type<NestInterceptor>[]) ?? [],
                        });
            }
        }
    }
    return routes;
}

describe('SEC-R3A customer mutation origin boundary', () => {
    let app: INestApplication<App>;
    let db: DataSource;
    let routes: Route[];
    let write: jest.SpyInstance;
    let multipartInterceptors: jest.SpyInstance[];
    let session: Awaited<ReturnType<WebSessionService['create']>>;
    let cookie: string;
    let organizationId: number;
    let cashRegisterId: number;
    let ticketId: number;
    let accessId: number;
    let tables: string[];
    let ip = 0;
    const messenger = {
        sendMessage: jest.fn(),
        sendDocument: jest.fn(),
        sendImage: jest.fn(),
    };

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(MESSENGER_SERVICE)
            .useValue(messenger)
            .compile();
        app = module.createNestApplication({ bodyParser: false });
        configureApplication(app);
        await app.init();
        db = app.get(DataSource);
        jest.spyOn(app.get<Telegraf>(getBotToken()), 'stop').mockImplementation(
            () => undefined,
        );
        write = jest.spyOn(
            app.get<FileStoragePort>(FILE_STORAGE_PORT),
            'write',
        );
        routes = mutationRoutes(app);
        multipartInterceptors = routes
            .filter((row) =>
                multipartCustomerRoutes.some((path) => path === row.route),
            )
            .flatMap((row) =>
                row.interceptors.map((type) =>
                    jest.spyOn(app.get<NestInterceptor>(type), 'intercept'),
                ),
            );
        const rows: Array<{ table_name: string }> = await db.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'typeorm_migrations' ORDER BY table_name",
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
        const organization = await db
            .getRepository(OrganizationEntity)
            .save({ inn: '1234567890', name: 'Origin fixture' });
        organizationId = organization.id;
        await db.getRepository(OrganizationMemberEntity).save({
            organizationId,
            userId: session.principal.userId,
            role: 'representative',
            status: 'active',
        });
        const cash = await db.getRepository(CashRegisterEntity).save({
            organizationId,
            serialNumber: 'origin-fixture',
            status: 'active',
        });
        cashRegisterId = cash.id;
        await app
            .get(ClientWorkflowService)
            .openTicket({ platform: 'web', chatId: session.principal.chatId });
        const tickets: Array<{ id: number }> = await db.query(
            'SELECT id FROM tickets',
        );
        ticketId = tickets[0].id;
        const access = await app.get(OrganizationAccessService).submit({
            platform: 'web',
            chatId: session.principal.chatId,
            inn: '123456789012',
            organizationName: 'Other fixture',
        });
        accessId = access.id;
        jest.clearAllMocks();
    });

    // Hash the complete database state so failures never print session tokens or messages.
    async function state() {
        const snapshots: Array<{ value: unknown }> = await db.query(
            tables
                .map(
                    (table) =>
                        `SELECT jsonb_build_object('table', '${table}', 'rows', COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)) AS value FROM ${table} t`,
                )
                .join(' UNION ALL '),
        );
        return createHash('sha256')
            .update(JSON.stringify(snapshots))
            .digest('hex');
    }
    function target(route: string) {
        return route
            .replace(':organizationId', String(organizationId))
            .replace(
                ':id',
                String(route.includes('access-requests') ? accessId : ticketId),
            )
            .replace(':kind', 'kkt_serial')
            .replace(':attachmentId', '1');
    }
    function body(route: string): object {
        if (route.endsWith('/link-by-inn'))
            return { inn: '9876543210', organizationName: 'Requested fixture' };
        if (route.endsWith('/cash-registers'))
            return { serialNumber: 'new-fixture', model: 'Test' };
        if (route.endsWith('/fiscal-drives'))
            return { cashRegisterId, serialNumber: 'new-fn' };
        if (route.endsWith('/ofd-subscriptions'))
            return { cashRegisterId, provider: 'Test OFD' };
        if (route.endsWith('/messages'))
            return { text: 'Synthetic client message' };
        if (route.endsWith('/users')) return { name: 'Changed synthetic name' };
        return {};
    }
    function mutation(
        route: string,
        origin?: string,
        useCookie = true,
        method = 'post',
    ) {
        const client = request(app.getHttpServer());
        const req =
            method === 'patch'
                ? client.patch(target(route))
                : method === 'delete'
                  ? client.delete(target(route))
                  : client.post(target(route));
        req.set(
            'X-Forwarded-For',
            `10.199.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`,
        );
        if (useCookie) req.set('Cookie', cookie);
        if (origin !== undefined) req.set('Origin', origin);
        return req;
    }

    it('classifies every registered mutation, not just routes under a presumed prefix', () => {
        const publicRoutes = routes.filter(
            (row) => !(row.controller in excludedMutationCounts),
        );
        const signature = ({
            controller,
            handler,
            method,
            route,
        }: Omit<Route, 'guards' | 'interceptors'>) =>
            `${controller}.${handler} ${method} ${route}`;
        expect(publicRoutes.map(signature).sort()).toEqual(
            [...cookieRows, ...exemptRows].map(signature).sort(),
        );
        for (const [controller, count] of Object.entries(
            excludedMutationCounts,
        )) {
            const excluded = routes.filter(
                (row) => row.controller === controller,
            );
            expect(excluded).toHaveLength(count);
            for (const row of excluded) {
                expect(row.guards).toContain(
                    controller === 'IntegrationsController'
                        ? IntegrationBridgeGuard
                        : AdminSessionGuard,
                );
                expect(row.guards).not.toContain(WebSessionGuard);
            }
        }
        expect(routes).toHaveLength(108);
        for (const row of publicRoutes.filter((row) =>
            exemptRows.some((exempt) => exempt.route === row.route),
        )) {
            expect(row.guards).not.toContain(WebSessionGuard);
            expect(row.guards).not.toContain(WebMutationOriginGuard);
        }
    });
    it.each(cookieRows)(
        '$method $route requires canonical guard identity',
        (row) => {
            const actual = routes.find(
                (actual) =>
                    actual.route === row.route && actual.method === row.method,
            )!;
            expect(actual.guards).toContain(WebMutationOriginGuard);
            if (row.handler !== 'createOrRestore')
                expect(actual.guards).toContain(WebSessionGuard);
            // Origin must precede all upload preflight guards; interceptors run after guards in Nest.
            const originIndex = actual.guards.indexOf(WebMutationOriginGuard);
            expect(actual.guards.slice(originIndex + 1)).not.toContain(
                WebMutationOriginGuard,
            );
            const preflight = actual.guards.filter(
                (guard) =>
                    guard !== WebSessionGuard &&
                    guard !== WebMutationOriginGuard,
            );
            for (const guard of preflight)
                expect(actual.guards.indexOf(guard)).toBeGreaterThan(
                    originIndex,
                );
        },
    );
    it.each(cookieRows.filter((row) => !row.protectedAtBaseline))(
        '$route rejects foreign/missing/malformed origin without persistent effects',
        async (row) => {
            const before = await state();
            for (const origin of [
                'https://evil.test',
                undefined,
                ORIGIN + '/not-an-origin',
            ]) {
                const req = mutation(row.route, origin);
                if (row.route.endsWith('/media'))
                    req.attach('file', Buffer.from('%PDF-1.7\nsynthetic'), {
                        filename: 'test.pdf',
                        contentType: 'application/pdf',
                    });
                else req.send(body(row.route));
                const response = await req.expect(403);
                expect(response.headers['set-cookie']).toBeUndefined();
                expect(await state()).toBe(before);
                expect(write).not.toHaveBeenCalled();
                for (const send of Object.values(messenger))
                    expect(send).not.toHaveBeenCalled();
            }
        },
    );
    it.each(cookieRows.filter((row) => !row.protectedAtBaseline))(
        '$route still accepts the valid same-origin operation',
        async (row) => {
            const req = mutation(row.route, ORIGIN);
            if (row.route.endsWith('/media'))
                req.attach('file', Buffer.from('%PDF-1.7\nsynthetic'), {
                    filename: 'test.pdf',
                    contentType: 'application/pdf',
                });
            else req.send(body(row.route));
            await req.expect(201);
            if (row.route.endsWith('/media'))
                expect(write).toHaveBeenCalledTimes(1);
        },
    );
    it.each(multipartCustomerRoutes)(
        '%s rejects before every Multer interceptor and storage write',
        async (route) => {
            const before = await state();
            // Malformed multipart would fail in Multer if guards allowed it to start.
            await mutation(route, 'https://evil.test')
                .set('Content-Type', 'multipart/form-data; boundary=missing')
                .send('not a multipart body')
                .expect(403);
            expect(await state()).toBe(before);
            expect(write).not.toHaveBeenCalled();
            for (const interceptor of multipartInterceptors)
                expect(interceptor).not.toHaveBeenCalled();
        },
    );
    it('public bounded resolve remains read-only and cookie-independent for foreign/missing origin', async () => {
        const before = await state();
        for (const origin of [undefined, 'https://evil.test'])
            for (const withCookie of [false, true]) {
                const response = await mutation(
                    '/api/catalog/products/resolve',
                    origin,
                    withCookie,
                )
                    .send({ ids: [2147483647] })
                    .expect(201);
                expect(response.body as unknown).toEqual({ items: [] });
                expect(response.headers['set-cookie']).toBeUndefined();
            }
        expect(await state()).toBe(before);
        expect(write).not.toHaveBeenCalled();
    });
    it('session lifecycle rejects cross-site creation, preserves active identity, and isolates replacement', async () => {
        const before = await state();
        for (const origin of ['https://evil.test', undefined, 'null']) {
            const denied = await mutation('/api/client/session', origin, false)
                .send({})
                .expect(403);
            expect(denied.headers['set-cookie']).toBeUndefined();
        }
        expect(await state()).toBe(before);
        const restore = await mutation('/api/client/session', ORIGIN)
            .send({})
            .expect(201);
        expect(restore.headers['set-cookie']).toBeUndefined();
        expect(await state()).toBe(before);
        await mutation('/api/client/session/revoke', ORIGIN)
            .send({})
            .expect(201);
        await request(app.getHttpServer())
            .get('/api/client/session')
            .set('Cookie', cookie)
            .expect(401);
        const fresh = await mutation('/api/client/session', ORIGIN)
            .send({})
            .expect(201);
        const cookies = fresh.headers['set-cookie'] as unknown as string[];
        const newCookie = cookies[0].split(';')[0];
        expect(newCookie).not.toBe(cookie);
        await request(app.getHttpServer())
            .get(`/api/client/tickets/${ticketId}/messages`)
            .set('Cookie', newCookie)
            .expect(400);
    });
    it('missing Origin may use valid Referer, but malformed/foreign Origin cannot downgrade to Referer', async () => {
        await mutation('/api/client/users')
            .set('Referer', ORIGIN + '/site/')
            .send({ name: 'Referer fixture' })
            .expect(201);
        for (const origin of [
            '',
            'null',
            ORIGIN + '/path',
            'https://evil.test',
        ]) {
            await mutation('/api/client/users', origin)
                .set('Referer', ORIGIN + '/site/')
                .send({ name: 'Rejected' })
                .expect(403);
        }
    });
    it('owner GETs without identity never bootstrap a session', async () => {
        const before = await state();
        for (const url of [
            '/api/client/session',
            '/api/client/orders',
            '/api/client/registrations',
            '/api/client/service-requests',
        ]) {
            const response = await request(app.getHttpServer())
                .get(url)
                .expect(401);
            expect(response.headers['set-cookie']).toBeUndefined();
        }
        expect(await state()).toBe(before);
    });
});
