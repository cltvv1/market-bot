import { useCallback, useEffect, useMemo, useState } from 'react';
// prettier-ignore
import {
    Activity, Bell, Check, Database, ExternalLink, FileText, KeyRound, Link,
    LogOut, RefreshCw, Send, ShieldCheck, UserPlus, UserRound, X,
} from 'lucide-react';
import { ApiError, api, post, upload } from './api';
import { answerLabels, fmtDate, priorityText, registrationStatus, statusText, value } from './format';
// prettier-ignore
import type {
    Admin, AdminRole, CustomerCard, EquipmentKit, IntegrationBridgeState,
    IntegrationExclusion, IntegrationRun, NotificationSettings, OpportunityDetail,
    OpportunityStatus, Priority, Registration, ServiceEvent, ServiceOpportunity,
    ServiceRequest, Staff, Summary, Tab, Ticket, TicketMessage,
} from './types';

// prettier-ignore
const tabs: Array<{ id: Tab; label: string; permissions: string[] }> = [
  { id: 'registrations', label: 'Регистрации', permissions: ['registrations.read'] },
  { id: 'service', label: 'Заявки по сервису', permissions: ['serviceRequests.read.all', 'serviceRequests.read.assigned'] },
  { id: 'tickets', label: 'Вопросы', permissions: ['tickets.read'] },
  { id: 'opportunities', label: 'Сигналы', permissions: ['opportunities.read'] },
  { id: 'organizations', label: 'Организации', permissions: ['organizations.read'] },
  { id: 'equipment-kits', label: 'Комплекты', permissions: ['assets.read'] },
  { id: 'integrations', label: 'Интеграции', permissions: ['integrations.read'] },
  { id: 'staff', label: 'Сотрудники', permissions: ['staff.roles.manage'] },
  { id: 'audit', label: 'Audit Log', permissions: ['audit.read'] },
];

const priorities: Array<{ value: Priority | ''; label: string }> = [
  { value: '', label: 'Любой приоритет' }, { value: 'low', label: 'Низкий' },
  { value: 'normal', label: 'Обычный' }, { value: 'high', label: 'Высокий' }, { value: 'urgent', label: 'Срочный' },
];

