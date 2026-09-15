import { useEffect, useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { ApiError } from '../../api';
import { Dialog } from '../../app/Dialog';
import { fmtDate } from '../../format';
import { money, orderDocumentUrl, orderError } from './api';
import {
    orderStatuses,
    type OrderDetail,
    type OrderDocument,
    type OrderLine,
} from './types';

export function OrderLines({
    lines,
    quote = false,
}: {
    lines: OrderLine[];
    quote?: boolean;
}) {
    return (
        <div className="ord-table-scroll">
            <table className="ord-lines">
                <caption>
                    {quote ? 'Текущее предложение' : 'Исходный запрос клиента'}
                </caption>
                <thead>
                    <tr>
                        <th>Позиция</th>
                        <th>Кол-во</th>
                        <th>Цена, ₽</th>
                        <th>Сумма, ₽</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((line) => (
                        <tr key={line.productId}>
                            <td>
                                <strong>{line.nameSnapshot}</strong>
                                <small>{line.skuSnapshot}</small>
                            </td>
                            <td>{line.quantity}</td>
                            <td>
                                {money(
                                    quote
                                        ? line.quotedUnitPriceMinor
                                        : line.catalogUnitPriceMinor,
                                )}
                            </td>
                            <td>
                                {money(
                                    quote
                                        ? line.quotedLineTotalMinor
                                        : line.catalogLineTotalMinor,
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
export function OrderDocuments({
    orderId,
    documents,
    title,
}: {
    orderId: number;
    documents: OrderDocument[];
    title: string;
}) {
    const [selected, setSelected] = useState<OrderDocument | null>(null);
    return (
        <section className="ord-section">
            <h2>{title}</h2>
            {documents.length ? (
                <ul className="ord-documents">
                    {[...documents].reverse().map((doc) => (
                        <li key={doc.id}>
                            <div>
                                <strong>{doc.originalName}</strong>
                                <small>
                                    {fmtDate(doc.createdAt)} ·{' '}
                                    {Math.ceil(doc.sizeBytes / 1024)} КиБ
                                    {doc.type === 'invoice'
                                        ? ` · редакция ${doc.revision}`
                                        : ''}
                                    {doc.status === 'superseded'
                                        ? ' · заменён'
                                        : ''}
                                </small>
                                {doc.amountMinorSnapshot && (
                                    <span>
                                        {money(doc.amountMinorSnapshot)}
                                    </span>
                                )}
                            </div>
                            {doc.available &&
                            orderDocumentUrl(
                                orderId,
                                doc.id,
                                doc.downloadUrl,
                            ) ? (
                                <button
                                    className="admin-button"
                                    onClick={() => setSelected(doc)}
                                >
                                    <Eye size={16} />
                                    Просмотреть
                                </button>
                            ) : (
                                <span className="admin-muted">
                                    Файл недоступен
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="admin-muted">Документы не загружены</p>
            )}
            {selected && (
                <DocumentPreview
                    key={selected.id}
                    orderId={orderId}
                    document={selected}
                    close={() => setSelected(null)}
                />
            )}
        </section>
    );
}
function DocumentPreview({
    orderId,
    document,
    close,
}: {
    orderId: number;
    document: OrderDocument;
    close: () => void;
}) {
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        let objectUrl = '';
        const path = orderDocumentUrl(
            orderId,
            document.id,
            document.downloadUrl,
        );
        async function load() {
            try {
                if (!path) throw new ApiError('', 404);
                const response = await fetch(path, {
                    credentials: 'include',
                    signal: controller.signal,
                });
                if (!response.ok) {
                    if (response.status === 401)
                        window.dispatchEvent(new Event('vitma:unauthorized'));
                    if (response.status === 403)
                        window.dispatchEvent(
                            new CustomEvent('vitma:forbidden'),
                        );
                    throw new ApiError('', response.status);
                }
                const blob = await response.blob();
                if (controller.signal.aborted) return;
                if (
                    ![
                        'application/pdf',
                        'image/jpeg',
                        'image/png',
                        'image/webp',
                    ].includes(blob.type)
                )
                    throw new ApiError('', 404);
                objectUrl = URL.createObjectURL(blob);
                setUrl(objectUrl);
            } catch (caught) {
                if (!controller.signal.aborted) setError(orderError(caught));
            }
        }
        void load();
        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [document.id, document.downloadUrl, orderId]);
    return (
        <Dialog title={document.originalName} onClose={close}>
            <div className="ord-preview">
                {error ? (
                    <p role="alert">{error}</p>
                ) : url ? (
                    <>
                        {document.mimeType === 'application/pdf' ? (
                            <iframe title="Предпросмотр документа" src={url} />
                        ) : (
                            <img src={url} alt="Платёжный документ клиента" />
                        )}
                        <a
                            className="admin-button"
                            href={url}
                            download={document.originalName}
                        >
                            <Download size={16} />
                            Скачать документ
                        </a>
                    </>
                ) : (
                    <p role="status">Загружаем документ…</p>
                )}
            </div>
        </Dialog>
    );
}
const eventLabels: Record<string, string> = {
    submitted: 'Заказ принят',
    manager_assigned: 'Назначен менеджер',
    manager_reassigned: 'Изменён менеджер',
    review_started: 'Начато согласование',
    quote_updated: 'Обновлено предложение',
    confirmed: 'Заказ согласован',
    invoice_issued: 'Выставлен счёт',
    invoice_replaced: 'Обновлён счёт',
    payment_proof_received: 'Получен платёжный документ',
    payment_confirmed: 'Оплата подтверждена',
    fulfilled: 'Исполнение подтверждено',
    completed: 'Заказ завершён',
    cancelled: 'Заказ отменён',
};
export function OrderHistory({ order }: { order: OrderDetail }) {
    return (
        <section className="ord-section">
            <h2>История заказа</h2>
            {order.history.hasMore && (
                <p className="admin-muted">
                    Показаны последние {order.history.limit} событий.
                </p>
            )}
            <ol className="ord-history">
                {[...order.events].reverse().map((event) => (
                    <li key={event.id}>
                        <time>{fmtDate(event.createdAt)}</time>
                        <div>
                            <strong>
                                {eventLabels[event.type] || 'Изменение заказа'}
                            </strong>
                            <small>
                                {event.actor?.displayName ||
                                    (event.actorStaffId
                                        ? 'Сотрудник'
                                        : 'Клиент / система')}
                                {event.toStatus
                                    ? ` · ${orderStatuses[event.toStatus]}`
                                    : ''}
                            </small>
                            {event.metadata.quoteRevision != null && (
                                <span>
                                    Редакция предложения{' '}
                                    {event.metadata.quoteRevision}
                                </span>
                            )}
                            {['review_started', 'quote_updated'].includes(
                                event.type,
                            ) &&
                                event.metadata.revision != null && (
                                    <span>
                                        Редакция предложения{' '}
                                        {event.metadata.revision}
                                    </span>
                                )}
                            {['invoice_issued', 'invoice_replaced'].includes(
                                event.type,
                            ) &&
                                event.metadata.documentRevision != null && (
                                    <span>
                                        Редакция счёта{' '}
                                        {event.metadata.documentRevision}
                                    </span>
                                )}
                            {event.metadata.quotedTotalMinor != null && (
                                <span>
                                    {money(
                                        String(event.metadata.quotedTotalMinor),
                                    )}
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}
