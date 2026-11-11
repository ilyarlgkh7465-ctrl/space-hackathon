"""Голосовой чат с роботом-помощником для руководителей (трек 3). Только стандартная библиотека Python.

Цепочка: микрофон в браузере → распознавание речи (whisper.cpp, STT_URL) → ответ помощника (этот файл) →
синтез речи (tools/tts_server.py: Silero или Piper, TTS_URL) → браузер играет звук.

Правила:
  * помощник знает не больше сотрудника: ответы строятся теми же функциями, что и экран помощника (права — на сервере);
  * голосом ничего не меняется — только ответы; любое изменение подтверждается кнопкой на экране (ТЗ AI-03);
  * звук не сохраняется: распознали — и забыли; в журнал пишется только текст вопроса после маскирования;
  * распознавание и синтез — локальные программы на этом же компьютере, наружу голос не уходит.

Адреса (внутри /api/assistant/, вход обязателен):
  GET  voice/status              — работают ли распознавание и синтез
  POST voice/chat  {q}           — ответ: {text, speech, intent, cites, source}
  POST voice/stt   {audio, mime} — звук (base64) → {text}
  POST voice/tts   {text, voice} — текст → WAV (voice: robot)
"""
import base64
import datetime
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import assistant_api as A

STT_URL = os.environ.get("STT_URL", "http://127.0.0.1:8090").rstrip("/")
TTS_URL = os.environ.get("TTS_URL", "http://127.0.0.1:5050").rstrip("/")
VOICES = {"robot": {"voice": os.environ.get("TTS_VOICE_ROBOT", "ru_RU-denis-medium"), "length_scale": 1.0}}
MAX_AUDIO = 4 * 1024 * 1024          # ~2 минуты речи в webm/opus — больше в чат не нужно
_probe = {}


def ffmpeg():
    return os.environ.get("FFMPEG") or shutil.which("ffmpeg") or next(
        (p for p in (str(Path.home() / ".local/bin/ffmpeg"), "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg") if Path(p).exists()), None)


def alive(url):
    """Отвечает ли служба (кэш 10 секунд, чтобы не задерживать каждый запрос)."""
    hit = _probe.get(url)
    if hit and time.time() - hit[0] < 10:
        return hit[1]
    try:
        urllib.request.urlopen(url + "/", timeout=0.6).close()
        ok = True
    except urllib.error.HTTPError:
        ok = True                    # отвечает, пусть и ошибкой на корневой адрес
    except Exception:
        ok = False
    _probe[url] = (time.time(), ok)
    return ok


def status():
    tts_engine = None
    if alive(TTS_URL):
        try:
            with urllib.request.urlopen(TTS_URL + "/", timeout=0.6) as r:
                tts_engine = json.loads(r.read() or b"{}").get("voice")
        except Exception:
            tts_engine = None
    return {"stt": alive(STT_URL) and bool(ffmpeg()), "tts": alive(TTS_URL), "ffmpeg": bool(ffmpeg()),
            "stt_engine": "whisper.cpp (локально)", "tts_engine": tts_engine or "локальный синтез"}


# ---------------------------------------------------------------- речь → текст

