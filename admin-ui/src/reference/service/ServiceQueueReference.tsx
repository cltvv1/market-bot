import { useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FilterX, Inbox } from 'lucide-react';
import type { Admin, Priority, Staff } from '../../types';
import { fmtDate, priorityText, statusText } from '../../format';
import { PriorityIndicator, ReadState, StatusIndicator } from '../primitives';
import { useRead } from '../use-read';
import {
    channelName,
    clientName,
    filterResult,
    pageSizes,
    platforms,
    priorities,
    queueState,
    staffName,
    statuses,
    textValue,
    type ReferenceRequest,
} from './service-reference-model';

export function ServiceQueueReference({
    admin,
    staff,
    refreshKey,
}: {
    admin: Admin;
    staff: Staff[];
    refreshKey: number;
}) {
    const [params, setParams] = useSearchParams();
    const location = useLocation();
    const restored = useRef(false);
    const state = queueState(params);
    const query = new URLSearchParams({
        status: state.status,
        ...(state.platform ? { platform: state.platform } : {}),
    });
    const result = useRead<ReferenceRequest[]>(
        `/admin/api/service-requests?${query}`,
        refreshKey,
    );
    const items = filterResult(
        result.data || [],
        state.priority,
        state.responsible,
    );
    const pageCount = Math.max(1, Math.ceil(items.length / state.limit));
    const page = Math.min(state.page, pageCount);
    const visible = items.slice((page - 1) * state.limit, page * state.limit);
    const active =
        state.status !== 'all' ||
        state.platform ||
        state.priority ||
        state.responsible;
    const responsibleIds = [
        ...new Set(
            (result.data || [])
                .flatMap((item) => [
                    item.assignedEngineerId,
                    item.responsibleOperatorStaffId,
                ])
                .filter((id): id is number => Boolean(id)),
        ),
    ];
    const selected = new URLSearchParams(location.search).get('selected');

    useEffect(() => {
        if (!result.data || restored.current) return;
        restored.current = true;
        const target = selected
            ? document.getElementById(`reference-request-${selected}`)
            : null;
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'nearest' });
    }, [result.data, selected]);

    function change(key: string, value: string) {
        // Read committed history so rapid filter changes cannot overwrite each other.
        const next = new URLSearchParams(window.location.search);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.set('page', '1');
        next.delete('selected');
        setParams(next);
    }
    function openState(id: number) {
        const back = new URLSearchParams(params);
        back.set('selected', String(id));
        return { queueUrl: `/service-requests?${back}` };
    }
    return (
        <>
            <div className="ref-breadcrumb">Обращения / Сервис</div>
            <header className="ref-page-heading">
                <div>
                    <h1>Сервисные заявки</h1>
                    <p>
                        {result.data
                            ? `${items.length} в текущей выборке`
                            : 'Очередь обращений'}
                    </p>
                </div>
                <span className="ref-preview-label">Только просмотр</span>
            </header>
            <form
                className="ref-filters"
                onSubmit={(event) => event.preventDefault()}
                aria-label="Фильтры заявок"
            >
                <label>
                    Статус
                    <select
                        value={state.status}
                        onChange={(event) =>
                            change('status', event.target.value)
                        }
                    >
                        {statuses.map((status) => (
                            <option key={status} value={status}>
                                {status === 'all'
                                    ? 'Все статусы'
                                    : status === 'active'
                                      ? 'Активные'
                                      : statusText(status)}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Приоритет
                    <select
                        value={state.priority}
                        onChange={(event) =>
                            change('priority', event.target.value)
                        }
                    >
                        {priorities.map((priority) => (
                            <option key={priority} value={priority}>
                                {priority
                                    ? priorityText(priority as Priority)
                                    : 'Любой'}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Канал
                    <select
                        value={state.platform}
                        onChange={(event) =>
                            change('platform', event.target.value)
                        }
                    >
                        {platforms.map((platform) => (
                            <option key={platform} value={platform}>
                                {platform
                                    ? channelName(platform)
                                    : 'Все каналы'}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Ответственный
                    <select
                        value={state.responsible}
                        onChange={(event) =>
                            change('responsible', event.target.value)
                        }
                    >
                        <option value="">Все сотрудники</option>
                        {[
                            ...new Set([
                                ...responsibleIds,
                                ...(state.responsible
                                    ? [Number(state.responsible)]
                                    : []),
                            ]),
                        ].map((id) => (
                            <option key={id} value={id}>
                                {staffName(id, admin, staff)}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    className="ref-icon-button"
                    type="button"
                    disabled={!active}
                    title="Сбросить фильтры"
                    aria-label="Сбросить фильтры"
                    onClick={() => setParams({})}
                >
                    <FilterX size={19} />
                </button>
            </form>
            {active && (
                <p className="ref-filter-summary">
                    Выбрано:{' '}
                    {[
                        state.status !== 'all'
                            ? state.status === 'active'
                                ? 'Активные'
                                : statusText(state.status)
                            : '',
                        state.priority
                            ? priorityText(state.priority as Priority)
                            : '',
                        state.platform ? channelName(state.platform) : '',
                        state.responsible
                            ? staffName(Number(state.responsible), admin, staff)
                            : '',
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
            )}
            <p className="ref-result-note">
                До 100 последних заявок. Приоритет и ответственный уточняют
                загруженную выборку.
            </p>
            {!result.data ? (
                <ReadState {...result} />
            ) : !items.length ? (
                <div className="ref-state">
                    <Inbox size={30} />
                    <h2>
                        {active
                            ? 'Нет заявок по выбранным фильтрам'
                            : 'Заявок пока нет'}
                    </h2>
                    <p>
                        {active
                            ? 'Измените условия или сбросьте фильтры.'
                            : 'Полученные обращения появятся здесь.'}
                    </p>
                    {active && (
                        <button
                            className="ref-button"
                            onClick={() => setParams({})}
                        >
                            Сбросить фильтры
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <div
                        className="ref-queue"
                        role="table"
                        aria-label="Сервисные заявки"
                    >
                        <div className="ref-queue-head" role="row">
                            <span role="columnheader">Заявка / клиент</span>
                            <span role="columnheader">Статус</span>
                            <span role="columnheader">Ответственные</span>
                            <span role="columnheader">Обновлена</span>
                        </div>
                        {visible.map((item) => (
                            <div
                                className={`ref-queue-row ${selected === String(item.id) ? 'ref-selected' : ''}`}
                                role="row"
                                key={item.id}
                            >
                                <div
                                    role="cell"
                                    className="ref-request-identity"
                                >
                                    <div className="ref-row-meta">
                                        <span>
                                            {item.requestNumber ||
                                                `#${item.id}`}
                                        </span>
                                        <PriorityIndicator
                                            priority={item.priority}
                                        />
                                        <span>
                                            {channelName(
                                                item.source || item.platform,
                                            )}
                                        </span>
                                    </div>
                                    <Link
                                        id={`reference-request-${item.id}`}
                                        className="ref-row-link"
                                        to={`/service-requests/${item.id}`}
                                        state={openState(item.id)}
                                    >
                                        {item.serviceTypeTitle ||
                                            'Сервисная заявка'}
                                    </Link>
                                    <span>{clientName(item)}</span>
                                    <small>
                                        {textValue(
                                            item.equipmentSnapshot?.model,
                                        ) ||
                                            textValue(
                                                item.answers
                                                    ?.cashRegisterIdentity,
                                            ) ||
                                            'Оборудование не указано'}
                                    </small>
                                </div>
                                <div role="cell">
                                    <StatusIndicator status={item.status} />
                                </div>
                                <div role="cell" className="ref-row-staff">
                                    <span>
                                        {staffName(
                                            item.responsibleOperatorStaffId,
                                            admin,
                                            staff,
                                        )}
                                    </span>
                                    <small>
                                        Инженер:{' '}
                                        {staffName(
                                            item.assignedEngineerId,
                                            admin,
                                            staff,
                                        )}
                                    </small>
                                </div>
                                <div role="cell" className="ref-row-time">
                                    {item.updatedAt
                                        ? fmtDate(item.updatedAt)
                                        : 'Дата не указана'}
                                </div>
                            </div>
                        ))}
                    </div>
                    <footer className="ref-pagination">
                        <span>
                            {(page - 1) * state.limit + 1}–
                            {Math.min(page * state.limit, items.length)} из{' '}
                            {items.length}
                        </span>
                        <label>
                            На странице
                            <select
                                value={state.limit}
                                onChange={(event) =>
                                    change('limit', event.target.value)
                                }
                            >
                                {pageSizes.map((size) => (
                                    <option key={size}>{size}</option>
                                ))}
                            </select>
                        </label>
                        <button
                            className="ref-icon-button"
                            aria-label="Предыдущая страница"
                            disabled={page <= 1}
                            onClick={() => change('page', String(page - 1))}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span>
                            {page} / {pageCount}
                        </span>
                        <button
                            className="ref-icon-button"
                            aria-label="Следующая страница"
                            disabled={page >= pageCount}
                            onClick={() => change('page', String(page + 1))}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </footer>
                </>
            )}
        </>
    );
}
