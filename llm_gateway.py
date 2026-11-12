"""ИИ-шлюз: единственная точка, через которую система обращается к языковым моделям.

Ни пульт, ни приложение, ни помощник не ходят к модели напрямую — только через server.ask_model, а он — через этот шлюз.
Шлюз намеренно простой. Что он делает с каждым запросом:
  1. выбирает, куда запрос уйдёт: локальная модель на этом компьютере или облако (Claude / DeepSeek);
  2. перед отправкой в облако ещё раз ищет телефоны, почту и УНП и заменяет их метками (вторая линия после маскирования
     в модулях); ответ возвращается с подставленными обратно значениями;
  3. не пропускает слишком большие запросы и слишком частые обращения;
  4. помечает запросы с признаками подмены инструкций («игнорируй правила…»);
  5. пишет журнал: когда, какая модель, наружу или нет, сколько значений скрыто, сколько длился запрос.
     Сам текст запроса и ответа в журнал шлюза не попадает.

Облачная модель Claude вызывается через официальную библиотеку anthropic (pip install anthropic).
Без библиотеки или без ключа сервер работает как раньше — на локальной модели, DeepSeek или встроенной логике.
"""
import json
import os
import re
import threading
import time
from collections import deque

MAX_CHARS = 60000            # больше — не отправляем: в запросе не должно быть целых баз
PER_MINUTE = 60              # обращений к моделям в минуту на весь сервер
PER_DAY = int(os.environ.get("FP_AI_PER_DAY", "0"))   # обращений в сутки (0 — без ограничения); на открытом стенде бережёт ключи
PLACEHOLDER = re.compile(r"\[(?:ТЕЛЕФОН|ПОЧТА|УНП|СУММА|ФИО)_\d+\]|\[ШЛЮЗ_[А-Я]+_\d+\]")
INJECTION = re.compile(r"игнорируй (?:все |предыдущ)|забудь (?:все|предыдущ)|ignore (?:all|previous)|system prompt|ты теперь ", re.I)
STRICT = ("ТЕЛЕФОН", "ПОЧТА", "УНП")        # что шлюз скрывает сам; имена и суммы маскируют модули — им виднее контекст
RULES = [
    "Все обращения к моделям идут через одну точку — напрямую к модели не ходит ни один экран",
    "В облако не уходят телефоны, почта и УНП: шлюз заменяет их метками и возвращает на место в ответе",
    "Запрос больше %d знаков и больше %d обращений в минуту не пропускаются" % (MAX_CHARS, PER_MINUTE),
    "Попытки подменить инструкции помечаются в журнале",
    "В журнале шлюза — только счётчики и время, без текста запросов и ответов",
    "Модель выбирается по задаче: вопросы о финансах — только локальная модель, в облако они не уходят",
]


class Gateway:
    def __init__(self, path, mask_rules, now):
        self.path, self.rules, self.now = path, [(l, rx) for l, rx in mask_rules if l in STRICT], now
        self.lock = threading.Lock()
        self.recent = deque()
        self.totals = {"calls": 0, "outside": 0, "local": 0, "blocked": 0, "hidden": 0, "auto_hidden": 0, "flagged": 0, "failed": 0}
        self.last = deque(maxlen=40)
        self.day = ["", 0]
        try:
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.totals.update(saved.get("totals", {}))
            self.last.extend(saved.get("last", []))
        except (OSError, ValueError):
            pass

    def _hide(self, text, mapping):
        for label, rx in self.rules:
            def repl(m, label=label):
                val = m.group(0)
                for k, v in mapping.items():
                    if v == val:
                        return k
                key = "[ШЛЮЗ_%s_%d]" % (label, sum(1 for k in mapping if k.startswith("[ШЛЮЗ_" + label)) + 1)
                mapping[key] = val
                return key
            text = rx.sub(repl, text)
        return text

    def _record(self, entry):
        with self.lock:
            t = self.totals
            t["calls"] += 1
            t["outside" if entry["outside"] else "local"] += 1
            t["hidden"] += entry["hidden"]
            t["auto_hidden"] += entry["auto_hidden"]
            t["flagged"] += 1 if entry["flagged"] else 0
            if entry["blocked"]:
                t["blocked"] += 1
            elif not entry["ok"]:
                t["failed"] += 1
            self.last.appendleft(entry)
            try:
                self.path.write_text(json.dumps({"totals": t, "last": list(self.last)}, ensure_ascii=False), encoding="utf-8")
            except OSError:
                pass

    def call(self, prov, system, user, want_json, max_tokens, send):
        """prov: {name, model, outside}; send(system, user, want_json, max_tokens) -> dict ответа модели."""
        text = system + "\n" + user
        entry = {"ts": self.now(), "provider": prov["name"], "model": prov["model"], "outside": bool(prov["outside"]),
                 "task": prov.get("task", ""),
                 "chars_in": len(text), "chars_out": 0, "hidden": len(set(PLACEHOLDER.findall(text))), "auto_hidden": 0,
                 "flagged": bool(INJECTION.search(user)), "blocked": "", "ok": False, "ms": 0}
        with self.lock:
            t = time.time()
            while self.recent and t - self.recent[0] > 60:
                self.recent.popleft()
            busy = len(self.recent) >= PER_MINUTE
            today = time.strftime("%Y-%m-%d")
            if self.day[0] != today:
                self.day = [today, 0]
            over = bool(PER_DAY) and self.day[1] >= PER_DAY
            if not busy and not over:
                self.recent.append(t)
                self.day[1] += 1
        if len(text) > MAX_CHARS:
            entry["blocked"] = "запрос больше %d знаков" % MAX_CHARS
        elif busy:
            entry["blocked"] = "больше %d обращений в минуту" % PER_MINUTE
        elif over:
            entry["blocked"] = "больше %d обращений в сутки" % PER_DAY
        if entry["blocked"]:
            self._record(entry)
            return {"ok": False, "reason": "ИИ-шлюз не пропустил запрос: " + entry["blocked"], "gateway": "blocked"}
        mapping = {}
        if prov["outside"]:
            system, user = self._hide(system, mapping), self._hide(user, mapping)
            entry["auto_hidden"] = len(mapping)
            entry["hidden"] += len(mapping)
            if entry["hidden"]:
                # иначе модель отвечает «значение скрыто, назвать не могу»: метки вернутся настоящими значениями в ответе
                system += ("\nВ тексте есть метки в квадратных скобках вида [СУММА_1], [ФИО_2], [ТЕЛЕФОН_1] — это настоящие значения, "
                           "скрытые при передаче. Используй метки в ответе как обычные значения, без оговорок о том, что они скрыты: "
                           "пользователь увидит на их месте исходные данные.")
        t0 = time.time()
        try:
            res = send(system, user, want_json, max_tokens)
        except Exception as e:                           # noqa: BLE001 — шлюз не должен ронять сервер из-за модели
            res = {"ok": False, "reason": "%s: %s" % (prov["name"], e)}
        entry["ms"] = int((time.time() - t0) * 1000)
        entry["ok"] = bool(res.get("ok"))
        if mapping and res.get("text"):
            for k, v in mapping.items():
                res["text"] = res["text"].replace(k, v)
            if res.get("json") is not None:
                raw = json.dumps(res["json"], ensure_ascii=False)
                for k, v in mapping.items():
                    raw = raw.replace(k, json.dumps(v, ensure_ascii=False)[1:-1])
                res["json"] = json.loads(raw)
        entry["chars_out"] = len(res.get("text") or "")
        self._record(entry)
        res["gateway"] = {"hidden": entry["hidden"], "auto_hidden": entry["auto_hidden"], "flagged": entry["flagged"]}
        return res

    def note(self, task, why):
        """Запрос, который шлюз никуда не отправил (например, финансы без локальной модели): виден в журнале."""
        self._record({"ts": self.now(), "provider": "встроенная логика", "model": "", "outside": False, "task": task,
                      "chars_in": 0, "chars_out": 0, "hidden": 0, "auto_hidden": 0, "flagged": False, "blocked": "",
                      "kept": why, "ok": True, "ms": 0})

    def snapshot(self):
        with self.lock:
            return {"rules": RULES, "totals": dict(self.totals), "last": list(self.last)[:20],
                    "limits": {"max_chars": MAX_CHARS, "per_minute": PER_MINUTE}}


