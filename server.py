#!/usr/bin/env python3
"""Space Hackathon: один сервер на три трека (только стандартная библиотека Python 3.9+).

    python3 server.py            # http://127.0.0.1:8800
    python3 server.py --lan      # открыть и для телефонов в той же Wi-Fi (трек 2)

Что умеет:
  /                      — хаб с тремя треками; /t1/ /t2/ /t3/ — сами MVP; /shared/ — стиль и данные
  GET  /api/health       — есть ли ИИ, какой режим
  GET  /api/store/<c>    — список записей (orders, decisions, tasks, meetings, audit, notes)
  POST /api/store/<c>    — добавить запись (id и время ставит сервер)
  POST /api/store/<c>/<id>          — изменить поля записи
  POST /api/store/<c>/<id>/delete   — удалить запись
  POST /api/login        — {login, password} → {token, user}; дальше заголовок Authorization: Bearer <token>
  GET  /api/me           — кто вошёл: {id, name, title, role, dept, level}
  /api/assistant/...     — модуль помощника (assistant_api.py), /api/app/... — модуль приложения (app_api.py)
  POST /api/reset        — вернуть демо-данные из data/seed (перед показом жюри)
  POST /api/ai           — запрос к модели: {system, user, json, mask, max_tokens, who}
                           mask=true — ФИО, телефоны, УНП, почта и суммы заменяются метками до отправки
                           и возвращаются обратно в ответе; в журнал audit пишется, что ушло наружу
  GET/POST /api/ai/mode  — auto | cloud | local | off; cloud: claude | deepseek
                           auto — шлюз сам выбирает модель по задаче: финансы → только локальная модель,
                           сложные разборы → Claude, короткие ответы → DeepSeek
  GET  /api/gateway      — ИИ-шлюз: правила, счётчики и последние обращения к моделям (директор и аналитик)
  GET  /api/connect      — адреса сервера в сети и есть ли https (для страницы /connect.html)
  GET  /api/qr?text=     — QR-код адреса (SVG), если установлена библиотека segno
  GET  /ca.crt           — сертификат доверия для телефонов (открытая часть)

Запуск для телефонов:  python3 server.py --lan  — http на 8800 и, если есть сертификат, https на 8443.
Сертификат: tools/make_cert.sh → папка certs рядом с проектом (или путь в переменной FP_CERTS). Микрофон на телефоне
браузеры дают только по https.
  POST /api/telegram     — отправить сообщение ответственному, если заданы TG_BOT_TOKEN и TG_CHAT_ID

Ключ модели: переменная LLM_API_KEY, иначе берётся из ../flat-inventory/.env (только LLM_*).
Локальная модель: LOCAL_LLM_URL (по умолчанию Ollama http://127.0.0.1:11434/v1) и LOCAL_LLM_MODEL.
"""
import json
import os
import re
import shutil
import sys
import threading
import time
import types
import urllib.error
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import llm_gateway

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
SEED = DATA / "seed"
# memory — общий журнал компании (пишут помощники), events — журнал событий заказа (приложение, производство, доставка)
COLLECTIONS = {"orders", "decisions", "tasks", "meetings", "audit", "notes", "memory", "events"}
LOCK = threading.Lock()


# ---------- настройки модели ----------

def _read_env_file(path: Path) -> dict:
    out = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^((?:LLM|CLAUDE|CLOUD)_[A-Z_]+)=(.*)$", line.strip())
            if m:
                out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    except OSError:
        pass
    return out


_file_env = _read_env_file(ROOT.parent / "flat-inventory" / ".env")
_file_env.update(_read_env_file(ROOT / ".env"))          # свой файл проекта: CLAUDE_API_KEY=… (в репозиторий не попадает)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name) or _file_env.get(name) or default


