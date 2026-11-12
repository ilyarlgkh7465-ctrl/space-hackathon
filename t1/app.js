/* Пульт руководителя «Фотопринт». Данные и права — только с сервера (/api/pult/…), здесь лишь отображение. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => v == null ? '—' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ') : (Math.round(v * 10) / 10).toLocaleString('ru-RU');
  const fdate = (s) => s ? s.slice(8, 10) + '.' + s.slice(5, 7) : '—';
  const ftime = (s) => s ? fdate(s) + ' ' + s.slice(11, 16) : '—';
  const WORD = { ok: 'в норме', warn: 'внимание', bad: 'критично', none: 'нет данных' };
  const COLOR = { ok: 'var(--ok)', warn: 'var(--warn-fill)', bad: 'var(--bad)', none: 'var(--none)' };
  const chip = (st) => `<span class="chip chip-${st}"><i></i>${WORD[st] || WORD.none}</span>`;
  const ic = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const I = {
    pulse: ic('<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>'),
    sales: ic('<path d="M4 5h2l2.2 10h9.6L20 8H7.2"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
    production: ic('<path d="M3 20V9l6 4V9l6 4V5h6v15z"/><path d="M8 17h2M13 17h2"/>'),
    finance: ic('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 15h2"/>'),
    hr: ic('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><path d="M16 5.2a3 3 0 010 5.6M17.5 14.3c1.9.6 3.1 2.1 3.5 4.7"/>'),
    support: ic('<path d="M4 13v-2a8 8 0 0116 0v2M20 17c0 2-3 3-6 3"/><rect x="3" y="11" width="4" height="6" rx="2"/><rect x="17" y="11" width="4" height="6" rx="2"/>'),
    logistics: ic('<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
    menu: ic('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    report: ic('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
    decisions: ic('<rect x="3" y="4" width="5" height="16" rx="1.6"/><rect x="9.5" y="4" width="5" height="10" rx="1.6"/><rect x="16" y="4" width="5" height="13" rx="1.6"/>'),
    data: ic('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
    search: ic('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    bell: ic('<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    lock: ic('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    close: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
    out: ic('<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h10"/>'),
    spark: ic('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
    send: ic('<path d="M4 12l16-8-6 16-3-6z"/>'),
    dash: ic('<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>'),
  };
  const VIEWS = [
    { id: 'pulse', name: 'Пульс компании', icon: I.pulse, group: 'main' },
    { id: 'mydash', name: 'Мой дашборд', icon: I.dash, group: 'main' },
    { id: 'attention', name: 'Отклонения', icon: I.bell, group: 'work' },
    { id: 'decisions', name: 'Реестр решений', icon: I.decisions, group: 'work' },
    { id: 'data', name: 'Данные и журнал', icon: I.data, group: 'manage' },
  ];
  const CONTOUR_ICONS = { production: I.production, sales: I.sales, support: I.support, logistics: I.logistics, finance: I.finance, hr: I.hr, office: I.report };
  const PAIN_NAV = {
    oneday: 'Выпуск и сроки', queue: 'Очередь на участках', defect: 'Брак и перепечатки', season: 'Мощность на сезон',
    plan: 'План продаж', funnel: 'Потери в воронке', return: 'Повторные покупки', channels: 'Каналы продаж',
    sla: 'Скорость ответа', topics: 'Темы обращений', backlog: 'Открытые обращения', money: 'Возвраты и перепечатки', where: 'Где мой заказ',
    '48h': 'Доставлено', when: 'Опоздания по дням', transit: 'Застряли в пути', regions: 'Сроки по регионам', dock: 'Очередь на отгрузку',
    cash: 'Деньги на счетах', debtors: 'Долги покупателей', margin: 'Потери маржи', pnl: 'План-факт и сверка',
    today: 'Приём и увольнения', attendance: 'Не вышли на смену', vacancies: 'Открытые вакансии', leave: 'Причины увольнений',
    completed: 'Исполнено и просрочено', burn: 'Документы в работе', who: 'Сроки по отделам', kinds: 'Виды документов', claims: 'Претензии клиентов',
  };
  const isContour = (id) => Object.prototype.hasOwnProperty.call(CONTOUR_ICONS, id);
  const STATUSES = ['новое', 'в работе', 'на проверке', 'закрыто'];
  const canDecide = () => S.user && S.user.role !== 'analyst';
  const myViews = () => [
    ...VIEWS.filter((v) => v.id !== 'pulse' || S.user.role !== 'head'),
    ...S.contours.map((c) => ({ ...c, group: 'contours', icon: CONTOUR_ICONS[c.id] })),
  ];
  const defaultView = () => S.user.role === 'head' ? S.user.dept : 'pulse';
  function routeView(params) {
    const id = params.get('v');
    const view = isContour(id) || VIEWS.some((v) => v.id === id && (id !== 'pulse' || S.user.role !== 'head')) ? id : defaultView();
    return { view, pain: isContour(view) && view === id ? params.get('p') : null };
  }
  function routeFilters(params) {
    const days = +params.get('d');
    return { days: [7, 14, 30, 60].includes(days) ? days : 14, product: params.get('product') || '' };
  }
  function viewHash() {
    const params = new URLSearchParams({ v: S.view, d: S.days });
    if (S.pain) params.set('p', S.pain);
    if (S.product) params.set('product', S.product);
    return '#' + params;
  }
  const DEMO = [['director', 'Директор'], ['production', 'Руководитель производства'], ['sales', 'Руководитель продаж'], ['support', 'Руководитель поддержки'], ['logistics', 'Руководитель логистики'], ['finance', 'Руководитель финансов'], ['hr', 'Руководитель по персоналу'], ['office', 'Руководитель делопроизводства'], ['operator', 'Мастер участка'], ['analyst', 'Аналитик']];

  // В приложении помощника (экран «Домой») вход запоминается на устройстве; в браузере — только до закрытия вкладки.
  const keep = window.FP_START ? window.localStorage : window.sessionStorage;
  const store = { get: (k) => { try { return keep.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? (keep.removeItem(k), sessionStorage.removeItem(k)) : keep.setItem(k, v); } catch (e) { /* закрытое окно */ } } };
  const S = { token: store.get('fp-token'), user: null, view: '', pain: null, contours: [], contour: null, openCount: null,
    days: 14, product: '', pulse: null, cache: {}, err: null, chat: [], seq: 0, loadSeq: 0 };

  /* ---------- сервер ---------- */
  class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
  async function api(path, opts = {}) {
    const token = S.token;
    let r;
    try {
      r = await fetch(path, { method: opts.body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { throw new ApiError('Нет связи с сервером. Проверьте сеть и повторите — введённое сохранено.', 0); }
    let data = null;
    try { data = await r.json(); } catch (e) { /* пустой ответ */ }
    if (r.status === 401 && path !== '/api/login') { if (token === S.token) logout(true); throw new ApiError('Сеанс закончился, войдите снова', 401); }
    if (!r.ok) throw new ApiError((data && data.error) || 'Сервер ответил ошибкой ' + r.status, r.status);
    return data;
  }
  const q = () => `days=${S.days}${S.product ? '&product=' + encodeURIComponent(S.product) : ''}`;
  async function cached(key, path) {
    const k = key + '|' + q();
    const cache = S.cache;
    if (!cache[k]) cache[k] = api(path).catch((e) => { delete cache[k]; throw e; });
    return cache[k];
  }
  const drill = (kpi, by) => cached(`drill:${kpi}:${by}`, `/api/pult/drill?kpi=${kpi}&by=${by}&${q()}`);
  const why = (kpi) => cached(`why:${kpi}`, `/api/pult/why?kpi=${kpi}&${q()}`);
  function toast(text, action) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(text)}</span>${action ? `<button class="btn btn-sm">${esc(action.label)}</button>` : ''}`;
    if (action) $('button', el).onclick = () => { el.remove(); action.run(); };
    $('#toasts').append(el);
    setTimeout(() => el.remove(), action ? 9000 : 4200);
  }

  /* ---------- вход ---------- */
  function renderLogin(msg = '') {
    $('#layer').innerHTML = '';
    $('#app').innerHTML = `<main class="login"><form class="glass login-card" id="loginForm" autocomplete="off">
      <span class="logo" aria-hidden="true">Ф</span>
      <div><p class="eyebrow">Фотопринт · единая система</p><h1>${window.FP_START === 'assistant' ? 'Помощник руководителя' : 'Пульт руководителя'}</h1></div>
      <p class="muted">${window.FP_START === 'assistant' ? 'Спросите голосом или текстом — ответ по данным вашей роли. Данные тестовые.' : 'Состояние компании, причины отклонений и ответственные — в одном окне. Данные тестовые.'}</p>
      <label class="field">Логин<input class="input" name="login" required autocapitalize="none" spellcheck="false"></label>
      <label class="field">Пароль<input class="input" name="password" type="password" required></label>
      <p class="err" role="alert">${esc(msg)}</p>
      <button class="btn btn-primary" type="submit">Войти</button>
      <div><p class="eyebrow" style="margin-bottom:8px">Тестовые роли</p><div class="roles">${DEMO.map(([l, n]) => `<button type="button" class="btn btn-sm" data-demo="${l}">${n}</button>`).join('')}</div></div>
    </form></main>`;
    const f = $('#loginForm');
    $$('[data-demo]', f).forEach((b) => b.onclick = () => { f.login.value = b.dataset.demo; f.password.value = 'demo2026'; f.requestSubmit(); });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', f);
      btn.disabled = true;
      try {
        const d = await api('/api/login', { body: { login: f.login.value.trim(), password: f.password.value } });
        S.token = d.token; S.user = d.user; store.set('fp-token', d.token);
        start();
      } catch (err) { $('.err', f).textContent = err.message; btn.disabled = false; }
    };
    f.login.focus();
  }
  function logout(silent) {
    if (!silent) history.replaceState(null, '', location.pathname + location.search);
    S.seq++; S.loadSeq++;
    S.token = null; S.user = null; S.started = false; S.pulse = null; S.cache = {}; S.chat = []; S.contours = []; S.contour = null; S.openCount = null; S.draft = null;
    if (window.Studio) { window.Studio.close(); window.Studio.reset(); }
    clearInterval(S.timer);
    store.set('fp-token', null);
    renderLogin(silent ? 'Сеанс закончился, войдите снова' : '');
  }

  /* ---------- каркас ---------- */
  async function start() {
    if (!S.token) return renderLogin();
    try { S.user = await api('/api/me'); } catch (e) { if (e.code !== 401) renderLogin(e.message); return; }
    if (S.user.role === 'operator') return renderMy();
    if (!['director', 'head', 'analyst'].includes(S.user.role)) {
      $('#app').innerHTML = `<main class="login"><div class="glass login-card"><span class="logo" aria-hidden="true">Ф</span><h1>Пульт — для руководителей</h1>
        <p class="muted">Вы вошли как «${esc(S.user.title)}». Для операционной команды есть экран участка с очередью и отметками этапов.</p>
        <a class="btn btn-primary" href="/t2/admin.html">Открыть экран участка</a><button class="btn" id="lo">Выйти</button></div></main>`;
      $('#lo').onclick = () => logout();
      return;
    }
    const params = new URLSearchParams(location.hash.slice(1));
    Object.assign(S, routeView(params), routeFilters(params));
    renderShell();
    load();
    if (window.FP_START === 'assistant' && !S.started) { S.started = true; window.Studio.open(); }   // приложение помощника открывается сразу на нём
  }
  function renderShell() {
    const initials = S.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
    $('#app').innerHTML = `<div class="shell">
      <button class="nav-scrim" id="navScrim" type="button" aria-label="Закрыть меню" hidden></button>
      <aside class="rail" id="rail" aria-label="Разделы">
        <a class="rail-brand" href="/" aria-label="Фотопринт, все разделы системы"><span class="logo" aria-hidden="true">Ф</span>Фотопринт</a>
        <div class="rail-profile">
          <span class="avatar" aria-hidden="true">${esc(initials)}</span>
          <div><strong>${esc(S.user.name)}</strong><small>${esc(S.user.title)}</small></div>
          <button class="rail-out" id="navLogout" type="button" aria-label="Выйти" title="Выйти">${I.out}</button>
          <button class="rail-close" id="navClose" type="button" aria-label="Закрыть меню">${I.close}</button>
        </div>
        <nav class="rail-nav" id="nav" aria-label="Навигация"></nav>
      </aside>
      <div class="stage">
        <header class="topbar glass" id="topbar"></header>
        <main class="view" id="view" tabindex="-1"></main>
      </div>
    </div>
    <button class="btn fab" id="fab">${window.Studio.orbHtml('xs')} Помощник</button>`;
    $('#nav').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setMenu(false);
      if (b.dataset.view) go(b.dataset.view);
      if (b.dataset.jump) go(S.view, b.dataset.jump);
      if (b.dataset.rail === 'report') openReport();
      if (b.dataset.rail === 'logout') logout();
    };
    $('#navScrim').onclick = $('#navClose').onclick = () => setMenu(false);
    $('#navLogout').onclick = () => logout();
    $('#fab').onclick = () => openChat();
    renderNav();
    renderTop();
    clearInterval(S.timer);
    S.timer = setInterval(async () => {
      if (document.hidden || $('#layer').innerHTML || !S.pulse?.app || !['sales', 'production'].includes(S.view)) return;
      const token = S.token, query = q(), view = S.view, pulse = S.pulse;
      try {
        const a = await api('/api/pult/app?' + query), sig = appSig(a);
        if (token !== S.token || query !== q() || view !== S.view || pulse !== S.pulse || sig === S.appSig) return;
        S.appSig = sig;
        S.pulse.app = a;
        const live = $('#liveApp');
        if (live) {
          live.innerHTML = view === 'sales' ? liveSales(a) : liveProd(a);
          toast('Пришли новые данные из приложения');
        }
      } catch (e) { /* Повторим при следующем обновлении. */ }
    }, 6000);
  }
  function setMenu(open) {
    const rail = $('#rail'), toggle = $('#navToggle');
    if (!rail || !toggle) return;
    const wasOpen = rail.classList.contains('is-open');
    rail.classList.toggle('is-open', open);
    $('#navScrim').hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => { if (rail.classList.contains('is-open')) $('#navClose')?.focus(); });
    else if (wasOpen) toggle.focus();
  }
  function renderNav() {
    const nav = $('#nav');
    if (!nav) return;
    const entries = myViews();
    const group = (id, label, extra = '', sub = '') => {
      const links = entries.filter((v) => v.group === id).map((v) => {
        const count = v.id === 'attention' ? S.pulse?.alerts.length : v.id === 'decisions' ? S.openCount : 0;
        const current = v.id === S.view && !S.pain ? ' aria-current="page"' : '';
        return `<button class="rail-btn" data-view="${v.id}"${current}>${v.icon}<span>${esc(v.name)}</span>${count ? `<b class="rail-count">${count}</b>` : ''}</button>${v.id === S.view ? sub : ''}`;
      }).join('') + extra;
      return links ? `<div class="rail-group">${label ? `<p>${label}</p>` : ''}${links}</div>` : '';
    };
    const contour = S.contour?.dept === S.view ? S.contour : null;
    const sub = contour ? `<div class="rail-sub">${contour.pains.map((p) => `<button class="rail-btn rail-subbtn" data-jump="${esc(p.id)}"${p.id === S.pain ? ' aria-current="page"' : ''}>
      <span class="rail-dot st-${['bad', 'warn'].includes(p.status) ? p.status : 'none'}" role="img" aria-label="${WORD[p.status] || ''}"></span><span>${esc(PAIN_NAV[p.id] || p.title)}</span></button>`).join('')}</div>` : '';
    const departments = group('contours', S.user.role === 'head' ? '' : 'Отделы', '', sub);
    const work = group('work', '');
    nav.innerHTML = group('main', '') + (S.user.role === 'head' ? departments + work : work + departments)
      + group('manage', '', `<button class="rail-btn" data-rail="report"${S.pulse ? '' : ' disabled'}>${I.report}<span>Отчёт за период</span></button>`);
  }
  function renderTop() {
    const p = S.pulse;
    const open = $('#rail').classList.contains('is-open');
    $('#topbar').innerHTML = `<button class="btn btn-icon nav-toggle" id="navToggle" aria-label="Меню" aria-controls="rail" aria-expanded="${open}">${I.menu}</button>
      <button class="search" id="openPal" aria-label="Поиск и команды"${p ? '' : ' disabled'}>${I.search}<span>Поиск</span><kbd>⌘K</kbd></button>
      <span class="spacer"></span>
      <div class="seg" role="group" aria-label="Период">${[7, 14, 30, 60].map((d) => `<button data-days="${d}" aria-pressed="${S.days === d}">${d} дн.</button>`).join('')}</div>
      <select class="select" id="fProduct" aria-label="Продукт"><option value="">Все продукты</option>${p ? p.products.map((x) => `<option value="${esc(x.id)}" ${S.product === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('') : ''}</select>
      <time class="data-stamp" title="Данные обновлены">${p ? ftime(p.asof) : 'Загрузка…'}</time>
      ${canDecide() ? `<button class="btn" id="newDec"${p ? '' : ' disabled'}>${I.plus.replace('<svg', '<svg width="16" height="16"')} Новое решение</button>` : ''}`;
    $('#navToggle').onclick = () => setMenu(!$('#rail').classList.contains('is-open'));
    $('#openPal').onclick = openPalette;
    $$('[data-days]').forEach((b) => b.onclick = () => { S.days = +b.dataset.days; reload(); });
    $('#fProduct').onchange = (e) => { S.product = e.target.value; reload(); };
    if ($('#newDec')) $('#newDec').onclick = () => openDecisionForm({});
  }
  function go(view, pain = null) {
    if (!myViews().some((v) => v.id === view)) return;
    if (S.view !== view || S.pain !== pain) {
      S.view = view;
      S.pain = pain;
      history.pushState(null, '', viewHash());
      renderNav(); renderTop(); renderView();
    }
    $('#view').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => {
    if (!$('#view') || !S.user) return;
    const params = new URLSearchParams(location.hash.slice(1));
    Object.assign(S, routeView(params));
    const filters = routeFilters(params);
    if (filters.days !== S.days || filters.product !== S.product) {
      Object.assign(S, filters);
      load();
    } else { renderNav(); renderTop(); renderView(); }
    window.scrollTo(0, 0);
  });
  function reload() {
    S.cache = {};
    history.replaceState(null, '', viewHash());
    load();
  }
  async function refreshDecisionCount() {
    const token = S.token, cache = S.cache;
    try {
      const decisions = await cached('decisions', '/api/pult/decisions');
      if (token !== S.token || cache !== S.cache) return;
      S.openCount = decisions.filter((d) => d.status !== 'закрыто').length;
      const link = $('#nav [data-view="decisions"]');
      if (link) {
        $('.rail-count', link)?.remove();
        if (S.openCount) link.insertAdjacentHTML('beforeend', `<b class="rail-count">${S.openCount}</b>`);
      }
    } catch (e) { /* Реестр покажет ошибку при открытии. */ }
  }
  async function load() {
    const seq = ++S.loadSeq;
    S.seq++;
    S.err = null;
    S.pulse = null;
    renderTop();
    $('#view').innerHTML = '<div class="skel" role="status" aria-label="Загрузка данных"></div>';
    try {
      const [pulse, contours, decisions] = await Promise.all([api('/api/pult/pulse?' + q()), api('/api/pult/contours?' + q()), api('/api/pult/decisions').catch(() => [])]);
      if (seq !== S.loadSeq) return;
      S.pulse = pulse;
      S.decisions = Array.isArray(decisions) ? decisions : [];      // решения в работе — узлы-задачи на «Пульсе»
      S.appSig = appSig(pulse.app);
      S.contours = contours;
    } catch (e) {
      if (seq !== S.loadSeq) return;
      S.err = e;
    }
    renderNav(); renderTop(); renderView();
    if (S.pulse) refreshDecisionCount();
  }
  function errorBox(e, retry = 'load') {
    return `<div class="glass state"><h2>${e.code === 403 ? 'Нет доступа' : 'Не получилось загрузить данные'}</h2><p class="muted">${esc(e.message)}</p>
      ${e.code === 403 ? '<p class="faint">Раздел закрыт для вашей роли. Попытка записана в журнал.</p>' : `<button class="btn btn-primary" data-act="${retry}">Повторить</button>`}</div>`;
  }

  /* ---------- графики ---------- */
  function spark(series, st) {
    const pts = series.map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length < 2) return '';
    const ys = pts.map((p) => p[1]), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
    const X = (i) => 3 + (i / (series.length - 1)) * 102, Y = (v) => 26 - ((v - min) / span) * 22;
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 108 30" aria-hidden="true"><path d="${d}" fill="none" stroke="${COLOR[st] || 'var(--ink3)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="2.6" fill="${COLOR[st] || 'var(--ink3)'}"/></svg>`;
  }
  function lineChart(k, gradient = 'chart-area') {
    const W = 520, H = 190, L = 44, R = 12, T = 14, B = 26;
    const vals = k.series.filter((v) => v != null).concat(k.plan != null && k.unit !== 'BYN' && k.unit !== 'чел.' ? [k.plan] : []);
    if (vals.length < 2) return '';
    let min = Math.min(...vals), max = Math.max(...vals); const pad = (max - min || 1) * 0.15; min -= pad; max += pad;
    const n = k.series.length, X = (i) => L + (i / Math.max(1, n - 1)) * (W - L - R), Y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
    const pts = k.series.map((v, i) => [i, v]).filter((p) => p[1] != null);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const area = path + ` L${X(pts[pts.length - 1][0]).toFixed(1)} ${H - B} L${X(pts[0][0]).toFixed(1)} ${H - B} Z`;
    const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
    const showPlan = k.plan != null && k.unit !== 'BYN' && k.unit !== 'чел.';
    const step = Math.max(1, Math.ceil(n / 6));
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Динамика показателя «${esc(k.name)}» по дням">
      <defs><linearGradient id="${gradient}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--brand)" stop-opacity=".55"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="var(--edge)"/><text x="${L - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink4)" font-family="JetBrains Mono">${fmt(t)}</text>`).join('')}
      ${showPlan ? `<line x1="${L}" x2="${W - R}" y1="${Y(k.plan).toFixed(1)}" y2="${Y(k.plan).toFixed(1)}" stroke="var(--ink3)" stroke-dasharray="5 5" opacity=".7"/><text x="${W - R}" y="${(Y(k.plan) - 6).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink3)">план ${fmt(k.plan)}</text>` : ''}
      <path d="${area}" fill="url(#${gradient})"/><path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.4" fill="var(--ink)"><title>${k.labels[p[0]]}: ${fmt(p[1])} ${k.unit}</title></circle>`).join('')}
      ${k.labels.map((l, i) => i % step === 0 ? `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--ink4)" font-family="JetBrains Mono">${l}</text>` : '').join('')}
    </svg>`;
  }
  function bars(rows, unit, opts = {}) {
    const max = Math.max(...rows.map((r) => Math.abs(r.value || 0)), 1e-9);
    return `<div class="bars">${rows.map((r, i) => `<div class="bar"><span>${esc(r.name)}${r.count != null && opts.count !== false ? ` <small>· ${fmt(r.count)}</small>` : ''}</span>
      <span class="tr"><i class="${opts.calm ? 'calm' : ''}" style="width:${Math.max(2, (Math.abs(r.value || 0) / max) * 100).toFixed(1)}%;animation-delay:${i * 40}ms"></i></span>
      <b>${fmt(r.value)} ${esc(r.unit || unit || '')}</b>
      ${r.extra || r.delta != null ? `<small class="bar-detail">${r.delta != null ? `К прошлому периоду: ${r.delta > 0 ? '+' : ''}${fmt(r.delta)} %` : ''}${r.delta != null && r.extra ? ' · ' : ''}${esc(r.extra)}</small>` : ''}</div>`).join('')}</div>`;
  }

  /* ---------- пульс компании: граф ----------
     В центре — компания, вокруг — её сферы. Цвет узла — состояние: чёрный в норме, жёлтый — внимание, красный — критично.
     Наведение на сферу приближает её и раскрывает то, что в ней происходит: показатели, решения в работе и то, что ещё никому не поручено. */
  const GRAPH = { W: 1000, H: 640, cx: 500, cy: 320, zoom: 1.15 };
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
  function graphKids(p, n) {
    if (n.locked) return [];
    const ids = n.kpis || [n.kpi], out = [];
    const open = (S.decisions || []).filter((d) => d.status !== 'закрыто' && ids.includes(d.kpi));
    const kp = ids.map((id) => p.kpis.find((x) => x.id === id)).filter((k) => k && !k.locked);
    for (const k of kp) out.push({ t: 'kpi', id: k.id, st: k.status, name: k.name, sub: `${fmt(k.value)} ${k.unit} · план ${fmt(k.plan)}` });
    for (const d of open) out.push({ t: 'task', id: d.id, st: d.overdue ? 'bad' : 'ok', name: d.title, sub: `${d.owner} · ${d.overdue ? 'срок прошёл' : 'до'} ${String(d.due || '').slice(8, 10)}.${String(d.due || '').slice(5, 7)}` });
    for (const k of kp) if (k.status === 'bad' && !open.some((d) => d.kpi === k.id)) out.push({ t: 'add', id: k.id, st: 'none', name: 'Назначить решение', sub: k.name });
    return out.slice(0, 7);
  }
  function mapSvg(p) {
    const { W, H, cx, cy } = GRAPH, n = p.flow.length;
    const hubs = p.flow.map((f, i) => {
      const a = (-90 + i * 360 / n) * Math.PI / 180, far = i % 2 === 0 ? 1 : 0.72;
      const kids = graphKids(p, f), bad = kids.filter((k) => k.t === 'kpi' && k.st !== 'ok').length;
      return Object.assign({}, f, { i, a, x: cx + 352 * far * Math.cos(a), y: cy + 226 * far * Math.sin(a), r: f.locked ? 7 : 10 + Math.min(3, bad) * 2.5, kids, side: Math.cos(a) >= -0.15 ? 1 : -1 });
    });
    const dot = (st) => `fill="${COLOR[st] || COLOR.none}"`;
    const total = p.pulse.critical + p.pulse.warn;
    const coreWord = p.pulse.critical ? 'ждут решения' : p.pulse.warn ? 'на контроле' : 'всё в норме';
    const kidAttr = (k) => (k.t === 'kpi' ? `data-kpi="${k.id}"` : k.t === 'task' ? `data-decision="${k.id}"` : `data-decide="${k.id}"`);
    const kidWord = { kpi: 'Показатель', task: 'Решение в работе', add: 'Действие' };
    const kids = (h) => {
      const m = h.kids.length; if (!m) return '';
      return `<g class="kids" data-kids="${h.i}" transform="translate(${h.x.toFixed(1)} ${h.y.toFixed(1)})">${h.kids.map((k, j) => {
        const o = j - (m - 1) / 2, ox = h.side * 92, oy = o * 40, ca = h.a + o * 0.5, cd = h.r + 9 + (j % 2) * 6;
        return `<path class="klnk" pathLength="1" style="--d:${120 + j * 50}ms" d="M0 0 C${(ox * 0.55).toFixed(1)} 0 ${(ox * 0.45).toFixed(1)} ${oy.toFixed(1)} ${ox} ${oy.toFixed(1)}"/>
          <g class="kid k-${k.t} st-k-${k.st}" role="button" tabindex="-1" ${kidAttr(k)} aria-label="${kidWord[k.t]}: ${esc(k.name)}. ${esc(k.sub)}"
            style="--cx:${(Math.cos(ca) * cd).toFixed(1)}px;--cy:${(Math.sin(ca) * cd).toFixed(1)}px;--ox:${ox}px;--oy:${oy.toFixed(1)}px;--d:${120 + j * 50}ms">
            <rect class="khit" x="${h.side > 0 ? -10 : -236}" y="-18" width="246" height="36" rx="10"/>
            <circle r="5.5" ${k.t === 'kpi' ? dot(k.st) : ''}/>${k.t === 'add' ? '<path class="kplus" d="M-2.6 0H2.6M0 -2.6V2.6"/>' : ''}
            <text class="kn" x="${h.side * 13}" y="-2" text-anchor="${h.side > 0 ? 'start' : 'end'}">${esc(cut(k.name, 34))}</text>
            <text class="ks" x="${h.side * 13}" y="12" text-anchor="${h.side > 0 ? 'start' : 'end'}">${esc(cut(k.sub, 40))}</text><title>${esc(k.name)} — ${esc(k.sub)}</title></g>`;
      }).join('')}</g>`;
    };
    return `<div class="pulse-stage" id="pulseStage"><svg id="map" viewBox="0 0 ${W} ${H}" role="group" aria-label="Пульс компании: ${n} сфер вокруг компании"><g id="mapWorld">
      ${hubs.slice(0, 8).map((h, i, arr) => (i ? `<line class="chain" x1="${arr[i - 1].x.toFixed(1)}" y1="${arr[i - 1].y.toFixed(1)}" x2="${h.x.toFixed(1)}" y2="${h.y.toFixed(1)}"/>` : '')).join('')}
      ${hubs.map((h) => `<line class="lnk" data-l="${h.i}" x1="${cx}" y1="${cy}" x2="${h.x.toFixed(1)}" y2="${h.y.toFixed(1)}"/>`).join('')}
      <g class="core" tabindex="0" role="button" data-core aria-label="Пульс компании: ${total} ${coreWord}. Открыть все отклонения">
        <circle class="beat" cx="${cx}" cy="${cy}" r="56"/><circle class="beat b2" cx="${cx}" cy="${cy}" r="56"/>
        <circle class="core-dot" cx="${cx}" cy="${cy}" r="52"/>
        <text class="core-v" x="${cx}" y="${cy + 6}" text-anchor="middle">${total}</text>
        <text class="core-s" x="${cx}" y="${cy + 25}" text-anchor="middle">${coreWord}</text></g>
      ${hubs.map((h) => `<g class="hub st-h-${h.status}${h.locked ? ' locked' : ''}" tabindex="0" role="button" data-node="${h.kpi}" data-i="${h.i}" data-x="${h.x.toFixed(1)}" data-y="${h.y.toFixed(1)}" data-side="${h.side}" data-m="${h.kids.length}" data-r="${h.r.toFixed(1)}" data-w="${Math.round(Math.max(60, ...h.kids.map((k) => Math.max(cut(k.name, 34).length * 7.1, cut(k.sub, 40).length * 6.1))))}"
          aria-label="${esc(h.name)}: ${h.locked ? 'закрыто для вашей роли' : WORD[h.status] + '. ' + esc(h.lines.join('. '))}">
        <circle class="hit" cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="${(h.r + 18).toFixed(1)}"/>
        <circle class="halo" cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="${(h.r + 7).toFixed(1)}"/>
        <circle class="dot" cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="${h.r.toFixed(1)}" ${dot(h.status)}/>
        <text class="nm" x="${h.x.toFixed(1)}" y="${(h.y + h.r + 21).toFixed(1)}" text-anchor="middle">${esc(h.name)}</text>
        <text class="ln" x="${h.x.toFixed(1)}" y="${(h.y + h.r + 37).toFixed(1)}" text-anchor="middle">${h.locked ? 'закрыто для вашей роли' : esc(h.lines[h.lines.length - 1] || WORD[h.status])}</text></g>`).join('')}
      ${hubs.map(kids).join('')}
    </g></svg></div>
    <div class="flow-list">${p.flow.map((f) => `<button class="glass-flat flow-item" data-node="${f.kpi}"><span class="no st-n-${f.status}" style="background:${COLOR[f.status]}">${f.n}</span><span><b>${esc(f.name)}</b> · <span class="st-${f.status}">${WORD[f.status]}</span><small>${esc(f.locked ? 'детали закрыты для вашей роли' : f.lines.join(' · '))}</small></span></button>`).join('')}</div>`;
  }
  let mapOn = null, mapTouch = false, mapLock = 0, mapOpenT = 0, mapCloseT = 0;
  function graphOpen(i) {
    const svg = $('#map'), hub = $(`#map .hub[data-i="${i}"]`);
    if (!svg || !hub || mapOn === hub || hub.classList.contains('locked')) return;
    graphClose(true);
    mapOn = hub;
    mapLock = performance.now() + 380;       // пока картинка едет, соседний узел может проехать под неподвижным курсором — его не открываем
    hub.classList.add('is-on'); svg.classList.add('has-focus');
    $(`#map .lnk[data-l="${i}"]`)?.classList.add('is-on');
    const kids = $(`#map .kids[data-kids="${i}"]`);
    if (kids) { kids.classList.add('is-open'); $$('.kid', kids).forEach((k) => k.setAttribute('tabindex', '0')); }
    /* Камера. Сфера приближается на месте — узел остаётся под курсором — и сдвигается только настолько, чтобы раскрытые задачи
       поместились в кадр. Двигается весь рисунок целиком (преобразование самого svg): так браузер ведёт движение плавно, без перерисовки. */
    const { W, H, zoom: z } = GRAPH, x = +hub.dataset.x, y = +hub.dataset.y, side = +hub.dataset.side, m = +hub.dataset.m, r = +hub.dataset.r, lw = 92 + 16 + (+hub.dataset.w || 240);
    const half = Math.max((m - 1) * 20 + 26, r + 12), pad = 14;
    const box = { l: side > 0 ? -76 : -lw, r: side > 0 ? lw : 76, t: -half, b: Math.max(half, r + 48) };
    let tx = x, ty = y;
    if (tx + z * box.r > W - pad) tx = W - pad - z * box.r;
    if (tx + z * box.l < pad) tx = pad - z * box.l;
    if (ty + z * box.b > H - pad) ty = H - pad - z * box.b;
    if (ty + z * box.t < pad) ty = pad - z * box.t;
    const cs = getComputedStyle(svg), cw = parseFloat(cs.width) || W, ch = parseFloat(cs.height) || H;
    const k = Math.min(cw / W, ch / H), ox = (cw - W * k) / 2, oy = (ch - H * k) / 2;       // единицы рисунка → пиксели
    svg.style.transform = `translate(${(ox + tx * k - z * (ox + x * k)).toFixed(1)}px, ${(oy + ty * k - z * (oy + y * k)).toFixed(1)}px) scale(${z})`;
  }
  function graphClose(keep) {
    $$('#map .is-on').forEach((x) => x.classList.remove('is-on'));
    $$('#map .kids.is-open').forEach((g) => { g.classList.remove('is-open'); $$('.kid', g).forEach((k) => k.setAttribute('tabindex', '-1')); });
    mapOn = null;
    if (keep) return;
    const svg = $('#map'); if (svg) { svg.classList.remove('has-focus'); svg.style.transform = ''; }
  }
  const hideMapCard = () => { clearTimeout(mapOpenT); clearTimeout(mapCloseT); graphClose(); };
  const showMapCard = (el) => graphOpen(+el.dataset.i);
  function fitMap() { /* подписи графа не требуют подгонки */ }
  /* Наведение с небольшой задержкой: проведя мышью через несколько сфер, граф не дёргается — открывается та, на которой курсор остановился. */
  function graphLater(i) {
    clearTimeout(mapOpenT); clearTimeout(mapCloseT);
    const wait = Math.max(mapOn ? 140 : 70, mapLock - performance.now() + 20);
    mapOpenT = setTimeout(() => { if ($(`#map .hub[data-i="${i}"]:hover`)) graphOpen(i); }, wait);
  }
  document.addEventListener('pointerover', (e) => {
    mapTouch = e.pointerType === 'touch';
    if (mapTouch || !e.target.closest) return;
    const hub = e.target.closest('#map .hub');
    if (hub) { clearTimeout(mapCloseT); if (hub !== mapOn) graphLater(+hub.dataset.i); return; }
    clearTimeout(mapOpenT);
    if (!mapOn) return;
    clearTimeout(mapCloseT);
    if (!e.target.closest('#pulseStage')) mapCloseT = setTimeout(() => graphClose(), 260);                 // ушли с карты
    else if (e.target.closest('#map .core')) mapCloseT = setTimeout(() => { if ($('#map .core:hover')) graphClose(); }, 200);   // вернулись к центру
  });
  document.addEventListener('focusin', (e) => { const hub = e.target.closest && e.target.closest('#map .hub'); if (hub) graphOpen(+hub.dataset.i); });

  /* ---------- плитки и отклонения ---------- */
  function kpiTile(k, fromPulse = false) {
    if (k.locked) return `<div class="glass-flat kpi locked" aria-label="${esc(k.name)}: ${WORD[k.status]}, значение закрыто"><div class="kpi-top"><span class="kpi-name">${esc(k.name)}</span>${chip(k.status)}</div>
      <div class="lock-note">${I.lock}<span>${esc(k.dept_name)} — значения закрыты для вашей роли</span></div></div>`;
    return `<button class="glass-flat kpi" ${fromPulse ? 'data-company-kpi' : 'data-kpi'}="${k.id}"><div class="kpi-top"><span class="kpi-name">${esc(k.name)}</span></div>
      <div class="kpi-val"><b>${fmt(k.value)}</b><span>${esc(k.unit)}</span></div>
      <div class="kpi-trend">${spark(k.series, k.status)}</div>
      <div class="kpi-context">${k.plan == null ? '' : `<span class="kpi-meta">План ${fmt(k.plan)} ${esc(k.unit)}</span>`}
        ${k.status !== 'ok' && k.status !== 'none' ? chip(k.status) : ''}</div></button>`;
  }
  function deptCards(p) {
    return `<section class="depts" aria-label="Отделы">${p.departments.map((c) =>
      `<button class="glass-flat dept" data-go="${c.id === 'service' ? 'support' : c.id}"><header><h3>${esc(c.name)}</h3>${chip(c.status)}</header>
        <ul>${c.metrics.map(([label, value]) => `<li><b>${esc(value)}</b><span>${esc(label)}</span></li>`).join('')}</ul></button>`).join('')}</section>`;
  }
  function signalList(alerts) {
    return alerts.length ? `<ul class="signal-list">${alerts.map((a) => `<li><button type="button" class="signal-row" data-kpi="${a.kpi}" data-by="${a.by}">
      <span class="signal-text"><strong>${esc(a.title)}</strong><small>${esc(a.dept_name)} · ${esc(a.owner)}</small></span>
      ${chip(a.level)}<span class="signal-arrow" aria-hidden="true">›</span></button></li>`).join('')}</ul>`
      : '<p class="signal-empty">Отклонений за выбранный период нет.</p>';
  }
  function overviewQueue(b) {
    if (!b || b.ok) return '';
    return `<section class="glass-flat overview-queue"><h2 class="sec-title">Узкое место сейчас</h2>
      <div class="queue-body"><h3>${esc(b.name)}</h3>
      <p>В очереди ${fmt(b.count)}, дольше нормы — ${fmt(b.stuck)}.${b.clear_h == null ? '' : ` Оценка разбора очереди · ${fmt(b.clear_h)} ч.`}</p>
      <details class="queue-detail"><summary>Подробности</summary><p>${esc(b.text)}</p>${b.advice ? `<p>${esc(b.advice)}</p>` : ''}
        <p class="src">${esc(b.source)} · ${ftime(b.asof)}</p>
        ${canDecide() ? '<button class="btn btn-sm" data-act="bneckDecide">Оформить решение</button>' : ''}</details>
      <button class="btn btn-sm" data-kpi="on_time" data-by="stage">Открыть очередь</button></div></section>`;
  }
  /* Живые данные мобильного приложения: заказ, оформленный с телефона, виден здесь через несколько секунд. */
  const mins = (v) => v == null ? '—' : v < 1 ? 'меньше 1' : fmt(v);
  const appSig = (a) => a ? JSON.stringify([a.sessions, a.orders, a.stages, a.people, a.funnel, a.support]) : '';
  function liveSales(a) {
    if (!a?.see?.sales) return '';
    const o = a.orders;
    return `<section class="glass panel"><header><h2>Приложение picPac — живые данные</h2><span class="chip live"><i></i>обновляется само</span><span class="spacer"></span><a class="btn btn-sm" href="/t2/" target="_blank" rel="noopener">Открыть приложение</a></header>
      <div class="grid2"><div><p class="eyebrow" style="margin-bottom:10px">Воронка за ${a.days} дн. · дошли до заказа ${fmt(a.conversion)} %</p>
          ${funnel(a.funnel)}${a.drop ? `<p class="note" style="margin-top:12px">${esc(a.drop)}</p>` : ''}</div>
        <div><p class="eyebrow" style="margin-bottom:10px">Заказы: ${fmt(o.count)} на ${fmt(o.total)} BYN · в работе ${fmt(o.in_work)}</p>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Заказ</th><th>Когда</th><th>Этап</th><th class="n">Оформлен за</th><th class="n">Сумма, BYN</th></tr></thead><tbody>
          ${o.list.map((x) => `<tr><td class="num">${esc(x.number)}</td><td class="num">${ftime(x.ts)}</td><td>${esc(x.stage)} <span class="faint">${esc(x.stage_status)}</span></td><td class="n">${x.time_sec ? fmt(x.time_sec) + ' с' : '—'}</td><td class="n">${fmt(x.total)}</td></tr>`).join('') || '<tr><td colspan="5" class="faint">Заказов из приложения пока нет</td></tr>'}</tbody></table></div></div></div>
      <p class="src">Обращений из приложения: ${a.support.count}, открыто ${a.support.open}, привязано к заказу ${a.support.linked}. Источник: ${esc(a.source)}. Данные на ${ftime(a.asof)}.</p></section>`;
  }
  function liveProd(a) {
    if (!a?.see?.prod) return '';
    const st = Object.fromEntries(a.orders.by_stage.map((x) => [x.id, x]));
    return `<section class="glass panel"><header><h2>Заказы из приложения: этапы и отметки</h2><span class="chip live"><i></i>обновляется само</span><span class="spacer"></span><a class="btn btn-sm" href="/t2/admin.html" target="_blank" rel="noopener">Экран участка</a></header>
      <div class="grid2"><div class="scroll-x"><table class="tbl"><thead><tr><th>Этап</th><th class="n">Сейчас</th><th class="n">В работе</th><th class="n">Пройдено</th><th class="n">Ждал, мин</th><th class="n">Работа, мин</th><th class="n">Брак</th></tr></thead><tbody>
          ${a.stages.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${(st[x.id] || {}).count || 0}</td><td class="n">${(st[x.id] || {}).started || 0}</td><td class="n">${x.passed}</td><td class="n">${mins(x.wait_min)}</td><td class="n">${mins(x.work_min)}</td><td class="n ${x.defect ? 'st-bad' : 'faint'}">${x.defect || '—'}</td></tr>`).join('')}</tbody></table></div>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>Кто отметил</th><th>Должность</th><th class="n">Отметок «Сдал»</th><th class="n">Работа, мин</th><th class="n">Брак</th></tr></thead><tbody>
          ${a.people.map((x) => `<tr><td>${esc(x.name)}</td><td class="muted">${esc(x.title)}</td><td class="n">${x.marks}</td><td class="n">${mins(x.work_min)}</td><td class="n ${x.defect ? 'st-bad' : 'faint'}">${x.defect || '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="faint">Этапы пока никто не отмечал</td></tr>'}</tbody></table></div></div>
      <p class="note" style="margin-top:12px">Время считается от «Принял» до «Сдал». Быстрее — не значит лучше: смотрите его вместе с браком.</p>
      <p class="src">Источник: ${esc(a.source)}. Данные на ${ftime(a.asof)}.</p></section>`;
  }
  function alertCard(a) {
    return `<article class="glass-flat alert ${a.level}"><div class="row">${chip(a.level)}<span class="who">${esc(a.dept_name)}</span></div>
      <h3>${esc(a.title)}</h3><p>${esc(a.cause)}</p><p class="who">Отвечает: ${esc(a.owner)} · ${esc(a.context)}</p>
      <div class="hyp" data-hyp="${a.kpi}"><span class="faint">Проверяю версии причины…</span></div>
      <div class="row"><button class="btn btn-sm" data-kpi="${a.kpi}" data-by="${a.by}">К причине</button>${canDecide() ? `<button class="btn btn-sm btn-primary" data-decide="${a.kpi}">Оформить решение</button>` : ''}</div></article>`;
  }

  /* Версии причины: каждая проверена данными — «подтвердилась» или «не подтвердилась», с цифрой. Решает человек. */
  function hypHtml(h, full) {
    if (!h || !h.items || !h.items.length) return '<span class="faint">Версий для проверки нет — смотрите разбивку показателя.</span>';
    const items = full ? h.items : h.items.slice(0, 3);
    const head = `Проверено версий причины: ${h.checked}, подтвердилось: <b>${h.confirmed}</b>`;
    const wrap = (ul) => full ? `<p class="hyp-head">${head}</p>${ul}` : `<details class="hyp-d"><summary>${head}</summary>${ul}</details>`;
    return wrap(`<ul>${items.map((i) => `<li class="${i.verdict === 'да' ? 'yes' : 'no'}"><span class="mark" aria-label="${i.verdict === 'да' ? 'подтвердилась' : 'не подтвердилась'}">${i.verdict === 'да' ? '✓' : '✕'}</span>
        <span><b>${esc(i.text)}</b>${i.verdict === 'да' ? '' : ' <span class="faint">— не подтвердилась</span>'}<small>${esc(i.evidence)}</small>
        ${full && i.by ? `<button class="linkbtn" data-kpi="${h.kpi}" data-by="${i.by}">открыть разбивку</button>` : ''}</span></li>`).join('')}</ul>`);
  }
  async function fillHyps() {
    for (const box of $$('[data-hyp]')) {
      try { const h = await why(box.dataset.hyp); if (document.contains(box)) box.innerHTML = hypHtml(h, false); }
      catch (e) { if (document.contains(box)) box.innerHTML = ''; }
    }
  }
  function funnel(rows) {
    const max = Math.max(...rows.map((r) => r.count), 1);
    return `<div class="funnel">${rows.map((r) => {
      const drop = r.pass != null && r.pass_prev != null && r.pass < r.pass_prev - 4;
      return `<div class="fstep"><b>${fmt(r.count)}</b><div class="funnel-bar" style="--share:${r.count / max}" aria-hidden="true"></div><span>${esc(r.name)}</span>
        <small class="${drop ? 'drop' : ''}">${r.pass == null ? '—' : `Проходит ${fmt(r.pass)} %${r.pass_prev == null ? '' : ` · было ${fmt(r.pass_prev)} %`}`}</small></div>`;
    }).join('')}</div>`;
  }
  function pairsChart(rows, names, unit) {
    const max = Math.max(...rows.flatMap((r) => [r.a, r.b]), 1);
    return `<figure class="pair-chart">
      <figcaption><span><i></i>${esc(names[0])}</span><span><i></i>${esc(names[1])}</span>${unit ? `<span>Шаг — ${esc(unit)}</span>` : ''}</figcaption>
      <div class="pair-groups" style="--groups:${rows.length}">
        ${rows.map((r) => {
          const label = `${fdate(r.day)} · ${names[0]}: ${fmt(r.a)} · ${names[1]}: ${fmt(r.b)}`;
          return `<div class="pair-group" role="img" aria-label="${esc(label)}" title="${esc(label)}">
            <div class="pair-bars"><i style="height:${r.a / max * 100}%"></i><i style="height:${r.b / max * 100}%"></i></div><small aria-hidden="true">${fdate(r.day)}</small></div>`;
        }).join('')}
      </div></figure>`;
  }
  function painTable({ cols, rows, num = [], hot = [] }) {
    const n = (j) => num.includes(j) ? ' class="n"' : '';
    return `<div class="scroll-x"><table class="tbl pain-table"><thead><tr>${cols.map((c, j) => `<th scope="col"${n(j)}>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row, i) => `<tr class="${hot.includes(i) ? 'hot' : ''}">${row.map((cell, j) =>
        `<td${n(j)} data-label="${esc(cols[j])}">${esc(cell ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function painDetail(p) {
    const empty = '<p class="empty">Нет данных за выбранный период.</p>';
    if (p.pairs) return p.pairs.length ? pairsChart(p.pairs, p.pair_names, p.pair_unit) : empty;
    if (p.bars) return p.bars.length ? bars(p.bars) : empty;
    if (p.table) return p.table.rows.length ? painTable(p.table) : empty;
    if (p.funnel) return p.funnel.length ? funnel(p.funnel) : empty;
    if (p.weeks) {
      const deficit = p.weeks.find((w) => !w.fact && w.demand > w.capacity);
      return p.weeks.length ? weeksChart({ weeks: p.weeks, deficit_week: deficit?.week }) : empty;
    }
    if (p.list) return p.list.length ? `<ul class="pain-list">${p.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : empty;
    return '';
  }
  function painCard(p, preview = false) {
    const detail = painDetail(p);
    const absences = p.bars && p.list?.length ? `<ul class="pain-list">${p.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const chart = preview && (p.pairs || p.bars || p.funnel || p.weeks)
      ? `<div class="pain-chart-preview" data-pain-link="${esc(p.id)}">${detail}</div>` : detail;
    const action = preview ? `<button class="btn btn-sm" data-pain-link="${esc(p.id)}">Открыть разбор</button>`
      : p.kpi && p.by ? `<button class="btn btn-sm" data-kpi="${esc(p.kpi)}" data-by="${esc(p.by)}">Причины и разбивки</button>` : '';
    return `<article class="glass panel pain">${preview ? `<header><h2>${esc(p.title)}</h2>${p.status !== 'none' ? chip(p.status) : ''}</header>` : ''}
      ${p.big?.length ? `<dl class="pain-facts">${p.big.map((b) => `<div class="fact"><dt>${esc(b.label)}</dt>
        <dd class="st-${esc(b.st)}"><b>${typeof b.value === 'number' ? fmt(b.value) : esc(b.value ?? '—')}</b>${b.unit ? ` <span>${esc(b.unit)}</span>` : ''}</dd></div>`).join('')}</dl>` : ''}
      ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
      ${chart}${absences}
      <footer><p class="src">Источник: ${esc(p.source)}</p>${action}</footer></article>`;
  }
  function deptAppPanel(dept) {
    const app = S.pulse?.app;
    const html = dept === 'sales' ? liveSales(app) : dept === 'production' ? liveProd(app) : '';
    return html ? `<div id="liveApp">${html}</div>` : '';
  }
  function detailHeader(c, title, status) {
    return `<div class="detail-back"><button class="btn btn-sm" data-go="${esc(c.dept)}">← Сводка отдела</button></div>
      <header class="page-head contour-head"><div><h1>${esc(title)}</h1><p class="lead">
        ${esc(c.name)} · ${fdate(c.period.from)} — ${fdate(c.period.to)}</p></div>
        ${status && status !== 'none' ? chip(status) : ''}</header>`;
  }
  function kpiContext(k, title = k.name) {
    return `<section class="glass panel detail-kpi"><header><h2>${esc(title)}</h2></header>
      <div class="facts"><div class="fact"><small>Факт</small><b>${fmt(k.value)}</b> <span class="faint">${esc(k.unit)}</span></div>
        <div class="fact"><small>План</small><b>${fmt(k.plan)}</b></div>
        <div class="fact"><small>Прошлый период</small><b>${fmt(k.prev)}</b></div>
        <div class="fact"><small>Прогноз</small><b>${fmt(k.forecast)}</b></div></div>
      ${lineChart(k)}
      <p class="src">${esc(k.formula)} · ${esc(k.source)}</p></section>`;
  }
  function contourDetail(c) {
    const pain = c.pains.find((p) => p.id === S.pain);
    const kpi = c.kpis.find((k) => !k.locked && (pain ? k.id === pain.kpi : 'kpi-' + k.id === S.pain));
    if (pain) return detailHeader(c, pain.title, pain.status) + painCard(pain)
      + (kpi ? kpiContext(kpi) : '')
      + (['queue', 'funnel'].includes(pain.id) ? deptAppPanel(c.dept) : '');
    if (kpi) return detailHeader(c, kpi.name, kpi.status) + kpiContext(kpi, 'Динамика и план')
      + `<div><button class="btn" data-kpi="${esc(kpi.id)}">Причины и разбивки</button></div>`;
    return detailHeader(c, 'Разбор не найден') + '<p class="muted">Откройте рабочий вопрос из меню или вернитесь к сводке отдела.</p>';
  }
  function getContour(dept) {
    return cached('contour:' + dept, '/api/pult/contour?dept=' + dept + '&' + q());
  }
  async function openCompanyKpi(id) {
    const kpi = S.pulse?.kpis.find((k) => k.id === id);
    if (!kpi || kpi.locked || !myViews().some((v) => v.id === kpi.dept)) return openKpi(id);
    const seq = S.seq;
    try {
      const c = await getContour(kpi.dept);
      if (seq !== S.seq) return;
      const pain = c.pains.find((p) => p.kpi === id);
      go(kpi.dept, pain?.id || 'kpi-' + id);
    } catch (e) { if (seq === S.seq) toast(e.message); }
  }
  function contourView(c) {
    const director = S.user.role !== 'head';
    const first = (t) => { const m = String(t || '').match(/^.*?[.!?](?=\s+[А-ЯЁA-Z«]|$)/); return m ? m[0] : String(t || ''); };
    const worst = c.pains.find((p) => p.status === 'bad' && p.note) || c.pains.find((p) => p.status === 'warn' && p.note);
    const al = c.alerts[0];                        // главное — самое сильное отклонение отдела с причиной; нет отклонений — худший рабочий вопрос
    const verdict = al
      ? `<section class="glass-flat verdict is-${al.level}"><div><h2>Главное сейчас</h2><p><b>${esc(al.title)}.</b> ${esc(al.cause)}</p></div>
          <div class="verdict-acts"><button class="btn" data-kpi="${al.kpi}" data-by="${al.by}">К причине</button>${canDecide() ? `<button class="btn btn-primary" data-decide="${al.kpi}">Оформить решение</button>` : ''}</div></section>`
      : worst
      ? `<section class="glass-flat verdict is-${worst.status}"><div><h2>Главное сейчас</h2><p>${esc(worst.note)}</p></div>
          <button class="btn btn-accent" data-pain-link="${esc(worst.id)}">Открыть разбор</button></section>`
      : `<section class="glass-flat verdict"><div><h2>Главное сейчас</h2><p>Отклонений нет: по всем рабочим вопросам отдел в норме.</p></div></section>`;
    const overview = (c.overview || []).map((item) => `<button class="glass-flat dept-summary" data-pain-link="${esc(item.pain)}">
      <span class="dept-summary-label">${esc(item.label)}</span>
      <span class="dept-summary-reading st-${esc(item.st)}"><b>${fmt(item.value)}</b>${item.unit ? ` <small>${esc(item.unit)}</small>` : ''}</span>
      <span class="dept-summary-when">${esc(item.when)}<span aria-hidden="true">›</span></span></button>`).join('');
    const questions = `<ul class="glass-flat signal-list topic-list">${c.pains.map((p) => `<li><button class="signal-row" data-pain-link="${esc(p.id)}">
        <span class="signal-text"><strong>${esc(p.title)}</strong>${p.note ? `<small>${esc(first(p.note))}</small>` : ''}</span>
        ${p.status !== 'none' ? chip(p.status) : '<span></span>'}<span class="signal-arrow" aria-hidden="true">›</span></button></li>`).join('')}</ul>`;
    const fold = (title, n, body) => `<details class="section-details glass-flat"><summary>${title}<span class="cnt">${n}</span></summary><div class="section-details-body">${body}</div></details>`;
    return `<header class="page-head contour-head"><div><h1>${esc(c.name)}</h1>
      <p class="lead">${esc(c.head)} · ${fdate(c.period.from)} — ${fdate(c.period.to)}${S.user?.role === 'analyst' ? ' · Только чтение' : ''}</p></div>${chip(c.status)}</header>
      ${verdict}
      ${overview ? `<section class="dept-summary-grid" aria-label="Три главных числа отдела">${overview}</section>` : ''}
      <section class="contour-analysis"><h2 class="sec-title">Рабочие вопросы</h2>${questions}</section>
      ${fold('Все показатели отдела', c.kpis.length, `<div class="kpi-grid">${c.kpis.map((k) => kpiTile(k)).join('')}</div>`)}
      ${director && c.alerts.length ? fold('Отклонения от плана', c.alerts.length, signalList(c.alerts)) : ''}
      ${director ? deptAppPanel(c.dept) : ''}`;
  }

  /* ---------- разделы ---------- */
  const views = {
    mydash: () => window.Studio.dashboard(),          // свой дашборд и конструктор виджетов — t1/studio.js
    /* На «Пульсе» — только пульс: восемь звеньев потока заказа. Подробности — при наведении и в разделах отделов. */
    pulse(p) {
      const n = p.pulse.critical + p.pulse.warn;
      const lead = p.pulse.critical ? `Из ${p.pulse.total} показателей ${p.pulse.critical} требуют решения${p.pulse.warn ? `, ещё ${p.pulse.warn} под вниманием` : ''}.`
        : n ? `Критичного нет, под вниманием ${p.pulse.warn} из ${p.pulse.total} показателей.` : `Все ${p.pulse.total} показателей в норме.`;
      return `<header class="page-head pulse-head"><div><h1>Пульс компании</h1>
          <p class="lead">${lead} ${matchMedia('(hover: none)').matches ? 'Нажмите' : 'Наведите'} на сферу — раскроются её показатели и задачи.</p></div><span class="spacer"></span>
          <div class="legend"><span><i style="background:var(--ok)"></i>в норме</span><span><i style="background:var(--warn-fill)"></i>внимание</span><span><i style="background:var(--bad)"></i>критично</span></div></header>
        <section class="pulse-map" aria-label="Сферы компании">${mapSvg(p)}</section>`;
    },
    attention(p) {
      return `<header class="page-head"><div><h1>Отклонения</h1><p class="lead">${p.alerts.length ? `Требуют решения: ${p.alerts.length}. У каждого — причина, ответственный и кнопка «Оформить решение».` : 'Все показатели в пределах плана.'}</p></div></header>
        <section class="alerts">${p.alerts.map(alertCard).join('') || '<p class="glass-flat empty">Отклонений нет.</p>'}</section>`;
    },
    async decisions() {
      const list = await cached('decisions', '/api/pult/decisions');
      const overdue = list.filter((d) => d.overdue).length;
      return `<header class="page-head"><div><h1>Реестр решений</h1>${overdue ? `<p class="lead">Просрочено · ${overdue}</p>` : ''}</div>
          ${canDecide() ? `<span class="spacer"></span><button class="btn btn-primary" data-act="newDecision">${I.plus.replace('<svg', '<svg width="16" height="16"')} Новое решение</button>` : ''}</header>
        <div class="board">${STATUSES.map((s) => { const items = list.filter((d) => d.status === s);
          return `<section class="glass col" aria-label="${s}"><header>${s[0].toUpperCase() + s.slice(1)} <span class="cnt">${items.length}</span></header>
            ${items.map((d) => `<button class="glass-flat card" data-decision="${d.id}"><h3>${esc(d.title)}</h3><div class="meta"><span>${esc(d.owner)}</span><span>·</span><span class="${d.overdue ? 'st-bad' : ''}">срок ${fdate(d.due)}${d.overdue ? ' — просрочено' : ''}</span></div>
              ${effLine(d)}<div class="meta"><span class="chip ${d.priority === 'высокий' ? 'chip-bad' : ''}">${esc(d.priority)}</span><span class="faint">${esc(d.id)}</span></div></button>`).join('') || '<p class="empty">Пусто</p>'}</section>`; }).join('')}</div>`;
    },
    async data() {
      let ql = null, qerr = null;
      if (['director', 'analyst'].includes(S.user.role)) { try { ql = await cached('quality', '/api/pult/quality'); } catch (e) { qerr = e; } }
      const audit = await api('/api/pult/audit');
      let gw = null;
      if (['director', 'analyst'].includes(S.user.role)) { try { gw = await api('/api/gateway'); } catch (e) { /* без панели шлюза */ } }
      const gate = gw ? gatewayPanel(gw) : '';
      const src = ql ? `<section class="glass panel"><header><h2>Источники данных</h2><span class="faint" style="font-size:13px">пять систем связаны по номеру заказа и клиента</span></header>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Система</th><th>Обновлено</th><th>Свежесть</th><th class="n">Записей</th><th class="n">Пропуски</th><th class="n">Дубли</th></tr></thead><tbody>
          ${ql.sources.map((s) => `<tr><td>${esc(s.system)}</td><td class="num">${ftime(s.synced)}</td><td>${chip(s.status)} <span class="faint">${fmt(s.age_h)} ч назад</span></td><td class="n">${fmt(s.rows)} <span class="faint">${esc(s.what)}</span></td>
            <td class="n ${s.gaps ? 'st-warn' : ''}">${s.gaps}${s.gap_note && s.gaps ? ` <span class="faint">${esc(s.gap_note)}</span>` : ''}</td><td class="n ${s.dups ? 'st-warn' : ''}">${s.dups}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="glass panel"><header><h2>Сверка оборота: производство и учёт</h2></header><div class="scroll-x"><table class="tbl"><thead><tr><th>Месяц</th><th class="n">ERP, BYN</th><th class="n">1С, BYN</th><th class="n">Расхождение</th><th>Итог</th></tr></thead><tbody>
          ${ql.reconciliation.map((r) => `<tr><td>${esc(r.month)}</td><td class="n">${fmt(r.erp)}</td><td class="n">${fmt(r.fin)}</td><td class="n ${r.diff ? 'st-warn' : ''}">${fmt(r.diff)}</td><td>${r.status === 'ok' ? chip('ok') : '<span class="chip chip-warn"><i></i>расходится</span>'}</td></tr>`).join('')}</tbody></table></div>
          <p class="note" style="margin-top:12px">${esc(ql.note)} Заказы: ${ql.unposted.map(esc).join(', ')}.</p></section>`
        : `<section class="glass panel"><header><h2>Источники данных</h2></header><div class="lock-note">${I.lock}<span>${qerr ? esc(qerr.message) : 'Качество данных и сверку видят директор и аналитик.'}</span></div></section>`;
      return `<header class="page-head"><div><h1>Данные и журнал</h1><p class="lead">Насколько можно верить цифрам и кто что менял: пользователь, время, действие, объект, результат.</p></div></header>${gate}${src}
        <section class="glass panel"><header><h2>Журнал действий</h2><span class="faint" style="font-size:13px">${S.user.role === 'head' ? 'ваши действия и решения вашего подразделения' : 'все пользователи'}</span></header>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Объект</th><th>Результат</th><th>Подробности</th></tr></thead><tbody>
          ${audit.slice(0, 60).map((a) => `<tr><td class="num">${ftime(a.ts)}</td><td>${esc(a.who)}</td><td>${esc(a.action)}</td><td class="num">${esc(a.object || '—')}</td><td class="${a.result === 'отказ' ? 'st-bad' : ''}">${esc(a.result || 'ok')}</td><td class="muted">${esc(a.detail || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="faint">Записей пока нет</td></tr>'}</tbody></table></div></section>`;
    },
  };
  /* ИИ-шлюз: одна точка выхода к моделям. Показываем, куда сейчас идут запросы, правила и счётчики — без текста запросов. */
  function gatewayPanel(g) {
    const st = g.state, t = g.totals, av = st.available;
    const TASK = { finance: 'Финансы', complex: 'Сложный разбор', simple: 'Короткий ответ' };
    const modes = [['auto', '', 'По задаче', 'шлюз сам выбирает модель под каждый запрос', true],
      ['local', '', 'Локальная модель', 'на компьютере компании, наружу ничего не уходит', true],
      ['cloud', 'claude', 'Claude', av.claude && !av.claude_down ? 'облако, данные скрыты метками' : av.claude_note, av.claude],
      ['cloud', 'deepseek', 'DeepSeek', av.deepseek ? 'облако, данные скрыты метками' : 'нет ключа', av.deepseek],
      ['off', '', 'Без модели', 'только встроенные правила', true]];
    const cur = (m, c) => st.mode === m && (m !== 'cloud' || st.cloud === c);
    const canSwitch = S.user.role === 'director';
    return `<section class="glass panel gate"><header><h2>ИИ-шлюз</h2><span class="chip ${st.mode === 'auto' ? 'chip-ok' : st.outside ? 'chip-warn' : 'chip-ok'}"><i></i>${st.mode === 'auto' ? 'финансы — только внутри, остальное — в облако со скрытыми данными' : st.outside ? 'запросы уходят в облако' : st.mode === 'off' ? 'модель выключена' : 'запросы не покидают компьютер'}</span>
        <span class="spacer"></span><span class="faint" style="font-size:13px">сейчас отвечает: ${esc(st.provider)}${st.model ? ' · ' + esc(st.model) : ''}</span></header>
      <div class="gate-modes" role="group" aria-label="Куда идут запросы к модели">${modes.map(([m, c, name, note, ok]) => `<button class="glass-flat gate-mode" data-gate-mode="${m}" data-gate-cloud="${c}" aria-pressed="${cur(m, c)}"${ok && canSwitch ? '' : ' disabled'}>
        <b>${name}</b><small>${esc(note)}</small></button>`).join('')}</div>
      ${(st.routes || []).length ? `<div class="scroll-x"><table class="tbl gate-routes"><thead><tr><th>Задача</th><th>Кто отвечает</th><th>Куда уходит</th><th>Запасной вариант</th></tr></thead><tbody>
        ${st.routes.map((r) => `<tr><td><b>${esc(r.title)}</b></td><td>${esc(r.provider)}${r.model ? ` <span class="faint">${esc(r.model)}</span>` : ''}</td>
          <td>${r.outside ? 'облако, данные скрыты метками' : 'не покидает компанию'}${r.note ? ` <span class="faint">· ${esc(r.note)}</span>` : ''}</td><td class="muted">${esc(r.reserve || (r.task === 'finance' ? 'встроенные правила' : '—'))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="facts gate-facts"><div class="fact"><small>Запросов к моделям</small><b>${fmt(t.calls)}</b></div><div class="fact"><small>Из них в облако</small><b>${fmt(t.outside)}</b></div>
        <div class="fact"><small>Скрыто значений</small><b>${fmt(t.hidden)}</b> <span class="faint">шлюзом: ${fmt(t.auto_hidden)}</span></div>
        <div class="fact"><small>Не пропущено</small><b class="${t.blocked ? 'st-bad' : ''}">${fmt(t.blocked)}</b> <span class="faint">помечено: ${fmt(t.flagged)}</span></div></div>
      <ul class="gate-rules">${g.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <details class="section-details glass-flat"><summary>Последние обращения<span class="cnt">${g.last.length}</span></summary><div class="section-details-body scroll-x"><table class="tbl"><thead><tr><th>Время</th><th>Задача</th><th>Модель</th><th>Куда</th><th class="n">Скрыто</th><th class="n">Знаков</th><th class="n">Время, с</th><th>Итог</th></tr></thead><tbody>
        ${g.last.map((x) => `<tr><td class="num">${ftime(x.ts)}</td><td>${esc(TASK[x.task] || '—')}</td><td>${esc(x.provider)}</td><td>${x.outside ? 'облако' : 'внутри'}</td><td class="n">${x.hidden}</td><td class="n">${fmt(x.chars_in)}</td><td class="n">${fmt(x.ms / 1000)}</td>
          <td class="${x.blocked ? 'st-bad' : x.ok ? '' : 'st-warn'}">${x.blocked ? 'не пропущен: ' + esc(x.blocked) : x.kept ? esc(x.kept) : x.ok ? 'ответ получен' : 'модель не ответила'}${x.flagged ? ' · помечен' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="faint">Обращений пока не было</td></tr>'}</tbody></table></div></details>
      ${canSwitch ? '' : '<p class="src">Переключать модель может директор.</p>'}</section>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-gate-mode]'); if (!b || b.disabled) return;
    try {
      await api('/api/ai/mode', { body: { mode: b.dataset.gateMode, cloud: b.dataset.gateCloud || undefined } });
      toast('Запросы к модели теперь идут так: ' + $('b', b).textContent);
      renderView();
    } catch (err) { toast(err.message); }
  });

  /* Эффект решения считается сам: показатель за две недели до решения и за последние две недели после. */
  const EFF_CLS = { 'лучше': 'st-ok', 'хуже': 'st-bad', 'без изменений': 'faint' };
  /* Закрыто, а показатель хуже или так и остался вне плана — честно подсветить. */
  const effWarn = (d, e) => d.status === 'закрыто' && e.after != null && (e.verdict === 'хуже' || (e.verdict === 'без изменений' && e.status && e.status !== 'ok'));
  function effLine(d) {
    const e = d.effect_auto; if (!e) return '';
    if (e.after == null) return `<div class="eff faint">${esc(e.name)}: ${esc(e.verdict)}</div>`;
    const warn = effWarn(d, e);
    return `<div class="eff"><span>${esc(e.name)}: ${fmt(e.before)} → <b>${fmt(e.after)}</b> ${esc(e.unit)}</span> <span class="${EFF_CLS[e.verdict] || ''}">${esc(e.verdict)}</span>${warn ? ' <span class="st-bad">· закрыто без улучшения</span>' : ''}</div>`;
  }
  function effBlock(d) {
    const e = d.effect_auto; if (!e) return '';
    const warn = effWarn(d, e);
    return `<div class="eff-box ${e.verdict === 'лучше' ? 'good' : e.verdict === 'хуже' ? 'bad' : ''}"><p class="eyebrow">Эффект решения — считается сам</p>
      ${e.after == null ? `<p>${esc(e.text)}</p>` : `<div class="eff-nums"><div><small>2 недели до решения (до ${fdate(e.since)})</small><b>${fmt(e.before)}</b></div><span aria-hidden="true">→</span>
        <div><small>после${e.window === 'до закрытия' ? ', до закрытия' : ''}: ${e.days_after} дн.</small><b>${fmt(e.after)}</b></div><div><small>план</small><b>${fmt(e.plan)}</b></div></div>
        <p><span class="${EFF_CLS[e.verdict] || ''}"><b>${esc(e.verdict[0].toUpperCase() + e.verdict.slice(1))}.</b></span> ${esc(e.name)}, ${esc(e.unit)}. Источник: ${esc(e.source)}.</p>
        ${warn ? '<p class="st-bad">Решение закрыто, но показатель не улучшился — стоит вернуть его в работу.</p>' : ''}
        ${canDecide() ? '<button class="btn btn-sm" type="button" id="effFill">Вписать в «Что изменилось»</button>' : ''}`}</div>`;
  }
  function weeksChart(fc) {
    const W = 520, H = 210, L = 40, R = 10, T = 16, B = 30, n = fc.weeks.length;
    const max = Math.max(...fc.weeks.map((w) => Math.max(w.demand, w.capacity, w.capacity_plan || 0)), 1) * 1.1;
    const bw = (W - L - R) / n, Y = (v) => T + (1 - v / max) * (H - T - B);
    const line = (key) => fc.weeks.map((w, i) => { const v = w[key] || w.capacity; return `${i ? 'L' : 'M'}${(L + i * bw).toFixed(1)} ${Y(v).toFixed(1)} L${(L + (i + 1) * bw).toFixed(1)} ${Y(v).toFixed(1)}`; }).join(' ');
    return `<figure class="weeks-chart"><figcaption><span><i></i>Спрос</span><span><i></i>Мощность сейчас</span><span><i></i>После закрытия вакансий</span></figcaption><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Спрос и мощность по неделям">
      ${[0, 0.5, 1].map((k) => `<line x1="${L}" x2="${W - R}" y1="${Y(max * k / 1.1).toFixed(1)}" y2="${Y(max * k / 1.1).toFixed(1)}" stroke="var(--edge)"/><text x="${L - 6}" y="${(Y(max * k / 1.1) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink4)" font-family="JetBrains Mono">${fmt(max * k / 1.1)}</text>`).join('')}
      ${fc.weeks.map((w, i) => { const over = !w.fact && w.demand > w.capacity; return `<rect x="${(L + i * bw + 5).toFixed(1)}" y="${Y(w.demand).toFixed(1)}" width="${(bw - 10).toFixed(1)}" height="${(H - B - Y(w.demand)).toFixed(1)}" rx="5" fill="${over ? 'var(--bad)' : w.fact ? 'var(--ink4)' : 'var(--brand2)'}" opacity="${w.fact ? 0.5 : 0.85}"><title>Неделя с ${fdate(w.week)}: спрос ${w.demand}, мощность ${w.capacity}</title></rect>
        <text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="${w.week === fc.deficit_week ? 'var(--bad)' : 'var(--ink4)'}" font-family="JetBrains Mono">${fdate(w.week)}</text>`; }).join('')}
      <path d="${line('capacity_plan')}" fill="none" stroke="var(--ok)" stroke-width="1.6" stroke-dasharray="5 5" opacity=".8"/>
      <path d="${line('capacity')}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    </svg></figure>`;
  }
  async function renderView() {
    const el = $('#view'); if (!el) return;
    const my = ++S.seq;
    if (S.err) { el.innerHTML = errorBox(S.err); return; }
    if (!S.pulse) return;
    try {
      const view = S.view;
      if (isContour(view)) {
        el.innerHTML = '<div class="skel" role="status" aria-label="Загрузка контура"></div>';
        const contour = await getContour(view);
        if (my !== S.seq) return;
        S.contour = contour;
        el.innerHTML = S.pain ? contourDetail(contour) : contourView(contour);
        renderNav();
      } else {
        const html = await views[view](S.pulse);
        if (my !== S.seq) return;
        el.innerHTML = html;
      }
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      fillHyps();
      if (view === 'pulse') (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { if (my === S.seq) fitMap(); });
    } catch (e) { if (my === S.seq) el.innerHTML = errorBox(e, 'rerender'); }
  }

  /* ---------- слой: панели и окна ---------- */
  let lastFocus = null;
  function openLayer(html, onClose) {
    lastFocus = document.activeElement;
    const L = $('#layer');
    L.innerHTML = `<div class="scrim" data-act="closeLayer"></div>${html}`;
    L._onClose = onClose;
    const f = $('[autofocus], input, textarea, select, button:not([data-act="closeLayer"])', L); if (f) f.focus();
  }
  function closeLayer() { const L = $('#layer'); L.innerHTML = ''; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }

  async function openKpi(id, by) {
    const k = S.pulse?.kpis.find((x) => x.id === id);
    if (!k) return;
    if (k.locked) { toast('Показатель закрыт для вашей роли'); return; }
    const dim = by && k.dims.some((d) => d.id === by) ? by : k.dims[0].id;
    openLayer(`<aside class="drawer glass" role="dialog" aria-modal="true" aria-label="${esc(k.name)}">
      <header><div style="flex:1"><p class="eyebrow">${esc(k.dept_name)}</p><h2>${esc(k.name)}</h2></div>${chip(k.status)}<button class="btn btn-icon btn-ghost" data-act="closeLayer" aria-label="Закрыть">${I.close.replace('<svg', '<svg width="18" height="18"')}</button></header>
      <div class="drawer-body">
        <div class="facts"><div class="fact"><small>Сейчас</small><b>${fmt(k.value)}</b> <span class="faint">${esc(k.unit)}</span></div><div class="fact"><small>План</small><b>${fmt(k.plan)}</b></div>
          <div class="fact"><small>Прошлый период</small><b>${fmt(k.prev)}</b></div><div class="fact"><small>Прогноз</small><b>${fmt(k.forecast)}</b></div></div>
        ${lineChart(k, 'drawer-chart-area')}
        ${k.status !== 'ok' ? `<div><p class="eyebrow" style="margin-bottom:8px">Почему — проверка версий</p><div class="hyp full" id="whyBox"><span class="faint">Проверяю версии причины…</span></div></div>` : ''}
        <div><p class="eyebrow" style="margin-bottom:8px">От показателя к причине</p><div class="tabs" id="dims">${k.dims.map((d) => `<button data-dim="${d.id}" aria-pressed="${d.id === dim}">${esc(d.name)}</button>`).join('')}</div></div>
        <div id="drill"><div class="skel"></div></div>
        <dl class="dl"><dt>Как считается</dt><dd>${esc(k.formula)}</dd><dt>Источник</dt><dd>${esc(k.source)}</dd><dt>Обновлено</dt><dd class="num">${ftime(k.updated)}</dd>${k.extra ? `<dt>Ещё</dt><dd>${esc(k.extra)}</dd>` : ''}</dl>
      </div>
      <footer>${k.status !== 'ok' && canDecide() ? `<button class="btn btn-primary" data-decide="${k.id}">Оформить решение</button>` : ''}<button class="btn" data-act="closeLayer">Закрыть</button></footer></aside>`);
    const show = async (d) => {
      $$('#dims button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.dim === d));
      const box = $('#drill'); if (!box) return;
      box.innerHTML = '<div class="skel"></div>';
      try {
        const r = await drill(id, d);
        if ($('#drill') !== box || $('#dims [aria-pressed="true"]')?.dataset.dim !== d) return;
        S.lastDrill = r;
        const series = d === 'day' && !r.rows.length
          ? k.series.flatMap((value, i) => value == null ? [] : [{ name: k.labels[i], value }])
          : r.rows;
        const rows = d === 'day' ? series.slice(-14) : series;
        box.innerHTML = `${r.note ? `<p class="note" style="margin-bottom:12px">${esc(r.note)}</p>` : ''}${rows.length ? bars(rows, r.unit) : '<p class="empty">Нет данных за выбранный период.</p>'}
          ${r.orders && r.orders.length ? `<p class="eyebrow" style="margin:16px 0 6px">Заказы, сорвавшие срок</p><table class="tbl"><tbody>${r.orders.slice(0, 5).map((o) => `<tr><td class="num">${esc(o.id)}</td><td>${esc(o.product)}</td><td>${esc(o.stage)}</td><td class="n">${fmt(o.hours)} ч</td></tr>`).join('')}</tbody></table>` : ''}`;
      } catch (e) {
        if ($('#drill') === box && $('#dims [aria-pressed="true"]')?.dataset.dim === d) box.innerHTML = `<p class="note">${esc(e.message)}</p>`;
      }
    };
    $('#dims').onclick = (e) => { const b = e.target.closest('[data-dim]'); if (b) show(b.dataset.dim); };
    show(dim);
    if ($('#whyBox')) why(id).then((h) => { const box = $('#whyBox'); if (box) box.innerHTML = hypHtml(h, true); }).catch(() => { const box = $('#whyBox'); if (box) box.innerHTML = ''; });
  }

  async function openDecisionForm(pre) {
    if (!canDecide() || !S.pulse) return;
    let people = [];
    try { people = await cached('people', '/api/pult/people'); } catch (e) { toast(e.message); return; }
    const k = pre.kpi ? S.pulse.kpis.find((x) => x.id === pre.kpi) : null;
    const a = pre.kpi ? S.pulse.alerts.find((x) => x.kpi === pre.kpi) : null;
    const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const draft = Object.assign({ title: k ? 'Вернуть в норму: ' + k.name.toLowerCase() : '', problem: a ? a.title : '', impact: a ? a.context : '', cause: a ? a.cause : '', action: '',
      owner_id: a ? a.owner_id : (S.user.role === 'head' ? S.user.id : ''), due, priority: a && a.level === 'bad' ? 'высокий' : 'средний' }, S.draft || {});
    const key = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const form = () => `<div class="modal glass" role="dialog" aria-modal="true" aria-label="Новое решение"><header><div style="flex:1"><p class="eyebrow">${k ? esc(k.name) + ' · ' + esc(k.dept_name) : 'Реестр решений'}</p><h2>Новое решение</h2></div>
        <button class="btn btn-icon btn-ghost" data-act="closeLayer" aria-label="Закрыть">${I.close.replace('<svg', '<svg width="18" height="18"')}</button></header>
      <form class="modal-body" id="decForm">
        <label class="field">Что решаем<input class="input" name="title" required maxlength="160" value="${esc(draft.title)}" autofocus></label>
        <label class="field">Проблема<textarea class="textarea" name="problem" required>${esc(draft.problem)}</textarea></label>
        <div class="frow"><label class="field">Влияние<textarea class="textarea" name="impact">${esc(draft.impact)}</textarea></label><label class="field">Причина<textarea class="textarea" name="cause" required>${esc(draft.cause)}</textarea></label></div>
        <label class="field">Действие — что именно сделать<textarea class="textarea" name="action" required placeholder="Например: до 15.11 вывести двух сборщиков из резерва">${esc(draft.action)}</textarea></label>
        <div class="frow"><label class="field">Владелец<select class="select" name="owner_id" required><option value="">Выберите</option>${people.map((u) => `<option value="${u.id}" ${u.id === draft.owner_id ? 'selected' : ''}>${esc(u.name)} — ${esc(u.title)}</option>`).join('')}</select></label>
          <label class="field">Срок<input class="input" type="date" name="due" required value="${esc(draft.due)}"></label></div>
        <label class="field">Приоритет<select class="select" name="priority">${['высокий', 'средний', 'низкий'].map((x) => `<option ${x === draft.priority ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <p class="err" role="alert"></p>
      </form><footer><button class="btn" data-act="closeLayer">Отмена</button><button class="btn btn-primary" id="toPreview">Проверить перед сохранением</button></footer></div>`;
    const read = () => { const f = $('#decForm'); const o = {}; ['title', 'problem', 'impact', 'cause', 'action', 'owner_id', 'due', 'priority'].forEach((n) => o[n] = f[n].value.trim()); return o; };
    const stepForm = () => {
      openLayer(form());
      $('#decForm').oninput = () => { S.draft = read(); };
      $('#toPreview').onclick = () => {
        const f = $('#decForm'); if (!f.reportValidity()) return;
        Object.assign(draft, read()); S.draft = draft; stepPreview();
      };
    };
    const stepPreview = () => {
      const owner = people.find((u) => u.id === draft.owner_id) || {};
      openLayer(`<div class="modal glass" role="dialog" aria-modal="true" aria-label="Проверка решения"><header><div style="flex:1"><p class="eyebrow">Проверьте перед сохранением</p><h2>${esc(draft.title)}</h2></div></header>
        <div class="modal-body"><dl class="dl"><dt>Проблема</dt><dd>${esc(draft.problem)}</dd><dt>Влияние</dt><dd>${esc(draft.impact || '—')}</dd><dt>Причина</dt><dd>${esc(draft.cause)}</dd><dt>Действие</dt><dd>${esc(draft.action)}</dd>
          <dt>Владелец</dt><dd>${esc(owner.name)} — ${esc(owner.title)}</dd><dt>Срок</dt><dd>${fdate(draft.due)}.${draft.due.slice(0, 4)}</dd><dt>Приоритет</dt><dd>${esc(draft.priority)}</dd>
          ${k ? `<dt>Проверим по</dt><dd>${esc(k.name)}: сейчас ${fmt(k.value)} ${esc(k.unit)}, план ${fmt(k.plan)}</dd>` : ''}</dl>
          <p class="note">После сохранения решение появится в реестре у владельца и попадёт в журнал действий. До этого ничего не записано.</p><p class="err" role="alert"></p></div>
        <footer><button class="btn" id="back">Назад к правке</button><button class="btn btn-primary" id="save">Сохранить решение</button></footer></div>`);
      $('#back').onclick = stepForm;
      $('#save').onclick = async (e) => {
        e.target.disabled = true;
        try {
          const d = await api('/api/pult/decisions', { body: Object.assign({}, draft, { key, kpi: k ? k.id : '', kpi_start: k ? k.value : null, dept: k ? k.dept : '' }) });
          S.draft = null; delete S.cache['decisions|' + q()]; refreshDecisionCount(); closeLayer();
          toast(`Решение ${d.id} сохранено и назначено: ${d.owner}`, { label: 'Открыть реестр', run: () => go('decisions') });
          if (S.view === 'decisions') renderView();
        } catch (err) { $('.modal .err').textContent = err.message + (err.code === 0 ? ' Повторное нажатие не создаст второе решение.' : ''); e.target.disabled = false; }
      };
    };
    stepForm();
  }

  async function openDecision(id) {
    let list;
    try { list = await cached('decisions', '/api/pult/decisions'); } catch (e) { toast(e.message); return; }
    const d = list.find((x) => x.id === id); if (!d) return;
    const k = d.kpi ? S.pulse.kpis.find((x) => x.id === d.kpi) : null;
    openLayer(`<aside class="drawer glass" role="dialog" aria-modal="true" aria-label="Решение ${esc(d.id)}">
      <header><div style="flex:1"><p class="eyebrow">${esc(d.id)} · ${esc(d.status)}${d.overdue ? ' · <span class="st-bad">просрочено</span>' : ''}</p><h2>${esc(d.title)}</h2></div><button class="btn btn-icon btn-ghost" data-act="closeLayer" aria-label="Закрыть">${I.close.replace('<svg', '<svg width="18" height="18"')}</button></header>
      <div class="drawer-body">
        <dl class="dl"><dt>Проблема</dt><dd>${esc(d.problem)}</dd><dt>Влияние</dt><dd>${esc(d.impact || '—')}</dd><dt>Причина</dt><dd>${esc(d.cause)}</dd><dt>Действие</dt><dd>${esc(d.action)}</dd>
          <dt>Владелец</dt><dd>${esc(d.owner)}</dd><dt>Срок</dt><dd class="${d.overdue ? 'st-bad' : ''}">${fdate(d.due)}.${(d.due || '').slice(0, 4)}</dd><dt>Приоритет</dt><dd>${esc(d.priority)}</dd><dt>Автор</dt><dd>${esc(d.author || '—')}</dd>
          ${d.effect ? `<dt>Результат</dt><dd>${esc(d.effect)}</dd>` : ''}</dl>
        ${d.effect_auto ? effBlock(d) : k && !k.locked ? `<div class="note"><b>Повторная проверка.</b> ${esc(k.name)}: ${d.kpi_start != null ? 'при создании ' + fmt(d.kpi_start) + ' → ' : ''}сейчас ${fmt(k.value)} ${esc(k.unit)}, план ${fmt(k.plan)}. ${chip(k.status)}</div>` : ''}
        ${canDecide() ? `<form id="updForm" style="display:flex;flex-direction:column;gap:12px">
          <div class="frow"><label class="field">Статус<select class="select" name="status">${STATUSES.map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="field">Срок<input class="input" type="date" name="due" value="${esc(d.due)}"></label></div>
          <label class="field">Комментарий<textarea class="textarea" name="comment" placeholder="Что сделано или почему сдвигаем"></textarea></label>
          <label class="field">Что изменилось после решения (нужно, чтобы закрыть)<textarea class="textarea" name="effect" placeholder="Например: заказы в срок 91 % → 96 %">${esc(d.effect || '')}</textarea></label>
          <p class="err" role="alert"></p>
        </form>` : ''}
        <div><p class="eyebrow" style="margin-bottom:8px">История изменений</p><ul class="hist">${(d.history || []).slice().reverse().map((h) => `<li><time>${ftime(h.ts)}</time><span><b>${esc(h.who)}</b> — ${esc(h.change)}</span></li>`).join('')}</ul></div>
      </div><footer>${canDecide() ? '<button class="btn btn-primary" id="updSave">Сохранить изменения</button>' : ''}<button class="btn" data-act="closeLayer">Закрыть</button></footer></aside>`);
    const ef = $('#effFill');
    if (ef) ef.onclick = () => { const e = d.effect_auto; $('#updForm').effect.value = `${e.name}: ${fmt(e.before)} → ${fmt(e.after)} ${e.unit} за ${e.days_after} дн. после решения (план ${fmt(e.plan)}) — ${e.verdict}.`; $('#updForm').effect.focus(); };
    if ($('#updSave')) $('#updSave').onclick = async (e) => {
      const f = $('#updForm'); e.target.disabled = true;
      try {
        await api('/api/pult/decisions/' + id, { body: { status: f.status.value, due: f.due.value, comment: f.comment.value, effect: f.effect.value } });
        delete S.cache['decisions|' + q()]; refreshDecisionCount(); closeLayer(); toast('Изменения сохранены и записаны в историю');
        if (S.view === 'decisions') renderView();
      } catch (err) { $('.err', f).textContent = err.message; e.target.disabled = false; }
    };
  }

  /* Отчёт за период: то, что в 1С собирают часами, — за секунды из тех же данных, что на экране. */
  async function openReport() {
    const t0 = performance.now();
    const p = S.pulse;
    if (!p) return;
    let decs = [];
    try { decs = await cached('decisions', '/api/pult/decisions'); } catch (e) { /* без решений */ }
    const open = decs.filter((d) => d.status !== 'закрыто');
    const ms = Math.max(1, Math.round(performance.now() - t0));
    openLayer(`<article class="report" role="dialog" aria-modal="true" aria-label="Отчёт за период">
      <header><b style="flex:1">Отчёт собран за ${ms < 1000 ? ms + ' мс' : fmt(ms / 1000) + ' с'}</b><button class="btn btn-primary" id="printRep">Печать или PDF</button><button class="btn" data-act="closeLayer">Закрыть</button></header>
      <div class="report-body">
        <div><p class="eyebrow">Фотопринт · управленческий отчёт</p><h1>Итоги за ${fdate(p.period.from)} — ${fdate(p.period.to)}</h1>
          <p class="muted">Данные на ${ftime(p.asof)}. Составил: ${esc(S.user.name)}, ${esc(S.user.title.toLowerCase())}. Из ${p.pulse.total} показателей требуют решения ${p.pulse.critical}, под вниманием ${p.pulse.warn}.</p></div>
        ${S.user.role !== 'head' ? `<section><h2>Отделы</h2><table class="tbl"><tbody>${p.departments.map((c) => `<tr><td><b>${esc(c.name)}</b></td>${c.metrics.map((m) => `<td>${esc(m[0])}: <b>${esc(m[1])}</b></td>`).join('')}<td>${chip(c.status)}</td></tr>`).join('')}</tbody></table></section>` : ''}
        <section><h2>Что требует решения</h2>${p.alerts.length ? `<table class="tbl"><thead><tr><th>Отклонение</th><th>Причина</th><th>Отвечает</th></tr></thead><tbody>${p.alerts.map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(a.cause)}</td><td>${esc(a.owner)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Отклонений нет.</p>'}</section>
        <section><h2>Показатели</h2><table class="tbl"><thead><tr><th>Показатель</th><th class="n">Факт</th><th class="n">План</th><th class="n">Прошлый период</th><th class="n">Прогноз</th><th>Статус</th></tr></thead><tbody>
          ${p.kpis.map((k) => `<tr><td>${esc(k.name)}, ${esc(k.unit)}</td><td class="n">${fmt(k.value)}</td><td class="n">${fmt(k.plan)}</td><td class="n">${fmt(k.prev)}</td><td class="n">${fmt(k.forecast)}</td><td class="st-${k.status}">${WORD[k.status]}</td></tr>`).join('')}</tbody></table></section>
        <section><h2>Решения в работе</h2>${open.length ? `<table class="tbl"><thead><tr><th>Решение</th><th>Владелец</th><th>Срок</th><th>Статус</th></tr></thead><tbody>${open.map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(d.owner)}</td><td class="${d.overdue ? 'st-bad' : ''}">${fdate(d.due)}${d.overdue ? ' — просрочено' : ''}</td><td>${esc(d.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Открытых решений нет.</p>'}</section>
        <p class="src">Формула, источник и время обновления каждого показателя — в его карточке на пульте. Данные тестовые.</p>
      </div></article>`);
    $('#printRep').onclick = () => window.print();
  }

  /* Личная страница сотрудника участка: только его цифры. */
  async function renderMy() {
    let d;
    try { d = await api('/api/pult/my'); } catch (e) { renderLogin(e.message); return; }
    const blk = (title, x) => `<div class="glass panel"><header><h2>${title}</h2></header><div class="facts"><div class="fact"><small>Заказов прошло участок</small><b>${fmt(x.done)}</b></div>
      <div class="fact"><small>Обычное время на заказ</small><b>${fmt(x.median)}</b> <span class="faint">ч при норме ${fmt(d.norm)}</span></div><div class="fact"><small>Уложились в норму</small><b>${fmt(x.in_norm)}</b> <span class="faint">%</span></div></div></div>`;
    $('#layer').innerHTML = '';
    $('#app').innerHTML = `<main class="my"><header class="page-head"><span class="logo" aria-hidden="true">Ф</span><div><p class="eyebrow">${esc(S.user.title)} · ${esc(S.user.name)}</p><h1>Моя смена: ${esc(d.stage_name.toLowerCase())}</h1></div>
        <span class="spacer"></span><a class="btn btn-primary" href="/t2/admin.html">Отметить этапы заказов</a><button class="btn" id="lo">Выйти</button></header>
      ${blk('Сегодня', d.today)}${blk('За неделю', d.week)}
      <div class="glass panel"><header><h2>Сейчас на участке</h2></header><div class="facts"><div class="fact"><small>Заказов в очереди</small><b>${d.queue.count}</b></div><div class="fact"><small>Ждут дольше нормы</small><b class="${d.queue.stuck ? 'st-bad' : ''}">${d.queue.stuck}</b></div>
        ${d.defects_found != null ? `<div class="fact"><small>Найдено брака за неделю</small><b>${d.defects_found}</b></div>` : ''}</div></div>
      <div class="glass panel"><header><h2>Мои поручения</h2></header>${d.tasks.length ? `<table class="tbl"><tbody>${d.tasks.map((t) => `<tr><td>${esc(t.title)}</td><td>срок ${fdate(t.due)}</td><td>${esc(t.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Поручений на вас сейчас нет.</p>'}</div>
      <p class="src">${esc(d.note)} Данные на ${ftime(d.asof)}. Источник: ${esc(d.source)}.</p></main>`;
    $('#lo').onclick = () => logout();
  }

  /* ---------- поиск и команды ---------- */
  async function openPalette() {
    let decs = [];
    try { decs = await cached('decisions', '/api/pult/decisions'); } catch (e) { /* без решений */ }
    const items = [
      ...myViews().map((v) => ({ t: v.name, s: 'раздел', run: () => go(v.id) })),
      ...(S.contour?.dept === S.view ? S.contour.pains.map((p) => ({
        t: p.title, s: S.contour.name, run: () => go(S.view, p.id),
      })) : []),
      { t: 'Отчёт за период', s: 'действие', run: openReport },
      ...S.pulse.kpis.filter((k) => !k.locked).map((k) => ({ t: k.name, s: `показатель · ${fmt(k.value)} ${k.unit}`, run: () => openKpi(k.id) })),
      ...decs.map((d) => ({ t: d.title, s: `решение ${d.id} · ${d.status}`, run: () => openDecision(d.id) })),
      ...(canDecide() ? [{ t: 'Новое решение', s: 'действие', run: () => openDecisionForm({}) }] : []),
      { t: 'Спросить помощника', s: 'действие', run: () => openChat() },
      { t: 'Новый виджет', s: 'конструктор виджетов', run: () => window.Studio.builder() },
      { t: 'Выйти', s: 'действие', run: () => logout() },
    ];
    lastFocus = document.activeElement;
    $('#layer').innerHTML = `<div class="scrim" data-act="closeLayer"></div><div class="palette glass" role="dialog" aria-modal="true" aria-label="Умный поиск">
      <input id="palIn" placeholder="Умный поиск: показатель, разрез, документ, решение… или вопрос ИИ" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="palList"><ul id="palList" role="listbox"></ul>
      <p class="pal-foot">Ищет по смыслу: «выручка» найдёт оборот, «опоздания» — заказы в срок, «долги» — дебиторку. Последняя строка — спросить ИИ.</p></div>`;
    let sel = 0, shown = items, timer = 0;
    const draw = () => { $('#palList').innerHTML = shown.slice(0, 40).map((x, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}">${x.g ? `<span class="pal-g">${esc(x.g)}</span>` : ''}<span class="pal-t">${esc(x.t)}</span><small>${esc(x.s)}</small></li>`).join('') || '<li class="faint">Ничего не нашлось</li>';
      const cur = $('#palList [aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' }); };
    const inp = $('#palIn');
    const askItem = (s) => ({ g: 'ИИ', t: `Спросить ИИ: «${s}»`, s: 'рабочее место с ИИ', run: () => openChat(s) });
    /* умный поиск: сначала мгновенно по названиям, следом — по смыслу с сервера (показатели, разрезы, документы, виджеты) */
    inp.oninput = () => {
      const raw = inp.value.trim(), s = raw.toLowerCase();
      const local = items.filter((x) => (x.t + ' ' + x.s).toLowerCase().includes(s));
      shown = raw ? local.concat([askItem(raw)]) : items; sel = 0; draw();
      clearTimeout(timer);
      if (raw.length < 2) return;
      timer = setTimeout(async () => {
        try {
          const r = await api('/api/pult/search?q=' + encodeURIComponent(raw));
          if (!$('#palIn') || inp.value.trim() !== raw) return;
          const seen = new Set(local.map((x) => x.t));
          const srv = r.results.filter((x) => !seen.has(x.title)).map((x) => ({ g: x.group, t: x.title, s: x.sub, run: () => window.Studio.goResult(x) }));
          shown = srv.concat(local).concat([askItem(raw)]); sel = 0; draw();
        } catch (e) { /* остаётся поиск по названиям */ }
      }, 160);
    };
    inp.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, Math.min(shown.length, 40) - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); const x = shown[sel]; closeLayer(); x.run(); }
    };
    $('#palList').onclick = (e) => { const li = e.target.closest('[data-i]'); if (li) { const x = shown[+li.dataset.i]; closeLayer(); x.run(); } };
    draw(); inp.focus();
  }

  /* ---------- помощник ---------- */
  /* Помощник открывается на весь экран: графики, таблицы, документы, краткое содержание — t1/studio.js. */
  function openChat(q) { return window.Studio.open(q); }
  function openChatPanel() {                          // прежняя маленькая панель — запасной вариант
    if ($('#chat')) { $('#chatIn').focus(); return; }
    const quick = ['Что требует решения сегодня?', 'Почему упали заказы в срок?', 'Какие решения просрочены?'];
    const box = document.createElement('section');
    box.className = 'chat glass'; box.id = 'chat'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Помощник');
    box.innerHTML = `<header>${I.spark.replace('<svg', '<svg width="20" height="20"')}<div style="flex:1"><h2>Помощник</h2><p class="faint" style="font-size:12.5px">Отвечает только по данным, доступным роли «${esc(S.user.title)}»</p></div>
        <button class="btn btn-icon btn-ghost" id="chatX" aria-label="Закрыть помощника">${I.close.replace('<svg', '<svg width="18" height="18"')}</button></header>
      <div class="chat-log" id="chatLog" aria-live="polite"></div><div class="quick">${quick.map((x) => `<button class="btn btn-sm" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <form id="chatForm"><input class="input" id="chatIn" placeholder="Спросите о показателях и решениях" autocomplete="off" maxlength="500"><button class="btn btn-primary btn-icon" aria-label="Отправить">${I.send.replace('<svg', '<svg width="18" height="18"')}</button></form>`;
    document.body.append(box);
    $('#fab').classList.add('hidden');
    const log = $('#chatLog');
    const draw = () => { log.innerHTML = S.chat.map((m) => `<div class="msg ${m.me ? 'me' : 'ai'}${m.wait ? ' typing' : ''}">${esc(m.text)}${m.meta ? `<small>${esc(m.meta)}</small>` : ''}</div>`).join('') || '<p class="faint" style="font-size:13.5px">Имена, телефоны и суммы заменяются метками до отправки в модель. Действий помощник сам не совершает — только подсказывает.</p>'; log.scrollTop = log.scrollHeight; };
    const ask = async (text) => {
      text = text.trim(); if (!text) return;
      S.chat.push({ me: true, text }); const wait = { text: 'Смотрю данные', wait: true }; S.chat.push(wait); draw();
      try {
        const r = await api('/api/pult/ask', { body: { question: text, days: S.days, product: S.product } });
        wait.wait = false; wait.text = r.text;
        wait.meta = `${r.provider}${r.masked ? ` · замаскировано значений: ${r.masked}` : ''} · данные на ${ftime(r.asof)} · источники: ${r.sources.join('; ')}`;
      } catch (e) { wait.wait = false; wait.text = e.message; }
      draw();
    };
    $('#chatForm').onsubmit = (e) => { e.preventDefault(); const i = $('#chatIn'); const v = i.value; i.value = ''; ask(v); };
    box.onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); };
    $('#chatX').onclick = () => { box.remove(); $('#fab').classList.remove('hidden'); $('#fab').focus(); };
    draw(); $('#chatIn').focus();
  }

  /* ---------- общие нажатия ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act],[data-kpi],[data-company-kpi],[data-decide],[data-decision],[data-node],[data-go],[data-pain-link],[data-core]');
    if (!t) { if (mapOn) hideMapCard(); return; }
    if (t.hasAttribute('data-core')) { hideMapCard(); return go('attention'); }
    if (t.dataset.act === 'closeLayer') return closeLayer();
    if (t.dataset.act === 'load') return load();
    if (t.dataset.act === 'rerender') return renderView();
    if (t.dataset.act === 'newDecision') return openDecisionForm({});
    if (t.dataset.act === 'report') return openReport();
    if (t.dataset.act === 'bneckDecide' && S.pulse && S.pulse.bottleneck) {
      const b = S.pulse.bottleneck;
      S.draft = Object.assign({}, S.draft || {}, { title: `Разгрузить участок «${b.name}»`, problem: b.text, cause: `На участке ${b.staff ? 'работает ' + b.staff + ', ' : ''}вакансий ${b.vacancies}, отсутствуют ${b.absent}`, action: b.advice || '' });
      return openDecisionForm({ kpi: 'on_time' });
    }
    if (t.dataset.painLink) return go(S.view, t.dataset.painLink);
    if (t.dataset.companyKpi) return openCompanyKpi(t.dataset.companyKpi);
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.decide) return openDecisionForm({ kpi: t.dataset.decide });
    if (t.dataset.decision) return openDecision(t.dataset.decision);
    if (t.dataset.kpi) return openKpi(t.dataset.kpi, t.dataset.by);
    if (t.dataset.node) {
      if (mapTouch && t.closest('#map') && !t.classList.contains('is-armed')) {       // палец: первое касание — карточка, второе — разбор
        $$('#map .is-armed').forEach((x) => x.classList.remove('is-armed')); t.classList.add('is-armed'); showMapCard(t); return;
      }
      hideMapCard();
      return openCompanyKpi(t.dataset.node);
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && S.pulse) { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') {
      if ($('#layer').innerHTML) closeLayer();
      else if (mapOn) hideMapCard();
      else if ($('#rail')?.classList.contains('is-open')) setMenu(false);
      else if (window.Studio && window.Studio.isOpen()) window.Studio.close();
      else if ($('#chat')) $('#chatX').click();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#map .hub')) { e.preventDefault(); hideMapCard(); openCompanyKpi(e.target.dataset.node); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#map .core')) { e.preventDefault(); hideMapCard(); go('attention'); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#map .kid')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  });
  window.addEventListener('offline', () => toast('Нет сети. Данные на экране могли устареть, введённое в формах сохранено.'));
  window.addEventListener('online', () => $('#view') && toast('Сеть вернулась', { label: 'Обновить данные', run: reload }));

  /* для рабочего места с ИИ и «Моего дашборда» (t1/studio.js) */
  window.FP = { api, S, esc, fmt, ftime, fdate, chip, COLOR, WORD, go, openKpi, openDecision, openDecisionForm, toast, openLayer, closeLayer };
  start();
})();
