import { assertFilePolicy, detectMime } from './file-policies';

describe('file policies', () => {
    const pdf = Buffer.from('%PDF-1.7\n');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const webp = Buffer.from('RIFF1234WEBP', 'ascii');

    it('detects common signatures', () => {
        expect(detectMime(pdf)).toBe('application/pdf');
        expect(detectMime(jpeg)).toBe('image/jpeg');
    });

    it('accepts an allowed registration photo', () => {
        expect(
            assertFilePolicy('registration-photo', jpeg, 'image/jpeg').mime,
        ).toBe('image/jpeg');
    });

    it('accepts PDF and image registration evidence', () => {
        expect(
            assertFilePolicy('registration-evidence', pdf, 'application/pdf')
                .mime,
        ).toBe('application/pdf');
        expect(
            assertFilePolicy('registration-evidence', jpeg, 'image/jpeg').mime,
        ).toBe('image/jpeg');
    });

    it('rejects a mismatched signature', () => {
        expect(() =>
            assertFilePolicy('service-invoice', jpeg, 'application/pdf'),
        ).toThrow();
    });

    it('rejects a client supplied server-generated file', () => {
        expect(() =>
            assertFilePolicy('generated-pdf', pdf, 'application/pdf'),
        ).toThrow();
    });

    it('accepts a server-generated PDF', () => {
        expect(
            assertFilePolicy('generated-pdf', pdf, 'application/pdf', true)
                .mime,
        ).toBe('application/pdf');
    });

    // prettier-ignore
    it('accepts PDF and image payment proofs', () => {
        expect(
            assertFilePolicy('payment-proof', pdf, 'application/pdf').mime,
        ).toBe('application/pdf');
        expect(
            assertFilePolicy('payment-proof', jpeg, 'image/jpeg').mime,
        ).toBe('image/jpeg');
    });

    it('accepts safe service-request attachments and rejects media', () => {
        expect(
            assertFilePolicy('service-attachment', pdf, 'application/pdf').mime,
        ).toBe('application/pdf');
        expect(() =>
            assertFilePolicy(
                'service-attachment',
                Buffer.from('OggScontent'),
                'audio/ogg',
            ),
        ).toThrow();
    });

    it('strictly validates order invoices by signature, MIME, and extension', () => {
        expect(
            assertFilePolicy(
                'order-invoice',
                pdf,
                'application/pdf',
                false,
                'invoice.pdf',
            ).mime,
        ).toBe('application/pdf');
        expect(
            assertFilePolicy(
                'order-invoice',
                pdf,
                'application/octet-stream',
                false,
                'invoice.pdf',
            ).mime,
        ).toBe('application/pdf');
        expect(() =>
            assertFilePolicy(
                'order-invoice',
                Buffer.from('not a pdf'),
                'application/pdf',
                false,
                'invoice.pdf',
            ),
        ).toThrow();
        expect(() =>
            assertFilePolicy(
                'order-invoice',
                pdf,
                'application/pdf',
                false,
                'invoice.jpg',
            ),
        ).toThrow();
    });

    it.each([
        [pdf, 'application/pdf', 'proof.pdf'],
        [jpeg, 'image/jpeg', 'proof.jpeg'],
        [png, 'image/png', 'proof.png'],
        [webp, 'image/webp', 'proof.webp'],
    ])(
        'accepts supported order payment proof content %#',
        (buffer, mimeType, originalName) => {
            expect(
                assertFilePolicy(
                    'order-payment-proof',
                    buffer,
                    mimeType,
                    false,
                    originalName,
                ).mime,
            ).toBe(mimeType);
        },
    );

    it('rejects mismatched order payment proof declarations', () => {
        expect(() =>
            assertFilePolicy(
                'order-payment-proof',
                jpeg,
                'image/png',
                false,
                'proof.png',
            ),
        ).toThrow();
        expect(() =>
            assertFilePolicy(
                'order-payment-proof',
                jpeg,
                'image/jpeg',
                false,
                'proof.pdf',
            ),
        ).toThrow();
    });
});
