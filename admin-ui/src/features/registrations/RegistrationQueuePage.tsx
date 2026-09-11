import { useEffect, useRef } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useRead } from '../../app/use-read';
import { useSession } from '../../app/session';
import { ReadState, PriorityIndicator } from '../../app/primitives';
import { fmtDate, priorityText } from '../../format';
import { registrationQuery, registrationQueuePath } from './api';
import { readinessLabels, statusLabels, type RegistrationPage } from './types';

export function RegistrationQueuePage() {
    const { revision } = useSession();
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const list = useRef<HTMLDivElement>(null);
    const selected = params.get('selected');
    const query = registrationQuery(params);
    const redirect = selected !== null || params.get('status') === 'closed';
    const result = useRead<RegistrationPage>(
        redirect ? null : `/admin/api/registrations?${query}`,
        revision,
    );
    const page = result.data;
    const state: unknown = location.state;
    const focusId =
        state && typeof state === 'object' && 'selectedId' in state
            ? state.selectedId
            : null;
    useEffect(() => {
        if (typeof focusId === 'number')
            list.current
                ?.querySelector<HTMLElement>(
                    `[data-registration-id="${focusId}"] a`,
                )
                ?.focus();
    }, [page, focusId]);
    if (redirect) {
        const validId =
            selected &&
            /^[1-9]\d{0,9}$/.test(selected) &&
            Number(selected) <= 2147483647;
        return (
            <Navigate
                replace
                to={`${registrationQueuePath}${validId ? `/${selected}` : `?${query}`}`}
                state={{
                    queueUrl: `${registrationQueuePath}?${query}`,
                    selectedId: validId ? Number(selected) : undefined,
                }}
            />
        );
    }
    function filter(key: string, value: string) {
        const next = new URLSearchParams(query);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        setParams(next);
    }
    const select = (
        key: string,
        label: string,
        options: Array<[string, string]>,
        fallback = '',
    ) => (
        <label>
            {label}
            <select
                value={params.get(key) || fallback}
                onChange={(event) => filter(key, event.target.value)}
            >
                {options.map(([id, text]) => (
                    <option key={id} value={id}>
                        {text}
                    </option>
                ))}
            </select>
        </label>
    );
    return (
        <div className="reg-workspace">
            <header className="admin-page-heading">
                <div>
                    <div className="admin-breadcrumb">Обращения</div>
                    <h1>Регистрации ККТ</h1>
                </div>
                {page && (
                    <span className="admin-muted">{page.total} анкет</span>
                )}
            </header>
            <section
                className="admin-filters reg-filters"
                aria-label="Фильтры регистраций"
            >
                {select(
                    'status',
                    'Обработка',
                    [
                        ['new', 'Новые'],
                        ['in_work', 'В работе'],
                        ['processed', 'Обработанные'],
                        ['all', 'Все отправленные'],
                    ],
                    'new',
                )}
                {select('readiness', 'Комплектность', [
                    ['', 'Любая'],
                    ...Object.entries(readinessLabels),
                ])}
                {select('platform', 'Канал', [
                    ['', 'Все каналы'],
                    ['web', 'Сайт'],
                    ['telegram', 'Telegram'],
                    ['max', 'MAX'],
                ])}
                {select('priority', 'Приоритет', [
                    ['', 'Любой'],
                    ...(['low', 'normal', 'high', 'urgent'] as const).map(
                        (id): [string, string] => [id, priorityText(id)],
                    ),
                ])}
                <button
                    className="admin-icon-button"
                    aria-label="Сбросить фильтры"
                    title="Сбросить фильтры"
                    onClick={() => setParams({})}
                >
                    <RotateCcw size={18} />
                </button>
            </section>
            {!page ? (
                <ReadState {...result} />
            ) : (
                <>
                    {page.items.length ? (
                        <div
                            className="reg-queue"
                            ref={list}
                            aria-label="Очередь регистраций"
                        >
                            {page.items.map((row) => (
                                <article
                                    className="reg-queue-row"
                                    key={row.id}
                                    data-registration-id={row.id}
                                >
                                    <div>
                                        <span className="reg-eyebrow">
                                            Анкета #{row.id}
                                        </span>
                                        <Link
                                            to={`${registrationQueuePath}/${row.id}`}
                                            state={{
                                                queueUrl: `${registrationQueuePath}?${query}`,
                                                selectedId: row.id,
                                            }}
                                        >
                                            {row.orgName ||
                                                'Организация не указана'}
                                        </Link>
                                        <small>
                                            ИНН: {row.innKpp || 'Не указан'} ·{' '}
                                            {row.kktModel ||
                                                'Модель не указана'}
                                        </small>
                                    </div>
                                    <div>
                                        <span className="admin-status">
                                            {statusLabels[row.status]}
                                        </span>
                                        <span>
                                            {readinessLabels[row.readiness]}
                                        </span>
                                        <PriorityIndicator
                                            priority={row.priority}
                                        />
                                    </div>
                                    <div>
                                        <small>Инженер</small>
                                        <span>
                                            {row.assignedEngineer
                                                ?.displayName || 'Не назначен'}
                                        </span>
                                        <small>
                                            {{
                                                web: 'Сайт',
                                                telegram: 'Telegram',
                                                max: 'MAX',
                                            }[row.platform] || row.platform}
                                        </small>
                                    </div>
                                    <time dateTime={row.createdAt}>
                                        {fmtDate(row.createdAt)}
                                    </time>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="admin-state">
                            <h2>
                                {query.size
                                    ? 'Нет анкет по выбранным фильтрам'
                                    : 'Новых анкет пока нет'}
                            </h2>
                            <p>
                                {query.size
                                    ? 'Измените условия отбора.'
                                    : 'Отправленные клиентами анкеты появятся здесь.'}
                            </p>
                        </div>
                    )}
                    <nav
                        className="reg-pagination"
                        aria-label="Страницы регистраций"
                    >
                        <button
                            className="admin-icon-button"
                            aria-label="Предыдущая страница"
                            disabled={page.page <= 1 || result.loading}
                            onClick={() =>
                                filter('page', String(page.page - 1))
                            }
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span>
                            Страница {page.page} · Всего {page.total}
                        </span>
                        <button
                            className="admin-icon-button"
                            aria-label="Следующая страница"
                            disabled={!page.hasNext || result.loading}
                            onClick={() =>
                                filter('page', String(page.page + 1))
                            }
                        >
                            <ChevronRight size={18} />
                        </button>
                        {select(
                            'limit',
                            'На странице',
                            [
                                ['25', '25'],
                                ['50', '50'],
                                ['100', '100'],
                            ],
                            '25',
                        )}
                    </nav>
                </>
            )}
        </div>
    );
}
