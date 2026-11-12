// Съёмка настоящих экранов системы для демо-ролика.
//   node capture.mjs <сцена> [--probe]     кадры в $WORK/shots/<сцена>/ + shot.json (времена кадров и события)
// Как получается плавно: анимации страницы замедляются в RATE раз (CSS-переходы — через DevTools, часы страницы — подменой
// performance.now и Date.now), кадры снимаются с обычной скоростью, а в монтаже время сжимается обратно. 15 кадров в секунду
// съёмки при замедлении вчетверо дают 60 кадров на секунду ролика. Сервер — локальный (BASE), данные тестовые.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { SCENES } = await import(process.env.SCENES_FILE || './scenes.mjs');

const BASE = process.env.BASE || 'http://127.0.0.1:8820';
const WORK = process.env.WORK;
if (!WORK) throw new Error('нужна переменная WORK — папка для кадров');
const name = process.argv[2], PROBE = process.argv.includes('--probe');
const scene = SCENES[name];
if (!scene) throw new Error('нет сцены ' + name + '; есть: ' + Object.keys(SCENES).join(', '));
const RATE = process.env.RATE ? +process.env.RATE : PROBE ? 1 : (scene.rate || 0.2);
const OUT = join(WORK, 'shots', name);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, body, token) => {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return r.json();
};

const PORT = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'fp-shot-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', 'about:blank',
], { stdio: 'ignore' });
let target;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(150);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* ещё не поднялся */ }
}
if (!target) { chrome.kill(); throw new Error('Chrome не запустился'); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let seq = 0; const waiting = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
const cdp = (method, params = {}) => new Promise((ok, fail) => {
  const id = ++seq; waiting.set(id, (m) => (m.error ? fail(new Error(method + ': ' + m.error.message)) : ok(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};

const { w, h, dpr = 2, mobile = false } = scene;
await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
if (mobile) await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36' });
await cdp('Page.enable');
await cdp('Animation.enable');
await cdp('Animation.setPlaybackRate', { playbackRate: RATE });

// вход: токен кладётся в хранилище до загрузки страницы; часы страницы замедляются вместе с анимациями
const tokens = {};
for (const login of scene.logins || []) tokens[login] = (await api('/api/login', { login, password: 'demo2026' })).token;
const boot = `(() => { const R = ${RATE}; const pn = performance.now.bind(performance), p0 = pn(); performance.now = () => p0 + (pn() - p0) * R;
  const dn = Date.now.bind(Date), d0 = dn(); Date.now = () => Math.round(d0 + (dn() - d0) * R);
  window.__glide = (el, to, dur) => new Promise((done) => { const from = el.scrollTop, t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; el.scrollTop = from + (to - from) * e; if (k < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  ${scene.boot ? scene.boot(tokens) : ''} })();`;
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: boot });

const frames = [], events = [];
let t0 = 0, running = false, n = 0;
const now = () => (performance.now() - t0) * RATE / 1000;            // время сцены в секундах ролика
async function loop() {
  while (running) {
    const t = now();
    const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 90, captureBeyondViewport: false });
    const file = `f_${String(n++).padStart(5, '0')}.jpg`;
    writeFileSync(join(OUT, file), Buffer.from(r.data, 'base64'));
    frames.push([+((t + now()) / 2).toFixed(4), file]);
  }
}
const ctx = {
  BASE, api, tokens, evaluate, cdp, RATE, PROBE,
  now,
  /** ждать до момента t (секунды ролика от начала сцены) */
  at: async (t) => { const ms = (t - now()) * 1000 / RATE; if (ms > 0) await sleep(ms); },
  wait: (sec) => sleep(sec * 1000 / RATE),
  realWait: sleep,
  goto: async (path) => { await cdp('Page.navigate', { url: BASE + path }); },
  until: async (expr, timeout = 20000) => { const s = Date.now(); while (Date.now() - s < timeout) { if (await evaluate(expr).catch(() => false)) return true; await sleep(100); } throw new Error('не дождался: ' + expr); },
  rect: (sel) => evaluate(`(() => { const el = ${sel.startsWith('(') ? sel : `document.querySelector(${JSON.stringify(sel)})`}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; })()`),
  mark: (type, data = {}) => events.push(Object.assign({ t: +now().toFixed(3), type }, data)),
  /** курсор мыши: настоящая мышь переносится в точку (срабатывает :hover), в монтаже курсор дорисовывается по событиям */
  hover: async (sel, dur = 0.7) => {
    const r = await ctx.rect(sel); if (!r) throw new Error('нет элемента ' + sel);
    events.push({ t: +now().toFixed(3), type: 'move', x: r.x, y: r.y, dur });
    await ctx.wait(dur);
    // подход в два шага: одиночное первое перемещение мыши браузер может не засчитать как наведение
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x - 26, y: r.y - 18 });
    await sleep(60);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    return r;
  },
  click: async (sel, dur = 0.5) => {
    const r = await ctx.hover(sel, dur);
    events.push({ t: +now().toFixed(3), type: 'click', x: r.x, y: r.y });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    return r;
  },
  /** касание на телефоне: в монтаже рисуется круг, на странице — обычный щелчок по элементу */
  tap: async (sel) => {
    const r = await ctx.rect(sel); if (!r) throw new Error('нет элемента ' + sel);
    events.push({ t: +now().toFixed(3), type: 'tap', x: r.x, y: r.y });
    await ctx.wait(0.12);
    await evaluate(`(${sel.startsWith('(') ? sel : `document.querySelector(${JSON.stringify(sel)})`}).click()`);
    return r;
  },
  still: async (label) => { const r = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); const f = join(OUT, `probe_${label}.jpg`); writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('  снимок', f); },
  start: () => { t0 = performance.now(); if (!PROBE) { running = true; ctx.loopDone = loop(); } },
};

try {
  await scene.run(ctx);
} finally {
  running = false;
  if (ctx.loopDone) await ctx.loopDone;
  writeFileSync(join(OUT, 'shot.json'), JSON.stringify({ name, w, h, dpr, rate: RATE, dur: +now().toFixed(3), frames, events }));
  console.log(`${name}: ${frames.length} кадров, ${now().toFixed(1)} с ролика, ${(frames.length / Math.max(0.01, now())).toFixed(0)} кадров на секунду ролика`);
  ws.close(); chrome.kill(); await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
