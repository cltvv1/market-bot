import { useState } from 'react';
import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { serviceApi } from './api';
import { useServiceRead } from './useServiceRead';
import { dateText, Loading, ServiceError, SessionNote } from './ui';
export function ServiceRequestListPage() {
    const { data, error, loading, refresh } = useServiceRead(
        'requests',
        serviceApi.list,
    );
    const [query, setQuery] = useState('');
    const items = data?.filter(({ request }) =>
        `${request.requestNumber} ${request.serviceTypeTitle}`
            .toLowerCase()
            .includes(query.toLowerCase()),
    );
    return (
        <section className="svc-section">
            <div className="svc-page-heading svc-heading-row">
                <div>
                    <h1>Мои заявки</h1>
                    <p>До 50 последних заявок</p>
                </div>
                <div className="svc-actions">
                    <button
                        className="ref-icon-button"
                        title="Обновить список"
                        aria-label="Обновить список"
                        disabled={loading}
                        onClick={() => void refresh()}
                    >
                        <RefreshCw size={19} />
                    </button>
                    <Link
                        className="ref-button ref-button--primary"
                        to="/service/request"
                    >
                        <Plus size={17} />
                        Новое обращение
                    </Link>
                </div>
            </div>
            <SessionNote />
            {error != null && (
                <ServiceError error={error} retry={() => void refresh()} />
            )}
            {loading && !data && <Loading />}
            {data && (
                <>
                    <div className="svc-field svc-search">
                        <label htmlFor="request-search">
                            Поиск среди загруженных заявок
                        </label>
                        <input
                            id="request-search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            type="search"
                        />
                    </div>
                    <div className="svc-request-list">
                        {items?.length ? (
                            items.map(({ request: row }) => (
                                <article
                                    key={row.id}
                                    className="svc-request-row"
                                >
                                    <div>
                                        <span className="svc-caption">
                                            {row.requestNumber} ·{' '}
                                            {dateText(row.createdAt)}
                                        </span>
                                        <h2>{row.serviceTypeTitle}</h2>
                                        <p>
                                            <span className="svc-stage">
                                                {row.stageLabel}
                                            </span>
                                        </p>
                                    </div>
                                    <Link
                                        className="ref-button"
                                        to={`/service/requests/${row.id}${row.canContinue ? '/edit' : ''}`}
                                    >
                                        {row.canContinue
                                            ? 'Продолжить'
                                            : 'Открыть'}
                                        <ArrowRight size={17} />
                                    </Link>
                                </article>
                            ))
                        ) : (
                            <p className="svc-empty">
                                {data.length
                                    ? 'В загруженной выборке ничего не найдено.'
                                    : 'В этой сессии пока нет заявок.'}
                            </p>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
