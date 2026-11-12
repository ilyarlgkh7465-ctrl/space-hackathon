/* Заставка при входе в picPac. Пока идёт заставка, приложение загружается под ней (гость, каталог, черновик).
   Уже вошедший клиент видит только логотип — и сразу попадает в приложение.
   Остальные выбирают: «Я новый клиент» → каталог, «Я уже заказывал» → вход по логину. Касание по заставке её ускоряет. */
(() => {
  'use strict';
  const el = document.getElementById('intro');
  if (!el || new URLSearchParams(location.search).get('nointro') === '1') { if (el) el.hidden = true; return; }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const theme = document.querySelector('meta[name="theme-color"]');
  const ready = new Promise((res) => { if (window.picpacReady) res(); else document.addEventListener('picpac:ready', res, { once: true }); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let skip = null;
  const skipped = new Promise((r) => { skip = r; });

  function session() { try { return JSON.parse(localStorage.getItem('pp_session') || 'null'); } catch (e) { return null; } }
  const member = () => { const s = session(); return !!(s && s.user && !/^g-/.test(s.user.id)); };   // не гость — уже наш клиент

  function leave(then) {
    el.classList.add('leave');
    if (theme) theme.content = '#FFFFFF';
    if (then) then();
    setTimeout(() => { el.hidden = true; }, reduce ? 0 : 340);
  }

  async function run() {
    setTimeout(() => el.classList.add('write'), 40);              // не rAF: в фоновой вкладке он не срабатывает
    await Promise.race([wait(reduce ? 500 : 1500), skipped]);
    await ready;
    if (member()) { leave(); return; }
    el.classList.add('choose');
    if (theme) theme.content = '#0E0E10';
    document.getElementById('introNew').focus({ preventScroll: true });
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) { skip(); return; }
    if (b.id === 'introNew') leave(() => window.picpacGo && window.picpacGo('home'));
    if (b.id === 'introOld') leave(() => window.picpacGo && window.picpacGo('login'));
    if (b.id === 'introSkip') leave(() => window.picpacGo && window.picpacGo('home'));
  });
  run();
})();
