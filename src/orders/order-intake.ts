import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { SubmitOrderDto } from './dto/order.dto';
import type { OrderCustomerType, OrderDeliveryType } from './order.types';

export interface NormalizedOrderSubmission {
    customerType: OrderCustomerType;
    organizationId: number | null;
    organization: {
        name: string;
        inn: string;
        kpp: string | null;
        ogrn: string | null;
        legalAddress: string | null;
        actualAddress: string | null;
        taxSystem: string | null;
    } | null;
    contact: {
        name: string;
        phone: string;
        email: string | null;
    };
    delivery: {
        type: OrderDeliveryType;
        city: string | null;
        address: string | null;
        comment: string | null;
    };
    comment: string | null;
    items: Array<{ productId: number; quantity: number }>;
}

export interface LinkedOrganizationSnapshotInput {
    name: string | null;
    inn: string | null;
    kpp: string | null;
    ogrn: string | null;
    legalAddress: string | null;
    actualAddress: string | null;
    taxSystem: string | null;
}

export function normalizeOrderSubmission(
    input: SubmitOrderDto,
    normalizeInn: (value: string) => string,
): NormalizedOrderSubmission {
    const organizationId = input.organizationId ?? null;
    let organization: NormalizedOrderSubmission['organization'] = null;

    if (input.customerType === 'individual') {
        if (organizationId !== null || input.organization !== undefined) {
            throw new BadRequestException(
                'Individual orders cannot contain organization data',
            );
        }
    } else {
        if (organizationId !== null && input.organization !== undefined) {
            throw new BadRequestException(
                'Use either a linked organization or an organization snapshot',
            );
        }
        if (organizationId === null && input.organization === undefined) {
            throw new BadRequestException('Organization details are required');
        }
        if (input.organization) {
            organization = {
                name: requiredText(input.organization.name),
                inn: normalizeInn(input.organization.inn),
                kpp: nullableText(input.organization.kpp),
                ogrn: nullableText(input.organization.ogrn),
                legalAddress: nullableText(input.organization.legalAddress),
                actualAddress: nullableText(input.organization.actualAddress),
                taxSystem: nullableText(input.organization.taxSystem),
            };
        }
    }

    const delivery = {
        type: input.delivery.type,
        city: nullableText(input.delivery.city),
        address: nullableText(input.delivery.address),
        comment: nullableText(input.delivery.comment),
    };
    if (
        (delivery.type === 'courier' ||
            delivery.type === 'transport_company') &&
        !delivery.city
    ) {
        throw new BadRequestException(
            'Delivery city is required for the selected delivery type',
        );
    }
    if (delivery.type === 'courier' && !delivery.address) {
        throw new BadRequestException(
            'Delivery address is required for courier delivery',
        );
    }

    const productIds = new Set<number>();
    for (const item of input.items) {
        if (productIds.has(item.productId)) {
            throw new BadRequestException(
                'Duplicate products are not allowed in one order',
            );
        }
        productIds.add(item.productId);
    }

    return {
        customerType: input.customerType,
        organizationId,
        organization,
        contact: {
            name: requiredText(input.contact.name),
            phone: normalizePhone(input.contact.phone),
            email: nullableText(input.contact.email)?.toLowerCase() ?? null,
        },
        delivery,
        comment: nullableText(input.comment),
        items: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
        })),
    };
}

export function orderSubmissionFingerprint(input: NormalizedOrderSubmission) {
    const canonical = {
        customerType: input.customerType,
        organizationId: input.organizationId,
        organization: input.organization,
        contact: input.contact,
        delivery: input.delivery,
        comment: input.comment,
        items: [...input.items].sort(
            (left, right) => left.productId - right.productId,
        ),
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function normalizeLinkedOrganizationSnapshot(
    input: LinkedOrganizationSnapshotInput,
    normalizeInn: (value: string) => string,
): NonNullable<NormalizedOrderSubmission['organization']> {
    const name = linkedText(input.name, 300);
    if (!name) linkedOrganizationConflict();

    let inn: string;
    try {
        if (typeof input.inn !== 'string') linkedOrganizationConflict();
        inn = normalizeInn(input.inn);
    } catch {
        linkedOrganizationConflict();
    }

    const kpp = linkedText(input.kpp, 9);
    const ogrn = linkedText(input.ogrn, 15);
    if (
        (kpp && !/^\d{9}$/.test(kpp)) ||
        (ogrn && !/^(\d{13}|\d{15})$/.test(ogrn))
    ) {
        linkedOrganizationConflict();
    }

    return {
        name,
        inn,
        kpp,
        ogrn,
        legalAddress: linkedText(input.legalAddress, 500),
        actualAddress: linkedText(input.actualAddress, 500),
        taxSystem: linkedText(input.taxSystem, 100),
    };
}

export function orderAdvisoryLockKey(userId: number, idempotencyKey: string) {
    return createHash('sha256')
        .update(`${userId}:${idempotencyKey}`)
        .digest()
        .readBigInt64BE()
        .toString();
}

export function formatOrderNumber(id: number) {
    return `VM-${String(id).padStart(8, '0')}`;
}

export function multiplyMinorUnits(unitPriceMinor: string, quantity: number) {
    return (BigInt(unitPriceMinor) * BigInt(quantity)).toString();
}

export function calculateCatalogTotals(
    lines: Array<{ catalogLineTotalMinor: string | null }>,
) {
    let subtotal = 0n;
    let hasUnpricedItems = false;
    for (const line of lines) {
        if (line.catalogLineTotalMinor === null) {
            hasUnpricedItems = true;
        } else {
            subtotal += BigInt(line.catalogLineTotalMinor);
        }
    }
    return {
        catalogPricedSubtotalMinor: subtotal.toString(),
        hasUnpricedItems,
        catalogTotalMinor: hasUnpricedItems ? null : subtotal.toString(),
    };
}

function requiredText(value: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException('Text value is required');
    return normalized;
}

function nullableText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
}

function normalizePhone(value: string) {
    const trimmed = value.trim();
    let digits = trimmed.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) {
        digits = `7${digits.slice(1)}`;
    } else if (digits.length === 10) {
        digits = `7${digits}`;
    }
    if (digits.length < 5 || digits.length > 15) {
        throw new BadRequestException('Contact phone is invalid');
    }
    return `+${digits}`;
}

function linkedText(value: string | null, maxLength: number) {
    if (value === null) return null;
    if (typeof value !== 'string') linkedOrganizationConflict();
    const normalized = value.trim();
    if (normalized.length > maxLength) linkedOrganizationConflict();
    return normalized || null;
}

function linkedOrganizationConflict(): never {
    throw new ConflictException(
        'Linked organization has incomplete or unsupported details',
    );
}
