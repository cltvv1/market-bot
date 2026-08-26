import { BadRequestException } from '@nestjs/common';
import type { SubmitOrderDto } from './dto/order.dto';
import {
    calculateCatalogTotals,
    formatOrderNumber,
    multiplyMinorUnits,
    normalizeOrderSubmission,
    orderSubmissionFingerprint,
} from './order-intake';

const normalizeInn = (value: string) => value.replace(/\D/g, '');

function individualInput(
    overrides: Partial<SubmitOrderDto> = {},
): SubmitOrderDto {
    return {
        customerType: 'individual',
        contact: {
            name: '  Иван Петров  ',
            phone: '8 (999) 123-45-67',
            email: ' USER@EXAMPLE.COM ',
        },
        delivery: { type: 'pickup' },
        comment: '  Позвонить заранее  ',
        items: [
            { productId: 20, quantity: 1 },
            { productId: 10, quantity: 2 },
        ],
        ...overrides,
    } as SubmitOrderDto;
}

describe('order intake helpers', () => {
    it('normalizes bounded customer input canonically', () => {
        const normalized = normalizeOrderSubmission(
            individualInput(),
            normalizeInn,
        );
        expect(normalized).toEqual(
            expect.objectContaining({
                customerType: 'individual',
                organizationId: null,
                organization: null,
                contact: {
                    name: 'Иван Петров',
                    phone: '+79991234567',
                    email: 'user@example.com',
                },
                comment: 'Позвонить заранее',
            }),
        );
    });

    it('keeps the fingerprint stable when item order changes', () => {
        const first = normalizeOrderSubmission(individualInput(), normalizeInn);
        const second = normalizeOrderSubmission(
            individualInput({ items: [...first.items].reverse() }),
            normalizeInn,
        );
        expect(orderSubmissionFingerprint(first)).toBe(
            orderSubmissionFingerprint(second),
        );
    });

    it('changes the fingerprint for a meaningful input change', () => {
        const first = normalizeOrderSubmission(individualInput(), normalizeInn);
        const second = normalizeOrderSubmission(
            individualInput({
                items: [
                    { productId: 20, quantity: 1 },
                    { productId: 10, quantity: 3 },
                ],
            }),
            normalizeInn,
        );
        expect(orderSubmissionFingerprint(first)).not.toBe(
            orderSubmissionFingerprint(second),
        );
    });

    it('multiplies large minor-unit values exactly with BigInt', () => {
        expect(multiplyMinorUnits('9007199254740993', 1000)).toBe(
            '9007199254740993000',
        );
    });

    it('calculates the exact priced subtotal', () => {
        expect(
            calculateCatalogTotals([
                { catalogLineTotalMinor: '6200000' },
                { catalogLineTotalMinor: '9007199254740993' },
            ]),
        ).toEqual({
            catalogPricedSubtotalMinor: '9007199260940993',
            hasUnpricedItems: false,
            catalogTotalMinor: '9007199260940993',
        });
    });

    it('does not present a final total when one line is unpriced', () => {
        expect(
            calculateCatalogTotals([
                { catalogLineTotalMinor: '6200000' },
                { catalogLineTotalMinor: null },
            ]),
        ).toEqual({
            catalogPricedSubtotalMinor: '6200000',
            hasUnpricedItems: true,
            catalogTotalMinor: null,
        });
    });

    it('formats a stable public order number from the immutable id', () => {
        expect(formatOrderNumber(1)).toBe('VM-00000001');
        expect(formatOrderNumber(123456789)).toBe('VM-123456789');
    });

    it('rejects organization data for an individual customer', () => {
        expect(() =>
            normalizeOrderSubmission(
                individualInput({ organizationId: 10 }),
                normalizeInn,
            ),
        ).toThrow(BadRequestException);
    });

    it('requires exactly one organization mode for an organization customer', () => {
        const organization = {
            name: 'ООО Ромашка',
            inn: '2460000000',
        };
        expect(() =>
            normalizeOrderSubmission(
                individualInput({
                    customerType: 'organization',
                    organizationId: 10,
                    organization,
                }),
                normalizeInn,
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            normalizeOrderSubmission(
                individualInput({
                    customerType: 'organization',
                    organizationId: undefined,
                    organization: undefined,
                }),
                normalizeInn,
            ),
        ).toThrow(BadRequestException);
    });

    it('enforces delivery shape rules', () => {
        expect(() =>
            normalizeOrderSubmission(
                individualInput({ delivery: { type: 'courier' } }),
                normalizeInn,
            ),
        ).toThrow(BadRequestException);
        expect(
            normalizeOrderSubmission(
                individualInput({
                    delivery: {
                        type: 'courier',
                        city: 'Красноярск',
                        address: 'ул. Ленина, 1',
                    },
                }),
                normalizeInn,
            ).delivery,
        ).toEqual({
            type: 'courier',
            city: 'Красноярск',
            address: 'ул. Ленина, 1',
            comment: null,
        });
    });
});
