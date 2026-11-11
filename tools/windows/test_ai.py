# -*- coding: utf-8 -*-
"""Проверка локального ИИ: модель, синтез, распознавание, наш сервер. Только стандартная библиотека."""
import io, json, os, subprocess, sys, time, urllib.request, uuid, wave, glob
sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\fp-ai"

def post(url, data, headers=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers=headers or {"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def gpu():
    try:
        return subprocess.run(["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()
    except Exception as e:
        return str(e)

print("видеопамять до:", gpu())
# 1. модель
q = {"model": "qwen3-4b", "max_tokens": 220, "temperature": 0.3, "messages": [
    {"role": "system", "content": "Ты помощник руководителя типографии. Отвечай по-русски, кратко."},
    {"role": "user", "content": "Заказы в срок упали с 97 до 91 процента. На участке сборки пять вакансий и трое на больничном. Что делать в первую очередь? Три пункта."}]}
for i in range(2):
    t = time.time(); d = json.loads(post("http://127.0.0.1:8080/v1/chat/completions", json.dumps(q).encode()))
    msg = d["choices"][0]["message"]; tm = d.get("timings", {})
    print("модель, прогон %d: %.1f с, %s ток/с (ответ), %s ток/с (чтение запроса), токенов ответа %s" % (
        i + 1, time.time() - t, round(tm.get("predicted_per_second", 0), 1), round(tm.get("prompt_per_second", 0), 1), d.get("usage", {}).get("completion_tokens")))
print("ответ модели:", (msg.get("content") or "")[:420].replace("\n", " "))
print("есть ли «размышления»:", bool(msg.get("reasoning_content")), "| <think> в тексте:", "<think>" in (msg.get("content") or ""))
print("видеопамять после модели:", gpu())

# 2. синтез
phrase = "Добрый день! Я помощник компании Фотопринт. Требуют решения пять показателей."
t = time.time(); wav = post("http://127.0.0.1:5050/synthesize", json.dumps({"text": phrase}).encode()); ts = time.time() - t
w = wave.open(io.BytesIO(wav)); dur = w.getnframes() / w.getframerate()
open(ROOT + r"\logs\test.wav", "wb").write(wav)
print("синтез: %.2f с на %.2f с звука (%d Гц)" % (ts, dur, w.getframerate()))

# 3. распознавание (16 кГц моно через ffmpeg)
ff = glob.glob(ROOT + r"\ffmpeg\*\bin\ffmpeg.exe")[0]
subprocess.run([ff, "-y", "-loglevel", "error", "-i", ROOT + r"\logs\test.wav", "-ar", "16000", "-ac", "1", ROOT + r"\logs\test16.wav"], check=True)
audio = open(ROOT + r"\logs\test16.wav", "rb").read()
b = uuid.uuid4().hex
body = (("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"t.wav\"\r\nContent-Type: audio/wav\r\n\r\n" % b).encode() + audio +
        ("\r\n--%s\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n--%s--\r\n" % (b, b)).encode())
for i in range(2):
    t = time.time(); r = json.loads(post("http://127.0.0.1:8090/inference", body, {"Content-Type": "multipart/form-data; boundary=" + b})); tr = time.time() - t
    print("распознавание, прогон %d: %.2f с на %.2f с речи → %s" % (i + 1, tr, dur, (r.get("text") or "").strip()))

# 4. наш сервер
h = json.loads(urllib.request.urlopen("http://127.0.0.1:8800/api/health", timeout=10).read()); print("сервер:", h)
tok = json.loads(post("http://127.0.0.1:8800/api/login", json.dumps({"login": "director", "password": "demo2026"}).encode()))["token"]
H = {"Content-Type": "application/json", "Authorization": "Bearer " + tok}
t = time.time(); a = json.loads(post("http://127.0.0.1:8800/api/pult/ask", json.dumps({"question": "Почему упали заказы в срок и что делать?", "days": 14}).encode(), H))
print("помощник пульта: %.1f с, %s, замаскировано %s" % (time.time() - t, a.get("provider"), a.get("masked")))
print("  ", (a.get("text") or "")[:500].replace("\n", " "))
try:
    v = json.loads(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8800/api/assistant/voice/status", headers=H), timeout=10).read()); print("голос помощника:", v)
except Exception as e:
    print("голос помощника: ошибка", e)
print("видеопамять в конце:", gpu())
