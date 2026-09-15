export {
    CATALOG_AVAILABILITY_STATUSES,
    CATALOG_VAT_RATES,
    CATALOG_PRICE_MINOR_MAX,
    normalizeCatalogAlias,
} from '../../../../src/catalog/catalog.types';
export type {
    CatalogAvailabilityStatus,
    CatalogVatRate,
} from '../../../../src/catalog/catalog.types';
export interface Decision {
    allowed: boolean;
    reason?: string;
}
export interface CatalogCategory {
    id: number;
    parentId: number | null;
    name: string;
    slug: string;
    description: string | null;
    sortOrder: number;
    isPublished: boolean;
    oneCRef: string | null;
    createdAt: string;
    updatedAt: string;
    expectedUpdatedAt: string;
    actions: Record<'edit' | 'publish' | 'unpublish', Decision>;
}
export interface CatalogProduct {
    id: number;
    categoryId: number;
    sku: string;
    slug: string;
    name: string;
    brand: string | null;
    shortDescription: string | null;
    description: string | null;
    displayPriceMinor: number | null;
    vatRate: number;
    availabilityStatus: string;
    features: string[];
    specifications: Record<string, string>;
    packageContents: string[];
    aliases: string[];
    isActive: boolean;
    isPublished: boolean;
    isPopular: boolean;
    isNew: boolean;
    oneCRef: string | null;
    oneCSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
    category: Pick<
        CatalogCategory,
        'id' | 'name' | 'slug' | 'isPublished' | 'updatedAt'
    >;
    expectedUpdatedAt: string;
    expectedCategoryUpdatedAt: string;
    effectivePublicVisibility: boolean;
    actions: Record<
        'edit' | 'publish' | 'unpublish' | 'activate' | 'deactivate',
        Decision
    >;
}
export interface ProductList {
    items: CatalogProduct[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export const availabilityLabels: Record<string, string> = {
    in_stock: 'В наличии',
    low_stock: 'Осталось мало',
    on_request: 'По запросу',
    unavailable: 'Недоступен',
};
export const reasonLabels: Record<string, string> = {
    permission: 'Недостаточно прав',
    inactive: 'Сначала активируйте товар',
    category_hidden: 'Сначала опубликуйте категорию',
    incomplete: 'Заполните название, SKU и адрес',
    already_published: 'Товар уже опубликован',
    already_hidden: 'Товар уже скрыт',
};
