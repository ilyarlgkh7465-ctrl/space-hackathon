# -*- coding: utf-8 -*-
"""Значки приложений для экрана «Домой»: picPac (t2/) и помощник руководителя (helper/).  python3 tools/make_icons.py  (нужен Pillow)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
N = 1024


def orb():
    """Шар помощника — тот же, что в интерфейсе: тёплый градиент, три цветных пятна, блик."""
    bg = Image.new("RGB", (N, N), "#FAF7F5")
    r = int(N * 0.31)
    cx = cy = N // 2
    core = Image.new("RGB", (N, N), "#DD6A5F")
    px = core.load()
    stops = [(0.0, (255, 248, 244)), (0.34, (251, 220, 211)), (0.68, (240, 168, 152)), (1.0, (221, 106, 95))]
    fx, fy, fr = cx - r * 0.36, cy - r * 0.56, r * 2.0
    for y in range(cy - r, cy + r):
        for x in range(cx - r, cx + r):
            t = min(1.0, (((x - fx) ** 2 + (y - fy) ** 2) ** 0.5) / fr)
            for (a, ca), (b, cb) in zip(stops, stops[1:]):
                if t <= b:
                    k = (t - a) / (b - a)
                    px[x, y] = tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
                    break
    # каждое пятно — свой слой на прозрачной основе того же цвета: иначе размытие темнит края
    for (bx, by, br, col) in ((-0.42, 0.30, 0.66, (201, 184, 240, 215)), (0.52, -0.40, 0.58, (246, 217, 166, 205)), (0.10, 0.62, 0.52, (185, 224, 203, 195))):
        layer = Image.new("RGBA", (N, N), col[:3] + (0,))
        ImageDraw.Draw(layer).ellipse([cx + bx * r - br * r, cy + by * r - br * r, cx + bx * r + br * r, cy + by * r + br * r], fill=col)
        layer = layer.filter(ImageFilter.GaussianBlur(r * 0.26))
        core.paste(layer, (0, 0), layer)
    hl = Image.new("RGBA", (N, N), (255, 255, 255, 0))
    ImageDraw.Draw(hl).ellipse([cx - r * 0.74, cy - r * 0.86, cx + r * 0.06, cy - r * 0.26], fill=(255, 255, 255, 215))
    hl = hl.filter(ImageFilter.GaussianBlur(r * 0.16))
    core.paste(hl, (0, 0), hl)
    mask = Image.new("L", (N, N), 0)
    ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    shadow = Image.new("RGBA", (N, N), (221, 87, 87, 0))
    ImageDraw.Draw(shadow).ellipse([cx - r * 0.9, cy - r * 0.62, cx + r * 0.9, cy + r * 1.18], fill=(221, 87, 87, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(r * 0.3))
    bg.paste(shadow, (0, 0), shadow)
    bg.paste(core, (0, 0), mask.filter(ImageFilter.GaussianBlur(1.2)))
    return bg


def picpac():
    """Логотип picPac на белом — как на заставке приложения."""
    bg = Image.new("RGB", (N, N), "#FFFFFF")
    logo = Image.open(ROOT / "t2" / "brand" / "picpac-logo-mask.png").convert("RGBA")
    w = int(N * 0.66)
    h = int(w * logo.height / logo.width)
    alpha = logo.getchannel("A").resize((w, h), Image.LANCZOS)
    bg.paste(Image.new("RGB", (w, h), "#E2373D"), ((N - w) // 2, (N - h) // 2), alpha)
    return bg


for folder, img in (("helper", orb()), ("t2", picpac())):
    for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")):
        img.resize((size, size), Image.LANCZOS).save(ROOT / folder / name, optimize=True)
    print(folder, "готово")
