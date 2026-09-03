import { useRef } from 'react';
import {
    Link,
    useLocation,
    useParams,
    useSearchParams,
} from 'react-router-dom';
import { ArrowLeft, FileText, Info, ShieldCheck } from 'lucide-react';
import type { Admin, Staff } from '../../types';
import { answerLabels, fmtDate } from '../../format';
import {
    DocumentRow,
    PriorityIndicator,
    ReadState,
    StatusIndicator,
} from '../primitives';
import { useRead } from '../use-read';
import {
    channelName,
    clientName,
    paymentDocument,
    staffName,
    type ReferenceDetail,
} from './service-reference-model';

const tabs = [
    { id: 'request', title: 'Заявка' },
    { id: 'messages', title: 'Переписка' },
    { id: 'documents', title: 'Документы' },
    { id: 'history', title: 'История' },
];
function printable(value: unknown): string {
    if (value === null || value === undefined || value === '')
        return 'Не указано';
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
        <section className="ref-field-section">
            <h2>{title}</h2>
            <dl className="ref-fields">
                {fields.map(([label, content]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{printable(content)}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
function PaymentStage({
    data,
    admin,
}: {
    data: ReferenceDetail;
    admin: Admin;
}) {
    const invoice = paymentDocument(data, 'invoice');
    const proof = paymentDocument(data, 'payment_proof');
    const proofEvent = data.events.find(
        (event) =>
            event.type === 'payment_proof_attached' &&
            event.payload?.storedFileId === data.request.paymentProofFileId,
    );
    return (
        <section className="ref-stage" aria-labelledby="payment-heading">
            <div className="ref-stage-heading">
                <div>
                    <span className="ref-eyebrow">Текущий этап</span>
                    <h2 id="payment-heading">Проверка оплаты</h2>
                </div>
                <ShieldCheck size={24} aria-hidden="true" />
            </div>
            <div className="ref-stage-action">
                <div>
                    <p>
                        <Info size={16} aria-hidden="true" />
                        Платёжка не подтверждает поступление денег.
                    </p>
                    <span id="payment-disabled">
                        {!admin.permissions.includes('serviceRequests.payment')
                            ? 'Подтверждение выполняет сотрудник с доступом к оплате.'
                            : !data.request.paymentProofFileId
                              ? 'Для проверки требуется платёжное поручение.'
                              : 'В эталоне подтверждение отключено. Операция доступна в обычной админке.'}
                    </span>
                </div>
                <button
                    className="ref-button ref-button--primary"
                    disabled
                    aria-describedby="payment-disabled"
                >
                    <ShieldCheck size={17} />
                    Подтвердить оплату
                </button>
            </div>
            <div className="ref-payment-documents">
                <div>
                    <h3>Счёт</h3>
                    {invoice ? (
                        <DocumentRow
                            requestId={data.request.id}
                            attachment={invoice}
                        />
                    ) : (
                        <p>Метаданные текущего счёта недоступны.</p>
                    )}
                    <small>
                        {invoice
                            ? 'Прикреплён к заявке'
                            : 'Наличие файла требует проверки'}
                    </small>
                </div>
                <div>
                    <h3>Платёжное поручение</h3>
                    {proof ? (
                        <DocumentRow
                            requestId={data.request.id}
                            attachment={proof}
                        />
                    ) : (
                        <p>
                            {data.request.paymentProofFileId
                                ? 'Метаданные платёжки недоступны.'
                                : 'Ещё не получено'}
                        </p>
                    )}
                    <small>
                        {proofEvent
                            ? `Отправил клиент · ${fmtDate(proofEvent.createdAt)}`
                            : 'Автор отправки не указан в истории'}
                    </small>
                </div>
            </div>
        </section>
    );
}

export function ServiceDetailReference({
    admin,
    staff,
    refreshKey,
}: {
    admin: Admin;
    staff: Staff[];
    refreshKey: number;
}) {
    const { id = '' } = useParams();
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const tab = tabs.some((item) => item.id === params.get('tab'))
        ? params.get('tab')!
        : 'request';
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    const validId = /^[1-9]\d{0,9}$/.test(id);
    const result = useRead<ReferenceDetail>(
        validId ? `/admin/api/service-requests/${id}` : null,
        refreshKey,
    );
    const routeState: unknown = location.state;
    const back =
        routeState &&
        typeof routeState === 'object' &&
        'queueUrl' in routeState &&
        typeof routeState.queueUrl === 'string' &&
        /^\/service-requests(?:\?|$)/.test(routeState.queueUrl)
            ? routeState.queueUrl
            : '/service-requests';
    function chooseTab(next: string) {
        setParams({ tab: next }, { replace: true, state: routeState });
    }
    if (!validId)
        return (
            <div className="ref-state">
                <h1>Некорректная ссылка</h1>
                <Link to="/service-requests">К списку заявок</Link>
            </div>
        );
    if (!result.data)
        return (
            <>
                <Link className="ref-back" to={back}>
                    <ArrowLeft size={17} />К списку заявок
                </Link>
                <ReadState {...result} />
            </>
        );
    const data = result.data;
    const request = data.request;
    const answers = Object.entries(request.answers || {}).filter(
        ([key]) => !['consentId', 'paymentProof'].includes(key),
    );
    return (
        <>
            <Link className="ref-back" to={back}>
                <ArrowLeft size={17} />К списку заявок
            </Link>
            <header className="ref-detail-heading">
                <div className="ref-row-meta">
                    <span>
                        {request.requestNumber || `Заявка #${request.id}`}
                    </span>
                    <span>
                        {channelName(request.source || request.platform)}
                    </span>
                    <PriorityIndicator priority={request.priority} />
                </div>
                <h1>{request.serviceTypeTitle || 'Сервисная заявка'}</h1>
                <div className="ref-detail-subtitle">
                    <span>{clientName(request)}</span>
                    <StatusIndicator status={request.status} />
                </div>
                <div className="ref-assignments">
                    <span>
                        Куратор:{' '}
                        <strong>
                            {staffName(
                                request.responsibleOperatorStaffId,
                                admin,
                                staff,
                            )}
                        </strong>
                    </span>
                    <span>
                        Инженер:{' '}
                        <strong>
                            {staffName(
                                request.assignedEngineerId,
                                admin,
                                staff,
                            )}
                        </strong>
                    </span>
                    <span>
                        Обновлена: {fmtDate(request.updatedAt) || 'Не указано'}
                    </span>
                </div>
            </header>
            <div
                className="ref-detail-tabs"
                role="tablist"
                aria-label="Содержимое заявки"
            >
                {tabs.map((item, index) => (
                    <button
                        key={item.id}
                        ref={(element) => {
                            buttons.current[index] = element;
                        }}
                        id={`ref-tab-${item.id}`}
                        role="tab"
                        aria-selected={tab === item.id}
                        aria-controls={`ref-panel-${item.id}`}
                        tabIndex={tab === item.id ? 0 : -1}
                        onClick={() => chooseTab(item.id)}
                        onKeyDown={(event) => {
                            const next =
                                event.key === 'ArrowRight'
                                    ? (index + 1) % tabs.length
                                    : event.key === 'ArrowLeft'
                                      ? (index + tabs.length - 1) % tabs.length
                                      : event.key === 'Home'
                                        ? 0
                                        : event.key === 'End'
                                          ? tabs.length - 1
                                          : -1;
                            if (next < 0) return;
                            event.preventDefault();
                            chooseTab(tabs[next].id);
                            buttons.current[next]?.focus();
                        }}
                    >
                        {item.title}
                        {item.id === 'documents' && (
                            <span>{data.attachments.length}</span>
                        )}
                    </button>
                ))}
            </div>
            <div
                role="tabpanel"
                id={`ref-panel-${tab}`}
                aria-labelledby={`ref-tab-${tab}`}
                tabIndex={0}
                className="ref-detail-panel"
            >
                {tab === 'request' && (
                    <>
                        {request.status === 'waiting_payment' ? (
                            <PaymentStage data={data} admin={admin} />
                        ) : (
                            <section className="ref-next-action">
                                <Info size={20} />
                                <div>
                                    <strong>
                                        {[
                                            'completed',
                                            'closed',
                                            'cancelled',
                                        ].includes(request.status)
                                            ? 'Работа с заявкой завершена'
                                            : 'Действия по заявке'}
                                    </strong>
                                    <p>
                                        {[
                                            'completed',
                                            'closed',
                                            'cancelled',
                                        ].includes(request.status)
                                            ? 'Документы и история доступны для просмотра.'
                                            : 'Изменения доступны в обычной админке. Эталон показывает текущее состояние заявки.'}
                                    </p>
                                </div>
                            </section>
                        )}
                        <Fields
                            title="Данные обращения"
                            fields={[
                                [
                                    'Контактное лицо',
                                    request.contactSnapshot?.name,
                                ],
                                [
                                    'Телефон',
                                    request.contactSnapshot?.phone ||
                                        request.answers?.contactForCall,
                                ],
                                ['Email', request.contactSnapshot?.email],
                                [
                                    'Организация',
                                    request.organizationSnapshot?.name,
                                ],
                                [
                                    'ИНН',
                                    request.organizationSnapshot?.inn ||
                                        request.answers?.inn,
                                ],
                                [
                                    'Торговая точка',
                                    request.locationSnapshot?.address,
                                ],
                                [
                                    'Оборудование',
                                    request.equipmentSnapshot?.model,
                                ],
                                [
                                    'Серийный номер',
                                    request.equipmentSnapshot?.serialNumber,
                                ],
                                [
                                    'Стоимость',
                                    request.calculatedPrice === null ||
                                    request.calculatedPrice === undefined
                                        ? 'Не рассчитана'
                                        : `${request.calculatedPrice.toLocaleString('ru-RU')} ₽`,
                                ],
                                [
                                    'Визит',
                                    request.visitTime
                                        ? `${fmtDate(request.visitTime)} · ${request.visitAddress || ''}`
                                        : request.visitAddress,
                                ],
                                [
                                    'Комментарий оператора',
                                    request.operatorComment,
                                ],
                            ]}
                        />
                        {answers.length > 0 && (
                            <Fields
                                title="Ответы клиента"
                                fields={answers.map(([key, val]) => [
                                    answerLabels[key] || key,
                                    val,
                                ])}
                            />
                        )}
                    </>
                )}
                {tab === 'messages' && (
                    <section aria-label="Переписка">
                        <h2>Переписка</h2>
                        {data.messages.length ? (
                            <ol className="ref-conversation">
                                {data.messages.map((message) => (
                                    <li
                                        key={message.id}
                                        className={`ref-chat-entry ref-chat-entry--${message.authorType}`}
                                    >
                                        <header>
                                            <strong>
                                                {message.authorType ===
                                                'customer'
                                                    ? 'Клиент'
                                                    : message.authorType ===
                                                        'staff'
                                                      ? 'Сотрудник'
                                                      : 'Система'}
                                            </strong>
                                            <span>
                                                {fmtDate(message.createdAt)}
                                            </span>
                                            <span>
                                                {message.visibility ===
                                                'internal'
                                                    ? 'Внутренняя заметка'
                                                    : 'Видит клиент'}
                                            </span>
                                        </header>
                                        <p>
                                            {message.text ||
                                                'Сообщение без текста'}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="ref-empty-inline">
                                Сообщений пока нет.
                            </p>
                        )}
                        <p className="ref-notice">
                            Ответить можно в обычной админке. Файлы доступны на
                            вкладке «Документы».
                        </p>
                    </section>
                )}
                {tab === 'documents' && (
                    <section>
                        <h2>Документы заявки</h2>
                        {data.attachments.length ? (
                            data.attachments.map((attachment) => (
                                <div
                                    key={attachment.id}
                                    className="ref-document-entry"
                                >
                                    <span className="ref-document-kind">
                                        {{
                                            invoice:
                                                attachment.file.id ===
                                                request.invoiceStoredFileId
                                                    ? 'Текущий счёт'
                                                    : 'Ранее прикреплённый счёт',
                                            payment_proof:
                                                attachment.file.id ===
                                                request.paymentProofFileId
                                                    ? 'Текущее платёжное поручение'
                                                    : 'Ранее прикреплённая платёжка',
                                            signed_consent:
                                                'Подписанное согласие',
                                            message: 'Вложение сообщения',
                                        }[attachment.kind] ||
                                            'Файл заявки'}{' '}
                                        ·{' '}
                                        {attachment.customerVisible
                                            ? 'Видит клиент'
                                            : 'Внутренний файл'}
                                    </span>
                                    <DocumentRow
                                        attachment={attachment}
                                        requestId={request.id}
                                    />
                                </div>
                            ))
                        ) : (
                            <div className="ref-state">
                                <FileText size={28} />
                                <p>Документов пока нет.</p>
                            </div>
                        )}
                        <p className="ref-result-note">
                            Доступность файла проверяется при открытии.
                        </p>
                    </section>
                )}
                {tab === 'history' && (
                    <section>
                        <h2>История заявки</h2>
                        {data.events.length ? (
                            <ol className="ref-timeline">
                                {data.events.map((event) => (
                                    <li key={event.id}>
                                        <span className="ref-timeline-marker" />
                                        <div>
                                            <strong>
                                                {event.message ||
                                                    'Событие заявки'}
                                            </strong>
                                            <p>
                                                {fmtDate(event.createdAt)} ·{' '}
                                                {event.actor === 'client' ||
                                                event.actor === 'customer'
                                                    ? 'Клиент'
                                                    : event.actor?.startsWith(
                                                            'staff:',
                                                        )
                                                      ? staffName(
                                                            Number(
                                                                event.actor.split(
                                                                    ':',
                                                                )[1],
                                                            ),
                                                            admin,
                                                            staff,
                                                        )
                                                      : event.actor === 'staff'
                                                        ? 'Сотрудник'
                                                        : 'Система'}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p>Событий пока нет.</p>
                        )}
                    </section>
                )}
            </div>
        </>
    );
}
