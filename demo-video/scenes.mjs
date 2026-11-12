// Сцены ролика: что открыть и что сделать на настоящем экране. Время — в секундах ролика от начала сцены.
// Данные тестовые; имя и телефон в заказе — выдуманные.
const hubDot = (name) => `([...document.querySelectorAll('#map .hub')].find((h) => h.querySelector('.nm').textContent === ${JSON.stringify(name)}).querySelector('.dot'))`;
const byText = (t, sel = 'button, a, [role=button], label') => `([...document.querySelectorAll(${JSON.stringify(sel)})].filter((b) => b.offsetParent).find((b) => b.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(t)})))`;
const token = (key, store) => (t) => `try { ${store}.setItem('fp-token', ${JSON.stringify(t[key])}); } catch (e) {}`;

async function type(c, sel, text, per = 0.06) {
  await c.evaluate(`document.querySelector(${JSON.stringify(sel)}).focus()`);
  for (let i = 1; i <= text.length; i++) {
    await c.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(text.slice(0, i))}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await c.wait(per);
  }
  await c.evaluate(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new Event('change', { bubbles: true }))`);
}

export const SCENES = {
  /* 1. Пульт: граф компании → сфера «Производство» → показатель «Заказы в срок» → разбор до причины */
  pulse: {
    w: 1440, h: 900, logins: ['director'], boot: token('director', 'sessionStorage'),
    async run(c) {
      await c.goto('/t1/');
      await c.until(`document.querySelectorAll('#map .hub').length > 5`);
      await c.realWait(2500);
      c.start();
      await c.at(1.3);
      await c.hover(hubDot('Производство'), 0.9);
      // сфера раскрывается тем же обработчиком, что и при наведении: при покадровой съёмке фокус срабатывает без задержки
      await c.evaluate(`${hubDot('Производство')}.closest('.hub').focus()`); c.mark('hub');
      await c.at(4.7);
      const kid = `(document.querySelector('#map .kids.is-open .kid[data-kpi="on_time"]'))`;
      const kr = await c.hover(`(document.querySelector('#map .kids.is-open .kid[data-kpi="on_time"] circle'))`, 0.8);
      c.mark('click', { x: kr.x, y: kr.y });
      await c.evaluate(`${kid}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`); c.mark('kpi');
      await c.until(`document.querySelector('#layer') && /Заказы в срок/.test(document.querySelector('#layer').innerText)`);
      await c.wait(3.2);
      await c.hover(`(document.querySelector('#layer .btn-primary') || document.querySelector('#layer button'))`, 0.9); c.mark('decide');
      await c.wait(1.3);
    },
  },

  /* 2. ИИ-шлюз: куда уходят запросы, что скрыто, журнал */
  gate: {
    w: 1440, h: 900, logins: ['director'], boot: token('director', 'sessionStorage'),
    async run(c) {
      // свежие записи в журнале: вопрос о деньгах (остаётся внутри) и обычные вопросы
      const tok = c.tokens.director;
      await c.api('/api/pult/ai/ask', { question: 'Что с валовой маржой?' }, tok);
      await c.api('/api/pult/ai/ask', { question: 'Что с браком на производстве?' }, tok);
      await c.api('/api/pult/ai/ask', { question: 'Как дела в поддержке клиентов?' }, tok);
      await c.goto('/t1/#v=data&d=14');
      await c.until(`!!document.querySelector('.gate')`);
      await c.realWait(2500);
      c.start();
      await c.at(2.6);
      const sm = await c.hover(`(document.querySelector('.gate details summary'))`, 0.8);
      c.mark('click', { x: sm.x, y: sm.y });
      await c.evaluate(`document.querySelector('.gate details summary').click()`); c.mark('journal');
      await c.wait(0.9);
      const box = `(() => { const v = document.querySelector('#view'); return v && v.scrollHeight > v.clientHeight + 4 ? v : document.scrollingElement; })()`;
      await c.evaluate(`window.__glide(${box}, 330, 1500)`);
      await c.wait(2.2);
    },
  },

  /* 3. Помощник в телефоне: вопрос голосом → ответ; затем встреча → отчёт */
  helper: {
    w: 390, h: 844, dpr: 3, mobile: true, logins: ['director'],
    // у съёмки нет микрофона: распознавание заменено «молчащим», чтобы оно не отправляло обрывки фраз само
    boot: (t) => token('director', 'localStorage')(t) + ` window.webkitSpeechRecognition = window.SpeechRecognition = class { start() {} stop() {} abort() {} };`,
    async run(c) {
      await c.goto('/helper/');
      await c.until(`!!document.querySelector('#studio #stIn')`);
      await c.realWait(2500);
      c.start();
      await c.at(1.3);
      await c.tap('.st-mode [data-m="voice"]'); c.mark('voice');
      await c.wait(0.9);
      // слова вопроса подставляются в то же поле, куда их пишет распознавание речи
      const q = 'Что с браком на производстве?'.split(' ');
      for (let i = 1; i <= q.length; i++) { await c.evaluate(`document.querySelector('#vYou').textContent = ${JSON.stringify(q.slice(0, i).join(' '))}`); await c.wait(0.24); }
      await c.wait(0.3);
      c.mark('ask');
      c.evaluate(`window.Studio.voiceAsk('Что с браком на производстве?')`).catch(() => { });
      await c.until(`!!document.querySelector('#vAnswer p')`, 60000); c.mark('answer');
      await c.wait(3.0);
      await c.tap('.v-kind [data-k="meet"]'); c.mark('meet');
      await c.wait(0.5);
      const lines = ['коллеги начинаем главная тема заказы в срок на прошлой неделе 81 процент при плане 92',
        'узкое место участок переплёта в смене не хватает двух переплётчиков очередь выросла до 640 заказов',
        'решили на сезон берём трёх временных переплётчиков ольга викторовна согласуйте с агентством выход до пятницы',
        'дмитрий андреевич подготовьте план обучения временных переплётчиков до субботы',
        'премию переплётчикам за ноябрь пока не решаем вынесем на следующую планёрку'];
      for (const ln of lines) { await c.wait(0.75); await c.evaluate(`window.Studio.meetFeed([${JSON.stringify(ln)}])`); c.mark('line'); }
      await c.wait(1.0);
      await c.tap('[data-sa="vend"]'); c.mark('finish');
      await c.until(`!!document.querySelector('.meetcard')`, 120000); c.mark('report');
      await c.wait(2.2);
      await c.evaluate(`window.__glide(document.querySelector('#stLog'), document.querySelector('#stLog').scrollTop + 520, 2600)`);
      await c.wait(3.2);
    },
  },

  /* 4. Приложение picPac: заставка → продукт → фото и авто-проверка → оформление → статус заказа меняется с производства */
  app: {
    w: 390, h: 844, dpr: 3, mobile: true, logins: ['operator'],
    async run(c) {
      await c.goto('/t2/');
      await c.until(`!!document.querySelector('#intro')`);
      c.start();
      await c.until(`document.querySelector('#intro').classList.contains('choose')`); c.mark('choose');
      await c.wait(1.3);
      await c.tap('#introNew'); c.mark('home');
      await c.wait(1.5);
      await c.tap(byText('Фотопечать Фото из телефона')); c.mark('product');
      await c.wait(1.2);
      await c.tap('#next'); c.mark('photos');
      await c.wait(0.8);
      await c.tap('#demo'); c.mark('demo');
      await c.until(`!!document.querySelector('#dropbad')`, 30000); c.mark('checked');
      await c.wait(1.6);
      await c.tap('#dropbad'); c.mark('dropped');
      await c.wait(1.3);
      for (let i = 0; i < 4 && !(await c.rect('#nm')); i++) {
        await c.evaluate(`[...document.querySelectorAll('#bar button')].filter((x) => x.offsetParent && !x.disabled).pop().click()`);
        c.mark('next'); await c.wait(1.1);
      }
      c.mark('cart');
      const scr = `(document.querySelector('#screen'))`;
      await c.evaluate(`window.__glide(${scr}, document.querySelector('#nm').getBoundingClientRect().top + ${scr}.scrollTop - 230, 900)`);
      await c.wait(1.0);
      await type(c, '#nm', 'Анна');
      await type(c, '#tel', '+375 29 123-45-67', 0.045);
      await c.wait(0.4);
      await c.tap('#order'); c.mark('order');
      await c.until(`/Статус заказа/.test(document.querySelector('#screen').innerText)`, 30000); c.mark('done');
      await c.wait(1.8);
      // производство отмечает этапы — приложение само получает новый статус
      const staff = c.tokens.operator;
      const oid = await c.evaluate(`(JSON.parse(localStorage.getItem('pp_orders') || '[]')[0] || {}).id || ''`);
      for (const action of ['accept', 'handoff', 'accept']) {
        const r = oid ? await c.api('/api/app/staff/orders/' + oid + '/mark', { action }, staff) : { error: 'нет заказа' };
        c.mark('mark', { action, ok: !r.error, note: r.error || '' });
        await c.wait(2.2);
      }
      await c.wait(1.2);
    },
  },
};
