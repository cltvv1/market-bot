import { BadRequestException, ConflictException } from '@nestjs/common';
import {
    canConfirmOrderPayment,
    canUploadInvoice,
    canUploadPaymentProof,
    nextOrderDocumentRevision,
    normalizePaymentReceivedAt,
    orderDocumentContentDisposition,
    orderDocumentDownloadUrl,
    orderDocumentPurpose,
    selectActiveInvoice,
} from './order-payment';

describe('order invoice and payment rules', () => {
    it('defines only the CO-3B state transitions', () => {
        expect(canUploadInvoice('confirmed')).toBe(true);
        expect(canUploadInvoice('waiting_payment')).toBe(true);
        expect(canUploadInvoice('paid')).toBe(false);
        expect(canUploadPaymentProof('waiting_payment')).toBe(true);
        expect(canUploadPaymentProof('confirmed')).toBe(false);
        expect(canConfirmOrderPayment('waiting_payment')).toBe(true);
        expect(canConfirmOrderPayment('paid')).toBe(false);
    });

    it('assigns bounded backend document revisions', () => {
        expect(nextOrderDocumentRevision([])).toBe(1);
        expect(nextOrderDocumentRevision([1, 3, 2])).toBe(4);
        expect(() => nextOrderDocumentRevision([2_147_483_647])).toThrow(
            ConflictException,
        );
    });

    it('selects exactly one current invoice', () => {
        const current = { type: 'invoice', status: 'active' } as const;
        expect(selectActiveInvoice([current])).toBe(current);
        expect(
            selectActiveInvoice([{ type: 'invoice', status: 'superseded' }]),
        ).toBeNull();
        expect(() => selectActiveInvoice([current, current])).toThrow(
            ConflictException,
        );
    });

    it('normalizes payment timestamps with a small future tolerance', () => {
        const now = new Date('2026-08-27T05:00:00.000Z');
        expect(normalizePaymentReceivedAt(undefined, now)).toBe(now);
        expect(normalizePaymentReceivedAt('2026-08-27T05:00:00Z', now)).toEqual(
            new Date('2026-08-27T05:00:00.000Z'),
        );
        expect(
            normalizePaymentReceivedAt('2026-08-27T05:00:00.000Z', now),
        ).toEqual(new Date('2026-08-27T05:00:00.000Z'));
        expect(
            normalizePaymentReceivedAt('2026-08-27T12:00:00+07:00', now),
        ).toEqual(new Date('2026-08-27T05:00:00.000Z'));
        expect(
            normalizePaymentReceivedAt('2026-08-27T05:04:59.000Z', now),
        ).toEqual(new Date('2026-08-27T05:04:59.000Z'));
    });

    it.each([
        '2026-08-27',
        '2026-08-27T05:00',
        '2026-08-27T05:00:00',
        '2026-08-27 05:00:00Z',
        '2026-02-30T05:00:00Z',
        '2026-08-27T05:00:00+25:00',
        '2026-W35-4T05:00:00Z',
        '2026-239T05:00:00Z',
        '+002026-08-27T05:00:00Z',
        'not-a-date',
        '2026-08-27T05:05:01.000Z',
    ])('rejects invalid or materially future timestamp %s', (value) => {
        expect(() =>
            normalizePaymentReceivedAt(
                value,
                new Date('2026-08-27T05:00:00.000Z'),
            ),
        ).toThrow(BadRequestException);
    });

    it('maps document types to isolated file purposes', () => {
        expect(orderDocumentPurpose('invoice')).toBe('order-invoice');
        expect(orderDocumentPurpose('payment_proof')).toBe(
            'order-payment-proof',
        );
    });

    it('builds context-bound URLs and attachment-safe filenames', () => {
        expect(orderDocumentDownloadUrl('client', 7, 9)).toBe(
            '/api/client/orders/7/documents/9/download',
        );
        expect(orderDocumentDownloadUrl('admin', 7, 9)).toBe(
            '/admin/api/orders/7/documents/9/download',
        );
        expect(orderDocumentContentDisposition('Счёт "№1".pdf')).toContain(
            `attachment; filename="_____ _No1_.pdf"; filename*=UTF-8''`,
        );
    });
});
