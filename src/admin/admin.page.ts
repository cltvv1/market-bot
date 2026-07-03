export const adminPageHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Админка бота</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --line:#d9dde5; --text:#172033; --muted:#667085; --brand:#0f766e; --danger:#b42318; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--text); }
    header { display:flex; gap:16px; align-items:center; justify-content:space-between; padding:16px 24px; background:var(--panel); border-bottom:1px solid var(--line); position:sticky; top:0; z-index:2; }
    h1 { font-size:20px; margin:0; }
    main { padding:20px 24px 36px; max-width:1320px; margin:0 auto; }
    button, input, select, textarea { font: inherit; }
    button { border:1px solid var(--line); background:#fff; border-radius:6px; padding:8px 10px; cursor:pointer; }
    button.primary { background:var(--brand); border-color:var(--brand); color:#fff; }
    button.danger { color:var(--danger); }
    input, select, textarea { border:1px solid var(--line); border-radius:6px; padding:8px 10px; background:#fff; min-width:120px; }
    textarea { width:100%; min-height:76px; resize:vertical; }
    .toolbar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .token { width:260px; }
    .stats { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; margin-bottom:18px; }
    .stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
    .stat strong { display:block; font-size:28px; margin-top:4px; }
    .tabs { display:flex; gap:8px; margin:0 0 14px; }
    .tabs button.active { background:#172033; color:#fff; border-color:#172033; }
    .filters { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
    .grid { display:grid; gap:12px; }
    .item { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
    .item-head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:10px; }
    .title { font-weight:700; }
    .meta { color:var(--muted); font-size:13px; margin-top:4px; }
    .fields { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px 18px; }
    .field span { display:block; color:var(--muted); font-size:12px; }
    .field b { font-weight:400; word-break:break-word; }
    .actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; }
    .empty { color:var(--muted); padding:26px; text-align:center; background:var(--panel); border:1px dashed var(--line); border-radius:8px; }
    .error { color:var(--danger); margin-left:8px; }
    @media (max-width: 760px) { header { align-items:flex-start; flex-direction:column; } .stats, .fields { grid-template-columns:1fr; } .token { width:100%; } }
  </style>
</head>
<body>
  <header>
    <h1>Админка бота</h1>
    <div class="toolbar">
      <input id="token" class="token" type="password" placeholder="ADMIN_TOKEN" />
      <button id="saveToken">Сохранить</button>
      <button id="refresh" class="primary">Обновить</button>
      <span id="error" class="error"></span>
    </div>
  </header>
  <main>
    <section class="stats">
      <div class="stat">Новые регистрации<strong id="regCount">0</strong></div>
      <div class="stat">Новые заявки<strong id="bidCount">0</strong></div>
      <div class="stat">Открытые вопросы<strong id="ticketCount">0</strong></div>
    </section>
    <nav class="tabs">
      <button data-tab="registrations" class="active">Регистрации</button>
      <button data-tab="bids">Сервисные заявки</button>
      <button data-tab="tickets">Вопросы</button>
    </nav>
    <section class="filters">
      <select id="status">
        <option value="new">Новые</option>
        <option value="all">Все</option>
        <option value="processed">Обработанные</option>
      </select>
      <select id="platform">
        <option value="">Все платформы</option>
        <option value="max">MAX</option>
        <option value="telegram">Telegram</option>
      </select>
    </section>
    <section id="list" class="grid"></section>
  </main>
  <script>
    const state = { tab: 'registrations' };
    const tokenInput = document.querySelector('#token');
    const errorEl = document.querySelector('#error');
    tokenInput.value = localStorage.getItem('adminToken') || '';

    document.querySelector('#saveToken').onclick = () => {
      localStorage.setItem('adminToken', tokenInput.value.trim());
      load();
    };
    document.querySelector('#refresh').onclick = () => load();
    document.querySelector('#status').onchange = () => load();
    document.querySelector('#platform').onchange = () => load();
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.onclick = () => {
        state.tab = button.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
        load();
      };
    });

    function token() { return tokenInput.value.trim() || localStorage.getItem('adminToken') || 'admin'; }
    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token(), ...(options.headers || {}) },
      });
      if (!response.ok) throw new Error(await response.text() || response.statusText);
      return response.json();
    }
    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
    }
    function fmtDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : ''; }
    function field(label, value) { return '<div class="field"><span>' + label + '</span><b>' + esc(value || 'Не указано') + '</b></div>'; }

    async function load() {
      errorEl.textContent = '';
      try {
        const summary = await api('/admin/api/summary');
        regCount.textContent = summary.newRegistrations;
        bidCount.textContent = summary.newBids;
        ticketCount.textContent = summary.openTickets;
        const params = new URLSearchParams({ status: status.value });
        if (platform.value) params.set('platform', platform.value);
        const items = await api('/admin/api/' + state.tab + '?' + params.toString());
        render(items);
      } catch (error) {
        errorEl.textContent = 'Ошибка доступа или загрузки';
        console.error(error);
      }
    }

    function render(items) {
      if (!items.length) {
        list.innerHTML = '<div class="empty">Ничего не найдено</div>';
        return;
      }
      list.innerHTML = items.map((item) => {
        if (state.tab === 'registrations') return registrationCard(item);
        if (state.tab === 'bids') return bidCard(item);
        return ticketCard(item);
      }).join('');
    }
    function head(item, title, processed) {
      return '<div class="item-head"><div><div class="title">' + title + '</div><div class="meta">' + esc(item.platform) + ' · ' + fmtDate(item.createdAt) + '</div></div><div>' + (processed ? 'Обработано' : 'Новое') + '</div></div>';
    }
    function registrationCard(item) {
      return '<article class="item">' + head(item, 'Регистрация #' + item.id + ' · ' + esc(item.orgName || ''), item.isProcessed) +
        '<div class="fields">' +
        field('Телефон', item.phoneToCall || item.phone) + field('Email', item.email) + field('ИНН/КПП', item.innKpp) + field('ОГРН', item.ogrn) +
        field('Адрес ККТ', item.kktAdress) + field('Модель ККТ', item.kktModel) +
        '</div><div class="actions">' +
        (item.pdfPath ? '<button onclick="downloadPdf(' + item.id + ')">PDF</button>' : '') +
        (!item.isProcessed ? '<button class="primary" onclick="processItem(\\'registrations\\',' + item.id + ')">Обработано</button>' : '') +
        '</div></article>';
    }
    function bidCard(item) {
      return '<article class="item">' + head(item, 'Заявка #' + item.id + ' · ' + esc(item.type), item.isProcessed) +
        '<div class="fields">' + field('Проблема', item.problemDescription) + field('Контакт', item.contactForCall) + '</div><div class="actions">' +
        (!item.isProcessed ? '<button class="primary" onclick="processItem(\\'bids\\',' + item.id + ')">Обработано</button>' : '') +
        '</div></article>';
    }
    function ticketCard(item) {
      return '<article class="item">' + head(item, 'Вопрос #' + item.id + ' · ' + esc(item.name || item.username || item.userChatId), item.isAnswered) +
        '<div class="fields">' + field('Пользователь', item.username ? '@' + item.username : item.userChatId) + field('Текст', item.text) + '</div>' +
        (!item.isAnswered ? '<div class="actions"><textarea id="reply-' + item.id + '" placeholder="Ответ клиенту"></textarea><button class="primary" onclick="replyTicket(' + item.id + ')">Ответить и закрыть</button></div>' : '') +
        '</article>';
    }
    async function processItem(kind, id) {
      await api('/admin/api/' + kind + '/' + id + '/process', { method: 'POST', body: '{}' });
      load();
    }
    async function replyTicket(id) {
      const textarea = document.querySelector('#reply-' + id);
      const text = textarea.value.trim();
      if (!text) return;
      await api('/admin/api/tickets/' + id + '/reply', { method: 'POST', body: JSON.stringify({ text }) });
      load();
    }
    function downloadPdf(id) {
      window.open('/admin/api/registrations/' + id + '/pdf?token=' + encodeURIComponent(token()), '_blank');
    }
    load();
  </script>
</body>
</html>`;
