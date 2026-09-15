import { Link, useSearchParams } from 'react-router-dom';
import { storeApi } from '../api';
import { moneyMinor, orderLabels } from '../model';
import { Pagination, StoreError, StoreLoading } from '../StoreUI';
import { useStoreRead } from '../use-store-read';
export function OrderListPage() {
    const [params, setParams] = useSearchParams();
    const status = params.get('status') ?? '';
    const query = new URLSearchParams({
        page: params.get('page') ?? '1',
        limit: '20',
        ...(status ? { status } : {}),
    }).toString();
    const result = useStoreRead(query, (signal) =>
        storeApi.orders(query, signal),
    );
    return (
        <div className="container store-page">
            <div className="store-heading">
                <div>
                    <h1>Мои заказы</h1>
                    <p>Заказы, оформленные в этой сессии браузера.</p>
                </div>
                <Link className="button button--secondary" to="/catalog">
                    Каталог
                </Link>
            </div>
            <label className="field store-status-filter">
                <span>Статус заказа</span>
                <select
                    value={status}
                    onChange={(event) =>
                        setParams(
                            event.target.value
                                ? { status: event.target.value }
                                : {},
                        )
                    }
                >
                    <option value="">Все статусы</option>
                    {Object.entries(orderLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
            {result.loading ? (
                <StoreLoading />
            ) : result.error ? (
                <StoreError
                    error={result.error}
                    retry={() => void result.refresh()}
                />
            ) : (
                result.data && (
                    <>
                        {result.data.items.length ? (
                            <div className="store-orders">
                                {result.data.items.map((order) => (
                                    <Link
                                        key={order.id}
                                        className="store-order-row"
                                        to={`/orders/${order.id}`}
                                    >
                                        <div>
                                            <strong>{order.orderNumber}</strong>
                                            <p>
                                                {new Date(
                                                    order.createdAt,
                                                ).toLocaleString('ru-RU')}
                                            </p>
                                        </div>
                                        <span className="store-badge">
                                            {orderLabels[order.status]}
                                        </span>
                                        <div>
                                            <strong>
                                                {moneyMinor(
                                                    order.confirmedQuote
                                                        ?.quotedTotalMinor ??
                                                        order.catalogTotalMinor,
                                                )}
                                            </strong>
                                            <p>
                                                {order.itemCount} поз. ·{' '}
                                                {order.confirmedQuote
                                                    ? 'Согласовано'
                                                    : 'По каталогу'}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="store-empty">
                                Заказы по этим условиям не найдены.
                            </p>
                        )}
                        <Pagination page={result.data} />
                    </>
                )
            )}
        </div>
    );
}
