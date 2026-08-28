import { BadRequestException, ConflictException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import type { FilePurpose } from 'src/files/file-storage.types';
import type { OrderDocumentEntity } from './entities/order-document.entity';
import {
    ORDER_PAYMENT_FUTURE_TOLERANCE_MS,
    POSTGRES_INTEGER_MAX,
    type OrderDocumentType,
    type OrderStatus,
} from './order.types';

export function canUploadInvoice(status: OrderStatus) {
    return status === 'confirmed' || status === 'waiting_payment';
}

export function canUploadPaymentProof(status: OrderStatus) {
    return status === 'waiting_payment';
}

export function canConfirmOrderPayment(status: OrderStatus) {
    return status === 'waiting_payment';
}

export function nextOrderDocumentRevision(revisions: readonly number[]) {
    const current = revisions.length ? Math.max(...revisions) : 0;
    if (
        !Number.isInteger(current) ||
        current < 0 ||
        current >= POSTGRES_INTEGER_MAX
    ) {
        throw new ConflictException('Order document revision is invalid');
    }
    return current + 1;
}

export function selectActiveInvoice<
    T extends Pick<OrderDocumentEntity, 'type' | 'status'>,
>(documents: readonly T[]): T | null {
    const active = documents.filter(
        (document) =>
            document.type === 'invoice' && document.status === 'active',
    );
    if (active.length > 1) {
        throw new ConflictException('Order invoice state is inconsistent');
    }
    return active[0] ?? null;
}

export function normalizePaymentReceivedAt(
    value: string | undefined,
    now = new Date(),
    futureToleranceMs = ORDER_PAYMENT_FUTURE_TOLERANCE_MS,
) {
    if (value === undefined) return now;
    if (!isISO8601(value, { strict: true, strictSeparator: true })) {
        throw new BadRequestException(
            'paymentReceivedAt must be an ISO-8601 timestamp',
        );
    }
    const parsed = new Date(value);
    if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getTime() > now.getTime() + futureToleranceMs
    ) {
        throw new BadRequestException('paymentReceivedAt is invalid');
    }
    return parsed;
}

export function orderDocumentPurpose(type: OrderDocumentType): FilePurpose {
    return type === 'invoice' ? 'order-invoice' : 'order-payment-proof';
}

export function orderDocumentDownloadUrl(
    audience: 'client' | 'admin',
    orderId: number,
    documentId: number,
) {
    const prefix = audience === 'client' ? '/api/client' : '/admin/api';
    return `${prefix}/orders/${orderId}/documents/${documentId}/download`;
}

export function orderDocumentContentDisposition(filename: string) {
    const fallback =
        filename
            .normalize('NFKD')
            .replace(/[^\x20-\x7e]/g, '_')
            .replace(/["\\]/g, '_')
            .slice(0, 150) || 'download';
    const encoded = encodeURIComponent(filename).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
