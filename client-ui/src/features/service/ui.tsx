import { useState } from 'react';
import { AlertCircle, Download, RefreshCw } from 'lucide-react';
import { downloadOwned, errorText } from './api';
export const dateText = (value?: string | null) =>
    value
        ? new Date(value).toLocaleString('ru-RU', {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : 'Не указано';
export const answerText = (value: unknown): string =>
    value == null || value === ''
        ? 'Не указано'
        : typeof value === 'boolean'
          ? value
              ? 'Да'
              : 'Нет'
          : Array.isArray(value)
            ? value.join(', ')
            : typeof value === 'string' || typeof value === 'number'
              ? String(value)
              : 'Не указано';
export function ServiceError({
    error,
    retry,
}: {
    error: unknown;
    retry?: () => void;
}) {
    return (
        <div className="svc-notice svc-error" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <div>
                <p>{errorText(error)}</p>
                {retry && (
                    <button className="ref-button" onClick={retry}>
                        <RefreshCw size={16} />
                        Повторить чтение
                    </button>
                )}
            </div>
        </div>
    );
}
export function Loading() {
    return (
        <div className="svc-loading" role="status">
            Загрузка заявки…
        </div>
    );
}
export function SessionNote() {
    return (
        <p className="svc-caption">
            Доступ к этим заявкам связан с текущей защищённой сессией браузера.
            На другом устройстве они могут быть недоступны.
        </p>
    );
}
export function DownloadButton({
    url,
    name,
    label = 'Скачать',
}: {
    url: string;
    name: string;
    label?: string;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    return (
        <div>
            <button
                className="ref-button"
                disabled={busy}
                onClick={() => {
                    setBusy(true);
                    setError(undefined);
                    void downloadOwned(url, name)
                        .catch(setError)
                        .finally(() => setBusy(false));
                }}
            >
                <Download size={17} />
                {busy ? 'Загрузка…' : label}
            </button>
            {error != null && <ServiceError error={error} />}
        </div>
    );
}
