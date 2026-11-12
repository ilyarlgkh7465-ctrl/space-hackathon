/* Помощник (на весь экран: чат и голос с шаром), графики по запросу, «Мой дашборд» и конструктор виджетов.
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
  const PAL = ['#141414', '#FFC400', '#8C8C8C', '#E0A800', '#BDBDBD', '#5A5A5A'];
  const ONE = '#141414';                                     // один ряд — один цвет
  const svg = (d, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    bar: '<path d="M4 6h11M4 12h16M4 18h7"/>', column: '<path d="M6 20V11M12 20V5M18 20v-6"/>', line: '<path d="M3 17l5-6 4 3 6-8 3 3"/>',
    donut: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5V12l6 4.5"/>', table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 15h17M10 4.5v15"/>',
    kpi: '<path d="M5 18V6M5 6l3 3M19 18h-9M14 6h5v5"/>', gauge: '<path d="M4 16a8 8 0 0116 0"/><path d="M12 16l4-5"/>', summary: '<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
    send: '<path d="M4 12l16-8-6 16-3-6z"/>', doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>', trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>', size: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
    dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', dash: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    kb: '<path d="M4 6h16v10H9l-5 4z"/><path d="M8 10h8M8 13h5"/>', grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', route: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const CH = { bar: 'Полосы', column: 'Столбцы', line: 'Линия', donut: 'Круговая', table: 'Таблица', kpi: 'Число', gauge: 'Индикатор', summary: 'Сводка' };
  const CH_NOTE = { bar: 'рейтинг категорий', column: 'сравнение и этапы', line: 'динамика с планом', donut: 'доли целого', table: 'точные цифры, выгрузка', kpi: 'одна цифра и тренд', gauge: 'выполнение плана', summary: 'текст ИИ по данным' };
  const AG = { supervisor: 'Супервизор', genbi: 'Аналитик данных', qa: 'Ответы по данным', why: 'Отклонения и причины', docs: 'Документы', summary: 'Краткое содержание', search: 'Поиск' };

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
      : `<button class="btn btn-icon btn-ghost wt" data-sa="wsize" data-k="${key}" aria-label="Размер" data-tip="Размер: ${{ s: 'узкий', m: 'половина', l: 'на всю ширину' }[w.size || 'm']}">${svg(IC.size, 16)}</button>
         <button class="btn btn-icon btn-ghost wt" data-sa="wdel" data-k="${key}" aria-label="Удалить" data-tip="Удалить">${svg(IC.trash, 16)}</button>`;
    const more = (w.source || {}).kind === 'drill' && !d.locked ? `<button class="btn btn-sm btn-ghost" data-kpi="${esc(w.source.kpi)}" data-by="${esc(w.source.by || '')}">До причины</button>` : (w.source || {}).kind === 'kpi' && !d.locked ? `<button class="btn btn-sm btn-ghost" data-kpi="${esc(w.source.kpi)}">Карточка показателя</button>` : '';
    const grip = where === 'dash' ? `<button class="wgrip" data-grip="${key}" aria-label="Переместить виджет «${esc(w.title)}»: перетащите мышью или нажимайте стрелки" data-tip="Перетащите, чтобы переставить">${svg(IC.grip, 16)}</button>` : '';
    return `<article class="wcard glass-flat w-${w.size || 'm'}" data-key="${key}"><header>${grip}<div class="wh"><h3>${esc(w.title)}</h3><small>${esc(meta(w))}</small></div>${sw}</header>
      <div class="wbody">${chart(w)}</div>
      ${d.note && w.type !== 'summary' && !(said && said.includes(d.note)) ? `<p class="wnote">${esc(d.note)}</p>` : ''}
      ${where === 'prev' ? '' : `<footer>${tools}${d.rows || d.series ? `<button class="btn btn-sm btn-ghost" data-sa="csv" data-k="${key}">${svg(IC.dl, 15)} CSV</button>` : ''}${more}</footer>`}</article>`;
  }

  /* ---------- помощник: один спокойный экран, два режима — чат и голос ---------- */
  const orbHtml = (size, id = '') => `<span class="orb orb-${size}"${id ? ` id="${id}"` : ''} data-state="idle" aria-hidden="true"><i class="orb-ring"></i><i class="orb-ring r2"></i><span class="orb-core"><i></i><i></i><i></i></span></span>`;
  const EXAMPLES = ['Что сейчас требует решения?', 'Покажи оборот по продуктам', 'Почему упали заказы в срок?', 'Кратко: регламент отгрузки и доставки'];
  const V_LABEL = { idle: 'Нажмите на шар и говорите', listening: 'Слушаю', hearing: 'Распознаю', thinking: 'Думаю', speaking: 'Отвечаю', muted: 'Микрофон выключен' };
  const Vc = { on: false, kind: 'talk', meet: null, state: 'idle', status: null, engine: '', muted: false, run: 0, t0: 0, timer: 0, raf: 0, lvl: 0, stream: null, ac: null, an: null, rec: null, sr: null, src: null };

  function open(q, opts = {}) {
    let el = $('#studio');
    if (!el) {
      el = document.createElement('section');
      el.id = 'studio'; el.className = 'studio'; el.dataset.mode = 'chat';
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Помощник');
      document.body.append(el);
      document.documentElement.classList.add('studio-on');
      const fab = $('#fab'); if (fab) fab.classList.add('hidden');
      renderShell(el);
      loadDocs();
      fetch('/api/health').then((r) => r.json()).then((h) => { St.aiMode = h.mode; if (!St.msgs.length) draw(); }).catch(() => { });
    }
    if (opts.voice) return voiceStart();
    if (opts.doc) return askDoc(opts.doc, opts.title);
    if (q) ask(q); else $('#stIn').focus();
  }
  function close() {
    const el = $('#studio'); if (!el) return;
    if (meetLive() && Vc.meet.lines.length) return meetFinish();        // идёт встреча — сначала отчёт, окно остаётся
    voiceStop(true);
    el.classList.add('closing');
    setTimeout(() => { el.remove(); document.documentElement.classList.remove('studio-on'); const fab = $('#fab'); if (fab) { fab.classList.remove('hidden'); fab.focus(); } }, 180);
  }
  function setMode(m) {
    const el = $('#studio'); if (!el) return;
    el.dataset.mode = m;
    $$('.st-mode button', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
    if (m === 'chat') { draw(); const i = $('#stIn'); if (i) i.focus(); }
  }
  function renderShell(el) {
    const u = F().S.user;
    el.innerHTML = `<header class="st-bar">
        <div class="st-id">${orbHtml('xs')}<div><b>Помощник</b><small>Видит только то, что доступно роли «${esc(u.title)}»</small></div></div>
        <div class="seg st-mode" role="group" aria-label="Режим"><button data-sa="mode" data-m="chat" aria-pressed="true">${svg(IC.kb, 16)} Чат</button><button data-sa="mode" data-m="voice" aria-pressed="false">${svg(IC.mic, 16)} Голос</button></div>
        <div class="st-acts"><button class="btn btn-sm btn-ghost" data-sa="new">${svg(IC.plus, 15)} Новый разговор</button>
          <button class="btn btn-icon btn-ghost" data-sa="close" aria-label="Закрыть помощника" data-tip="Закрыть · Esc">${svg(IC.close)}</button></div>
      </header>
      <main class="st-chat">
        <div class="st-log" id="stLog" aria-live="polite"></div>
        <div class="st-foot">
          <div class="st-docs glass" id="stDocsPanel" hidden>
            <div class="st-row"><b>Документы</b><label class="btn btn-sm btn-ghost st-up" data-tip=".docx, .txt, .md, .csv до 3 МБ">${svg(IC.up, 15)} Загрузить свой<input type="file" id="stFile" accept=".docx,.txt,.md,.csv" hidden></label></div>
            <input class="input st-dfind" id="stDfind" placeholder="Найти документ" autocomplete="off">
            <ul id="stDocs" class="st-doclist"><li class="faint">Загрузка…</li></ul><p class="faint st-hidden" id="stHidden"></p>
          </div>
          <form class="st-compose glass" id="stForm">
            <button type="button" class="btn btn-icon btn-ghost" data-sa="docs" aria-label="Документы: краткое содержание и вопросы" data-tip="Документы" aria-expanded="false">${svg(IC.doc, 19)}</button>
            <textarea id="stIn" rows="1" maxlength="600" placeholder="Ваш вопрос"></textarea>
            <button type="button" class="btn btn-icon btn-ghost" data-sa="mode" data-m="voice" aria-label="Говорить голосом" data-tip="Говорить голосом">${svg(IC.mic, 19)}</button>
            <button class="btn btn-primary btn-icon" aria-label="Отправить">${svg(IC.send)}</button>
          </form>
        </div>
      </main>
      <main class="st-voice" aria-live="polite" data-vkind="talk">
        <div class="seg v-kind" role="group" aria-label="Что делает помощник"><button data-sa="vkind" data-k="talk" aria-pressed="true">Вопрос — ответ</button><button data-sa="vkind" data-k="meet" aria-pressed="false">Встреча</button></div>
        <p class="call-top"><span id="vTimer" class="num">0:00</span><span id="vEngine"></span></p>
        <button class="orb-btn" data-sa="vorb" aria-label="Говорить или прервать ответ">${orbHtml('xl', 'vOrb')}</button>
        <p class="v-state" id="vState">${V_LABEL.idle}</p>
        <p class="v-you" id="vYou"></p>
        <div class="v-answer" id="vAnswer"></div>
        <div class="v-meet">
          <ol class="v-feed" id="vFeed" aria-label="Расшифровка разговора"></ol>
          <p class="v-count" id="vCount"></p>
          <p class="v-note">По завершении соберу отчёт: решения, поручения, открытые вопросы. Предупредите участников — разговор расшифровывается. Звук не сохраняется.</p>
        </div>
        <div class="call-bar">
          <button class="call-btn" data-sa="mode" data-m="chat" aria-label="Перейти в чат">${svg(IC.kb, 22)}<span>Чат</span></button>
          <button class="call-btn" data-sa="vmute" id="vMute" aria-pressed="false" aria-label="Выключить микрофон">${svg(IC.mic, 22)}<span>Микрофон</span></button>
          <button class="call-btn call-end" data-sa="vend" aria-label="Завершить разговор">${svg(IC.close, 22)}<span id="vEndLbl">Завершить</span></button>
        </div>
      </main>`;
    const inp = $('#stIn', el);
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(160, inp.scrollHeight) + 'px'; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#stForm').requestSubmit(); } });
    $('#stForm', el).onsubmit = (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v || St.busy) return; inp.value = ''; inp.style.height = 'auto'; ask(v); };
    $('#stFile', el).onchange = upload;
    $('#stDfind', el).oninput = drawDocs;
    draw();
  }
  function emptyState() {
    return `<div class="st-empty">${orbHtml('md')}<h1>Чем помочь?</h1>
      <p class="muted">Отвечу по цифрам пульта и документам компании, построю график или таблицу. Можно голосом.</p>
      <div class="st-ex">${EXAMPLES.map((x) => `<button class="btn" data-sa="example" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      ${St.aiMode === 'auto' ? '<p class="st-models">Модель подбирается под задачу: короткий ответ — быстрая, разбор — сильная, финансы — только локальная.</p>' : ''}</div>`;
  }
  function md(text, cites) {
    const byKey = Object.fromEntries((cites || []).map((c) => [c.doc + ':' + c.n, c]));
    let h = esc(text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/\[D:(d\d+):(\d+)\]/g, (m, d, n) => { const c = byKey[d + ':' + n]; return `<button class="cite" data-sa="cite" data-doc="${d}" data-n="${n}" data-tip="${esc(c ? c.title + ', п. ' + n + ': ' + c.text.slice(0, 160) : 'пункт ' + n)}">${esc(c ? (c.code || 'док.') + ' п.' + n : 'п.' + n)}</button>`; });
    return h.split(/\n{2,}/).map((p) => /^(- |• |\d+\. )/m.test(p) ? `<ul>${p.split('\n').map((l) => `<li>${l.replace(/^(- |• |\d+\. )/, '')}</li>`).join('')}</ul>` : `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }
  /* подсказки «что ещё можно» под последним ответом с графиком — вместо списка возможностей на экране */
  function followUps(r) {
    const w = (r.widgets || [])[0]; if (!w || !w.source || !['drill', 'kpi'].includes(w.source.kind)) return [];
    const out = [];
    if (w.source.kind === 'drill' && w.type !== 'donut' && w.data && w.data.additive) out.push('Сделай круговой');
    if (w.type !== 'table' && w.source.kind === 'drill') out.push('Покажи таблицей');
    if ((w.data && w.data.days) !== 30) out.push('За месяц');
    return out;
  }
  function aiMsg(m, i) {
    if (m.wait) return `<div class="smsg ai wait">${orbHtml('xs').replace('data-state="idle"', 'data-state="thinking"')}<span>${esc(m.waitText || 'Смотрю данные…')}</span></div>`;
    const r = m.res;
    if (r.error) return `<div class="smsg ai"><div class="stext st-bad">${esc(r.error)}</div>${r.retry ? `<button class="btn btn-sm" data-sa="mretry" data-i="${i}">Собрать отчёт ещё раз</button>` : ''}</div>`;
    if (r.meeting) return meetCard(r, i);
    const who = (r.route || []).filter((x) => x !== 'supervisor').map((x) => AG[x] || x)[0];
    const s = r.summary;
    const sum = s ? `<div class="sumcard glass-flat"><header><span class="dicon">${svg(IC.doc, 18)}</span><div><b>${esc(s.title)}</b><small>${esc([s.code, s.kind, s.date].filter(Boolean).join(' · '))} · ${plural(s.n_items, 'пункт', 'пункта', 'пунктов')}</small></div></header>
        <p class="sum-about">${esc(s.about)}</p><ol class="sum-pts">${(s.points || []).map((p) => `<li>${esc(p.text)}${p.n ? ` <button class="cite" data-sa="cite" data-doc="${esc(s.doc)}" data-n="${esc(p.n)}">п.${esc(p.n)}</button>` : ''}</li>`).join('')}</ol>
        ${s.who ? `<p class="muted"><b>Кого касается:</b> ${esc(s.who)}</p>` : ''}${(s.deadlines || []).length ? `<p class="muted"><b>Сроки:</b> ${s.deadlines.map(esc).join('; ')}</p>` : ''}</div>` : '';
    const res = (r.results || []).length ? `<ul class="sres">${r.results.map((x, j) => `<li><button data-sa="result" data-i="${i}" data-j="${j}"><span class="sg">${esc(x.group)}</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></button></li>`).join('')}</ul>` : '';
    const ws = (r.widgets || []).map((w, j) => card(w, 'chat', i + ':' + j, r.text)).join('');
    const cites = (r.cites || []).length ? `<div class="srcs">${r.cites.map((c) => `<button class="srcdoc" data-sa="cite" data-doc="${esc(c.doc)}" data-n="${esc(c.n)}"><b>${esc(c.code || '')} п.${esc(c.n)}</b> ${esc(c.title)}<small>${esc(c.text.slice(0, 180))}</small></button>`).join('')}</div>` : '';
    const last = i === St.msgs.length - 1, fu = last ? followUps(r) : [];
    const meta = [who, r.provider, r.masked ? `скрыто личных данных: ${r.masked}` : '', r.asof ? 'данные на ' + F().ftime(r.asof) : '', r.hidden ? `закрытых для роли документов: ${r.hidden}` : ''].filter(Boolean).join(' · ');
    return `<div class="smsg ai">${r.text && !s ? `<div class="stext">${md(r.text, r.cites)}</div>` : ''}${sum}${res}${ws ? `<div class="wlist">${ws}</div>` : ''}${cites}
      ${fu.length ? `<div class="st-fu">${fu.map((x) => `<button class="btn btn-sm" data-sa="example" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
      <p class="smeta">${esc(meta)}</p></div>`;
  }
  function draw() {
    const log = $('#stLog'); if (!log) return;
    log.innerHTML = St.msgs.length ? `<div class="st-thread">${St.msgs.map((m, i) => m.me ? `<div class="smsg me">${esc(m.text)}</div>` : aiMsg(m, i)).join('')}</div>` : emptyState();
    // длинный ответ (отчёт по встрече, большой график) показываем с начала, а не с конца: иначе видны только последние строки
    const last = log.querySelector('.st-thread > :last-child');
    log.scrollTop = last && last.classList.contains('ai') && last.offsetHeight > log.clientHeight - 24 ? last.offsetTop - 14 : log.scrollHeight;
  }
  const lastWidgets = () => { for (let i = St.msgs.length - 1; i >= 0; i--) { const r = St.msgs[i].res; if (r && r.widgets && r.widgets.length) return r.widgets.map((w) => ({ type: w.type, title: w.title, source: w.source })); } return []; };
  async function ask(text, extra = {}) {
    St.busy = true;
    const S = F().S;
    St.msgs.push({ me: true, text }); const m = { wait: true }; St.msgs.push(m); draw();
    try { m.res = await F().api('/api/pult/ai/ask', { body: Object.assign({ question: text, days: S.days, product: S.product, last: lastWidgets() }, extra) }); }
    catch (e) { m.res = { error: e.message }; }
    m.wait = false; St.busy = false; draw();
    const inp = $('#stIn'); if (inp && $('#studio').dataset.mode === 'chat') inp.focus();
    return m.res;
  }
  const askDoc = (id, title) => { toggleDocs(false); if ($('#studio').dataset.mode !== 'chat') setMode('chat'); return ask('Краткое содержание: ' + (title || 'документ'), { doc: id }); };

  function toggleDocs(show) {
    const p = $('#stDocsPanel'); if (!p) return;
    const on = show == null ? p.hidden : show;
    p.hidden = !on;
    const b = $('[data-sa="docs"]'); if (b) b.setAttribute('aria-expanded', String(on));
    if (on) $('#stDfind').focus();
  }
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

  /* ---------- голос: разговор как по телефону — слушаю → думаю → отвечаю → снова слушаю ---------- */
  function vSet(state, text) {
    Vc.state = state;
    const orb = $('#vOrb'); if (orb) orb.dataset.state = state === 'hearing' ? 'thinking' : state === 'muted' ? 'idle' : state;
    const el = $('#vState'); if (el) el.textContent = text || V_LABEL[state];
  }
  function vLevelLoop() {
    cancelAnimationFrame(Vc.raf);
    const buf = Vc.an ? new Uint8Array(Vc.an.fftSize) : null;
    const tick = () => {
      const orb = $('#vOrb'); if (!orb || !Vc.on) return;
      let target = 0;
      if (Vc.state === 'listening' && Vc.an) { Vc.an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; } target = Math.min(1, Math.sqrt(s / buf.length) * 6); Vc.heard = Math.max(Vc.heard || 0, target); }
      else if (Vc.state === 'listening') target = 0.16 + 0.14 * Math.abs(Math.sin(performance.now() / 300));
      else if (Vc.state === 'speaking') target = Vc.outAn ? outLevel() : 0.35 + 0.3 * Math.abs(Math.sin(performance.now() / 130)) * (0.6 + 0.4 * Math.sin(performance.now() / 470));
      Vc.lvl += (target - Vc.lvl) * 0.25;
      orb.style.setProperty('--lvl', Vc.lvl.toFixed(3));
      Vc.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function outLevel() {
    const b = Vc.outBuf || (Vc.outBuf = new Uint8Array(Vc.outAn.fftSize));
    Vc.outAn.getByteTimeDomainData(b); let s = 0; for (let i = 0; i < b.length; i++) { const x = (b[i] - 128) / 128; s += x * x; }
    return Math.min(1, Math.sqrt(s / b.length) * 5);
  }
  const audioCtx = () => { if (!Vc.ac) Vc.ac = new (window.AudioContext || window.webkitAudioContext)(); if (Vc.ac.state === 'suspended') Vc.ac.resume(); return Vc.ac; };
  async function voiceStart() {
    const el = $('#studio'); if (!el) return;
    toggleDocs(false); setMode('voice');
    Vc.on = true; Vc.muted = false; Vc.run++; Vc.t0 = Date.now(); Vc.kind = 'talk'; Vc.meet = null;
    $('.st-voice').dataset.vkind = 'talk'; $$('.v-kind button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === 'talk'))); $('#vEndLbl').textContent = 'Завершить';
    $('#vMute').setAttribute('aria-pressed', 'false');
    $('#vYou').textContent = ''; $('#vAnswer').innerHTML = '';
    clearInterval(Vc.timer);
    Vc.timer = setInterval(() => { const t = $('#vTimer'); if (!t) return clearInterval(Vc.timer); const s = Math.floor((Date.now() - Vc.t0) / 1000); t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
    if (!Vc.status) { try { Vc.status = await F().api('/api/assistant/voice/status'); } catch (e) { Vc.status = { stt: false, tts: false }; } }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const server = Vc.status.stt && mic && window.MediaRecorder;
    // Быстрее всего — распознавание в самом устройстве: текст виден по ходу речи. Сервер — если браузер не умеет или выбран ?stt=server.
    Vc.engine = (server && /[?&]stt=server/.test(location.search)) || (server && !SR) ? 'server' : SR ? 'browser' : '';
    Vc.canServer = !!server;
    vEngine();
    vLevelLoop();
    if (!Vc.engine) { vSet('idle', 'Микрофон в этом браузере недоступен — перейдите в чат и напишите вопрос'); return; }
    listen();
  }

  /* ---------- встреча: помощник слушает весь разговор, а по завершении отдаёт отчёт ----------
     Текст расшифровки копится в браузере и уходит на сервер один раз — когда встречу завершили. Звук не сохраняется. */
  const stamp = () => { const s = Math.max(0, Math.floor((Date.now() - Vc.meet.t0) / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const meetWords = () => (Vc.meet ? Vc.meet.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0) : 0);
  const meetLive = () => !!(Vc.on && Vc.kind === 'meet' && Vc.meet && !Vc.meet.done);
  function meetAdd(text, at) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text || !Vc.meet) return;
    Vc.meet.lines.push({ t: at || stamp(), text: text[0].toUpperCase() + text.slice(1) });
    meetDraw();
  }
  function meetDraw(interim) {
    const ul = $('#vFeed'); if (!ul || !Vc.meet) return;
    if (interim !== undefined) Vc.meet.interim = interim;
    const last = Vc.meet.lines.slice(-4);
    ul.innerHTML = last.map((l) => `<li><time>${esc(l.t)}</time><span>${esc(l.text)}</span></li>`).join('') + (Vc.meet.interim ? `<li class="interim"><time>${stamp()}</time><span>${esc(Vc.meet.interim)}</span></li>` : '');
    const n = Vc.meet.lines.length;
    $('#vCount').textContent = n ? 'Записано: ' + plural(n, 'реплика', 'реплики', 'реплик') : 'Говорите — текст разговора появится здесь';
    const lbl = $('#vEndLbl'); if (lbl) lbl.textContent = n ? 'Отчёт' : 'Завершить';
  }
  function setKind(k) {
    const box = $('.st-voice'); if (!box || !Vc.on) return;
    if (k === Vc.kind) return;
    if (meetLive() && Vc.meet.lines.length && k !== 'meet') return meetFinish();     // из встречи выходим только через отчёт
    Vc.run++; stopSpeaking(); stopListening();
    Vc.kind = k; Vc.muted = false; $('#vMute').setAttribute('aria-pressed', 'false');
    box.dataset.vkind = k;
    $$('.v-kind button', box).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    $('#vYou').textContent = ''; $('#vAnswer').innerHTML = '';
    if (k !== 'meet') { Vc.meet = null; $('#vEndLbl').textContent = 'Завершить'; vEngine(); return listen(); }
    Vc.t0 = Date.now();
    Vc.meet = { lines: [], interim: '', t0: Date.now(), started: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19), queue: Promise.resolve(), done: false, wake: null };
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => { if (Vc.meet) Vc.meet.wake = w; }).catch(() => { });   // экран телефона не гаснет, пока идёт встреча
    vEngine(); meetDraw();
    listen();
  }
  async function meetListen() {
    if (!meetLive() || Vc.muted) return;
    const run = Vc.run, M = Vc.meet;
    try { if (ownMic() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) await micStream(); }
    catch (e) { if (Vc.engine === 'server') { vSet('idle', 'Нет доступа к микрофону. Разрешите его в настройках'); return; } }
    if (run !== Vc.run) return;
    vSet('listening', 'Слушаю встречу');
    if (Vc.engine === 'browser') {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const sr = Vc.sr = new SR(); sr.lang = 'ru-RU'; sr.interimResults = true;
      sr.continuous = !/Android/.test(navigator.userAgent);            // на Android непрерывный режим повторяет фразы — там слушаем фразу за фразой
      sr.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) meetAdd(r[0].transcript); else interim += r[0].transcript; }
        meetDraw(interim);
      };
      sr.onerror = (e) => {
        if (e.error !== 'not-allowed' && e.error !== 'service-not-allowed') return;
        if (e.error === 'service-not-allowed' && Vc.canServer && run === Vc.run) { sr.onend = null; Vc.engine = 'server'; vEngine(); return meetListen(); }
        Vc.muted = true; sr.onend = null; vSet('idle', 'Нет доступа к микрофону. Разрешите его в настройках');
      };
      sr.onend = () => { if (run !== Vc.run || !meetLive() || Vc.muted) return; if (M.interim) { meetAdd(M.interim); meetDraw(''); } setTimeout(() => { if (run === Vc.run) meetListen(); }, 120); };
      try { sr.start(); } catch (e) { vSet('idle', 'Не получилось включить распознавание речи'); }
      return;
    }
    // распознавание на сервере: запись режется на отрезки по 12 секунд, отрезки расшифровываются по очереди, тишина не отправляется
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const seg = () => {
      if (run !== Vc.run || !meetLive() || Vc.muted) return;
      Vc.heard = 0;
      const rec = Vc.rec = new MediaRecorder(Vc.stream, mime ? { mimeType: mime } : undefined), chunks = [], at = stamp();
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const loud = (Vc.heard || 0) >= 0.08;
        seg();
        if (!loud) return;
        const blob = new Blob(chunks, { type: rec.mimeType || mime });
        M.queue = M.queue.then(async () => {
          const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
          const r = await F().api('/api/assistant/voice/stt', { body: { audio: b64, mime: blob.type } });
          if (r.text && Vc.meet === M) meetAdd(r.text, at);
        }).catch(() => { });
      };
      rec.start();
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 12000);
    };
    seg();
  }
  /* остановить запись так, чтобы последняя фраза не пропала */
  async function meetHalt() {
    const M = Vc.meet; if (!M) return;
    Vc.run++;
    if (M.interim) { meetAdd(M.interim); M.interim = ''; }
    if (Vc.rec && Vc.rec.state === 'recording') {
      const rec = Vc.rec;
      await new Promise((res) => { const on = rec.onstop; rec.onstop = () => { if (on) on(); res(); }; rec.stop(); });
    }
    Vc.rec = null;
    stopListening();
    await M.queue;
    meetDraw('');
  }
  async function meetFinish() {
    const M = Vc.meet; if (!M || M.done) return;
    M.done = true;
    vSet('thinking', 'Заканчиваю запись…');
    await meetHalt();
    if (M.wake) { try { M.wake.release(); } catch (e) { /* уже отпущен */ } }
    const lines = M.lines.slice(), minutes = Math.max(1, Math.round((Date.now() - M.t0) / 60000));
    Vc.meet = null; Vc.kind = 'talk';
    voiceStop(true); setMode('chat');
    if (lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0) < 12) { F().toast('Разговор слишком короткий — отчёт не из чего собрать'); return; }
    St.busy = true;
    St.msgs.push({ me: true, text: `Встреча · ${plural(minutes, 'минута', 'минуты', 'минут')} · ${plural(lines.length, 'реплика', 'реплики', 'реплик')}` });
    const m = { wait: true, waitText: 'Готовлю отчёт по встрече…' }; St.msgs.push(m); draw();
    try { m.res = { meeting: await F().api('/api/assistant/live/report', { body: { lines, started: M.started, minutes } }), lines }; }
    catch (e) { m.res = { error: 'Отчёт не собрался: ' + e.message + '. Расшифровка сохранена в этом окне — повторите попытку.', retry: { lines, started: M.started, minutes } }; }
    m.wait = false; St.busy = false; draw();
    return m.res;
  }
  const MEET_ST = { 'решено': 'chip-ok', 'требует уточнения': 'chip-warn' };
  const dmy = (iso) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) : '');
  function meetCard(r, i) {
    const p = r.meeting, canSave = ['director', 'head'].includes(F().S.user.role);
    const sec = (title, items, row) => (items && items.length ? `<section class="meet-sec"><h3>${title}</h3><ul class="meet-list">${items.map(row).join('')}</ul></section>` : '');
    const at = (x) => (x.t ? ` <time>${esc(x.t)}</time>` : '');
    const tasks = sec('Поручения', p.tasks, (t) => `<li class="meet-task"><b>${esc(t.title)}</b>${at(t)}
      <small>${t.owner_name ? esc(t.owner_name) : 'ответственный не назван' + (t.suggested_owner_name ? ' — предлагаю: ' + esc(t.suggested_owner_name) : '')} · ${t.due ? 'срок ' + dmy(t.due) : 'срок не назван' + (t.suggested_due ? ' — предлагаю: ' + dmy(t.suggested_due) : '')}</small></li>`);
    const saved = r.saved ? `<span class="chip chip-ok"><i></i>Сохранено: ${plural(r.saved.tasks, 'задача', 'задачи', 'задач')} в реестре</span>` : '';
    return `<div class="smsg ai"><div class="sumcard meetcard glass-flat">
      <header><span class="dicon">${svg(IC.mic, 18)}</span><div><b>${esc(p.title)}</b><small>${plural(p.minutes, 'минута', 'минуты', 'минут')} · ${plural(p.lines, 'реплика', 'реплики', 'реплик')} · ${esc(p.provider || '')}${p.outside ? ' · имена и суммы скрыты' : ''}</small></div></header>
      <p class="sum-about">${esc(p.summary)}</p>
      ${sec('Решения и темы', p.points, (x) => `<li><span class="chip ${MEET_ST[x.status] || 'chip-none'}"><i></i>${esc(x.status)}</span><span>${esc(x.text)}${at(x)}</span></li>`)}
      ${tasks}
      ${sec('Открытые вопросы', p.questions, (x) => `<li><span>${esc(x.text)}${at(x)}</span></li>`)}
      ${sec('Риски', p.risks, (x) => `<li><span>${esc(x.text)}${at(x)}</span></li>`)}
      ${(p.options || []).filter((o) => o.variants && o.variants.length).length ? `<section class="meet-sec meet-opt"><h3>Варианты решения</h3><p class="smeta">Предложения помощника по открытым вопросам. На встрече их не принимали — решает руководитель.</p>
        ${p.options.filter((o) => o.variants && o.variants.length).map((o) => `<div class="meet-opt-i"><b>${esc(o.about)}</b><ol>${o.variants.map((v) => `<li>${esc(v)}</li>`).join('')}</ol></div>`).join('')}</section>` : ''}
      ${sec('Цифры и сроки', p.numbers, (x) => `<li><span>${esc(x.text)}${at(x)}</span></li>`)}
      <details class="meet-tr"><summary>Расшифровка разговора</summary><ol>${r.lines.map((l) => `<li><time>${esc(l.t)}</time><span>${esc(l.text)}</span></li>`).join('')}</ol></details>
      <footer class="meet-foot">${saved || (canSave ? `<button class="btn btn-primary btn-sm" data-sa="msave" data-i="${i}">Сохранить протокол и задачи</button>` : '')}
        <button class="btn btn-sm" data-sa="mcopy" data-i="${i}">Скопировать отчёт</button></footer>
      <p class="smeta">Отчёт — черновик: задачи попадут в реестр только после сохранения. Звук не сохраняется.</p></div></div>`;
  }
  function meetText(r) {
    const p = r.meeting, out = [p.title, '', p.summary];
    const add = (title, items, f) => { if (items && items.length) { out.push('', title + ':'); items.forEach((x) => out.push('— ' + f(x))); } };
    add('Решения и темы', p.points, (x) => `${x.text} (${x.status})`);
    add('Поручения', p.tasks, (t) => `${t.title} — ${t.owner_name || 'ответственный не назван'}, ${t.due ? 'срок ' + dmy(t.due) : 'срок не назван'}`);
    add('Открытые вопросы', p.questions, (x) => x.text); add('Риски', p.risks, (x) => x.text);
    (p.options || []).filter((o) => o.variants && o.variants.length).forEach((o, k) => { if (!k) out.push('', 'Варианты решения (предложения помощника):'); out.push('— ' + o.about + ': ' + o.variants.join('; ')); });
    add('Цифры и сроки', p.numbers, (x) => x.text);
    return out.join('\n');
  }
  async function meetSave(i, b) {
    const r = St.msgs[i].res, p = r.meeting;
    b.disabled = true;
    try {
      const d = await F().api('/api/assistant/live/save', { body: { key: p.key, title: p.title, started: p.started, minutes: p.minutes, lines: r.lines, summary: p.summary, points: p.points, tasks: p.tasks, risks: p.risks, provider: p.provider } });
      r.saved = { tasks: (d.tasks || []).length }; draw();
      F().toast('Протокол сохранён, задачи — в реестре помощника');
    } catch (e) { b.disabled = false; F().toast(e.message); }
  }
  /* Телефон разрешает синтез речи только по касанию. Ответ приходит позже, поэтому при первом касании внутри помощника
     произносим пустую фразу без звука — после этого голос устройства работает и без касания. Заодно будим звуковой контекст. */
  const MOBILE = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  function unlockVoice() {
    if (Vc.unlocked) return;
    Vc.unlocked = true;
    try { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'ru-RU'; window.speechSynthesis.speak(u); window.speechSynthesis.getVoices(); } } catch (e) { /* нет синтеза */ }
    try { audioCtx(); } catch (e) { /* нет звукового контекста */ }
  }
  /* На телефоне, когда речь распознаёт само устройство, свой микрофон не открываем: открытый микрофон глушит ответ на iPhone
     и мешает распознаванию на Android. Микрофон нужен странице только для записи на сервер. */
  const ownMic = () => Vc.engine === 'server' || !MOBILE;
  function releaseMic() { if (Vc.stream && MOBILE) { Vc.stream.getTracks().forEach((t) => t.stop()); Vc.stream = null; Vc.an = null; } }
  function vEngine(extra) {
    const el = $('#vEngine'); if (!el) return;
    el.textContent = (Vc.engine === 'server' ? 'речь распознаётся на сервере компании' : Vc.engine === 'browser' ? 'речь распознаёт устройство' : 'микрофон недоступен') + (extra ? ' · ' + extra : '');
  }
  function voiceStop(silent) {
    if (meetLive() && Vc.meet.lines.length) return meetFinish();        // встречу с записью нельзя закрыть без отчёта
    Vc.on = false; Vc.run++;
    clearInterval(Vc.timer); cancelAnimationFrame(Vc.raf);
    stopListening(); stopSpeaking();
    if (Vc.stream) { Vc.stream.getTracks().forEach((t) => t.stop()); Vc.stream = null; Vc.an = null; }
    if (!silent) setMode('chat');
  }
  function stopListening() {
    if (Vc.rec && Vc.rec.state !== 'inactive') { Vc.rec.onstop = null; try { Vc.rec.stop(); } catch (e) { /* уже остановлен */ } }
    Vc.rec = null;
    if (Vc.sr) { Vc.sr.onend = Vc.sr.onresult = Vc.sr.onerror = null; try { Vc.sr.abort(); } catch (e) { /* не запущен */ } Vc.sr = null; }
  }
  function stopSpeaking() {
    if (Vc.src) { try { Vc.src.onended = null; Vc.src.stop(); } catch (e) { /* уже закончился */ } Vc.src = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  async function micStream() {
    if (Vc.stream) return Vc.stream;
    Vc.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ac = audioCtx(); Vc.an = ac.createAnalyser(); Vc.an.fftSize = 1024;
    ac.createMediaStreamSource(Vc.stream).connect(Vc.an);
    return Vc.stream;
  }
  async function listen() {
    if (Vc.kind === 'meet') return meetListen();
    if (!Vc.on || Vc.muted) return;
    const run = Vc.run;
    stopSpeaking(); stopListening();
    Vc.heard = 0;
    try { if (ownMic() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) await micStream(); }
    catch (e) { if (Vc.engine === 'server') { vSet('idle', 'Нет доступа к микрофону. Разрешите его в браузере или перейдите в чат'); return; } }
    if (run !== Vc.run) return;
    vSet('listening');
    if (Vc.engine === 'browser') {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const sr = Vc.sr = new SR(); sr.lang = 'ru-RU'; sr.interimResults = true; sr.continuous = false;
      let final = '';
      sr.onresult = (e) => { let t = ''; for (const r of e.results) { t += r[0].transcript; if (r.isFinal) final = t; } const y = $('#vYou'); if (y) y.textContent = t; };
      sr.onerror = (e) => {
        if (e.error !== 'not-allowed' && e.error !== 'service-not-allowed') return;
        // приложение с экрана «Домой» на iPhone может не дать распознавание устройству — тогда запись уходит на сервер
        if (e.error === 'service-not-allowed' && Vc.canServer && run === Vc.run) { sr.onend = null; Vc.engine = 'server'; vEngine(); return listen(); }
        Vc.muted = true; vSet('idle', 'Нет доступа к микрофону. Разрешите его в настройках или перейдите в чат');
      };
      sr.onend = () => { if (run !== Vc.run || !Vc.on) return; const t = (final || ($('#vYou') || {}).textContent || '').trim(); if (t) heard(t); else if (!Vc.muted) setTimeout(() => { if (run === Vc.run) listen(); }, 250); };
      try { sr.start(); } catch (e) { vSet('idle', 'Не получилось включить распознавание речи'); }
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = Vc.rec = new MediaRecorder(Vc.stream, mime ? { mimeType: mime } : undefined), chunks = [];
    const t0 = performance.now(); let quiet = 0;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      if (run !== Vc.run || !Vc.on) return;
      if ((Vc.heard || 0) < 0.08) return listen();                       // тишина — слушаем дальше
      vSet('hearing');
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || mime });
        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
        const r = await F().api('/api/assistant/voice/stt', { body: { audio: b64, mime: blob.type } });
        if (run !== Vc.run) return;
        const t = (r.text || '').trim();
        if (t) { $('#vYou').textContent = t; heard(t); } else listen();
      } catch (e) { if (run === Vc.run) { vSet('idle', e.message); } }
    };
    rec.start(250);
    const watch = setInterval(() => {                                    // сам останавливается, когда человек замолчал
      if (rec.state === 'inactive' || run !== Vc.run) return clearInterval(watch);
      const spoke = (Vc.heard || 0) > 0.12;
      quiet = Vc.lvl < 0.06 ? quiet + 1 : 0;
      if ((spoke && quiet > 9) || performance.now() - t0 > 25000) { clearInterval(watch); rec.stop(); }
    }, 120);
  }
  async function heard(text) {
    const run = Vc.run;
    stopListening();
    vSet('thinking');
    $('#vAnswer').innerHTML = '';
    const t0 = performance.now();
    const r = await ask(text, { voice: true });
    if (run !== Vc.run || !Vc.on) return;
    vEngine('ответ за ' + ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',') + ' с');
    const full = speakable(r.error || (r.summary ? r.summary.about : r.text) || 'Готово.');
    let say = '';                                                          // голосом — коротко, как в разговоре: первые одно-два предложения
    for (const part of full.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [full]) { if (say && (say + part).length > 260) break; say += part; }
    say = say.trim() || full;
    const extra = (r.widgets || []).length ? `<button class="btn btn-sm" data-sa="mode" data-m="chat">${svg(IC.column, 15)} Показать ${r.widgets.length > 1 ? 'графики' : (r.widgets[0].type === 'table' ? 'таблицу' : 'график')}</button>`
      : r.summary || (r.cites || []).length || (r.results || []).length ? `<button class="btn btn-sm" data-sa="mode" data-m="chat">${svg(IC.doc, 15)} Открыть в чате</button>` : '';
    const more = say.length < full.length && !extra ? `<button class="btn btn-sm" data-sa="mode" data-m="chat">${svg(IC.kb, 15)} Полный ответ в чате</button>` : '';
    $('#vAnswer').innerHTML = `<p>${esc(say)}</p>${extra || more}`;
    vSet('speaking');
    await speak(say, run);
    if (run !== Vc.run || !Vc.on) return;
    if (Vc.muted) vSet('muted'); else listen();
  }
  const speakable = (t) => String(t || '').replace(/\[D:[^\]]+\]/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 700);
  /* фразы для озвучки: по концу предложения, но инициалы («Гринь Д. А.») и короткие обрывки не отделяются */
  const phrases = (t) => (t.match(/[^.!?…]+[.!?…]+(?=\s|$)|[^.!?…]+$/g) || [t]).map((x) => x.trim()).filter(Boolean)
    .reduce((out, x) => { const last = out[out.length - 1]; if (last && (/(^|\s)[А-ЯЁA-Z]\.$/.test(last) || x.length < 14)) out[out.length - 1] = last + ' ' + x; else out.push(x); return out; }, []);
  const ttsFetch = async (text) => {
    const r = await fetch('/api/assistant/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + F().S.token }, body: JSON.stringify({ text, voice: 'robot' }) });
    if (!r.ok) throw new Error('tts');
    return audioCtx().decodeAudioData(await r.arrayBuffer());
  };
  const ruVoice = () => {
    const vs = window.speechSynthesis.getVoices().filter((x) => /^ru/i.test(x.lang));
    return vs.find((x) => /google|milena|enhanced|premium|natural/i.test(x.name)) || vs[0];
  };
  async function speak(text, run) {
    if (!text) return;
    releaseMic();
    const parts = phrases(text);
    if (Vc.status && Vc.status.tts) {
      try {
        const ac = audioCtx();
        if (!Vc.outAn) { Vc.outAn = ac.createAnalyser(); Vc.outAn.fftSize = 1024; Vc.outAn.connect(ac.destination); }
        let next = ttsFetch(parts[0]);
        for (let i = 0; i < parts.length; i++) {
          const buf = await next;
          if (run !== Vc.run) return;
          next = i + 1 < parts.length ? ttsFetch(parts[i + 1]) : null;      // следующая фраза готовится, пока звучит эта
          if (next) next.catch(() => { });
          await new Promise((res) => { const src = Vc.src = ac.createBufferSource(); src.buffer = buf; src.connect(Vc.outAn); src.onended = res; src.start(); });
          if (run !== Vc.run) return;
        }
        return;
      } catch (e) { Vc.status.tts = false; /* синтез на сервере не ответил — дальше голос устройства */ }
    }
    if (!window.speechSynthesis) return new Promise((res) => setTimeout(res, Math.min(9000, 900 + text.length * 45)));
    await new Promise((res) => {
      const v = ruVoice();
      let started = false;
      try { window.speechSynthesis.cancel(); window.speechSynthesis.resume(); } catch (e) { /* не страшно */ }
      setTimeout(() => {                                                     // после cancel() Safari пропускает фразу, сказанную в тот же миг
        parts.forEach((p, i) => {                                           // по фразам: голос начинает без паузы и не обрывается на длинном тексте
          const u = new SpeechSynthesisUtterance(p); u.lang = 'ru-RU'; u.rate = 1.05; if (v) u.voice = v;
          u.onstart = () => { started = true; };
          if (i === parts.length - 1) u.onend = u.onerror = res;
          window.speechSynthesis.speak(u);
        });
      }, 60);
      setTimeout(() => { if (!started && run === Vc.run) vEngine('голос устройства не включился — проверьте звук и беззвучный режим'); }, 2600);
      setTimeout(res, Math.min(60000, 4000 + text.length * 110));          // на случай, если браузер не сообщит об окончании
    });
  }
  function vOrbTap() {
    if (!Vc.on) return voiceStart();
    if (Vc.kind === 'meet') return vMute();                              // во встрече касание шара — пауза
    if (Vc.state === 'speaking' || Vc.state === 'thinking') { Vc.run++; stopSpeaking(); Vc.muted = false; $('#vMute').setAttribute('aria-pressed', 'false'); return listen(); }
    if (Vc.state === 'listening' && Vc.rec && Vc.rec.state === 'recording') { Vc.heard = Math.max(Vc.heard || 0, 0.2); return Vc.rec.stop(); }
    if (Vc.state === 'idle' || Vc.state === 'muted') { Vc.muted = false; $('#vMute').setAttribute('aria-pressed', 'false'); Vc.run++; return listen(); }
  }
  async function vMute() {
    Vc.muted = !Vc.muted;
    $('#vMute').setAttribute('aria-pressed', String(Vc.muted));
    if (Vc.kind === 'meet') { if (Vc.muted) { await meetHalt(); vSet('muted', 'Пауза — помощник не слушает'); } else { Vc.run++; meetListen(); } return; }
    if (Vc.muted) { if (Vc.state === 'listening') { Vc.run++; stopListening(); vSet('muted'); } }
    else if (Vc.state === 'muted' || Vc.state === 'idle') { Vc.run++; listen(); }
  }

  /* ---------- мой дашборд ---------- */
  async function dashboard() {
    const S = F().S;
    St.dash = await F().api('/api/pult/widgets?product=' + (S.product || ''));
    return dashHtml();
  }
  function dashHtml() {
    const ws = St.dash.widgets;
    return `<header class="page-head"><div><h1>Мой дашборд</h1><p class="lead">Свои графики и таблицы. Соберите виджет в конструкторе или попросите помощника. Чтобы переставить — зажмите заголовок виджета и перетащите.</p></div>
        <span class="spacer"></span><button class="btn" data-sa="ask">${orbHtml('xs')} Спросить помощника</button><button class="btn btn-primary" data-sa="builder">${svg(IC.plus, 16)} Виджет</button></header>
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
    if (e.target.closest && e.target.closest('#studio')) unlockVoice();
    const b = e.target.closest('[data-sa]');
    if (!b) { const p = $('#stDocsPanel'); if (p && !p.hidden && !e.target.closest('#stDocsPanel')) toggleDocs(false); return; }
    const a = b.dataset.sa, key = b.dataset.k;
    if (a === 'close') { if (meetLive() && Vc.meet.lines.length) return meetFinish(); return close(); }
    if (a === 'vkind') return setKind(b.dataset.k);
    if (a === 'msave') return meetSave(+b.dataset.i, b);
    if (a === 'mcopy') { try { await navigator.clipboard.writeText(meetText(St.msgs[+b.dataset.i].res)); F().toast('Отчёт скопирован'); } catch (err) { F().toast('Не получилось скопировать'); } return; }
    if (a === 'mretry') { const m = St.msgs[+b.dataset.i], q = m.res.retry; m.wait = true; m.waitText = 'Готовлю отчёт по встрече…'; draw();
      try { m.res = { meeting: await F().api('/api/assistant/live/report', { body: q }), lines: q.lines }; } catch (err) { m.res = { error: 'Отчёт не собрался: ' + err.message, retry: q }; }
      m.wait = false; draw(); return; }
    if (a === 'mode') { if (b.dataset.m === 'voice') return voiceStart(); voiceStop(true); return setMode('chat'); }
    if (a === 'docs') return toggleDocs();
    if (a === 'vorb') return vOrbTap();
    if (a === 'vmute') return vMute();
    if (a === 'vend') return voiceStop();
    if (a === 'new') { if (meetLive() && Vc.meet.lines.length) return meetFinish(); St.msgs = []; if (Vc.on) voiceStop(true); setMode('chat'); return; }
    if (a === 'example') { toggleDocs(false); if (!St.busy) ask(b.dataset.q); return; }
    if (a === 'ask') return open();
    if (a === 'builder') return builder();
    if (a === 'doc') { const d = St.docs.docs.find((x) => x.id === b.dataset.doc); return askDoc(b.dataset.doc, d ? d.title : ''); }
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
    if (a === 'wsize') return wcall('/' + key, { size: { s: 'm', m: 'l', l: 's' }[w.size || 'm'] });
  });

  /* ---------- перетаскивание виджетов: зажать мышью заголовок карточки и перенести ---------- */
  let drag = null;
  const dragCards = () => $$('#dgrid .wcard[data-key]');
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const head = e.target.closest('#dgrid .wcard > header'); if (!head) return;
    const grip = e.target.closest('.wgrip');
    if (!grip && (e.target.closest('button, a, input, select') || e.pointerType !== 'mouse')) return;   // пальцем — только за ручку, чтобы не мешать прокрутке
    const cardEl = head.parentElement;
    drag = { card: cardEl, x0: e.clientX, y0: e.clientY, on: false, before: dragCards().map((c) => c.dataset.key).join(), last: 0 };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 6) return;
      const r = drag.card.getBoundingClientRect();
      const g = drag.ghost = drag.card.cloneNode(true);
      g.classList.add('wfloat'); g.removeAttribute('data-key');
      Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.append(g);
      drag.card.classList.add('wslot'); document.documentElement.classList.add('wdragging');
      drag.on = true;
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(.6deg) scale(1.02)`;
    if (e.clientY < 90) scrollBy(0, -14); else if (e.clientY > innerHeight - 70) scrollBy(0, 14);
    const now = performance.now(); if (now - drag.last < 110) return;
    const over = (document.elementFromPoint(e.clientX, e.clientY) || document.body).closest('#dgrid .wcard[data-key]');
    if (!over || over === drag.card) return;
    const r = over.getBoundingClientRect(), list = dragCards();
    const after = list.indexOf(drag.card) < list.indexOf(over);          // тянем вперёд — встаём после, назад — перед
    over.parentNode.insertBefore(drag.card, after ? over.nextSibling : over);
    drag.last = now;
    void r;
  });
  const dragEnd = async () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.on) return;
    d.ghost.remove(); d.card.classList.remove('wslot'); document.documentElement.classList.remove('wdragging');
    const ids = dragCards().map((c) => c.dataset.key);
    if (ids.join() === d.before) return;
    St.dash.widgets.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    try { await F().api('/api/pult/widgets/order', { body: { ids } }); }
    catch (e) { F().toast(e.message); redrawDash(); }
  };
  document.addEventListener('pointerup', dragEnd);
  document.addEventListener('pointercancel', dragEnd);
  document.addEventListener('keydown', (e) => {                            // с клавиатуры: ручка в фокусе, стрелки меняют порядок
    const g = e.target.closest && e.target.closest('.wgrip'); if (!g) return;
    const move = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]; if (!move) return;
    e.preventDefault();
    const key = g.dataset.grip;
    wcall('/' + key, { move }).then(() => { const n = $(`.wgrip[data-grip="${key}"]`); if (n) n.focus(); });
  });

  window.Studio = { reset: () => { St.msgs = []; St.docs = null; St.dash = null; Vc.status = null; }, open, close, dashboard, builder, goResult, orbHtml, voiceAsk: (t) => heard(t), meetTest: async (texts) => { if (!Vc.on) await voiceStart(); setKind('meet'); await meetHalt(); Vc.muted = true; texts.forEach((t) => meetAdd(t)); return meetFinish(); }, meetFeed: (texts) => texts.forEach((t) => meetAdd(t)), meetState: () => (Vc.meet ? { lines: Vc.meet.lines.length, kind: Vc.kind } : null), isOpen: () => !!$('#studio') };
})();
