import { ConflictException } from '@nestjs/common';

export const CATALOG_ID_MAX = 2_147_483_647;
export const CATALOG_TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isCatalogPathId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        /^[1-9][0-9]{0,9}$/.test(value) &&
        (value.length < 10 || value <= String(CATALOG_ID_MAX))
    );
}

export function assertCatalogSnapshot(current: Date, expected?: string) {
    if (expected !== undefined && current.toISOString() !== expected) {
        throw new ConflictException(
            'Catalog snapshot changed; reload before retrying',
        );
    }
}

// JS/JSON timestamps have millisecond precision, unlike PostgreSQL timestamps.
// Always advance even for same-tick or aliases-only writes.
export function nextCatalogTimestamp(previous: Date) {
    return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

export function catalogProductActions(
    product: {
        isActive: boolean;
        isPublished: boolean;
        name: string;
        sku: string;
        slug: string;
    },
    category: { isPublished: boolean },
    canManage: boolean,
) {
    const decision = (reason?: string) => ({
        allowed: !reason,
        ...(reason ? { reason } : {}),
    });
    const permission = canManage ? undefined : 'permission';
    const readiness = !product.isActive
        ? 'inactive'
        : !category.isPublished
          ? 'category_hidden'
          : !product.name || !product.sku || !product.slug
            ? 'incomplete'
            : undefined;
    return {
        edit: decision(permission),
        publish: decision(
            permission ||
                readiness ||
                (product.isPublished ? 'already_published' : undefined),
        ),
        unpublish: decision(
            permission || (!product.isPublished ? 'already_hidden' : undefined),
        ),
        activate: decision(
            permission || (product.isActive ? 'already_active' : undefined),
        ),
        deactivate: decision(
            permission || (!product.isActive ? 'already_inactive' : undefined),
        ),
    };
}
