/* Рабочее место с ИИ (на весь экран), графики по запросу, «Мой дашборд» и конструктор виджетов.
   Данные и права — только с сервера (/api/pult/ai/ask, /api/pult/widgets, /api/pult/docs, /api/pult/search).
   Общие функции пульта берём из window.FP (их выставляет app.js). */
(() => {
  'use strict';
  const F = () => window.FP;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => F().esc(v);
  const fmt = (v) => F().fmt(v);
  /* категориальная палитра проверена на различимость (в т.ч. при нарушениях цветового зрения) — порядок не менять */
  const PAL = ['#B4313B', '#1F7FA8', '#C9931C', '#7466B8', '#3F9361', '#D46A93'];
  const ONE = '#454548';                                     // один ряд — один цвет (тёмно-серый, красный — для бренда и тревоги)
  const svg = (d, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    bar: '<path d="M4 6h11M4 12h16M4 18h7"/>', column: '<path d="M6 20V11M12 20V5M18 20v-6"/>', line: '<path d="M3 17l5-6 4 3 6-8 3 3"/>',
    donut: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5V12l6 4.5"/>', table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 15h17M10 4.5v15"/>',
    kpi: '<path d="M5 18V6M5 6l3 3M19 18h-9M14 6h5v5"/>', gauge: '<path d="M4 16a8 8 0 0116 0"/><path d="M12 16l4-5"/>', summary: '<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M4 12l16-8-6 16-3-6z"/>', doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>', trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>', size: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', dash: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', route: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const CH = { bar: 'Полосы', column: 'Столбцы', line: 'Линия', donut: 'Круговая', table: 'Таблица', kpi: 'Число', gauge: 'Индикатор', summary: 'Сводка' };
  const CH_NOTE = { bar: 'рейтинг категорий', column: 'сравнение и этапы', line: 'динамика с планом', donut: 'доли целого', table: 'точные цифры, выгрузка', kpi: 'одна цифра и тренд', gauge: 'выполнение плана', summary: 'текст ИИ по данным' };
  const AGENTS = [
    ['genbi', 'Аналитик данных', 'Графики и таблицы по запросу, можно добавить на дашборд', 'Покажи оборот по продуктам круговой диаграммой'],
    ['qa', 'Ответы по данным', 'Короткий вывод по цифрам роли со сравнением с планом', 'Как у нас со средним чеком и повторными покупками?'],
    ['why', 'Отклонения и причины', 'От показателя к причине и ответственному', 'Почему упали заказы в срок?'],
    ['docs', 'Документы', 'Ответы по регламентам и договорам со ссылкой на пункт', 'Сколько часов даётся на модерацию заказа?'],
    ['summary', 'Краткое содержание', 'Главное из документа: пункты, сроки, кто отвечает', 'Кратко: регламент отгрузки и доставки'],
    ['search', 'Поиск', 'По всем показателям, разрезам, виджетам, решениям и документам', 'Найди всё про брак'],
  ];
  const AG = Object.fromEntries(AGENTS.map((a) => [a[0], a[1]]).concat([['supervisor', 'Супервизор']]));

  const St = { msgs: [], docs: null, busy: false, dash: null, side: false };

  /* ---------- подсказка при наведении ---------- */
  let tipEl = null;
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { if (tipEl) tipEl.hidden = true; return; }
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'vtip'; document.body.append(tipEl); }
    tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
    const x = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 8), y = e.clientY - tipEl.offsetHeight - 12;
    tipEl.style.left = x + 'px'; tipEl.style.top = (y < 8 ? e.clientY + 18 : y) + 'px';
  });

  /* ---------- графики ---------- */
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return n + ' ' + (m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c); };
  const short = (s, n = 14) => (s = String(s)).length > n ? s.slice(0, n - 1) + '…' : s;
  const unitS = (u) => u ? ' ' + u : '';
  function vBar(d) {
    const rows = d.rows, max = Math.max(...rows.map((r) => Math.abs(r.value || 0)), 1e-9);
    return `<div class="vbars">${rows.map((r) => {
      const w = Math.max(1.5, Math.abs(r.value || 0) / max * 100), pw = r.prev != null ? Math.min(100, Math.abs(r.prev) / max * 100) : null;
      return `<div class="vb" data-tip="${esc(r.name)}: ${fmt(r.value)}${unitS(d.unit)}${r.prev != null ? ' · было ' + fmt(r.prev) : ''}${r.count != null ? ' · заказов ' + fmt(r.count) : ''}">
        <span class="vb-n">${esc(r.name)}</span><span class="vb-t"><i style="width:${w.toFixed(1)}%"></i>${pw != null ? `<em style="left:${pw.toFixed(1)}%"></em>` : ''}</span><b class="num">${fmt(r.value)}${unitS(d.unit)}</b></div>`;
    }).join('')}</div>${d.rows.some((r) => r.prev != null) ? '<p class="vleg"><span class="sw" style="background:' + ONE + '"></span>сейчас <span class="tick"></span>прошлый период</p>' : ''}`;
  }
  function vCol(d) {
    const rows = d.rows, n = rows.length, W = 600, H = 230, L = 46, R = 8, T = 20, B = 40;
    const vals = rows.map((r) => r.value || 0).concat(rows.map((r) => r.norm || 0)), max = Math.max(...vals, 1e-9) * 1.12;
    const bw = (W - L - R) / n, Y = (v) => T + (1 - v / max) * (H - T - B), gap = Math.min(18, bw * 0.28);
    const ticks = [0, 0.5, 1].map((k) => max / 1.12 * k);
    return `<svg class="vchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(d.kpi_name || '')}">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="grid"/><text x="${L - 7}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" class="ax">${fmt(t)}</text>`).join('')}
      ${rows.map((r, i) => { const x = L + i * bw + gap / 2, w = bw - gap, y = Y(r.value || 0), h = H - B - y;
        return `<g data-tip="${esc(r.name)}: ${fmt(r.value)}${unitS(d.unit)}${r.norm != null ? ' · норма ' + fmt(r.norm) : ''}${r.prev != null ? ' · было ' + fmt(r.prev) : ''}"><rect x="${(L + i * bw).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" fill="transparent"/>
          <path d="M${x.toFixed(1)} ${(H - B).toFixed(1)}V${(y + Math.min(4, h)).toFixed(1)}q0 -4 4 -4h${Math.max(0, w - 8).toFixed(1)}q4 0 4 4V${(H - B).toFixed(1)}z" fill="${ONE}"/>
          ${r.norm != null ? `<line x1="${(x - 3).toFixed(1)}" x2="${(x + w + 3).toFixed(1)}" y1="${Y(r.norm).toFixed(1)}" y2="${Y(r.norm).toFixed(1)}" class="norm"/>` : ''}
          ${n <= 12 ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" class="val">${fmt(r.value)}</text>` : ''}
          <text x="${(x + w / 2).toFixed(1)}" y="${H - B + 16}" text-anchor="middle" class="ax">${esc(short(r.name, n > 8 ? 7 : 14))}</text></g>`; }).join('')}
    </svg>${rows.some((r) => r.norm != null) ? '<p class="vleg"><span class="sw" style="background:' + ONE + '"></span>' + esc(d.unit === 'ч' ? 'время на этапе, ч' : 'значение') + ' <span class="dash"></span>норма</p>' : ''}`;
  }
  function vLine(d) {
    let vals, labels;
    if (d.series) { vals = d.series; labels = d.labels; } else { vals = d.rows.map((r) => r.value); labels = d.rows.map((r) => r.name); }
    const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length < 2) return '<p class="empty">Мало точек для линии.</p>';
    const showPlan = d.plan != null && d.unit !== 'BYN' && d.unit !== 'чел.';
    const all = pts.map((p) => p[1]).concat(showPlan ? [d.plan] : []);
    let min = Math.min(...all), max = Math.max(...all); const pad = (max - min || 1) * 0.15; min -= pad; max += pad;
    const W = 600, H = 220, L = 46, R = 14, T = 16, B = 28, n = vals.length;
    const X = (i) => L + (i / Math.max(1, n - 1)) * (W - L - R), Y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const step = Math.max(1, Math.ceil(n / 7)), last = pts[pts.length - 1];
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    return `<svg class="vchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Динамика ${esc(d.name || d.kpi_name || '')}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ONE}" stop-opacity=".18"/><stop offset="1" stop-color="${ONE}" stop-opacity="0"/></linearGradient></defs>
      ${[0, 1, 2, 3].map((k) => { const t = min + (max - min) * k / 3; return `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="grid"/><text x="${L - 7}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" class="ax">${fmt(t)}</text>`; }).join('')}
      ${showPlan ? `<line x1="${L}" x2="${W - R}" y1="${Y(d.plan).toFixed(1)}" y2="${Y(d.plan).toFixed(1)}" class="norm"/><text x="${W - R}" y="${(Y(d.plan) - 6).toFixed(1)}" text-anchor="end" class="ax">план ${fmt(d.plan)}</text>` : ''}
      <path d="${path} L${X(last[0]).toFixed(1)} ${H - B} L${X(pts[0][0]).toFixed(1)} ${H - B}Z" fill="url(#${id})"/>
      <path d="${path}" fill="none" stroke="${ONE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="4" fill="${ONE}" stroke="#fff" stroke-width="2"/>
      <text x="${(X(last[0]) - 8).toFixed(1)}" y="${(Y(last[1]) - 10).toFixed(1)}" text-anchor="end" class="val">${fmt(last[1])}</text>
      ${labels.map((l, i) => i % step === 0 ? `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="ax">${esc(l)}</text>` : '').join('')}
      ${pts.map((p) => `<rect class="hit" x="${(X(p[0]) - (W - L - R) / n / 2).toFixed(1)}" y="${T}" width="${((W - L - R) / Math.max(1, n - 1)).toFixed(1)}" height="${H - T - B}" fill="transparent" data-tip="${esc(labels[p[0]])}: ${fmt(p[1])}${unitS(d.unit)}"/>`).join('')}
    </svg>`;
  }
  function vDonut(d) {
    const by = d.additive ? 'value' : 'count';
    let rows = d.rows.filter((r) => (r[by] || 0) > 0).slice().sort((a, b) => b[by] - a[by]);
    if (!rows.length) return '<p class="empty">Нет данных для долей.</p>';
    if (rows.length > PAL.length) { const rest = rows.slice(PAL.length - 1); rows = rows.slice(0, PAL.length - 1).concat([{ name: 'Другое', [by]: rest.reduce((s, r) => s + r[by], 0) }]); }
    const tot = rows.reduce((s, r) => s + r[by], 0), C = 2 * Math.PI * 70;
    let off = 0;
    const arcs = rows.map((r, i) => { const len = r[by] / tot * C; const a = `<circle r="70" cx="100" cy="100" fill="none" stroke="${PAL[i]}" stroke-width="26" stroke-dasharray="${Math.max(0, len - 2).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 100 100)" data-tip="${esc(r.name)}: ${fmt(r[by])}${d.additive ? unitS(d.unit) : ' заказов'} · ${fmt(r[by] / tot * 100)} %"/>`; off += len; return a; }).join('');
    return `<div class="vdonut"><svg viewBox="0 0 200 200" role="img" aria-label="Доли">${arcs}<text x="100" y="96" text-anchor="middle" class="dn-v">${fmt(tot)}</text><text x="100" y="118" text-anchor="middle" class="dn-s">${d.additive ? esc(d.unit) : 'заказов'}</text></svg>
      <ul class="vlegend">${rows.map((r, i) => `<li><span class="sw" style="background:${PAL[i]}"></span><span>${esc(r.name)}</span><b class="num">${fmt(r[by] / tot * 100)} %</b><small class="num">${fmt(r[by])}</small></li>`).join('')}</ul></div>
      ${d.additive ? '' : `<p class="vnote">Показатель в процентах не складывается, поэтому круг показывает доли заказов; сам показатель — в таблице.</p>`}`;
  }
  function vTable(d) {
    if (d.kind === 'kpis') return `<div class="scroll-x"><table class="tbl"><thead><tr><th>Показатель</th><th class="n">Факт</th><th class="n">План</th><th class="n">Было</th><th>Статус</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${fmt(r.value)} <span class="faint">${esc(r.unit)}</span></td><td class="n">${fmt(r.plan)}</td><td class="n">${fmt(r.prev)}</td><td>${F().chip(r.status)}</td></tr>`).join('')}</tbody></table></div>`;
    const hasPrev = d.rows.some((r) => r.prev != null), hasCnt = d.rows.some((r) => r.count != null), hasNorm = d.rows.some((r) => r.norm != null);
    return `<div class="scroll-x"><table class="tbl"><thead><tr><th>${esc((d.by_name || '').replace(/^По /, '') || 'Категория')}</th><th class="n">${esc(d.kpi_name || 'Значение')}, ${esc(d.unit || '')}</th>${hasNorm ? '<th class="n">Норма</th>' : ''}${hasPrev ? '<th class="n">Было</th><th class="n">Изм.</th>' : ''}${hasCnt ? '<th class="n">Заказов</th>' : ''}</tr></thead><tbody>
      ${d.rows.map((r) => { const ch = r.prev != null && r.value != null ? r.value - r.prev : null; const good = ch == null ? 'faint' : ch * (d.dir || 1) >= 0 ? 'st-ok' : 'st-bad';
        return `<tr><td>${esc(r.name)}</td><td class="n">${fmt(r.value)}</td>${hasNorm ? `<td class="n">${fmt(r.norm)}</td>` : ''}${hasPrev ? `<td class="n">${fmt(r.prev)}</td><td class="n ${good}">${ch == null ? '—' : (ch > 0 ? '+' : '−') + fmt(Math.abs(ch))}</td>` : ''}${hasCnt ? `<td class="n">${fmt(r.count)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
  }
  function vKpi(d) {
    const ch = d.prev != null && d.value != null ? d.value - d.prev : null;
    return `<div class="vkpi"><div class="vk-top"><b class="num">${fmt(d.value)}</b><span>${esc(d.unit)}</span>${F().chip(d.status)}</div>
      <p class="muted">план ${fmt(d.plan)}${ch != null ? ` · <span class="${ch * d.dir >= 0 ? 'st-ok' : 'st-bad'}">${ch > 0 ? '+' : '−'}${fmt(Math.abs(ch))}</span> к прошлому периоду` : ''} · прогноз ${fmt(d.forecast)}</p>${vLine(Object.assign({}, d, { plan: null }))}</div>`;
  }
  function vGauge(d) {
    const ratio = d.value == null || !d.plan ? 0 : d.dir > 0 ? d.value / d.plan : d.plan / Math.max(d.value, 1e-9);
    const f = Math.max(0, Math.min(1, ratio)), A = Math.PI * 80, col = F().COLOR[d.status] || ONE;
    return `<div class="vgauge"><svg viewBox="0 0 200 118" role="img" aria-label="${esc(d.name)}: ${fmt(d.value)} ${esc(d.unit)} при плане ${fmt(d.plan)}">
      <path d="M20 104a80 80 0 01160 0" fill="none" stroke="var(--track)" stroke-width="16" stroke-linecap="round"/>
      <path d="M20 104a80 80 0 01160 0" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(A * f).toFixed(1)} ${A.toFixed(1)}" data-tip="${fmt(ratio * 100)} % от плана"/>
      <text x="100" y="86" text-anchor="middle" class="g-v">${fmt(d.value)}</text><text x="100" y="106" text-anchor="middle" class="dn-s">${esc(d.unit)} · план ${fmt(d.plan)}</text></svg>
      <div>${F().chip(d.status)} <span class="faint" style="font-size:12.5px">${d.dir > 0 ? 'выполнение плана ' + fmt(ratio * 100) + ' %' : d.value <= d.plan ? 'в пределах плана' : 'выше допустимого на ' + fmt(d.value - d.plan) + ' ' + esc(d.unit)}</span></div></div>`;
  }
  const vSummary = (d) => `<div class="vsum">${esc(d.text)}</div>`;
  function chart(w) {
    const d = w.data || {};
    if (d.locked || d.error) return `<div class="lock-note">${d.locked ? '🔒 ' : ''}${esc(d.error || 'Нет данных')}</div>`;
    const t = w.type;
    if (t === 'summary') return d.text ? vSummary(d) : '<p class="empty">Нет данных.</p>';
    if (d.rows && !d.rows.length) return '<p class="empty">За период нет данных.</p>';
    if (t === 'table' || (d.kind === 'kpis')) return vTable(d);
    if (t === 'kpi' && 'value' in d) return vKpi(d);
    if (t === 'gauge' && 'value' in d) return vGauge(d);
    if (t === 'line') return vLine(d);
    if (t === 'donut' && d.rows) return vDonut(d);
    if (t === 'column' && d.rows) return vCol(d);
    if (d.rows) return vBar(d);
    return vKpi(d);
  }
  function typesFor(w) {
    const d = w.data || {}, s = w.source || {};
    if (w.type === 'summary') return ['summary'];
    if (s.kind === 'kpis') return ['table'];
    if (s.kind === 'kpi') return ['kpi', 'gauge', 'line'];
    return s.by === 'day' ? ['line', 'column', 'table'] : ['bar', 'column', 'donut', 'table'];
  }
  function meta(w) {
    const d = w.data || {};
    const per = d.days ? `${d.days} дн.` : '';
    return [per, d.source].filter(Boolean).join(' · ');
  }
  function csv(w) {
    const d = w.data || {}; let lines;
    if (d.rows) {
      const keys = ['name', 'value', 'plan', 'norm', 'prev', 'count'].filter((k) => d.rows.some((r) => r[k] != null));
      lines = [keys.map((k) => ({ name: 'Категория', value: 'Значение', plan: 'План', norm: 'Норма', prev: 'Было', count: 'Заказов' }[k])).join(';')]
        .concat(d.rows.map((r) => keys.map((k) => r[k] == null ? '' : String(r[k]).replace('.', ',').replace(/;/g, ',')).join(';')));
    } else if (d.series) { lines = ['Дата;Значение'].concat(d.labels.map((l, i) => l + ';' + (d.series[i] == null ? '' : String(d.series[i]).replace('.', ',')))); }
    else return F().toast('В этом виджете нечего выгружать');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = (w.title || 'виджет').replace(/[^\wа-яё .-]/gi, '') + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* карточка виджета: в чате (where='chat') и на дашборде (where='dash') */
  function card(w, where, key, said) {
    const types = typesFor(w), d = w.data || {};
    const sw = types.length > 1 && where !== 'prev' ? `<div class="wsw" role="group" aria-label="Вид">${types.map((t) => `<button data-sa="type" data-k="${key}" data-t="${t}" aria-pressed="${t === w.type}" data-tip="${CH[t]}" aria-label="${CH[t]}">${svg(IC[t], 16)}</button>`).join('')}</div>` : '';
    const tools = where === 'prev' ? '' : where === 'chat'
      ? `<button class="btn btn-sm" data-sa="pin" data-k="${key}">${svg(IC.plus, 15)} На мой дашборд</button>`
      : `<button class="btn btn-icon btn-ghost wt" data-sa="wmove" data-k="${key}" data-m="-1" aria-label="Левее" data-tip="Левее">${svg(IC.left, 16)}</button><button class="btn btn-icon btn-ghost wt" data-sa="wmove" data-k="${key}" data-m="1" aria-label="Правее" data-tip="Правее">${svg(IC.right, 16)}</button>
         <button class="btn btn-icon btn-ghost wt" data-sa="wsize" data-k="${key}" aria-label="Размер" data-tip="Размер: ${{ s: 'узкий', m: 'половина', l: 'на всю ширину' }[w.size || 'm']}">${svg(IC.size, 16)}</button>
         <button class="btn btn-icon btn-ghost wt" data-sa="wdel" data-k="${key}" aria-label="Удалить" data-tip="Удалить">${svg(IC.trash, 16)}</button>`;
    const more = (w.source || {}).kind === 'drill' && !d.locked ? `<button class="btn btn-sm btn-ghost" data-kpi="${esc(w.source.kpi)}" data-by="${esc(w.source.by || '')}">До причины</button>` : (w.source || {}).kind === 'kpi' && !d.locked ? `<button class="btn btn-sm btn-ghost" data-kpi="${esc(w.source.kpi)}">Карточка показателя</button>` : '';
    return `<article class="wcard glass-flat w-${w.size || 'm'}" data-key="${key}"><header><div class="wh"><h3>${esc(w.title)}</h3><small>${esc(meta(w))}</small></div>${sw}</header>
      <div class="wbody">${chart(w)}</div>
      ${d.note && w.type !== 'summary' && !(said && said.includes(d.note)) ? `<p class="wnote">${esc(d.note)}</p>` : ''}
      ${where === 'prev' ? '' : `<footer>${tools}${d.rows || d.series ? `<button class="btn btn-sm btn-ghost" data-sa="csv" data-k="${key}">${svg(IC.dl, 15)} CSV</button>` : ''}${more}</footer>`}</article>`;
  }

  /* ---------- рабочее место ---------- */
  function open(q, opts = {}) {
    let el = $('#studio');
    if (!el) {
      el = document.createElement('section');
      el.id = 'studio'; el.className = 'studio'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Рабочее место с ИИ');
      document.body.append(el);
      document.documentElement.classList.add('studio-on');
      const fab = $('#fab'); if (fab) fab.classList.add('hidden');
      renderShell(el);
      loadDocs();
    }
    if (opts.doc) return askDoc(opts.doc, opts.title);
    if (q) ask(q); else $('#stIn').focus();
  }
  function close() {
    const el = $('#studio'); if (!el) return;
    el.classList.add('closing');
    setTimeout(() => { el.remove(); document.documentElement.classList.remove('studio-on'); const fab = $('#fab'); if (fab) { fab.classList.remove('hidden'); fab.focus(); } }, 180);
  }
  function renderShell(el) {
    const u = F().S.user;
    el.innerHTML = `<aside class="st-side glass" id="stSide">
        <div class="st-brand"><span class="st-orb">${svg(IC.spark, 20)}</span><div><b>Рабочее место с ИИ</b><small>${esc(u.name)} · ${esc(u.title)}</small></div></div>
        <button class="btn btn-accent st-new" data-sa="new">${svg(IC.plus, 16)} Новый разговор</button>
        <section><p class="eyebrow">Агенты · запрос распределяет супервизор</p><ul class="st-agents">${AGENTS.map((a) => `<li><button data-sa="example" data-q="${esc(a[3])}"><b>${esc(a[1])}</b><small>${esc(a[2])}</small></button></li>`).join('')}</ul></section>
        <section class="st-docs"><div class="st-row"><p class="eyebrow">Документы</p><label class="btn btn-sm btn-ghost st-up" data-tip=".docx, .txt, .md, .csv до 3 МБ">${svg(IC.up, 15)} Загрузить<input type="file" id="stFile" accept=".docx,.txt,.md,.csv" hidden></label></div>
          <input class="input st-dfind" id="stDfind" placeholder="Найти документ" autocomplete="off"><ul id="stDocs" class="st-doclist"><li class="faint">Загрузка…</li></ul><p class="faint st-hidden" id="stHidden"></p></section>
      </aside>
      <main class="st-main glass">
        <header class="st-top"><button class="btn btn-icon btn-ghost st-menu" data-sa="side" aria-label="Агенты и документы">${svg(IC.menu)}</button>
          <div class="st-title"><h2>Помощник руководителя</h2><p class="faint">Отвечает только по данным и документам роли «${esc(u.title)}». Цифры считает система, модель их не придумывает.</p></div>
          <button class="btn btn-sm" data-sa="todash">${svg(IC.dash, 16)} Мой дашборд</button><button class="btn btn-icon btn-ghost" data-sa="close" aria-label="Свернуть (Esc)" data-tip="Свернуть · Esc">${svg(IC.close)}</button></header>
        <div class="st-log" id="stLog" aria-live="polite"></div>
        <form class="st-compose" id="stForm"><textarea id="stIn" rows="1" maxlength="600" placeholder="Например: покажи брак по причинам за неделю, сделай круговую, что сказано в договоре доставки…"></textarea>
          <button class="btn btn-primary btn-icon" aria-label="Отправить">${svg(IC.send)}</button></form>
      </main>`;
    const inp = $('#stIn', el);
    if (innerWidth < 760) inp.placeholder = 'Вопрос, график или документ…';
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(160, inp.scrollHeight) + 'px'; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#stForm').requestSubmit(); } });
    $('#stForm', el).onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v || St.busy) return; inp.value = ''; inp.style.height = 'auto'; ask(v); };
    $('#stFile', el).onchange = upload;
    $('#stDfind', el).oninput = drawDocs;
    draw();
  }
  function emptyState() {
    const ex = ['Покажи оборот по продуктам круговой диаграммой', 'Почему упали заказы в срок?', 'Сравни брак и время изготовления за неделю таблицей', 'Как дела в компании — сводка', 'Сколько часов даётся на модерацию заказа?', 'Кратко: договор на курьерскую доставку'];
    return `<div class="st-empty"><span class="st-orb big">${svg(IC.spark, 30)}</span><h1>Что посмотрим сегодня?</h1>
      <p class="muted">Попросите график или таблицу — добавите на свой дашборд одной кнопкой. Спросите о причине отклонения, о пункте регламента или попросите краткое содержание документа.</p>
      <div class="st-ex">${ex.map((x) => `<button class="glass-flat" data-sa="example" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`;
  }
  function md(text, cites) {
    const byKey = Object.fromEntries((cites || []).map((c) => [c.doc + ':' + c.n, c]));
    let h = esc(text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/\[D:(d\d+):(\d+)\]/g, (m, d, n) => { const c = byKey[d + ':' + n]; return `<button class="cite" data-sa="cite" data-doc="${d}" data-n="${n}" data-tip="${esc(c ? c.title + ', п. ' + n + ': ' + c.text.slice(0, 160) : 'пункт ' + n)}">${esc(c ? (c.code || 'док.') + ' п.' + n : 'п.' + n)}</button>`; });
    return h.split(/\n{2,}/).map((p) => /^(- |• |\d+\. )/m.test(p) ? `<ul>${p.split('\n').map((l) => `<li>${l.replace(/^(- |• |\d+\. )/, '')}</li>`).join('')}</ul>` : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }
  function aiMsg(m, i) {
    if (m.wait) return `<div class="smsg ai"><div class="route"><span class="rchip live">${svg(IC.route, 13)} Супервизор выбирает агента</span></div><div class="typing"><i></i><i></i><i></i></div></div>`;
    const r = m.res;
    if (r.error) return `<div class="smsg ai"><p class="st-bad">${esc(r.error)}</p></div>`;
    const route = (r.route || []).map((x) => `<span class="rchip ${x === 'supervisor' ? '' : 'on'}">${esc(AG[x] || x)}</span>`).join(`<span class="rarrow">${svg(IC.route, 12)}</span>`);
    const s = r.summary;
    const sum = s ? `<div class="sumcard glass-flat"><header><span class="dicon">${svg(IC.doc, 18)}</span><div><b>${esc(s.title)}</b><small>${esc([s.code, s.kind, s.date].filter(Boolean).join(' · '))} · ${plural(s.n_items, 'пункт', 'пункта', 'пунктов')}</small></div></header>
        <p class="sum-about">${esc(s.about)}</p><ol class="sum-pts">${(s.points || []).map((p) => `<li>${esc(p.text)}${p.n ? ` <button class="cite" data-sa="cite" data-doc="${esc(s.doc)}" data-n="${esc(p.n)}">п.${esc(p.n)}</button>` : ''}</li>`).join('')}</ol>
        ${s.who ? `<p class="muted"><b>Кого касается:</b> ${esc(s.who)}</p>` : ''}${(s.deadlines || []).length ? `<p class="muted"><b>Сроки:</b> ${s.deadlines.map(esc).join('; ')}</p>` : ''}
        <p class="src">Сжато из ${fmt(s.chars)} знаков · ${esc(s.provider)}${s.masked ? ' · замаскировано значений: ' + s.masked : ''}</p></div>` : '';
    const res = (r.results || []).length ? `<ul class="sres">${r.results.map((x, j) => `<li><button data-sa="result" data-i="${i}" data-j="${j}"><span class="sg">${esc(x.group)}</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></button></li>`).join('')}</ul>` : '';
    const ws = (r.widgets || []).map((w, j) => card(w, 'chat', i + ':' + j, r.text)).join('');
    const cites = (r.cites || []).length ? `<div class="srcs"><p class="eyebrow">Источники</p>${r.cites.map((c) => `<button class="srcdoc" data-sa="cite" data-doc="${esc(c.doc)}" data-n="${esc(c.n)}"><b>${esc(c.code || '')} п.${esc(c.n)}</b> ${esc(c.title)}<small>${esc(c.text.slice(0, 180))}</small></button>`).join('')}</div>` : '';
    return `<div class="smsg ai"><div class="route">${route}</div>${r.text && !s ? `<div class="stext">${md(r.text, r.cites)}</div>` : ''}${sum}${res}${ws ? `<div class="wlist">${ws}</div>` : ''}${cites}
      <p class="smeta">${esc(r.provider || '')}${r.masked ? ` · замаскировано значений: ${r.masked}` : ''}${r.asof ? ' · данные на ' + F().ftime(r.asof) : ''}${r.hidden ? ` · закрытых для роли документов: ${r.hidden}` : ''}</p></div>`;
  }
  function draw() {
    const log = $('#stLog'); if (!log) return;
    log.innerHTML = St.msgs.length ? `<div class="st-thread">${St.msgs.map((m, i) => m.me ? `<div class="smsg me">${esc(m.text)}</div>` : aiMsg(m, i)).join('')}</div>` : emptyState();
    log.scrollTop = log.scrollHeight;
  }
  const lastWidgets = () => { for (let i = St.msgs.length - 1; i >= 0; i--) { const r = St.msgs[i].res; if (r && r.widgets && r.widgets.length) return r.widgets.map((w) => ({ type: w.type, title: w.title, source: w.source })); } return []; };
  async function ask(text, extra = {}) {
    St.busy = true;
    const S = F().S;
    St.msgs.push({ me: true, text }); const m = { wait: true }; St.msgs.push(m); draw();
    try { m.res = await F().api('/api/pult/ai/ask', { body: Object.assign({ question: text, days: S.days, product: S.product, last: lastWidgets() }, extra) }); }
    catch (e) { m.res = { error: e.message }; }
    m.wait = false; St.busy = false; draw();
    const inp = $('#stIn'); if (inp) inp.focus();
  }
  const askDoc = (id, title) => ask('Краткое содержание: ' + (title || 'документ'), { doc: id });

  async function loadDocs() {
    try { St.docs = await F().api('/api/pult/docs'); } catch (e) { St.docs = { docs: [], hidden: 0, error: e.message }; }
    drawDocs();
  }
  function drawDocs() {
    const ul = $('#stDocs'); if (!ul || !St.docs) return;
    const f = ($('#stDfind') || {}).value ? $('#stDfind').value.trim().toLowerCase() : '';
    const list = St.docs.docs.filter((d) => !f || (d.title + ' ' + (d.code || '')).toLowerCase().includes(f));
    ul.innerHTML = list.map((d) => `<li><button data-sa="doc" data-doc="${esc(d.id)}" ${d.sensitive ? 'disabled data-tip="Персональные данные — помощник не пересказывает"' : 'data-tip="Краткое содержание"'}>
      <span class="dicon">${svg(IC.doc, 15)}</span><span><b>${esc(d.title)}</b><small>${esc(d.mine ? 'загружен вами · ' + (d.date || '') : [d.code, d.date].filter(Boolean).join(' · '))}</small></span></button></li>`).join('') || `<li class="faint">${esc(St.docs.error || 'Ничего не нашлось')}</li>`;
    $('#stHidden').textContent = St.docs.hidden ? `Ещё ${St.docs.hidden} документов закрыты для вашей роли.` : '';
  }
  function upload(e) {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return F().toast('Файл больше 3 МБ');
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const r = await F().api('/api/pult/docs/upload', { body: { name: file.name, b64: String(rd.result).split(',')[1] || '' } });
        F().toast(`Документ «${r.title}» загружен: ${r.items} фрагментов`);
        await loadDocs(); askDoc(r.id, r.title);
      } catch (err) { F().toast(err.message); }
    };
    rd.readAsDataURL(file);
  }

  /* ---------- мой дашборд ---------- */
  async function dashboard() {
    const S = F().S;
    St.dash = await F().api('/api/pult/widgets?product=' + (S.product || ''));
    return dashHtml();
  }
  function dashHtml() {
    const ws = St.dash.widgets;
    return `<header class="page-head"><div><h1>Мой дашборд</h1><p class="lead">Свои графики и таблицы. Соберите виджет в конструкторе или попросите помощника — и добавьте ответ одной кнопкой. Права те же, что на пульте: чужой отдел сюда не попадёт.</p></div>
        <span class="spacer"></span><button class="btn" data-sa="ask">${svg(IC.spark, 17)} Спросить ИИ</button><button class="btn btn-primary" data-sa="builder">${svg(IC.plus, 16)} Виджет</button></header>
      <div class="dgrid" id="dgrid">${ws.map((w) => card(w, 'dash', w.id)).join('')}
        <button class="glass-flat dadd w-s" data-sa="builder">${svg(IC.plus, 26)}<b>Новый виджет</b><small>${Object.values(CH).join(' · ')}</small></button></div>
      ${ws.length ? '' : '<p class="faint">Виджетов пока нет.</p>'}<p class="src">Цифры пересчитываются при каждом открытии из тех же источников, что и пульт. <button class="linkbtn" data-sa="dreset">Вернуть набор по умолчанию</button></p>`;
  }
  function redrawDash() { const v = $('#view'); if (v && F().S.view === 'mydash' && St.dash) v.innerHTML = dashHtml(); }
  async function wcall(path, body) {
    try { St.dash = await F().api('/api/pult/widgets' + path, { body: body || {} }); redrawDash(); return true; } catch (e) { F().toast(e.message); return false; }
  }

  /* ---------- конструктор виджетов ---------- */
  function builder(pre) {
    const S = F().S;
    const ks = S.pulse.kpis.filter((k) => !k.locked);
    const st = Object.assign({ type: 'bar', kpi: ks.length ? ks[0].id : '', by: '', days: S.days || 14, title: '', size: 'm', titleEdited: false, dept: '' }, pre || {});
    let timer = 0, seq = 0;
    const kdef = () => ks.find((k) => k.id === st.kpi);
    const needDim = () => ['bar', 'column', 'donut', 'table'].includes(st.type) && st.kpi !== '__all';
    const autoTitle = () => {
      if (st.type === 'summary') return 'Сводка ИИ';
      if (st.kpi === '__all') return 'Все показатели';
      const k = kdef(); if (!k) return 'Виджет';
      const dim = k.dims.find((d) => d.id === st.by);
      return st.type === 'line' ? k.name + ' по дням' : needDim() && dim ? k.name + ' — ' + dim.name.toLowerCase() : k.name;
    };
    const source = () => {
      if (st.type === 'summary') return { kind: 'summary', days: st.days, dept: st.dept };
      if (st.kpi === '__all') return { kind: 'kpis', days: st.days };
      if (['kpi', 'gauge', 'line'].includes(st.type)) return { kind: 'kpi', kpi: st.kpi, days: st.days };
      return { kind: 'drill', kpi: st.kpi, by: st.by || (kdef() ? kdef().dims[0].id : ''), days: st.days };
    };
    const form = () => {
      const k = kdef();
      if (st.kpi === '__all' && st.type !== 'table') st.kpi = ks[0].id;
      if (k && needDim() && !k.dims.some((d) => d.id === st.by)) st.by = k.dims[0].id;
      if (!st.titleEdited) st.title = autoTitle();
      return `<div class="builder glass" role="dialog" aria-modal="true" aria-label="Конструктор виджетов">
        <header><div style="flex:1"><p class="eyebrow">No-code · без программиста</p><h2>Конструктор виджетов</h2></div><button class="btn btn-icon btn-ghost" data-act="closeLayer" aria-label="Закрыть">${svg(IC.close)}</button></header>
        <div class="b-body"><div class="b-form">
          <p class="b-step">1. Вид</p><div class="b-types">${Object.keys(CH).map((t) => `<button data-b="type" data-v="${t}" aria-pressed="${t === st.type}"><span class="b-ic">${svg(IC[t], 22)}</span><b>${CH[t]}</b><small>${CH_NOTE[t]}</small></button>`).join('')}</div>
          <p class="b-step">2. Данные</p>
          ${st.type === 'summary' ? `<label class="field">Сводка по<select class="select" data-b="dept"><option value="">всем доступным показателям</option>${S.pulse.depts.map((x) => `<option value="${x.id}" ${st.dept === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`
            : `<div class="frow"><label class="field">Показатель<select class="select" data-b="kpi">${st.type === 'table' ? `<option value="__all" ${st.kpi === '__all' ? 'selected' : ''}>Все показатели</option>` : ''}${ks.map((x) => `<option value="${x.id}" ${x.id === st.kpi ? 'selected' : ''}>${esc(x.name)}, ${esc(x.unit)}</option>`).join('')}</select></label>
              ${needDim() && k ? `<label class="field">Разрез<select class="select" data-b="by">${k.dims.map((d) => `<option value="${d.id}" ${d.id === st.by ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>` : `<label class="field">Разрез<select class="select" disabled><option>${st.type === 'line' ? 'по дням, с планом' : 'итог за период'}</option></select></label>`}</div>`}
          <div class="frow"><label class="field">Период<div class="seg">${[7, 14, 30, 60].map((d) => `<button type="button" data-b="days" data-v="${d}" aria-pressed="${st.days === d}">${d} дн.</button>`).join('')}</div></label>
            <label class="field">Размер<div class="seg">${[['s', 'Узкий'], ['m', 'Половина'], ['l', 'Широкий']].map(([v, n]) => `<button type="button" data-b="size" data-v="${v}" aria-pressed="${st.size === v}">${n}</button>`).join('')}</div></label></div>
          <label class="field">3. Название<input class="input" data-b="title" maxlength="90" value="${esc(st.title)}"></label>
          </div><div class="b-prev"><p class="eyebrow">Предпросмотр · живые данные</p><div id="bPrev"><div class="skel" style="height:260px"></div></div></div></div>
        <footer><button class="btn" data-act="closeLayer">Отмена</button><button class="btn btn-primary" id="bSave">${svg(IC.plus, 16)} Добавить на дашборд</button></footer></div>`;
    };
    const preview = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const my = ++seq, box = $('#bPrev'); if (!box) return;
        try {
          const r = await F().api('/api/pult/widgets/preview', { body: { type: st.type, source: source() } });
          if (my !== seq || !$('#bPrev')) return;
          $('#bPrev').innerHTML = card({ type: st.type, title: st.title, size: 'l', source: source(), data: r.data }, 'prev', 'prev');
        } catch (e) { if ($('#bPrev')) $('#bPrev').innerHTML = `<p class="note">${esc(e.message)}</p>`; }
      }, 140);
    };
    const render = () => {
      F().openLayer(form());
      const L = $('#layer');
      L.onclick = (e) => {
        const b = e.target.closest('[data-b]'); if (!b || b.tagName !== 'BUTTON') return;
        const f = b.dataset.b;
        if (f === 'type') { st.type = b.dataset.v; render(); return; }
        if (f === 'days') st.days = +b.dataset.v;
        if (f === 'size') st.size = b.dataset.v;
        $$(`[data-b="${f}"]`, L).forEach((x) => x.setAttribute('aria-pressed', x === b));
        preview();
      };
      L.onchange = (e) => {
        const f = e.target.dataset.b; if (!f || f === 'title') return;
        st[f] = e.target.value; if (f === 'kpi') st.by = '';
        render();
      };
      L.oninput = (e) => { if (e.target.dataset.b === 'title') { st.title = e.target.value; st.titleEdited = true; } };
      $('#bSave').onclick = async (e) => {
        e.target.disabled = true;
        const ok = await wcall('', { type: st.type, title: st.title || autoTitle(), size: st.size, source: source() });
        if (ok) { L.onclick = L.onchange = L.oninput = null; F().closeLayer(); F().toast('Виджет добавлен на «Мой дашборд»'); if (F().S.view !== 'mydash') F().go('mydash'); }
        else e.target.disabled = false;
      };
      preview();
    };
    render();
  }

  /* ---------- нажатия ---------- */
  function findW(key) {
    if (String(key).includes(':')) { const [i, j] = key.split(':').map(Number); const r = St.msgs[i] && St.msgs[i].res; return r && r.widgets[j]; }
    return St.dash && St.dash.widgets.find((w) => w.id === key);
  }
  function goResult(x) {
    const g = x.go || {};
    if (g.view) { close(); F().go(g.view); }
    else if (g.kpi) F().openKpi(g.kpi, g.by);
    else if (g.decision) F().openDecision(g.decision);
    else if (g.doc) open('', { doc: g.doc, title: x.title });
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sa]'); if (!b) return;
    const a = b.dataset.sa, key = b.dataset.k;
    if (a === 'close') return close();
    if (a === 'side') { $('#stSide').classList.toggle('open'); return; }
    if (a === 'new') { St.msgs = []; draw(); $('#stSide').classList.remove('open'); $('#stIn').focus(); return; }
    if (a === 'example') { $('#stSide') && $('#stSide').classList.remove('open'); if (!St.busy) ask(b.dataset.q); return; }
    if (a === 'todash') { close(); F().go('mydash'); return; }
    if (a === 'ask') return open();
    if (a === 'builder') return builder();
    if (a === 'doc') { $('#stSide').classList.remove('open'); const d = St.docs.docs.find((x) => x.id === b.dataset.doc); return askDoc(b.dataset.doc, d ? d.title : ''); }
    if (a === 'cite') { if (!$('#studio')) return; const d = (St.docs && St.docs.docs.find((x) => x.id === b.dataset.doc)) || {}; return askDoc(b.dataset.doc, d.title || 'документ'); }
    if (a === 'result') { const r = St.msgs[+b.dataset.i].res.results[+b.dataset.j]; return goResult(r); }
    if (a === 'dreset') return wcall('/reset');
    const w = findW(key); if (!w) return;
    if (a === 'csv') return csv(w);
    if (a === 'type') {
      if (String(key).includes(':')) { w.type = b.dataset.t; draw(); }
      else wcall('/' + key, { type: b.dataset.t });
      return;
    }
    if (a === 'pin') {
      b.disabled = true;
      try { await F().api('/api/pult/widgets', { body: { type: w.type, title: w.title, size: w.type === 'table' || w.type === 'summary' ? 'l' : 'm', source: w.source } });
        b.innerHTML = '✓ На дашборде'; F().toast(`«${w.title}» добавлен на «Мой дашборд»`, { label: 'Открыть', run: () => { close(); F().go('mydash'); } });
      } catch (err) { b.disabled = false; F().toast(err.message); }
      return;
    }
    if (a === 'wdel') return wcall('/' + key + '/delete');
    if (a === 'wmove') return wcall('/' + key, { move: +b.dataset.m });
    if (a === 'wsize') return wcall('/' + key, { size: { s: 'm', m: 'l', l: 's' }[w.size || 'm'] });
  });

  window.Studio = { reset: () => { St.msgs = []; St.docs = null; St.dash = null; }, open, close, dashboard, builder, goResult, isOpen: () => !!$('#studio') };
})();
