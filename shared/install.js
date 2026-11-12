/* Установка на экран «Домой» — общая для приложения picPac и помощника руководителя.
   Android и компьютер (Chrome, Edge): браузер сам предлагает установку — показываем кнопку и вызываем его окно.
   iPhone и iPad: установка только через меню «Поделиться» — показываем три шага.
   Лист появляется, если страница открыта с ?install=1 (кнопка «Скачать», QR) или вызвано FPInstall.open(). */
(() => {
  'use strict';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPad представляется компьютером Mac
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const name = (document.querySelector('meta[name="application-name"]') || {}).content || document.title;
  const icon = (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || '';
  let deferred = null, sheet = null;

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (sheet) draw(); });
  window.addEventListener('appinstalled', () => { deferred = null; close(); });

  const css = `.fpi-back{position:fixed;inset:0;z-index:9999;display:grid;align-items:end;justify-items:center;background:rgba(38,59,57,.34);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:fpi-in .2s ease-out}
.fpi{width:min(440px,100%);margin:0 0 max(12px,env(safe-area-inset-bottom));padding:20px 20px 16px;border-radius:26px;background:#fff;color:#141414;font:15px/1.45 Onest,system-ui,-apple-system,sans-serif;box-shadow:0 24px 60px rgba(38,59,57,.28);animation:fpi-up .32s cubic-bezier(.23,1,.32,1)}
@media(max-width:460px){.fpi{width:calc(100% - 16px)}}
.fpi-head{display:flex;gap:14px;align-items:center;margin-bottom:14px}.fpi-head img{width:56px;height:56px;border-radius:14px;box-shadow:0 2px 10px rgba(38,59,57,.14)}
.fpi-head b{display:block;font-size:17px;font-weight:600;line-height:1.25}.fpi-head small{color:#666666;font-size:13.5px}
.fpi ol{margin:0 0 14px;padding:0;list-style:none;display:grid;gap:8px;counter-reset:s}
.fpi li{counter-increment:s;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;background:#F5F2EF}
.fpi li::before{content:counter(s);flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#141414;color:#fff;font-size:13px;font-weight:600}
.fpi li svg{flex:none;width:20px;height:20px;margin-left:auto;color:#141414}
.fpi p{margin:0 0 14px;color:#333333}
.fpi-row{display:flex;gap:8px}.fpi-row button{flex:1;min-height:48px;border-radius:14px;border:1px solid #D9D4CE;background:#fff;color:#141414;font:inherit;font-weight:500;cursor:pointer}
.fpi-row .fpi-go{background:#141414;border-color:#141414;color:#fff}
.fpi-row button:active{transform:scale(.98)}
@keyframes fpi-in{from{opacity:0}}@keyframes fpi-up{from{transform:translateY(24px);opacity:0}}
@media(prefers-reduced-motion:reduce){.fpi,.fpi-back{animation:none}}`;
  const share = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>';
  const plus = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function body() {
    if (ios) {
      const safari = !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(ua);
      return `<ol><li><span>Нажмите «Поделиться»${safari ? ' внизу экрана' : ' в меню браузера'}</span>${share}</li>
        <li><span>Выберите «На экран „Домой“»</span>${plus}</li><li><span>Нажмите «Добавить» — значок появится рядом с другими приложениями</span></li></ol>
        <div class="fpi-row"><button type="button" data-fpi="close" class="fpi-go">Понятно</button></div>`;
    }
    if (deferred) return `<p>Приложение откроется на весь экран, как обычное, и появится среди ваших приложений. Места почти не занимает.</p>
      <div class="fpi-row"><button type="button" data-fpi="close">Не сейчас</button><button type="button" data-fpi="go" class="fpi-go">Установить</button></div>`;
    return `<ol><li><span>Откройте меню браузера — три точки вверху</span></li><li><span>Выберите «Установить приложение» или «Добавить на главный экран»</span>${plus}</li></ol>
      <div class="fpi-row"><button type="button" data-fpi="close" class="fpi-go">Понятно</button></div>`;
  }
  function draw() {
    sheet.querySelector('.fpi').innerHTML = `<div class="fpi-head">${icon ? `<img src="${esc(icon)}" alt="">` : ''}<div><b>${esc(name)}</b><small>Установить на экран телефона</small></div></div>${body()}`;
  }
  function open() {
    if (standalone || sheet) return;
    if (!document.getElementById('fpi-css')) { const st = document.createElement('style'); st.id = 'fpi-css'; st.textContent = css; document.head.append(st); }
    sheet = document.createElement('div'); sheet.className = 'fpi-back';
    sheet.innerHTML = '<div class="fpi" role="dialog" aria-modal="true" aria-label="Установка приложения"></div>';
    sheet.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fpi]');
      if (e.target === sheet || (b && b.dataset.fpi === 'close')) return close();
      if (b && b.dataset.fpi === 'go' && deferred) { const ev = deferred; deferred = null; ev.prompt(); try { await ev.userChoice; } catch (err) { /* окно закрыли */ } close(); }
    });
    document.body.append(sheet); draw();
  }
  function close() {
    if (sheet) { sheet.remove(); sheet = null; }
    const u = new URL(location.href);
    if (u.searchParams.has('install')) { u.searchParams.delete('install'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  }

  window.FPInstall = { open, close, standalone, canPrompt: () => !!deferred, ios };
  if (new URLSearchParams(location.search).get('install') === '1' && !standalone) {
    // даём браузеру секунду сообщить, что установка доступна: тогда на Android сразу будет кнопка «Установить»
    const start = () => setTimeout(open, ios ? 500 : 1100);
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
  }
})();
