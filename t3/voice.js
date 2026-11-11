/* Трек 3 — голосовой чат с роботом-помощником.
   Микрофон → сервер распознаёт речь (whisper.cpp) → помощник отвечает в пределах прав роли → сервер синтезирует голос (Piper)
   → браузер проигрывает ответ обычным голосом. Робот — обычная картинка, без анимации.
   Звук нигде не сохраняется. Голосом ничего не меняется: робот только отвечает. */
(function () {
  'use strict';
  const SUGG = ['Дай сводку по компании', 'Какие задачи просрочены?', 'Когда ближайшая встреча?', 'Какая допустимая доля перепечаток?'];
  const STATE_TEXT = { idle: 'Готов слушать', listening: 'Слушаю…', hearing: 'Распознаю речь…', thinking: 'Думаю…', speaking: 'Отвечаю' };
  const V = {
    ctx: null, root: null, log: [], state: 'idle', status: null, sound: true,
    ac: null, run: 0, rec: null, text: '',
  };
  const esc = window.esc;
  const pref = (k, d) => { try { const v = localStorage.getItem('fp-voice-' + k); return v == null ? d : v === '1'; } catch (e) { return d; } };
  const savePref = (k, v) => { try { localStorage.setItem('fp-voice-' + k, v ? '1' : '0'); } catch (e) { /* приватный режим */ } };
  V.sound = pref('sound', true);

  /* ---------- разметка ---------- */
  const micIcon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';
  const stopIcon = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/></svg>';

  function bubble(m, i) {
    if (m.who === 'me') return '<div class="vmsg vmsg-me"><div class="vb">' + esc(m.text) + (m.voice ? ' <span class="faint" title="Распознано из речи">🎙</span>' : '') + '</div></div>';
    const cites = (m.cites || []).map((c) => '<button class="cite" data-act="cite" data-doc="' + esc(c.doc) + '" data-n="' + esc(c.n) + '">' + esc(c.code || c.title) + ' · п. ' + esc(c.n) + ' · ' + esc(c.date) + '</button>').join(' ');
    const meta = [m.source ? 'Источник: ' + esc(m.source) : '', m.ms ? 'ответ за ' + (m.ms < 1000 ? m.ms + ' мс' : (m.ms / 1000).toFixed(1).replace('.', ',') + ' с') : ''].filter(Boolean).join(' · ');
    return '<div class="vmsg vmsg-bot"><div class="vb">' + esc(m.text) +
      (cites ? '<div class="vcites">' + cites + '</div>' : '') +
      (m.link ? '<div class="vcites"><button class="btn btn-sm" data-v="go" data-link="' + esc(m.link) + '">' + (m.link === '/t1/' ? 'Открыть пульт' : 'Открыть на экране') + '</button></div>' : '') +
      (meta ? '<div class="vmeta">' + meta + '</div>' : '') +
      '<div class="vmeta"><button class="linkbtn" data-v="say" data-i="' + i + '">Повторить вслух</button></div></div></div>';
  }
  function logHtml() {
    if (!V.log.length) {
      return '<div class="vempty"><b>Спросите голосом или текстом.</b><br>Робот отвечает только по данным, которые доступны вашей роли, и ничего не меняет сам.</div>';
    }
    return V.log.map(bubble).join('');
  }
  function hint() {
    const st = V.status;
    if (!st) return 'Проверяю микрофон и голос…';
    if (!navigator.mediaDevices || !window.MediaRecorder) return 'Микрофон в браузере доступен только по https или на самом компьютере. Напишите вопрос — робот ответит голосом.';
    if (!st.stt) return 'Распознавание речи на сервере не запущено. Напишите вопрос — робот ответит голосом.';
    if (V.state === 'listening') return 'Говорите. Остановлюсь сам, когда вы замолчите, или нажмите ещё раз.';
    return 'Нажмите на микрофон и задайте вопрос.';
  }
  const canMic = () => !!(V.status && V.status.stt && navigator.mediaDevices && window.MediaRecorder);

  function html() {
    return '<section class="voice" id="voice">' +
      '<div class="vstage card">' +
        '<div class="vrobot"><img src="/shared/avatar/robot.png" alt="Робот-помощник" width="438" height="455"></div>' +
        '<div class="vstate" id="vstate" role="status">' + STATE_TEXT[V.state] + '</div>' +
        '<button class="vmic" id="vmic" data-v="mic" aria-label="Микрофон"' + (canMic() || V.state !== 'idle' ? '' : ' disabled') + '>' + (V.state === 'idle' ? micIcon : stopIcon) + '</button>' +
        '<p class="vhint" id="vhint">' + esc(hint()) + '</p>' +
        '<div class="vopts"><label><input type="checkbox" data-v="sound"' + (V.sound ? ' checked' : '') + '> Отвечать вслух</label></div>' +
        '<p class="vprivacy">Звук не сохраняется. Речь распознаётся и озвучивается на сервере компании, наружу не уходит.</p>' +
      '</div>' +
      '<div class="vchat card">' +
        '<div class="vlog" id="vlog" aria-live="polite">' + logHtml() + '</div>' +
        '<div class="vsugg">' + SUGG.map((s) => '<button class="chip" data-v="sugg">' + esc(s) + '</button>').join('') + '</div>' +
        '<form class="vform" id="vform"><input class="input" id="vq" placeholder="Вопрос роботу…" autocomplete="off" value="' + esc(V.text) + '">' +
        '<button class="btn btn-primary" type="submit">Спросить</button></form>' +
      '</div></section>';
  }

  /* ---------- состояние и лицо ---------- */
  function setState(s) {
    V.state = s;
    if (!V.root) return;
    const st = V.root.querySelector('#vstate'); if (st) st.textContent = STATE_TEXT[s];
    const mic = V.root.querySelector('#vmic');
    if (mic) { mic.innerHTML = s === 'idle' ? micIcon : stopIcon; mic.disabled = s === 'idle' && !canMic(); mic.setAttribute('aria-label', s === 'idle' ? 'Микрофон' : 'Остановить'); }
    const h = V.root.querySelector('#vhint'); if (h) h.textContent = hint();
  }
  function refreshLog() {
    const el = V.root && V.root.querySelector('#vlog');
    if (el) { el.innerHTML = logHtml(); el.scrollTop = el.scrollHeight; }
  }
  /* ---------- звук: воспроизведение с эффектом робота ---------- */
  function audio() {
    if (!V.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      V.ac = new AC();
      V.out = V.ac.createGain(); V.out.connect(V.ac.destination);
    }
    if (V.ac.state === 'suspended') V.ac.resume();
    return V.ac;
  }
  function playBuffer(buf, run) {
    return new Promise((resolve) => {
      const ac = audio();
      const src = ac.createBufferSource(); src.buffer = buf;
      src.connect(V.out); src.onended = resolve;
      V.src = src;
      if (run !== V.run) { resolve(); return; }
      src.start();
    });
  }
  async function fetchSpeech(text) {
    const t = V.ctx.token();
    const r = await fetch('/api/assistant/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ text, voice: 'robot' }) });
    if (!r.ok) throw new Error('tts ' + r.status);
    return await audio().decodeAudioData(await r.arrayBuffer());
  }
  function chunks(text) {
    const parts = (text.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [text]).map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) { if (out.length && out[out.length - 1].length < 45) out[out.length - 1] += ' ' + p; else out.push(p); }
    return out;
  }
  function browserSpeak(text, run) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const ru = speechSynthesis.getVoices().find((v) => /^ru/i.test(v.lang) && v.localService) || speechSynthesis.getVoices().find((v) => /^ru/i.test(v.lang));
      if (ru) u.voice = ru;
      u.lang = 'ru-RU'; u.pitch = 1; u.rate = 1;
      u.onend = u.onerror = resolve;
      if (run !== V.run) { resolve(); return; }
      speechSynthesis.speak(u);
    });
  }
  async function speak(text) {
    if (!V.sound || !text) { setState('idle'); return; }
    const run = ++V.run;
    setState('speaking');
    try {
      if (V.status && V.status.tts) {
        const parts = chunks(text);
        let next = fetchSpeech(parts[0]);
        for (let i = 0; i < parts.length && run === V.run; i++) {
          const buf = await next;
          next = i + 1 < parts.length ? fetchSpeech(parts[i + 1]) : null;      /* следующая фраза готовится, пока звучит текущая */
          if (next) next.catch(() => {});
          if (run !== V.run) break;
          await playBuffer(buf, run);
        }
      } else {
        await browserSpeak(text, run);
      }
    } catch (e) {
      if (run === V.run) await browserSpeak(text, run);
    }
    if (run === V.run) setState('idle');
  }
  function stopSpeaking() {
    V.run++;
    try { if (V.src) V.src.stop(); } catch (e) { /* не играл */ }
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  /* ---------- вопрос → ответ ---------- */
  async function ask(text, fromVoice) {
    text = String(text || '').trim();
    if (!text) return;
    stopSpeaking();
    audio();
    V.log.push({ who: 'me', text, voice: !!fromVoice });
    V.text = ''; const q = V.root && V.root.querySelector('#vq'); if (q) q.value = '';
    refreshLog(); setState('thinking');
    const t0 = performance.now();
    try {
      const r = await V.ctx.call('/api/assistant/voice/chat', { q: text });
      V.log.push({ who: 'bot', text: r.text, speech: r.speech, cites: r.cites, source: r.source, link: r.link, ms: Math.round(performance.now() - t0) });
      refreshLog();
      await speak(r.speech);
    } catch (e) {
      V.log.push({ who: 'bot', text: 'Не получилось ответить: ' + (e.message || e) + ' Попробуйте ещё раз.' });
      refreshLog(); setState('idle');
    }
  }

  /* ---------- микрофон ---------- */
  async function startMic() {
    stopSpeaking();
    audio();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { window.toast('Браузер не дал доступ к микрофону. Разрешите его в настройках страницы или напишите вопрос.', 4500); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const data = [];
    const srcNode = V.ac.createMediaStreamSource(stream);
    const an = V.ac.createAnalyser(); an.fftSize = 1024; srcNode.connect(an);
    const rec = { mr, stream, spoke: false, quietSince: 0, started: performance.now(), cancelled: false };
    V.rec = rec;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) data.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop()); srcNode.disconnect(); clearInterval(rec.timer); V.rec = null;
      if (rec.cancelled || !rec.spoke) { setState('idle'); if (!rec.cancelled) window.toast('Я ничего не услышал. Попробуйте ещё раз.'); return; }
      setState('hearing');
      try {
        const blob = new Blob(data, { type: mr.mimeType || 'audio/webm' });
        const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
        const r = await V.ctx.call('/api/assistant/voice/stt', { audio: b64, mime: blob.type });
        if (!r.text) { setState('idle'); window.toast('Не удалось разобрать слова. Повторите, пожалуйста.'); return; }
        await ask(r.text, true);
      } catch (e) { setState('idle'); window.toast(e.message || String(e), 4500); }
    };
    rec.timer = setInterval(() => {
      const buf = new Uint8Array(an.fftSize); an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / buf.length), now = performance.now();
      if (rms > 0.03) { rec.spoke = true; rec.quietSince = 0; }
      else if (rec.spoke) { if (!rec.quietSince) rec.quietSince = now; else if (now - rec.quietSince > 900) mr.stop(); }
      if ((!rec.spoke && now - rec.started > 7000) || now - rec.started > 30000) mr.stop();
    }, 60);
    mr.start(250);
    setState('listening');
  }
  function micButton() {
    if (V.state === 'idle') { if (canMic()) startMic(); return; }
    if (V.state === 'listening' && V.rec) { V.rec.spoke = V.rec.spoke || performance.now() - V.rec.started > 600; V.rec.mr.stop(); return; }
    stopSpeaking(); setState('idle');
  }

  /* ---------- подключение к экрану ---------- */
  function onClick(e) {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const v = b.dataset.v;
    if (v === 'mic') micButton();
    if (v === 'sugg') ask(b.textContent);
    if (v === 'say') { const m = V.log[+b.dataset.i]; if (m) { stopSpeaking(); audio(); const was = V.sound; V.sound = true; speak(m.speech || m.text).then(() => { V.sound = was; }); } }
    if (v === 'go') { stopSpeaking(); setState('idle'); if (b.dataset.link.startsWith('?tab=')) V.ctx.goTab(b.dataset.link.slice(5)); else location.href = b.dataset.link; }
  }
  function onChange(e) {
    const v = e.target.dataset.v;
    if (v === 'sound') { V.sound = e.target.checked; savePref('sound', V.sound); if (!V.sound) { stopSpeaking(); if (V.state === 'speaking') setState('idle'); } }
  }
  async function mount(root, ctx) {
    V.ctx = ctx; V.root = root.querySelector('#voice');
    if (!V.root) return;
    V.root.addEventListener('click', onClick);
    V.root.addEventListener('change', onChange);
    V.root.querySelector('#vform').addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); ask(V.root.querySelector('#vq').value); });
    V.root.querySelector('#vq').addEventListener('input', (e) => { V.text = e.target.value; });
    const log = V.root.querySelector('#vlog'); log.scrollTop = log.scrollHeight;
    if (!V.status) {
      try { V.status = await ctx.call('/api/assistant/voice/status'); } catch (e) { V.status = { stt: false, tts: false }; }
      setState(V.state);
    }
  }
  function leave() {
    stopSpeaking();
    if (V.rec) { V.rec.cancelled = true; try { V.rec.mr.stop(); } catch (e) { /* уже остановлен */ } }
    V.state = 'idle'; V.root = null;
  }
  function reset() { leave(); V.log = []; V.status = null; }

  window.FPVoice = { html, mount, leave, reset };
})();
