// Покадровый рендер comp.html в headless Chrome через DevTools Protocol.
//   node render.mjs --times 2.1,34,62.5            пробные кадры (PNG) в $WORK/test
//   node render.mjs --from 0 --to 58 [--step 1]    кадры JPEG в $WORK/out (номер кадра = t·fps)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const WORK = process.env.WORK; if (!WORK) throw new Error('нужна переменная WORK — папка с кадрами сцен');
const EDL = JSON.parse(readFileSync(join(HERE, 'edl.json'), 'utf8'));
const FPS = EDL.fps, W = EDL.W, H = EDL.H;       // кадры сцен: $WORK/shots/<сцена>/
const PAGE = 'file://' + join(HERE, 'comp.html');
const PORT = 9300 + Math.floor(Math.random() * 600);
const OUT = resolve(args.out || join(WORK, args.times ? 'test' : 'out'));
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'fp-render-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  `--window-size=${W},${H}`, '--force-device-scale-factor=1', '--force-color-profile=srgb',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--allow-file-access-from-files',
  'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(150);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!target) { chrome.kill(); throw new Error('Chrome не запустился'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let seq = 0; const waiting = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
const cdp = (method, params = {}) => new Promise((ok, fail) => {
  const id = ++seq; waiting.set(id, m => m.error ? fail(new Error(method + ': ' + m.error.message)) : ok(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expr => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};

await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await cdp('Page.enable');
await cdp('Page.navigate', { url: PAGE });
for (let i = 0; i < 300; i++) { await sleep(100); if (await evaluate('window.__fontsReady === true').catch(() => false)) break; }
if (!await evaluate('window.__fontsReady === true')) { chrome.kill(); throw new Error('страница не готова (шрифты или видео)'); }
await evaluate(`window.__load(${JSON.stringify(EDL)}, ${JSON.stringify('file://' + join(WORK, 'shots') + '/')}); 1`);
await sleep(200);

async function shot(t, file, format) {
  await evaluate(`window.__render(${t}); window.__settle().then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))))`);
  const { data } = await cdp('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 94 : undefined, fromSurface: true,
    clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  writeFileSync(file, Buffer.from(data, 'base64'));
}

const started = Date.now();
if (args.times) {
  const times = String(args.times).split(',').map(Number);
  for (const t of times) await shot(t, join(OUT, `t_${t.toFixed(2).padStart(6, '0')}.png`), 'png');
  console.log(`готово: ${times.length} пробных кадров → ${OUT}`);
} else {
  const step = +(args.step || 1);
  const i0 = Math.round(+(args.from || 0) * FPS), i1 = Math.min(Math.round(+(args.to || EDL.dur) * FPS), Math.round(EDL.dur * FPS));
  let n = 0;
  for (let i = i0; i < i1; i += step) {
    const f = join(OUT, `f_${String(i).padStart(5, '0')}.jpg`);
    if (args.skip && existsSync(f)) continue;
    await shot(i / FPS, f, 'jpeg');
    if (++n % 120 === 0) process.stdout.write(`кадр ${i}/${i1} (${Math.round((Date.now() - started) / 1000)} с)\n`);
  }
  console.log(`готово: ${n} кадров [${i0}–${i1}) за ${Math.round((Date.now() - started) / 1000)} с → ${OUT}`);
}
ws.close(); chrome.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
