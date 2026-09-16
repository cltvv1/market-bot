import { ArgumentsHost, Logger } from '@nestjs/common';
import { ApiErrorFilter } from './api-error.filter';

describe('API error logging privacy', () => {
    it.each([undefined, { path: '/api/public/service-requests/:id' }])(
        'does not log request secrets or exception messages (route %j)',
        (route) => {
            const log = jest
                .spyOn(Logger.prototype, 'error')
                .mockImplementation();
            const secrets = [
                'query-secret',
                'path-secret',
                'auth-secret',
                'cookie-secret',
            ];
            const response = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
                getHeader: jest.fn(),
            };
            const host = {
                switchToHttp: () => ({
                    getRequest: () => ({
                        method: 'POST',
                        route,
                        originalUrl: '/path-secret?token=query-secret',
                        baseUrl: '/path-secret',
                        headers: {
                            authorization: 'Bearer auth-secret',
                            cookie: 'cookie-secret',
                        },
                    }),
                    getResponse: () => response,
                }),
            } as unknown as ArgumentsHost;
            try {
                new ApiErrorFilter().catch(new Error(secrets.join(' ')), host);
                expect(log).toHaveBeenCalled();
                const output = JSON.stringify(log.mock.calls);
                for (const secret of secrets)
                    expect(output).not.toContain(secret);
                if (route) expect(output).toContain(route.path);
                expect(response.status).toHaveBeenCalledWith(500);
            } finally {
                log.mockRestore();
            }
        },
    );
});