// prettier-ignore
export function App() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('registrations');
  const [summary, setSummary] = useState<Summary>({ newRegistrations: 0, activeServiceRequests: 0, openTickets: 0 });
  const [status, setStatus] = useState('new');
  const [platform, setPlatform] = useState('');
  const [priority, setPriority] = useState('');
  const [responsible, setResponsible] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selection, setSelection] = useState<{ tab: Tab; id: number } | null>(null);
  const [notice, setNotice] = useState('');
  const visibleTabs = useMemo(() => tabs.filter((item) => item.permissions.some((permission) => admin?.permissions.includes(permission))), [admin]);

  useEffect(() => {
    api<{ admin: Admin }>('/admin/api/me')
      .then((result) => setAdmin(result.admin))
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const expired = () => { setAdmin(null); setNotice('Сессия завершена. Войдите снова.'); };
    const forbidden = (event: Event) => {
      const message = event instanceof CustomEvent && typeof event.detail === 'string'
        ? event.detail
        : 'Недостаточно прав для этого действия.';
      setNotice(message);
    };
    const notify = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        setNotice(event.detail);
      }
    };
    window.addEventListener('vitma:unauthorized', expired);
    window.addEventListener('vitma:forbidden', forbidden);
    window.addEventListener('vitma:notice', notify);
    return () => {
      window.removeEventListener('vitma:unauthorized', expired);
      window.removeEventListener('vitma:forbidden', forbidden);
      window.removeEventListener('vitma:notice', notify);
    };
  }, []);

  useEffect(() => {
    if (admin && !visibleTabs.some((item) => item.id === tab) && visibleTabs[0]) setTab(visibleTabs[0].id);
  }, [admin, tab, visibleTabs]);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
    if (admin) api<Summary>('/admin/api/summary').then(setSummary).catch(() => undefined);
  }, [admin]);

  useEffect(() => { refresh(); }, [refresh]);

  const navigate = (nextTab: Tab, id?: number) => {
    setTab(nextTab);
    if (id) setSelection({ tab: nextTab, id });
    setStatus('all');
    setPlatform('');
    setPriority('');
    setResponsible('');
  };

  if (checking) return <div className="center-screen"><div className="loader" />Проверяем сессию...</div>;
  if (!admin) return <Login onLogin={setAdmin} />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">В</span><div><strong>Витма</strong><span>Рабочее место оператора</span></div></div>
        <div className="topbar-actions">
          <NotificationMenu notice={notice} onNotice={setNotice} />
          <span className="admin-name">{admin.displayName} · {admin.roles.join(', ')}</span>
          <button className="icon-button" title="Обновить" onClick={refresh}><RefreshCw size={18} /></button>
          <button className="icon-button" title="Выйти" onClick={() => post('/admin/api/logout').finally(() => setAdmin(null))}><LogOut size={18} /></button>
        </div>
      </header>

      <main>
        {notice && <div className="notice"><Bell size={16} />{notice}<button title="Закрыть" onClick={() => setNotice('')}><X size={16} /></button></div>}
        <section className="stats">
          {can(admin, 'registrations.read') && <Stat label="Новые регистрации" count={summary.newRegistrations} onClick={() => navigate('registrations')} />}
          {(can(admin, 'serviceRequests.read.all') || can(admin, 'serviceRequests.read.assigned')) && <Stat label="Активные заявки" count={summary.activeServiceRequests} onClick={() => navigate('service')} />}
          {can(admin, 'tickets.read') && <Stat label="Открытые вопросы" count={summary.openTickets} onClick={() => navigate('tickets')} />}
        </section>

        <nav className="tabs">
          {visibleTabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setSelection(null); setStatus('new'); }}>{item.label}</button>)}
        </nav>

        {tab !== 'organizations' && tab !== 'equipment-kits' && tab !== 'opportunities' && tab !== 'integrations' && tab !== 'staff' && tab !== 'audit' && (
          <section className="filters">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="new">Новые</option><option value="in_work">В работе</option>
              {tab === 'service' && <option value="waiting_payment">Ожидают оплату</option>}
              <option value="closed">Закрытые</option><option value="all">Все</option>
            </select>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="">Все платформы</option><option value="telegram">Telegram</option><option value="max">MAX</option><option value="web">Web</option>
            </select>
            {tab !== 'tickets' && <select value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}
            {tab === 'service' && <input value={responsible} onChange={(event) => setResponsible(event.target.value)} placeholder="Куратор или исполнитель" />}
          </section>
        )}

        {tab === 'registrations' && <Registrations status={status} platform={platform} priority={priority} refreshKey={refreshKey} requestedId={selection?.tab === tab ? selection.id : undefined} onNavigate={navigate} onChanged={refresh} />}
        {tab === 'tickets' && <Tickets status={status} platform={platform} refreshKey={refreshKey} requestedId={selection?.tab === tab ? selection.id : undefined} onNavigate={navigate} onChanged={refresh} />}
        {tab === 'service' && <ServiceRequests status={status} platform={platform} priority={priority} responsible={responsible} refreshKey={refreshKey} requestedId={selection?.tab === tab ? selection.id : undefined} onNavigate={navigate} onChanged={refresh} permissions={admin.permissions} />}
        {tab === 'opportunities' && <Opportunities refreshKey={refreshKey} onChanged={refresh} onNavigate={navigate} />}
        {tab === 'organizations' && <Organizations refreshKey={refreshKey} />}
        {tab === 'equipment-kits' && <EquipmentKits refreshKey={refreshKey} onChanged={refresh} />}
        {tab === 'integrations' && <IntegrationRuns refreshKey={refreshKey} permissions={admin.permissions} onChanged={refresh} />}
        {tab === 'staff' && <StaffManagement refreshKey={refreshKey} onChanged={refresh} />}
        {tab === 'audit' && <AuditLog refreshKey={refreshKey} />}
        {!visibleTabs.length && <Empty text="Для назначенных ролей пока нет рабочих разделов" />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (admin: Admin) => void }) {
  const [login, setLogin] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { onLogin((await post<{ admin: Admin }>('/admin/api/login', { login, password })).admin); }
    catch { setError('Неверный логин или пароль'); }
    finally { setBusy(false); }
  };
  return <div className="login-screen"><form className="login-panel" onSubmit={submit}><div className="brand login-brand"><span className="brand-mark">В</span><div><strong>Витма</strong><span>Административная панель</span></div></div><h1>Вход для сотрудников</h1><label>Логин<input autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus /></label><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? 'Входим...' : 'Войти'}</button></form></div>;
}

function NotificationMenu({ notice, onNotice }: { notice: string; onNotice: (value: string) => void }) {
  const [open, setOpen] = useState(false); const [settings, setSettings] = useState<NotificationSettings | null>(null);
  useEffect(() => { if (open && !settings) api<NotificationSettings>('/admin/api/notification-bindings').then(setSettings); }, [open, settings]);
  const toggle = async (key: keyof NotificationSettings) => {
    if (!settings) return; const next = { ...settings, [key]: !settings[key] }; setSettings(next);
    await post('/admin/api/notification-bindings/settings', next);
  };
  const bind = async (platform: 'telegram' | 'max') => {
    const result = await post<{ command: string }>('/admin/api/notification-bindings/code', { platform });
    onNotice(`Отправьте боту ${result.command} в ${platform === 'max' ? 'MAX' : 'Telegram'}`); setOpen(false);
  };
  return <div className="menu-wrap"><button className="icon-button" title="Уведомления" onClick={() => setOpen(!open)}><Bell size={18} /></button>{open && <div className="popover"><strong>Уведомления</strong>{settings ? <><label><input type="checkbox" checked={settings.notifyRegistrations} onChange={() => toggle('notifyRegistrations')} /> Регистрации</label><label><input type="checkbox" checked={settings.notifyTickets} onChange={() => toggle('notifyTickets')} /> Вопросы</label><label><input type="checkbox" checked={settings.notifyServiceRequests} onChange={() => toggle('notifyServiceRequests')} /> Сервис</label><div className="popover-actions"><button onClick={() => bind('telegram')}>Код Telegram</button><button onClick={() => bind('max')}>Код MAX</button></div></> : <span className="muted">Загрузка...</span>}</div>}</div>;
}

function Stat({ label, count, onClick }: { label: string; count: number; onClick: () => void }) { return <button className="stat" onClick={onClick}><span>{label}</span><strong>{count}</strong></button>; }

