import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as path from 'node:path';
import {
    assertFilePolicy,
    detectMime,
    FILE_POLICIES,
} from 'src/files/file-policies';
import type { ServiceRequestEntity } from './entities/service-request.entity';

export interface PaymentProofTarget {
    requestId: number;
    expectedVersion: number;
}

export interface PaymentProofInput {
    buffer: Buffer;
    originalName?: string;
    mimeType?: string;
}

export function preparePaymentProof(
    file: PaymentProofInput,
    requestId: number,
    source: 'web' | 'telegram' | 'max',
) {
    if (file.buffer.length > FILE_POLICIES['payment-proof'].maxBytes) {
        throw new PayloadTooLargeException('Payment proof exceeds 20 MiB');
    }
    const extensions: Record<string, string> = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    const detected = detectMime(file.buffer);
    const supplied = file.originalName;
    const generated =
        source !== 'web' && !supplied && detected && extensions[detected]
            ? `payment_${requestId}.${extensions[detected]}`
            : '';
    const originalName = path.win32
        .basename(
            path.posix.basename((supplied || generated).replaceAll('\0', '')),
        )
        .trim();
    if (
        !originalName ||
        originalName.length > 255 ||
        [...originalName].some(
            (character) =>
                character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
    ) {
        throw new BadRequestException('Invalid payment proof filename');
    }
    const { mime } = assertFilePolicy(
        'payment-proof',
        file.buffer,
        file.mimeType,
        false,
        originalName,
    );
    return { buffer: file.buffer, originalName, mimeType: mime };
}

export function paymentProofWorkflow(
    request: Pick<
        ServiceRequestEntity,
        'version' | 'status' | 'invoiceStoredFileId' | 'paymentProofFileId'
    >,
) {
    const reasonCode =
        request.status !== 'waiting_payment'
            ? 'REQUEST_NOT_WAITING_PAYMENT'
            : !request.invoiceStoredFileId
              ? 'INVOICE_REQUIRED'
              : null;
    return {
        expectedVersion: request.version,
        paymentProof: {
            allowed: reasonCode === null,
            replacement: Boolean(request.paymentProofFileId),
            reasonCode,
            reason:
                reasonCode === 'REQUEST_NOT_WAITING_PAYMENT'
                    ? 'Заявка сейчас не ожидает оплаты.'
                    : reasonCode === 'INVOICE_REQUIRED'
                      ? 'Сначала оператор должен выставить счёт.'
                      : null,
        },
    };
}

export function paymentProofContentDisposition(filename: string) {
    const fallback =
        filename
            .normalize('NFKD')
            .replace(/[^\x20-\x7e]/g, '_')
            .replace(/["\\]/g, '_')
            .slice(0, 150) || 'payment-proof';
    const encoded = encodeURIComponent(filename).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
