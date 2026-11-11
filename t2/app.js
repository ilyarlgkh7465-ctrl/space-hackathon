/* Трек 2 · Печать с телефона.
   Шаги: 0 выбор фото → 1 проверка на телефоне → 2 формат → 3 корзина → 4 заказ оформлен.
   Фото никуда не загружаются: проверка (резкость, яркость, дубли) и кадрирование — в браузере.
   Для показа: ?demo=1 — сразу демо-галерея; &step=2|3|4 — пройти до шага; &dry=1 — на шаге 4 не сохранять заказ. */
(function () {
  'use strict';
  const C = window.COMPANY;
  const $ = (s, r = document) => r.querySelector(s);
  const P = Object.fromEntries(C.products.map((p) => [p.id, p]));
  const SALONS = C.channels.filter((c) => c.type === 'salon');
  const STATUSES = [
    { id: 'new', name: 'Принят' }, { id: 'printing', name: 'В печати' },
    { id: 'ready', name: 'Готов' }, { id: 'done', name: 'Выдан' },
  ];
  const params = new URLSearchParams(location.search);

  const S = {
    step: 0, photos: [], filter: 'on', analyzing: null, checkMs: 0,
    product: 'p10x15', fit: false, qty: {},           // qty[photoId] для текущего продукта
    cart: [], delivery: 'pickup', branch: SALONS[0].id, address: '', name: '', phone: '', payErr: '',
    t0: null, tDone: null, order: null, poll: null, demo: false,
  };

  /* ---------------- утилиты ---------------- */
  const money = (v) => fmt.money2(v);
  const localIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); };
  const mmss = (sec) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="15" height="13" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/><path d="M3 15l4-4 4 4 3-3 4 4"/><circle cx="13.5" cy="9" r="1.3"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 8h6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    canvas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M4 16l5-5 4 4 2-2 5 5"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>',
  };
  function haptic(kind) {
    try { const h = window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback; if (h) kind === 'ok' ? h.notificationOccurred('success') : h.selectionChanged(); } catch (e) { /* нет Telegram */ }
  }

  /* ---------------- анализ фото на устройстве ---------------- */
  const AN = 320; // сторона уменьшенной копии для анализа
  function analyze(src, sw, sh, w, h, extra) {
    const sc = AN / Math.max(sw, sh);
    const aw = Math.max(8, Math.round(sw * sc)), ah = Math.max(8, Math.round(sh * sc));
    const cv = document.createElement('canvas'); cv.width = aw; cv.height = ah;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, aw, ah);
    const d = cx.getImageData(0, 0, aw, ah).data;
    const g = new Float32Array(aw * ah);
    let sum = 0;
    for (let i = 0, j = 0; j < g.length; i += 4, j++) { g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += g[j]; }
    // резкость: дисперсия лапласиана; «энергия» строк и столбцов — для кадрирования
    let ls = 0, ls2 = 0, n = 0;
    const colE = new Float32Array(aw), rowE = new Float32Array(ah);
    for (let y = 1; y < ah - 1; y++) {
      for (let x = 1; x < aw - 1; x++) {
        const k = y * aw + x;
        const L = 4 * g[k] - g[k - 1] - g[k + 1] - g[k - aw] - g[k + aw];
        ls += L; ls2 += L * L; n++;
        const e = Math.abs(g[k + 1] - g[k - 1]) + Math.abs(g[k + aw] - g[k - aw]);
        colE[x] += e; rowE[y] += e;
      }
    }
    const mean = ls / n;
    const sharp = ls2 / n - mean * mean;
    // dHash 64 бита: 9×8, сравнение соседей
    const hc = document.createElement('canvas'); hc.width = 9; hc.height = 8;
    const hx = hc.getContext('2d', { willReadFrequently: true });
    hx.imageSmoothingQuality = 'high';
    hx.drawImage(cv, 0, 0, 9, 8);
    const hd = hx.getImageData(0, 0, 9, 8).data;
    const hash = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const a = (y * 9 + x) * 4, b = a + 4;
      hash.push((hd[a] * .299 + hd[a + 1] * .587 + hd[a + 2] * .114) > (hd[b] * .299 + hd[b + 1] * .587 + hd[b + 2] * .114) ? 1 : 0);
    }
    // миниатюра для экрана (≤360 px) и маленькая для заказа (≤160 px)
    const thumb = toDataURL(src, sw, sh, 360, 0.82);
    return Object.assign({
      id: 'f' + Math.random().toString(36).slice(2, 8), w, h, thumb, sharp, bright: sum / g.length,
      hash, colE, rowE, flags: {}, selected: true,
    }, extra || {});
  }
  function toDataURL(src, sw, sh, max, q) {
    const s = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * s); c.height = Math.round(sh * s);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  const hamming = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) d += a[i] !== b[i]; return d; };

  /* отметки после того, как проверены все фото: размытые считаются относительно всей подборки */
  function classify(list) {
    const sorted = list.map((p) => p.sharp).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    list.forEach((p) => {
      p.flags = {};
      p.flags.blur = p.sharp < 12 || (p.sharp < median * 0.3 && p.sharp < 150);
      p.flags.dark = p.bright < 48;
      p.flags.small = Math.min(p.w, p.h) < 1200;
    });
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < i; j++) {
        if (list[j].flags.dup || list[i].flags.dup) continue;
        if (hamming(list[i].hash, list[j].hash) <= 10) {
          // оставляем более резкий кадр, второй — дубль
          const worse = list[i].sharp >= list[j].sharp ? list[j] : list[i];
          const keep = worse === list[i] ? list[j] : list[i];
          worse.flags.dup = true; worse.dupOf = keep.id;
        }
      }
    }
    list.forEach((p) => {
      p.selected = !p.flags.blur && !p.flags.dark && !p.flags.dup;
      p.score = Math.log(1 + p.sharp) - Math.abs(p.bright - 128) / 64 - (p.flags.small ? 2 : 0);
    });
  }

  /* ---------------- кадрирование и качество ---------------- */
  function cropFor(p, prod, fit) {
    const portrait = p.h >= p.w;
    const aspect = portrait ? prod.ratio : 1 / prod.ratio;     // ширина/высота отпечатка
    const ia = p.w / p.h;
    if (fit || Math.abs(ia - aspect) < 0.01) return { x: 0, y: 0, w: 1, h: 1, aspect, portrait, cut: 0 };
    if (ia > aspect) { const w = aspect / ia; return { x: bestWindow(p.colE, w), y: 0, w, h: 1, aspect, portrait, cut: 1 - w }; }
    const h = ia / aspect; return { x: 0, y: bestWindow(p.rowE, h), w: 1, h, aspect, portrait, cut: 1 - h };
  }
  function bestWindow(E, frac) {
    const n = E.length, k = Math.max(1, Math.round(frac * n));
    const W = new Float32Array(n);
    for (let i = 0; i < n; i++) W[i] = E[i] * (1 - 0.45 * Math.abs((i + 0.5) / n - 0.5) * 2); // лёгкий упор в центр
    let s = 0; for (let i = 0; i < k; i++) s += W[i];
    let best = s, at = 0;
    for (let i = k; i < n; i++) { s += W[i] - W[i - k]; if (s > best) { best = s; at = i - k + 1; } }
    return Math.min(1 - frac, at / n);
  }
  function quality(p, prod, crop) {
    const [shortPx, longPx] = prod.minPx;
    const needW = crop.portrait ? shortPx : longPx, needH = crop.portrait ? longPx : shortPx;
    const q = Math.min(p.w * crop.w / needW, p.h * crop.h / needH);
    if (q >= 0.85) return { lvl: 'ok', q, label: 'Отлично' };
    if (q >= 0.5) return { lvl: 'soft', q, label: 'Будет мягко' };
    return { lvl: 'low', q, label: 'Мало пикселей' };
  }
  /* какой формат подойдёт фото, если на выбранный не хватает пикселей */
  function betterFormat(p, prod) {
    const prints = ['p21x30', 'p15x21', 'p10x15', 'polar'].map((id) => P[id]).filter((x) => x.id !== prod.id);
    for (const x of prints) { if (quality(p, x, cropFor(p, x, false)).lvl === 'ok') return x; }
    for (const x of prints) { if (quality(p, x, cropFor(p, x, false)).lvl === 'soft') return x; }
    return null;
  }
  function bgStyle(p, crop) {
    if (crop.w >= 0.999 && crop.h >= 0.999) return `background-image:url(${p.thumb});background-size:100% 100%;`;
    const sx = 100 / crop.w, sy = 100 / crop.h;
    const px = crop.w < 1 ? crop.x / (1 - crop.w) * 100 : 0, py = crop.h < 1 ? crop.y / (1 - crop.h) * 100 : 0;
    return `background-image:url(${p.thumb});background-size:${sx}% ${sy}%;background-position:${px}% ${py}%;`;
  }

  /* ---------------- продукты и корзина ---------------- */
  const kindOf = (prod) => prod.photos ? 'set' : prod.id === 'canvas' ? 'pick' : 'each';
  const selected = () => S.photos.filter((p) => p.selected);
  const byScore = (list) => list.slice().sort((a, b) => b.score - a.score);

  function setProduct(id) {
    S.product = id;
    const prod = P[id], sel = selected(), kind = kindOf(prod);
    S.qty = {};
    if (kind === 'each') sel.forEach((p) => { S.qty[p.id] = 1; });
    if (kind === 'pick') { const best = byScore(sel.filter((p) => quality(p, prod, cropFor(p, prod, false)).lvl === 'ok'))[0] || byScore(sel)[0]; if (best) S.qty[best.id] = 1; }
    if (kind === 'set') byScore(sel).slice(0, prod.photos[1]).forEach((p) => { S.qty[p.id] = 1; });
    if (kind !== 'each') S.fit = false;
  }
  function draftItem() {
    const prod = P[S.product], kind = kindOf(prod);
    const lines = Object.entries(S.qty).filter(([, q]) => q > 0).map(([id, q]) => ({ id, q }));
    const count = lines.reduce((s, l) => s + l.q, 0);
    if (kind === 'set') {
      const enough = lines.length >= prod.photos[0];
      return { productId: prod.id, name: prod.name, kind, lines, count: 1, photos: lines.length, price: prod.price, sum: enough ? prod.price : 0, fit: false, enough };
    }
    return { productId: prod.id, name: prod.name, kind, lines, count, photos: lines.length, price: prod.price, sum: +(count * prod.price).toFixed(2), fit: S.fit, enough: count > 0 };
  }
  const itemsSum = () => +S.cart.reduce((s, it) => s + it.sum, 0).toFixed(2);
  const deliv = () => C.delivery.find((d) => d.id === S.delivery);
  const total = () => +(itemsSum() + (S.cart.length ? deliv().price : 0)).toFixed(2);

  /* Подсказка: что ещё можно сделать из этих кадров (правила, без модели) */
  function upsell() {
    const n = selected().length, has = (id) => S.cart.some((i) => i.productId === id) || (S.step === 2 && S.product === id);
    if (n >= 20 && !has('book20')) return { id: 'book20', text: `${n} ${plural(n, 'удачный кадр', 'удачных кадра', 'удачных кадров')} — хватит на фотокнигу 20×20 на 20 страниц. Лучшие кадры разложим сами.`, price: P.book20.price };
    if (n >= 12 && !has('calendar')) return { id: 'calendar', text: `${n} ${plural(n, 'удачный кадр', 'удачных кадра', 'удачных кадров')} — хватит на календарь 2027: 12 месяцев и обложка.`, price: P.calendar.price };
    const big = byScore(selected().filter((p) => quality(p, P.canvas, cropFor(p, P.canvas, false)).lvl === 'ok'))[0];
    if (big && !has('canvas')) return { id: 'canvas', text: 'Этот кадр хорошо ляжет на холст 30×40 — пикселей хватает с запасом.', price: P.canvas.price, photo: big };
    return null;
  }
  function addUpsell(id) {
    const keepProduct = S.product, keepQty = S.qty, keepFit = S.fit;
    setProduct(id);
    const it = draftItem();
    S.product = keepProduct; S.qty = keepQty; S.fit = keepFit;
    if (!it.enough) return toast('Не хватает фото для этого продукта');
    putInCart(it);
    toast(it.name + ' — в корзине');
    haptic('ok');
    render();
  }
  function putInCart(it) {
    const i = S.cart.findIndex((x) => x.productId === it.productId);
    if (i >= 0) S.cart[i] = it; else S.cart.push(it);
  }

  /* ---------------- выбор фото ---------------- */
  async function loadFiles(files) {
    files = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name));
    if (!files.length) return;
    if (!S.t0) S.t0 = Date.now();
    S.step = 1; S.photos = []; S.analyzing = { done: 0, total: files.length }; render();
    const t = performance.now(), out = [];
    for (const f of files) {
      try {
        const url = URL.createObjectURL(f);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        out.push(analyze(img, img.naturalWidth, img.naturalHeight, img.naturalWidth, img.naturalHeight, { name: f.name }));
        URL.revokeObjectURL(url);
      } catch (e) { /* формат не открылся (например, HEIC в Chrome) — пропускаем */ }
      S.analyzing.done++; renderLoading();
      await new Promise((r) => setTimeout(r, 0));
    }
    finishAnalysis(out, performance.now() - t, files.length - out.length);
  }
  function finishAnalysis(list, ms, failed) {
    classify(list);
    if (params.get('debug') === '1') list.forEach((p, i) => console.log('T2DBG', i, p.name, 'sharp=' + p.sharp.toFixed(1), 'bright=' + p.bright.toFixed(0),
      'minHam=' + Math.min(...list.filter((q) => q !== p).map((q) => hamming(p.hash, q.hash))), JSON.stringify(p.flags)));
    S.photos = list; S.checkMs = ms; S.analyzing = null; S.filter = 'on'; S.failed = failed || 0;
    S.cart = []; setProduct('p10x15');
    render();
  }

  /* ---------------- демо-галерея: правдоподобные кадры на canvas ---------------- */
  function rng(seed) {
    return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function lg(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  function rect(x, c, a, b, w, h) { x.fillStyle = c; x.fillRect(a, b, w, h); }
  function circle(x, c, cx, cy, r) { x.fillStyle = c; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
  function poly(x, c, pts) { x.fillStyle = c; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.closePath(); x.fill(); }
  function ridge(x, W, H, base, amp, color, r, peaks) {
    const pts = [0, H]; const n = peaks || 6;
    for (let i = 0; i <= n; i++) pts.push(W * i / n, base - amp * (0.4 + 0.6 * r()));
    pts.push(W, H); poly(x, color, pts);
  }
  const SCENES = {
    sunset(x, W, H, r) {
      const hz = H * 0.6;
      rect(x, lg(x, 0, 0, 0, hz, ['#2b2d6e', '#8e3b7a', '#e2577a', '#f8a65a']), 0, 0, W, hz);
      const sx = W * (0.3 + 0.4 * r());
      const glow = x.createRadialGradient(sx, hz, 2, sx, hz, W * 0.5); glow.addColorStop(0, 'rgba(255,214,140,.85)'); glow.addColorStop(1, 'rgba(255,214,140,0)');
      x.fillStyle = glow; x.fillRect(0, 0, W, hz);
      circle(x, '#ffe2a0', sx, hz - W * 0.02, W * 0.08);
      rect(x, lg(x, 0, hz, 0, H, ['#463f7c', '#1c1f44']), 0, hz, W, H - hz);
      for (let i = 0; i < 70; i++) { const y = hz + 4 + (H - hz) * r(); x.fillStyle = `rgba(255,190,120,${0.15 + 0.5 * r() * (1 - (y - hz) / (H - hz))})`; x.fillRect(sx - W * 0.15 * r() - 10, y, W * 0.3 * r() + 10, 2); }
      x.strokeStyle = 'rgba(30,20,50,.8)'; x.lineWidth = 2;
      for (let i = 0; i < 4; i++) { const bx = W * r(), by = H * 0.2 + H * 0.2 * r(); x.beginPath(); x.moveTo(bx - 8, by - 4); x.lineTo(bx, by); x.lineTo(bx + 8, by - 4); x.stroke(); }
    },
    mountains(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H * 0.6, ['#7fb8ef', '#d8ecff']), 0, 0, W, H);
      ridge(x, W, H, H * 0.45, H * 0.25, '#8da9c9', r, 5);
      const pk = []; for (let i = 0; i <= 4; i++) pk.push([W * i / 4, H * (0.5 - 0.22 * r())]);
      poly(x, '#4e6d94', [0, H].concat(...pk).concat([W, H]));
      pk.forEach(([px, py]) => poly(x, '#f4f8ff', [px - W * 0.05, py + H * 0.05, px, py, px + W * 0.05, py + H * 0.05]));
      ridge(x, W, H, H * 0.72, H * 0.1, '#2f4a68', r, 8);
      rect(x, lg(x, 0, H * 0.8, 0, H, ['#5f8f4e', '#3e6a35']), 0, H * 0.8, W, H * 0.2);
    },
    city(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H, ['#3d4c7a', '#c9787a', '#f2b56b']), 0, 0, W, H);
      for (let layer = 0; layer < 2; layer++) {
        let bx = 0;
        while (bx < W) {
          const bw = W * (0.08 + 0.1 * r()), bh = H * (layer ? 0.35 + 0.35 * r() : 0.25 + 0.3 * r());
          rect(x, layer ? '#262b3d' : '#4a4f66', bx, H - bh, bw, bh);
          for (let wy = H - bh + 8; wy < H - 6; wy += 11) for (let wx = bx + 5; wx < bx + bw - 6; wx += 9) if (r() < (layer ? 0.45 : 0.25)) rect(x, r() < 0.8 ? '#ffd27a' : '#fff3c4', wx, wy, 4, 6);
          bx += bw + 2;
        }
      }
    },
    forest(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H, ['#cde7ff', '#eef7ff']), 0, 0, W, H);
      for (let row = 0; row < 4; row++) {
        const base = H * (0.5 + row * 0.13), col = ['#7fa37a', '#55804f', '#3a6338', '#24452a'][row];
        for (let i = 0; i < 9 + row * 2; i++) { const tx = W * r(), th = H * (0.18 + 0.1 * row) * (0.7 + 0.5 * r()); poly(x, col, [tx, base - th, tx - th * 0.28, base, tx + th * 0.28, base]); }
      }
      rect(x, '#2c3f26', 0, H * 0.9, W, H * 0.1);
    },
    field(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H * 0.55, ['#79b8e8', '#e3f2ff']), 0, 0, W, H);
      for (let i = 0; i < 5; i++) { const cx = W * r(), cy = H * 0.12 + H * 0.25 * r(); for (let k = 0; k < 5; k++) circle(x, 'rgba(255,255,255,.9)', cx + k * 16 - 30, cy + (k % 2) * 6, 14 + 8 * r()); }
      rect(x, lg(x, 0, H * 0.55, 0, H, ['#b5d36b', '#5f9446']), 0, H * 0.55, W, H * 0.45);
      for (let i = 0; i < 420; i++) { const y = H * 0.56 + H * 0.44 * Math.pow(r(), 0.8), s = 1 + 5 * (y - H * 0.55) / (H * 0.45); circle(x, ['#e63946', '#ffd166', '#ffffff', '#c77dff'][i % 4], W * r(), y, s); }
    },
    beach(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H * 0.45, ['#6fb7f2', '#cfe9ff']), 0, 0, W, H * 0.45);
      rect(x, lg(x, 0, H * 0.45, 0, H * 0.65, ['#1d8fbf', '#4fc3dc']), 0, H * 0.45, W, H * 0.2);
      rect(x, lg(x, 0, H * 0.65, 0, H, ['#f3e2b3', '#e2c48c']), 0, H * 0.65, W, H * 0.35);
      x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const y = H * 0.5 + i * H * 0.03; x.beginPath(); for (let k = 0; k <= W; k += 20) x.lineTo(k, y + Math.sin(k / 22 + i) * 3); x.stroke(); }
      const ux = W * (0.25 + 0.5 * r()), uy = H * 0.7;
      rect(x, '#5b4636', ux - 2, uy, 4, H * 0.18);
      for (let s = 0; s < 6; s++) { x.fillStyle = s % 2 ? '#ffffff' : '#e63946'; x.beginPath(); x.moveTo(ux, uy); x.arc(ux, uy, W * 0.14, Math.PI + s * Math.PI / 6, Math.PI + (s + 1) * Math.PI / 6); x.closePath(); x.fill(); }
    },
    lake(x, W, H, r) {
      const hz = H * 0.55;
      rect(x, lg(x, 0, 0, 0, hz, ['#f6c28b', '#f9e3c6']), 0, 0, W, hz);
      ridge(x, W, hz + 1, hz * 0.7, hz * 0.25, '#6b7aa1', r, 5);
      ridge(x, W, hz + 1, hz * 0.88, hz * 0.12, '#3e4b6e', r, 9);
      x.save(); x.translate(0, hz * 2); x.scale(1, -1); x.globalAlpha = 0.55; x.drawImage(x.canvas, 0, 0, W, hz, 0, 0, W, hz); x.restore();
      rect(x, 'rgba(40,60,110,.25)', 0, hz, W, H - hz);
      for (let i = 0; i < 60; i++) rect(x, 'rgba(255,255,255,.25)', W * r(), hz + (H - hz) * r(), 20 + 40 * r(), 1.5);
    },
    winter(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H, ['#bcd4ec', '#eef4fb']), 0, 0, W, H);
      rect(x, lg(x, 0, H * 0.62, 0, H, ['#ffffff', '#dbe7f3']), 0, H * 0.62, W, H * 0.38);
      for (let i = 0; i < 12; i++) {
        const tx = W * r(), base = H * (0.62 + 0.25 * r()), th = H * (0.18 + 0.15 * r());
        for (let k = 0; k < 3; k++) poly(x, '#1f4d3a', [tx, base - th + k * th * 0.25, tx - th * (0.22 + k * 0.06), base - th * 0.35 + k * th * 0.25, tx + th * (0.22 + k * 0.06), base - th * 0.35 + k * th * 0.25]);
        x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(tx - th * 0.15, base - th * 0.5); x.lineTo(tx + th * 0.12, base - th * 0.55); x.stroke();
      }
      for (let i = 0; i < 260; i++) circle(x, 'rgba(255,255,255,.9)', W * r(), H * r(), 1 + 2 * r());
    },
    dunes(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H * 0.5, ['#ffc78a', '#fff1c9']), 0, 0, W, H);
      circle(x, '#fff6dc', W * (0.6 + 0.2 * r()), H * 0.22, W * 0.07);
      const cols = ['#e9b56a', '#dd9a4f', '#c97c3c', '#a85f2c'];
      cols.forEach((c, i) => { const b = H * (0.5 + i * 0.12); x.fillStyle = c; x.beginPath(); x.moveTo(0, H); x.lineTo(0, b); x.bezierCurveTo(W * 0.3, b - H * 0.12 * r(), W * 0.6, b + H * 0.08, W, b - H * 0.05 * r()); x.lineTo(W, H); x.closePath(); x.fill(); });
      x.strokeStyle = 'rgba(120,70,30,.35)'; x.lineWidth = 1.5;
      for (let i = 0; i < 40; i++) { const y = H * (0.6 + 0.4 * r()), x0 = W * r(); x.beginPath(); x.moveTo(x0, y); x.quadraticCurveTo(x0 + 20, y - 4, x0 + 40, y); x.stroke(); }
    },
    autumn(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H, ['#fbe8c8', '#f2c79b']), 0, 0, W, H);
      for (let i = 0; i < 5; i++) { const tx = W * r(); rect(x, '#5b3a29', tx, H * 0.2, W * 0.03, H * 0.7); }
      for (let i = 0; i < 520; i++) circle(x, ['#e76f51', '#f4a261', '#e9c46a', '#d62828', '#bc6c25'][i % 5], W * r(), H * 0.6 * Math.pow(r(), 0.9), 3 + 6 * r());
      rect(x, lg(x, 0, H * 0.85, 0, H, ['#c8875a', '#9c5f3b']), 0, H * 0.85, W, H * 0.15);
      for (let i = 0; i < 160; i++) circle(x, ['#e76f51', '#f4a261', '#e9c46a'][i % 3], W * r(), H * (0.85 + 0.15 * r()), 2 + 3 * r());
    },
    coffee(x, W, H, r) {
      for (let i = 0; i < 14; i++) rect(x, ['#a47148', '#8f5f3a', '#b07d52'][i % 3], 0, H * i / 14, W, H / 14 + 1);
      x.strokeStyle = 'rgba(60,35,20,.35)'; x.lineWidth = 1;
      for (let i = 0; i < 80; i++) { const y = H * r(); x.beginPath(); x.moveTo(W * r(), y); x.lineTo(W * r(), y + 2); x.stroke(); }
      const cx = W * (0.4 + 0.2 * r()), cy = H * (0.45 + 0.1 * r()), R = Math.min(W, H) * 0.27;
      circle(x, 'rgba(0,0,0,.18)', cx + 10, cy + 12, R * 1.35);
      circle(x, '#f6f1ea', cx, cy, R * 1.32); circle(x, '#ffffff', cx, cy, R); circle(x, '#6f4518', cx, cy, R * 0.82);
      circle(x, '#e9d3b4', cx - R * 0.18, cy - R * 0.1, R * 0.28); circle(x, '#e9d3b4', cx + R * 0.18, cy - R * 0.1, R * 0.28);
      poly(x, '#e9d3b4', [cx - R * 0.44, cy - R * 0.02, cx + R * 0.44, cy - R * 0.02, cx, cy + R * 0.42]);
      rect(x, '#d9d9d9', cx + R * 1.1, cy - R * 0.08, R * 0.9, R * 0.12);
    },
    flower(x, W, H, r) {
      rect(x, lg(x, 0, 0, W, H, ['#2f5d3a', '#6e9f5a']), 0, 0, W, H);
      for (let i = 0; i < 26; i++) circle(x, `rgba(${200 + 55 * r() | 0},${230 + 25 * r() | 0},${150 + 60 * r() | 0},${0.12 + 0.2 * r()})`, W * r(), H * r(), 10 + 40 * r());
      const cx = W * (0.4 + 0.2 * r()), cy = H * (0.4 + 0.2 * r()), R = Math.min(W, H) * 0.3;
      for (let k = 0; k < 12; k++) { x.save(); x.translate(cx, cy); x.rotate(k * Math.PI / 6); x.fillStyle = k % 2 ? '#f28dbd' : '#f7a8cf'; x.beginPath(); x.ellipse(R * 0.55, 0, R * 0.5, R * 0.18, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
      circle(x, '#f4c430', cx, cy, R * 0.22);
      for (let i = 0; i < 40; i++) circle(x, '#b8860b', cx + (r() - 0.5) * R * 0.35, cy + (r() - 0.5) * R * 0.35, 2);
    },
    bridge(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H * 0.6, ['#9cc9f0', '#f3f7fb']), 0, 0, W, H);
      rect(x, lg(x, 0, H * 0.6, 0, H, ['#5f88a8', '#2f5371']), 0, H * 0.6, W, H * 0.4);
      ridge(x, W, H * 0.6, H * 0.52, H * 0.08, '#7f9cab', r, 10);
      rect(x, '#3b3f48', 0, H * 0.5, W, H * 0.03);
      for (let a = 0; a < 4; a++) { const ax = W * (a + 0.5) / 4; x.strokeStyle = '#3b3f48'; x.lineWidth = 6; x.beginPath(); x.arc(ax, H * 0.62, W * 0.12, Math.PI, 0); x.stroke(); rect(x, '#3b3f48', ax + W * 0.12 - 3, H * 0.53, 6, H * 0.1); }
      for (let i = 0; i < 50; i++) rect(x, 'rgba(255,255,255,.3)', W * r(), H * (0.65 + 0.35 * r()), 18 + 30 * r(), 1.5);
    },
    lighthouse(x, W, H, r) {
      rect(x, lg(x, 0, 0, 0, H * 0.6, ['#5c87b8', '#d9e8f5']), 0, 0, W, H);
      rect(x, lg(x, 0, H * 0.62, 0, H, ['#2e6f9e', '#18476b']), 0, H * 0.62, W, H * 0.38);
      const lx = W * (0.35 + 0.3 * r()), base = H * 0.66, th = H * 0.42, bw = W * 0.09;
      poly(x, '#5d5a55', [lx - W * 0.25, H, lx - W * 0.18, base, lx + W * 0.2, base + H * 0.02, lx + W * 0.3, H]);
      for (let k = 0; k < 6; k++) { const y0 = base - th * k / 6, y1 = base - th * (k + 1) / 6; const w0 = bw * (1 - 0.35 * k / 6), w1 = bw * (1 - 0.35 * (k + 1) / 6); poly(x, k % 2 ? '#ffffff' : '#d62828', [lx - w0, y0, lx - w1, y1, lx + w1, y1, lx + w0, y0]); }
      rect(x, '#2b2d42', lx - bw * 0.7, base - th - H * 0.05, bw * 1.4, H * 0.05);
      circle(x, '#ffe08a', lx, base - th - H * 0.025, bw * 0.4);
      for (let i = 0; i < 70; i++) rect(x, 'rgba(255,255,255,.4)', W * r(), H * (0.64 + 0.36 * r()), 10 + 30 * r(), 2);
    },
  };
  const NAMES = { sunset: 'Закат на море', mountains: 'Горы', city: 'Вечерний город', forest: 'Лес', field: 'Поле', beach: 'Пляж', lake: 'Озеро',
    winter: 'Зима', dunes: 'Дюны', autumn: 'Осенний парк', coffee: 'Кофе', flower: 'Цветок', bridge: 'Мост', lighthouse: 'Маяк' };
  const SIZES = { p: [480, 640, 3024, 4032], l: [640, 480, 4032, 3024], s: [560, 560, 3024, 3024] };

  function grain(x, W, H, amt, r) {
    const im = x.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    x.putImageData(im, 0, 0);
  }
  function blurCanvas(src) {
    const W = src.width, H = src.height;
    const a = document.createElement('canvas'); a.width = Math.round(W / 14); a.height = Math.round(H / 14);
    const ax = a.getContext('2d'); ax.imageSmoothingQuality = 'high'; ax.drawImage(src, 0, 0, a.width, a.height);
    const b = document.createElement('canvas'); b.width = Math.round(W / 4); b.height = Math.round(H / 4);
    const bx = b.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(a, 0, 0, b.width, b.height);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(b, 0, 0, W, H);
    return c;
  }
  function render1(scene, seed, size, mod) {
    const [W, H] = SIZES[size];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    const r = rng(seed);
    SCENES[scene](x, W, H, r);
    if (mod === 'dark') { x.fillStyle = 'rgba(5,8,20,.86)'; x.fillRect(0, 0, W, H); }
    if (mod === 'dup') { // тот же кадр через секунду: чуть сдвинут и светлее
      const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').drawImage(c, 0, 0);
      x.drawImage(t, -W * 0.02, -H * 0.015, W * 1.04, H * 1.03); x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(0, 0, W, H);
    }
    grain(x, W, H, 18, rng(seed + 99));
    return mod === 'blur' ? blurCanvas(c) : c;
  }
  // 20 кадров: 14 удачных, 3 размытых, 2 дубля, 1 тёмный; один из удачных — маленький (1024×768)
  const DEMO = [
    ['sunset', 11, 'p'], ['mountains', 12, 'l'], ['city', 13, 'p', 'blur'], ['coffee', 14, 's'], ['sunset', 11, 'p', 'dup'],
    ['forest', 15, 'p'], ['beach', 16, 'l'], ['field', 17, 'p'], ['lake', 18, 'l', 'blur'], ['winter', 19, 'p'],
    ['dunes', 20, 'l'], ['forest', 21, 'p', 'dark'], ['autumn', 22, 'p'], ['flower', 23, 'l', 'small'], ['coffee', 14, 's', 'dup'],
    ['bridge', 24, 'l'], ['beach', 25, 'p', 'blur'], ['lighthouse', 26, 'p'], ['city', 27, 'l'], ['lake', 28, 'p'],
  ];
  async function demoGallery() {
    if (!S.t0) S.t0 = Date.now();
    S.demo = true; S.step = 1; S.photos = []; S.analyzing = { done: 0, total: DEMO.length }; render();
    const t = performance.now(), out = [];
    for (const [scene, seed, size, mod] of DEMO) {
      const c = render1(scene, seed, size, mod);
      let [, , w, h] = SIZES[size];
      if (mod === 'small') { w = 1024; h = 768; }
      out.push(analyze(c, c.width, c.height, w, h, { name: NAMES[scene] }));
      S.analyzing.done++; renderLoading();
      await new Promise((r) => setTimeout(r, 0));
    }
    finishAnalysis(out, performance.now() - t, 0);
  }

  /* ---------------- отрисовка ---------------- */
  const TITLES = ['Печать фото', 'Проверка кадров', 'Формат', 'Корзина', 'Заказ оформлен'];
  function render() {
    renderHead(); renderSide();
    const scr = $('#screen'), bar = $('#bar');
    if (S.step === 1 && S.analyzing) { renderLoading(); bar.innerHTML = ''; return; }
    const v = [vStart, vCheck, vFormat, vCart, vDone][S.step]();
    scr.innerHTML = v.html; bar.innerHTML = v.bar || '';
    v.bind && v.bind(scr, bar);
    if (S.step !== 4) stopPoll();
  }
  function go(step) { S.step = step; render(); $('#screen').scrollTop = 0; }
  function renderHead() {
    const h = $('#head');
    const back = S.step > 0 && S.step < 4 ? `<button class="icon-btn" id="back" aria-label="Назад">${ICON.back}</button>` : '<span></span>';
    const prog = S.step > 0 ? `<div class="progress" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= S.step ? 'on' : ''}"></i>`).join('')}</div>` : '';
    h.innerHTML = `${back}<h2>${TITLES[S.step]}</h2><span></span>${prog}`;
    const b = $('#back'); if (b) b.onclick = () => go(S.step - 1);
  }
  function renderSide() {
    document.querySelectorAll('#sideSteps li').forEach((li) => {
      const s = +li.dataset.s; li.classList.toggle('on', s === S.step); li.classList.toggle('done', s < S.step);
    });
    tickTimer();
  }
  function tickTimer() {
    const el = $('#sideTimer'), note = $('#sideTimerNote'); if (!el) return;
    if (!S.t0) { el.textContent = '0:00'; el.style.color = 'var(--ink3)'; el.classList.remove('done'); note.textContent = 'Отсчёт пойдёт, когда выберете фото'; return; }
    const sec = ((S.tDone || Date.now()) - S.t0) / 1000;
    el.style.color = '';
    el.textContent = mmss(sec); el.classList.toggle('done', !!S.tDone);
    note.textContent = S.tDone ? 'От выбора фото до оформленного заказа' : 'Идёт: от выбора фото до заказа';
  }
  setInterval(tickTimer, 1000);

  function renderLoading() {
    if (S.step !== 1 || !S.analyzing) return;
    const { done, total } = S.analyzing;
    $('#screen').innerHTML = `<div class="loading">
      <div class="ai-ava" style="margin:0 auto;width:44px;height:44px;font-size:17px">ИИ</div>
      <h3 style="margin-top:14px;font-size:18px;font-weight:600">Проверяю кадры на телефоне</h3>
      <div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
      <p class="num">${done} из ${total}</p>
      <p>Резкость, свет, дубли и размер — ничего не загружается в интернет</p></div>`;
  }

  /* шаг 0 — старт */
  function vStart() {
    const pop = [['p10x15', ICON.photos, 'от ' + money(P.p10x15.price)], ['book20', ICON.book, money(P.book20.price)], ['calendar', ICON.cal, money(P.calendar.price)], ['canvas', ICON.canvas, money(P.canvas.price)]];
    return {
      html: `<section class="hello">
          <h1>Напечатайте фото прямо с телефона</h1>
          <p>Выберите кадры — приложение отберёт удачные, подгонит под формат и посчитает цену. Без регистрации и редактора.</p>
        </section>
        <div class="pick">
          <label class="btn btn-primary btn-xl" for="file">${ICON.photos.replace('<svg', '<svg width="22" height="22"')} Выбрать фото</label>
          <button class="btn btn-lg" id="demo">Демо-галерея · 20 кадров</button>
        </div>
        <div>
          <p class="sec-t" style="margin-bottom:10px">Популярное</p>
          <div class="prod-row">${pop.map(([id, ic, pr]) => `<div class="prod-card"><div class="pic">${ic}</div><b>${esc(P[id].name)}</b><span>${pr}</span></div>`).join('')}</div>
        </div>
        <div class="trust">
          <div>${ICON.ok} Проверка качества прямо на телефоне</div>
          <div>${ICON.ok} Самовывоз из ${SALONS.length} салонов, готовность от 1 часа</div>
          <div>${ICON.ok} Оплата при получении</div>
        </div>`,
      bind() { $('#demo').onclick = demoGallery; },
    };
  }

  /* шаг 1 — проверка */
  function vCheck() {
    const all = S.photos, n = all.length;
    if (!n) return { html: `<div class="loading"><p>Не удалось открыть фото. Попробуйте JPEG или PNG.</p><button class="btn" id="again" style="margin-top:14px">Выбрать снова</button></div>`, bind() { $('#again').onclick = () => go(0); } };
    const blur = all.filter((p) => p.flags.blur).length, dup = all.filter((p) => p.flags.dup).length, dark = all.filter((p) => p.flags.dark).length, small = all.filter((p) => p.flags.small && !p.flags.blur && !p.flags.dup && !p.flags.dark).length;
    const on = selected().length;
    const reasons = [];
    if (blur) reasons.push(`${blur} ${plural(blur, 'размытое', 'размытых', 'размытых')}`);
    if (dup) reasons.push(`${dup} ${plural(dup, 'дубль', 'дубля', 'дублей')}`);
    if (dark) reasons.push(`${dark} ${plural(dark, 'тёмное', 'тёмных', 'тёмных')}`);
    const auto = all.filter((p) => p.flags.blur || p.flags.dup || p.flags.dark).length;
    const head = auto
      ? `Отобрала <b>${n - auto} из ${n}</b>: ${reasons.join(', ')} — убрала. Вернуть можно одним касанием.`
      : `Все <b>${n}</b> ${plural(n, 'кадр', 'кадра', 'кадров')} в порядке — можно печатать.`;
    const smallTxt = small ? `<br>${small} ${plural(small, 'кадр маленький', 'кадра маленьких', 'кадров маленьких')} — подойдёт до 10×15.` : '';
    const list = S.filter === 'on' ? all.filter((p) => p.selected) : S.filter === 'off' ? all.filter((p) => !p.selected) : all;
    const tag = (p) => p.flags.blur ? '<span class="tag bad">Размыто</span>' : p.flags.dup ? '<span class="tag bad">Дубль</span>' : p.flags.dark ? '<span class="tag bad">Темно</span>' : p.flags.small ? '<span class="tag warn">Мало пикс.</span>' : '';
    return {
      html: `<div class="ai-note"><span class="ai-ava">ИИ</span><div class="ai-body">${head}${smallTxt}
          <div class="ai-src">Проверено на телефоне за ${fmt.n1(S.checkMs / 1000)} с · фото никуда не загружались${S.failed ? ` · ${S.failed} не открылось` : ''}</div></div></div>
        <div class="filters" role="group" aria-label="Показать">
          <button class="chip" data-f="on" aria-pressed="${S.filter === 'on'}">Отобрано ${on}</button>
          <button class="chip" data-f="off" aria-pressed="${S.filter === 'off'}">Отсеяно ${n - on}</button>
          <button class="chip" data-f="all" aria-pressed="${S.filter === 'all'}">Все ${n}</button>
        </div>
        <div class="thumbs">${list.map((p) => `<button class="th ${p.selected ? 'on' : 'off'}" data-id="${p.id}" aria-pressed="${p.selected}" aria-label="${esc(p.name || 'Фото')}${p.selected ? ', выбрано' : ''}">
            <img src="${p.thumb}" alt="" loading="lazy"><span class="ck">${ICON.check}</span>${tag(p)}</button>`).join('') || '<p class="muted" style="grid-column:1/-1;padding:20px 0;text-align:center">Здесь пусто</p>'}</div>`,
      bar: `<button class="btn btn-primary btn-xl" id="next" ${on ? '' : 'disabled'}>Дальше · ${on} ${plural(on, 'фото', 'фото', 'фото')}</button>`,
      bind(scr) {
        scr.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { S.filter = b.dataset.f; render(); }; });
        scr.querySelectorAll('.th').forEach((b) => {
          b.onclick = () => { const p = S.photos.find((x) => x.id === b.dataset.id); p.selected = !p.selected; haptic(); const keep = scr.scrollTop; render(); $('#screen').scrollTop = keep; };
        });
        $('#next').onclick = () => { setProduct(S.product); go(2); };
      },
    };
  }

  /* шаг 2 — формат */
  function vFormat() {
    const prod = P[S.product], kind = kindOf(prod), sel = selected(), it = draftItem();
    const chips = C.products.map((p) => `<button class="pchip" data-p="${p.id}" aria-pressed="${p.id === S.product}"><b>${esc(p.name.replace(' настенный', '').replace(', 20 стр.', ''))}</b><span>${money(p.price)}${p.photos ? ' · ' + p.photos[0] + '+ фото' : ''}</span></button>`).join('');
    let lowCount = 0;
    const tiles = (kind === 'set' ? byScore(sel) : sel).map((p) => {
      const crop = cropFor(p, prod, S.fit), q = quality(p, prod, crop), qn = S.qty[p.id] || 0;
      if (q.lvl === 'low' && qn) lowCount++;
      const alt = q.lvl !== 'ok' ? betterFormat(p, prod) : null;
      const hint = q.lvl === 'low' ? `Мало пикселей${alt ? ' — возьмите ' + alt.name.replace('Фото ', '') : ''}` : q.lvl === 'soft' ? `Будет мягко${alt ? ' — лучше ' + alt.name.replace('Фото ', '') : ''}` : (crop.cut > 0.02 ? `Обрезано ${Math.round(crop.cut * 100)} % по краям` : 'Без обрезки');
      const ctrl = kind === 'each'
        ? `<span class="stepper sm"><button data-m="${p.id}" aria-label="Меньше">−</button><output>${qn}</output><button data-pl="${p.id}" aria-label="Больше">+</button></span>`
        : `<button class="btn btn-sm ${qn ? 'btn-primary' : ''}" data-t="${p.id}">${qn ? 'В заказе' : 'Добавить'}</button>`;
      const size = crop.aspect < 1 ? 'height:150px;width:auto;' : crop.aspect === 1 ? 'height:136px;width:136px;' : 'width:100%;height:auto;';
      return `<div class="crop"><div class="slot"><div class="frame ${S.fit ? 'fit' : ''} ${qn ? '' : 'dim'}" style="aspect-ratio:${crop.aspect};${size}${bgStyle(p, crop)}"></div><span class="q ${q.lvl}"><span class="dot"></span>${q.label}</span></div>
        <div class="hint ${q.lvl}">${hint}</div><div class="meta"><span class="num">${p.w}×${p.h}</span>${ctrl}</div></div>`;
    }).join('');
    let info = '';
    if (kind === 'each') {
      const all = sel.length ? Math.max(...sel.map((p) => S.qty[p.id] || 0)) : 0;
      info = `<div class="seg" role="group" aria-label="Как печатать"><button data-fit="0" aria-pressed="${!S.fit}">Заполнить кадр</button><button data-fit="1" aria-pressed="${S.fit}">С белыми полями</button></div>
        <div class="inset">Фото с телефона — 3:4, а ${esc(prod.name.replace('Фото ', ''))} — ${prod.ratio === 1 ? '1:1' : prod.id === 'p10x15' ? '2:3' : 'другой формат'}. ${S.fit ? 'Кадр целиком, по краям белые поля.' : 'Кадрируем сами — по главному в кадре.'}</div>
        <div class="allqty"><span>Ко всем фото</span><span class="stepper"><button id="allm" aria-label="Меньше ко всем">−</button><output>${all}</output><button id="allp" aria-label="Больше ко всем">+</button></span></div>`;
    } else if (kind === 'set') {
      const need = prod.photos[0];
      info = it.enough
        ? `<div class="inset"><b>${esc(prod.name)}</b>: мы взяли ${it.photos} лучших ${plural(it.photos, 'кадр', 'кадра', 'кадров')} и разложит их по страницам. Касание — убрать или вернуть кадр.</div>`
        : `<div class="warnbox">Нужно минимум ${need} фото — сейчас ${it.photos}. Добавьте ещё ${need - it.photos} или выберите другой продукт.</div>`;
    } else {
      info = `<div class="inset"><b>${esc(prod.name)}</b>: мы выбрали кадр, которому хватает пикселей на большой формат. Можно добавить ещё.</div>`;
    }
    const up = upsell();
    const upHtml = up ? `<div class="ai-note upsell"><span class="ai-ava">ИИ</span><div class="ai-body">${esc(up.text)}
        <div class="row"><button class="btn btn-sm btn-primary" data-up="${up.id}">Добавить · ${money(up.price)}</button></div></div></div>` : '';
    return {
      html: `<div class="chips-row" role="group" aria-label="Продукт">${chips}</div>${info}
        ${lowCount ? `<div class="warnbox"><span>${lowCount} ${plural(lowCount, 'фото маловато', 'фото маловаты', 'фото маловаты')} для этого формата</span><button class="btn btn-sm" id="droplow">Убрать</button></div>` : ''}
        <div class="crops">${tiles}</div>${upHtml}`,
      bar: `<button class="btn btn-primary btn-xl" id="add" ${it.enough && it.sum > 0 ? '' : 'disabled'}>В корзину · ${kind === 'set' ? it.photos + ' фото' : it.count + ' шт'} · ${money(it.sum)}</button>
        ${S.cart.length ? `<div class="sub">В корзине уже ${S.cart.length} ${plural(S.cart.length, 'позиция', 'позиции', 'позиций')} · <a href="#" id="tocart">открыть</a></div>` : ''}`,
      bind(scr) {
        const keep = () => { const t = scr.scrollTop; render(); $('#screen').scrollTop = t; };
        scr.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { setProduct(b.dataset.p); haptic(); keep(); }; });
        scr.querySelectorAll('[data-fit]').forEach((b) => { b.onclick = () => { S.fit = b.dataset.fit === '1'; keep(); }; });
        scr.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { S.qty[b.dataset.m] = Math.max(0, (S.qty[b.dataset.m] || 0) - 1); keep(); }; });
        scr.querySelectorAll('[data-pl]').forEach((b) => { b.onclick = () => { S.qty[b.dataset.pl] = Math.min(99, (S.qty[b.dataset.pl] || 0) + 1); keep(); }; });
        scr.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { S.qty[b.dataset.t] = S.qty[b.dataset.t] ? 0 : 1; haptic(); keep(); }; });
        const am = $('#allm'), ap = $('#allp');
        if (am) am.onclick = () => { const v = Math.max(0, Math.max(...selected().map((p) => S.qty[p.id] || 0)) - 1); selected().forEach((p) => { S.qty[p.id] = v; }); keep(); };
        if (ap) ap.onclick = () => { const v = Math.min(99, Math.max(...selected().map((p) => S.qty[p.id] || 0)) + 1); selected().forEach((p) => { S.qty[p.id] = v; }); keep(); };
        const dl = $('#droplow');
        if (dl) dl.onclick = () => { selected().forEach((p) => { if (quality(p, prod, cropFor(p, prod, S.fit)).lvl === 'low') S.qty[p.id] = 0; }); keep(); };
        scr.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => addUpsell(b.dataset.up); });
        $('#add').onclick = () => { putInCart(draftItem()); haptic('ok'); go(3); };
        const tc = $('#tocart'); if (tc) tc.onclick = (e) => { e.preventDefault(); go(3); };
      },
    };
  }

  /* шаг 3 — корзина и оформление */
  function vCart() {
    const ph = (it) => { const p = S.photos.find((x) => x.id === (it.lines[0] || {}).id); return p ? p.thumb : ''; };
    const items = S.cart.map((it, i) => `<div class="item"><div class="ph" style="background-image:url(${ph(it)})"><em>${it.kind === 'set' ? it.photos : it.count}</em></div>
        <div><b>${esc(it.name)}</b><span>${it.kind === 'set' ? it.photos + ' фото в одном изделии' : it.count + ' шт × ' + money(it.price) + (it.fit ? ' · с полями' : '')}</span><button class="rm" data-rm="${i}">Убрать</button></div>
        <div class="sum">${money(it.sum)}</div></div>`).join('');
    const up = upsell();
    const d = deliv();
    const opts = C.delivery.map((o) => `<label class="opt"><input type="radio" name="dl" value="${o.id}" ${o.id === S.delivery ? 'checked' : ''}>
        <span><b>${esc(o.name)}</b><small>${o.id === 'pickup' ? 'Фото — от 1 часа, остальное — по готовности' : o.id === 'courier' ? 'Завтра, в удобное время' : '2–3 дня'}</small></span><span class="p">${o.price ? money(o.price) : 'бесплатно'}</span></label>`).join('');
    const where = S.delivery === 'pickup'
      ? `<div class="field"><label for="branch">Салон</label><select class="select" id="branch">${SALONS.map((s) => `<option value="${s.id}" ${s.id === S.branch ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>`
      : `<div class="field"><label for="addr">${S.delivery === 'courier' ? 'Адрес в Минске' : 'Индекс и адрес'}</label><input class="input" id="addr" autocomplete="street-address" value="${esc(S.address)}" placeholder="${S.delivery === 'courier' ? 'ул. Сурганова, 57' : '220000, Минск, ул. …'}"></div>`;
    return {
      html: S.cart.length ? `<div class="items">${items}</div>
        <button class="btn btn-sm btn-ghost" id="more" style="margin-top:4px">+ Добавить другой продукт</button>
        ${up ? `<div class="ai-note upsell"><span class="ai-ava">ИИ</span><div class="ai-body">${esc(up.text)}<div class="row"><button class="btn btn-sm btn-primary" data-up="${up.id}">Добавить · ${money(up.price)}</button></div></div></div>` : ''}
        <p class="sec-t">Получение</p><div class="opts">${opts}</div>${where}
        <p class="sec-t">Контакты</p>
        <div class="field"><label for="nm">Имя</label><input class="input" id="nm" autocomplete="given-name" value="${esc(S.name)}" placeholder="Как к вам обращаться"></div>
        <div class="field"><label for="tel">Телефон</label><input class="input" id="tel" type="tel" inputmode="tel" autocomplete="tel" value="${esc(S.phone)}" placeholder="+375 29 000-00-00"></div>
        <p class="sec-t">Оплата</p>
        <div class="opts"><label class="opt"><input type="radio" name="pay" checked><span><b>При получении</b><small>Картой или наличными в салоне / курьеру</small></span><span></span></label>
          <label class="opt disabled"><input type="radio" name="pay" disabled><span><b>Картой онлайн</b><small>Скоро</small></span><span></span></label>
          <label class="opt disabled"><input type="radio" name="pay" disabled><span><b>ЕРИП</b><small>Скоро</small></span><span></span></label></div>
        <div class="totals"><div><span>Товары</span><span class="num">${money(itemsSum())}</span></div><div><span>${esc(d.name)}</span><span class="num">${d.price ? money(d.price) : '0,00 BYN'}</span></div>
          <div class="grand"><span>Итого</span><span class="num">${money(total())}</span></div></div>
        ${S.payErr ? `<p class="err" role="alert">${esc(S.payErr)}</p>` : ''}`
        : `<div class="loading"><p>Корзина пуста</p><button class="btn" id="more" style="margin-top:14px">Выбрать формат</button></div>`,
      bar: S.cart.length ? `<button class="btn btn-primary btn-xl" id="order">Оформить заказ · ${money(total())}</button><div class="sub">Без регистрации · оплата при получении</div>` : '',
      bind(scr) {
        const keep = () => { const t = scr.scrollTop; render(); $('#screen').scrollTop = t; };
        $('#more').onclick = () => go(2);
        scr.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { S.cart.splice(+b.dataset.rm, 1); keep(); }; });
        scr.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => addUpsell(b.dataset.up); });
        scr.querySelectorAll('input[name=dl]').forEach((r) => { r.onchange = () => { S.delivery = r.value; keep(); }; });
        const br = $('#branch'); if (br) br.onchange = () => { S.branch = br.value; };
        const ad = $('#addr'); if (ad) ad.oninput = () => { S.address = ad.value; };
        const nm = $('#nm'); if (nm) nm.oninput = () => { S.name = nm.value; };
        const tel = $('#tel'); if (tel) tel.oninput = () => { S.phone = tel.value; };
        const o = $('#order'); if (o) o.onclick = placeOrder;
      },
    };
  }

  async function placeOrder(opts) {
    opts = opts || {};
    S.payErr = '';
    const digits = S.phone.replace(/\D/g, '');
    if (!S.name.trim()) S.payErr = 'Укажите имя';
    else if (digits.length < 9) S.payErr = 'Укажите телефон — напишем, когда заказ будет готов';
    else if (S.delivery !== 'pickup' && S.address.trim().length < 5) S.payErr = 'Укажите адрес доставки';
    if (S.payErr) { render(); const s = $('#screen'); s.scrollTop = s.scrollHeight; return; }
    const btn = $('#order'); if (btn) { btn.disabled = true; btn.textContent = 'Оформляю…'; }
    S.tDone = Date.now();
    const timeSec = Math.max(1, Math.round((S.tDone - S.t0) / 1000));
    const d = deliv(), salon = SALONS.find((s) => s.id === S.branch);
    const thumbIds = [...new Set(S.cart.flatMap((it) => it.lines.map((l) => l.id)))].slice(0, 3);
    const thumbs = thumbIds.map((id) => S.photos.find((p) => p.id === id)).filter(Boolean).map((p) => {
      const img = new Image(); img.src = p.thumb; return img;
    });
    await Promise.all(thumbs.map((i) => i.decode ? i.decode().catch(() => {}) : null));
    const prev = await api.list('orders');
    const num = 'М-' + (1001 + prev.filter((o) => o.channel === 'mobile').length);
    const order = {
      number: num, channel: 'mobile', source: 't2', status: 'new',
      items: S.cart.map((it) => ({ product: it.productId, name: it.name, qty: it.kind === 'set' ? 1 : it.count, photos: it.photos, price: it.price, sum: it.sum, fit: it.fit })),
      itemsTotal: itemsSum(), total: total(), photos: new Set(S.cart.flatMap((it) => it.lines.map((l) => l.id))).size,
      delivery: { id: d.id, name: d.name, price: d.price }, branch: S.delivery === 'pickup' ? { id: salon.id, name: salon.name } : null,
      address: S.delivery === 'pickup' ? '' : S.address.trim(), name: S.name.trim(), phone: S.phone.trim(),
      payment: 'при получении', timeSec, ready: readyText(), demo: S.demo || undefined,
      thumbs: thumbs.map((i) => toDataURL(i, i.naturalWidth, i.naturalHeight, 160, 0.7)),
      history: [{ ts: localIso(), status: 'new' }],
    };
    if (opts.dry || params.get('dry') === '1') { S.order = Object.assign({ id: 'dry', ts: localIso() }, order); }
    else {
      try { S.order = await api.add('orders', order); }
      catch (e) { S.tDone = null; S.payErr = 'Не удалось отправить заказ — проверьте связь и попробуйте ещё раз'; render(); return; }
    }
    haptic('ok');
    go(4);
    startPoll();
  }
  function readyText() {
    const days = S.cart.map((it) => { const m = /(\d+)\s*д/.exec(P[it.productId].ready || ''); return m ? +m[1] : 0; });
    const max = Math.max(0, ...days);
    if (S.delivery === 'pickup') return max ? `через ${max} ${plural(max, 'день', 'дня', 'дней')} в салоне` : 'сегодня, от 1 часа';
    if (S.delivery === 'courier') return max ? `курьер через ${max + 1} ${plural(max + 1, 'день', 'дня', 'дней')}` : 'курьер завтра';
    return `почтой через ${max + 3} ${plural(max + 3, 'день', 'дня', 'дней')}`;
  }

  /* шаг 4 — готово */
  function vDone() {
    const o = S.order || {};
    const idx = Math.max(0, STATUSES.findIndex((s) => s.id === o.status));
    const where = o.branch ? 'Самовывоз: ' + o.branch.name : o.delivery ? o.delivery.name + (o.address ? ', ' + o.address : '') : '';
    return {
      html: `<div class="done-hero"><div class="ok-ico">${ICON.ok}</div>
          <h1>Заказ <span class="num-o">${esc(o.number || '')}</span> принят</h1>
          <div class="timer-pill">Оформлен за <b>${mmss(o.timeSec || 0)}</b> — от выбора фото</div></div>
        <div class="card-flat"><div class="track" id="track"><span class="fill" style="width:${idx / 3 * 75}%"></span>
          ${STATUSES.map((s, i) => `<div class="${i <= idx ? 'on' : ''} ${i === idx ? 'cur' : ''}"><i>${i <= idx ? '✓' : ''}</i>${s.name}</div>`).join('')}</div>
          <p class="muted" style="margin-top:14px;font-size:14px;text-align:center">Готовность: <b style="color:var(--ink)">${esc(o.ready || '')}</b><br>${esc(where)}</p></div>
        <div class="card-flat"><div class="items">${(o.items || []).map((it) => `<div class="item" style="grid-template-columns:1fr auto"><div><b>${esc(it.name)}</b><span>${it.qty > 1 ? it.qty + ' шт' : it.photos + ' фото'}</span></div><div class="sum">${money(it.sum)}</div></div>`).join('')}</div>
          <div class="totals" style="margin-top:10px"><div class="grand" style="border:0;padding:0;margin:0"><span>Итого, при получении</span><span class="num">${money(o.total || 0)}</span></div></div></div>
        <div class="ai-note"><span class="ai-ava">ИИ</span><div class="ai-body">Напишу, когда заказ будет готов. Заказ уже в очереди салона и на пульте руководителя.</div></div>`,
      bar: `<button class="btn btn-lg" id="new" style="width:100%">Новый заказ</button>`,
      bind() { $('#new').onclick = resetAll; },
    };
  }
  function startPoll() {
    stopPoll();
    if (!S.order || S.order.id === 'dry') return;
    S.poll = setInterval(async () => {
      const list = await api.list('orders');
      const fresh = list.find((x) => x.id === S.order.id);
      if (fresh && fresh.status !== S.order.status) { S.order = fresh; haptic('ok'); if (S.step === 4) render(); }
    }, 3000);
  }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }
  function resetAll() {
    stopPoll();
    Object.assign(S, { step: 0, photos: [], filter: 'on', analyzing: null, product: 'p10x15', fit: false, qty: {}, cart: [], address: '', payErr: '', t0: null, tDone: null, order: null, demo: false });
    render();
  }

  /* ---------------- запуск ---------------- */
  $('#file').addEventListener('change', (e) => { loadFiles(e.target.files); e.target.value = ''; });
  $('#screen').addEventListener('scroll', (e) => { $('#head').classList.toggle('scrolled', e.target.scrollTop > 4); }, { passive: true });

  // Telegram Mini App: если открыто внутри Telegram — развернуть и подставить имя
  window.__tgReady = function () {
    try {
      const tg = window.Telegram && Telegram.WebApp;
      if (!tg || !tg.initData) return;
      tg.ready(); tg.expand();
      document.documentElement.classList.add('tg-app');
      const u = tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u && !S.name) S.name = u.first_name || '';
    } catch (e) { /* не в Telegram */ }
  };
  if (window.Telegram) window.__tgReady();

  render();

  // режим показа: ?demo=1&step=N (&dry=1 — не сохранять заказ)
  if (params.get('demo') === '1') {
    (async () => {
      await demoGallery();
      const step = +(params.get('step') || 1);
      if (step >= 2) go(2);
      if (step >= 3) { putInCart(draftItem()); go(3); }
      if (step >= 4) { S.name = 'Анна'; S.phone = '+375 29 111-22-33'; S.t0 = Date.now() - 47000; await placeOrder({ dry: params.get('dry') === '1' }); }
    })();
  }
})();