function useList<T>(path: string, refreshKey: number) {
  const [items, setItems] = useState<T[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { setLoading(true); setError(''); api<T[]>(path).then(setItems).catch((e) => setError(e instanceof ApiError ? e.message : 'Ошибка загрузки')).finally(() => setLoading(false)); }, [path, refreshKey]);
  return { items, loading, error };
}

function Workbench<T extends { id: number }>({ title, items, selectedId, onSelect, row, detail, loading, error }: { title: string; items: T[]; selectedId?: number; onSelect: (id: number) => void; row: (item: T) => React.ReactNode; detail: React.ReactNode; loading: boolean; error: string }) {
  return <section className="workbench"><aside className="work-list"><div className="work-list-title">{title}<span>{items.length}</span></div>{loading ? <Empty text="Загрузка..." /> : error ? <Empty text={error} /> : items.length ? items.map((item) => <button key={item.id} className={`work-row ${selectedId === item.id ? 'active' : ''}`} onClick={() => onSelect(item.id)}>{row(item)}</button>) : <Empty text="Ничего не найдено" />}</aside><article className="work-detail">{detail || <Empty text="Выберите запись слева" />}</article></section>;
}

function Registrations(props: ListProps) {
  const query = useMemo(() => new URLSearchParams({ status: registrationApiStatus(props.status), ...(props.platform ? { platform: props.platform } : {}), ...(props.priority ? { priority: props.priority } : {}) }).toString(), [props.status, props.platform, props.priority]);
  const data = useList<Registration>(`/admin/api/registrations?${query}`, props.refreshKey);
  const [selectedId, setSelectedId] = useState<number>(); const [card, setCard] = useState<CustomerCard | null>(null);
  useEffect(() => { const id = props.requestedId || data.items[0]?.id; if (id) setSelectedId(id); }, [data.items, props.requestedId]);
  const selected = data.items.find((item) => item.id === selectedId);
  const openCard = async () => selected && setCard(await loadCustomerCard(selected));
  return <Workbench title="Анкеты на регистрацию" items={data.items} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setCard(null); }} loading={data.loading} error={data.error} row={(item) => <><div className="row-top"><strong>Анкета #{item.id} · {item.orgName || item.innKpp || 'Без названия'}</strong><span>{fmtDate(item.createdAt)}</span></div><div className="badges"><Badge>{registrationStatus(item)}</Badge><Badge priority={item.priority}>{priorityText(item.priority)}</Badge></div><span className="row-preview">{item.platform}</span></>} detail={card ? <CustomerCardView card={card} onClose={() => setCard(null)} onNavigate={props.onNavigate} /> : selected ? <RegistrationDetail item={selected} onCustomer={openCard} onChanged={props.onChanged} /> : null} />;
}

