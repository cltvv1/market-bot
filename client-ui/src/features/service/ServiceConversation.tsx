import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { serviceApi, ServiceApiError } from './api';
import { fileError } from './form';
import type { OwnerDetail } from './types';
import { dateText, DownloadButton, ServiceError } from './ui';
export function ServiceConversation({
    detail,
    refresh,
}: {
    detail: OwnerDetail;
    refresh: () => Promise<OwnerDetail | undefined>;
}) {
    const [text, setText] = useState('');
    const [file, setFile] = useState<File>();
    const input = useRef<HTMLInputElement>(null);
    const lock = useRef(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const [notice, setNotice] = useState('');
    const [unknown, setUnknown] = useState<'text' | 'file'>();
    const send = async () => {
        if (lock.current || unknown) return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        setNotice('');
        let part: 'text' | 'file' = 'text';
        try {
            if (text.trim()) {
                await serviceApi.message(detail.request.id, text.trim());
                setText('');
                setNotice('Сообщение отправлено.');
            }
            part = 'file';
            if (file) {
                await serviceApi.upload(detail.request.id, 'message', file);
                setFile(undefined);
                if (input.current) input.current.value = '';
                setNotice('Отправка подтверждена.');
            }
            await refresh();
        } catch (failure) {
            setError(failure);
            if (failure instanceof ServiceApiError && failure.uncertain)
                setUnknown(part);
            await refresh();
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const invalidFile = file && fileError(file, detail.attachmentPolicy);
    return (
        <section className="svc-conversation">
            <h2>Переписка</h2>
            <ol className="svc-messages">
                {detail.messages.map((message) => {
                    const attachment = detail.attachments.find(
                        (item) => item.id === message.attachmentId,
                    );
                    return (
                        <li
                            className={`svc-message ${message.authorType === 'customer' ? 'svc-message-own' : ''}`}
                            key={message.id}
                        >
                            <div className="svc-caption">
                                {message.authorType === 'customer'
                                    ? 'Вы'
                                    : message.authorType === 'staff'
                                      ? 'Сотрудник'
                                      : 'Сервис'}{' '}
                                · {dateText(message.createdAt)}
                            </div>
                            {message.text && <p>{message.text}</p>}
                            {attachment && (
                                <div>
                                    <p>
                                        {attachment.file.originalName || 'Файл'}
                                    </p>
                                    {attachment.downloadUrl ? (
                                        <DownloadButton
                                            url={attachment.downloadUrl}
                                            name={
                                                attachment.file.originalName ||
                                                'file'
                                            }
                                        />
                                    ) : (
                                        <p className="svc-caption">
                                            Файл недоступен
                                        </p>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>
            {!detail.messages.length && (
                <p className="svc-empty">Сообщений пока нет.</p>
            )}
            {notice && (
                <p className="svc-notice" role="status">
                    {notice}
                </p>
            )}
            {error != null && <ServiceError error={error} />}
            {unknown && (
                <div className="svc-notice">
                    <p>
                        Результат отправки{' '}
                        {unknown === 'text' ? 'сообщения' : 'файла'} неизвестен.
                        Проверьте переписку. Повторная отправка может создать
                        копию.
                    </p>
                    <div className="svc-actions">
                        <button
                            className="ref-button"
                            onClick={() => void refresh()}
                        >
                            Проверить переписку
                        </button>
                        <button
                            className="ref-button"
                            onClick={() => {
                                if (unknown === 'text') setText('');
                                else {
                                    setFile(undefined);
                                    if (input.current) input.current.value = '';
                                }
                                setUnknown(undefined);
                            }}
                        >
                            Уже сохранено, не повторять
                        </button>
                        <button
                            className="ref-button"
                            onClick={() => setUnknown(undefined)}
                        >
                            Проверено: не сохранено
                        </button>
                    </div>
                </div>
            )}
            {detail.customerWorkflow.sendMessage.allowed ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void send();
                    }}
                    className="svc-message-compose"
                >
                    <div className="svc-field">
                        <label htmlFor="service-message">
                            Сообщение сотруднику
                        </label>
                        <textarea
                            id="service-message"
                            rows={4}
                            maxLength={5000}
                            value={text}
                            disabled={busy}
                            onChange={(event) => setText(event.target.value)}
                        />
                    </div>
                    <div className="svc-field">
                        <label htmlFor="message-file">
                            Обычное вложение к сообщению
                        </label>
                        <input
                            id="message-file"
                            ref={input}
                            type="file"
                            disabled={
                                busy ||
                                !detail.customerWorkflow.attachFile.allowed
                            }
                            onChange={(event) =>
                                setFile(event.target.files?.[0])
                            }
                            accept={detail.attachmentPolicy.extensions
                                .map((ext) =>
                                    ext.startsWith('.') ? ext : `.${ext}`,
                                )
                                .join(',')}
                        />
                        {invalidFile && (
                            <span className="svc-field-error" role="alert">
                                {invalidFile}
                            </span>
                        )}
                    </div>
                    <button
                        className="ref-button ref-button--primary"
                        disabled={
                            busy ||
                            Boolean(unknown) ||
                            Boolean(invalidFile) ||
                            (!text.trim() && !file)
                        }
                    >
                        <Send size={17} />
                        {busy ? 'Отправка…' : 'Отправить сообщение'}
                    </button>
                </form>
            ) : (
                <p className="svc-notice">
                    {detail.customerWorkflow.sendMessage.reason}
                </p>
            )}
        </section>
    );
}
