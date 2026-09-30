import {
    pdf as pdfFixture,
    fixture as fileFixture,
} from '../../test/fixtures/files.cjs';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
    paymentProofContentDisposition,
    paymentProofWorkflow,
    preparePaymentProof,
} from './service-request-payment-proof';

const formats = [
    ['pdf', 'application/pdf', pdfFixture('%PDF-1.4\nSynthetic\n%%EOF')],
    ['jpg', 'image/jpeg', fileFixture('image.jpg')],
    ['png', 'image/png', fileFixture('image.png')],
    ['webp', 'image/webp', fileFixture('image.webp')],
] as const;

describe('canonical payment proof preparation', () => {
    it.each(formats)(
        'generates provider %s names only from detected bytes',
        async (extension, mimeType, buffer) => {
            for (const source of ['telegram', 'max'] as const) {
                expect(
                    await preparePaymentProof({ buffer }, 42, source),
                ).toEqual({
                    buffer,
                    mimeType,
                    originalName: `payment_42.${extension}`,
                });
            }
            await expect(
                preparePaymentProof({ buffer }, 42, 'web'),
            ).rejects.toThrow(BadRequestException);
        },
    );
    it('preserves and sanitizes a supplied browser filename without changing its extension', async () => {
        const buffer = formats[0][2];
        expect(
            (
                await preparePaymentProof(
                    { buffer, originalName: 'C:\\fakepath\\Платёж.pdf' },
                    1,
                    'web',
                )
            ).originalName,
        ).toBe('Платёж.pdf');
        await expect(
            preparePaymentProof(
                { buffer, originalName: 'payment.jpg' },
                1,
                'max',
            ),
        ).rejects.toThrow(BadRequestException);
        await expect(
            preparePaymentProof(
                { buffer, originalName: 'payment.pdf.exe' },
                1,
                'web',
            ),
        ).rejects.toThrow(BadRequestException);
        await expect(
            preparePaymentProof(
                { buffer, originalName: 'payment.pdf', mimeType: 'image/jpeg' },
                1,
                'web',
            ),
        ).rejects.toThrow(BadRequestException);
        await expect(
            preparePaymentProof(
                { buffer, originalName: 'bad\nname.pdf' },
                1,
                'web',
            ),
        ).rejects.toThrow(BadRequestException);
    });
    it('rejects more than 20 MiB', async () => {
        await expect(
            preparePaymentProof(
                {
                    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
                    originalName: 'proof.pdf',
                },
                1,
                'web',
            ),
        ).rejects.toThrow(PayloadTooLargeException);
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
