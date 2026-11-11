/* Демо-компания для всех трёх треков. Цифры выдуманы, но связаны между собой:
   одна история октября проходит через финансы, клиентов, производство и кадры.
   Трек 2 — откуда приходят заказы, трек 1 — где видно отклонение, трек 3 — где его разбирают на встрече. */
window.COMPANY = {
  name: 'Проявка',
  about: 'Сеть фотосалонов и цех печати, Минск',
  demo: true,
  period: { current: '2026-10', prev: '2026-09', label: 'Октябрь 2026', prevLabel: 'Сентябрь 2026' },

  people: [
    { id: 'kovalev',   name: 'Андрей Ковалёв',     role: 'Директор',                       area: 'all' },
    { id: 'lisovskaya',name: 'Ирина Лисовская',    role: 'Финансовый директор',            area: 'finance' },
    { id: 'morozov',   name: 'Сергей Морозов',     role: 'Начальник цеха печати',          area: 'production' },
    { id: 'grinko',    name: 'Наталья Гринько',    role: 'Управляющая салонами',           area: 'clients' },
    { id: 'shubina',   name: 'Елена Шубина',       role: 'Специалист по кадрам',           area: 'hr' },
    { id: 'yatskevich',name: 'Денис Яцкевич',      role: 'Руководитель онлайн-продаж',     area: 'clients' },
    { id: 'petrovich', name: 'Ольга Петрович',     role: 'Старший оператор, минилаб №1 (наставник)', area: 'production' },
    { id: 'zhuk',      name: 'Павел Жук',          role: 'Оператор минилаба №2 (с 06.10)', area: 'production' },
    { id: 'sidorenko', name: 'Виктор Сидоренко',   role: 'Переплётчик (фотокниги)',        area: 'production' },
    { id: 'tkachuk',   name: 'Мария Ткачук',       role: 'Администратор салона «Галерея»', area: 'clients' },
  ],

  /* каналы продаж: заказы и выручка за октябрь, план и факт */
  channels: [
    { id: 'center',  name: 'Салон «Центр»',          type: 'salon',  plan: { orders: 1700, revenue: 37200 }, fact: { orders: 1760, revenue: 38300 }, attendance: 98.6 },
    { id: 'gallery', name: 'Салон «Галерея»',        type: 'salon',  plan: { orders: 1500, revenue: 32800 }, fact: { orders: 980,  revenue: 21300 }, attendance: 61.0, closedDays: 7 },
    { id: 'east',    name: 'Салон «Восток»',         type: 'salon',  plan: { orders: 1300, revenue: 28400 }, fact: { orders: 1290, revenue: 28100 }, attendance: 97.2 },
    { id: 'uruchye', name: 'Салон «Уручье»',         type: 'salon',  plan: { orders: 1100, revenue: 24100 }, fact: { orders: 1120, revenue: 24600 }, attendance: 96.8 },
    { id: 'gorka',   name: 'Салон «Каменная Горка»', type: 'salon',  plan: { orders: 1000, revenue: 21900 }, fact: { orders: 1010, revenue: 22000 }, attendance: 97.5 },
    { id: 'serebr',  name: 'Салон «Серебрянка»',     type: 'salon',  plan: { orders: 900,  revenue: 19600 }, fact: { orders: 880,  revenue: 19100 }, attendance: 96.1 },
    { id: 'online',  name: 'Сайт (онлайн-заказы)',   type: 'online', plan: { orders: 2000, revenue: 64000 }, fact: { orders: 1980, revenue: 61400 } },
    { id: 'mobile',  name: 'Мобильный заказ (новый)', type: 'mobile', plan: { orders: 0, revenue: 0 },        fact: { orders: 0, revenue: 0 }, isNew: true },
  ],

  /* статьи затрат (BYN) — для факторного и векторного анализа */
  costs: {
    items: [
      { id: 'materials', name: 'Материальные затраты (бумага, химия, обложки)' },
      { id: 'payroll',   name: 'Оплата труда' },
      { id: 'social',    name: 'Отчисления на социальные нужды' },
      { id: 'rent',      name: 'Аренда и амортизация' },
      { id: 'other',     name: 'Прочие' },
    ],
    '2026-09':      { materials: 79100, payroll: 50400, social: 17100, rent: 21000, other: 9300 },
    '2026-10-plan': { materials: 82000, payroll: 52000, social: 17700, rent: 21000, other: 9700 },
    '2026-10':      { materials: 80200, payroll: 53100, social: 18050, rent: 21000, other: 9650 },
  },

  /* помесячная история: план и факт */
  months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
  monthLabels: ['июн', 'июл', 'авг', 'сен', 'окт'],
  series: {
    revenue:     { plan: [220000, 230000, 235000, 215000, 228000], fact: [221000, 232500, 238900, 214000, 214800], unit: 'BYN', good: 'up' },
    profit:      { plan: [40000, 43000, 45000, 38000, 45600],      fact: [41200, 44800, 47100, 37100, 32800],      unit: 'BYN', good: 'up' },
    orders:      { plan: [9200, 9600, 9800, 9000, 9500],           fact: [9240, 9710, 9930, 8990, 9020],           unit: 'шт', good: 'up' },
    avgCheck:    { plan: [23.9, 24.0, 24.0, 23.9, 24.0],           fact: [23.92, 23.94, 24.06, 23.80, 23.81],      unit: 'BYN', good: 'up' },
    repeatShare: { plan: [40, 40, 40, 40, 41],                     fact: [41, 42, 40, 40, 38],                     unit: '%', good: 'up' },
    complaints:  { plan: [20, 20, 20, 20, 20],                     fact: [18, 22, 25, 21, 64],                     unit: 'шт', good: 'down' },
    nps:         { plan: [50, 50, 50, 50, 52],                     fact: [54, 53, 51, 52, 41],                     unit: '', good: 'up' },
    output:      { plan: [158000, 165000, 170000, 152000, 162000], fact: [159200, 166800, 172300, 151000, 158400], unit: 'отпечатков', good: 'up' },
    defectRate:  { plan: [2.5, 2.5, 2.5, 2.5, 2.5],                fact: [2.3, 2.1, 2.4, 2.2, 6.1],                unit: '%', good: 'down' },
    overdueRate: { plan: [3, 3, 3, 3, 3],                          fact: [2.6, 2.9, 3.1, 2.8, 8.7],                unit: '%', good: 'down' },
    utilization: { plan: [80, 80, 80, 80, 80],                     fact: [79, 82, 84, 77, 78],                     unit: '%', good: 'up' },
    headcount:   { plan: [46, 46, 46, 46, 46],                     fact: [46, 45, 46, 45, 43],                     unit: 'чел', good: 'up' },
    attendance:  { plan: [96, 96, 96, 96, 96],                     fact: [97.1, 96.4, 95.8, 96.9, 93.8],           unit: '%', good: 'up' },
    overtime:    { plan: [60, 60, 60, 60, 60],                     fact: [58, 64, 71, 66, 212],                    unit: 'ч', good: 'down' },
    turnover:    { plan: [2, 2, 2, 2, 2],                          fact: [0, 2.2, 0, 2.2, 4.3],                    unit: '%', good: 'down' },
    vacancyDays: { plan: [14, 14, 14, 14, 14],                     fact: [0, 9, 0, 12, 23],                        unit: 'дн', good: 'down' },
  },

  /* производство октября по участкам */
  production: [
    { id: 'lab1',  name: 'Минилаб №1',          output: 92100, defectRate: 2.3,  calibratedAt: '2026-10-28', operator: 'petrovich' },
    { id: 'lab2',  name: 'Минилаб №2',          output: 61200, defectRate: 11.4, calibratedAt: '2026-10-07', operator: 'zhuk', reprints: 6980, reprintCost: 2300 },
    { id: 'bind',  name: 'Переплётный участок', output: 1240, unit: 'фотокниг', overdueRate: 14.2, operator: 'sidorenko', note: 'переплётчик в отпуске 15–26.10, замены нет' },
    { id: 'large', name: 'Широкоформат (холсты)', output: 3860, defectRate: 1.9, overdueRate: 2.1 },
  ],

  /* что случилось в октябре — опорные факты для объяснений и для повестки встреч */
  events: [
    { date: '2026-09-30', area: 'hr',         text: 'Уволилась администратор салона «Галерея» Анна Белова; вакансия открыта, кандидатов нет 23 дня' },
    { date: '2026-10-06', area: 'hr',         text: 'На минилаб №2 вышел новый оператор Павел Жук; обучение калибровке по порядку адаптации не пройдено' },
    { date: '2026-10-07', area: 'production', text: 'Последняя калибровка минилаба №2 (по регламенту — раз в неделю: пропущены 14.10, 21.10, 28.10)' },
    { date: '2026-10-13', area: 'clients',    text: 'Салон «Галерея» закрыт 13–19.10: второй администратор Мария Ткачук на больничном, замены нет' },
    { date: '2026-10-15', area: 'production', text: 'Переплётчик Виктор Сидоренко в отпуске до 26.10 — фотокниги уходят в просрочку' },
    { date: '2026-10-20', area: 'clients',    text: 'Рост жалоб: цвет на отпечатках (минилаб №2) и просроченные фотокниги — 64 жалобы за месяц' },
    { date: '2026-10-24', area: 'production', text: 'Цех закрывает просрочку сверхурочными: 212 ч вместо 60 по плану' },
  ],

  /* продукты и цены — для трека 2 (демо-цены) */
  products: [
    { id: 'p10x15',  name: 'Фото 10×15',            price: 0.45, unit: 'шт', minPx: [1200, 1800], ratio: 2 / 3, ready: 'от 1 часа' },
    { id: 'p15x21',  name: 'Фото 15×21',            price: 1.20, unit: 'шт', minPx: [1800, 2500], ratio: 5 / 7, ready: 'от 1 часа' },
    { id: 'p21x30',  name: 'Фото 21×30 (A4)',       price: 3.50, unit: 'шт', minPx: [2480, 3508], ratio: 0.707, ready: 'от 1 часа' },
    { id: 'polar',   name: 'Полароид 8×10',         price: 0.80, unit: 'шт', minPx: [900, 900],   ratio: 1, ready: 'от 1 часа' },
    { id: 'magnet',  name: 'Магнит 10×10',          price: 4.50, unit: 'шт', minPx: [1200, 1200], ratio: 1, ready: '1 день' },
    { id: 'book20',  name: 'Фотокнига 20×20, 20 стр.', price: 59.00, unit: 'шт', minPx: [2400, 2400], ratio: 1, photos: [20, 40], ready: '3 дня' },
    { id: 'canvas',  name: 'Холст 30×40',           price: 45.00, unit: 'шт', minPx: [2400, 3200], ratio: 3 / 4, ready: '2 дня' },
    { id: 'calendar',name: 'Календарь 2027 настенный', price: 29.00, unit: 'шт', minPx: [2480, 3508], ratio: 0.707, photos: [12, 13], ready: '2 дня' },
  ],
  delivery: [
    { id: 'pickup',  name: 'Самовывоз из салона', price: 0 },
    { id: 'courier', name: 'Курьер по Минску',    price: 6.90 },
    { id: 'post',    name: 'Белпочта по Беларуси', price: 4.50 },
  ],
};

/* быстрые помощники над данными */
window.COMPANY.person = (id) => window.COMPANY.people.find((p) => p.id === id);
window.COMPANY.last = (key, kind = 'fact') => { const s = window.COMPANY.series[key][kind]; return s[s.length - 1]; };
window.COMPANY.prev = (key) => { const s = window.COMPANY.series[key].fact; return s[s.length - 2]; };
