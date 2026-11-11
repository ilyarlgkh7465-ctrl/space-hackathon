/* Общие помощники для трёх MVP: хранилище, ИИ с запасным ответом, форматирование, уведомления.
   Подключение: <script src="/shared/company.js"></script><script src="/shared/api.js"></script> */
(function () {
  const J = { 'Content-Type': 'application/json' };

  async function req(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(url + ' → ' + r.status);
    return r.json();
  }

  const api = {
    static: false,
    health: () => req('/api/health').catch(() => ({ ok: false, mode: 'off' })),
    list: (coll) => req('/api/store/' + coll).catch(() => []),
    add: (coll, item) => req('/api/store/' + coll, { method: 'POST', headers: J, body: JSON.stringify(item) }),
    update: (coll, id, fields) => req('/api/store/' + coll + '/' + id, { method: 'POST', headers: J, body: JSON.stringify(fields) }),
    remove: (coll, id) => req('/api/store/' + coll + '/' + id + '/delete', { method: 'POST' }),
    reset: () => req('/api/reset', { method: 'POST' }),
    mode: (m) => m ? req('/api/ai/mode', { method: 'POST', headers: J, body: JSON.stringify({ mode: m }) }) : req('/api/ai/mode'),
    telegram: (text, who) => req('/api/telegram', { method: 'POST', headers: J, body: JSON.stringify({ text, who }) })
      .catch(() => ({ ok: false })),

    /* Запрос к модели. fallback — функция или значение, если модели нет/ошибка/долго.
       opts: {system, user, json, mask, max_tokens, who, title, timeout}
       Возвращает {ok, text, json, provider, masked, fallback:true|false} */
    async ai(opts, fallback) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeout || 30000);
      try {
        const r = await fetch('/api/ai', { method: 'POST', headers: J, body: JSON.stringify(opts), signal: ctrl.signal });
        const d = await r.json();
        clearTimeout(t);
        if (d.ok && (!opts.json || d.json)) return Object.assign(d, { fallback: false });
        return useFallback(d.reason, d.masked);
      } catch (e) {
        clearTimeout(t);
        return useFallback(String(e.message || e));
      }
      function useFallback(reason, masked) {
        const v = typeof fallback === 'function' ? fallback() : fallback;
        return { ok: true, fallback: true, reason, masked: masked || null,
          text: typeof v === 'string' ? v : JSON.stringify(v), json: typeof v === 'object' ? v : null, provider: 'встроенная логика' };
      }
    },
  };

  /* ---------- Режим без сервера (ссылка для команды) ----------
     Включается, если перед api.js подключён shared/seed.js (window.STATIC_DEMO = true).
     Данные — в localStorage браузера (общие для всех трёх треков на одной ссылке), ИИ — встроенная логика,
     маскирование показывается теми же правилами, что на сервере. */
  if (window.STATIC_DEMO) {
    const KEY = 'fp-hack:';
    const mem = {};
    const read = (c) => {
      let v = null;
      try { v = JSON.parse(localStorage.getItem(KEY + c)); } catch (e) { v = mem[c] || null; }
      if (!Array.isArray(v)) v = JSON.parse(JSON.stringify((window.SEED && window.SEED[c]) || []));
      return v;
    };
    const write = (c, items) => { mem[c] = items; try { localStorage.setItem(KEY + c, JSON.stringify(items)); } catch (e) { /* приватное окно */ } };
    // местное время без зоны — как пишет сервер (time.strftime)
    const now = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };
    const uid = () => Math.random().toString(16).slice(2, 10);
    let mode = 'off';
    try { mode = localStorage.getItem(KEY + 'mode') || 'off'; } catch (e) { /* нет хранилища */ }
    const audit = (who, action, detail, outside) => {
      const items = read('audit');
      items.push({ id: uid(), ts: now(), who: who || 'система', action, detail: String(detail || '').slice(0, 400), outside: !!outside });
      write('audit', items.slice(-500));
    };
    const RULES = [
      ['ТЕЛЕФОН', /(?:\+?375|8\s?0)[\s\-()]*\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/g],
      ['ПОЧТА', /[\w.+-]+@[\w-]+\.[\w.-]+/g],
      ['УНП', /(?<!\d)\d{9}(?!\d)/g],
      ['СУММА', /\d[\d\s]{0,12}(?:[.,]\d{1,2})?\s?(?:BYN|руб\.?|р\.|\$|USD|€)/g],
      ['ФИО', /[А-ЯЁ][а-яё]{2,}\s[А-ЯЁ]\.\s?[А-ЯЁ]\.|[А-ЯЁ][а-яё]{2,}\s[А-ЯЁ][а-яё]{2,}(?:\s[А-ЯЁ][а-яё]{4,}(?:вич|вна|ична|чна))?/g],
    ];
    const NOT_NAMES = ['Минск', 'Беларусь', 'Республики', 'Трек', 'Салон', 'Цех', 'Онлайн', 'Фото'];
    const mask = (text, map) => {
      RULES.forEach(([label, rx]) => {
        text = text.replace(rx, (val) => {
          if (label === 'ФИО' && val.split(/\s/).some((w) => NOT_NAMES.includes(w))) return val;
          const known = Object.keys(map).find((k) => map[k] === val);
          if (known) return known;
          const key = '[' + label + '_' + (Object.keys(map).filter((k) => k.startsWith('[' + label)).length + 1) + ']';
          map[key] = val;
          return key;
        });
      });
      return text;
    };
    Object.assign(api, {
      static: true,
      health: async () => ({ ok: true, static: true, mode, cloud_key: false, telegram: false }),
      list: async (c) => read(c),
      add: async (c, item) => { const it = Object.assign({ id: uid(), ts: now() }, item); const all = read(c); all.push(it); write(c, all); return it; },
      update: async (c, id, f) => { const all = read(c); const it = all.find((x) => String(x.id) === String(id)); if (!it) throw new Error('не найдено'); Object.assign(it, f, { updated: now() }); write(c, all); return it; },
      remove: async (c, id) => { write(c, read(c).filter((x) => String(x.id) !== String(id))); return { ok: true }; },
      reset: async () => { ['orders', 'decisions', 'tasks', 'meetings', 'audit', 'notes'].forEach((c) => { try { localStorage.removeItem(KEY + c); } catch (e) { /* */ } delete mem[c]; }); return { ok: true }; },
      mode: async (m) => {
        if (m) { mode = m; try { localStorage.setItem(KEY + 'mode', m); } catch (e) { /* */ } audit('администратор', 'режим ИИ', 'переключён на ' + m); }
        return { mode };
      },
      telegram: async () => ({ ok: false, reason: 'в демо по ссылке Telegram не подключён' }),
      async ai(opts, fallback) {
        const map = {};
        const sent = opts.mask ? mask(String(opts.user || ''), map) : null;
        const v = typeof fallback === 'function' ? fallback() : fallback;
        await new Promise((r) => setTimeout(r, 500));
        audit(opts.who, 'запрос к ИИ (встроенная логика)', opts.title || String(opts.user || '').slice(0, 200), false);
        return { ok: true, fallback: true, reason: 'демо по ссылке — ИИ работает только с сервером команды',
          masked: opts.mask ? { count: Object.keys(map).length, labels: Object.keys(map).sort(), sent_preview: sent.slice(0, 600) } : null,
          text: typeof v === 'string' ? v : JSON.stringify(v), json: typeof v === 'object' ? v : null, provider: 'встроенная логика' };
      },
    });
  }

  /* форматирование */
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const fmt = {
    n: (v) => nf0.format(v),
    n1: (v) => nf1.format(v),
    money: (v) => nf0.format(v) + ' BYN',
    money2: (v) => nf2.format(v) + ' BYN',
    pct: (v, d = 1) => (d ? nf1 : nf0).format(v) + ' %',
    delta: (fact, base) => base ? (fact - base) / Math.abs(base) * 100 : 0,
    signed: (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + (d ? nf1 : nf0).format(Math.abs(v)),
    date: (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
    dt: (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  };

  /* безопасная вставка текста в HTML */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastEl, toastT;
  function toast(text, ms = 2600) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  window.api = api; window.fmt = fmt; window.esc = esc; window.toast = toast;
})();
