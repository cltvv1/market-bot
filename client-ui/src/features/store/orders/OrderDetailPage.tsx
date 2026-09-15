import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui';
import { SESSION_LOST } from '../../../api/client-session';
import {
    ClientApiError,
    downloadOrderDocument,
    storeApi,
    storeId,
} from '../api';
import { deliveryLabels, moneyMinor, orderLabels } from '../model';
import { StoreError, StoreLoading } from '../StoreUI';
import type { OrderDetail, OrderDocument, OrderLine } from '../types';
import { OrderPaymentProof } from './OrderPaymentProof';
const eventLabels: Record<string, string> = {
    submitted: 'Заказ передан',
    manager_assigned: 'Назначен менеджер',
    manager_reassigned: 'Менеджер изменён',
    review_started: 'Начата проверка',
    quote_updated: 'Предложение обновлено',
    confirmed: 'Заказ согласован',
    invoice_issued: 'Выставлен счёт',
    invoice_replaced: 'Счёт обновлён',
    payment_proof_received: 'Получено платёжное поручение',
    payment_confirmed: 'Оплата подтверждена',
    fulfilled: 'Заказ исполнен',
    completed: 'Заказ завершён',
    cancelled: 'Заказ отменён',
};
export function OrderDetailPage() {
    const { id = '' } = useParams();
    return <OrderWorkspace key={id} routeId={id} />;
}
function OrderWorkspace({ routeId }: { routeId: string }) {
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(false);
    const [terminal, setTerminal] = useState(false);
    const current = useRef(order);
    current.current = order;
    const pending = useRef<Promise<OrderDetail | null> | null>(null);
    const abort = useRef<AbortController | null>(null);
    const stopped = useRef(false);
    const refresh = useCallback(() => {
        if (pending.current) return pending.current;
        const controller = new AbortController();
        abort.current = controller;
        setLoading(true);
        pending.current = (async () => {
            try {
                const result = await storeApi.order(
                    storeId(routeId),
                    controller.signal,
                );
                if (controller.signal.aborted) return null;
                setOrder((previous) =>
                    !previous || result.version >= previous.version
                        ? result
                        : previous,
                );
                setError(null);
                return result;
            } catch (failure) {
                if (!controller.signal.aborted) {
                    setError(failure);
                    if (
                        failure instanceof ClientApiError &&
                        [400, 401, 403, 404].includes(failure.status)
                    ) {
                        setTerminal(true);
                        stopped.current = true;
                    }
                }
                return null;
            } finally {
                if (!controller.signal.aborted) setLoading(false);
                if (abort.current === controller) pending.current = null;
            }
        })();
        return pending.current;
    }, [routeId]);
    useEffect(() => {
        stopped.current = false;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        async function poll() {
            const result = await refresh();
            if (
                !cancelled &&
                !stopped.current &&
                !['completed', 'cancelled'].includes(
                    (result ?? current.current)?.status ?? '',
                )
            )
                timer = setTimeout(() => void poll(), 30_000);
        }
        void poll();
        const lost = () => {
            stopped.current = true;
            clearTimeout(timer);
            abort.current?.abort();
            pending.current = null;
            setLoading(false);
            setTerminal(true);
            setError(new ClientApiError(401, 'SESSION_LOST'));
        };
        window.addEventListener(SESSION_LOST, lost);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            abort.current?.abort();
            pending.current = null;
            window.removeEventListener(SESSION_LOST, lost);
        };
    }, [refresh]);
    const saved = (value: OrderDetail) =>
        setOrder((previous) =>
            !previous || value.version >= previous.version ? value : previous,
        );
    const document = (item: OrderDocument) => (
        <div className="store-document" key={item.id}>
            <div>
                <strong>{item.originalName}</strong>
                <p>
                    {new Date(item.createdAt).toLocaleString('ru-RU')} · Версия{' '}
                    {item.revision}
                </p>
            </div>
            <Button
                variant="secondary"
                disabled={!item.available || !item.downloadUrl || terminal}
                onClick={() => {
                    if (item.downloadUrl)
                        void downloadOrderDocument(
                            item.downloadUrl,
                            item.originalName,
                        ).catch(setError);
                }}
            >
                <Download size={16} />
                Скачать
            </Button>
        </div>
    );
    function lines(items: OrderLine[], quote = false) {
        return (
            <div className="store-order-lines">
                {items.map((line, index) => (
                    <article key={index}>
                        <div>
                            <strong>{line.nameSnapshot}</strong>
                            <p>{line.skuSnapshot}</p>
                        </div>
                        <span>
                            {line.quantity} шт. ×{' '}
                            {moneyMinor(
                                quote
                                    ? line.quotedUnitPriceMinor
                                    : line.catalogUnitPriceMinor,
                            )}
                        </span>
                        <strong>
                            {moneyMinor(
                                quote
                                    ? line.quotedLineTotalMinor
                                    : line.catalogLineTotalMinor,
                            )}
                        </strong>
                    </article>
                ))}
            </div>
        );
    }
    return (
        <div className="container store-page">
            <div className="store-heading">
                <div>
                    <Link to="/orders">Мои заказы</Link>
                    <h1>{!terminal && order ? order.orderNumber : 'Заказ'}</h1>
                    {order && !terminal && (
                        <span className="store-badge">
                            {orderLabels[order.status]}
                        </span>
                    )}
                </div>
                <Button
                    variant="secondary"
                    disabled={loading || terminal}
                    onClick={() => void refresh()}
                >
                    <RefreshCw size={16} />
                    Обновить заказ
                </Button>
            </div>
            {!!error && (
                <StoreError
                    error={error}
                    retry={terminal ? undefined : () => void refresh()}
                />
            )}
            {loading && !order && <StoreLoading />}
            {order && !terminal && (
                <>
                    <section className="store-section">
                        <h2>Состав заказа</h2>
                        {lines(order.lines)}
                        <p>
                            {order.hasUnpricedItems
                                ? 'Сумма позиций с указанной ценой'
                                : 'Сумма по каталогу'}
                            :{' '}
                            <strong>
                                {moneyMinor(order.catalogPricedSubtotalMinor)}
                            </strong>
                        </p>
                        {order.hasUnpricedItems && (
                            <p>Некоторые позиции требуют расчёта менеджером.</p>
                        )}
                    </section>
                    {order.confirmedQuote && (
                        <section className="store-section">
                            <h2>Согласованное предложение</h2>
                            {lines(order.confirmedQuote.lines ?? [], true)}
                            <h3>
                                Итого:{' '}
                                {moneyMinor(
                                    order.confirmedQuote.quotedTotalMinor,
                                )}
                            </h3>
                        </section>
                    )}
                    <section className="store-section">
                        <h2>Документы</h2>
                        {order.documents.currentInvoice ? (
                            document(order.documents.currentInvoice)
                        ) : (
                            <p>Счёт ещё не выставлен.</p>
                        )}
                        {order.documents.paymentProofs.map(document)}
                    </section>
                </>
            )}
            {order && !terminal && (
                <div>
                    <OrderPaymentProof
                        order={order}
                        refresh={refresh}
                        saved={saved}
                        blocked={terminal || !!error || loading}
                    />
                </div>
            )}
            {order && !terminal && (
                <>
                    {order.payment && (
                        <section className="store-section">
                            <h2>Оплата подтверждена</h2>
                            <p>
                                {new Date(
                                    order.payment.confirmedAt,
                                ).toLocaleString('ru-RU')}
                            </p>
                        </section>
                    )}
                    {order.fulfillment && (
                        <section className="store-section">
                            <h2>Исполнение заказа</h2>
                            <p>
                                {deliveryLabels[order.fulfillment.method]} ·{' '}
                                {new Date(
                                    order.fulfillment.fulfilledAt,
                                ).toLocaleString('ru-RU')}
                            </p>
                            <p>{order.fulfillment.recipientName}</p>
                            <p>
                                {order.fulfillment.carrierName}{' '}
                                {order.fulfillment.trackingNumber}
                            </p>
                        </section>
                    )}
                    {order.completion && (
                        <section className="store-section">
                            <h2>Заказ завершён</h2>
                            <p>
                                Реализация {order.completion.realizationNumber}{' '}
                                от {order.completion.realizationDate}
                            </p>
                            <p>
                                Документы:{' '}
                                {
                                    (
                                        {
                                            edo: 'ЭДО',
                                            paper: 'Бумажные',
                                            mixed: 'ЭДО и бумажные',
                                            not_required: 'Не требуются',
                                        } as Record<string, string>
                                    )[order.completion.documentDeliveryMethod]
                                }
                            </p>
                            {order.completion.documentsDeliveredAt && (
                                <p>
                                    Переданы:{' '}
                                    {new Date(
                                        order.completion.documentsDeliveredAt,
                                    ).toLocaleString('ru-RU')}
                                </p>
                            )}
                        </section>
                    )}
                    <section className="store-section">
                        <h2>Данные заказа</h2>
                        <dl className="store-facts">
                            {Object.entries({
                                Покупатель:
                                    order.organization?.name ??
                                    order.contact.name,
                                ИНН: order.organization?.inn,
                                Контакт: order.contact.name,
                                Телефон: order.contact.phone,
                                Почта: order.contact.email,
                                Получение: deliveryLabels[order.delivery.type],
                                Город: order.delivery.city,
                                Адрес: order.delivery.address,
                                'Комментарий к получению':
                                    order.delivery.comment,
                                Комментарий: order.customerComment,
                            })
                                .filter(([, value]) => value)
                                .map(([label, value]) => (
                                    <div key={label}>
                                        <dt>{label}</dt>
                                        <dd>{value}</dd>
                                    </div>
                                ))}
                        </dl>
                    </section>
                    <section className="store-section">
                        <h2>История заказа</h2>
                        <ol className="store-timeline">
                            {order.events.map((event) => (
                                <li key={event.id}>
                                    <strong>
                                        {eventLabels[event.type] ??
                                            'Заказ обновлён'}
                                    </strong>
                                    <time>
                                        {new Date(
                                            event.createdAt,
                                        ).toLocaleString('ru-RU')}
                                    </time>
                                    {event.message && <p>{event.message}</p>}
                                </li>
                            ))}
                        </ol>
                    </section>
                </>
            )}
        </div>
    );
}
