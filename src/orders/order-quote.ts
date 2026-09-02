import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CatalogVatRate } from 'src/catalog/catalog.types';
import type { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import type { OrderLineEntity } from './entities/order-line.entity';
import {
    ORDER_MONEY_MAX_MINOR,
    type OrderQuoteStatus,
    type OrderStatus,
} from './order.types';

export interface QuoteCalculationLine {
    quantity: number;
    catalogUnitPriceMinor: string | null;
    quotedUnitPriceMinor: string | null;
}

export interface QuoteLineSnapshot extends QuoteCalculationLine {
    productId: number;
    sourceOrderLineId: number | null;
    position: number;
    skuSnapshot: string;
    slugSnapshot: string;
    nameSnapshot: string;
    brandSnapshot: string | null;
    vatRateSnapshot: CatalogVatRate;
    catalogLineTotalMinor: string | null;
    quotedLineTotalMinor: string | null;
}

export interface QuoteTotals {
    catalogPricedSubtotalMinor: string;
    quotedPricedSubtotalMinor: string;
    hasUnpricedItems: boolean;
    quotedTotalMinor: string | null;
}

export function canAssignOrder(status: OrderStatus) {
    return [
        'submitted',
        'in_review',
        'confirmed',
        'waiting_payment',
        'paid',
        'fulfilled',
    ].includes(status);
}

export function canStartOrderReview(status: OrderStatus) {
    return status === 'submitted' || status === 'in_review';
}

export function canUpdateOrderQuote(
    orderStatus: OrderStatus,
    quoteStatus: OrderQuoteStatus,
) {
    return orderStatus === 'in_review' && quoteStatus === 'draft';
}

export function canConfirmOrder(
    orderStatus: OrderStatus,
    quoteStatus: OrderQuoteStatus,
) {
    return orderStatus === 'in_review' && quoteStatus === 'draft';
}

export function assertExpectedOrderVersion(current: number, expected: number) {
    if (current !== expected) {
        throw new ConflictException('Order version is stale');
    }
}

export function nextQuoteRevision(current: number) {
    if (!Number.isInteger(current) || current < 1) {
        throw new ConflictException('Order quote revision is invalid');
    }
    return current + 1;
}

export function normalizeQuotedPrice(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') {
        throw new BadRequestException(
            'Quoted unit price must be a decimal string or null',
        );
    }
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
        throw new BadRequestException(
            'Quoted unit price must be a decimal string or null',
        );
    }
    const amount = BigInt(normalized);
    assertMoney(amount);
    return amount.toString();
}

export function multiplyOrderMoney(amount: string, quantity: number): string {
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new BadRequestException('Quote quantity is invalid');
    }
    const total = BigInt(amount) * BigInt(quantity);
    assertMoney(total);
    return total.toString();
}

export function calculateQuoteTotals(
    lines: readonly QuoteCalculationLine[],
): QuoteTotals {
    let catalogSubtotal = 0n;
    let quotedSubtotal = 0n;
    let hasUnpricedItems = false;

    for (const line of lines) {
        if (line.catalogUnitPriceMinor !== null) {
            catalogSubtotal = addMoney(
                catalogSubtotal,
                BigInt(
                    multiplyOrderMoney(
                        line.catalogUnitPriceMinor,
                        line.quantity,
                    ),
                ),
            );
        }
        if (line.quotedUnitPriceMinor === null) {
            hasUnpricedItems = true;
        } else {
            quotedSubtotal = addMoney(
                quotedSubtotal,
                BigInt(
                    multiplyOrderMoney(
                        line.quotedUnitPriceMinor,
                        line.quantity,
                    ),
                ),
            );
        }
    }

    return {
        catalogPricedSubtotalMinor: catalogSubtotal.toString(),
        quotedPricedSubtotalMinor: quotedSubtotal.toString(),
        hasUnpricedItems,
        quotedTotalMinor: hasUnpricedItems ? null : quotedSubtotal.toString(),
    };
}

export function initialQuoteLine(
    line: OrderLineEntity,
    position = line.position,
): QuoteLineSnapshot {
    return buildSnapshot({
        productId: line.productId,
        sourceOrderLineId: line.id,
        position,
        skuSnapshot: line.skuSnapshot,
        slugSnapshot: line.slugSnapshot,
        nameSnapshot: line.nameSnapshot,
        brandSnapshot: line.brandSnapshot,
        catalogUnitPriceMinor: line.catalogUnitPriceMinor,
        quotedUnitPriceMinor: line.catalogUnitPriceMinor,
        vatRateSnapshot: line.vatRateSnapshot,
        quantity: line.quantity,
    });
}

export function quoteLineFromOriginal(
    source: OrderLineEntity,
    position: number,
    quantity: number,
    quotedUnitPriceMinor: string | null,
): QuoteLineSnapshot {
    return buildSnapshot({
        productId: source.productId,
        sourceOrderLineId: source.id,
        position,
        skuSnapshot: source.skuSnapshot,
        slugSnapshot: source.slugSnapshot,
        nameSnapshot: source.nameSnapshot,
        brandSnapshot: source.brandSnapshot,
        catalogUnitPriceMinor: source.catalogUnitPriceMinor,
        quotedUnitPriceMinor,
        vatRateSnapshot: source.vatRateSnapshot,
        quantity,
    });
}

export function quoteLineFromProduct(
    product: CatalogProductEntity,
    position: number,
    quantity: number,
    quotedUnitPriceMinor: string | null,
): QuoteLineSnapshot {
    return buildSnapshot({
        productId: product.id,
        sourceOrderLineId: null,
        position,
        skuSnapshot: product.sku,
        slugSnapshot: product.slug,
        nameSnapshot: product.name,
        brandSnapshot: product.brand,
        catalogUnitPriceMinor:
            product.displayPriceMinor === null
                ? null
                : String(product.displayPriceMinor),
        quotedUnitPriceMinor,
        vatRateSnapshot: product.vatRate,
        quantity,
    });
}

function buildSnapshot(
    input: Omit<
        QuoteLineSnapshot,
        'catalogLineTotalMinor' | 'quotedLineTotalMinor'
    >,
): QuoteLineSnapshot {
    return {
        ...input,
        catalogLineTotalMinor:
            input.catalogUnitPriceMinor === null
                ? null
                : multiplyOrderMoney(
                      input.catalogUnitPriceMinor,
                      input.quantity,
                  ),
        quotedLineTotalMinor:
            input.quotedUnitPriceMinor === null
                ? null
                : multiplyOrderMoney(
                      input.quotedUnitPriceMinor,
                      input.quantity,
                  ),
    };
}

function addMoney(left: bigint, right: bigint) {
    const total = left + right;
    assertMoney(total);
    return total;
}

function assertMoney(value: bigint) {
    if (value < 0n || value > ORDER_MONEY_MAX_MINOR) {
        throw new BadRequestException('Order money amount is out of range');
    }
}
