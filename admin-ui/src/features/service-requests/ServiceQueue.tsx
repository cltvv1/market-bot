import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
    Link,
    useLocation,
    useNavigate,
    useSearchParams,
} from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { post } from '../../api';
import { fmtDate, statusText, priorityText } from '../../format';
import { useSession } from '../../app/session';
import { useRead } from '../../app/use-read';
import { Dialog } from '../../app/Dialog';
import {
    ReadState,
    StatusIndicator,
    PriorityIndicator,
} from '../../app/primitives';
import {
    channels,
    contactName,
    type ServicePage,
    type ServiceDetailData,
} from './types';
import { commandError, formText } from './service-api';

const statuses = [
    'active',
    'all',
    'draft',
    'submitted',
    'price_confirmed',
    'review_required',
    'clarification_required',
    'invoice_required',
    'waiting_payment',
    'paid',
    'scheduled',
    'in_progress',
    'completed',
    'closed',
    'cancelled',
];
export function ServiceQueue() {
    const { admin, revision } = useSession();
    const [params, setParams] = useSearchParams();
    const [creating, setCreating] = useState(false);
    const location = useLocation();
    const list = useRef<HTMLDivElement>(null);
    const query = new URLSearchParams();
    for (const key of [
        'status',
        'platform',
        'priority',
        'scope',
        'responsibleStaffId',
        'page',
        'limit',
    ])
        if (params.has(key)) query.set(key, params.get(key)!);
    const result = useRead<ServicePage>(
        `/admin/api/service-requests?${query}`,
        revision,
    );
    const page = result.data;
    useEffect(() => {
        if (page && params.has('selected'))
            list.current
                ?.querySelector<HTMLElement>(
                    `[data-request-id="${Number(params.get('selected'))}"] a`,
                )
                ?.focus();
    }, [page, params]);
    function filter(key: string, value: string) {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        next.delete('selected');
        setParams(next);
    }
    const select = (
        key: string,
        label: string,
        items: Array<[string, string]>,
        defaultValue = '',
    ) => (
        <label>
            {label}
            <select
                value={params.get(key) || defaultValue}
                onChange={(e) => filter(key, e.target.value)}
            >
                {items.map(([id, title]) => (
                    <option key={id} value={id}>
                        {title}
                    </option>
                ))}
            </select>
        </label>
    );
    return (
        <>
            <header className="admin-page-heading">
                <div>
                    <div className="admin-breadcrumb">Обращения</div>
                    <h1>Сервисные заявки</h1>
                </div>
                {admin.permissions.includes('serviceRequests.update') && (
                    <button
                        className="admin-button admin-button--primary"
                        onClick={() => setCreating(true)}
                    >
                        <Plus size={18} />
                        Создать заявку
                    </button>
                )}
            </header>
            <section
                className="admin-filters sr-filters"
                aria-label="Фильтры заявок"
            >
                {select(
                    'status',
                    'Статус',
                    statuses.map((s) => [
                        s,
                        s === 'active'
                            ? 'Активные'
                            : s === 'all'
                              ? 'Все статусы'
                              : statusText(s),
                    ]),
                    'active',
                )}
                {select('priority', 'Приоритет', [
                    ['', 'Все приоритеты'],
                    ...(['low', 'normal', 'high', 'urgent'] as const).map(
                        (p) => [p, priorityText(p)] as [string, string],
                    ),
                ])}
                {select('platform', 'Канал', [
                    ['', 'Все каналы'],
                    ['telegram', 'Telegram'],
                    ['max', 'MAX'],
                    ['web', 'Сайт'],
                ])}
                {select(
                    'scope',
                    'Ответственность',
                    [
                        ['all', 'Все доступные'],
                        ['mine', 'Мои заявки'],
                        ['unassigned', 'Без ответственного'],
                    ],
                    'all',
                )}
                <label>
                    Номер сотрудника
                    <input
                        type="number"
                        min="1"
                        max="2147483647"
                        value={params.get('responsibleStaffId') || ''}
                        onChange={(e) =>
                            filter('responsibleStaffId', e.target.value)
                        }
                    />
                </label>
                <button
                    className="admin-icon-button"
                    title="Сбросить фильтры"
                    aria-label="Сбросить фильтры"
                    onClick={() => setParams({})}
                >
                    <RotateCcw size={18} />
                </button>
            </section>
            {!page ? (
                <ReadState {...result} />
            ) : (
                <>
                    <p className="admin-result-note" role="status">
                        Найдено: {page.total}
                    </p>
                    <div ref={list} aria-label="Очередь сервисных заявок">
                        <div className="admin-queue-head">
                            <span>Заявка и клиент</span>
                            <span>Статус</span>
                            <span>Ответственные</span>
                            <span>Создана</span>
                        </div>
                        {page.items.length ? (
                            page.items.map((row) => (
                                <article
                                    key={row.id}
                                    data-request-id={row.id}
                                    className={`admin-queue-row ${params.get('selected') === String(row.id) ? 'admin-selected' : ''}`}
                                >
                                    <div className="admin-request-identity">
                                        <div className="admin-row-meta">
                                            <span>{row.requestNumber}</span>
                                            <span>
                                                {channels[row.source] ||
                                                    channels[row.platform] ||
                                                    row.source}
                                            </span>
                                            <PriorityIndicator
                                                priority={row.priority}
                                            />
                                        </div>
                                        <Link
                                            className="admin-row-link"
                                            to={`/requests/service/${row.id}`}
                                            state={{
                                                queueUrl: `${location.pathname}?${new URLSearchParams({ ...Object.fromEntries(params), selected: String(row.id) })}`,
                                            }}
                                        >
                                            {row.serviceTypeTitle}
                                        </Link>
                                        <span>{contactName(row)}</span>
                                        {row.equipment && (
                                            <small>{row.equipment}</small>
                                        )}
                                    </div>
                                    <div>
                                        <StatusIndicator status={row.status} />
                                    </div>
                                    <div className="admin-row-staff">
                                        <span>
                                            Куратор:{' '}
                                            {row.responsibleOperator
                                                ?.displayName || 'Не назначен'}
                                        </span>
                                        <span>
                                            Инженер:{' '}
                                            {row.assignedEngineer
                                                ?.displayName || 'Не назначен'}
                                        </span>
                                    </div>
                                    <time
                                        className="admin-row-time"
                                        dateTime={row.createdAt}
                                    >
                                        {fmtDate(row.createdAt)}
                                    </time>
                                </article>
                            ))
                        ) : (
                            <div className="admin-state">
                                <h2>Заявок не найдено</h2>
                                <button
                                    className="admin-button"
                                    onClick={() => setParams({})}
                                >
                                    Сбросить фильтры
                                </button>
                            </div>
                        )}
                    </div>
                    <footer className="admin-pagination">
                        <span>
                            Страница {page.page} из{' '}
                            {Math.max(1, Math.ceil(page.total / page.limit))}
                        </span>
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
                        <button
                            className="admin-icon-button"
                            aria-label="Предыдущая страница"
                            disabled={page.page <= 1}
                            onClick={() =>
                                filter('page', String(page.page - 1))
                            }
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            className="admin-icon-button"
                            aria-label="Следующая страница"
                            disabled={!page.hasNext}
                            onClick={() =>
                                filter('page', String(page.page + 1))
                            }
                        >
                            <ChevronRight size={18} />
                        </button>
                    </footer>
                </>
            )}
            {creating && <CreateRequest onClose={() => setCreating(false)} />}
        </>
    );
}
function CreateRequest({ onClose }: { onClose: () => void }) {
    const types = useRead<Array<{ code: string; title: string }>>(
        '/admin/api/service-requests/types',
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef(false);
    const go = useNavigate();
    const { refresh } = useSession();
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (pending.current) return;
        const form = new FormData(e.currentTarget);
        pending.current = true;
        setBusy(true);
        setError('');
        try {
            const result = await post<ServiceDetailData>(
                '/admin/api/service-requests/manual',
                {
                    serviceTypeCode: form.get('type'),
                    source: form.get('source'),
                    contactSnapshot: {
                        name: formText(form, 'name'),
                        phone: formText(form, 'phone'),
                    },
                    answers: {
                        description: formText(form, 'description'),
                    },
                },
            );
            refresh();
            await go(`/requests/service/${result.request.id}`);
        } catch (reason) {
            setError(commandError(reason));
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }
    return (
        <Dialog title="Новая сервисная заявка" onClose={onClose} busy={busy}>
            {!types.data ? (
                <ReadState {...types} />
            ) : (
                <form className="admin-form" onSubmit={(e) => void submit(e)}>
                    <label>
                        Услуга
                        <select name="type" required defaultValue="">
                            <option value="" disabled>
                                Выберите услугу
                            </option>
                            {types.data.map((type) => (
                                <option value={type.code} key={type.code}>
                                    {type.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Источник
                        <select name="source">
                            <option value="phone">По телефону</option>
                            <option value="admin">Сотрудник</option>
                        </select>
                    </label>
                    <label>
                        Контактное лицо
                        <input name="name" required maxLength={200} />
                    </label>
                    <label>
                        Телефон
                        <input
                            type="tel"
                            name="phone"
                            required
                            maxLength={40}
                        />
                    </label>
                    <label>
                        Описание
                        <textarea
                            name="description"
                            required
                            maxLength={5000}
                            rows={4}
                        />
                    </label>
                    {error && <p role="alert">{error}</p>}
                    <button
                        className="admin-button admin-button--primary"
                        disabled={busy || !types.data.length}
                    >
                        {busy ? 'Создаём…' : 'Создать заявку'}
                    </button>
                </form>
            )}
        </Dialog>
    );
}
