import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
    paymentProofContentDisposition,
    paymentProofWorkflow,
    preparePaymentProof,
} from './service-request-payment-proof';

const formats = [
    ['pdf', 'application/pdf', Buffer.from('%PDF-1.4\nSynthetic\n%%EOF')],
    ['jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['png', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['webp', 'image/webp', Buffer.from('RIFF0000WEBPVP8 ')],
] as const;

describe('canonical payment proof preparation', () => {
    it.each(formats)(
        'generates provider %s names only from detected bytes',
        (extension, mimeType, buffer) => {
            for (const source of ['telegram', 'max'] as const) {
                expect(preparePaymentProof({ buffer }, 42, source)).toEqual({
                    buffer,
                    mimeType,
                    originalName: `payment_42.${extension}`,
                });
            }
            expect(() => preparePaymentProof({ buffer }, 42, 'web')).toThrow(
                BadRequestException,
            );
        },
    );
    it('preserves and sanitizes a supplied browser filename without changing its extension', () => {
        const buffer = formats[0][2];
        expect(
            preparePaymentProof(
                { buffer, originalName: 'C:\\fakepath\\Платёж.pdf' },
                1,
                'web',
            ).originalName,
        ).toBe('Платёж.pdf');
        expect(() =>
            preparePaymentProof(
                { buffer, originalName: 'payment.jpg' },
                1,
                'max',
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            preparePaymentProof(
                { buffer, originalName: 'payment.pdf.exe' },
                1,
                'web',
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            preparePaymentProof(
                { buffer, originalName: 'payment.pdf', mimeType: 'image/jpeg' },
                1,
                'web',
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            preparePaymentProof(
                { buffer, originalName: 'bad\nname.pdf' },
                1,
                'web',
            ),
        ).toThrow(BadRequestException);
    });
    it('rejects more than 20 MiB', () => {
        expect(() =>
            preparePaymentProof(
                {
                    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
                    originalName: 'proof.pdf',
                },
                1,
                'web',
            ),
        ).toThrow(PayloadTooLargeException);
    });
    it('projects only a version and safe workflow reasons', () => {
        const row = {
            version: 5,
            status: 'waiting_payment' as const,
            invoiceStoredFileId: 1,
            paymentProofFileId: null,
        };
        expect(paymentProofWorkflow(row)).toEqual({
            expectedVersion: 5,
            paymentProof: {
                allowed: true,
                replacement: false,
                reasonCode: null,
                reason: null,
            },
        });
        expect(
            paymentProofWorkflow({ ...row, paymentProofFileId: 2 }).paymentProof
                .replacement,
        ).toBe(true);
        expect(
            paymentProofWorkflow({ ...row, status: 'paid' }).paymentProof,
        ).toMatchObject({
            allowed: false,
            reasonCode: 'REQUEST_NOT_WAITING_PAYMENT',
        });
        expect(
            paymentProofWorkflow({ ...row, invoiceStoredFileId: null })
                .paymentProof,
        ).toMatchObject({ allowed: false, reasonCode: 'INVOICE_REQUIRED' });
    });
    it('uses safe ASCII and RFC5987 download names', () => {
        const header = paymentProofContentDisposition('Платёж (1).pdf');
        expect(header).toMatch(
            /^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/,
        );
        expect(header).toContain('%D0%9F');
        expect(header).not.toMatch(/[\r\n]/);
    });
});
