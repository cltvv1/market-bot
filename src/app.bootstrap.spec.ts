import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { configureApplication } from './app.bootstrap';

describe('proxy trust bootstrap', () => {
    jest.setTimeout(15_000);

    function application(trustedHops: number) {
        const server = express();
        const config = {
            get: <T = unknown>(key: string): T | undefined => {
                if (key === 'TRUST_PROXY') return trustedHops as T;
                if (key === 'SWAGGER_ENABLED') return false as T;
                if (key === 'NODE_ENV') return 'test' as T;
                return undefined;
            },
        };
        const app = {
            get: (token: unknown) =>
                token === ConfigService ? config : undefined,
            getHttpAdapter: () => ({ getInstance: () => server }),
            use: (middleware: RequestHandler) => server.use(middleware),
            enableCors: jest.fn(),
            useGlobalPipes: jest.fn(),
            useGlobalFilters: jest.fn(),
            useLogger: jest.fn(),
        } as unknown as INestApplication;
        configureApplication(app);
        server.get('/ip', (incoming, response) =>
            response.json({ ip: incoming.ip }),
        );
        return server;
    }

    it('ignores forwarded addresses in direct mode', async () => {
        const response = await request(application(0))
            .get('/ip')
            .set('X-Forwarded-For', '198.51.100.20')
            .expect(200);
        expect(response.text).not.toContain('198.51.100.20');
    });

    it('uses one forwarded hop only when explicitly configured', async () => {
        const response = await request(application(1))
            .get('/ip')
            .set('X-Forwarded-For', '198.51.100.20')
            .expect(200);
        expect(response.text).toBe('{"ip":"198.51.100.20"}');
    });
});