# ---------------------------------------------------------------- облачная модель Claude

_clients = {}


def claude_ready(cfg):
    """Можно ли звать Claude: есть ключ и установлена библиотека."""
    if not cfg.get("api_key"):
        return False, "нет ключа Claude (CLAUDE_API_KEY в файле .env)"
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False, "не установлена библиотека anthropic (pip install anthropic)"
    return True, ""


def ask_claude(cfg, system, user, want_json, max_tokens):
    """Один запрос к Claude. cfg: {name, api_key, base_url, model}. Ответ — в том же виде, что у остальных моделей."""
    ok, why = claude_ready(cfg)
    if not ok:
        return {"ok": False, "reason": why}
    import anthropic

    key = (cfg["api_key"], cfg["base_url"])
    if key not in _clients:
        # адрес задаём явно: общий ANTHROPIC_BASE_URL из окружения компьютера сюда попасть не должен
        _clients[key] = anthropic.Anthropic(api_key=cfg["api_key"], base_url=cfg["base_url"], timeout=120.0, max_retries=1)
    client = _clients[key]
    if want_json:
        system += "\nВерни только JSON-объект, без пояснений и без ограждения ```."
    params = dict(model=cfg["model"], max_tokens=16000, system=system, messages=[{"role": "user", "content": user}],
                  # короткие ответы помощника — на низком уровне усилий (быстрее), большие разборы — на среднем
                  output_config={"effort": "low" if max_tokens < 1500 else "medium"})
    t0 = time.time()
    try:
        if cfg.get("official"):
            # отказ модели по правилам безопасности не обрывает ответ: запрос сам уходит на запасную модель
            resp = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **params)
        else:
            resp = client.messages.create(**params)       # адрес-посредник может не знать параметр fallbacks
    except anthropic.AuthenticationError:
        return {"ok": False, "reason": "Claude: ключ не принят"}
    except anthropic.PermissionDeniedError:
        return {"ok": False, "reason": "Claude: доступ запрещён (ключ без прав или регион не обслуживается)"}
    except anthropic.NotFoundError:
        return {"ok": False, "reason": "Claude: нет модели %s по этому адресу" % cfg["model"]}
    except anthropic.RateLimitError:
        return {"ok": False, "reason": "Claude: превышен лимит запросов, повторите через минуту"}
    except anthropic.APIStatusError as e:
        return {"ok": False, "reason": "Claude ответил %s: %s" % (e.status_code, str(e.message)[:160])}
    except anthropic.APIConnectionError:
        return {"ok": False, "reason": "Claude недоступен: нет связи с %s" % cfg["base_url"]}
    if resp.stop_reason == "refusal":
        return {"ok": False, "reason": "Claude отказался отвечать на этот запрос"}
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    out = {"ok": bool(text), "text": text, "provider": cfg["name"], "model": resp.model,
           "ms": int((time.time() - t0) * 1000), "outside": True}
    if want_json and text:
        try:
            out["json"] = json.loads(re.sub(r"^```(?:json)?|```$", "", text.strip()).strip())
        except ValueError:
            out["json"] = None
    return out