def stt(core, user, body):
    raw = base64.b64decode(str(body.get("audio") or ""), validate=False)
    if not raw:
        return 400, {"error": "нет звука"}
    if len(raw) > MAX_AUDIO:
        return 413, {"error": "слишком длинная запись — говорите короче"}
    ff = ffmpeg()
    if not ff or not alive(STT_URL):
        return 503, {"error": "распознавание речи не запущено на сервере — напишите вопрос текстом"}
    ext = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/wav": ".wav"}.get(str(body.get("mime", "")).split(";")[0], ".webm")
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:          # звук живёт только на время распознавания
        src, dst = Path(tmp) / ("in" + ext), Path(tmp) / "in.wav"
        src.write_bytes(raw)
        r = subprocess.run([ff, "-loglevel", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)],
                           capture_output=True, timeout=30)
        if r.returncode != 0 or not dst.exists():
            return 400, {"error": "не удалось прочитать запись"}
        wav = dst.read_bytes()
    seconds = max(0.0, (len(wav) - 44) / 32000)
    if seconds < 0.3:
        return 200, {"text": "", "seconds": round(seconds, 1)}
    boundary = "fp" + uuid.uuid4().hex
    parts = []
    for name, val in (("response_format", "json"), ("temperature", "0.0"), ("language", "ru")):
        parts.append('--{}\r\nContent-Disposition: form-data; name="{}"\r\n\r\n{}\r\n'.format(boundary, name, val).encode())
    parts.append('--{}\r\nContent-Disposition: form-data; name="file"; filename="speech.wav"\r\nContent-Type: audio/wav\r\n\r\n'.format(boundary).encode() + wav + b"\r\n")
    parts.append("--{}--\r\n".format(boundary).encode())
    req = urllib.request.Request(STT_URL + "/inference", data=b"".join(parts), method="POST",
                                 headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            out = json.loads(resp.read().decode("utf-8", "replace") or "{}")
    except Exception as e:
        _probe.pop(STT_URL, None)
        return 502, {"error": "распознавание речи не ответило: " + type(e).__name__}
    text = re.sub(r"\s+", " ", str(out.get("text", ""))).strip()
    text = re.sub(r"^\[.*?\]\s*", "", text)          # whisper иногда пишет [музыка] и т. п.
    core.audit(A.who(user), "распознавание речи", "{:.1f} с звука → {} символов; звук не сохраняется".format(seconds, len(text)),
               obj="помощник: голос", result="ok")
    return 200, {"text": text, "seconds": round(seconds, 1), "ms": int(1000 * (time.time() - t0))}


# ---------------------------------------------------------------- текст → речь

SPEAK_FIX = [(r"\[D:[^\]]+\]", ""), (r"\bBYN\b", "рублей"), (r"(\d+,\d+)\s*%", r"\1 процента"),
             (r"(\d+)\s*%", lambda m: m.group(1) + " " + plural(int(m.group(1)), "процент", "процента", "процентов")), (r"№\s*", "номер "),
             (r"\bп\.\s*(\d)", r"пункт \1"), (r"\bт\.\s*е\.", "то есть"), (r"\bт\.\s*д\.", "так далее"),
             (r"«|»|\"", ""), (r"\s*—\s*", " — "), (r"\s+", " ")]


DAY_GEN = ["", "первого", "второго", "третьего", "четвёртого", "пятого", "шестого", "седьмого", "восьмого", "девятого", "десятого",
           "одиннадцатого", "двенадцатого", "тринадцатого", "четырнадцатого", "пятнадцатого", "шестнадцатого", "семнадцатого",
           "восемнадцатого", "девятнадцатого", "двадцатого", "двадцать первого", "двадцать второго", "двадцать третьего",
           "двадцать четвёртого", "двадцать пятого", "двадцать шестого", "двадцать седьмого", "двадцать восьмого",
           "двадцать девятого", "тридцатого", "тридцать первого"]
UNIT_WORDS = {"%": ("процент", "процента", "процентов"), "% брака": ("процент", "процента", "процентов"),
              "BYN": ("рубль", "рубля", "рублей"), "ч": ("час", "часа", "часов"), "чел.": ("человек", "человека", "человек")}
MONTHS_RX = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря"


def half(n, unit):
    """2,5 % → «2 с половиной процента», 1,5 → «полтора процента»: синтезатор сам падежи не согласует."""
    forms = UNIT_WORDS.get(unit, ("", "", ""))
    if n == 0:
        return ("пол" + forms[0]) if forms[0] else "половина"
    if n == 1:
        return "полтора " + forms[1] if forms[1] else "полтора"
    return "{} с половиной {}".format(n, plural(n, *forms)).strip()


def num_say(v, unit, with_unit=True):
    """Число для озвучки: целое или «с половиной», единица в нужной форме, без разделителей тысяч."""
    if v is None:
        return "нет данных"
    a = abs(v)
    if a < 20 and 0.25 <= a - int(a) < 0.75:
        return half(int(a), unit if with_unit else "")
    n = int(round(v))
    forms = UNIT_WORDS.get(unit)
    return "{} {}".format(n, plural(abs(n), *forms)) if with_unit and forms else str(n)


def time_say(hh, mm):
    h, m = int(hh), int(mm)
    s = "{} {}".format(h, plural(h, "час", "часа", "часов"))
    return s + (" {} {}".format(m, plural(m, "минута", "минуты", "минут")) if m else "")


def speakable(text):
    s = str(text or "")
    s = re.sub(r"\s+(\d{4}) года", "", s)                                             # год вслух не нужен
    s = re.sub(r"\b(\d{1,2}) (" + MONTHS_RX + ")", lambda m: DAY_GEN[int(m.group(1))] + " " + m.group(2) if 0 < int(m.group(1)) < 32 else m.group(0), s)
    s = re.sub(r"\b(\d{1,2}):(\d{2})\b", lambda m: time_say(m.group(1), m.group(2)), s)
    s = re.sub(r"\b(\d+),5\s*%", lambda m: half(int(m.group(1)), "%"), s)
    s = re.sub(r"\b(\d+),5\b", lambda m: half(int(m.group(1)), ""), s)
    s = re.sub(r"\b(\d+),\d+\s*%", lambda m: num_say(int(m.group(1)), "%"), s)       # 91,1 % → 91 процент
    s = re.sub(r"(?<=\d)[ \u00a0\u202f](?=\d{3}\b)", "", s)                             # 211 800 → 211800, иначе читает два числа
    for rx, rep in SPEAK_FIX:
        s = re.sub(rx, rep, s)
    return s.strip()


def tts(body):
    text = speakable(body.get("text"))[:600]
    if not text:
        return 400, "application/json", json.dumps({"error": "нет текста"}).encode()
    if not alive(TTS_URL):
        return 503, "application/json", json.dumps({"error": "синтез речи не запущен", "fallback": "browser"}, ensure_ascii=False).encode()
    v = VOICES.get(body.get("voice") or "robot", VOICES["robot"])
    req = urllib.request.Request(TTS_URL + "/synthesize", data=json.dumps(dict(v, text=text), ensure_ascii=False).encode(),
                                 method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return 200, "audio/wav", resp.read()
    except Exception as e:
        _probe.pop(TTS_URL, None)
        return 502, "application/json", json.dumps({"error": "синтез речи не ответил: " + type(e).__name__, "fallback": "browser"}, ensure_ascii=False).encode()


# ---------------------------------------------------------------- ответы

MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
WEEKDAYS_ACC = ["в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу", "в воскресенье"]

ACTION_RX = re.compile(r"\b(созда|назнач|постав\w* задач|перенес|перенос|удал|отправ|утверд|измени|поменя|запиш|напомн|приглас|отмен|закрой|выполни|разошл)\w*", re.I)
HELLO_RX = re.compile(r"^\s*(привет|здравству|добр\w+ (день|утро|вечер)|кто ты|что (ты )?умеешь|помощь|как тобой пользоваться)", re.I)
PULSE_RX = re.compile(r"(сводк|пульс|показател|отклонен|как дела|что горит|что плохо|ситуаци|обстановк|метрик|kpi|выручк\w* сейчас|в целом по компании)", re.I)
TASK_RX = re.compile(r"(задач|поручен|просроч|без срока|без владельца|без ответственн|кто что делает)", re.I)
MEET_RX = re.compile(r"(встреч|планёрк|планерк|совещан|календар|созвон|что у меня (завтра|сегодня)|расписан)", re.I)


def day_words(iso, with_weekday=True):
    d = datetime.date.fromisoformat(str(iso)[:10])
    s = "{} {}".format(d.day, MONTHS_GEN[d.month - 1])
    return (WEEKDAYS_ACC[d.weekday()] + ", " + s) if with_weekday else s


def short_name(core, uid):
    """Имя и отчество — так к человеку обращаются вслух."""
    p = A.person(core, uid)
    if not p:
        return "ответственный не назначен"
    w = str((A.aliases().get(uid) or {}).get("full") or "").split()
    return " ".join(w[1:3]) if len(w) >= 3 else p["name"]


def plural(n, a, b, c):
    m10, m100 = n % 10, n % 100
    return a if m10 == 1 and m100 != 11 else b if 2 <= m10 <= 4 and not 12 <= m100 <= 14 else c


def fmt_num(v, unit):
    if v is None:
        return "нет данных"
    s = ("{:,.0f}".format(v) if abs(v) >= 100 else "{:.1f}".format(v).rstrip("0").rstrip(".").replace(".", ",")).replace(",", " " if abs(v) >= 100 else ",")
    return s + (" %" if unit == "%" else " " + unit if unit else "")


def answer_pulse(core, user):
    try:
        import pult_api as P
    except Exception:
        return {"text": "Сводка пульта сейчас недоступна.", "intent": "pulse"}
    if not P._scope(user):
        return {"text": "Сводка показателей компании доступна руководителям и аналитику. Могу рассказать про ваши задачи и встречи.",
                "intent": "pulse", "refused": True}
    data = P.pulse(P.prep(core), user, 14)
    kp = data["kpis"]
    bad = [k for k in kp if k["status"] == "bad"]
    warn = [k for k in kp if k["status"] == "warn"]
    asof = data["asof"]
    when = "{}, {}".format(day_words(asof, False), asof[11:16])
    scope = "по компании" if data["scope"]["all"] else "по вашему отделу"
    lines = ["Данные пульта {} за 14 дней, на {}.".format(scope, when)]
    if not bad and not warn:
        lines.append("Все {} {} в норме.".format(len(kp), plural(len(kp), "показатель", "показателя", "показателей")))
    else:
        lines.append("Из {} {} {} {} решения{}.".format(
            len(kp), plural(len(kp), "показателя", "показателей", "показателей"), len(bad), plural(len(bad), "требует", "требуют", "требуют"),
            ", ещё {} под вниманием".format(len(warn)) if warn else ""))
        for k in (bad + warn)[:3]:
            lines.append("{}: {} при плане {}{}.".format(k["name"], fmt_num(k["value"], k["unit"]), fmt_num(k["plan"], k["unit"]),
                                                         " — " + k["dept_name"].lower() if data["scope"]["all"] else ""))
    say = ["Сводка {} за последние две недели.".format(scope)]
    if not bad and not warn:
        say.append("Все показатели в норме.")
    else:
        say.append("Требуют решения: {}.".format(len(bad)) + (" Под вниманием: {}.".format(len(warn)) if warn else ""))
        for k in (bad + warn)[:3]:
            say.append("{} — {}, план — {}.".format(k["name"], num_say(k["value"], k["unit"]), num_say(k["plan"], k["unit"], False)))
    src = sorted({part.split(":")[0].strip() for k in kp for part in str(k.get("source") or "").split("·") if part.strip()})
    return {"text": " ".join(lines), "say": " ".join(say), "intent": "pulse",
            "source": "Пульт руководителя: {}; обновлено {}".format(", ".join(src[:6]) or "учётные системы", str((kp[0].get("updated") if kp else asof) or asof).replace("T", " ")[:16]),
            "link": "/t1/"}


def answer_tasks(core, user):
    today = datetime.date.today().isoformat()
    vis = [t for t in A.tasks_view(core, user)["tasks"] if t.get("status") != "done"]
    if not vis:
        return {"text": "Открытых задач в вашей зоне сейчас нет.", "intent": "tasks"}
    over = sorted([t for t in vis if t.get("due") and t["due"] < today], key=lambda t: t["due"])
    flag = [t for t in vis if not t.get("owner") or not t.get("due")]
    lines = ["Открытых задач: {}. Просрочено: {}. Без ответственного или срока: {}.".format(len(vis), len(over), len(flag))]
    for t in over[:2]:
        lines.append("Просрочена «{}» — {}, срок был {}.".format(t["title"], short_name(core, t.get("owner")), day_words(t["due"], False)))
    for t in flag[:2]:
        miss = " и ".join(x for x in (("нет ответственного" if not t.get("owner") else ""), ("нет срока" if not t.get("due") else "")) if x)
        lines.append("«{}»: {}.".format(t["title"], miss))
    if flag:
        lines.append("Поправить можно на вкладке «Задачи» — я предложу ответственного и срок, а сохраните вы.")
    return {"text": " ".join(lines), "intent": "tasks", "source": "Реестр задач помощника", "link": "?tab=tasks"}


def answer_meetings(core, user):
    now = datetime.datetime.now().astimezone()
    ms = [m for m in core.load("meetings") if A.meeting_visible(user, m)]
    up = sorted([m for m in ms if m.get("status") == "planned" and datetime.datetime.fromisoformat(m["start"]) >= now - datetime.timedelta(hours=1)],
                key=lambda m: m["start"])
    held = sorted([m for m in ms if m.get("status") != "planned"], key=lambda m: m["start"], reverse=True)
    lines = []
    if up:
        m = up[0]
        tasks = [t for t in A.tasks_view(core, user)["tasks"] if t.get("status") != "done" and t.get("owner") in m.get("participants", [])]
        lines.append("Ближайшая встреча — «{}», {}, в {}, {} минут.".format(m["title"], day_words(m["start"]), m["start"][11:16], m.get("minutes", 30)))
        if m.get("goal"):
            lines.append("Цель: {}.".format(m["goal"].rstrip(".")))
        lines.append("Участников: {}, у них открытых задач: {}.".format(len(m.get("participants", [])), len(tasks)))
    else:
        lines.append("Запланированных встреч у вас нет.")
    if held:
        h = held[0]
        lines.append("Последняя прошедшая — «{}», {}{}.".format(h["title"], day_words(h["start"], False),
                                                                 ", протокол утверждён" if h.get("protocol") else ", протокол ещё не утверждён"))
    return {"text": " ".join(lines), "intent": "meetings", "source": "Календарь встреч помощника", "link": "?tab=meetings"}


def answer_docs(core, user, q):
    r = A.ask(core, user, q)
    cites = r.get("cites", [])
    if r.get("refused"):
        text = re.sub(r"\s*\[D:[^\]]+\]", "", r["answer"])
    elif not r.get("found"):
        text = r["answer"] + (" Возможно, ответ есть в документах, закрытых для вашей роли." if "closed" in r.get("notes", []) else "")
    elif r.get("fallback"):
        first = cites[0]
        text = "В документах нашёл: {} Источник — {}, пункт {}, от {}.".format(
            first["text"].rstrip(".") + ".", first.get("code") or first.get("title"), first["n"], day_words(first["date"], False) + " " + first["date"][:4] + " года")
    else:
        text = re.sub(r"\s*\[D:[^\]]+\]", "", r["answer"]).strip()
        if cites:
            c = cites[0]
            text += " Источник — {}, пункт {}, от {}.".format(c.get("code") or c.get("title"), c["n"], day_words(c["date"], False) + " " + c["date"][:4] + " года")
    say = text
    if cites and r.get("found"):
        c = cites[0]
        say = re.sub(r"\s*Источник — .*$", "", text) + " Источник — «{}», пункт {}, от {}.".format(c.get("title") or c.get("code"), c["n"], day_words(c["date"], False))
    return {"text": text, "say": say, "intent": "docs", "cites": cites, "provider": r.get("provider"), "fallback": r.get("fallback"),
            "source": "Документы компании" if cites else None, "audited": True}


def chat(core, user, q):
    q = re.sub(r"\s+", " ", str(q or "")).strip()[:400]
    if not q:
        return {"text": "Я вас не расслышал. Повторите, пожалуйста.", "intent": "empty"}
    if HELLO_RX.search(q):
        res = {"text": "Здравствуйте, {}! Я помощник руководителя «Фотопринта». Спросите про сводку показателей, задачи, ближайшие встречи "
                       "или про любой регламент компании. Голосом я только отвечаю — изменения вы подтверждаете на экране.".format(
                           short_name(core, user["id"])), "intent": "hello"}
    elif ACTION_RX.search(q) and re.search(r"^(как|можно ли)\b", q, re.I):
        res = {"text": "Задачи появляются из протокола встречи: я готовлю черновик, вы правите и подтверждаете. "
                       "Ответственного, срок и статус меняют на вкладке «Задачи» — тоже с подтверждением.", "intent": "howto"}
    elif ACTION_RX.search(q) and not re.search(r"^(почему|зачем|когда|кто|какие|какая|какой|сколько)\b", q, re.I):
        res = {"text": "Голосом я ничего не меняю — так устроена защита: любое действие подтверждается кнопкой. "
                       "Откройте вкладку «Задачи» или «Встречи», я подготовлю черновик, а сохраните вы.", "intent": "action"}
    elif PULSE_RX.search(q):
        res = answer_pulse(core, user)
    elif TASK_RX.search(q):
        res = answer_tasks(core, user)
    elif MEET_RX.search(q):
        res = answer_meetings(core, user)
    else:
        res = answer_docs(core, user, q)
    res["speech"] = speakable(res.pop("say", None) or res["text"])
    res.setdefault("cites", [])
    if not res.pop("audited", False):
        core.audit(A.who(user), "голосовой вопрос", "{} → {}".format(core.mask(q, {}), res["intent"]), obj="помощник: голос",
                   result="отказ" if res.get("refused") else "ok")
    return res


# ---------------------------------------------------------------- HTTP

def handle(handler, method, sub, core, user):
    if method == "GET" and sub == "voice/status":
        handler._json(status())
        return True
    if method == "POST" and sub == "voice/chat":
        handler._json(chat(core, user, handler._body().get("q")))
        return True
    if method == "POST" and sub == "voice/stt":
        code, res = stt(core, user, handler._body())
        handler._json(res, code)
        return True
    if method == "POST" and sub == "voice/tts":
        code, ctype, raw = tts(handler._body())
        handler.send_response(code)
        handler.send_header("Content-Type", ctype)
        handler.send_header("Content-Length", str(len(raw)))
        handler.end_headers()
        handler.wfile.write(raw)
        return True
    return False
