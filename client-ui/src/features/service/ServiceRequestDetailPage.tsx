import { ArrowLeft, FileText, MessageSquare, RefreshCw } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { serviceApi } from './api';
import { visibleField } from './form';
import { useServiceRead } from './useServiceRead';
import {
    answerText,
    dateText,
    DownloadButton,
    Loading,
    ServiceError,
    SessionNote,
} from './ui';
import { ServiceConversation } from './ServiceConversation';
import { ServicePaymentProof } from './ServicePaymentProof';
const tabs = [
    { id: 'overview', title: 'Обзор' },
    { id: 'messages', title: 'Переписка' },
    { id: 'documents', title: 'Документы' },
    { id: 'history', title: 'История' },
];
export function ServiceRequestDetailPage() {
    const { id } = useParams();
    const [query, setQuery] = useSearchParams();
    const tab = tabs.some((item) => item.id === query.get('tab'))
        ? query.get('tab')!
        : 'overview';
    const {
        data: detail,
        error,
        loading,
        refresh,
    } = useServiceRead(`detail-${id}`, (signal) =>
        serviceApi.detail(Number(id), signal),
    );
    if (!detail)
        return (
            <>
                {error != null ? (
                    <ServiceError error={error} retry={() => void refresh()} />
                ) : (
                    <Loading />
                )}
            </>
        );
    const row = detail.request;
    const choose = (value: string) => {
        setQuery({ tab: value });
    };
    const next = row.isDraft
        ? 'Продолжите заполнение и отправьте заявку.'
        : row.stage === 'clarification_required'
          ? 'Сотрудник ждёт уточнение. Ответьте в переписке.'
          : row.stage === 'waiting_payment'
            ? detail.documents.paymentProof
                ? 'Документ передан. Ожидайте проверки оплаты сотрудником.'
                : 'Откройте счёт. После оплаты передайте платёжное поручение.'
            : row.stage === 'paid'
              ? 'Сотрудник подтвердил оплату. Дальнейшие детали появятся в заявке.'
              : ['completed', 'closed', 'cancelled'].includes(row.stage)
                ? row.stageLabel
                : 'Сотрудник работает с обращением. Ответы появятся в переписке.';
    return (
        <section className="svc-section" key={id}>
            <Link className="svc-back" to="/service/requests">
                <ArrowLeft size={17} />
                Мои заявки
            </Link>
            <div className="svc-page-heading svc-heading-row">
                <div>
                    <span className="ref-eyebrow">
                        {row.requestNumber} · {dateText(row.createdAt)}
                    </span>
                    <h1>{row.serviceTypeTitle}</h1>
                    <span className="svc-stage">{row.stageLabel}</span>
                </div>
                <button
                    className="ref-icon-button"
                    title="Обновить заявку"
                    aria-label="Обновить заявку"
                    disabled={loading}
                    onClick={() => void refresh()}
                >
                    <RefreshCw size={19} />
                </button>
            </div>
            <div className="svc-next">
                <p>{next}</p>
                {row.canContinue ? (
                    <Link
                        className="ref-button ref-button--primary"
                        to={`/service/requests/${row.id}/edit`}
                    >
                        Продолжить заполнение
                    </Link>
                ) : row.stage === 'waiting_payment' ? (
                    <button
                        className="ref-button"
                        onClick={() => choose('documents')}
                    >
                        <FileText size={17} />
                        Документы и оплата
                    </button>
                ) : (
                    detail.customerWorkflow.sendMessage.allowed && (
                        <button
                            className="ref-button"
                            onClick={() => choose('messages')}
                        >
                            <MessageSquare size={17} />
                            Написать сотруднику
                        </button>
                    )
                )}
            </div>
            {error != null && (
                <ServiceError error={error} retry={() => void refresh()} />
            )}
            <div
                className="svc-tabs"
                role="tablist"
                aria-label="Разделы заявки"
            >
                {tabs.map((item, index) => (
                    <button
                        key={item.id}
                        id={`tab-${item.id}`}
                        role="tab"
                        aria-selected={item.id === tab}
                        aria-controls={`panel-${item.id}`}
                        tabIndex={item.id === tab ? 0 : -1}
                        onClick={() => choose(item.id)}
                        onKeyDown={(event) => {
                            let nextIndex: number | undefined;
                            if (event.key === 'ArrowRight')
                                nextIndex = (index + 1) % tabs.length;
                            if (event.key === 'ArrowLeft')
                                nextIndex =
                                    (index + tabs.length - 1) % tabs.length;
                            if (event.key === 'Home') nextIndex = 0;
                            if (event.key === 'End')
                                nextIndex = tabs.length - 1;
                            if (nextIndex != null) {
                                event.preventDefault();
                                choose(tabs[nextIndex].id);
                                document
                                    .getElementById(`tab-${tabs[nextIndex].id}`)
                                    ?.focus();
                            }
                        }}
                    >
                        {item.title}
                    </button>
                ))}
            </div>
            <div
                id="panel-overview"
                role="tabpanel"
                aria-labelledby="tab-overview"
                hidden={tab !== 'overview'}
                className="svc-panel"
            >
                <h2>Данные обращения</h2>
                <dl className="svc-facts">
                    {detail.form?.schema.fields
                        .filter(
                            (field) =>
                                visibleField(field, row.answers) &&
                                !['display', 'file_instruction'].includes(
                                    field.type,
                                ) &&
                                row.answers[field.key] != null,
                        )
                        .map((field) => (
                            <div key={field.key}>
                                <dt>{field.label}</dt>
                                <dd>
                                    {field.options
                                        ? Array.isArray(row.answers[field.key])
                                            ? (
                                                  row.answers[
                                                      field.key
                                                  ] as string[]
                                              )
                                                  .map(
                                                      (value) =>
                                                          field.options!.find(
                                                              (option) =>
                                                                  option.value ===
                                                                  value,
                                                          )?.label || value,
                                                  )
                                                  .join(', ')
                                            : field.options.find(
                                                  (option) =>
                                                      option.value ===
                                                      row.answers[field.key],
                                              )?.label ||
                                              answerText(row.answers[field.key])
                                        : answerText(row.answers[field.key])}
                                </dd>
                            </div>
                        ))}
                    <div>
                        <dt>Контакт</dt>
                        <dd>{row.contactSnapshot?.name || 'Не указано'}</dd>
                        <dd>{row.contactSnapshot?.phone}</dd>
                    </div>
                    {row.calculatedPrice != null && (
                        <div>
                            <dt>Стоимость</dt>
                            <dd>
                                {row.calculatedPrice.toLocaleString('ru-RU')} ₽
                            </dd>
                        </div>
                    )}
                    {row.visitTime && (
                        <div>
                            <dt>Назначенный визит</dt>
                            <dd>{dateText(row.visitTime)}</dd>
                            <dd>{row.visitAddress}</dd>
                        </div>
                    )}
                    {row.completedAt && (
                        <div>
                            <dt>Работа выполнена</dt>
                            <dd>{dateText(row.completedAt)}</dd>
                        </div>
                    )}
                </dl>
            </div>
            <div
                id="panel-messages"
                role="tabpanel"
                aria-labelledby="tab-messages"
                hidden={tab !== 'messages'}
                className="svc-panel"
            >
                <ServiceConversation
                    key={`messages-${id}`}
                    detail={detail}
                    refresh={refresh}
                />
            </div>
            <div
                id="panel-documents"
                role="tabpanel"
                aria-labelledby="tab-documents"
                hidden={tab !== 'documents'}
                className="svc-panel"
            >
                <section className="svc-document-section">
                    <h2>Счёт</h2>
                    {detail.documents.invoice ? (
                        <div className="svc-document-row">
                            <div>
                                <strong>
                                    {detail.documents.invoice.file
                                        .originalName || 'Счёт'}
                                </strong>
                                <p className="svc-caption">
                                    {dateText(
                                        detail.documents.invoice.createdAt,
                                    )}
                                </p>
                            </div>
                            {detail.documents.invoice.downloadUrl ? (
                                <DownloadButton
                                    url={detail.documents.invoice.downloadUrl}
                                    name={
                                        detail.documents.invoice.file
                                            .originalName || 'invoice.pdf'
                                    }
                                    label="Скачать счёт"
                                />
                            ) : (
                                <p className="svc-field-error">
                                    Файл счёта недоступен. Напишите сотруднику.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="svc-empty">Счёт ещё не выставлен.</p>
                    )}
                </section>
                <ServicePaymentProof
                    key={`proof-${id}`}
                    detail={detail}
                    refresh={refresh}
                />
                <section className="svc-document-section">
                    <h2>Другие файлы</h2>
                    <ul className="svc-files">
                        {detail.attachments
                            .filter(
                                (item) =>
                                    !['invoice', 'payment_proof'].includes(
                                        item.kind,
                                    ),
                            )
                            .map((item) => (
                                <li key={item.id}>
                                    <strong>
                                        {item.file.originalName || 'Файл'}
                                    </strong>
                                    {item.downloadUrl ? (
                                        <DownloadButton
                                            url={item.downloadUrl}
                                            name={
                                                item.file.originalName || 'file'
                                            }
                                        />
                                    ) : (
                                        <span className="svc-caption">
                                            Недоступен
                                        </span>
                                    )}
                                </li>
                            ))}
                    </ul>
                </section>
            </div>
            <div
                id="panel-history"
                role="tabpanel"
                aria-labelledby="tab-history"
                hidden={tab !== 'history'}
                className="svc-panel"
            >
                <h2>История обращения</h2>
                {detail.events.length ? (
                    <ol className="svc-history">
                        {detail.events.map((event) => (
                            <li key={event.id}>
                                <strong>{event.label}</strong>
                                <time dateTime={event.createdAt}>
                                    {dateText(event.createdAt)}
                                </time>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="svc-empty">Событий пока нет.</p>
                )}
            </div>
            <SessionNote />
        </section>
    );
}
