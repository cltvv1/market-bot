import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
    OrderCustomerType,
    OrderDeliveryType,
    OrderFinalDocumentDeliveryMethod,
    OrderFinalDocumentKind,
    OrderFulfillmentMethod,
} from './order.types';
import {
    ORDER_FINAL_DOCUMENT_DELIVERY_METHODS,
    ORDER_FINAL_DOCUMENT_KINDS,
    ORDER_FULFILLMENT_METHODS,
} from './order.types';
import {
    isExplicitOrderCalendarDate,
    normalizeOptionalOrderTimestamp,
} from './order-time';

export interface FulfillmentCommandInput {
    method: OrderFulfillmentMethod;
    fulfilledAt?: string;
    recipientName?: string | null;
    carrierName?: string | null;
    trackingNumber?: string | null;
    comment?: string | null;
}

export interface CompletionCommandInput {
    realizationNumber: string;
    realizationDate: string;
    documentDeliveryMethod: OrderFinalDocumentDeliveryMethod;
    documentKinds: OrderFinalDocumentKind[];
    documentsDeliveredAt?: string;
    comment?: string | null;
}

export function normalizeFulfillmentCommand(
    input: FulfillmentCommandInput,
    plannedDeliveryType: OrderDeliveryType,
    paymentReceivedAt: Date,
    commandTime: Date,
) {
    if (!ORDER_FULFILLMENT_METHODS.includes(input.method)) {
        throw new BadRequestException('Fulfillment method is invalid');
    }
    const fulfilledAt = normalizeOptionalOrderTimestamp(
        input.fulfilledAt,
        commandTime,
        'fulfilledAt',
    );
    if (fulfilledAt.getTime() < paymentReceivedAt.getTime()) {
        throw new ConflictException(
            'Fulfillment cannot precede payment receipt',
        );
    }

    const recipientName = optionalText(input.recipientName, 160);
    const carrierName = optionalText(input.carrierName, 160);
    const trackingNumber = optionalText(input.trackingNumber, 160);
    const comment = optionalText(input.comment, 1000);

    if (input.method === 'transport_company' && carrierName === null) {
        throw new BadRequestException('Carrier name is required');
    }
    if (
        input.method === 'service_only' &&
        (carrierName !== null || trackingNumber !== null)
    ) {
        throw new BadRequestException(
            'Carrier details are not allowed for service-only fulfillment',
        );
    }
    if (
        (input.method === 'service_only' || input.method === 'mixed') &&
        comment === null
    ) {
        throw new BadRequestException('Fulfillment comment is required');
    }
    if (
        ['pickup', 'courier', 'transport_company'].includes(input.method) &&
        input.method !== plannedDeliveryType &&
        comment === null
    ) {
        throw new BadRequestException(
            'Fulfillment comment is required when delivery method changes',
        );
    }

    return {
        method: input.method,
        fulfilledAt,
        recipientName,
        carrierName,
        trackingNumber,
        comment,
    };
}

export function normalizeCompletionCommand(
    input: CompletionCommandInput,
    customerType: OrderCustomerType,
    fulfilledAt: Date,
    commandTime: Date,
) {
    const realizationNumber = requiredText(input.realizationNumber, 100);
    if (!hasNoOrderControlCharacters(realizationNumber)) {
        throw new BadRequestException('Realization number is invalid');
    }
    if (!isExplicitOrderCalendarDate(input.realizationDate)) {
        throw new BadRequestException('Realization date is invalid');
    }
    if (
        !ORDER_FINAL_DOCUMENT_DELIVERY_METHODS.includes(
            input.documentDeliveryMethod,
        )
    ) {
        throw new BadRequestException(
            'Final document delivery method is invalid',
        );
    }
    if (!Array.isArray(input.documentKinds)) {
        throw new BadRequestException('Final document kinds are invalid');
    }
    if (input.documentKinds.length > ORDER_FINAL_DOCUMENT_KINDS.length) {
        throw new BadRequestException('Final document kinds are invalid');
    }
    const uniqueKinds = new Set(input.documentKinds);
    if (
        uniqueKinds.size !== input.documentKinds.length ||
        [...uniqueKinds].some(
            (kind) => !ORDER_FINAL_DOCUMENT_KINDS.includes(kind),
        )
    ) {
        throw new BadRequestException('Final document kinds are invalid');
    }
    const documentKinds = ORDER_FINAL_DOCUMENT_KINDS.filter((kind) =>
        uniqueKinds.has(kind),
    );
    const comment = optionalText(input.comment, 1000);

    let documentsDeliveredAt: Date | null;
    if (input.documentDeliveryMethod === 'not_required') {
        if (customerType !== 'individual') {
            throw new ConflictException(
                'Final documents are required for organization orders',
            );
        }
        if (
            documentKinds.length ||
            input.documentsDeliveredAt !== undefined ||
            comment === null
        ) {
            throw new BadRequestException(
                'Final document details are invalid for not-required delivery',
            );
        }
        documentsDeliveredAt = null;
    } else {
        if (!documentKinds.length) {
            throw new BadRequestException(
                'At least one final document kind is required',
            );
        }
        documentsDeliveredAt = normalizeOptionalOrderTimestamp(
            input.documentsDeliveredAt,
            commandTime,
            'documentsDeliveredAt',
        );
        if (documentsDeliveredAt.getTime() < fulfilledAt.getTime()) {
            throw new ConflictException(
                'Final documents cannot precede fulfillment',
            );
        }
    }
    if (documentKinds.includes('other') && comment === null) {
        throw new BadRequestException(
            'Completion comment is required for other documents',
        );
    }

    return {
        realizationNumber,
        realizationDate: input.realizationDate,
        documentDeliveryMethod: input.documentDeliveryMethod,
        documentKinds,
        documentsDeliveredAt,
        comment,
    };
}

function optionalText(value: string | null | undefined, maxLength: number) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
        throw new BadRequestException('Text value is invalid');
    }
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) {
        throw new BadRequestException('Text value is too long');
    }
    return normalized;
}

function requiredText(value: string, maxLength: number) {
    const normalized = optionalText(value, maxLength);
    if (normalized === null) {
        throw new BadRequestException('Required text value is missing');
    }
    return normalized;
}

export function hasNoOrderControlCharacters(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    return [...value].every((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
    });
}