CLOUD = {
    "name": "DeepSeek (облако)",
    "base_url": _env("LLM_BASE_URL", "https://api.deepseek.com").rstrip("/"),
    "api_key": _env("LLM_API_KEY"),
    "model": _env("LLM_MODEL", "deepseek-chat"),
}
LOCAL = {
    "name": "Локальная модель",
    "base_url": os.environ.get("LOCAL_LLM_URL", "http://127.0.0.1:11434/v1").rstrip("/"),
    "api_key": os.environ.get("LOCAL_LLM_KEY", ""),
    "model": os.environ.get("LOCAL_LLM_MODEL", "qwen2.5:7b"),
}
# Вторая облачная модель — Claude. Ключ: CLAUDE_API_KEY в файле .env рядом с server.py или в окружении.
# CLAUDE_BASE_URL — только если ключ выдан сервисом-посредником со своим адресом.
CLAUDE = {
    "name": "Claude (облако)",
    "base_url": _env("CLAUDE_BASE_URL", "https://api.anthropic.com").rstrip("/"),
    "api_key": _env("CLAUDE_API_KEY"),
    "model": _env("CLAUDE_MODEL", "claude-opus-5-5"),
}
CLAUDE["official"] = CLAUDE["base_url"] == "https://api.anthropic.com"
_cloud = _env("CLOUD_PROVIDER") or ("claude" if llm_gateway.claude_ready(CLAUDE)[0] else "deepseek")
STATE = {"mode": os.environ.get("AI_MODE", "auto" if (CLOUD["api_key"] or CLAUDE["api_key"]) else "off"),
         "cloud": _cloud if _cloud in ("claude", "deepseek") else "deepseek"}
# Публичный стенд (сервер стоит за обратным прокси): запросы приходят с 127.0.0.1, но доверять им по адресу нельзя.
PUBLIC = os.environ.get("FP_PUBLIC", "") == "1"


# ---------- хранилище ----------

def _path(coll: str) -> Path:
    return DATA / (coll + ".json")


def _load(coll: str) -> list:
    p = _path(coll)
    if not p.exists():
        seed = SEED / (coll + ".json")
        if seed.exists():
            shutil.copy(seed, p)
        else:
            return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def _save(coll: str, items: list) -> None:
    tmp = _path(coll).with_suffix(".tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(_path(coll))


def _now() -> str:
    """Время с часовым поясом (требование ТЗ ОТ-07): 2026-11-11T14:30:00+03:00."""
    z = time.strftime("%z")
    return time.strftime("%Y-%m-%dT%H:%M:%S") + (z[:3] + ":" + z[3:] if z else "")


def audit(who: str, action: str, detail: str, outside: bool = False, obj: str = "", result: str = "ok") -> None:
    """Журнал действий (ТЗ ОТ-04): пользователь, время, действие, объект, результат."""
    with LOCK:
        items = _load("audit")
        items.append({"id": uuid.uuid4().hex[:8], "ts": _now(), "who": who or "система",
                      "action": action, "object": obj, "result": result,
                      "detail": detail[:400], "outside": outside})
        _save("audit", items[-2000:])


# ---------- пользователи, роли, вход ----------
# Права проверяются здесь, на сервере (ТЗ ОТ-02), а не в интерфейсе.
# Уровни: 1 — руководство, 2 — руководитель функции, 3 — операционная команда.
# Тестовые учётные записи — data/seed/users.json.

def _public(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "login", "name", "title", "role", "dept", "level", "stage")}


def login(name: str, password: str):
    for u in _load("users"):
        if u.get("login") == name and u.get("password") == password:
            token = uuid.uuid4().hex + uuid.uuid4().hex
            with LOCK:
                sess = _load("sessions")
                sess.append({"token": token, "user": u["id"], "ts": _now()})
                _save("sessions", sess[-300:])
            return token, _public(u)
    return None, None


def current_user(handler):
    """Пользователь по заголовку Authorization: Bearer <токен>; None — если не вошёл."""
    h = handler.headers.get("Authorization") or ""
    token = h[7:].strip() if h.lower().startswith("bearer ") else ""
    if not token:
        return None
    sess = next((x for x in _load("sessions") if x.get("token") == token), None)
    if not sess:
        return None
    u = next((x for x in _load("users") if x.get("id") == sess["user"]), None)
    return _public(u) if u else None


def can_see(user, dept: str) -> bool:
    """Директор и аналитик видят все подразделения, остальные — только своё."""
    if not user:
        return False
    if user.get("role") in ("director", "analyst"):
        return True
    return bool(dept) and user.get("dept") == dept


# ---------- маскирование персональных и коммерческих данных ----------

