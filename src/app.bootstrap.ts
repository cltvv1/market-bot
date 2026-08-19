import { randomUUID } from 'node:crypto';
import { INestApplication, type LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { AdminAuthService } from './admin/admin-auth.service';
import { ApiErrorFilter } from './common/http/api-error.filter';
import { createValidationPipe } from './common/http/validation';
import {
    getAllowedBrowserOrigins,
    shouldEnableSwagger,
} from './security/security.config';

export function configureApplication(
    app: INestApplication,
    logger?: LoggerService,
) {
    const config = app.get(ConfigService);
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    const trustProxy = config.get<string>('TRUST_PROXY');
    if (trustProxy) {
        expressApp.set(
            'trust proxy',
            /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
        );
    }

    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(json({ limit: config.get<string>('HTTP_JSON_LIMIT') || '256kb' }));
    app.use(
        urlencoded({
            extended: false,
            limit: config.get<string>('HTTP_URLENCODED_LIMIT') || '64kb',
        }),
    );
    app.use(
        (
            request: {
                requestId?: string;
                header(name: string): string | undefined;
            },
            response: { setHeader(name: string, value: string): void },
            next: () => void,
        ) => {
            const supplied = request.header('x-request-id');
            const requestId =
                supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied)
                    ? supplied
                    : randomUUID();
            request.requestId = requestId;
            response.setHeader('x-request-id', requestId);
            next();
        },
    );

    const origins = getAllowedBrowserOrigins(config);
    if (origins.length) {
        app.enableCors({
            credentials: true,
            origin(
                origin: string | undefined,
                callback: (error: Error | null, allow?: boolean) => void,
            ) {
                if (!origin || origins.includes(origin)) {
                    callback(null, true);
                    return;
                }
                callback(null, false);
            },
        });
    }

    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ApiErrorFilter());
    configureSwagger(app, config);
    if (logger) app.useLogger(logger);
}

function configureSwagger(app: INestApplication, config: ConfigService) {
    const production = config.get<string>('NODE_ENV') === 'production';
    const explicit = config.get<boolean>('SWAGGER_ENABLED');
    const enabled = shouldEnableSwagger(
        config.get<string>('NODE_ENV'),
        explicit,
    );
    if (!enabled) return;

    if (production) {
        const auth = app.get(AdminAuthService);
        const cookieName = auth.getSessionCookieName();
        app.use(
            ['/api/docs', '/api/docs-json', '/api/docs/*'],
            async (
                request: { header(name: string): string | undefined },
                response: {
                    status(code: number): { json(body: unknown): void };
                },
                next: () => void,
            ) => {
                const prefix = `${cookieName}=`;
                const cookie = (request.header('cookie') || '')
                    .split(';')
                    .map((part) => part.trim())
                    .find((part) => part.startsWith(prefix));
                const token = cookie
                    ? decodeURIComponent(cookie.slice(prefix.length))
                    : null;
                if (!(await auth.getPrincipalBySessionToken(token))) {
                    response.status(401).json({
                        statusCode: 401,
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                        errors: [],
                    });
                    return;
                }
                next();
            },
        );
    }

    const swaggerConfig = new DocumentBuilder()
        .setTitle('VitmaMarket Bot API')
        .setDescription(
            'API для клиентского сайта, админки, организаций, сервисных заявок и ботов.',
        )
        .setVersion('0.2.0')
        .addCookieAuth(
            config.get<string>('ADMIN_SESSION_COOKIE_NAME') ||
                'vitma_admin_session',
            undefined,
            'adminSession',
        )
        .addCookieAuth(
            config.get<string>('WEB_SESSION_COOKIE_NAME') ||
                'vitma_web_session',
            undefined,
            'webSession',
        )
        .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
        jsonDocumentUrl: 'api/docs-json',
        swaggerOptions: { persistAuthorization: false },
    });
}
