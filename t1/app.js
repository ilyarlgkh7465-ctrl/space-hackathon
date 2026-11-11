/* Пульт причин (Трек 1): показатели четырёх блоков → провал до корневой причины → решение с ответственным → контроль.
   Данные — shared/company.js, хранилище и ИИ — shared/api.js. */
(() => {
  'use strict';
  const C = window.COMPANY;
  const S = C.series;
  const $ = (s, r = document) => r.querySelector(s);
  const last = (a) => a[a.length - 1];
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const nowIso = () => { const d = new Date(); return isoDay(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const TODAY = isoDay(new Date());
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v) => fmt.money(Math.round(v));
  const sMoney = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt.n(Math.abs(Math.round(v))) + ' BYN';
  const sNum = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt.n(Math.abs(v));
  const dateRu = (iso) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '—';
  const person = (id) => C.person(id) || { name: id || '—', role: '' };

  /* ---------- производные ряды ---------- */
  const SER = Object.assign({}, S, {
    costs: { plan: S.revenue.plan.map((r, i) => r - S.profit.plan[i]), fact: S.revenue.fact.map((r, i) => r - S.profit.fact[i]), unit: 'BYN', good: 'down' },
    margin: { plan: S.profit.plan.map((p, i) => p / S.revenue.plan[i] * 100), fact: S.profit.fact.map((p, i) => p / S.revenue.fact[i] * 100), unit: '%', good: 'up' },
  });

  const DOM = {
    finance: { name: 'Финансы', c: 'var(--fin)' },
    clients: { name: 'Клиенты', c: 'var(--cli)' },
    production: { name: 'Производство', c: 'var(--prod)' },
    hr: { name: 'Кадры', c: 'var(--hr)' },
  };
  const domChip = (d, text) => `<span class="dom dom-${d}">${esc(text || DOM[d].name)}</span>`;

  /* ---------- факторный анализ прибыли (цепные подстановки) ---------- */
  const q0 = last(S.orders.plan), p0 = last(S.avgCheck.plan), q1 = last(S.orders.fact);
  const r0 = last(S.revenue.plan), r1 = last(S.revenue.fact);
  const pr0 = last(S.profit.plan), pr1 = last(S.profit.fact);
  const CP = C.costs['2026-10-plan'], CF = C.costs['2026-10'], CS = C.costs['2026-09'];
  const F = {
    orders: (q1 - q0) * p0,                  // −11 520: меньше заказов при плановом чеке
    check: r1 - q1 * p0,                     // −1 680: чек ниже плана
    materials: CP.materials - CF.materials,  // +1 800 (по статичному плану)
    payroll: CP.payroll - CF.payroll,        // −1 100
    social: CP.social - CF.social,           // −350
    rent: CP.rent - CF.rent,
    other: CP.other - CF.other,              // +50
  };
  const volume = r1 / r0;                    // гибкий бюджет: материалы зависят от объёма
  const FLEX = {
    materials: CP.materials * volume, payroll: CP.payroll, social: CP.social, rent: CP.rent, other: CP.other,
  };
  const overMaterials = CF.materials - FLEX.materials;          // ≈ 2 950
  const overTotal = Object.keys(FLEX).reduce((s, k) => s + CF[k] - FLEX[k], 0); // ≈ 4 350
  const round10 = (v) => Math.round(v / 10) * 10;
  const ch = (id) => C.channels.find((c) => c.id === id);
  const lab = (id) => C.production.find((p) => p.id === id);
  const evt = (date) => { const e = C.events.find((x) => x.date === date); return e ? { date: e.date, text: e.text, domain: e.area } : null; };

  /* ---------- граф причин ---------- */
  const NODES = {
    profit: {
      domain: 'finance', title: 'Прибыль ниже плана на ' + fmt.n(pr0 - pr1) + ' BYN', short: 'Прибыль 32 800 BYN вместо 45 600',
      sum: 'Факторный анализ методом цепных подстановок: прибыль = заказы × средний чек − затраты. Каждая строка — вклад фактора. Щёлкните строку, чтобы идти глубже.',
      kpis: () => [['План', money(pr0)], ['Факт', money(pr1)], ['Отклонение', fmt.signed(fmt.delta(pr1, pr0)) + ' %'], ['Сентябрь', money(SER.profit.fact[3])]],
      effect: pr1 - pr0, view: viewProfit, children: ['orders', 'avgcheck', 'materials', 'payroll'],
    },
    revenue: {
      domain: 'finance', parent: 'profit', title: 'Выручка ниже плана на ' + fmt.n(r0 - r1) + ' BYN', short: 'Заказы × средний чек',
      sum: 'Выручка = заказы × средний чек. Главный вклад — число заказов, и почти весь он в одной точке продаж.',
      kpis: () => [['План', money(r0)], ['Факт', money(r1)], ['Отклонение', fmt.signed(fmt.delta(r1, r0)) + ' %'], ['Сентябрь', money(SER.revenue.fact[3])]],
      effect: r1 - r0, view: viewRevenue, children: ['orders', 'avgcheck'],
    },
    costs: {
      domain: 'finance', parent: 'profit', title: 'Затраты: по плану норма, к объёму — перерасход ' + fmt.n(round10(overTotal)) + ' BYN', short: 'Гибкий бюджет',
      sum: 'По статичному плану затраты даже ниже на 400 BYN. Но заказов меньше на 5 %, значит бумаги должно было уйти меньше. Пересчитываем план на фактический объём — и видим перерасход.',
      kpis: () => [['План', money(r0 - pr0)], ['План к объёму', money(Object.values(FLEX).reduce((a, b) => a + b, 0))], ['Факт', money(r1 - pr1)], ['Перерасход', sMoney(round10(overTotal))]],
      effect: -round10(overTotal), view: viewFlex, children: ['materials', 'payroll'],
    },
    orders: {
      domain: 'clients', parent: 'profit', title: 'Заказов на ' + fmt.n(q0 - q1) + ' меньше плана', short: 'Почти весь минус — салон «Галерея»',
      sum: 'Минус почти целиком в одной точке: «Галерея» недобрала 520 заказов. Остальные салоны — в плане или выше, значит спрос есть и дело не в рынке.',
      kpis: () => [['План', fmt.n(q0)], ['Факт', fmt.n(q1)], ['Отклонение', fmt.signed(fmt.delta(q1, q0)) + ' %'], ['Влияние', sMoney(F.orders)]],
      effect: F.orders, view: viewOrders, children: ['gallery', 'online'],
    },
    avgcheck: {
      domain: 'clients', parent: 'profit', title: 'Средний чек ' + nf2.format(r1 / q1) + ' BYN вместо ' + nf2.format(p0), short: 'Онлайн: меньше фотокниг',
      sum: 'В салонах чек в норме. Просел онлайн: там меньше заказов фотокниг — самого дорогого продукта, — после волны жалоб на просрочку.',
      kpis: () => [['План', nf2.format(p0) + ' BYN'], ['Факт', nf2.format(r1 / q1) + ' BYN'], ['Отклонение', fmt.signed(fmt.delta(r1 / q1, p0)) + ' %'], ['Влияние', sMoney(F.check)]],
      effect: F.check, view: viewCheck, children: ['online'],
    },
    online: {
      domain: 'clients', parent: 'avgcheck', title: 'Онлайн: −2 600 BYN, просели фотокниги', short: 'Чек 31,01 вместо 32,00',
      sum: 'Заказов онлайн почти по плану, но дорогих фотокниг меньше: клиенты, получившие книгу с опозданием, не возвращаются. Повторные клиенты — 38 % вместо 41 %.',
      kpis: () => { const o = ch('online'); return [['План', money(o.plan.revenue)], ['Факт', money(o.fact.revenue)], ['Заказы', fmt.n(o.fact.orders) + ' / ' + fmt.n(o.plan.orders)], ['Повторные', last(S.repeatShare.fact) + ' %']]; },
      effect: ch('online').fact.revenue - ch('online').plan.revenue, evidence: () => [evt('2026-10-15'), evt('2026-10-20')], children: ['books'],
    },
    gallery: {
      domain: 'clients', parent: 'orders', title: 'Салон «Галерея»: −11 500 BYN, заказы −35 %', short: 'Закрыт 7 дней из 31',
      sum: 'Салон не работал 7 дней из 31. В остальные дни администратор была одна — подстраховки не было весь месяц.',
      kpis: () => { const g = ch('gallery'); return [['Выручка', money(g.fact.revenue) + ' / ' + fmt.n(g.plan.revenue)], ['Заказы', fmt.n(g.fact.orders) + ' / ' + fmt.n(g.plan.orders)], ['Закрыт', g.closedDays + ' дней'], ['Явка', fmt.n1(g.attendance) + ' %']]; },
      effect: ch('gallery').fact.revenue - ch('gallery').plan.revenue, view: viewSalons, evidence: () => [evt('2026-09-30'), evt('2026-10-13')], children: ['gallery_staff'],
    },
    gallery_staff: {
      domain: 'hr', parent: 'gallery', title: 'Кадры «Галереи»: явка 61 %, подстраховки нет', short: 'По отбивке 13–19.10 — никого',
      sum: 'По отбивке видно: с 13 по 19 октября в салон никто не пришёл. Единственный администратор на больничном, вторая ставка пустует с 30 сентября.',
      kpis: () => [['Явка', '61 % / 96 %'], ['Ставок', '1 из 2'], ['Больничный', '13–19.10'], ['Замена', 'не назначена']],
      effect: ch('gallery').fact.revenue - ch('gallery').plan.revenue, view: viewCalendar, evidence: () => [evt('2026-09-30'), evt('2026-10-13')], children: ['root_gallery'],
    },
    root_gallery: {
      domain: 'hr', parent: 'gallery_staff', root: 'gallery', title: 'Нет кадрового резерва: вакансия открыта 23 дня', short: 'Решение от 01.10 просрочено',
      sum: 'Решение «Открыть вакансию администратора» приняли на планёрке 1 октября со сроком 15.10 и не выполнили. Пульт это видит, потому что решения ведутся в нём же.',
      kpis: () => { const d = state.decisions.find((x) => x.id === 'd-0901'); return [['Вакансия', '23 дня (норма 14)'], ['Решение 01.10', d ? statusLabel(d) : 'просрочено'], ['Замена', 'не назначена'], ['Потери', '≈ 11 500 BYN']]; },
      effect: ch('gallery').fact.revenue - ch('gallery').plan.revenue,
      evidence: () => [evt('2026-09-30'), { date: '2026-10-01', text: 'Планёрка: решение «Открыть вакансию, дать замену из салона «Центр»», ответственная — Елена Шубина, срок 15.10' }, { date: '2026-10-16', text: 'Срок прошёл — кандидата нет, замену не дали' }, evt('2026-10-13')],
      chain: [['hr', 'Вакансия 23 дня'], ['hr', 'Явка 61 %'], ['clients', 'Закрыт 7 дней, −520 заказов'], ['finance', '−11 500 BYN']],
    },
    materials: {
      domain: 'finance', parent: 'profit', title: 'Материалы: перерасход ' + fmt.n(round10(overMaterials)) + ' BYN к объёму', short: 'Перепечатки брака',
      sum: 'По статичному плану всё хорошо: на 1 800 BYN меньше. Но выручка упала на 5,8 %, а бумаги ушло почти столько же. Разница — перепечатки брака.',
      kpis: () => [['План', money(CP.materials)], ['План к объёму', money(FLEX.materials)], ['Факт', money(CF.materials)], ['Перерасход', sMoney(round10(overMaterials))]],
      effect: -round10(overMaterials), view: viewMaterials, children: ['lab2'],
    },
    lab2: {
      domain: 'production', parent: 'materials', title: 'Минилаб №2: брак 11,4 % — в 5 раз выше соседнего', short: '6 980 перепечаток',
      sum: 'Два одинаковых аппарата, одна бумага, а брак разный: 2,3 % и 11,4 %. Значит, причина не в материалах, а в работе на конкретном аппарате.',
      kpis: () => [['Брак №2', fmt.n1(lab('lab2').defectRate) + ' %'], ['Брак №1', fmt.n1(lab('lab1').defectRate) + ' %'], ['Перепечаток', fmt.n(lab('lab2').reprints)], ['Стоимость', money(lab('lab2').reprintCost)]],
      effect: -lab('lab2').reprintCost, view: viewLabs, evidence: () => [evt('2026-10-06'), evt('2026-10-07'), evt('2026-10-20')], children: ['root_lab2'],
    },
    root_lab2: {
      domain: 'hr', parent: 'lab2', root: 'lab2', title: 'Пропущены 3 калибровки, новый оператор без обучения', short: 'Наставник не закреплён',
      sum: 'Регламент — калибровка раз в неделю. Павел Жук вышел 6 октября и не прошёл обучение калибровке по порядку адаптации, наставника к нему не закрепили. Брак пошёл с середины месяца.',
      kpis: () => [['Пропущено', '3 калибровки'], ['Последняя', '07.10'], ['Обучение', 'не пройдено'], ['Потери', '≈ ' + fmt.n(round10(overMaterials)) + ' BYN + 90 ч']],
      effect: -round10(overMaterials),
      evidence: () => [evt('2026-10-06'), evt('2026-10-07'), { date: '2026-10-28', text: 'Калибровка минилаба №1 — по графику; на №2 — нет записи в журнале' }, evt('2026-10-24')],
      chain: [['hr', 'Оператор без обучения'], ['production', 'Брак 11,4 %'], ['clients', '31 жалоба на цвет'], ['finance', '−2 950 BYN, +90 ч']],
    },
    payroll: {
      domain: 'hr', parent: 'profit', title: 'Оплата труда +1 450 BYN со взносами', short: 'Сверхурочные 212 ч',
      sum: 'Штат меньше плана на 3 человека, а фонд оплаты больше: цех закрывал брак и просрочку сверхурочными.',
      kpis: () => [['План', money(CP.payroll + CP.social)], ['Факт', money(CF.payroll + CF.social)], ['Штат', last(S.headcount.fact) + ' из ' + last(S.headcount.plan)], ['Сверхурочные', last(S.overtime.fact) + ' ч']],
      effect: F.payroll + F.social, view: viewPayroll, children: ['overtime'],
    },
    overtime: {
      domain: 'hr', parent: 'payroll', title: 'Сверхурочные 212 ч вместо 60', short: 'Брак + просрочка фотокниг',
      sum: 'Лишние 152 часа — не нагрузка от клиентов, а исправление собственных ошибок: перепечатки с минилаба №2 и догоняющий переплёт фотокниг.',
      kpis: () => [['План', '60 ч'], ['Факт', '212 ч'], ['Лишние', '152 ч'], ['Стоимость', '≈ 1 450 BYN']],
      effect: F.payroll + F.social, view: viewOvertime, evidence: () => [evt('2026-10-24')], children: ['lab2', 'books'],
    },
    books: {
      domain: 'production', parent: 'online', title: 'Фотокниги: просрочка 14,2 % при норме 3 %', short: 'Переплётчик в отпуске',
      sum: 'Фотокниги переплетает один человек. Пока он был в отпуске, книги копились: 14,2 % ушли клиентам с опозданием.',
      kpis: () => [['Просрочка', '14,2 %'], ['Норма', '≤ 3 %'], ['Фотокниг', fmt.n(lab('bind').output)], ['Переплётчиков', '1']],
      effect: ch('online').fact.revenue - ch('online').plan.revenue, evidence: () => [evt('2026-10-15'), evt('2026-10-20')], children: ['root_books'],
    },
    root_books: {
      domain: 'hr', parent: 'books', root: 'books', title: 'Единственный переплётчик ушёл в отпуск без замены', short: 'Нет кросс-обучения',
      sum: 'Отпуск согласовали, а замену — нет: второго человека, умеющего переплетать, в цехе нет. 24 жалобы на просрочку, онлайн-выручка −2 600 BYN.',
      kpis: () => [['Отпуск', '15–26.10'], ['Замена', 'нет'], ['Жалобы', '24'], ['Потери', '≈ 2 600 BYN + 62 ч']],
      effect: ch('online').fact.revenue - ch('online').plan.revenue, evidence: () => [evt('2026-10-15'), evt('2026-10-20')],
      chain: [['hr', 'Отпуск без замены'], ['production', 'Просрочка книг 14,2 %'], ['clients', '24 жалобы'], ['finance', '−2 600 BYN, +62 ч']],
    },
    complaints: {
      domain: 'clients', title: 'Жалобы: 64 вместо 20, NPS упал до 41', short: 'Цвет, просрочка, закрытый салон',
      sum: 'Жалобы втрое выше плана, и у каждой группы — своя производственная или кадровая причина. Щёлкните группу.',
      kpis: () => [['Жалобы', '64 / 20'], ['NPS', last(S.nps.fact) + ' / ' + last(S.nps.plan)], ['Повторные', last(S.repeatShare.fact) + ' %'], ['Сентябрь', S.complaints.fact[3] + ' жалоба']],
      effect: 0, view: viewComplaints, evidence: () => [evt('2026-10-20')], children: ['lab2', 'books', 'gallery'],
    },
  };
  Object.keys(NODES).forEach((id) => { NODES[id].id = id; });

  /* что помощник скажет без модели — заранее под каждую корневую причину */
  const FALLBACK = {
    gallery: {
      summary: 'Салон «Галерея» потерял 520 заказов и 11 500 BYN выручки: 7 дней он был закрыт. Корень кадровый — после увольнения 30.09 замену не нашли за 23 дня, решение от 1 октября просрочено, а второй администратор ушла на больничный, и подстраховки не было.',
      cause: 'Нет кадрового резерва: одна ставка пустует 23 дня, замену из других салонов не назначили.',
      proposals: [
        { action: 'Закрепить сменщика из салона «Центр» за «Галереей» до найма (график 2/2)', owner_id: 'grinko', due_days: 2, effect_byn: 9800, metric: 'Дни закрытия салона', target: '0 дней в месяц' },
        { action: 'Поднять оклад вакансии на 10 % и разместить на трёх площадках', owner_id: 'shubina', due_days: 10, effect_byn: 11500, metric: 'Дней открыта вакансия', target: '≤ 14 дней' },
        { action: 'Правило: в каждом салоне не меньше 3 обученных сотрудников на 2 ставки', owner_id: 'kovalev', due_days: 30, effect_byn: 0, metric: 'Явка по салонам', target: '≥ 96 %' },
      ],
    },
    lab2: {
      summary: 'Брак на минилабе №2 — 11,4 % против 2,3 % на соседнем. С 7 октября не было ни одной калибровки (по регламенту — раз в неделю), а с 6 октября там работает новый оператор без обучения. Перепечатки съели 2 300 BYN бумаги и дали 31 жалобу на цвет, цех закрывал хвосты сверхурочными.',
      cause: 'Новый оператор не обучен калибровке, наставник не закреплён — 3 калибровки пропущены.',
      proposals: [
        { action: 'Откалибровать минилаб №2 сегодня и вести журнал калибровки по регламенту', owner_id: 'morozov', due_days: 1, effect_byn: 2300, metric: 'Брак минилаба №2', target: '≤ 2,5 %' },
        { action: 'Обучить Павла Жука калибровке с наставником, допуск — после проверки', owner_id: 'petrovich', due_days: 5, effect_byn: 650, metric: 'Сверхурочные цеха', target: '≤ 60 ч' },
        { action: 'Напоминание о калибровке в чат цеха каждый понедельник', owner_id: 'morozov', due_days: 2, effect_byn: 0, metric: 'Пропущенные калибровки', target: '0' },
      ],
    },
    books: {
      summary: 'Фотокниги ушли в просрочку 14,2 %: единственный переплётчик был в отпуске 15–26 октября, замены не было. 24 жалобы, онлайн-выручка −2 600 BYN, средний чек ниже плана, повторных клиентов меньше.',
      cause: 'Переплёт держится на одном человеке: отпуск согласовали без замены.',
      proposals: [
        { action: 'Обучить второго сотрудника цеха переплёту фотокниг', owner_id: 'morozov', due_days: 14, effect_byn: 2600, metric: 'Просрочка фотокниг', target: '≤ 3 %' },
        { action: 'Согласовывать отпуск единственных специалистов только с заменой', owner_id: 'shubina', due_days: 7, effect_byn: 0, metric: 'Участки без замены', target: '0' },
        { action: 'Написать клиентам с просрочкой и дать промокод −15 % на следующий заказ', owner_id: 'yatskevich', due_days: 2, effect_byn: 1200, metric: 'Повторные клиенты', target: '≥ 41 %' },
      ],
    },
  };
  const ROOTS = {
    gallery: { node: 'root_gallery', eff: '−11 500 BYN выручки', deviation: 'Прибыль −12 800 BYN к плану; салон «Галерея»: выручка −11 500 BYN, заказы −35 %, закрыт 7 дней', baseline: '7 дней закрыт' },
    lab2: { node: 'root_lab2', eff: '−2 950 BYN перерасход', deviation: 'Материалы: перерасход 2 950 BYN к объёму; брак минилаба №2 — 11,4 % при норме 2,5 %', baseline: 'брак 11,4 %' },
    books: { node: 'root_books', eff: '−2 600 BYN онлайн', deviation: 'Онлайн-выручка −2 600 BYN; просрочка фотокниг 14,2 % при норме 3 %; 24 жалобы', baseline: 'просрочка 14,2 %' },
  };

  /* ---------- плитки ---------- */
  const TILES = {
    finance: [['profit', 'Прибыль', 'profit'], ['revenue', 'Выручка', 'revenue'], ['costs', 'Затраты', 'costs'], ['margin', 'Рентабельность продаж', 'profit']],
    clients: [['orders', 'Заказы', 'orders'], ['avgCheck', 'Средний чек', 'avgcheck'], ['complaints', 'Жалобы', 'complaints'], ['nps', 'NPS', 'complaints']],
    production: [['output', 'Выпуск отпечатков', 'lab2'], ['defectRate', 'Брак и перепечатки', 'lab2'], ['overdueRate', 'Заказы с просрочкой', 'books'], ['utilization', 'Загрузка оборудования', 'lab2']],
    hr: [['attendance', 'Явка по отбивке', 'gallery_staff'], ['overtime', 'Сверхурочные', 'overtime'], ['headcount', 'Штат', 'root_gallery'], ['vacancyDays', 'Вакансия открыта', 'root_gallery']],
  };

  const state = { mode: 'plan', stack: [], decisions: [], health: null, ordersN: null, orders: [], ai: {}, vecMode: 'prev', openRow: null, newId: null };

  /* ---------- значения и сравнение ---------- */
  function parts(key, v) {
    const u = SER[key].unit;
    if (u === 'BYN') return [key === 'avgCheck' ? nf2.format(v) : fmt.n(Math.round(v)), 'BYN'];
    if (u === '%') return [fmt.n1(v), '%'];
    if (u === 'отпечатков') return [fmt.n(v), 'шт'];
    return [fmt.n(v), u];
  }
  function cmp(key) {
    const s = SER[key];
    const fact = last(s.fact);
    const base = state.mode === 'plan' ? last(s.plan) : s.fact[s.fact.length - 2];
    const rel = base ? (fact - base) / Math.abs(base) * 100 : 0;
    const better = s.good === 'up' ? rel : -rel;
    const st = better >= -1 ? 'ok' : better >= -5 ? 'warn' : 'bad';
    let txt;
    if (s.unit === '%') txt = fmt.signed(fact - base) + ' п.п.';
    else if (['ч', 'дн', 'чел', ''].includes(s.unit) || key === 'complaints') txt = sNum(Math.round(fact - base)) + (s.unit && s.unit !== 'шт' ? ' ' + s.unit : '');
    else txt = fmt.signed(rel) + ' %';
    return { fact, base, rel, st, txt };
  }

  function spark(s) {
    const all = s.plan.concat(s.fact);
    let min = Math.min.apply(null, all), max = Math.max.apply(null, all);
    if (max === min) { max += 1; min -= 1; }
    const W = 96, H = 40, p = 5, n = s.fact.length;
    const x = (i) => p + i * (W - 2 * p) / (n - 1);
    const y = (v) => H - p - (v - min) / (max - min) * (H - 2 * p);
    const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="plan" d="${path(s.plan)}"/><path class="fact" d="${path(s.fact)}"/><circle cx="${x(n - 1).toFixed(1)}" cy="${y(last(s.fact)).toFixed(1)}" r="3"/></svg>`;
  }

  /* ---------- главное ---------- */
  function renderHero() {
    const c = cmp('profit');
    $('#hero-value').textContent = fmt.n(c.fact) + ' BYN';
    const d = $('#hero-delta');
    d.textContent = fmt.signed(c.rel) + ' % ' + (state.mode === 'plan' ? 'к плану' : 'к сентябрю');
    d.className = 'chip chip-' + c.st;
    const gap = Math.abs(c.fact - c.base);
    $('#hero-text').textContent = (c.fact < c.base ? 'Ниже ' : 'Выше ') + (state.mode === 'plan' ? 'плана' : 'сентября') + ' на ' + fmt.n(gap) +
      ' BYN. Все три корня — кадровые: салон без замены, оператор без обучения, переплётчик без подмены. Финансы, клиенты, производство и кадры здесь связаны одной цепочкой.';
    $('#hero-roots').innerHTML = Object.keys(ROOTS).map((k) => {
      const n = NODES[ROOTS[k].node];
      return `<li><button class="root-link" data-open="${n.id}"><b>${esc(n.title)}</b><span class="eff">${esc(ROOTS[k].eff)}</span>${chainHtml(n.chain)}</button></li>`;
    }).join('');
  }
  function chainHtml(chain) {
    return `<span class="chain">${chain.map((c, i) => (i ? '<span class="arr">→</span>' : '') + domChip(c[0], c[1])).join('')}</span>`;
  }

  /* ---------- блоки ---------- */
  function renderBlocks() {
    $('#blocks').innerHTML = Object.keys(TILES).map((dom) => {
      const tiles = TILES[dom].map(([key, label, node]) => {
        const c = cmp(key), [num, unit] = parts(key, c.fact);
        const baseTxt = state.mode === 'plan' ? 'план ' : 'сен ';
        const [bn, bu] = parts(key, c.base);
        return `<button class="tile st-${c.st}" data-open="${node}" aria-label="${esc(label)}: ${num} ${unit}, ${c.txt}. Открыть причины">
          <span class="lbl">${esc(label)}</span>
          <span class="val num">${num}<small>${unit}</small></span>
          <span class="meta"><span class="chip chip-${c.st}">${c.txt}</span>${baseTxt}${bn} ${bu}</span>
          ${spark(SER[key])}
        </button>`;
      }).join('');
      const live = dom === 'clients' ? `<div class="mobile-live" id="mobile-live">${mobileHtml()}</div>` : '';
      return `<article class="card block" style="--c:${DOM[dom].c}" aria-label="${DOM[dom].name}">
        <div class="block-head"><h2>${DOM[dom].name}</h2><span class="faint small">${state.mode === 'plan' ? 'факт / план' : 'окт / сен'}</span></div>
        ${live}${tiles}</article>`;
    }).join('');
  }

  /* ---------- новый мобильный канал (заказы из Трека 2) ---------- */
  const orderSum = (o) => +(o.total ?? o.sum ?? o.amount ?? o.price ?? 0) || 0;
  function mobileHtml() {
    const n = state.orders.length;
    const sum = state.orders.reduce((s, o) => s + orderSum(o), 0);
    const lastO = state.orders[n - 1];
    const when = lastO && lastO.ts ? 'последний в ' + new Date(lastO.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'ждём первый заказ';
    return `<span class="ico" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg></span>
      <div><b>Заказы с телефона</b><span>новый канал · ${n ? nf2.format(sum) + ' BYN · ' : ''}${when}</span></div>
      <span class="cnt" aria-live="polite">${n}</span>`;
  }
  async function pollOrders() {
    const list = await api.list('orders');
    const grew = state.ordersN !== null && list.length > state.ordersN;
    state.orders = list;
    state.ordersN = list.length;
    const el = $('#mobile-live');
    if (el) {
      el.innerHTML = mobileHtml();
      if (grew) {
        el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
        const o = last(list);
        toast('Новый заказ с телефона' + (orderSum(o) ? ': ' + nf2.format(orderSum(o)) + ' BYN' : ''));
      }
    }
  }

  /* ---------- провал до причины ---------- */
  function pathOf(id) {
    const out = [];
    let cur = id;
    while (cur) { out.unshift(cur); cur = NODES[cur].parent; }
    return out;
  }
  function openPath(id) {
    state.stack = pathOf(id);
    const dr = $('#drawer');
    $('#drawer-back').classList.remove('hidden');
    dr.classList.add('open');
    dr.setAttribute('aria-hidden', 'false');
    renderNode();
  }
  function closeDrawer() {
    const dr = $('#drawer');
    dr.classList.remove('open');
    dr.setAttribute('aria-hidden', 'true');
    $('#drawer-back').classList.add('hidden');
  }
  function go(id) { state.stack.push(id); renderNode(); }
  function back() { if (state.stack.length > 1) { state.stack.pop(); renderNode(); } else closeDrawer(); }

  function renderNode() {
    const node = NODES[last(state.stack)];
    $('#crumbs').innerHTML = state.stack.map((id, i) => {
      const n = NODES[id];
      const cur = i === state.stack.length - 1;
      return (i ? '<span class="sep">›</span>' : '') + `<button class="crumb" style="--c:${DOM[n.domain].c}" data-crumb="${i}" ${cur ? 'aria-current="page"' : ''}>${esc(n.short && !cur ? crumbName(n) : crumbName(n))}</button>`;
    }).join('');
    const kp = node.kpis().map(([k, v]) => `<div><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('');
    const ev = node.evidence ? node.evidence().filter(Boolean) : [];
    const kids = (node.children || []).map((id) => {
      const n = NODES[id];
      const e = n.effect ? `<span class="eff ${n.effect < 0 ? 'neg' : 'pos'}">${sMoney(n.effect)}</span>` : '<span></span>';
      return `<button class="next-btn" data-go="${id}">${domChip(n.domain)}<div><b>${esc(n.title)}</b><span>${esc(n.short)}</span></div>${e}</button>`;
    }).join('');
    const isRoot = !!node.root;
    $('#node').innerHTML = `<div class="node-enter">
      <div class="row">${domChip(node.domain)}${isRoot ? '<span class="chip chip-bad">Корневая причина</span>' : ''}</div>
      <h2 class="node-title" id="node-title" tabindex="-1">${esc(node.title)}</h2>
      <p class="node-sum">${esc(node.sum)}</p>
      <div class="nk">${kp}</div>
      ${node.view ? node.view() : ''}
      ${isRoot ? rootHtml(node) : ''}
      ${ev.length ? `<div class="sect"><h3>Доказательства</h3><ul class="ev">${ev.map((e) => `<li><time>${e.date ? e.date.slice(8, 10) + '.' + e.date.slice(5, 7) : ''}</time><span>${esc(e.text)}</span></li>`).join('')}</ul></div>` : ''}
      ${kids ? `<div class="sect"><h3>${node.id === 'profit' ? 'Куда смотреть дальше' : 'Причина глубже'}</h3><div class="next">${kids}</div></div>` : ''}
      ${node.id === 'profit' ? `<div class="sect"><h3>Три корня отклонения</h3><div class="next">${Object.keys(ROOTS).map((k) => { const n = NODES[ROOTS[k].node]; return `<button class="next-btn" data-go="${n.id}">${domChip(n.domain)}<div><b>${esc(n.title)}</b>${chainHtml(n.chain)}</div><span class="eff neg">${esc(ROOTS[k].eff)}</span></button>`; }).join('')}</div></div>` : ''}
    </div>`;
    $('#back').textContent = state.stack.length > 1 ? '← Назад' : '← Закрыть';
    $('#node-title').focus({ preventScroll: true });
    $('#drawer .drawer-body').scrollTop = 0;
  }
  function crumbName(n) {
    const map = { profit: 'Прибыль', revenue: 'Выручка', costs: 'Затраты', orders: 'Заказы', avgcheck: 'Средний чек', online: 'Онлайн', gallery: '«Галерея»', gallery_staff: 'Кадры салона', root_gallery: 'Корень', materials: 'Материалы', lab2: 'Минилаб №2', root_lab2: 'Корень', payroll: 'Оплата труда', overtime: 'Сверхурочные', books: 'Фотокниги', root_books: 'Корень', complaints: 'Жалобы' };
    return map[n.id] || n.title;
  }
  function rootHtml(node) {
    const cached = state.ai[node.id];
    return `<div class="sect"><div class="root-box">
        <h3>Как причина дошла до денег</h3>
        ${chainHtml(node.chain)}
        <div class="actions">
          <button class="btn btn-primary" data-explain="${node.id}">${cached ? 'Спросить ещё раз' : 'Объяснить причину'}</button>
          <button class="btn" data-decide="0">Оформить решение по отклонению</button>
        </div>
      </div>
      <div class="ai-wrap" id="ai-box">${cached ? aiHtml(node, cached) : ''}</div></div>`;
  }

  /* ---------- виды узлов ---------- */
  function wfHtml(steps) {
    let cum = 0, max = 0;
    const rows = steps.map((s) => {
      let from, to;
      if (s.base) { from = 0; to = s.v; cum = s.v; } else { from = cum; to = cum + s.v; cum = to; }
      max = Math.max(max, from, to);
      return Object.assign({}, s, { from, to });
    });
    max *= 1.04;
    return `<div class="sect"><h3>Факторы: от плана к факту</h3><div class="wf">${rows.map((r) => {
      const l = Math.min(r.from, r.to) / max * 100, w = Math.abs(r.to - r.from) / max * 100;
      const cls = r.base ? 'base' : r.v < 0 ? 'neg' : 'pos';
      const tag = r.node ? 'button' : 'div';
      return `<${tag} class="wf-row${r.base ? ' total' : ''}" ${r.node ? `data-go="${r.node}"` : ''}><span class="lab">${esc(r.label)}</span><span class="wf-track"><i class="${cls}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%"></i></span><span class="v">${r.base ? fmt.n(r.v) : sNum(Math.round(r.v))}</span></${tag}>`;
    }).join('')}</div></div>`;
  }
  function viewProfit() {
    return wfHtml([
      { label: 'План', v: pr0, base: true },
      { label: 'Заказы', v: F.orders, node: 'orders' },
      { label: 'Средний чек', v: F.check, node: 'avgcheck' },
      { label: 'Материалы', v: F.materials, node: 'materials' },
      { label: 'Оплата труда', v: F.payroll, node: 'payroll' },
      { label: 'Отчисления', v: F.social, node: 'payroll' },
      { label: 'Прочие', v: F.other },
      { label: 'Факт', v: pr1, base: true },
    ]) + `<p class="wf-note">Материалы «в плюсе» только потому, что заказов меньше. Если пересчитать план на фактический объём, это перерасход ${fmt.n(round10(overMaterials))} BYN — <button class="btn btn-sm btn-ghost" data-go="materials">разобрать →</button></p>`;
  }
  function divBars(rows, fmtV) {
    const mx = Math.max.apply(null, rows.map((r) => Math.abs(r.v))) || 1;
    return `<div class="bars">${rows.map((r) => {
      const w = Math.abs(r.v) / mx * 50;
      const tag = r.node ? 'button' : 'div';
      return `<${tag} class="bar-row" ${r.node ? `data-go="${r.node}"` : ''}><span>${esc(r.label)}</span><span class="dbar"><i class="${r.v < 0 ? 'neg' : 'pos'}" style="width:${w.toFixed(2)}%"></i></span><span class="v">${fmtV(r)}</span></${tag}>`;
    }).join('')}</div>`;
  }
  const chanNode = { gallery: 'gallery', online: 'online' };
  function viewRevenue() {
    const rows = C.channels.filter((c) => c.type !== 'mobile').map((c) => ({ label: c.name, v: c.fact.revenue - c.plan.revenue, node: chanNode[c.id] }))
      .sort((a, b) => a.v - b.v);
    return `<div class="sect"><h3>Заказы × средний чек</h3><div class="tbl-wrap"><table class="table">
        <tr><th>Фактор</th><th class="r">План</th><th class="r">Факт</th><th class="r">Влияние</th></tr>
        <tr><td><button class="btn btn-sm btn-ghost" data-go="orders">Заказы →</button></td><td class="r">${fmt.n(q0)}</td><td class="r">${fmt.n(q1)}</td><td class="r">${sMoney(F.orders)}</td></tr>
        <tr><td><button class="btn btn-sm btn-ghost" data-go="avgcheck">Средний чек →</button></td><td class="r">${nf2.format(p0)}</td><td class="r">${nf2.format(r1 / q1)}</td><td class="r">${sMoney(F.check)}</td></tr>
      </table></div></div>
      <div class="sect"><h3>Выручка по точкам продаж, отклонение от плана</h3>${divBars(rows, (r) => sNum(r.v))}</div>`;
  }
  function viewFlex() {
    const names = { materials: 'Материалы', payroll: 'Оплата труда', social: 'Отчисления', rent: 'Аренда и амортизация', other: 'Прочие' };
    const node = { materials: 'materials', payroll: 'payroll', social: 'payroll' };
    const rows = Object.keys(FLEX).map((k) => {
      const over = CF[k] - FLEX[k];
      return `<tr class="${over > 300 ? 'hl' : ''}"><td>${node[k] ? `<button class="btn btn-sm btn-ghost" data-go="${node[k]}">${names[k]} →</button>` : names[k]}</td><td class="r">${fmt.n(CP[k])}</td><td class="r">${fmt.n(Math.round(FLEX[k]))}</td><td class="r">${fmt.n(CF[k])}</td><td class="r">${sNum(Math.round(over))}</td></tr>`;
    }).join('');
    return `<div class="sect"><h3>Гибкий бюджет: план, пересчитанный на объём</h3><div class="tbl-wrap"><table class="table">
      <tr><th>Статья</th><th class="r">План</th><th class="r">К объёму</th><th class="r">Факт</th><th class="r">Перерасход</th></tr>${rows}
      <tr><td><b>Итого</b></td><td class="r">${fmt.n(r0 - pr0)}</td><td class="r">${fmt.n(Math.round(Object.values(FLEX).reduce((a, b) => a + b, 0)))}</td><td class="r">${fmt.n(r1 - pr1)}</td><td class="r"><b>${sNum(round10(overTotal))}</b></td></tr>
      </table></div><p class="wf-note">Материалы пересчитаны пропорционально выручке (${fmt.n1(volume * 100)} % от плана), остальные статьи — постоянные.</p></div>`;
  }
  function viewOrders() {
    const rows = C.channels.filter((c) => c.type !== 'mobile').map((c) => ({ label: c.name, v: c.fact.orders - c.plan.orders, pct: fmt.delta(c.fact.orders, c.plan.orders), node: chanNode[c.id] }))
      .sort((a, b) => a.v - b.v);
    rows.push({ label: 'Мобильный заказ (новый)', v: state.orders.length, pct: null });
    return `<div class="sect"><h3>Заказы по точкам продаж, отклонение от плана</h3>${divBars(rows, (r) => sNum(r.v) + (r.pct != null ? ' (' + fmt.signed(r.pct, 0) + ' %)' : ''))}</div>`;
  }
  function viewCheck() {
    const sal = C.channels.filter((c) => c.type === 'salon');
    const sp = sal.reduce((a, c) => ({ o: a.o + c.plan.orders, r: a.r + c.plan.revenue }), { o: 0, r: 0 });
    const sf = sal.reduce((a, c) => ({ o: a.o + c.fact.orders, r: a.r + c.fact.revenue }), { o: 0, r: 0 });
    const on = ch('online');
    return `<div class="sect"><h3>Средний чек по каналам, BYN</h3><div class="tbl-wrap"><table class="table">
      <tr><th>Канал</th><th class="r">План</th><th class="r">Факт</th><th class="r">Отклонение</th></tr>
      <tr><td>Салоны (6 точек)</td><td class="r">${nf2.format(sp.r / sp.o)}</td><td class="r">${nf2.format(sf.r / sf.o)}</td><td class="r">${fmt.signed(fmt.delta(sf.r / sf.o, sp.r / sp.o))} %</td></tr>
      <tr class="hl"><td><button class="btn btn-sm btn-ghost" data-go="online">Онлайн →</button></td><td class="r">${nf2.format(on.plan.revenue / on.plan.orders)}</td><td class="r">${nf2.format(on.fact.revenue / on.fact.orders)}</td><td class="r">${fmt.signed(fmt.delta(on.fact.revenue / on.fact.orders, on.plan.revenue / on.plan.orders))} %</td></tr>
      </table></div></div>`;
  }
  function viewSalons() {
    const sal = C.channels.filter((c) => c.type === 'salon');
    return `<div class="sect"><h3>Явка по отбивке и выполнение плана по салонам</h3><div class="tbl-wrap"><table class="table">
      <tr><th>Салон</th><th class="r">Явка</th><th class="r">Заказы к плану</th></tr>
      ${sal.map((c) => `<tr class="${c.id === 'gallery' ? 'hl' : ''}"><td>${esc(c.name)}</td><td class="r">${fmt.n1(c.attendance)} %</td><td class="r">${fmt.signed(fmt.delta(c.fact.orders, c.plan.orders))} %</td></tr>`).join('')}
      </table></div><p class="wf-note">Где явка в норме — план выполнен. Связь кадров и выручки видна прямо в таблице.</p></div>`;
  }
  function viewCalendar() {
    let cells = '';
    for (let d = 1; d <= 31; d++) {
      const off = d >= 13 && d <= 19;
      cells += `<span class="cal-d ${off ? 'off' : 'half'}" title="${d} октября: ${off ? 'никто не отметился' : 'отметился 1 из 2'}">${d}</span>`;
    }
    return `<div class="sect"><h3>Отбивка салона «Галерея», октябрь</h3><div class="cal">${cells}</div>
      <p class="wf-note"><span class="cal-key half"></span> 1 сотрудник из 2 &nbsp; <span class="cal-key off"></span> никто не отметился — салон закрыт</p></div>`;
  }
  function hbars(rows, unit) {
    const mx = Math.max.apply(null, rows.map((r) => r.v)) || 1;
    return `<div class="bars">${rows.map((r) => {
      const tag = r.node ? 'button' : 'div';
      return `<${tag} class="bar-row" ${r.node ? `data-go="${r.node}"` : ''}><span>${esc(r.label)}</span><span class="hbar"><i style="width:${(r.v / mx * 100).toFixed(1)}%;${r.muted ? 'background:var(--line2)' : ''}"></i></span><span class="v">${fmt.n(r.v)} ${unit}</span></${tag}>`;
    }).join('')}</div>`;
  }
  function viewMaterials() {
    return `<div class="sect"><h3>Из чего перерасход</h3>${hbars([
      { label: 'Перепечатки минилаба №2 (6 980 отп.)', v: lab('lab2').reprintCost, node: 'lab2' },
      { label: 'Химия и обложки сверх нормы', v: round10(overMaterials) - lab('lab2').reprintCost, muted: true },
    ], 'BYN')}</div>`;
  }
  function viewLabs() {
    const rows = C.production.filter((p) => p.id === 'lab1' || p.id === 'lab2');
    return `<div class="sect"><h3>Два одинаковых аппарата</h3><div class="tbl-wrap"><table class="table">
      <tr><th>Участок</th><th class="r">Выпуск</th><th class="r">Брак</th><th class="r">Калибровка</th><th>Оператор</th></tr>
      ${rows.map((p) => `<tr class="${p.id === 'lab2' ? 'hl' : ''}"><td>${esc(p.name)}</td><td class="r">${fmt.n(p.output)}</td><td class="r">${fmt.n1(p.defectRate)} %</td><td class="r">${p.calibratedAt.slice(8, 10)}.${p.calibratedAt.slice(5, 7)}</td><td>${esc(person(p.operator).name)}</td></tr>`).join('')}
      </table></div></div>`;
  }
  function viewPayroll() {
    return `<div class="sect"><h3>Фонд оплаты труда</h3><div class="tbl-wrap"><table class="table">
      <tr><th>Статья</th><th class="r">План</th><th class="r">Факт</th><th class="r">Разница</th></tr>
      <tr class="hl"><td><button class="btn btn-sm btn-ghost" data-go="overtime">Оплата труда →</button></td><td class="r">${fmt.n(CP.payroll)}</td><td class="r">${fmt.n(CF.payroll)}</td><td class="r">${sNum(CF.payroll - CP.payroll)}</td></tr>
      <tr><td>Отчисления на соцнужды</td><td class="r">${fmt.n(CP.social)}</td><td class="r">${fmt.n(CF.social)}</td><td class="r">${sNum(CF.social - CP.social)}</td></tr>
      <tr><td>Штат, чел</td><td class="r">${last(S.headcount.plan)}</td><td class="r">${last(S.headcount.fact)}</td><td class="r">${sNum(last(S.headcount.fact) - last(S.headcount.plan))}</td></tr>
      </table></div></div>`;
  }
  function viewOvertime() {
    return `<div class="sect"><h3>На что ушли часы</h3>${hbars([
      { label: 'Перепечатки минилаба №2', v: 90, node: 'lab2' },
      { label: 'Догоняющий переплёт фотокниг', v: 62, node: 'books' },
      { label: 'Плановые сверхурочные', v: 60, muted: true },
    ], 'ч')}</div>`;
  }
  function viewComplaints() {
    return `<div class="sect"><h3>Жалобы октября по причинам</h3>${hbars([
      { label: 'Цвет на отпечатках', v: 31, node: 'lab2' },
      { label: 'Просроченные фотокниги', v: 24, node: 'books' },
      { label: 'Салон закрыт, не дозвонились', v: 9, node: 'gallery' },
    ], '')}</div>`;
  }

  /* ---------- Объяснить причину ---------- */
  const toNum = (v) => typeof v === 'number' ? v : parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0;
  async function explain(nodeId) {
    const node = NODES[nodeId];
    const box = $('#ai-box');
    box.innerHTML = `<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><p class="typing">Помощник проходит путь от прибыли до причины</p></div></div>`;
    const path = pathOf(nodeId).map((id) => NODES[id]).map((n) => '- ' + DOM[n.domain].name + ': ' + n.title + '. ' + n.sum + ' Показатели: ' + n.kpis().map((k) => k[0] + ' ' + k[1]).join('; ')).join('\n');
    const facts = (node.evidence ? node.evidence() : []).filter(Boolean).map((e) => '- ' + (e.date || '') + ' ' + e.text).join('\n');
    const people = C.people.map((p) => '- ' + p.id + ' — ' + p.name + ', ' + p.role).join('\n');
    const system = 'Ты — ИИ-аналитик компании «Проявка» (сеть фотосалонов и цех печати, Минск). Руководитель прошёл от отклонения прибыли до корневой причины. ' +
      'Объясни простыми словами, без канцелярита, и предложи ровно 3 решения. Опирайся только на факты из сообщения, новых цифр не выдумывай. ' +
      'В тексте могут быть метки вида [ФИО_1] или [СУММА_2] — это скрытые данные, используй метки как есть. ' +
      'Ответ — только JSON: {"summary": "2–3 предложения: что случилось и почему, с цифрами", "cause": "корневая причина одной фразой", ' +
      '"proposals": [{"action": "конкретное действие", "owner_id": "id из списка сотрудников", "due_days": число дней, "effect_byn": число BYN в месяц или метка суммы, "metric": "как проверим", "target": "целевое значение"}]}. owner_id — строго из списка. effect_byn — только та часть потерь, которую закрывает именно это действие, не повторяй общую сумму отклонения; для организационных мер ставь 0. metric и target — коротко, до 6 слов.';
    const user = 'Путь от агрегата к причине:\n' + path + '\n\nФакты:\n' + facts + '\n\nСотрудники (id — имя, роль):\n' + people;
    const fb = FALLBACK[node.root];
    const res = await api.ai({ system, user, json: true, mask: true, who: 'Андрей Ковалёв (директор)', title: 'Пульт причин: ' + node.title, max_tokens: 1000, timeout: 25000 }, fb);
    let j = res.json;
    if (!j || !Array.isArray(j.proposals) || !j.proposals.length || !j.summary) { j = fb; res.fallback = true; }
    j = {
      summary: String(j.summary || fb.summary), cause: String(j.cause || fb.cause),
      proposals: j.proposals.filter((p) => p && p.action).slice(0, 3).map((p, i) => ({
        action: String(p.action), owner_id: C.person(p.owner_id) ? p.owner_id : fb.proposals[i % 3].owner_id,
        due_days: Math.min(60, Math.max(1, Math.round(toNum(p.due_days)) || 7)), effect_byn: Math.max(0, Math.round(toNum(p.effect_byn))),
        metric: String(p.metric || fb.proposals[i % 3].metric), target: String(p.target || fb.proposals[i % 3].target),
      })),
    };
    state.ai[nodeId] = { j, res };
    if (last(state.stack) === nodeId) {
      $('#ai-box').innerHTML = aiHtml(node, state.ai[nodeId]);
      const b = $('[data-explain]'); if (b) b.textContent = 'Спросить ещё раз';
    }
  }
  function aiHtml(node, cached) {
    const { j, res } = cached;
    const src = res.fallback
      ? 'Встроенная логика: модель недоступна или выключена — ответ собран из правил пульта'
      : (res.provider || 'Модель') + ' · ' + (res.ms ? (res.ms / 1000).toFixed(1) + ' с · ' : '') + (res.masked && res.masked.count ? 'перед отправкой скрыто ' + res.masked.count + ' меток: ФИО, суммы, телефоны' : 'персональные данные не отправлялись');
    return `<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body">
      <p>${esc(j.summary)}</p>
      <p><b>Корень:</b> ${esc(j.cause)}</p>
      <div class="proposals">${j.proposals.map((p, i) => `<div class="prop"><div>${esc(p.action)}</div>
        <div class="m">${esc(person(p.owner_id).name)} · ${p.due_days} дн. · ${p.effect_byn ? '≈ ' + fmt.n(p.effect_byn) + ' BYN/мес' : 'эффект оценим'} · ${esc(p.metric)} → ${esc(p.target)}</div>
        <button class="btn btn-sm btn-primary" data-decide="${i}">Оформить</button></div>`).join('')}</div>
      <p class="ai-src">${esc(src)}</p></div></div>`;
  }

  /* ---------- решение по отклонению ---------- */
  function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); }
  function openDecision(idx) {
    const node = NODES[last(state.stack)];
    const key = node.root;
    const ai = (state.ai[node.id] && state.ai[node.id].j) || FALLBACK[key];
    const p = ai.proposals[idx] || ai.proposals[0];
    const opts = C.people.map((x) => `<option value="${x.id}" ${x.id === p.owner_id ? 'selected' : ''}>${esc(x.name)} — ${esc(x.role)}</option>`).join('');
    $('#modal').innerHTML = `<form id="dec-form">
      <p class="eyebrow">Решение по отклонению · ${esc(DOM[node.domain].name)}</p>
      <h2 id="modal-title">${esc(node.title)}</h2>
      <div class="pick" role="radiogroup" aria-label="Предложения помощника">${ai.proposals.map((x, i) => `<label><input type="radio" name="prop" value="${i}" ${x === p ? 'checked' : ''}><span>${esc(x.action)}<small>${esc(person(x.owner_id).name)} · ${x.due_days} дн. · ${esc(x.metric)} → ${esc(x.target)}</small></span></label>`).join('')}</div>
      <div class="form-grid">
        <div class="field full"><label for="f-dev">Отклонение</label><textarea class="textarea" id="f-dev" rows="2" style="min-height:64px">${esc(ROOTS[key].deviation)}</textarea></div>
        <div class="field full"><label for="f-cause">Причина</label><input class="input" id="f-cause" value="${esc(ai.cause)}"></div>
        <div class="field full"><label for="f-act">Что делаем</label><input class="input" id="f-act" required value="${esc(p.action)}"></div>
        <div class="field"><label for="f-owner">Ответственный</label><select class="select" id="f-owner">${opts}</select></div>
        <div class="field"><label for="f-due">Срок</label><input class="input" type="date" id="f-due" required value="${addDays(p.due_days)}"></div>
        <div class="field"><label for="f-metric">Метрика контроля</label><input class="input" id="f-metric" value="${esc(p.metric)}"></div>
        <div class="field"><label for="f-target">Цель</label><input class="input" id="f-target" value="${esc(p.target)}"></div>
        <div class="field"><label for="f-eff">Ожидаемый эффект, BYN в месяц</label><input class="input" type="number" min="0" step="50" id="f-eff" value="${p.effect_byn || ''}"></div>
        <div class="field"><label for="f-base">Сейчас (было)</label><input class="input" id="f-base" value="${esc(ROOTS[key].baseline)}"></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close-modal>Отмена</button><button type="submit" class="btn btn-primary">Оформить и отправить ответственному</button></div>
    </form>`;
    showModal();
    $('#modal').querySelectorAll('input[name="prop"]').forEach((r) => r.addEventListener('change', () => {
      const x = ai.proposals[+r.value];
      $('#f-act').value = x.action; $('#f-owner').value = x.owner_id; $('#f-due').value = addDays(x.due_days);
      $('#f-metric').value = x.metric; $('#f-target').value = x.target; $('#f-eff').value = x.effect_byn || '';
    }));
    $('#dec-form').addEventListener('submit', (e) => { e.preventDefault(); saveDecision(node); });
    setTimeout(() => $('#f-act').focus(), 50);
  }
  function showModal() { $('#modal-back').classList.remove('hidden'); }
  function closeModal() { $('#modal-back').classList.add('hidden'); $('#modal').innerHTML = ''; }

  async function saveDecision(node) {
    const btn = $('#dec-form button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Сохраняю…';
    const v = (id) => $(id).value.trim();
    const eff = Math.round(+v('#f-eff') || 0);
    const owner = v('#f-owner');
    const number = state.decisions.length + 1;
    const item = {
      number, source: 't1', node: node.id, status: 'new',
      title: v('#f-act'), action: v('#f-act'), deviation: v('#f-dev'), cause: v('#f-cause'), owner, due: v('#f-due'),
      metric: v('#f-metric'), baseline: v('#f-base'), target: v('#f-target'),
      effect: eff ? fmt.n(eff) + ' BYN в месяц' : '—', effect_byn: eff,
      history: [{ ts: nowIso(), text: 'Оформлено в пульте причин: ' + pathOf(node.id).map((id) => crumbName(NODES[id])).join(' → ') }],
    };
    try {
      const d = await api.add('decisions', item);
      await api.add('tasks', { title: item.title, owner, due: item.due, status: 'new', source: 't1', decision: d.id });
      state.newId = d.id;
      await loadJournal();
      renderSent(d);
      if (state.health && state.health.telegram) {
        const r = await api.telegram(tgText(d, true), 'Андрей Ковалёв (директор)');
        const n = $('#tg-note'); if (n) n.textContent = r.ok ? 'Сообщение ушло в Telegram.' : 'Telegram не ответил — показываем, как увидит сотрудник.';
      }
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Оформить и отправить ответственному';
      toast('Не удалось сохранить: сервер не отвечает');
    }
  }
  function tgText(d, html) {
    const b = (s) => html ? '<b>' + esc(s) + '</b>' : s;
    return b('Решение №' + d.number + ' по отклонению') + '\nот директора: Андрей Ковалёв\n\n' +
      b('Что сделать: ') + esc(d.action) + '\n' + b('Почему: ') + esc(d.cause) + '\n' + b('Срок: ') + dateRu(d.due) + '\n' +
      b('Как проверим: ') + esc(d.metric) + ' — сейчас ' + esc(d.baseline || '—') + ', цель ' + esc(d.target || '—');
  }
  function renderSent(d) {
    const p = person(d.owner);
    $('#modal').innerHTML = `<p class="eyebrow">Готово</p><h2 id="modal-title">Решение №${d.number} оформлено и отправлено</h2>
      <div class="sent">
        <div class="sent-info">
          <p>Ответственный — <b>${esc(p.name)}</b>, ${esc(p.role.toLowerCase())}. Справа — как решение выглядит в Telegram-боте компании. Нажмите кнопку за ответственного — статус сразу появится в журнале.</p>
          <p>Задача заведена в общий список: её увидит помощник руководителя на ближайшей планёрке (Трек 3).</p>
          <p class="faint small" id="tg-note">${state.health && state.health.telegram ? 'Отправляю в Telegram…' : 'Telegram на этом ноутбуке не подключён — показываем макет сообщения.'}</p>
        </div>
        <div class="tg" id="tg">
          <div class="tg-head"><span class="ai-ava" style="width:24px;height:24px;font-size:11px">ИИ</span>Помощник · бот компании</div>
          <div class="tg-msg">${tgText(d, true)}</div>
          <div class="tg-btns">
            <button class="tg-btn" data-st="accepted" data-id="${d.id}">Принято</button>
            <button class="tg-btn" data-st="in_progress" data-id="${d.id}">В работе</button>
            <button class="tg-btn" data-st="help" data-id="${d.id}">Нужна помощь</button>
          </div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn" data-close-modal>Закрыть</button><button class="btn btn-primary" data-to-journal>К журналу решений</button></div>`;
  }
  const ST = { new: 'Новое', accepted: 'Принято', in_progress: 'В работе', help: 'Нужна помощь', done: 'Выполнено', overdue: 'Просрочено' };
  const STC = { new: 'st-new', accepted: 'chip-accent', in_progress: 'chip-accent', help: 'chip-warn', done: 'chip-ok', overdue: 'chip-bad' };
  const isLate = (d) => d.status !== 'done' && (d.status === 'overdue' || (d.due && d.due < TODAY));
  const statusKey = (d) => isLate(d) ? 'overdue' : (d.status || 'new');
  const statusLabel = (d) => ST[statusKey(d)].toLowerCase();

  async function setStatus(id, st, btn) {
    const d = state.decisions.find((x) => x.id === id);
    if (!d) return;
    const who = person(d.owner).name;
    const hist = (d.history || []).concat([{ ts: nowIso(), text: who + ': «' + ST[st] + '»' }]);
    await api.update('decisions', id, { status: st, history: hist });
    const tasks = await api.list('tasks');
    const t = tasks.find((x) => x.decision === id);
    if (t) await api.update('tasks', t.id, { status: st });
    if (btn) {
      btn.closest('.tg-btns').querySelectorAll('.tg-btn').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
      const tg = $('#tg');
      tg.insertAdjacentHTML('beforeend', `<div class="tg-msg out">${esc(ST[st])}</div><div class="tg-msg">${st === 'help' ? 'Передала директору: нужна помощь по решению №' + d.number + '. Он увидит это в пульте.' : 'Записала. Директор видит статус в пульте, напомню за день до срока.'}</div>`);
    }
    state.newId = id;
    await loadJournal();
  }

  /* ---------- журнал решений ---------- */
  const METRIC_NOW = { headcount: () => ['Штат', last(S.headcount.fact) + ' чел'], materials: () => ['Материальные затраты', fmt.n(CF.materials) + ' BYN'] };
  async function loadJournal() {
    state.decisions = await api.list('decisions');
    renderJournal();
  }
  function renderJournal() {
    const all = state.decisions.slice();
    all.forEach((d, i) => { if (!d.number) d.number = i + 1; });
    const list = all.slice().reverse();
    const late = list.filter(isLate).length;
    $('#journal-count').textContent = list.length + ' ' + plural(list.length, 'решение', 'решения', 'решений') + (late ? ' · просрочено ' + late : '');
    if (!list.length) { $('#journal').innerHTML = '<p class="empty">Решений пока нет. Пройдите от отклонения до причины и оформите первое.</p>'; return; }
    $('#journal').innerHTML = `<div class="jr">${list.map((d) => {
      const sk = statusKey(d);
      let ctl;
      if (METRIC_NOW[d.metric]) { const [l, v] = METRIC_NOW[d.metric](); ctl = esc(l) + ': сейчас <b>' + esc(v) + '</b>'; }
      else ctl = esc(d.metric || 'Метрика') + ': было <b>' + esc(d.baseline || '—') + '</b> → цель <b>' + esc(d.target || '—') + '</b>';
      const open = state.openRow === d.id;
      return `<div class="jr-item ${isLate(d) ? 'is-late' : ''} ${state.newId === d.id ? 'is-new' : ''}">
        <button class="jr-row" data-row="${d.id}" aria-expanded="${open}">
          <div><div class="t">№${d.number} · ${esc(d.title)}</div><div class="sub">${esc(d.deviation || '')}</div><div class="ctl">${ctl}</div></div>
          <div class="who">${esc(person(d.owner).name)}<div class="faint small">${esc(person(d.owner).role)}</div></div>
          <div class="due ${isLate(d) ? 'late' : ''}">${d.due ? d.due.slice(8, 10) + '.' + d.due.slice(5, 7) : '—'}</div>
          <div class="stt"><span class="chip ${STC[sk]}">${ST[sk]}</span><div class="faint small" style="margin-top:4px">${d.source === 't1' ? 'из пульта' : 'с планёрки'}</div></div>
        </button>
        ${open ? `<div class="jr-details">
          <ul class="hist">${(d.history || []).map((h) => `<li><time>${esc(fmt.dt(h.ts))}</time><span>${esc(h.text)}</span></li>`).join('')}
            ${d.effect && d.effect !== '—' ? `<li><time>эффект</time><span>${esc(d.effect)}</span></li>` : ''}</ul>
          <div class="jr-actions">
            ${d.node && NODES[d.node] ? `<button class="btn btn-sm" data-open="${d.node}">Открыть причину</button>` : ''}
            ${d.status !== 'done' ? `<button class="btn btn-sm" data-done="${d.id}">Выполнено</button>` : ''}
            <button class="btn btn-sm" data-print="${d.id}">Печать бланка</button>
          </div></div>` : ''}
      </div>`;
    }).join('')}</div>`;
    state.newId = null;
  }
  function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; }
  async function markDone(id) {
    const d = state.decisions.find((x) => x.id === id);
    await api.update('decisions', id, { status: 'done', history: (d.history || []).concat([{ ts: nowIso(), text: 'Отмечено выполненным в пульте' }]) });
    const t = (await api.list('tasks')).find((x) => x.decision === id);
    if (t) await api.update('tasks', t.id, { status: 'done' });
    await loadJournal();
    toast('Решение №' + d.number + ' выполнено — пульт продолжит следить за метрикой');
  }
  function printDecision(id) {
    const d = state.decisions.find((x) => x.id === id);
    const p = person(d.owner);
    const row = (k, v) => `<tr><td>${esc(k)}</td><td>${esc(v || '—')}</td></tr>`;
    $('#print-sheet').innerHTML = `<p>${esc(C.name)} · ${esc(C.about)} (демо)</p><h1>Решение №${d.number} по отклонению</h1>
      <table>${row('Дата', d.ts ? fmt.date(d.ts) : '')}${row('Отклонение', d.deviation)}${row('Причина', d.cause)}${row('Что делаем', d.action)}
      ${row('Ответственный', p.name + (p.role ? ', ' + p.role : ''))}${row('Срок', dateRu(d.due))}${row('Метрика контроля', (d.metric || '') + (d.baseline ? ': было ' + d.baseline : '') + (d.target ? ', цель ' + d.target : ''))}
      ${row('Ожидаемый эффект', d.effect)}${row('Статус', ST[statusKey(d)])}</table>
      <div class="sign"><span>Директор ____________ А. Ковалёв</span><span>Ознакомлен ____________ ${esc(p.name)}</span></div>`;
    window.print();
  }

  /* ---------- векторный анализ структуры затрат ---------- */
  function shares(o) { const ids = C.costs.items.map((i) => i.id); const t = ids.reduce((s, k) => s + o[k], 0); return ids.map((k) => o[k] / t * 100); }
  function vecCalc(a, b) {
    const sa = shares(a), sb = shares(b);
    const dot = sa.reduce((s, v, i) => s + v * sb[i], 0);
    const la = Math.sqrt(sa.reduce((s, v) => s + v * v, 0)), lb = Math.sqrt(sb.reduce((s, v) => s + v * v, 0));
    const cos = Math.min(1, dot / (la * lb));
    const deg = Math.acos(cos) * 180 / Math.PI;
    const d = sb.map((v, i) => v - sa[i]);
    const d2 = d.reduce((s, v) => s + v * v, 0) || 1;
    return { sa, sb, dot, la, lb, cos, deg, d, contrib: d.map((v) => v * v / d2 * 100) };
  }
  const THR = Math.acos(0.9) * 180 / Math.PI; // 25,8°
  function renderVector() {
    const pairs = { prev: ['Сентябрь → октябрь', CS, CF], plan: ['План → факт октября', CP, CF] };
    const [label, a, b] = pairs[state.vecMode];
    const v = vecCalc(a, b);
    const names = ['Материалы', 'Оплата труда', 'Отчисления', 'Аренда, амортизация', 'Прочие'];
    const mx = Math.max.apply(null, v.d.map(Math.abs)) || 1;
    const iMax = v.d.indexOf(Math.max.apply(null, v.d)), iMin = v.d.indexOf(Math.min.apply(null, v.d));
    const sig = v.cos < 0.9;
    const scale = 30;
    $('#vector').innerHTML = `<div class="vec-head"><div><p class="eyebrow">Финансы · метод из научной работы команды</p><h2 class="h2" id="vector-title">Векторный анализ структуры затрат</h2></div>
        <div class="tabs" role="tablist" aria-label="Что сравнить"><button class="tab" role="tab" data-vec="prev" aria-selected="${state.vecMode === 'prev'}">сен → окт</button><button class="tab" role="tab" data-vec="plan" aria-selected="${state.vecMode === 'plan'}">план → факт</button></div></div>
      <p class="muted small" style="margin-top:8px">Доли пяти статей — это вектор. Угол между векторами двух периодов одним числом показывает, насколько изменилась структура затрат.</p>
      <div class="vec-stats">
        <div class="vec-stat"><div class="k">Угол φ</div><div class="v">${fmt.n1(v.deg)}°</div></div>
        <div class="vec-stat"><div class="k">cos φ</div><div class="v">${v.cos.toFixed(4).replace('.', ',')}</div></div>
        <div class="vec-stat"><div class="k">Больше всех выросла</div><div class="v txt">${names[iMax]} ${fmt.signed(v.d[iMax], 1)}</div></div>
      </div>
      <div class="gauge" aria-label="Угол ${fmt.n1(v.deg)} градуса при пороге ${fmt.n1(THR)}">
        <div class="gauge-track"><span class="gauge-thr" style="left:${(THR / scale * 100).toFixed(1)}%"></span><span class="gauge-mark" style="left:${Math.min(100, v.deg / scale * 100).toFixed(1)}%"></span></div>
        <div class="gauge-scale"><span>0°</span><span>существенно, если φ > ${fmt.n1(THR)}° (cos < 0,9)</span><span>${scale}°</span></div>
      </div>
      <div class="dv"><div class="dv-row dv-head"><span>Статья</span><span style="text-align:center">сдвиг доли, п.п.</span><span class="num">Δ</span><span class="num">вклад</span></div>
        ${v.d.map((x, i) => `<div class="dv-row"><span class="name" title="${esc(C.costs.items[i].name)}">${names[i]}</span><span class="dv-bar"><i class="${x >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(x) / mx * 50).toFixed(1)}%"></i></span><span class="num">${fmt.signed(x, 1)}</span><span class="num faint">${fmt.n(v.contrib[i])} %</span></div>`).join('')}
      </div>
      <div class="ai-note" style="margin-top:14px"><div class="ai-ava">ИИ</div><div class="ai-body"><p>${sig ? 'Структура затрат изменилась существенно' : 'Структура затрат почти не изменилась'}: φ = ${fmt.n1(v.deg)}° при пороге ${fmt.n1(THR)}°. ${sig ? '' : 'Значит, деньги потеряны не на ценах закупки и не на аренде, а в процессах: объём (закрытый салон) и потери (брак, сверхурочные).'} Внутри — сдвиг ${v.d[iMin] < 0 ? 'от статьи «' + names[iMin].toLowerCase() + '»' : ''} к статье «${names[iMax].toLowerCase()}» (${fmt.signed(v.d[iMax], 1)} п.п.)${iMax === 1 ? ' — это сверхурочные цеха.' : '.'}</p>
        ${iMax === 1 ? '<p style="margin-top:8px"><button class="btn btn-sm" data-open="overtime">Открыть сверхурочные →</button></p>' : ''}</div></div>
      <p class="formula">cos φ = a·b / (|a|·|b|) = ${fmt.n1(v.dot)} / (${fmt.n1(v.la)} · ${fmt.n1(v.lb)}) = ${v.cos.toFixed(4).replace('.', ',')} · ${esc(label)}</p>`;
  }

  /* ---------- статус ИИ ---------- */
  async function renderHealth() {
    const h = await api.health();
    state.health = h;
    const el = $('#ai-status');
    const map = { cloud: 'ИИ: DeepSeek', local: 'ИИ: локальная модель', off: 'ИИ: встроенная логика' };
    el.innerHTML = '<span class="dot"></span>' + esc(h.ok ? (map[h.mode] || 'ИИ') : 'Сервер не отвечает');
    el.classList.toggle('on', h.ok && h.mode !== 'off');
    el.title = h.ok && h.mode === 'cloud' ? 'Перед отправкой в модель ФИО, телефоны и суммы заменяются метками' : '';
  }

  /* ---------- события ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open],[data-go],[data-crumb],[data-explain],[data-decide],[data-close-modal],[data-st],[data-to-journal],[data-row],[data-done],[data-print],[data-vec],[data-mode]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.mode) { state.mode = ds.mode; document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', b === t ? 'true' : 'false')); renderHero(); renderBlocks(); }
    else if (ds.open) { closeModal(); openPath(ds.open); }
    else if (ds.go) go(ds.go);
    else if (ds.crumb) { state.stack = state.stack.slice(0, +ds.crumb + 1); renderNode(); }
    else if (ds.explain) explain(ds.explain);
    else if (ds.decide !== undefined) openDecision(+ds.decide);
    else if (ds.closeModal !== undefined) closeModal();
    else if (ds.st) setStatus(ds.id, ds.st, t);
    else if (ds.toJournal !== undefined) { closeModal(); closeDrawer(); document.querySelector('.journal').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (ds.row) { state.openRow = state.openRow === ds.row ? null : ds.row; renderJournal(); }
    else if (ds.done) markDone(ds.done);
    else if (ds.print) printDecision(ds.print);
    else if (ds.vec) { state.vecMode = ds.vec; renderVector(); }
  });
  $('#hero-go').addEventListener('click', () => openPath('profit'));
  $('#back').addEventListener('click', back);
  $('#close').addEventListener('click', closeDrawer);
  $('#drawer-back').addEventListener('click', closeDrawer);
  $('#modal-back').addEventListener('click', (e) => { if (e.target.id === 'modal-back') closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal-back').classList.contains('hidden')) closeModal();
    else if ($('#drawer').classList.contains('open')) closeDrawer();
  });

  /* ---------- старт ---------- */
  renderHero();
  renderBlocks();
  renderVector();
  renderHealth();
  loadJournal();
  pollOrders();
  setInterval(pollOrders, 5000);
  setInterval(loadJournal, 15000); // статусы могут менять в Треке 3 и в боте
  // ссылка на узел для показа: /t1/#root_gallery, /t1/#profit
  const h = decodeURIComponent(location.hash.slice(1));
  if (NODES[h]) openPath(h);
  window.PULT = { openPath, NODES, state }; // для демо и отладки
})();
