export const sitePageHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ВитмаМаркет</title>
  <style>
    :root {
      --bg:#f4f6f5; --panel:#ffffff; --ink:#18231f; --muted:#66736d; --line:#dce3df;
      --accent:#16735f; --accent-2:#245f95; --danger:#a33b3b; --soft:#eaf4f0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing:border-box; min-width:0; }
    html, body { max-width:100%; overflow-x:hidden; }
    body { margin:0; color:var(--ink); background:var(--bg); overflow-wrap:anywhere; }
    button, input, select, textarea { font:inherit; }
    button { min-height:38px; border:1px solid var(--line); background:#fff; border-radius:6px; padding:8px 12px; cursor:pointer; white-space:normal; }
    button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
    button.secondary { background:#eef5f7; color:#12333e; border-color:#c8dce1; }
    button:disabled { opacity:.55; cursor:not-allowed; }
    input, select, textarea { width:100%; max-width:100%; border:1px solid var(--line); border-radius:6px; padding:9px 10px; background:#fff; color:var(--ink); }
    textarea { min-height:96px; resize:vertical; }
    header.hero { min-height:360px; color:#fff; background-image:linear-gradient(90deg, rgba(16,31,28,.86), rgba(16,31,28,.55), rgba(16,31,28,.15)), url('/site/assets/hero-register-service.png'); background-size:cover; background-position:center; display:flex; align-items:center; }
    .hero-inner { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:36px 0 44px; overflow:hidden; }
    .brand { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:56px; }
    .brand strong { font-size:20px; letter-spacing:0; }
    .nav { display:flex; gap:8px; flex-wrap:wrap; }
    .nav button { background:rgba(255,255,255,.14); color:#fff; border-color:rgba(255,255,255,.34); backdrop-filter:blur(6px); }
    h1 { font-size:46px; line-height:1.04; max-width:720px; margin:0 0 14px; letter-spacing:0; }
    .lead { max-width:650px; margin:0 0 22px; color:#e7efec; font-size:18px; line-height:1.5; }
    .hero-actions { display:flex; gap:10px; flex-wrap:wrap; }
    main { width:min(1180px, calc(100% - 32px)); margin:0 auto; padding:22px 0 48px; overflow:hidden; }
    .workspace { display:grid; grid-template-columns:280px minmax(0,1fr); gap:18px; align-items:start; }
    aside { position:sticky; top:14px; display:grid; gap:12px; }
    .panel, .item { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; min-width:0; max-width:100%; overflow:hidden; }
    .panel h2, .panel h3 { margin:0 0 10px; font-size:18px; }
    .panel p { color:var(--muted); margin:0 0 12px; line-height:1.45; }
    .seg { display:grid; gap:8px; }
    .seg button { text-align:left; }
    .seg button.active { border-color:var(--accent); background:var(--soft); color:#0f4e41; }
    section.view { display:none; }
    section.view.active { display:block; }
    .section-head { display:flex; align-items:end; justify-content:space-between; gap:14px; margin-bottom:14px; min-width:0; }
    .section-head h2 { margin:0; font-size:26px; }
    .section-head p { margin:6px 0 0; color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
    .item h3 { margin:0 0 6px; font-size:18px; }
    .item .meta { color:var(--muted); font-size:13px; margin-bottom:10px; min-height:36px; overflow-wrap:anywhere; }
    .price { font-weight:700; margin:10px 0; }
    .tag { display:inline-block; font-size:12px; color:#0f4e41; background:var(--soft); border:1px solid #cce2db; border-radius:999px; padding:3px 8px; margin-bottom:10px; }
    .form { display:grid; gap:10px; min-width:0; }
    .row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .status { margin-top:10px; color:var(--accent); min-height:22px; }
    .error { color:var(--danger); }
    .org-list { display:grid; gap:8px; }
    .org-line { border:1px solid var(--line); border-radius:6px; padding:8px; background:#fbfcfc; min-width:0; overflow-wrap:anywhere; }
    .muted { color:var(--muted); }
    .web-chat { display:grid; gap:10px; margin-top:12px; border-top:1px solid var(--line); padding-top:12px; min-width:0; }
    .web-chat[hidden] { display:none; }
    .web-chat-head { display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:700; min-width:0; }
    .web-chat-messages { display:flex; flex-direction:column; gap:8px; min-height:160px; max-height:360px; overflow:auto; border:1px solid var(--line); border-radius:8px; padding:10px; background:#f8faf9; min-width:0; }
    .web-message { align-self:flex-start; max-width:min(78%, 560px); border:1px solid var(--line); border-radius:8px; padding:8px 10px; background:#fff; overflow-wrap:anywhere; white-space:pre-wrap; }
    .web-message.user { align-self:flex-end; background:var(--soft); border-color:#cce2db; }
    .web-message .meta { display:block; margin-top:4px; color:var(--muted); font-size:12px; white-space:normal; }
    .web-message img, .web-message video { max-width:100%; max-height:240px; border-radius:6px; display:block; }
    .web-message audio { max-width:100%; }
    .web-chat-composer { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:start; }
    .web-chat-composer textarea { min-height:54px; }
    .web-chat-composer input[type="file"] { grid-column:1 / -1; }
    @media (max-width:900px) {
      h1 { font-size:34px; }
      .workspace { grid-template-columns:1fr; }
      aside { position:static; }
      .grid, .two, .row { grid-template-columns:1fr; }
      .brand { align-items:flex-start; flex-direction:column; margin-bottom:40px; }
      .web-message { max-width:100%; }
      .web-chat-composer { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <div class="brand">
        <strong>ВитмаМаркет</strong>
        <nav class="nav">
          <button onclick="showView('shop')">Магазин</button>
          <button onclick="showView('service')">Сервис</button>
          <button onclick="showView('register')">Регистрация кассы</button>
          <button onclick="showView('profile')">Организации</button>
        </nav>
      </div>
      <h1>Кассовое оборудование и сервис в одном месте</h1>
      <p class="lead">Черновой клиентский кабинет: можно выбрать оборудование, оставить сервисную заявку, задать вопрос оператору и привязать организацию по ИНН.</p>
      <div class="hero-actions">
        <button class="primary" onclick="showView('shop')">Открыть каталог</button>
        <button class="secondary" onclick="showView('service')">Оставить заявку</button>
      </div>
    </div>
  </header>

  <main>
    <div class="workspace">
      <aside>
        <div class="panel">
          <h2>Разделы</h2>
          <div class="seg">
            <button id="tab-shop" class="active" onclick="showView('shop')">Магазин оборудования</button>
            <button id="tab-service" onclick="showView('service')">Сервисные услуги</button>
            <button id="tab-register" onclick="showView('register')">Регистрация кассы</button>
            <button id="tab-profile" onclick="showView('profile')">Мои организации</button>
          </div>
        </div>
        <div class="panel">
          <h3>Клиент</h3>
          <p>Временный web-id для наброска. Позже здесь будет вход по телефону или аккаунту.</p>
          <input id="clientId" placeholder="client id">
          <div class="status" id="clientStatus"></div>
        </div>
      </aside>

      <div>
        <section id="view-shop" class="view active">
          <div class="section-head">
            <div>
              <h2>Интернет-магазин</h2>
              <p>Пока каталог-заявка: клиент выбирает позицию, а оператор уточняет наличие и счет.</p>
            </div>
          </div>
          <div class="grid" id="catalog"></div>
        </section>

        <section id="view-service" class="view">
          <div class="section-head">
            <div>
              <h2>Сервисные услуги</h2>
              <p>Разовая заявка работает без организации, для постоянных клиентов можно выбрать привязанную организацию.</p>
            </div>
          </div>
          <div class="two">
            <div class="panel">
              <h3>Сервисная заявка</h3>
              <div class="form">
                <select id="serviceType">
                  <option value="kkt_remote_work">Удаленные работы с ККТ</option>
                  <option value="firmware_update">Обновление прошивки</option>
                </select>
                <select id="serviceOrg"></select>
                <textarea id="serviceText" placeholder="Что нужно сделать?"></textarea>
                <input id="serviceContact" placeholder="Телефон для связи">
                <button class="primary" onclick="createServiceRequest()">Создать заявку</button>
                <div class="status" id="serviceStatus"></div>
              </div>
            </div>
            <div class="panel">
              <h3>Вопрос оператору</h3>
              <div class="form">
                <select id="ticketOrg"></select>
                <textarea id="ticketText" placeholder="Опишите вопрос"></textarea>
                <input id="ticketFile" type="file">
                <button class="primary" onclick="createTicket()">Отправить вопрос</button>
                <div class="status" id="ticketStatus"></div>
                <div class="web-chat" id="webChat" hidden>
                  <div class="web-chat-head">
                    <span>Чат с оператором</span>
                    <button type="button" onclick="loadTicketMessages()">Обновить</button>
                  </div>
                  <div class="web-chat-messages" id="webChatMessages"></div>
                  <div class="web-chat-composer">
                    <textarea id="webChatText" placeholder="Сообщение оператору"></textarea>
                    <button class="primary" type="button" onclick="sendWebChatMessage()">Отправить</button>
                    <input id="webChatFile" type="file">
                  </div>
                </div>
              </div>
            </div>
            <div class="panel">
              <h3>Замена фискального накопителя</h3>
              <div class="form">
                <select id="fnOrg"></select>
                <input id="fnInn" placeholder="ИНН организации">
                <input id="fnCash" placeholder="Заводской номер кассы или описание фото шильдика">
                <select id="fnTerm">
                  <option value="15">ФН на 15 месяцев</option>
                  <option value="36">ФН на 36 месяцев</option>
                </select>
                <input id="fnContact" placeholder="Телефон для связи">
                <button class="primary" onclick="createFnReplacement()">Рассчитать и заказать счет</button>
                <div class="status" id="fnStatus"></div>
              </div>
            </div>
          </div>
        </section>

        <section id="view-register" class="view">
          <div class="section-head">
            <div>
              <h2>Регистрация кассы</h2>
              <p>Веб-анкета для регистрации ККТ. После отправки оператор получит PDF так же, как после анкеты из бота.</p>
            </div>
          </div>
          <div class="panel">
            <div class="form" id="registrationForm"></div>
            <button class="primary" onclick="submitRegistrationForm()">Отправить анкету</button>
            <div class="status" id="registrationStatus"></div>
          </div>
        </section>

        <section id="view-profile" class="view">
          <div class="section-head">
            <div>
              <h2>Организации и кассы</h2>
              <p>Опциональная привязка для постоянных клиентов: кассы, ФН, ОФД и будущие напоминания.</p>
            </div>
          </div>
          <div class="two">
            <div class="panel">
              <h3>Привязать организацию</h3>
              <div class="form">
                <input id="orgName" placeholder="Название организации">
                <div class="row">
                  <input id="orgInn" placeholder="ИНН">
                  <input id="orgKpp" placeholder="КПП">
                </div>
                <button class="primary" onclick="linkOrganization()">Привязать по ИНН</button>
                <div class="status" id="orgStatus"></div>
              </div>
            </div>
            <div class="panel">
              <h3>Мои организации</h3>
              <div id="orgList" class="org-list"></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>

  <script>
    const catalogItems = [
      { title:'АТОЛ 30Ф', tag:'Фискальный регистратор', desc:'Компактная касса для малого бизнеса и рабочих мест с ограниченным пространством.', price:'от 18 900 ₽' },
      { title:'АТОЛ Sigma', tag:'Смарт-терминал', desc:'Готовое решение для розницы: касса, экран, учет и подключение эквайринга.', price:'от 24 900 ₽' },
      { title:'Сканер 2D', tag:'Маркировка', desc:'Сканирование Data Matrix, штрихкодов и маркированной продукции.', price:'от 5 900 ₽' },
      { title:'Платежный терминал', tag:'Эквайринг', desc:'Подбор и подключение терминала для оплаты картой и СБП.', price:'по запросу' },
      { title:'Фискальный накопитель', tag:'ФН 15/36', desc:'Подбор срока действия ФН под систему налогообложения и тип торговли.', price:'по запросу' },
      { title:'ОФД', tag:'Подписка', desc:'Подключение или продление оператора фискальных данных.', price:'по запросу' },
    ];
    const state = { organizations: [], registrationFields: [], activeTicketId: null, chatPollTimer: null };
    const clientIdEl = document.querySelector('#clientId');
    clientIdEl.value = localStorage.getItem('siteClientId') || ('web-' + Math.random().toString(36).slice(2, 10));
    localStorage.setItem('siteClientId', clientIdEl.value);
    state.activeTicketId = Number(localStorage.getItem('siteActiveTicketId:' + clientIdEl.value.trim())) || null;
    clientIdEl.onchange = () => {
      localStorage.setItem('siteClientId', clientIdEl.value.trim());
      state.activeTicketId = Number(localStorage.getItem('siteActiveTicketId:' + clientIdEl.value.trim())) || null;
      loadOrganizations();
      loadActiveTicket();
    };

    function identity(extra = {}) {
      return { platform:'web', chatId:clientIdEl.value.trim(), name:'Клиент сайта', ...extra };
    }
    async function api(path, options = {}) {
      const response = await fetch(path, { ...options, headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });
      const text = await response.text();
      if (!response.ok) throw new Error(text || response.statusText);
      return text ? JSON.parse(text) : null;
    }
    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch]));
    }
    function showView(name) {
      ['shop','service','register','profile'].forEach((item) => {
        document.querySelector('#view-' + item).classList.toggle('active', item === name);
        document.querySelector('#tab-' + item).classList.toggle('active', item === name);
      });
      if (name === 'register') loadRegistrationFields();
      if (name !== 'shop') loadOrganizations();
      if (name === 'service') loadActiveTicket();
    }
    function renderCatalog() {
      catalog.innerHTML = catalogItems.map((item) => '<article class="item"><span class="tag">' + esc(item.tag) + '</span><h3>' + esc(item.title) + '</h3><div class="meta">' + esc(item.desc) + '</div><div class="price">' + esc(item.price) + '</div><button onclick="requestProduct(\\'' + esc(item.title) + '\\')">Запросить счет</button></article>').join('');
    }
    async function loadRegistrationFields() {
      if (state.registrationFields.length) return;
      state.registrationFields = await api('/api/client/registration-fields');
      registrationForm.innerHTML = state.registrationFields.map((field) => {
        const name = esc(field.name);
        const label = esc(field.label);
        const large = field.name === 'bankReqs' || field.name === 'services' || field.name === 'urAdress' || field.name === 'kktAdress';
        return '<label><span class="muted">' + label + '</span>' + (large ? '<textarea data-reg-field="' + name + '" placeholder="' + label + '"></textarea>' : '<input data-reg-field="' + name + '" placeholder="' + label + '">') + '</label>';
      }).join('');
    }
    async function submitRegistrationForm() {
      registrationStatus.textContent = '';
      try {
        await loadRegistrationFields();
        const values = {};
        document.querySelectorAll('[data-reg-field]').forEach((input) => {
          if (input.value.trim()) values[input.dataset.regField] = input.value.trim();
        });
        const orgId = serviceOrg.value ? Number(serviceOrg.value) : undefined;
        const result = await api('/api/client/registrations/form', { method:'POST', body:JSON.stringify(identity({ organizationId:orgId, values })) });
        registrationStatus.textContent = 'Анкета #' + result.data.id + ' отправлена оператору.';
      } catch (error) {
        registrationStatus.innerHTML = '<span class="error">Не удалось отправить анкету</span>';
      }
    }
    async function requestProduct(title) {
      try {
        await api('/api/client/tickets/messages', { method:'POST', body:JSON.stringify(identity({ text:'Интересует товар: ' + title })) });
        clientStatus.textContent = 'Запрос по товару отправлен оператору';
      } catch (error) { clientStatus.innerHTML = '<span class="error">Не удалось отправить запрос</span>'; }
    }
    async function loadOrganizations() {
      try {
        state.organizations = await api('/api/client/organizations?platform=web&chatId=' + encodeURIComponent(clientIdEl.value.trim()));
        renderOrganizations();
      } catch {
        state.organizations = [];
        renderOrganizations();
      }
    }
    function renderOrganizations() {
      const options = '<option value="">Без организации</option>' + state.organizations.map((member) => '<option value="' + member.organizationId + '">' + esc(member.organization.name || member.organization.inn) + '</option>').join('');
      serviceOrg.innerHTML = options;
      ticketOrg.innerHTML = options;
      fnOrg.innerHTML = options;
      orgList.innerHTML = state.organizations.length ? state.organizations.map((member) => '<div class="org-line"><strong>' + esc(member.organization.name || 'Организация') + '</strong><div class="muted">ИНН ' + esc(member.organization.inn) + (member.organization.kpp ? ' · КПП ' + esc(member.organization.kpp) : '') + '</div><button onclick="loadAssets(' + member.organizationId + ')">Кассы и подписки</button><div id="org-assets-' + member.organizationId + '"></div></div>').join('') : '<div class="muted">Организации пока не привязаны</div>';
    }
    async function linkOrganization() {
      try {
        const result = await api('/api/client/organizations/link-by-inn', { method:'POST', body:JSON.stringify(identity({ inn:orgInn.value, kpp:orgKpp.value, organizationName:orgName.value })) });
        orgStatus.textContent = 'Запрос отправлен на проверку. Статус: ' + (result.status || 'pending');
      } catch (error) { orgStatus.innerHTML = '<span class="error">Проверьте ИНН и попробуйте еще раз</span>'; }
    }
    async function loadAssets(organizationId) {
      const holder = document.querySelector('#org-assets-' + organizationId);
      holder.innerHTML = '<div class="muted">Загрузка...</div>';
      try {
        const data = await api('/api/client/organizations/' + organizationId + '/assets?platform=web&chatId=' + encodeURIComponent(clientIdEl.value.trim()));
        holder.innerHTML = '<div class="muted">Касс: ' + data.cashRegisters.length + ' · ФН: ' + data.fiscalDrives.length + ' · ОФД: ' + data.ofdSubscriptions.length + '</div>';
      } catch { holder.innerHTML = '<div class="error">Не удалось загрузить активы</div>'; }
    }
    async function createServiceRequest() {
      serviceStatus.textContent = '';
      try {
        const orgId = serviceOrg.value ? Number(serviceOrg.value) : undefined;
        let result = await api('/api/client/service-requests/start', { method:'POST', body:JSON.stringify(identity({ serviceTypeCode:serviceType.value, organizationId:orgId })) });
        if (result.nextStep && serviceText.value.trim()) {
          result = await api('/api/client/service-requests/' + result.request.id + '/answers', { method:'POST', body:JSON.stringify(identity({ value:serviceText.value.trim(), organizationId:orgId })) });
        }
        if (result.nextStep && serviceContact.value.trim()) {
          result = await api('/api/client/service-requests/' + result.request.id + '/answers', { method:'POST', body:JSON.stringify(identity({ value:serviceContact.value.trim(), organizationId:orgId })) });
        }
        serviceStatus.textContent = !result.nextStep ? 'Заявка создана' : 'Заявка начата, следующий шаг: ' + result.nextStep.label;
      } catch (error) { serviceStatus.innerHTML = '<span class="error">Не удалось создать заявку</span>'; }
    }
    async function createTicket() {
      ticketStatus.textContent = '';
      try {
        const orgId = ticketOrg.value ? Number(ticketOrg.value) : undefined;
        const file = ticketFile.files && ticketFile.files[0];
        let result;
        if (file) {
          const form = new FormData();
          const payload = identity({ organizationId:orgId });
          Object.keys(payload).forEach((key) => {
            if (payload[key] !== undefined) form.append(key, payload[key]);
          });
          form.append('text', ticketText.value);
          form.append('file', file);
          const response = await fetch('/api/client/tickets/media', { method:'POST', body:form });
          if (!response.ok) throw new Error(await response.text() || response.statusText);
          result = await response.json();
        } else {
          result = await api('/api/client/tickets/messages', { method:'POST', body:JSON.stringify(identity({ text:ticketText.value, organizationId:orgId })) });
        }
        rememberActiveTicket(result.data.id);
        ticketText.value = '';
        ticketFile.value = '';
        ticketStatus.textContent = 'Вопрос отправлен оператору';
        await loadTicketMessages();
        startChatPolling();
      } catch (error) { ticketStatus.innerHTML = '<span class="error">Не удалось отправить вопрос</span>'; }
    }
    function rememberActiveTicket(ticketId) {
      state.activeTicketId = Number(ticketId) || state.activeTicketId;
      if (state.activeTicketId) {
        localStorage.setItem('siteActiveTicketId:' + clientIdEl.value.trim(), String(state.activeTicketId));
        webChat.hidden = false;
      }
    }
    async function loadActiveTicket() {
      if (!clientIdEl.value.trim()) return;
      try {
        const result = await api('/api/client/tickets/active?platform=web&chatId=' + encodeURIComponent(clientIdEl.value.trim()));
        if (result.data?.id) {
          rememberActiveTicket(result.data.id);
          await loadTicketMessages();
          startChatPolling();
        } else if (state.activeTicketId) {
          webChat.hidden = false;
          await loadTicketMessages();
          startChatPolling();
        }
      } catch {
        if (state.activeTicketId) {
          webChat.hidden = false;
          await loadTicketMessages();
          startChatPolling();
        }
      }
    }
    async function loadTicketMessages() {
      if (!state.activeTicketId) return;
      const messages = await api('/api/client/tickets/' + state.activeTicketId + '/messages?platform=web&chatId=' + encodeURIComponent(clientIdEl.value.trim()));
      webChat.hidden = false;
      webChatMessages.innerHTML = messages.length ? messages.map(renderWebMessage).join('') : '<div class="muted">Сообщений пока нет</div>';
      webChatMessages.scrollTop = webChatMessages.scrollHeight;
    }
    async function sendWebChatMessage() {
      const text = webChatText.value.trim();
      const file = webChatFile.files && webChatFile.files[0];
      if (!text && !file) return;
      try {
        let result;
        if (file) {
          const form = new FormData();
          const payload = identity({ text });
          Object.keys(payload).forEach((key) => {
            if (payload[key] !== undefined) form.append(key, payload[key]);
          });
          form.append('file', file);
          const response = await fetch('/api/client/tickets/media', { method:'POST', body:form });
          if (!response.ok) throw new Error(await response.text() || response.statusText);
          result = await response.json();
        } else {
          result = await api('/api/client/tickets/messages', { method:'POST', body:JSON.stringify(identity({ text })) });
        }
        rememberActiveTicket(result.data.id);
        webChatText.value = '';
        webChatFile.value = '';
        await loadTicketMessages();
      } catch {
        ticketStatus.innerHTML = '<span class="error">Не удалось отправить сообщение</span>';
      }
    }
    function startChatPolling() {
      if (state.chatPollTimer) return;
      state.chatPollTimer = window.setInterval(() => {
        if (document.querySelector('#view-service').classList.contains('active') && state.activeTicketId) {
          loadTicketMessages().catch(() => {});
        }
      }, 4000);
    }
    function renderWebMessage(message) {
      const side = message.sender === 'operator' ? 'operator' : 'user';
      const title = message.sender === 'operator' ? 'Оператор' : 'Вы';
      const time = message.createdAt ? new Date(message.createdAt).toLocaleString('ru-RU') : '';
      return '<div class="web-message ' + side + '">' + renderWebMessageBody(message) + '<span class="meta">' + title + (time ? ' · ' + esc(time) : '') + '</span></div>';
    }
    function renderWebMessageBody(message) {
      const text = message.text ? esc(message.text) : '';
      const fileUrl = getWebMessageFileUrl(message);
      const safeFileUrl = esc(fileUrl);
      if (message.messageType === 'image' && fileUrl) return '<a href="' + safeFileUrl + '" target="_blank" rel="noopener"><img src="' + safeFileUrl + '" alt=""></a>' + (text ? '<div>' + text + '</div>' : '');
      if (message.messageType === 'video' && fileUrl) return '<video controls src="' + safeFileUrl + '"></video>' + (text ? '<div>' + text + '</div>' : '');
      if ((message.messageType === 'audio' || message.messageType === 'voice') && fileUrl) return '<audio controls src="' + safeFileUrl + '"></audio>' + (text ? '<div>' + text + '</div>' : '');
      if (fileUrl) return '<a href="' + safeFileUrl + '" target="_blank" rel="noopener">' + esc(message.fileName || 'Файл') + '</a>' + (text ? '<div>' + text + '</div>' : '');
      return text || esc(message.fileName || 'Сообщение');
    }
    function getWebMessageFileUrl(message) {
      if (message.localPath) return '/api/client/ticket-messages/' + message.id + '/file?platform=web&chatId=' + encodeURIComponent(clientIdEl.value.trim());
      return message.externalUrl || '';
    }
    async function createFnReplacement() {
      fnStatus.textContent = '';
      try {
        const orgId = fnOrg.value ? Number(fnOrg.value) : undefined;
        let result = await api('/api/client/service-requests/start', { method:'POST', body:JSON.stringify(identity({ serviceTypeCode:'fn_replacement', organizationId:orgId })) });
        const answers = [fnInn.value, fnCash.value, fnTerm.value, fnContact.value];
        for (const value of answers) {
          result = await api('/api/client/service-requests/' + result.request.id + '/answers', { method:'POST', body:JSON.stringify(identity({ value, organizationId:orgId })) });
        }
        const price = result.request.calculatedPrice ? result.request.calculatedPrice + ' ₽' : 'стоимость уточнит оператор';
        result = await api('/api/client/service-requests/' + result.request.id + '/confirm-price', { method:'POST', body:JSON.stringify(identity({ organizationId:orgId })) });
        fnStatus.textContent = 'Заявка #' + result.request.id + ' создана. Стоимость: ' + price + '. Оператор подготовит счет.';
      } catch (error) { fnStatus.innerHTML = '<span class="error">Не удалось создать заявку на замену ФН</span>'; }
    }
    renderCatalog();
    loadOrganizations();
    loadActiveTicket();
  </script>
</body>
</html>`;
