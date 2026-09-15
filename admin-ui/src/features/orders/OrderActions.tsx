import { useId, useRef, useState, type FormEvent } from 'react';
import {
    Check,
    FileUp,
    Pencil,
    Play,
    UserRound,
    Truck,
    CheckCheck,
} from 'lucide-react';
import { ApiError } from '../../api';
import { Dialog } from '../../app/Dialog';
import { useRead } from '../../app/use-read';
import { money, orderCommand, orderError } from './api';
import {
    actionLabels,
    reasonLabels,
    orderStatuses,
    documentKinds,
    documentMethods,
    fulfillmentMethods,
    paymentSources,
    type ActionDecision,
    type Manager,
    type OrderAction,
    type OrderDetail,
} from './types';
import { OrderQuoteEditor, type EditedLine } from './OrderQuoteEditor';
import { minorFromInput, priceInput } from './api';

const icons = {
    assign: UserRound,
    review: Play,
    quote: Pencil,
    confirm: Check,
    invoice: FileUp,
    payment: Check,
    fulfill: Truck,
    complete: CheckCheck,
};
export function OrderActionButton({
    action,
    decision,
    disabled,
    onClick,
}: {
    action: OrderAction;
    decision: ActionDecision;
    disabled?: boolean;
    onClick: () => void;
}) {
    const id = useId();
    const Icon = icons[action];
    return (
        <div className="ord-action">
            <button
                className="admin-button"
                disabled={disabled || !decision.allowed}
                aria-describedby={decision.reason ? id : undefined}
                onClick={onClick}
            >
                <Icon size={16} />
                {actionLabels[action]}
            </button>
            {decision.reason && (
                <small id={id}>{reasonLabels[decision.reason]}</small>
            )}
        </div>
    );
}
export function OrderActionDialog({
    selection,
    order,
    loading,
    onChanged,
    onClose,
}: {
    selection: { action: OrderAction; version: number };
    order: OrderDetail;
    loading: boolean;
    onChanged: () => void;
    onClose: () => void;
}) {
    const action = selection.action;
    const [version, setVersion] = useState(selection.version);
    const [busy, setBusy] = useState(false);
    const submitting = useRef(false);
    const [error, setError] = useState('');
    const [uncertain, setUncertain] = useState(false);
    const [lines, setLines] = useState<EditedLine[]>(() =>
        (order.quote?.lines || []).map((line) => ({
            productId: line.productId,
            name: line.nameSnapshot,
            quantity: String(line.quantity),
            price: priceInput(line.quotedUnitPriceMinor),
        })),
    );
    const [method, setMethod] = useState(order.delivery.type);
    const [documentMethod, setDocumentMethod] = useState('paper');
    const managers = useRead<{ items: Manager[]; version: number }>(
        action === 'assign' ? `/admin/api/orders/${order.id}/assignees` : null,
        order.version,
    );
    const needsReview = uncertain || version !== order.version;
    const current = order.actions[action];
    const text = (form: FormData, key: string) => {
        const value = form.get(key);
        return typeof value === 'string' ? value.trim() : '';
    };
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (
            submitting.current ||
            busy ||
            loading ||
            needsReview ||
            !current.allowed
        )
            return;
        const form = new FormData(event.currentTarget);
        let values: Record<string, unknown> | FormData = {};
        setError('');
        try {
            if (action === 'assign')
                values = { managerId: Number(text(form, 'managerId')) };
            if (action === 'quote') {
                if (!lines.length || lines.length > 100)
                    throw new Error(
                        'В предложении должно быть от 1 до 100 позиций.',
                    );
                values = {
                    internalComment: text(form, 'internalComment') || null,
                    lines: lines.map((line) => {
                        if (
                            !/^\d{1,4}$/.test(line.quantity) ||
                            Number(line.quantity) < 1 ||
                            Number(line.quantity) > 1000
                        )
                            throw new Error(
                                'Количество: целое число от 1 до 1000.',
                            );
                        return {
                            productId: line.productId,
                            quantity: Number(line.quantity),
                            quotedUnitPriceMinor: minorFromInput(line.price),
                        };
                    }),
                };
            }
            if (action === 'invoice') {
                const file = form.get('file');
                if (
                    !(file instanceof File) ||
                    !file.size ||
                    file.size > 15 * 1024 * 1024 ||
                    !/\.pdf$/i.test(file.name)
                )
                    throw new Error('Выберите PDF-файл размером до 15 МиБ.');
                values = new FormData();
                values.append('file', file);
            }
            if (['payment', 'fulfill', 'complete'].includes(action)) {
                values = {};
                for (const key of [
                    'source',
                    'method',
                    'recipientName',
                    'carrierName',
                    'trackingNumber',
                    'comment',
                    'realizationNumber',
                    'realizationDate',
                    'documentDeliveryMethod',
                ])
                    if (form.has(key) && text(form, key))
                        values[key] = text(form, key);
                for (const key of [
                    'paymentReceivedAt',
                    'fulfilledAt',
                    'documentsDeliveredAt',
                ])
                    if (text(form, key))
                        values[key] = new Date(text(form, key)).toISOString();
                if (action === 'complete')
                    values.documentKinds = form.getAll('documentKinds');
            }
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : 'Проверьте поля формы.',
            );
            return;
        }
        submitting.current = true;
        setBusy(true);
        try {
            await orderCommand(order.id, action, version, values);
            onChanged();
            onClose();
        } catch (caught) {
            setError(orderError(caught));
            setUncertain(
                !(caught instanceof ApiError) ||
                    caught.status >= 500 ||
                    caught.status === 409,
            );
            onChanged();
            if (
                caught instanceof ApiError &&
                [401, 403, 404].includes(caught.status)
            )
                onClose();
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }
    return (
        <Dialog title={actionLabels[action]} onClose={onClose} busy={busy}>
            <form className="ord-form" onSubmit={(event) => void submit(event)}>
                <p className="admin-muted">
                    {order.orderNumber} · {money(order.quote?.quotedTotalMinor)}{' '}
                    · версия {version}
                </p>
                <fieldset disabled={busy}>
                    {action === 'assign' && (
                        <>
                            <label>
                                Менеджер
                                <select
                                    aria-label="Менеджер"
                                    name="managerId"
                                    required
                                    defaultValue={
                                        order.assignedManager?.id || ''
                                    }
                                >
                                    <option value="">Выберите менеджера</option>
                                    {managers.data?.items.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.displayName}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {managers.loading ? (
                                <p role="status">Загружаем менеджеров…</p>
                            ) : managers.error ? (
                                <p role="alert">
                                    Список недоступен.{' '}
                                    <button
                                        type="button"
                                        className="admin-button"
                                        onClick={managers.retry}
                                    >
                                        Повторить
                                    </button>
                                </p>
                            ) : !managers.data?.items.length ? (
                                <p role="status">
                                    Нет активных менеджеров с подходящими
                                    правами.
                                </p>
                            ) : null}
                        </>
                    )}
                    {action === 'review' && (
                        <p>
                            Начать согласование заказа и подготовить предложение
                            по исходному запросу клиента?
                        </p>
                    )}
                    {action === 'quote' && (
                        <>
                            <OrderQuoteEditor
                                lines={lines}
                                onChange={setLines}
                            />
                            <label>
                                Внутренний комментарий
                                <textarea
                                    name="internalComment"
                                    maxLength={2000}
                                    defaultValue={
                                        order.quote?.internalComment || ''
                                    }
                                />
                            </label>
                        </>
                    )}
                    {action === 'confirm' && (
                        <p>
                            Зафиксировать текущее предложение на сумму{' '}
                            {money(order.quote?.quotedTotalMinor)}? После
                            согласования состав и цены не редактируются.
                        </p>
                    )}
                    {action === 'invoice' && (
                        <>
                            <label>
                                Счёт PDF
                                <input
                                    name="file"
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    required
                                />
                            </label>
                            <p className="admin-muted">
                                До 15 МиБ. Новый счёт заменит текущий;
                                предыдущая редакция останется в истории.
                            </p>
                        </>
                    )}
                    {action === 'payment' && (
                        <>
                            <p>
                                Подтверждается поступление оплаты за весь заказ.
                                Присланная клиентом платёжка сама по себе не
                                подтверждает зачисление денег.
                            </p>
                            <label>
                                Основание
                                <select name="source" aria-label="Основание">
                                    {Object.entries(paymentSources).map(
                                        ([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>
                            <label>
                                Дата поступления
                                <input
                                    type="datetime-local"
                                    name="paymentReceivedAt"
                                />
                            </label>
                            <Comment />
                        </>
                    )}
                    {action === 'fulfill' && (
                        <>
                            <label>
                                Способ исполнения
                                <select
                                    aria-label="Способ исполнения"
                                    name="method"
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value)}
                                >
                                    {Object.entries(fulfillmentMethods).map(
                                        ([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>
                            <label>
                                Дата исполнения
                                <input
                                    name="fulfilledAt"
                                    type="datetime-local"
                                />
                            </label>
                            <label>
                                Получатель
                                <input name="recipientName" maxLength={160} />
                            </label>
                            {method !== 'service_only' && (
                                <>
                                    <label>
                                        Перевозчик
                                        <input
                                            name="carrierName"
                                            maxLength={160}
                                            required={
                                                method === 'transport_company'
                                            }
                                        />
                                    </label>
                                    <label>
                                        Трек-номер
                                        <input
                                            name="trackingNumber"
                                            maxLength={160}
                                        />
                                    </label>
                                </>
                            )}
                            <Comment
                                required={
                                    method === 'mixed' ||
                                    method === 'service_only' ||
                                    method !== order.delivery.type
                                }
                            />
                            <p className="admin-muted">
                                Подтверждается исполнение заказа целиком.
                            </p>
                        </>
                    )}
                    {action === 'complete' && (
                        <>
                            <label>
                                Номер реализации
                                <input
                                    name="realizationNumber"
                                    required
                                    maxLength={100}
                                />
                            </label>
                            <label>
                                Дата реализации
                                <input
                                    name="realizationDate"
                                    type="date"
                                    required
                                />
                            </label>
                            <label>
                                Передача документов
                                <select
                                    aria-label="Передача документов"
                                    name="documentDeliveryMethod"
                                    value={documentMethod}
                                    onChange={(e) =>
                                        setDocumentMethod(e.target.value)
                                    }
                                >
                                    {Object.entries(documentMethods)
                                        .filter(
                                            ([value]) =>
                                                value !== 'not_required' ||
                                                order.customerType ===
                                                    'individual',
                                        )
                                        .map(([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                </select>
                            </label>
                            {documentMethod !== 'not_required' && (
                                <>
                                    <fieldset className="ord-checks">
                                        <legend>Переданные документы</legend>
                                        {Object.entries(documentKinds).map(
                                            ([value, label]) => (
                                                <label key={value}>
                                                    <input
                                                        type="checkbox"
                                                        name="documentKinds"
                                                        value={value}
                                                    />
                                                    {label}
                                                </label>
                                            ),
                                        )}
                                    </fieldset>
                                    <label>
                                        Дата передачи
                                        <input
                                            name="documentsDeliveredAt"
                                            type="datetime-local"
                                        />
                                    </label>
                                </>
                            )}
                            <Comment
                                required={documentMethod === 'not_required'}
                            />
                            <p className="admin-muted">
                                Фиксируются внутренние факты реализации и
                                передачи документов. Это не подтверждение
                                синхронизации с 1С или ЭДО.
                            </p>
                        </>
                    )}
                </fieldset>
                {error && (
                    <p className="ord-error" role="alert">
                        {error}
                    </p>
                )}
                {needsReview && (
                    <div className="ord-reconcile" role="status">
                        <strong>Требуется сверка</strong>
                        <p>
                            Текущая версия: {order.version}. Статус:{' '}
                            {orderStatuses[order.status]}. Менеджер:{' '}
                            {order.assignedManager?.displayName ||
                                'не назначен'}
                            . Сумма: {money(order.quote?.quotedTotalMinor)}.
                        </p>
                        {action === 'quote' && (
                            <ul>
                                {order.quote?.lines.map((line) => (
                                    <li key={line.productId}>
                                        {line.nameSnapshot}: {line.quantity} ×{' '}
                                        {money(line.quotedUnitPriceMinor)}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p>
                            Введённые данные сохранены. Сверьте заказ; повторная
                            отправка выполняется только вручную.
                        </p>
                        <button
                            type="button"
                            className="admin-button"
                            disabled={loading || busy || !current.allowed}
                            onClick={() => {
                                setVersion(order.version);
                                setUncertain(false);
                                setError('');
                            }}
                        >
                            Данные сверены, продолжить
                        </button>
                        <button
                            type="button"
                            className="admin-button"
                            disabled={busy}
                            onClick={onChanged}
                        >
                            Обновить заказ
                        </button>
                    </div>
                )}
                {!current.allowed && (
                    <p role="status">
                        {current.reason
                            ? reasonLabels[current.reason]
                            : 'Действие недоступно'}
                    </p>
                )}
                <footer className="ord-form-footer">
                    <button
                        type="button"
                        className="admin-button"
                        disabled={busy}
                        onClick={onClose}
                    >
                        Отмена
                    </button>
                    <button
                        className="admin-button admin-button--primary"
                        disabled={
                            busy ||
                            loading ||
                            needsReview ||
                            !current.allowed ||
                            (action === 'assign' &&
                                (managers.loading ||
                                    !managers.data?.items.length ||
                                    managers.data.version !== version))
                        }
                    >
                        {busy ? 'Сохраняем…' : actionLabels[action]}
                    </button>
                </footer>
            </form>
        </Dialog>
    );
}
function Comment({ required = false }: { required?: boolean }) {
    return (
        <label>
            Комментарий
            <textarea name="comment" required={required} maxLength={1000} />
        </label>
    );
}
