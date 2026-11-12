# -*- coding: utf-8 -*-
"""Контактный лист сцены: python sheet.py <сцена> t1 t2 ...  → $WORK/shots/<сцена>/sheet.jpg"""
import json, os, sys
from PIL import Image, ImageDraw
d = os.path.join(os.environ["WORK"], "shots", sys.argv[1])
shot = json.load(open(os.path.join(d, "shot.json")))
times = [float(x) for x in sys.argv[2:]]
cols = min(len(times), 4 if shot["w"] > shot["h"] else 6)
tw = 640 if shot["w"] > shot["h"] else 300
th = round(tw * shot["h"] / shot["w"])
rows = (len(times) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * th), "white")
for i, t in enumerate(times):
    f = min(shot["frames"], key=lambda fr: abs(fr[0] - t))
    im = Image.open(os.path.join(d, f[1])).resize((tw, th))
    ImageDraw.Draw(im).text((8, 6), "%.2f" % f[0], fill=(255, 0, 80))
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
sheet.save(os.path.join(d, "sheet.jpg"), quality=82)
print(os.path.join(d, "sheet.jpg"), sheet.size)
