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
    const any = !!(moved && (moved.orders || moved.projects));
    if (any) toast('Перенесли в вашу учётную запись: заказов ' + moved.orders + ', черновиков ' + moved.projects, 4500);
    return any;
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
  const optVal = (o, d) => o.values.find((x) => x.id === (d.options || {})[o.id]) || o.values[0];
  const optAdd = (prod, d) => prod.options.reduce((sum, o) => sum + (o.kind === 'number' ? 0 : Number(optVal(o, d).price || 0)), 0);
  function localPrice(d) {
    const prod = prodOf(d.product), v = varOf(prod, d.variant), qty = unitsOf(d);
    let unit;
    if (prod.kind === 'print') { unit = Number(v.tiers[0][1]); v.tiers.forEach(([n, p]) => { if (qty >= n) unit = Number(p); }); }
    else if (prod.kind === 'book') { const pg = Number((d.options || {}).pages || 20); unit = Number(v.base) + Math.max(0, pg - v.pages_incl) * Number(v.page_price); }
    else unit = Number(v.price);
    if (prod.kind !== 'print') unit += optAdd(prod, d);
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
    list.forEach((p) => { p.blur = p.sharp < 14 || (p.sharp < median * 0.2 && p.sharp < 100);    /* кадр с ровным небом или песком мягкий от природы — размытым считаем только тот, что в разы мягче остальных */ p.dark = p.bright < 48; p.dup = false; });
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) {
      if (list[j].dup || list[i].dup) continue;
      // дубль — тот же кадр серии: совпадают отпечаток, пропорции и яркость (у разных снимков с ровным небом отпечатки тоже бывают близки)
      const A = list[i], B = list[j], same = Math.abs(A.w / A.h - B.w / B.h) < 0.02 && Math.abs(A.bright - B.bright) < 20;
      if (same && hamming(A.hash, B.hash) <= 10) (A.sharp >= B.sharp ? B : A).dup = true;
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
        S.thumbs[id] = thumbOf(img, w, h, 520); S.energy[id] = { colE: a.colE, rowE: a.rowE };
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
    S.busy = { done: 0, total: (D.REAL || D.DEMO).length }; rerender();
    const files = [], blobOf = (c, q) => new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    try {                                                   // настоящие снимки; нет сети — рисованные кадры
      for (const [n, name, mod] of D.REAL) {
        files.push(new File([await blobOf(await D.realCanvas(n, mod), 0.85)], name + '.jpg', { type: 'image/jpeg' }));
        S.busy.done++; renderBusy(); await sleep(0);
      }
    } catch (e) {
      files.length = 0; S.busy.done = 0; S.busy.total = D.DEMO.length;
      for (const [scene, seed, size, mod] of D.DEMO) {
        const c = D.render1(scene, seed, size, mod), big = document.createElement('canvas');
        const k = mod === 'small' ? 1024 / c.width : 3; big.width = Math.round(c.width * k); big.height = Math.round(c.height * k);
        const bx = big.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(c, 0, 0, big.width, big.height);
        files.push(new File([await blobOf(big, 0.82)], D.NAMES[scene] + (mod ? ' (' + mod + ')' : '') + '.jpg', { type: 'image/jpeg' }));
        S.busy.done++; renderBusy(); await sleep(0);
      }
    }
    await addFiles(files, toPool);
  }

  /* ---------- иконки ---------- */
  const SV = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const ICON = {
    back: SV('<path d="M15 18l-6-6 6-6"/>'),
    grid: SV('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
    text: SV('<path d="M5 6h14M12 6v13M9 19h6"/>'), card: SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 8l9 6 9-6"/>'),
    chat: SV('<path d="M4 5h16v11H9l-5 4z"/>'), drop: SV('<path d="M12 3.5s6 6.2 6 10.4a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5z"/>'), check: SV('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
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
  const PAK = '<span class="ai-ava pak" aria-hidden="true"><img src="/t2/brand/cat-happy.png" alt=""></span>';   // котик Пак — помощник приложения
  const haptic = (ok) => { try { navigator.vibrate && navigator.vibrate(ok ? [20, 40, 20] : 10); } catch (e) { /* нет вибрации */ } };

  /* ---------- навигация и отрисовка ---------- */
  const TITLES = { home: 'picPac', product: 'Продукт', photos: 'Фото', layout: 'Конструктор', check: 'Проверка', cart: 'Оформление', done: 'Заказ', orders: 'Мои заказы', order: 'Заказ', profile: 'Профиль', login: 'Вход', feed: 'Мои фото', make: 'Конструктор', social: 'Идеи', join: 'Общий альбом' };
  const TABS = ['home', 'make', 'social', 'orders', 'profile'];
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
    const right = isTab ? `<span class="head-acts">${S.view === 'home' && guest ? '<button class="head-link" id="signin">Войти</button>' : ''}${bell}</span>` : S.view === 'login' ? '<span></span>' : '<span class="head-acts"><button class="pak-btn" id="pak" aria-label="Помощник Пак. Открыть"><img src="/t2/brand/cat-happy.png" alt=""></button></span>';
    const sub = fi >= 0 ? `<small class="stepno">Шаг ${fi + 1} из ${FLOW.length}</small>` : '';
    const pak = S.view === 'login' ? '' : '<button class="pak-btn" id="pak" aria-label="Помощник Пак. Открыть"><img src="/t2/brand/cat-happy.png" alt=""></button>';
    head.innerHTML = `${S.view === 'login' ? '<span></span>' : isTab ? pak : `<button class="icon-btn" id="back" aria-label="Назад">${ICON.back}</button>`}<div class="ttl"><h2>${S.view === 'home' ? logo : TITLES[S.view]}</h2>${sub}</div>${right}
      ${fi >= 0 ? `<div class="progress" style="grid-template-columns:repeat(${FLOW.length},1fr)" aria-hidden="true">${FLOW.map((_, i) => `<i class="${i <= fi ? 'on' : ''}"></i>`).join('')}</div>` : ''}`;
    const b = $('#back'); if (b) b.onclick = back;
    const si = $('#signin'); if (si) si.onclick = () => { S.stack = []; go('profile', true); };
    const bl = $('#bell'); if (bl) bl.onclick = openNotes;
    const pk = $('#pak'); if (pk) pk.onclick = () => openPak();
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
    return `<nav class="tabs3" aria-label="Разделы"><i class="tab-pill" style="--i:${from}" aria-hidden="true"></i>${t('home', 'home', 'Каталог')}${t('make', 'grid', 'Конструктор')}${t('social', 'people', 'Идеи')}${t('orders', 'list', 'Заказы')}${t('profile', 'user', 'Профиль')}</nav>`;
  }
  function renderNet() {
    const n = $('#net'); if (!n) return;
    const queued = !!S.outbox;
    n.hidden = S.online && !queued;
    n.textContent = !S.online ? (queued ? 'Нет сети — заказ сохранён на телефоне, отправим сам' : 'Нет сети — всё сохранено на телефоне') : 'Отправляю заказ…';
  }
  function renderBusy() {
    if (!S.busy) return; const { done, total } = S.busy;
    $('#screen').innerHTML = `<div class="loading">${PAK}
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
  /* Фото продуктов — снимки с Unsplash (список и лицензия: ios/PHOTO-CREDITS.md); перед запуском заменить на съёмку «Фотопринта». */
  const PHOTO = { print: 'prints', book: 'book', calendar: 'calendar', magnet: 'magnet', canvas: 'canvas', card: 'prints-hand' };
  function artOf(kind) {
    if (PHOTO[kind]) return `<img class="art-photo" src="/t2/photos/photo-${PHOTO[kind]}.jpg" alt="">`;
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
  /* стили книги: одно касание меняет фон и шаблоны на всех страницах */
  const STYLES = [
    ['classic', 'Классика', 'Белые страницы, фото во всю ширину', { bg: '#FFFFFF', t: { 1: 'a', 2: 'a', 3: 'a', 4: 'a' } }],
    ['craft', 'Крафт', 'Кремовый фон, фото карточками', { bg: '#F6F1E7', t: { 1: 'c', 2: 'a', 3: 'b', 4: 'a' } }],
    ['gallery', 'Галерея', 'Чёрный фон, фото с полями', { bg: '#141414', t: { 1: 'b', 2: 'b', 3: 'a', 4: 'a' } }],
    ['mag', 'Журнал', 'Без полей, крупные кадры', { bg: '#FFFFFF', t: { 1: 'a', 2: 'c', 3: 'd', 4: 'b' } }],
    ['sun', 'Солнечный', 'Жёлтые и белые страницы через одну', { bg: '#FFD400', alt: '#FFFFFF', t: { 1: 'b', 2: 'd', 3: 'b', 4: 'c' } }],
  ];
  function applyStyle(d, id) {
    const st = STYLES.find((x) => x[0] === id); if (!st || !d.layout) return;
    const o = st[3]; d.style = id;
    d.layout.forEach((pg, i) => { const m = pmOf(d, i), n = Math.min(pg.length, 4); m.bg = o.alt && i % 2 ? o.alt : o.bg; m.t = o.t[n] || 'a'; });
  }
  const stylePv = (o, n, alt) => `<span class="pv mini n${n} t${n}${o.t[n]}${darkBg(alt ? o.alt || o.bg : o.bg) ? ' dark' : ''}" style="background:${alt ? o.alt || o.bg : o.bg}">${'<i class="sl"></i>'.repeat(n)}</span>`;
  VIEWS.make = () => {
    const cat = S.catalog, d = S.draft, n = d ? d.photos.length : 0;
    const cont = d && n ? `<button class="card cont" id="cont"><b>Продолжить: ${esc(prodOf(d.product).name)}</b><span>${n} ${plural(n, 'фото', 'фото', 'фото')} · черновик сохранён</span><i aria-hidden="true">${ICON.back}</i></button>` : '';
    const WHAT = { book: 'Страницы, шаблоны, подписи', calendar: '12 месяцев с вашими фото', card: 'Фото и подпись в конверте', print: 'Отпечатки на фотобумаге', magnet: 'Любимый кадр на холодильник', canvas: 'Один кадр на стену' };
    const order = ['book', 'card', 'calendar', 'print', 'magnet', 'canvas'];
    const items = cat ? order.map((id) => prodOf(id)).filter(Boolean).map((p) => `<button class="mk-i" data-pr="${p.id}"><span class="pic">${artOf(p.kind)}</span><b>${esc(p.name.replace(' на 2027', ''))}</b><small>${esc(WHAT[p.kind] || p.short)}</small><em>от ${money(fromPrice(p))}</em></button>`).join('') : '';
    return {
      html: `<section class="mk-hero"><img src="/t2/brand/cat-point.png" alt="Котик Пак"><div><h1>Соберём вместе</h1><p>Выберите, что сделать. Раскладку и оформление подскажу — останется поправить.</p></div></section>
        ${cont}
        <p class="sec-t">Что собираем</p><div class="mk-grid">${items || '<p class="muted">Загружаю каталог…</p>'}</div>
        <p class="sec-t">Стиль от Пака</p><p class="muted mk-note">Выберите настроение — соберу фотокнигу в этом стиле из ваших фото.</p>
        <div class="mk-styles" role="list">${STYLES.map(([id, name, desc, o]) => `<button class="mk-st" role="listitem" data-st="${id}"><span class="mk-st-pv">${stylePv(o, 1)}${stylePv(o, 3, true)}</span><b>${name}</b><small>${desc}</small></button>`).join('')}</div>
        <p class="sec-t">Ещё</p>
        <button class="card-flat mk-row" data-goto="feed">${ICON.photos}<span><b>Мои фото</b><small>${S.pool.length ? S.pool.length + ' фото в приложении · ' : ''}напечатать без макета</small></span></button>
        <button class="card-flat mk-row" data-goto="social">${ICON.people}<span><b>Идеи других покупателей</b><small>Возьмите готовое оформление — фото будут ваши</small></span></button>`,
      bind(scr) {
        scr.querySelectorAll('[data-pr]').forEach((b) => { b.onclick = () => openProduct(b.dataset.pr); });
        scr.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => go(b.dataset.goto); });
        scr.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => {
          const same = S.draft && S.draft.product === 'book';
          if (!same) openProduct('book', 'classic');
          S.draft.style = b.dataset.st; S.draft.skel = []; S.draft.pm = []; S.draft.layoutKey = ''; saveDraft();
          toast('Стиль «' + STYLES.find((x) => x[0] === b.dataset.st)[1] + '» выбран'); go(S.draft.photos.length ? 'layout' : 'photos');
        }; });
        const c = $('#cont'); if (c) c.onclick = () => go(hasLayout(S.draft) ? 'layout' : 'photos');
      },
    };
  };
  VIEWS.home = () => {
    const cat = S.catalog, d = S.draft, n = d ? d.photos.length : 0;
    const cont = d && n ? `<button class="card cont" id="cont"><b>Продолжить: ${esc(prodOf(d.product).name)}</b><span>${n} ${plural(n, 'фото', 'фото', 'фото')} · черновик сохранён</span><i aria-hidden="true">${ICON.back}</i></button>` : '';
    const ob = S.outbox ? `<div class="warnbox"><span>Заказ ждёт сети и уйдёт сам</span><button class="btn btn-sm" id="retry">Отправить сейчас</button></div>` : '';
    const skel = '<div class="pcard sk"><span class="pic"></span><b></b><small></small></div>'.repeat(4);
    const cards = cat ? cat.products.map((p) => `<button class="pcard" data-pr="${p.id}"><span class="pic">${artOf(p.kind)}</span><b>${esc(p.name)}</b><small>${esc(p.short)}</small><em>от ${money(fromPrice(p))}</em></button>`).join('') : skel;
    return {
      html: `<section class="hello"><h1>Фото — в печать за пару касаний</h1><p>Выберите снимки из галереи. Подскажем, что из них получится.</p></section>
        <label class="btn btn-primary btn-xl cta" for="file" id="cta">${ICON.photos.replace('<svg', '<svg width="22" height="22"')} Выбрать фото</label>
        ${ob}${orderPanel()}${cont}${recsHtml()}
        <p class="sec-t">Для чего?</p><div class="occ" role="list">${OCCASIONS.map(([t, pid, vid], i) => `<button class="occ-i" role="listitem" data-oc="${i}">${esc(t)}</button>`).join('')}</div>
        <p class="sec-t">Все продукты</p><div class="pgrid">${cards}</div>
        ${cat ? '' : '<p class="muted" style="text-align:center">Загружаю каталог…</p>'}
        <div class="trust"><div>${ICON.ok} Бесплатная перепечатка, если нашли брак</div><div>${ICON.ok} Заказ без списания денег — платите при получении</div><div>${ICON.ok} Черновик сохраняется сам, даже без сети</div></div>`,
      bind(scr) {
        scr.querySelectorAll('[data-pr]').forEach((b) => { b.onclick = () => openProduct(b.dataset.pr); });
        scr.querySelectorAll('[data-oc]').forEach((b) => { const o = OCCASIONS[+b.dataset.oc]; b.onclick = () => openProduct(o[1], o[2]); });
        const c = $('#cont'); if (c) c.onclick = () => go('photos');
        const os = $('#ostat'); if (os) os.onclick = () => openOrder(os.dataset.o);
        const r = $('#retry'); if (r) r.onclick = flushOutbox;
        scr.querySelectorAll('[data-rec]').forEach((b) => { b.onclick = () => runRec(recs()[+b.dataset.rec].act); });
        $('#file').accept = 'image/jpeg,image/png';
      },
    };
  };
  /* статус заказа — сразу на главной: от оформления до выдачи */
  function orderPanel() {
    const o = S.orders.find((x) => ribIndex(x) < 5); if (!o) return '';
    const idx = ribIndex(o), defect = o.stage_status === 'defect';
    return `<button class="card ostat" id="ostat" data-o="${o.id}" aria-label="Статус заказа ${esc(o.number)}. Открыть">
      <span class="ostat-h"><b>Заказ ${esc(o.number)}</b>${stageChip(o)}</span>
      <span class="ostat-steps" aria-hidden="true">${RIB.map(([id, short], i) => `<span class="${i < idx ? 'on' : i === idx ? 'cur' : ''}"><i></i><em>${id === 'moderation' ? 'Проверка' : id === 'done' ? 'Выдан' : short}</em></span>`).join('')}</span>
      <span class="ostat-t">${esc(defect ? 'На этапе нашли брак — переделываем бесплатно.' : NOW[o.stage] || '')}</span></button>`;
  }
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

  function optsHtml(prod, d) {
    return prod.options.map((o) => o.kind === 'number'
      ? `<div class="allqty"><span>${esc(o.name)}</span><span class="stepper"><button data-pg="-${o.step}" aria-label="Меньше">−</button><output>${d.options[o.id]}</output><button data-pg="${o.step}" aria-label="Больше">+</button></span></div>`
      : `<div class="field"><label>${esc(o.name)}</label><div class="chips-row wrap" role="group" aria-label="${esc(o.name)}">${o.values.map((x) => `<button class="pchip" data-op="${o.id}:${x.id}" aria-pressed="${optVal(o, d).id === x.id}"><b>${esc(x.name)}</b><span>${x.price ? '+' + money(x.price) : 'в цене'}</span></button>`).join('')}</div></div>`).join('');
  }
  function bindOpts(root, prod, d, upd) {
    root.querySelectorAll('[data-op]').forEach((b) => { b.onclick = () => { const [k, val] = b.dataset.op.split(':'); d.options[k] = val; upd(); }; });
    root.querySelectorAll('[data-pg]').forEach((b) => { b.onclick = () => { const o = prod.options.find((x) => x.kind === 'number'); d.options[o.id] = Math.max(o.min, Math.min(o.max, d.options[o.id] + Number(b.dataset.pg))); upd(); }; });
  }
  const optsLine = (prod, d) => prod.options.map((o) => o.kind === 'number' ? d.options[o.id] + ' стр.' : optVal(o, d).name.toLowerCase()).join(' · ');
  /* параметры книги можно менять и из конструктора: формат, страницы, бумага, толщина, покрытие, название на обложке */
  function openBookSettings() {
    const old = $('#sheet'), keepTop = old && old.querySelector('.sheet-body') ? old.querySelector('.sheet-body').scrollTop : 0; if (old) old.remove();
    const d = S.draft, prod = prodOf(d.product), P = S.price || localPrice(d);
    const vars = prod.variants.map((x) => `<button class="pchip" data-v="${x.id}" aria-pressed="${x.id === d.variant}"><b>${esc(x.name)}</b><span>${money(x.base || x.price)}</span></button>`).join('');
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet' + (old ? ' quiet' : '');
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body" role="dialog" aria-label="Параметры">
      <b>Параметры: ${esc(prod.name.toLowerCase())}</b>
      <div class="field"><label>Формат</label><div class="chips-row wrap" role="group" aria-label="Формат">${vars}</div></div>${optsHtml(prod, d)}
      ${prod.kind === 'book' ? `<div class="field"><label for="bkt">Название на обложке</label><input class="input" id="bkt" maxlength="40" value="${esc(d.title || '')}" placeholder="Например: Наше лето"></div>` : ''}
      <div class="totals"><div class="row"><span>Цена сейчас</span><b class="num">${money(P.goods)}</b></div></div>
      <button class="btn btn-accent btn-lg" data-x>Готово</button></div>`;
    $('.app').appendChild(el); el.querySelector('.sheet-body').scrollTop = keepTop;
    const upd = async () => { recrop(); saveDraft(); await refreshPrice(); if ($('#sheet') === el) openBookSettings(); };
    el.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { d.variant = b.dataset.v; upd(); }; });
    bindOpts(el, prod, d, upd);
    const bt = $('#bkt'); if (bt) bt.oninput = () => { d.title = bt.value; LS.set('pp_draft', d); syncSoon(); };
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => { el.remove(); saveDraft(); rerender(); }; });
  }

  VIEWS.product = () => {
    const d = S.draft, prod = prodOf(d.product), v = varOf(prod, d.variant), P = S.price || localPrice(d);
    const vars = prod.variants.map((x) => `<button class="pchip" data-v="${x.id}" aria-pressed="${x.id === d.variant}"><b>${esc(x.name)}</b><span>${money(x.tiers ? x.tiers[0][1] : (x.base || x.price))}</span></button>`).join('');
    const opts = optsHtml(prod, d);
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
        bindOpts(scr, prod, d, upd);
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
        <button class="btn btn-lg" id="demo">Тестовая галерея · 26 снимков</button></div>
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
      html: `${rejectsHtml()}${inboxHtml()}<div class="ai-note">${PAK}<div class="ai-body">${bad ? `Нашёл <b>${bad}</b> ${plural(bad, 'слабый кадр', 'слабых кадра', 'слабых кадров')} (размытые, тёмные, дубли). Можно убрать одним касанием.` : `<b>${n}</b> ${plural(n, 'кадр', 'кадра', 'кадров')} — всё выглядит хорошо.`}
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
  const hasLayout = (d) => { const k = prodOf(d.product).kind; return k === 'book' || k === 'calendar' || k === 'card'; };
  const pagesOf = (d) => { const k = prodOf(d.product).kind; return k === 'calendar' ? 12 : k === 'card' ? 1 : Number((d.options || {}).pages || 20); };
  const layoutKey = (d) => d.photos.map((p) => p.id).join(',') + '|' + pagesOf(d);
  /* Правило: порядок съёмки сохраняется; фото делятся по страницам поровну (не больше 4 на странице),
     лишние страницы остаются пустыми — об этом скажет проверка. Календарь: по одному фото на месяц, 13-е — обложка. */
  function buildLayout(d) {
    const ids = d.photos.map((p) => p.id), P = pagesOf(d), N = ids.length;
    if (prodOf(d.product).kind === 'card') return [ids.slice(0, 4)];           // открытка: одна сторона, до четырёх фото
    if (prodOf(d.product).kind === 'calendar') {
      const pages = Array.from({ length: 12 }, (_, i) => ids[i] ? [ids[i]] : []);
      if (ids[12]) pages.push([ids[12]]);
      return pages;
    }
    const base = Math.min(4, Math.floor(N / P)), extra = Math.min(N - base * P, P), pages = [];
    let k = 0;
    if (d.skel && d.skel.length && N >= P) {            // шаблон из «Идей»: число фото на странице берём из его каркаса
      for (let i = 0; i < P; i++) { const c = Math.max(1, Math.min(d.skel[i % d.skel.length].n || 1, N - k - (P - i - 1))); pages.push(ids.slice(k, k + c)); k += c; }
      for (let i = 0; k < N && i < P * 4; i++) { const pg = pages[i % P]; if (pg.length < 4) pg.push(ids[k++]); }
      return pages;
    }
    if (N >= P) for (let i = 0; i < P; i++) { const c = Math.min(4, base + (i < extra ? 1 : 0)); pages.push(ids.slice(k, k + c)); k += c; }
    else for (let i = 0; i < P; i++) pages.push(i < N ? [ids[i]] : []);
    return pages;
  }
  function ensureLayout(force) {
    const d = S.draft;
    if (force || !d.layout || d.layoutKey !== layoutKey(d)) {
      d.layout = buildLayout(d); d.layoutKey = layoutKey(d);
      if (d.style && !(d.skel && d.skel.length) && (force || !d.pm || !d.pm.length)) { d.pm = []; applyStyle(d, d.style); }
      if (d.skel && d.skel.length && (force || !d.pm || !d.pm.length)) d.pm = d.layout.map((pg, i) => { const m = d.skel[i % d.skel.length]; return { t: m.t || 'a', bg: m.bg || '#FFFFFF', tx: '', tp: 'b', z: {} }; });
      saveDraft();
    }
  }
  /* ---------- конструктор страницы: шаблон, фото, подпись, фон ---------- */
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const TPL = {
    1: [['a', 'Во всю страницу'], ['b', 'С полями'], ['c', 'Карточка'], ['d', 'Панорама']], 2: [['a', 'Рядом'], ['b', 'Друг над другом'], ['c', 'Без полей'], ['d', 'Большое и малое']],
    3: [['a', 'Крупное слева'], ['b', 'Крупное сверху'], ['c', 'Три в ряд'], ['d', 'Крупное справа']], 4: [['a', 'Сетка'], ['b', 'Крупное сверху'], ['c', 'Крупное слева'], ['d', 'Лента']],
  };
  const BGS = [['#FFFFFF', 'Белый'], ['#F6F1E7', 'Кремовый'], ['#EDEDF0', 'Серый'], ['#141414', 'Чёрный'], ['#FFD400', 'Жёлтый'], ['#F7D9DD', 'Розовый'], ['#DCE9F5', 'Голубой'], ['#DDEBDD', 'Зелёный']];
  const darkBg = (c) => { const n = parseInt(String(c || '#FFFFFF').slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 140; };
  /* оформление страницы хранится рядом с раскладкой: d.pm[i] = { t: шаблон, bg: фон, tx: подпись, tp: где подпись, z: кадрирование фото } */
  function pmOf(d, i) {
    if (!Array.isArray(d.pm)) d.pm = [];
    while (d.pm.length < d.layout.length) d.pm.push(null);
    d.pm.length = d.layout.length;
    return d.pm[i] || (d.pm[i] = { t: 'a', bg: '#FFFFFF', tx: '', tp: 'b', z: {} });
  }
  const tplOf = (m, n) => (TPL[n] || []).some((x) => x[0] === m.t) ? m.t : 'a';
  function pv(d, i, o) {
    o = o || {};
    const pg = d.layout[i] || [], m = pmOf(d, i), n = Math.min(pg.length, 4);
    const slots = pg.slice(0, 4).map((id) => {
      const z = (m.z || {})[id] || {}, x = z.x == null ? 50 : z.x, y = z.y == null ? 50 : z.y, sc = z.s || 1;
      const img = S.thumbs[id] ? `<img src="${S.thumbs[id]}" alt="" draggable="false" style="object-position:${x}% ${y}%;transform:scale(${sc});transform-origin:${x}% ${y}%">` : '';
      return o.edit ? `<button class="sl${o.sel === id ? ' sel' : ''}" data-sl="${id}" aria-label="Фото на странице" aria-pressed="${o.sel === id}">${img}</button>` : `<i class="sl">${img}</i>`;
    }).join('');
    return `<span class="pv n${n} t${n}${tplOf(m, n)}${m.tx ? ' tx-' + (m.tp === 't' ? 't' : 'b') : ''}${darkBg(m.bg) ? ' dark' : ''}" style="background:${m.bg || '#FFFFFF'}">${slots || '<em>пусто</em>'}${m.tx ? `<span class="cap">${esc(m.tx)}</span>` : ''}</span>`;
  }
  VIEWS.layout = () => {
    const d = S.draft; ensureLayout();
    const lay = d.layout, prod = prodOf(d.product), cal = prod.kind === 'calendar', N = d.photos.length, P = pagesOf(d);
    const empty = lay.slice(0, cal ? 12 : P).filter((pg) => !pg.length).length;
    const card = prod.kind === 'card', v = varOf(prod, d.variant), PR = S.price || localPrice(d);
    const label = (i) => card ? 'Открытка' : cal ? (i < 12 ? MONTHS[i] : 'Обложка') : String(i + 1);
    const page = (pg, i) => `<button class="pg ${pg.length ? '' : 'empty'}${card ? ' solo' : ''}" data-pg="${i}" aria-label="${card ? 'Открытка' : cal ? label(i) : 'Страница ' + (i + 1)}, фото: ${pg.length}. Открыть конструктор">
      ${pv(d, i)}<small>${label(i)}</small></button>`;
    const first = d.photos[0] && S.thumbs[d.photos[0].id];
    const cover = prod.kind === 'book' ? `<button class="pg cover" id="cov" aria-label="Обложка. Изменить название"><span class="pv n1 t1a"><i class="sl">${first ? `<img src="${first}" alt="">` : ''}</i><span class="cov-t">${esc(d.title || 'Название')}</span></span><small>Обложка</small></button>` : '';
    return {
      html: `<button class="card-flat bk-sum" id="bkset" aria-label="Параметры. Изменить"><span><b>${esc(prod.name.replace(' на 2027', ''))} ${esc(v.name)}</b><small>${esc(optsLine(prod, d))}</small></span><em>${money(PR.goods)}</em><i>Изменить</i></button>
        <div class="ai-note">${PAK}<div class="ai-body">${card ? `Собрал открытку из <b>${Math.min(N, 4)}</b> ${plural(Math.min(N, 4), 'фото', 'фото', 'фото')}. Нажмите на неё — выберите шаблон, фон и подпись.` : `Разложил <b>${N}</b> ${plural(N, 'фото', 'фото', 'фото')} по ${cal ? 'месяцам' : P + ' ' + plural(P, 'странице', 'страницам', 'страницам')} в порядке съёмки. ${empty ? `Пустых ${cal ? 'месяцев' : 'страниц'}: <b>${empty}</b>.` : 'Пустых мест нет.'} Нажмите на страницу — откроется её конструктор.`}</div></div>
        ${card ? '' : `<p class="sec-t">Стиль ${cal ? 'календаря' : 'книги'}</p><div class="mk-styles sm" role="list">${STYLES.map(([id, name, , o]) => `<button class="mk-st" role="listitem" data-st="${id}" aria-pressed="${d.style === id}"><span class="mk-st-pv">${stylePv(o, 1)}${stylePv(o, 3, true)}</span><b>${name}</b></button>`).join('')}</div>`}
        ${!cal && !card && N < P ? `<div class="warnbox"><span>Фото меньше, чем страниц. Можно уменьшить книгу${P > prod.options[0].min ? '' : ' (меньше 20 страниц нельзя)'}.</span>${P > prod.options[0].min ? `<button class="btn btn-sm" id="fit">${Math.max(prod.options[0].min, P - 2)} стр.</button>` : ''}</div>` : ''}
        <p class="sec-t">${card ? 'Лицевая сторона' : 'Страницы'}</p>
        <div class="pages${card ? ' one' : ''}">${cover}${lay.map(page).join('')}</div>
        ${card ? '' : `<section class="card aiedit" aria-label="Правка альбома с помощью ИИ"><div class="ai-head">${PAK}<b>Попросить Пака</b></div>
          <div class="chips-row" role="list">${AI_HINTS.map((t, i) => `<button class="pchip" role="listitem" data-hint="${i}">${esc(t)}</button>`).join('')}</div>
          <div class="field"><label for="aiq">Напишите, что изменить</label><textarea class="textarea" id="aiq" rows="2" maxlength="300" placeholder="Например: убери размытые и поставь страницу 5 в начало"></textarea></div>
          ${S.aiMsg ? `<p class="ai-say" role="status">${esc(S.aiMsg)}</p>` : ''}
          <div class="row2"><button class="btn btn-accent" id="aigo">Применить</button>${d.layoutPrev ? '<button class="btn" id="aiundo">Отменить</button>' : ''}</div></section>`}
        <div class="row2"><button class="btn" id="re">Собрать заново</button><button class="btn" id="shtpl">Поделиться шаблоном</button></div>`,
      bar: `<button class="btn btn-primary btn-xl" id="next">Дальше · проверка</button><div class="sub">Макет можно не править: мы уже всё разложили</div>`,
      bind(scr) {
        scr.querySelectorAll('[data-pg]').forEach((b) => { b.onclick = () => { S.pgSheet = +b.dataset.pg; S.ed = { tab: 'tpl', sel: null }; renderPgSheet(); }; });
        scr.querySelectorAll('[data-hint]').forEach((b) => { b.onclick = () => { $('#aiq').value = AI_HINTS[+b.dataset.hint]; $('#aiq').focus(); }; });
        const ag = $('#aigo'); if (ag) ag.onclick = aiEdit;
        $('#bkset').onclick = openBookSettings; const cv = $('#cov'); if (cv) cv.onclick = () => { openBookSettings(); const t = $('#bkt'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } };
        scr.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { applyStyle(d, b.dataset.st); saveDraft(); haptic(true); toast('Стиль «' + STYLES.find((x) => x[0] === b.dataset.st)[1] + '» применён ко всем страницам'); rerender(); }; });
        const ud = $('#aiundo'); if (ud) ud.onclick = () => { d.layout = d.layoutPrev; d.layoutPrev = null; S.aiMsg = 'Вернул прежнюю раскладку'; saveDraft(); rerender(); };
        $('#re').onclick = () => { d.layoutPrev = null; d.pm = []; S.aiMsg = ''; ensureLayout(true); toast('Собрал заново'); rerender(); };
        $('#shtpl').onclick = () => shareTemplate();
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
  function renderPgSheet(quiet) {
    const old = $('#sheet'); if (old) old.remove();
    const d = S.draft, i = S.pgSheet; if (i == null || !d.layout[i]) return;
    const E = S.ed || (S.ed = { tab: 'tpl', sel: null });
    const lay = d.layout, pg = lay[i], m = pmOf(d, i), cal = prodOf(d.product).kind === 'calendar', n = Math.min(pg.length, 4);
    if (E.sel && !pg.includes(E.sel)) E.sel = null;
    const where = {}; lay.forEach((x, k) => x.forEach((id) => { where[id] = k; }));
    const name = prodOf(d.product).kind === 'card' ? 'Открытка' : cal ? (i < 12 ? MONTHS[i] : 'Обложка') : 'Страница ' + (i + 1) + ' из ' + lay.length, curT = tplOf(m, n), si = pg.indexOf(E.sel);
    const zs = E.sel ? ((m.z || {})[E.sel] || {}).s || 1 : 1;
    const tools = E.sel ? `<div class="ed-sel"><button class="btn btn-sm" data-a="rm">Убрать</button><button class="btn btn-sm" data-a="sl" ${si <= 0 ? 'disabled' : ''} aria-label="Поставить левее">← Левее</button><button class="btn btn-sm" data-a="sr" ${si >= pg.length - 1 ? 'disabled' : ''} aria-label="Поставить правее">Правее →</button></div>
        <label class="ed-zoom">Крупнее<input type="range" id="edz" min="1" max="2.5" step="0.05" value="${zs}" aria-label="Увеличить фото"></label>` : '';
    const panel = {
      tpl: () => n ? `<div class="ed-tpls">${TPL[n].map(([k, nm]) => `<button class="ed-tpl" data-t="${k}" aria-pressed="${curT === k}"><span class="pv mini n${n} t${n}${k}">${'<i class="sl"></i>'.repeat(n)}</span><small>${nm}</small></button>`).join('')}</div>
          <button class="btn btn-sm btn-ghost" data-a="tall">Так же на всех страницах, где ${n} фото</button>`
        : '<p class="ed-tip">На странице пока нет фото. Откройте «Фото» и добавьте до четырёх.</p>',
      photo: () => `${tools}<p class="ed-tip">${E.sel ? 'Фото выбрано: двигайте его пальцем в рамке. Нажмите другое фото ниже — оно встанет на это место' : n >= 4 ? 'На странице уже 4 фото. Нажмите на фото на странице, чтобы заменить его' : 'Нажмите на фото ниже — оно добавится на страницу'}</p>
          <div class="ed-photos">${d.photos.map((ph) => `<button class="ed-ph${where[ph.id] === i ? ' here' : ''}${E.sel === ph.id ? ' cur' : ''}" data-ph="${ph.id}" aria-label="Фото ${esc(ph.name || '')}">${S.thumbs[ph.id] ? `<img src="${S.thumbs[ph.id]}" alt="">` : ''}${where[ph.id] == null ? '<small class="free">не в книге</small>' : where[ph.id] === i ? '<small>здесь</small>' : `<small>${cal ? 'мес.' : 'стр.'} ${where[ph.id] + 1}</small>`}</button>`).join('')}</div>`,
      text: () => `<div class="field"><label for="edtx">Подпись на странице</label><input class="input" id="edtx" maxlength="60" value="${esc(m.tx || '')}" placeholder="Например: Лето 2026, Нарочь"></div>
          <div class="seg" role="group" aria-label="Где подпись"><button data-tp="b" aria-pressed="${m.tp !== 't'}">Снизу</button><button data-tp="t" aria-pressed="${m.tp === 't'}">Сверху</button></div>`,
      bg: () => `<div class="ed-bgs">${BGS.map(([c, nm]) => `<button class="ed-bg" data-bg="${c}" style="background:${c}" aria-label="${nm}" title="${nm}" aria-pressed="${(m.bg || '#FFFFFF') === c}"></button>`).join('')}</div>
          <button class="btn btn-sm btn-ghost" data-a="ball">Этот фон — на все страницы</button>`,
      page: () => `<div class="row2"><button class="btn btn-sm" data-a="up" ${i === 0 ? 'disabled' : ''}>← Раньше</button><button class="btn btn-sm" data-a="dn" ${i === lay.length - 1 ? 'disabled' : ''}>Позже →</button></div>
          <button class="btn btn-sm" data-a="clr" ${n ? '' : 'disabled'}>Убрать все фото со страницы</button><p class="ed-tip">Страница меняется местами с соседней. Убранные фото остаются на вкладке «Фото».</p>`,
    };
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet' + (quiet ? ' quiet' : '');      // перерисовка внутри редактора — без повторной анимации листа
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body ed-body" role="dialog" aria-label="Конструктор: ${name}">
      <div class="ed-top"><button class="ed-nav" data-a="prev" aria-label="Предыдущая страница" ${i === 0 ? 'disabled' : ''}>${ICON.back}</button><b>${name}</b><button class="ed-nav fwd" data-a="next" aria-label="Следующая страница" ${i === lay.length - 1 ? 'disabled' : ''}>${ICON.back}</button><button class="btn btn-sm btn-accent ed-done" data-x>Готово</button></div>
      <div class="ed-stage">${pv(d, i, { edit: true, sel: E.sel })}</div>
      ${E.sel ? '' : `<p class="ed-tip">${n ? 'Нажмите на фото, чтобы подвинуть, увеличить, заменить или убрать его' : 'Пустая страница — добавьте фото на вкладке «Фото»'}</p>`}
      <div class="ed-tabs" role="tablist">${[['tpl', 'Шаблон'], ['photo', 'Фото'], ['text', 'Подпись'], ['bg', 'Фон'], ['page', 'Страница']].map(([k, nm]) => `<button role="tab" data-tab="${k}" aria-pressed="${E.tab === k}">${nm}</button>`).join('')}</div>
      <div class="ed-panel">${panel[E.tab]()}</div></div>`;
    $('.app').appendChild(el);
    const body = el.querySelector('.ed-body'), keep = () => { const t = body.scrollTop; renderPgSheet(true); const b = $('#sheet .ed-body'); if (b) b.scrollTop = t; };
    const save = () => { LS.set('pp_draft', d); syncSoon(); };
    const done = () => { S.pgSheet = null; S.ed = null; el.remove(); saveDraft(); rerender(); };
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = done; });
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { E.tab = b.dataset.tab; keep(); }; });
    el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { m.t = b.dataset.t; save(); keep(); }; });
    el.querySelectorAll('[data-bg]').forEach((b) => { b.onclick = () => { m.bg = b.dataset.bg; save(); keep(); }; });
    el.querySelectorAll('[data-tp]').forEach((b) => { b.onclick = () => { m.tp = b.dataset.tp; save(); keep(); }; });
    const stage = el.querySelector('.ed-stage');
    const tx = $('#edtx'); if (tx) tx.oninput = () => { m.tx = tx.value; stage.innerHTML = pv(d, i, { edit: true, sel: E.sel }); bindSlots(); save(); };
    const zr = $('#edz'); if (zr) zr.oninput = () => { const z = (m.z = m.z || {}), c = z[E.sel] || (z[E.sel] = { x: 50, y: 50, s: 1 }); c.s = +zr.value; paint(E.sel); save(); };
    function paint(id) {
      const im = stage.querySelector(`[data-sl="${id}"] img`), c = (m.z || {})[id]; if (!im || !c) return;
      im.style.objectPosition = im.style.transformOrigin = c.x + '% ' + c.y + '%'; im.style.transform = 'scale(' + (c.s || 1) + ')';
    }
    /* фото: короткое касание — выбрать; выбранное можно двигать пальцем внутри рамки */
    function bindSlots() {
      stage.querySelectorAll('[data-sl]').forEach((b) => {
        const id = b.dataset.sl; let st = null, moved = false;
        b.onpointerdown = (e) => { st = { x: e.clientX, y: e.clientY, r: b.getBoundingClientRect(), c: Object.assign({ x: 50, y: 50, s: 1 }, (m.z || {})[id]) }; moved = false; if (E.sel === id) { try { b.setPointerCapture(e.pointerId); } catch (er) { /* не страшно */ } } };
        b.onpointermove = (e) => {
          if (!st || E.sel !== id) return;
          const dx = e.clientX - st.x, dy = e.clientY - st.y; if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
          moved = true; const z = (m.z = m.z || {}), c = z[id] || (z[id] = { x: 50, y: 50, s: 1 }), k = 130 / (st.c.s || 1);
          c.x = Math.round(Math.min(100, Math.max(0, st.c.x - dx / st.r.width * k))); c.y = Math.round(Math.min(100, Math.max(0, st.c.y - dy / st.r.height * k))); c.s = st.c.s || 1; paint(id);
        };
        b.onpointerup = b.onpointercancel = () => { if (moved) save(); st = null; };
        b.onclick = () => { if (moved) { moved = false; return; } E.sel = E.sel === id ? null : id; if (E.sel) E.tab = 'photo'; keep(); };
      });
    }
    bindSlots();
    el.querySelectorAll('[data-ph]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.ph, from = where[id];
        if (from === i) E.sel = E.sel === id ? null : id;
        else if (E.sel) { const k = pg.indexOf(E.sel), was = E.sel; if (from != null) lay[from][lay[from].indexOf(id)] = was; pg[k] = id; E.sel = id; haptic(); }
        else { if (pg.length >= 4) return toast('На странице уже 4 фото — сначала выберите, какое заменить'); if (from != null) lay[from].splice(lay[from].indexOf(id), 1); pg.push(id); E.sel = id; haptic(); }
        save(); keep();
      };
    });
    const act = {
      prev: () => { S.pgSheet = i - 1; E.sel = null; }, next: () => { S.pgSheet = i + 1; E.sel = null; },
      up: () => { [lay[i], lay[i - 1]] = [lay[i - 1], lay[i]]; pmOf(d, i - 1); [d.pm[i], d.pm[i - 1]] = [d.pm[i - 1], d.pm[i]]; S.pgSheet = i - 1; },
      dn: () => { [lay[i], lay[i + 1]] = [lay[i + 1], lay[i]]; pmOf(d, i + 1); [d.pm[i], d.pm[i + 1]] = [d.pm[i + 1], d.pm[i]]; S.pgSheet = i + 1; },
      clr: () => { pg.length = 0; E.sel = null; toast('Страница пустая. Фото остались на вкладке «Фото»'); },
      sl: () => { [pg[si], pg[si - 1]] = [pg[si - 1], pg[si]]; }, sr: () => { [pg[si], pg[si + 1]] = [pg[si + 1], pg[si]]; },
      rm: () => { pg.splice(si, 1); E.sel = null; E.tab = pg.length ? 'tpl' : 'photo'; toast('Фото убрано со страницы. Оно осталось на вкладке «Фото»'); },
      tall: () => { let c = 0; lay.forEach((x, k) => { if (Math.min(x.length, 4) === n) { pmOf(d, k).t = m.t; c++; } }); toast('Шаблон применён к страницам: ' + c); },
      ball: () => { lay.forEach((x, k) => { pmOf(d, k).bg = m.bg; }); toast('Фон применён ко всем страницам'); },
    };
    el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { act[b.dataset.a](); save(); keep(); }; });
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
      fr.onpointerup = fr.onpointercancel = () => { if (!st) return; st = null; const k = cropFor(p, v.ratio, d.fit); p.crop = { x: k.x, y: k.y, w: k.w, h: k.h }; c.x = k.x; c.y = k.y; saveDraft(); if (!el.querySelector('[data-a="auto"]')) renderSheet(); };
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
    else {
      const LV = { error: 0, warn: 1, info: 2 }, cls = (l) => (l === 'error' ? 'bad' : l === 'warn' ? 'warn' : 'info');
      const WHY = { blur: 'кадр размыт', dark: 'слишком тёмный', low_res: 'мало пикселей для этого формата — на бумаге будет заметно', soft: 'напечатается чуть мягче обычного — это допустимо' };
      const general = I.filter((x) => !x.photo), crops = I.filter((x) => x.code === 'crop'), per = new Map();
      I.filter((x) => x.photo && x.code !== 'crop').forEach((x) => { const g = per.get(x.photo) || { why: [], level: 'info' }; g.why.push(WHY[x.code] || x.text); if (LV[x.level] < LV[g.level]) g.level = x.level; per.set(x.photo, g); });
      d.photos.filter((ph) => ph.dup).forEach((ph) => { const g = per.get(ph.id) || { why: [], level: 'warn' }; g.why.push('повтор соседнего кадра'); g.level = LV[g.level] < 1 ? g.level : 'warn'; per.set(ph.id, g); });
      const gen = general.sort((x, y) => LV[x.level] - LV[y.level]).map((x) => `<div class="issue ${cls(x.level)}"><div class="ic">${x.level === 'info' ? ICON.info : ICON.warn}</div><div><p>${esc(x.text)}</p>${x.code === 'empty_pages' ? '<div class="ia"><button class="btn btn-sm" data-goto="photos">Добавить фото</button><button class="btn btn-sm" data-goto="layout">В конструктор</button></div>' : ''}</div></div>`).join('');
      const cards = [...per.entries()].sort((x, y) => LV[x[1].level] - LV[y[1].level]).map(([id, g]) => {
        const ph = d.photos.find((x) => x.id === id); if (!ph) return '';
        return `<div class="issue photo ${cls(g.level)}">${S.thumbs[id] ? `<img class="ith" src="${S.thumbs[id]}" alt="">` : ''}<div><b>${esc(String(ph.name || 'Фото').replace(/\.(jpe?g|png)$/i, ''))}</b><p>${esc(g.why.join(' · '))}</p>
          <div class="ia"><button class="btn btn-sm" data-rep="${id}">Заменить</button><button class="btn btn-sm" data-del="${id}">Убрать</button></div></div></div>`;
      }).join('');
      const cut = crops.length ? Math.max(...crops.map((x) => +(String(x.text).match(/(\d+) %/) || [0, 0])[1])) : 0;
      const crop = !crops.length ? '' : hasLayout(d)
        ? `<div class="issue info"><div class="ic">${ICON.info}</div><div><p>Фото на странице обрезается под её форму — так и задумано. Подвинуть или увеличить кадр можно в конструкторе.</p><div class="ia"><button class="btn btn-sm" data-goto="layout">В конструктор</button></div></div></div>`
        : `<div class="issue info"><div class="ic">${ICON.info}</div><div><p>У ${crops.length} фото по краям обрежется до ${cut} %. С белыми полями фото войдёт целиком.</p><div class="ia"><button class="btn btn-sm" id="fitall">Включить белые поля</button></div></div></div>`;
      S.issueCount = general.length + per.size;
      body = '<div class="issues">' + gen + cards + crop + '</div>';
    }
    const errs = Array.isArray(I) && I.some((x) => x.level === 'error'), warns = Array.isArray(I) && I.some((x) => x.level === 'warn');
    const nbad = d.photos.filter((p) => p.blur || p.dark || p.dup).length, hasCrop = Array.isArray(I) && I.some((x) => x.code === 'crop') && ['print', 'magnet'].includes(d.product);
    const fixable = Array.isArray(I) && I.length && (nbad || hasCrop);
    const nIss = Array.isArray(I) && I.length ? S.issueCount : 0;
    const summary = !Array.isArray(I) || !I.length ? '' : nIss ? `<p class="muted" style="font-size:15px">Стоит посмотреть: ${nIss} ${plural(nIss, 'замечание', 'замечания', 'замечаний')}. Печать возможна и так.</p>` : '<p class="muted" style="font-size:15px">Замечаний нет — только подсказка.</p>';
    return {
      html: `<p class="sec-t">Перед заказом</p>${summary}${fixable ? `<button class="btn btn-accent btn-lg" id="fixall">${ICON.spark} Исправить автоматически${nbad ? ' · убрать ' + nbad + ' ' + plural(nbad, 'слабый', 'слабых', 'слабых') : ''}${hasCrop ? ' · белые поля' : ''}</button>` : ''}${body}`,
      bar: `<button class="btn btn-primary btn-xl" id="next" ${errs ? 'disabled' : ''}>${warns || I === 'offline' ? 'Всё равно продолжить' : 'Дальше · корзина'}</button>${errs ? '<div class="sub">Исправьте ошибки, чтобы продолжить</div>' : warns ? '<div class="sub">Или вернитесь и замените фото</div>' : ''}`,
      bind(scr) {
        scr.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = () => { S.replace = b.dataset.rep; $('#file').click(); }; });
        scr.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { const i = d.photos.findIndex((p) => p.id === b.dataset.del); dropPhotoData(d.photos[i].id); d.photos.splice(i, 1);
          if (hasLayout(d) && d.layout) { d.layout.forEach((pg) => { const k = pg.indexOf(b.dataset.del); if (k >= 0) pg.splice(k, 1); }); d.layoutKey = layoutKey(d); }   // остальная раскладка остаётся как была
          classify(); saveDraft(); await runCheck(); rerender(); }; });
        scr.querySelectorAll('[data-goto]').forEach((b) => { b.onclick = () => go(b.dataset.goto); });
        const fa = $('#fitall'); if (fa) fa.onclick = async () => { d.fit = true; recrop(); saveDraft(); await runCheck(); toast('Белые поля включены'); rerender(); };
        const fx = $('#fixall');
        if (fx) fx.onclick = async () => {
          d.photos.filter((p) => p.blur || p.dark || p.dup).forEach((p) => dropPhotoData(p.id));
          d.photos = d.photos.filter((p) => !(p.blur || p.dark || p.dup));
          if (hasCrop) d.fit = true;
          classify(); recrop(); if (hasLayout(d)) { d.layoutPrev = null; ensureLayout(true); }      // макет пересобираем сразу: на проверку уходит уже новый
          saveDraft(); await runCheck(); toast('Готово: слабые кадры убраны, макет пересобран'); rerender();
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
      S.orders = list; LS.set('pp_orders', S.orders); if (changed && (S.view === 'orders' || S.view === 'home')) rerender2(); } catch (e) { /* показываем сохранённые */ }
  }
  let r2; function rerender2() { clearTimeout(r2); r2 = setTimeout(() => { if (S.view === 'orders' || S.view === 'home') rerender(); }, 0); }
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

  /* ---------- котик Пак: помощник, который разворачивается из шапки ---------- */
  const PAK_TIP = {
    home: 'Привет! Я Пак. Начните с кнопки «Выбрать фото» или загляните в «Конструктор» — соберём книгу, календарь или открытку.',
    make: 'Здесь начинается любая сборка. Выберите продукт или стиль — раскладку сделаю сам.',
    product: 'Выберите формат, бумагу и толщину страниц. Цена внизу меняется сразу.',
    photos: 'Добавьте снимки. Размытые, тёмные и повторы я отмечу сам — уберёте одним касанием.',
    layout: 'Нажмите на страницу — откроется её конструктор: шаблон, фото, подпись, фон. Стиль меняет всю книгу сразу.',
    check: 'Я проверил макет. Слабые кадры могу убрать сам — кнопка «Исправить автоматически».',
    cart: 'Осталось выбрать получение и оставить имя с телефоном. Платить нужно при получении.',
    social: 'Смотрите, что собирают другие. Понравилось — «Собрать такой же»: оформление возьму, фото будут ваши.',
    orders: 'Здесь видно, на каком этапе каждый заказ. Вопрос по заказу можно задать в его карточке.',
    order: 'Статус обновляется сам, когда участок отмечает этап.', done: 'Заказ принят! Статус теперь виден на главной.',
    profile: 'Здесь вход, уведомления и ваши данные.', feed: 'Это фото, которые уже в приложении. Нажмите «Напечатать» — закажем без макета.',
  };
  const PAK_ASK = {
    home: ['Что можно заказать?', 'Сколько стоит фотокнига?', 'Где мой заказ?'], make: ['Что быстрее всего сделать?', 'Сколько стоит открытка?', 'Чем книга отличается от календаря?'],
    product: ['Какую бумагу выбрать?', 'Что такое разворот на 180°?', 'Сколько делают книгу?'], photos: ['Почему фото отмечено размытым?', 'Сколько фото нужно?'],
    layout: ['Как поменять шаблон?', 'Как добавить подпись?', 'Как подвинуть фото в рамке?'], check: ['Что значит «напечатается мягче»?', 'Можно заказать как есть?'],
    cart: ['Как получить заказ?', 'Когда платить?'], social: ['Как взять чужой шаблон?', 'Как поделиться своим?'], orders: ['Где мой заказ?', 'Что если брак?'],
  };
  S.pak = { msgs: [] };
  function openPak(quiet) {
    const old = $('#sheet'); if (old) old.remove();
    const view = S.view, tip = PAK_TIP[view] || PAK_TIP.home, asks = PAK_ASK[view] || PAK_ASK.home, M = S.pak.msgs;
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet' + (quiet ? ' quiet' : '');
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body pak-sheet" role="dialog" aria-label="Помощник Пак">
      <div class="pak-top"><img src="/t2/brand/cat-point.png" alt=""><div class="pak-bub"><b>Пак</b><p>${esc(tip)}</p></div></div>
      ${M.length ? `<div class="pak-log" id="paklog">${M.map((m) => `<div class="pak-m ${m.me ? 'me' : ''}">${esc(m.text)}</div>`).join('')}${S.pak.busy ? '<div class="pak-m dots">Думаю…</div>' : ''}</div>` : ''}
      <div class="chips-row wrap" role="list">${asks.map((q, i) => `<button class="pchip" role="listitem" data-pq="${i}">${esc(q)}</button>`).join('')}</div>
      <form class="pak-form" id="pakf"><input class="input" id="pakq" maxlength="300" placeholder="Спросите Пака" autocomplete="off" aria-label="Вопрос помощнику"><button class="btn btn-accent" id="pakgo" ${S.pak.busy ? 'disabled' : ''}>Спросить</button></form>
      <button class="btn" data-x>Свернуть</button></div>`;
    $('.app').appendChild(el);
    const log = $('#paklog'); if (log) log.scrollTop = log.scrollHeight;
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => el.remove(); });
    const ask = async (q) => {
      q = String(q || '').trim(); if (q.length < 2 || S.pak.busy) return;
      M.push({ me: true, text: q }); S.pak.busy = true; openPak(true);
      let text;
      try { const r = await call('POST', '/ai/cat', { question: q, view }); text = r.text; }
      catch (e) { text = e.offline ? 'Нет сети — отвечу, когда она появится. А пока: ' + tip : 'Не получилось ответить. ' + tip; }
      M.push({ text }); S.pak.busy = false; if (M.length > 30) M.splice(0, M.length - 30);
      if ($('#sheet') && $('#sheet').querySelector('.pak-sheet')) openPak(true);
    };
    el.querySelectorAll('[data-pq]').forEach((b) => { b.onclick = () => ask(asks[+b.dataset.pq]); });
    $('#pakf').onsubmit = (e) => { e.preventDefault(); ask($('#pakq').value); };
  }

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
  const PIN_R = ['4 / 5', '1 / 1', '3 / 4', '5 / 6'];
  const skelPv = (m) => `<span class="pv mini n${m.n} t${m.n}${m.t}${darkBg(m.bg) ? ' dark' : ''}" style="background:${m.bg}">${'<i class="sl"></i>'.repeat(m.n) || '<em></em>'}</span>`;
  function pinCover(t) {
    if (t.cover) return `<img class="art-photo" src="${t.cover}" alt="" loading="lazy">`;
    if (t.img) return `<img class="art-photo" src="/t2/photos/photo-${esc(t.img)}.jpg" alt="" loading="lazy" decoding="async">`;
    if (t.skel && t.skel.length) return `<span class="pin-skel">${t.skel.slice(0, 4).map(skelPv).join('')}</span>`;
    return artOf((prodOf(t.product) || {}).kind || 'print');
  }
  const pinBy = (t) => t.company === false ? esc(t.author || 'Покупатель') : 'picPac';
  function pinCard(t, k) {
    return `<article class="pin"><button class="pin-cover tone${(t.tone || 0) % 6}" data-pin="${t.id}" style="aspect-ratio:${PIN_R[k % 4]}" aria-label="Открыть идею: ${esc(t.title)}">${pinCover(t)}<span class="chip">${esc(t.occasion)}</span></button>
      <div class="pin-b"><b>${esc(t.title)}</b><div class="pin-m"><span class="by">${pinBy(t)}${t.mine ? ' · вы' : ''}</span><span class="pin-acts"><span class="cm" aria-label="Комментариев: ${(t.comments || []).length}">${ICON.chat}<span class="num">${(t.comments || []).length}</span></span><button class="like${t.liked ? ' on' : ''}" data-tl="${t.id}" aria-pressed="${!!t.liked}" aria-label="Нравится">${heart(t.liked)}<span class="num">${t.likes}</span></button></span></div></div></article>`;
  }
  function openPin(t, quiet) {
    const old = $('#sheet'), top = old && quiet && old.querySelector('.sheet-body') ? old.querySelector('.sheet-body').scrollTop : 0; if (old) old.remove();
    const prod = prodOf(t.product) || {}, v = (prod.variants || []).find((x) => x.id === t.variant), D = S.soc.data, C = t.comments || (t.comments = []);
    const meta = [prod.name, v && v.name, t.options && t.options.pages ? t.options.pages + ' стр.' : '', t.per_page > 1 ? 'до ' + t.per_page + ' фото на странице' : ''].filter(Boolean).join(' · ');
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet' + (quiet ? ' quiet' : '');
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body pin-sheet" role="dialog" aria-label="${esc(t.title)}">
      <div class="pin-big tone${(t.tone || 0) % 6}">${pinCover(t)}</div>
      <div class="pin-head"><h3>${esc(t.title)}</h3><button class="like${t.liked ? ' on' : ''}" id="pinlike" aria-pressed="${!!t.liked}" aria-label="Нравится">${heart(t.liked)}<span class="num">${t.likes}</span></button></div>
      <p>${esc(t.desc || '')}</p><small class="muted">${esc(meta)} · ${pinBy(t)}${t.uses ? ' · собрали ' + t.uses + ' ' + plural(t.uses, 'раз', 'раза', 'раз') : ''}</small>
      ${(t.skel || []).length ? `<p class="sec-t">Страницы шаблона</p><div class="pin-pages">${t.skel.slice(0, 8).map(skelPv).join('')}</div>` : ''}
      <button class="btn btn-accent btn-lg" data-use>Собрать такой же из своих фото</button>
      <p class="sec-t">Комментарии · ${C.length}</p>
      <form class="pak-form" id="cmf"><input class="input" id="cmq" maxlength="300" placeholder="Напишите, как получилось у вас" autocomplete="off" aria-label="Комментарий"><button class="btn btn-accent" id="cmgo">Отправить</button></form>
      <p class="err" id="cme" role="alert" hidden></p>
      <div class="cm-list">${C.map((c) => `<div class="cm-i"><span class="avatar sm" aria-hidden="true">${esc((c.name || '?')[0])}</span><div><b>${esc(c.name)}</b>${c.demo ? '<span class="chip">пример</span>' : c.mine ? `<button class="linkbtn" data-cd="${c.id}">убрать</button>` : ''}<p>${esc(c.text)}</p></div></div>`).join('') || '<p class="muted">Пока никто не написал — будьте первым.</p>'}</div>
      <div class="row2"><button class="btn" data-x>Закрыть</button>${(D && D.can_publish && !t.seed) || t.mine ? '<button class="btn" data-del>Убрать из ленты</button>' : ''}</div></div>`;
    $('.app').appendChild(el); el.querySelector('.sheet-body').scrollTop = top;
    const store = () => { LS.set('pp_social', D); };
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => { el.remove(); if (S.view === 'social') rerender(); }; });
    el.querySelector('[data-use]').onclick = () => { el.remove(); useTemplate(t); };
    $('#pinlike').onclick = async () => { if (!S.session) return toast('Войдите, чтобы отмечать'); const r = await socCall('/social/templates/' + t.id + '/like').catch(() => null); if (r) { t.likes = r.likes; t.liked = r.liked; store(); haptic(true); openPin(t, true); } };
    $('#cmf').onsubmit = async (e) => {
      e.preventDefault(); const text = $('#cmq').value.trim(), er = $('#cme');
      if (!S.session) return toast('Войдите, чтобы комментировать');
      if (text.length < 2) { er.hidden = false; er.textContent = 'Напишите пару слов'; return; }
      $('#cmgo').disabled = true;
      try { const r = await call('POST', '/social/templates/' + t.id + '/comment', { text }); C.unshift(r); store(); haptic(true); openPin(t, true); }
      catch (x) { er.hidden = false; er.textContent = x.offline ? 'Нет сети — повторите позже' : x.message; $('#cmgo').disabled = false; }
    };
    el.querySelectorAll('[data-cd]').forEach((b) => { b.onclick = async () => { const r = await socCall('/social/templates/' + t.id + '/uncomment', { id: b.dataset.cd }).catch(() => null); if (r) { C.splice(C.findIndex((c) => c.id === b.dataset.cd), 1); store(); openPin(t, true); } }; });
    const del = el.querySelector('[data-del]');
    if (del) del.onclick = async () => { if (!confirm('Убрать шаблон из ленты?')) return; await socCall('/social/templates/' + t.id + '/delete').catch(() => null); el.remove(); loadSocial(); };
  }
  /* покупатель делится оформлением своего альбома: в шаблон идут число страниц, шаблоны и фоны — фото и подписи остаются у него */
  function shareTemplate() {
    const d = S.draft;
    if (!d || !S.catalog || !hasLayout(d) || !d.photos.length) return toast('Сначала соберите книгу или календарь — поделиться можно их оформлением');
    if (!S.session) return toast('Войдите, чтобы делиться шаблонами');
    ensureLayout();
    const old = $('#sheet'); if (old) old.remove();
    const prod = prodOf(d.product), occ = (S.soc.data && S.soc.data.occasions) || ['Любой повод', 'Свадьба', 'Семья', 'Путешествие', 'Дети', 'Подарок', 'Праздник'];
    const skel = d.layout.map((pg, i) => { const m = pmOf(d, i), n = Math.min(pg.length, 4); return { n, t: tplOf(m, n), bg: m.bg || '#FFFFFF' }; }).filter((m) => m.n).slice(0, 60);
    const first = d.layout.find((pg) => pg.length), cov = first && S.thumbs[first[0]];
    const el = document.createElement('div'); el.id = 'sheet'; el.className = 'sheet';
    el.innerHTML = `<div class="sheet-bg" data-x></div><div class="sheet-body pin-sheet" role="dialog" aria-label="Поделиться шаблоном">
      <b>Поделиться шаблоном</b>
      <p class="ed-tip">В «Идеи» попадёт только оформление: число страниц, шаблоны и фоны. Ваши фото и подписи не публикуются.</p>
      <div class="pin-pages">${skel.slice(0, 8).map(skelPv).join('')}</div>
      <div class="field"><label for="stt">Название</label><input class="input" id="stt" maxlength="60" value="${esc(d.title || '')}" placeholder="Например: Наше лето на Нарочи"></div>
      <div class="field"><label for="std">Для чего подойдёт</label><textarea class="textarea" id="std" rows="2" maxlength="200" placeholder="Например: отпуск, 40–60 фото, много пейзажей"></textarea></div>
      <div class="field"><label for="sto">Повод</label><select class="select" id="sto">${occ.map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>
      ${cov ? `<label class="ed-check"><input type="checkbox" id="stc"><span>Показать обложку — первое фото альбома. <b>Его увидят все.</b></span></label>` : ''}
      <p class="err" id="ste" role="alert" hidden></p>
      <div class="row2"><button class="btn btn-accent" id="stgo">Опубликовать</button><button class="btn" data-x>Отмена</button></div></div>`;
    $('.app').appendChild(el);
    el.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => el.remove(); });
    $('#stgo').onclick = async () => {
      const title = $('#stt').value.trim(), withCover = $('#stc') && $('#stc').checked && cov && cov.startsWith('data:image/jpeg') && cov.length < 140000;
      const body = { title, desc: $('#std').value, product: d.product, variant: d.variant, options: prod.kind === 'book' ? { pages: pagesOf(d) } : {},
        per_page: Math.max(1, ...skel.map((m) => m.n)), occasion: $('#sto').value, skel, cover: withCover ? cov : '' };
      $('#stgo').disabled = true;
      try {
        await call('POST', '/social/templates', body, { headers: { 'Idempotency-Key': 'tpl-' + rid() } });
        el.remove(); haptic(true); wire('Покупатель поделился шаблоном: ' + title); toast('Шаблон опубликован в «Идеях»'); S.soc.tab = 'tpl'; S.soc.occ = 'Все'; await loadSocial(); go('social');
      } catch (e) { const er = $('#ste'); if (er) { er.hidden = false; er.textContent = e.offline ? 'Нет сети — повторите, когда она появится' : e.message; } const g = $('#stgo'); if (g) g.disabled = false; }
    };
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
    return `<div class="card compose"><h3>Шаблон от компании</h3>
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
    if (!D) return { html: `<div class="loading">${PAK}<p>${so.off ? 'Нет сети — лента появится, когда она вернётся' : 'Загружаю ленту…'}</p></div>`, bind() { } };
    const pub = D.can_publish, sm = D.summary;
    const seg = `<div class="seg" role="tablist"><button role="tab" data-sg="tpl" aria-pressed="${so.tab === 'tpl'}">Идеи</button><button role="tab" data-sg="rev" aria-pressed="${so.tab === 'rev'}">Отзывы · ${sm.count}</button></div>`;
    const off = so.off ? '<div class="warnbox"><span>Нет сети — показываю сохранённую ленту</span></div>' : '';
    let body;
    if (so.tab === 'tpl') {
      const occ = ['Все'].concat(D.occasions || []), list = D.templates.filter((t) => so.occ === 'Все' || t.occasion === so.occ);
      body = `${so.compose === 'tpl' ? composeTemplate(D) : `<div class="row2"><button class="btn" id="shareT">+ Поделиться своим</button>${pub ? '<button class="btn" id="newt">+ От компании</button>' : ''}</div>`}
        <div class="occ" role="list">${occ.map((o) => `<button class="occ-i" role="listitem" data-oc2="${esc(o)}" aria-pressed="${so.occ === o}">${esc(o)}</button>`).join('')}</div>
        ${list.length ? `<div class="pins">${list.map(pinCard).join('')}</div>` : '<div class="empty"><p>Для этого повода идей пока нет.</p></div>'}`;
    } else {
      const bars = [5, 4, 3, 2, 1].map((i) => `<div class="dist"><span class="num">${i}</span><i><b style="width:${sm.count ? (sm.dist[i] || 0) / sm.count * 100 : 0}%"></b></i><span class="num">${sm.dist[i] || 0}</span></div>`).join('');
      body = `<div class="card sumcard"><div class="avg"><b class="num">${sm.avg ? String(sm.avg).replace('.', ',') : '—'}</b>${stars(sm.avg, true)}<small>${sm.count} ${plural(sm.count, 'отзыв', 'отзыва', 'отзывов')}</small></div><div class="dists">${bars}</div></div>
        ${so.compose === 'rev' ? composeReview(D) : '<button class="btn btn-primary btn-lg" id="newr">Оставить отзыв</button>'}
        ${D.reviews.map((r) => revCard(r, pub)).join('')}`;
    }
    return {
      html: `<section class="hello"><h1>Идеи</h1><p>Смотрите, что собирают другие, и делайте так же — со своими фото. Понравилось своё оформление — поделитесь им.</p></section>${seg}${off}${body}
        <p class="src">Комментарии и отзывы-примеры помечены, счётчики у идей picPac — демонстрационные. Ссылки и контакты не публикуются.</p>`,
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
    scr.querySelectorAll('[data-pin]').forEach((b) => { b.onclick = () => openPin(D.templates.find((t) => t.id === b.dataset.pin)); });
    const sh = $('#shareT'); if (sh) sh.onclick = () => shareTemplate();
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
    Object.assign(S.draft.options, t.options || {}); S.draft.title = t.title; S.draft.tpl = t.id; S.draft.skel = (t.skel || []).slice(0, 60); S.draft.pm = []; saveDraft();
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
        const lf = $('#lf'); if (lf) lf.onsubmit = async (e) => { e.preventDefault(); try { const mv = await loginAs($('#lg').value.trim(), $('#pw').value); S.err = ''; if (!mv) toast('Вы вошли'); syncSoon(); loadOrders(); rerender(); } catch (er) { S.err = er.message; rerender(); } };
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
