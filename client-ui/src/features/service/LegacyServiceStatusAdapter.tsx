import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
    publicStatus,
    publicReply,
    publicFile,
    serviceApi,
    ServiceApiError,
} from './api';
import { useServiceRead } from './useServiceRead';
import { dateText, Loading, ServiceError } from './ui';
const publicStages: Record<string, string> = {
    received: 'Обращение получено',
    clarification_required: 'Нужно уточнение',
    accepted: 'Принято в работу',
    waiting_for_customer: 'Ожидается действие клиента',
    scheduled: 'Визит назначен',
    completed: 'Работа выполнена',
    closed: 'Закрыто',
    cancelled: 'Отменено',
};
function PublicStatus({ token, number }: { token: string; number: string }) {
    const view = useServiceRead(`public-${token}`, (signal) =>
        publicStatus(token, signal),
    );
    const [text, setText] = useState('');
    const [file, setFile] = useState<File>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const [uncertain, setUncertain] = useState(false);
    const [fileKey, setFileKey] = useState(0);
    const reply = async () => {
        if (busy || uncertain) return;
        setBusy(true);
        setError(undefined);
        try {
            if (text.trim()) {
                await publicReply(token, text.trim());
                setText('');
            }
            if (file) {
                await publicFile(token, file);
                setFile(undefined);
                setFileKey((old) => old + 1);
            }
            await view.refresh();
        } catch (failure) {
            setError(failure);
            if (failure instanceof ServiceApiError && failure.uncertain)
                setUncertain(true);
            await view.refresh();
        } finally {
            setBusy(false);
        }
    };
    if (view.error != null)
        return (
            <ServiceError
                error={view.error}
                retry={() => void view.refresh()}
            />
        );
    if (!view.data) return <Loading />;
    if (number && view.data.request.requestNumber !== number)
        return <ServiceError error={new ServiceApiError(404, 'NOT_FOUND')} />;
    return (
        <section className="svc-section">
            <h1>{view.data.request.serviceTypeTitle}</h1>
            <p>{view.data.request.requestNumber}</p>
            <span className="svc-stage">
                {publicStages[view.data.request.customerStatus] ||
                    'Статус уточняется'}
            </span>
            <p className="svc-notice">
                Ограниченный просмотр по ссылке. Банковские документы доступны
                только владельцу в исходной сессии браузера.
            </p>
            <ol className="svc-messages">
                {view.data.messages.map((message) => (
                    <li className="svc-message" key={message.id}>
                        <span className="svc-caption">
                            {message.authorType === 'customer'
                                ? 'Клиент'
                                : 'Сотрудник'}{' '}
                            · {dateText(message.createdAt)}
                        </span>
                        <p>{message.text}</p>
                    </li>
                ))}
            </ol>
            {error != null && <ServiceError error={error} />}
            {uncertain && (
                <div className="svc-notice">
                    <p>
                        Ответ сервера потерян. Проверьте переписку, прежде чем
                        повторять отправку: возможна копия.
                    </p>
                    <button
                        className="ref-button"
                        onClick={() => void view.refresh()}
                    >
                        Обновить переписку
                    </button>
                    <button
                        className="ref-button"
                        onClick={() => {
                            setUncertain(false);
                            setText('');
                            setFile(undefined);
                            setFileKey((old) => old + 1);
                        }}
                    >
                        Не повторять отправку
                    </button>
                </div>
            )}
            {!['closed', 'cancelled'].includes(
                view.data.request.customerStatus,
            ) && (
                <form
                    className="svc-message-compose"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void reply();
                    }}
                >
                    <div className="svc-field">
                        <label htmlFor="public-reply">
                            Сообщение сотруднику
                        </label>
                        <textarea
                            id="public-reply"
                            maxLength={5000}
                            disabled={busy}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                        />
                    </div>
                    <div className="svc-field">
                        <label htmlFor="public-file">
                            Обычный файл к обращению
                        </label>
                        <input
                            key={fileKey}
                            id="public-file"
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
                            disabled={busy}
                            onChange={(event) =>
                                setFile(event.target.files?.[0])
                            }
                        />
                    </div>
                    <button
                        className="ref-button"
                        disabled={
                            busy ||
                            uncertain ||
                            (!text.trim() && !file) ||
                            (file != null && file.size > 20 * 1024 * 1024)
                        }
                    >
                        Отправить ответ
                    </button>
                </form>
            )}
            <Link className="ref-button" to="/service/requests">
                Мои заявки
            </Link>
        </section>
    );
}
function OwnerLookup({ number }: { number: string }) {
    const view = useServiceRead(`lookup-${number}`, serviceApi.list);
    if (view.error != null)
        return (
            <ServiceError
                error={view.error}
                retry={() => void view.refresh()}
            />
        );
    if (!view.data) return <Loading />;
    const item = view.data.find(
        ({ request }) => request.requestNumber === number,
    );
    return item ? (
        <Navigate replace to={`/service/requests/${item.request.id}`} />
    ) : (
        <p className="svc-notice">
            В последних 50 заявках этой сессии номер не найден. Проверьте
            исходную ссылку или свяжитесь с сотрудником.
        </p>
    );
}
export function LegacyServiceStatusAdapter() {
    const [query, setQuery] = useSearchParams();
    const [number, setNumber] = useState(
        query.get('number')?.slice(0, 80) ?? '',
    );
    const token = query.get('token');
    if (token)
        return (
            <PublicStatus
                key={token}
                token={token}
                number={query.get('number') ?? ''}
            />
        );
    if (query.get('number'))
        return (
            <OwnerLookup
                key={query.get('number')}
                number={query.get('number')!.slice(0, 80)}
            />
        );
    return (
        <section className="svc-section svc-narrow">
            <h1>Найти заявку</h1>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (number.trim()) setQuery({ number: number.trim() });
                }}
            >
                <div className="svc-field">
                    <label htmlFor="status-number">Номер заявки</label>
                    <input
                        id="status-number"
                        value={number}
                        maxLength={80}
                        onChange={(event) => setNumber(event.target.value)}
                    />
                </div>
                <button className="ref-button ref-button--primary">
                    Найти в этой сессии
                </button>
            </form>
            <Link className="svc-back" to="/service/requests">
                Все мои заявки
            </Link>
        </section>
    );
}
