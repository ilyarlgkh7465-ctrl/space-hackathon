#!/usr/bin/env python3
"""Проверка помощника (трек 3) по эталону data/eval/control.json. Только стандартная библиотека.

    python3 server.py &                      # сервер должен быть запущен
    python3 tools/eval_assistant.py          # http://127.0.0.1:8800 по умолчанию
    python3 tools/eval_assistant.py --url http://127.0.0.1:8801 --md   # итог в формате Markdown для docs/Тестирование.md

Что проверяется:
  1. Протокол: доля найденных явных задач (критерий приёмки — не меньше 80 %), владелец, срок, статусы пунктов.
  2. Контрольные вопросы: правильный пункт в ссылках, дата источника, «не найдено» без основания, отказ по зарплатам.
  3. Права: закрытый документ другой роли → 403 и запись «отказ» в журнале.
Скрипт ничего не меняет в данных, кроме журнала действий.
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLD = json.loads((ROOT / "data" / "eval" / "control.json").read_text(encoding="utf-8"))
PASSWORD = next(u["password"] for u in json.loads((ROOT / "data" / "seed" / "users.json").read_text(encoding="utf-8")))


def call(url, path, token=None, body=None):
    req = urllib.request.Request(url + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers=dict({"Content-Type": "application/json"}, **({"Authorization": "Bearer " + token} if token else {})),
                                 method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def stems(s):
    return {w[:5] for w in re.findall(r"[а-яёa-z0-9]+", s.lower().replace("ё", "е")) if len(w) > 3}


def match_tasks(gold, pred):
    """Задача найдена, если совпал владелец (или оба без владельца) и реплика рядом либо формулировка пересекается."""
    used, rows = set(), []
    for g in gold:
        best = None
        for j, p in enumerate(pred):
            if j in used or p.get("owner") != g["owner"]:
                continue
            near = p.get("line") is not None and abs(p["line"] - g["line"]) <= 1
            overlap = len(stems(g["text"]) & stems(p["title"])) / max(1, len(stems(g["text"])))
            if near or overlap >= 0.3:
                best = j
                break
        if best is not None:
            used.add(best)
        rows.append((g, pred[best] if best is not None else None))
    extra = [p for j, p in enumerate(pred) if j not in used]
    return rows, extra


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8800")
    ap.add_argument("--md", action="store_true")
    a = ap.parse_args()
    url = a.url.rstrip("/")
    tokens = {}

    def tok(login):
        if login not in tokens:
            code, r = call(url, "/api/login", body={"login": login, "password": PASSWORD})
            if code != 200:
                sys.exit("не удалось войти как {}: {}".format(login, r))
            tokens[login] = r["token"]
        return tokens[login]

    out = []
    _, health = call(url, "/api/health")
    out.append("Режим ИИ: **{}**{}".format(health.get("mode"), " (модель {})".format(health.get("cloud_model")) if health.get("mode") == "cloud" else ""))

    # ---- 1. протоколы
    out.append("\n### Протоколы по расшифровкам\n")
    out.append("| Расшифровка | Явных задач | Найдено | Доля | Владелец верно | Срок верно | Лишние | Источник |")
    out.append("|---|---|---|---|---|---|---|---|")
    total_g = total_f = 0
    details = []
    after_table = []
    meeting_of = {"tr-1": "mt-1", "tr-2": "mt-2", "tr-3": "mt-3"}
    for tr, g in GOLD["transcripts"].items():
        code, p = call(url, "/api/assistant/protocol", tok("director"), {"meeting_id": meeting_of[tr]})
        if code != 200:
            out.append("| {} | ошибка {} | | | | | | |".format(tr, code))
            continue
        rows, extra = match_tasks(g["tasks"], p["tasks"])
        found = [r for r in rows if r[1]]
        due_ok = sum(1 for gg, pp in found if pp.get("due") == gg["due"])
        total_g += len(rows)
        total_f += len(found)
        out.append("| {}{} | {} | {} | {:.0f} % | {} | {} | {} | {} |".format(
            tr, " (контрольная)" if tr == "tr-1" else "", len(rows), len(found), 100 * len(found) / max(1, len(rows)),
            len(found), due_ok, len(extra), p.get("provider")))
        for gg, pp in rows:
            details.append("- {} · {} · {} → {}".format(tr, gg["owner"] or "без владельца", gg["text"],
                                                       "найдено: «{}», срок {}".format(pp["title"], pp.get("due") or "—") if pp else "**не найдено**"))
        if g.get("points"):
            ok = 0
            for gp in g["points"]:
                near = sorted((x for x in p["points"] if x.get("line") is not None and abs(x["line"] - gp["line"]) <= 1),
                              key=lambda x: abs(x["line"] - gp["line"]))
                hit = near[0] if near else None
                ok += 1 if hit and hit["status"] == gp["status"] else 0
                details.append("- {} · пункт [{}] «{}» → {}".format(tr, gp["status"], gp["text"], "[{}] «{}»".format(hit["status"], hit["text"]) if hit else "**не найден**"))
            after_table.append("Статусы пунктов протокола {}: верно {} из {}.".format(tr, ok, len(g["points"])))
    share = 100 * total_f / max(1, total_g)
    out.append("\n" + "\n".join(after_table))
    out.append("\n**Итого найдено явных задач: {} из {} ({:.0f} %). Критерий ТЗ — не меньше 80 %: {}.**".format(
        total_f, total_g, share, "выполнен" if share >= 80 else "НЕ выполнен"))

    # ---- 2. вопросы
    out.append("\n### Контрольные вопросы по документам\n")
    out.append("| Роль | Вопрос | Ожидается | Ответ помощника | Итог |")
    out.append("|---|---|---|---|---|")
    passed = 0
    for q in GOLD["questions"]:
        code, r = call(url, "/api/assistant/ask", tok(q["login"]), {"q": q["q"]})
        cites = ["{}:{}".format(c["doc"], c["n"]) for c in r.get("cites", [])]
        dated = all(c.get("date") for c in r.get("cites", []))
        if q.get("salary"):
            ok = bool(r.get("refused")) and not re.search(r"\d[\d\s]*BYN", r.get("answer", ""))
            exp = "отказ: зарплаты"
        elif q["expect"]:
            ok = r.get("found") and any(c in cites for c in q["expect"]) and dated
            exp = ", ".join(q["expect"])
        else:
            ok = not r.get("found") and not any(c.split(":")[0] in q.get("closed", []) for c in cites)
            exp = "не найдено" + (" (закрыто: {})".format(", ".join(q["closed"])) if q.get("closed") else "")
        passed += 1 if ok else 0
        ans = re.sub(r"\s+", " ", r.get("answer", ""))[:110]
        out.append("| {} | {} | {} | {} {} | {} |".format(q["login"], q["q"], exp, ans, "[{}]".format(", ".join(cites)) if cites else "",
                                                       "✅" if ok else "❌"))
    out.append("\n**Контрольные вопросы: {} из {}.**".format(passed, len(GOLD["questions"])))

    # ---- 3. права
    out.append("\n### Права доступа\n")
    checks = []
    code, _ = call(url, "/api/assistant/docs/d10", tok("operator"))
    checks.append(("Мастер участка открывает «Штатное расписание» (ШР-01)", code == 403))
    code, _ = call(url, "/api/assistant/docs/d15", tok("production"))
    checks.append(("Руководитель производства открывает финансовый отчёт (ОТ-Q3)", code == 403))
    code, _ = call(url, "/api/assistant/meetings/mt-1", tok("quality"))
    checks.append(("Контролёр качества открывает планёрку руководителей", code == 403))
    code, _ = call(url, "/api/assistant/docs")
    checks.append(("Запрос без входа", code == 401))
    code, au = call(url, "/api/assistant/audit", tok("director"))
    refusals = [x for x in au.get("items", []) if x.get("result") == "отказ"]
    checks.append(("Отказы записаны в журнал с результатом «отказ» (не меньше 3)", len(refusals) >= 3))
    for name, ok in checks:
        out.append("- {} → {}".format(name, "✅" if ok else "❌"))
    out.append("\n<details><summary>Подробно по задачам и пунктам</summary>\n\n" + "\n".join(details) + "\n\n</details>")

    print("\n".join(out) if a.md else re.sub(r"\*\*|<[^>]+>", "", "\n".join(out)))
    return 0 if share >= 80 and all(ok for _, ok in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
