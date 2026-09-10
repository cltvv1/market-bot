import { assertFilePolicy, FILE_POLICIES } from './file-policies';

const samples = [
    ['application/pdf', 'proof.pdf', Buffer.from('%PDF-1.4\nsynthetic\n%%EOF')],
    ['image/jpeg', 'proof.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['image/png', 'proof.png', Buffer.from('89504e470d0a1a0a', 'hex')],
    ['image/webp', 'proof.webp', Buffer.from('RIFF0000WEBPVP8 ')],
] as const;

describe('ServiceRequest payment-proof content policy', () => {
    it('requires strict downloadable owner evidence with a 20 MiB cap', () => {
        expect(FILE_POLICIES['payment-proof']).toMatchObject({
            strictContent: true,
            maxBytes: 20 * 1024 * 1024,
            customerReadable: true,
            staffReadable: true,
            inline: false,
        });
    });

    it.each(samples)(
        'accepts %s only with matching declared type and extension',
        (mime, name, bytes) => {
            for (const declared of [
                mime,
                undefined,
                'application/octet-stream',
            ]) {
                expect(
                    assertFilePolicy(
                        'payment-proof',
                        bytes,
                        declared,
                        false,
                        name,
                    ).mime,
                ).toBe(mime);
            }
            expect(() =>
                assertFilePolicy(
                    'payment-proof',
                    bytes,
                    mime,
                    false,
                    'proof.txt',
                ),
            ).toThrow();
            expect(() =>
                assertFilePolicy('payment-proof', bytes, mime, false, 'proof'),
            ).toThrow();
            expect(() =>
                assertFilePolicy(
                    'payment-proof',
                    bytes,
                    'text/plain',
                    false,
                    name,
                ),
            ).toThrow();
        },
    );

    it.each([
        Buffer.alloc(0),
        Buffer.from('random'),
        Buffer.from('<html>'),
        Buffer.from('PK\x03\x04'),
        Buffer.from('MZ executable'),
    ])('rejects disguised content before storage', (bytes) => {
        expect(() =>
            assertFilePolicy(
                'payment-proof',
                bytes,
                'application/pdf',
                false,
                'proof.pdf',
            ),
        ).toThrow();
    });

    it.each(samples.slice(1))(
        'rejects %s disguised as PDF',
        (mime, _name, bytes) => {
            expect(() =>
                assertFilePolicy(
                    'payment-proof',
                    bytes,
                    mime,
                    false,
                    'proof.pdf',
                ),
            ).toThrow();
        },
    );
});
