import { api, ApiError } from '../../api';
import { orderStatuses, type OrderAction } from './types';

export const ordersPath = '/sales/orders';
export function orderQueueQuery(params: URLSearchParams) {
    const query = new URLSearchParams();
    const status = params.get('status') || '';
    if (Object.hasOwn(orderStatuses, status)) query.set('status', status);
    const scope = params.get('scope');
    if (scope === 'mine' || scope === 'unassigned') query.set('scope', scope);
    const search = (params.get('search') || '').trim().slice(0, 200);
    if (search) query.set('search', search);
    const page = params.get('page') || '';
    query.set(
        'page',
        /^[1-9]\d{0,5}$/.test(page) && Number(page) <= 100000 ? page : '1',
    );
    query.set('limit', '20');
    return query;
}
export function money(minor: string | null | undefined) {
    if (minor == null || !/^\d{1,20}$/.test(minor))
        return 'Цена не согласована';
    const value = BigInt(minor);
    return `${(value / 100n).toLocaleString('ru-RU')},${String(value % 100n).padStart(2, '0')} ₽`;
}
export function priceInput(minor: string | null | undefined) {
    if (minor == null) return '';
    return `${BigInt(minor) / 100n}.${String(BigInt(minor) % 100n).padStart(2, '0')}`;
}
export function minorFromInput(value: string) {
    if (!value.trim()) return null;
    const match = /^(\d{1,18})(?:[.,](\d{1,2}))?$/.exec(value.trim());
    if (!match)
        throw new Error('Цена: рубли и не более двух знаков после запятой.');
    return (
        BigInt(match[1]) * 100n +
        BigInt((match[2] || '').padEnd(2, '0'))
    ).toString();
}
export function orderError(error: unknown) {
    if (!(error instanceof ApiError))
        return 'Не удалось получить результат операции. Обновите данные и проверьте заказ перед повтором.';
    if (error.status === 409)
        return 'Заказ изменился. Сверьте актуальные данные перед повторной отправкой.';
    if (error.status === 401) return 'Сессия завершена. Войдите снова.';
    if (error.status === 403) return 'Недостаточно прав для этого действия.';
    if (error.status === 404) return 'Заказ или документ больше недоступен.';
    if (error.status === 413)
        return 'Файл превышает допустимый размер: 15 МиБ.';
    if (error.status === 429) return 'Слишком много запросов. Повторите позже.';
    if (error.status >= 500)
        return 'Сервер не подтвердил результат. Проверьте актуальные данные заказа перед повтором.';
    return 'Проверьте поля, даты и формат файла. Изменения не приняты.';
}
const routes: Record<OrderAction, string> = {
    assign: 'assign',
    review: 'start-review',
    quote: 'quote',
    confirm: 'confirm',
    invoice: 'invoices',
    payment: 'confirm-payment',
    fulfill: 'fulfill',
    complete: 'complete',
};
export function orderCommand(
    id: number,
    action: OrderAction,
    version: number,
    values: Record<string, unknown> | FormData,
) {
    if (values instanceof FormData) {
        values.set('expectedVersion', String(version));
        return api(`/admin/api/orders/${id}/${routes[action]}`, {
            method: 'POST',
            body: values,
        });
    }
    return api(`/admin/api/orders/${id}/${routes[action]}`, {
        method: action === 'quote' ? 'PUT' : 'POST',
        body: JSON.stringify({ ...values, expectedVersion: version }),
    });
}
export function orderDocumentUrl(
    orderId: number,
    documentId: number,
    supplied: string | null,
) {
    const expected = `/admin/api/orders/${orderId}/documents/${documentId}/download`;
    return supplied === expected ? expected : null;
}
