import { BadRequestException } from '@nestjs/common';
import {
    isExplicitOrderCalendarDate,
    isExplicitOrderTimestamp,
    normalizeOptionalOrderTimestamp,
} from './order-time';

describe('order time contracts', () => {
    const now = new Date('2026-08-28T06:00:00.000Z');

    it.each([
        '2026-08-28T05:00:00Z',
        '2026-08-28T05:00:00.123456789Z',
        '2026-08-28T12:00:00+07:00',
    ])('accepts an explicit absolute timestamp: %s', (value) => {
        expect(isExplicitOrderTimestamp(value)).toBe(true);
    });

    it.each([
        '2026-08-28',
        '2026-08-28T05:00',
        '2026-08-28T05:00:00',
        '2026-08-28 05:00:00Z',
        '2026-02-30T05:00:00Z',
        '2026-08-28T05:00:00+25:00',
        '2026-W35-5T05:00:00Z',
        '2026-240T05:00:00Z',
        '+002026-08-28T05:00:00Z',
    ])('rejects a non-contract timestamp: %s', (value) => {
        expect(isExplicitOrderTimestamp(value)).toBe(false);
    });

    it('normalizes offsets and enforces the five-minute future tolerance', () => {
        expect(
            normalizeOptionalOrderTimestamp(
                '2026-08-28T13:00:00+07:00',
                now,
                'fulfilledAt',
            ).toISOString(),
        ).toBe('2026-08-28T06:00:00.000Z');
        expect(
            normalizeOptionalOrderTimestamp(
                '2026-08-28T06:04:59Z',
                now,
                'fulfilledAt',
            ).toISOString(),
        ).toBe('2026-08-28T06:04:59.000Z');
        expect(() =>
            normalizeOptionalOrderTimestamp(
                '2026-08-28T06:05:01Z',
                now,
                'fulfilledAt',
            ),
        ).toThrow(BadRequestException);
    });

    it.each(['2026-08-28', '2024-02-29'])(
        'accepts calendar date %s',
        (value) => {
            expect(isExplicitOrderCalendarDate(value)).toBe(true);
        },
    );

    it.each([
        '2026-02-30',
        '2026-8-28',
        '28.08.2026',
        '2026-W35-5',
        '2026-240',
    ])('rejects invalid calendar date %s', (value) => {
        expect(isExplicitOrderCalendarDate(value)).toBe(false);
    });
});
