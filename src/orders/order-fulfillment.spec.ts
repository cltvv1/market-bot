import { BadRequestException, ConflictException } from '@nestjs/common';
import {
    normalizeCompletionCommand,
    normalizeFulfillmentCommand,
} from './order-fulfillment';

describe('order fulfillment and completion rules', () => {
    const commandTime = new Date('2026-08-28T06:00:00.000Z');
    const paymentReceivedAt = new Date('2026-08-28T05:00:00.000Z');

    it('normalizes transport-company fulfillment and keeps planned delivery immutable', () => {
        expect(
            normalizeFulfillmentCommand(
                {
                    method: 'transport_company',
                    carrierName: '  Carrier  ',
                    trackingNumber: ' T-1 ',
                },
                'transport_company',
                paymentReceivedAt,
                commandTime,
            ),
        ).toMatchObject({
            method: 'transport_company',
            fulfilledAt: commandTime,
            carrierName: 'Carrier',
            trackingNumber: 'T-1',
        });
    });

    it('requires carrier, service/mixed comments, and changed-method explanation', () => {
        expect(() =>
            normalizeFulfillmentCommand(
                { method: 'transport_company' },
                'transport_company',
                paymentReceivedAt,
                commandTime,
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            normalizeFulfillmentCommand(
                { method: 'service_only' },
                'pickup',
                paymentReceivedAt,
                commandTime,
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            normalizeFulfillmentCommand(
                { method: 'courier' },
                'pickup',
                paymentReceivedAt,
                commandTime,
            ),
        ).toThrow(BadRequestException);
    });

    it('rejects fulfillment before the absolute payment receipt instant', () => {
        expect(() =>
            normalizeFulfillmentCommand(
                {
                    method: 'pickup',
                    fulfilledAt: '2026-08-28T04:59:59Z',
                },
                'pickup',
                paymentReceivedAt,
                commandTime,
            ),
        ).toThrow(ConflictException);
    });

    it('normalizes EDO completion and deterministic document order', () => {
        expect(
            normalizeCompletionCommand(
                {
                    realizationNumber: '  РТУ-15/2026 ',
                    realizationDate: '2026-08-28',
                    documentDeliveryMethod: 'edo',
                    documentKinds: ['act', 'upd'],
                },
                'organization',
                commandTime,
                commandTime,
            ),
        ).toMatchObject({
            realizationNumber: 'РТУ-15/2026',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo',
            documentKinds: ['upd', 'act'],
            documentsDeliveredAt: commandTime,
        });
    });

    it('allows not-required only for individuals with a reason and no documents', () => {
        expect(
            normalizeCompletionCommand(
                {
                    realizationNumber: '0000-000123',
                    realizationDate: '2026-08-28',
                    documentDeliveryMethod: 'not_required',
                    documentKinds: [],
                    comment: 'Documents are not applicable',
                },
                'individual',
                commandTime,
                commandTime,
            ).documentsDeliveredAt,
        ).toBeNull();
        expect(() =>
            normalizeCompletionCommand(
                {
                    realizationNumber: '0000-000123',
                    realizationDate: '2026-08-28',
                    documentDeliveryMethod: 'not_required',
                    documentKinds: [],
                    comment: 'Not applicable',
                },
                'organization',
                commandTime,
                commandTime,
            ),
        ).toThrow(ConflictException);
    });

    it('rejects duplicates, other without comment, and delivery before fulfillment', () => {
        const base = {
            realizationNumber: '0000-000123',
            realizationDate: '2026-08-28',
            documentDeliveryMethod: 'edo' as const,
        };
        expect(() =>
            normalizeCompletionCommand(
                { ...base, documentKinds: ['upd', 'upd'] },
                'organization',
                commandTime,
                commandTime,
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            normalizeCompletionCommand(
                { ...base, documentKinds: ['other'] },
                'organization',
                commandTime,
                commandTime,
            ),
        ).toThrow(BadRequestException);
        expect(() =>
            normalizeCompletionCommand(
                {
                    ...base,
                    documentKinds: ['upd'],
                    documentsDeliveredAt: '2026-08-28T05:59:59Z',
                },
                'organization',
                commandTime,
                commandTime,
            ),
        ).toThrow(ConflictException);
    });
});
