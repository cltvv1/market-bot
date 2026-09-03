import { AlertCircle, Check, Clock3, Download, RefreshCw } from 'lucide-react';
import { ApiError } from '../api';
import { fmtDate, priorityText, statusText } from '../format';
import type { Priority, ServiceAttachment } from '../types';

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
            <div className="ref-state" role="status">
                <div className="ref-skeleton" />
                <div className="ref-skeleton" />
                <p>Загружаем данные…</p>
            </div>
        );
    const status = error instanceof ApiError ? error.status : 0;
    return (
        <div className="ref-state" role="alert">
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
            <div className="ref-actions">
                {status === 401 && (
                    <a className="ref-button" href="/admin/">
                        Войти в админку
                    </a>
                )}
                <button className="ref-button" onClick={retry}>
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
        <span className={`ref-status ref-status--${tone}`}>
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
        <span className={`ref-priority ref-priority--${priority}`}>
            {priority === 'urgent' || priority === 'high' ? (
                <AlertCircle size={14} aria-hidden="true" />
            ) : null}
            {priorityText(priority)}
        </span>
    );
}
export function DocumentRow({
    attachment,
    requestId,
    title,
}: {
    attachment: ServiceAttachment;
    requestId: number;
    title?: string;
}) {
    return (
        <div className="ref-document">
            <div>
                <strong>
                    {title || attachment.file.originalName || 'Документ'}
                </strong>
                {title && (
                    <span>
                        {attachment.file.originalName || 'Имя не указано'}
                    </span>
                )}
                <small>
                    {attachment.file.mimeType} ·{' '}
                    {Math.ceil(attachment.file.sizeBytes / 1024)} КБ
                    {attachment.createdAt
                        ? ` · ${fmtDate(attachment.createdAt)}`
                        : ''}
                </small>
            </div>
            <a
                className="ref-icon-button"
                href={`/admin/api/service-requests/${requestId}/attachments/${attachment.id}`}
                target="_blank"
                rel="noreferrer"
                title={`Открыть ${attachment.file.originalName || 'документ'}`}
                aria-label={`Открыть ${attachment.file.originalName || 'документ'}`}
            >
                <Download size={19} />
            </a>
        </div>
    );
}
