import { ApiError, post, upload } from '../../api';
import type { ServiceAction, ServiceDetailData } from './types';
export const conflictMessage = 'Заявка была изменена другим сотрудником';
export function formText(form: FormData, key: string) {
    const value = form.get(key);
    return typeof value === 'string' ? value.trim() : '';
}
export function commandError(error: unknown) {
    if (!(error instanceof ApiError))
        return 'Не удалось выполнить действие. Проверьте соединение и обновите заявку перед повторной попыткой.';
    if (error.status === 409) return conflictMessage;
    if (error.status === 400 || error.status === 413)
        return 'Проверьте заполненные поля, формат и размер файла. Возможно, действие больше недоступно.';
    if (error.status === 403) return 'Недостаточно прав для этого действия.';
    if (error.status === 404) return 'Заявка недоступна.';
    return 'Не удалось выполнить действие. Обновите заявку перед повторной попыткой.';
}
export function executeAction(
    id: number,
    action: ServiceAction,
    values: Record<string, unknown>,
    file?: File,
) {
    const base = `/admin/api/service-requests/${id}`;
    const expectedVersion = action.expectedVersion;
    switch (action.id) {
        case 'upload_invoice':
        case 'replace_invoice': {
            if (!file) throw new Error('Invoice is required');
            const form = new FormData();
            form.append('expectedVersion', String(expectedVersion));
            form.append('file', file);
            return upload<ServiceDetailData>(`${base}/invoice-file`, form);
        }
        case 'assign_engineer':
            return post<ServiceDetailData>(`${base}/assign-engineer`, {
                ...values,
                expectedVersion,
            });
        case 'update_operator_state':
            return post<ServiceDetailData>(`${base}/operator-state`, {
                ...values,
                expectedVersion,
            });
        case 'schedule_visit':
        case 'reschedule_visit':
            return post<ServiceDetailData>(`${base}/schedule`, {
                ...values,
                expectedVersion,
            });
        case 'send_customer_message':
        case 'add_internal_note':
            return post<ServiceDetailData>(`${base}/messages`, {
                ...values,
                visibility:
                    action.id === 'add_internal_note' ? 'internal' : 'customer',
            });
        default:
            return post<ServiceDetailData>(`${base}/transition`, {
                status: action.targetStatus,
                expectedVersion,
            });
    }
}
