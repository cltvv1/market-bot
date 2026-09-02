import { ConflictException } from '@nestjs/common';
import type { FilePurpose } from 'src/files/file-storage.types';
import type { OrderDocumentEntity } from './entities/order-document.entity';
import {
    POSTGRES_INTEGER_MAX,
    type OrderDocumentType,
    type OrderStatus,
} from './order.types';
import {
    isExplicitOrderTimestamp,
    normalizeOptionalOrderTimestamp,
    ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS,
    ORDER_TIMESTAMP_PATTERN,
} from './order-time';

export const ORDER_PAYMENT_TIMESTAMP_PATTERN = ORDER_TIMESTAMP_PATTERN;

export const ORDER_PAYMENT_TIMESTAMP_MESSAGE =
    'paymentReceivedAt must be a full timestamp with an explicit timezone';

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
    futureToleranceMs = ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS,
) {
    return normalizeOptionalOrderTimestamp(
        value,
        now,
        'paymentReceivedAt',
        futureToleranceMs,
    );
}

export function isExplicitPaymentTimestamp(value: unknown): value is string {
    return isExplicitOrderTimestamp(value);
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
