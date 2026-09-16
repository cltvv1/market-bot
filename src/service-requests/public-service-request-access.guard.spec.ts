import type { Request } from 'express';
import { readPublicBearer } from './public-service-request-access.guard';

describe('public ServiceRequest Authorization parsing', () => {
    const token = Buffer.alloc(32, 7).toString('base64url');
    const parse = (authorization?: unknown, rawHeaders: string[] = []) =>
        readPublicBearer({
            headers: { authorization },
            rawHeaders,
        } as Pick<Request, 'headers' | 'rawHeaders'>);
    it.each(['Bearer', 'bearer', 'bEaReR'])(
        'accepts case-insensitive scheme %s',
        (scheme) => {
            expect(parse(`${scheme} ${token}`)).toBe(token);
        },
    );
    it.each([
        undefined,
        '',
        `Basic ${token}`,
        ` Bearer ${token}`,
        `Bearer ${token} `,
        `Bearer  ${token}`,
        `Bearer\t${token}`,
        `Bearer ${token}, Bearer ${token}`,
        `Bearer ${'a'.repeat(10000)}`,
        `Bearer ${'!'.repeat(43)}`,
        `Bearer ${'A'.repeat(42)}B`,
        `Bearer ${'A'.repeat(41)} A`,
        [`Bearer ${token}`],
    ])('rejects malformed authorization case %#', (value) => {
        expect(() => parse(value)).toThrow('Public access is unavailable');
    });
    it('rejects duplicate Authorization even when parser kept only one', () => {
        expect(() =>
            parse(`Bearer ${token}`, [
                'Authorization',
                `Bearer ${token}`,
                'authorization',
                `Bearer ${token}`,
            ]),
        ).toThrow('Public access is unavailable');
    });
});
