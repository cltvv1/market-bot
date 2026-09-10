import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { errorText, ServiceApiError, serviceApi } from './api';
import { fileError } from './form';
import type { OwnerDetail } from './types';
import { DownloadButton, ServiceError } from './ui';
export type QueuedFile = {
    key: string;
    file: File;
    status: 'selected' | 'uploading' | 'uploaded' | 'failed' | 'result_unknown';
    error?: string;
};
export function ServiceDraftFiles({
    detail,
    queue,
    setQueue,
    disabled,
    refresh,
}: {
    detail: OwnerDetail;
    queue: QueuedFile[];
    setQueue: React.Dispatch<React.SetStateAction<QueuedFile[]>>;
    disabled: boolean;
    refresh: () => Promise<OwnerDetail | undefined>;
}) {
    const [error, setError] = useState<unknown>();
    const [removing, setRemoving] = useState<number>();
    const saved = detail.attachments.filter((item) => item.kind === 'customer');
    const upload = async (item: QueuedFile) => {
        setQueue((items) =>
            items.map((entry) =>
                entry.key === item.key
                    ? { ...entry, status: 'uploading', error: undefined }
                    : entry,
            ),
        );
        try {
            await serviceApi.upload(detail.request.id, 'draft', item.file);
            setQueue((items) =>
                items.map((entry) =>
                    entry.key === item.key
                        ? { ...entry, status: 'uploaded' }
                        : entry,
                ),
            );
            await refresh();
        } catch (failure) {
            setQueue((items) =>
                items.map((entry) =>
                    entry.key === item.key
                        ? {
                              ...entry,
                              status:
                                  failure instanceof ServiceApiError &&
                                  failure.uncertain
                                      ? 'result_unknown'
                                      : 'failed',
                              error: errorText(failure),
                          }
                        : entry,
                ),
            );
        }
    };
    return (
        <section className="svc-section svc-file-section">
            <h2>Файлы к заявке</h2>
            <p className="svc-caption">
                {detail.form?.schema.attachmentInstruction} До{' '}
                {detail.attachmentPolicy.maxAttachments} файлов, каждый до{' '}
                {Math.floor(detail.attachmentPolicy.maxBytes / 1024 / 1024)}{' '}
                МиБ.
            </p>
            {error != null && <ServiceError error={error} />}
            <ul className="svc-files">
                {saved.map((item) => (
                    <li key={item.id}>
                        <div>
                            <strong>{item.file.originalName || 'Файл'}</strong>
                            <span className="svc-caption">
                                Сохранён в заявке
                            </span>
                        </div>
                        {item.downloadUrl && (
                            <DownloadButton
                                url={item.downloadUrl}
                                name={item.file.originalName || 'file'}
                            />
                        )}
                        <button
                            className="ref-icon-button"
                            title="Удалить вложение"
                            aria-label={`Удалить ${item.file.originalName || 'файл'}`}
                            disabled={disabled || removing != null}
                            onClick={() => {
                                setRemoving(item.id);
                                setError(undefined);
                                void serviceApi
                                    .remove(detail.request.id, item.id)
                                    .then(refresh)
                                    .catch(setError)
                                    .finally(() => setRemoving(undefined));
                            }}
                        >
                            <X size={17} />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="svc-field">
                <label htmlFor="draft-files">Добавить файлы</label>
                <input
                    id="draft-files"
                    type="file"
                    multiple
                    accept={detail.attachmentPolicy.extensions
                        .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
                        .join(',')}
                    disabled={
                        disabled ||
                        saved.length +
                            queue.filter((item) => item.status !== 'uploaded')
                                .length >=
                            detail.attachmentPolicy.maxAttachments
                    }
                    onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        setQueue((old) => [
                            ...old,
                            ...files.map((file): QueuedFile => {
                                const problem = fileError(
                                    file,
                                    detail.attachmentPolicy,
                                );
                                return {
                                    key: crypto.randomUUID(),
                                    file,
                                    status: problem ? 'failed' : 'selected',
                                    error: problem ?? undefined,
                                };
                            }),
                        ]);
                        event.target.value = '';
                    }}
                />
            </div>
            <ul className="svc-files">
                {queue.map((item) => (
                    <li key={item.key}>
                        <div>
                            <strong>{item.file.name}</strong>
                            <span className="svc-caption">
                                {
                                    {
                                        selected: 'Выбран, ещё не загружен',
                                        uploading: 'Загрузка…',
                                        uploaded: 'Загрузка подтверждена',
                                        failed: 'Не загружен',
                                        result_unknown:
                                            'Результат загрузки неизвестен',
                                    }[item.status]
                                }
                            </span>
                            {item.error && (
                                <p className="svc-field-error">{item.error}</p>
                            )}
                        </div>
                        {item.status === 'result_unknown' ? (
                            <div className="svc-actions">
                                <button
                                    className="ref-button"
                                    disabled={disabled}
                                    onClick={() => void refresh()}
                                >
                                    Проверить файлы
                                </button>
                                <button
                                    className="ref-button"
                                    disabled={disabled}
                                    onClick={() =>
                                        setQueue((old) =>
                                            old.map((entry) =>
                                                entry.key === item.key
                                                    ? {
                                                          ...entry,
                                                          status: 'selected',
                                                          error: undefined,
                                                      }
                                                    : entry,
                                            ),
                                        )
                                    }
                                >
                                    Проверено: файл не сохранён
                                </button>
                            </div>
                        ) : (
                            item.status !== 'uploaded' && (
                                <button
                                    className="ref-button"
                                    disabled={
                                        disabled ||
                                        item.status === 'uploading' ||
                                        Boolean(
                                            fileError(
                                                item.file,
                                                detail.attachmentPolicy,
                                            ),
                                        )
                                    }
                                    onClick={() => void upload(item)}
                                >
                                    <Upload size={17} />
                                    Загрузить файл
                                </button>
                            )
                        )}
                        <button
                            className="ref-icon-button"
                            disabled={disabled || item.status === 'uploading'}
                            title="Убрать из выбора"
                            aria-label={`Убрать из выбора ${item.file.name}`}
                            onClick={() =>
                                setQueue((items) =>
                                    items.filter(
                                        (entry) => entry.key !== item.key,
                                    ),
                                )
                            }
                        >
                            <X size={17} />
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
