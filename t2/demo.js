/* Тестовая галерея: 20 нарисованных кадров (резкие, размытые, дубли, тёмный, маленький). Нужна для показа без своих фото. */
(function () {
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
  window.DemoGallery = { DEMO, render1, NAMES, SIZES };
})();
