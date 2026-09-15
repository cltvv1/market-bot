import { api, ApiError } from '../../api';
import {
    CATALOG_AVAILABILITY_STATUSES,
    CATALOG_PRICE_MINOR_MAX,
    normalizeCatalogAlias,
} from './types';
import type { CatalogProduct, CatalogCategory, ProductList } from './types';

export const catalogRoot = '/admin/api/catalog';
export const productsPath = '/catalog/products';
export const categoriesPath = '/catalog/categories';
export const validId = (value: string) =>
    /^[1-9]\d{0,9}$/.test(value) &&
    (value.length < 10 || value <= '2147483647');
export function queueQuery(params: URLSearchParams) {
    const query = new URLSearchParams();
    const search = (params.get('search') || '').trim().slice(0, 100);
    if (search) query.set('search', search);
    const category = params.get('category') || '';
    if (category.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category))
        query.set('category', category);
    const availability = params.get('availability') || '';
    if (CATALOG_AVAILABILITY_STATUSES.some((item) => item === availability))
        query.set('availability', availability);
    for (const [key, allowed] of [
        ['active', ['active', 'inactive']],
        ['publication', ['published', 'unpublished']],
    ] as const) {
        const value = params.get(key) || '';
        if (allowed.some((item) => item === value)) query.set(key, value);
    }
    const page = params.get('page') || '';
    query.set('page', validId(page) ? page : '1');
    query.set('limit', '20');
    return query;
}
export function priceToMinor(text: string): number | null {
    if (!text.trim()) return null;
    const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(text.trim());
    if (!match)
        throw new Error('Цена: рубли и не более двух знаков после запятой.');
    const value =
        BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
    if (value > BigInt(CATALOG_PRICE_MINOR_MAX))
        throw new Error('Цена не должна превышать 21 474 836,47 ₽.');
    return Number(value);
}
export const priceInput = (minor: number | null) =>
    minor === null
        ? ''
        : `${BigInt(minor) / 100n}.${String(BigInt(minor) % 100n).padStart(2, '0')}`;
export const priceLabel = (minor: number | null) =>
    minor === null
        ? 'По запросу'
        : `${(BigInt(minor) / 100n).toLocaleString('ru-RU')},${String(BigInt(minor) % 100n).padStart(2, '0')} ₽`;
export function catalogError(error: unknown) {
    if (!(error instanceof ApiError) || error.status >= 500)
        return 'Результат операции неизвестен. Перечитайте запись и сверьте изменения перед повтором.';
    if (error.status === 409) {
        const messages: Record<string, string> = {
            'Catalog product SKU already exists': 'Этот SKU уже занят.',
            'Catalog product slug already exists':
                'Этот адрес товара уже занят.',
            'Catalog category slug already exists':
                'Этот адрес категории уже занят.',
            'Duplicate normalized catalog alias':
                'Поисковые названия повторяются после нормализации.',
            'A category cannot be its own parent':
                'Категория не может быть собственным родителем.',
            'Category hierarchy cycle detected':
                'Такая связь создаёт цикл категорий.',
            'Product category must be published first':
                'Сначала опубликуйте категорию.',
            'Inactive product cannot be published':
                'Неактивный товар нельзя опубликовать.',
        };
        return (
            messages[error.message] ||
            'Запись изменилась. Сверьте актуальные данные перед повторной отправкой.'
        );
    }
    if (error.status === 401) return 'Сессия завершена. Войдите снова.';
    if (error.status === 403) return 'Недостаточно прав для этого действия.';
    if (error.status === 404) return 'Товар или категория недоступны.';
    return 'Проверьте поля: изменения не приняты.';
}
export function validateLists(
    aliases: string[],
    specs: Array<[string, string]>,
) {
    const normalized = aliases.map(normalizeCatalogAlias);
    if (normalized.some((value) => !value || value.length > 160))
        throw new Error(
            'Поисковое название должно содержать буквы или цифры и не превышать 160 символов.',
        );
    if (new Set(normalized).size !== normalized.length)
        throw new Error('Поисковые названия повторяются после нормализации.');
    if (specs.some(([key]) => !key.length))
        throw new Error('Укажите название каждой характеристики.');
    if (new Set(specs.map(([key]) => key)).size !== specs.length)
        throw new Error('Названия характеристик не должны повторяться.');
}
export function productCommand(
    snapshot: CatalogProduct,
    action: 'publish' | 'unpublish',
) {
    return api<CatalogProduct>(
        `${catalogRoot}/products/${snapshot.id}/${action}`,
        {
            method: 'POST',
            body: JSON.stringify({
                expectedUpdatedAt: snapshot.expectedUpdatedAt,
                expectedCategoryUpdatedAt: snapshot.expectedCategoryUpdatedAt,
            }),
        },
    );
}
export function categoryCommand(
    snapshot: CatalogCategory,
    action: 'publish' | 'unpublish',
) {
    return api<CatalogCategory>(
        `${catalogRoot}/categories/${snapshot.id}/${action}`,
        {
            method: 'POST',
            body: JSON.stringify({
                expectedUpdatedAt: snapshot.expectedUpdatedAt,
            }),
        },
    );
}
export async function findCreatedProduct(sku: string, slug: string) {
    const list = await api<ProductList>(
        `${catalogRoot}/products?${new URLSearchParams({ sku, limit: '1' })}`,
    );
    return list.items.find((item) => item.slug === slug) ?? null;
}
