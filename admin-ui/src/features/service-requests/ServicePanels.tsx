import { useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { ApiError } from '../../api';
import { answerLabels, fmtDate } from '../../format';
import { useSession } from '../../app/session';
import { commandError, executeAction } from './service-api';
import { DocumentRow } from './ServiceDocuments';
import type { ServiceDetailData } from './types';

function printable(value: unknown): string {
    if (value == null || value === '') return 'Не указано';
    if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
    if (typeof value === 'string' || typeof value === 'number')
        return String(value);
    if (Array.isArray(value)) return value.map(printable).join(', ');
    return 'Структурированные данные';
}
function Fields({
    title,
    fields,
}: {
    title: string;
    fields: Array<[string, unknown]>;
}) {
    return (
        <section className="admin-field-section">
            <h2>{title}</h2>
            <dl className="admin-fields">
                {fields.map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{printable(value)}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
export function ServiceRequestFields({ data }: { data: ServiceDetailData }) {
    const row = data.request;
    return (
        <>
            <Fields
                title="Данные обращения"
                fields={[
                    ['Контактное лицо', row.contact.name],
                    ['Телефон', row.contact.phone],
                    ['Email', row.contact.email],
                    ['Организация', row.organization.name],
                    ['ИНН', row.organization.inn || row.answers.inn],
                    ['Торговая точка', row.locationSnapshot?.address],
                    ['Оборудование', row.equipment],
                    [
                        'Стоимость',
                        row.calculatedPrice == null
                            ? 'Не рассчитана'
                            : `${Number(row.calculatedPrice).toLocaleString('ru-RU')} ₽`,
                    ],
                    [
                        'Визит',
                        row.visitTime
                            ? `${fmtDate(row.visitTime)} · ${row.visitAddress || ''}`
                            : row.visitAddress,
                    ],
                    ['Внутренний комментарий', row.operatorComment],
                ]}
            />
            <Fields
                title="Ответы клиента"
                fields={Object.entries(row.answers || {})
                    .filter(
                        ([key]) => !['consentId', 'paymentProof'].includes(key),
                    )
                    .map(([key, value]) => [answerLabels[key] || key, value])}
            />
        </>
    );
}
export function ServiceMessages({
    data,
    onChanged,
}: {
    data: ServiceDetailData;
    onChanged: () => void;
}) {
    const actions = data.workflow.actions.filter(
        (action) =>
            action.id === 'send_customer_message' ||
            action.id === 'add_internal_note',
    );
    const [mode, setMode] = useState('send_customer_message');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    const { notify } = useSession();
    const selected = actions.find((action) => action.id === mode) || actions[0];
    async function submit(e: FormEvent) {
        e.preventDefault();
        if (pending.current || !selected?.allowed || !text.trim()) return;
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            await executeAction(data.request.id, selected, {
                text: text.trim(),
            });
            setText('');
            onChanged();
        } catch (reason) {
            if (reason instanceof ApiError && reason.status === 409) {
                notify(commandError(reason));
                onChanged();
            } else setError(commandError(reason));
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }
    return (
        <section>
            <h2>Переписка</h2>
            {data.messages.length ? (
                <ol className="admin-conversation">
                    {data.messages.map((message) => (
                        <li
                            key={message.id}
                            className={`admin-chat-entry admin-chat-entry--${message.authorType}`}
                        >
                            <header>
                                <strong>
                                    {message.author?.displayName ||
                                        (message.authorType === 'customer'
                                            ? 'Клиент'
                                            : 'Система')}
                                </strong>
                                <time>{fmtDate(message.createdAt)}</time>
                                <span>
                                    {message.visibility === 'internal'
                                        ? 'Внутренняя заметка'
                                        : 'Видит клиент'}
                                </span>
                            </header>
                            <p>{message.text}</p>
                            {message.attachment && (
                                <DocumentRow document={message.attachment} />
                            )}
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="admin-empty-inline">Сообщений пока нет.</p>
            )}
            {actions.length > 0 && (
                <form className="admin-form" onSubmit={(e) => void submit(e)}>
                    <div
                        className="sr-message-modes"
                        role="group"
                        aria-label="Тип сообщения"
                    >
                        {actions.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                aria-pressed={selected?.id === action.id}
                                onClick={() => setMode(action.id)}
                            >
                                {action.id === 'add_internal_note'
                                    ? 'Внутренняя заметка'
                                    : 'Ответ клиенту'}
                            </button>
                        ))}
                    </div>
                    <label>
                        {selected?.id === 'add_internal_note'
                            ? 'Заметка для сотрудников'
                            : 'Сообщение клиенту'}
                        <textarea
                            required
                            rows={4}
                            maxLength={10000}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            disabled={busy || !selected?.allowed}
                        />
                    </label>
                    {selected?.reason && <p>{selected.reason}</p>}
                    {error && <p role="alert">{error}</p>}
                    <div>
                        <button
                            className="admin-button admin-button--primary"
                            disabled={
                                busy || !selected?.allowed || !text.trim()
                            }
                        >
                            <Send size={17} />
                            {busy
                                ? 'Отправляем…'
                                : selected?.id === 'add_internal_note'
                                  ? 'Добавить заметку'
                                  : 'Отправить'}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}
export function ServiceHistory({ data }: { data: ServiceDetailData }) {
    return (
        <section>
            <h2>История заявки</h2>
            {data.events.length ? (
                <ol className="admin-timeline">
                    {data.events.map((event) => (
                        <li key={event.id}>
                            <span className="admin-timeline-marker" />
                            <div>
                                <strong>
                                    {event.message || 'Событие заявки'}
                                </strong>
                                <p>
                                    {fmtDate(event.createdAt)} ·{' '}
                                    {event.actorStaff?.displayName ||
                                        (event.actor?.startsWith('staff:')
                                            ? `Сотрудник #${event.actor.slice(6)}`
                                            : event.actor === 'client' ||
                                                event.actor === 'customer'
                                              ? 'Клиент'
                                              : 'Система')}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="admin-empty-inline">Событий пока нет.</p>
            )}
            {data.deliveries.length > 0 && (
                <>
                    <h3>Доставка сообщений</h3>
                    <ul className="sr-deliveries">
                        {data.deliveries.map((item) => (
                            <li key={item.id}>
                                {fmtDate(item.createdAt)} ·{' '}
                                {{
                                    pending: 'В очереди',
                                    processing: 'Отправляется',
                                    delivered: 'Доставлено',
                                    failed: 'Ошибка',
                                    retry: 'Повторная попытка',
                                    cancelled: 'Отменено',
                                }[item.status] || item.status}
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
