import { useRef, useState } from 'react';
import {
    Link,
    useLocation,
    useParams,
    useSearchParams,
} from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { ReadState } from '../../app/primitives';
import { ApiError } from '../../api';
import { fmtDate } from '../../format';
import { money, ordersPath } from './api';
import {
    documentKinds,
    documentMethods,
    fulfillmentMethods,
    orderStatuses,
    paymentSources,
    type OrderAction,
    type OrderDetail,
} from './types';
import { OrderActionButton, OrderActionDialog } from './OrderActions';
import { OrderDocuments, OrderHistory, OrderLines } from './OrderPanels';

const tabs = [
    { id: 'overview', title: 'Обзор' },
    { id: 'quote', title: 'Предложение' },
    { id: 'payment', title: 'Оплата' },
    { id: 'fulfillment', title: 'Исполнение' },
    { id: 'history', title: 'История' },
];
export function OrderDetailPage() {
    const { id = '' } = useParams();
    return <Detail key={id} id={id} />;
}
function Detail({ id }: { id: string }) {
    const { revision, refresh } = useSession();
    const result = useRead<OrderDetail>(
        /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2147483647
            ? `/admin/api/orders/${id}`
            : null,
        revision,
    );
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const state: unknown = location.state;
    const back =
        state &&
        typeof state === 'object' &&
        'queueUrl' in state &&
        typeof state.queueUrl === 'string' &&
        /^\/sales\/orders(?:\?|$)/.test(state.queueUrl)
            ? state.queueUrl
            : ordersPath;
    const tab = tabs.some((t) => t.id === params.get('tab'))
        ? params.get('tab')!
        : 'overview';
    const [selection, setSelection] = useState<{
        action: OrderAction;
        version: number;
        order: OrderDetail;
    } | null>(null);
    const buttons = useRef<Array<HTMLButtonElement | null>>([]);
    const choose = (next: string) => {
        const query = new URLSearchParams(params);
        query.set('tab', next);
        setParams(query, { state });
        setSelection(null);
    };
    const backlink = (
        <Link
            className="admin-back"
            to={back}
            state={{ selectedId: Number(id) }}
        >
            <ArrowLeft size={17} />К очереди заказов
        </Link>
    );
    const terminalReadFailure =
        result.error instanceof ApiError &&
        [400, 401, 403, 404].includes(result.error.status);
    // Keep a mounted form (including its File input) during a failed reconciliation read.
    const order =
        result.data || (!terminalReadFailure ? selection?.order : undefined);
    const stale = result.loading || !result.data;
    if (!result.path)
        return (
            <>
                {backlink}
                <div className="admin-state">
                    <h1>Некорректная ссылка</h1>
                </div>
            </>
        );
    if (!order)
        return (
            <>
                {backlink}
                <ReadState {...result} />
            </>
        );
    const action = (key: OrderAction) => (
        <OrderActionButton
            action={key}
            decision={order.actions[key]}
            disabled={stale}
            onClick={() =>
                setSelection({ action: key, version: order.version, order })
            }
        />
    );
    const changed = () => {
        result.retry();
        refresh();
    };
    return (
        <div className="ord-workspace">
            {backlink}
            <header className="admin-detail-heading">
                <div className="admin-row-meta">
                    <span>{order.orderNumber}</span>
                    <span>{fmtDate(order.createdAt)}</span>
                    <span>Изменён {fmtDate(order.updatedAt)}</span>
                    <span>Версия {order.version}</span>
                </div>
                <h1>{order.organization?.name || order.contact.name}</h1>
                <div className="ord-heading-status">
                    <span className="admin-status">
                        {orderStatuses[order.status]}
                    </span>
                    <span className="admin-muted">
                        {order.assignedManager?.displayName ||
                            'Менеджер не назначен'}
                    </span>
                    <strong>
                        {money(
                            order.quote
                                ? order.quote.quotedTotalMinor
                                : order.catalogTotalMinor,
                        )}
                    </strong>
                </div>
            </header>
            {result.loading && (
                <p role="status" className="admin-muted">
                    Обновляем данные…
                </p>
            )}
            {Boolean(result.error) && (
                <p role="alert">
                    Актуальные данные недоступны. Изменения заблокированы.{' '}
                    <button className="admin-button" onClick={result.retry}>
                        Обновить заказ
                    </button>
                </p>
            )}
            <div
                role="tablist"
                aria-label="Разделы заказа"
                className="ord-tabs"
            >
                {tabs.map((item, index) => (
                    <button
                        ref={(el) => {
                            buttons.current[index] = el;
                        }}
                        key={item.id}
                        id={`order-tab-${item.id}`}
                        role="tab"
                        aria-selected={tab === item.id}
                        aria-controls="order-panel"
                        tabIndex={tab === item.id ? 0 : -1}
                        onClick={() => choose(item.id)}
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
                            if (next >= 0) {
                                event.preventDefault();
                                choose(tabs[next].id);
                                buttons.current[next]?.focus();
                            }
                        }}
                    >
                        {item.title}
                    </button>
                ))}
            </div>
            <div
                id="order-panel"
                role="tabpanel"
                aria-labelledby={`order-tab-${tab}`}
                tabIndex={0}
            >
                {tab === 'overview' && (
                    <>
                        <section className="ord-section">
                            <h2>Клиент и получение</h2>
                            <dl className="ord-facts">
                                <Fact
                                    title="Клиент"
                                    value={
                                        order.customerType === 'organization'
                                            ? 'Организация'
                                            : 'Физическое лицо'
                                    }
                                />
                                <Fact
                                    title="Контакт"
                                    value={order.contact.name}
                                />
                                <Fact
                                    title="Телефон"
                                    value={order.contact.phone}
                                />
                                <Fact
                                    title="Почта"
                                    value={order.contact.email}
                                />
                                {order.organization && (
                                    <>
                                        <Fact
                                            title="ИНН / КПП"
                                            value={[
                                                order.organization.inn,
                                                order.organization.kpp,
                                            ]
                                                .filter(Boolean)
                                                .join(' / ')}
                                        />
                                        <Fact
                                            title="Юридический адрес"
                                            value={
                                                order.organization.legalAddress
                                            }
                                        />
                                    </>
                                )}
                                <Fact
                                    title="Получение"
                                    value={
                                        fulfillmentMethods[order.delivery.type]
                                    }
                                />
                                <Fact
                                    title="Адрес"
                                    value={[
                                        order.delivery.city,
                                        order.delivery.address,
                                    ]
                                        .filter(Boolean)
                                        .join(', ')}
                                />
                                <Fact
                                    title="Комментарий к доставке"
                                    value={order.delivery.comment}
                                />
                                <Fact
                                    title="Пожелания клиента"
                                    value={order.customerComment}
                                />
                            </dl>
                        </section>
                        <section className="ord-section">
                            <h2>Ответственный менеджер</h2>
                            <p>
                                {order.assignedManager?.displayName ||
                                    'Не назначен'}
                                {order.assignedManager?.isActive === false
                                    ? ' · неактивен'
                                    : ''}
                            </p>
                            <div className="ord-actions">
                                {action('assign')}
                                {action('review')}
                            </div>
                        </section>
                        <OrderLines lines={order.lines} />
                    </>
                )}
                {tab === 'quote' && (
                    <>
                        <section className="ord-section">
                            <div className="ord-section-heading">
                                <h2>
                                    Предложение
                                    {order.quote
                                        ? ` · редакция ${order.quote.revision}`
                                        : ''}
                                </h2>
                                <span className="admin-status">
                                    {order.quote?.status === 'confirmed'
                                        ? 'Согласовано'
                                        : 'Черновик'}
                                </span>
                            </div>
                            {order.quote ? (
                                <>
                                    <OrderLines
                                        lines={order.quote.lines}
                                        quote
                                    />
                                    <div className="ord-total">
                                        <span>Итого</span>
                                        <strong>
                                            {money(
                                                order.quote.quotedTotalMinor,
                                            )}
                                        </strong>
                                    </div>
                                    <dl className="ord-facts">
                                        <Fact
                                            title="Внутренний комментарий"
                                            value={order.quote.internalComment}
                                        />
                                        <Fact
                                            title="Согласовано"
                                            value={
                                                order.quote.confirmedAt
                                                    ? fmtDate(
                                                          order.quote
                                                              .confirmedAt,
                                                      )
                                                    : null
                                            }
                                        />
                                    </dl>
                                </>
                            ) : (
                                <p className="admin-muted">
                                    Предложение ещё не создано
                                </p>
                            )}
                            <div className="ord-actions">
                                {!order.quote && action('review')}
                                {action('quote')}
                                {action('confirm')}
                            </div>
                        </section>
                        <OrderLines lines={order.lines} />
                    </>
                )}
                {tab === 'payment' && (
                    <>
                        <OrderDocuments
                            orderId={order.id}
                            documents={order.documents.invoices}
                            title="Счета"
                        />
                        <div className="ord-actions">{action('invoice')}</div>
                        <OrderDocuments
                            orderId={order.id}
                            documents={order.documents.paymentProofs}
                            title="Платёжные документы клиента"
                        />
                        <section className="ord-section">
                            <h2>Подтверждение оплаты</h2>
                            {order.paymentConfirmation ? (
                                <dl className="ord-facts">
                                    <Fact
                                        title="Основание"
                                        value={
                                            paymentSources[
                                                order.paymentConfirmation.source
                                            ]
                                        }
                                    />
                                    <Fact
                                        title="Дата поступления"
                                        value={fmtDate(
                                            order.paymentConfirmation
                                                .receivedAt,
                                        )}
                                    />
                                    <Fact
                                        title="Подтвердил"
                                        value={
                                            order.paymentConfirmation
                                                .confirmedByStaff?.displayName
                                        }
                                    />
                                    <Fact
                                        title="Комментарий"
                                        value={
                                            order.paymentConfirmation.comment
                                        }
                                    />
                                </dl>
                            ) : (
                                <p className="admin-muted">
                                    Оплата не подтверждена
                                </p>
                            )}
                            {action('payment')}
                        </section>
                    </>
                )}
                {tab === 'fulfillment' && (
                    <>
                        <section className="ord-section">
                            <h2>Исполнение заказа</h2>
                            {order.fulfillment ? (
                                <dl className="ord-facts">
                                    <Fact
                                        title="Способ"
                                        value={
                                            fulfillmentMethods[
                                                order.fulfillment.method
                                            ]
                                        }
                                    />
                                    <Fact
                                        title="Дата"
                                        value={fmtDate(
                                            order.fulfillment.fulfilledAt,
                                        )}
                                    />
                                    <Fact
                                        title="Получатель"
                                        value={order.fulfillment.recipientName}
                                    />
                                    <Fact
                                        title="Перевозчик"
                                        value={order.fulfillment.carrierName}
                                    />
                                    <Fact
                                        title="Трек-номер"
                                        value={order.fulfillment.trackingNumber}
                                    />
                                    <Fact
                                        title="Комментарий"
                                        value={order.fulfillment.comment}
                                    />
                                </dl>
                            ) : (
                                <p className="admin-muted">
                                    Исполнение ещё не подтверждено
                                </p>
                            )}
                            {action('fulfill')}
                        </section>
                        <section className="ord-section">
                            <h2>Реализация и закрывающие документы</h2>
                            {order.completion ? (
                                <dl className="ord-facts">
                                    <Fact
                                        title="Номер реализации"
                                        value={
                                            order.completion.realizationNumber
                                        }
                                    />
                                    <Fact
                                        title="Дата реализации"
                                        value={order.completion.realizationDate}
                                    />
                                    <Fact
                                        title="Передача документов"
                                        value={
                                            documentMethods[
                                                order.completion
                                                    .documentDeliveryMethod
                                            ]
                                        }
                                    />
                                    <Fact
                                        title="Документы"
                                        value={order.completion.documentKinds
                                            ?.map((kind) => documentKinds[kind])
                                            .join(', ')}
                                    />
                                    <Fact
                                        title="Переданы"
                                        value={
                                            order.completion
                                                .documentsDeliveredAt
                                                ? fmtDate(
                                                      order.completion
                                                          .documentsDeliveredAt,
                                                  )
                                                : null
                                        }
                                    />
                                    <Fact
                                        title="Комментарий"
                                        value={order.completion.comment}
                                    />
                                </dl>
                            ) : (
                                <p className="admin-muted">
                                    Факты реализации не зафиксированы
                                </p>
                            )}
                            {action('complete')}
                        </section>
                    </>
                )}
                {tab === 'history' && <OrderHistory order={order} />}
            </div>
            {selection && (
                <OrderActionDialog
                    selection={selection}
                    order={order}
                    loading={stale}
                    onChanged={changed}
                    onClose={() => setSelection(null)}
                />
            )}
        </div>
    );
}
function Fact({ title, value }: { title: string; value?: string | null }) {
    return (
        <div>
            <dt>{title}</dt>
            <dd>{value || <span className="admin-muted">Не указано</span>}</dd>
        </div>
    );
}
