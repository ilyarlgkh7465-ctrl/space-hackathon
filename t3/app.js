/* Трек 3 — помощник руководителя ООО «Фотопринт»: встречи и протоколы, документы, задачи, итоги, защита.
   Все данные — с сервера по токену (assistant_api.py, адреса /api/assistant/…). Права проверяет сервер:
   интерфейс показывает только то, что сервер отдал этой учётной записи. Без модели работает встроенная логика. */
(function () {
  'use strict';
  const app = document.getElementById('app');
  const modalEl = document.getElementById('modal');
  const TOKEN_KEY = 'fp-t3-token';
  const DRAFT_KEY = 'fp-t3-drafts';
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const TODAY = isoDay(new Date());
  const LOGINS = [['director', 'Директор'], ['production', 'Руководитель производства'], ['sales', 'Руководитель продаж'],
    ['support', 'Руководитель поддержки'], ['logistics', 'Руководитель логистики'], ['finance', 'Руководитель финансов'],
    ['hr', 'Руководитель по персоналу'], ['operator', 'Мастер участка сборки'], ['quality', 'Контролёр качества'], ['analyst', 'Аналитик']];
  const STATUSES = ['решено', 'предложено', 'обсуждалось', 'требует уточнения'];
  const ST_CHIP = { 'решено': 'chip chip-ok', 'предложено': 'chip chip-accent', 'обсуждалось': 'chip', 'требует уточнения': 'chip chip-warn' };
  const TASK_COLS = [['needs_info', 'Требует уточнения'], ['new', 'Новые'], ['in_progress', 'В работе'], ['overdue', 'Просрочено'], ['done', 'Готово']];

  /* ---------- состояние ---------- */
  const qs = new URLSearchParams(location.search);
  const S = {
    me: null, people: [], tab: qs.get('tab') || 'meetings', health: { mode: 'off' },
    meetings: [], meetingId: qs.get('m') || null, mview: {}, tr: {}, hlLine: null,
    drafts: loadDrafts(), busy: {}, saved: {},
    docs: [], docsHidden: 0, docsTotal: 0, docId: null, hl: null, answer: null, qText: '',
    tasks: [], tasksHidden: 0, check: [], filter: 'all',
    audit: [], access: null, probe: null, maskCheck: null, localState: null, err: null,
  };

  /* ---------- запросы к серверу с токеном ---------- */
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
  async function call(path, body) {
    const opt = { headers: { 'Content-Type': 'application/json' } };
    const t = token();
    if (t) opt.headers.Authorization = 'Bearer ' + t;
    if (body !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(path, opt); } catch (e) { throw new Error('Сервер не отвечает. Проверьте, что он запущен, и повторите — введённое не потеряется.'); }
    let d = {};
    try { d = await r.json(); } catch (e) { /* пустой ответ */ }
    if (r.status === 401 && path !== '/api/login') { signOut(true); throw new Error('Сессия закончилась — войдите снова.'); }
    if (!r.ok) { const er = new Error(d.error || ('Ошибка сервера ' + r.status)); er.status = r.status; er.data = d; throw er; }
    return d;
  }
  const fail = (e) => { toast(e.message || String(e), 4200); };

  /* ---------- черновики протоколов не теряются при перезагрузке (ОТ-05) ---------- */
  function loadDrafts() { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch (e) { return {}; } }
  function saveDrafts() { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(S.drafts)); } catch (e) { /* приватный режим */ } }
  window.addEventListener('beforeunload', (e) => { if (Object.keys(S.drafts).length) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- люди ---------- */
  const person = (id) => S.people.find((p) => p.id === id);
  const pname = (id) => (person(id) || {}).name || (id ? id : 'не назначен');
  const HUES = ['#E8EEFC', '#EAF6EF', '#FDF2E6', '#F3EDFB', '#FCEDEF', '#E6F4F6', '#F6F3E2', '#EEF0F3'];
  const initials = (id) => { const p = person(id); return p ? p.name.split(' ').slice(0, 2).map((w) => w[0]).join('') : '?'; };
  const ava = (id) => id ? '<span class="ava" aria-hidden="true" style="background:' + HUES[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length] + '">' + esc(initials(id)) + '</span>' : '';
  const isLead = () => S.me && (S.me.role === 'director' || S.me.role === 'head');
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const dLabel = (iso) => iso ? new Date(iso.length > 10 ? iso : iso + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
  const dueLabel = (iso) => iso ? 'до ' + dLabel(iso) : 'без срока';
  const dayLabel = (iso) => { const t = new Date(iso).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const timeLabel = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

  /* ================= ВХОД ================= */
  function renderLogin(msg) {
    document.getElementById('nav').hidden = true;
    document.getElementById('me').hidden = true;
    app.innerHTML = '<div class="login card"><h2 class="sec">Вход в помощник</h2>' +
      '<p class="sec-lead">Помощник видит ровно то, что положено вашей роли: права проверяет сервер по учётной записи.</p>' +
      '<form data-act="login" class="stack" style="margin-top:14px">' +
      '<div class="field"><label for="lg">Учётная запись</label><select class="select" id="lg">' +
      LOGINS.map(([l, t]) => '<option value="' + l + '">' + esc(t) + ' — ' + l + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="pw">Пароль</label><input class="input" id="pw" type="password" autocomplete="current-password" placeholder="тестовый пароль — в README"></div>' +
      (msg ? '<p class="err" role="alert">' + esc(msg) + '</p>' : '') +
      '<button class="btn btn-primary" type="submit">Войти</button></form>' +
      '<p class="hint" style="margin-top:12px">Чтобы сравнить роли, откройте помощник во второй вкладке и войдите под другой учётной записью.</p></div>';
    const pw = document.getElementById('pw'); if (pw) pw.focus();
  }
  async function signIn(login, password) {
    try {
      const r = await call('/api/login', { login, password });
      sessionStorage.setItem(TOKEN_KEY, r.token);
      await boot();
    } catch (e) { renderLogin(e.status === 401 ? 'Неверный логин или пароль.' : e.message); }
  }
  function signOut(expired) {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* */ }
    S.me = null; S.answer = null; S.audit = []; S.access = null; window.FPVoice.reset();
    renderLogin(expired ? 'Сессия закончилась — войдите снова.' : '');
  }

  /* ================= ВСТРЕЧИ И ПРОТОКОЛ (сценарий 3) ================= */
  async function loadMeetings() {
    const r = await call('/api/assistant/meetings');
    S.meetings = r.meetings.sort((a, b) => a.start.localeCompare(b.start));
    if (!S.meetings.find((m) => m.id === S.meetingId)) S.meetingId = (S.meetings.find((m) => m.status !== 'planned') || S.meetings[0] || {}).id || null;
  }
  async function loadTranscript(m) {
    if (!m || !m.transcript_id || S.tr[m.id]) return;
    const r = await call('/api/assistant/meetings/' + m.id);
    S.tr[m.id] = r.transcript;
    Object.assign(m, r.meeting);
  }
  function renderMeetings() {
    const days = {};
    S.meetings.forEach((m) => { (days[m.start.slice(0, 10)] = days[m.start.slice(0, 10)] || []).push(m); });
    const list = Object.keys(days).map((d) => '<div><div class="day-label">' + esc(dayLabel(d + 'T12:00')) + '</div>' + days[d].map((m) => {
      const chip = m.protocol ? '<span class="chip chip-ok">протокол утверждён</span>' : S.drafts[m.id] ? '<span class="chip chip-warn">черновик</span>'
        : m.transcript_id ? '<span class="chip">есть расшифровка</span>' : '<span class="chip">запланирована</span>';
      return '<button class="meet" data-act="meeting" data-id="' + m.id + '" aria-current="' + (m.id === S.meetingId) + '">' +
        '<div class="meet-time">' + timeLabel(m.start) + ' · ' + m.minutes + ' мин</div><div class="meet-title">' + esc(m.title) + '</div>' +
        '<div class="meet-foot"><span class="avas">' + m.participants.slice(0, 6).map(ava).join('') + '</span>' + chip + '</div></button>';
    }).join('') + '</div>').join('');
    const m = S.meetings.find((x) => x.id === S.meetingId);
    return '<div class="sec-head"><div><h2 class="sec">Встречи</h2><p class="sec-lead">Протокол из расшифровки: решения, вопросы, риски и задачи со ссылкой на реплику. В реестр — только после вашего подтверждения.</p></div></div>' +
      (S.meetings.length ? '<div class="meet-grid"><div class="week">' + list + '</div><section class="card detail">' + (m ? renderMeeting(m) : '') + '</section></div>'
        : '<p class="empty">Вы не участвуете ни в одной встрече этой недели. Встречи видят только их участники и директор.</p>');
  }
  function renderMeeting(m) {
    const v = S.mview[m.id] || (m.protocol ? 'protocol' : m.transcript_id ? 'protocol' : 'info');
    const head = '<div class="detail-head"><div><div class="eyebrow">' + esc(dayLabel(m.start)) + ' · ' + timeLabel(m.start) + ' · ' + m.minutes + ' мин</div>' +
      '<h2>' + esc(m.title) + '</h2><p class="goal">' + esc(m.goal || '') + '</p>' +
      '<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:10px">' + m.participants.map((id) => '<span class="person">' + ava(id) + esc(pname(id)) + '</span>').join('') + '</div></div></div>';
    if (!m.transcript_id) {
      return head + '<p class="empty">Встреча ещё не прошла — расшифровки нет. Подготовка повестки и приглашения (сценарии 1–2) появятся здесь.</p>';
    }
    const steps = '<div class="steps" role="tablist">' + [['transcript', 'Расшифровка'], ['protocol', 'Протокол']].map(([k, l], i) =>
      '<button role="tab" data-act="mview" data-v="' + k + '" aria-selected="' + (v === k) + '"><span class="n">' + (i + 1) + '</span>' + l + '</button>').join('') + '</div>';
    return head + steps + (v === 'transcript' ? renderTranscript(m) : renderProtocol(m));
  }
  function renderTranscript(m) {
    const tr = S.tr[m.id];
    if (!tr) return '<p class="muted typing">Загружаю расшифровку</p>';
    return '<div class="transcript">' + tr.lines.map((ln, i) => '<div class="tline' + (S.hlLine === i ? ' hl' : '') + '" id="ln-' + i + '">' +
      '<span class="mono t">' + esc(ln.t) + '</span><span class="who">' + ava(ln.s) + esc(pname(ln.s)) + '</span><span class="tx">' + esc(ln.text) + '</span></div>').join('') +
      '</div><p class="hint" style="margin-top:10px">' + (tr.control ? 'Контрольная расшифровка для приёмки: эталон задач — в data/eval/control.json. ' : '') +
      'Тестовая расшифровка. На живой встрече текст приходит из распознавания речи на сервере компании.</p>' +
      (m.protocol ? '' : '<div class="actions" style="margin-top:12px"><button class="btn btn-primary" data-act="draft">Составить протокол →</button></div>');
  }
  const lineLink = (m, line, t) => line == null ? '' : '<button class="cite" data-act="line" data-m="' + m.id + '" data-l="' + line + '" title="Открыть реплику в расшифровке">' + esc(t || ('реплика ' + line)) + '</button>';

  async function makeDraft(m) {
    if (!isLead()) { toast('Протокол утверждает руководитель. Вы можете читать расшифровку и протокол.'); return; }
    S.busy[m.id] = 'draft'; S.mview[m.id] = 'protocol'; render();
    try {
      const p = await call('/api/assistant/protocol', { meeting_id: m.id });
      p.key = uid();
      p.tasks.forEach((t) => { t.skip = false; });
      S.drafts[m.id] = p; saveDrafts();
    } catch (e) { fail(e); }
    S.busy[m.id] = null; render();
  }
  function renderProtocol(m) {
    if (S.busy[m.id] === 'draft') return '<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Составляю протокол</b><p class="muted typing">Ищу решения, поручения, сроки и риски в расшифровке</p></div></div>';
    if (m.protocol) return renderSaved(m);
    const d = S.drafts[m.id];
    if (!d) {
      return '<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Составить протокол по расшифровке?</b>' +
        '<p class="muted" style="margin-top:4px">Разделю пункты на «решено», «предложено», «обсуждалось» и «требует уточнения», выпишу задачи с владельцем, сроком и ссылкой на реплику. ' +
        'Если владелец или срок не названы — не выдумываю, а помечаю «требует уточнения». Ничего не сохраняю без вашего подтверждения.</p>' +
        '<div class="actions" style="margin-top:12px">' + (isLead() ? '<button class="btn btn-primary" data-act="draft">Составить протокол</button>' : '<span class="chip">утверждает руководитель</span>') +
        '<button class="btn" data-act="mview" data-v="transcript">Посмотреть расшифровку</button></div></div></div>';
    }
    const opts = (sel) => '<option value="">— не назначен —</option>' + S.people.map((p) => '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name + ' · ' + p.title) + '</option>').join('');
    const nT = d.tasks.filter((t) => !t.skip).length;
    const unclear = d.tasks.filter((t) => !t.skip && (!t.owner || !t.due)).length;
    return '<div class="stack proto">' +
      '<div class="prov">' + provBadge(d) + '</div>' +
      '<div class="field"><label for="psum">Итог встречи</label><textarea class="textarea" id="psum" data-f="summary" style="min-height:64px">' + esc(d.summary) + '</textarea></div>' +
      '<div><h4 class="h4">Пункты протокола</h4><table class="table ptable"><thead><tr><th>Пункт</th><th>Статус</th><th>Основание</th><th></th></tr></thead><tbody>' +
      d.points.map((p, i) => '<tr class="' + (p.skip ? 'skipped' : '') + '"><td><input data-pt="' + i + '" data-f="text" value="' + esc(p.text) + '" aria-label="Пункт ' + (i + 1) + '"></td>' +
        '<td><select data-pt="' + i + '" data-f="status" aria-label="Статус пункта">' + STATUSES.map((s) => '<option' + (s === p.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td>' +
        '<td>' + lineLink(m, p.line, p.t) + '</td><td><button class="x" data-act="pt-del" data-i="' + i + '" aria-label="Убрать пункт">×</button></td></tr>').join('') +
      '</tbody></table><button class="btn btn-sm btn-ghost" data-act="pt-add" style="margin-top:6px">+ Пункт</button></div>' +
      '<div><h4 class="h4">Задачи · ' + nT + (unclear ? ' · требует уточнения: ' + unclear : '') + '</h4><table class="table ptable tasks"><thead><tr><th>Задача</th><th>Ответственный</th><th>Срок</th><th>Основание</th><th></th></tr></thead><tbody>' +
      d.tasks.map((t, i) => {
        const sug = [];
        if (!t.owner && t.suggested_owner) sug.push('<button class="sugg-chip" data-act="sug-owner" data-i="' + i + '">Помощник предлагает: ' + esc(pname(t.suggested_owner)) + '</button>');
        if (!t.due && t.suggested_due) sug.push('<button class="sugg-chip" data-act="sug-due" data-i="' + i + '">Предложить срок: ' + esc(dLabel(t.suggested_due)) + '</button>');
        const flags = [!t.owner ? 'нет владельца' : '', !t.due ? 'нет срока' : ''].filter(Boolean);
        return '<tr class="' + (t.skip ? 'skipped' : '') + '"><td><input data-tk="' + i + '" data-f="title" value="' + esc(t.title) + '" aria-label="Задача ' + (i + 1) + '">' +
          (flags.length ? '<div class="flags"><span class="chip chip-warn">требует уточнения: ' + flags.join(', ') + '</span>' + sug.join('') + '</div>' : '') + '</td>' +
          '<td><select data-tk="' + i + '" data-f="owner" aria-label="Ответственный">' + opts(t.owner) + '</select></td>' +
          '<td><input type="date" data-tk="' + i + '" data-f="due" value="' + esc(t.due || '') + '" aria-label="Срок"></td>' +
          '<td>' + lineLink(m, t.line, t.t) + '</td>' +
          '<td><button class="x" data-act="tk-del" data-i="' + i + '" aria-label="' + (t.skip ? 'Вернуть задачу' : 'Не создавать задачу') + '">' + (t.skip ? '↺' : '×') + '</button></td></tr>';
      }).join('') + '</tbody></table><button class="btn btn-sm btn-ghost" data-act="tk-add" style="margin-top:6px">+ Задача</button></div>' +
      (d.risks.length ? '<div><h4 class="h4">Риски</h4><ul class="risks">' + d.risks.map((r) => '<li>' + esc(r.text) + ' ' + lineLink(m, r.line, r.t) + '</li>').join('') + '</ul></div>' : '') +
      feedbackRow('protocol:' + m.id) +
      '<div class="actions"><button class="btn btn-primary" data-act="preview">Сохранить протокол и задачи…</button>' +
      '<button class="btn" data-act="redraft">Составить заново</button><button class="btn btn-ghost" data-act="discard">Отменить черновик</button></div>' +
      '<p class="hint">Пока вы не нажали «Подтвердить», в реестре ничего не меняется. Черновик сохраняется в этой вкладке.</p></div>';
  }
  function provBadge(d) {
    if (d.fallback) return '<span class="chip">Встроенная логика' + (d.reason ? ' · ' + esc(d.reason) : '') + '</span><span>Модель не использовалась: разбор правилами на сервере.</span>';
    return '<span class="chip chip-accent">' + esc(d.provider || 'модель') + '</span><span>Имена заменены кодами сотрудников до отправки' + (d.outside ? ', суммы и контакты замаскированы' : '') + '.</span>';
  }
  function renderSaved(m) {
    const p = m.protocol;
    const tasks = S.tasks.filter((t) => (p.task_ids || []).includes(t.id));
    return '<div class="stack"><div class="ai-note"><div class="ai-ava">✓</div><div class="ai-body"><b>Протокол утверждён</b>' +
      '<p class="muted">' + esc(pname(p.approved_by)) + ' · ' + esc(fmt.dt(p.approved_at)) + (p.provider ? ' · ' + esc(p.provider) : '') + '</p>' +
      '<p style="margin-top:6px">' + esc(p.summary) + '</p></div></div>' +
      '<div><h4 class="h4">Пункты</h4><ul class="list">' + p.points.map((x) => '<li><span><span class="' + (ST_CHIP[x.status] || 'chip') + '">' + esc(x.status) + '</span> ' + esc(x.text) + '</span><span class="r">' + lineLink(m, x.line, x.t) + '</span></li>').join('') + '</ul></div>' +
      '<div><h4 class="h4">Задачи из протокола · ' + (p.task_ids || []).length + '</h4><ul class="list">' + (tasks.length ? tasks.map((t) =>
        '<li><span>' + esc(t.title) + '</span><span class="r">' + esc(pname(t.owner)) + ' · ' + esc(dueLabel(t.due)) + ' <button class="cite" data-act="goto-task" data-id="' + t.id + '">в реестре</button></span></li>').join('')
        : '<li class="empty">Задачи созданы, но вне вашей зоны видимости.</li>') + '</ul></div>' +
      (p.risks && p.risks.length ? '<div><h4 class="h4">Риски</h4><ul class="risks">' + p.risks.map((r) => '<li>' + esc(r.text) + ' ' + lineLink(m, r.line, r.t) + '</li>').join('') + '</ul></div>' : '') +
      '<p class="hint">Протокол хранит ссылку на расшифровку, задачи — ссылку на встречу и реплику-основание.</p></div>';
  }
  function previewModal(m) {
    const d = S.drafts[m.id];
    const tasks = d.tasks.filter((t) => !t.skip && t.title.trim());
    const pts = d.points.filter((p) => !p.skip && p.text.trim());
    openModal('<h3>Подтвердите сохранение</h3><p class="muted" style="margin:4px 0 12px">Будет записано в систему от имени: <b>' + esc(S.me.name) + '</b> Отмена ничего не меняет.</p>' +
      '<div class="card-flat"><b>Протокол встречи «' + esc(m.title) + '»</b><p class="muted">' + pts.length + ' ' + plural(pts.length, 'пункт', 'пункта', 'пунктов') +
      ': решено ' + pts.filter((p) => p.status === 'решено').length + ', требует уточнения ' + pts.filter((p) => p.status === 'требует уточнения').length + '. Ссылка на расшифровку сохранится.</p></div>' +
      '<h4 class="h4" style="margin-top:14px">Будут созданы задачи · ' + tasks.length + '</h4><ul class="list">' + tasks.map((t) =>
        '<li><span>' + esc(t.title) + '</span><span class="r">' + (t.owner && t.due ? esc(pname(t.owner)) + ' · ' + esc(dueLabel(t.due)) : '<span class="chip chip-warn">требует уточнения</span>') + '</span></li>').join('') + '</ul>' +
      '<div class="actions" style="margin-top:16px"><button class="btn btn-primary" data-act="confirm" data-m="' + m.id + '">Подтвердить и сохранить</button><button class="btn" data-act="close">Отмена</button></div>');
  }
  async function confirmSave(mid) {
    const m = S.meetings.find((x) => x.id === mid);
    const d = S.drafts[mid];
    const btn = modalEl.querySelector('[data-act="confirm"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Сохраняю…'; }
    try {
      // повторное нажатие или обрыв связи не создают второй протокол: сервер узнаёт запрос по ключу d.key
      await call('/api/assistant/protocol/confirm', { meeting_id: mid, key: d.key, summary: d.summary, provider: d.provider,
        points: d.points.filter((p) => !p.skip), risks: d.risks, tasks: d.tasks.filter((t) => !t.skip) });
      delete S.drafts[mid]; saveDrafts();
      closeModal();
      await Promise.all([loadMeetings(), loadTasks()]);
      toast('Протокол сохранён, задачи в реестре');
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Подтвердить и сохранить'; }
      fail(e);
      if (e.status === 409) { delete S.drafts[mid]; saveDrafts(); closeModal(); await loadMeetings(); }
    }
    render();
    if (m) S.mview[mid] = 'protocol';
  }

  /* ================= ДОКУМЕНТЫ (сценарий 5) ================= */
  async function loadDocs() {
    const r = await call('/api/assistant/docs');
    S.docs = r.docs; S.docsHidden = r.hidden; S.docsTotal = r.total;
    if (!S.docs.find((d) => d.id === S.docId)) S.docId = S.docs[0] ? S.docs[0].id : null;
  }
  const SUGG = ['Какая допустимая доля перепечаток?', 'Сколько переплётчиков нужно в смене в сезон?', 'Во сколько Белпочта забирает отправления?',
    'Какой срок первого ответа клиенту в чате?', 'Когда новый сотрудник может работать на оборудовании сам?', 'Какая выручка за 3 квартал?'];
  async function ask(q) {
    q = String(q || '').trim();
    if (!q) return;
    S.qText = q; S.answer = { q, loading: true }; render();
    try {
      const r = await call('/api/assistant/ask', { q });
      S.answer = r;
      if (r.cites && r.cites[0]) { S.docId = r.cites[0].doc; S.hl = r.cites.filter((c) => c.doc === S.docId).map((c) => c.n); }
    } catch (e) { S.answer = { q, error: e.message }; }
    render();
  }
  function richAnswer(a) {
    const byKey = {};
    (a.cites || []).forEach((c) => { byKey[c.doc + ':' + c.n] = c; });
    let h = esc(a.answer || '');
    h = h.replace(/\[D:(d\d+):(\d+)\]/g, (m0, d, n) => { const c = byKey[d + ':' + n]; return c ? citeBtn(c) : ''; });
    return h.split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }
  const citeBtn = (c) => '<button class="cite" data-act="cite" data-doc="' + esc(c.doc) + '" data-n="' + esc(c.n) + '" title="' + esc(c.title) + ', от ' + esc(dLabel(c.date)) + '">' + esc(c.code) + ', п. ' + esc(c.n) + '</button>';
  function renderDocs() {
    const a = S.answer;
    let ans = '';
    if (a) {
      ans = '<div class="answer"><div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body">' +
        (a.loading ? '<p class="muted typing">Ищу в доступных вам документах</p>' : a.error ? '<p class="err" role="alert">' + esc(a.error) + '</p><button class="btn btn-sm" data-act="retry">Повторить</button>' :
          richAnswer(a) +
          (a.cites && a.cites.length ? '<div class="sources"><div class="eyebrow">Источники</div>' + a.cites.map((c) => '<div class="src-row">' + citeBtn(c) +
            '<span>' + esc(c.title) + ' · от ' + esc(new Date(c.date).toLocaleDateString('ru-RU')) + '</span></div>').join('') + '</div>' : '') +
          ((a.notes || []).includes('injection') ? '<p class="ai-src">⚠ В найденном фрагменте есть текст, похожий на указание для ИИ. Помощник считает его данными и не выполняет.</p>' : '') +
          '<p class="ai-src">Искал в ' + a.searched + ' ' + plural(a.searched, 'документе', 'документах', 'документах') + (a.hidden ? '; ' + a.hidden + ' закрыты для вашей роли и в поиск не попадали' : '') + '.</p>' +
          '<div class="prov">' + (a.fallback ? '<span class="chip">Встроенная логика</span>' + (a.reason ? '<span>' + esc(a.reason) + '</span>' : '') : '<span class="chip chip-accent">' + esc(a.provider) + '</span>' +
            (a.masked && a.masked.count ? '<span class="chip chip-ok">замаскировано: ' + a.masked.count + '</span>' : '')) + '</div>' +
          feedbackRow('ask:' + a.q)) + '</div></div></div>';
    }
    const d = S.docs.find((x) => x.id === S.docId);
    const hl = new Set(S.hl || []);
    const list = S.docs.map((x) => '<li><button data-act="doc" data-id="' + x.id + '" aria-current="' + (x.id === S.docId) + '"><span class="doc-ico">' + esc((x.kind || 'Док').slice(0, 3).toUpperCase()) + '</span>' +
      '<span><span>' + esc(x.title) + '</span><br><span class="k">' + esc(x.code) + ' · от ' + esc(new Date(x.date).toLocaleDateString('ru-RU')) + '</span></span></button></li>').join('');
    const view = d ? '<div class="card-flat doc-view" style="margin-top:16px"><div class="eyebrow">' + esc(d.kind) + '</div><h3 style="font-size:18px;margin-top:2px">' + esc(d.title) + '</h3>' +
      '<div class="doc-meta"><span class="chip">' + esc(d.code) + '</span><span class="chip">от ' + esc(new Date(d.date).toLocaleDateString('ru-RU')) + '</span><span class="chip chip-ok">видят: ' + esc(d.access_label) + '</span></div>' +
      (d.sensitive ? '<p class="locked-note" style="margin:8px 0">Документ содержит ' + esc(d.sensitive) + '. Вы можете его читать, но помощник не использует его в ответах и не цитирует.</p>' : '') +
      d.items.map((it) => '<div class="item' + (hl.has(it.n) ? ' found' : '') + '" id="it-' + esc(it.n) + '"><span class="n">' + esc(it.n) + '.</span><span>' + esc(it.text) + '</span></div>').join('') + '</div>'
      : '<p class="empty">Для вашей роли нет доступных документов.</p>';
    return '<div class="sec-head"><div><h2 class="sec">Документы компании</h2><p class="sec-lead">Ответ — только по пунктам доступных вам документов, со ссылкой на пункт и дату. Нет основания — помощник так и скажет.</p></div></div>' +
      '<div class="docs-grid"><div class="card"><p class="muted" style="font-size:13.5px;margin:0 6px 8px">Вам доступно ' + S.docs.length + ' из ' + S.docsTotal + '.' + (S.docsHidden ? ' Остальные закрыты для вашей роли — их названия не показываются.' : '') + '</p><ul class="doc-list">' + list + '</ul></div>' +
      '<div><div class="card"><form class="ask" data-act="ask"><label class="sr" for="q">Вопрос по документам</label><input class="input" id="q" placeholder="Например: сколько переплётчиков нужно в смене?" value="' + esc(S.qText) + '" autocomplete="off">' +
      '<button class="btn btn-primary" type="submit">Спросить</button></form>' +
      '<div class="sugg">' + SUGG.map((s) => '<button data-act="sugg">' + esc(s) + '</button>').join('') + '</div>' + ans + '</div>' + view + '</div></div>';
  }

  /* ---------- обратная связь (AI-07) ---------- */
  const feedbackRow = (ref) => '<div class="fb" data-ref="' + esc(ref) + '"><span class="faint">Ответ полезен?</span><button class="btn btn-sm btn-ghost" data-act="fb" data-r="1" aria-label="Полезно">👍</button>' +
    '<button class="btn btn-sm btn-ghost" data-act="fb" data-r="-1" aria-label="Не полезно">👎</button></div>';
  async function sendFeedback(ref, rating) {
    const comment = rating < 0 ? (prompt('Что не так? Комментарий увидит команда (необязательно):') || '') : '';
    try { await call('/api/assistant/feedback', { ref, rating, comment }); toast('Спасибо, оценка записана'); } catch (e) { fail(e); }
  }

  /* ================= ЗАДАЧИ (сценарий 4) ================= */
  async function loadTasks() {
    const [r, c] = await Promise.all([call('/api/assistant/tasks'), call('/api/assistant/tasks/check')]);
    S.tasks = r.tasks; S.tasksHidden = r.hidden; S.check = c.items;
  }
  const taskCol = (t) => t.status === 'done' ? 'done' : (t.status === 'needs_info' || !t.owner || !t.due) ? 'needs_info' : t.due < TODAY ? 'overdue' : t.status === 'in_progress' ? 'in_progress' : 'new';
  function canEdit(t, field) {
    const me = S.me;
    if (me.role === 'director') return true;
    if (me.role === 'head') { const o = person(t.owner); return t.dept === me.dept || (o && o.dept === me.dept) || t.owner === me.id || t.created_by === me.id; }
    if (me.role === 'operator') return t.owner === me.id && field === 'status';
    return false;
  }
  function renderTasks() {
    const people = [...new Set(S.tasks.map((t) => t.owner).filter(Boolean))];
    if (S.filter !== 'all' && !people.includes(S.filter)) S.filter = 'all';
    const shown = S.tasks.filter((t) => S.filter === 'all' || t.owner === S.filter);
    const mt = (id) => S.meetings.find((m) => m.id === id);
    const card = (t) => {
      const col = taskCol(t);
      const m = t.meeting_id ? mt(t.meeting_id) : null;
      return '<div class="tcard' + (col === 'overdue' ? ' overdue' : '') + (S.focusTask === t.id ? ' fresh' : '') + '" id="task-' + t.id + '"><div class="tt">' + esc(t.title) + '</div>' +
        '<div class="tm"><span class="person">' + (t.owner ? ava(t.owner) + esc(pname(t.owner)) : '<span class="chip chip-warn">нет владельца</span>') + '</span>' +
        '<span class="' + (col === 'overdue' ? 'chip chip-bad' : t.due ? 'chip' : 'chip chip-warn') + '">' + esc(dueLabel(t.due)) + '</span></div>' +
        '<div class="src">' + (t.meeting_id ? 'Основание: ' + (m ? '<button class="cite" data-act="line" data-m="' + t.meeting_id + '" data-l="' + (t.line == null ? '' : t.line) + '">' + esc(m.title) + '</button>' : 'встреча ' + esc(t.meeting_id)) : 'Поручение') + '</div>' +
        '<div class="tb">' + (canEdit(t, 'status') && col !== 'done' && t.status !== 'in_progress' && col !== 'needs_info' ? '<button class="btn btn-sm" data-act="st" data-id="' + t.id + '" data-s="in_progress">В работу</button>' : '') +
        (canEdit(t, 'status') && col !== 'done' && col !== 'needs_info' ? '<button class="btn btn-sm" data-act="st" data-id="' + t.id + '" data-s="done">Готово</button>' : '') +
        (canEdit(t, 'status') && col === 'done' ? '<button class="btn btn-sm btn-ghost" data-act="st" data-id="' + t.id + '" data-s="in_progress">Вернуть</button>' : '') +
        (col === 'needs_info' && canEdit(t, 'owner') ? '<button class="btn btn-sm" data-act="fix" data-id="' + t.id + '">Уточнить</button>' : '') + '</div></div>';
    };
    const chk = S.check.filter((c) => canEdit(S.tasks.find((t) => t.id === c.id) || {}, 'owner'));
    return '<div class="sec-head"><div><h2 class="sec">Реестр задач</h2><p class="sec-lead">Задачи со встреч и поручения: владелец, срок и основание. Видно только ваш участок.</p></div>' +
      '<label class="row"><span class="faint">Кто</span><select class="select" data-act="filter" style="width:auto"><option value="all">Все (' + S.tasks.length + ')</option>' +
      people.map((id) => '<option value="' + id + '"' + (S.filter === id ? ' selected' : '') + '>' + esc(pname(id)) + '</option>').join('') + '</select></label></div>' +
      (chk.length ? '<div class="ai-note" style="margin-bottom:14px"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Без владельца или срока: ' + chk.length + '</b>' +
        '<p class="muted">Предлагаю ответственного по теме задачи и срок через 5 рабочих дней. Применяется только после вашего подтверждения.</p><ul class="list" style="margin-top:6px">' +
        chk.map((c) => '<li><span>' + esc(c.title) + ' <span class="chip chip-warn">' + esc(c.flags.join(', ')) + '</span></span><span class="r">' +
          (c.suggested_owner ? esc(pname(c.suggested_owner)) + ' · ' : '') + (c.suggested_due ? esc(dueLabel(c.suggested_due)) + ' · ' : '') +
          '<button class="btn btn-sm" data-act="apply-sug" data-id="' + c.id + '">Применить…</button></span></li>').join('') + '</ul></div></div>' : '') +
      (S.tasksHidden ? '<p class="locked-note" style="margin-bottom:12px">Ещё ' + S.tasksHidden + ' ' + plural(S.tasksHidden, 'задача', 'задачи', 'задач') + ' вне вашего участка — сервер их не передал.</p>' : '') +
      '<div class="board board5">' + TASK_COLS.map(([k, l]) => { const xs = shown.filter((t) => taskCol(t) === k); return '<div class="col"><h3><span>' + l + '</span><span class="faint mono">' + xs.length + '</span></h3>' + (xs.length ? xs.map(card).join('') : '<p class="empty">Пусто</p>') + '</div>'; }).join('') + '</div>';
  }
  function fixModal(id, fromSug) {
    const t = S.tasks.find((x) => x.id === id);
    const c = S.check.find((x) => x.id === id) || {};
    const owner = t.owner || (fromSug ? c.suggested_owner : '') || '';
    const due = t.due || (fromSug ? c.suggested_due : '') || '';
    openModal('<h3>Уточнить задачу</h3><p class="muted" style="margin:4px 0 12px">«' + esc(t.title) + '». ' + (fromSug ? 'Поля заполнены предложением помощника — проверьте перед сохранением.' : '') + '</p>' +
      '<div class="stack"><div class="field"><label for="fo">Ответственный</label><select class="select" id="fo"><option value="">— не назначен —</option>' +
      S.people.map((p) => '<option value="' + p.id + '"' + (p.id === owner ? ' selected' : '') + '>' + esc(p.name + ' · ' + p.title) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="fd">Срок</label><input class="input" type="date" id="fd" value="' + esc(due) + '"></div></div>' +
      '<p class="hint" style="margin-top:10px">Изменение запишется в журнал: кто, когда, что было и что стало.</p>' +
      '<div class="actions" style="margin-top:14px"><button class="btn btn-primary" data-act="fix-save" data-id="' + id + '">Подтвердить</button><button class="btn" data-act="close">Отмена</button></div>');
  }
  async function updateTask(id, fields) {
    try { await call('/api/assistant/tasks/' + id, fields); await loadTasks(); toast('Задача обновлена'); } catch (e) { fail(e); }
    render();
  }

  /* ================= ИТОГИ (сценарий 6 — данные пульта подключатся через /api/context) ================= */
  function renderSummary() {
    const by = (k) => S.tasks.filter((t) => taskCol(t) === k);
    const over = by('overdue'), need = by('needs_info'), done = by('done');
    const soon = S.tasks.filter((t) => taskCol(t) !== 'done' && t.due && t.due >= TODAY && t.due <= isoDay(new Date(Date.now() + 7 * 864e5))).sort((a, b) => a.due.localeCompare(b.due));
    const li = (t) => '<li><span>' + esc(t.title) + '</span><span class="r">' + esc(pname(t.owner)) + ' · ' + esc(dueLabel(t.due)) + '</span></li>';
    const stat = (v, l, cls) => '<div class="card stat"><div class="v ' + (cls || '') + '">' + v + '</div><div class="l">' + l + '</div></div>';
    const protos = S.meetings.filter((m) => m.protocol);
    return '<div class="sec-head"><div><h2 class="sec">Управленческий обзор</h2><p class="sec-lead">' + (S.me.role === 'director' ? 'По всей компании.' : 'Только ваш участок.') +
      ' Источник: реестр задач и протоколы помощника · данные на ' + esc(new Date().toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + '.</p></div></div>' +
      '<div class="stats">' + stat(S.tasks.length, 'задач в контроле') + stat(over.length, 'просрочено', over.length ? 'delta-down' : '') + stat(need.length, 'требует уточнения') + stat(protos.length, 'протоколов утверждено') + '</div>' +
      '<div class="two" style="margin-top:14px"><div class="card"><h3>Просрочено</h3><ul class="list">' + (over.length ? over.map(li).join('') : '<li class="empty">Просрочек нет</li>') + '</ul></div>' +
      '<div class="card"><h3>Сроки на 7 дней</h3><ul class="list">' + (soon.length ? soon.map(li).join('') : '<li class="empty">Нет сроков</li>') + '</ul></div>' +
      '<div class="card"><h3>Требует уточнения</h3><ul class="list">' + (need.length ? need.map(li).join('') : '<li class="empty">Всё назначено</li>') + '</ul></div>' +
      '<div class="card"><h3>Сделано</h3><ul class="list">' + (done.length ? done.map(li).join('') : '<li class="empty">Пока ничего</li>') + '</ul></div></div>' +
      '<p class="locked-note" style="margin-top:14px">Показатели компании и просроченные решения пульта появятся здесь, когда пульт отдаст их через <span class="code">GET /api/context</span> — с источником и временем актуальности.</p>';
  }

  /* ================= ЗАЩИТА ================= */
  const MASK_SAMPLE = 'Встреча с поставщиком: ООО «Бумтех», УНП 999000222, директор Кравец Олег Николаевич, тел. +375 29 000-11-22, sales@bumtech.example. ' +
    'Просим скидку 6 % при закупке на 60 000 BYN. От нас — Лозовая Т. К. и Гринь Д. А.';
  async function loadSecurity() {
    const jobs = [call('/api/assistant/audit').then((r) => { S.audit = r.items; })];
    if (['director', 'analyst'].includes(S.me.role)) jobs.push(call('/api/assistant/access').then((r) => { S.access = r; }));
    await Promise.all(jobs);
  }
  async function probe(code) {
    code = String(code || '').trim();
    if (!code) return;
    try { const d = await call('/api/assistant/docs/' + encodeURIComponent(code)); S.probe = { code, ok: true, title: d.title }; } catch (e) { S.probe = { code, ok: false, msg: e.message, status: e.status }; }
    await loadSecurity(); render();
  }
  async function setMode(mode) {
    try { await api.mode(mode); } catch (e) { fail(e); }
    await loadHealth();
    S.localState = null;
    if (mode === 'local') {
      S.localState = { loading: true }; render();
      const r = await api.ai({ system: 'Ответь одним словом.', user: 'Скажи «готово».', who: S.me.name, title: 'Проверка локальной модели', max_tokens: 10, timeout: 8000 }, 'нет');
      S.localState = r.fallback ? { ok: false } : { ok: true, model: r.model, ms: r.ms };
    }
    await loadSecurity(); render();
  }
  async function checkMask() {
    const ta = document.getElementById('mtext');
    const text = ta ? ta.value : MASK_SAMPLE;
    S.maskCheck = { text, loading: true }; render();
    const r = await api.ai({ system: 'Перескажи текст в одном предложении. Метки в квадратных скобках оставь как есть.', user: text, mask: true, who: S.me.name, title: 'Проверка маскирования', max_tokens: 200 },
      'Модель не вызывалась — ниже видно, что ушло бы наружу.');
    S.maskCheck = { text, r }; render();
  }
  function renderSecurity() {
    const mode = S.health.mode;
    const modes = [['cloud', 'Облако с маскированием', 'DeepSeek через сервер компании. Имена, телефоны, УНП, почта и суммы заменяются метками; в протоколах имена — кодами сотрудников.'],
      ['local', 'Локальная модель', 'Ollama или LM Studio в контуре компании. Наружу не уходит ничего.'],
      ['off', 'Без модели', 'Поиск, ответы со ссылками и протокол работают на встроенной логике сервера.']];
    const ls = S.localState, mc = S.maskCheck, pr = S.probe;
    const cmp = !mc ? '' : mc.loading ? '<p class="muted typing" style="margin-top:10px">Проверяю</p>' :
      '<div class="cmp"><div><div class="eyebrow">Было у нас</div><pre>' + esc(mc.text) + '</pre></div><div><div class="eyebrow">Ушло бы в модель</div><pre>' +
      esc(mc.r.masked ? mc.r.masked.sent_preview : '').replace(/\[[А-ЯЁ]+_\d+\]/g, (x) => '<mark>' + x + '</mark>') + '</pre></div></div>';
    let matrix = '';
    if (S.access) {
      const us = S.access.users;
      matrix = '<div class="card"><h3>Кто какие документы видит</h3><p class="muted" style="font-size:13.5px;margin:2px 0 8px">Права проверяет сервер. Закрытый документ не попадает ни в поиск, ни в ответ, ни в модель.</p><div style="overflow-x:auto"><table class="table matrix"><thead><tr><th>Документ</th>' +
        us.map((u) => '<th title="' + esc(u.title) + '">' + esc(u.name.split(' ')[0]) + '</th>').join('') + '</tr></thead><tbody>' +
        S.access.docs.map((d) => '<tr><td>' + esc(d.code) + (d.sensitive ? ' 🔒' : '') + '</td>' + us.map((u) => '<td>' + (d.allowed.includes(u.id) ? '<span class="yes">✓</span>' : '<span class="no">—</span>') + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div><p class="hint">🔒 — содержит зарплаты: помощник не использует его в ответах ни для кого.</p></div>';
    }
    const audit = S.audit.slice().reverse().slice(0, 50);
    return '<div class="sec-head"><div><h2 class="sec">Защищённый контур</h2><p class="sec-lead">Где думает помощник, что уходит наружу, кто что видит и что записано в журнал.</p></div></div>' +
      '<div class="sec-grid"><div class="card"><h3>Где работает модель</h3><div class="modes" role="radiogroup" style="margin-top:10px">' + modes.map(([k, t, p]) =>
        '<button class="mode" role="radio" aria-checked="' + (mode === k) + '" data-act="mode" data-mode="' + k + '"><span class="r"></span><span><b>' + t + '</b><p>' + p + '</p></span></button>').join('') + '</div>' +
      (ls ? '<div class="mode-state">' + (ls.loading ? '<span class="spin"></span> Проверяю локальную модель…' : ls.ok ? '<span class="chip chip-ok">Локальная модель отвечает · ' + esc(ls.model) + ' · ' + ls.ms + ' мс</span>'
        : '<div class="locked-note">Локальная модель не запущена — помощник работает на встроенной логике. Поднимите Ollama (<span class="code">ollama run qwen2.5:7b</span>), сервер подключится по <span class="code">LOCAL_LLM_URL</span>.</div>') + '</div>' : '') + '</div>' +
      '<div class="card"><h3>Проверить права</h3><p class="muted" style="font-size:13.5px;margin-top:2px">Попробуйте открыть документ по коду, например <span class="code">ШР-01</span> или <span class="code">ОТ-Q3</span>. Отказ запишется в журнал.</p>' +
      '<form class="ask" data-act="probe" style="margin-top:10px"><label class="sr" for="pc">Код документа</label><input class="input" id="pc" placeholder="Код документа" value="' + esc(pr ? pr.code : '') + '"><button class="btn btn-primary" type="submit">Открыть</button></form>' +
      (pr ? (pr.ok ? '<p class="chip chip-ok" style="margin-top:10px">Доступ есть: ' + esc(pr.title) + '</p>' : '<p class="err" role="alert" style="margin-top:10px">' + esc(pr.msg) + (pr.status === 403 ? ' — попытка записана в журнал с результатом «отказ».' : '') + '</p>') : '') + '</div>' +
      '<div class="card"><h3>Что уйдёт наружу</h3><p class="muted" style="font-size:13.5px;margin-top:2px">Сервер покажет, что увидит облачная модель после маскирования.</p>' +
      '<textarea class="textarea" id="mtext" style="margin-top:10px;min-height:90px">' + esc(mc ? mc.text : MASK_SAMPLE) + '</textarea><div class="actions" style="margin-top:10px"><button class="btn btn-primary" data-act="maskcheck">Проверить</button></div>' + cmp + '</div>' +
      '<div class="card"><h3>Хранение и удаление</h3><ul class="where" style="margin-top:8px">' +
      '<li>Запросы, расшифровки, протоколы, задачи и журнал хранятся на сервере компании (папка data/), срок — 90 дней.</li>' +
      '<li>Тестовые данные удаляются кнопкой «Сбросить демо-данные» на главной.</li><li>Ключ модели — только в переменной окружения сервера.</li>' +
      '<li>Внешний провайдер в облачном режиме — DeepSeek (Китай); уходит только текст после маскирования.</li></ul></div>' +
      matrix + '</div>' +
      '<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>Журнал действий' + (S.me.role === 'director' || S.me.role === 'analyst' ? '' : ' · ваш участок') + '</h3><button class="btn btn-sm" data-act="audit">Обновить</button></div>' +
      '<div class="audit" style="margin-top:8px">' + (audit.length ? '<table class="table"><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Результат</th></tr></thead><tbody>' +
        audit.map((a) => '<tr><td class="mono" style="white-space:nowrap">' + esc(fmt.dt(a.ts)) + '</td><td>' + esc(a.who) + '</td><td><b style="font-weight:500">' + esc(a.action) + '</b><br><span class="faint">' + esc(a.detail) + '</span></td>' +
          '<td>' + esc(a.object || '') + '</td><td>' + (a.result === 'отказ' ? '<span class="chip chip-bad">отказ</span>' : a.result === 'не найдено' ? '<span class="chip chip-warn">не найдено</span>' : '<span class="chip chip-ok">' + esc(a.result || 'ok') + '</span>') +
          (a.outside ? ' <span class="chip chip-warn">облако</span>' : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="empty">Пока пусто.</p>') + '</div></div>';
  }

  /* ================= модальное окно ================= */
  function openModal(html) {
    modalEl.innerHTML = '<div class="modal-back" data-act="close-back"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    const f = modalEl.querySelector('button, select, input'); if (f) f.focus();
  }
  function closeModal() { modalEl.innerHTML = ''; }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalEl.innerHTML) closeModal(); });

  /* ================= общий рендер ================= */
  function render() {
    if (!S.me) return;
    document.querySelectorAll('.t3-nav .tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
    const views = { voice: () => window.FPVoice.html(), meetings: renderMeetings, docs: renderDocs, tasks: renderTasks, summary: renderSummary, security: renderSecurity };
    app.innerHTML = (S.err ? '<p class="err" role="alert" style="margin-bottom:12px">' + esc(S.err) + ' <button class="btn btn-sm" data-act="reload">Повторить</button></p>' : '') + (views[S.tab] || renderMeetings)();
    if (S.tab === 'voice') window.FPVoice.mount(app, { call, token, goTab });
    if (S.tab === 'docs' && S.hl && S.hl.length) { const el = document.getElementById('it-' + S.hl[0]); if (el) el.scrollIntoView({ block: 'nearest' }); }
    if (S.tab === 'meetings' && S.hlLine != null) { const el = document.getElementById('ln-' + S.hlLine); if (el) el.scrollIntoView({ block: 'center' }); }
    if (S.tab === 'tasks' && S.focusTask) { const el = document.getElementById('task-' + S.focusTask); if (el) el.scrollIntoView({ block: 'center' }); }
  }
  async function loadHealth() {
    S.health = await api.health();
    const chip = document.getElementById('aiChip');
    const map = { cloud: ['chip chip-accent', 'Облако + маскирование'], local: ['chip chip-ok', 'Локальная модель'], off: ['chip', 'Без модели · встроенная логика'] };
    const [cls, txt] = map[S.health.mode] || ['chip', 'Сервер не отвечает'];
    chip.className = cls; chip.querySelector('span:last-child').textContent = txt;
  }
  async function goTab(tab) {
    if (S.tab === 'voice' && tab !== 'voice') window.FPVoice.leave();
    S.tab = tab; S.err = null;
    const u = new URL(location); u.searchParams.set('tab', tab); history.replaceState(null, '', u);
    try {
      if (tab === 'meetings') { await Promise.all([loadMeetings(), loadTasks()]); await loadTranscript(S.meetings.find((m) => m.id === S.meetingId)); }
      if (tab === 'docs' && !S.docs.length) await loadDocs();
      if (tab === 'tasks' || tab === 'summary') await Promise.all([loadTasks(), loadMeetings()]);
      if (tab === 'security') await loadSecurity();
    } catch (e) { S.err = e.message; }
    render();
  }

  /* ================= события ================= */
  document.querySelector('.t3-nav').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) goTab(b.dataset.tab); });
  document.getElementById('me').addEventListener('click', (e) => { if (e.target.closest('[data-act="logout"]')) signOut(false); });
  app.addEventListener('submit', (e) => {
    e.preventDefault();
    const act = e.target.dataset.act;
    if (act === 'login') signIn(document.getElementById('lg').value, document.getElementById('pw').value);
    if (act === 'ask') ask(document.getElementById('q').value);
    if (act === 'probe') probe(document.getElementById('pc').value);
  });
  app.addEventListener('input', (e) => {
    const t = e.target, d = S.drafts[S.meetingId];
    if (t.id === 'q') S.qText = t.value;
    if (!d) return;
    if (t.dataset.f === 'summary') d.summary = t.value;
    if (t.dataset.pt != null && t.tagName === 'INPUT') d.points[+t.dataset.pt].text = t.value;
    if (t.dataset.tk != null && t.tagName === 'INPUT' && t.type !== 'date') d.tasks[+t.dataset.tk].title = t.value;
    saveDrafts();
  });
  app.addEventListener('change', (e) => {
    const t = e.target, d = S.drafts[S.meetingId];
    if (t.dataset.act === 'filter') { S.filter = t.value; render(); return; }
    if (!d) return;
    if (t.dataset.pt != null && t.dataset.f === 'status') d.points[+t.dataset.pt].status = t.value;
    if (t.dataset.tk != null && t.dataset.f === 'owner') { d.tasks[+t.dataset.tk].owner = t.value || null; saveDrafts(); render(); return; }
    if (t.dataset.tk != null && t.dataset.f === 'due') { d.tasks[+t.dataset.tk].due = t.value || null; saveDrafts(); render(); return; }
    saveDrafts();
  });
  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || ['FORM', 'SELECT', 'TEXTAREA', 'INPUT'].includes(b.tagName)) return;
    const act = b.dataset.act;
    const m = S.meetings.find((x) => x.id === S.meetingId);
    const d = m && S.drafts[m.id];
    try {
      if (act === 'meeting') { S.meetingId = b.dataset.id; S.hlLine = null; await loadTranscript(S.meetings.find((x) => x.id === S.meetingId)); render(); }
      if (act === 'mview') { S.mview[m.id] = b.dataset.v; render(); }
      if (act === 'draft' || act === 'redraft') makeDraft(m);
      if (act === 'discard' && confirm('Удалить черновик протокола? Сохранённое в системе не изменится.')) { delete S.drafts[m.id]; saveDrafts(); render(); }
      if (act === 'pt-del') { d.points[+b.dataset.i].skip = !d.points[+b.dataset.i].skip; saveDrafts(); render(); }
      if (act === 'pt-add') { d.points.push({ text: '', status: 'решено', line: null }); saveDrafts(); render(); }
      if (act === 'tk-del') { d.tasks[+b.dataset.i].skip = !d.tasks[+b.dataset.i].skip; saveDrafts(); render(); }
      if (act === 'tk-add') { d.tasks.push({ title: '', owner: null, due: null, line: null, skip: false }); saveDrafts(); render(); }
      if (act === 'sug-owner') { const t = d.tasks[+b.dataset.i]; t.owner = t.suggested_owner; saveDrafts(); render(); }
      if (act === 'sug-due') { const t = d.tasks[+b.dataset.i]; t.due = t.suggested_due; saveDrafts(); render(); }
      if (act === 'preview') previewModal(m);
      if (act === 'confirm') confirmSave(b.dataset.m);
      if (act === 'close' || (act === 'close-back' && e.target === b)) closeModal();
      if (act === 'line') {
        S.tab = 'meetings'; S.meetingId = b.dataset.m; S.mview[b.dataset.m] = 'transcript'; S.hlLine = b.dataset.l === '' ? null : +b.dataset.l;
        await loadMeetings(); await loadTranscript(S.meetings.find((x) => x.id === S.meetingId)); render();
      }
      if (act === 'goto-task') { S.focusTask = b.dataset.id; goTab('tasks'); }
      if (act === 'doc') { S.docId = b.dataset.id; S.hl = null; render(); }
      if (act === 'cite') { if (S.tab === 'voice') window.FPVoice.leave(); S.tab = 'docs'; if (!S.docs.length) await loadDocs(); S.docId = b.dataset.doc; S.hl = [b.dataset.n]; render(); }
      if (act === 'sugg') ask(b.textContent);
      if (act === 'retry') ask(S.qText);
      if (act === 'fb') sendFeedback(b.closest('.fb').dataset.ref, +b.dataset.r);
      if (act === 'st') updateTask(b.dataset.id, { status: b.dataset.s });
      if (act === 'fix') fixModal(b.dataset.id, false);
      if (act === 'apply-sug') fixModal(b.dataset.id, true);
      if (act === 'fix-save') {
        const owner = document.getElementById('fo').value || null, due = document.getElementById('fd').value || null;
        closeModal(); updateTask(b.dataset.id, { owner, due });
      }
      if (act === 'mode') setMode(b.dataset.mode);
      if (act === 'maskcheck') checkMask();
      if (act === 'audit') { await loadSecurity(); render(); }
      if (act === 'reload') goTab(S.tab);
    } catch (err) { fail(err); }
  }
  app.addEventListener('click', onClick);
  modalEl.addEventListener('click', onClick);

  /* ================= старт ================= */
  async function boot() {
    try {
      const r = await call('/api/assistant/people');
      S.me = r.me; S.people = r.people;
    } catch (e) {
      if (e.status === 403) { sessionStorage.removeItem(TOKEN_KEY); renderLogin('Помощник руководителя доступен только сотрудникам компании.'); return; }
      if (!token()) { renderLogin(''); return; }
      renderLogin(e.message); return;
    }
    const meEl = document.getElementById('me');
    meEl.hidden = false;
    meEl.innerHTML = '<span class="person">' + ava(S.me.id) + '<span><b>' + esc(S.me.name) + '</b><br><span class="faint">' + esc(S.me.title) + '</span></span></span><button class="btn btn-sm btn-ghost" data-act="logout">Выйти</button>';
    document.getElementById('nav').hidden = false;
    await loadHealth();
    await goTab(S.tab);
  }
  if (token()) boot(); else { loadHealth(); renderLogin(''); }
})();
