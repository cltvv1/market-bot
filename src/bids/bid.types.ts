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

export function bidTypeToText(value: string) {
    switch (value) {
        case 'FIRMWARE_UPDATE':
            return 'Обновление прошивки'
        case 'KKT_REMOTE_WORK':
            return 'Удаленные тех. работы с ККТ'
        default:
            return 'неизвестный тип заявки';
    }
}