function RegistrationDetail({ item, onCustomer, onChanged }: { item: Registration; onCustomer: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState(item.isProcessed ? 'processed' : item.status || 'new'); const [priority, setPriority] = useState(item.priority || 'normal'); const [kits, setKits] = useState<EquipmentKit[]>([]); const [kitId, setKitId] = useState('');
  useEffect(() => { api<EquipmentKit[]>('/admin/api/equipment-kits/free').then(setKits); }, [item.id]);
  const fields: Array<[string, unknown]> = [['Статус', registrationStatus(item)], ['Приоритет', priorityText(item.priority)], ['Организация', item.orgName], ['ИНН/КПП', item.innKpp], ['ОГРН', item.ogrn], ['Юридический адрес', item.urAdress], ['Адрес ККТ', item.kktAdress], ['Модель ККТ', item.kktModel || item.kktName], ['Телефон', item.phoneToCall || item.phone], ['Email', item.email], ['НДС', item.nds], ['Акциз', item.excise], ['Маркировка', item.markirovka], ['Услуги', item.services], ['БСО', item.strictReporting], ['СНО', item.taxSystem], ['Банковские реквизиты', item.bankReqs], ['ОФД', item.ofd], ['Комплект', item.equipmentKitId ? `#${item.equipmentKitId}` : null]];
  const save = async () => { await post(`/admin/api/registrations/${item.id}/operator-state`, { status, priority }); onChanged(); };
  const linkKit = async () => { if (!kitId) return; await post(`/admin/api/registrations/${item.id}/equipment-kit`, { kitId: Number(kitId) }); onChanged(); };
  return <><DetailHeader title={`Анкета #${item.id} · ${item.orgName || 'Без названия'}`} subtitle={`${item.platform} · ${registrationStatus(item)} · ${fmtDate(item.createdAt)}`} onCustomer={onCustomer} /><div className="detail-body"><FieldGrid fields={fields} />{item.equipmentPhotoPath && <a className="file-link" href={`/admin/api/registrations/${item.id}/equipment-photo`} target="_blank"><ExternalLink size={16} />Открыть фото комплекта</a>}<div className="operator-panel"><div className="form-row"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="new">Новая</option><option value="in_work">В работе</option><option value="processed">Обработана</option></select><PrioritySelect value={priority} onChange={setPriority} /><button className="primary" onClick={save}><Check size={16} />Сохранить</button></div>{!item.equipmentKitId && <div className="form-row"><select value={kitId} onChange={(e) => setKitId(e.target.value)}><option value="">Выберите свободный комплект</option>{kits.map((kit) => <option key={kit.id} value={kit.id}>#{kit.id} · {kit.cashRegisterSerial || kit.fiscalDriveSerial || kit.marketplaceOrderId}</option>)}</select><button onClick={linkKit}><Link size={16} />Привязать</button></div>}<div className="actions">{item.pdfPath && <a className="button" href={`/admin/api/registrations/${item.id}/pdf`} target="_blank"><FileText size={16} />Скачать PDF</a>}</div></div></div></>;
}

function Tickets(props: ListProps) {
  const query = useMemo(() => new URLSearchParams({ status: standardApiStatus(props.status), ...(props.platform ? { platform: props.platform } : {}) }).toString(), [props.status, props.platform]);
  const data = useList<Ticket>(`/admin/api/tickets?${query}`, props.refreshKey); const [selectedId, setSelectedId] = useState<number>();
  useEffect(() => { const id = props.requestedId || data.items[0]?.id; if (id) setSelectedId(id); }, [data.items, props.requestedId]);
  return <Workbench title="Вопросы" items={data.items} selectedId={selectedId} onSelect={setSelectedId} loading={data.loading} error={data.error} row={(item) => <><div className="row-top"><strong>{item.name || item.username || `Вопрос #${item.id}`}</strong><span>{fmtDate(item.createdAt)}</span></div><span className="row-preview">{item.text || 'Без текста'}</span></>} detail={selectedId ? <TicketDetail id={selectedId} onNavigate={props.onNavigate} onChanged={props.onChanged} /> : null} />;
}

function TicketDetail({ id, onNavigate, onChanged }: { id: number; onNavigate: Navigate; onChanged: () => void }) {
  const [data, setData] = useState<{ ticket: Ticket; messages: TicketMessage[] }>(); const [card, setCard] = useState<CustomerCard | null>(null); const [text, setText] = useState(''); const [file, setFile] = useState<File>();
  const load = useCallback(() => api<{ ticket: Ticket; messages: TicketMessage[] }>(`/admin/api/tickets/${id}`).then(setData), [id]);
  useEffect(() => { setCard(null); load(); }, [load]);
  if (!data) return <Empty text="Загрузка диалога..." />;
  const ticket = data.ticket;
  const send = async () => { if (!text.trim()) return; await post(`/admin/api/tickets/${id}/messages`, { text }); setText(''); await load(); onChanged(); };
  const sendFile = async () => { if (!file) return; const form = new FormData(); form.append('file', file); if (text) form.append('text', text); await upload(`/admin/api/tickets/${id}/media`, form); setFile(undefined); setText(''); await load(); };
  const close = async () => { await post(`/admin/api/tickets/${id}/close`); await load(); onChanged(); };
  const openCard = async () => setCard(await loadCustomerCard({ ...ticket, chatId: ticket.userChatId }));
  if (card) return <CustomerCardView card={card} onClose={() => setCard(null)} onNavigate={onNavigate} />;
  return <><DetailHeader title={`Вопрос #${id} · ${ticket.name || ticket.username || ticket.userChatId}`} subtitle={`${ticket.platform} · ${fmtDate(ticket.createdAt)}`} onCustomer={openCard} right={!ticket.isAnswered ? <button className="danger" onClick={close}>Закрыть</button> : <Badge>Закрыт</Badge>} /><div className="chat-body"><div className="messages">{data.messages?.map((message) => <Message key={message.id} message={message} />)}</div>{!ticket.isAnswered && <div className="chat-composer"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ответ клиенту" /><div className="composer-actions"><label className="file-picker"><FileText size={16} />{file?.name || 'Прикрепить файл'}<input type="file" onChange={(e) => setFile(e.target.files?.[0])} /></label>{file && <button onClick={sendFile}>Отправить файл</button>}<button className="primary" onClick={send}><Send size={16} />Отправить</button></div></div>}</div></>;
}

function ServiceRequests(props: ListProps & { responsible: string; permissions: string[] }) {
  const statuses = serviceApiStatuses(props.status); const paths = statuses.map((status) => `/admin/api/service-requests?${new URLSearchParams({ status, ...(props.platform ? { platform: props.platform } : {}) })}`);
  const [items, setItems] = useState<ServiceRequest[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [selectedId, setSelectedId] = useState<number>();
  useEffect(() => { setLoading(true); Promise.all(paths.map((path) => api<ServiceRequest[]>(path))).then((groups) => setItems(groups.flat())).catch(() => setError('Ошибка загрузки')).finally(() => setLoading(false)); }, [paths.join('|'), props.refreshKey]);
  const filtered = items.filter((item) => (!props.priority || (item.priority || 'normal') === props.priority) && (!props.responsible || `${item.responsibleOperatorId || ''} ${item.executorName || ''}`.toLowerCase().includes(props.responsible.toLowerCase())));
  useEffect(() => { const id = props.requestedId || filtered[0]?.id; if (id) setSelectedId(id); }, [items, props.requestedId, props.priority, props.responsible]);
  return <Workbench title="Заявки по сервису" items={filtered} selectedId={selectedId} onSelect={setSelectedId} loading={loading} error={error} row={(item) => <><div className="row-top"><strong>Заявка #{item.id} · {item.serviceTypeTitle}</strong><span>{fmtDate(item.createdAt)}</span></div><div className="badges"><Badge>{statusText(item.status)}</Badge><Badge priority={item.priority}>{priorityText(item.priority)}</Badge></div><span className="row-preview">{item.executorName ? `Исполнитель: ${item.executorName}` : item.platform}</span></>} detail={selectedId ? <ServiceDetail id={selectedId} onNavigate={props.onNavigate} onChanged={props.onChanged} permissions={props.permissions} /> : null} />;
}

// prettier-ignore
function ServiceDetail({ id, onNavigate, onChanged, permissions }: { id: number; onNavigate: Navigate; onChanged: () => void; permissions: string[] }) {
  const [data, setData] = useState<{ request: ServiceRequest; events: ServiceEvent[] }>(); const [card, setCard] = useState<CustomerCard | null>(null); const [priority, setPriority] = useState<Priority>('normal'); const [comment, setComment] = useState(''); const [invoice, setInvoice] = useState<File>(); const [address, setAddress] = useState(''); const [visitTime, setVisitTime] = useState(''); const [engineers, setEngineers] = useState<Staff[]>([]); const [engineerId, setEngineerId] = useState('');
  const allowed = (permission: string) => permissions.includes(permission) && (permission !== 'serviceRequests.payment' || (data?.request.status === 'waiting_payment' && Boolean(data.request.paymentProofFileId)));
  const load = useCallback(() => api<{ request: ServiceRequest; events: ServiceEvent[] }>(`/admin/api/service-requests/${id}`).then((result) => { setData(result); setPriority(result.request.priority || 'normal'); setComment(result.request.operatorComment || ''); setEngineerId(result.request.assignedEngineerId ? String(result.request.assignedEngineerId) : ''); }), [id]);
  useEffect(() => { setCard(null); load(); }, [load]);
  useEffect(() => { if (allowed('serviceRequests.assign')) api<Staff[]>('/admin/api/staff/engineers').then(setEngineers); }, [permissions.join('|')]); useEffect(() => { if (data?.request.status !== 'waiting_payment' || data.request.paymentProofFileId) return; const timer = window.setInterval(() => { void api<{ request: ServiceRequest; events: ServiceEvent[] }>(`/admin/api/service-requests/${id}`).then(setData); }, 5000); return () => window.clearInterval(timer); }, [id, data?.request.status, data?.request.paymentProofFileId]);
  if (!data) return <Empty text="Загрузка заявки..." />;
  const request = data.request; const answers = Object.entries(request.answers || {}).filter(([key]) => !['generatedPdfPath', 'signedConsentPath'].includes(key)); if (request.paymentProofFileId) answers.unshift(['paymentProof', `/admin/api/service-requests/${id}/payment-proof`]);
  const save = async () => { await post(`/admin/api/service-requests/${id}/operator-state`, { priority, operatorComment: comment }); await load(); onChanged(); };
  const assign = async () => { if (!engineerId) return; await post(`/admin/api/service-requests/${id}/assign-engineer`, { assignedEngineerId: Number(engineerId) }); await load(); onChanged(); };
  const uploadInvoice = async () => { if (!invoice) return; const form = new FormData(); form.append('file', invoice); await upload(`/admin/api/service-requests/${id}/invoice-file`, form); await load(); };
  const action = async (name: string) => { await post(`/admin/api/service-requests/${id}/${name}`); await load(); onChanged(); };
  const schedule = async () => { if (!address) return; await post(`/admin/api/service-requests/${id}/schedule`, { visitAddress: address, visitTime, operatorComment: comment }); await load(); onChanged(); };
  const openCard = async () => setCard(await loadCustomerCard(request));
  if (card) return <CustomerCardView card={card} onClose={() => setCard(null)} onNavigate={onNavigate} />;
  return <><DetailHeader title={`Сервисная заявка #${id} · ${request.serviceTypeTitle}`} subtitle={`${request.platform} · ${statusText(request.status)} · ${fmtDate(request.createdAt)}`} onCustomer={allowed('organizations.read') ? openCard : undefined} /><div className="detail-body"><FieldGrid fields={[['Статус', statusText(request.status)], ['Приоритет', priorityText(request.priority)], ['Куратор', request.responsibleOperatorId], ['Исполнитель', request.executorName], ['Внутренний комментарий', request.operatorComment], ['Стоимость', request.calculatedPrice ? `${request.calculatedPrice} ₽` : 'Не рассчитана'], ...answers.map(([key, val]) => [answerLabels[key] || key, val] as [string, unknown])]} /><div className="messages event-list">{data.events?.map((event) => <div className="message" key={event.id}><div>{event.type === 'answered' && event.payload?.value !== undefined ? String(event.payload.value) : event.message || event.type}</div><span>{event.actor} · {fmtDate(event.createdAt)}</span></div>)}</div>{allowed('serviceRequests.update') && <div className="operator-panel"><div className="form-row"><PrioritySelect value={priority} onChange={setPriority} /><button className="primary" onClick={save}><Check size={16} />Сохранить</button></div><textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Внутренний комментарий или поручение" />{allowed('serviceRequests.assign') && <div className="form-row"><select value={engineerId} onChange={(e) => setEngineerId(e.target.value)}><option value="">Выберите инженера</option>{engineers.map((engineer) => <option value={engineer.id} key={engineer.id}>{engineer.displayName}</option>)}</select><button onClick={assign}>Назначить</button></div>}{allowed('serviceRequests.invoice') && <div className="form-row"><input type="file" accept="application/pdf" onChange={(e) => setInvoice(e.target.files?.[0])} /><button onClick={uploadInvoice}>Загрузить PDF</button>{request.invoiceFileId && <a className="button" href={`/admin/api/service-requests/${id}/invoice`} target="_blank">Скачать счёт</a>}{Boolean(request.answers?.signedConsentPath) && <a className="button" href={`/admin/api/service-requests/${id}/signed-consent`} target="_blank">Согласие</a>}</div>}{allowed('serviceRequests.schedule') && <div className="form-row"><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Адрес визита" /><input type="datetime-local" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} /><button onClick={schedule}>Назначить визит</button></div>}<div className="actions">{allowed('serviceRequests.payment') && <button onClick={() => action('payment-received')}>Оплата получена</button>}{allowed('serviceRequests.close') && <><button onClick={() => action('complete')}>Завершить</button><button className="danger" onClick={() => action('cancel')}>Отменить</button></>}</div></div>}</div></>;
}

// prettier-ignore
function CustomerCardView({ card, onClose, onNavigate }: { card: CustomerCard; onClose: () => void; onNavigate: Navigate }) {
  const user = card.user; const history = [...(card.registrations || []).map((item) => ({ tab: 'registrations' as Tab, id: item.id, date: item.createdAt, title: `Анкета #${item.id} · ${item.orgName || item.innKpp || 'Без названия'}`, meta: registrationStatus(item) })), ...(card.serviceRequests || []).map((item) => ({ tab: 'service' as Tab, id: item.id, date: item.createdAt, title: `Сервис #${item.id} · ${item.serviceTypeTitle || item.serviceTypeCode}`, meta: statusText(item.status) })), ...(card.tickets || []).map((item) => ({ tab: 'tickets' as Tab, id: item.id, date: item.createdAt, title: `Вопрос #${item.id} · ${item.text || 'Без текста'}`, meta: item.isAnswered ? 'Закрыт' : 'Открыт' }))].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const organization = card.organization; const registers = card.assets?.cashRegisters || []; const drives = card.assets?.fiscalDrives || []; const subscriptions = card.assets?.ofdSubscriptions || [];
  return <><div className="detail-header"><div><h2>Карточка клиента</h2><span>{user?.platform} · {user?.chatId}</span></div><button onClick={onClose}><X size={16} />Закрыть</button></div><div className="customer-card"><div className="customer-context"><section className="context-panel"><h3>Клиент</h3><Info label="Платформа" value={user?.platform} /><Info label="Chat ID" value={user?.chatId} /><Info label="User ID" value={user?.id} /><Info label="Имя" value={user?.name || user?.username} /></section>{organization?.id && <section className="context-panel"><h3>Организация</h3><Info label="Название" value={organization.name} /><Info label="ИНН / КПП" value={[organization.inn, organization.kpp].filter(Boolean).join(' / ')} />{card.contacts?.map((contact) => <Info key={contact.id} label={`${contact.kind === 'phone' ? 'Телефон' : 'Email'} · ${providerName(contact.source)}`} value={contact.normalizedValue || contact.rawValue} />)}</section>}{(registers.length || drives.length || subscriptions.length) > 0 && <section className="context-panel"><h3>Кассы и подписки</h3>{registers.map((item) => <Info key={`kkt-${item.id}`} label={item.model || 'Касса'} value={[item.serialNumber, item.registrationNumber].filter(Boolean).join(' · ')} />)}{drives.map((item) => <Info key={`fn-${item.id}`} label={`ФН ${item.serialNumber}`} value={item.validUntil ? `до ${fmtDate(item.validUntil)}` : 'Срок не указан'} />)}{subscriptions.map((item) => <Info key={`ofd-${item.id}`} label={item.provider} value={item.validUntil ? `до ${fmtDate(item.validUntil)}` : item.status} />)}</section>}</div><section className="history"><h3>История обращений</h3>{history.length ? history.map((item) => <button key={`${item.tab}-${item.id}`} onClick={() => onNavigate(item.tab, item.id)}><strong>{item.title}</strong><span>{item.meta} · {fmtDate(item.date)}</span></button>) : <Empty text="Обращений пока нет" />}</section></div></>;
}

const opportunityStatuses: Array<{ value: OpportunityStatus | 'all'; label: string }> = [
  { value: 'new', label: 'Новые' }, { value: 'in_progress', label: 'В работе' },
  { value: 'contact_later', label: 'Связаться позже' }, { value: 'converted', label: 'Создана заявка' },
  { value: 'resolved', label: 'Решённые' }, { value: 'not_relevant', label: 'Неактуальные' }, { value: 'all', label: 'Все' },
];
function opportunityStatus(value: OpportunityStatus) { return opportunityStatuses.find((item) => item.value === value)?.label ?? value; }
function providerName(value: string) { return value === 'atol_connect' ? 'АТОЛ Connect' : value === 'platforma_ofd' ? 'Платформа ОФД' : value; }

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

function Organizations({ refreshKey }: { refreshKey: number }) { const data = useList<any>('/admin/api/organizations', refreshKey); return <section className="simple-grid">{data.loading ? <Empty text="Загрузка..." /> : data.items.map((org) => <article className="simple-card" key={org.id}><h3>{org.name || `Организация #${org.id}`}</h3><Info label="ИНН / КПП" value={[org.inn, org.kpp].filter(Boolean).join(' / ')} /><Info label="ОГРН" value={org.ogrn} /><Info label="СНО" value={org.taxSystem} /><Info label="Представители" value={org.members?.length} /></article>)}</section>; }

function AuditLog({ refreshKey }: { refreshKey: number }) {
  const [result, setResult] = useState('');
  const [action, setAction] = useState('');
  const [data, setData] = useState<{ items: any[]; total: number }>({ items: [], total: 0 });
  useEffect(() => {
    const query = new URLSearchParams({ limit: '100' });
    if (result) query.set('result', result);
    if (action.trim()) query.set('action', action.trim());
    api<{ items: any[]; total: number }>(`/admin/api/audit-events?${query}`)
      .then(setData)
      .catch(() => setData({ items: [], total: 0 }));
  }, [refreshKey, result, action]);
  return <section>
    <div className="filters">
      <select value={result} onChange={(event) => setResult(event.target.value)}>
        <option value="">Все результаты</option>
        <option value="success">Успешно</option>
        <option value="denied">Отказано</option>
        <option value="failure">Ошибка</option>
      </select>
      <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Точное название действия" />
    </div>
    <div className="simple-grid">
      {data.items.map((event) => <article className="simple-card" key={event.id}>
        <h3>{event.action}</h3>
        <Info label="Время" value={fmtDate(event.createdAt)} />
        <Info label="Инициатор" value={`${event.actorType}${event.actorStaffId ? ` #${event.actorStaffId}` : ''}`} />
        <Info label="Объект" value={`${event.targetType}${event.targetId ? ` #${event.targetId}` : ''}`} />
        <Info label="Результат" value={event.result} />
        {event.reason && <Info label="Причина" value={event.reason} />}
        {event.metadata && <pre>{JSON.stringify(event.metadata, null, 2)}</pre>}
      </article>)}
    </div>
    {!data.items.length && <Empty text="События аудита не найдены" />}
  </section>;
}

function EquipmentKits({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const data = useList<EquipmentKit>('/admin/api/equipment-kits', refreshKey); const [form, setForm] = useState<Record<string, string>>({});
  const create = async (event: React.FormEvent) => { event.preventDefault(); await post('/admin/api/equipment-kits', form); setForm({}); onChanged(); };
  const input = (key: string, placeholder: string) => <input placeholder={placeholder} value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />;
  return <><form className="kit-form" onSubmit={create}>{input('cashRegisterModel', 'Модель ККТ')}{input('cashRegisterSerial', 'Заводской номер ККТ')}{input('fiscalDriveSerial', 'Номер ФН')}{input('ofdActivationCode', 'Код активации ОФД')}{input('marketplaceOrderId', 'Номер заказа')}<button className="primary">Добавить комплект</button></form><section className="simple-grid">{data.items.map((kit) => <article className="simple-card" key={kit.id}><h3>Комплект #{kit.id}</h3><Badge>{kit.status || 'Новый'}</Badge><Info label="ККТ" value={`${kit.cashRegisterModel || ''} ${kit.cashRegisterSerial || ''}`.trim()} /><Info label="ФН" value={kit.fiscalDriveSerial} /><Info label="ОФД" value={kit.ofdActivationCode} /><Info label="Заказ" value={kit.marketplaceOrderId} /></article>)}</section></>;
}

const roleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'operator', label: 'Оператор' },
  { value: 'engineer', label: 'Инженер' },
  { value: 'sales_manager', label: 'Менеджер продаж' },
  { value: 'superadmin', label: 'Superadmin' },
];

function StaffManagement({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const data = useList<Staff>('/admin/api/staff', refreshKey);
  const [form, setForm] = useState({ login: '', displayName: '', password: '', roles: ['operator'] as AdminRole[] });
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await post('/admin/api/staff', form);
      setForm({ login: '', displayName: '', password: '', roles: ['operator'] });
      onChanged();
    } catch (error) {
      let message = 'Не удалось создать сотрудника. Проверьте данные и повторите попытку.';
      if (error instanceof ApiError && error.status === 409) {
        message = 'Сотрудник с таким логином уже существует.';
      } else if (error instanceof ApiError && error.status === 400) {
        message = 'Пароль должен содержать 12-128 символов, не включать логин и использовать минимум три группы: строчные, заглавные, цифры или специальные символы.';
      }
      window.dispatchEvent(new CustomEvent('vitma:notice', { detail: message }));
    }
  };
  const toggle = (role: AdminRole) => setForm((current) => ({ ...current, roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role] }));
  return <><form className="staff-form" onSubmit={create}><div className="form-row"><input required minLength={3} placeholder="Логин" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} /><input required placeholder="Имя сотрудника" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /><input required minLength={12} type="password" autoComplete="new-password" placeholder="Пароль" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button className="primary" disabled={!form.roles.length}><UserPlus size={16} />Создать</button></div><div className="role-picker">{roleOptions.map((role) => <label key={role.value}><input type="checkbox" checked={form.roles.includes(role.value)} onChange={() => toggle(role.value)} />{role.label}</label>)}</div></form><section className="simple-grid">{data.loading ? <Empty text="Загрузка..." /> : data.error ? <Empty text={data.error} /> : data.items.map((staff) => <StaffCard key={staff.id} staff={staff} onChanged={onChanged} />)}</section></>;
}

function StaffCard({ staff, onChanged }: { staff: Staff; onChanged: () => void }) {
  const [password, setPassword] = useState('');
  const changeRole = async (role: AdminRole) => {
    const roles = staff.roles.includes(role) ? staff.roles.filter((item) => item !== role) : [...staff.roles, role];
    if (!roles.length) return;
    await post(`/admin/api/staff/${staff.id}/roles`, { roles });
    onChanged();
  };
  const toggleActive = async () => { await post(`/admin/api/staff/${staff.id}/active`, { isActive: !staff.isActive }); onChanged(); };
  const resetPassword = async () => { if (password.length < 12) return; await post(`/admin/api/staff/${staff.id}/password`, { password }); setPassword(''); onChanged(); };
  const revoke = async () => { await post(`/admin/api/staff/${staff.id}/sessions/revoke`); onChanged(); };
  return <article className="simple-card staff-card"><div className="row-top"><h3>{staff.displayName}</h3><Badge>{staff.isActive ? 'Активен' : 'Отключён'}</Badge></div><Info label="Логин" value={staff.login} /><Info label="Создан" value={fmtDate(staff.createdAt)} /><Info label="Последний вход" value={staff.lastLoginAt ? fmtDate(staff.lastLoginAt) : 'Ещё не входил'} /><div className="role-picker">{roleOptions.map((role) => <label key={role.value}><input type="checkbox" checked={staff.roles.includes(role.value)} onChange={() => changeRole(role.value)} />{role.label}</label>)}</div><div className="form-row"><input type="password" autoComplete="new-password" placeholder="Новый пароль" value={password} onChange={(e) => setPassword(e.target.value)} /><button disabled={password.length < 12} onClick={resetPassword}><KeyRound size={16} />Сбросить</button></div><div className="actions"><button onClick={revoke}><ShieldCheck size={16} />Отозвать сессии</button><button className={staff.isActive ? 'danger' : ''} onClick={toggleActive}>{staff.isActive ? 'Отключить' : 'Активировать'}</button></div></article>;
}

type Navigate = (tab: Tab, id?: number) => void;
interface ListProps { status: string; platform: string; priority?: string; refreshKey: number; requestedId?: number; onNavigate: Navigate; onChanged: () => void; permissions?: string[] }
function DetailHeader({ title, subtitle, onCustomer, right }: { title: string; subtitle: string; onCustomer?: () => void; right?: React.ReactNode }) { return <div className="detail-header"><div><h2>{title}</h2><span>{subtitle}</span></div><div className="actions">{onCustomer && <button onClick={onCustomer}><UserRound size={16} />Карточка клиента</button>}{right}</div></div>; }
function FieldGrid({ fields }: { fields: Array<[string, unknown]> }) { return <div className="field-grid">{fields.map(([label, val]) => <Info key={label} label={label} value={val} />)}</div>; }
// prettier-ignore
function Info({ label, value: input }: { label: string; value: unknown }) { const fileUrl = typeof input === 'string' && input.startsWith('/admin/api/') ? input : null; return <div className="info"><span>{label}</span><strong>{fileUrl ? <a className="button" href={fileUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Открыть файл</a> : value(input)}</strong></div>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function Badge({ children, priority }: { children: React.ReactNode; priority?: Priority }) { return <span className={`badge ${priority ? `priority-${priority}` : ''}`}>{children}</span>; }
function PrioritySelect({ value, onChange }: { value: Priority; onChange: (value: Priority) => void }) { return <select value={value} onChange={(e) => onChange(e.target.value as Priority)}>{priorities.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>; }
function Message({ message }: { message: TicketMessage }) { const url = message.localPath ? `/admin/api/ticket-messages/${message.id}/file` : message.externalUrl; return <div className={`message ${message.sender === 'operator' ? 'operator' : 'client'}`}>{message.messageType === 'image' && url ? <a href={url} target="_blank"><img src={url} alt={message.fileName || 'Изображение'} /></a> : message.messageType && message.messageType !== 'text' && url ? <a href={url} target="_blank">{message.fileName || message.text || 'Открыть файл'}</a> : <div>{message.text}</div>}<span>{message.sender === 'operator' ? 'Оператор' : 'Клиент'} · {fmtDate(message.createdAt)}</span></div>; }
async function loadCustomerCard(item: { userId?: number; organizationId?: number; platform?: string; chatId?: string }) { const params = new URLSearchParams(); if (item.userId) params.set('userId', String(item.userId)); if (item.organizationId) params.set('organizationId', String(item.organizationId)); if (item.platform) params.set('platform', item.platform); if (item.chatId) params.set('chatId', item.chatId); return api<CustomerCard>(`/admin/api/customer-card?${params}`); }
function standardApiStatus(status: string) { return status === 'closed' ? 'processed' : status === 'all' ? 'all' : 'new'; }
function registrationApiStatus(status: string) { return status === 'closed' ? 'processed' : status === 'in_work' ? 'in_work' : status === 'all' ? 'all' : 'new'; }
function serviceApiStatuses(status: string) { if (status === 'all') return ['all']; if (status === 'closed') return ['completed', 'cancelled']; if (status === 'waiting_payment') return ['waiting_payment']; if (status === 'in_work') return ['draft', 'price_confirmed', 'review_required', 'invoice_required', 'paid', 'scheduled']; return ['active']; }
function can(admin: Admin, permission: string) { return admin.permissions.includes(permission); }
