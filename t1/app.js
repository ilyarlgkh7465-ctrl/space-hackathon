/* Пульт руководителя «Фотопринт». Данные и права — только с сервера (/api/pult/…), здесь лишь отображение. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => v == null ? '—' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ') : (Math.round(v * 10) / 10).toLocaleString('ru-RU');
  const fdate = (s) => s ? s.slice(8, 10) + '.' + s.slice(5, 7) : '—';
  const ftime = (s) => s ? fdate(s) + ' ' + s.slice(11, 16) : '—';
  const WORD = { ok: 'в норме', warn: 'внимание', bad: 'плохо', none: 'нет данных' };
  const COLOR = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', none: 'var(--none)' };
  const chip = (st) => `<span class="chip chip-${st}"><i></i>${WORD[st] || WORD.none}</span>`;
  const ic = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const I = {
    pulse: ic('<path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>'),
    sales: ic('<path d="M4 5h2l2.2 10h9.6L20 8H7.2"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
    production: ic('<path d="M3 20V9l6 4V9l6 4V5h6v15z"/><path d="M8 17h2M13 17h2"/>'),
    finance: ic('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 15h2"/>'),
    people: ic('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><path d="M16 5.2a3 3 0 010 5.6M17.5 14.3c1.9.6 3.1 2.1 3.5 4.7"/>'),
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
  };
  const VIEWS = [
    { id: 'pulse', name: 'Пульс компании', icon: I.pulse },
    { id: 'sales', name: 'Продажи и клиент', icon: I.sales },
    { id: 'production', name: 'Производство и качество', icon: I.production },
    { id: 'finance', name: 'Финансы и бухгалтерия', icon: I.finance },
    { id: 'people', name: 'Кадры и документы', icon: I.people },
    { id: 'decisions', name: 'Реестр решений', icon: I.decisions },
    { id: 'data', name: 'Данные и журнал', icon: I.data },
  ];
  const STATUSES = ['новое', 'в работе', 'на проверке', 'закрыто'];
  /* Руководитель отдела видит только свои разделы — так просил заказчик. */
  const DEPT_VIEW = { production: 'production', logistics: 'production', sales: 'sales', support: 'sales', finance: 'finance', hr: 'people', office: 'people' };
  const myViews = () => !S.user || S.user.role !== 'head' ? VIEWS : VIEWS.filter((v) => ['pulse', 'decisions', 'data', DEPT_VIEW[S.user.dept]].includes(v.id));
  const DEMO = [['director', 'Директор'], ['production', 'Руководитель производства'], ['finance', 'Руководитель финансов'], ['hr', 'Руководитель по персоналу'], ['operator', 'Мастер участка'], ['analyst', 'Аналитик']];

  const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* закрытое окно */ } } };
  const hash = new URLSearchParams(location.hash.slice(1));
  const S = { token: store.get('fp-token'), user: null, view: VIEWS.some((v) => v.id === hash.get('v')) ? hash.get('v') : 'pulse',
    days: [7, 14, 30, 60].includes(+hash.get('d')) ? +hash.get('d') : 14, product: '', dept: '', pulse: null, cache: {}, err: null, chat: [], seq: 0 };

  /* ---------- сервер ---------- */
  class ApiError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
  async function api(path, opts = {}) {
    let r;
    try {
      r = await fetch(path, { method: opts.body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, S.token ? { Authorization: 'Bearer ' + S.token } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { throw new ApiError('Нет связи с сервером. Проверьте сеть и повторите — введённое сохранено.', 0); }
    let data = null;
    try { data = await r.json(); } catch (e) { /* пустой ответ */ }
    if (r.status === 401 && path !== '/api/login') { logout(true); throw new ApiError('Сеанс закончился, войдите снова', 401); }
    if (!r.ok) throw new ApiError((data && data.error) || 'Сервер ответил ошибкой ' + r.status, r.status);
    return data;
  }
  const q = () => `days=${S.days}${S.product ? '&product=' + S.product : ''}`;
  async function cached(key, path) {
    const k = key + '|' + q();
    if (!S.cache[k]) S.cache[k] = api(path).catch((e) => { delete S.cache[k]; throw e; });
    return S.cache[k];
  }
  const drill = (kpi, by) => cached(`drill:${kpi}:${by}`, `/api/pult/drill?kpi=${kpi}&by=${by}&${q()}`);
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
      <div><p class="eyebrow">Фотопринт · единая система</p><h1>Пульт руководителя</h1></div>
      <p class="muted">Состояние компании, причины отклонений и ответственные — в одном окне. Данные тестовые.</p>
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
        S.token = d.token; S.user = d.user; store.set('fp-token', d.token); S.view = 'pulse'; S.dept = ''; S.product = '';
        start();
      } catch (err) { $('.err', f).textContent = err.message; btn.disabled = false; }
    };
    f.login.focus();
  }
  function logout(silent) {
    S.token = null; S.user = null; S.pulse = null; S.cache = {}; S.chat = [];
    store.set('fp-token', null);
    renderLogin(silent ? 'Сеанс закончился, войдите снова' : '');
  }

  /* ---------- каркас ---------- */
  async function start() {
    if (!S.token) return renderLogin();
    try { S.user = await api('/api/me'); } catch (e) { if (e.code !== 401) renderLogin(e.message); return; }
    if (S.user.role === 'operator') return renderMy();
    if (!myViews().some((v) => v.id === S.view)) S.view = 'pulse';
    if (!['director', 'head', 'analyst'].includes(S.user.role)) {
      $('#app').innerHTML = `<main class="login"><div class="glass login-card"><span class="logo">Ф</span><h1>Пульт — для руководителей</h1>
        <p class="muted">Вы вошли как «${esc(S.user.title)}». Для операционной команды есть экран участка с очередью и отметками этапов.</p>
        <a class="btn btn-primary" href="/t2/admin.html">Открыть экран участка</a><button class="btn" id="lo">Выйти</button></div></main>`;
      $('#lo').onclick = () => logout();
      return;
    }
    renderShell();
    load();
  }
  function renderShell() {
    const initials = S.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
    $('#app').innerHTML = `<div class="shell">
      <aside class="rail glass" aria-label="Разделы">
        <span class="logo" aria-hidden="true">Ф</span>
        <nav class="rail-nav" id="nav"><span class="rail-pill" id="pill"></span>
          ${myViews().map((v) => `<button class="rail-btn" data-view="${v.id}" aria-label="${v.name}">${v.icon}<span class="tip">${v.name}</span></button>`).join('')}
        </nav>
        <span class="avatar" title="${esc(S.user.name)} · ${esc(S.user.title)}">${esc(initials)}</span>
      </aside>
      <div class="stage">
        <header class="topbar glass" id="topbar"></header>
        <main class="view" id="view" tabindex="-1"></main>
      </div>
    </div>
    <button class="btn btn-accent fab" id="fab">${I.spark} Помощник</button>`;
    $('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); });
    $('#nav').addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const btns = $$('.rail-btn'); const i = btns.indexOf(document.activeElement);
      const n = btns[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
      if (n) { n.focus(); e.preventDefault(); }
    });
    $('#fab').onclick = openChat;
    renderTop(); movePill(false);
    window.addEventListener('resize', () => movePill(false));
  }
  /* «Перетекающий» указатель раздела: край по ходу движения едет быстро, второй его догоняет. */
  function movePill(animate = true) {
    const pill = $('#pill'), nav = $('#nav'), btn = $(`.rail-btn[data-view="${S.view}"]`);
    if (!pill || !btn) return;
    $$('.rail-btn').forEach((b) => b.toggleAttribute('aria-current', false));
    btn.setAttribute('aria-current', 'page');
    const top = btn.offsetTop, bottom = nav.clientHeight - top - btn.offsetHeight;
    const was = parseFloat(pill.style.top || '0');
    pill.className = 'rail-pill' + (animate ? (top > was ? ' down' : ' up') : '');
    pill.style.height = 'auto'; pill.style.top = top + 'px'; pill.style.bottom = bottom + 'px';
  }
  function renderTop() {
    const v = VIEWS.find((x) => x.id === S.view), p = S.pulse;
    const bad = p ? p.alerts.length : 0;
    $('#topbar').innerHTML = `<div class="crumbs"><span>Фотопринт</span><i>/</i><b>${v.name}</b></div>
      <button class="search" id="openPal" aria-label="Поиск и команды">${I.search.replace('<svg', '<svg width="17" height="17"')}<kbd>⌘K</kbd></button>
      <span class="spacer"></span>
      <div class="seg" role="group" aria-label="Период">${[7, 14, 30, 60].map((d) => `<button data-days="${d}" aria-pressed="${S.days === d}">${d} дн.</button>`).join('')}</div>
      <select class="select" id="fProduct" aria-label="Продукт"><option value="">Все продукты</option>${p ? p.products.map((x) => `<option value="${x.id}" ${S.product === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('') : ''}</select>
      ${p && p.depts.length > 1 ? `<select class="select" id="fDept" aria-label="Подразделение"><option value="">Все подразделения</option>${p.depts.map((x) => `<option value="${x.id}" ${S.dept === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
      <span class="chip live" title="Данные обновлены: дата и время"><i></i>${p ? ftime(p.asof) : 'загрузка'}</span>
      <button class="btn btn-icon bell" id="bell" aria-label="Отклонения: ${bad}">${I.bell.replace('<svg', '<svg width="18" height="18"')}${bad ? `<b>${bad}</b>` : ''}</button>
      <button class="btn btn-primary" id="newDec">${I.plus.replace('<svg', '<svg width="16" height="16"')} Решение</button>
      <button class="btn btn-icon" id="logout" aria-label="Выйти (${esc(S.user.name)})" title="Выйти: ${esc(S.user.name)}, ${esc(S.user.title)}">${I.out.replace('<svg', '<svg width="18" height="18"')}</button>`;
    $('#openPal').onclick = openPalette;
    $$('[data-days]').forEach((b) => b.onclick = () => { S.days = +b.dataset.days; reload(); });
    $('#fProduct').onchange = (e) => { S.product = e.target.value; reload(); };
    if ($('#fDept')) $('#fDept').onchange = (e) => { S.dept = e.target.value; renderView(); };
    $('#bell').onclick = () => { go('pulse'); setTimeout(() => { const a = $('#alerts'); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60); };
    $('#newDec').onclick = () => openDecisionForm({});
    $('#logout').onclick = () => logout();
  }
  function go(view) {
    if (!myViews().some((v) => v.id === view)) return;
    S.view = view;
    history.replaceState(null, '', `#v=${view}&d=${S.days}`);
    movePill(true); renderTop(); renderView();
    const m = $('#view'); if (m) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function reload() { S.cache = {}; history.replaceState(null, '', `#v=${S.view}&d=${S.days}`); load(); }
  async function load() {
    S.err = null;
    if (!S.pulse) $('#view').innerHTML = `<div class="skel" style="height:64px"></div><div class="grid2"><div class="skel" style="height:420px"></div><div class="skel" style="height:420px"></div></div>`;
    try { S.pulse = await api('/api/pult/pulse?' + q()); } catch (e) { S.err = e; }
    renderTop(); renderView();
  }
  function errorBox(e, retry = 'load') {
    return `<div class="glass state"><h2>${e.code === 403 ? 'Нет доступа' : 'Не получилось загрузить данные'}</h2><p class="muted">${esc(e.message)}</p>
      ${e.code === 403 ? '<p class="faint">Раздел закрыт для вашей роли. Попытка записана в журнал.</p>' : `<button class="btn btn-primary" data-act="${retry}">Повторить</button>`}</div>`;
  }

  /* ---------- графики ---------- */
  function spark(series, st) {
    const pts = series.map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length < 2) return '<svg class="spark"></svg>';
    const ys = pts.map((p) => p[1]), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
    const X = (i) => 3 + (i / (series.length - 1)) * 102, Y = (v) => 26 - ((v - min) / span) * 22;
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 108 30" aria-hidden="true"><path d="${d}" fill="none" stroke="${COLOR[st] || 'var(--ink3)'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="2.6" fill="${COLOR[st] || 'var(--ink3)'}"/></svg>`;
  }
  function lineChart(k) {
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
      <defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9806F" stop-opacity=".30"/><stop offset="1" stop-color="#E9806F" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" stroke="var(--edge)"/><text x="${L - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink4)" font-family="JetBrains Mono">${fmt(t)}</text>`).join('')}
      ${showPlan ? `<line x1="${L}" x2="${W - R}" y1="${Y(k.plan).toFixed(1)}" y2="${Y(k.plan).toFixed(1)}" stroke="var(--ink3)" stroke-dasharray="5 5" opacity=".7"/><text x="${W - R}" y="${(Y(k.plan) - 6).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink3)">план ${fmt(k.plan)}</text>` : ''}
      <path d="${area}" fill="url(#ar)"/><path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.4" fill="var(--brand)"><title>${k.labels[p[0]]}: ${fmt(p[1])} ${k.unit}</title></circle>`).join('')}
      ${k.labels.map((l, i) => i % step === 0 ? `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--ink4)" font-family="JetBrains Mono">${l}</text>` : '').join('')}
    </svg>`;
  }
  function bars(rows, unit, opts = {}) {
    const max = Math.max(...rows.map((r) => Math.abs(r.value || 0)), 1e-9);
    return `<div class="bars">${rows.map((r, i) => `<div class="bar"><span>${esc(r.name)}${r.count != null && opts.count !== false ? ` <small>· ${fmt(r.count)}</small>` : ''}</span>
      <span class="tr"><i class="${opts.calm ? 'calm' : ''}" style="width:${Math.max(2, (Math.abs(r.value || 0) / max) * 100).toFixed(1)}%;animation-delay:${i * 40}ms"></i></span>
      <b>${fmt(r.value)} ${esc(r.unit || unit || '')}</b></div>`).join('')}</div>`;
  }

  /* ---------- карта компании ---------- */
  function mapSvg(p) {
    const W = 960, H = 600, cx = 480, cy = 300, rx = 252, ry = 176;
    const nodes = p.flow.map((f, i) => {
      const a = (-90 + i * 45) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const x = cx + rx * c, y = cy + ry * s, cw = 176, ch = 66;
      let bx, by;
      if (c > 0.3) { bx = x + 20; by = y - ch / 2; } else if (c < -0.3) { bx = x - 20 - cw; by = y - ch / 2; } else { bx = x - cw / 2; by = s < 0 ? y - 22 - ch : y + 22; }
      return Object.assign({}, f, { x, y, bx, by, cw, ch, a });
    });
    const ring = nodes.map((n, i) => (i ? 'L' : 'M') + n.x.toFixed(1) + ' ' + n.y.toFixed(1)).join(' ') + ' Z';
    const twigs = (n, i) => [-0.34, -0.17, 0, 0.17, 0.34].map((o, j) => {
      const len = 34 + ((i * 7 + j * 13) % 22), a = n.a + Math.PI + o;
      const x2 = n.x + Math.cos(a) * len, y2 = n.y + Math.sin(a) * len;
      return `<line class="twig" x1="${n.x.toFixed(1)}" y1="${n.y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COLOR[n.status]}"/><circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${j === 2 ? 2.6 : 1.8}" fill="${COLOR[n.status]}" opacity=".75"/>`;
    }).join('');
    const coreColor = COLOR[p.pulse.status];
    return `<svg id="map" viewBox="0 0 ${W} ${H}" role="group" aria-label="Карта компании: сквозной поток заказа">
      <defs><radialGradient id="core" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#F3B5A8" stop-opacity=".7"/><stop offset="60%" stop-color="#F6C9C4" stop-opacity=".35"/><stop offset="100%" stop-color="#F6C9C4" stop-opacity="0"/></radialGradient></defs>
      <path class="ring" d="${ring}"/>
      ${nodes.map((n) => `<path class="spoke" d="M${cx} ${cy} Q${((cx + n.x) / 2 + Math.sin(n.a) * 18).toFixed(1)} ${((cy + n.y) / 2 - Math.cos(n.a) * 18).toFixed(1)} ${n.x.toFixed(1)} ${n.y.toFixed(1)}" stroke="${COLOR[n.status]}"/>`).join('')}
      ${nodes.map(twigs).join('')}
      <circle cx="${cx}" cy="${cy}" r="118" fill="url(#core)"/>
      <circle cx="${cx}" cy="${cy}" r="66" fill="rgba(255,255,255,.92)" stroke="${coreColor}" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="76" fill="none" stroke="${coreColor}" stroke-width="1" opacity=".35"/>
      <text class="core-t" x="${cx}" y="${cy - 22}" text-anchor="middle">ПУЛЬС</text>
      <text class="core-v" x="${cx}" y="${cy + 12}" text-anchor="middle">${p.pulse.critical + p.pulse.warn}</text>
      <text class="core-s" x="${cx}" y="${cy + 34}" text-anchor="middle" fill="${coreColor}">${p.pulse.critical ? 'отклонений' : p.pulse.warn ? 'под вниманием' : 'всё в норме'}</text>
      ${nodes.map((n) => `<g class="node" tabindex="0" role="button" data-node="${n.kpi}" aria-label="${esc(n.name)}: ${WORD[n.status]}. ${esc(n.lines.join('. '))}">
        <rect x="${n.bx.toFixed(1)}" y="${n.by.toFixed(1)}" width="${n.cw}" height="${n.ch}" rx="14"/>
        <text class="nm" x="${(n.bx + 14).toFixed(1)}" y="${(n.by + 24).toFixed(1)}">${esc(n.name)}</text>
        ${n.locked ? `<text class="ln" x="${(n.bx + 14).toFixed(1)}" y="${(n.by + 44).toFixed(1)}">${WORD[n.status]} · детали закрыты</text>`
          : n.lines.slice(0, 2).map((l, j) => `<text class="ln" x="${(n.bx + 14).toFixed(1)}" y="${(n.by + 42 + j * 16).toFixed(1)}">${esc(l.length > 27 ? l.slice(0, 26) + '…' : l)}</text>`).join('')}
        <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="15" fill="${COLOR[n.status]}"/><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="21" fill="none" stroke="${COLOR[n.status]}" opacity=".35"/>
        <text class="no" x="${n.x.toFixed(1)}" y="${(n.y + 4).toFixed(1)}" text-anchor="middle">${n.n}</text></g>`).join('')}
    </svg>
    <div class="flow-list">${p.flow.map((n) => `<button class="glass-flat flow-item" data-node="${n.kpi}"><span class="no" style="background:${COLOR[n.status]}">${n.n}</span><span><b>${esc(n.name)}</b> · <span class="st-${n.status}">${WORD[n.status]}</span><small>${esc(n.locked ? 'детали закрыты для вашей роли' : n.lines.join(' · '))}</small></span></button>`).join('')}</div>`;
  }

  /* ---------- плитки и отклонения ---------- */
  function kpiTile(k) {
    if (k.locked) return `<div class="glass-flat kpi locked" aria-label="${esc(k.name)}: ${WORD[k.status]}, значение закрыто"><div class="kpi-top"><span class="kpi-name">${esc(k.name)}</span>${chip(k.status)}</div>
      <div class="lock-note">${I.lock}<span>${esc(k.dept_name)} — значения закрыты для вашей роли</span></div></div>`;
    const d = k.prev != null && k.value != null ? k.value - k.prev : null;
    const good = d == null ? '' : (d * k.dir >= 0 ? 'st-ok' : 'st-bad');
    return `<button class="glass-flat kpi is-${k.status}" data-kpi="${k.id}"><div class="kpi-top"><span class="kpi-name">${esc(k.name)}</span>${chip(k.status)}</div>
      <div class="kpi-val"><b class="num">${fmt(k.value)}</b><span>${esc(k.unit)}</span></div>
      <div class="kpi-meta">план ${fmt(k.plan)}${d != null ? ` · <span class="${good}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span> к прошлому` : ''}</div>
      <div class="kpi-foot"><span class="kpi-fc">прогноз ${fmt(k.forecast)}</span>${spark(k.series, k.status)}</div></button>`;
  }
  const kpisOf = (p) => p.kpis.filter((k) => !S.dept || k.dept === S.dept);
  /* Экран директора словами заказчика: открыл — и по каждому отделу три показателя. */
  function deptCards(p) {
    const list = p.departments.filter((c) => !S.dept || c.id === S.dept || (c.depts || []).includes(S.dept));
    if (!list.length) return '';
    return `<section class="depts" aria-label="Отделы">${list.map((c) => c.hero
      ? `<button class="glass-flat dept hero" data-go="${c.view}"><div><header><h3>${esc(c.name)}</h3>${chip(c.status)}</header>
          <div class="big">${esc(c.metrics[0][1].replace(' %', ''))}<small> %</small></div><p>${esc(c.metrics[0][0])} — главный показатель компании. План 96 %.</p></div>
          <ul>${c.metrics.slice(1).map((m) => `<li><b>${esc(m[1])}</b><span>${esc(m[0])}</span></li>`).join('')}<li><b>${p.pulse.critical}</b><span>показателей требуют решения</span></li></ul></button>`
      : `<button class="glass-flat dept${c.note ? ' wide' : ''}" data-go="${c.view}"><header><h3>${esc(c.name)}</h3>${chip(c.status)}</header>
          <ul>${c.metrics.map((m) => `<li><b>${esc(m[1])}</b><span>${esc(m[0])}</span></li>`).join('')}</ul>${c.note ? `<small>${esc(c.note)}</small>` : ''}</button>`).join('')}</section>`;
  }
  function alertCard(a) {
    return `<article class="glass-flat alert ${a.level}"><div class="row">${chip(a.level)}<span class="who">${esc(a.dept_name)}</span></div>
      <h3>${esc(a.title)}</h3><p>${esc(a.cause)}</p><p class="who">Отвечает: ${esc(a.owner)} · ${esc(a.context)}</p>
      <div class="row"><button class="btn btn-sm" data-kpi="${a.kpi}" data-by="${a.by}">К причине</button><button class="btn btn-sm btn-accent" data-decide="${a.kpi}">Оформить решение</button></div></article>`;
  }

  /* ---------- разделы ---------- */
  const views = {
    pulse(p) {
      const ks = kpisOf(p), al = p.alerts.filter((a) => !S.dept || a.dept === S.dept);
      const lead = p.pulse.critical ? `Из ${p.pulse.total} показателей ${p.pulse.critical} требуют решения, ещё ${p.pulse.warn} — под вниманием. Щёлкните узел карты или показатель, чтобы дойти до причины.`
        : 'Критических отклонений нет. Щёлкните показатель, чтобы увидеть динамику и формулу.';
      return `<header class="page-head"><div><h1>Пульс компании</h1><p class="lead">${lead}</p></div><span class="spacer"></span>
          <button class="btn" data-act="report">${I.report.replace('<svg', '<svg width="17" height="17"')} Отчёт за период</button></header>
        ${deptCards(p)}
        <section class="pulse-grid">
          <div class="glass map-panel"><header><h2 class="sec-title">Карта компании</h2><span class="faint" style="font-size:13px">сквозной поток заказа</span>
            <div class="legend"><span><i style="background:var(--ok)"></i>в норме</span><span><i style="background:var(--warn)"></i>внимание</span><span><i style="background:var(--bad)"></i>плохо</span></div></header>${mapSvg(p)}</div>
          <div class="alerts" id="alerts"><h2 class="sec-title">Требует решения <span class="count">${al.length}</span></h2>
            ${al.length ? (S.allAlerts ? al : al.slice(0, 3)).map(alertCard).join('') : '<div class="glass-flat empty">Отклонений по доступным вам показателям нет.</div>'}
            ${al.length > 3 ? `<button class="btn btn-sm more" data-act="alerts">${S.allAlerts ? 'Свернуть' : 'Показать все: ' + al.length}</button>` : ''}</div>
        </section>
        <section><h2 class="sec-title" style="margin-bottom:12px">Показатели <span class="count">${ks.length}</span></h2><div class="kpi-grid">${ks.map(kpiTile).join('')}</div>
          <p class="src">Период: ${fdate(p.period.from)} — ${fdate(p.period.to)}. Прогноз — на следующий такой же период по движению последних двух недель. У каждого показателя внутри — формула, источник и время обновления.</p></section>`;
    },
    async sales(p) {
      const own = p.kpis.filter((k) => k.dept === 'sales' || k.dept === 'support');
      const open = own.some((k) => !k.locked);
      let body = '';
      if (open) {
        const [steps, prod, chan, rep] = await Promise.all([drill('app_conv', 'step'), drill('revenue', 'product'), drill('revenue', 'channel'), drill('repeat', 'client')]);
        const max = Math.max(...steps.rows.map((r) => r.count), 1);
        body = `<section class="grid2">
          <div class="glass panel"><header><h2>Воронка приложения</h2><span class="spacer"></span><button class="btn btn-sm" data-kpi="app_conv" data-by="step">Подробнее</button></header>
            <div class="funnel">${steps.rows.map((r, i) => `<div class="fstep"><b>${fmt(r.count)}</b><div class="col" style="height:${Math.max(4, (r.count / max) * 130).toFixed(0)}px;animation-delay:${i * 60}ms"></div><span>${esc(r.name)}</span>
              <small class="${r.pass != null && r.pass_prev != null && r.pass < r.pass_prev - 4 ? 'drop' : ''}">${r.pass != null ? 'проходит ' + fmt(r.pass) + ' %' + (r.pass_prev != null ? ' · было ' + fmt(r.pass_prev) : '') : 'вход'}</small></div>`).join('')}</div>
            ${steps.note ? `<p class="note" style="margin-top:14px">${esc(steps.note)}</p>` : ''}<p class="src">Источник: ${esc(steps.source)}</p></div>
          <div class="glass panel"><header><h2>Оборот по продуктам</h2><span class="spacer"></span><button class="btn btn-sm" data-kpi="revenue" data-by="product">Подробнее</button></header>${bars(prod.rows, 'BYN')}
            ${prod.note ? `<p class="note" style="margin-top:14px">${esc(prod.note)}</p>` : ''}</div>
          <div class="glass panel"><header><h2>Оборот по каналам</h2></header>${bars(chan.rows, 'BYN', { calm: true })}<p class="src">Источник: ${esc(chan.source)}</p></div>
          <div class="glass panel"><header><h2>Повторные покупки по типу клиента</h2></header>${bars(rep.rows, '%', { calm: true })}${rep.note ? `<p class="note" style="margin-top:14px">${esc(rep.note)}</p>` : ''}</div>
        </section>`;
      }
      return `<header class="page-head"><div><h1>Продажи и клиент</h1><p class="lead">Воронка, конверсия, средний чек, повторные покупки, каналы и сегменты. Обращения и ответы — данные из действующей системы клиентского сервиса: мы её не заменяем, а подключаемся к ней.</p></div></header>
        <div class="kpi-grid">${own.map(kpiTile).join('')}</div>${body}`;
    },
    async production(p) {
      const own = p.kpis.filter((k) => k.dept === 'production' || k.dept === 'logistics');
      const open = p.kpis.some((k) => k.dept === 'production' && !k.locked);
      let body = '';
      if (open) {
        const [st, rs, fc] = await Promise.all([drill('on_time', 'stage'), drill('defect', 'reason'), cached('forecast', '/api/pult/forecast')]);
        const hot = st.rows.reduce((a, b) => (b.over > a.over ? b : a), st.rows[0]);
        body = `<section class="glass panel"><header><h2>Этапы производства</h2><span class="faint" style="font-size:13px">медиана времени на этапе и доля заказов, ждущих больше двух норм</span></header>
            <div class="stages">${st.rows.map((r) => `<div class="glass-flat stg ${r === hot && r.over > 10 ? 'hot' : ''}"><h3>${esc(r.name)}</h3><span class="big">${fmt(r.value)} ч</span>
              <small>норма ${fmt(r.norm)} ч · было ${fmt(r.prev)} ч</small><small class="${r.over > 10 ? 'st-bad' : ''}">ждут дольше двух норм: ${fmt(r.over)} %</small>
              <small>людей: ${esc(r.staff)}${r.vacancies ? ` · вакансий ${r.vacancies}` : ''}${r.absent ? ` · отсутствуют ${r.absent}` : ''}</small></div>`).join('')}</div>
            ${st.note ? `<p class="note" style="margin-top:14px">${esc(st.note)}</p>` : ''}<p class="src">Источник: ${esc(st.source)} · HR: штат и вакансии</p></section>
          <section class="grid2">
            <div class="glass panel"><header><h2>Спрос и мощность на 6 недель</h2>${fc.deficit_week ? `<span class="chip chip-bad"><i></i>дефицит с ${fdate(fc.deficit_week)}</span>` : chip('ok')}</header>${weeksChart(fc)}
              <p class="note" style="margin-top:12px">${fc.deficit_week ? `С недели ${fdate(fc.deficit_week)} спрос превысит мощность. Узкое место — «${esc(fc.bottleneck)}»: если закрыть вакансии, мощность вернётся к плановой.` : 'Мощности хватает на все шесть недель.'}</p>
              <p class="src">${esc(fc.formula)} Источник: ${esc(fc.source)}</p></div>
            <div class="glass panel"><header><h2>Причины брака</h2><span class="spacer"></span><button class="btn btn-sm" data-kpi="defect" data-by="reason">Подробнее</button></header>${rs.rows.length ? bars(rs.rows, '% брака') : '<p class="empty">Брака за период нет.</p>'}
              ${rs.note ? `<p class="note" style="margin-top:14px">${esc(rs.note)}</p>` : ''}</div>
          </section>
          <section class="glass panel"><header><h2>Заказы, сорвавшие срок</h2><span class="faint" style="font-size:13px">самые долгие за период</span></header>
            <div class="scroll-x"><table class="tbl"><thead><tr><th>Заказ</th><th>Продукт</th><th>Где задержался</th><th>Брак</th><th class="n">Часов до ОТК</th></tr></thead>
            <tbody>${st.orders.map((o) => `<tr><td class="num">${esc(o.id)}</td><td>${esc(o.product)}</td><td>${esc(o.stage)}</td><td>${esc(o.defect || '—')}</td><td class="n">${fmt(o.hours)}</td></tr>`).join('') || '<tr><td colspan="5" class="faint">Таких заказов нет</td></tr>'}</tbody></table></div></section>`;
      }
      return `<header class="page-head"><div><h1>Производство и качество</h1><p class="lead">План и факт выпуска, очередь, время изготовления, загрузка, брак и перепечатка, доставка.</p></div></header>
        <div class="kpi-grid">${own.map(kpiTile).join('')}</div>${body}`;
    },
    async finance(p) {
      const f = await cached('finance', '/api/pult/finance');
      const own = p.kpis.filter((k) => k.dept === 'finance');
      const mname = (m) => ({ '09': 'сентябрь', 10: 'октябрь', 11: 'ноябрь' }[m.slice(5)] || m);
      const head = `<header class="page-head"><div><h1>Финансы и бухгалтерия</h1><p class="lead">План и факт доходов и расходов, деньги и долги на начало и конец месяца, расчёты с контрагентами. В 1С такой отчёт собирают часами — здесь он обновляется сам.</p></div></header>`;
      if (f.locked_fin) return `${head}<div class="glass panel"><div class="lock-note">${I.lock}<span>Финансовые данные закрыты для вашей роли: их видят директор, руководитель финансов и аналитик.</span></div></div>`;
      const months = [...new Set(f.pnl.map((r) => r.month))];
      const pnl = `<div class="glass panel"><header><h2>Доходы и расходы: план и факт</h2><span class="faint" style="font-size:13px">BYN</span></header><div class="scroll-x"><table class="tbl"><thead><tr><th>Статья</th>${months.map((m) => `<th class="n">${mname(m)}: план</th><th class="n">факт</th><th class="n">откл.</th>`).join('')}</tr></thead><tbody>
            ${[...new Set(f.pnl.map((r) => r.article))].map((a) => `<tr><td>${esc(a)}</td>${months.map((m) => { const r = f.pnl.find((x) => x.month === m && x.article === a); const d = 100 * (r.fact - r.plan) / r.plan; const bad = (r.kind === 'доход' ? -d : d) > 3;
              return `<td class="n">${fmt(r.plan)}</td><td class="n">${fmt(r.fact)}</td><td class="n ${bad ? 'st-bad' : 'faint'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} %</td>`; }).join('')}</tr>`).join('')}
          </tbody></table></div><p class="src">Источник: ${esc(f.source)}, обновлено ${ftime(f.synced)}. ${esc(f.fin_note)}. Ноябрь — с начала месяца.</p></div>`;
      const row = (name, a, b, goodUp) => { const d = b - a; const cls = d === 0 ? 'faint' : (d > 0) === goodUp ? 'st-ok' : 'st-bad'; return `<td class="n">${fmt(a)}</td><td class="n">${fmt(b)}</td><td class="n ${cls}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</td>`; };
      const bal = `<div class="glass panel"><header><h2>На начало и конец месяца</h2><span class="faint" style="font-size:13px">BYN</span></header><div class="scroll-x"><table class="tbl"><thead><tr><th>Месяц</th><th class="n">Деньги: начало</th><th class="n">конец</th><th class="n">изм.</th><th class="n">Нам должны: начало</th><th class="n">конец</th><th class="n">изм.</th><th class="n">Мы должны: начало</th><th class="n">конец</th><th class="n">изм.</th></tr></thead><tbody>
          ${f.balances.map((x) => `<tr><td>${mname(x.month)}</td>${row('', x.cash_start, x.cash_end, true)}${row('', x.receivable_start, x.receivable_end, false)}${row('', x.payable_start, x.payable_end, false)}</tr>`).join('')}</tbody></table></div>
          <p class="note" style="margin-top:12px">В ноябре долг покупателей вырос заметнее обычного — стоит посмотреть просрочку по контрагентам.</p></div>`;
      const cps = `<div class="glass panel"><header><h2>Расчёты с контрагентами</h2><span class="spacer"></span><button class="btn btn-sm" data-kpi="overdue_recv" data-by="counterparty">Просрочка подробнее</button></header><div class="scroll-x"><table class="tbl"><thead><tr><th>Контрагент</th><th>Кто</th><th class="n">Долг, BYN</th><th class="n">Просрочено, BYN</th><th class="n">Дней</th></tr></thead><tbody>
          ${f.counterparties.map((c) => `<tr><td>${esc(c.name)}</td><td class="muted">${esc(c.kind)}</td><td class="n">${c.debt < 0 ? 'мы: ' + fmt(-c.debt) : fmt(c.debt)}</td><td class="n ${c.overdue_sum ? 'st-bad' : 'faint'}">${c.overdue_sum ? fmt(c.overdue_sum) : '—'}</td><td class="n ${c.overdue_days > 14 ? 'st-bad' : 'faint'}">${c.overdue_days || '—'}</td></tr>`).join('')}</tbody></table></div>
          <p class="src">Источник: 1С: расчёты с контрагентами. Названия условные — данные тестовые.</p></div>`;
      return `${head}<div class="kpi-grid">${own.map(kpiTile).join('')}</div>${pnl}<section class="grid2">${bal}${cps}</section>`;
    },
    async people(p) {
      const f = await cached('finance', '/api/pult/finance');
      const own = p.kpis.filter((k) => k.dept === 'hr' || k.dept === 'office');
      const maxM = Math.max(1, ...f.moves.map((w) => Math.max(w.hired, w.fired)));
      const moves = `<div class="glass panel"><header><h2>Приём и увольнение по неделям</h2><span class="legend" style="margin-left:auto"><span><i style="background:var(--ok)"></i>принято</span><span><i style="background:var(--brand)"></i>уволено</span></span></header>
          <div class="funnel" style="min-height:150px">${f.moves.map((w, i) => `<div class="fstep"><div style="display:flex;gap:4px;align-items:flex-end;height:100px">
            <div class="col" style="flex:1;background:var(--ok);height:${Math.max(3, w.hired / maxM * 96).toFixed(0)}px;animation-delay:${i * 40}ms" title="Принято: ${w.hired}"></div>
            <div class="col" style="flex:1;height:${Math.max(3, w.fired / maxM * 96).toFixed(0)}px;animation-delay:${i * 40 + 40}ms" title="Уволено: ${w.fired}"></div></div>
            <b>+${w.hired} / −${w.fired}</b><span>${fdate(w.week)}</span></div>`).join('') || '<p class="empty">Движения за период нет.</p>'}</div>
          <p class="src">Источник: ${esc(f.hr_source)}: приём и увольнение. Имён здесь нет.</p></div>`;
      const att = `<div class="glass panel"><header><h2>Явка по табелю за две недели</h2><span class="spacer"></span><button class="btn btn-sm" data-kpi="attendance">Подробнее</button></header>
          <div class="bars">${f.attendance.map((r) => `<div class="bar"><span>${esc(r.name)}</span><span class="tr"><i class="${r.value < 92 ? '' : 'calm'}" style="width:${r.value}%"></i></span><b class="${r.value < 92 ? 'st-bad' : ''}">${fmt(r.value)} %</b></div>`).join('')}</div>
          <p class="src">Вышли на смену ÷ должны были выйти по графику. Источник: HR: табель.</p></div>`;
      const staff = `<div class="glass panel"><header><h2>Штат: работает и по плану</h2></header><div class="bars">${f.staff.flatMap((d) => d.sections && f.staff.length === 1 ? d.sections : [d]).map((d) => `<div class="bar"><span>${esc(d.name)}</span><span class="tr"><i class="${d.fact / d.plan < 0.93 ? '' : 'calm'}" style="width:${(100 * d.fact / d.plan).toFixed(1)}%"></i></span><b>${d.fact} из ${d.plan}</b></div>`).join('')}</div>
          <p class="src">Источник: ${esc(f.hr_source)}, обновлено ${ftime(f.hr_synced)}. Зарплат и личных данных здесь нет.</p></div>`;
      const vac = `<div class="glass panel"><header><h2>Вакансии</h2><span class="cnt">${f.vacancies.length}</span></header>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Должность</th><th>Где</th><th class="n">Открыта, дней</th></tr></thead><tbody>${f.vacancies.map((v) => `<tr><td>${esc(v.title)}</td><td>${esc(v.where)}</td><td class="n ${v.days > 14 ? 'st-bad' : ''}">${v.days}</td></tr>`).join('') || '<tr><td colspan="3" class="faint">Открытых вакансий нет</td></tr>'}</tbody></table></div>
          <h2 style="font-size:15px;margin:16px 0 8px">Отсутствуют сегодня</h2><div class="bars">${f.absences.map((a) => `<div class="bar"><span>${esc(a.where)}</span><span class="faint">${esc(a.kind)}</span><b>${a.people} чел.</b></div>`).join('') || '<p class="empty">Все на месте.</p>'}</div></div>`;
      const o = f.office;
      const office = o ? `<section class="glass panel"><header><h2>Делопроизводство: документы в работе</h2><span class="cnt">${o.open}</span>${o.overdue ? `<span class="chip chip-bad"><i></i>просрочено ${o.overdue}</span>` : ''}<span class="spacer"></span><button class="btn btn-sm" data-kpi="docs_on_time">Кто срывает сроки</button></header>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Документ</th><th>Вид</th><th>Подразделение</th><th class="n">Срок</th></tr></thead><tbody>${o.list.map((d) => `<tr><td class="num">${esc(d.id)}</td><td>${esc(d.kind)}</td><td>${esc(d.dept)}</td><td class="n ${d.overdue ? 'st-bad' : ''}">${fdate(d.due)}${d.overdue ? ' — просрочен' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="faint">Все документы исполнены</td></tr>'}</tbody></table></div>
          <p class="src">Всего в реестре ${fmt(o.total)} документов. Источник: ${esc(o.source)}, обновлено ${ftime(o.synced)}.</p></section>` : '';
      return `<header class="page-head"><div><h1>Кадры и документы</h1><p class="lead">Приём и увольнение, табель, штат и вакансии, документы и поручения в срок — то, что сейчас собирают вручную.</p></div></header>
        <div class="kpi-grid">${own.map(kpiTile).join('')}</div><section class="grid2">${moves}${att}</section><section class="grid2">${staff}${vac}</section>${office}`;
    },
    async decisions() {
      const list = await cached('decisions', '/api/pult/decisions');
      const overdue = list.filter((d) => d.overdue).length;
      return `<header class="page-head"><div><h1>Реестр решений</h1><p class="lead">Каждое решение — проблема, причина, действие, владелец и срок. Закрыть можно только с проверкой: что изменилось после него.${overdue ? ` Просрочено: ${overdue}.` : ''}</p></div>
          <span class="spacer"></span><button class="btn btn-primary" data-act="newDecision">${I.plus.replace('<svg', '<svg width="16" height="16"')} Новое решение</button></header>
        <div class="board">${STATUSES.map((s) => { const items = list.filter((d) => d.status === s);
          return `<section class="glass col" aria-label="${s}"><header>${s[0].toUpperCase() + s.slice(1)} <span class="cnt">${items.length}</span></header>
            ${items.map((d) => `<button class="glass-flat card" data-decision="${d.id}"><h3>${esc(d.title)}</h3><div class="meta"><span>${esc(d.owner)}</span><span>·</span><span class="${d.overdue ? 'st-bad' : ''}">срок ${fdate(d.due)}${d.overdue ? ' — просрочено' : ''}</span></div>
              <div class="meta"><span class="chip ${d.priority === 'высокий' ? 'chip-bad' : ''}">${esc(d.priority)}</span><span class="faint">${esc(d.id)}</span></div></button>`).join('') || '<p class="empty">Пусто</p>'}</section>`; }).join('')}</div>`;
    },
    async data() {
      let ql = null, qerr = null;
      if (['director', 'analyst'].includes(S.user.role)) { try { ql = await cached('quality', '/api/pult/quality'); } catch (e) { qerr = e; } }
      const audit = await api('/api/pult/audit');
      const src = ql ? `<section class="glass panel"><header><h2>Источники данных</h2><span class="faint" style="font-size:13px">пять систем связаны по номеру заказа и клиента</span></header>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Система</th><th>Обновлено</th><th>Свежесть</th><th class="n">Записей</th><th class="n">Пропуски</th><th class="n">Дубли</th></tr></thead><tbody>
          ${ql.sources.map((s) => `<tr><td>${esc(s.system)}</td><td class="num">${ftime(s.synced)}</td><td>${chip(s.status)} <span class="faint">${fmt(s.age_h)} ч назад</span></td><td class="n">${fmt(s.rows)} <span class="faint">${esc(s.what)}</span></td>
            <td class="n ${s.gaps ? 'st-warn' : ''}">${s.gaps}${s.gap_note && s.gaps ? ` <span class="faint">${esc(s.gap_note)}</span>` : ''}</td><td class="n ${s.dups ? 'st-warn' : ''}">${s.dups}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="glass panel"><header><h2>Сверка оборота: производство и учёт</h2></header><div class="scroll-x"><table class="tbl"><thead><tr><th>Месяц</th><th class="n">ERP, BYN</th><th class="n">1С, BYN</th><th class="n">Расхождение</th><th>Итог</th></tr></thead><tbody>
          ${ql.reconciliation.map((r) => `<tr><td>${esc(r.month)}</td><td class="n">${fmt(r.erp)}</td><td class="n">${fmt(r.fin)}</td><td class="n ${r.diff ? 'st-warn' : ''}">${fmt(r.diff)}</td><td>${r.status === 'ok' ? chip('ok') : '<span class="chip chip-warn"><i></i>расходится</span>'}</td></tr>`).join('')}</tbody></table></div>
          <p class="note" style="margin-top:12px">${esc(ql.note)} Заказы: ${ql.unposted.map(esc).join(', ')}.</p></section>`
        : `<section class="glass panel"><header><h2>Источники данных</h2></header><div class="lock-note">${I.lock}<span>${qerr ? esc(qerr.message) : 'Качество данных и сверку видят директор и аналитик.'}</span></div></section>`;
      return `<header class="page-head"><div><h1>Данные и журнал</h1><p class="lead">Насколько можно верить цифрам и кто что менял: пользователь, время, действие, объект, результат.</p></div></header>${src}
        <section class="glass panel"><header><h2>Журнал действий</h2><span class="faint" style="font-size:13px">${S.user.role === 'head' ? 'ваши действия и решения вашего подразделения' : 'все пользователи'}</span></header>
          <div class="scroll-x"><table class="tbl"><thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th><th>Объект</th><th>Результат</th><th>Подробности</th></tr></thead><tbody>
          ${audit.slice(0, 60).map((a) => `<tr><td class="num">${ftime(a.ts)}</td><td>${esc(a.who)}</td><td>${esc(a.action)}</td><td class="num">${esc(a.object || '—')}</td><td class="${a.result === 'отказ' ? 'st-bad' : ''}">${esc(a.result || 'ok')}</td><td class="muted">${esc(a.detail || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="faint">Записей пока нет</td></tr>'}</tbody></table></div></section>`;
    },
  };
  function weeksChart(fc) {
    const W = 520, H = 210, L = 40, R = 10, T = 16, B = 30, n = fc.weeks.length;
    const max = Math.max(...fc.weeks.map((w) => Math.max(w.demand, w.capacity, w.capacity_plan || 0))) * 1.1;
    const bw = (W - L - R) / n, Y = (v) => T + (1 - v / max) * (H - T - B);
    const line = (key) => fc.weeks.map((w, i) => { const v = w[key] || w.capacity; return `${i ? 'L' : 'M'}${(L + i * bw).toFixed(1)} ${Y(v).toFixed(1)} L${(L + (i + 1) * bw).toFixed(1)} ${Y(v).toFixed(1)}`; }).join(' ');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Спрос и мощность по неделям">
      ${[0, 0.5, 1].map((k) => `<line x1="${L}" x2="${W - R}" y1="${Y(max * k / 1.1).toFixed(1)}" y2="${Y(max * k / 1.1).toFixed(1)}" stroke="var(--edge)"/><text x="${L - 6}" y="${(Y(max * k / 1.1) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--ink4)" font-family="JetBrains Mono">${fmt(max * k / 1.1)}</text>`).join('')}
      ${fc.weeks.map((w, i) => { const over = !w.fact && w.demand > w.capacity; return `<rect x="${(L + i * bw + 5).toFixed(1)}" y="${Y(w.demand).toFixed(1)}" width="${(bw - 10).toFixed(1)}" height="${(H - B - Y(w.demand)).toFixed(1)}" rx="5" fill="${over ? 'var(--bad)' : w.fact ? 'var(--ink4)' : 'var(--brand2)'}" opacity="${w.fact ? 0.5 : 0.85}"><title>Неделя с ${fdate(w.week)}: спрос ${w.demand}, мощность ${w.capacity}</title></rect>
        <text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="${w.week === fc.deficit_week ? 'var(--bad)' : 'var(--ink4)'}" font-family="JetBrains Mono">${fdate(w.week)}</text>`; }).join('')}
      <path d="${line('capacity_plan')}" fill="none" stroke="var(--ok)" stroke-width="1.6" stroke-dasharray="5 5" opacity=".8"/>
      <path d="${line('capacity')}" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <text x="${W - R}" y="${T - 2}" text-anchor="end" font-size="11" fill="var(--ink3)">столбики — спрос (светлые — факт) · тёмная линия — мощность сейчас · пунктир — после закрытия вакансий</text>
    </svg>`;
  }
  async function renderView() {
    const el = $('#view'); if (!el) return;
    const my = ++S.seq;
    if (S.err) { el.innerHTML = errorBox(S.err); return; }
    if (!S.pulse) return;
    try {
      const html = await views[S.view](S.pulse);
      if (my !== S.seq) return;
      el.innerHTML = html;
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
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
    const k = S.pulse.kpis.find((x) => x.id === id);
    if (!k) return;
    if (k.locked) { toast('Показатель закрыт для вашей роли'); return; }
    const dim = by && k.dims.some((d) => d.id === by) ? by : k.dims[0].id;
    openLayer(`<aside class="drawer glass" role="dialog" aria-modal="true" aria-label="${esc(k.name)}">
      <header><div style="flex:1"><p class="eyebrow">${esc(k.dept_name)}</p><h2>${esc(k.name)}</h2></div>${chip(k.status)}<button class="btn btn-icon btn-ghost" data-act="closeLayer" aria-label="Закрыть">${I.close.replace('<svg', '<svg width="18" height="18"')}</button></header>
      <div class="drawer-body">
        <div class="facts"><div class="fact"><small>Сейчас</small><b>${fmt(k.value)}</b> <span class="faint">${esc(k.unit)}</span></div><div class="fact"><small>План</small><b>${fmt(k.plan)}</b></div>
          <div class="fact"><small>Прошлый период</small><b>${fmt(k.prev)}</b></div><div class="fact"><small>Прогноз</small><b>${fmt(k.forecast)}</b></div></div>
        ${lineChart(k)}
        <div><p class="eyebrow" style="margin-bottom:8px">От показателя к причине</p><div class="tabs" id="dims">${k.dims.map((d) => `<button data-dim="${d.id}" aria-pressed="${d.id === dim}">${esc(d.name)}</button>`).join('')}</div></div>
        <div id="drill"><div class="skel"></div></div>
        <dl class="dl"><dt>Как считается</dt><dd>${esc(k.formula)}</dd><dt>Источник</dt><dd>${esc(k.source)}</dd><dt>Обновлено</dt><dd class="num">${ftime(k.updated)}</dd>${k.extra ? `<dt>Ещё</dt><dd>${esc(k.extra)}</dd>` : ''}</dl>
      </div>
      <footer>${k.status !== 'ok' ? `<button class="btn btn-accent" data-decide="${k.id}">Оформить решение</button>` : ''}<button class="btn" data-act="closeLayer">Закрыть</button></footer></aside>`);
    const show = async (d) => {
      $$('#dims button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.dim === d));
      const box = $('#drill'); if (!box) return;
      box.innerHTML = '<div class="skel"></div>';
      try {
        const r = await drill(id, d);
        if (!$('#drill')) return;
        S.lastDrill = r;
        const rows = d === 'day' ? r.rows.slice(-14) : r.rows;
        box.innerHTML = `${r.note ? `<p class="note" style="margin-bottom:12px">${esc(r.note)}</p>` : ''}${bars(rows, r.unit === 'BYN' ? 'BYN' : r.unit)}
          ${r.orders && r.orders.length ? `<p class="eyebrow" style="margin:16px 0 6px">Заказы, сорвавшие срок</p><table class="tbl"><tbody>${r.orders.slice(0, 5).map((o) => `<tr><td class="num">${esc(o.id)}</td><td>${esc(o.product)}</td><td>${esc(o.stage)}</td><td class="n">${fmt(o.hours)} ч</td></tr>`).join('')}</tbody></table>` : ''}`;
      } catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
    };
    $('#dims').onclick = (e) => { const b = e.target.closest('[data-dim]'); if (b) show(b.dataset.dim); };
    show(dim);
  }

  async function openDecisionForm(pre) {
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
          S.draft = null; delete S.cache['decisions|' + q()]; closeLayer();
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
        ${k && !k.locked ? `<div class="note"><b>Повторная проверка.</b> ${esc(k.name)}: ${d.kpi_start != null ? 'при создании ' + fmt(d.kpi_start) + ' → ' : ''}сейчас ${fmt(k.value)} ${esc(k.unit)}, план ${fmt(k.plan)}. ${chip(k.status)}</div>` : ''}
        <form id="updForm" style="display:flex;flex-direction:column;gap:12px">
          <div class="frow"><label class="field">Статус<select class="select" name="status">${STATUSES.map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="field">Срок<input class="input" type="date" name="due" value="${esc(d.due)}"></label></div>
          <label class="field">Комментарий<textarea class="textarea" name="comment" placeholder="Что сделано или почему сдвигаем"></textarea></label>
          <label class="field">Что изменилось после решения (нужно, чтобы закрыть)<textarea class="textarea" name="effect" placeholder="Например: заказы в срок 91 % → 96 %">${esc(d.effect || '')}</textarea></label>
          <p class="err" role="alert"></p>
        </form>
        <div><p class="eyebrow" style="margin-bottom:8px">История изменений</p><ul class="hist">${(d.history || []).slice().reverse().map((h) => `<li><time>${ftime(h.ts)}</time><span><b>${esc(h.who)}</b> — ${esc(h.change)}</span></li>`).join('')}</ul></div>
      </div><footer><button class="btn btn-primary" id="updSave">Сохранить изменения</button><button class="btn" data-act="closeLayer">Закрыть</button></footer></aside>`);
    $('#updSave').onclick = async (e) => {
      const f = $('#updForm'); e.target.disabled = true;
      try {
        await api('/api/pult/decisions/' + id, { body: { status: f.status.value, due: f.due.value, comment: f.comment.value, effect: f.effect.value } });
        delete S.cache['decisions|' + q()]; closeLayer(); toast('Изменения сохранены и записаны в историю');
        if (S.view === 'decisions') renderView();
      } catch (err) { $('.err', f).textContent = err.message; e.target.disabled = false; }
    };
  }

  /* Отчёт за период: то, что в 1С собирают часами, — за секунды из тех же данных, что на экране. */
  async function openReport() {
    const t0 = performance.now();
    const p = S.pulse;
    let decs = [];
    try { decs = await cached('decisions', '/api/pult/decisions'); } catch (e) { /* без решений */ }
    const open = decs.filter((d) => d.status !== 'закрыто');
    const ms = Math.max(1, Math.round(performance.now() - t0));
    openLayer(`<article class="report" role="dialog" aria-modal="true" aria-label="Отчёт за период">
      <header><b style="flex:1">Отчёт собран за ${ms < 1000 ? ms + ' мс' : fmt(ms / 1000) + ' с'}</b><button class="btn btn-primary" id="printRep">Печать или PDF</button><button class="btn" data-act="closeLayer">Закрыть</button></header>
      <div class="report-body">
        <div><p class="eyebrow">Фотопринт · управленческий отчёт</p><h1>Итоги за ${fdate(p.period.from)} — ${fdate(p.period.to)}</h1>
          <p class="muted">Данные на ${ftime(p.asof)}. Составил: ${esc(S.user.name)}, ${esc(S.user.title.toLowerCase())}. Из ${p.pulse.total} показателей требуют решения ${p.pulse.critical}, под вниманием ${p.pulse.warn}.</p></div>
        <section><h2>Отделы</h2><table class="tbl"><tbody>${p.departments.map((c) => `<tr><td><b>${esc(c.name)}</b></td>${c.metrics.map((m) => `<td>${esc(m[0])}: <b>${esc(m[1])}</b></td>`).join('')}<td>${chip(c.status)}</td></tr>`).join('')}</tbody></table></section>
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
      { t: 'Отчёт за период', s: 'действие', run: openReport },
      ...S.pulse.kpis.filter((k) => !k.locked).map((k) => ({ t: k.name, s: `показатель · ${fmt(k.value)} ${k.unit}`, run: () => openKpi(k.id) })),
      ...decs.map((d) => ({ t: d.title, s: `решение ${d.id} · ${d.status}`, run: () => openDecision(d.id) })),
      { t: 'Новое решение', s: 'действие', run: () => openDecisionForm({}) },
      { t: 'Спросить помощника', s: 'действие', run: openChat },
      { t: 'Выйти', s: 'действие', run: () => logout() },
    ];
    lastFocus = document.activeElement;
    $('#layer').innerHTML = `<div class="scrim" data-act="closeLayer"></div><div class="palette glass" role="dialog" aria-modal="true" aria-label="Поиск и команды">
      <input id="palIn" placeholder="Раздел, показатель или решение" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="palList"><ul id="palList" role="listbox"></ul></div>`;
    let sel = 0, shown = items;
    const draw = () => { $('#palList').innerHTML = shown.slice(0, 40).map((x, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}">${esc(x.t)}<small>${esc(x.s)}</small></li>`).join('') || '<li class="faint">Ничего не нашлось</li>';
      const cur = $('#palList [aria-selected="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest' }); };
    const inp = $('#palIn');
    inp.oninput = () => { const s = inp.value.trim().toLowerCase(); shown = items.filter((x) => (x.t + ' ' + x.s).toLowerCase().includes(s)); sel = 0; draw(); };
    inp.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, Math.min(shown.length, 40) - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[sel]) { const x = shown[sel]; closeLayer(); x.run(); }
    };
    $('#palList').onclick = (e) => { const li = e.target.closest('[data-i]'); if (li) { const x = shown[+li.dataset.i]; closeLayer(); x.run(); } };
    draw(); inp.focus();
  }

  /* ---------- помощник ---------- */
  function openChat() {
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
    const t = e.target.closest('[data-act],[data-kpi],[data-decide],[data-decision],[data-node],[data-go]');
    if (!t) return;
    if (t.dataset.act === 'closeLayer') return closeLayer();
    if (t.dataset.act === 'load') return load();
    if (t.dataset.act === 'rerender') return renderView();
    if (t.dataset.act === 'newDecision') return openDecisionForm({});
    if (t.dataset.act === 'report') return openReport();
    if (t.dataset.act === 'alerts') { S.allAlerts = !S.allAlerts; return renderView(); }
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.decide) return openDecisionForm({ kpi: t.dataset.decide });
    if (t.dataset.decision) return openDecision(t.dataset.decision);
    if (t.dataset.kpi) return openKpi(t.dataset.kpi, t.dataset.by);
    if (t.dataset.node) return openKpi(t.dataset.node);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && S.pulse) { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') { if ($('#layer').innerHTML) closeLayer(); else if ($('#chat')) $('#chatX').click(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('#map .node')) { e.preventDefault(); openKpi(e.target.dataset.node); }
  });
  window.addEventListener('offline', () => toast('Нет сети. Данные на экране могли устареть, введённое в формах сохранено.'));
  window.addEventListener('online', () => toast('Сеть вернулась', { label: 'Обновить данные', run: reload }));

  start();
})();
