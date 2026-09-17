import {
    pdf as pdfFixture,
    fixture as fileFixture,
} from '../../test/fixtures/files.cjs';
import { assertFilePolicy, FILE_POLICIES } from './file-policies';

const samples = [
    ['application/pdf', 'proof.pdf', pdfFixture('%PDF-1.4\nsynthetic\n%%EOF')],
    ['image/jpeg', 'proof.jpeg', fileFixture('image.jpg')],
    ['image/png', 'proof.png', fileFixture('image.png')],
    ['image/webp', 'proof.webp', fileFixture('image.webp')],
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
        async (mime, name, bytes) => {
            for (const declared of [
                mime,
                undefined,
                'application/octet-stream',
            ]) {
                expect(
                    (
                        await assertFilePolicy(
                            'payment-proof',
                            bytes,
                            declared,
                            false,
                            name,
                        )
                    ).mime,
                ).toBe(mime);
            }
            await expect(
                assertFilePolicy(
                    'payment-proof',
                    bytes,
                    mime,
                    false,
                    'proof.txt',
                ),
            ).rejects.toThrow();
            await expect(
                assertFilePolicy('payment-proof', bytes, mime, false, 'proof'),
            ).rejects.toThrow();
            await expect(
                assertFilePolicy(
                    'payment-proof',
                    bytes,
                    'text/plain',
                    false,
                    name,
                ),
            ).rejects.toThrow();
        },
    );

    it.each([
        Buffer.alloc(0),
        Buffer.from('random'),
        Buffer.from('<html>'),
        Buffer.from('PK\x03\x04'),
        Buffer.from('MZ executable'),
    ])('rejects disguised content before storage', async (bytes) => {
        await expect(
            assertFilePolicy(
                'payment-proof',
                bytes,
                'application/pdf',
                false,
                'proof.pdf',
            ),
        ).rejects.toThrow();
    });

    it.each(samples.slice(1))(
        'rejects %s disguised as PDF',
        async (mime, _name, bytes) => {
            await expect(
                assertFilePolicy(
                    'payment-proof',
                    bytes,
                    mime,
                    false,
                    'proof.pdf',
                ),
            ).rejects.toThrow();
        },
    );
});
