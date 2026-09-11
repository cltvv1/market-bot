import { useCallback, useEffect, useMemo, useState } from 'react';
// prettier-ignore
import {
    Activity, Check, Database, ExternalLink, FileText, KeyRound,
    RefreshCw, Send, ShieldCheck, UserPlus, UserRound, X,
} from 'lucide-react';
import { ApiError, api, post, upload } from '../api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { legacyRoutes } from '../app/navigation';
import './legacy-admin.css';
import {
    fmtDate,
    priorityText,
    registrationStatus,
    statusText,
    value,
} from '../format';
// prettier-ignore
import type {
    Admin, AdminRole, CustomerCard, EquipmentKit, IntegrationBridgeState,
    IntegrationExclusion, IntegrationRun, OpportunityDetail, OrganizationAccessRequest,
    OpportunityStatus, Priority,
    OutboundDelivery, ServiceOpportunity, ServiceRequest, Staff, Tab,
    Ticket, TicketMessage,
} from '../types';

const priorities: Array<{ value: Priority | ''; label: string }> = [
    { value: '', label: 'Любой приоритет' },
    { value: 'low', label: 'Низкий' },
    { value: 'normal', label: 'Обычный' },
    { value: 'high', label: 'Высокий' },
    { value: 'urgent', label: 'Срочный' },
];