MASK_RULES = [
    ("ТЕЛЕФОН", re.compile(r"(?:\+?375|8\s?0)[\s\-()]*\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}")),
    ("ПОЧТА", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("УНП", re.compile(r"(?<!\d)\d{9}(?!\d)")),
    ("СУММА", re.compile(r"\d[\d\s]{0,12}(?:[.,]\d{1,2})?\s?(?:BYN|руб\.?|р\.|\$|USD|€)")),
    # Фамилия И. О. / Фамилия Имя / Имя Фамилия — две подряд заглавные русские словоформы
    ("ФИО", re.compile(r"\b[А-ЯЁ][а-яё]{2,}\s[А-ЯЁ]\.\s?[А-ЯЁ]\.|\b[А-ЯЁ][а-яё]{2,}\s[А-ЯЁ][а-яё]{2,}(?:\s[А-ЯЁ][а-яё]{4,}(?:вич|вна|ична|чна))?")),
]
# слова, которые начинаются с заглавной, но не люди: не маскировать
NOT_NAMES = {"Минск", "Беларусь", "Республики", "Беларусь", "Трек", "Салон", "Цех", "Онлайн", "Фото"}


def mask(text: str, mapping: dict) -> str:
    for label, rx in MASK_RULES:
        def repl(m, label=label):
            val = m.group(0)
            if label == "ФИО" and any(w in NOT_NAMES for w in val.split()):
                return val
            for k, v in mapping.items():
                if v == val:
                    return k
            key = "[{}_{}]".format(label, sum(1 for k in mapping if k.startswith("[" + label)) + 1)
            mapping[key] = val
            return key
        text = rx.sub(repl, text)
    return text


def unmask(text: str, mapping: dict) -> str:
    for k, v in mapping.items():
        text = text.replace(k, v)
    return text


# ---------- запрос к модели ----------

# Маршрут по задаче (режим auto). Класс задачи называет модуль (task=...), иначе он определяется по размеру запроса.
#   finance — вопросы о деньгах компании: только локальная модель; если она не запущена — встроенная логика, в облако не уходит
#   complex — протокол встречи, краткое содержание документа, длинные разборы: Claude, при отказе — DeepSeek
#   simple  — короткие ответы, выбор показателя, чат приложения: DeepSeek, при отказе — Claude
TASKS = {"finance": "Финансы", "complex": "Сложный разбор", "simple": "Короткий ответ"}
FIN_RX = re.compile(r"прибыл|убыт|марж|дебитор|кредитор|себестоим|бюджет|финанс|бухгалт|налог|зарплат|фонд оплаты|"
                    r"1с\b|p&l|денежн|контрагент|остатк\w* на (?:счет|счёт|начало|конец)", re.I)
_local_probe = {"ts": 0.0, "ok": False}
_claude_down = {"until": 0.0, "why": ""}


def task_for(question: str, default: str = "") -> str:
    """Класс задачи по тексту вопроса: о деньгах — finance (уйдёт только в локальную модель)."""
    return "finance" if FIN_RX.search(str(question or "")) else default


def local_alive() -> bool:
    """Отвечает ли локальная модель (проверка раз в 15 секунд, чтобы не задерживать запросы)."""
    if time.time() - _local_probe["ts"] < 15:
        return _local_probe["ok"]
    try:
        req = urllib.request.Request(LOCAL["base_url"] + "/models",
                                     headers={"Authorization": "Bearer " + LOCAL["api_key"]} if LOCAL["api_key"] else {})
        urllib.request.urlopen(req, timeout=0.7).close()
        ok = True
    except urllib.error.HTTPError:
        ok = True
    except Exception:  # noqa: BLE001
        ok = False
    _local_probe.update(ts=time.time(), ok=ok)
    return ok


def _claude_ok() -> bool:
    return llm_gateway.claude_ready(CLAUDE)[0] and time.time() >= _claude_down["until"]


def route(task: str) -> list:
    """Какие модели и в каком порядке пробуем для задачи: [("local"|"claude"|"deepseek"), ...]."""
    mode = STATE["mode"]
    if mode == "off":
        return []
    if mode == "local":
        return ["local"]
    if mode == "cloud":
        return [STATE["cloud"]]
    if task == "finance":
        return ["local"] if local_alive() else []
    first, second = ("claude", "deepseek") if task == "complex" else ("deepseek", "claude")
    return [m for m in (first, second) if (m == "claude" and _claude_ok()) or (m == "deepseek" and CLOUD["api_key"])]


def ask_model(system: str, user: str, want_json: bool, max_tokens: int, task: str = "") -> dict:
    """Единственный вход к моделям для всех модулей. Дальше — ИИ-шлюз (llm_gateway.py): правила, скрытие данных, журнал."""
    mode = STATE["mode"]
    if mode == "off":
        return {"ok": False, "reason": "ИИ выключен — работает встроенная логика"}
    if task not in TASKS:
        task = "complex" if (max_tokens >= 700 or len(user) > 5000) else "simple"
    chain = route(task)
    if not chain:
        if mode == "auto" and task == "finance":
            GATEWAY.note(task, "локальная модель не подключена — финансы в облако не отправлены")
            return {"ok": False, "task": task, "kept_inside": True,
                    "reason": "финансовые вопросы обрабатывает только локальная модель; сейчас она не подключена — ответ по встроенным правилам"}
        return {"ok": False, "reason": "нет ключа модели"}
    res = {"ok": False, "reason": "модель не ответила"}
    for name in chain:
        if name == "claude":
            ok, why = llm_gateway.claude_ready(CLAUDE)
            if not ok:
                res = {"ok": False, "reason": why}
                continue
            res = GATEWAY.call(dict(CLAUDE, outside=True, task=task), system, user, want_json, max_tokens,
                               lambda s, u, j, m: llm_gateway.ask_claude(CLAUDE, s, u, j, m))
            if not res.get("ok") and res.get("gateway") != "blocked":
                # Claude недоступен (сеть, регион, лимит) — пять минут не тратим на него время, отвечает следующая модель
                _claude_down.update(until=time.time() + 300, why=str(res.get("reason", ""))[:160])
        else:
            prov = LOCAL if name == "local" else CLOUD
            if name == "deepseek" and not prov["api_key"]:
                res = {"ok": False, "reason": "нет ключа модели"}
                continue
            res = GATEWAY.call(dict(prov, outside=name != "local", task=task), system, user, want_json, max_tokens,
                               lambda s, u, j, m, prov=prov, name=name: _ask_openai(prov, name == "local", s, u, j, m))
        res["task"] = task
        if res.get("ok") or res.get("gateway") == "blocked":
            break
    return res


def _ask_openai(prov: dict, local: bool, system: str, user: str, want_json: bool, max_tokens: int) -> dict:
    """Локальная модель и DeepSeek: общий формат chat/completions."""
    body = {
        "model": prov["model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }
    if want_json:
        body["response_format"] = {"type": "json_object"}
    if "deepseek.com" in prov["base_url"]:
        body["thinking"] = {"type": "disabled"}
    if local:
        # Локальная Qwen3: короткие ответы (чат, голос) — без «размышлений», чтобы не было задержки;
        # большие разборы (протокол встречи, max_tokens от 1500) — с размышлениями: маленькой модели без них не хватает точности.
        think = max_tokens >= 1500 and os.environ.get("LOCAL_LLM_THINK", "1") != "0"
        body["chat_template_kwargs"] = {"enable_thinking": think}
        if think:
            body["max_tokens"] = max_tokens + int(os.environ.get("LOCAL_LLM_THINK_TOKENS", "2500"))
    headers = {"Content-Type": "application/json"}
    if prov["api_key"]:
        headers["Authorization"] = "Bearer " + prov["api_key"]
    req = urllib.request.Request(prov["base_url"] + "/chat/completions",
                                 data=json.dumps(body).encode(), headers=headers, method="POST")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=240 if local else 45) as r:
            data = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")[:200]
        # некоторые модели не знают поле thinking — повторить без него
        if e.code == 400 and ("thinking" in body or "chat_template_kwargs" in body):
            body.pop("thinking", None)
            body.pop("chat_template_kwargs", None)
            req = urllib.request.Request(prov["base_url"] + "/chat/completions",
                                         data=json.dumps(body).encode(), headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=240 if local else 45) as r:
                    data = json.loads(r.read().decode())
            except Exception as e2:  # noqa: BLE001
                return {"ok": False, "reason": "{}: {}".format(prov["name"], e2)}
        else:
            return {"ok": False, "reason": "{} ответил {}: {}".format(prov["name"], e.code, detail)}
    except Exception as e:  # noqa: BLE001 — сеть, таймаут, нет локальной модели
        if local:
            _local_probe.update(ts=time.time(), ok=False)
        return {"ok": False, "reason": "{} недоступна: {}".format(prov["name"], e)}
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    out = {"ok": bool(text), "text": text, "provider": prov["name"], "model": prov["model"],
           "ms": int((time.time() - t0) * 1000), "outside": not local}
    if want_json and text:
        try:
            out["json"] = json.loads(re.sub(r"^```(?:json)?|```$", "", text.strip()).strip())
        except ValueError:
            out["json"] = None
    return out


GATEWAY = llm_gateway.Gateway(DATA / "gateway.json", MASK_RULES, _now)

# ---------- доступ с телефонов: https и адреса ----------
CERTS = Path(os.environ.get("FP_CERTS") or (ROOT.parent / "certs"))
HTTPS_PORT = int(os.environ.get("FP_HTTPS_PORT", "8443"))
NET = {"lan": False, "https": False, "port": 8800}


def lan_addresses() -> list:
    """Адреса этого компьютера в локальных сетях (Wi-Fi площадки, своя точка доступа)."""
    import socket
    found = []
    try:
        found += socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        found.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    out = []
    for ip in found:
        if ip not in out and not ip.startswith(("127.", "169.254.", "198.18.")):
            out.append(ip)
    out.sort(key=lambda ip: (not ip.startswith("192.168.137."), ip))      # точка доступа Windows — первой
    return out


def connect_info() -> dict:
    scheme, port = ("https", HTTPS_PORT) if NET["https"] else ("http", NET["port"])
    return {"lan": NET["lan"], "https": NET["https"], "ca": (CERTS / "ca.crt").exists(), "http_port": NET["port"],
            "addresses": [{"ip": ip, "base": "%s://%s:%d" % (scheme, ip, port), "plain": "http://%s:%d" % (ip, NET["port"]),
                           "hotspot": ip.startswith("192.168.137.")} for ip in lan_addresses()]}


def qr_svg(text: str):
    try:
        import io
        import segno
    except ImportError:
        return None
    buf = io.BytesIO()
    segno.make(text, error="m").save(buf, kind="svg", scale=8, border=2, xmldecl=False, svgns=True, nl=False,
                                     dark="#263B39", light="#ffffff")
    return buf.getvalue()


def ai_state() -> dict:
    """Что сейчас отвечает на запросы: для панели «ИИ-шлюз» и /api/health."""
    mode = STATE["mode"]
    names = {"local": LOCAL, "claude": CLAUDE, "deepseek": CLOUD}
    ready, note = llm_gateway.claude_ready(CLAUDE)
    if ready and time.time() < _claude_down["until"]:
        note = "сейчас недоступен: " + _claude_down["why"]
    routes = []
    if mode == "auto":
        for task, title in TASKS.items():
            chain = route(task)
            routes.append({"task": task, "title": title, "provider": names[chain[0]]["name"] if chain else "встроенная логика",
                           "model": names[chain[0]]["model"] if chain else None, "outside": bool(chain) and chain[0] != "local",
                           "reserve": names[chain[1]]["name"] if len(chain) > 1 else None,
                           "note": "в облако не уходит никогда" + ("" if chain else "; локальная модель сейчас не подключена") if task == "finance" else ""})
    prov = None if mode in ("off", "auto") else LOCAL if mode == "local" else CLAUDE if STATE["cloud"] == "claude" else CLOUD
    return {"mode": mode, "cloud": STATE["cloud"],
            "provider": "по задаче" if mode == "auto" else prov["name"] if prov else "встроенная логика",
            "model": prov["model"] if prov else None,
            "outside": mode == "cloud" or (mode == "auto" and any(r["outside"] for r in routes)),
            "routes": routes, "local_alive": local_alive() if mode in ("auto", "local") else None,
            "available": {"claude": ready and time.time() >= _claude_down["until"], "claude_note": note,
                          "deepseek": bool(CLOUD["api_key"]), "local": LOCAL["model"]}}


# ---------- модули участников ----------
# Лёша: assistant_api.py — адреса /api/assistant/...; Никита: app_api.py — адреса /api/app/...
# Пульт: pult_api.py — /api/pult/..., /api/context, /api/events.
# Модуль объявляет handle(handler, method, path, core) -> bool (True — запрос обработан).
# handler._json(obj, code) — ответ; handler._body() — JSON из тела; handler.rfile — сырые данные (файлы).
CORE = types.SimpleNamespace(ask_model=ask_model, mask=mask, unmask=unmask, audit=audit, load=_load, save=_save,
                             lock=LOCK, now=_now, user=current_user, can_see=can_see, collections=COLLECTIONS,
                             task_for=task_for,
                             mode=lambda: STATE["mode"],
                             root=ROOT, data=DATA)
MODULES = []
for _prefix, _name in (("/api/assistant/", "assistant_api"), ("/api/app/", "app_api"),
                       ("/api/pult/", "pult_api"), ("/api/context", "pult_api"), ("/api/events", "pult_api")):
    if (ROOT / (_name + ".py")).exists():
        MODULES.append((_prefix, __import__(_name)))


# ---------- HTTP ----------

STATIC_TOP = {"index.html", "connect.html", "t1", "t2", "t3", "shared", "get", "helper", "favicon.ico"}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):  # тише в консоли: только API
        if args and isinstance(args[0], str) and "/api/" in args[0]:
            sys.stderr.write("%s %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def end_headers(self):
        # ответы API не кэшируются; файлы экранов браузер хранит, но каждый раз сверяет свежесть (ответ 304 — мгновенный)
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        super().end_headers()

    def _static_ok(self, path: str) -> bool:
        """Наружу отдаются только экраны системы. Код сервера, ключи, документы и рабочие данные — нет."""
        parts = [x for x in path.split("/") if x]
        if not parts:
            return True
        if parts[0] not in STATIC_TOP or any(x.startswith(".") for x in parts):
            return False
        return not path.lower().endswith((".py", ".md", ".env", ".key", ".sh", ".bat", ".ps1", ".command"))

    def _local(self) -> bool:
        """Запрос с этого же компьютера. За обратным прокси все запросы приходят с 127.0.0.1 — там по адресу не доверяем."""
        return (not PUBLIC and not self.headers.get("X-Forwarded-For")
                and self.client_address[0] in ("127.0.0.1", "::1"))

    def do_HEAD(self):
        if not self._static_ok(self.path.split("?")[0]):
            return self._json({"error": "нет доступа"}, 403)
        return super().do_HEAD()

    def _json(self, obj, code=200):
        raw = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode())
        except ValueError:
            return {}

    def _module(self, method: str, path: str) -> bool:
        for prefix, mod in MODULES:
            if path.startswith(prefix):
                if not mod.handle(self, method, path, CORE):
                    self._json({"error": "нет такого адреса"}, 404)
                return True
        return False

    def _trusted(self) -> bool:
        """Служебные адреса (хранилище, модель, сброс, Telegram) открыты только с этого компьютера.
        С других устройств — после входа сотрудником: иначе в общей сети ими мог бы пользоваться кто угодно."""
        if self._local():
            return True
        user = current_user(self)
        if user and user.get("role") != "customer":
            return True
        audit(user["name"] if user else self.client_address[0], "служебный адрес с другого устройства",
              self.path.split("?")[0], obj="сервер", result="отказ")
        self._json({"error": "Нужно войти под учётной записью сотрудника"}, 401)
        return False

    def do_GET(self):
        path = self.path.split("?")[0]
        if not path.startswith("/api/") and path != "/ca.crt" and not self._static_ok(path):
            return self._json({"error": "нет доступа"}, 403)
        if self._module("GET", path):
            return
        if path == "/api/connect":
            return self._json(connect_info())
        if path == "/api/qr":
            import urllib.parse
            text = (urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("text") or [""])[0][:300]
            svg = qr_svg(text) if re.match(r"^https?://[\w.\-:/?=&%#]+$", text) else None
            if not svg:
                return self._json({"error": "QR недоступен: нет библиотеки segno или адрес не подходит"}, 404)
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(svg)))
            self.end_headers()
            return self.wfile.write(svg)
        if path == "/ca.crt":
            try:
                raw = (CERTS / "ca.crt").read_bytes()
            except OSError:
                return self._json({"error": "сертификат не выпущен"}, 404)
            self.send_response(200)
            self.send_header("Content-Type", "application/x-x509-ca-cert")
            self.send_header("Content-Disposition", 'attachment; filename="fotoprint-demo-ca.crt"')
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            return self.wfile.write(raw)
        if path == "/api/me":
            user = current_user(self)
            return self._json(user) if user else self._json({"error": "нужно войти"}, 401)
        if path == "/api/health":
            cloud = CLAUDE if STATE["cloud"] == "claude" else CLOUD
            if STATE["mode"] == "auto" and not cloud["api_key"]:
                cloud = CLOUD if CLOUD["api_key"] else CLAUDE
            return self._json({"ok": True, "mode": STATE["mode"], "cloud": STATE["cloud"], "cloud_key": bool(cloud["api_key"]),
                               "cloud_model": cloud["model"], "local_model": LOCAL["model"],
                               "telegram": bool(os.environ.get("TG_BOT_TOKEN") and os.environ.get("TG_CHAT_ID"))})
        if path == "/api/ai/mode":
            return self._json({"mode": STATE["mode"], "cloud": STATE["cloud"]})
        if path == "/api/gateway":
            user = current_user(self)
            if not user or user.get("role") not in ("director", "analyst"):
                audit(user["name"] if user else self.client_address[0], "попытка доступа", "ИИ-шлюз", obj=path, result="отказ")
                return self._json({"error": "ИИ-шлюз видят директор и аналитик"}, 403 if user else 401)
            return self._json(dict(GATEWAY.snapshot(), state=ai_state()))
        m = re.match(r"^/api/store/([a-z]+)$", path)
        if m:
            if not self._trusted():
                return
            if m.group(1) not in COLLECTIONS:
                return self._json({"error": "нет такой коллекции"}, 404)
            with LOCK:
                return self._json(_load(m.group(1)))
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if self._module("POST", path):
            return
        body = self._body()

        if path == "/api/login":
            token, user = login(str(body.get("login", "")), str(body.get("password", "")))
            if not token:
                audit(str(body.get("login", ""))[:40], "вход", "неверный логин или пароль", obj="сессия", result="отказ")
                return self._json({"error": "неверный логин или пароль"}, 401)
            audit(user["name"], "вход", user["title"], obj="сессия")
            return self._json({"token": token, "user": user})

        if path in ("/api/reset", "/api/ai/mode", "/api/ai", "/api/telegram") or path.startswith("/api/store/"):
            if not self._trusted():
                return

        if path == "/api/reset":
            who = current_user(self)
            if not self._local() and (not who or who.get("role") not in ("director", "analyst")):
                return self._json({"error": "Вернуть демо-данные может директор или аналитик"}, 403)
            with LOCK:
                for c in COLLECTIONS:
                    p = _path(c)
                    if p.exists():
                        p.unlink()
            return self._json({"ok": True})

        if path == "/api/ai/mode":
            mode, cloud = body.get("mode") or STATE["mode"], body.get("cloud") or STATE["cloud"]
            if mode not in ("auto", "cloud", "local", "off") or cloud not in ("claude", "deepseek"):
                return self._json({"error": "mode: auto | cloud | local | off; cloud: claude | deepseek"}, 400)
            if mode == "cloud" and cloud == "claude" and not llm_gateway.claude_ready(CLAUDE)[0]:
                return self._json({"error": "Claude не подключён: " + llm_gateway.claude_ready(CLAUDE)[1]}, 400)
            user = current_user(self)
            if user and user.get("role") != "director":           # без входа — только служебные скрипты с этого компьютера
                audit(user["name"], "попытка доступа", "переключение модели", obj="ИИ-шлюз", result="отказ")
                return self._json({"error": "Переключать модель может директор"}, 403)
            STATE["mode"], STATE["cloud"] = mode, cloud
            audit(user["name"] if user else body.get("who", "администратор"), "режим ИИ",
                  "переключён на " + ai_state()["provider"], obj="ИИ-шлюз")
            return self._json({"mode": mode, "cloud": cloud, "state": ai_state()})

        if path == "/api/ai":
            system = str(body.get("system", ""))
            user = str(body.get("user", ""))
            mapping = {}
            if body.get("mask"):
                system, user = mask(system, mapping), mask(user, mapping)
            res = ask_model(system, user, bool(body.get("json")), int(body.get("max_tokens") or 900),
                            str(body.get("task") or task_for(user)))
            if mapping and res.get("ok"):
                res["text"] = unmask(res["text"], mapping)
                if res.get("json") is not None:
                    res["json"] = json.loads(unmask(json.dumps(res["json"], ensure_ascii=False), mapping))
            res["masked"] = {"count": len(mapping), "labels": sorted(mapping.keys()),
                             "sent_preview": user[:600]} if body.get("mask") else None
            audit(body.get("who", ""), "запрос к ИИ ({})".format(res.get("provider") or STATE["mode"]),
                  (body.get("title") or user)[:200], outside=bool(res.get("outside")))
            return self._json(res)

        if path == "/api/telegram":
            token, chat = os.environ.get("TG_BOT_TOKEN"), body.get("chat_id") or os.environ.get("TG_CHAT_ID")
            if not (token and chat):
                return self._json({"ok": False, "reason": "Telegram не настроен (TG_BOT_TOKEN, TG_CHAT_ID)"})
            payload = {"chat_id": chat, "text": str(body.get("text", ""))[:3900], "parse_mode": "HTML"}
            req = urllib.request.Request("https://api.telegram.org/bot{}/sendMessage".format(token),
                                         data=json.dumps(payload).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=15) as r:
                    ok = json.loads(r.read().decode()).get("ok", False)
            except Exception as e:  # noqa: BLE001
                return self._json({"ok": False, "reason": str(e)})
            audit(body.get("who", ""), "сообщение в Telegram", str(body.get("text", ""))[:120], outside=True)
            return self._json({"ok": ok})

        m = re.match(r"^/api/store/([a-z]+)(?:/([\w-]+)(/delete)?)?$", path)
        if m and m.group(1) in COLLECTIONS:
            coll, item_id, delete = m.groups()
            with LOCK:
                items = _load(coll)
                if not item_id:
                    item = dict(body)
                    item.setdefault("id", uuid.uuid4().hex[:8])
                    item.setdefault("ts", _now())
                    items.append(item)
                    _save(coll, items)
                    return self._json(item)
                for i, it in enumerate(items):
                    if str(it.get("id")) == item_id:
                        if delete:
                            items.pop(i)
                            _save(coll, items)
                            return self._json({"ok": True})
                        it.update(body)
                        it["updated"] = _now()
                        _save(coll, items)
                        return self._json(it)
            return self._json({"error": "не найдено"}, 404)
        return self._json({"error": "нет такого адреса"}, 404)


