export enum BidType {
    KKT_REMOTE_WORK = 'KKT_REMOTE_WORK',
    FIRMWARE_UPDATE = 'FIRMWARE_UPDATE',
}

export const BID_FIELDS = [
    'problemDescription',
    'contactForCall',
] as const;

export type BidField = typeof BID_FIELDS[number];

export function isBidField(value: string): value is BidField {
    return BID_FIELDS.includes(value as BidField);
}