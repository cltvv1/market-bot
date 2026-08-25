import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit';

describe('RateLimitGuard', () => {
    const options = { bucket: 'admin-login', limit: 2, windowSeconds: 60 };

    function fixture(maxEntries = 100) {
        const reflector = {
            getAllAndOverride: jest.fn().mockReturnValue(options),
        } as unknown as Reflector;
        const config = {
            get: jest.fn((key: string) =>
                key === 'RATE_LIMIT_MAX_ENTRIES' ? maxEntries : undefined,
            ),
        } as unknown as ConfigService;
        const guard = new RateLimitGuard(reflector, config);
        const headers = new Map<string, string | number>();
        return { guard, headers };
    }

    function context(
        ip: string,
        headers: Map<string, string | number>,
        cookie?: string,
        forwardedFor?: string,
    ) {
        const request = {
            ip,
            socket: { remoteAddress: ip },
            header: (name: string) => {
                if (name.toLowerCase() === 'cookie') return cookie;
                if (name.toLowerCase() === 'x-forwarded-for') {
                    return forwardedFor;
                }
                return undefined;
            },
        };
        const response = {
            setHeader: (name: string, value: string | number) =>
                headers.set(name, value),
        };
        return {
            getHandler: () => undefined,
            getClass: () => undefined,
            switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => response,
            }),
        } as unknown as ExecutionContext;
    }

    it('does not reset a pre-auth bucket when cookies rotate', () => {
        const { guard, headers } = fixture();
        expect(guard.canActivate(context('10.0.0.5', headers, 'sid=one'))).toBe(
            true,
        );
        expect(guard.canActivate(context('10.0.0.5', headers, 'sid=two'))).toBe(
            true,
        );
        expect(() =>
            guard.canActivate(context('10.0.0.5', headers, 'sid=three')),
        ).toThrow(HttpException);
    });

    it('does not consume raw forwarded headers as identity', () => {
        const { guard, headers } = fixture();
        guard.canActivate(context('127.0.0.1', headers, undefined, '10.0.0.1'));
        guard.canActivate(context('127.0.0.1', headers, undefined, '10.0.0.2'));
        expect(() =>
            guard.canActivate(
                context('127.0.0.1', headers, undefined, '10.0.0.3'),
            ),
        ).toThrow(HttpException);
    });

    it('fails closed without growing beyond the configured map bound', () => {
        const { guard, headers } = fixture(100);
        for (let index = 0; index < 100; index += 1) {
            expect(guard.canActivate(context(`10.0.0.${index}`, headers))).toBe(
                true,
            );
        }
        expect(() => guard.canActivate(context('10.0.1.1', headers))).toThrow(
            HttpException,
        );
        const entries = (guard as unknown as { entries: Map<string, unknown> })
            .entries;
        expect(entries.size).toBe(100);
    });
});
