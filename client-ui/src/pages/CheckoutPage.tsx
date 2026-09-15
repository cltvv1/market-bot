import { ArrowRight, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input, Select, Textarea } from '../components/ui';
import {
    beginNewSession,
    ClientApiError,
    storeApi,
    storeError,
} from '../features/store/api';
import { useHydratedCart } from '../features/store/cart/use-hydrated-cart';
import {
    createAttempt,
    currentCheckoutSession,
    submitAttempt,
    type CheckoutAttempt,
} from '../features/store/checkout/attempt';
import {
    cartTotals,
    checkoutPayload,
    deliveryLabels,
    hydrateCart,
    initialCheckout,
    moneyMinor,
    type CheckoutFields,
} from '../features/store/model';
import { StoreError, StoreLoading } from '../features/store/StoreUI';
import { useStoreRead } from '../features/store/use-store-read';

export function CheckoutPage() {
    const navigate = useNavigate();
    const cart = useHydratedCart();
    const organizations = useStoreRead(
        'checkout-organizations',
        storeApi.organizations,
    );
    const [values, setValues] = useState(initialCheckout);
    const [busy, setBusy] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState('');
    const [lost, setLost] = useState(false);
    const attempt = useRef<CheckoutAttempt | null>(null);
    const submitting = useRef(false);
    useEffect(() => {
        if (!uncertain && !busy) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [uncertain, busy]);
    function change<K extends keyof CheckoutFields>(
        key: K,
        value: CheckoutFields[K],
    ) {
        setValues((current) => ({ ...current, [key]: value }));
    }
    async function submit(retry = false) {
        if (submitting.current || (uncertain && !retry)) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        let dispatched = false;
        try {
            if (!retry) {
                const payload = checkoutPayload(values, cart.lines);
                const latest = await storeApi.resolve(
                    payload.items.map((line) => line.productId),
                );
                if (
                    cartTotals(hydrateCart(payload.items, latest.items)).blocked
                ) {
                    await cart.refresh();
                    throw new Error(
                        'В корзине есть недоступные товары. Вернитесь в корзину и удалите их.',
                    );
                }
                await beginNewSession();
                const session = await currentCheckoutSession();
                attempt.current = createAttempt(payload, session.expiresAt);
            }
            if (!attempt.current) return;
            dispatched = true;
            const result = await submitAttempt(attempt.current);
            attempt.current = null;
            setUncertain(false);
            cart.clear();
            void navigate(`/orders/${result.id}`, { replace: true });
        } catch (failure) {
            const unknown =
                dispatched &&
                (!(failure instanceof ClientApiError) || failure.uncertain);
            if (unknown || retry) setUncertain(true);
            else attempt.current = null;
            if (
                retry &&
                failure instanceof ClientApiError &&
                failure.status === 401
            )
                setLost(true);
            setError(
                failure instanceof ClientApiError
                    ? storeError(failure)
                    : failure instanceof Error
                      ? failure.message
                      : 'Проверьте данные.',
            );
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    }
    const field = (
        key:
            | 'organizationName'
            | 'inn'
            | 'kpp'
            | 'name'
            | 'phone'
            | 'email'
            | 'city'
            | 'address',
        label: string,
        maxLength: number,
        required = false,
        pattern?: string,
    ) => (
        <Input
            name={key}
            label={label}
            maxLength={maxLength}
            required={required}
            pattern={pattern}
            type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
            value={values[key]}
            onChange={(event) => change(key, event.target.value)}
        />
    );
    return (
        <div className="container store-page">
            <div className="store-heading">
                <div>
                    <Link to="/cart">Корзина</Link>
                    <h1>Оформление заказа</h1>
                    <p>После проверки менеджер подготовит счёт.</p>
                </div>
                <Link to="/orders">Мои заказы</Link>
            </div>
            {uncertain && (
                <section className="store-error" role="alert">
                    <h2>Результат отправки пока не подтверждён</h2>
                    <p>
                        Корзина сохранена. Не оформляйте новый заказ: повтор
                        ниже отправит тот же запрос. Не закрывайте эту вкладку
                        до проверки.
                    </p>
                    <Link to="/orders" target="_blank" rel="noopener">
                        Посмотреть мои заказы в новой вкладке
                    </Link>
                    <Button
                        disabled={busy || lost}
                        onClick={() => void submit(true)}
                    >
                        <RefreshCw size={17} />
                        Повторить тот же запрос
                    </Button>
                </section>
            )}
            {error && (
                <p className="store-error" role="alert">
                    {error}
                </p>
            )}
            {!!cart.error && (
                <StoreError
                    error={cart.error}
                    retry={() => void cart.refresh()}
                />
            )}
            {cart.loading && <StoreLoading />}
            {!cart.lines.length && !uncertain ? (
                <p className="store-empty">
                    Корзина пуста. <Link to="/catalog">Выбрать товары</Link>
                </p>
            ) : (
                <div className="store-checkout">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            void submit();
                        }}
                    >
                        <fieldset disabled={busy || uncertain}>
                            <legend>Покупатель</legend>
                            <div className="store-segmented">
                                {(['organization', 'individual'] as const).map(
                                    (type) => (
                                        <label key={type}>
                                            <input
                                                type="radio"
                                                name="customerType"
                                                value={type}
                                                checked={
                                                    values.customerType === type
                                                }
                                                onChange={() =>
                                                    change('customerType', type)
                                                }
                                            />
                                            {type === 'organization'
                                                ? 'Организация'
                                                : 'Физлицо'}
                                        </label>
                                    ),
                                )}
                            </div>
                            {values.customerType === 'organization' && (
                                <>
                                    {!!organizations.data?.length && (
                                        <Select
                                            name="organizationId"
                                            label="Моя организация"
                                            value={values.organizationId}
                                            onChange={(event) =>
                                                change(
                                                    'organizationId',
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            <option value="">
                                                Другая организация
                                            </option>
                                            {organizations.data.map((item) => (
                                                <option
                                                    key={item.id}
                                                    value={item.organization.id}
                                                >
                                                    {item.organization.name ||
                                                        item.organization
                                                            .inn}{' '}
                                                    · {item.organization.inn}
                                                </option>
                                            ))}
                                        </Select>
                                    )}
                                    {organizations.error &&
                                        !(
                                            organizations.error instanceof
                                                ClientApiError &&
                                            organizations.error.status === 401
                                        ) && (
                                            <StoreError
                                                error={organizations.error}
                                                retry={() =>
                                                    void organizations.refresh()
                                                }
                                            />
                                        )}
                                    {!values.organizationId && (
                                        <div className="store-form-grid">
                                            {field(
                                                'organizationName',
                                                'Наименование организации',
                                                300,
                                                true,
                                            )}
                                            {field(
                                                'inn',
                                                'ИНН',
                                                12,
                                                true,
                                                '[0-9]{10}([0-9]{2})?',
                                            )}
                                            {field(
                                                'kpp',
                                                'КПП',
                                                9,
                                                false,
                                                '[0-9]{9}',
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </fieldset>
                        <fieldset disabled={busy || uncertain}>
                            <legend>Контакт</legend>
                            <div className="store-form-grid">
                                {field('name', 'Контактное лицо', 160, true)}
                                {field('phone', 'Телефон', 30, true)}
                                {field('email', 'Электронная почта', 254)}
                            </div>
                        </fieldset>
                        <fieldset disabled={busy || uncertain}>
                            <legend>Получение</legend>
                            <Select
                                name="deliveryType"
                                label="Способ получения"
                                value={values.deliveryType}
                                onChange={(event) =>
                                    change(
                                        'deliveryType',
                                        event.target
                                            .value as CheckoutFields['deliveryType'],
                                    )
                                }
                            >
                                {['pickup', 'courier', 'transport_company'].map(
                                    (type) => (
                                        <option key={type} value={type}>
                                            {deliveryLabels[type]}
                                        </option>
                                    ),
                                )}
                            </Select>
                            <div className="store-form-grid">
                                {field(
                                    'city',
                                    'Город',
                                    160,
                                    values.deliveryType !== 'pickup',
                                )}
                                {field(
                                    'address',
                                    'Адрес',
                                    500,
                                    values.deliveryType === 'courier',
                                )}
                            </div>
                            <Textarea
                                name="deliveryComment"
                                label="Комментарий к получению"
                                maxLength={1000}
                                value={values.deliveryComment}
                                onChange={(event) =>
                                    change(
                                        'deliveryComment',
                                        event.target.value,
                                    )
                                }
                            />
                            <Textarea
                                name="comment"
                                label="Комментарий к заказу"
                                maxLength={2000}
                                value={values.comment}
                                onChange={(event) =>
                                    change('comment', event.target.value)
                                }
                            />
                        </fieldset>
                        {!uncertain && (
                            <Button
                                type="submit"
                                disabled={
                                    busy ||
                                    cart.loading ||
                                    !!cart.error ||
                                    cart.totals.blocked
                                }
                            >
                                {busy
                                    ? 'Отправляем заказ'
                                    : 'Передать заказ менеджеру'}
                                <ArrowRight size={18} />
                            </Button>
                        )}
                        <p className="store-muted">
                            Заказ будет доступен в этом браузере. Данные
                            используются для его обработки согласно{' '}
                            <Link to="/privacy">
                                политике конфиденциальности
                            </Link>
                            .
                        </p>
                    </form>
                    <aside className="store-order-summary">
                        <h2>Ваш заказ</h2>
                        {cart.items.map((item) => (
                            <div
                                className="store-summary-line"
                                key={item.productId}
                            >
                                <span>
                                    {item.product?.name ??
                                        `Недоступный товар #${item.productId}`}
                                </span>
                                <span>{item.quantity} шт.</span>
                            </div>
                        ))}
                        <h3>
                            {cart.totals.unpriced
                                ? 'Сумма позиций с ценой'
                                : 'Сумма по каталогу'}
                        </h3>
                        <strong>{moneyMinor(cart.totals.subtotal)}</strong>
                        {cart.totals.unpriced && (
                            <p>
                                Стоимость остальных позиций рассчитает менеджер.
                            </p>
                        )}
                        <p>
                            Это не онлайн-оплата. Счёт появится после
                            согласования заказа.
                        </p>
                    </aside>
                </div>
            )}
        </div>
    );
}
