import { BadRequestException, ConflictException } from '@nestjs/common';
import type { FilePurpose } from 'src/files/file-storage.types';
import type { OrderDocumentEntity } from './entities/order-document.entity';
import {
    ORDER_PAYMENT_FUTURE_TOLERANCE_MS,
    POSTGRES_INTEGER_MAX,
    type OrderDocumentType,
    type OrderStatus,
} from './order.types';

export const ORDER_PAYMENT_TIMESTAMP_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

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
    futureToleranceMs = ORDER_PAYMENT_FUTURE_TOLERANCE_MS,
) {
    if (value === undefined) return now;
    if (!isExplicitPaymentTimestamp(value)) {
        throw new BadRequestException(ORDER_PAYMENT_TIMESTAMP_MESSAGE);
    }
    const parsed = new Date(value);
    if (parsed.getTime() > now.getTime() + futureToleranceMs) {
        throw new BadRequestException('paymentReceivedAt is invalid');
    }
    return parsed;
}

export function isExplicitPaymentTimestamp(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = ORDER_PAYMENT_TIMESTAMP_PATTERN.exec(value);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const zone = match[8];
    const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
    const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth(year, month) ||
        hour > 23 ||
        minute > 59 ||
        second > 59 ||
        (zone !== 'Z' && (offsetHour > 23 || offsetMinute > 59))
    ) {
        return false;
    }

    return !Number.isNaN(Date.parse(value));
}

function daysInMonth(year: number, month: number) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
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
