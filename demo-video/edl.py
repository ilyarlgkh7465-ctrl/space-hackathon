# -*- coding: utf-8 -*-
"""Монтажный лист демо-ролика «Фотопринт» (53 с, 1920×1080, 60 к/с).

Время ролика → время снятой сцены задаётся кусками (T0, T1, s0, s1): ожидания ответа модели сжимаются, действия идут ровно.
Сетка — 120 ударов в минуту, такт 2 с: смены сцен стоят на сильных долях (4, 16, 24, 36, 48).

    python edl.py        → edl.json (читают comp.html, render.mjs, music.py)
"""
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = Path(os.environ.get("WORK", HERE / "work"))
FPS, W, H = 60, 1920, 1080
DUR = 53.0
HITS = {"logo": 2.0, "pulse": 4.0, "gate": 16.0, "helper": 24.0, "app": 36.0, "finale": 48.0}


def shot(name):
    return json.loads((WORK / "shots" / name / "shot.json").read_text(encoding="utf-8"))


def ev(s, kind, n=0, default=None):
    xs = [e for e in s["events"] if e["type"] == kind]
    return xs[n]["t"] if len(xs) > n else default


def pieces_inverse(pieces, ts):
    """время сцены → время ролика (None, если этот момент вырезан)"""
    for T0, T1, s0, s1 in pieces:
        if s0 <= ts <= s1 and s1 > s0:
            return T0 + (ts - s0) / (s1 - s0) * (T1 - T0)
    return None


def build():
    P, G, Hh, A = shot("pulse"), shot("gate"), shot("helper"), shot("app")

    # 1. пульт: один к одному, последняя секунда — стоп-кадр
    pulse = [(4.0, 4.0 + P["dur"] - 0.05, 0.0, P["dur"] - 0.05), (4.0 + P["dur"] - 0.05, 16.0, P["dur"] - 0.05, P["dur"] - 0.05)]
    # 2. шлюз: схема 16–19.6, настоящий экран 19.6–24
    gate = [(19.4, 24.0, 0.9, min(G["dur"] - 0.05, 8.0))]
    # 3. помощник
    ask, ans = ev(Hh, "ask"), ev(Hh, "answer")
    meet, fin, rep = ev(Hh, "meet"), ev(Hh, "finish"), ev(Hh, "report")
    helper = [
        (24.0, 26.0, 0.7, ask + 0.25),
        (26.0, 26.7, ask + 0.25, ans),
        (26.7, 28.6, ans, ans + 2.3),
        (28.6, 31.7, meet - 0.15, fin + 0.1),
        (31.7, 32.4, fin + 0.1, rep),
        (32.4, 36.0, rep, min(Hh["dur"] - 0.05, rep + 5.6)),
    ]
    # 4. приложение
    ch, home, demo = ev(A, "choose"), ev(A, "home"), ev(A, "demo")
    checked, dropped, cart, done = ev(A, "checked"), ev(A, "dropped"), ev(A, "cart"), ev(A, "done")
    app = [
        (36.0, 37.7, max(0.0, ch - 1.2), ch + 1.2),
        (37.7, 39.5, home - 0.05, demo + 0.1),
        (39.5, 40.1, demo + 0.1, checked),
        (40.1, 41.6, checked, dropped + 1.0),
        (41.6, 43.4, dropped + 1.0, done),
        (43.4, 48.0, done, A["dur"] - 0.05),
    ]
    scenes = {"pulse": pulse, "gate": gate, "helper": helper, "app": app}

    def marks(s, pcs, kinds):
        out = []
        for e in s["events"]:
            if e["type"] in kinds:
                T = pieces_inverse(pcs, e["t"])
                if T is not None:
                    out.append(dict(e, T=round(T, 3), Tend=round(pieces_inverse(pcs, e["t"] + e.get("dur", 0)) or T, 3)))
        return out

    cursor = {"pulse": marks(P, pulse, ("move", "click")), "gate": marks(G, gate, ("move", "click"))}
    taps = {"helper": marks(Hh, helper, ("tap",)), "app": marks(A, app, ("tap",))}

    # камера внутри окна браузера: (время ролика, x, y страницы в центре, приближение)
    cams = {
        "pulse": [(4.0, 720, 450, 1.0), (6.5, 720, 450, 1.0), (8.1, 960, 600, 1.5), (9.3, 960, 600, 1.5), (10.7, 944, 330, 1.42),
                  (12.0, 944, 330, 1.42), (13.3, 960, 560, 1.62), (14.6, 960, 560, 1.62), (15.7, 950, 590, 1.45)],
        "gate": [(19.4, 842, 440, 1.12), (20.1, 842, 440, 1.12), (21.0, 842, 500, 1.27), (21.5, 842, 500, 1.27), (22.8, 842, 560, 1.27), (24.0, 842, 600, 1.27)],
    }
    captions = [
        # (с, по, подпись-рубрика, текст)
        (4.3, 6.5, "01 · Пульт руководителя", "Вся компания — на одном экране"),
        (6.7, 9.6, "01 · Пульт руководителя", "Навели на сферу — раскрылись показатели и задачи"),
        (9.8, 15.8, "01 · Пульт руководителя", "От отклонения — к причине и решению"),
        (19.7, 23.8, "02 · ИИ-шлюз", "Что ушло в облако и что скрыто — видно в журнале"),
    ]
    clicks = sorted([m["T"] for k in cursor.values() for m in k if m["type"] == "click"] + [m["T"] for k in taps.values() for m in k])
    return {"fps": FPS, "W": W, "H": H, "dur": DUR, "hits": HITS, "scenes": scenes, "cursor": cursor, "taps": taps, "cams": cams,
            "captions": captions, "clicks": clicks,
            "shots": {n: {"w": s["w"], "h": s["h"], "frames": s["frames"]} for n, s in (("pulse", P), ("gate", G), ("helper", Hh), ("app", A))}}


if __name__ == "__main__":
    E = build()
    (HERE / "edl.json").write_text(json.dumps(E, ensure_ascii=False), encoding="utf-8")
    for n, pcs in E["scenes"].items():
        print(n, " ".join("%.1f–%.1f←%.1f–%.1f" % p for p in pcs))
    print("щелчков и касаний:", len(E["clicks"]), "| кадров в сценах:", {n: len(s["frames"]) for n, s in E["shots"].items()})
