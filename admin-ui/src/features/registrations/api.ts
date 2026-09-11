import { ApiError, post } from '../../api';
import type { ActionSelection, RegistrationDetailData } from './types';

export const registrationQueuePath = '/requests/registrations';
export function registrationQuery(params: URLSearchParams) {
    const query = new URLSearchParams();
    for (const key of [
        'status',
        'platform',
        'priority',
        'readiness',
        'page',
        'limit',
    ]) {
        const value = params.get(key);
        if (value)
            query.set(
                key,
                key === 'status' && value === 'closed' ? 'processed' : value,
            );
    }
    return query;
}
export function registrationCommand(
    id: number,
    selection: ActionSelection,
    values: Record<string, unknown>,
) {
    const action = selection.action;
    const suffix =
        action.id === 'remove-evidence'
            ? `evidence/${selection.evidenceId}/remove`
            : action.id;
    return post<RegistrationDetailData>(
        `/admin/api/registrations/${id}/${suffix}`,
        {
            ...values,
            ...(selection.requirement
                ? { kind: selection.requirement.kind }
                : {}),
            precondition: action.precondition,
        },
    );
}
export function registrationError(error: unknown) {
    const status = error instanceof ApiError ? error.status : 0;
    if (status === 409)
        return 'Данные регистрации изменились. Сверьте обновлённую карточку перед повтором действия.';
    if (status === 400)
        return 'Проверьте заполненные поля. Возможно, выбранное действие уже недоступно.';
    if (status === 401) return 'Сессия завершена. Войдите снова.';
    if (status === 403 || status === 404)
        return 'Регистрация или действие больше недоступны.';
    return 'Результат действия неизвестен. Обновите карточку и проверьте историю, прежде чем повторять.';
}
export async function downloadRegistrationFile(url: string, name: string) {
    if (
        !/^\/admin\/api\/(registrations\/[1-9]\d*\/pdf|registration-evidence\/[1-9]\d*\/file)$/.test(
            url,
        )
    )
        throw new Error('Invalid document path');
    const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
    });
    if (!response.ok) {
        if (response.status === 401)
            window.dispatchEvent(new Event('vitma:unauthorized'));
        if (response.status === 403)
            window.dispatchEvent(new Event('vitma:forbidden'));
        throw new ApiError('Document unavailable', response.status);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
