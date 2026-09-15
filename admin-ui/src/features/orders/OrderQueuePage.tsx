import { useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { ReadState } from '../../app/primitives';
import { fmtDate } from '../../format';
import { money, orderQueueQuery, ordersPath } from './api';
import { orderStatuses, type OrderList } from './types';

export function OrderQueuePage() {
    const [params, setParams] = useSearchParams();
    const query = orderQueueQuery(params);
    const { revision } = useSession();
    const location = useLocation();
    const result = useRead<OrderList>(`/admin/api/orders?${query}`, revision);
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const state: unknown = location.state;
        if (
            state &&
            typeof state === 'object' &&
            'selectedId' in state &&
            typeof state.selectedId === 'number'
        )
            root.current
                ?.querySelector<HTMLAnchorElement>(
                    `[data-order-id="${state.selectedId}"] a`,
                )
                ?.focus();
    }, [location.state, result.data]);
    function change(key: string, value: string) {
        const next = new URLSearchParams(query);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.set('page', '1');
        setParams(next);
    }
    const data = result.data;
    return (
        <div className="ord-workspace" ref={root}>
            <header className="admin-page-heading">
                <div>
                    <p className="admin-eyebrow">Продажи</p>
                    <h1>Заказы</h1>
                </div>
                <span className="admin-muted">
                    {data ? `${data.total} заказов` : ''}
                </span>
            </header>
            <div className="ord-filters">
                <form
                    className="ord-search"
                    key={query.get('search') || ''}
                    onSubmit={(event) => {
                        event.preventDefault();
                        const search = new FormData(event.currentTarget).get(
                            'search',
                        );
                        change(
                            'search',
                            typeof search === 'string' ? search : '',
                        );
                    }}
                >
                    <label>
                        Поиск
                        <input
                            name="search"
                            maxLength={200}
                            defaultValue={query.get('search') || ''}
                            placeholder="Номер, ИНН, организация, телефон"
                        />
                    </label>
                    <button
                        className="admin-icon-button"
                        aria-label="Найти заказы"
                    >
                        <Search size={19} />
                    </button>
                </form>
                <label>
                    Статус
                    <select
                        aria-label="Статус"
                        value={query.get('status') || ''}
                        onChange={(e) => change('status', e.target.value)}
                    >
                        <option value="">Все статусы</option>
                        {Object.entries(orderStatuses).map(([value, title]) => (
                            <option key={value} value={value}>
                                {title}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Менеджер
                    <select
                        aria-label="Менеджер"
                        value={query.get('scope') || 'all'}
                        onChange={(e) => change('scope', e.target.value)}
                    >
                        <option value="all">Все заказы</option>
                        <option value="mine">Мои заказы</option>
                        <option value="unassigned">Не назначены</option>
                    </select>
                </label>
            </div>
            {result.loading && (
                <p role="status" className="admin-muted">
                    Обновляем очередь…
                </p>
            )}
            {!data ? (
                <ReadState {...result} />
            ) : data.items.length ? (
                <div className="ord-queue" aria-label="Очередь заказов">
                    <div className="ord-queue-head" aria-hidden="true">
                        <span>Заказ / клиент</span>
                        <span>Этап</span>
                        <span>Менеджер</span>
                        <span>Сумма</span>
                        <span />
                    </div>
                    {data.items.map((row) => (
                        <article
                            key={row.id}
                            data-order-id={row.id}
                            className="ord-queue-row"
                        >
                            <div>
                                <Link
                                    className="ord-order-link"
                                    to={`${ordersPath}/${row.id}`}
                                    state={{
                                        queueUrl: `${ordersPath}?${query}`,
                                    }}
                                >
                                    {row.orderNumber}
                                    <span className="ord-customer">
                                        {row.organization?.name ||
                                            row.contact.name}
                                    </span>
                                </Link>
                                <small>
                                    {row.organization?.inn
                                        ? `ИНН ${row.organization.inn} · `
                                        : ''}
                                    Создан {fmtDate(row.createdAt)}
                                </small>
                                {row.updatedAt !== row.createdAt && (
                                    <small>
                                        Изменён {fmtDate(row.updatedAt)}
                                    </small>
                                )}
                            </div>
                            <div>
                                <span className="admin-status">
                                    {orderStatuses[row.status]}
                                </span>
                                {row.paymentProofCount > 0 && (
                                    <small>
                                        {row.paymentProofCount} платёжных
                                        документов
                                    </small>
                                )}
                            </div>
                            <div>
                                {row.assignedManager?.displayName || (
                                    <span className="admin-muted">
                                        Не назначен
                                    </span>
                                )}
                            </div>
                            <div className="ord-money">
                                {money(
                                    row.quote
                                        ? row.quote.quotedTotalMinor
                                        : row.catalogTotalMinor,
                                )}
                                {!row.quote && (
                                    <small>По исходному запросу</small>
                                )}
                            </div>
                            <ArrowRight size={17} aria-hidden="true" />
                        </article>
                    ))}
                </div>
            ) : (
                <div className="admin-state">
                    <h2>Заказов не найдено</h2>
                    <p>Измените условия поиска или фильтры.</p>
                </div>
            )}
            {data && (
                <nav className="ord-pagination" aria-label="Страницы заказов">
                    <span>
                        Страница {data.page} из {Math.max(1, data.totalPages)}
                    </span>
                    <button
                        className="admin-icon-button"
                        disabled={result.loading || data.page <= 1}
                        aria-label="Предыдущая страница"
                        onClick={() => change('page', String(data.page - 1))}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        className="admin-icon-button"
                        disabled={
                            result.loading || data.page >= data.totalPages
                        }
                        aria-label="Следующая страница"
                        onClick={() => change('page', String(data.page + 1))}
                    >
                        <ChevronRight size={20} />
                    </button>
                </nav>
            )}
        </div>
    );
}
