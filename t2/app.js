/* Приложение picPac · заказ с телефона (трек 2).
   Путь: фото → проверка → корзина → заказ → статус. Черновик хранится на телефоне (localStorage + IndexedDB)
   и сам уходит на сервер, когда есть сеть. Цены и права — на сервере (/api/app/…).
   Для показа: ?demo=1 — войти гостем и открыть тестовую галерею. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const params = new URLSearchParams(location.search);
  const rid = () => Math.random().toString(36).slice(2, 10);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dec = (t) => String(t).replace(/(\d)\.(\d)/g, '$1,$2');
  const money = (v) => fmt.money2(Number(v) || 0);
  function plural(n, one, few, many) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; return b === 1 ? one : many; }
  const mmss = (sec) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  const fdate = (ts) => { try { return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ts || ''; } };

  /* ---------- хранилище на телефоне ---------- */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* переполнено или закрыто */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* нет доступа */ } },
  };
  const IDB = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const rq = indexedDB.open('picpac', 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('blobs'); rq.result.createObjectStore('thumbs'); };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    }));
    const run = (store, mode, fn) => open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error);
    })).catch(() => undefined);
    return { put: (s, k, v) => run(s, 'readwrite', (o) => o.put(v, k)), get: (s, k) => run(s, 'readonly', (o) => o.get(k)),
      del: (s, k) => run(s, 'readwrite', (o) => o.delete(k)), clear: (s) => run(s, 'readwrite', (o) => o.clear()) };
  })();

  /* ---------- состояние ---------- */
  const S = {
    view: 'home', stack: [], session: LS.get('pp_session', null), catalog: LS.get('pp_catalog', null), online: navigator.onLine !== false,
    draft: LS.get('pp_draft', null), thumbs: {}, energy: {}, busy: null, orders: LS.get('pp_orders', []), order: null, events: [], support: [],
    price: null, priceNote: '', sheet: null, err: '', form: LS.get('pp_form', { name: '', phone: '', address: '', point: 'center' }),
    pool: LS.get('pp_pool', []), sel: {}, issues: null, outbox: LS.get('pp_outbox', null), replace: null, sess: rid(), stepsSent: {}, poll: null, supportKey: rid(),
    notes: LS.get('pp_notes', []), notifyOn: LS.get('pp_notify', false), rejects: [], promoPending: '', inbox: [], tabFrom: null, join: null,
  };
  const saveForm = () => LS.set('pp_form', S.form);

  /* ---------- запросы к серверу ---------- */
  function setOnline(v) { if (S.online !== v) { S.online = v; renderNet(); if (v) { flushOutbox(); syncSoon(); } } }
  async function call(method, path, body, o) {
    o = o || {};
    const h = Object.assign({}, o.headers);
    if (S.session) h.Authorization = 'Bearer ' + S.session.token;
    if (body !== undefined && !o.raw) h['Content-Type'] = 'application/json';
    let r;
    try { r = await fetch('/api/app' + path, { method, headers: h, body: o.raw || (body !== undefined ? JSON.stringify(body) : undefined) }); }
    catch (e) { setOnline(false); throw { offline: true, message: 'Нет сети' }; }
    setOnline(true);
    const json = (r.headers.get('content-type') || '').includes('json');
    const d = json ? await r.json().catch(() => null) : (o.blob && r.ok ? await r.blob() : null);
    if (r.status === 401 && S.session) { S.session = null; LS.del('pp_session'); toast('Войдите заново'); go('login', true); }
    if (!r.ok) throw { status: r.status, message: (d && d.error) || 'Ошибка сервера (' + r.status + ')', data: d };
    return d;
  }
  function step(name) {
    if (S.stepsSent[name]) return; S.stepsSent[name] = 1;
    call('POST', '/step', { step: name, session: S.sess }).then(() => wire('Шаг клиента: ' + (STEP_NAME[name] || name))).catch(() => { });
  }

  /* ---------- вход ---------- */
  async function loginAs(login, password) {
    const guestTok = S.session && /^g-/.test(S.session.user.id) ? S.session.token : null;
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }) }).catch(() => null);
    if (!r) throw { message: 'Нет сети — войти можно, когда она появится' };
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw { message: d.error || 'Не удалось войти' };
    // гость вошёл в свою учётную запись: его черновик, фото, заказы и обращения переезжают к ней (сервер проверяет обе сессии)
    let moved = null;
    if (guestTok && d.user.role === 'customer') {
      try {
        const c = await fetch('/api/app/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + d.token }, body: JSON.stringify({ guest_token: guestTok }) });
        if (c.ok) moved = await c.json();
      } catch (e) { /* без сети перенос не случится: черновик останется на телефоне и загрузится заново */ }
    }
    setSession(d, !!moved);
    if (moved && (moved.orders || moved.projects)) toast('Перенесли в вашу учётную запись: заказов ' + moved.orders + ', черновиков ' + moved.projects, 4000);
  }
  async function loginGuest() { setSession(await call('POST', '/guest', {})); }
  function setSession(d, keep) {
    const changed = !keep && S.session && S.session.user.id !== d.user.id;
    S.session = { token: d.token, user: d.user }; LS.set('pp_session', S.session);
    if (changed && S.draft) { S.draft.id = 'pr-' + rid(); S.draft.version = 0; S.draft.photos.forEach((p) => { p.up = false; }); saveDraft(); }
    S.orders = []; LS.set('pp_orders', []);
  }

  /* ---------- каталог ---------- */
  async function loadCatalog() {
    try { S.catalog = await call('GET', '/catalog'); LS.set('pp_catalog', S.catalog); } catch (e) { /* остаётся сохранённый */ }
  }
  const prodOf = (id) => S.catalog && S.catalog.products.find((p) => p.id === id);
  const varOf = (prod, id) => prod.variants.find((v) => v.id === id) || prod.variants[0];
  const fromPrice = (p) => Math.min(...p.variants.map((v) => v.tiers ? Number(v.tiers[v.tiers.length - 1][1]) : Number(v.base || v.price)));

  /* цена «на глаз», когда нет сети; точную считает сервер */
  function localPrice(d) {
    const prod = prodOf(d.product), v = varOf(prod, d.variant), qty = unitsOf(d);
    let unit;
    if (prod.kind === 'print') { unit = Number(v.tiers[0][1]); v.tiers.forEach(([n, p]) => { if (qty >= n) unit = Number(p); }); }
    else if (prod.kind === 'book') { const pg = Number((d.options || {}).pages || 20); unit = Number(v.base) + Math.max(0, pg - v.pages_incl) * Number(v.page_price); }
    else unit = Number(v.price);
    const goods = unit * qty, dl = S.catalog.delivery.find((x) => x.id === d.delivery) || S.catalog.delivery[0];
    const dp = dl.free_from && goods >= Number(dl.free_from) ? 0 : Number(dl.price);
    return { goods: goods.toFixed(2), discount: '0.00', delivery: { id: dl.id, name: dl.name, price: dp.toFixed(2) }, total: (goods + dp).toFixed(2),
      lines: [{ name: prod.name + ' ' + v.name, qty, unit: unit.toFixed(2), sum: goods.toFixed(2), note: qty + ' шт × ' + unit.toFixed(2) }], eta_text: 'ориентировочно', local: true };
  }
  const unitsOf = (d) => { const k = prodOf(d.product).kind; return (k === 'print' || k === 'magnet') ? d.photos.reduce((s, p) => s + (p.qty || 1), 0) || 1 : (d.qty || 1); };
  let priceTimer;
  function refreshPrice() {
    if (!S.draft || !S.catalog) return;
    const d = S.draft;
    S.price = localPrice(d); S.priceNote = '';
    clearTimeout(priceTimer);
    priceTimer = setTimeout(async () => {
      try {
        S.price = await call('POST', '/price', { items: [{ product: d.product, variant: d.variant, qty: unitsOf(d), options: d.options }], delivery: d.delivery, promo: d.promo });
        S.priceNote = ''; S.err = '';
      } catch (e) {
        if (e.offline) S.priceNote = 'Нет сети — цена ориентировочная'; else { S.priceNote = ''; S.err = e.message; if (e.data && e.data.field === 'promo') { d.promo = ''; } }
      }
      if (['cart', 'product', 'photos'].includes(S.view) && !$('#sheet') && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) rerender();
    }, 350);
  }

  /* ---------- черновик ---------- */
  function newDraft(prod) {
    const v = prod.variants[0], opts = {};
    prod.options.forEach((o) => { if (o.kind === 'number') opts[o.id] = o.default; else opts[o.id] = o.values[0].id; });
    return { id: 'pr-' + rid(), product: prod.id, variant: v.id, options: opts, fit: false, title: '', photos: [], qty: 1, delivery: 'pickup', promo: S.promoPending || '', version: 0, t0: null };
  }
  function saveDraft() { LS.set('pp_draft', S.draft); syncSoon(); if (S.catalog) refreshPrice(); }
  let syncT, syncing = false, again = false;
  function syncSoon() { clearTimeout(syncT); syncT = setTimeout(syncDraft, 800); }
  async function syncDraft() {
    if (!S.draft || !S.session || !S.online) return;
    if (syncing) { again = true; return; }
    syncing = true;
    try {
      const d = S.draft;
      const r = await call('POST', '/projects/' + d.id, Object.assign({}, d, { base_version: d.version, force: true }));
      d.version = r.version; LS.set('pp_draft', d);
      await uploadPending();
    } catch (e) { /* без сети — повторим, когда она появится */ }
    syncing = false;
    if (again) { again = false; syncSoon(); }
  }
  async function uploadPending() {
    for (const p of S.draft.photos) {
      if (p.up || p.rejected) continue;
      const blob = await IDB.get('blobs', p.id);
      if (!blob) { p.up = true; continue; }
      try {
        await call('POST', '/photos', undefined, { raw: blob, headers: { 'X-Photo-Id': p.id, 'Content-Type': blob.type || 'image/jpeg' } });
        p.up = true;
      } catch (e) {
        if (e.offline) throw e;
        p.rejected = e.message; toast(p.name + ': ' + e.message);
      }
      LS.set('pp_draft', S.draft);
      if (S.view === 'photos') rerender();
    }
  }

  /* ---------- анализ фото на телефоне ---------- */
  const AN = 320;
  function analyze(src, sw, sh) {
    const sc = AN / Math.max(sw, sh), aw = Math.max(8, Math.round(sw * sc)), ah = Math.max(8, Math.round(sh * sc));
    const cv = document.createElement('canvas'); cv.width = aw; cv.height = ah;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, aw, ah);
    const d = cx.getImageData(0, 0, aw, ah).data, g = new Float32Array(aw * ah);
    let sum = 0;
    for (let i = 0, j = 0; j < g.length; i += 4, j++) { g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += g[j]; }
    let ls = 0, ls2 = 0, n = 0;
    const colE = new Float32Array(aw), rowE = new Float32Array(ah);
    for (let y = 1; y < ah - 1; y++) for (let x = 1; x < aw - 1; x++) {
      const k = y * aw + x, L = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - aw] - g[k + aw];
      ls += L; ls2 += L * L; n++;
      const e = Math.abs(g[k + 1] - g[k - 1]) + Math.abs(g[k + aw] - g[k - aw]); colE[x] += e; rowE[y] += e;
    }
    const mean = ls / n, hc = document.createElement('canvas'); hc.width = 9; hc.height = 8;
    const hx = hc.getContext('2d', { willReadFrequently: true }); hx.imageSmoothingQuality = 'high'; hx.drawImage(cv, 0, 0, 9, 8);
    const hd = hx.getImageData(0, 0, 9, 8).data; let hash = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const a = (y * 9 + x) * 4, b = a + 4; hash += (hd[a] * .299 + hd[a + 1] * .587 + hd[a + 2] * .114) > (hd[b] * .299 + hd[b + 1] * .587 + hd[b + 2] * .114) ? '1' : '0'; }
    return { sharp: ls2 / n - mean * mean, bright: sum / g.length, hash, colE, rowE };
  }
  function thumbOf(src, sw, sh, max) {
    const s = Math.min(1, max / Math.max(sw, sh)), c = document.createElement('canvas'); c.width = Math.round(sw * s); c.height = Math.round(sh * s);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.8);
  }
  const hamming = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) d += a[i] !== b[i]; return d; };
  function classify(list) {
    list = list || S.draft.photos;
    const sorted = list.map((p) => p.sharp).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
    list.forEach((p) => { p.blur = p.sharp < 12 || (p.sharp < median * 0.3 && p.sharp < 150); p.dark = p.bright < 48; p.dup = false; });
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) {
      if (list[j].dup || list[i].dup) continue;
      if (hamming(list[i].hash, list[j].hash) <= 10) (list[i].sharp >= list[j].sharp ? list[j] : list[i]).dup = true;
    }
  }
  function bestWindow(E, frac) {
    const n = E.length, k = Math.max(1, Math.round(frac * n)), W = new Float32Array(n);
    for (let i = 0; i < n; i++) W[i] = E[i] * (1 - 0.45 * Math.abs((i + 0.5) / n - 0.5) * 2);
    let s = 0; for (let i = 0; i < k; i++) s += W[i];
    let best = s, at = 0;
    for (let i = k; i < n; i++) { s += W[i] - W[i - k]; if (s > best) { best = s; at = i - k + 1; } }
    return Math.min(1 - frac, at / n);
  }
  function cropFor(p, ratio, fit) {
    const portrait = p.h >= p.w, aspect = portrait ? ratio : 1 / ratio, ia = p.w / p.h;
    if (fit || Math.abs(ia - aspect) < 0.01) return { x: 0, y: 0, w: 1, h: 1, aspect, portrait, cut: 0 };
    const E = S.energy[p.id];
    const M = p.man, clamp = (v, max) => Math.min(max, Math.max(0, v));     // p.man — кадр, который человек сдвинул сам
    if (ia > aspect) { const w = aspect / ia; return { x: M ? clamp(M.x, 1 - w) : E ? bestWindow(E.colE, w) : (1 - w) / 2, y: 0, w, h: 1, aspect, portrait, cut: 1 - w }; }
    const h = ia / aspect; return { x: 0, y: M ? clamp(M.y, 1 - h) : E ? bestWindow(E.rowE, h) : (1 - h) / 2, w: 1, h, aspect, portrait, cut: 1 - h };
  }
  function recrop() {
    const d = S.draft, prod = prodOf(d.product), v = varOf(prod, d.variant);
    d.photos.forEach((p) => { const c = cropFor(p, v.ratio, d.fit); p.crop = { x: c.x, y: c.y, w: c.w, h: c.h }; });
  }
  function qualityOf(p) {
    const d = S.draft, v = varOf(prodOf(d.product), d.variant), c = cropFor(p, v.ratio, d.fit), [sh, lg] = v.min_px;
    const nw = c.portrait ? sh : lg, nh = c.portrait ? lg : sh, q = Math.min(p.w * c.w / nw, p.h * c.h / nh);
    return q >= 0.85 ? { lvl: 'ok', label: 'Отлично' } : q >= 0.5 ? { lvl: 'soft', label: 'Будет мягко' } : { lvl: 'low', label: 'Мало пикселей' };
  }
  function bgStyle(p, crop) {
    const t = S.thumbs[p.id]; if (!t) return '';
    if (crop.w >= 0.999 && crop.h >= 0.999) return `background-image:url(${t});background-size:100% 100%;`;
    const px = crop.w < 1 ? crop.x / (1 - crop.w) * 100 : 0, py = crop.h < 1 ? crop.y / (1 - crop.h) * 100 : 0;
    return `background-image:url(${t});background-size:${100 / crop.w}% ${100 / crop.h}%;background-position:${px}% ${py}%;`;
  }

  /* ---------- добавление фото ---------- */
  const okType = (f) => /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);
  async function addFiles(files, toPool, by) {
    files = Array.from(files);
    const good = files.filter(okType), bad = files.length - good.length;
    const rej = files.filter((f) => !okType(f)).map((f) => ({ name: f.name || 'Файл', why: /hei[cf]/i.test((f.name || '') + f.type) ? 'формат HEIC не печатаем: сохраните снимок как JPEG' : 'формат не поддерживается: нужен JPEG или PNG' }));
    if (bad) toast(bad + ' ' + plural(bad, 'файл не подошёл', 'файла не подошли', 'файлов не подошли') + ': принимаем только JPEG и PNG', 4500);
    if (!good.length) { S.rejects = rej; rerender(); return; }
    const d = toPool ? { photos: S.pool, t0: 1, pool: true } : S.draft; if (!d.t0) d.t0 = Date.now();
    const tooBig = good.filter((f) => f.size > 25 * 1024 * 1024); tooBig.forEach((f) => rej.push({ name: f.name, why: 'файл больше 25 МБ: уменьшите его или выберите другой' }));
    const todo = good.filter((f) => f.size <= 25 * 1024 * 1024), max = d.pool ? 400 : prodOf(d.product).photos.max;
    S.busy = { done: 0, total: todo.length }; rerender();
    let failed = 0, replaced = S.replace; S.replace = null;
    for (const f of todo) {
      if (!replaced && d.photos.length >= max) { toast('Для этого продукта максимум ' + max + ' фото'); break; }
      try {
        const url = URL.createObjectURL(f);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const w = img.naturalWidth, h = img.naturalHeight;
        if (Math.min(w, h) < 400) { rej.push({ name: f.name, why: 'слишком маленькое (' + w + '×' + h + '): нужно хотя бы 400 пикселей по короткой стороне' }); URL.revokeObjectURL(url); S.busy.done++; continue; }
        const a = analyze(img, w, h), id = 'f' + rid() + rid().slice(0, 3);
        const p = { id, name: (f.name || 'Фото').slice(0, 60), w, h, qty: 1, crop: null, sharp: a.sharp, bright: a.bright, hash: a.hash, up: false }; if (by) p.by = by;
        S.thumbs[id] = thumbOf(img, w, h, 360); S.energy[id] = { colE: a.colE, rowE: a.rowE };
        await IDB.put('blobs', id, f); await IDB.put('thumbs', id, S.thumbs[id]);
        URL.revokeObjectURL(url);
        if (replaced) { const i = d.photos.findIndex((x) => x.id === replaced); if (i >= 0) { dropPhotoData(d.photos[i].id); d.photos[i] = p; } else d.photos.push(p); replaced = null; }
        else d.photos.push(p);
      } catch (e) { failed++; rej.push({ name: f.name, why: 'файл не открылся: возможно, он повреждён' }); }
      S.busy.done++; renderBusy(); await sleep(0);
    }
    S.rejects = rej;
    if (rej.length && !bad) toast(rej.length + ' ' + plural(rej.length, 'файл не добавлен', 'файла не добавлены', 'файлов не добавлены') + ' — причины на экране', 3500);
    S.busy = null; classify(d.photos);
    if (d.pool) LS.set('pp_pool', S.pool); else { recrop(); saveDraft(); step('photos'); }
    rerender();
  }
  function dropPhotoData(id) {
    delete S.thumbs[id]; delete S.energy[id]; IDB.del('blobs', id); IDB.del('thumbs', id);
    if (S.session && S.online) call('POST', '/photos/' + id + '/delete', {}).catch(() => { });
  }
  async function addDemo(toPool) {
    const D = window.DemoGallery;
    if (!toPool && !S.draft.t0) S.draft.t0 = Date.now();
    S.busy = { done: 0, total: D.DEMO.length }; rerender();
    const files = [];
    for (const [scene, seed, size, mod] of D.DEMO) {
      const c = D.render1(scene, seed, size, mod), big = document.createElement('canvas');
      const k = mod === 'small' ? 1024 / c.width : 3; big.width = Math.round(c.width * k); big.height = Math.round(c.height * k);
      const bx = big.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(c, 0, 0, big.width, big.height);
      const blob = await new Promise((r) => big.toBlob(r, 'image/jpeg', 0.82));
      files.push(new File([blob], D.NAMES[scene] + (mod ? ' (' + mod + ')' : '') + '.jpg', { type: 'image/jpeg' }));
      S.busy.done++; renderBusy(); await sleep(0);
    }
    await addFiles(files, toPool);
  }

  /* ---------- иконки ---------- */
  const SV = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICON = {
    back: SV('<path d="M15 18l-6-6 6-6"/>'), check: SV('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    photos: SV('<rect x="3" y="5" width="15" height="13" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/><path d="M3 15l4-4 4 4 3-3 4 4"/><circle cx="13.5" cy="9" r="1.3"/>'),
    book: SV('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 8h6"/>'),
    cal: SV('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    canvas: SV('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 16l5-5 4 4 2-2 5 5"/>'),
    magnet: SV('<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/>'),
    home: SV('<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
    list: SV('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    user: SV('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    ok: SV('<path d="M20 6L9 17l-5-5"/>'), warn: SV('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
    spark: SV('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'),
    info: SV('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    people: SV('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5.5"/>'),
    star: SV('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>'),
    heart: SV('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>'),
    bell: SV('<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
    link: SV('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  };
  const haptic = (ok) => { try { navigator.vibrate && navigator.vibrate(ok ? [20, 40, 20] : 10); } catch (e) { /* нет вибрации */ } };

  /* ---------- навигация и отрисовка ---------- */
  const TITLES = { home: 'picPac', product: 'Продукт', photos: 'Фото', layout: 'Макет', check: 'Проверка', cart: 'Оформление', done: 'Заказ', orders: 'Мои заказы', order: 'Заказ', profile: 'Профиль', login: 'Вход', feed: 'Мои фото', social: 'Идеи', join: 'Общий альбом' };
  const TABS = ['home', 'feed', 'social', 'orders', 'profile'];
  const flowOf = () => S.draft && hasLayout(S.draft) ? ['product', 'photos', 'layout', 'check', 'cart'] : ['product', 'photos', 'check', 'cart'];
  function go(view, replace) {
    if (!replace && S.view !== view) S.stack.push(S.view);
    if (view === 'social' && S.soc) S.soc.fetched = false;
    S.view = view; S.err = ''; stopPoll(); render(); const s = $('#screen'); s.scrollTop = 0;
    s.classList.remove('enter'); void s.offsetWidth; s.classList.add('enter');        // мягкий переход между экранами
  }
  document.addEventListener('keydown', (e) => {          // Esc закрывает нижнее окно
    if (e.key === 'Escape') { const sh = $('#sheet'); if (sh) { sh.remove(); S.sheet = null; S.pgSheet = null; } }
  });
  function back() { go(S.stack.pop() || 'home', true); S.stack.length = Math.min(S.stack.length, 6); }
  function rerender() { const s = $('#screen'), t = s.scrollTop; render(); s.scrollTop = t; }
  function rerenderKeep(id) { const el = $('#' + id), pos = el ? el.selectionStart : 0; rerender(); const n = $('#' + id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* tel */ } } }
  function render() {
    renderNet();
    const head = $('#head'), isTab = TABS.includes(S.view), FLOW = S.draft ? flowOf() : [], fi = FLOW.indexOf(S.view);
    const guest = S.session && /^g-/.test(S.session.user.id), logo = '<span class="logo">pic<b>Pac</b></span>';
    const unread = S.notes.filter((n) => !n.read).length;
    const bell = `<button class="icon-btn" id="bell" aria-label="Уведомления${unread ? ': новых ' + unread : ''}">${ICON.bell}${unread ? `<b>${unread}</b>` : ''}</button>`;
    const right = isTab ? `<span class="head-acts">${S.view === 'home' && guest ? '<button class="head-link" id="signin">Войти</button>' : ''}${bell}</span>` : '<span></span>';
    const sub = fi >= 0 ? `<small class="stepno">Шаг ${fi + 1} из ${FLOW.length}</small>` : '';
    head.innerHTML = `${isTab || S.view === 'login' ? '<span></span>' : `<button class="icon-btn" id="back" aria-label="Назад">${ICON.back}</button>`}<div class="ttl"><h2>${S.view === 'home' ? logo : TITLES[S.view]}</h2>${sub}</div>${right}
      ${fi >= 0 ? `<div class="progress" style="grid-template-columns:repeat(${FLOW.length},1fr)" aria-hidden="true">${FLOW.map((_, i) => `<i class="${i <= fi ? 'on' : ''}"></i>`).join('')}</div>` : ''}`;
    const b = $('#back'); if (b) b.onclick = back;
    const si = $('#signin'); if (si) si.onclick = () => { S.stack = []; go('profile', true); };
    const bl = $('#bell'); if (bl) bl.onclick = openNotes;
    document.querySelectorAll('#sideSteps li').forEach((li) => { const s = { home: 0, feed: 1, product: 0, photos: 1, layout: 1, check: 2, cart: 3, done: 4, order: 4 }[S.view]; li.classList.toggle('on', +li.dataset.s === s); li.classList.toggle('done', +li.dataset.s < (s == null ? -1 : s)); });
    if (S.busy) { renderBusy(); $('#bar').innerHTML = ''; fitBar(); return; }
    const v = VIEWS[S.view]();
    $('#screen').innerHTML = v.html;
    $('#bar').innerHTML = (v.bar || '') + (isTab ? tabbar() : '');
    document.querySelectorAll('[data-tab]').forEach((t) => { t.onclick = () => { S.stack = []; go(t.dataset.tab, true); }; });
    v.bind && v.bind($('#screen'), $('#bar'));
    const rx = $('#rjx'); if (rx) rx.onclick = () => { S.rejects = []; rerender(); };
    fitBar();
    if (S.view === 'orders') loadOrders();
    if (S.view === 'social' && !S.soc.fetched) { S.soc.fetched = true; loadSocial(); }
    if (S.view === 'order' || S.view === 'done') startPoll();
  }
  function tabbar() {
    const i = TABS.indexOf(S.view), from = S.tabFrom == null ? i : S.tabFrom; S.tabFrom = i;
    const t = (id, ic, name) => `<button class="tab3" data-tab="${id}" aria-current="${S.view === id}">${ICON[ic]}<span>${name}</span></button>`;
    if (from !== i) requestAnimationFrame(() => requestAnimationFrame(() => { const p = $('.tab-pill'); if (p) p.style.setProperty('--i', i); }));
    return `<nav class="tabs3" aria-label="Разделы"><i class="tab-pill" style="--i:${from}" aria-hidden="true"></i>${t('home', 'home', 'Каталог')}${t('feed', 'photos', 'Мои фото')}${t('social', 'people', 'Идеи')}${t('orders', 'list', 'Заказы')}${t('profile', 'user', 'Профиль')}</nav>`;
  }
  function renderNet() {
    const n = $('#net'); if (!n) return;
    const queued = !!S.outbox;
    n.hidden = S.online && !queued;
    n.textContent = !S.online ? (queued ? 'Нет сети — заказ сохранён на телефоне, отправим сам' : 'Нет сети — всё сохранено на телефоне') : 'Отправляю заказ…';
  }
  function renderBusy() {
    if (!S.busy) return; const { done, total } = S.busy;
    $('#screen').innerHTML = `<div class="loading"><div class="ai-ava">${ICON.spark}</div>
      <h3>${esc(S.busy.title || 'Смотрю кадры')}</h3><div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
      <p class="num">${done} из ${total}</p><p>${esc(S.busy.note || 'Резкость, свет и дубли проверяю прямо на телефоне')}</p></div>`;
  }

  /* ---------- экраны ---------- */
  const VIEWS = {};
  VIEWS.login = () => ({
    html: `<section class="hello"><h1>picPac</h1><p>Закажите печать за несколько касаний: выберите фото — остальное сделаем сами.</p></section>
      <div class="pick"><button class="btn btn-primary btn-xl" id="guest">Продолжить гостем</button></div>
      <p class="sec-t">Или войти</p>
      <form id="lf" class="form"><div class="field"><label for="lg">Логин</label><input class="input" id="lg" autocomplete="username" value="client"></div>
      <div class="field"><label for="pw">Пароль</label><input class="input" id="pw" type="password" autocomplete="current-password" placeholder="demo2026"></div>
      ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}<button class="btn btn-xl" type="submit">Войти</button></form>
      <p class="muted" style="font-size:13px">Тестовая запись: client / demo2026. Данные выдуманные.</p>`,
    bind(scr) {
      $('#guest').onclick = async () => { try { await loginGuest(); startApp(); } catch (e) { S.err = e.message; rerender(); } };
      $('#lf').onsubmit = async (e) => { e.preventDefault(); try { await loginAs($('#lg').value.trim(), $('#pw').value); startApp(); } catch (er) { S.err = er.message; rerender(); } };
    },
  });

  /* картинки для карточек продуктов: рисуем из тестовых кадров, чтобы каталог выглядел живым */
  let ART = LS.get('pp_art', null);
  function makeArt() {
    if (ART || !window.DemoGallery) return;
    try {
      const D = window.DemoGallery, mk = (scene, seed, size) => { const c = D.render1(scene, seed, size), s = document.createElement('canvas'), k = 240 / Math.max(c.width, c.height);
        s.width = Math.round(c.width * k); s.height = Math.round(c.height * k); s.getContext('2d').drawImage(c, 0, 0, s.width, s.height); return s.toDataURL('image/jpeg', 0.8); };
      ART = { a: mk('sunset', 11, 'p'), b: mk('mountains', 12, 'l'), c: mk('flower', 23, 'l'), d: mk('coffee', 14, 's'), e: mk('lake', 18, 'p') };
      LS.set('pp_art', ART);
    } catch (e) { ART = null; }
  }
  const bg = (k) => `style="background-image:url(${ART[k]})"`;
  function artOf(kind) {
    if (!ART) return ICON.photos;
    return {
      print: `<span class="art a-print"><i ${bg('c')}></i><i ${bg('b')}></i><i ${bg('a')}></i></span>`,
      book: `<span class="art a-book"><i ${bg('e')}></i></span>`,
      calendar: `<span class="art a-cal"><i ${bg('b')}></i><b></b></span>`,
      magnet: `<span class="art a-mag"><i ${bg('d')}></i></span>`,
      canvas: `<span class="art a-can"><i ${bg('a')}></i></span>`,
    }[kind] || ICON.photos;
  }
  const OCCASIONS = [['Выпускной альбом', 'book', 'classic'], ['Свадьба', 'book', 'premium'], ['Семейная книга', 'book', 'classic'], ['Календарь 2027', 'calendar', 'wall'], ['Печать 10×15', 'print', '10x15'], ['Холст на стену', 'canvas', '30x40']];
  VIEWS.home = () => {
    const cat = S.catalog, d = S.draft, n = d ? d.photos.length : 0;
    const cont = d && n ? `<button class="card cont" id="cont"><b>Продолжить: ${esc(prodOf(d.product).name)}</b><span>${n} ${plural(n, 'фото', 'фото', 'фото')} · черновик сохранён</span><i aria-hidden="true">${ICON.back}</i></button>` : '';
    const ob = S.outbox ? `<div class="warnbox"><span>Заказ ждёт сети и уйдёт сам</span><button class="btn btn-sm" id="retry">Отправить сейчас</button></div>` : '';
    const skel = '<div class="pcard sk"><span class="pic"></span><b></b><small></small></div>'.repeat(4);
    const cards = cat ? cat.products.map((p) => `<button class="pcard" data-pr="${p.id}"><span class="pic">${artOf(p.kind)}</span><b>${esc(p.name)}</b><small>${esc(p.short)}</small><em>от ${money(fromPrice(p))}</em></button>`).join('') : skel;
    return {
      html: `<section class="hello"><h1>Фото — в печать за пару касаний</h1><p>Выберите снимки из галереи. Подскажем, что из них получится.</p></section>
        <label class="btn btn-primary btn-xl cta" for="file" id="cta">${ICON.photos.replace('<svg', '<svg width="22" height="22"')} Выбрать фото</label>
        ${ob}${cont}${recsHtml()}
        <p class="sec-t">Для чего?</p><div class="occ" role="list">${OCCASIONS.map(([t, pid, vid], i) => `<button class="occ-i" role="listitem" data-oc="${i}">${esc(t)}</button>`).join('')}</div>
        <p class="sec-t">Все продукты</p><div class="pgrid">${cards}</div>
        ${cat ? '' : '<p class="muted" style="text-align:center">Загружаю каталог…</p>'}
        <div class="trust"><div>${ICON.ok} Бесплатная перепечатка, если нашли брак</div><div>${ICON.ok} Заказ без списания денег — платите при получении</div><div>${ICON.ok} Черновик сохраняется сам, даже без сети</div></div>`,
      bind(scr) {
        scr.querySelectorAll('[data-pr]').forEach((b) => { b.onclick = () => openProduct(b.dataset.pr); });
        scr.querySelectorAll('[data-oc]').forEach((b) => { const o = OCCASIONS[+b.dataset.oc]; b.onclick = () => openProduct(o[1], o[2]); });
        const c = $('#cont'); if (c) c.onclick = () => go('photos');
        const r = $('#retry'); if (r) r.onclick = flushOutbox;
        scr.querySelectorAll('[data-rec]').forEach((b) => { b.onclick = () => runRec(recs()[+b.dataset.rec].act); });
        $('#file').accept = 'image/jpeg,image/png';
      },
    };
  };
  function openProduct(id, vid) {
    const prod = prodOf(id); if (!prod) return toast('Этот продукт сейчас недоступен');
    vid = vid && prod.variants.some((v) => v.id === vid) ? vid : null;
    if (!S.draft || S.draft.product !== id) {
      if (S.draft && S.draft.photos.length) {            // прежние фото не выбрасываем: они вернутся в «Мои фото»
        S.pool = S.pool.concat(S.draft.photos); LS.set('pp_pool', S.pool); toast('Прежние фото сохранены в «Моих фото»');
      }
      S.draft = newDraft(prod); if (vid) S.draft.variant = vid; saveDraft();
    } else if (vid) { S.draft.variant = vid; saveDraft(); }
    step('catalog'); refreshPrice(); go('product');
  }

  VIEWS.product = () => {
    const d = S.draft, prod = prodOf(d.product), v = varOf(prod, d.variant), P = S.price || localPrice(d);
    const vars = prod.variants.map((x) => `<button class="pchip" data-v="${x.id}" aria-pressed="${x.id === d.variant}"><b>${esc(x.name)}</b><span>${money(x.tiers ? x.tiers[0][1] : (x.base || x.price))}</span></button>`).join('');
    const opts = prod.options.map((o) => o.kind === 'number'
      ? `<div class="allqty"><span>${esc(o.name)}</span><span class="stepper"><button data-pg="-${o.step}" aria-label="Меньше">−</button><output>${d.options[o.id]}</output><button data-pg="${o.step}" aria-label="Больше">+</button></span></div>`
      : `<div class="field"><label>${esc(o.name)}</label><div class="seg" style="grid-template-columns:repeat(${o.values.length},1fr)">${o.values.map((x) => `<button data-op="${o.id}:${x.id}" aria-pressed="${d.options[o.id] === x.id}">${esc(x.name)}</button>`).join('')}</div></div>`).join('');
    const copies = (prod.kind === 'print' || prod.kind === 'magnet') ? '' : `<div class="allqty"><span>Количество</span><span class="stepper"><button data-q="-1" aria-label="Меньше">−</button><output>${d.qty}</output><button data-q="1" aria-label="Больше">+</button></span></div>`;
    const tiers = v.tiers ? `<div class="inset">Чем больше — тем дешевле: ${v.tiers.map(([n, p]) => `от ${n} шт — ${money(p)}`).join(', ')}.</div>` : '';
    return {
      html: `<div class="phero"><span class="pic">${artOf(prod.kind)}</span><div><h1>${esc(prod.name)}</h1><p>${esc(prod.description)}</p></div></div>
        <div class="chips-row" role="group" aria-label="Вариант">${vars}</div>${opts}${copies}${tiers}
        <div class="inset"><b>Что нужно от фото.</b> ${esc(prod.requirements)}</div>
        <div class="inset">Срок изготовления: <b>${prod.lead_days[0] === prod.lead_days[1] ? prod.lead_days[0] : prod.lead_days[0] + '–' + prod.lead_days[1]} дн.</b></div>`,
      bar: `<button class="btn btn-primary btn-xl" id="next">Выбрать фото</button><div class="sub">${prod.kind === 'print' ? 'Цена зависит от количества отпечатков' : 'Цена: ' + money(P.goods) + (P.local ? ' (ориентировочно)' : '')}</div>`,
      bind(scr) {
        const upd = () => { recrop(); saveDraft(); refreshPrice(); rerender(); };
        scr.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { d.variant = b.dataset.v; upd(); }; });
        scr.querySelectorAll('[data-op]').forEach((b) => { b.onclick = () => { const [k, val] = b.dataset.op.split(':'); d.options[k] = val; upd(); }; });
        scr.querySelectorAll('[data-pg]').forEach((b) => { b.onclick = () => { const o = prod.options.find((x) => x.kind === 'number'); d.options[o.id] = Math.max(o.min, Math.min(o.max, d.options[o.id] + Number(b.dataset.pg))); upd(); }; });
        scr.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { d.qty = Math.max(1, Math.min(99, d.qty + Number(b.dataset.q))); upd(); }; });
        $('#next').onclick = () => go('photos');
      },
    };
  };

  VIEWS.photos = () => {
    const d = S.draft, prod = prodOf(d.product), n = d.photos.length, bad = d.photos.filter((p) => p.blur || p.dark || p.dup).length;
    const accept = 'image/jpeg,image/png';
    if (!n) return {
      html: `<section class="hello"><h1>Выберите фото</h1><p>${esc(prod.name)}: ${prod.photos.min === prod.photos.max ? prod.photos.min : 'от ' + prod.photos.min} ${plural(prod.photos.max, 'фото', 'фото', 'фото')}. Принимаем JPEG и PNG до 25 МБ.</p></section>
        ${rejectsHtml()}${inboxHtml()}<div class="pick"><label class="btn btn-primary btn-xl" for="file">${ICON.photos.replace('<svg', '<svg width="22" height="22"')} Выбрать из галереи</label>
        <button class="btn btn-lg" id="demo">Тестовая галерея · 20 кадров</button></div>
        <div class="trust"><div>${ICON.ok} Проверим резкость, свет и дубли на телефоне</div><div>${ICON.ok} Черновик сохраняется сам — можно закрыть и вернуться</div><div>${ICON.ok} Подгоним под формат и честно скажем, хватает ли пикселей</div></div>`,
      bind() { $('#demo').onclick = () => addDemo(false); $('#file').accept = accept; bindShare(); },
    };
    const ratio = !(prod.kind === 'book' && false);
    const items = d.photos.map((p, i) => {
      const q = qualityOf(p), tag = p.rejected ? '<span class="tag bad">Не принято</span>' : p.blur ? '<span class="tag bad">Размыто</span>' : p.dup ? '<span class="tag bad">Дубль</span>' : p.dark ? '<span class="tag bad">Темно</span>' : q.lvl === 'low' ? '<span class="tag warn">Мало пикс.</span>' : '';
      const qty = (prod.kind === 'print' || prod.kind === 'magnet') && p.qty > 1 ? `<span class="qb">×${p.qty}</span>` : '';
      return `<button class="th on ${p.blur || p.dark || p.dup ? 'flag' : ''}" data-i="${i}" aria-label="Фото ${i + 1}, ${esc(p.name)}"><img src="${S.thumbs[p.id] || ''}" alt=""><span class="ix">${i + 1}</span>${qty}${tag}${p.by ? `<span class="by" title="Добавил(а) ${esc(p.by)}">${esc(p.by[0].toUpperCase())}</span>` : ''}</button>`;
    }).join('');
    const fitSeg = (prod.kind === 'print' || prod.kind === 'magnet') ? `<div class="seg" role="group" aria-label="Как печатать"><button data-fit="0" aria-pressed="${!d.fit}">Заполнить кадр</button><button data-fit="1" aria-pressed="${d.fit}">С белыми полями</button></div>` : '';
    return {
      html: `${rejectsHtml()}${inboxHtml()}<div class="ai-note"><span class="ai-ava">${ICON.spark}</span><div class="ai-body">${bad ? `Нашла <b>${bad}</b> ${plural(bad, 'слабый кадр', 'слабых кадра', 'слабых кадров')} (размытые, тёмные, дубли). Можно убрать одним касанием.` : `<b>${n}</b> ${plural(n, 'кадр', 'кадра', 'кадров')} — всё выглядит хорошо.`}
        <div class="ai-src">Проверено на телефоне · файлы ${d.photos.every((p) => p.up) ? 'загружены' : 'ждут загрузки'}</div></div></div>
        ${bad ? `<button class="btn" id="dropbad">Убрать слабые (${bad})</button>` : ''}${fitSeg}
        <div class="thumbs">${items}</div>
        <label class="btn" for="file">+ Добавить ещё</label>${shareHtml()}`,
      bar: `<button class="btn btn-primary btn-xl" id="next">Дальше</button><div class="sub">${n} ${plural(n, 'фото', 'фото', 'фото')} · ${S.price && !S.price.local ? 'сейчас ' + money(S.price.total) : 'порядок меняется касанием'}</div>`,
      bind(scr) {
        $('#file').accept = accept;
        bindShare();
        scr.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { S.sheet = +b.dataset.i; renderSheet(); }; });
        scr.querySelectorAll('[data-fit]').forEach((b) => { b.onclick = () => { d.fit = b.dataset.fit === '1'; recrop(); saveDraft(); rerender(); }; });
        const db = $('#dropbad'); if (db) db.onclick = () => { d.photos.filter((p) => p.blur || p.dark || p.dup).forEach((p) => dropPhotoData(p.id)); d.photos = d.photos.filter((p) => !(p.blur || p.dark || p.dup)); classify(); saveDraft(); rerender(); };
        $('#next').onclick = async () => {
          if (hasLayout(d)) { ensureLayout(); step('layout'); go('layout'); return; }
          step('layout'); await runCheck(); go('check');
        };
      },
    };
  };

  /* ---------- автомакет: раскладка фото по страницам книги и календаря ---------- */
  const hasLayout = (d) => { const k = prodOf(d.product).kind; return k === 'book' || k === 'calendar'; };
  const pagesOf = (d) => prodOf(d.product).kind === 'calendar' ? 12 : Number((d.options || {}).pages || 20);
  const layoutKey = (d) => d.photos.map((p) => p.id).join(',') + '|' + pagesOf(d);
  /* Правило: порядок съёмки сохраняется; фото делятся по страницам поровну (не больше 4 на странице),
     лишние страницы остаются пустыми — об этом скажет проверка. Календарь: по одному фото на месяц, 13-е — обложка. */
  function buildLayout(d) {
    const ids = d.photos.map((p) => p.id), P = pagesOf(d), N = ids.length;
    if (prodOf(d.product).kind === 'calendar') {
      const pages = Array.from({ length: 12 }, (_, i) => ids[i] ? [ids[i]] : []);
      if (ids[12]) pages.push([ids[12]]);
      return pages;
    }
    const base = Math.min(4, Math.floor(N / P)), extra = Math.min(N - base * P, P), pages = [];
    let k = 0;
    if (N >= P) for (let i = 0; i < P; i++) { const c = Math.min(4, base + (i < extra ? 1 : 0)); pages.push(ids.slice(k, k + c)); k += c; }
    else for (let i = 0; i < P; i++) pages.push(i < N ? [ids[i]] : []);
    return pages;
  }
  function ensureLayout(force) {
    const d = S.draft;
    if (force || !d.layout || d.layoutKey !== layoutKey(d)) { d.layout = buildLayout(d); d.layoutKey = layoutKey(d); saveDraft(); }
  }
  VIEWS.layout = () => {
    const d = S.draft; ensureLayout();
    const lay = d.layout, prod = prodOf(d.product), cal = prod.kind === 'calendar', N = d.photos.length, P = pagesOf(d);
    const empty = lay.slice(0, cal ? 12 : P).filter((pg) => !pg.length).length;
    const MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const page = (pg, i) => `<button class="pg ${pg.length ? '' : 'empty'}" data-pg="${i}" aria-label="${cal ? (i < 12 ? MON[i] : 'Обложка') : 'Страница ' + (i + 1)}, фото: ${pg.length}">
      <span class="mos m${Math.min(pg.length, 4)}">${pg.slice(0, 4).map((id) => `<i style="background-image:url(${S.thumbs[id] || ''})"></i>`).join('') || '<em>пусто</em>'}</span>
      <small>${cal ? (i < 12 ? MON[i] : 'Обложка') : i + 1}</small></button>`;
    const fewPages = !cal && N < P && P > prod.options[0].min ? Math.max(prod.options[0].min, N + (N % 2)) : 0;
    return {
      html: `<div class="ai-note"><span class="ai-ava">${ICON.spark}</span><div class="ai-body">Разложила <b>${N}</b> ${plural(N, 'фото', 'фото', 'фото')} по ${cal ? 'месяцам' : P + ' ' + plural(P, 'странице', 'страницам', 'страницам')} в порядке съёмки. ${empty ? `Пустых ${cal ? 'месяцев' : 'страниц'}: <b>${empty}</b>.` : 'Пустых мест нет.'} Касанием можно переставить.</div></div>
        ${!cal && N < P ? `<div class="warnbox"><span>Фото меньше, чем страниц. Можно уменьшить книгу${P > prod.options[0].min ? '' : ' (меньше 20 страниц нельзя)'}.</span>${P > prod.options[0].min ? `<button class="btn btn-sm" id="fit">${Math.max(prod.options[0].min, P - 2)} стр.</button>` : ''}</div>` : ''}
        <div class="pages">${lay.map(page).join('')}</div>
        <section class="card aiedit" aria-label="Правка альбома с помощью ИИ"><div class="ai-head"><span class="ai-ava">${ICON.spark}</span><b>Править с помощью ИИ</b></div>
          <div class="chips-row" role="list">${AI_HINTS.map((t, i) => `<button class="pchip" role="listitem" data-hint="${i}">${esc(t)}</button>`).join('')}</div>
          <div class="field"><label for="aiq">Напишите, что изменить</label><textarea class="textarea" id="aiq" rows="2" maxlength="300" placeholder="Например: убери размытые и поставь страницу 5 в начало"></textarea></div>
          ${S.aiMsg ? `<p class="ai-say" role="status">${esc(S.aiMsg)}</p>` : ''}
          <div class="row2"><button class="btn btn-accent" id="aigo">Применить</button>${d.layoutPrev ? '<button class="btn" id="aiundo">Отменить</button>' : ''}</div></section>
        <button class="btn" id="re">Собрать заново</button>`,
      bar: `<button class="btn btn-primary btn-xl" id="next">Дальше · проверка</button><div class="sub">Макет можно не править: мы уже всё разложили</div>`,
      bind(scr) {
        scr.querySelectorAll('[data-pg]').forEach((b) => { b.onclick = () => { S.pgSheet = +b.dataset.pg; renderPgSheet(); }; });
        scr.querySelectorAll('[data-hint]').forEach((b) => { b.onclick = () => { $('#aiq').value = AI_HINTS[+b.dataset.hint]; $('#aiq').focus(); }; });
        $('#aigo').onclick = aiEdit;
        const ud = $('#aiundo'); if (ud) ud.onclick = () => { d.layout = d.layoutPrev; d.layoutPrev = null; S.aiMsg = 'Вернула прежнюю раскладку'; saveDraft(); rerender(); };
        $('#re').onclick = () => { d.layoutPrev = null; S.aiMsg = ''; ensureLayout(true); toast('Собрала заново'); rerender(); };
        const f = $('#fit'); if (f) f.onclick = () => { d.options.pages = Math.max(prod.options[0].min, P - 2); d.layoutKey = ''; saveDraft(); refreshPrice(); rerender(); };
        $('#next').onclick = async () => { await runCheck(); go('check'); };
      },
    };
  };
  const AI_HINTS = ['По 2 фото на странице', 'Убери размытые', 'Страницы в обратном порядке', 'Сделай обложкой фото 1'];
  async function aiEdit() {
    const d = S.draft, q = $('#aiq').value.trim();
    if (q.length < 3) { S.aiMsg = 'Напишите, что изменить'; return rerender(); }
    const btn = $('#aigo'); btn.disabled = true; btn.textContent = 'Думаю…';
    try {
      const r = await call('POST', '/ai/layout', { instruction: q, layout: d.layout, photos: d.photos.map((p) => ({ id: p.id, name: p.name, w: p.w, h: p.h, blur: !!p.blur, dark: !!p.dark, dup: !!p.dup })) });
      if (r.changed) { d.layoutPrev = d.layout; d.layout = r.layout; saveDraft(); step('layout'); haptic(true); }
      S.aiMsg = r.say;
    } catch (e) { S.aiMsg = e.offline ? 'Нет сети — правка по команде работает только онлайн. Страницы можно править вручную.' : e.message; }
    rerender();
  }
  function renderPgSheet() {
    const old = $('#sheet'); if (old) old.remove();
    const d = S.draft, i = S.pgSheet; if (i == null || !d.layout[i]) return;
    const lay = d.layout, el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet';
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body" role="dialog" aria-label="Страница ${i + 1}">
      <b>${prodOf(d.product).kind === 'calendar' ? (i < 12 ? 'Месяц ' + (i + 1) : 'Обложка') : 'Страница ' + (i + 1)}</b>
      <div class="pgfull">${lay[i].map((id) => `<img src="${S.thumbs[id] || ''}" alt="">`).join('') || '<p class="muted">Здесь пока пусто</p>'}</div>
      <div class="row2"><button class="btn" data-a="up" ${i === 0 ? 'disabled' : ''}>← Раньше</button><button class="btn" data-a="dn" ${i === lay.length - 1 ? 'disabled' : ''}>Позже →</button></div>
      <button class="btn btn-accent btn-lg" data-x>Готово</button></div>`;
    $('.app').appendChild(el);
    const done = () => { S.pgSheet = null; el.remove(); saveDraft(); rerender(); };
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = done; });
    el.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => { const j = b.dataset.a === 'up' ? i - 1 : i + 1;[lay[i], lay[j]] = [lay[j], lay[i]]; S.pgSheet = j; saveDraft(); renderPgSheet(); rerender(); };
    });
  }

  /* ---------- лента «как в Instagram»: фото → «Напечатать» ---------- */
  const FEED_FORMATS = [['print', '10x15', 'Фото 10×15', 'photos'], ['magnet', '10x10', 'Магнит', 'magnet'], ['canvas', '30x40', 'Холст 30×40', 'canvas'], ['book', 'classic', 'Фотокнига', 'book'], ['calendar', 'wall', 'Календарь', 'cal']];
  VIEWS.feed = () => {
    const L = S.pool, picked = L.filter((p) => S.sel[p.id]);
    if (!L.length) return {
      html: `<section class="hello"><h1>Ваши фото</h1><p>Листайте, как в ленте, отмечайте любимые — и нажмите «Напечатать». Фото остаются на телефоне, пока вы не закажете.</p></section>
        ${rejectsHtml()}<div class="pick"><label class="btn btn-primary btn-xl" for="file">${ICON.photos.replace('<svg', '<svg width="22" height="22"')} Добавить из галереи</label><button class="btn btn-lg" id="demo">Тестовая галерея · 20 кадров</button></div>`,
      bind() { $('#demo').onclick = () => addDemo(true); $('#file').accept = 'image/jpeg,image/png'; },
    };
    const cards = L.map((p) => `<article class="fcard ${S.sel[p.id] ? 'sel' : ''}"><img src="${S.thumbs[p.id] || ''}" alt="${esc(p.name)}">
      <div class="fbar"><span>${esc(p.name)}${p.blur ? ' · размыто' : ''}</span><button class="btn btn-sm ${S.sel[p.id] ? 'btn-accent' : ''}" data-s="${p.id}" aria-pressed="${!!S.sel[p.id]}">${S.sel[p.id] ? '✓ Выбрано' : 'Выбрать'}</button></div></article>`).join('');
    return {
      html: `${rejectsHtml()}${cards}<label class="btn" for="file">+ Добавить ещё</label>`,
      bar: `<button class="btn btn-primary btn-xl" id="print" ${picked.length ? '' : 'disabled'}>Напечатать${picked.length ? ' · ' + picked.length : ''}</button><div class="sub">${picked.length ? 'Дальше выберете, что напечатать' : 'Отметьте фото, которые хотите напечатать'}</div>`,
      bind(scr) {
        $('#file').accept = 'image/jpeg,image/png';
        scr.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { S.sel[b.dataset.s] = !S.sel[b.dataset.s]; haptic(); rerender(); }; });
        $('#print').onclick = feedChoose;
      },
    };
  };
  function feedChoose() {
    const n = S.pool.filter((p) => S.sel[p.id]).length;
    const old = $('#sheet'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet';
    const opts = FEED_FORMATS.filter(([pid]) => { const pr = prodOf(pid); return pr && n >= pr.photos.min && n <= pr.photos.max; })
      .map(([pid, vid, name, ic]) => { const pr = prodOf(pid); return `<button class="opt fopt" data-f="${pid}:${vid}"><span class="pic">${ICON[ic]}</span><span><b>${esc(name)}</b><small>${esc(pr.short)}</small></span><span class="p">от ${money(fromPrice(pr))}</span></button>`; }).join('');
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body" role="dialog" aria-label="Что напечатать"><b style="font-size:18px">Что напечатать из ${n} ${plural(n, 'фото', 'фото', 'фото')}?</b>
      <div class="opts">${opts || '<p class="muted">Для такого числа фото нет подходящего продукта. Выберите меньше или больше.</p>'}</div><button class="btn" data-x>Отмена</button></div>`;
    $('.app').appendChild(el);
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => el.remove(); });
    el.querySelectorAll('[data-f]').forEach((b) => {
      b.onclick = () => { const [pid, vid] = b.dataset.f.split(':'); el.remove(); printFromPool(pid, vid); };
    });
  }

  /* из «Моих фото» — сразу в продукт: отмеченные кадры (или все) становятся черновиком */
  async function printFromPool(pid, vid, all) {
    const prod = prodOf(pid); if (!prod) return toast('Этот продукт сейчас недоступен');
    if (all) S.pool.forEach((p) => { S.sel[p.id] = true; });
    const chosen = S.pool.filter((p) => S.sel[p.id]).slice(0, prod.photos.max), ids = new Set(chosen.map((p) => p.id));
    if (!chosen.length) return toast('Сначала добавьте фото');
    if (S.draft && S.draft.photos.length) S.pool = S.pool.concat(S.draft.photos);   // прежний черновик не теряем: его фото вернутся в ленту
    S.pool = S.pool.filter((p) => !ids.has(p.id)); S.sel = {};
    S.draft = newDraft(prod); if (vid && prod.variants.some((v) => v.id === vid)) S.draft.variant = vid; S.draft.t0 = Date.now();
    S.draft.photos = chosen.map((p) => Object.assign({}, p, { up: false, qty: 1 }));
    classify(); recrop(); LS.set('pp_pool', S.pool); saveDraft(); step('catalog'); step('photos'); refreshPrice();
    if (hasLayout(S.draft)) { ensureLayout(true); step('layout'); S.stack.push('feed'); go('layout', true); }
    else { await runCheck(); S.stack.push('feed'); go('check', true); }
  }

  function renderSheet() {
    const old = $('#sheet'); if (old) old.remove();
    if (S.sheet == null) return;
    const d = S.draft, p = d.photos[S.sheet]; if (!p) { S.sheet = null; return; }
    const prod = prodOf(d.product), v = varOf(prod, d.variant), c = cropFor(p, v.ratio, d.fit), q = qualityOf(p);
    const each = prod.kind === 'print' || prod.kind === 'magnet', canDrag = c.cut > 0.02 && !d.fit;
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet';
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body" role="dialog" aria-label="Фото ${S.sheet + 1}">
      <div class="slot big"><div class="frame ${d.fit ? 'fit' : ''} ${canDrag ? 'drag' : ''}" style="aspect-ratio:${c.aspect};${c.aspect < 1 ? 'height:240px;width:auto;' : c.aspect === 1 ? 'height:220px;width:220px;' : 'width:100%;height:auto;'}${bgStyle(p, c)}"></div><span class="q ${q.lvl}"><span class="dot"></span>${q.label}</span>${canDrag ? '<span class="cropnote">Потяните кадр, чтобы сдвинуть</span>' : ''}</div>
      <p class="muted" style="text-align:center;font-size:13px">${esc(p.name)} · <span class="num">${p.w}×${p.h}</span>${c.cut > 0.02 && !d.fit ? ' · обрезка ' + Math.round(c.cut * 100) + ' %' : ''}</p>
      ${p.rejected ? `<p class="err">${esc(p.rejected)}</p>` : ''}
      <div class="row2"><button class="btn" data-a="left" ${S.sheet === 0 ? 'disabled' : ''}>← Раньше</button><button class="btn" data-a="right" ${S.sheet === d.photos.length - 1 ? 'disabled' : ''}>Позже →</button></div>
      ${each ? `<div class="allqty"><span>Копий этого фото</span><span class="stepper"><button data-a="m" aria-label="Меньше">−</button><output>${p.qty}</output><button data-a="p" aria-label="Больше">+</button></span></div>` : ''}
      ${p.man && canDrag ? '<button class="btn btn-sm btn-ghost" data-a="auto">Вернуть кадр, который подобрало приложение</button>' : ''}
      <div class="row2"><button class="btn" data-a="replace">Заменить</button><button class="btn btn-danger" data-a="del">Убрать</button></div>
      <button class="btn btn-accent btn-lg" data-x>Готово</button></div>`;
    $('.app').appendChild(el);
    const done = () => { S.sheet = null; el.remove(); saveDraft(); rerender(); };
    const fr = el.querySelector('.frame');
    if (fr && canDrag) {                       // кадрирование: фон больше рамки в 1/c.w раз, поэтому сдвиг пальца делим на размер всего фото
      let st = null;
      fr.onpointerdown = (e) => { st = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y }; try { fr.setPointerCapture(e.pointerId); } catch (er) { /* старый браузер */ } };
      fr.onpointermove = (e) => {
        if (!st) return; const r = fr.getBoundingClientRect();
        p.man = { x: st.cx - (e.clientX - st.x) / (r.width / c.w), y: st.cy - (e.clientY - st.y) / (r.height / c.h) };
        const k = cropFor(p, v.ratio, d.fit); p.man = { x: k.x, y: k.y };
        fr.style.backgroundPosition = (k.w < 1 ? k.x / (1 - k.w) * 100 : 0) + '% ' + (k.h < 1 ? k.y / (1 - k.h) * 100 : 0) + '%';
      };
      fr.onpointerup = fr.onpointercancel = () => { if (!st) return; st = null; const k = cropFor(p, v.ratio, d.fit); p.crop = { x: k.x, y: k.y, w: k.w, h: k.h }; c.x = k.x; c.y = k.y; saveDraft(); };
    }
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = done; });
    el.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a, L = d.photos, i = S.sheet;
        if (a === 'left' || a === 'right') { const j = a === 'left' ? i - 1 : i + 1;[L[i], L[j]] = [L[j], L[i]]; S.sheet = j; saveDraft(); renderSheet(); rerender(); }
        else if (a === 'm' || a === 'p') { p.qty = Math.max(1, Math.min(99, p.qty + (a === 'p' ? 1 : -1))); saveDraft(); renderSheet(); refreshPrice(); }
        else if (a === 'del') { dropPhotoData(p.id); L.splice(i, 1); classify(); done(); }
        else if (a === 'auto') { delete p.man; recrop(); saveDraft(); renderSheet(); }
        else if (a === 'replace') { S.replace = p.id; S.sheet = null; el.remove(); $('#file').click(); }
      };
    });
  }

  async function runCheck() {
    S.issues = null;
    try {
      if (!S.online) throw { offline: true };
      await syncDraft(); const r = await call('GET', '/projects/' + S.draft.id + '/check');
      S.issues = r.issues;
    } catch (e) { S.issues = e.offline ? 'offline' : [{ code: 'err', level: 'warn', text: 'Проверку на сервере сделать не удалось: ' + (e.message || '') }]; }
    step('check');
  }
  VIEWS.check = () => {
    const d = S.draft, I = S.issues;
    let body;
    if (I === 'offline') body = `<div class="warnbox">${ICON.info.replace('<svg', '<svg width="20" height="20"')}<span>Нет сети. Подробную проверку сделаем на сервере, когда она появится. Можно продолжить: черновик сохранён.</span></div>`;
    else if (!I || !I.length) body = `<div class="done-hero" style="padding-top:6px"><div class="ok-ico">${ICON.ok}</div><h1 style="font-size:20px">Всё в порядке</h1><p class="muted">${d.photos.length} ${plural(d.photos.length, 'фото', 'фото', 'фото')}: пустых мест нет, пикселей хватает</p></div>`;
    else body = '<div class="issues">' + I.slice().sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level])).map((x, k) => {
      const ph = x.photo && d.photos.find((p) => p.id === x.photo), lv = x.level === 'error' ? 'bad' : x.level === 'warn' ? 'warn' : 'info';
      return `<div class="issue ${lv}"><div class="ic">${lv === 'info' ? ICON.info : ICON.warn}</div><div><p>${esc(x.text)}</p>${ph ? `<div class="ia"><img src="${S.thumbs[ph.id] || ''}" alt=""><button class="btn btn-sm" data-rep="${ph.id}">Заменить</button><button class="btn btn-sm" data-del="${ph.id}">Убрать</button></div>` : ''}</div></div>`;
    }).join('') + '</div>';
    const errs = Array.isArray(I) && I.some((x) => x.level === 'error'), warns = Array.isArray(I) && I.some((x) => x.level === 'warn');
    const nbad = d.photos.filter((p) => p.blur || p.dark || p.dup).length, hasCrop = Array.isArray(I) && I.some((x) => x.code === 'crop') && ['print', 'magnet'].includes(d.product);
    const fixable = Array.isArray(I) && I.length && (nbad || hasCrop);
    const summary = Array.isArray(I) && I.length ? `<p class="muted" style="font-size:15px">Нашли ${I.length} ${plural(I.length, 'замечание', 'замечания', 'замечаний')}. Печать возможна, но лучше посмотреть.</p>` : '';
    return {
      html: `<p class="sec-t">Перед заказом</p>${summary}${fixable ? `<button class="btn btn-accent btn-lg" id="fixall">${ICON.spark} Исправить автоматически${nbad ? ' · убрать ' + nbad + ' слабых' : ''}${hasCrop ? ' · белые поля' : ''}</button>` : ''}${body}`,
      bar: `<button class="btn btn-primary btn-xl" id="next" ${errs ? 'disabled' : ''}>${warns || I === 'offline' ? 'Всё равно продолжить' : 'Дальше · корзина'}</button>${errs ? '<div class="sub">Исправьте ошибки, чтобы продолжить</div>' : warns ? '<div class="sub">Или вернитесь и замените фото</div>' : ''}`,
      bind(scr) {
        scr.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = () => { S.replace = b.dataset.rep; $('#file').click(); }; });
        scr.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { const i = d.photos.findIndex((p) => p.id === b.dataset.del); dropPhotoData(d.photos[i].id); d.photos.splice(i, 1); classify(); saveDraft(); await runCheck(); rerender(); }; });
        const fx = $('#fixall');
        if (fx) fx.onclick = async () => {
          d.photos.filter((p) => p.blur || p.dark || p.dup).forEach((p) => dropPhotoData(p.id));
          d.photos = d.photos.filter((p) => !(p.blur || p.dark || p.dup));
          if (hasCrop) d.fit = true;
          classify(); recrop(); if (hasLayout(d)) d.layoutKey = ''; saveDraft(); await runCheck(); toast('Готово: исправила что смогла'); rerender();
        };
        $('#next').onclick = () => { S.accept = warns || I === 'offline'; refreshPrice(); step('cart'); go('cart'); };
      },
    };
  };

  VIEWS.cart = () => {
    const d = S.draft, prod = prodOf(d.product), v = varOf(prod, d.variant), P = S.price || localPrice(d), cat = S.catalog, F = S.form, FE = S.fe || (S.fe = {});
    if (!F.name && S.session && !/^g-/.test(S.session.user.id)) { F.name = S.session.user.name.split(' ')[0]; }
    const dl = cat.delivery.find((x) => x.id === d.delivery);
    const opts = cat.delivery.map((o) => `<label class="opt"><input type="radio" name="dl" value="${o.id}" ${o.id === d.delivery ? 'checked' : ''}><span><b>${esc(o.name)}</b><small>${esc(o.note)}</small></span><span class="p">${Number(o.price) ? money(o.price) : 'бесплатно'}</span></label>`).join('');
    const where = d.delivery === 'pickup'
      ? `<div class="field"><label for="pt">Пункт выдачи</label><select class="select" id="pt">${cat.points.map((s) => `<option value="${s.id}" ${s.id === F.point ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`
      : `<div class="field"><label for="ad">Адрес</label><input class="input ${FE.address ? 'bad' : ''}" id="ad" autocomplete="street-address" value="${esc(F.address)}" placeholder="220000, Минск, ул. …" ${FE.address ? 'aria-invalid="true" aria-describedby="e-ad"' : ''}>${FE.address ? `<p class="ferr" id="e-ad" role="alert">${esc(FE.address)}</p>` : ''}</div>`;
    const lines = P.lines.map((l) => `<div class="item" style="grid-template-columns:1fr auto"><div><b>${esc(l.name)}</b><span>${esc(dec(l.note || ''))}</span></div><div class="sum">${money(l.sum)}</div></div>`).join('');
    return {
      html: `<div class="card-flat"><div class="items">${lines}</div><div class="minithumbs">${d.photos.slice(0, 5).map((p) => `<i style="background-image:url(${S.thumbs[p.id] || ''})"></i>`).join('')}${d.photos.length > 5 ? `<span class="muted" style="align-self:center">+${d.photos.length - 5}</span>` : ''}</div></div>
        <p class="sec-t">Получение</p><div class="opts">${opts}</div>${where}
        <p class="sec-t">Контакты</p>
        <div class="field"><label for="nm">Имя</label><input class="input ${FE.name ? 'bad' : ''}" id="nm" autocomplete="given-name" value="${esc(F.name)}" placeholder="Как к вам обращаться" ${FE.name ? 'aria-invalid="true" aria-describedby="e-nm"' : ''}>${FE.name ? `<p class="ferr" id="e-nm" role="alert">${esc(FE.name)}</p>` : ''}</div>
        <div class="field"><label for="tel">Телефон</label><input class="input ${FE.phone ? 'bad' : ''}" id="tel" type="tel" inputmode="tel" autocomplete="tel" value="${esc(F.phone)}" placeholder="+375 29 000-00-00" ${FE.phone ? 'aria-invalid="true" aria-describedby="e-tel"' : ''}>${FE.phone ? `<p class="ferr" id="e-tel" role="alert">${esc(FE.phone)}</p>` : '<small class="hint">Напишем, когда заказ будет готов</small>'}</div>
        ${d.promo || S.promoOpen ? `<p class="sec-t">Промокод</p><div class="promo"><input class="input" id="pc" value="${esc(d.promo)}" placeholder="PICPAC10" autocapitalize="characters" aria-label="Промокод"><button class="btn" id="pa">Применить</button></div>
        ${P.promo ? `<p class="ok-t">✓ Промокод ${esc(P.promo.code)}: −${money(P.promo.discount)}</p>` : ''}` : '<button class="btn btn-ghost" id="po" style="justify-content:flex-start">У меня есть промокод</button>'}
        <p class="sec-t">Оплата</p><div class="opts"><label class="opt"><input type="radio" checked><span><b>При получении</b><small>Тестовый заказ: деньги не списываются</small></span><span></span></label></div>
        <div class="totals"><div><span>Товары</span><span class="num">${money(P.goods)}</span></div>${Number(P.discount) ? `<div><span>Скидка</span><span class="num">−${money(P.discount)}</span></div>` : ''}<div><span>${esc(P.delivery.name)}</span><span class="num">${Number(P.delivery.price) ? money(P.delivery.price) : '0,00 BYN'}</span></div>
          <div class="grand"><span>Итого</span><span class="num">${money(P.total)}</span></div></div>
        <p class="muted" style="font-size:13px">${esc(S.priceNote || (P.local ? 'Цена ориентировочная, точную посчитает сервер' : 'Срок: ' + P.eta_text))}</p>
        ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}`,
      bar: `<button class="btn btn-primary btn-xl" id="order">Оформить заказ · ${money(P.total)}</button><div class="sub">Оплата при получении · ${S.online ? 'без регистрации' : 'нет сети: заказ отправим позже'}</div>`,
      bind(scr) {
        scr.querySelectorAll('input[name=dl]').forEach((r) => { r.onchange = () => { d.delivery = r.value; saveDraft(); refreshPrice(); rerender(); }; });
        const pt = $('#pt'); if (pt) pt.onchange = () => { F.point = pt.value; saveForm(); };
        const ad = $('#ad'); if (ad) ad.oninput = () => { F.address = ad.value; saveForm(); };
        $('#nm').oninput = (e) => { F.name = e.target.value; saveForm(); if (FE.name && F.name.trim()) { FE.name = ''; rerenderKeep('nm'); } };
        $('#tel').oninput = (e) => { F.phone = e.target.value; saveForm(); if (FE.phone && F.phone.replace(/\D/g, '').length >= 9) { FE.phone = ''; rerenderKeep('tel'); } };
        const po = $('#po'); if (po) po.onclick = () => { S.promoOpen = true; rerender(); const pc = $('#pc'); if (pc) pc.focus(); };
        const pa = $('#pa'); if (pa) pa.onclick = () => { d.promo = $('#pc').value.trim().toUpperCase(); saveDraft(); refreshPrice(); toast(d.promo ? 'Считаю…' : 'Промокод убран'); };
        $('#order').onclick = placeOrder;
      },
    };
  };

  /* ---------- оформление, очередь без сети, безопасный повтор ---------- */
  async function placeOrder() {
    const d = S.draft, F = S.form; S.err = '';
    const digits = F.phone.replace(/\D/g, ''), FE = S.fe = {};
    if (!F.name.trim()) FE.name = 'Как к вам обращаться? Напишите имя';
    if (digits.length < 9) FE.phone = 'Проверьте номер: нужно не меньше 9 цифр';
    if (d.delivery !== 'pickup' && F.address.trim().length < 5) FE.address = 'Укажите адрес: улицу и дом';
    const first = FE.name ? 'nm' : FE.phone ? 'tel' : FE.address ? 'ad' : null;
    if (first) { rerender(); const el = $('#' + first); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } return; }
    S.order = null;
    if (!S.outbox) {          // ключ создаём один раз: повторное нажатие или повтор после обрыва вернёт тот же заказ
      S.outbox = { key: 'ord-' + d.id + '-' + rid(), project: d.id, accept: !!S.accept, promo: d.promo, delivery: { id: d.delivery, point: F.point, address: F.address.trim() },
        contact: { name: F.name.trim(), phone: F.phone.trim() }, time_sec: d.t0 ? Math.max(1, Math.round((Date.now() - d.t0) / 1000)) : null };
      LS.set('pp_outbox', S.outbox);
    }
    await flushOutbox(true);
  }
  let flushing = false;
  async function flushOutbox(fromUser) {
    const ob = S.outbox; if (!ob || flushing || !S.session) return;
    flushing = true; renderNet();
    try {
      const d = S.draft;
      if (d && d.id === ob.project) { d.photos.forEach((p) => { if (p.rejected) { delete p.rejected; p.up = false; } }); await syncDraftNow(); }
      const o = await call('POST', '/orders', { project_id: ob.project, accept_warnings: ob.accept, promo: ob.promo, delivery: ob.delivery, contact: ob.contact, time_sec: ob.time_sec, session: S.sess },
        { headers: { 'Idempotency-Key': ob.key } });
      finishOrder(o);
    } catch (e) {
      if (e.offline) { if (fromUser === true) { toast('Нет сети — заказ сохранён на телефоне и уйдёт сам'); go('done', true); } }
      else if (e.status === 409 && e.data && e.data.needs_accept) { ob.accept = true; LS.set('pp_outbox', ob); flushing = false; return flushOutbox(fromUser); }
      else { S.outbox = null; LS.del('pp_outbox'); S.err = e.message; if (e.data && e.data.issues) S.err += ': ' + e.data.issues.map((i) => i.text).join(' '); if (S.view !== 'cart') go('cart', true); else rerender(); }
    }
    flushing = false; renderNet();
  }
  async function syncDraftNow() {
    while (syncing) await sleep(100);
    syncing = true;
    try { const d = S.draft; const r = await call('POST', '/projects/' + d.id, Object.assign({}, d, { base_version: d.version, force: true })); d.version = r.version; await uploadPending(); }
    finally { syncing = false; }
    LS.set('pp_draft', S.draft);
    if (S.draft.photos.some((p) => !p.up && !p.rejected)) throw { offline: true };
  }
  function finishOrder(o) {
    S.outbox = null; LS.del('pp_outbox');
    if (S.draft) { S.draft.photos.forEach((p) => { delete S.thumbs[p.id]; delete S.energy[p.id]; IDB.del('blobs', p.id); IDB.del('thumbs', p.id); }); }
    S.draft = null; LS.del('pp_draft'); S.accept = false;
    S.order = o; S.events = []; S.orders = [o].concat(S.orders.filter((x) => x.id !== o.id)); LS.set('pp_orders', S.orders);
    wire('Заказ ' + o.number + ' · ' + money(o.total));
    S.stack = []; haptic(true); go('done', true);
  }
  window.addEventListener('online', () => { setOnline(true); });
  window.addEventListener('offline', () => setOnline(false));
  setInterval(() => { if (S.outbox && S.session) flushOutbox(); else if (S.draft && S.session && S.online && S.draft.photos.some((p) => !p.up && !p.rejected)) syncSoon(); }, 6000);

  /* ---------- статус заказа ---------- */
  const RIB = [['accepted', 'Принят', 'Заказ принят'], ['moderation', 'Модерация', 'Модерация макета'], ['production', 'Печать', 'Производство'], ['shipped', 'Готов', 'Передан в доставку'], ['done', 'Завершён', 'Завершён']];
  const ribIndex = (o) => { const s = o.stage; return { accepted: 0, moderation: 1, production: 2, quality: 2, shipped: 3, done: o.stage_status === 'passed' ? 5 : 4 }[s] ?? 0; };
  const isPickup = (o) => !!o.pickup_point || !!(o.delivery && o.delivery.id === 'pickup');
  const stageChip = (o) => o.stage_status === 'defect' ? '<span class="chip chip-bad"><i></i>Переделываем</span>'
    : `<span class="chip ${ribIndex(o) >= 5 ? 'chip-ok' : 'chip-accent'}"><i></i>${esc(RIB[Math.min(ribIndex(o), 4)][1])}</span>`;
  /* статусная лента из общих событий: принят → модерация → производство → готов / передан в доставку → завершён */
  function ribbon(o) {
    const idx = ribIndex(o), when = {}, defect = o.stage_status === 'defect';
    S.events.forEach((e) => { if (e.status === 'passed') when[e.stage === 'quality' ? 'production' : e.stage] = e.ts; });
    return `<ol class="tl" aria-label="Статус заказа">${RIB.map(([id, , name], i) => {
      const on = i < idx, cur = i === idx, nm = id === 'shipped' && isPickup(o) ? 'Готов к выдаче' : name;
      return `<li class="${on ? 'on' : ''} ${cur ? (defect ? 'cur bad' : 'cur') : ''}"><i>${on ? ICON.check : i + 1}</i><div><b>${nm}</b>${cur ? `<p aria-live="polite">${esc(defect ? 'На этапе нашли брак — переделываем бесплатно, срок может сдвинуться.' : NOW[o.stage] || '')}</p>` : ''}</div><time>${when[id] ? fdate(when[id]) : ''}</time></li>`;
    }).join('')}</ol>`;
  }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }
  function startPoll() {
    stopPoll(); if (!S.order || !S.session) return;
    const tick = async () => {
      if (!S.order || (S.view !== 'order' && S.view !== 'done')) return;
      try {
        const [o, ev] = await Promise.all([call('GET', '/orders/' + S.order.id), call('GET', '/orders/' + S.order.id + '/events')]);
        const changed = o.stage !== S.order.stage || o.stage_status !== S.order.stage_status;
        S.order = o; S.events = ev; S.orders = S.orders.map((x) => x.id === o.id ? o : x); LS.set('pp_orders', S.orders);
        if (changed) { notify('Заказ ' + o.number, stageNews(o), o.id, true); wire('Статус из производства: ' + RIB[Math.min(ribIndex(o), 4)][1].toLowerCase()); }
        if (changed || !S.evShown) { S.evShown = true; rerender(); }
      } catch (e) { /* нет сети — покажем последнее известное */ }
    };
    tick(); S.poll = setInterval(tick, 4000);
  }
  const NOW = { accepted: 'Заказ принят. Сейчас проверим макет.', moderation: 'Проверяем макет и фото. Обычно это занимает около часа.', production: 'Печатаем ваш заказ.', quality: 'Печать готова, проверяем качество.', shipped: 'Заказ готов — можно забирать или ждать доставку.', done: 'Заказ завершён. Спасибо, что выбрали picPac!' };
  function orderBody(o, compact) {
    const items = (o.items || []).map((it) => `<div class="item" style="grid-template-columns:1fr auto"><div><b>${esc(it.name)}</b><span>${esc(dec(it.note || it.qty + ' шт'))}</span></div><div class="sum">${money(it.sum)}</div></div>`).join('');
    const where = o.pickup_point ? o.pickup_point.name : (o.delivery ? o.delivery.name + (o.address ? ', ' + o.address : '') : '');
    const dl = o.delivery || {};
    return `<div class="card"><div class="ohead">${compact ? '<span class="eyebrow">Статус заказа</span>' : `<div><span class="eyebrow">Заказ</span><div class="big">${esc(o.number || '')}</div><small>${fdate(o.ts)}</small></div>`}${stageChip(o)}</div>
        ${ribbon(o)}
        <div class="ofacts"><div><small>Готовность</small><b>${esc(o.ready || '—')}</b></div><div><small>${isPickup(o) ? 'Самовывоз' : 'Доставка'}</small><b>${esc(where || '—')}</b></div></div></div>
      <div class="card-flat"><p class="sec-t" style="margin:0 0 12px">Состав заказа</p><div class="items">${items}</div></div>
      <div class="totals"><div><span>Товары</span><span class="num">${money(o.goods || o.total)}</span></div>${Number(o.discount) ? `<div><span>Скидка${o.promo && o.promo.code ? ' · ' + esc(o.promo.code) : ''}</span><span class="num">−${money(o.discount)}</span></div>` : ''}
        ${dl.name ? `<div><span>${esc(dl.name)}</span><span class="num">${Number(dl.price) ? money(dl.price) : '0,00 BYN'}</span></div>` : ''}
        <div class="grand"><span>Итого, при получении</span><span class="num">${money(o.total)}</span></div></div>`;
  }
  VIEWS.done = () => {
    if (S.outbox && !S.order) return {
      html: `<div class="done-hero"><div class="ok-ico" style="background:var(--warn-soft);color:var(--warn)">${ICON.warn}</div><h1>Нет сети</h1><p class="muted" style="margin-top:8px">Заказ и все фото сохранены на телефоне. Как только сеть появится, мы отправим его сами. Второй заказ не создастся.</p></div>`,
      bar: `<button class="btn btn-primary btn-xl" id="retry">Попробовать сейчас</button><button class="btn" id="home" style="margin-top:8px">На главную</button>`,
      bind() { $('#retry').onclick = () => flushOutbox(true); $('#home').onclick = () => { S.stack = []; go('home', true); }; },
    };
    const o = S.order || {};
    return {
      html: `<div class="done-hero"><div class="ok-ico">${ICON.ok}</div><h1>Заказ <span class="num-o">${esc(o.number || '')}</span> принят</h1>
        ${o.time_sec ? `<div class="timer-pill">Оформлен за <b>${mmss(o.time_sec)}</b> — от выбора фото</div>` : ''}</div>${orderBody(o, true)}
        <div class="card-flat next"><b>Что дальше</b><ol><li>Проверим макет — это быстро.</li><li>Напечатаем и упакуем.</li><li>Напишем вам, когда заказ можно забирать${o.delivery && o.delivery.id !== 'pickup' ? ' или когда он поедет к вам' : ''}.</li></ol><small>Ничего делать не нужно: статус обновляется сам.</small></div>`,
      bar: `<button class="btn btn-primary btn-xl" id="hist">Мои заказы</button>`,
      bind() { $('#hist').onclick = () => { S.stack = []; go('orders', true); }; },
    };
  };
  async function loadOrders() {
    if (!S.session) return;
    try { const list = await call('GET', '/orders'), changed = JSON.stringify(list) !== JSON.stringify(S.orders), was = Object.fromEntries(S.orders.map((o) => [o.id, o]));
      list.forEach((o) => { const p = was[o.id]; if (p && (p.stage !== o.stage || p.stage_status !== o.stage_status)) { notify('Заказ ' + o.number, stageNews(o), o.id); wire('Статус из производства: ' + RIB[Math.min(ribIndex(o), 4)][1].toLowerCase()); } });
      S.orders = list; LS.set('pp_orders', S.orders); if (changed && S.view === 'orders') rerender2(); } catch (e) { /* показываем сохранённые */ }
  }
  let r2; function rerender2() { clearTimeout(r2); r2 = setTimeout(() => { if (S.view === 'orders') rerender(); }, 0); }
  let ordersLoaded = false;
  VIEWS.orders = () => {
    const L = S.orders;
    const html = L.length ? L.map((o) => { const idx = ribIndex(o); return `<button class="card ocard" data-o="${o.id}"><span class="oart">${artOf(((prodOf((o.items || [])[0] && o.items[0].product) || {}).kind) || 'print')}</span>
        <div><b>${esc(o.number)}</b><span>${fdate(o.ts)} · ${(o.items || []).map((i) => esc(i.name)).join(', ')}</span></div><div class="r"><span class="num">${money(o.total)}</span>${stageChip(o)}</div>
        <span class="mini" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < idx ? 'on' : i === idx ? 'cur' : ''}"></i>`).join('')}</span></button>`; }).join('')
      : '<div class="empty"><div class="eart">' + artOf('book') + '</div><h3>Заказов пока нет</h3><p>Выберите фото — первый заказ займёт пару минут.</p><button class="btn btn-primary btn-lg" data-tab="home">Выбрать фото</button></div>';
    return { html, bind(scr) { scr.querySelectorAll('[data-o]').forEach((b) => { b.onclick = () => openOrder(b.dataset.o); }); } };
  };
  async function openOrder(id) {
    let o = S.orders.find((x) => x.id === id || x.number === id);
    if (!o) { await loadOrders(); o = S.orders.find((x) => x.id === id || x.number === id); }
    if (!o) return toast('Такого заказа в вашей истории нет');
    S.order = o; S.events = []; S.evShown = false; S.supportKey = rid();
    S.notes.forEach((n) => { if (n.order === o.id) n.read = true; }); LS.set('pp_notes', S.notes);
    await loadSupport(); go('order');
  }
  async function loadSupport() { try { S.support = await call('GET', '/support'); } catch (e) { /* без сети */ } }
  VIEWS.order = () => {
    const o = S.order, mine = S.support.filter((x) => x.order_id === o.id);
    const threads = mine.map((t) => `<div class="thread"><b>${esc(t.topic)}</b><p>${esc(t.text)}</p><small>${fdate(t.ts)} · ${t.status === 'open' ? 'ответим в течение 4 часов' : 'закрыто'}</small>${(t.messages || []).slice(1).map((m) => `<p class="rep ${m.from}"><small>${m.from === 'bot' ? 'Помощник picPac' : m.from === 'client' ? 'Вы' : 'Сотрудник'}</small>${esc(m.text)}</p>`).join('')}${t.bot && !t.bot.human && t.status === 'open' ? `<button class="btn btn-sm" data-human="${t.id}">Позвать сотрудника</button>` : ''}${t.bot && t.bot.human ? '<small>Сотрудник подключён — ответит в течение 4 часов</small>' : ''}</div>`).join('');
    return {
      html: orderBody(o) + `<p class="sec-t">Вопрос по заказу</p>${threads}
        <div class="field"><label for="sp">Опишите вопрос</label><textarea class="textarea" id="sp" rows="3" placeholder="Например: можно ли заменить фото?"></textarea></div>
        ${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}<button class="btn btn-lg" id="ssend">Отправить в поддержку</button>`,
      bind() {
        document.querySelectorAll('[data-human]').forEach((b) => { b.onclick = async () => { try { await call('POST', '/support/' + b.dataset.human + '/human', {}); toast('Позвали сотрудника'); await loadSupport(); rerender(); } catch (e) { toast(e.offline ? 'Нет сети — повторите позже' : e.message); } }; });
        $('#ssend').onclick = async () => {
          const text = $('#sp').value.trim(); if (text.length < 3) { S.err = 'Опишите вопрос хотя бы парой слов'; return rerender(); }
          const sb = $('#ssend'); sb.disabled = true; sb.textContent = 'Помощник отвечает…'; try { await call('POST', '/support', { order_id: o.id, text, topic: 'Вопрос по заказу ' + o.number }, { headers: { 'Idempotency-Key': S.supportKey } }); S.supportKey = rid(); S.err = ''; wire('Обращение по заказу ' + o.number); toast('Помощник ответил — если мало, позовите сотрудника'); await loadSupport(); rerender(); }
          catch (e) { S.err = e.offline ? 'Нет сети — повторите, когда она появится' : e.message; rerender(); }
        };
      },
    };
  };

  /* ---------- сообщество: шаблоны от компании и отзывы покупателей ---------- */
  S.soc = { data: LS.get('pp_social', null), tab: 'tpl', occ: 'Все', compose: null, rate: 0, err: '', loading: false, openReply: null };
  async function loadSocial() {
    if (S.soc.loading) return;
    S.soc.loading = true;
    try { S.soc.data = await call('GET', '/social/feed'); LS.set('pp_social', S.soc.data); S.soc.off = false; }
    catch (e) { S.soc.off = true; }
    S.soc.loading = false;
    if (S.view === 'social' && !S.soc.compose) rerender();
  }
  const stars = (n, big) => `<span class="stars${big ? ' big' : ''}" role="img" aria-label="${n} из 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= Math.round(n) ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`;
  const heart = (liked) => liked ? ICON.heart.replace('fill="none"', 'fill="currentColor"') : ICON.heart;
  function tplCard(t, pub) {
    const prod = prodOf(t.product) || {}, v = (prod.variants || []).find((x) => x.id === t.variant);
    const meta = [prod.name, v && v.name, t.options && t.options.pages ? t.options.pages + ' стр.' : '', t.per_page > 1 ? 'до ' + t.per_page + ' фото на странице' : ''].filter(Boolean).join(' · ');
    return `<article class="card tcard"><div class="tcover tone${(t.tone || 0) % 6}">${artOf(prod.kind || 'print')}<span class="chip">${esc(t.occasion)}</span></div>
      <div class="tbody"><h3>${esc(t.title)}</h3><p>${esc(t.desc || '')}</p><small>${esc(meta)}</small>
      <div class="trow"><span class="by">от picPac${t.seed ? '' : ' · новое'}</span><button class="like${t.liked ? ' on' : ''}" data-tl="${t.id}" aria-pressed="${!!t.liked}" aria-label="Нравится">${heart(t.liked)}<span class="num">${t.likes}</span></button></div>
      <div class="trow"><button class="btn btn-accent" data-tu="${t.id}">Использовать шаблон</button>${pub && !t.seed ? `<button class="btn btn-sm btn-ghost" data-td="${t.id}">Убрать</button>` : ''}</div>
      ${t.uses ? `<small class="uses">Использовали ${t.uses} ${plural(t.uses, 'раз', 'раза', 'раз')}</small>` : ''}</div></article>`;
  }
  function revCard(r, pub) {
    const reply = r.reply ? `<div class="rreply"><b>${esc(r.reply.by)}</b><p>${esc(r.reply.text)}</p></div>` : '';
    const replyForm = S.soc.openReply === r.id ? `<div class="field"><label for="rp">Ответ покупателю</label><textarea class="textarea" id="rp" rows="2" maxlength="400"></textarea><div class="row2"><button class="btn btn-sm btn-accent" data-rs="${r.id}">Отправить</button><button class="btn btn-sm" data-rc="1">Отмена</button></div></div>` : '';
    const acts = [];
    if (pub && !r.demo) acts.push(`<button class="btn btn-sm btn-ghost" data-ro="${r.id}">${r.reply ? 'Изменить ответ' : 'Ответить'}</button>`, `<button class="btn btn-sm btn-ghost" data-rh="${r.id}">${r.hidden ? 'Показать' : 'Скрыть'}</button>`);
    if (r.mine) acts.push(`<button class="btn btn-sm btn-ghost" data-rd="${r.id}">Удалить</button>`);
    return `<article class="card rcard${r.hidden ? ' hid' : ''}"><div class="rtop"><span class="avatar sm" aria-hidden="true">${esc((r.name || '?')[0])}</span><div><b>${esc(r.name)}</b><small>${esc(r.product || '')} · ${fdate(r.ts)}</small></div>${r.demo ? '<span class="chip">пример</span>' : r.hidden ? '<span class="chip chip-warn">скрыт</span>' : ''}</div>
      ${stars(r.rating)}<p class="rtext">${esc(r.text)}</p>${reply}${replyForm}
      <div class="trow"><button class="like${r.liked ? ' on' : ''}" data-rl="${r.id}" aria-pressed="${!!r.liked}" aria-label="Полезный отзыв">${heart(r.liked)}<span class="num">${r.likes}</span></button><span class="racts">${acts.join('')}</span></div></article>`;
  }
  function composeReview(D) {
    const orders = (D.my_orders || []);
    if (!S.session) return '<div class="card-flat"><p>Чтобы оставить отзыв, нужен заказ.</p></div>';
    if (!orders.length) return '<div class="card-flat"><b>Отзыв можно оставить после заказа</b><p class="muted">Сделайте первый заказ — и расскажите, как всё прошло.</p></div>';
    return `<div class="card compose"><h3>Ваш отзыв</h3>
      <div class="field"><label for="ro">Заказ</label><select class="select" id="ro">${orders.map((o) => `<option value="${o.id}">${esc(o.number)} · ${esc(o.product || 'заказ')}${o.reviewed ? ' (изменить отзыв)' : ''}</option>`).join('')}</select></div>
      <div class="field"><label id="rl">Оценка</label><div class="rate" role="radiogroup" aria-labelledby="rl">${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" class="${i <= S.soc.rate ? 'on' : ''}" data-st="${i}" aria-checked="${i === S.soc.rate}" aria-label="${i} из 5">${ICON.star}</button>`).join('')}</div></div>
      <div class="field"><label for="rt">Что понравилось и что можно улучшить</label><textarea class="textarea" id="rt" rows="4" maxlength="600" placeholder="Например: быстро собрала книгу, но хотелось больше шаблонов для календаря"></textarea><small class="muted"><span id="rn">0</span>/600 · без ссылок и контактов</small></div>
      ${S.soc.err ? `<p class="err" role="alert">${esc(S.soc.err)}</p>` : ''}
      <div class="row2"><button class="btn btn-accent" id="rsend">Опубликовать</button><button class="btn" id="rcancel">Отмена</button></div></div>`;
  }
  function composeTemplate(D) {
    const prods = S.catalog ? S.catalog.products : [], p0 = prods[0] || { variants: [] };
    return `<div class="card compose"><h3>Новый шаблон от компании</h3>
      <div class="field"><label for="tt">Название</label><input class="input" id="tt" maxlength="60" placeholder="Например: Альбом выпускника"></div>
      <div class="field"><label for="td">Описание</label><textarea class="textarea" id="td" rows="2" maxlength="200" placeholder="Для чего подходит и как лучше собрать"></textarea></div>
      <div class="row2"><div class="field"><label for="tp">Продукт</label><select class="select" id="tp">${prods.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="tv">Вариант</label><select class="select" id="tv">${p0.variants.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select></div></div>
      <div class="row2"><div class="field"><label for="tn">Страниц (для книги)</label><input class="input" id="tn" inputmode="numeric" placeholder="20"></div>
      <div class="field"><label for="tf">Фото на странице</label><select class="select" id="tf">${[1, 2, 3, 4].map((n) => `<option>${n}</option>`).join('')}</select></div></div>
      <div class="field"><label for="to">Повод</label><select class="select" id="to">${(D.occasions || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>
      ${S.soc.err ? `<p class="err" role="alert">${esc(S.soc.err)}</p>` : ''}
      <div class="row2"><button class="btn btn-accent" id="tsend">Опубликовать</button><button class="btn" id="tcancel">Отмена</button></div></div>`;
  }
  VIEWS.social = () => {
    const so = S.soc, D = so.data;
    if (!D) return { html: `<div class="loading"><div class="ai-ava" style="margin:0 auto">${ICON.spark}</div><p>${so.off ? 'Нет сети — лента появится, когда она вернётся' : 'Загружаю ленту…'}</p></div>`, bind() { } };
    const pub = D.can_publish, sm = D.summary;
    const seg = `<div class="seg" role="tablist"><button role="tab" data-sg="tpl" aria-pressed="${so.tab === 'tpl'}">Шаблоны</button><button role="tab" data-sg="rev" aria-pressed="${so.tab === 'rev'}">Отзывы · ${sm.count}</button></div>`;
    const off = so.off ? '<div class="warnbox"><span>Нет сети — показываю сохранённую ленту</span></div>' : '';
    let body;
    if (so.tab === 'tpl') {
      const occ = ['Все'].concat(D.occasions || []), list = D.templates.filter((t) => so.occ === 'Все' || t.occasion === so.occ);
      body = `${so.compose === 'tpl' ? composeTemplate(D) : pub ? '<button class="btn btn-lg" id="newt">+ Опубликовать шаблон</button>' : ''}
        <div class="occ" role="list">${occ.map((o) => `<button class="occ-i" role="listitem" data-oc2="${esc(o)}" aria-pressed="${so.occ === o}">${esc(o)}</button>`).join('')}</div>
        ${list.map((t) => tplCard(t, pub)).join('') || '<div class="empty"><p>Для этого повода шаблонов пока нет.</p></div>'}`;
    } else {
      const bars = [5, 4, 3, 2, 1].map((i) => `<div class="dist"><span class="num">${i}</span><i><b style="width:${sm.count ? (sm.dist[i] || 0) / sm.count * 100 : 0}%"></b></i><span class="num">${sm.dist[i] || 0}</span></div>`).join('');
      body = `<div class="card sumcard"><div class="avg"><b class="num">${sm.avg ? String(sm.avg).replace('.', ',') : '—'}</b>${stars(sm.avg, true)}<small>${sm.count} ${plural(sm.count, 'отзыв', 'отзыва', 'отзывов')}</small></div><div class="dists">${bars}</div></div>
        ${so.compose === 'rev' ? composeReview(D) : '<button class="btn btn-primary btn-lg" id="newr">Оставить отзыв</button>'}
        ${D.reviews.map((r) => revCard(r, pub)).join('')}`;
    }
    return {
      html: `<section class="hello"><h1>Идеи и отзывы</h1><p>Готовые шаблоны от компании и отзывы тех, кто уже заказал.</p></section>${seg}${off}${body}
        <p class="src">Отзывы-примеры помечены. Ссылки и контакты в отзывах не публикуются.</p>`,
      bind(scr) { bindSocial(scr); },
    };
  };
  async function socCall(path, body) {
    try { return await call('POST', path, body || {}); } catch (e) { toast(e.offline ? 'Нет сети — повторите позже' : e.message); throw e; }
  }
  function bindSocial(scr) {
    const so = S.soc, D = so.data, pub = D.can_publish;
    const upd = (arr, id, fn) => { const x = arr.find((y) => y.id === id); if (x) fn(x); LS.set('pp_social', D); rerender(); };
    scr.querySelectorAll('[data-sg]').forEach((b) => { b.onclick = () => { so.tab = b.dataset.sg; so.compose = null; so.err = ''; rerender(); }; });
    scr.querySelectorAll('[data-oc2]').forEach((b) => { b.onclick = () => { so.occ = b.dataset.oc2; rerender(); }; });
    scr.querySelectorAll('[data-tl]').forEach((b) => { b.onclick = async () => { if (!S.session) return toast('Войдите, чтобы отмечать'); const r = await socCall('/social/templates/' + b.dataset.tl + '/like').catch(() => null); if (r) upd(D.templates, b.dataset.tl, (t) => { t.likes = r.likes; t.liked = r.liked; }); }; });
    scr.querySelectorAll('[data-rl]').forEach((b) => { b.onclick = async () => { if (!S.session) return toast('Войдите, чтобы отмечать'); const r = await socCall('/social/reviews/' + b.dataset.rl + '/like').catch(() => null); if (r) upd(D.reviews, b.dataset.rl, (t) => { t.likes = r.likes; t.liked = r.liked; }); }; });
    scr.querySelectorAll('[data-tu]').forEach((b) => { b.onclick = () => useTemplate(D.templates.find((t) => t.id === b.dataset.tu)); });
    scr.querySelectorAll('[data-td]').forEach((b) => { b.onclick = async () => { if (!confirm('Убрать шаблон из ленты?')) return; await socCall('/social/templates/' + b.dataset.td + '/delete').catch(() => null); loadSocial(); }; });
    scr.querySelectorAll('[data-rd]').forEach((b) => { b.onclick = async () => { if (!confirm('Удалить отзыв?')) return; await socCall('/social/reviews/' + b.dataset.rd + '/delete').catch(() => null); loadSocial(); }; });
    scr.querySelectorAll('[data-rh]').forEach((b) => { b.onclick = async () => { await socCall('/social/reviews/' + b.dataset.rh + '/hide').catch(() => null); loadSocial(); }; });
    scr.querySelectorAll('[data-ro]').forEach((b) => { b.onclick = () => { so.openReply = b.dataset.ro; rerender(); const t = $('#rp'); if (t) t.focus(); }; });
    scr.querySelectorAll('[data-rc]').forEach((b) => { b.onclick = () => { so.openReply = null; rerender(); }; });
    scr.querySelectorAll('[data-rs]').forEach((b) => { b.onclick = async () => { const text = $('#rp').value.trim(); if (text.length < 3) return toast('Напишите ответ'); const r = await socCall('/social/reviews/' + b.dataset.rs + '/reply', { text }).catch(() => null); if (r) { so.openReply = null; toast('Ответ опубликован'); loadSocial(); } }; });
    const nr = $('#newr'); if (nr) nr.onclick = () => { so.compose = 'rev'; so.rate = 0; so.err = ''; rerender(); };
    const nt = $('#newt'); if (nt) nt.onclick = () => { so.compose = 'tpl'; so.err = ''; rerender(); };
    const rc = $('#rcancel'); if (rc) rc.onclick = () => { so.compose = null; rerender(); };
    const tc = $('#tcancel'); if (tc) tc.onclick = () => { so.compose = null; rerender(); };
    scr.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { so.rate = +b.dataset.st; scr.querySelectorAll('[data-st]').forEach((x) => { x.classList.toggle('on', +x.dataset.st <= so.rate); x.setAttribute('aria-checked', +x.dataset.st === so.rate); }); }; });
    const rt = $('#rt'); if (rt) rt.oninput = () => { $('#rn').textContent = rt.value.length; };
    const rs = $('#rsend');
    if (rs) rs.onclick = async () => {
      try {
        const r = await call('POST', '/social/reviews', { order_id: $('#ro').value, rating: so.rate, text: $('#rt').value });
        so.compose = null; so.err = ''; wire('Отзыв покупателя: оценка ' + (r.rating || so.rate)); toast(r.mine ? 'Спасибо за отзыв!' : 'Готово'); haptic(true); await loadSocial();
      } catch (e) { so.err = e.offline ? 'Нет сети — повторите, когда она появится' : e.message; const keep = $('#rt').value, ord = $('#ro').value; rerender(); $('#rt').value = keep; $('#ro').value = ord; $('#rn').textContent = keep.length; }
    };
    const tp = $('#tp');
    if (tp) tp.onchange = () => { const p = prodOf(tp.value); $('#tv').innerHTML = p.variants.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join(''); };
    const ts = $('#tsend');
    if (ts) ts.onclick = async () => {
      const pages = parseInt($('#tn').value, 10), prod = $('#tp').value;
      const body = { title: $('#tt').value, desc: $('#td').value, product: prod, variant: $('#tv').value, per_page: +$('#tf').value, occasion: $('#to').value, options: prod === 'book' && pages ? { pages } : {} };
      try { await call('POST', '/social/templates', body, { headers: { 'Idempotency-Key': 'tpl-' + rid() } }); so.compose = null; so.err = ''; toast('Шаблон опубликован'); await loadSocial(); }
      catch (e) { so.err = e.offline ? 'Нет сети — повторите позже' : e.message; const k = ['tt', 'td', 'tp', 'tv', 'tn', 'tf', 'to'].map((i) => $('#' + i).value); rerender(); ['tt', 'td', 'tp', 'tv', 'tn', 'tf', 'to'].forEach((i, n) => { $('#' + i).value = k[n]; }); }
    };
  }
  function useTemplate(t) {
    const prod = t && prodOf(t.product); if (!prod) return toast('Этот продукт сейчас недоступен');
    if (S.draft && S.draft.photos.length) { S.pool = S.pool.concat(S.draft.photos); LS.set('pp_pool', S.pool); }
    S.draft = newDraft(prod); if (t.variant) S.draft.variant = t.variant;
    Object.assign(S.draft.options, t.options || {}); S.draft.title = t.title; S.draft.tpl = t.id; saveDraft();
    call('POST', '/social/templates/' + t.id + '/use', {}).catch(() => { });
    step('catalog'); refreshPrice(); toast('Шаблон выбран — добавьте фото'); go('photos');
  }

  /* ---------- связь с пультом: что приложение пишет в единый слой событий (панель справа на ноутбуке) ---------- */
  const STEP_NAME = { catalog: 'каталог', photos: 'выбор фото', layout: 'макет', check: 'проверка', cart: 'корзина' };
  function wire(text) {
    const ul = $('#wire'); if (!ul) return;
    const none = ul.querySelector('.none'); if (none) none.remove();
    const li = document.createElement('li');
    li.innerHTML = `<i></i><span>${esc(text)}</span><time>${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>`;
    ul.prepend(li); while (ul.children.length > 6) ul.lastChild.remove();
  }
  function fitBar() { const b = $('#bar'); $('#app').style.setProperty('--bar-h', (b ? b.offsetHeight : 0) + 'px'); }

  /* ---------- уведомления: имитация push о статусе заказа (ТЗ, шаг 7) ---------- */
  let pushT;
  function stageNews(o) {
    if (o.stage_status === 'defect') return 'На этапе нашли брак — переделываем бесплатно, срок может сдвинуться.';
    return { accepted: 'Заказ принят.', moderation: 'Проверяем макет и фото.', production: 'Заказ ушёл в печать.', quality: 'Напечатали, проверяем качество.',
      shipped: isPickup(o) ? 'Заказ готов — можно забирать.' : 'Заказ передан в доставку.',
      done: o.stage_status === 'passed' ? 'Заказ завершён. Спасибо, что выбрали picPac!' : (isPickup(o) ? 'Заказ ждёт вас в пункте выдачи.' : 'Заказ в пути к вам.') }[o.stage] || 'Статус заказа изменился.';
  }
  function paintBell() {
    const b = $('#bell'); if (!b) return; const n = S.notes.filter((x) => !x.read).length;
    b.innerHTML = ICON.bell + (n ? `<b>${n}</b>` : ''); b.setAttribute('aria-label', 'Уведомления' + (n ? ': новых ' + n : ''));
  }
  function notify(title, text, orderId, seen) {
    S.notes.unshift({ id: rid(), title, text, order: orderId || null, ts: new Date().toISOString(), read: !!seen }); S.notes = S.notes.slice(0, 30); LS.set('pp_notes', S.notes);
    const el = $('#push');
    el.innerHTML = `<i aria-hidden="true">p</i><span><small>picPac · сейчас</small><b>${esc(title)}</b><span>${esc(text)}</span></span>`; el.dataset.order = orderId || '';
    el.classList.add('show'); clearTimeout(pushT); pushT = setTimeout(() => el.classList.remove('show'), 6500);
    haptic(true); paintBell();
    if (S.notifyOn && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: text, icon: '/t2/icon-192.png', tag: orderId || 'picpac' }); } catch (e) { /* на iPhone — только из установленного приложения */ }
    }
  }
  $('#push').onclick = () => { const el = $('#push'), id = el.dataset.order; el.classList.remove('show'); if (id) openOrder(id); else openNotes(); };
  async function toggleNotify() {
    if (!S.notifyOn) {
      if (!('Notification' in window)) { toast('Этот браузер не показывает уведомления на экране — они останутся в приложении', 4000); }
      else { const p = await Promise.resolve(Notification.requestPermission()).catch(() => 'denied'); if (p !== 'granted') toast('Браузер не разрешил уведомления на экране — они останутся в приложении', 4000); }
    }
    S.notifyOn = !S.notifyOn; LS.set('pp_notify', S.notifyOn);
  }
  function openNotes() {
    const old = $('#sheet'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet';
    const list = S.notes.map((n) => `<button class="nitem ${n.read ? '' : 'new'}" data-n="${n.order || ''}"><i></i><span><b>${esc(n.title)}</b><span>${esc(n.text)}</span></span><time>${fdate(n.ts)}</time></button>`).join('');
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body" role="dialog" aria-label="Уведомления"><b>Уведомления</b>
      <div class="nlist">${list || '<p class="muted">Пока пусто. Здесь появятся сообщения о заказе: модерация, печать, готовность.</p>'}</div>
      <button class="allqty" id="nsw" role="switch" aria-checked="${!!S.notifyOn}"><span>Показывать на экране телефона<small class="hint">Когда приложение свёрнуто</small></span><span class="switch"></span></button>
      <button class="btn btn-accent btn-lg" data-x>Готово</button></div>`;
    $('.app').appendChild(el);
    S.notes.forEach((n) => { n.read = true; }); LS.set('pp_notes', S.notes); paintBell();
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => el.remove(); });
    el.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => { el.remove(); if (b.dataset.n) openOrder(b.dataset.n); }; });
    $('#nsw').onclick = async () => { await toggleNotify(); $('#nsw').setAttribute('aria-checked', !!S.notifyOn); };
  }
  setInterval(() => {                        // пока приложение открыто, следим за активными заказами и новыми фото в общем альбоме
    if (!S.session || !S.online) return;
    if (S.view === 'photos' && S.draft && S.draft.shareToken) loadInbox();
    if (S.view === 'order' || S.view === 'done') return;               // на экране заказа он опрашивается сам
    if (S.orders.some((o) => !(o.stage === 'done' && o.stage_status === 'passed'))) loadOrders();
  }, 7000);

  /* ---------- файлы, которые не подошли: причина остаётся на экране, пока человек её не прочитает ---------- */
  function rejectsHtml() {
    const R = S.rejects; if (!R || !R.length) return '';
    return `<div class="rejects" role="alert"><b>${R.length} ${plural(R.length, 'файл не добавлен', 'файла не добавлены', 'файлов не добавлены')}</b>
      <ul>${R.slice(0, 6).map((r) => `<li><span><b style="color:inherit;font-size:inherit">${esc(r.name)}</b> — ${esc(r.why)}</span></li>`).join('')}</ul>${R.length > 6 ? `<span>и ещё ${R.length - 6}</span>` : ''}
      <div class="row2"><label class="btn btn-sm" for="file">Выбрать другие</label><button class="btn btn-sm btn-ghost" id="rjx">Понятно</button></div></div>`;
  }

  /* ---------- подсказки «Для вас»: по вашим фото, заказам и времени года (правила, без модели) ---------- */
  const leadOf = (id) => { const p = prodOf(id); return p ? (p.lead_days[0] === p.lead_days[1] ? p.lead_days[0] : p.lead_days[0] + '–' + p.lead_days[1]) + ' дн.' : ''; };
  function recs() {
    if (!S.catalog) return [];
    const out = [], m = new Date().getMonth(), n = S.pool.length, last = S.orders[0], has = (id) => !!prodOf(id);
    const add = (tag, title, why, act, go) => { if (out.length < 4) out.push({ tag, title, why, act, go }); };
    if (n >= 20 && has('book')) add('Ваши фото', 'Фотокнига из ' + n + ' ваших фото', 'Хватит на книгу в 20 страниц. Раскладку соберём сами, вы только поправите.', 'pool:book:classic', 'Собрать книгу');
    else if (n >= 12 && has('calendar')) add('Ваши фото', 'Календарь из ваших фото', 'В «Моих фото» ' + n + ' ' + plural(n, 'кадр', 'кадра', 'кадров') + ' — по одному на каждый месяц.', 'pool:calendar:wall', 'Собрать календарь');
    else if (n >= 1 && has('print')) add('Ваши фото', 'Напечатать ' + n + ' фото 10×15', 'Они уже в «Моих фото»: осталось проверить и заказать.', 'pool:print:10x15', 'Напечатать');
    if ((m >= 9 || m === 0) && has('calendar')) add('К Новому году', 'Календарь на 2027 год', 'Двенадцать ваших кадров на стену. Изготовление ' + leadOf('calendar'), 'prod:calendar:wall', 'Выбрать');
    else if (m >= 3 && m <= 5 && has('book')) add('Сезон выпускных', 'Выпускной альбом', 'Соберите класс в одну книгу. Изготовление ' + leadOf('book'), 'prod:book:classic', 'Выбрать');
    else if (m >= 6 && m <= 8 && has('book')) add('После отпуска', 'Книга о путешествии', 'Пока кадры свежие. Изготовление ' + leadOf('book'), 'prod:book:classic', 'Выбрать');
    else if (has('canvas')) add('Подарок', 'Холст на стену', 'Один любимый кадр крупно. Изготовление ' + leadOf('canvas'), 'prod:canvas:30x40', 'Выбрать');
    if (last) {
      const k = (prodOf((last.items || [])[0] && last.items[0].product) || {}).kind;
      if (k === 'book' && has('magnet')) add('После заказа ' + last.number, 'Магниты из тех же кадров', 'К фотокниге часто берут магниты — в подарок близким.', 'prod:magnet:10x10', 'Выбрать');
      else if (has('book')) add('После заказа ' + last.number, 'Соберите фотокнигу', 'Отдельные отпечатки теряются, книга сохранит их вместе.', 'prod:book:classic', 'Выбрать');
    } else add('Первый заказ', 'Промокод WELCOME5', 'Минус 5 BYN на заказ от 30 BYN. Подставим в корзине сами.', 'promo:WELCOME5', 'Применить');
    return out;
  }
  function recsHtml() {
    const R = recs(); if (!R.length) return '';
    return `<p class="sec-t">Для вас</p><div class="recs" role="list">${R.map((r, i) => `<button class="card-flat rec" role="listitem" data-rec="${i}"><span class="chip chip-accent">${esc(r.tag)}</span><b>${esc(r.title)}</b><span>${esc(r.why)}</span><em>${esc(r.go)} →</em></button>`).join('')}</div>`;
  }
  function applyPromo(code) {
    S.promoPending = String(code).toUpperCase().slice(0, 30); S.promoOpen = true;
    if (S.draft) { S.draft.promo = S.promoPending; saveDraft(); }
    toast('Промокод ' + S.promoPending + ' подставим в корзине');
  }
  function runRec(act) { const [k, a, b] = act.split(':'); if (k === 'prod') openProduct(a, b); else if (k === 'pool') printFromPool(a, b, true); else if (k === 'promo') applyPromo(a); }

  /* ---------- совместный альбом (ТЗ 6.5): владелец даёт ссылку, близкие присылают фото, он решает, какие взять ---------- */
  function shareHtml() {
    const d = S.draft; if (!d) return '';
    const url = d.shareToken ? location.origin + '/t2/?join=' + d.shareToken : '';
    return `<section class="card share" aria-label="Совместный альбом"><header><span class="ai-ava">${ICON.people}</span><b>Совместный альбом</b></header>
      ${url ? `<p>Отправьте ссылку близким. Их фото придут сюда, а вы решите, какие взять.</p>
        <div class="link"><input class="input" id="shurl" readonly value="${esc(url)}" aria-label="Ссылка на альбом"><button class="btn btn-accent" id="shcopy">Скопировать</button></div>
        <button class="btn btn-sm btn-ghost" id="shoff">Закрыть доступ по ссылке</button>`
      : `<p>Пусть родные добавят свои кадры: вы отправляете ссылку, они загружают фото со своего телефона.</p><button class="btn" id="shon">${ICON.link} Пригласить по ссылке</button>`}</section>`;
  }
  function inboxHtml() {
    const I = S.inbox; if (!I.length || !S.draft) return '';
    const who = Array.from(new Set(I.map((x) => x.by || 'Гость'))).join(', ');
    return `<div class="warnbox inbox" role="status"><span><b>${esc(who)}</b>: ${I.length} ${plural(I.length, 'новое фото', 'новых фото', 'новых фото')} в альбом</span><span><button class="btn btn-sm btn-accent" id="inok">Взять</button><button class="btn btn-sm btn-ghost" id="inno">Не брать</button></span></div>`;
  }
  async function loadInbox() {
    const d = S.draft; if (!d || !d.shareToken || !S.online) return;
    try {
      const r = await call('GET', '/projects/' + d.id + '/inbox'), ch = r.inbox.length !== S.inbox.length; S.inbox = r.inbox;
      if (ch && S.view === 'photos' && !$('#sheet') && !S.busy) { if (r.inbox.length) haptic(true); rerender(); }
    } catch (e) { /* проверим в следующий раз */ }
  }
  function bindShare() {
    const d = S.draft, on = $('#shon'), cp = $('#shcopy'), off = $('#shoff'), ok = $('#inok'), no = $('#inno');
    if (on) on.onclick = async () => {
      on.disabled = true;
      try { await syncDraftNow().catch(() => { }); const r = await call('POST', '/projects/' + d.id + '/share', {}); d.shareToken = r.token; LS.set('pp_draft', d); wire('Открыт общий альбом по ссылке'); rerender(); }
      catch (e) { on.disabled = false; toast(e.offline ? 'Нет сети — ссылку можно создать, когда она появится' : e.message); }
    };
    if (cp) cp.onclick = async () => {
      const url = $('#shurl').value;
      try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована — отправьте её близким'); }
      catch (e) { $('#shurl').focus(); $('#shurl').select(); toast('Скопируйте ссылку из поля'); }
    };
    if (off) off.onclick = async () => {
      try { await call('POST', '/projects/' + d.id + '/share', { off: true }); d.shareToken = null; S.inbox = []; LS.set('pp_draft', d); toast('Ссылка больше не работает'); rerender(); }
      catch (e) { toast(e.offline ? 'Нет сети — повторите позже' : e.message); }
    };
    if (ok) ok.onclick = takeInbox;
    if (no) no.onclick = () => { const ids = S.inbox.map((x) => x.id); S.inbox = []; rerender(); call('POST', '/projects/' + d.id + '/inbox/clear', { ids }).catch(() => { }); };
  }
  async function takeInbox() {
    const d = S.draft, I = S.inbox.slice(), files = []; S.inbox = [];
    S.busy = { done: 0, total: I.length, title: 'Забираю фото из общего альбома', note: 'Потом проверю их так же, как ваши' }; rerender();
    for (const x of I) {
      try { const b = await call('GET', '/photos/' + x.id, undefined, { blob: true }); if (b) files.push(new File([b], x.name || 'Фото.jpg', { type: b.type || 'image/jpeg' })); } catch (e) { /* пропустим этот кадр */ }
      S.busy.done++; renderBusy();
    }
    S.busy = null;
    const by = (I[0] && I[0].by) || 'Гость';
    if (files.length) await addFiles(files, false, by); else rerender();
    call('POST', '/projects/' + d.id + '/inbox/clear', { ids: I.map((x) => x.id) }).catch(() => { });
    if (files.length) toast('Добавили ' + files.length + ' фото от: ' + by);
  }
  /* приглашённый: открыл ссылку ?join=…, выбрал фото — они уходят владельцу альбома */
  async function joinAlbum(token) {
    S.join = { token, info: null, err: '', sent: 0, name: (S.form.name || '') };
    S.stack = []; go('join', true);
    try { S.join.info = await call('GET', '/shared/' + encodeURIComponent(token)); }
    catch (e) { S.join.err = e.offline ? 'Нет сети. Откройте ссылку ещё раз, когда она появится.' : 'Ссылка больше не работает: владелец закрыл доступ к альбому.'; }
    if (S.view === 'join') rerender();
  }
  VIEWS.join = () => {
    const J = S.join || { err: 'Ссылка на альбом не открыта.' }, I = J.info;
    if (J.err) return { html: `<div class="empty"><h3>Альбом недоступен</h3><p>${esc(J.err)}</p><button class="btn btn-accent btn-lg" data-tab="home">В каталог</button></div>`, bind() { } };
    if (!I) return { html: `<div class="loading"><div class="ai-ava">${ICON.people}</div><p>Открываю альбом…</p></div>`, bind() { } };
    return {
      html: `<section class="hello"><h1>Вас позвали в общий альбом</h1><p>${esc(I.owner)} собирает «${esc(I.title)}». Добавьте свои фото — владелец альбома решит, какие взять в печать.</p></section>
        ${rejectsHtml()}${J.sent ? `<div class="warnbox inbox" role="status"><span>Отправлено: <b>${J.sent}</b> фото. Можно добавить ещё.</span></div>` : ''}
        <div class="field"><label for="jn">Ваше имя</label><input class="input" id="jn" maxlength="30" value="${esc(J.name)}" placeholder="Чтобы было понятно, от кого фото" autocomplete="given-name"></div>
        <div class="pick"><label class="btn btn-primary btn-xl" for="file">${ICON.photos} Выбрать фото</label><button class="btn btn-lg" id="jdemo">Тестовые кадры · 4 шт.</button></div>
        <div class="trust"><div>${ICON.ok} Принимаем JPEG и PNG до 25 МБ</div><div>${ICON.ok} Фото увидит только владелец альбома</div><div>${ICON.ok} В заказ они попадут после его согласия</div></div>`,
      bar: `<button class="btn btn-lg" id="jhome">Перейти в каталог</button>`,
      bind() {
        $('#jn').oninput = (e) => { J.name = e.target.value; };
        $('#jdemo').onclick = joinDemo; $('#jhome').onclick = () => { S.stack = []; go('home', true); };
        $('#file').accept = 'image/jpeg,image/png';
      },
    };
  };
  async function joinUpload(files) {
    const J = S.join, rej = []; files = Array.from(files); let ok = 0;
    S.busy = { done: 0, total: files.length, title: 'Отправляю фото в альбом', note: 'Владелец альбома увидит их у себя' }; rerender();
    for (const f of files) {
      if (!okType(f)) rej.push({ name: f.name || 'Файл', why: 'формат не поддерживается: нужен JPEG или PNG' });
      else if (f.size > 25 * 1024 * 1024) rej.push({ name: f.name, why: 'файл больше 25 МБ: уменьшите его или выберите другой' });
      else {
        try {
          await call('POST', '/shared/' + encodeURIComponent(J.token) + '/photos', undefined, { raw: f, headers: { 'Content-Type': f.type || 'image/jpeg', 'X-File-Name': encodeURIComponent(f.name || ''), 'X-Author': encodeURIComponent((J.name || '').trim()) } });
          ok++;
        } catch (e) { rej.push({ name: f.name || 'Файл', why: e.offline ? 'нет сети — попробуйте ещё раз' : e.message }); }
      }
      S.busy.done++; renderBusy();
    }
    S.busy = null; S.rejects = rej; J.sent += ok;
    if (ok) { toast('Отправили в альбом: ' + ok + ' фото'); haptic(true); wire('Фото в общий альбом: ' + ok); }
    rerender();
  }
  async function joinDemo() {
    const D = window.DemoGallery, files = [];
    for (const [scene, seed, size] of D.DEMO.filter((x) => !x[3]).slice(0, 4)) {
      const c = D.render1(scene, seed, size), big = document.createElement('canvas'); big.width = c.width * 3; big.height = c.height * 3;
      const bx = big.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(c, 0, 0, big.width, big.height);
      files.push(new File([await new Promise((r) => big.toBlob(r, 'image/jpeg', 0.82))], D.NAMES[scene] + '.jpg', { type: 'image/jpeg' }));
    }
    joinUpload(files);
  }

  /* ---------- ссылки внутрь приложения (ТЗ 6.5): ?product=book&variant=premium · ?promo=PICPAC10 · ?order=PP-1001 · ?tpl=<id> · ?tab=orders · ?join=<код> ---------- */
  function deepLink() {
    const q = params, keys = ['promo', 'join', 'product', 'variant', 'tpl', 'order', 'tab'];
    if (!keys.some((k) => q.has(k))) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* не страшно: ссылка просто сработает ещё раз */ }
    if (q.get('promo')) applyPromo(q.get('promo'));
    if (q.get('join')) return joinAlbum(q.get('join'));
    if (q.get('product')) { if (prodOf(q.get('product'))) openProduct(q.get('product'), q.get('variant')); else toast('Такого продукта в каталоге нет'); return; }
    if (q.get('tpl')) { S.stack = []; go('social', true); loadSocial().then(() => { const t = S.soc.data && S.soc.data.templates.find((x) => x.id === q.get('tpl')); if (t) useTemplate(t); else toast('Шаблон не найден'); }); return; }
    if (q.get('order')) { S.stack = []; go('orders', true); openOrder(q.get('order')); return; }
    if (TABS.includes(q.get('tab'))) { S.stack = []; go(q.get('tab'), true); }
  }

  VIEWS.profile = () => {
    const u = S.session ? S.session.user : null, guest = !u || u.role === 'customer' && /^g-/.test(u.id), staff = !!u && u.role !== 'customer';
    const row = (href, key, title, sub) => `<a href="${href}" data-go="${key}"><span>${title}<small>${sub}</small></span>${ICON.back}</a>`;
    return {
      html: `<div class="card prof"><span class="avatar" aria-hidden="true">${esc((u && !guest ? u.name : 'Г')[0])}</span><div><b>${esc(u ? (guest ? 'Гость' : u.name) : '')}</b><p class="muted">${guest ? 'Заказы привязаны к этому телефону. Войдите — и они перейдут в вашу учётную запись.' : esc(u ? u.title : '')}</p></div></div>
        ${guest ? `<form id="lf" class="form"><p class="sec-t">Войти в учётную запись</p><div class="field"><label for="lg">Логин</label><input class="input" id="lg" value="client" autocomplete="username"></div>
          <div class="field"><label for="pw">Пароль</label><input class="input" id="pw" type="password" placeholder="demo2026" autocomplete="current-password"></div>${S.err ? `<p class="err" role="alert">${esc(S.err)}</p>` : ''}<button class="btn btn-accent btn-xl" type="submit">Войти</button></form>` : ''}
        ${staff ? `<p class="sec-t">Рабочие экраны</p><div class="card-flat rows">${row('/t1/', 'fp-token', 'Пульт руководителя', 'Показатели, воронка приложения, решения')}${row('/t2/admin.html', 'pp_staff', 'Экран участка', 'Очередь заказов: принял, сдал, брак')}${['director', 'head', 'analyst'].includes(u.role) ? row('/t2/analytics.html', 'pp_dir', 'Аналитика приложения', 'Заказы, воронка, отзывы') : ''}</div>` : ''}
        <p class="sec-t">Уведомления</p>
        <div class="card-flat rows"><button id="pn" role="switch" aria-checked="${!!S.notifyOn}"><span>Статус заказа на экране телефона<small>Модерация, печать, готовность. В приложении они видны всегда</small></span><span class="switch"></span></button></div>
        <p class="sec-t">Данные</p>
        <div class="inset">Мы храним ваши фото и заказы, пока вы их не удалите. Заказы остаются для учёта без имени, телефона и адреса.</div>
        <button class="btn btn-lg btn-danger" id="del">Удалить мои фото и данные</button>
        <button class="btn btn-ghost" id="out">Выйти</button>
        <p class="src" style="text-align:center">Тестовый стенд: данные выдуманные, деньги не списываются.</p>`,
      bind(scr) {
        const lf = $('#lf'); if (lf) lf.onsubmit = async (e) => { e.preventDefault(); try { await loginAs($('#lg').value.trim(), $('#pw').value); S.err = ''; toast('Вы вошли'); syncSoon(); loadOrders(); rerender(); } catch (er) { S.err = er.message; rerender(); } };
        // сотрудник переходит в пульт или на экран участка без повторного входа: та же сессия, права всё равно проверяет сервер
        scr.querySelectorAll('[data-go]').forEach((a) => { a.onclick = () => { try { sessionStorage.setItem(a.dataset.go, S.session.token); } catch (e) { /* войдёт там заново */ } }; });
        $('#pn').onclick = async () => { await toggleNotify(); rerender(); };
        $('#out').onclick = () => { S.session = null; LS.del('pp_session'); S.orders = []; S.notes = []; LS.del('pp_notes'); go('login', true); };
        $('#del').onclick = async () => {
          if (!confirm('Удалить все ваши фото, черновики и обращения? Это нельзя отменить.')) return;
          try {
            const r = await call('POST', '/account/delete', { confirm: true });
            if (S.draft) S.draft.photos.forEach((p) => { IDB.del('blobs', p.id); IDB.del('thumbs', p.id); });
            S.pool.forEach((p) => { IDB.del('blobs', p.id); IDB.del('thumbs', p.id); }); S.pool = []; LS.del('pp_pool'); S.notes = []; LS.del('pp_notes');
            S.draft = null; LS.del('pp_draft'); LS.del('pp_outbox'); LS.del('pp_orders'); S.outbox = null; S.orders = []; S.thumbs = {};
            toast('Удалено: фото ' + r.photos_deleted); if (r.account_removed) { S.session = null; LS.del('pp_session'); go('login', true); } else { S.stack = []; go('home', true); }
          } catch (e) { toast(e.offline ? 'Нет сети — удалить можно, когда она появится' : e.message); }
        };
      },
    };
  };

  /* ---------- запуск ---------- */
  async function restoreThumbs() {
    for (const p of S.pool) { const t = await IDB.get('thumbs', p.id); if (t) S.thumbs[p.id] = t; }
    if (!S.draft) return;
    for (const p of S.draft.photos) {
      const t = await IDB.get('thumbs', p.id);
      if (t) S.thumbs[p.id] = t;
      else if (p.up && S.online && S.session) {        // другой телефон или очищенная память: берём с сервера
        try { const b = await call('GET', '/photos/' + p.id, undefined, { blob: true }); S.thumbs[p.id] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => { const i = new Image(); i.onload = () => res(thumbOf(i, i.naturalWidth, i.naturalHeight, 360)); i.src = fr.result; }; fr.readAsDataURL(b); }); } catch (e) { /* нет фото */ }
      }
    }
  }
  async function startApp() {
    S.stack = [];
    await loadCatalog(); await restoreThumbs();
    if (S.draft && S.draft.photos.length) classify();
    makeArt();
    go('home', true); syncSoon(); flushOutbox(); step('catalog');
  }
  $('#file').addEventListener('change', (e) => { const f = e.target.files; if (f && f.length) { if (S.view === 'join') joinUpload(f); else if (S.view === 'feed' || S.view === 'home') { if (S.view === 'home') { S.stack = []; go('feed', true); } addFiles(f, true); } else { if (S.view !== 'photos' && S.view !== 'check') { if (!S.draft) S.draft = newDraft(prodOf('print')); go('photos'); } addFiles(f); } } e.target.value = ''; });
  $('#screen').addEventListener('scroll', (e) => { $('#head').classList.toggle('scrolled', e.target.scrollTop > 4); }, { passive: true });
  setInterval(() => {
    const el = $('#sideTimer'), note = $('#sideTimerNote'); if (!el) return;
    const t0 = S.draft && S.draft.t0;
    if (!t0) { el.textContent = '0:00'; el.style.color = 'var(--ink3)'; note.textContent = 'Отсчёт пойдёт, когда выберете фото'; return; }
    el.style.color = ''; el.textContent = mmss((Date.now() - t0) / 1000); note.textContent = 'Идёт: от выбора фото до заказа';
  }, 1000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/t2/sw.js').catch(() => { });

  (async () => {
    // без стены входа: сразу гость, войти можно в «Профиле» (или кнопкой «Войти» на главной)
    window.picpacGo = (v) => { S.stack = []; go(v, true); };          // для заставки входа (t2/intro.js)
    const ready = () => { window.picpacReady = true; document.dispatchEvent(new Event('picpac:ready')); };
    if (!S.session) { try { await loginGuest(); } catch (e) { await loadCatalog(); go('login', true); ready(); return; } }
    await startApp(); ready();
    if (params.get('demo') === '1' && !S.draft) { openProduct('print'); go('photos'); addDemo(false); }
    else deepLink();
  })();
})();
