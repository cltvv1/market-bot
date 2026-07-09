export const adminPageHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Админка бота</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --line:#d9dde5; --text:#172033; --muted:#667085; --brand:#0f766e; --danger:#b42318; }
    * { box-sizing: border-box; min-width:0; }
    html, body { max-width:100%; overflow-x:hidden; }
    body { margin:0; font-family:Arial, sans-serif; background:var(--bg); color:var(--text); overflow-wrap:anywhere; }
    header { display:flex; gap:16px; align-items:center; justify-content:space-between; padding:16px 24px; background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:2; max-width:100%; }
    h1 { font-size:20px; margin:0; }
    main { padding:20px 24px 36px; width:min(1320px, 100%); margin:0 auto; overflow:hidden; }
    button, input, select, textarea { font:inherit; }
    button { border:1px solid var(--line); background:#fff; border-radius:6px; padding:8px 10px; cursor:pointer; white-space:normal; }
    button.primary { background:var(--brand); border-color:var(--brand); color:#fff; }
    button.danger { color:var(--danger); }
    input, select, textarea { border:1px solid var(--line); border-radius:6px; padding:8px 10px; background:#fff; max-width:100%; }
    textarea { width:100%; min-height:76px; resize:vertical; }
    .toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; max-width:100%; }
    .login-panel { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .user-panel { display:none; gap:8px; align-items:center; flex-wrap:wrap; }
    .notify-panel { display:none; gap:8px; align-items:center; flex-wrap:wrap; font-size:13px; }
    .notify-panel label { display:flex; gap:4px; align-items:center; color:var(--muted); }
    .notify-panel input { padding:0; }
    .token { width:260px; }
    .stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-bottom:18px; }
    .stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
    .stat strong { display:block; font-size:28px; margin-top:4px; }
    .tabs { display:flex; gap:8px; margin:0 0 14px; flex-wrap:wrap; }
    .tabs button.active { background:#172033; color:#fff; border-color:#172033; }
    .filters { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
    .grid { display:grid; gap:12px; min-width:0; }
    .item { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; min-width:0; max-width:100%; overflow:hidden; }
    .item-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:10px; }
    .item-head > * { min-width:0; }
    .title { font-weight:700; overflow-wrap:anywhere; }
    .meta { color:var(--muted); font-size:13px; margin-top:4px; overflow-wrap:anywhere; }
    .fields { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px 18px; }
    .fields.single-column { grid-template-columns:1fr; }
    .field span { display:block; color:var(--muted); font-size:12px; }
    .field, .field b { min-width:0; max-width:100%; overflow-wrap:anywhere; word-break:break-word; }
    .field b { display:block; font-weight:400; }
    .actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; }
    .chat { border-top:1px solid var(--line); margin-top:14px; padding-top:14px; }
    .messages { display:grid; gap:8px; max-height:340px; overflow:auto; overflow-x:hidden; padding:8px; background:#f8fafc; border:1px solid var(--line); border-radius:8px; max-width:100%; }
    .message { max-width:min(78%, 100%); min-width:0; padding:8px 10px; border-radius:8px; background:#fff; border:1px solid var(--line); overflow-wrap:anywhere; word-break:break-word; }
    .message.operator { justify-self:end; background:#e7f5f1; border-color:#b7ded4; }
    .message .meta { font-size:11px; margin-top:4px; }
    .message img, .message video, .message audio { max-width:100%; }
    .composer { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:8px; align-items:start; margin-top:10px; max-width:100%; }
    .composer > * { min-width:0; max-width:100%; }
    .ticket-shell { display:flex; min-height:560px; height:calc(100vh - 260px); background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .ticket-sidebar { width:var(--ticket-sidebar-width, 330px); min-width:220px; max-width:min(560px, 58vw); flex:0 0 auto; overflow:auto; border-right:1px solid var(--line); background:#fbfcfe; }
    .ticket-sidebar-head { position:sticky; top:0; z-index:1; padding:12px; font-weight:700; background:#fbfcfe; border-bottom:1px solid var(--line); }
    .ticket-row { display:grid; grid-template-columns:1fr auto; gap:6px 8px; width:100%; padding:12px; border:0; border-bottom:1px solid var(--line); background:transparent; text-align:left; border-radius:0; }
    .ticket-row:hover { background:#f1f5f9; }
    .ticket-row.active { background:#e7f5f1; }
    .ticket-row-title { font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ticket-row-preview { grid-column:1 / -1; color:var(--muted); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ticket-row-badges { grid-column:1 / -1; display:flex; gap:6px; flex-wrap:wrap; margin-top:2px; }
    .ticket-resizer { width:7px; flex:0 0 7px; cursor:col-resize; background:linear-gradient(90deg, transparent, #d8dee8, transparent); }
    .ticket-resizer:hover { background:#cbd5e1; }
    .ticket-main { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; background:#fff; }
    .ticket-main-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding:14px 16px; border-bottom:1px solid var(--line); }
    .ticket-main-title { font-weight:700; overflow-wrap:anywhere; }
    .ticket-main-subtitle { color:var(--muted); font-size:13px; margin-top:4px; overflow-wrap:anywhere; }
    .ticket-main-body { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; padding:12px; overflow:auto; }
    .detail-layout { flex:1 1 auto; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:12px; }
    .detail-primary { min-width:0; min-height:0; display:flex; flex-direction:column; }
    .registration-detail { display:block; padding-bottom:16px; }
    .registration-detail .chat { display:block; flex:0 0 auto; min-height:auto; }
    .context-card { min-width:0; overflow:auto; border-left:1px solid var(--line); padding-left:12px; }
    .context-block { border:1px solid var(--line); border-radius:8px; padding:10px; margin-bottom:10px; background:#fbfcfe; }
    .context-block h3 { margin:0 0 8px; font-size:15px; }
    .context-line { display:grid; gap:2px; margin-top:8px; overflow-wrap:anywhere; }
    .context-line span { color:var(--muted); font-size:12px; }
    .media-preview { margin-top:12px; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:#fbfcfe; }
    .media-preview-head { display:flex; justify-content:space-between; gap:8px; align-items:center; padding:10px 12px; border-bottom:1px solid var(--line); font-weight:700; }
    .media-preview-body { display:none; padding:10px; }
    .media-preview.open .media-preview-body { display:block; }
    .media-preview img { display:block; width:100%; max-height:none; object-fit:contain; border-radius:6px; background:#f8fafc; }
    .customer-card-screen { display:grid; gap:12px; }
    .ticket-customer-card { display:grid; gap:12px; }
    .customer-card-grid { display:grid; grid-template-columns:280px minmax(0,1fr); gap:12px; align-items:start; }
    .customer-card-list { display:grid; gap:6px; margin-top:8px; }
    .customer-card-list button.context-line { width:100%; border:1px solid var(--line); border-radius:6px; padding:8px; background:#fff; text-align:left; }
    .customer-card-list button.context-line:hover { background:#f1f5f9; }
    .status-pill { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; background:#fff; color:var(--muted); }
    .status-pill.hot { color:#92400e; background:#fffbeb; border-color:#fde68a; }
    .status-pill.done { color:#166534; background:#f0fdf4; border-color:#bbf7d0; }
    .status-pill.bad { color:#991b1b; background:#fef2f2; border-color:#fecaca; }
    .ticket-main-body .chat { flex:1 1 auto; min-height:0; margin-top:0; padding-top:0; border-top:0; display:flex; flex-direction:column; }
    .ticket-main-body .messages { flex:1 1 auto; max-height:none; align-content:start; }
    .ticket-main-body .message { max-width:min(680px, 82%); }
    .empty { color:var(--muted); padding:26px; text-align:center; background:var(--panel); border:1px dashed var(--line); border-radius:8px; }
    .error { color:var(--danger); margin-left:8px; }
    @media (max-width:900px) { header { align-items:flex-start; flex-direction:column; } .stats, .fields, .composer, .detail-layout, .customer-card-grid { grid-template-columns:1fr; } .context-card { border-left:0; border-top:1px solid var(--line); padding-left:0; padding-top:12px; } .token { width:100%; } .message { max-width:100%; } .ticket-shell { height:auto; min-height:0; flex-direction:column; } .ticket-sidebar { width:100%; max-width:100%; max-height:320px; border-right:0; border-bottom:1px solid var(--line); } .ticket-resizer { display:none; } .ticket-main { min-height:520px; } .ticket-main-body .message { max-width:100%; } }
  </style>
</head>
<body>
  <header>
    <h1>Админка бота</h1>
    <div class="toolbar">
      <form id="loginForm" class="login-panel">
        <input id="login" autocomplete="username" placeholder="Логин" />
        <input id="password" type="password" autocomplete="current-password" placeholder="Пароль" />
        <button class="primary" type="submit">Войти</button>
      </form>
      <div id="userPanel" class="user-panel">
        <span id="adminName" class="meta"></span>
        <button id="bindTelegram" type="button">Код Telegram</button>
        <button id="bindMax" type="button">Код MAX</button>
        <button id="logout" type="button">Выйти</button>
      </div>
      <div id="notifyPanel" class="notify-panel">
        <label><input id="notifyRegistrations" type="checkbox">Регистрации</label>
        <label><input id="notifyTickets" type="checkbox">Вопросы</label>
        <label><input id="notifyServiceRequests" type="checkbox">Сервис</label>
      </div>
      <button id="refresh" class="primary">Обновить</button>
      <span id="error" class="error"></span>
    </div>
  </header>
  <main>
    <section class="stats">
      <div class="stat">Новые регистрации<strong id="regCount">0</strong></div>
      <div class="stat">Сценарные заявки<strong id="serviceRequestCount">0</strong></div>
      <div class="stat">Открытые вопросы<strong id="ticketCount">0</strong></div>
    </section>
    <nav class="tabs">
      <button data-tab="registrations" class="active">Регистрации</button>
      <button data-tab="service">Заявки по сервису</button>
      <button data-tab="tickets">Вопросы</button>
      <button data-tab="organizations">Организации</button>
      <button data-tab="equipment-kits">Комплекты</button>
    </nav>
    <section class="filters">
      <select id="status">
        <option value="new">Новые</option>
        <option value="in_work">В работе</option>
        <option value="waiting_payment">Ожидают оплаты</option>
        <option value="closed">Закрытые</option>
        <option value="all">Все</option>
      </select>
      <select id="platform">
        <option value="">Все платформы</option>
        <option value="web">Web</option>
        <option value="max">MAX</option>
        <option value="telegram">Telegram</option>
      </select>
      <select id="servicePriority">
        <option value="">Любой приоритет</option>
        <option value="urgent">Срочные</option>
        <option value="high">Высокие</option>
        <option value="normal">Обычные</option>
        <option value="low">Низкие</option>
      </select>
      <input id="serviceResponsible" placeholder="Куратор или исполнитель" />
    </section>
    <section id="list" class="grid"></section>
  </main>
  <script>
    const state = { tab: 'registrations', openRegistrationId: null, openTicketId: null, openServiceRequestId: null, openServiceWorkKey: null, serviceWorkItems: [], registrationItems: [], customerRegistrationId: null, focusTicketQuestionId: null, admin: null };
    const loginForm = document.querySelector('#loginForm');
    const userPanel = document.querySelector('#userPanel');
    const notifyPanel = document.querySelector('#notifyPanel');
    const adminName = document.querySelector('#adminName');
    const notifyRegistrations = document.querySelector('#notifyRegistrations');
    const notifyTickets = document.querySelector('#notifyTickets');
    const notifyServiceRequests = document.querySelector('#notifyServiceRequests');
    const statusFilter = document.querySelector('#status');
    const platformFilter = document.querySelector('#platform');
    const priorityFilter = document.querySelector('#servicePriority');
    const responsibleFilter = document.querySelector('#serviceResponsible');
    let bindNotice = '';
    const errorEl = document.querySelector('#error');

    loginForm.onsubmit = async (event) => {
      event.preventDefault();
      errorEl.textContent = '';
      try {
        await api('/admin/api/login', {
          method: 'POST',
          body: JSON.stringify({ login: login.value.trim(), password: password.value }),
        }, true);
        password.value = '';
        await checkSession();
        await load();
      } catch (error) {
        errorEl.textContent = 'Неверный логин или пароль';
      }
    };
    document.querySelector('#logout').onclick = async () => {
      await api('/admin/api/logout', { method: 'POST', body: '{}' }, true);
      state.admin = null;
      bindNotice = '';
      renderAuth();
      list.innerHTML = '';
    };
    document.querySelector('#bindTelegram').onclick = () => createBindCode('telegram');
    document.querySelector('#bindMax').onclick = () => createBindCode('max');
    notifyRegistrations.onchange = saveNotificationSettings;
    notifyTickets.onchange = saveNotificationSettings;
    notifyServiceRequests.onchange = saveNotificationSettings;
    document.querySelector('#refresh').onclick = () => load();
    statusFilter.onchange = () => load();
    platformFilter.onchange = () => load();
    priorityFilter.onchange = () => load();
    responsibleFilter.oninput = () => load();
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.onclick = () => {
        state.tab = button.dataset.tab;
        state.openRegistrationId = null;
        state.openTicketId = null;
        state.openServiceRequestId = null;
        state.openServiceWorkKey = null;
        state.customerRegistrationId = null;
        state.focusTicketQuestionId = null;
        state.serviceWorkItems = [];
        document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
        load();
      };
    });

    async function api(path, options = {}, allowUnauthorized = false) {
      const response = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      });
      if (response.status === 401 && !allowUnauthorized) {
        state.admin = null;
        renderAuth();
      }
      if (!response.ok) throw new Error(await response.text() || response.statusText);
      return response.json();
    }
    async function checkSession() {
      try {
        const data = await api('/admin/api/me', {}, true);
        state.admin = data.admin;
        if (state.admin) await loadNotificationBindings();
      } catch (error) {
        state.admin = null;
      }
      renderAuth();
    }
    function renderAuth() {
      loginForm.style.display = state.admin ? 'none' : 'flex';
      userPanel.style.display = state.admin ? 'flex' : 'none';
      notifyPanel.style.display = state.admin ? 'flex' : 'none';
      refresh.style.display = state.admin ? '' : 'none';
      adminName.textContent = state.admin ? (state.admin.displayName + ' · ' + state.admin.role + (bindNotice ? ' · ' + bindNotice : '')) : '';
    }
    async function loadNotificationBindings() {
      const data = await api('/admin/api/notification-bindings');
      notifyRegistrations.checked = data.notifyRegistrations !== false;
      notifyTickets.checked = data.notifyTickets !== false;
      notifyServiceRequests.checked = data.notifyServiceRequests !== false;
    }
    async function saveNotificationSettings() {
      await api('/admin/api/notification-bindings/settings', {
        method: 'POST',
        body: JSON.stringify({
          notifyRegistrations: notifyRegistrations.checked,
          notifyTickets: notifyTickets.checked,
          notifyServiceRequests: notifyServiceRequests.checked,
        }),
      });
    }
    async function createBindCode(platformName) {
      const data = await api('/admin/api/notification-bindings/code', {
        method: 'POST',
        body: JSON.stringify({ platform: platformName }),
      });
      bindNotice = platformName.toUpperCase() + ': отправьте боту ' + data.command;
      renderAuth();
    }
    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
    }
    function fmtDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : ''; }
    function field(label, value) { return '<div class="field"><span>' + label + '</span><b>' + esc(value || 'Не указано') + '</b></div>'; }

    async function load() {
      if (!state.admin) {
        list.innerHTML = '<div class="empty">Войдите в админку</div>';
        return;
      }
      errorEl.textContent = '';
      try {
        const summary = await api('/admin/api/summary');
        regCount.textContent = summary.newRegistrations;
        serviceRequestCount.textContent = summary.activeServiceRequests || 0;
        ticketCount.textContent = summary.openTickets;
        const params = new URLSearchParams({ status: adminStatusForCurrentTab() });
        if (platformFilter.value) params.set('platform', platformFilter.value);
        if (state.tab === 'registrations' && priorityFilter.value) params.set('priority', priorityFilter.value);
        const items = state.tab === 'service'
          ? await loadServiceWorkItems(params)
          : await api('/admin/api/' + state.tab + '?' + params.toString());
        render(items);
        if (state.openTicketId) openTicketChat(state.openTicketId);
        if (state.openServiceWorkKey) openServiceWork(state.openServiceWorkKey);
      } catch (error) {
        errorEl.textContent = 'Ошибка доступа или загрузки';
        console.error(error);
      }
    }

    async function loadServiceWorkItems(params) {
      const serviceStatuses = serviceStatusesForFilter();
      const serviceRequests = await Promise.all(serviceStatuses.map((serviceStatus) => {
          const serviceParams = new URLSearchParams(params);
          serviceParams.set('status', serviceStatus);
          return api('/admin/api/service-requests?' + serviceParams.toString());
        })).then((groups) => groups.flat());
      const selectedPriority = priorityFilter.value;
      const responsibleText = responsibleFilter.value.trim().toLowerCase();
      const filteredRequests = serviceRequests.filter((item) => {
        if (selectedPriority && (item.priority || 'normal') !== selectedPriority) return false;
        if (responsibleText) {
          const people = [item.responsibleOperatorId, item.executorName].filter(Boolean).join(' ').toLowerCase();
          if (!people.includes(responsibleText)) return false;
        }
        return true;
      });
      state.serviceWorkItems = [
        ...filteredRequests.map((item) => ({ kind:'service-request', key:'service-request:' + item.id, createdAt:item.createdAt, title:'Сценарная заявка #' + item.id + ' · ' + item.serviceTypeTitle, preview:serviceWorkPreview(item), item })),
      ].sort(compareServiceWorkItems);
      return state.serviceWorkItems;
    }

    function serviceWorkPreview(item) {
      const parts = [statusText(item.status), servicePriorityText(item.priority)];
      if (item.responsibleOperatorId) parts.push('Куратор: ' + item.responsibleOperatorId);
      if (item.executorName) parts.push('Исполнитель: ' + item.executorName);
      if (item.calculatedPrice) parts.push(item.calculatedPrice + ' ₽');
      return parts.join(' · ');
    }
    function compareServiceWorkItems(a, b) {
      const priorityDelta = servicePriorityRank(b.item.priority) - servicePriorityRank(a.item.priority);
      if (priorityDelta) return priorityDelta;
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    function servicePriorityRank(value) {
      return ({ urgent: 4, high: 3, normal: 2, low: 1 }[value || 'normal']) || 2;
    }

    function adminStatusForCurrentTab() {
      if (statusFilter.value === 'all') return 'all';
      if (statusFilter.value === 'closed') return 'processed';
      if (state.tab === 'registrations') {
        if (statusFilter.value === 'in_work') return 'in_work';
        if (statusFilter.value === 'waiting_payment') return 'all';
      }
      return 'new';
    }
    function serviceStatusesForFilter() {
      if (statusFilter.value === 'all') return ['all'];
      if (statusFilter.value === 'waiting_payment') return ['waiting_payment'];
      if (statusFilter.value === 'closed') return ['completed', 'cancelled'];
      if (statusFilter.value === 'in_work') return ['draft', 'price_confirmed', 'review_required', 'invoice_required', 'paid', 'scheduled'];
      return ['active'];
    }

    function render(items) {
      if (state.tab === 'service') {
        renderServiceWorkLayout(items);
        return;
      }
      if (state.tab === 'equipment-kits') {
        renderEquipmentKits(items);
        return;
      }
      if (state.tab === 'registrations') {
        renderRegistrationsLayout(items);
        return;
      }
      if (state.tab === 'tickets') {
        renderTicketsLayout(items);
        return;
      }
      if (!items.length) {
        list.innerHTML = '<div class="empty">Ничего не найдено</div>';
        return;
      }
      list.innerHTML = items.map((item) => {
        if (state.tab === 'organizations') return organizationCard(item);
        if (state.tab === 'equipment-kits') return equipmentKitCard(item);
        return ticketCard(item);
      }).join('');
    }
    function renderEquipmentKits(items) {
      list.innerHTML = equipmentKitForm() + (items.length ? items.map(equipmentKitCard).join('') : '<div class="empty">Комплектов нет</div>');
    }
    function renderServiceWorkLayout(items) {
      if (items.length && (!state.openServiceWorkKey || !items.some((item) => item.key === state.openServiceWorkKey))) {
        state.openServiceWorkKey = items[0].key;
      }
      const width = Number(localStorage.getItem('serviceSidebarWidth')) || 360;
      list.innerHTML =
        '<section class="ticket-shell" style="--ticket-sidebar-width:' + width + 'px">' +
          '<aside class="ticket-sidebar"><div class="ticket-sidebar-head">Заявки по сервису</div>' +
            (items.length ? items.map(serviceWorkListRow).join('') : '<div class="empty">Заявок нет</div>') +
          '</aside>' +
          '<div class="ticket-resizer" onmousedown="startSidebarResize(event, \\'serviceSidebarWidth\\')" title="Изменить ширину списка"></div>' +
          '<section id="service-detail" class="ticket-main"><div class="ticket-main-body"><div class="empty">' + (items.length ? 'Выберите заявку слева' : 'Нет заявок по выбранным фильтрам') + '</div></div></section>' +
        '</section>';
    }
    function serviceWorkListRow(entry) {
      const item = entry.item;
      return '<button class="ticket-row ' + (state.openServiceWorkKey === entry.key ? 'active' : '') + '" data-service-key="' + esc(entry.key) + '" onclick="selectServiceWork(\\'' + entry.key + '\\')">' +
        '<span class="ticket-row-title">' + esc(entry.title) + '</span>' +
        '<span class="meta">' + fmtDate(entry.createdAt) + '</span>' +
        '<span class="ticket-row-badges">' +
          '<span class="status-pill ' + serviceStatusClass(item.status) + '">' + statusText(item.status) + '</span>' +
          '<span class="status-pill ' + servicePriorityClass(item.priority) + '">' + servicePriorityText(item.priority) + '</span>' +
        '</span>' +
        '<span class="ticket-row-preview">' + esc(entry.preview) + '</span>' +
        '</button>';
    }
    function renderTicketsLayout(items) {
      if (items.length && (!state.openTicketId || !items.some((item) => item.id === state.openTicketId))) {
        state.openTicketId = items[0].id;
      }
      const width = Number(localStorage.getItem('ticketSidebarWidth')) || 330;
      list.innerHTML =
        '<section class="ticket-shell" style="--ticket-sidebar-width:' + width + 'px">' +
          '<aside class="ticket-sidebar"><div class="ticket-sidebar-head">Вопросы</div>' +
            (items.length ? items.map(ticketListRow).join('') : '<div class="empty">Вопросов нет</div>') +
          '</aside>' +
          '<div class="ticket-resizer" onmousedown="startTicketResize(event)" title="Изменить ширину списка"></div>' +
          '<section id="ticket-detail" class="ticket-main"><div class="ticket-main-body"><div class="empty">' + (state.openTicketId ? 'Загрузка вопроса...' : 'Нет вопросов по выбранным фильтрам') + '</div></div></section>' +
        '</section>';
    }
    function ticketListRow(item) {
      const title = item.name || item.username || item.userChatId || ('Вопрос #' + item.id);
      const preview = item.text || 'Без текста';
      return '<button class="ticket-row ' + (state.openTicketId === item.id ? 'active' : '') + '" onclick="selectTicket(' + item.id + ')">' +
        '<span class="ticket-row-title">' + esc(title) + '</span>' +
        '<span class="meta">' + fmtDate(item.createdAt) + '</span>' +
        '<span class="ticket-row-preview">' + esc(preview) + '</span>' +
        '</button>';
    }
    function renderRegistrationsLayout(items) {
      state.registrationItems = items;
      if (items.length && (!state.openRegistrationId || !items.some((item) => item.id === state.openRegistrationId))) {
        state.openRegistrationId = items[0].id;
      }
      const width = Number(localStorage.getItem('registrationSidebarWidth')) || 360;
      const selected = items.find((item) => item.id === state.openRegistrationId);
      list.innerHTML =
        '<section class="ticket-shell" style="--ticket-sidebar-width:' + width + 'px">' +
          '<aside class="ticket-sidebar"><div class="ticket-sidebar-head">Анкеты на регистрацию</div>' +
            (items.length ? items.map(registrationListRow).join('') : '<div class="empty">Анкет нет</div>') +
          '</aside>' +
          '<div class="ticket-resizer" onmousedown="startSidebarResize(event, \\'registrationSidebarWidth\\')" title="Изменить ширину списка"></div>' +
          '<section id="registration-detail" class="ticket-main">' +
            (selected ? renderRegistrationDetail(selected) : '<div class="ticket-main-body"><div class="empty">Нет анкет по выбранным фильтрам</div></div>') +
          '</section>' +
        '</section>';
      if (selected) loadFreeEquipmentKitOptions(selected.id, selected.equipmentKitId);
    }
    function registrationListRow(item) {
      const title = item.orgName || item.innKpp || item.phoneToCall || item.phone || ('Анкета #' + item.id);
      const preview = [registrationStatusText(item.status, item.isProcessed), registrationPriorityText(item.priority), item.platform].filter(Boolean).join(' · ');
      return '<button class="ticket-row ' + (state.openRegistrationId === item.id ? 'active' : '') + '" onclick="selectRegistration(' + item.id + ')">' +
        '<span class="ticket-row-title">Анкета #' + item.id + ' · ' + esc(title) + '</span>' +
        '<span class="meta">' + fmtDate(item.createdAt) + '</span>' +
        '<span class="ticket-row-badges">' +
          '<span class="status-pill ' + registrationStatusClass(item.status, item.isProcessed) + '">' + registrationStatusText(item.status, item.isProcessed) + '</span>' +
          '<span class="status-pill ' + servicePriorityClass(item.priority) + '">' + registrationPriorityText(item.priority) + '</span>' +
        '</span>' +
        '<span class="ticket-row-preview">' + esc(preview) + '</span>' +
        '</button>';
    }
    function renderRegistrationDetail(item) {
      return '<div class="ticket-main-head"><div><div class="ticket-main-title">Анкета #' + item.id + ' · ' + esc(item.orgName || 'Без названия') + '</div>' +
        '<div class="ticket-main-subtitle">' + esc(item.platform) + ' · ' + registrationStatusText(item.status, item.isProcessed) + ' · ' + fmtDate(item.createdAt) + '</div></div>' +
        '<button onclick="openRegistrationCustomerCard(' + item.id + ')">Карточка клиента</button></div>' +
        '<div class="ticket-main-body"><div class="registration-detail">' +
          '<div class="fields single-column">' +
            field('Статус', registrationStatusText(item.status, item.isProcessed)) +
            field('Приоритет', registrationPriorityText(item.priority)) +
            field('Организация', item.orgName) +
            field('ИНН/КПП', item.innKpp) +
            field('ОГРН', item.ogrn) +
            field('Юр. адрес', item.urAdress) +
            field('Адрес ККТ', item.kktAdress) +
            field('Модель ККТ', item.kktModel || item.kktName) +
            field('Телефон', item.phoneToCall || item.phone) +
            field('Email', item.email) +
            field('НДС', item.nds) +
            field('Акциз', item.excise) +
            field('Маркировка', item.markirovka) +
            field('Услуги', item.services) +
            field('БСО', item.strictReporting) +
            field('СНО', item.taxSystem) +
            field('Банк. реквизиты', item.bankReqs) +
            field('ОФД', item.ofd) +
            field('Фото комплекта', item.equipmentPhotoPath ? 'Есть' : '') +
            field('Комплект', item.equipmentKitId ? '#' + item.equipmentKitId : '') +
          '</div>' +
          renderRegistrationEquipmentPhoto(item) +
          '<div class="chat"><div class="composer">' +
            '<select id="reg-status-' + item.id + '">' + renderRegistrationStatusOptions(item.status, item.isProcessed) + '</select>' +
            '<select id="reg-priority-' + item.id + '">' + renderPriorityOptions(item.priority) + '</select>' +
            '<button class="primary" onclick="saveRegistrationOperatorState(' + item.id + ')">Сохранить</button>' +
          '</div><div class="composer">' +
            '<select id="reg-kit-' + item.id + '"' + (item.equipmentKitId ? ' disabled' : '') + '><option value="">' + (item.equipmentKitId ? 'Комплект уже привязан' : 'Загрузка свободных комплектов...') + '</option></select>' +
            '<button onclick="linkEquipmentKit(' + item.id + ')">Привязать комплект</button>' +
            (item.pdfPath ? '<button onclick="downloadPdf(' + item.id + ')">PDF</button>' : '') +
          '</div></div>' +
        '</div></div>';
    }
    function renderRegistrationEquipmentPhoto(item) {
      if (!item.equipmentPhotoPath) return '';
      const url = '/admin/api/registrations/' + item.id + '/equipment-photo';
      const label = esc(item.equipmentPhotoName || 'Фото комплекта');
      return '<div id="equipment-photo-' + item.id + '" class="media-preview">' +
        '<div class="media-preview-head"><span>Фото комплекта</span><button onclick="toggleEquipmentPhoto(' + item.id + ')">Показать</button></div>' +
        '<div class="media-preview-body"><img src="' + url + '" alt="' + label + '"><div class="meta">' + label + '</div></div>' +
        '</div>';
    }
    function toggleEquipmentPhoto(id) {
      const holder = document.querySelector('#equipment-photo-' + id);
      if (!holder) return;
      holder.classList.toggle('open');
      const button = holder.querySelector('button');
      if (button) button.textContent = holder.classList.contains('open') ? 'Скрыть' : 'Показать';
    }
    async function openRegistrationCustomerCard(id) {
      const holder = document.querySelector('#registration-detail');
      if (!holder) return;
      state.customerRegistrationId = id;
      holder.innerHTML = '<div class="ticket-main-body"><div class="empty">Загрузка карточки клиента...</div></div>';
      const item = state.registrationItems.find((registration) => registration.id === id);
      if (!item) return;
      const params = new URLSearchParams();
      if (item.userId) params.set('userId', item.userId);
      if (item.organizationId) params.set('organizationId', item.organizationId);
      if (item.platform) params.set('platform', item.platform);
      if (item.chatId) params.set('chatId', item.chatId);
      const data = await api('/admin/api/customer-card?' + params.toString());
      holder.innerHTML = renderCustomerCardScreen(data, id);
    }
    function renderCustomerCardScreen(data, sourceRegistrationId) {
      const user = data.user || {};
      const registrations = data.registrations || [];
      const serviceRequests = data.serviceRequests || [];
      const tickets = data.tickets || [];
      return '<div class="ticket-main-head"><div><div class="ticket-main-title">Карточка клиента</div><div class="ticket-main-subtitle">' + esc(user.platform || '') + ' · ' + esc(user.chatId || '') + '</div></div>' +
        '<button onclick="closeRegistrationCustomerCard(' + sourceRegistrationId + ')">Закрыть</button></div>' +
        '<div class="ticket-main-body"><div class="customer-card-screen"><div class="customer-card-grid">' +
        '<div class="context-block"><h3>Клиент</h3>' +
          contextLine('Платформа', user.platform) +
          contextLine('Chat ID', user.chatId) +
          contextLine('User ID', user.id) +
          contextLine('Имя', user.name || user.username) +
        '</div>' +
        '<div class="context-block"><h3>История обращений</h3>' +
          '<div class="customer-card-list">' +
            renderCustomerHistoryItems(registrations, serviceRequests, tickets) +
          '</div>' +
        '</div>' +
      '</div></div></div>';
    }
    function renderCustomerHistoryItems(registrations, serviceRequests, tickets) {
      const rows = [
        ...registrations.map((item) => ({
          createdAt: item.createdAt,
          html: '<button class="context-line" onclick="openRegistrationFromCustomer(' + item.id + ')"><b>Анкета #' + item.id + ' · ' + esc(item.orgName || item.innKpp || 'Без названия') + '</b><span>' + registrationStatusText(item.status, item.isProcessed) + ' · ' + fmtDate(item.createdAt) + '</span></button>',
        })),
        ...serviceRequests.map((item) => ({
          createdAt: item.createdAt,
          html: '<button class="context-line" onclick="openServiceFromCustomer(' + item.id + ')"><b>Сервис #' + item.id + ' · ' + esc(item.serviceTypeTitle || item.serviceTypeCode) + '</b><span>' + esc(statusText(item.status)) + ' · ' + fmtDate(item.createdAt) + '</span></button>',
        })),
        ...tickets.map((item) => ({
          createdAt: item.createdAt,
          html: '<button class="context-line" onclick="openTicketFromCustomer(' + item.id + ')"><b>Вопрос #' + item.id + ' · ' + esc(item.text || 'Без текста') + '</b><span>' + esc(item.isAnswered ? 'Закрыт' : 'Открыт') + ' · ' + fmtDate(item.createdAt) + '</span></button>',
        })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return rows.length ? rows.map((row) => row.html).join('') : '<div class="meta">Обращений пока нет</div>';
    }
    function closeRegistrationCustomerCard(id) {
      state.customerRegistrationId = null;
      const item = state.registrationItems.find((registration) => registration.id === id);
      const holder = document.querySelector('#registration-detail');
      if (holder && item) {
        holder.innerHTML = renderRegistrationDetail(item);
        loadFreeEquipmentKitOptions(item.id, item.equipmentKitId);
      }
    }
    async function openRegistrationFromCustomer(id) {
      state.customerRegistrationId = null;
      state.openRegistrationId = id;
      let item = state.registrationItems.find((registration) => registration.id === id);
      if (!item) {
        item = await api('/admin/api/registrations/' + id);
        if (item && !state.registrationItems.some((registration) => registration.id === id)) {
          state.registrationItems = [item, ...state.registrationItems];
        }
      }
      document.querySelectorAll('.ticket-row').forEach((row) => row.classList.toggle('active', row.getAttribute('onclick') === 'selectRegistration(' + id + ')'));
      const holder = document.querySelector('#registration-detail');
      if (holder && item) {
        holder.innerHTML = renderRegistrationDetail(item);
        loadFreeEquipmentKitOptions(item.id, item.equipmentKitId);
      }
    }
    async function openServiceFromCustomer(id) {
      state.tab = 'service';
      state.openServiceWorkKey = 'service-request:' + id;
      statusFilter.value = 'all';
      document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item.dataset.tab === 'service'));
      await load();
    }
    async function openTicketFromCustomer(id) {
      state.tab = 'tickets';
      state.openTicketId = id;
      state.focusTicketQuestionId = id;
      statusFilter.value = 'all';
      platformFilter.value = '';
      document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item.dataset.tab === 'tickets'));
      await load();
    }
    function selectRegistration(id) {
      state.openRegistrationId = id;
      state.customerRegistrationId = null;
      load();
    }
    function renderRegistrationStatusOptions(value, isProcessed) {
      const selected = isProcessed ? 'processed' : (value || 'new');
      return [
        ['new', 'Новая'],
        ['in_work', 'В работе'],
        ['processed', 'Обработана'],
      ].map(([key, label]) => '<option value="' + key + '"' + (selected === key ? ' selected' : '') + '>' + label + '</option>').join('');
    }
    function registrationStatusText(value, isProcessed) {
      if (isProcessed || value === 'processed') return 'Обработана';
      return ({ new: 'Новая', in_work: 'В работе' }[value || 'new']) || value || 'Новая';
    }
    function registrationStatusClass(value, isProcessed) {
      if (isProcessed || value === 'processed') return 'done';
      if (value === 'in_work') return 'hot';
      return '';
    }
    function registrationPriorityText(value) {
      return servicePriorityText(value);
    }
    function head(item, title, processed) {
      return '<div class="item-head"><div><div class="title">' + title + '</div><div class="meta">' + esc(item.platform) + ' · ' + fmtDate(item.createdAt) + '</div></div><div>' + (processed ? 'Обработано' : 'Новое') + '</div></div>';
    }
    function registrationCard(item) {
      return '<article class="item">' + head(item, 'Регистрация #' + item.id + ' · ' + esc(item.orgName || ''), item.isProcessed) +
        '<div class="fields">' +
        field('Телефон', item.phoneToCall || item.phone) + field('Email', item.email) + field('ИНН/КПП', item.innKpp) + field('ОГРН', item.ogrn) +
        field('Адрес ККТ', item.kktAdress) + field('Модель ККТ', item.kktModel) +
        field('Фото комплекта', item.equipmentPhotoPath ? 'Есть' : '') + field('Комплект', item.equipmentKitId ? '#' + item.equipmentKitId : '') +
        '</div><div class="actions">' +
        (item.pdfPath ? '<button onclick="downloadPdf(' + item.id + ')">PDF</button>' : '') +
        (item.equipmentPhotoPath ? '<button onclick="downloadEquipmentPhoto(' + item.id + ')">Фото комплекта</button>' : '') +
        '<select id="reg-kit-' + item.id + '"><option value="">Выберите свободный комплект</option></select><button onclick="linkEquipmentKit(' + item.id + ')">Привязать комплект</button>' +
        (!item.isProcessed ? '<button class="primary" onclick="processItem(\\'registrations\\',' + item.id + ')">Обработано</button>' : '') +
        '</div></article>';
    }
    function ticketCard(item) {
      return '<article class="item">' + head(item, 'Вопрос #' + item.id + ' · ' + esc(item.name || item.username || item.userChatId), item.isAnswered) +
        '<div class="fields">' + field('Пользователь', item.username ? '@' + item.username : item.userChatId) + field('Последнее сообщение', item.text) + '</div>' +
        '<div class="actions"><button onclick="openTicketChat(' + item.id + ')">' + (state.openTicketId === item.id ? 'Обновить чат' : 'Открыть чат') + '</button>' +
        (!item.isAnswered ? '<button class="danger" onclick="closeTicket(' + item.id + ')">Закрыть</button>' : '') + '</div>' +
        '<div id="chat-' + item.id + '"></div>' +
        '</article>';
    }
    function statusText(value) {
      return ({
        draft:'Черновик',
        price_confirmed:'Цена подтверждена',
        review_required:'Нужно проверить',
        invoice_required:'Нужен счет',
        waiting_payment:'Ожидает оплаты',
        paid:'Оплачено',
        scheduled:'Назначен визит',
        completed:'Завершена',
        cancelled:'Отменена'
      })[value] || value;
    }
    function serviceStatusClass(value) {
      if (value === 'completed') return 'done';
      if (value === 'cancelled') return 'bad';
      if (['review_required', 'invoice_required', 'waiting_payment', 'paid', 'scheduled'].includes(value)) return 'hot';
      return '';
    }
    function servicePriorityClass(value) {
      if (value === 'urgent' || value === 'high') return 'hot';
      if (value === 'low') return 'done';
      return '';
    }
    function serviceRequestCard(item) {
      const answers = item.answers || {};
      return '<article class="item">' + head(item, 'Сценарная заявка #' + item.id + ' · ' + esc(item.serviceTypeTitle), item.status === 'completed' || item.status === 'cancelled') +
        '<div class="fields">' +
        field('Статус', statusText(item.status)) +
        field('Стоимость', item.calculatedPrice ? item.calculatedPrice + ' ₽' : 'Не рассчитана') +
        field('ИНН', answers.inn) +
        field('Касса/шильдик', answers.cashRegisterIdentity) +
        field('ФН', answers.fiscalDriveTerm ? answers.fiscalDriveTerm + ' мес.' : '') +
        field('Контакт', answers.contactForCall) +
        '</div><div class="actions"><button onclick="openServiceRequest(' + item.id + ')">' + (state.openServiceRequestId === item.id ? 'Обновить' : 'Открыть') + '</button></div>' +
        '<div id="service-request-' + item.id + '"></div></article>';
    }
    function organizationCard(item) {
      const members = item.members || [];
      return '<article class="item">' + head(item, esc(item.name || 'Организация #' + item.id), false) +
        '<div class="fields">' +
        field('ИНН', item.inn) + field('КПП', item.kpp) + field('ОГРН', item.ogrn) + field('СНО', item.taxSystem) +
        field('Юр. адрес', item.legalAddress) + field('Представителей', members.length) +
        '</div><div class="actions"><button onclick="openOrganizationAssets(' + item.id + ')">Кассы и подписки</button></div>' +
        '<div id="assets-' + item.id + '"></div></article>';
    }
    function equipmentKitForm() {
      return '<article class="item"><div class="title">Новый комплект ККТ</div><div class="composer">' +
        '<input id="kit-model" placeholder="Модель кассы">' +
        '<input id="kit-kkt" placeholder="Серийный номер кассы">' +
        '<input id="kit-fn" placeholder="Серийный номер ФН">' +
        '<input id="kit-ofd" placeholder="Код активации ОФД">' +
        '<input id="kit-order" placeholder="Заказ/отправление">' +
        '<button class="primary" onclick="createEquipmentKit()">Добавить</button>' +
        '</div></article>';
    }
    function equipmentKitCard(item) {
      return '<article class="item">' + head(item, 'Комплект #' + item.id + ' · ' + esc(item.cashRegisterSerial || item.fiscalDriveSerial || item.marketplaceOrderId || ''), item.status === 'registered' || item.status === 'archived') +
        '<div class="fields">' +
        field('Статус', item.status) +
        field('Модель', item.cashRegisterModel) +
        field('Касса', item.cashRegisterSerial) +
        field('ФН', item.fiscalDriveSerial) +
        field('ОФД код', item.ofdActivationCode) +
        field('Заказ', item.marketplaceOrderId) +
        field('Заявка', item.registrationRequestId ? '#' + item.registrationRequestId : '') +
        '</div></article>';
    }
    async function createEquipmentKit() {
      await api('/admin/api/equipment-kits', {
        method: 'POST',
        body: JSON.stringify({
          cashRegisterModel: document.querySelector('#kit-model').value,
          cashRegisterSerial: document.querySelector('#kit-kkt').value,
          fiscalDriveSerial: document.querySelector('#kit-fn').value,
          ofdActivationCode: document.querySelector('#kit-ofd').value,
          marketplaceOrderId: document.querySelector('#kit-order').value,
        }),
      });
      load();
    }
    async function openOrganizationAssets(id) {
      const data = await api('/admin/api/organizations/' + id + '/assets');
      const holder = document.querySelector('#assets-' + id);
      if (!holder) return;
      holder.innerHTML = renderOrganizationAssets(data);
    }
    function renderOrganizationAssets(data) {
      const cashRegisters = data.cashRegisters || [];
      const fiscalDrives = data.fiscalDrives || [];
      const ofdSubscriptions = data.ofdSubscriptions || [];
      return '<div class="chat"><div class="fields">' +
        field('Кассы', cashRegisters.length) +
        field('ФН', fiscalDrives.map((item) => item.serialNumber + (item.validUntil ? ' до ' + fmtDate(item.validUntil) : '')).join(', ') || 'Не указано') +
        field('ОФД', ofdSubscriptions.map((item) => item.provider + (item.validUntil ? ' до ' + fmtDate(item.validUntil) : '')).join(', ') || 'Не указано') +
        '</div></div>';
    }
    async function processItem(kind, id) {
      await api('/admin/api/' + kind + '/' + id + '/process', { method: 'POST', body: '{}' });
      load();
    }
    async function saveRegistrationOperatorState(id) {
      const nextStatus = document.querySelector('#reg-status-' + id).value;
      const nextPriority = document.querySelector('#reg-priority-' + id).value;
      await api('/admin/api/registrations/' + id + '/operator-state', {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus, priority: nextPriority }),
      });
      state.openRegistrationId = id;
      load();
    }
    function selectServiceWork(key) {
      state.openServiceWorkKey = key;
      document.querySelectorAll('[data-service-key]').forEach((row) => row.classList.toggle('active', row.dataset.serviceKey === key));
      openServiceWork(key);
    }
    async function openServiceWork(key) {
      state.openServiceWorkKey = key;
      const entry = state.serviceWorkItems.find((item) => item.key === key);
      const holder = document.querySelector('#service-detail');
      if (!entry || !holder) return;

      const data = await api('/admin/api/service-requests/' + entry.item.id);
      holder.innerHTML = renderScenarioServiceDetail(data.request, data.events || []);
    }
    async function loadCustomerContext(item) {
      const params = new URLSearchParams();
      if (item.userId) params.set('userId', item.userId);
      if (item.organizationId) params.set('organizationId', item.organizationId);
      if (item.platform) params.set('platform', item.platform);
      if (item.chatId || item.userChatId) params.set('chatId', item.chatId || item.userChatId);
      return api('/admin/api/customer-context?' + params.toString());
    }
    function renderScenarioServiceDetail(request, events) {
      const answers = request.answers || {};
      const hiddenAnswerKeys = new Set(['generatedPdfPath', 'signedConsentPath']);
      const answerFields = Object.entries(answers).filter(([key]) => !hiddenAnswerKeys.has(key)).map(([key, value]) => field(serviceAnswerLabel(key), value)).join('');
      const signedConsentButton = answers.signedConsentPath ? '<div class="actions"><button onclick="downloadSignedConsent(' + request.id + ')">Скачать подписанное согласие</button></div>' : '';
      return '<div class="ticket-main-head"><div><div class="ticket-main-title">Сервисная заявка #' + request.id + ' · ' + esc(request.serviceTypeTitle) + '</div><div class="ticket-main-subtitle">' + esc(request.platform) + ' · ' + statusText(request.status) + ' · ' + fmtDate(request.createdAt) + '</div></div>' +
        '<div class="actions" style="margin-top:0"><button onclick="openServiceCustomerCard(' + request.id + ')">Карточка клиента</button></div></div>' +
        '<div class="ticket-main-body"><div class="detail-primary"><div class="fields">' +
            field('Статус', statusText(request.status)) +
            field('Приоритет', servicePriorityText(request.priority)) +
            field('Куратор', request.responsibleOperatorId) +
            field('Исполнитель', request.executorName) +
            field('Стоимость', request.calculatedPrice ? request.calculatedPrice + ' ₽' : 'Не рассчитана') +
            answerFields +
          '</div>' + signedConsentButton + renderServiceRequestDetails(request, events) + '</div></div>';
    }
    async function openServiceCustomerCard(id) {
      const data = await api('/admin/api/service-requests/' + id);
      const request = data.request || {};
      const params = new URLSearchParams();
      if (request.userId) params.set('userId', request.userId);
      if (request.organizationId) params.set('organizationId', request.organizationId);
      if (request.platform) params.set('platform', request.platform);
      if (request.chatId) params.set('chatId', request.chatId);
      const card = await api('/admin/api/customer-card?' + params.toString());
      const holder = document.querySelector('#service-detail') || document.querySelector('#service-request-' + id);
      if (holder) holder.innerHTML = renderServiceCustomerCardScreen(card, request);
    }
    function renderServiceCustomerCardScreen(data, request) {
      const user = data.user || {};
      const registrations = data.registrations || [];
      const serviceRequests = data.serviceRequests || [];
      const tickets = data.tickets || [];
      return '<div class="ticket-main-head"><div><div class="ticket-main-title">Карточка клиента</div><div class="ticket-main-subtitle">' + esc(user.platform || request.platform || '') + ' · ' + esc(user.chatId || request.chatId || '') + '</div></div>' +
        '<button onclick="openServiceWork(\\'service-request:' + request.id + '\\')">Закрыть</button></div>' +
        '<div class="ticket-main-body"><div class="ticket-customer-card"><div class="customer-card-grid">' +
          '<div class="context-block"><h3>Клиент</h3>' +
            contextLine('Платформа', user.platform || request.platform) +
            contextLine('Chat ID', user.chatId || request.chatId) +
            contextLine('User ID', user.id || request.userId) +
            contextLine('Имя', user.name || user.username) +
          '</div>' +
          '<div class="context-block"><h3>История обращений</h3><div class="customer-card-list">' +
            renderCustomerHistoryItems(registrations, serviceRequests, tickets) +
          '</div></div>' +
        '</div></div></div>';
    }
    function selectTicket(id) {
      state.openTicketId = id;
      document.querySelectorAll('.ticket-row').forEach((row) => row.classList.toggle('active', row.getAttribute('onclick') === 'selectTicket(' + id + ')'));
      openTicketChat(id);
    }
    async function openTicketChat(id) {
      state.openTicketId = id;
      const data = await api('/admin/api/tickets/' + id);
      const holder = document.querySelector('#ticket-detail') || document.querySelector('#chat-' + id);
      if (holder) holder.innerHTML = renderTicketDetail(data.ticket, data.messages || [], data.context);
      if (state.focusTicketQuestionId === id) {
        setTimeout(() => {
          const target = document.querySelector('#ticket-question-' + id);
          if (target) target.scrollIntoView({ block: 'center' });
          state.focusTicketQuestionId = null;
        }, 0);
      }
    }
    function renderTicketDetail(ticket, messages, context) {
      return '<div class="ticket-main-head"><div><div class="ticket-main-title">Вопрос #' + ticket.id + ' · ' + esc(ticket.name || ticket.username || ticket.userChatId) + '</div><div class="ticket-main-subtitle">' + esc(ticket.platform) + ' · ' + fmtDate(ticket.createdAt) + '</div></div>' +
        '<div class="actions" style="margin-top:0">' +
          '<button onclick="openTicketCustomerCard(' + ticket.id + ')">Карточка клиента</button>' +
          (!ticket.isAnswered ? '<button class="danger" onclick="closeTicket(' + ticket.id + ')">Закрыть</button>' : '<span class="meta">Закрыт</span>') +
        '</div></div><div class="ticket-main-body"><div class="detail-primary">' + renderChat(ticket, messages || []) + '</div></div>';
    }
    async function openTicketCustomerCard(id) {
      const data = await api('/admin/api/tickets/' + id);
      const ticket = data.ticket || {};
      const context = data.context || {};
      const params = new URLSearchParams();
      if (ticket.userId) params.set('userId', ticket.userId);
      if (ticket.organizationId) params.set('organizationId', ticket.organizationId);
      if (ticket.platform) params.set('platform', ticket.platform);
      if (ticket.userChatId) params.set('chatId', ticket.userChatId);
      const card = await api('/admin/api/customer-card?' + params.toString());
      const holder = document.querySelector('#ticket-detail') || document.querySelector('#chat-' + id);
      if (holder) holder.innerHTML = renderTicketCustomerCardScreen(card, ticket);
    }
    function renderTicketCustomerCardScreen(data, ticket) {
      const user = data.user || {};
      const registrations = data.registrations || [];
      const serviceRequests = data.serviceRequests || [];
      const tickets = data.tickets || [];
      return '<div class="ticket-main-head"><div><div class="ticket-main-title">Карточка клиента</div><div class="ticket-main-subtitle">' + esc(user.platform || ticket.platform || '') + ' · ' + esc(user.chatId || ticket.userChatId || '') + '</div></div>' +
        '<button onclick="openTicketChat(' + ticket.id + ')">Закрыть</button></div>' +
        '<div class="ticket-main-body"><div class="ticket-customer-card"><div class="customer-card-grid">' +
          '<div class="context-block"><h3>Клиент</h3>' +
            contextLine('Платформа', user.platform || ticket.platform) +
            contextLine('Chat ID', user.chatId || ticket.userChatId) +
            contextLine('User ID', user.id || ticket.userId) +
            contextLine('Имя', user.name || user.username || ticket.name || ticket.username) +
          '</div>' +
          '<div class="context-block"><h3>История обращений</h3><div class="customer-card-list">' +
            renderCustomerHistoryItems(registrations, serviceRequests, tickets) +
          '</div></div>' +
        '</div></div></div>';
    }
    function startTicketResize(event) {
      startSidebarResize(event, 'ticketSidebarWidth');
    }
    function startSidebarResize(event, storageKey) {
      event.preventDefault();
      const shell = event.target.closest('.ticket-shell');
      const sidebar = shell?.querySelector('.ticket-sidebar');
      if (!shell || !sidebar) return;
      const startX = event.clientX;
      const startWidth = sidebar.getBoundingClientRect().width;
      function onMove(moveEvent) {
        const max = Math.min(560, window.innerWidth * 0.58);
        const next = Math.max(220, Math.min(max, startWidth + moveEvent.clientX - startX));
        shell.style.setProperty('--ticket-sidebar-width', next + 'px');
        localStorage.setItem(storageKey, String(Math.round(next)));
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
    async function openServiceRequest(id) {
      state.openServiceRequestId = id;
      const data = await api('/admin/api/service-requests/' + id);
      const holder = document.querySelector('#service-request-' + id);
      if (holder) holder.innerHTML = renderServiceRequestDetails(data.request, data.events || []);
    }
    function renderServiceRequestDetails(request, events) {
      const rows = events.length ? events.map((event) =>
        '<div class="message"><div>' + esc(serviceEventText(event)) + '</div><div class="meta">' + esc(serviceEventMeta(event)) + ' · ' + fmtDate(event.createdAt) + '</div></div>'
      ).join('') : '<div class="empty">Истории по заявке пока нет</div>';
      return '<div class="chat"><div class="messages">' + rows + '</div>' +
        '<div class="composer"><select id="priority-' + request.id + '">' + renderPriorityOptions(request.priority) + '</select><input id="executor-' + request.id + '" placeholder="Исполнитель" value="' + esc(request.executorName || '') + '"><button class="primary" onclick="saveServiceRequestOperatorState(' + request.id + ')">Сохранить</button></div>' +
        '<div class="composer"><textarea id="operator-comment-' + request.id + '" placeholder="Внутренний комментарий или поручение">' + esc(request.operatorComment || '') + '</textarea></div>' +
        '<div class="composer"><input id="invoice-id-' + request.id + '" placeholder="Ссылка или номер PDF счета"><input id="invoice-name-' + request.id + '" placeholder="Название счета"><button class="primary" onclick="attachInvoice(' + request.id + ')">Прикрепить счет</button></div>' +
        '<div class="composer"><input id="invoice-file-' + request.id + '" type="file" accept="application/pdf"><button class="primary" onclick="uploadInvoicePdf(' + request.id + ')">Загрузить PDF</button>' + (request.invoiceFileId ? '<button onclick="downloadInvoice(' + request.id + ')">Скачать счет</button>' : '') + '</div>' +
        '<div class="actions"><button class="primary" onclick="markPaymentReceived(' + request.id + ')">Оплата получена</button></div>' +
        '<div class="composer"><input id="visit-address-' + request.id + '" placeholder="Адрес визита"><input id="visit-time-' + request.id + '" placeholder="2026-07-05T12:00"><button onclick="scheduleVisit(' + request.id + ')">Назначить визит</button></div>' +
        '<div class="actions"><button onclick="completeServiceRequest(' + request.id + ')">Завершить</button><button class="danger" onclick="cancelServiceRequest(' + request.id + ')">Отменить</button></div></div>';
    }
    function renderPriorityOptions(value) {
      const selected = value || 'normal';
      return [
        ['low', 'Низкий'],
        ['normal', 'Обычный'],
        ['high', 'Высокий'],
        ['urgent', 'Срочный'],
      ].map(([key, label]) => '<option value="' + key + '"' + (selected === key ? ' selected' : '') + '>' + label + '</option>').join('');
    }
    function servicePriorityText(value) {
      return ({ low: 'Низкий', normal: 'Обычный', high: 'Высокий', urgent: 'Срочный' }[value || 'normal']) || value || 'Обычный';
    }
    function serviceEventText(event) {
      if (event.type === 'answered' && event.payload && event.payload.value !== undefined) {
        return String(event.payload.value);
      }
      return event.message || event.type;
    }
    function serviceEventMeta(event) {
      if (event.type === 'answered' && event.payload && event.payload.key) {
        return (event.actor || '') + ' · ' + serviceAnswerLabel(event.payload.key);
      }
      return event.actor || '';
    }
    function serviceAnswerLabel(key) {
      const labels = {
        problemDescription: 'Описание задачи',
        contactForCall: 'Контакт',
        inn: 'ИНН',
        cashRegisterIdentity: 'Касса/шильдик',
        fiscalDriveTerm: 'ФН',
        consentId: 'ID согласия',
        city: 'Город',
        clientName: 'Клиент',
        representativeName: 'В лице',
        representativeBasis: 'Основание',
        signedConsentName: 'Подписанный файл',
      };
      return labels[key] || key;
    }
    async function attachInvoice(id) {
      const invoiceFileId = document.querySelector('#invoice-id-' + id).value.trim();
      const invoiceFileName = document.querySelector('#invoice-name-' + id).value.trim();
      if (!invoiceFileId) return;
      await api('/admin/api/service-requests/' + id + '/invoice', { method: 'POST', body: JSON.stringify({ invoiceFileId, invoiceFileName }) });
      await openServiceRequest(id);
      load();
    }
    async function uploadInvoicePdf(id) {
      const input = document.querySelector('#invoice-file-' + id);
      if (!input.files || !input.files[0]) return;
      const form = new FormData();
      form.append('file', input.files[0]);
      const response = await fetch('/admin/api/service-requests/' + id + '/invoice-file', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) throw new Error(await response.text() || response.statusText);
      await openServiceRequest(id);
      load();
    }
    function downloadInvoice(id) {
      window.open('/admin/api/service-requests/' + id + '/invoice', '_blank');
    }
    function downloadSignedConsent(id) {
      window.open('/admin/api/service-requests/' + id + '/signed-consent', '_blank');
    }
    async function markPaymentReceived(id) {
      await api('/admin/api/service-requests/' + id + '/payment-received', { method: 'POST', body: '{}' });
      await openServiceRequest(id);
      load();
    }
    async function saveServiceRequestOperatorState(id) {
      const priority = document.querySelector('#priority-' + id).value;
      const executorName = document.querySelector('#executor-' + id).value.trim();
      const operatorComment = document.querySelector('#operator-comment-' + id).value.trim();
      await api('/admin/api/service-requests/' + id + '/operator-state', {
        method: 'POST',
        body: JSON.stringify({ priority, executorName, operatorComment }),
      });
      await openServiceRequest(id);
      load();
    }
    async function scheduleVisit(id) {
      const visitAddress = document.querySelector('#visit-address-' + id).value.trim();
      const visitTime = document.querySelector('#visit-time-' + id).value.trim();
      if (!visitAddress) return;
      await api('/admin/api/service-requests/' + id + '/schedule', { method: 'POST', body: JSON.stringify({ visitAddress, visitTime }) });
      await openServiceRequest(id);
      load();
    }
    async function completeServiceRequest(id) {
      await api('/admin/api/service-requests/' + id + '/complete', { method: 'POST', body: '{}' });
      load();
    }
    async function cancelServiceRequest(id) {
      await api('/admin/api/service-requests/' + id + '/cancel', { method: 'POST', body: '{}' });
      load();
    }
    function renderContextCard(context) {
      const data = context || {};
      const user = data.user || {};
      const organization = data.organization || {};
      const linkedOrganizations = data.organizations || [];
      const assets = data.assets || {};
      const cashRegisters = assets.cashRegisters || [];
      const fiscalDrives = assets.fiscalDrives || [];
      const ofdSubscriptions = assets.ofdSubscriptions || [];
      const activities = data.activities || [];
      return '<aside class="context-card">' +
        '<div class="context-block"><h3>Клиент</h3>' +
          contextLine('Имя', user.name || user.username) +
          contextLine('Платформа', user.platform) +
          contextLine('Chat ID', user.chatId) +
          contextLine('Последняя активность', fmtDate(user.lastSeenAt)) +
        '</div>' +
        '<div class="context-block"><h3>Организация</h3>' +
          contextLine('Название', organization.name) +
          contextLine('ИНН / КПП', [organization.inn, organization.kpp].filter(Boolean).join(' / ')) +
          contextLine('ОГРН', organization.ogrn) +
          contextLine('СНО', organization.taxSystem) +
        '</div>' +
        '<div class="context-block"><h3>Связанные организации</h3>' +
          (linkedOrganizations.length
            ? linkedOrganizations.map((member) => {
                const linked = member.organization || {};
                const title = linked.name || linked.inn || ('Организация #' + member.id);
                const details = [linked.inn, linked.kpp].filter(Boolean).join(' / ');
                return '<div class="context-line"><b>' + esc(title) + '</b><span>' + esc(details || member.role || '') + '</span></div>';
              }).join('')
            : '<div class="meta">Связанных организаций нет</div>') +
        '</div>' +
        '<div class="context-block"><h3>Кассы и подписки</h3>' +
          contextLine('Кассы', cashRegisters.length ? cashRegisters.map((item) => item.model || item.serialNumber || ('#' + item.id)).join(', ') : '') +
          contextLine('ФН', fiscalDrives.length ? fiscalDrives.map((item) => (item.serialNumber || '#' + item.id) + (item.validUntil ? ' до ' + fmtDate(item.validUntil) : '')).join(', ') : '') +
          contextLine('ОФД', ofdSubscriptions.length ? ofdSubscriptions.map((item) => (item.provider || '#' + item.id) + (item.validUntil ? ' до ' + fmtDate(item.validUntil) : '')).join(', ') : '') +
        '</div>' +
        '<div class="context-block"><h3>История</h3>' +
          (activities.length ? activities.map((item) => '<div class="context-line"><b>' + esc(item.title || item.type) + '</b><span>' + fmtDate(item.createdAt) + '</span></div>').join('') : '<div class="meta">Истории пока нет</div>') +
        '</div>' +
      '</aside>';
    }
    function contextLine(label, value) {
      return '<div class="context-line"><span>' + esc(label) + '</span><b>' + esc(value || 'Не указано') + '</b></div>';
    }
    function renderChat(ticket, messages) {
      let questionMarked = false;
      const rows = messages.length ? messages.map((message) => {
        const isQuestion = !questionMarked && ticket.text && message.sender !== 'operator' && (message.text || '') === ticket.text;
        if (isQuestion) questionMarked = true;
        return '<div ' + (isQuestion ? 'id="ticket-question-' + ticket.id + '" ' : '') + 'class="message ' + esc(message.sender) + '"><div>' + renderTicketMessageContent(message) + '</div><div class="meta">' + esc(message.sender === 'operator' ? 'Оператор' : 'Клиент') + ' · ' + fmtDate(message.createdAt) + '</div></div>';
      }).join('') : '<div class="empty">Истории сообщений пока нет</div>';
      return '<div class="chat"><div class="messages">' + rows + '</div>' +
        (!ticket.isAnswered ? '<div class="composer"><textarea id="reply-' + ticket.id + '" placeholder="Ответ клиенту"></textarea><button class="primary" onclick="sendTicketMessage(' + ticket.id + ')">Отправить</button><button class="danger" onclick="closeTicket(' + ticket.id + ')">Закрыть</button></div><div class="composer"><input id="ticket-file-' + ticket.id + '" type="file"><input id="ticket-file-text-' + ticket.id + '" placeholder="Комментарий к файлу"><button onclick="sendTicketMedia(' + ticket.id + ')">Отправить файл</button></div>' : '') +
        '</div>';
    }
    function ticketFileUrl(message) {
      if (message.localPath) return '/admin/api/ticket-messages/' + message.id + '/file';
      return message.externalUrl || '';
    }
    function renderTicketMessageContent(message) {
      const type = message.messageType || 'text';
      if (type === 'text') return esc(message.text || '');
      const url = ticketFileUrl(message);
      const label = esc(message.text || message.fileName || type);
      if (!url) return label;
      if (type === 'image') return '<a href="' + esc(url) + '" target="_blank"><img src="' + esc(url) + '" alt="' + label + '" style="max-width:100%;border-radius:6px"></a>' + (message.text ? '<div>' + esc(message.text) + '</div>' : '');
      if (type === 'video' || type === 'video_note') return '<video controls src="' + esc(url) + '" style="max-width:100%"></video><div>' + label + '</div>';
      if (type === 'audio' || type === 'voice') return '<audio controls src="' + esc(url) + '" style="width:100%"></audio><div>' + label + '</div>';
      return '<a href="' + esc(url) + '" target="_blank">' + label + '</a>';
    }
    async function sendTicketMessage(id) {
      const textarea = document.querySelector('#reply-' + id);
      const text = textarea.value.trim();
      if (!text) return;
      await api('/admin/api/tickets/' + id + '/messages', { method: 'POST', body: JSON.stringify({ text }) });
      await openTicketChat(id);
      load();
    }
    async function sendTicketMedia(id) {
      const input = document.querySelector('#ticket-file-' + id);
      if (!input.files || !input.files[0]) return;
      const comment = document.querySelector('#ticket-file-text-' + id).value.trim();
      const form = new FormData();
      form.append('file', input.files[0]);
      if (comment) form.append('text', comment);
      const response = await fetch('/admin/api/tickets/' + id + '/media', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) throw new Error(await response.text() || response.statusText);
      await openTicketChat(id);
      load();
    }
    async function closeTicket(id) {
      await api('/admin/api/tickets/' + id + '/close', { method: 'POST', body: '{}' });
      load();
    }
    function downloadPdf(id) {
      window.open('/admin/api/registrations/' + id + '/pdf', '_blank');
    }
    function downloadEquipmentPhoto(id) {
      window.open('/admin/api/registrations/' + id + '/equipment-photo', '_blank');
    }
    async function loadFreeEquipmentKitOptions(registrationId, currentKitId) {
      const select = document.querySelector('#reg-kit-' + registrationId);
      if (!select) return;
      if (currentKitId) {
        select.innerHTML = '<option value="' + currentKitId + '">Комплект #' + currentKitId + ' уже привязан</option>';
        select.disabled = true;
        return;
      }
      const kits = await api('/admin/api/equipment-kits/free');
      select.disabled = false;
      select.innerHTML = '<option value="">Выберите свободный комплект</option>' +
        (kits.length
          ? kits.map((kit) => '<option value="' + kit.id + '">' + esc(equipmentKitOptionLabel(kit)) + '</option>').join('')
          : '<option value="">Свободных комплектов нет</option>');
    }
    function equipmentKitOptionLabel(kit) {
      return [
        '#' + kit.id,
        kit.cashRegisterModel,
        kit.cashRegisterSerial ? 'ККТ ' + kit.cashRegisterSerial : '',
        kit.fiscalDriveSerial ? 'ФН ' + kit.fiscalDriveSerial : '',
        kit.marketplaceOrderId ? 'заказ ' + kit.marketplaceOrderId : '',
      ].filter(Boolean).join(' · ');
    }
    async function linkEquipmentKit(id) {
      const kitId = Number(document.querySelector('#reg-kit-' + id).value);
      if (!kitId) return;
      await api('/admin/api/registrations/' + id + '/equipment-kit', {
        method: 'POST',
        body: JSON.stringify({ kitId }),
      });
      load();
    }
    checkSession().then(load);
  </script>
</body>
</html>`;
