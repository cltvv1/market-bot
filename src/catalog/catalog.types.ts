export const CATALOG_AVAILABILITY_STATUSES = [
    'in_stock',
    'low_stock',
    'on_request',
    'unavailable',
] as const;

export type CatalogAvailabilityStatus =
    (typeof CATALOG_AVAILABILITY_STATUSES)[number];

// VAT is stored as basis points: 2000 means 20%.
export const CATALOG_VAT_RATES = [0, 500, 700, 1000, 2000] as const;

export type CatalogVatRate = (typeof CATALOG_VAT_RATES)[number];

export const CATALOG_PAGE_SIZE_DEFAULT = 20;
export const CATALOG_PAGE_SIZE_MAX = 100;
export const CATALOG_PRICE_MINOR_MAX = 2_147_483_647;

export function normalizeCatalogSku(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('ru-RU');
}

export function normalizeCatalogAlias(value: string) {
    return value
        .normalize('NFKC')
        .trim()
        .toLocaleUpperCase('ru-RU')
        .replace(/Ё/g, 'Е')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}
