#!/usr/bin/env python3
"""Собирает dist/ — версию трёх MVP без сервера, для ссылки команде (артефакт claude.ai).

    python3 tools/build_static.py

Что делает:
  * копирует index.html, shared/, t1/, t2/, t3/ в dist/;
  * пишет dist/shared/seed.js (window.STATIC_DEMO = true + демо-данные из data/seed) и подключает его перед api.js —
    в этом режиме api.js хранит данные в браузере, а ИИ заменяет встроенная логика;
  * переписывает абсолютные пути (/shared/…, /t1/, /) в относительные — на хостинге артефактов корня нет;
  * у главной страницы убирает doctype/html/head/body — хостинг артефакта добавляет их сам.
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
PARTS = ["shared", "t1", "t2", "t3"]


def rel_prefix(page_dir: Path) -> str:
    depth = len(page_dir.relative_to(DIST).parts)
    return "../" * depth


def rewrite(text: str, pre: str) -> str:
    # ссылки на треки и главную: "/t1/" → "../t1/index.html", "/t2/admin.html" → "../t2/admin.html"
    text = re.sub(r"""(["'`(])/(t[123])/(\?[^"'`)]*)?(?=["'`)])""",
                  lambda m: m.group(1) + pre + m.group(2) + "/index.html" + (m.group(3) or ""), text)
    text = re.sub(r"""(["'`(])/(t[123]/[\w.-]+\.\w+)""", lambda m: m.group(1) + pre + m.group(2), text)
    text = re.sub(r"""(href=["'])/(["'])""", lambda m: m.group(1) + pre + "index.html" + m.group(2), text)
    text = re.sub(r"""(href\s*=\s*)(["'])/\2""", lambda m: m.group(1) + m.group(2) + pre + "index.html" + m.group(2), text)
    # общие файлы
    text = re.sub(r"""(["'`(])/shared/""", lambda m: m.group(1) + pre + "shared/", text)
    return text


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copy(ROOT / "index.html", DIST / "index.html")
    for p in PARTS:
        shutil.copytree(ROOT / p, DIST / p, ignore=shutil.ignore_patterns("*.md", ".DS_Store"))

    seed = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted((ROOT / "data" / "seed").glob("*.json"))}
    (DIST / "shared" / "seed.js").write_text(
        "/* Собрано tools/build_static.py: режим без сервера для ссылки команде. */\n"
        "window.STATIC_DEMO = true;\nwindow.SEED = " + json.dumps(seed, ensure_ascii=False) + ";\n", encoding="utf-8")

    for f in DIST.rglob("*"):
        if f.suffix not in (".html", ".js", ".css") or f.name == "seed.js":
            continue
        text = f.read_text(encoding="utf-8")
        if f.suffix == ".css":
            # url(/shared/…) в CSS считается от самого CSS-файла
            pre = rel_prefix(f.parent)
            text = re.sub(r"url\((['\"]?)/shared/", lambda m: "url(" + m.group(1) + pre + "shared/", text)
        else:
            # пути в html и js страницы считаются от страницы; js из shared/ используется всеми — там путей к страницам нет
            page_dir = f.parent if f.suffix == ".html" or f.parent.name != "shared" else DIST
            pre = rel_prefix(page_dir)
            text = rewrite(text, pre)
        if f.suffix == ".html":
            pre = rel_prefix(f.parent)
            text = re.sub(r'(<script[^>]+src="' + re.escape(pre) + r'shared/api\.js[^"]*"[^>]*></script>)',
                          '<script src="' + pre + 'shared/seed.js"></script>\n\\1', text, count=1)
            # в просмотрщике артефактов печать не работает — прячем кнопки печати
            text = text.replace("</head>", "<style>[data-print],[data-act='print']{display:none!important}</style>\n</head>", 1)
        f.write_text(text, encoding="utf-8")

    # главная — без собственного каркаса документа
    hub = DIST / "index.html"
    t = hub.read_text(encoding="utf-8")
    t = re.sub(r"<!doctype html>\s*", "", t, flags=re.I)
    t = re.sub(r"</?html[^>]*>\s*|</?head>\s*|</?body[^>]*>\s*", "", t)
    t = re.sub(r'<meta (charset|name="viewport")[^>]*>\s*', "", t)
    hub.write_text(t, encoding="utf-8")

    left = [str(f.relative_to(DIST)) for f in DIST.rglob("*") if f.suffix in (".html", ".js", ".css")
            and re.search(r"""["'(]/(shared|t[123])/""", f.read_text(encoding="utf-8"))]
    print("dist готов:", sum(1 for _ in DIST.rglob("*") if _.is_file()), "файлов")
    if left:
        print("ВНИМАНИЕ: остались абсолютные пути в", left)


if __name__ == "__main__":
    main()