export function LegacyAdminSections({
    admin,
    tab,
    refreshKey,
    onChanged,
}: {
    admin: Admin;
    tab: Tab;
    refreshKey: number;
    onChanged: () => void;
}) {
    const go = useNavigate();
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || 'new';
    const platform = params.get('platform') || '';
    const priority = params.get('priority') || '';
    const requestedId = Number(params.get('selected')) || undefined;
    const navigate: Navigate = (next, id) =>
        void go(
            next === 'service'
                ? `/requests/service${id ? `/${id}` : ''}`
                : next === 'registrations'
                  ? `/requests/registrations${id ? `/${id}` : ''}`
                  : `${legacyRoutes[next]}?status=all${id ? `&selected=${id}` : ''}`,
        );
    const filter = (key: string, value: string) => {
        const next = new URLSearchParams(params);
        next.set(key, value);
        next.delete('selected');
        setParams(next);
    };
    const props = {
        status,
        platform,
        priority,
        requestedId,
        refreshKey,
        onNavigate: navigate,
        onChanged,
        permissions: admin.permissions,
    };
    return (
        <div className="legacy-admin-root">
            {tab === 'tickets' && (
                <section className="filters" aria-label="Фильтры">
                    <select
                        aria-label="Статус"
                        value={status}
                        onChange={(e) => filter('status', e.target.value)}
                    >
                        <option value="new">Новые</option>
                        <option value="in_work">В работе</option>
                        <option value="closed">Закрытые</option>
                        <option value="all">Все</option>
                    </select>
                    <select
                        aria-label="Платформа"
                        value={platform}
                        onChange={(e) => filter('platform', e.target.value)}
                    >
                        <option value="">Все платформы</option>
                        <option value="telegram">Telegram</option>
                        <option value="max">MAX</option>
                        <option value="web">Web</option>
                    </select>
                    {tab !== 'tickets' && (
                        <select
                            aria-label="Приоритет"
                            value={priority}
                            onChange={(e) => filter('priority', e.target.value)}
                        >
                            {priorities.map((item) => (
                                <option key={item.value} value={item.value}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    )}
                </section>
            )}
            {tab === 'tickets' && <Tickets {...props} />}
            {tab === 'opportunities' && (
                <Opportunities
                    refreshKey={refreshKey}
                    onChanged={onChanged}
                    onNavigate={navigate}
                />
            )}
            {tab === 'organization-access' && (
                <OrganizationAccessQueue
                    refreshKey={refreshKey}
                    onChanged={onChanged}
                    canReview={admin.permissions.includes(
                        'organizationAccess.review',
                    )}
                />
            )}
            {tab === 'organizations' && (
                <Organizations refreshKey={refreshKey} />
            )}
            {tab === 'equipment-kits' && (
                <EquipmentKits refreshKey={refreshKey} onChanged={onChanged} />
            )}
            {tab === 'integrations' && (
                <IntegrationRuns
                    refreshKey={refreshKey}
                    permissions={admin.permissions}
                    onChanged={onChanged}
                />
            )}
            {tab === 'staff' && (
                <StaffManagement
                    refreshKey={refreshKey}
                    onChanged={onChanged}
                />
            )}
            {tab === 'audit' && <AuditLog refreshKey={refreshKey} />}
        </div>
    );
}

function useList<T>(path: string, refreshKey: number) {
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        setLoading(true);
        setError('');
        api<T[]>(path)
            .then(setItems)
            .catch((e) =>
                setError(e instanceof ApiError ? e.message : 'Ошибка загрузки'),
            )
            .finally(() => setLoading(false));
    }, [path, refreshKey]);
    return { items, loading, error };
}

function Workbench<T extends { id: number }>({
    title,
    items,
    selectedId,
    onSelect,
    row,
    detail,
    loading,
    error,
}: {
    title: string;
    items: T[];
    selectedId?: number;
    onSelect: (id: number) => void;
    row: (item: T) => React.ReactNode;
    detail: React.ReactNode;
    loading: boolean;
    error: string;
}) {
    return (
        <section className="workbench">
            <aside className="work-list">
                <div className="work-list-title">
                    {title}
                    <span>{items.length}</span>
                </div>
                {loading ? (
                    <Empty text="Загрузка..." />
                ) : error ? (
                    <Empty text={error} />
                ) : items.length ? (
                    items.map((item) => (
                        <button
                            key={item.id}
                            className={`work-row ${selectedId === item.id ? 'active' : ''}`}
                            onClick={() => onSelect(item.id)}
                        >
                            {row(item)}
                        </button>
                    ))
                ) : (
                    <Empty text="Ничего не найдено" />
                )}
            </aside>
            <article className="work-detail">
                {detail || <Empty text="Выберите запись слева" />}
            </article>
        </section>
    );
}

function Tickets(props: ListProps) {
    const query = useMemo(
        () =>
            new URLSearchParams({
                status: standardApiStatus(props.status),
                ...(props.platform ? { platform: props.platform } : {}),
            }).toString(),
        [props.status, props.platform],
    );
    const data = useList<Ticket>(
        `/admin/api/tickets?${query}`,
        props.refreshKey,
    );
    const [selectedId, setSelectedId] = useState<number>();
    useEffect(() => {
        const id = props.requestedId || data.items[0]?.id;
        if (id) setSelectedId(id);
    }, [data.items, props.requestedId]);
    return (
        <Workbench
            title="Вопросы"
            items={data.items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={data.loading}
            error={data.error}
            row={(item) => (
                <>
                    <div className="row-top">
                        <strong>
                            {item.name || item.username || `Вопрос #${item.id}`}
                        </strong>
                        <span>{fmtDate(item.createdAt)}</span>
                    </div>
                    <span className="row-preview">
                        {item.text || 'Без текста'}
                    </span>
                </>
            )}
            detail={
                selectedId ? (
                    <TicketDetail
                        id={selectedId}
                        onNavigate={props.onNavigate}
                        onChanged={props.onChanged}
                    />
                ) : null
            }
        />
    );
}

function TicketDetail({
    id,
    onNavigate,
    onChanged,
}: {
    id: number;
    onNavigate: Navigate;
    onChanged: () => void;
}) {
    const [data, setData] = useState<{
        ticket: Ticket;
        messages: TicketMessage[];
        deliveries: OutboundDelivery[];
    }>();
    const [card, setCard] = useState<CustomerCard | null>(null);
    const [text, setText] = useState('');
    const [file, setFile] = useState<File>();
    const load = useCallback(
        () =>
            api<{
                ticket: Ticket;
                messages: TicketMessage[];
                deliveries: OutboundDelivery[];
            }>(`/admin/api/tickets/${id}`).then(setData),
        [id],
    );
    useEffect(() => {
        setCard(null);
        void load().catch(reportLegacyError);
    }, [load]);
    if (!data) return <Empty text="Загрузка диалога..." />;
    const ticket = data.ticket;
    const send = async () => {
        if (!text.trim()) return;
        await post(`/admin/api/tickets/${id}/messages`, { text });
        setText('');
        await load();
        onChanged();
    };
    const sendFile = async () => {
        if (!file) return;
        const form = new FormData();
        form.append('file', file);
        if (text) form.append('text', text);
        await upload(`/admin/api/tickets/${id}/media`, form);
        setFile(undefined);
        setText('');
        await load();
    };
    const close = async () => {
        await post(`/admin/api/tickets/${id}/close`);
        await load();
        onChanged();
    };
    const openCard = async () =>
        setCard(
            await loadCustomerCard({ ...ticket, chatId: ticket.userChatId }),
        );
    if (card)
        return (
            <CustomerCardView
                card={card}
                onClose={() => setCard(null)}
                onNavigate={onNavigate}
            />
        );
    return (
        <>
            <DetailHeader
                title={`Вопрос #${id} · ${ticket.name || ticket.username || ticket.userChatId}`}
                subtitle={`${ticket.platform} · ${fmtDate(ticket.createdAt)}`}
                onCustomer={() => void openCard().catch(reportLegacyError)}
                right={
                    !ticket.isAnswered ? (
                        <button className="danger" onClick={() => void close().catch(reportLegacyError)}>
                            Закрыть
                        </button>
                    ) : (
                        <Badge>Закрыт</Badge>
                    )
                }
            />
            <div className="chat-body">
                <DeliveryStatusList deliveries={data.deliveries} />
                <div className="messages">
                    {data.messages?.map((message) => (
                        <Message key={message.id} message={message} />
                    ))}
                </div>
                {!ticket.isAnswered && (
                    <div className="chat-composer">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Ответ клиенту"
                        />
                        <div className="composer-actions">
                            <label className="file-picker">
                                <FileText size={16} />
                                {file?.name || 'Прикрепить файл'}
                                <input
                                    type="file"
                                    onChange={(e) =>
                                        setFile(e.target.files?.[0])
                                    }
                                />
                            </label>
                            {file && (
                                <button onClick={() => void sendFile().catch(reportLegacyError)}>
                                    Отправить файл
                                </button>
                            )}
                            <button className="primary" onClick={() => void send().catch(reportLegacyError)}>
                                <Send size={16} />
                                Отправить
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
} // prettier-ignore

function CustomerCardView({
    card,
    onClose,
    onNavigate,
}: {
    card: CustomerCard;
    onClose: () => void;
    onNavigate: Navigate;
}) {
    const user = card.user;
    const history = [
        ...(card.registrations || []).map((item) => ({
            tab: 'registrations' as Tab,
            id: item.id,
            date: item.createdAt,
            title: `Анкета #${item.id} · ${item.orgName || item.innKpp || 'Без названия'}`,
            meta: registrationStatus(item),
        })),
        ...(card.serviceRequests || []).map((item) => ({
            tab: 'service' as Tab,
            id: item.id,
            date: item.createdAt,
            title: `Сервис #${item.id} · ${item.serviceTypeTitle || item.serviceTypeCode}`,
            meta: statusText(item.status),
        })),
        ...(card.tickets || []).map((item) => ({
            tab: 'tickets' as Tab,
            id: item.id,
            date: item.createdAt,
            title: `Вопрос #${item.id} · ${item.text || 'Без текста'}`,
            meta: item.isAnswered ? 'Закрыт' : 'Открыт',
        })),
    ].sort((a, b) => +new Date(b.date) - +new Date(a.date));
    const organization = card.organization;
    const registers = card.assets?.cashRegisters || [];
    const drives = card.assets?.fiscalDrives || [];
    const subscriptions = card.assets?.ofdSubscriptions || [];
    return (
        <>
            <div className="detail-header">
                <div>
                    <h2>Карточка клиента</h2>
                    <span>
                        {user?.platform} · {user?.chatId}
                    </span>
                </div>
                <button onClick={onClose}>
                    <X size={16} />
                    Закрыть
                </button>
            </div>
            <div className="customer-card">
                <div className="customer-context">
                    <section className="context-panel">
                        <h3>Клиент</h3>
                        <Info label="Платформа" value={user?.platform} />
                        <Info label="Chat ID" value={user?.chatId} />
                        <Info label="User ID" value={user?.id} />
                        <Info
                            label="Имя"
                            value={user?.name || user?.username}
                        />
                    </section>
                    {organization?.id && (
                        <section className="context-panel">
                            <h3>Организация</h3>
                            <Info label="Название" value={organization.name} />
                            <Info
                                label="ИНН / КПП"
                                value={[organization.inn, organization.kpp]
                                    .filter(Boolean)
                                    .join(' / ')}
                            />
                            {card.contacts?.map((contact) => (
                                <Info
                                    key={contact.id}
                                    label={`${contact.kind === 'phone' ? 'Телефон' : 'Email'} · ${providerName(contact.source)}`}
                                    value={
                                        contact.normalizedValue ||
                                        contact.rawValue
                                    }
                                />
                            ))}
                        </section>
                    )}
                    {(registers.length ||
                        drives.length ||
                        subscriptions.length) > 0 && (
                        <section className="context-panel">
                            <h3>Кассы и подписки</h3>
                            {registers.map((item) => (
                                <Info
                                    key={`kkt-${item.id}`}
                                    label={item.model || 'Касса'}
                                    value={[
                                        item.serialNumber,
                                        item.registrationNumber,
                                    ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                />
                            ))}
                            {drives.map((item) => (
                                <Info
                                    key={`fn-${item.id}`}
                                    label={`ФН ${item.serialNumber}`}
                                    value={
                                        item.validUntil
                                            ? `до ${fmtDate(item.validUntil)}`
                                            : 'Срок не указан'
                                    }
                                />
                            ))}
                            {subscriptions.map((item) => (
                                <Info
                                    key={`ofd-${item.id}`}
                                    label={item.provider}
                                    value={
                                        item.validUntil
                                            ? `до ${fmtDate(item.validUntil)}`
                                            : item.status
                                    }
                                />
                            ))}
                        </section>
                    )}
                </div>
                <section className="history">
                    <h3>История обращений</h3>
                    {history.length ? (
                        history.map((item) => (
                            <button
                                key={`${item.tab}-${item.id}`}
                                onClick={() => onNavigate(item.tab, item.id)}
                            >
                                <strong>{item.title}</strong>
                                <span>
                                    {item.meta} · {fmtDate(item.date)}
                                </span>
                            </button>
                        ))
                    ) : (
                        <Empty text="Обращений пока нет" />
                    )}
                </section>
            </div>
        </>
    );
}

const opportunityStatuses: Array<{
    value: OpportunityStatus | 'all';
    label: string;
}> = [
    { value: 'new', label: 'Новые' },
    { value: 'in_progress', label: 'В работе' },
    { value: 'contact_later', label: 'Связаться позже' },
    { value: 'converted', label: 'Создана заявка' },
    { value: 'resolved', label: 'Решённые' },
    { value: 'not_relevant', label: 'Неактуальные' },
    { value: 'all', label: 'Все' },
];
function opportunityStatus(value: OpportunityStatus) {
    return (
        opportunityStatuses.find((item) => item.value === value)?.label ?? value
    );
}
function providerName(value: string) {
    return value === 'atol_connect'
        ? 'АТОЛ Connect'
        : value === 'platforma_ofd'
          ? 'Платформа ОФД'
          : value;
}

// prettier-ignore
function Opportunities({ refreshKey, onChanged, onNavigate }: { refreshKey: number; onChanged: () => void; onNavigate: Navigate }) {
  const [status, setStatus] = useState<OpportunityStatus | 'all'>('new'); const [provider, setProvider] = useState(''); const [search, setSearch] = useState(''); const [selectedId, setSelectedId] = useState<number>();
  const query = useMemo(() => new URLSearchParams({ status, ...(provider ? { provider } : {}), ...(search.trim() ? { search: search.trim() } : {}) }).toString(), [status, provider, search]);
  const data = useList<ServiceOpportunity>(`/admin/api/opportunities?${query}`, refreshKey); const selected = data.items.find((item) => item.id === selectedId);
  useEffect(() => { if (selectedId && !data.items.some((item) => item.id === selectedId)) setSelectedId(undefined); }, [data.items, selectedId]);
  return <><section className="filters signal-filters"><select value={status} onChange={(event) => setStatus(event.target.value as OpportunityStatus | 'all')}>{opportunityStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">Все источники</option><option value="atol_connect">АТОЛ Connect</option><option value="platforma_ofd">Платформа ОФД</option></select><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Организация, ИНН или касса" /></section><Workbench title="Сервисные сигналы" items={data.items} selectedId={selectedId} onSelect={setSelectedId} loading={data.loading} error={data.error} row={(item) => <><div className="row-top"><strong>{item.organization?.name || item.organization?.inn || 'Неопознанный клиент'}</strong><span>{fmtDate(item.lastSeenAt)}</span></div><span className="row-preview">{item.title}</span><div className="badges"><Badge>{opportunityStatus(item.status)}</Badge><Badge priority={item.priority}>{priorityText(item.priority)}</Badge>{item.providers?.map((source) => <Badge key={source}>{providerName(source)}</Badge>)}</div></>} detail={selected ? <OpportunityDetailView id={selected.id} onChanged={onChanged} onNavigate={onNavigate} /> : null} /></>;
}

// prettier-ignore
function OpportunityDetailView({ id, onChanged, onNavigate }: { id: number; onChanged: () => void; onNavigate: Navigate }) {
  const [data, setData] = useState<OpportunityDetail>(); const [status, setStatus] = useState<OpportunityStatus>('new'); const [comment, setComment] = useState(''); const [callbackAt, setCallbackAt] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<OpportunityDetail>(`/admin/api/opportunities/${id}`).then((result) => { setData(result); setStatus(result.opportunity.status); setComment(result.opportunity.operatorComment || ''); setCallbackAt(result.opportunity.callbackAt?.slice(0, 16) || ''); }), [id]);
  useEffect(() => { void load(); }, [load]); if (!data) return <Empty text="Загрузка..." />; const opportunity = data.opportunity;
  const save = async () => { setBusy(true); try { await post(`/admin/api/opportunities/${id}`, { status, comment, callbackAt: callbackAt || undefined }); await load(); onChanged(); } finally { setBusy(false); } };
  const convert = async () => { setBusy(true); try { const result = await post<{ request: ServiceRequest }>(`/admin/api/opportunities/${id}/convert`); onChanged(); onNavigate('service', result.request.id); } finally { setBusy(false); } };
  return <div className="detail-panel"><div className="detail-header"><div><h2><Activity size={18} />Сигнал #{opportunity.id} · {opportunity.title}</h2><span>{[...new Set(data.observations.map((item) => providerName(item.provider)))].join(', ')} · {fmtDate(opportunity.lastSeenAt)}</span></div></div><section className="detail-fields"><Info label="Организация" value={data.organization?.name || data.organization?.inn} /><Info label="ИНН" value={data.organization?.inn} /><Info label="Касса" value={[data.cashRegister?.model, data.cashRegister?.serialNumber].filter(Boolean).join(' · ')} /><Info label="РНМ" value={data.cashRegister?.registrationNumber} /><Info label="Приоритет" value={priorityText(opportunity.priority)} /><Info label="Первое событие" value={fmtDate(opportunity.firstSeenAt)} /></section>{opportunity.description && <div className="signal-description">{opportunity.description}</div>}<section className="signal-observations"><h3>Наблюдения</h3>{data.observations.map((item) => <article key={item.id}><div><strong>{providerName(item.provider)}</strong><span>{fmtDate(item.occurredAt)}</span></div><p>{item.title}</p>{item.description && <small>{item.description}</small>}</article>)}</section><section className="operator-controls"><div className="control-row"><select value={status} onChange={(event) => setStatus(event.target.value as OpportunityStatus)}>{opportunityStatuses.filter((item) => item.value !== 'all' && item.value !== 'converted').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input type="datetime-local" value={callbackAt} onChange={(event) => setCallbackAt(event.target.value)} /><button className="primary" disabled={busy} onClick={() => void save()}><Check size={17} />Сохранить</button></div><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Комментарий оператора" />{opportunity.serviceRequestId ? <button onClick={() => onNavigate('service', opportunity.serviceRequestId)}>Открыть заявку #{opportunity.serviceRequestId}</button> : <button className="primary" disabled={busy} onClick={() => void convert()}><ExternalLink size={17} />Создать сервисную заявку</button>}</section></div>;
}

// prettier-ignore
function IntegrationRuns({ refreshKey, permissions, onChanged }: { refreshKey: number; permissions: string[]; onChanged: () => void }) {
  const data = useList<IntegrationRun>('/admin/api/integration-runs', refreshKey); const exclusions = useList<IntegrationExclusion>('/admin/api/integration-exclusions', refreshKey);
  const [bridges, setBridges] = useState<Record<string, IntegrationBridgeState>>({}); const [syncing, setSyncing] = useState(''); const [inn, setInn] = useState(''); const [provider, setProvider] = useState(''); const [type, setType] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState('');
  const loadHealth = useCallback(() => api<Record<string, IntegrationBridgeState>>('/admin/api/integration-bridges').then(setBridges), []); useEffect(() => { void loadHealth(); }, [loadHealth, refreshKey]);
  const sync = async (source: 'atol_connect' | 'platforma_ofd') => { setSyncing(source); try { await post(`/admin/api/integration-bridges/${source}/sync`); await loadHealth(); onChanged(); } finally { setSyncing(''); } };
  const createExclusion = async () => { setError(''); try { await post('/admin/api/integration-exclusions', { inn, ...(provider ? { provider } : {}), ...(type.trim() ? { observationType: type.trim() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) }); setInn(''); setType(''); setReason(''); onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось добавить исключение'); } };
  const toggleExclusion = async (item: IntegrationExclusion, isActive: boolean) => { await post(`/admin/api/integration-exclusions/${item.id}`, { isActive }); onChanged(); };
  if (data.loading) return <Empty text="Загрузка..." />; if (data.error) return <Empty text={data.error} />;
  return <section className="integration-runs"><header><Database size={20} /><div><h2>Синхронизация источников</h2><span>Последние запуски импорта в VITMA MARKET</span></div></header><div className="bridge-grid">{(['atol_connect', 'platforma_ofd'] as const).map((source) => { const state = bridges[source]; return <article className="bridge-state" key={source}><div><strong>{providerName(source)}</strong><Badge>{state?.ready ? state.syncing ? 'Синхронизация' : 'Готов' : 'Недоступен'}</Badge></div><Info label="Последняя синхронизация" value={state?.lastSync ? fmtDate(state.lastSync) : null} />{(state?.lastError || state?.error) && <span className="form-error">{state.lastError || state.error}</span>}{permissions.includes('integrations.manage') && <button className="primary" disabled={!state?.ready || Boolean(syncing)} onClick={() => void sync(source)}><RefreshCw size={17} />{syncing === source ? 'Синхронизация...' : 'Запустить'}</button>}</article>; })}</div><section className="integration-exclusions"><header><div><h3>Исключения из сигналов</h3><span>Данные обновляются, но новые задачи оператору не создаются</span></div></header>{permissions.includes('integrations.manage') && <div className="exclusion-form"><input value={inn} onChange={(event) => setInn(event.target.value)} placeholder="ИНН" /><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">Все источники</option><option value="atol_connect">АТОЛ Connect</option><option value="platforma_ofd">Платформа ОФД</option></select><input value={type} onChange={(event) => setType(event.target.value)} placeholder="Тип сигнала, необязательно" /><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Причина" /><button className="primary" disabled={!inn.trim()} onClick={() => void createExclusion()}>Добавить</button></div>}{error && <p className="form-error">{error}</p>}<div className="exclusion-list">{exclusions.items.length ? exclusions.items.map((item) => <article key={item.id}><div><strong>ИНН {item.inn}</strong><span>{[item.provider ? providerName(item.provider) : 'Все источники', item.observationType || 'Все сигналы'].join(' · ')}</span></div><span>{item.reason || 'Без комментария'}</span><label><input type="checkbox" checked={item.isActive} disabled={!permissions.includes('integrations.manage')} onChange={(event) => void toggleExclusion(item, event.target.checked)} />Активно</label></article>) : <span className="muted">Исключений пока нет</span>}</div></section><div className="integration-run-list">{data.items.length ? data.items.map((run) => <article key={run.id} className={`integration-run ${run.status}`}><div className="row-top"><strong>{providerName(run.provider)} · {run.kind}</strong><span>{fmtDate(run.startedAt)}</span></div><div className="badges"><Badge>{run.mode === 'shadow' ? 'Теневой режим' : 'Рабочий режим'}</Badge><Badge>{run.status}</Badge></div><div className="run-stats"><Info label="Получено" value={run.receivedCount} /><Info label="Применено" value={run.appliedCount} /><Info label="Пропущено" value={run.skippedCount} /><Info label="Ошибки" value={run.errorCount} /></div>{run.errorSummary && <p className="form-error">{run.errorSummary}</p>}</article>) : <Empty text="Запусков синхронизации пока нет" />}</div></section>;
}

function Organizations({ refreshKey }: { refreshKey: number }) {
    const data = useList<{
        id: number;
        name?: string;
        inn?: string;
        kpp?: string;
        ogrn?: string;
        taxSystem?: string;
        members?: unknown[];
    }>('/admin/api/organizations', refreshKey);
    return (
        <section className="simple-grid">
            {data.loading ? (
                <Empty text="Загрузка..." />
            ) : data.error ? (
                <Empty text={data.error} />
            ) : !data.items.length ? (
                <Empty text="Организаций пока нет" />
            ) : (
                data.items.map((org) => (
                    <article className="simple-card" key={org.id}>
                        <h3>{org.name || `Организация #${org.id}`}</h3>
                        <Info
                            label="ИНН / КПП"
                            value={[org.inn, org.kpp]
                                .filter(Boolean)
                                .join(' / ')}
                        />
                        <Info label="ОГРН" value={org.ogrn} />
                        <Info label="СНО" value={org.taxSystem} />
                        <Info
                            label="Представители"
                            value={org.members?.length}
                        />
                    </article>
                ))
            )}
        </section>
    );
}

const accessStatusLabels: Record<string, string> = {
    pending: 'Ожидает проверки',
    approved: 'Одобрен',
    rejected: 'Отклонён',
    cancelled: 'Отозван',
};

function OrganizationAccessQueue({
    refreshKey,
    onChanged,
    canReview,
}: {
    refreshKey: number;
    onChanged: () => void;
    canReview: boolean;
}) {
    const [status, setStatus] = useState('pending');
    const data = useList<OrganizationAccessRequest>(
        `/admin/api/organization-access-requests?status=${status}`,
        refreshKey,
    );
    const [selectedId, setSelectedId] = useState<number>();
    useEffect(() => {
        if (!data.items.some((item) => item.id === selectedId))
            setSelectedId(data.items[0]?.id);
    }, [data.items, selectedId]);
    const selected = data.items.find((item) => item.id === selectedId);
    return (
        <>
            <section className="filters">
                <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                >
                    <option value="pending">Ожидают проверки</option>
                    <option value="approved">Одобренные</option>
                    <option value="rejected">Отклонённые</option>
                    <option value="cancelled">Отозванные</option>
                    <option value="all">Все</option>
                </select>
            </section>
            <Workbench
                title="Запросы доступа"
                items={data.items}
                selectedId={selectedId}
                onSelect={setSelectedId}
                loading={data.loading}
                error={data.error}
                row={(item) => (
                    <>
                        <div className="row-top">
                            <strong>
                                {item.organization?.name ||
                                    `Организация #${item.organization?.id}`}
                            </strong>
                            <span>{fmtDate(item.createdAt)}</span>
                        </div>
                        <span className="row-preview">
                            ИНН {item.organization?.inn} ·{' '}
                            {item.submittedName ||
                                item.customer?.name ||
                                'Имя не указано'}
                        </span>
                        <div className="badges">
                            <Badge>{accessStatusLabels[item.status]}</Badge>
                        </div>
                    </>
                )}
                detail={
                    selected ? (
                        <OrganizationAccessDetail
                            item={selected}
                            canReview={canReview}
                            onChanged={onChanged}
                        />
                    ) : null
                }
            />
        </>
    );
}

function OrganizationAccessDetail({
    item,
    canReview,
    onChanged,
}: {
    item: OrganizationAccessRequest;
    canReview: boolean;
    onChanged: () => void;
}) {
    const [comment, setComment] = useState(item.reviewComment || '');
    const [busy, setBusy] = useState(false);
    useEffect(
        () => setComment(item.reviewComment || ''),
        [item.id, item.reviewComment],
    );
    const decide = async (decision: 'approve' | 'reject') => {
        setBusy(true);
        try {
            await post(
                `/admin/api/organization-access-requests/${item.id}/${decision}`,
                { reviewComment: comment || undefined },
            );
            onChanged();
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <DetailHeader
                title={`Запрос #${item.id} · ${item.organization?.name || 'Организация'}`}
                subtitle={`${accessStatusLabels[item.status]} · ${fmtDate(item.createdAt)}`}
            />
            <div className="detail-body">
                <FieldGrid
                    fields={[
                        [
                            'ИНН / КПП',
                            [item.organization?.inn, item.organization?.kpp]
                                .filter(Boolean)
                                .join(' / '),
                        ],
                        ['Клиент', item.submittedName || item.customer?.name],
                        ['Телефон', item.submittedPhone],
                        ['Email', item.submittedEmail],
                        [
                            'Канал',
                            item.customer
                                ? `${item.customer.platform} · ${item.customer.chatId}`
                                : null,
                        ],
                        ['Комментарий клиента', item.comment],
                        ['Роль после одобрения', 'Представитель'],
                        ['Проверил', item.reviewer?.displayName],
                        [
                            'Рассмотрен',
                            item.reviewedAt ? fmtDate(item.reviewedAt) : null,
                        ],
                    ]}
                />
                {canReview && item.status === 'pending' && (
                    <div className="operator-panel">
                        <textarea
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            placeholder="Комментарий проверки"
                            maxLength={1000}
                        />
                        <div className="actions">
                            <button
                                className="primary"
                                disabled={busy}
                                onClick={() => void decide('approve')}
                            >
                                <Check size={16} />
                                Одобрить
                            </button>
                            <button
                                className="danger"
                                disabled={busy}
                                onClick={() => void decide('reject')}
                            >
                                <X size={16} />
                                Отклонить
                            </button>
                        </div>
                    </div>
                )}
                {item.status !== 'pending' && item.reviewComment && (
                    <div className="operator-panel">
                        <Info
                            label="Комментарий проверки"
                            value={item.reviewComment}
                        />
                    </div>
                )}
            </div>
        </>
    );
}

type AuditRow = {
    id: number;
    action: string;
    createdAt: string;
    actorType: string;
    actorStaffId?: number;
    targetType?: string;
    targetId?: string;
    result: string;
    reason?: string;
    metadata?: Record<string, unknown>;
};
function AuditLog({ refreshKey }: { refreshKey: number }) {
    const [result, setResult] = useState('');
    const [action, setAction] = useState('');
    const [data, setData] = useState<{ items: AuditRow[]; total: number }>({
        items: [],
        total: 0,
    });
    useEffect(() => {
        const query = new URLSearchParams({ limit: '100' });
        if (result) query.set('result', result);
        if (action.trim()) query.set('action', action.trim());
        api<{ items: AuditRow[]; total: number }>(
            `/admin/api/audit-events?${query}`,
        )
            .then(setData)
            .catch(() => setData({ items: [], total: 0 }));
    }, [refreshKey, result, action]);
    return (
        <section>
            <div className="filters">
                <select
                    value={result}
                    onChange={(event) => setResult(event.target.value)}
                >
                    <option value="">Все результаты</option>
                    <option value="success">Успешно</option>
                    <option value="denied">Отказано</option>
                    <option value="failure">Ошибка</option>
                </select>
                <input
                    value={action}
                    onChange={(event) => setAction(event.target.value)}
                    placeholder="Точное название действия"
                />
            </div>
            <div className="simple-grid">
                {data.items.map((event) => (
                    <article className="simple-card" key={event.id}>
                        <h3>{event.action}</h3>
                        <Info label="Время" value={fmtDate(event.createdAt)} />
                        <Info
                            label="Инициатор"
                            value={`${event.actorType}${event.actorStaffId ? ` #${event.actorStaffId}` : ''}`}
                        />
                        <Info
                            label="Объект"
                            value={`${event.targetType}${event.targetId ? ` #${event.targetId}` : ''}`}
                        />
                        <Info label="Результат" value={event.result} />
                        {event.reason && (
                            <Info label="Причина" value={event.reason} />
                        )}
                        {event.metadata && (
                            <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                        )}
                    </article>
                ))}
            </div>
            {!data.items.length && <Empty text="События аудита не найдены" />}
        </section>
    );
}

function EquipmentKits({
    refreshKey,
    onChanged,
}: {
    refreshKey: number;
    onChanged: () => void;
}) {
    const data = useList<EquipmentKit>('/admin/api/equipment-kits', refreshKey);
    const [form, setForm] = useState<Record<string, string>>({});
    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        await post('/admin/api/equipment-kits', form);
        setForm({});
        onChanged();
    };
    const input = (key: string, placeholder: string) => (
        <input
            placeholder={placeholder}
            value={form[key] || ''}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
    );
    return (
        <>
            <form
                className="kit-form"
                onSubmit={(event) =>
                    void create(event).catch(reportLegacyError)
                }
            >
                {input('cashRegisterModel', 'Модель ККТ')}
                {input('cashRegisterSerial', 'Заводской номер ККТ')}
                {input('fiscalDriveSerial', 'Номер ФН')}
                {input('ofdActivationCode', 'Код активации ОФД')}
                {input('marketplaceOrderId', 'Номер заказа')}
                <button className="primary">Добавить комплект</button>
            </form>
            <section className="simple-grid">
                {data.items.map((kit) => (
                    <article className="simple-card" key={kit.id}>
                        <h3>Комплект #{kit.id}</h3>
                        <Badge>{kit.status || 'Новый'}</Badge>
                        <Info
                            label="ККТ"
                            value={`${kit.cashRegisterModel || ''} ${kit.cashRegisterSerial || ''}`.trim()}
                        />
                        <Info label="ФН" value={kit.fiscalDriveSerial} />
                        <Info label="ОФД" value={kit.ofdActivationCode} />
                        <Info label="Заказ" value={kit.marketplaceOrderId} />
                    </article>
                ))}
            </section>
        </>
    );
}

const roleOptions: Array<{ value: AdminRole; label: string }> = [
    { value: 'operator', label: 'Оператор' },
    { value: 'engineer', label: 'Инженер' },
    { value: 'sales_manager', label: 'Менеджер продаж' },
    { value: 'superadmin', label: 'Superadmin' },
];

function StaffManagement({
    refreshKey,
    onChanged,
}: {
    refreshKey: number;
    onChanged: () => void;
}) {
    const data = useList<Staff>('/admin/api/staff', refreshKey);
    const [form, setForm] = useState({
        login: '',
        displayName: '',
        password: '',
        roles: ['operator'] as AdminRole[],
    });
    const create = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await post('/admin/api/staff', form);
            setForm({
                login: '',
                displayName: '',
                password: '',
                roles: ['operator'],
            });
            onChanged();
        } catch (error) {
            let message =
                'Не удалось создать сотрудника. Проверьте данные и повторите попытку.';
            if (error instanceof ApiError && error.status === 409) {
                message = 'Сотрудник с таким логином уже существует.';
            } else if (error instanceof ApiError && error.status === 400) {
                message =
                    'Пароль должен содержать 12-128 символов, не включать логин и использовать минимум три группы: строчные, заглавные, цифры или специальные символы.';
            }
            window.dispatchEvent(
                new CustomEvent('vitma:notice', { detail: message }),
            );
        }
    };
    const toggle = (role: AdminRole) =>
        setForm((current) => ({
            ...current,
            roles: current.roles.includes(role)
                ? current.roles.filter((item) => item !== role)
                : [...current.roles, role],
        }));
    return (
        <>
            <form
                className="staff-form"
                onSubmit={(event) =>
                    void create(event).catch(reportLegacyError)
                }
            >
                <div className="form-row">
                    <input
                        required
                        minLength={3}
                        placeholder="Логин"
                        value={form.login}
                        onChange={(e) =>
                            setForm({ ...form, login: e.target.value })
                        }
                    />
                    <input
                        required
                        placeholder="Имя сотрудника"
                        value={form.displayName}
                        onChange={(e) =>
                            setForm({ ...form, displayName: e.target.value })
                        }
                    />
                    <input
                        required
                        minLength={12}
                        type="password"
                        autoComplete="new-password"
                        placeholder="Пароль"
                        value={form.password}
                        onChange={(e) =>
                            setForm({ ...form, password: e.target.value })
                        }
                    />
                    <button className="primary" disabled={!form.roles.length}>
                        <UserPlus size={16} />
                        Создать
                    </button>
                </div>
                <div className="role-picker">
                    {roleOptions.map((role) => (
                        <label key={role.value}>
                            <input
                                type="checkbox"
                                checked={form.roles.includes(role.value)}
                                onChange={() => toggle(role.value)}
                            />
                            {role.label}
                        </label>
                    ))}
                </div>
            </form>
            <section className="simple-grid">
                {data.loading ? (
                    <Empty text="Загрузка..." />
                ) : data.error ? (
                    <Empty text={data.error} />
                ) : (
                    data.items.map((staff) => (
                        <StaffCard
                            key={staff.id}
                            staff={staff}
                            onChanged={onChanged}
                        />
                    ))
                )}
            </section>
        </>
    );
}

function StaffCard({
    staff,
    onChanged,
}: {
    staff: Staff;
    onChanged: () => void;
}) {
    const [password, setPassword] = useState('');
    const changeRole = async (role: AdminRole) => {
        const roles = staff.roles.includes(role)
            ? staff.roles.filter((item) => item !== role)
            : [...staff.roles, role];
        if (!roles.length) return;
        await post(`/admin/api/staff/${staff.id}/roles`, { roles });
        onChanged();
    };
    const toggleActive = async () => {
        await post(`/admin/api/staff/${staff.id}/active`, {
            isActive: !staff.isActive,
        });
        onChanged();
    };
    const resetPassword = async () => {
        if (password.length < 12) return;
        await post(`/admin/api/staff/${staff.id}/password`, { password });
        setPassword('');
        onChanged();
    };
    const revoke = async () => {
        await post(`/admin/api/staff/${staff.id}/sessions/revoke`);
        onChanged();
    };
    return (
        <article className="simple-card staff-card">
            <div className="row-top">
                <h3>{staff.displayName}</h3>
                <Badge>{staff.isActive ? 'Активен' : 'Отключён'}</Badge>
            </div>
            <Info label="Логин" value={staff.login} />
            <Info label="Создан" value={fmtDate(staff.createdAt)} />
            <Info
                label="Последний вход"
                value={
                    staff.lastLoginAt
                        ? fmtDate(staff.lastLoginAt)
                        : 'Ещё не входил'
                }
            />
            <div className="role-picker">
                {roleOptions.map((role) => (
                    <label key={role.value}>
                        <input
                            type="checkbox"
                            checked={staff.roles.includes(role.value)}
                            onChange={() =>
                                void changeRole(role.value).catch(
                                    reportLegacyError,
                                )
                            }
                        />
                        {role.label}
                    </label>
                ))}
            </div>
            <div className="form-row">
                <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Новый пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button
                    disabled={password.length < 12}
                    onClick={() =>
                        void resetPassword().catch(reportLegacyError)
                    }
                >
                    <KeyRound size={16} />
                    Сбросить
                </button>
            </div>
            <div className="actions">
                <button onClick={() => void revoke().catch(reportLegacyError)}>
                    <ShieldCheck size={16} />
                    Отозвать сессии
                </button>
                <button
                    className={staff.isActive ? 'danger' : ''}
                    onClick={() => void toggleActive().catch(reportLegacyError)}
                >
                    {staff.isActive ? 'Отключить' : 'Активировать'}
                </button>
            </div>
        </article>
    );
}

type Navigate = (tab: Tab, id?: number) => void;
function reportLegacyError() {
    window.dispatchEvent(
        new CustomEvent('vitma:notice', {
            detail: 'Не удалось выполнить действие. Обновите данные и повторите попытку.',
        }),
    );
}
interface ListProps {
    status: string;
    platform: string;
    priority?: string;
    refreshKey: number;
    requestedId?: number;
    onNavigate: Navigate;
    onChanged: () => void;
    permissions?: string[];
}
function DetailHeader({
    title,
    subtitle,
    onCustomer,
    right,
}: {
    title: string;
    subtitle: string;
    onCustomer?: () => void;
    right?: React.ReactNode;
}) {
    return (
        <div className="detail-header">
            <div>
                <h2>{title}</h2>
                <span>{subtitle}</span>
            </div>
            <div className="actions">
                {onCustomer && (
                    <button onClick={onCustomer}>
                        <UserRound size={16} />
                        Карточка клиента
                    </button>
                )}
                {right}
            </div>
        </div>
    );
}
function FieldGrid({ fields }: { fields: Array<[string, unknown]> }) {
    return (
        <div className="field-grid">
            {fields.map(([label, val]) => (
                <Info key={label} label={label} value={val} />
            ))}
        </div>
    );
}
// prettier-ignore
function Info({ label, value: input }: { label: string; value: unknown }) { const fileUrl = typeof input === 'string' && input.startsWith('/admin/api/') ? input : null; return <div className="info"><span>{label}</span><strong>{fileUrl ? <a className="button" href={fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Открыть файл</a> : value(input)}</strong></div>; }
function Empty({ text }: { text: string }) {
    return <div className="empty">{text}</div>;
}
function DeliveryStatusList({
    deliveries,
}: {
    deliveries?: OutboundDelivery[];
}) {
    if (!deliveries?.length) return null;
    const labels: Record<OutboundDelivery['status'], string> = {
        pending: 'Ожидает отправки',
        processing: 'Отправляется',
        retrying: 'Повторная отправка',
        sent: 'Отправлено',
        failed: 'Ошибка доставки',
    };
    return (
        <div className="delivery-statuses">
            {deliveries.map((delivery) => (
                <div className="delivery-status" key={delivery.id}>
                    <Badge>{labels[delivery.status]}</Badge>
                    <span>
                        {delivery.audience === 'customer'
                            ? 'Клиент'
                            : 'Сотрудник'}{' '}
                        · {delivery.platform} · {delivery.recipient} · попыток:{' '}
                        {delivery.attemptCount}
                    </span>
                    {delivery.lastError && <small>{delivery.lastError}</small>}
                </div>
            ))}
        </div>
    );
}
function Badge({
    children,
    priority,
}: {
    children: React.ReactNode;
    priority?: Priority;
}) {
    return (
        <span className={`badge ${priority ? `priority-${priority}` : ''}`}>
            {children}
        </span>
    );
}
function Message({ message }: { message: TicketMessage }) {
    const url = message.storedFileId
        ? `/admin/api/ticket-messages/${message.id}/file`
        : undefined;
    const fileName = message.storedFile?.originalName;
    return (
        <div
            className={`message ${message.sender === 'operator' ? 'operator' : 'client'}`}
        >
            {message.messageType === 'image' && url ? (
                <a href={url} target="_blank">
                    <img src={url} alt={fileName || 'Изображение'} />
                </a>
            ) : message.messageType && message.messageType !== 'text' && url ? (
                <a href={url} target="_blank">
                    {fileName || message.text || 'Открыть файл'}
                </a>
            ) : (
                <div>{message.text}</div>
            )}
            <span>
                {message.sender === 'operator' ? 'Оператор' : 'Клиент'} ·{' '}
                {fmtDate(message.createdAt)}
            </span>
        </div>
    );
}
async function loadCustomerCard(item: {
    userId?: number;
    organizationId?: number;
    platform?: string;
    chatId?: string;
}) {
    const params = new URLSearchParams();
    if (item.userId) params.set('userId', String(item.userId));
    if (item.organizationId)
        params.set('organizationId', String(item.organizationId));
    if (item.platform) params.set('platform', item.platform);
    if (item.chatId) params.set('chatId', item.chatId);
    return api<CustomerCard>(`/admin/api/customer-card?${params}`);
}
function standardApiStatus(status: string) {
    return status === 'closed' ? 'processed' : status === 'all' ? 'all' : 'new';
}
