import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ModulesContainer } from '@nestjs/core';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { AppModule } from 'src/app.module';

interface RouteRegistration {
    controller: string;
    handler: string;
    method: string;
    path: string;
}

function pathParts(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap(pathParts);
    }
    return typeof value === 'string' ? [value] : [''];
}

function joinPath(...parts: string[]) {
    const path = parts
        .flatMap((part) => part.split('/'))
        .filter(Boolean)
        .join('/');
    return `/${path}`;
}

function discoverRoutes(modules: ModulesContainer): RouteRegistration[] {
    const routes: RouteRegistration[] = [];

    for (const module of modules.values()) {
        for (const wrapper of module.controllers.values()) {
            const controller = wrapper.metatype;
            if (!controller) continue;

            const controllerPaths = pathParts(
                Reflect.getMetadata(PATH_METADATA, controller),
            );
            for (const handler of Object.getOwnPropertyNames(
                controller.prototype,
            )) {
                if (handler === 'constructor') continue;
                const target = Object.getOwnPropertyDescriptor(
                    controller.prototype,
                    handler,
                )?.value as unknown;
                if (typeof target !== 'function') continue;

                const requestMethod = Reflect.getMetadata(
                    METHOD_METADATA,
                    target,
                ) as RequestMethod | undefined;
                if (requestMethod === undefined) continue;

                const handlerPaths = pathParts(
                    Reflect.getMetadata(PATH_METADATA, target),
                );
                for (const controllerPath of controllerPaths) {
                    for (const handlerPath of handlerPaths) {
                        routes.push({
                            controller: controller.name,
                            handler,
                            method: RequestMethod[requestMethod],
                            path: joinPath(controllerPath, handlerPath),
                        });
                    }
                }
            }
        }
    }

    return routes;
}

describe('service-request HTTP route ownership', () => {
    it('registers every service-request method and path exactly once', async () => {
        const testingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        const telegramBot = testingModule.get<Telegraf>(getBotToken());
        jest.spyOn(telegramBot, 'stop').mockImplementation(() => undefined);

        try {
            const allRoutes = discoverRoutes(
                testingModule.get(ModulesContainer),
            );
            const routes = allRoutes.filter((route) =>
                route.path.includes('/service-requests'),
            );
            const byMethodAndPath = new Map<string, RouteRegistration[]>();
            const allByMethodAndPath = new Map<string, RouteRegistration[]>();

            for (const route of allRoutes) {
                const key = `${route.method} ${route.path}`;
                allByMethodAndPath.set(key, [
                    ...(allByMethodAndPath.get(key) ?? []),
                    route,
                ]);
            }

            for (const route of routes) {
                const key = `${route.method} ${route.path}`;
                byMethodAndPath.set(key, [
                    ...(byMethodAndPath.get(key) ?? []),
                    route,
                ]);
            }

            const duplicates = [...byMethodAndPath.entries()].filter(
                ([, registrations]) => registrations.length > 1,
            );
            expect(duplicates).toEqual([]);

            for (const key of [
                'GET /api/client/service-requests/types',
                'GET /api/client/service-requests',
                'POST /api/client/service-requests/drafts',
                'PATCH /api/client/service-requests/drafts/:id',
                'POST /api/client/service-requests/drafts/:id/submit',
                'POST /api/client/service-requests/drafts/:id/attachments',
                'DELETE /api/client/service-requests/drafts/:id/attachments/:attachmentId',
            ]) {
                expect(byMethodAndPath.get(key)).toEqual([
                    expect.objectContaining({
                        controller: 'ServiceRequestsController',
                    }),
                ]);
            }
            for (const removedRoute of [
                'POST /api/client/service-requests/start',
                'POST /api/client/service-requests/:id/answers',
                'POST /api/client/service-requests/:id/confirm-price',
                'POST /admin/api/service-requests/:id/invoice',
                'POST /admin/api/service-requests/:id/payment-received',
                'POST /admin/api/service-requests/:id/complete',
                'POST /admin/api/service-requests/:id/cancel',
                'POST /admin/api/registrations/:id/process',
                'GET /admin/api/registrations/:id/equipment-photo',
            ]) {
                expect(allByMethodAndPath.has(removedRoute)).toBe(false);
            }
            expect(
                byMethodAndPath.get('GET /api/public/service-requests/:token'),
            ).toEqual([
                expect.objectContaining({
                    controller: 'PublicServiceRequestsController',
                }),
            ]);
        } finally {
            await testingModule.close();
        }
    });
});
