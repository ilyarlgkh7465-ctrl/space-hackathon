"""Трек 2 · мобильное приложение picPac — серверная часть (адреса /api/app/…).

Подключается сервером сам: handle(handler, method, path, core) -> bool.
Права проверяются здесь, по токену: клиент видит только свои проекты, фото и заказы.
Цены считает сервер (МП-01, МП-04); клиенту доверяем только выбор и количество.
Описание адресов — docs/API.md.
"""
import json
import math
import re
import shutil
import time
import uuid
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

CUR = "BYN"
MAX_PHOTO = 25 * 1024 * 1024          # 25 МБ на файл
MAX_PHOTOS_USER = 300                 # фото на пользователя
STAGES = ["accepted", "moderation", "production", "quality", "shipped", "done"]
STAGE_NAME = {"accepted": "Принят", "moderation": "Модерация", "production": "Производство",
              "quality": "Контроль качества", "shipped": "Передан в доставку", "done": "Завершён"}
# какие этапы может отмечать роль (проверка на сервере)
STAFF_STAGES = {
    "operator": {"moderation", "production"},
    "quality": {"quality", "shipped", "done"},
}
# сборные коллекции приложения — чтобы кнопка «Сбросить демо-данные» их тоже очищала
MY_COLLECTIONS = {"projects", "interactions", "uploads_meta"}

# ---------------------------------------------------------------- каталог
# Продукты и цены по мотивам picpac.by; цены выдуманные, валюта BYN.
CATALOG = {
    "currency": CUR,
    "products": [
        {"id": "print", "kind": "print", "name": "Фотопечать", "icon": "photos",
         "short": "Фото из телефона на настоящей фотобумаге",
         "description": "Печать на матовой или глянцевой бумаге. Чем больше отпечатков одного формата — тем дешевле.",
         "photos": {"min": 1, "max": 300}, "lead_days": [1, 3],
         "requirements": "JPEG или PNG. Для 10×15 хватит 1200×1800 пикселей; для A4 нужно около 2500×3500.",
         "options": [{"id": "finish", "name": "Бумага", "values": [{"id": "matte", "name": "Матовая"}, {"id": "glossy", "name": "Глянцевая"}]}],
         "variants": [
             {"id": "10x15", "name": "10×15 см", "min_px": [1200, 1800], "ratio": 2 / 3,
              "tiers": [[1, "0.65"], [50, "0.55"], [200, "0.45"]]},
             {"id": "13x18", "name": "13×18 см", "min_px": [1500, 2100], "ratio": 5 / 7,
              "tiers": [[1, "1.20"], [50, "1.00"], [200, "0.85"]]},
             {"id": "15x21", "name": "15×21 см", "min_px": [1800, 2500], "ratio": 5 / 7,
              "tiers": [[1, "1.60"], [50, "1.40"], [200, "1.20"]]},
             {"id": "21x30", "name": "21×30 см (A4)", "min_px": [2480, 3508], "ratio": 0.707,
              "tiers": [[1, "4.20"], [50, "3.80"], [200, "3.40"]]},
             {"id": "polaroid", "name": "Полароид 8×10", "min_px": [900, 900], "ratio": 1,
              "tiers": [[1, "0.90"], [50, "0.75"], [200, "0.65"]]},
         ]},
        {"id": "book", "kind": "book", "name": "Фотокнига", "icon": "book",
         "short": "Ваша история в твёрдой обложке",
         "description": "Lite — мягкая обложка, Classic — твёрдая, Premium — твёрдая с льняным переплётом. Раскладку по страницам делаем сами, вы только правите.",
         "photos": {"min": 10, "max": 200}, "lead_days": [5, 7],
         "requirements": "От 10 фото. На страницу хватит 1200×1200 пикселей; для разворота — вдвое больше по ширине.",
         "options": [{"id": "pages", "name": "Страницы", "kind": "number", "min": 20, "max": 60, "step": 2, "default": 20}],
         "variants": [
             {"id": "lite", "name": "Lite 20×20", "min_px": [1200, 1200], "ratio": 1, "base": "49.90", "pages_incl": 20, "page_price": "1.40"},
             {"id": "classic", "name": "Classic 20×20", "min_px": [1200, 1200], "ratio": 1, "base": "72.90", "pages_incl": 20, "page_price": "1.90"},
             {"id": "premium", "name": "Premium 30×30", "min_px": [1800, 1800], "ratio": 1, "base": "129.00", "pages_incl": 20, "page_price": "3.20"},
         ]},
        {"id": "calendar", "kind": "calendar", "name": "Календарь на 2027", "icon": "cal",
         "short": "12 месяцев — 12 ваших фото",
         "description": "Настенный календарь: обложка и по одному фото на каждый месяц.",
         "photos": {"min": 12, "max": 13}, "lead_days": [2, 3],
         "requirements": "12 фото (13 — с отдельным фото на обложку). Каждому хватит 2480×3508 пикселей.",
         "options": [],
         "variants": [{"id": "wall", "name": "Настенный A3", "min_px": [2480, 3508], "ratio": 0.707, "price": "29.00"},
                      {"id": "desk", "name": "Настольный перекидной", "min_px": [1800, 1800], "ratio": 1, "price": "19.50"}]},
        {"id": "magnet", "kind": "magnet", "name": "Магнит", "icon": "magnet",
         "short": "Любимый кадр на холодильник",
         "description": "Фотомагнит на гибкой основе. Один магнит — одно фото.",
         "photos": {"min": 1, "max": 100}, "lead_days": [2, 3],
         "requirements": "Любой кадр от 1000×1000 пикселей.",
         "options": [],
         "variants": [{"id": "10x10", "name": "10×10 см", "min_px": [1000, 1000], "ratio": 1, "price": "4.50"},
                      {"id": "7x10", "name": "7×10 см", "min_px": [800, 1100], "ratio": 0.7, "price": "3.40"}]},
        {"id": "canvas", "kind": "canvas", "name": "Холст", "icon": "canvas",
         "short": "Одно большое фото на стену",
         "description": "Печать на холсте на подрамнике. Нужен резкий кадр с большим разрешением.",
         "photos": {"min": 1, "max": 1}, "lead_days": [3, 5],
         "requirements": "Для 30×40 нужно около 2400×3200 пикселей, для 40×60 — 3600×5400.",
         "options": [],
         "variants": [{"id": "30x40", "name": "30×40 см", "min_px": [2400, 3200], "ratio": 0.75, "price": "45.00"},
                      {"id": "40x60", "name": "40×60 см", "min_px": [3600, 5400], "ratio": 2 / 3, "price": "79.00"}]},
    ],
    # пункты выдачи — выдуманные (есть ли у «Фотопринта» точки самовывоза — уточнить у заказчика)
    "delivery": [
        {"id": "pickup", "name": "Самовывоз", "price": "0.00", "days": [0, 0], "note": "Из пункта выдачи, бесплатно"},
        {"id": "evropochta", "name": "Европочта", "price": "5.90", "days": [2, 4], "note": "В отделение, от 2 дней"},
        {"id": "belpochta", "name": "Белпочта", "price": "6.90", "days": [3, 6], "free_from": "150.00", "note": "Бесплатно от 150 BYN"},
        {"id": "courier", "name": "Курьер по Минску", "price": "14.90", "days": [1, 2], "note": "Домой, в удобное время"},
    ],
    "points": [{"id": "center", "name": "Пункт выдачи «Центр», пр. Независимости"},
               {"id": "east", "name": "Пункт выдачи «Восток», ул. Притыцкого"},
               {"id": "gorka", "name": "Пункт выдачи «Каменная Горка»"}],
}
# тестовые промокоды: код -> (тип, значение, минимальная сумма товаров)
PROMOS = {
    "PICPAC10": ("percent", Decimal("10"), Decimal("0")),
    "WELCOME5": ("fixed", Decimal("5"), Decimal("30")),
    "BOOK15": ("percent_book", Decimal("15"), Decimal("0")),
}
PROD = {p["id"]: p for p in CATALOG["products"]}
DELIV = {d["id"]: d for d in CATALOG["delivery"]}


