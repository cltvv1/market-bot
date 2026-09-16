import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebMutationOriginGuard } from './web-mutation-origin.guard';

describe('customer mutation origin policy', () => {
    const guard = new WebMutationOriginGuard(
        new ConfigService({
            NODE_ENV: 'production',
            CORS_ORIGINS: 'https://client.example.test',
        }),
    );
    function check(
        headers: Record<string, string | string[]> = {},
        raw?: string[],
    ) {
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({
                    protocol: 'https',
                    headers: { host: 'market.example.test', ...headers },
                    rawHeaders:
                        raw ??
                        Object.entries(headers).flatMap(([key, value]) => [
                            key,
                            String(value),
                        ]),
                    header: (name: string) =>
                        ({ host: 'market.example.test', ...headers })[name],
                }),
            }),
        } as unknown as ExecutionContext;
        return guard.canActivate(context);
    }
    it.each(['https://market.example.test', 'https://client.example.test'])(
        'allows exact request/configured production origin %s',
        (origin) => {
            expect(check({ origin })).toBe(true);
        },
    );
    it('retains intentional same-origin Referer fallback when Origin is absent', () => {
        expect(
            check({
                referer: 'https://market.example.test/site/checkout?from=cart',
            }),
        ).toBe(true);
    });
    it('rejects missing Origin and Referer', () => {
        expect(() => check()).toThrow(ForbiddenException);
    });
    it.each([
        'https://evil.example.test',
        'null',
        'not a URL',
        'https://market.example.test.evil.test',
        'https://evilmarket.example.test',
        'http://market.example.test',
        'https://market.example.test:444',
        'https://market.example.test https://evil.test',
        'https://market.example.test, https://evil.test',
        'https://market.example.test/path',
        'https://market.example.test?query',
        'https://market.example.test#fragment',
        'https://user@market.example.test',
        'https://market.example.test/',
        '',
    ])(
        'rejects foreign or malformed Origin %s without Referer downgrade',
        (origin) => {
            expect(() =>
                check({ origin, referer: 'https://market.example.test/site/' }),
            ).toThrow(ForbiddenException);
        },
    );
    it('rejects header arrays safely', () => {
        expect(() =>
            check({ origin: ['https://market.example.test'] }),
        ).toThrow(ForbiddenException);
    });
    it('rejects duplicate Origin even if the HTTP parser preserved only one', () => {
        expect(() =>
            check({ origin: 'https://market.example.test' }, [
                'Origin',
                'https://market.example.test',
                'origin',
                'https://market.example.test',
            ]),
        ).toThrow(ForbiddenException);
    });
    it('rejects duplicate Referer', () => {
        expect(() =>
            check({ referer: 'https://market.example.test/site' }, [
                'Referer',
                'https://market.example.test/site',
                'Referer',
                'https://evil.test/',
            ]),
        ).toThrow(ForbiddenException);
    });
    it.each([
        'null',
        'https://evil.test/',
        'https://user@market.example.test/site',
    ])('rejects unsafe Referer %s', (referer) => {
        expect(() => check({ referer })).toThrow(ForbiddenException);
    });
    it('does not treat forwarded host/protocol as independent origin authority', () => {
        expect(() =>
            check({
                origin: 'http://evil.test',
                'x-forwarded-host': 'evil.test',
                'x-forwarded-proto': 'http',
                forwarded: 'host=evil.test;proto=http',
            }),
        ).toThrow(ForbiddenException);
    });
});
