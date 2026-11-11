# -*- coding: utf-8 -*-
import json, subprocess, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
def gpu():
    return subprocess.run(["nvidia-smi", "--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()
for i in range(40):
    try:
        urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=3).read(); break
    except Exception:
        time.sleep(2)
print("модель:", json.loads(urllib.request.urlopen("http://127.0.0.1:8080/v1/models", timeout=5).read())["data"][0]["id"], "| видеопамять:", gpu())
q = {"max_tokens": 200, "temperature": 0.3, "chat_template_kwargs": {"enable_thinking": False}, "messages": [
    {"role": "system", "content": "Ты помощник руководителя типографии. Отвечай по-русски, кратко."},
    {"role": "user", "content": "Заказы в срок упали с 97 до 91 процента. На участке сборки пять вакансий и трое на больничном. Что делать в первую очередь? Три пункта."}]}
for i in range(2):
    t = time.time()
    req = urllib.request.Request("http://127.0.0.1:8080/v1/chat/completions", data=json.dumps(q).encode(), headers={"Content-Type": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=300).read()); tm = d.get("timings", {})
    print("прогон %d: %.1f с, ответ %.1f ток/с, чтение запроса %.1f ток/с, токенов %s" % (i + 1, time.time() - t, tm.get("predicted_per_second", 0), tm.get("prompt_per_second", 0), d["usage"]["completion_tokens"]))
print("ответ:", d["choices"][0]["message"]["content"][:330].replace("\n", " "))
print("видеопамять:", gpu())