def _d(x):
    return Decimal(str(x))


def _q(x):
    return _d(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def public_catalog():
    """Каталог без внутренних полей (всё остальное — публично)."""
    return json.loads(json.dumps(CATALOG))


# ---------------------------------------------------------------- цена (МП-04)
class Bad(Exception):
    def __init__(self, msg, code=400, extra=None):
        super().__init__(msg)
        self.msg, self.code, self.extra = msg, code, extra or {}


def variant_of(prod, vid):
    v = next((x for x in prod["variants"] if x["id"] == vid), None)
    if not v:
        raise Bad("Такого варианта нет в каталоге: " + str(vid))
    return v


def price_line(item):
    """Цена одной позиции. item: {product, variant, qty, options:{pages}}. Формула в docs/API.md."""
    prod = PROD.get(item.get("product"))
    if not prod:
        raise Bad("Такого продукта нет в каталоге: " + str(item.get("product")))
    v = variant_of(prod, item.get("variant"))
    try:
        qty = int(item.get("qty") or 0)
    except (TypeError, ValueError):
        raise Bad("Количество должно быть числом")
    if qty < 1 or qty > 5000:
        raise Bad("Количество должно быть от 1 до 5000")
    kind = prod["kind"]
    pages = None
    if kind == "print":
        unit = _d(v["tiers"][0][1])
        for from_qty, p in v["tiers"]:
            if qty >= from_qty:
                unit = _d(p)
        total = unit * qty
        note = "%d шт × %s" % (qty, _q(unit))
    elif kind == "book":
        opt = prod["options"][0]
        try:
            pages = int((item.get("options") or {}).get("pages") or opt["default"])
        except (TypeError, ValueError):
            raise Bad("Число страниц должно быть числом")
        if pages < opt["min"] or pages > opt["max"] or (pages - opt["min"]) % opt["step"]:
            raise Bad("Страниц может быть от %d до %d, с шагом %d" % (opt["min"], opt["max"], opt["step"]))
        unit = _d(v["base"]) + max(0, pages - v["pages_incl"]) * _d(v["page_price"])
        total = unit * qty
        note = "%d стр.: %s + %d доп. × %s" % (pages, v["base"], max(0, pages - v["pages_incl"]), v["page_price"])
    else:
        unit = _d(v["price"])
        total = unit * qty
        note = "%d шт × %s" % (qty, _q(unit))
    return {"product": prod["id"], "variant": v["id"], "name": prod["name"] + " " + v["name"],
            "qty": qty, "pages": pages, "unit": str(_q(unit)), "sum": str(_q(total)), "note": note, "kind": kind}


def price_order(items, delivery_id, promo):
    """Итог корзины. Формула: товары − скидка по промокоду + доставка (бесплатная выше порога)."""
    if not items:
        raise Bad("Корзина пуста")
    lines = [price_line(i) for i in items]
    goods = sum((_d(l["sum"]) for l in lines), Decimal("0"))
    disc, promo_info = Decimal("0"), None
    code = (promo or "").strip().upper()
    if code:
        rule = PROMOS.get(code)
        if not rule:
            raise Bad("Промокод «%s» не найден" % code, extra={"field": "promo"})
        kind, val, minsum = rule
        if goods < minsum:
            raise Bad("Промокод %s действует от %s %s" % (code, minsum, CUR), extra={"field": "promo"})
        if kind == "percent":
            disc = goods * val / 100
        elif kind == "percent_book":
            base = sum((_d(l["sum"]) for l in lines if l["kind"] == "book"), Decimal("0"))
            if base == 0:
                raise Bad("Промокод BOOK15 — только на фотокниги", extra={"field": "promo"})
            disc = base * val / 100
        else:
            disc = min(val, goods)
        disc = _q(disc)
        promo_info = {"code": code, "discount": str(disc)}
    d = DELIV.get(delivery_id)
    if not d:
        raise Bad("Выберите способ получения")
    dprice = _d(d["price"])
    if d.get("free_from") and goods - disc >= _d(d["free_from"]):
        dprice = Decimal("0")
    total = _q(goods - disc + dprice)
    lo = max(p["lead_days"][0] for p in (PROD[l["product"]] for l in lines))
    hi = max(p["lead_days"][1] for p in (PROD[l["product"]] for l in lines))
    eta = [lo + d["days"][0], hi + d["days"][1]]
    return {"currency": CUR, "lines": lines, "goods": str(_q(goods)), "discount": str(disc), "promo": promo_info,
            "delivery": {"id": d["id"], "name": d["name"], "price": str(_q(dprice))},
            "total": str(total), "eta_days": eta, "eta_text": eta_text(eta),
            "formula": "итого = товары − скидка + доставка"}


def eta_text(eta):
    lo, hi = eta
    if hi == 0:
        return "сегодня"
    if lo == hi:
        return "через %d дн." % hi
    return "через %d–%d дн." % (lo, hi)


# ---------------------------------------------------------------- проверка перед заказом
def image_info(head):
    """Формат и размеры из заголовка файла: JPEG или PNG; иначе None."""
    if head[:8] == b"\x89PNG\r\n\x1a\n" and len(head) >= 24:
        return "png", int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")
    if head[:3] == b"\xff\xd8\xff":
        i = 2
        while i + 9 < len(head):
            if head[i] != 0xFF:
                i += 1
                continue
            m = head[i + 1]
            if m in (0xD8, 0x01) or 0xD0 <= m <= 0xD7:
                i += 2
                continue
            seg = int.from_bytes(head[i + 2:i + 4], "big")
            if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
                return "jpeg", int.from_bytes(head[i + 7:i + 9], "big"), int.from_bytes(head[i + 5:i + 7], "big")
            i += 2 + seg
        return "jpeg", 0, 0
    return None


def crop_of(photo, ratio, fit):
    """Какая часть кадра попадёт на отпечаток (доли 0..1) и ориентация."""
    w, h = photo.get("w") or 0, photo.get("h") or 0
    portrait = h >= w
    aspect = ratio if portrait else 1 / ratio
    c = photo.get("crop")
    if fit or not w or not h:
        return 1.0, 1.0, portrait
    if isinstance(c, dict) and c.get("w") and c.get("h"):
        return float(c["w"]), float(c["h"]), portrait
    ia = w / h
    if abs(ia - aspect) < 0.01:
        return 1.0, 1.0, portrait
    return (aspect / ia, 1.0, portrait) if ia > aspect else (1.0, ia / aspect, portrait)


def quality_of(photo, variant, fit):
    cw, ch, portrait = crop_of(photo, variant["ratio"], fit)
    short, long_ = variant["min_px"]
    need_w, need_h = (short, long_) if portrait else (long_, short)
    w, h = photo.get("w") or 0, photo.get("h") or 0
    if not w or not h:
        return 0.0
    return min(w * cw / need_w, h * ch / need_h)


def check_project(project):
    """Проверка перед заказом (шаг 5). Возвращает список замечаний; пусто — всё в порядке."""
    prod = PROD.get(project.get("product"))
    if not prod:
        return [{"code": "no_product", "level": "error", "text": "Не выбран продукт", "photo": None}]
    try:
        v = variant_of(prod, project.get("variant"))
    except Bad as e:
        return [{"code": "no_variant", "level": "error", "text": e.msg, "photo": None}]
    photos = project.get("photos") or []
    issues = []
    fit = bool(project.get("fit"))
    n = len(photos)
    mn, mx = prod["photos"]["min"], prod["photos"]["max"]
    if n == 0:
        issues.append({"code": "no_photos", "level": "error", "photo": None, "text": "В проекте нет фото — добавьте хотя бы одно"})
    elif n < mn:
        issues.append({"code": "too_few", "level": "warn", "photo": None,
                       "text": "Для этого продукта лучше не меньше %d фото, сейчас %d." % (mn, n)})
    if n > mx:
        issues.append({"code": "too_many", "level": "error", "photo": None,
                       "text": "Для этого продукта максимум %d фото, сейчас %d — уберите лишние." % (mx, n)})
    if prod["kind"] in ("book", "calendar") and n:
        pages = int((project.get("options") or {}).get("pages") or (prod["options"][0]["default"] if prod["options"] else 12))
        slots = 12 if prod["kind"] == "calendar" else pages
        lay = project.get("layout")
        if lay:                                                # макет собран: считаем страницы без единого фото
            ids = {p.get("id") for p in photos}
            filled = sum(1 for pg in lay[:slots] if any(i in ids for i in pg))
            empty = max(0, slots - filled)
        else:
            empty = max(0, slots - n)
        if empty:
            issues.append({"code": "empty_pages", "level": "warn", "photo": None,
                           "text": "Пустых мест: %d из %d. Добавьте фото или уменьшите число страниц." % (empty, slots)})
    for i, p in enumerate(photos):
        pid = p.get("id")
        name = p.get("name") or "Фото %d" % (i + 1)
        q = quality_of(p, v, fit)
        if q and q < 0.5:
            issues.append({"code": "low_res", "level": "warn", "photo": pid,
                           "text": "«%s»: мало пикселей для этого формата, на бумаге будет заметно. Замените фото или выберите формат поменьше." % name})
        elif q and q < 0.85:
            issues.append({"code": "soft", "level": "info", "photo": pid,
                           "text": "«%s»: напечатается чуть мягче обычного — для этого формата это допустимо." % name})
        if p.get("blur"):
            issues.append({"code": "blur", "level": "warn", "photo": pid, "text": "«%s»: кадр выглядит размытым." % name})
        if p.get("dark"):
            issues.append({"code": "dark", "level": "warn", "photo": pid, "text": "«%s»: кадр слишком тёмный." % name})
        cw, ch, _ = crop_of(p, v["ratio"], fit)
        cut = 1 - min(cw, ch)
        if cut > 0.12 and not fit:
            issues.append({"code": "crop", "level": "info", "photo": pid,
                           "text": "«%s»: по краям обрежется примерно %d %%. Можно включить белые поля." % (name, round(cut * 100))})
    return issues


# ---------------------------------------------------------------- вспомогательное
def handle(handler, method, path, core):
    core.collections.update(MY_COLLECTIONS)                    # чтобы «Сбросить демо-данные» очищала и их
    try:
        return _route(handler, method, path, core)
    except Bad as e:
        handler._json(dict({"error": e.msg}, **e.extra), e.code)
        return True


def _route(h, method, path, core):
    p = path.split("?")[0][len("/api/app"):].strip("/")
    parts = p.split("/") if p else []
    me = lambda: _need_user(h, core)

    # --- публичные
    if method == "GET" and p == "catalog":
        h._json(public_catalog())
        return True
    if method == "POST" and p == "step":                       # шаг воронки: можно и без входа
        return _step(h, core)
    if method == "POST" and p == "guest":
        return _guest(h, core)
    if method == "POST" and p == "price":
        b = h._body()
        h._json(price_order(b.get("items") or [], b.get("delivery") or "pickup", b.get("promo")))
        return True

    # --- персональные
    if p == "projects" and method == "GET":
        u = me()
        h._json([_project_view(x) for x in core.load("projects") if x.get("user") == u["id"]])
        return True
    if p == "projects" and method == "POST":
        return _project_save(h, core, me(), None)
    if len(parts) == 2 and parts[0] == "projects" and method == "GET":
        return _project_get(h, core, me(), parts[1])
    if len(parts) == 2 and parts[0] == "projects" and method == "POST":
        return _project_save(h, core, me(), parts[1])
    if len(parts) == 3 and parts[0] == "projects" and parts[2] == "delete" and method == "POST":
        return _project_delete(h, core, me(), parts[1])
    if len(parts) == 3 and parts[0] == "projects" and parts[2] == "check" and method == "GET":
        u = me()
        pr = _find(core.load("projects"), parts[1], u)
        h._json({"issues": check_project(pr)})
        return True
    if p == "photos" and method == "POST":
        return _photo_upload(h, core, me())
    if len(parts) == 2 and parts[0] == "photos" and method == "GET":
        return _photo_get(h, core, me(), parts[1])
    if len(parts) == 3 and parts[0] == "photos" and parts[2] == "delete" and method == "POST":
        return _photo_delete(h, core, me(), parts[1])
    if p == "orders" and method == "POST":
        return _order_create(h, core, me())
    if p == "orders" and method == "GET":
        u = me()
        h._json([_order_view(o) for o in core.load("orders") if o.get("customer_id") == u["id"]][::-1])
        return True
    if len(parts) >= 2 and parts[0] == "orders" and method == "GET":
        return _order_get(h, core, me(), parts[1], parts[2] if len(parts) > 2 else "")
    if p == "support" and method == "POST":
        return _support_create(h, core, me())
    if p == "support" and method == "GET":
        u = me()
        h._json([x for x in core.load("interactions") if x.get("customer_id") == u["id"]][::-1])
        return True
    if p == "account/delete" and method == "POST":
        return _account_delete(h, core, me())

    # --- сотрудники
    if p == "staff/orders" and method == "GET":
        return _staff_list(h, core, me())
    if len(parts) == 4 and parts[:2] == ["staff", "orders"] and parts[3] == "mark" and method == "POST":
        return _staff_mark(h, core, me(), parts[2])
    if p == "staff/support" and method == "GET":
        return _staff_support(h, core, me())
    return False


def _need_user(h, core):
    u = core.user(h)
    if not u:
        raise Bad("Нужно войти", 401)
    return u


def _find(items, item_id, user):
    it = next((x for x in items if x.get("id") == item_id and x.get("user", x.get("customer_id")) == user["id"]), None)
    if not it:
        raise Bad("Не найдено", 404)
    return it


def _ts(core):
    return core.now()


def _new_id(prefix):
    return prefix + uuid.uuid4().hex[:8]


def _step(h, core):
    b = h._body()
    step = str(b.get("step") or "")
    if step not in ("catalog", "photos", "layout", "check", "cart", "paid"):
        raise Bad("Неизвестный шаг")
    u = core.user(h)
    with core.lock:
        ev = core.load("events")
        ev.append({"id": _new_id("e-"), "type": "app_step", "step": step, "session": str(b.get("session") or "")[:40],
                   "ts": core.now(), "actor": "client", "uid": u["id"] if u else None})
        core.save("events", ev[-5000:])
    h._json({"ok": True})
    return True


def _guest(h, core):
    uid = _new_id("g-")
    user = {"id": uid, "login": uid, "name": "Гость", "title": "Гость", "role": "customer", "dept": "", "level": 9,
            "password": uuid.uuid4().hex, "guest": True}
    token = uuid.uuid4().hex + uuid.uuid4().hex
    with core.lock:
        users = core.load("users")
        guests = [x for x in users if x.get("guest")]
        if len(guests) > 400:                                  # не копим гостей бесконечно
            drop = {x["id"] for x in guests[:100]}
            users = [x for x in users if x["id"] not in drop]
        users.append(user)
        core.save("users", users)
        sess = core.load("sessions")
        sess.append({"token": token, "user": uid, "ts": core.now()})
        core.save("sessions", sess[-300:])
    core.audit("Гость " + uid, "вход гостем", "", obj="сессия")
    h._json({"token": token, "user": {k: user[k] for k in ("id", "login", "name", "title", "role", "dept", "level")}})
    return True


# ---------------------------------------------------------------- проекты (черновики)
def _project_view(pr):
    return {k: v for k, v in pr.items() if k != "user"}


def _clean_photos(photos, owned):
    out = []
    for i, p in enumerate((photos or [])[:400]):
        if not isinstance(p, dict) or not p.get("id"):
            continue
        out.append({
            "id": str(p["id"])[:40], "name": str(p.get("name") or "")[:80],
            "w": int(p.get("w") or 0), "h": int(p.get("h") or 0),
            "crop": p.get("crop") if isinstance(p.get("crop"), dict) else None,
            "qty": max(1, min(999, int(p.get("qty") or 1))),
            "blur": bool(p.get("blur")), "dark": bool(p.get("dark")), "dup": bool(p.get("dup")),
            "server": bool(p.get("id") in owned),
        })
    return out


def _clean_layout(lay):
    """Макет книги: список страниц, на странице — список id фото (до 6)."""
    if not isinstance(lay, list):
        return None
    return [[str(i)[:40] for i in pg[:6]] if isinstance(pg, list) else [] for pg in lay[:140]]


def _project_save(h, core, user, pid):
    b = h._body()
    prod = PROD.get(b.get("product"))
    if not prod:
        raise Bad("Выберите продукт")
    variant = variant_of(prod, b.get("variant") or prod["variants"][0]["id"])["id"]
    owned = {x["id"] for x in core.load("uploads_meta") if x.get("user") == user["id"]}
    now = core.now()
    with core.lock:
        items = core.load("projects")
        cur = next((x for x in items if x.get("id") == pid and x.get("user") == user["id"]), None) if pid else None
        if pid and not cur and any(x.get("id") == pid for x in items):
            raise Bad("Не найдено", 404)                        # чужой id
        # иначе: проект создан офлайн на телефоне — сохраняем под его id
        data = {"product": prod["id"], "variant": variant, "options": b.get("options") if isinstance(b.get("options"), dict) else {},
                "fit": bool(b.get("fit")), "title": str(b.get("title") or "")[:80],
                "layout": _clean_layout(b.get("layout")),
                "photos": _clean_photos(b.get("photos"), owned), "qty": max(1, min(5000, int(b.get("qty") or 1))),
                "delivery": str(b.get("delivery") or "pickup")[:20], "promo": str(b.get("promo") or "")[:30]}
        if cur:
            # версия: если на сервере новее, чем у клиента, отдаём конфликт — клиент решает сам
            if b.get("base_version") is not None and int(b["base_version"]) < cur.get("version", 0) and not b.get("force"):
                h._json({"error": "На сервере более новая версия черновика", "conflict": True, "server": _project_view(cur)}, 409)
                return True
            cur.update(data)
            cur["version"] = cur.get("version", 0) + 1
            cur["updated"] = now
            res = cur
        else:
            res = dict(data, id=pid or _new_id("pr-"), user=user["id"], version=1, created=now, updated=now)
            items.append(res)
        core.save("projects", items)
    h._json(_project_view(res))
    return True


def _project_get(h, core, user, pid):
    h._json(_project_view(_find(core.load("projects"), pid, user)))
    return True


def _project_delete(h, core, user, pid):
    with core.lock:
        items = core.load("projects")
        pr = next((x for x in items if x.get("id") == pid and x.get("user") == user["id"]), None)
        if not pr:
            raise Bad("Не найдено", 404)
        core.save("projects", [x for x in items if x is not pr])
    core.audit(user["name"], "удалил проект", pid, obj="project " + pid)
    h._json({"ok": True})
    return True


# ---------------------------------------------------------------- фото (МП-02, МП-06)
def _upload_dir(core, user):
    d = Path(core.data) / "uploads" / re.sub(r"[^\w-]", "_", user["id"])
    d.mkdir(parents=True, exist_ok=True)
    return d


def _photo_upload(h, core, user):
    n = int(h.headers.get("Content-Length") or 0)
    if n <= 0:
        raise Bad("Файл пустой")
    if n > MAX_PHOTO:
        raise Bad("Файл больше %d МБ — уменьшите его или выберите другой" % (MAX_PHOTO // 1024 // 1024), 413)
    raw = h.rfile.read(n)
    info = image_info(raw[:200000])
    if not info:
        raise Bad("Принимаем только JPEG и PNG. Если снимок в формате HEIC — сохраните его как JPEG.", 415)
    fmt, w, hgt = info
    if min(w, hgt) and min(w, hgt) < 400:
        raise Bad("Фото слишком маленькое (%d×%d). Нужно хотя бы 400 пикселей по короткой стороне." % (w, hgt), 422)
    pid = h.headers.get("X-Photo-Id") or ""
    if not re.fullmatch(r"[\w-]{4,40}", pid):
        pid = _new_id("ph-")
    name = re.sub(r"[^\w.\- а-яА-ЯёЁ]", "", h.headers.get("X-File-Name") or "")[:80] or pid
    with core.lock:
        meta = [x for x in core.load("uploads_meta") if not (x.get("id") == pid and x.get("user") == user["id"])]  # повторная загрузка заменяет
        mine = [x for x in meta if x.get("user") == user["id"]]
        if len(mine) >= MAX_PHOTOS_USER:
            raise Bad("Загружено слишком много фото (%d). Удалите ненужные." % MAX_PHOTOS_USER, 429)
        (_upload_dir(core, user) / (pid + "." + fmt)).write_bytes(raw)
        rec = {"id": pid, "user": user["id"], "name": name, "fmt": fmt, "w": w, "h": hgt, "size": n, "ts": core.now()}
        meta.append(rec)
        core.save("uploads_meta", meta)
    core.audit(user["name"], "загрузил фото", "%s %dx%d" % (fmt, w, hgt), obj="photo " + pid)
    h._json({k: rec[k] for k in ("id", "name", "fmt", "w", "h", "size")})
    return True


def _photo_get(h, core, user, pid):
    rec = next((x for x in core.load("uploads_meta") if x.get("id") == pid and x.get("user") == user["id"]), None)
    f = (_upload_dir(core, user) / (pid + "." + rec["fmt"])) if rec else None
    if not rec or not f.exists():
        raise Bad("Фото не найдено", 404)
    raw = f.read_bytes()
    h.send_response(200)
    h.send_header("Content-Type", "image/" + ("png" if rec["fmt"] == "png" else "jpeg"))
    h.send_header("Content-Length", str(len(raw)))
    h.end_headers()
    h.wfile.write(raw)
    return True


def _photo_delete(h, core, user, pid):
    with core.lock:
        meta = core.load("uploads_meta")
        rec = next((x for x in meta if x.get("id") == pid and x.get("user") == user["id"]), None)
        if not rec:
            raise Bad("Фото не найдено", 404)
        try:
            (_upload_dir(core, user) / (pid + "." + rec["fmt"])).unlink()
        except OSError:
            pass
        core.save("uploads_meta", [x for x in meta if x is not rec])
    core.audit(user["name"], "удалил фото", pid, obj="photo " + pid)
    h._json({"ok": True})
    return True


# ---------------------------------------------------------------- заказы (МП-05)
def _order_view(o):
    return {k: v for k, v in o.items() if k not in ("key", "thumbs_full")}


def _event(core, order, stage, status, actor, comment=""):
    return {"id": _new_id("e-"), "type": "order_status", "order_id": order["id"], "stage": stage,
            "status": status, "actor": actor, "ts": core.now(), "key": "%s:%s:%s" % (order["id"], stage, status),
            "comment": comment[:200] if comment else ""}


def _order_create(h, core, user):
    b = h._body()
    key = str(h.headers.get("Idempotency-Key") or b.get("key") or "").strip()[:80]
    if not key:
        raise Bad("Нет ключа запроса (Idempotency-Key) — без него повтор мог бы создать второй заказ")
    # повтор с тем же ключом — возвращаем уже созданный заказ, ничего не создаём
    with core.lock:
        for o in core.load("orders"):
            if o.get("customer_id") == user["id"] and o.get("key") == key:
                h._json(dict(_order_view(o), replayed=True))
                return True
    items = b.get("items")
    project = None
    if b.get("project_id"):
        project = _find(core.load("projects"), b["project_id"], user)
        items = [{"product": project["product"], "variant": project["variant"], "qty": _qty_of(project),
                  "options": project.get("options")}]
    if not items:
        raise Bad("Корзина пуста")
    delivery = b.get("delivery") if isinstance(b.get("delivery"), dict) else {"id": b.get("delivery")}
    pricing = price_order(items, delivery.get("id"), b.get("promo"))
    contact = b.get("contact") if isinstance(b.get("contact"), dict) else {}
    name, phone = str(contact.get("name") or "").strip()[:60], str(contact.get("phone") or "").strip()[:30]
    if not name:
        raise Bad("Укажите имя", extra={"field": "name"})
    if len(re.sub(r"\D", "", phone)) < 9:
        raise Bad("Укажите телефон — напишем, когда заказ будет готов", extra={"field": "phone"})
    d = DELIV[delivery["id"]]
    address, point = "", None
    if d["id"] == "pickup":
        point = next((x for x in CATALOG["points"] if x["id"] == delivery.get("point")), None)
        if not point:
            raise Bad("Выберите пункт выдачи", extra={"field": "point"})
    else:
        address = str(delivery.get("address") or "").strip()[:200]
        if len(address) < 5:
            raise Bad("Укажите адрес доставки", extra={"field": "address"})
    # серверная проверка качества: если есть замечания, нужно осознанное согласие клиента
    issues = []
    if project:
        issues = [i for i in check_project(project) if i["level"] in ("warn", "error")]
        if any(i["level"] == "error" for i in issues):
            h._json({"error": "В проекте есть ошибки, которые нужно исправить", "issues": issues}, 422)
            return True
        if issues and not b.get("accept_warnings"):
            h._json({"error": "Есть замечания к фото — исправьте или подтвердите, что хотите продолжить", "issues": issues,
                     "needs_accept": True}, 409)
            return True
    with core.lock:
        orders = core.load("orders")
        for o in orders:                                       # повторная проверка внутри блокировки: два запроса одновременно
            if o.get("customer_id") == user["id"] and o.get("key") == key:
                h._json(dict(_order_view(o), replayed=True))
                return True
        nums = [int(m.group(1)) for o in orders if (m := re.match(r"PP-(\d+)$", str(o.get("number"))))]
        order = {
            "id": _new_id("o-"), "number": "PP-%04d" % (max(nums or [1000]) + 1),
            "channel": "mobile", "source": "t2", "customer_id": user["id"], "key": key,
            "stage": "moderation", "stage_status": "pending", "status": "moderation",
            "items": pricing["lines"], "goods": pricing["goods"], "discount": pricing["discount"], "promo": pricing["promo"],
            "total": pricing["total"], "currency": CUR, "delivery": pricing["delivery"], "pickup_point": point,
            "address": address, "name": name, "phone": phone, "payment": "при получении (тест, без списания)",
            "eta_days": pricing["eta_days"], "ready": pricing["eta_text"], "project_id": project["id"] if project else None,
            "photos": len(project["photos"]) if project else 0, "accepted_warnings": [i["code"] for i in issues],
            "ts": core.now(), "time_sec": int(b.get("time_sec") or 0) or None,
        }
        orders.append(order)
        core.save("orders", orders)
        ev = core.load("events")
        ev.append(_event(core, order, "accepted", "passed", "client"))
        ev.append(_event(core, order, "moderation", "pending", "system"))
        ev.append({"id": _new_id("e-"), "type": "app_step", "step": "paid", "session": str(b.get("session") or "")[:40],
                   "ts": core.now(), "actor": "client", "order_id": order["id"]})
        core.save("events", ev[-5000:])
    core.audit(user["name"], "оформил заказ", "%s на %s %s" % (order["number"], order["total"], CUR), obj="order " + order["id"])
    h._json(dict(_order_view(order), replayed=False), 201)
    return True


def _qty_of(project):
    prod = PROD[project["product"]]
    if prod["kind"] in ("print", "magnet"):
        return sum(max(1, int(p.get("qty") or 1)) for p in project["photos"]) or 1
    return max(1, int(project.get("qty") or 1))


def _order_get(h, core, user, oid, sub):
    o = next((x for x in core.load("orders") if x.get("id") == oid), None)
    if not o or (o.get("customer_id") != user["id"] and not _is_staff(user)):
        if o:
            core.audit(user["name"], "просмотр чужого заказа", oid, obj="order " + oid, result="отказ")
        raise Bad("Заказ не найден", 404)                       # чужой заказ неотличим от несуществующего
    if sub == "events":
        h._json([e for e in core.load("events") if e.get("order_id") == oid and e.get("type") == "order_status"])
    elif sub == "":
        h._json(_order_view(o))
    else:
        return False
    return True


# ---------------------------------------------------------------- поддержка
def _support_create(h, core, user):
    b = h._body()
    text = str(b.get("text") or "").strip()[:1000]
    if len(text) < 3:
        raise Bad("Опишите вопрос хотя бы парой слов", extra={"field": "text"})
    oid = str(b.get("order_id") or "")
    order = None
    if oid:
        order = next((x for x in core.load("orders") if x.get("id") == oid and x.get("customer_id") == user["id"]), None)
        if not order:
            raise Bad("Заказ не найден", 404)
    key = str(h.headers.get("Idempotency-Key") or b.get("key") or "").strip()[:80]
    due = (datetime.now().astimezone() + timedelta(hours=4)).isoformat(timespec="seconds")
    with core.lock:
        items = core.load("interactions")
        if key:
            old = next((x for x in items if x.get("customer_id") == user["id"] and x.get("key") == key), None)
            if old:
                h._json(dict(old, replayed=True))
                return True
        rec = {"id": _new_id("i-"), "type": "interaction", "channel": "app", "customer_id": user["id"], "key": key,
               "order_id": oid or None, "order_number": order["number"] if order else None,
               "topic": str(b.get("topic") or "Вопрос по заказу")[:60], "text": text, "status": "open",
               "ts": core.now(), "due": due, "messages": [{"from": "client", "text": text, "ts": core.now()}]}
        items.append(rec)
        core.save("interactions", items)
    core.audit(user["name"], "обращение в поддержку", rec["topic"], obj="interaction " + rec["id"])
    h._json(rec, 201)
    return True


# ---------------------------------------------------------------- сотрудники
def _is_staff(u):
    return u.get("role") in ("operator", "head", "director", "analyst")


def _stages_for(u):
    if u["role"] in ("director",):
        return set(STAGES[1:])
    if u["role"] == "operator":
        return STAFF_STAGES["quality"] if u.get("stage") == "quality" else STAFF_STAGES["operator"]
    if u["role"] == "head" and u.get("dept") == "production":
        return {"moderation", "production", "quality"}
    if u["role"] == "head" and u.get("dept") == "logistics":
        return {"shipped", "done"}
    return set()


def _staff_list(h, core, u):
    if not _is_staff(u):
        core.audit(u["name"], "очередь заказов", "", obj="app/staff", result="отказ")
        raise Bad("Нет доступа", 403)
    mine = _stages_for(u)
    out = []
    for o in core.load("orders"):
        if o.get("channel") != "mobile":
            continue
        v = _order_view(o)
        v["can"] = o.get("stage") in mine
        if u["role"] == "operator" and not v["can"]:
            continue                                            # оператор видит очередь только своего этапа
        if u["role"] == "analyst":
            v.pop("phone", None)
            v.pop("name", None)
        out.append(v)
    h._json({"stages": sorted(mine, key=STAGES.index), "orders": out[::-1],
             "stage_names": STAGE_NAME})
    return True


def _staff_mark(h, core, u, oid):
    b = h._body()
    act = b.get("action")
    if act not in ("accept", "handoff", "defect"):
        raise Bad("Действие: accept (принял), handoff (сдал) или defect (брак)")
    with core.lock:
        orders = core.load("orders")
        o = next((x for x in orders if x.get("id") == oid), None)
        if not o:
            raise Bad("Заказ не найден", 404)
        stage = o["stage"]
        if stage not in _stages_for(u):
            denied = True
        else:
            denied = False
            if act == "accept":
                if o.get("stage_status") == "started":
                    raise Bad("Этот этап уже принят")
                o["stage_status"] = "started"
                evs = [_event(core, o, stage, "started", u["login"], b.get("comment", ""))]
            elif act == "defect":
                o["stage_status"] = "defect"
                evs = [_event(core, o, stage, "defect", u["login"], b.get("comment", ""))]
            else:
                if o.get("stage_status") != "started":
                    raise Bad("Сначала нажмите «Принял»")
                evs = [_event(core, o, stage, "passed", u["login"], b.get("comment", ""))]
                nxt = STAGES.index(stage) + 1
                if nxt < len(STAGES):
                    o["stage"], o["stage_status"] = STAGES[nxt], "pending"
                    evs.append(_event(core, o, STAGES[nxt], "pending", "system"))
                else:
                    o["stage_status"] = "passed"
                o["status"] = o["stage"]
            ev = core.load("events")
            ev.extend(evs)
            core.save("events", ev[-5000:])
            core.save("orders", orders)
    if denied:
        core.audit(u["name"], "отметка этапа " + stage, act, obj="order " + oid, result="отказ")
        raise Bad("Этот этап вам отмечать нельзя", 403)
    core.audit(u["name"], "этап %s: %s" % (stage, act), o["number"], obj="order " + oid)
    h._json(_order_view(o))
    return True


def _staff_support(h, core, u):
    if not (_is_staff(u)):
        raise Bad("Нет доступа", 403)
    h._json(core.load("interactions")[::-1])
    return True


# ---------------------------------------------------------------- удаление данных (МП-06)
def _account_delete(h, core, user):
    b = h._body()
    if b.get("confirm") is not True:
        raise Bad("Подтвердите удаление")
    with core.lock:
        meta = core.load("uploads_meta")
        mine = [x for x in meta if x.get("user") == user["id"]]
        d = Path(core.data) / "uploads" / re.sub(r"[^\w-]", "_", user["id"])
        shutil.rmtree(d, ignore_errors=True)
        core.save("uploads_meta", [x for x in meta if x.get("user") != user["id"]])
        core.save("projects", [x for x in core.load("projects") if x.get("user") != user["id"]])
        # заказы нужны учёту: оставляем без имени, телефона и адреса
        orders = core.load("orders")
        for o in orders:
            if o.get("customer_id") == user["id"]:
                o.update(name="(удалено)", phone="", address="")
        core.save("orders", orders)
        ints = core.load("interactions")
        for i in ints:
            if i.get("customer_id") == user["id"]:
                i.update(text="(удалено)", messages=[])
        core.save("interactions", ints)
        users = core.load("users")
        guest = any(x.get("id") == user["id"] and x.get("guest") for x in users)
        if guest:                                               # гость — удаляем целиком; тестовую запись оставляем пустой
            core.save("users", [x for x in users if x["id"] != user["id"]])
            core.save("sessions", [x for x in core.load("sessions") if x.get("user") != user["id"]])
    core.audit(user["name"], "удалил данные", "фото: %d" % len(mine), obj="user " + user["id"])
    h._json({"ok": True, "photos_deleted": len(mine), "account_removed": guest})
    return True

