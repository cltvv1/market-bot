import { BadRequestException } from '@nestjs/common';

export const ORDER_TIMESTAMP_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;
export const ORDER_TIMESTAMP_MESSAGE =
    'must be a full timestamp with an explicit timezone';
export const ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
export const ORDER_MIN_YEAR = 1;
export const ORDER_MAX_YEAR = 9999;

export const ORDER_CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const ORDER_CALENDAR_DATE_MESSAGE =
    'must be a valid calendar date in YYYY-MM-DD format';

export function isExplicitOrderTimestamp(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = ORDER_TIMESTAMP_PATTERN.exec(value);
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
        year < ORDER_MIN_YEAR ||
        year > ORDER_MAX_YEAR ||
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

export function normalizeOptionalOrderTimestamp(
    value: string | undefined,
    commandTime: Date,
    fieldName: string,
    futureToleranceMs = ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS,
) {
    if (value === undefined) return commandTime;
    if (!isExplicitOrderTimestamp(value)) {
        throw new BadRequestException(
            `${fieldName} ${ORDER_TIMESTAMP_MESSAGE}`,
        );
    }
    const parsed = new Date(value);
    if (parsed.getTime() > commandTime.getTime() + futureToleranceMs) {
        throw new BadRequestException(`${fieldName} is invalid`);
    }
    return parsed;
}

export function isExplicitOrderCalendarDate(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = ORDER_CALENDAR_DATE_PATTERN.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return (
        year >= ORDER_MIN_YEAR &&
        year <= ORDER_MAX_YEAR &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= daysInMonth(year, month)
    );
}

function daysInMonth(year: number, month: number) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
