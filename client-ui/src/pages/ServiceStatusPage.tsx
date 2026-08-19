import { Check, Circle, FileText, Paperclip, Search, Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Button, EmptyState, Input, Loader } from '../components/ui';
import { serviceRequestService } from '../services/client';
import type { ServiceRequestRecord } from '../types';

const statusLabels = {
    accepted: 'Заявка принята',
    assigned: 'Назначен специалист',
    diagnostics: 'Проводится диагностика',
    waiting: 'Ожидается информация или запчасть',
    completed: 'Работа выполнена',
    closed: 'Заявка закрыта',
};

export function ServiceStatusPage() {
    const [params, setParams] = useSearchParams();
    const [number, setNumber] = useState(params.get('number') || '');
    const [result, setResult] = useState<
        ServiceRequestRecord | null | undefined
    >(undefined);
    const [loading, setLoading] = useState(false);
    const [reply, setReply] = useState('');
    const [file, setFile] = useState<File>();
    const [replyError, setReplyError] = useState('');
    const search = async (value = number) => {
        if (!value.trim()) return;
        setLoading(true);
        setParams({ number: value.trim() }, { replace: true });
        setResult(
            await serviceRequestService.find(
                value,
                params.get('token') || undefined,
            ),
        );
        setLoading(false);
    };
    useEffect(() => {
        const initial = params.get('number');
        if (initial) void search(initial);
    }, []);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        void search();
    };
    const sendReply = async (event: FormEvent) => {
        event.preventDefault();
        if (!result || (!reply.trim() && !file)) return;
        setLoading(true);
        setReplyError('');
        try {
            const refreshed = await serviceRequestService.reply(
                result,
                reply.trim(),
                file,
            );
            setResult(refreshed);
            setReply('');
            setFile(undefined);
        } catch (error) {
            setReplyError(
                error instanceof Error
                    ? error.message
                    : 'Не удалось отправить ответ',
            );
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="page container">
            <Breadcrumbs
                items={[
                    { label: 'Сервисный центр', to: '/service' },
                    { label: 'Статус заявки' },
                ]}
            />
            <header className="page-heading">
                <div>
                    <span className="eyebrow">Контроль заявки</span>
                    <h1>Проверить статус</h1>
                    <p>
                        Введите номер из подтверждения, например SR-42. Статус
                        доступен только в той же защищённой сессии браузера.
                    </p>
                </div>
            </header>
            <form className="status-search" onSubmit={submit}>
                <Input
                    label="Номер сервисной заявки"
                    value={number}
                    onChange={(e) => setNumber(e.target.value.toUpperCase())}
                    placeholder="SR-42"
                />
                <Button type="submit">
                    <Search />
                    Найти заявку
                </Button>
            </form>
            {loading ? (
                <Loader label="Ищем заявку" />
            ) : result === null ? (
                <EmptyState
                    icon={<Search />}
                    title="Заявка не найдена"
                    text="Проверьте номер или свяжитесь с сервисным центром."
                />
            ) : result ? (
                <section className="request-status">
                    <header>
                        <div>
                            <span>{result.number}</span>
                            <h2>{result.title}</h2>
                            <p>
                                Создана {result.createdAt} ·{' '}
                                {result.contactName}
                            </p>
                        </div>
                        <strong>{statusLabels[result.status]}</strong>
                    </header>
                    <ol>
                        {result.history.map((event) => (
                            <li
                                className="done"
                                key={`${event.status}-${event.date}`}
                            >
                                <span>
                                    <Check />
                                </span>
                                <div>
                                    <h3>{event.title}</h3>
                                    <time>{event.date}</time>
                                    {event.note && <p>{event.note}</p>}
                                </div>
                            </li>
                        ))}
                        {result.status !== 'closed' &&
                            result.status !== 'completed' && (
                                <li>
                                    <span>
                                        <Circle />
                                    </span>
                                    <div>
                                        <h3>Следующий этап</h3>
                                        <p>
                                            Информация появится после обновления
                                            заявки оператором.
                                        </p>
                                    </div>
                                </li>
                            )}
                    </ol>
                    {result.attachments && result.attachments.length > 0 && (
                        <div className="request-status__files">
                            <h3>Файлы заявки</h3>
                            {result.attachments.map((attachment) => (
                                <a
                                    key={attachment.id}
                                    href={
                                        result.accessToken
                                            ? `/api/public/service-requests/${encodeURIComponent(result.accessToken)}/attachments/${attachment.id}`
                                            : `/api/client/service-requests/${result.id}/attachments/${attachment.id}`
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <FileText />
                                    {attachment.name}
                                </a>
                            ))}
                        </div>
                    )}
                    {result.status !== 'closed' &&
                        result.status !== 'completed' && (
                            <form
                                className="request-status__reply"
                                onSubmit={(event) => void sendReply(event)}
                            >
                                <label>
                                    <span>Ответ оператору</span>
                                    <textarea
                                        value={reply}
                                        onChange={(event) =>
                                            setReply(event.target.value)
                                        }
                                        maxLength={10000}
                                        rows={4}
                                        placeholder="Напишите уточнение или ответ"
                                    />
                                </label>
                                <label className="button button--secondary">
                                    <Paperclip />
                                    {file ? file.name : 'Приложить файл'}
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                                        onChange={(event) =>
                                            setFile(event.target.files?.[0])
                                        }
                                    />
                                </label>
                                <Button
                                    type="submit"
                                    disabled={
                                        loading || (!reply.trim() && !file)
                                    }
                                >
                                    <Send />
                                    Отправить
                                </Button>
                                {replyError && (
                                    <p className="form-error" role="alert">
                                        {replyError}
                                    </p>
                                )}
                            </form>
                        )}
                </section>
            ) : (
                <div className="status-hint">
                    <Search />
                    <div>
                        <h2>Номер указан в сообщении после отправки</h2>
                        <p>
                            Статус показывает текущий этап, назначенного
                            специалиста и комментарии сервиса.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
