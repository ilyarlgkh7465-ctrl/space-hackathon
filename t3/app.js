/* Трек 3 — защищённый ИИ-помощник руководителя: встречи, документы, задачи, итоги, защита.
   Данные компании — shared/company.js, хранилище и ИИ — shared/api.js, документы — t3/docs.js.
   Всё работает и без модели: поиск, бриф и протокол имеют встроенную логику. */
(function () {
  'use strict';
  const C = window.COMPANY;
  const app = document.getElementById('app');
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const TODAY = isoDay(new Date());

  /* ---------- роли ---------- */
  const ROLES = {
    director:   { label: 'Директор',             person: 'kovalev', areas: ['all'] },
    production: { label: 'Начальник цеха',        person: 'morozov', areas: ['production'] },
    salons:     { label: 'Управляющая салонами',  person: 'grinko',  areas: ['clients'] },
    employee:   { label: 'Сотрудник',             person: 'zhuk',    own: true },
  };
  const ROLE_IDS = Object.keys(ROLES);
  const AREA_OWNER = { finance: 'lisovskaya', clients: 'grinko', production: 'morozov', hr: 'shubina' };

  /* ---------- показатели ---------- */
  const KPI = {
    revenue: { label: 'Выручка', area: 'finance' }, profit: { label: 'Прибыль', area: 'finance' },
    orders: { label: 'Заказы', area: 'clients' }, avgCheck: { label: 'Средний чек', area: 'clients' },
    repeatShare: { label: 'Повторные клиенты', area: 'clients' }, complaints: { label: 'Жалобы', area: 'clients' },
    nps: { label: 'NPS', area: 'clients' }, output: { label: 'Выпуск', area: 'production' },
    defectRate: { label: 'Брак', area: 'production' }, overdueRate: { label: 'Просрочка заказов', area: 'production' },
    utilization: { label: 'Загрузка оборудования', area: 'production' }, headcount: { label: 'Штат', area: 'hr' },
    attendance: { label: 'Явка', area: 'hr' }, overtime: { label: 'Сверхурочные', area: 'hr' },
    turnover: { label: 'Текучесть', area: 'hr' }, vacancyDays: { label: 'Срок закрытия вакансии', area: 'hr' },
    materials: { label: 'Материальные затраты', area: 'finance' },
  };
  /* по каким словам в задачах понять, что отклонением уже кто-то занимается */
  const KW = { defectRate: ['калибр', 'брак', 'перепечат'], overdueRate: ['просроч', 'переплёт', 'переплет'], complaints: ['жалоб'],
    nps: ['жалоб'], overtime: ['сверхуроч', 'переплёт'], vacancyDays: ['ваканс', 'администратор'], headcount: ['ваканс', 'администратор'],
    turnover: ['текуч', 'увольн'], attendance: ['сменщик', 'замен'], profit: ['прибыл'], revenue: ['выручк', 'сменщик'],
    orders: ['акци'], repeatShare: ['акци', 'повторн'], avgCheck: ['чек'], output: ['выпуск'], utilization: ['загрузк'] };
  const fv = (v, unit) => unit === '%' ? fmt.n1(v) + ' %' : unit === 'BYN' ? (v < 100 ? fmt.money2(v) : fmt.money(v)) : fmt.n(v) + (unit ? ' ' + unit : '');
  function deviations() {
    return Object.keys(C.series).filter((k) => KPI[k]).map((k) => {
      const s = C.series[k], fact = C.last(k), plan = C.last(k, 'plan'), d = fmt.delta(fact, plan);
      return { key: k, label: KPI[k].label, area: KPI[k].area, fact, plan, d, unit: s.unit,
        bad: s.good === 'up' ? d < -2 : d > 2 };
    }).filter((x) => x.bad).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  }
  const devLine = (x) => x.label + ': ' + fv(x.fact, x.unit) + ' при плане ' + fv(x.plan, x.unit) + ' (' + fmt.signed(x.d, 0) + ' %)';

  /* ---------- встречи недели ---------- */
  const MEETINGS = [
    { id: 'm1', title: 'Планёрка руководителей', start: '2026-11-09T09:00', dur: 60,
      people: ['kovalev', 'lisovskaya', 'morozov', 'grinko', 'shubina', 'yatskevich'], roles: ['director', 'production', 'salons'],
      areas: ['finance', 'clients', 'production', 'hr'], allDecisions: true,
      goal: 'Разобрать итоги октября: прибыль ниже плана на 28 % — найти причины и закрепить решения с ответственными и сроками',
      query: 'калибровка брак премия салон замена вакансия жалобы сверхурочные' },
    { id: 'm2', title: 'Разбор качества печати', start: '2026-11-10T11:00', dur: 45,
      people: ['morozov', 'petrovich', 'zhuk', 'kovalev'], roles: ['director', 'production', 'employee'], areas: ['production'],
      goal: 'Вернуть брак на минилабе №2 с 11,4 % к норме 2,5 % и закрыть просрочку фотокниг',
      query: 'калибровка минилаб допуск оператор перепечатки брак журнал наставник' },
    { id: 'm3', title: 'Встреча с поставщиком бумаги', start: '2026-11-11T15:00', dur: 40,
      people: ['lisovskaya', 'morozov'], guests: ['Представитель ООО «Фотобум-Снаб»'], roles: ['director', 'production'], areas: ['production', 'finance'],
      goal: 'Согласовать объём бумаги на сезон фотокниг и календарей и цену со скидкой за объём',
      query: 'скидка объём рулонов цена брак бумаги акт поставка продление' },
    { id: 'm4', title: 'Собеседование: администратор «Галереи»', start: '2026-11-12T10:00', dur: 30,
      people: ['grinko', 'shubina'], guests: ['Кандидат на должность администратора'], roles: ['director', 'salons'], areas: ['clients', 'hr'],
      goal: 'Закрыть вакансию, открытую 23 дня: салон «Галерея» терял выручку из-за нехватки людей',
      query: 'смена салон два сотрудника замена резерв адаптация наставник' },
  ];

  /* заготовки брифов — встроенная логика, если модели нет */
  const PLAN = {
    m1: {
      agenda: [
        { t: () => 'Итоги октября: прибыль ' + fmt.money(C.last('profit')) + ' при плане ' + fmt.money(C.last('profit', 'plan')) + ' (' + fmt.signed(fmt.delta(C.last('profit'), C.last('profit', 'plan')), 0) + ' %)', owner: 'lisovskaya', min: 10,
          why: 'Выручка −13 200 BYN, из них салон «Галерея» −11 500 BYN; перепечатки — +2 300 BYN бумаги; сверхурочные 212 ч вместо 60' },
        { t: () => 'Салон «Галерея»: выручка −35 %, закрыт 7 дней без замены', owner: 'grinko', min: 10,
          why: 'По стандарту замену назначают за 2 часа из соседнего салона по графику резерва', cites: [['salon', '3'], ['salon', '4']] },
        { t: () => 'Брак ' + fmt.n1(C.last('defectRate')) + ' % (минилаб №2 — 11,4 %) и просрочка ' + fmt.n1(C.last('overdueRate')) + ' %', owner: 'morozov', min: 15,
          why: 'Калибровка минилаба №2 не проводилась с 07.10; новый оператор не допущен к калибровке', cites: [['calib', '2'], ['adapt', '4']] },
        { t: () => 'Жалобы ' + C.last('complaints') + ' (норма 20) и NPS ' + C.last('nps') + ' — ответы клиентам', owner: 'grinko', min: 10,
          why: 'Жалобы на цвет (минилаб №2) и просроченные фотокниги; ответ — не позднее следующего дня', cites: [['salon', '7']] },
        { t: () => 'Кадры: 3 вакансии, вакансия «Галереи» открыта 23 дня', owner: 'shubina', min: 5,
          why: 'Решение от 01.10 просрочено: срок был 15.10' },
      ],
      questions: [
        ['morozov', 'Почему калибровка минилаба №2 не проводилась с 7 октября и кто был назначен замещающим?'],
        ['grinko', 'Почему по графику резерва не дали сменщика в «Галерею» 13–19 октября?'],
        ['shubina', 'Что мешает закрыть вакансию администратора 23 дня — зарплата, отклики, собеседования?'],
        ['lisovskaya', 'Сколько стоили перепечатки и сверхурочные и что из этого вернём в ноябре?'],
        ['yatskevich', 'Готова ли предновогодняя акция к 15.11 при просрочке фотокниг 14 %?'],
      ],
      risks: [
        ['Сезон фотокниг и календарей: при просрочке переплёта 14 % потеряем предновогодние заказы'],
        ['Брак выше 4 % — по положению цех лишается премии за качество: риск ухода операторов', [['bonus', '3']]],
        ['Сверхурочные 212 ч при лимите 120 ч без согласования директора', [['bonus', '6']]],
        ['Решение о наставнике для нового оператора не было внесено в контроль — так решения теряются', [['protocol', '5']]],
      ],
      pins: [['calib', '2'], ['adapt', '4'], ['salon', '3'], ['bonus', '3'], ['protocol', '5']],
    },
    m2: {
      agenda: [
        { t: () => 'Брак по участкам: минилаб №2 — 11,4 %, минилаб №1 — 2,3 %', owner: 'morozov', min: 10, why: '6 980 перепечаток на минилабе №2, ≈ 2 300 BYN бумаги' },
        { t: () => 'Калибровка: пропущены 14.10, 21.10 и 28.10 — вернуть график и журнал', owner: 'petrovich', min: 10, why: 'Регламент: раз в неделю, по понедельникам до начала смены', cites: [['calib', '2'], ['calib', '6']] },
        { t: () => 'Допуск Павла Жука: обучение и проверка калибровки', owner: 'petrovich', min: 10, why: 'Без проверки оператор калибровку не проводит', cites: [['adapt', '4'], ['calib', '4']] },
        { t: () => 'Правило остановки печати при браке выше 3 %', owner: 'morozov', min: 10, why: 'В октябре правило не сработало ни разу', cites: [['calib', '8']] },
      ],
      questions: [
        ['zhuk', 'Что было непонятно в первые дни на минилабе? Какие заказы перепечатывали чаще всего?'],
        ['petrovich', 'Сколько времени нужно на обучение и проверку калибровки?'],
        ['morozov', 'Почему не сработало правило остановки при браке выше 3 %?'],
      ],
      risks: [
        ['Пока Павел не допущен, калибровка держится на одном человеке — Ольге Петрович', [['calib', '3']]],
        ['В ноябре заказов больше — без снижения брака перепечаток станет ещё больше'],
      ],
      pins: [['calib', '2'], ['calib', '4'], ['calib', '8'], ['adapt', '3'], ['adapt', '4']],
    },
    m3: {
      agenda: [
        { t: () => 'Потребность в бумаге на ноябрь–декабрь (сезон фотокниг и календарей)', owner: 'morozov', min: 10, why: 'Октябрь: 158 400 отпечатков; в сезон рост заказов' },
        { t: () => 'Скидка за объём: от 30 рулонов — 5 %, от 50 — 8 %', owner: 'lisovskaya', min: 10, why: 'В октябре получили 5 % на 32 рулона', cites: [['contract', '4']] },
        { t: () => 'Цена 186 BYN за рулон 152 мм — зафиксировать до конца сезона', owner: 'lisovskaya', min: 10, why: 'О повышении поставщик предупреждает за 30 дней', cites: [['contract', '3']] },
        { t: () => 'Брак: бумага или настройка? Претензию по октябрю не выставляем', owner: 'morozov', min: 5, why: 'Перепечатки — из-за калибровки, такой брак договор не возмещает', cites: [['contract', '6']] },
        { t: () => 'Следующая заявка и продление договора', owner: 'lisovskaya', min: 5, why: 'Договор продлевается сам, если не заявить за 30 дней', cites: [['contract', '8']] },
      ],
      questions: [
        ['guest', 'Сможете зафиксировать цену до 31.12 при заказе от 50 рулонов?'],
        ['guest', 'Срок поставки в декабре — те же 3 рабочих дня?'],
        ['morozov', 'Сколько рулонов нужно с запасом на перепечатки?'],
      ],
      risks: [
        ['Брак из-за настройки оборудования не возмещается — претензия по октябрю необоснованна', [['contract', '6']]],
        ['До 01.12 решить, продлеваем ли договор на тех же условиях', [['contract', '8']]],
      ],
      pins: [['contract', '3'], ['contract', '4'], ['contract', '6'], ['contract', '8']],
    },
    m4: {
      agenda: [
        { t: () => 'Знакомство и опыт работы с клиентами', owner: 'grinko', min: 10, why: 'Администратор отвечает за приём, выдачу и жалобы' },
        { t: () => 'График: салон 10:00–21:00, в смене двое', owner: 'grinko', min: 5, why: 'Один сотрудник — салон работает только на приём', cites: [['salon', '1'], ['salon', '2']] },
        { t: () => 'Замены: готовность выходить в соседние салоны', owner: 'grinko', min: 5, why: 'График резерва между салонами', cites: [['salon', '4']] },
        { t: () => 'Адаптация: 3 дня с наставником, дата выхода и условия', owner: 'shubina', min: 10, why: 'Вакансия открыта 23 дня', cites: [['adapt', '3']] },
      ],
      questions: [
        ['guest', 'Был ли опыт работы с фотопечатью или кассой?'],
        ['guest', 'Готовы ли выходить на замену в другие салоны?'],
        ['shubina', 'Какую вилку зарплаты можем предложить сразу?'],
      ],
      risks: [
        ['Если кандидат откажет, нужен запасной сменщик из «Центра», иначе салон снова закроется', [['salon', '3']]],
        ['Без второго сотрудника салон работает только на приём и выдачу', [['salon', '2']]],
      ],
      pins: [['salon', '2'], ['salon', '3'], ['salon', '4'], ['adapt', '3']],
    },
  };

  /* демо-расшифровки встреч */
  const DEMO_TEXT = {
    m1: 'Ковалёв: Начнём с главного — прибыль за октябрь 32 800 рублей при плане 45 600, минус 28 процентов.\n' +
      'Лисовская: Большая часть потери — салон «Галерея», он неделю стоял закрытым. Ещё 2 300 рублей — бумага на перепечатки со второго минилаба и 212 часов сверхурочных.\n' +
      'Морозов: Калибровку на втором минилабе не делали с седьмого октября. Новый оператор к ней не допущен, а Ольга работала на первом.\n' +
      'Ковалёв: Решение: Сергей, до 11 ноября откалибровать минилаб №2 и закрепить еженедельную калибровку за Ольгой Петрович.\n' +
      'Шубина: По «Галерее» мало откликов, зарплата в вакансии ниже рынка.\n' +
      'Ковалёв: Решение: Елена, до 12 ноября поднять вилку в вакансии и провести собеседование.\n' +
      'Ковалёв: Решение: Наталья, с понедельника дать в «Галерею» сменщика из «Центра» до выхода нового администратора.\n' +
      'Гринько: Ещё 64 жалобы, на многие не ответили.\n' +
      'Ковалёв: Решение: Наталья и Денис, до 10 ноября ответить всем клиентам с жалобами и дать скидку 20 % на перепечатку.\n' +
      'Ковалёв: Решение: Сергей, до 20 ноября подготовить замену переплётчику на время отпусков.',
    m2: 'Морозов: Брак на втором минилабе 11,4 процента, на первом 2,3. Разница — в калибровке.\n' +
      'Петрович: Я была на первом минилабе, второй с седьмого октября никто не калибровал. Павел к калибровке не допущен.\n' +
      'Жук: Мне показали печать, а калибровку не показывали — я думал, её делает старший.\n' +
      'Ковалёв: Решение: Ольга, до 11 ноября провести с Павлом обучение калибровке и принять у него проверку по журналу.\n' +
      'Ковалёв: Решение: Сергей, до 10 ноября откалибровать минилаб №2 и вернуть калибровку по понедельникам.\n' +
      'Морозов: Правило остановки при браке выше трёх процентов тоже никто не соблюдал.\n' +
      'Ковалёв: Решение: Сергей, до 13 ноября настроить ежедневный отчёт о браке по каждому минилабу.',
    m3: 'Лисовская: На ноябрь и декабрь нам нужно около 55 рулонов — сезон фотокниг и календарей.\n' +
      'Представитель поставщика: При 50 рулонах скидка 8 процентов по договору, цену можем держать до конца года.\n' +
      'Морозов: Претензию по браку не выставляем: перепечатки были из-за калибровки, не из-за бумаги.\n' +
      'Решение: Ирина, до 13 ноября оформить заявку на 55 рулонов со скидкой 8 % и фиксацией цены до 31 декабря.\n' +
      'Решение: Ирина, до 1 декабря решить, продлеваем ли договор на 2027 год.',
    m4: 'Гринько: Расскажите об опыте работы с клиентами.\n' +
      'Кандидат: Два года администратором в копицентре — касса и приём заказов.\n' +
      'Шубина: Готовы выходить на замену в «Центр» и «Восток»?\n' +
      'Кандидат: Да, если предупредят заранее.\n' +
      'Решение: Елена, до 13 ноября отправить кандидату предложение и согласовать дату выхода.\n' +
      'Решение: Наталья, до 16 ноября назначить наставника и план адаптации на 3 дня.',
  };
  const FIRST = { 'Андрей': 'kovalev', 'Ирина': 'lisovskaya', 'Сергей': 'morozov', 'Наталья': 'grinko', 'Елена': 'shubina',
    'Денис': 'yatskevich', 'Ольга': 'petrovich', 'Павел': 'zhuk', 'Виктор': 'sidorenko', 'Мария': 'tkachuk' };
  const MONTHS = { 'октября': '10', 'ноября': '11', 'декабря': '12' };

  /* ---------- состояние ---------- */
  const qs = new URLSearchParams(location.search);
  const S = {
    tab: qs.get('tab') || 'meetings', role: ROLES[qs.get('role')] ? qs.get('role') : 'director',
    meetingId: qs.get('m') || 'm1', view: {}, briefs: {}, notes: {}, drafts: {}, run: {}, busy: {},
    docId: 'calib', hl: null, answer: null, extraDocs: [], filter: 'all',
    health: { mode: 'off' }, decisions: [], tasks: [], meetings: [], audit: [], dirSummary: null,
    maskCheck: null, localState: null, sent: {},
  };
  if (qs.get('view')) S.view[S.meetingId] = qs.get('view');

  /* ---------- помощники ---------- */
  const person = (id) => C.person(id);
  const pname = (id) => (person(id) || {}).name || (id === 'guest' ? 'Гость' : id || '—');
  const initials = (id) => { const p = person(id); if (!p) return id === 'guest' ? 'Г' : '?'; return p.name.split(' ').map((w) => w[0]).join('').slice(0, 2); };
  const HUES = ['#E8EEFC', '#EAF6EF', '#FDF2E6', '#F3EDFB', '#FCEDEF', '#E6F4F6', '#F6F3E2', '#EEF0F3'];
  const ava = (id) => '<span class="ava" title="' + esc(pname(id)) + '" style="background:' + HUES[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length] + '">' + esc(initials(id)) + '</span>';
  const role = () => ROLES[S.role];
  const who = () => pname(role().person) + ' (' + role().label + ')';
  const allDocs = () => window.T3_DOCS.concat(S.extraDocs);
  const doc = (id) => allDocs().find((d) => d.id === id);
  const docVisible = (id) => { const d = doc(id); return !!d && d.access.includes(S.role); };
  const visibleDocs = () => allDocs().filter((d) => d.access.includes(S.role));
  const item = (d, n) => { const x = doc(d); return x && x.items.find((i) => i.n === String(n)); };
  const meetingVisible = (m) => m.roles.includes(S.role);
  const dayLabel = (iso) => { const t = new Date(iso).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const timeLabel = (iso) => iso.slice(11, 16);
  const dueLabel = (iso) => iso ? 'до ' + new Date(iso + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'без срока';

  function ownerId(v) {
    if (!v) return null;
    if (person(v)) return v;
    const p = C.people.find((x) => String(v).includes(x.name) || String(v).includes(x.name.split(' ')[1]));
    return p ? p.id : null;
  }
  function canSeeOwner(id) {
    const r = role();
    if (r.areas && r.areas.includes('all')) return true;
    if (r.own) return id === r.person;
    const p = person(id);
    return id === r.person || (!!p && r.areas.includes(p.area));
  }
  function effStatus(x) {
    if (x.status === 'done') return 'done';
    if (x.status === 'overdue' || (x.due && x.due < TODAY)) return 'overdue';
    return x.status === 'in_progress' ? 'in_progress' : 'new';
  }
  /* решения и задачи одним списком: решение показываем, если на него нет отдельной задачи */
  function workItems() {
    const linked = new Set(S.tasks.map((t) => t.decision).filter(Boolean));
    const ds = S.decisions.filter((d) => !linked.has(d.id)).map((d) => ({ kind: 'decision', id: d.id, title: d.title, owner: ownerId(d.owner),
      due: d.due, status: d.status, st: effStatus(d), source: d.source, effect: d.effect, cause: d.cause, metric: d.metric, raw: d }));
    const ts = S.tasks.map((t) => ({ kind: 'task', id: t.id, title: t.title, owner: ownerId(t.owner), due: t.due, status: t.status,
      st: effStatus(t), source: t.source, meeting: t.meeting_title, raw: t }));
    return ds.concat(ts);
  }
  const srcLabel = (x) => (x.kind === 'decision' ? 'Решение · ' : '') + (x.source === 't1' ? 'Пульт причин (Трек 1)' : x.source === 't2' ? 'Мобильный заказ (Трек 2)'
    : x.meeting ? 'Встреча: ' + x.meeting : x.kind === 'decision' ? 'планёрка' : x.raw && x.raw.decision ? 'По решению планёрки' : 'Поручение');

  /* ---------- поиск по документам: BM25 ---------- */
  const STOP = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему ' +
    'когда даже ну ли если уже или ни быть был него до вас там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам ' +
    'без чего раз тоже себе под будет тогда кто этот того потому этого какой здесь этом один мой тем чтобы нее сейчас были куда зачем всех можно при ' +
    'об другой хоть после над больше тот через эти нас про всего них какая много три эту моя свою этой перед лучше чуть том такой им более всегда ' +
    'это какие какое сколько почему нужно ли п').split(' '));
  function stem(w) {
    w = w.replace(/ё/g, 'е');
    if (w.length <= 5 && w.length > 3) w = w.replace(/[аеиоуыэюяйь]$/, '');
    return w.slice(0, 5);
  }
  const tokens = (s) => (String(s).toLowerCase().match(/[a-zа-яё0-9]+/g) || []).filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w))).map(stem);
  function search(q, docs, k) {
    const units = [];
    docs.forEach((d) => d.items.forEach((it) => units.push({ doc: d, it, toks: tokens(d.short + ' ' + it.text) })));
    if (!units.length) return [];
    const df = {}; let total = 0;
    units.forEach((u) => { total += u.toks.length; new Set(u.toks).forEach((t) => { df[t] = (df[t] || 0) + 1; }); });
    const avg = total / units.length, N = units.length, k1 = 1.2, b = 0.75;
    const qt = [...new Set(tokens(q))];
    return units.map((u) => {
      let s = 0;
      qt.forEach((t) => {
        const tf = u.toks.filter((x) => x === t).length;
        if (!tf) return;
        const idf = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
        s += idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * u.toks.length / avg));
      });
      return { doc: u.doc, it: u.it, score: s };
    }).filter((x) => x.score > 0.3).sort((a, b2) => b2.score - a.score).slice(0, k || 5);
  }

  /* ---------- текст с ссылками на пункты ---------- */
  function citeBtn(d, n) {
    const x = doc(d);
    if (!x || !docVisible(d)) return '';
    return '<button class="cite" data-act="cite" data-doc="' + esc(d) + '" data-n="' + esc(n) + '">' + esc(x.short) + ', п. ' + esc(n) + '</button>';
  }
  const cites = (arr) => (arr || []).map(([d, n]) => citeBtn(d, n)).filter(Boolean).join(' ');
  function rich(text) {
    let h = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/\[D:([\w-]+):([\d.]+)\]/g, (m0, d, n) => citeBtn(d, n) || '');
    return h.split(/\n{2,}/).map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  }
  const parseCites = (arr) => (Array.isArray(arr) ? arr : []).map((s) => String(s).match(/D:([\w-]+):([\d.]+)/)).filter(Boolean)
    .map((mm) => [mm[1], mm[2]]).filter(([d, n]) => docVisible(d) && item(d, n));

  function provLine(r) {
    if (!r) return '';
    const bits = [];
    bits.push(r.fallback ? 'Встроенная логика' + (S.health.mode === 'off' ? ' · ИИ выключен' : r.reason ? ' · модель не ответила' : '') : 'Помощник · ' + esc(r.provider || ''));
    if (r.fallback) return '<div class="prov">' + bits.join(' ') + '</div>';
    if (r.masked && r.masked.count) bits.push('<span class="chip chip-ok">замаскировано ' + r.masked.count + ': ' + esc(r.masked.labels.slice(0, 4).join(' ')) + (r.masked.labels.length > 4 ? '…' : '') + '</span>');
    else if (r.masked) bits.push('<span class="chip">персональных данных не найдено</span>');
    return '<div class="prov">' + bits.join(' ') + '</div>';
  }

  /* ---------- загрузка ---------- */
  async function loadStore() {
    const [d, t, m] = await Promise.all([api.list('decisions'), api.list('tasks'), api.list('meetings')]);
    S.decisions = d; S.tasks = t; S.meetings = m;
  }
  async function loadHealth() {
    S.health = await api.health();
    const chip = document.getElementById('aiChip');
    const map = { cloud: ['chip chip-accent', 'Облако + маскирование'], local: ['chip chip-ok', 'Локальная модель'], off: ['chip', 'Без ИИ · встроенная логика'] };
    const [cls, txt] = S.health.static ? ['chip', 'Демо по ссылке · встроенная логика'] : map[S.health.mode] || ['chip', 'Сервер не отвечает'];
    chip.className = cls; chip.querySelector('span:last-child').textContent = txt;
  }

  /* ================= ВСТРЕЧИ ================= */
  function openForMeeting(m) {
    const ids = new Set(m.people);
    return workItems().filter((x) => x.st !== 'done' && (m.allDecisions || ids.has(x.owner) ||
      (x.source === 't1' && KPI[x.metric] && m.areas.includes(KPI[x.metric].area))));
  }
  function fallbackBrief(m) {
    const p = PLAN[m.id];
    const agenda = p.agenda.map((a) => ({ title: a.t(), owner: a.owner, minutes: a.min, why: a.why, cites: (a.cites || []).filter(([d, n]) => docVisible(d) && item(d, n)) }));
    const open = openForMeeting(m);
    const t1 = open.filter((x) => x.source === 't1');
    t1.forEach((x) => agenda.push({ title: 'Решение из пульта: ' + x.title, owner: x.owner, minutes: 5, why: x.cause || 'Принято в пульте причин, срок ' + dueLabel(x.due), tag: 'Трек 1' }));
    const rest = open.filter((x) => x.source !== 't1');
    if (rest.length) {
      const over = rest.filter((x) => x.st === 'overdue').length;
      agenda.push({ title: 'Контроль решений и задач: открыто ' + rest.length + (over ? ', просрочено ' + over : ''), owner: m.people[0] === 'kovalev' || m.people.includes('kovalev') ? 'kovalev' : m.people[0], minutes: 5,
        why: rest.slice(0, 3).map((x) => '«' + x.title + '» — ' + pname(x.owner) + ', ' + dueLabel(x.due)).join('; ') });
    }
    // уложить повестку в длительность встречи: срезаем самые длинные пункты по 5 минут
    let total = agenda.reduce((a, x) => a + x.minutes, 0);
    while (total > m.dur) { const big = agenda.reduce((a, x) => x.minutes > a.minutes ? x : a); if (big.minutes <= 5) break; big.minutes -= 5; total -= 5; }
    return { goal: m.goal, agenda, questions: p.questions.map(([to, q]) => ({ to, q })), risks: p.risks.map(([text, c]) => ({ text, cites: (c || []).filter(([d, n]) => docVisible(d) && item(d, n)) })) };
  }
  function materials(m) {
    const pins = PLAN[m.id].pins;
    const vis = pins.filter(([d, n]) => docVisible(d) && item(d, n));
    const seen = new Set(vis.map(([d, n]) => d + ':' + n));
    search(m.query + ' ' + m.goal, visibleDocs(), 6).forEach((h) => {
      const key = h.doc.id + ':' + h.it.n;
      if (!seen.has(key) && vis.length < 7) { seen.add(key); vis.push([h.doc.id, h.it.n]); }
    });
    const hiddenDocs = [...new Set(pins.filter(([d]) => !docVisible(d)).map(([d]) => d))];
    return { list: vis, hidden: hiddenDocs };
  }
  async function makeBrief(m) {
    S.busy[m.id] = 'brief'; S.view[m.id] = 'brief'; render();
    await loadStore();
    const fb = fallbackBrief(m);
    const mat = materials(m);
    const open = openForMeeting(m);
    const ctx = [
      'Встреча: ' + m.title + ', ' + dayLabel(m.start) + ' ' + timeLabel(m.start) + ', ' + m.dur + ' мин.',
      'Цель от организатора: ' + m.goal,
      'Участники (id: имя — роль):', ...m.people.map((id) => '- ' + id + ': ' + pname(id) + ' — ' + person(id).role),
      ...(m.guests || []).map((g) => '- guest: ' + g),
      '', 'Отклонения октября (факт / план):', ...deviations().filter((x) => m.areas.includes(x.area)).slice(0, 8).map((x) => '- ' + devLine(x)),
      '', 'События октября:', ...C.events.filter((e) => m.areas.includes(e.area) || m.allDecisions).map((e) => '- ' + e.date + ': ' + e.text),
      '', 'Открытые решения и задачи:', ...(open.length ? open.map((x) => '- [' + ({ overdue: 'просрочено', in_progress: 'в работе', new: 'новое' })[x.st] + '] «' + x.title + '» — ' + (x.owner ? pname(x.owner) + ' (id ' + x.owner + ')' : 'не назначен') + ', ' + dueLabel(x.due) + (x.source === 't1' ? ' (из пульта причин)' : '')) : ['- нет']),
      '', 'Пункты документов, на которые можно ссылаться:', ...mat.list.map(([d, n]) => '[D:' + d + ':' + n + '] ' + doc(d).short + ', п. ' + n + ': ' + item(d, n).text),
    ].join('\n');
    const system = 'Ты — ИИ-помощник руководителя компании «Проявка» (сеть фотосалонов и цех печати). Готовишь бриф к встрече. ' +
      'Пиши по-русски, коротко и по делу, только по фактам из контекста — ничего не выдумывай. Ответ — JSON: ' +
      '{"goal":"одна фраза","agenda":[{"title":"пункт повестки","owner":"id участника","minutes":10,"why":"почему важно, с цифрами","cites":["D:calib:2"]}],' +
      '"questions":[{"to":"id участника или guest","q":"вопрос"}],"risks":[{"text":"риск","cites":["D:bonus:3"]}]}. ' +
      'Повестка — 4–6 пунктов, сумма минут не больше длительности встречи. Если есть открытые или просроченные решения — отдельный пункт «Контроль решений». ' +
      'Решения из пульта причин обязательно включи в повестку. owner и to — только id из списка участников (или guest). cites — только из списка пунктов. ' +
      'В текстах (title, why, q, text) называй людей по фамилии, а не по id. 3–5 вопросов, 2–4 риска.';
    const r = await api.ai({ system, user: ctx, json: true, mask: true, who: who(), title: 'Бриф: ' + m.title, max_tokens: 1400, timeout: 40000 }, fb);
    let brief = r.fallback ? fb : normBrief(r.json, m, fb);
    if (!brief) { brief = fb; r.fallback = true; r.reason = 'ответ модели не по формату'; }
    brief.materials = mat; brief.r = r; brief.ts = new Date().toISOString();
    S.briefs[m.id] = brief; S.busy[m.id] = null;
    render();
  }
  function normBrief(j, m, fb) {
    if (!j || !Array.isArray(j.agenda) || !j.agenda.length) return null;
    const ids = new Set(m.people);
    const agenda = j.agenda.slice(0, 7).map((a) => ({ title: String(a.title || '').slice(0, 220), owner: ids.has(a.owner) ? a.owner : null,
      minutes: Math.max(1, Math.min(60, parseInt(a.minutes, 10) || 5)), why: String(a.why || ''), cites: parseCites(a.cites) })).filter((a) => a.title);
    // решения из пульта (трек 1) должны остаться в повестке, даже если модель их пропустила
    fb.agenda.filter((a) => a.tag).forEach((a) => {
      const key = a.title.replace('Решение из пульта: ', '').slice(0, 25).toLowerCase();
      if (!agenda.some((x) => (x.title + x.why).toLowerCase().includes(key))) agenda.push(a);
      else agenda.forEach((x) => { if ((x.title + x.why).toLowerCase().includes(key)) x.tag = 'Трек 1'; });
    });
    return {
      goal: String(j.goal || m.goal),
      agenda,
      questions: (Array.isArray(j.questions) ? j.questions : []).slice(0, 6).map((q) => ({ to: ids.has(q.to) || q.to === 'guest' ? q.to : null, q: String(q.q || '') })).filter((q) => q.q),
      risks: (Array.isArray(j.risks) ? j.risks : []).slice(0, 5).map((x) => typeof x === 'string' ? { text: x, cites: [] } : { text: String(x.text || ''), cites: parseCites(x.cites) }).filter((x) => x.text),
    };
  }

  /* протокол: встроенный разбор расшифровки */
  function parseProtocol(text, m) {
    const sents = text.replace(/\n+/g, ' \n').split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter(Boolean);
    const items = [];
    const base = new Date(m.start);
    sents.forEach((s0) => {
      let s = s0;
      const dm = s.match(/до (\d{1,2}) (октября|ноября|декабря)/i);
      const mon = /с понедельника/i.test(s);
      if (!dm && !mon) return;
      for (let i = 0; i < 3; i++) s = s.replace(/^[А-ЯЁ][а-яё]+(?:\s[а-яё]+)?:\s*/, '');
      let best = null, bestIdx = 1e9;
      Object.keys(FIRST).forEach((nm) => {
        const idx = s.search(new RegExp('(^|[\\s«])' + nm + '(?=[,\\s])'));
        if (idx >= 0 && idx < bestIdx) { bestIdx = idx; best = FIRST[nm]; }
      });
      if (!best) return;
      let title = s.replace(/^[А-ЯЁ][а-яё]+(?:\s+и\s+[А-ЯЁ][а-яё]+)?,\s*/, '')
        .replace(/(до \d{1,2} (?:октября|ноября|декабря)|с понедельника),?\s*/i, '').replace(/[.!]+$/, '').trim();
      title = title.charAt(0).toUpperCase() + title.slice(1);
      let due;
      if (dm) due = '2026-' + MONTHS[dm[2].toLowerCase()] + '-' + pad(dm[1]);
      else { const d = new Date(base); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); due = isoDay(d); }
      items.push({ title, owner: best, due });
    });
    const b = S.briefs[m.id] || fallbackBrief(m);
    const summary = 'Обсудили: ' + b.agenda.slice(0, 4).map((a) => a.title.replace(/:.*/, '').toLowerCase()).join('; ') + '. ' +
      'Приняли ' + items.length + ' ' + plural(items.length, 'решение', 'решения', 'решений') + ' с ответственными и сроками.';
    return { summary, items };
  }
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

  async function makeProtocol(m) {
    const text = (S.notes[m.id] || '').trim();
    if (!text) { toast('Сначала нужны заметки или расшифровка встречи'); return; }
    S.busy[m.id] = 'protocol'; S.view[m.id] = 'protocol'; render();
    const fb = parseProtocol(text, m);
    const ppl = C.people.map((p) => '- ' + p.id + ': имя ' + p.name.split(' ')[0] + ', фамилия ' + p.name.split(' ')[1] + ', ' + p.role.toLowerCase()).join('\n');
    const system = 'Ты ведёшь протокол встречи компании «Проявка». Из расшифровки извлеки все решения и поручения. ' +
      'Верни JSON: {"summary":"2–3 предложения: что обсудили и к чему пришли","items":[{"title":"поручение, начинается с глагола","owner":"id","due":"YYYY-MM-DD"}]}. ' +
      'owner — только id из списка людей; если ответственный не назван — null. Год — 2026. «С понедельника» — ближайший понедельник после даты встречи. ' +
      'Не выдумывай поручений, которых нет в тексте. Если в поручении двое — owner первый названный.';
    const user = 'Встреча: ' + m.title + ', ' + m.start.slice(0, 10) + ' (' + dayLabel(m.start) + ').\nЛюди:\n' + ppl + '\n\nРасшифровка:\n' + text;
    const r = await api.ai({ system, user, json: true, mask: true, who: who(), title: 'Протокол: ' + m.title, max_tokens: 1400, timeout: 40000 }, fb);
    let p = fb;
    if (!r.fallback && r.json && Array.isArray(r.json.items) && r.json.items.length) {
      p = { summary: String(r.json.summary || fb.summary), items: r.json.items.map((x) => ({ title: String(x.title || ''), owner: ownerId(x.owner),
        due: /^\d{4}-\d{2}-\d{2}$/.test(x.due || '') ? x.due : '' })).filter((x) => x.title) };
    } else if (!r.fallback) { r.fallback = true; r.reason = 'ответ модели не по формату'; }
    p.r = r;
    S.drafts[m.id] = p; S.busy[m.id] = null;
    render();
  }

  async function approve(m) {
    const d = S.drafts[m.id];
    const items = d.items.filter((x) => x.title.trim());
    if (!items.length) { toast('В протоколе нет ни одного решения'); return; }
    S.busy[m.id] = 'approve'; render();
    const rec = await api.add('meetings', { meeting_id: m.id, title: m.title, date: m.start, participants: m.people, summary: d.summary,
      items, approved_by: role().person, provider: d.r && !d.r.fallback ? d.r.provider : 'встроенная логика' });
    const created = [];
    for (const x of items) {
      created.push(await api.add('tasks', { title: x.title, owner: x.owner, due: x.due, status: 'new', source: 't3', meeting: rec.id, meeting_title: m.title }));
    }
    S.sent[m.id] = created.map((t) => t.id);
    if (S.health.telegram) {
      for (const t of created) await api.telegram(tgText(t, m), who());
    }
    await loadStore();
    S.busy[m.id] = null;
    toast('Протокол утверждён: ' + created.length + ' ' + plural(created.length, 'задача ушла', 'задачи ушли', 'задач ушли') + ' исполнителям');
    render();
  }
  const tgText = (t, m) => '📋 Задача со встречи «' + m.title + '», ' + new Date(m.start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) +
    '\n\n' + t.title + '\nСрок: ' + dueLabel(t.due) + '\nПоставил: ' + pname(role().person);

  /* ---------- рендер встреч ---------- */
  function renderMeetings() {
    const vis = MEETINGS.filter(meetingVisible);
    if (!vis.find((m) => m.id === S.meetingId) && vis.length) S.meetingId = vis[0].id;
    const days = {};
    MEETINGS.forEach((m) => { (days[m.start.slice(0, 10)] = days[m.start.slice(0, 10)] || []).push(m); });
    const list = Object.keys(days).map((d) => '<div><div class="day-label">' + esc(dayLabel(d + 'T12:00')) + '</div>' + days[d].map((m) => {
      const ok = meetingVisible(m);
      const done = S.meetings.some((x) => x.meeting_id === m.id);
      const chip = done ? '<span class="chip chip-ok">протокол есть</span>' : S.briefs[m.id] ? '<span class="chip chip-accent">бриф готов</span>' : '';
      return '<button class="meet' + (ok ? '' : ' locked') + '" ' + (ok ? 'data-act="meeting" data-id="' + m.id + '"' : 'disabled') + ' aria-current="' + (ok && m.id === S.meetingId) + '">' +
        '<div class="meet-time">' + timeLabel(m.start) + ' · ' + m.dur + ' мин</div>' +
        '<div class="meet-title">' + esc(m.title) + '</div>' +
        '<div class="meet-foot"><span class="avas">' + m.people.map(ava).join('') + '</span>' + (ok ? chip : '<span class="chip">🔒 нет доступа</span>') + '</div></button>';
    }).join('') + '</div>').join('');
    const m = vis.find((x) => x.id === S.meetingId);
    return '<div class="sec-head"><div><h2 class="sec">Встречи недели</h2><p class="sec-lead">Помощник готовит бриф из отклонений, открытых решений и документов, ведёт протокол и раздаёт задачи.</p></div></div>' +
      '<div class="meet-grid"><div class="week">' + list + '</div><section class="card detail">' + (m ? renderDetail(m) : '<p class="empty">Для этой роли встреч нет.</p>') + '</section></div>';
  }
  function renderDetail(m) {
    const v = S.view[m.id] || 'brief';
    const approved = S.meetings.filter((x) => x.meeting_id === m.id).slice(-1)[0];
    const head = '<div class="detail-head"><div><div class="eyebrow">' + esc(dayLabel(m.start)) + ' · ' + timeLabel(m.start) + ' · ' + m.dur + ' мин</div>' +
      '<h2>' + esc(m.title) + '</h2><p class="goal">' + esc(m.goal) + '</p>' +
      '<div class="row" style="margin-top:10px;flex-wrap:wrap">' + m.people.map((id) => '<span class="person">' + ava(id) + esc(pname(id)) + '</span>').join('') +
      (m.guests || []).map((g) => '<span class="chip">' + esc(g) + '</span>').join('') + '</div></div></div>';
    const steps = '<div class="steps" role="tablist">' + [['brief', 'Бриф'], ['run', 'Встреча'], ['protocol', 'Протокол']].map(([k, l], i) =>
      '<button role="tab" data-act="view" data-v="' + k + '" aria-selected="' + (v === k) + '"><span class="n">' + (i + 1) + '</span>' + l + '</button>').join('') + '</div>';
    let body = '';
    if (v === 'brief') body = renderBrief(m);
    if (v === 'run') body = renderRun(m);
    if (v === 'protocol') body = renderProtocol(m, approved);
    return head + steps + body;
  }
  function renderBrief(m) {
    if (S.busy[m.id] === 'brief') return '<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Готовлю бриф</b><p class="muted typing">Смотрю отклонения октября, открытые решения участников и пункты документов</p></div></div>';
    const b = S.briefs[m.id];
    if (!b) {
      return '<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Подготовить встречу?</b>' +
        '<p class="muted" style="margin-top:4px">Соберу повестку из отклонений пульта, открытых и просроченных решений участников (в том числе созданных в пульте причин), приложу пункты документов, предложу вопросы и риски. Персональные данные замаскирую до отправки модели.</p>' +
        '<div class="actions" style="margin-top:12px"><button class="btn btn-primary" data-act="brief">Подготовить бриф</button></div></div></div>';
    }
    const total = b.agenda.reduce((s, a) => s + a.minutes, 0);
    const mat = b.materials;
    return '<div class="brief">' +
      '<div><h4>Цель</h4><p>' + esc(b.goal) + '</p></div>' +
      '<div><h4>Повестка · ' + total + ' из ' + m.dur + ' мин</h4><ol class="agenda">' + b.agenda.map((a, i) =>
        '<li><span class="i">' + (i + 1) + '</span><div><div class="t">' + esc(a.title) + (a.tag ? ' <span class="chip chip-accent">' + esc(a.tag) + '</span>' : '') + '</div>' +
        (a.why ? '<div class="why">' + esc(a.why) + '</div>' : '') + (a.cites && a.cites.length ? '<div style="margin-top:6px">' + cites(a.cites) + '</div>' : '') + '</div>' +
        '<div class="meta"><span class="mono">' + a.minutes + ' мин</span>' + (a.owner ? '<span class="person">' + ava(a.owner) + esc(pname(a.owner).split(' ')[1] || '') + '</span>' : '') + '</div></li>').join('') + '</ol></div>' +
      '<div class="two"><div><h4>Вопросы участникам</h4><ul class="qs">' + b.questions.map((q) => '<li><b>' + esc(q.to === 'guest' ? 'Гостю' : q.to ? pname(q.to) : 'Всем') + ':</b> ' + esc(q.q) + '</li>').join('') + '</ul></div>' +
      '<div><h4>Риски</h4><ul class="risks">' + b.risks.map((x) => '<li>' + esc(x.text) + (x.cites && x.cites.length ? ' ' + cites(x.cites) : '') + '</li>').join('') + '</ul></div></div>' +
      '<div><h4>Материалы к встрече</h4>' + (mat.list.length ? mat.list.map(([d, n]) => '<div class="mat">' + citeBtn(d, n) + esc(item(d, n).text) + '</div>').join('') : '<p class="empty">Нет доступных документов.</p>') +
      (mat.hidden.length ? '<p class="locked-note" style="margin-top:8px">🔒 ' + mat.hidden.map((d) => '«' + esc(doc(d).title) + '»').join(', ') + ' — закрыто для роли «' + esc(role().label) + '». В бриф они не попали и в модель не отправлялись.</p>' : '') + '</div>' +
      '<div class="row" style="justify-content:space-between;flex-wrap:wrap">' + provLine(b.r) +
      '<div class="actions no-print"><button class="btn btn-sm" data-act="brief">Пересобрать</button><button class="btn btn-sm btn-primary" data-act="view" data-v="run">Начать встречу →</button></div></div>' +
      '</div>';
  }
  function renderRun(m) {
    const b = S.briefs[m.id] || fallbackBrief(m);
    const run = S.run[m.id] || { start: null, checked: [] };
    const hasRec = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    return '<div class="run"><div class="stack">' +
      '<div class="row" style="justify-content:space-between"><div class="timer" id="timer">' + timerText(m) + '<small>из ' + m.dur + ' мин</small></div>' +
      '<button class="btn btn-sm" data-act="timer">' + (run.start ? 'Сбросить' : 'Старт') + '</button></div>' +
      '<div><div class="eyebrow" style="margin-bottom:4px">Повестка</div><ul class="check">' + b.agenda.map((a, i) => {
        const done = run.checked.includes(i);
        return '<li class="' + (done ? 'done' : '') + '"><input type="checkbox" data-act="check" data-i="' + i + '" ' + (done ? 'checked' : '') + ' aria-label="Пункт ' + (i + 1) + '"><span>' + esc(a.title) + ' <span class="faint mono">' + a.minutes + ' мин</span></span></li>';
      }).join('') + '</ul></div></div>' +
      '<div class="stack"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><div class="eyebrow">Заметки и расшифровка</div>' +
      '<div class="actions"><button class="btn btn-sm rec' + (S.recOn ? ' on' : '') + '" data-act="mic" ' + (hasRec ? '' : 'disabled') + '><span class="dot" style="color:var(--ink3)"></span>' + (S.recOn ? 'Остановить' : 'Диктовать') + '</button>' +
      '<button class="btn btn-sm" data-act="demo">Вставить демо-расшифровку</button></div></div>' +
      '<textarea class="textarea notes" id="notes" placeholder="Кто что сказал и что решили. Формат «Решение: Имя, до 12 ноября — что сделать» помощник разберёт и без модели.">' + esc(S.notes[m.id] || '') + '</textarea>' +
      '<p class="hint">' + (hasRec ? 'Сейчас речь распознаёт браузер.' : 'Этот браузер не распознаёт речь.') + ' В защищённом контуре распознавание идёт на вашем сервере (локальный Whisper) — звук наружу не уходит.</p>' +
      '<div class="actions"><button class="btn btn-primary" data-act="protocol">Сформировать протокол →</button></div></div></div>';
  }
  function timerText(m) {
    const run = S.run[m.id];
    if (!run || !run.start) return '00:00';
    const s = Math.floor((Date.now() - run.start) / 1000);
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  function renderProtocol(m, approved) {
    if (S.busy[m.id] === 'protocol') return '<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Составляю протокол</b><p class="muted typing">Ищу решения, ответственных и сроки</p></div></div>';
    const d = S.drafts[m.id];
    const sent = S.sent[m.id];
    if (sent && sent.length) {
      const ts = S.tasks.filter((t) => sent.includes(t.id));
      return '<div class="stack"><div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Протокол утверждён</b><p class="muted">' + esc((approved && approved.summary) || (d && d.summary) || '') + '</p>' +
        '<p class="ai-src">Задачи в контроле: ' + ts.length + '. Каждому исполнителю ушло сообщение' + (S.health.telegram ? ' в Telegram' : ' (ниже — как оно выглядит в Telegram)') + '. Статусы видны на доске «Задачи» и в итогах недели.</p></div></div>' +
        '<div class="tg-grid">' + ts.map((t) => '<div class="tg"><div class="tg-head">' + ava(t.owner) + esc(pname(t.owner)) + ' · Telegram</div>' +
          '<div class="tg-msg">' + esc(tgText(t, m)) + '</div><div class="tg-btns">' +
          (effStatus(t) === 'new' ? '<button class="tg-btn" data-act="tg" data-id="' + t.id + '" data-s="in_progress">✅ Принято</button><button class="tg-btn" data-act="tg" data-id="' + t.id + '" data-s="question">❓ Вопрос</button>'
            : '<span class="chip chip-ok">' + (effStatus(t) === 'done' ? 'Выполнено' : 'Принято в работу') + '</span>') + '</div></div>').join('') + '</div>' +
        '<div class="actions"><button class="btn btn-sm" data-act="tab" data-tab="tasks">Открыть доску задач →</button></div></div>';
    }
    if (approved && !d) {
      return '<div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body"><b>Протокол уже утверждён</b><p class="muted">' + esc(approved.summary || '') + '</p>' +
        '<ul class="list" style="margin-top:8px">' + (approved.items || []).map((x) => '<li><span>' + esc(x.title) + '</span><span class="r">' + esc(pname(x.owner)) + ' · ' + dueLabel(x.due) + '</span></li>').join('') + '</ul></div></div>';
    }
    if (!d) return '<p class="empty">Протокола пока нет. На шаге «Встреча» вставьте заметки или расшифровку и нажмите «Сформировать протокол».</p>';
    return '<div class="stack"><div class="field"><label for="psum">Итог встречи</label><textarea class="textarea" id="psum" data-act="psum" style="min-height:70px">' + esc(d.summary) + '</textarea></div>' +
      '<table class="table ptable"><thead><tr><th>Решение / поручение</th><th>Ответственный</th><th>Срок</th><th></th></tr></thead><tbody>' +
      d.items.map((x, i) => '<tr><td><input data-pi="' + i + '" data-f="title" value="' + esc(x.title) + '" aria-label="Поручение"></td>' +
        '<td><select data-pi="' + i + '" data-f="owner" aria-label="Ответственный"><option value="">— не назначен —</option>' + C.people.map((p) => '<option value="' + p.id + '"' + (p.id === x.owner ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></td>' +
        '<td><input type="date" data-pi="' + i + '" data-f="due" value="' + esc(x.due || '') + '" aria-label="Срок"></td>' +
        '<td><button class="x" data-act="prow-del" data-i="' + i + '" aria-label="Удалить строку">×</button></td></tr>').join('') +
      '</tbody></table>' +
      '<div class="row" style="justify-content:space-between;flex-wrap:wrap"><button class="btn btn-sm btn-ghost" data-act="prow-add">+ Добавить строку</button>' + provLine(d.r) + '</div>' +
      '<div class="actions"><button class="btn btn-primary" data-act="approve" ' + (S.busy[m.id] === 'approve' ? 'disabled' : '') + '>' + (S.busy[m.id] === 'approve' ? '<span class="spin"></span> Рассылаю…' : 'Утвердить и разослать исполнителям') + '</button>' +
      '<button class="btn" data-act="view" data-v="run">← К заметкам</button></div></div>';
  }

  /* ================= ДОКУМЕНТЫ ================= */
  const SUGG = ['Как часто калибровать минилаб?', 'Может ли новый оператор калибровать сам?', 'Сколько человек должно быть в смене салона?',
    'Какой брак допустим для премии?', 'Какая скидка у поставщика за объём?', 'Что делать, если салону нужна замена?'];
  async function askDocs(q) {
    q = String(q || '').trim();
    if (!q) return;
    const docs = visibleDocs();
    const hidden = allDocs().length - docs.length;
    const hits = search(q, docs, 5);
    S.answer = { q, hits, hidden, loading: true }; render();
    if (!hits.length) {
      S.answer = { q, hits, hidden, text: 'В доступных вам документах ответа на этот вопрос нет.', r: { fallback: true } };
      render(); return;
    }
    const ctx = hits.map((h) => '[D:' + h.doc.id + ':' + h.it.n + '] ' + h.doc.title + ', п. ' + h.it.n + ': ' + h.it.text).join('\n');
    const fb = () => 'Ближайшие пункты из доступных вам документов (дословно, без модели):\n\n' + hits.slice(0, 3).map((h) => h.it.text + ' [D:' + h.doc.id + ':' + h.it.n + ']').join('\n\n');
    const r = await api.ai({
      system: 'Ты — помощник руководителя компании «Проявка». Отвечай только по приведённым пунктам документов, по-русски, 2–5 предложений. ' +
        'После каждого утверждения ставь ссылку на пункт строго в формате [D:id:номер], каждую ссылку в отдельных скобках. ' +
        'Если в пунктах нет ответа — так и скажи: «В документах этого нет». Ничего не добавляй от себя.',
      user: 'Вопрос: ' + q + '\n\nПункты документов:\n' + ctx, mask: true, who: who(), title: 'Вопрос по документам: ' + q, max_tokens: 600,
    }, fb);
    S.answer = { q, hits, hidden, text: r.text, r };
    if (hits[0]) { S.docId = hits[0].doc.id; S.hl = null; }
    render();
  }
  function renderDocs() {
    if (!docVisible(S.docId)) { const v = visibleDocs()[0]; S.docId = v ? v.id : null; }
    const list = allDocs().map((d) => {
      const ok = d.access.includes(S.role);
      return '<li><button class="' + (ok ? '' : 'locked') + '" ' + (ok ? 'data-act="doc" data-id="' + d.id + '"' : 'disabled') + ' aria-current="' + (d.id === S.docId) + '">' +
        '<span class="doc-ico">' + (ok ? esc((d.kind || 'Док').slice(0, 3).toUpperCase()) : '🔒') + '</span><span><span>' + esc(d.title) + '</span><br><span class="k">' +
        (ok ? esc(d.code || '') + (d.local ? ' · только в этом браузере' : '') : 'закрыто для роли «' + esc(role().label) + '»') + '</span></span></button></li>';
    }).join('');
    const a = S.answer;
    let ans = '';
    if (a) {
      const foundIn = [...new Set(a.hits.map((h) => h.doc.short))];
      ans = '<div class="answer"><div class="ai-note"><div class="ai-ava">ИИ</div><div class="ai-body">' +
        (a.loading ? '<p class="muted typing">Ищу в ' + visibleDocs().length + ' документах и формулирую ответ</p>' : rich(a.text)) +
        (foundIn.length && !a.loading ? '<p class="ai-src">Искал в доступных документах, нашла в: ' + foundIn.map(esc).join(', ') + '.</p>' : '') +
        (a.hidden ? '<p class="ai-src">🔒 Не искал в ' + a.hidden + ' ' + plural(a.hidden, 'документе', 'документах', 'документах') + ' — они закрыты для роли «' + esc(role().label) + '».</p>' : '') +
        (!a.loading ? provLine(a.r) : '') + '</div></div></div>';
    }
    const d = doc(S.docId);
    const hitSet = new Set(a && !a.loading ? a.hits.filter((h) => h.doc.id === S.docId).map((h) => h.it.n) : []);
    const view = d ? '<div class="card-flat doc-view" style="margin-top:16px"><div class="eyebrow">' + esc(d.kind || 'Документ') + '</div><h3 style="font-size:18px;margin-top:2px">' + esc(d.title) + '</h3>' +
      '<div class="doc-meta"><span class="chip">' + esc(d.code || '') + '</span>' + (d.date ? '<span class="chip">от ' + esc(new Date(d.date).toLocaleDateString('ru-RU')) + '</span>' : '') +
      '<span class="chip chip-ok">видят: ' + d.access.map((r) => ROLES[r].label).join(', ') + '</span></div>' +
      d.items.map((it) => '<div class="item' + (S.hl === it.n ? ' hl' : hitSet.has(it.n) ? ' found' : '') + '" id="it-' + esc(it.n) + '"><span class="n">' + esc(it.n) + '.</span><span>' + esc(it.text) + '</span></div>').join('') + '</div>'
      : '<p class="empty">Для этой роли нет доступных документов.</p>';
    return '<div class="sec-head"><div><h2 class="sec">Документы компании</h2><p class="sec-lead">Помощник отвечает только по пунктам документов и ставит ссылки. Документы вне вашей роли не участвуют в поиске.</p></div></div>' +
      '<div class="docs-grid"><div class="card"><ul class="doc-list">' + list + '</ul>' +
      '<label class="btn btn-sm btn-ghost" style="margin-top:8px;width:100%">+ Свой документ (.txt, .md)<input type="file" id="upload" accept=".txt,.md,text/plain,text/markdown" hidden></label>' +
      '<p class="hint" style="padding:0 6px">Загруженный файл живёт только в этом браузере и пропадёт после перезагрузки.</p></div>' +
      '<div><div class="card"><form class="ask" data-act="ask"><input class="input" id="q" placeholder="Спросите, например: кто отвечает за калибровку?" value="' + esc(a ? a.q : '') + '" autocomplete="off">' +
      '<button class="btn btn-primary" type="submit">Спросить</button></form>' +
      '<div class="sugg">' + SUGG.map((s) => '<button data-act="sugg">' + esc(s) + '</button>').join('') + '</div>' + ans + '</div>' + view + '</div></div>';
  }

  /* ================= ЗАДАЧИ ================= */
  function renderTasks() {
    const all = workItems();
    const vis = all.filter((x) => canSeeOwner(x.owner));
    const hidden = all.length - vis.length;
    const people = [...new Set(vis.map((x) => x.owner).filter(Boolean))];
    if (S.filter !== 'all' && !people.includes(S.filter)) S.filter = 'all';
    const shown = vis.filter((x) => S.filter === 'all' || x.owner === S.filter);
    const cols = [['new', 'Новые'], ['in_progress', 'В работе'], ['overdue', 'Просрочено'], ['done', 'Готово']];
    const fresh = new Set(Object.values(S.sent).flat());
    const card = (x) => '<div class="tcard' + (x.st === 'overdue' ? ' overdue' : '') + (fresh.has(x.id) ? ' fresh' : '') + '"><div class="tt">' + esc(x.title) + '</div>' +
      '<div class="tm"><span class="person">' + (x.owner ? ava(x.owner) + esc(pname(x.owner)) : 'не назначен') + '</span><span class="' + (x.st === 'overdue' ? 'chip chip-bad' : 'chip') + '">' + dueLabel(x.due) + '</span></div>' +
      '<div class="src">' + esc(srcLabel(x)) + (x.st === 'overdue' && x.status === 'in_progress' ? ' · в работе' : '') + '</div>' +
      '<div class="tb">' + (x.st !== 'done' && x.status !== 'in_progress' ? '<button class="btn btn-sm" data-act="st" data-kind="' + x.kind + '" data-id="' + x.id + '" data-s="in_progress">В работу</button>' : '') +
      (x.st !== 'done' ? '<button class="btn btn-sm" data-act="st" data-kind="' + x.kind + '" data-id="' + x.id + '" data-s="done">Готово</button>' :
        '<button class="btn btn-sm btn-ghost" data-act="st" data-kind="' + x.kind + '" data-id="' + x.id + '" data-s="in_progress">Вернуть</button>') + '</div></div>';
    return '<div class="sec-head"><div><h2 class="sec">Задачи и решения</h2><p class="sec-lead">Всё, что решили на встречах и в пульте причин, — с ответственным и сроком. Просрочка видна сразу.</p></div>' +
      '<label class="row"><span class="faint">Кто</span><select class="select" data-act="filter" style="width:auto"><option value="all">Все (' + vis.length + ')</option>' +
      people.map((id) => '<option value="' + id + '"' + (S.filter === id ? ' selected' : '') + '>' + esc(pname(id)) + '</option>').join('') + '</select></label></div>' +
      (hidden ? '<p class="locked-note" style="margin-bottom:12px">🔒 Ещё ' + hidden + ' ' + plural(hidden, 'задача скрыта', 'задачи скрыты', 'задач скрыто') + ' — они вне участка роли «' + esc(role().label) + '».</p>' : '') +
      '<div class="board">' + cols.map(([k, l]) => { const xs = shown.filter((x) => x.st === k); return '<div class="col"><h3><span>' + l + '</span><span class="faint mono">' + xs.length + '</span></h3>' + (xs.length ? xs.map(card).join('') : '<p class="empty">Пусто</p>') + '</div>'; }).join('') + '</div>';
  }

  /* ================= ИТОГИ ================= */
  function weekFacts() {
    const all = workItems().filter((x) => canSeeOwner(x.owner));
    const by = (st) => all.filter((x) => x.st === st);
    const soon = all.filter((x) => x.st !== 'done' && x.due && x.due >= TODAY && x.due <= isoDay(new Date(Date.now() + 7 * 864e5))).sort((a, b) => a.due.localeCompare(b.due));
    const effects = S.decisions.filter((d) => d.effect && canSeeOwner(ownerId(d.owner)));
    const covered = new Set(S.decisions.filter((d) => d.status !== 'done').map((d) => d.metric));
    const openTitles = all.filter((x) => x.st !== 'done').map((x) => x.title.toLowerCase()).join(' | ');
    deviations().forEach((x) => { if ((KW[x.key] || []).some((w) => openTitles.includes(w))) covered.add(x.key); });
    const uncovered = deviations().filter((x) => !covered.has(x.key) && (role().areas && (role().areas.includes('all') || role().areas.includes(x.area)) || role().own)).slice(0, 5);
    return { all, done: by('done'), over: by('overdue'), work: by('in_progress'), fresh: by('new'), soon, effects, uncovered };
  }
  function fallbackDirector(f) {
    const pr = C.last('profit'), pp = C.last('profit', 'plan');
    const oldest = f.over.slice().sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
    return 'Октябрь: прибыль ' + fmt.money(pr) + ' при плане ' + fmt.money(pp) + ' (' + fmt.signed(fmt.delta(pr, pp), 0) + ' %). ' +
      'Причины — салон «Галерея» 7 дней стоял без замены (−11 500 BYN выручки) и брак 11,4 % на минилабе №2 после пропущенных калибровок (≈ 2 300 BYN бумаги и 212 ч сверхурочных).\n\n' +
      'В контроле ' + f.all.length + ' решений и задач: выполнено ' + f.done.length + ', в работе ' + f.work.length + ', новых ' + f.fresh.length + ', просрочено ' + f.over.length + '.' +
      (oldest ? ' Самое старое просроченное — «' + oldest.title + '» (' + pname(oldest.owner) + ', ' + dueLabel(oldest.due) + ').' : '') + '\n\n' +
      (f.soon.length ? 'На этой неделе сроки: ' + f.soon.slice(0, 3).map((x) => pname(x.owner).split(' ')[1] + ' — «' + x.title + '»').join('; ') + '. ' : '') +
      'Риск недели — сезон фотокниг при просрочке переплёта 14 %.';
  }
  async function directorSummary() {
    const f = weekFacts();
    S.dirSummary = { loading: true }; render();
    const ctx = ['Отклонения октября:', ...deviations().slice(0, 8).map((x) => '- ' + devLine(x)),
      '', 'Решения и задачи:', ...f.all.map((x) => '- [' + ({ done: 'выполнено', overdue: 'просрочено', in_progress: 'в работе', new: 'новое' })[x.st] + '] «' + x.title + '» — ' + pname(x.owner) + ', ' + dueLabel(x.due) + (x.effect ? ', эффект: ' + x.effect : '')),
      '', 'Протоколы встреч: ' + (S.meetings.map((m) => m.title).join('; ') || 'нет'),
      '', 'События:', ...C.events.map((e) => '- ' + e.date + ': ' + e.text)].join('\n');
    const r = await api.ai({ system: 'Ты — помощник руководителя. Напиши итог недели для директора, который читается за 30 секунд: 4–6 предложений, ' +
      'по-русски, без воды. Что с деньгами и почему; что сделано; что горит и кто отвечает; один главный риск и одно предложение, что решить. Только факты из контекста.',
      user: ctx, mask: true, who: who(), title: 'Итог недели для директора', max_tokens: 500 }, () => fallbackDirector(f));
    S.dirSummary = { text: r.text, r }; render();
  }
  function renderSummary() {
    const f = weekFacts();
    const stat = (v, l, cls) => '<div class="card stat"><div class="v ' + (cls || '') + '">' + v + '</div><div class="l">' + l + '</div></div>';
    const li = (x) => '<li><span>' + esc(x.title) + '</span><span class="r">' + esc(pname(x.owner).split(' ')[1] || '—') + ' · ' + dueLabel(x.due) + '</span></li>';
    const ds = S.dirSummary;
    const isDir = S.role === 'director';
    return '<div class="sec-head"><div><h2 class="sec">Управленческие итоги недели</h2><p class="sec-lead">' + (isDir ? 'По всей компании.' : 'Только ваш участок — роль «' + esc(role().label) + '».') + ' Неделя 9–13 ноября 2026.</p></div>' +
      '<div class="actions no-print"><button class="btn" data-act="print">Печать</button>' + (isDir ? '<button class="btn btn-primary" data-act="dir">Итог для директора за 30 секунд</button>' : '') + '</div></div>' +
      (ds ? '<div class="ai-note" style="margin-bottom:16px"><div class="ai-ava">ИИ</div><div class="ai-body">' + (ds.loading ? '<p class="muted typing">Собираю итог</p>' : rich(ds.text) + provLine(ds.r)) + '</div></div>' : '') +
      '<div class="stats">' + stat(f.all.length, 'решений и задач в контроле') + stat(f.done.length, 'выполнено', 'delta-up') + stat(f.over.length, 'просрочено', f.over.length ? 'delta-down' : '') + stat(S.meetings.length, 'протоколов утверждено') + '</div>' +
      '<div class="two" style="margin-top:14px">' +
      '<div class="card"><h3>Горит</h3><ul class="list">' + (f.over.length ? f.over.map(li).join('') : '<li class="empty">Просрочек нет</li>') + '</ul></div>' +
      '<div class="card"><h3>Сроки на этой неделе</h3><ul class="list">' + (f.soon.length ? f.soon.map(li).join('') : '<li class="empty">Нет сроков на ближайшие 7 дней</li>') + '</ul></div>' +
      '<div class="card"><h3>Сделано</h3><ul class="list">' + (f.done.length ? f.done.map(li).join('') : '<li class="empty">Пока ничего</li>') + '</ul></div>' +
      '<div class="card"><h3>Ожидаемый эффект решений</h3><ul class="list">' + (f.effects.length ? f.effects.map((d) => '<li><span>' + esc(d.title) + '</span><span class="r">' + esc(d.effect) + '</span></li>').join('') : '<li class="empty">Нет решений с оценкой эффекта</li>') + '</ul></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><h3>Отклонения без решения</h3><p class="muted" style="font-size:13.5px;margin:2px 0 6px">Показатели хуже плана, по которым никто пока не отвечает. Их стоит поставить в повестку.</p><ul class="list">' +
      (f.uncovered.length ? f.uncovered.map((x) => '<li><span>' + esc(devLine(x)) + '</span><span class="r">' + esc(pname(AREA_OWNER[x.area]).split(' ')[1]) + '</span></li>').join('') : '<li class="empty">По всем отклонениям есть решения</li>') + '</ul></div>' +
      (S.meetings.length ? '<div class="card" style="margin-top:14px"><h3>Протоколы</h3><ul class="list">' + S.meetings.map((m) => '<li><span>' + esc(m.title) + '</span><span class="r">' + (m.items || []).length + ' решений · ' + esc(new Date(m.ts).toLocaleDateString('ru-RU')) + '</span></li>').join('') + '</ul></div>' : '');
  }

  /* ================= ЗАЩИТА ================= */
  const MASK_SAMPLE = 'Встреча с поставщиком: ООО «Фотобум-Снаб», УНП 999000111, директор Кравец Олег Николаевич, тел. +375 29 000-11-22, sales@fotobum.example. ' +
    'Просим скидку 8 % при заказе 50 рулонов на 9 300 BYN. От нас — Ирина Лисовская и Сергей Морозов.';
  async function setMode(mode) {
    await api.mode(mode);
    await loadHealth();
    S.localState = null;
    if (mode === 'local') {
      S.localState = { loading: true }; render();
      const r = await api.ai({ system: 'Ответь одним словом.', user: 'Скажи «готово».', who: who(), title: 'Проверка локальной модели', max_tokens: 10, timeout: 8000 }, 'нет');
      S.localState = r.fallback ? { ok: false } : { ok: true, model: r.model, ms: r.ms };
    }
    toast({ cloud: 'Облако с маскированием', local: 'Локальная модель', off: 'ИИ выключен — работает встроенная логика' }[mode]);
    S.audit = await api.list('audit');
    render();
  }
  async function checkMask() {
    const ta = document.getElementById('mtext');
    const text = ta ? ta.value : MASK_SAMPLE;
    S.maskCheck = { text, loading: true }; render();
    const r = await api.ai({ system: 'Перескажи текст в одном предложении. Метки в квадратных скобках оставь как есть.', user: text, mask: true, who: who(), title: 'Проверка маскирования', max_tokens: 200 },
      'Модель не вызывалась — ниже видно, что ушло бы наружу.');
    S.maskCheck = { text, r };
    S.audit = await api.list('audit');
    render();
  }
  function renderSecurity() {
    const mode = S.health.mode;
    const modes = [
      ['cloud', 'Облако с маскированием', 'DeepSeek через сервер компании. Перед отправкой ФИО, телефоны, УНП, почта и суммы заменяются метками, ответ собирается обратно на сервере.'],
      ['local', 'Локальная модель на своём сервере', 'Ollama или LM Studio в контуре компании. Наружу не уходит ничего — даже метки.'],
      ['off', 'Без ИИ', 'Поиск по документам, бриф и протокол работают на встроенной логике. Ничего не отправляется.'],
    ];
    const ls = S.localState;
    const mc = S.maskCheck;
    let cmp = '';
    if (mc) {
      const sent = mc.r && mc.r.masked ? mc.r.masked.sent_preview : '';
      cmp = mc.loading ? '<p class="muted typing" style="margin-top:10px">Проверяю</p>' :
        '<div class="cmp"><div><div class="eyebrow">Было у нас</div><pre>' + esc(mc.text) + '</pre></div>' +
        '<div><div class="eyebrow">Ушло в модель</div><pre>' + esc(sent).replace(/\[[А-ЯЁ]+_\d+\]/g, (x) => '<mark>' + x + '</mark>') + '</pre></div></div>' +
        '<div class="ai-note" style="margin-top:10px"><div class="ai-ava">ИИ</div><div class="ai-body"><p>' + esc(mc.r.text) + '</p>' +
        '<p class="ai-src">' + (mc.r.fallback ? 'Модель не вызывалась (' + esc(mode === 'off' ? 'ИИ выключен' : mc.r.reason || 'нет ответа') + ').' : 'Модель видела только метки: ' + esc((mc.r.masked && mc.r.masked.labels || []).join(', ')) + '. Настоящие значения подставил сервер компании.') + '</p></div></div>';
    }
    const roleCols = ROLE_IDS.map((r) => '<th>' + esc(ROLES[r].label) + '</th>').join('');
    const matrix = '<table class="table matrix"><thead><tr><th>Документ</th>' + roleCols + '</tr></thead><tbody>' + allDocs().map((d) => '<tr><td>' + esc(d.short || d.title) + '</td>' +
      ROLE_IDS.map((r) => '<td>' + (d.access.includes(r) ? '<span class="yes">✓</span>' : '<span class="no">—</span>') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    const audit = S.audit.slice().reverse().slice(0, 40);
    return '<div class="sec-head"><div><h2 class="sec">Защищённый контур</h2><p class="sec-lead">Где думает помощник, что уходит наружу, кто что видит и кто что спрашивал.</p></div></div>' +
      '<div class="sec-grid">' +
      '<div class="card"><h3>Где работает модель</h3><div class="modes" role="radiogroup" style="margin-top:10px">' + modes.map(([k, t, p]) =>
        '<button class="mode" role="radio" aria-checked="' + (mode === k) + '" data-act="mode" data-mode="' + k + '"><span class="r"></span><span><b>' + t + '</b><p>' + p + '</p></span></button>').join('') + '</div>' +
      (ls ? '<div class="mode-state">' + (ls.loading ? '<span class="spin"></span> Проверяю локальную модель…' : ls.ok ? '<span class="chip chip-ok">Локальная модель отвечает · ' + esc(ls.model) + ' · ' + ls.ms + ' мс</span>' :
        '<div class="locked-note"><b>Локальная модель на этом ноутбуке не запущена</b> — помощник продолжает работать на встроенной логике: поиск по документам, бриф и протокол. ' +
        'Чтобы включить, достаточно поднять Ollama (<span class="code">ollama run qwen2.5:7b</span>) или LM Studio — сервер подключится сам по <span class="code">LOCAL_LLM_URL</span>.</div>') + '</div>' : '') + '</div>' +
      '<div class="card"><h3>Проверить, что уйдёт наружу</h3><p class="muted" style="font-size:13.5px;margin-top:2px">Вставьте любой текст — сервер покажет, что увидит модель.</p>' +
      '<textarea class="textarea" id="mtext" style="margin-top:10px;min-height:96px">' + esc(mc ? mc.text : MASK_SAMPLE) + '</textarea>' +
      '<div class="actions" style="margin-top:10px"><button class="btn btn-primary" data-act="maskcheck">Проверить</button></div>' + cmp + '</div>' +
      '<div class="card"><h3>Кто какие документы видит</h3><p class="muted" style="font-size:13.5px;margin:2px 0 8px">Закрытые документы не участвуют в поиске и не попадают в модель. В MVP права проверяет интерфейс; в рабочей версии — сервер по учётной записи сотрудника.</p><div style="overflow-x:auto">' + matrix + '</div></div>' +
      '<div class="card"><h3>Где живут данные</h3><ul class="where" style="margin-top:8px">' +
      '<li>Документы, задачи, протоколы и журнал — на сервере компании, не в облаке.</li>' +
      '<li>Ключ модели хранится только на сервере, браузер его не видит.</li>' +
      '<li>В облако уходит только текст запроса после маскирования; ответ собирается обратно у вас.</li>' +
      '<li>На локальной модели наружу не уходит ничего.</li>' +
      '<li>Каждый запрос к модели и смена режима — в журнале с именем и ролью.</li></ul></div>' +
      '</div>' +
      '<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>Журнал обращений</h3><button class="btn btn-sm" data-act="audit">Обновить</button></div>' +
      '<div class="audit" style="margin-top:8px">' + (audit.length ? '<table class="table"><thead><tr><th>Когда</th><th>Кто</th><th>Что</th><th>Наружу</th></tr></thead><tbody>' +
        audit.map((a) => '<tr><td class="mono" style="white-space:nowrap">' + esc(fmt.dt(a.ts)) + '</td><td>' + esc(a.who) + '</td><td><b style="font-weight:500">' + esc(a.action) + '</b><br><span class="faint">' + esc(a.detail) + '</span></td>' +
          '<td>' + (a.outside ? '<span class="chip chip-warn">облако, после маскирования</span>' : '<span class="chip chip-ok">внутри</span>') + '</td></tr>').join('') + '</tbody></table>'
        : '<p class="empty">Пока пусто — задайте вопрос по документам или подготовьте бриф.</p>') + '</div></div>';
  }

  /* ================= общий рендер и события ================= */
  function render() {
    document.querySelectorAll('.t3-nav .tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
    document.getElementById('role').value = S.role;
    const views = { meetings: renderMeetings, docs: renderDocs, tasks: renderTasks, summary: renderSummary, security: renderSecurity };
    app.innerHTML = (views[S.tab] || renderMeetings)();
    const n = document.getElementById('notes');
    if (n) n.addEventListener('input', () => { S.notes[S.meetingId] = n.value; });
    const up = document.getElementById('upload');
    if (up) up.addEventListener('change', onUpload);
    if (S.tab === 'docs' && S.hl) { const el = document.getElementById('it-' + S.hl); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  async function goTab(tab) {
    S.tab = tab;
    const u = new URL(location); u.searchParams.set('tab', tab); history.replaceState(null, '', u);
    if (tab === 'meetings' || tab === 'tasks' || tab === 'summary') await loadStore();
    if (tab === 'security') S.audit = await api.list('audit');
    render();
  }

  let recog = null;
  function toggleMic() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return;
    if (S.recOn && recog) { recog.stop(); S.recOn = false; render(); return; }
    recog = new R(); recog.lang = 'ru-RU'; recog.continuous = true; recog.interimResults = false;
    const mid = S.meetingId;
    recog.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
        S.notes[mid] = ((S.notes[mid] || '') + (S.notes[mid] ? '\n' : '') + e.results[i][0].transcript.trim());
        const n = document.getElementById('notes'); if (n) n.value = S.notes[mid];
      }
    };
    recog.onend = () => { if (S.recOn) { S.recOn = false; render(); } };
    recog.onerror = (e) => { toast('Микрофон: ' + (e.error || 'ошибка')); };
    recog.start(); S.recOn = true; render();
  }

  function onUpload(e) {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const txt = String(rd.result).replace(/\r/g, '');
      const parts = txt.split(/\n\s*\n|\n(?=\s*\d+[.)]\s)/).map((s) => s.replace(/^\s*#+\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim()).filter((s) => s.length > 2);
      const id = 'u' + (S.extraDocs.length + 1);
      S.extraDocs.push({ id, short: f.name.replace(/\.(txt|md)$/i, '').slice(0, 30), title: f.name, code: 'загружен', kind: 'Файл', local: true,
        access: ROLE_IDS.slice(), items: parts.slice(0, 200).map((t, i) => ({ n: String(i + 1), text: t.slice(0, 1200) })) });
      S.docId = id; S.hl = null; render();
      toast('Документ добавлен: ' + parts.length + ' ' + plural(parts.length, 'пункт', 'пункта', 'пунктов'));
    };
    rd.readAsText(f);
  }

  document.querySelector('.t3-nav').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) goTab(b.dataset.tab); });
  document.getElementById('role').addEventListener('change', (e) => {
    S.role = e.target.value; S.answer = null; S.dirSummary = null; S.filter = 'all';
    const u = new URL(location); u.searchParams.set('role', S.role); history.replaceState(null, '', u);
    render();
    toast('Вы — ' + role().label + ': видно ' + visibleDocs().length + ' из ' + allDocs().length + ' документов');
  });

  app.addEventListener('submit', (e) => { if (e.target.dataset.act === 'ask') { e.preventDefault(); askDocs(document.getElementById('q').value); } });
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.act === 'check') {
      const run = S.run[S.meetingId] = S.run[S.meetingId] || { start: null, checked: [] };
      const i = +t.dataset.i;
      run.checked = t.checked ? run.checked.concat(i) : run.checked.filter((x) => x !== i);
      t.closest('li').classList.toggle('done', t.checked);
    }
    if (t.dataset.act === 'filter') { S.filter = t.value; render(); }
    if (t.dataset.pi != null) { const d = S.drafts[S.meetingId]; d.items[+t.dataset.pi][t.dataset.f] = t.value || (t.dataset.f === 'owner' ? null : ''); }
  });
  app.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.pi != null && t.tagName === 'INPUT' && t.type !== 'date') S.drafts[S.meetingId].items[+t.dataset.pi][t.dataset.f] = t.value;
    if (t.dataset.act === 'psum') S.drafts[S.meetingId].summary = t.value;
  });
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'FORM' || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA' || (b.tagName === 'INPUT' && b.type === 'checkbox')) return;
    const act = b.dataset.act;
    const m = MEETINGS.find((x) => x.id === S.meetingId);
    if (act === 'meeting') { S.meetingId = b.dataset.id; await loadStore(); render(); }
    if (act === 'view') { S.view[S.meetingId] = b.dataset.v; render(); }
    if (act === 'brief') makeBrief(m);
    if (act === 'timer') { const run = S.run[m.id] = S.run[m.id] || { checked: [] }; run.start = run.start ? null : Date.now(); render(); }
    if (act === 'demo') { S.notes[m.id] = DEMO_TEXT[m.id] || ''; render(); }
    if (act === 'mic') toggleMic();
    if (act === 'protocol') { const n = document.getElementById('notes'); if (n) S.notes[m.id] = n.value; makeProtocol(m); }
    if (act === 'prow-del') { S.drafts[m.id].items.splice(+b.dataset.i, 1); render(); }
    if (act === 'prow-add') { S.drafts[m.id].items.push({ title: '', owner: null, due: '' }); render(); }
    if (act === 'approve') approve(m);
    if (act === 'tg') {
      if (b.dataset.s === 'question') { toast('Исполнитель задал вопрос — он придёт постановщику в Telegram'); return; }
      await api.update('tasks', b.dataset.id, { status: b.dataset.s }); await loadStore(); render(); toast('Исполнитель принял задачу — статус уже на доске');
    }
    if (act === 'tab') goTab(b.dataset.tab);
    if (act === 'cite') { S.tab = 'docs'; S.docId = b.dataset.doc; S.hl = b.dataset.n; render(); }
    if (act === 'doc') { S.docId = b.dataset.id; S.hl = null; render(); }
    if (act === 'sugg') { askDocs(b.textContent); }
    if (act === 'st') {
      await api.update(b.dataset.kind === 'decision' ? 'decisions' : 'tasks', b.dataset.id, { status: b.dataset.s });
      await loadStore(); render();
    }
    if (act === 'dir') directorSummary();
    if (act === 'print') window.print();
    if (act === 'mode') setMode(b.dataset.mode);
    if (act === 'maskcheck') checkMask();
    if (act === 'audit') { S.audit = await api.list('audit'); render(); }
  });
  setInterval(() => { const el = document.getElementById('timer'); const m = MEETINGS.find((x) => x.id === S.meetingId); if (el && m && S.run[m.id] && S.run[m.id].start) el.firstChild.textContent = timerText(m); }, 1000);
  document.addEventListener('visibilitychange', async () => { if (!document.hidden && ['meetings', 'tasks', 'summary'].includes(S.tab)) { await loadStore(); render(); } });

  /* ---------- старт ---------- */
  (async function init() {
    await Promise.all([loadHealth(), loadStore()]);
    if (S.tab === 'security') S.audit = await api.list('audit');
    render();
    // параметры для показа и проверки: ?tab=docs&q=..., ?m=m1&view=brief&auto=1, ?view=run&demo=1, ?view=protocol&demo=1&auto=1
    const m = MEETINGS.find((x) => x.id === S.meetingId);
    if (qs.get('demo') && m) { S.notes[m.id] = DEMO_TEXT[m.id]; render(); }
    if (qs.get('q')) { S.tab = 'docs'; askDocs(qs.get('q')); }
    if (qs.get('auto') && m) {
      if (S.view[m.id] === 'protocol') { await makeProtocol(m); if (qs.get('approve') && S.drafts[m.id]) await approve(m); } else makeBrief(m);
    }
    if (qs.get('dir') && S.tab === 'summary') directorSummary();
    if (qs.get('mask') && S.tab === 'security') checkMask();
  })();
})();
