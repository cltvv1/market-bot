import {
    checkSession,
    ClientApiError,
    failed,
    send,
} from '../../api/client-session';
import type { OrganizationMembership } from '../../types';
import type {
    Category,
    OrderDetail,
    OrderSubmission,
    OrderSummary,
    Page,
    Product,
} from './types';
export { beginNewSession, ClientApiError } from '../../api/client-session';
export function storeError(error: unknown) {
    if (!(error instanceof ClientApiError))
        return 'Не удалось выполнить запрос. Повторите проверку.';
    const messages: Record<number, string> = {
        400: 'Проверьте поля, параметры запроса и формат файла.',
        401: 'Эта сессия браузера больше недоступна. Новая сессия не восстановит прежние заказы.',
        403: 'Действие недоступно в этой сессии.',
        404: 'Товар, заказ или документ недоступен.',
        409: 'Данные изменились. Проверьте актуальное состояние перед повтором.',
        413: 'Размер файла превышает 20 МиБ.',
        429: 'Слишком много запросов. Подождите перед повтором.',
    };
    return (
        messages[error.status] ??
        'Не удалось подтвердить результат запроса. Проверьте состояние перед повтором.'
    );
}
export function storeId(value: string | undefined) {
    if (
        !value ||
        !/^[1-9][0-9]{0,9}$/.test(value) ||
        (value.length === 10 && value > '2147483647')
    )
        throw new ClientApiError(400, 'VALIDATION_ERROR');
    return Number(value);
}
async function owner<T>(url: string, signal?: AbortSignal) {
    await checkSession(signal);
    return send<T>(url, { signal });
}
export const storeApi = {
    categories: (signal?: AbortSignal) =>
        send<Category[]>('/api/catalog/categories', { signal }, false),
    products: (query: string, signal?: AbortSignal) =>
        send<Page<Product>>(
            `/api/catalog/products?${query}`,
            { signal },
            false,
        ),
    product: (slug: string, signal?: AbortSignal) =>
        send<Product>(
            `/api/catalog/products/${encodeURIComponent(slug)}`,
            { signal },
            false,
        ),
    resolve: (ids: number[], signal?: AbortSignal) =>
        ids.length
            ? send<{ items: Product[] }>(
                  '/api/catalog/products/resolve',
                  {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ids }),
                      signal,
                  },
                  false,
              )
            : Promise.resolve({ items: [] as Product[] }),
    organizations: (signal?: AbortSignal) =>
        owner<OrganizationMembership[]>('/api/client/organizations', signal),
    orders: (query: string, signal?: AbortSignal) =>
        owner<Page<OrderSummary>>(`/api/client/orders?${query}`, signal),
    order: (id: number, signal?: AbortSignal) =>
        owner<OrderDetail>(`/api/client/orders/${id}`, signal),
    submit: (payload: OrderSubmission, key: string) =>
        send<OrderDetail>('/api/client/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': key,
            },
            body: JSON.stringify(payload),
        }),
    proof: (id: number, expectedVersion: number, file: File) => {
        const body = new FormData();
        body.append('file', file);
        body.append('expectedVersion', String(expectedVersion));
        return send<OrderDetail>(`/api/client/orders/${id}/payment-proofs`, {
            method: 'POST',
            body,
        });
    },
};
export async function downloadOrderDocument(url: string, name: string) {
    const target = new URL(url, window.location.origin);
    const match =
        /^\/api\/client\/orders\/([1-9]\d*)\/documents\/([1-9]\d*)\/download$/.exec(
            target.pathname,
        );
    if (
        target.origin !== window.location.origin ||
        target.search ||
        target.hash ||
        !match
    )
        throw new ClientApiError(400, 'INVALID_DOWNLOAD');
    storeId(match[1]);
    storeId(match[2]);
    let response: Response;
    try {
        response = await fetch(target, {
            credentials: 'include',
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
        });
    } catch {
        throw new ClientApiError(0, 'NETWORK_ERROR');
    }
    if (!response.ok) return failed(response, true, true);
    if (
        !(response.headers.get('content-disposition') ?? '').startsWith(
            'attachment',
        ) ||
        !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(
            (response.headers.get('content-type') ?? '').split(';')[0],
        )
    )
        throw new ClientApiError(0, 'INVALID_DOCUMENT');
    const href = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = href;
    link.download =
        Array.from(name)
            .map((c) => (c.charCodeAt(0) < 32 || '/\\'.includes(c) ? '_' : c))
            .join('')
            .slice(0, 180) || 'document';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
}
