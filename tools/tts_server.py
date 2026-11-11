#!/usr/bin/env python3
"""Синтез речи для голосового чата помощника. Запускается на сервере рядом с server.py, слушает только 127.0.0.1.

Два движка, адрес один и тот же — POST /synthesize {"text": "..."} → WAV:
  silero — русский голос естественнее, сам ставит ударения и букву ё. Нужны torch (CPU) и numpy.
           Модель v4_ru.pt — с models.silero.ai. Лицензия CC BY-NC-SA 4.0: для демо, не для коммерческой работы.
  piper  — запасной: быстрее и легче, звучит проще. Нужен пакет piper-tts и голос *.onnx.

    python3 tools/tts_server.py --engine silero --model ~/fp-ai/models/v4_ru.pt --speaker aidar
    python3 tools/tts_server.py --engine piper  --model ~/fp-ai/voices/ru_RU-denis-medium.onnx

Голоса Silero v4_ru: aidar, eugene (мужские), baya, kseniya, xenia (женские).
GET / → {"ok": true, "engine": ..., "voice": ...} — по этому адресу server.py проверяет, что синтез запущен.
Текст не сохраняется и не пишется в журнал.
"""
import argparse
import io
import json
import re
import sys
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# ---------------------------------------------------------------- числа словами
# Silero не читает цифры — их нужно заранее написать словами. Piper читает сам, но так тоже не хуже.

ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать",
         "восемнадцать", "девятнадцать"]
TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"]
HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"]
SCALES = [(10 ** 9, ("миллиард", "миллиарда", "миллиардов"), False), (10 ** 6, ("миллион", "миллиона", "миллионов"), False),
          (1000, ("тысяча", "тысячи", "тысяч"), True)]
FEM_NEXT = re.compile(r"^(минут|задач|недел|встреч|тысяч|смен|строк|позици|недел|копе|единиц|штук|цел|десят|сотых)", re.I)


def plural(n, a, b, c):
    m10, m100 = n % 10, n % 100
    return a if m10 == 1 and m100 != 11 else b if 2 <= m10 <= 4 and not 12 <= m100 <= 14 else c


def _triple(n, fem):
    out = [HUNDREDS[n // 100]]
    r = n % 100
    if 10 <= r < 20:
        out.append(TEENS[r - 10])
    else:
        out += [TENS[r // 10], (ONES_F if fem else ONES_M)[r % 10]]
    return [w for w in out if w]


def words(n, fem=False):
    n = int(n)
    if n == 0:
        return "ноль"
    if n < 0:
        return "минус " + words(-n, fem)
    out = []
    for size, forms, f in SCALES:
        if n >= size:
            k, n = divmod(n, size)
            out += _triple(k, f) + [plural(k, *forms)]
    out += _triple(n, fem)
    return " ".join(out)


def decimal_words(whole, frac):
    """3,2 → «три целых две десятых»; дробная часть — до сотых."""
    w = int(whole)
    frac = frac[:2]
    f = int(frac)
    den = ("десятая", "десятых", "десятых") if len(frac) == 1 else ("сотая", "сотых", "сотых")
    return "{} {} {} {}".format(words(w, True), plural(w, "целая", "целых", "целых"), words(f, True), plural(f, *den))


def numbers_to_words(text):
    text = re.sub(r"(?<=\d)[   ](?=\d{3}\b)", "", text)            # 211 800 → 211800
    text = re.sub(r"\b(\d+),(\d+)\b", lambda m: decimal_words(m.group(1), m.group(2)), text)
    def one(m):
        before = re.findall(r"[А-Яа-яЁё]+", text[max(0, m.start() - 25):m.start()])     # «задач: 2» — род по слову перед числом
        fem = bool(FEM_NEXT.match(m.group(3))) or (bool(before) and bool(FEM_NEXT.match(before[-1])) and not m.group(3)[:1].isalpha())
        return words(m.group(1), fem) + m.group(2) + m.group(3)
    return re.sub(r"\b(\d+)\b(\s*)(\S*)", one, text)


# ---------------------------------------------------------------- движки

class Silero:
    def __init__(self, model, speaker, threads):
        import torch
        torch.set_num_threads(threads)
        self.torch = torch
        self.model = torch.package.PackageImporter(str(model)).load_pickle("tts_models", "model")
        self.model.to(torch.device("cpu"))
        self.speaker, self.rate, self.lock = speaker, 48000, threading.Lock()
        self.voice = "silero:" + speaker

    def wav(self, text, opts):
        text = numbers_to_words(text)
        text = re.sub(r"[A-Za-z]+", "", text)                                   # латиницу Silero не читает
        parts = [p for p in re.findall(r"[^.!?…]+[.!?…]*", text) if p.strip()] or [text]
        chunks = []
        with self.lock:                                                          # модель не любит параллельные вызовы
            for p in parts:
                a = self.model.apply_tts(text=p.strip()[:900], speaker=opts.get("speaker") or self.speaker, sample_rate=self.rate,
                                         put_accent=True, put_yo=True)
                chunks.append(a)
        audio = self.torch.cat(chunks) if len(chunks) > 1 else chunks[0]
        pcm = (audio.clamp(-1, 1) * 32767).to(self.torch.int16).numpy().tobytes()
        return to_wav(pcm, self.rate)


class Piper:
    def __init__(self, model, espeak_dir):
        from piper import PiperVoice
        kw = {"espeak_data_dir": espeak_dir} if espeak_dir else {}
        self.v = PiperVoice.load(str(model), **kw)
        self.voice = "piper:" + Path(model).stem

    def wav(self, text, opts):
        from piper import SynthesisConfig
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            self.v.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=float(opts.get("length_scale") or 1.0)))
        return buf.getvalue()


def to_wav(pcm, rate):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


# ---------------------------------------------------------------- HTTP

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", choices=("silero", "piper"), default="silero")
    ap.add_argument("--model", required=True, help="silero: путь к v4_ru.pt; piper: путь к голосу .onnx")
    ap.add_argument("--speaker", default="aidar", help="голос Silero (aidar, eugene, baya, kseniya, xenia)")
    ap.add_argument("--espeak-dir", default=None, help="piper: папка espeak-ng-data, если стандартная не находится")
    ap.add_argument("--threads", type=int, default=4, help="silero: потоков процессора")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5050)
    a = ap.parse_args()
    eng = Silero(a.model, a.speaker, a.threads) if a.engine == "silero" else Piper(a.model, a.espeak_dir)
    eng.wav("Проверка.", {})                                                   # прогрев: первый запрос не будет медленным

    class H(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code, ctype, raw):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            self._send(200, "application/json", json.dumps({"ok": True, "engine": a.engine, "voice": eng.voice}).encode())

        def do_POST(self):
            if self.path.rstrip("/") != "/synthesize":
                return self._send(404, "application/json", b'{"error": "not found"}')
            try:
                d = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                text = str(d.get("text") or "").strip()[:1500]
                if not text:
                    return self._send(400, "application/json", b'{"error": "no text"}')
                self._send(200, "audio/wav", eng.wav(text, d))
            except Exception as e:                                               # noqa: BLE001 — ответить ошибкой, а не уронить сервис
                self._send(500, "application/json", json.dumps({"error": type(e).__name__}).encode())

    print("Синтез речи: {} ({}) на http://{}:{}".format(a.engine, eng.voice, a.host, a.port), flush=True)
    ThreadingHTTPServer((a.host, a.port), H).serve_forever()


if __name__ == "__main__":
    sys.exit(main())
