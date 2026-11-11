"""Проверка: подключена ли настоящая модель к приложению picPac (трек 2).

    python tools/check_app_ai.py                    # сервер на http://127.0.0.1:8800
    python tools/check_app_ai.py http://IP:8800 --expect-model

Прогоняет через работающий сервер обе функции приложения, которые используют модель:
  1) ответ помощника в поддержке (POST /api/app/support),
  2) правка макета альбома фразой (POST /api/app/ai/layout).
В ответе каждой есть поле mode: "model" — отвечала модель, "rules" — сработал запасной вариант без модели.
С флагом --expect-model скрипт завершается с ошибкой, если хоть одна функция ответила без модели.
Данные для проверки создаются под гостем и удаляются в конце. Только стандартная библиотека."""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:8800").rstrip("/")
EXPECT = "--expect-model" in sys.argv


def call(method, path, body=None, token=None, headers=None, timeout=70):
    req = urllib.request.Request(BASE + path, data=json.dumps(body or {}).encode() if method == "POST" else None, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    st, health = call("GET", "/api/health")
    if st != 200:
        print("Сервер не отвечает на", BASE)
        return 2
    print("Режим сервера: %s (локальная модель: %s, облачный ключ: %s)" % (
        health.get("mode"), health.get("local_model"), "есть" if health.get("cloud_key") else "нет"))
    if health.get("mode") == "off":
        print("Модель выключена: приложение отвечает по правилам. Включить: запуск с AI_MODE=local (или cloud) — см. docs/ИИ в приложении.md")

    tok = call("POST", "/api/app/guest")[1]["token"]
    results = []
    try:
        order = {"items": [{"product": "magnet", "variant": "10x10", "qty": 2}], "delivery": {"id": "pickup", "point": "center"},
                 "contact": {"name": "Проверка", "phone": "+375 29 000-00-00"}}
        st, o = call("POST", "/api/app/orders", order, tok, {"Idempotency-Key": "chk-%d" % time.time()})
        if st != 201:
            print("Не удалось создать тестовый заказ:", o)
            return 2
        t0 = time.time()
        st, r = call("POST", "/api/app/support", {"order_id": o["id"], "text": "Когда будет готов мой заказ и где его забрать?"}, tok)
        bot = [m for m in r.get("messages", []) if m.get("from") == "bot"]
        results.append(("Ответ в поддержке", bot[0]["mode"] if bot else "—", time.time() - t0, bot[0]["text"] if bot else str(r)))

        photos = [{"id": "p%d" % i, "name": "кадр %d" % i, "w": 3000, "h": 4000, "blur": i == 2, "dark": i == 3, "dup": False} for i in range(8)]
        layout = [["p%d" % (2 * i), "p%d" % (2 * i + 1)] for i in range(4)]
        t0 = time.time()
        st, r = call("POST", "/api/app/ai/layout", {"instruction": "Убери размытые кадры, а страницу 4 поставь первой", "layout": layout, "photos": photos}, tok)
        results.append(("Правка макета", r.get("mode", "—"), time.time() - t0, r.get("say", str(r))))
    finally:
        call("POST", "/api/app/account/delete", {"confirm": True}, tok)

    bad = 0
    print("\n%-22s %-7s %-8s %s" % ("Функция", "Режим", "Время", "Ответ"))
    for name, mode, sec, text in results:
        flag = "ok" if mode == "model" else ("НЕТ МОДЕЛИ" if EXPECT else "")
        bad += mode != "model"
        print("%-22s %-7s %5.1f с  %s  %s" % (name, mode, sec, text[:110].replace("\n", " "), flag))
    if EXPECT and bad:
        print("\nМодель не отвечает хотя бы в одной функции. Проверьте: режим сервера, адрес модели (LOCAL_LLM_URL), что llama-server запущен.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
