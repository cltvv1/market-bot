import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CatalogProductEntity } from 'src/catalog/entities/catalog-product.entity';
import type { OrderLineEntity } from './entities/order-line.entity';
import {
    assertExpectedOrderVersion,
    calculateQuoteTotals,
    canAssignOrder,
    canConfirmOrder,
    canStartOrderReview,
    canUpdateOrderQuote,
    initialQuoteLine,
    multiplyOrderMoney,
    nextQuoteRevision,
    normalizeQuotedPrice,
    quoteLineFromOriginal,
    quoteLineFromProduct,
} from './order-quote';
import { ORDER_MONEY_MAX_MINOR_TEXT } from './order.types';

const originalLine = {
    id: 11,
    productId: 21,
    position: 0,
    skuSnapshot: 'KKT-01',
    slugSnapshot: 'kkt-01',
    nameSnapshot: 'Касса из заказа',
    brandSnapshot: 'АТОЛ',
    catalogUnitPriceMinor: '3100000',
    vatRateSnapshot: 2000,
    quantity: 2,
    catalogLineTotalMinor: '6200000',
} as OrderLineEntity;

describe('CO-3A order quote helpers', () => {
    it.each([
        ['0', '0'],
        [' 42 ', '42'],
        ['00042', '42'],
        [ORDER_MONEY_MAX_MINOR_TEXT, ORDER_MONEY_MAX_MINOR_TEXT],
        [null, null],
    ])('normalizes a quoted minor-unit price %p', (input, expected) => {
        expect(normalizeQuotedPrice(input)).toBe(expected);
    });

    it.each(['-1', '+1', '1.2', '1e3', '', '   '])(
        'rejects malformed quoted price %p',
        (input) => {
            expect(() => normalizeQuotedPrice(input)).toThrow(
                BadRequestException,
            );
        },
    );

    it('rejects values and line totals outside numeric(20,0)', () => {
        expect(() => normalizeQuotedPrice('100000000000000000000')).toThrow(
            BadRequestException,
        );
        expect(() => multiplyOrderMoney(ORDER_MONEY_MAX_MINOR_TEXT, 2)).toThrow(
            BadRequestException,
        );
    });

    it('calculates exact quoted and catalog totals with BigInt', () => {
        expect(
            calculateQuoteTotals([
                {
                    quantity: 2,
                    catalogUnitPriceMinor: '3100000',
                    quotedUnitPriceMinor: '3000000',
                },
                {
                    quantity: 3,
                    catalogUnitPriceMinor: null,
                    quotedUnitPriceMinor: '100',
                },
            ]),
        ).toEqual({
            catalogPricedSubtotalMinor: '6200000',
            quotedPricedSubtotalMinor: '6000300',
            hasUnpricedItems: false,
            quotedTotalMinor: '6000300',
        });
    });

    it('keeps the priced subtotal but hides the total for unresolved lines', () => {
        expect(
            calculateQuoteTotals([
                {
                    quantity: 1,
                    catalogUnitPriceMinor: '500',
                    quotedUnitPriceMinor: '0',
                },
                {
                    quantity: 1,
                    catalogUnitPriceMinor: null,
                    quotedUnitPriceMinor: null,
                },
            ]),
        ).toEqual({
            catalogPricedSubtotalMinor: '500',
            quotedPricedSubtotalMinor: '0',
            hasUnpricedItems: true,
            quotedTotalMinor: null,
        });
    });

    it('builds the initial draft from the immutable order-line snapshot', () => {
        const result = initialQuoteLine(originalLine);
        expect(result).toEqual(
            expect.objectContaining({
                productId: 21,
                sourceOrderLineId: 11,
                nameSnapshot: 'Касса из заказа',
                quantity: 2,
                catalogUnitPriceMinor: '3100000',
                quotedUnitPriceMinor: '3100000',
                quotedLineTotalMinor: '6200000',
            }),
        );
    });

    it('preserves original snapshots while allowing quantity and price changes', () => {
        const result = quoteLineFromOriginal(originalLine, 3, 4, '2900000');
        expect(result).toEqual(
            expect.objectContaining({
                sourceOrderLineId: 11,
                position: 3,
                nameSnapshot: 'Касса из заказа',
                quantity: 4,
                catalogLineTotalMinor: '12400000',
                quotedLineTotalMinor: '11600000',
            }),
        );
    });

    it('uses current catalog snapshots for an added product', () => {
        const product = {
            id: 30,
            sku: 'NEW-30',
            slug: 'new-30',
            name: 'Добавленный товар',
            brand: null,
            displayPriceMinor: 900,
            vatRate: 1000,
        } as CatalogProductEntity;
        expect(quoteLineFromProduct(product, 1, 2, null)).toEqual(
            expect.objectContaining({
                productId: 30,
                sourceOrderLineId: null,
                catalogLineTotalMinor: '1800',
                quotedLineTotalMinor: null,
            }),
        );
    });

    it('defines only the CO-3A assignment and review states', () => {
        expect(canAssignOrder('submitted')).toBe(true);
        expect(canAssignOrder('in_review')).toBe(true);
        expect(canAssignOrder('confirmed')).toBe(false);
        expect(canStartOrderReview('submitted')).toBe(true);
        expect(canStartOrderReview('confirmed')).toBe(false);
    });

    it('allows quote mutation and confirmation only for an in-review draft', () => {
        expect(canUpdateOrderQuote('in_review', 'draft')).toBe(true);
        expect(canConfirmOrder('in_review', 'draft')).toBe(true);
        expect(canUpdateOrderQuote('confirmed', 'confirmed')).toBe(false);
        expect(canConfirmOrder('submitted', 'draft')).toBe(false);
    });

    it('compares expectedVersion exactly', () => {
        expect(() => assertExpectedOrderVersion(3, 3)).not.toThrow();
        expect(() => assertExpectedOrderVersion(3, 2)).toThrow(
            ConflictException,
        );
    });

    it('increments only a valid positive quote revision', () => {
        expect(nextQuoteRevision(1)).toBe(2);
        expect(() => nextQuoteRevision(0)).toThrow(ConflictException);
    });
});