def main():
    lan = "--lan" in sys.argv
    ports = [a for a in sys.argv[1:] if a.isdigit()]
    port = int(ports[0]) if ports else 8800
    host = "0.0.0.0" if lan else "127.0.0.1"
    DATA.mkdir(exist_ok=True)
    srv = ThreadingHTTPServer((host, port), Handler)
    NET.update(lan=lan, port=port)
    crt, key = CERTS / "server.crt", CERTS / "server.key"
    if lan and crt.exists() and key.exists():
        # второй вход — https: только по нему телефон разрешает микрофон и установку приложения на экран
        import ssl
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.load_cert_chain(str(crt), str(key))
        tls = ThreadingHTTPServer((host, HTTPS_PORT), Handler)
        tls.socket = ctx.wrap_socket(tls.socket, server_side=True)
        threading.Thread(target=tls.serve_forever, daemon=True).start()
        NET["https"] = True
    print("Space Hackathon: http://127.0.0.1:{}/  (ИИ: {}, {})".format(
        port, STATE["mode"], "; ".join("{} → {}".format(r["title"], r["provider"]) for r in ai_state()["routes"]) or ai_state()["provider"]))
    if lan:
        import socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            print("С телефона в той же Wi-Fi: http://{}:{}/t2/".format(s.getsockname()[0], port))
            s.close()
        except OSError:
            pass
        if NET["https"]:
            for a in connect_info()["addresses"]:
                print("По https (микрофон работает): {}/".format(a["base"]))
        else:
            print("https выключен: нет сертификата в {} — микрофон на телефонах работать не будет".format(CERTS))
        print("Страница подключения телефонов: http://127.0.0.1:{}/connect.html".format(port))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
