import { AlertCircle, Check, Clock3, RefreshCw } from 'lucide-react';
import { ApiError } from '../api';
import { priorityText, statusText } from '../format';
import type { Priority } from '../types';

export function ReadState({
    loading,
    error,
    retry,
}: {
    loading?: boolean;
    error?: unknown;
    retry: () => void;
}) {
    if (loading)
        return (
            <div className="admin-state" role="status">
                <div className="admin-skeleton" />
                <div className="admin-skeleton" />
                <p>Загружаем данные…</p>
            </div>
        );
    const status = error instanceof ApiError ? error.status : 0;
    return (
        <div className="admin-state" role="alert">
            <AlertCircle size={28} />
            <h2>
                {status === 403
                    ? 'Недостаточно прав'
                    : status === 401
                      ? 'Сессия завершена'
                      : status === 400 || status === 404
                        ? 'Заявка недоступна'
                        : 'Не удалось загрузить данные'}
            </h2>
            <p>
                {status === 403
                    ? 'Обратитесь к администратору за доступом к этому разделу.'
                    : status === 401
                      ? 'Войдите через обычную админку и вернитесь к заявке.'
                      : status === 400 || status === 404
                        ? 'Проверьте ссылку или вернитесь к списку.'
                        : 'Проверьте соединение и попробуйте ещё раз.'}
            </p>
            <div className="admin-actions">
                {status === 401 && (
                    <a className="admin-button" href="/admin/">
                        Войти в админку
                    </a>
                )}
                <button className="admin-button" onClick={retry}>
                    <RefreshCw size={16} />
                    Повторить
                </button>
            </div>
        </div>
    );
}
export function StatusIndicator({ status }: { status: string }) {
    const complete = ['completed', 'closed', 'paid'].includes(status);
    const tone = [
        'waiting_payment',
        'clarification_required',
        'review_required',
        'invoice_required',
    ].includes(status)
        ? 'warning'
        : status === 'cancelled'
          ? 'danger'
          : 'neutral';
    const Icon = complete ? Check : Clock3;
    return (
        <span className={`admin-status admin-status--${tone}`}>
            <Icon size={14} aria-hidden="true" />
            {statusText(status)}
        </span>
    );
}
export function PriorityIndicator({
    priority = 'normal',
}: {
    priority?: Priority;
}) {
    return (
        <span className={`admin-priority admin-priority--${priority}`}>
            {priority === 'urgent' || priority === 'high' ? (
                <AlertCircle size={14} aria-hidden="true" />
            ) : null}
            {priorityText(priority)}
        </span>
    );
}
