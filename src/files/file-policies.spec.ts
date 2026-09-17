import {
    pdf as pdfFixture,
    fixture as fileFixture,
} from '../../test/fixtures/files.cjs';
import { assertFilePolicy, detectMime } from './file-policies';

describe('file policies', () => {
    const pdf = pdfFixture('%PDF-1.7\n');
    const jpeg = fileFixture('image.jpg');
    const png = fileFixture('image.png');
    const webp = fileFixture('image.webp');

    it('detects common signatures', async () => {
        expect(await detectMime(pdf)).toBe('application/pdf');
        expect(await detectMime(jpeg)).toBe('image/jpeg');
    });

    it('accepts an allowed registration photo', async () => {
        expect(
            (
                await assertFilePolicy(
                    'registration-photo',
                    jpeg,
                    'image/jpeg',
                    false,
                    'photo.jpg',
                )
            ).mime,
        ).toBe('image/jpeg');
    });

    it('accepts PDF and image registration evidence', async () => {
        expect(
            (
                await assertFilePolicy(
                    'registration-evidence',
                    pdf,
                    'application/pdf',
                    false,
                    'evidence.pdf',
                )
            ).mime,
        ).toBe('application/pdf');
        expect(
            (
                await assertFilePolicy(
                    'registration-evidence',
                    jpeg,
                    'image/jpeg',
                    false,
                    'evidence.jpg',
                )
            ).mime,
        ).toBe('image/jpeg');
    });

    it('rejects a mismatched signature', async () => {
        await expect(
            assertFilePolicy('service-invoice', jpeg, 'application/pdf'),
        ).rejects.toThrow();
    });

    it('rejects a client supplied server-generated file', async () => {
        await expect(
            assertFilePolicy('generated-pdf', pdf, 'application/pdf'),
        ).rejects.toThrow();
    });

    it('accepts a server-generated PDF', async () => {
        expect(
            (
                await assertFilePolicy(
                    'generated-pdf',
                    pdf,
                    'application/pdf',
                    true,
                    'generated.pdf',
                )
            ).mime,
        ).toBe('application/pdf');
    });

    // prettier-ignore
    it('accepts PDF and image payment proofs', async () => {
        expect(
            (await assertFilePolicy('payment-proof', pdf, 'application/pdf', false, 'proof.pdf')).mime,
        ).toBe('application/pdf');
        expect(
            (await assertFilePolicy('payment-proof', jpeg, 'image/jpeg', false, 'proof.jpg')).mime,
        ).toBe('image/jpeg');
    });

    it('accepts safe service-request attachments and rejects media', async () => {
        expect(
            (
                await assertFilePolicy(
                    'service-attachment',
                    pdf,
                    'application/pdf',
                    false,
                    'attachment.pdf',
                )
            ).mime,
        ).toBe('application/pdf');
        await expect(
            assertFilePolicy(
                'service-attachment',
                Buffer.from('OggScontent'),
                'audio/ogg',
            ),
        ).rejects.toThrow();
    });

    it('strictly validates order invoices by signature, MIME, and extension', async () => {
        expect(
            (
                await assertFilePolicy(
                    'order-invoice',
                    pdf,
                    'application/pdf',
                    false,
                    'invoice.pdf',
                )
            ).mime,
        ).toBe('application/pdf');
        expect(
            (
                await assertFilePolicy(
                    'order-invoice',
                    pdf,
                    'application/octet-stream',
                    false,
                    'invoice.pdf',
                )
            ).mime,
        ).toBe('application/pdf');
        await expect(
            assertFilePolicy(
                'order-invoice',
                Buffer.from('not a pdf'),
                'application/pdf',
                false,
                'invoice.pdf',
            ),
        ).rejects.toThrow();
        await expect(
            assertFilePolicy(
                'order-invoice',
                pdf,
                'application/pdf',
                false,
                'invoice.jpg',
            ),
        ).rejects.toThrow();
    });

    it.each([
        [pdf, 'application/pdf', 'proof.pdf'],
        [jpeg, 'image/jpeg', 'proof.jpeg'],
        [png, 'image/png', 'proof.png'],
        [webp, 'image/webp', 'proof.webp'],
    ])(
        'accepts supported order payment proof content %#',
        async (buffer, mimeType, originalName) => {
            expect(
                (
                    await assertFilePolicy(
                        'order-payment-proof',
                        buffer,
                        mimeType,
                        false,
                        originalName,
                    )
                ).mime,
            ).toBe(mimeType);
        },
    );

    it('rejects mismatched order payment proof declarations', async () => {
        await expect(
            assertFilePolicy(
                'order-payment-proof',
                jpeg,
                'image/png',
                false,
                'proof.png',
            ),
        ).rejects.toThrow();
        await expect(
            assertFilePolicy(
                'order-payment-proof',
                jpeg,
                'image/jpeg',
                false,
                'proof.pdf',
            ),
        ).rejects.toThrow();
    });
});
