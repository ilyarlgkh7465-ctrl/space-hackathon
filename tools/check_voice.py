# -*- coding: utf-8 -*-
"""Проверка голосового помощника пульта: разговорные вопросы в том виде, как их отдаёт распознавание речи
(строчными, без знаков препинания) → ответ должен быть по делу, а не «в данных этого нет».

    python3 tools/check_voice.py [адрес сервера] [роль]      по умолчанию http://127.0.0.1:8800 и director
"""
import json
import re
import sys
import time
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8800"
ROLE = sys.argv[2] if len(sys.argv) > 2 else "director"
QUESTIONS = [
    "как дела в компании", "что сейчас требует моего внимания", "что у нас плохо", "какие проблемы на производстве",
    "что с заказами", "сколько заказов за две недели", "успеваем ли мы в срок", "почему заказы не успевают в срок",
    "что с браком", "какая у нас выручка", "какой оборот за месяц", "какой средний чек", "сколько новых клиентов",
    "что с поддержкой", "как быстро отвечает поддержка", "что с доставкой", "что с персоналом", "хватает ли людей на производстве",
    "какая у нас прибыль", "что с деньгами", "кто нам должен", "что с документами", "какие решения сейчас в работе",
    "что просрочено", "кто отвечает за сборку", "что мне сделать сегодня в первую очередь", "расскажи про приложение",
    "сколько заказов сейчас в работе", "что с повторными покупками", "привет что ты умеешь",
]
BAD = re.compile(r"(?:данных|документах)[^.]{0,40}\bнет\b|нет (?:в )?(?:доступных )?(?:данных|документах)|не могу|уточните|не наш[её]л|не понял|закрыт для вашей роли|недоступн|ПОЛ-0|политик", re.I)


def call(path, body=None, tok=None):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = "Bearer " + tok
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=h)
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


tok = call("/api/login", {"login": ROLE, "password": "demo2026"})["token"]
bad = 0
for q in QUESTIONS:
    t = time.time()
    r = call("/api/pult/ai/ask", {"question": q, "voice": True}, tok)
    text = (r.get("text") or r.get("error") or "").replace("\n", " ")
    flag = bool(BAD.search(text)) or len(text) < 25
    bad += flag
    print("%s %.1fс | %-42s | %-28s | %s" % ("✗" if flag else "✓", time.time() - t, q, (r.get("provider") or "")[:28], text[:150]))
print("\nплохих ответов: %d из %d" % (bad, len(QUESTIONS)))
sys.exit(1 if bad else 0)
