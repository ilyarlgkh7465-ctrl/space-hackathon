#!/usr/bin/env python3
"""Выдуманные данные типографии для пульта: пять источников, связанных общими идентификаторами.

    python3 tools/gen_data.py     →  data/seed/src_*.json и data/seed/decisions.json

Зерно постоянное: у всех участников получается один и тот же набор. Настоящих людей и клиентов здесь нет.
История в данных одна: с конца октября участок сборки не успевает (три вакансии), ламинатор даёт брак,
поддержку заваливают вопросом «где мой заказ», а спрос к Новому году растёт.
"""
import datetime as dt
import json
import random
from pathlib import Path

R = random.Random(2026)
OUT = Path(__file__).resolve().parent.parent / "data" / "seed"
TZ = dt.timezone(dt.timedelta(hours=3))
NOW = dt.datetime(2026, 11, 11, 14, 0, tzinfo=TZ)      # «сейчас» демо-данных
START = dt.datetime(2026, 9, 14, 0, 0, tzinfo=TZ)
SLOW_FROM = dt.datetime(2026, 10, 26, tzinfo=TZ)       # сборка начала отставать
DEFECT_FROM = dt.datetime(2026, 10, 28, tzinfo=TZ)     # ламинатор №2
CARRIER_FROM = dt.datetime(2026, 11, 3, tzinfo=TZ)     # перевозчики перегружены перед праздниками


def iso(d):
    return d.isoformat(timespec="minutes") if d else None


PRODUCTS = [
    {"id": "book_classic", "name": "Фотокнига Classic", "price": (81, 140), "cost": 0.52, "w": 22, "bind": True, "lam": True},
    {"id": "book_premium", "name": "Фотокнига Premium", "price": (100, 220), "cost": 0.50, "w": 14, "bind": True, "lam": True},
    {"id": "book_lite", "name": "Фотокнига Lite", "price": (39, 70), "cost": 0.55, "w": 16, "bind": True, "lam": False},
    {"id": "prints", "name": "Печать фото", "price": (12, 45), "cost": 0.42, "w": 28, "bind": False, "lam": False},
    {"id": "calendar", "name": "Календарь", "price": (25, 48), "cost": 0.48, "w": 6, "bind": True, "lam": False},
    {"id": "album", "name": "Выпускной альбом", "price": (140, 320), "cost": 0.50, "w": 12, "bind": True, "lam": True},
]
CHANNELS = [("site", "Сайт picPac", 46), ("app", "Приложение", 18), ("b2b", "Фотографы", 26), ("social", "Соцсети", 10)]
REGIONS = [("Минск", 44), ("Области Беларуси", 38), ("Россия", 18)]
SECTIONS = {"moderation": "Допечатная подготовка", "print": "Участок печати", "binding": "Участок сборки",
            "quality": "ОТК", "shipping": "Склад отгрузки"}
DEFECT_REASONS = ["ламинация: пузыри", "цвет не совпал с макетом", "обрез со смещением", "склейка блока"]


def pick(pairs):
    total = sum(p[-1] for p in pairs)
    x = R.uniform(0, total)
    for p in pairs:
        x -= p[-1]
        if x <= 0:
            return p
    return pairs[-1]


def gen():
    customers, orders = [], []
    past = []                                  # клиенты, которые уже заказывали
    day = START
    while day <= NOW:
        progress = (day - START).days / max(1, (NOW - START).days)
        growth = 1 + 0.5 * progress ** 1.6      # спрос растёт к праздникам
        weekday = [1.05, 1.0, 1.0, 1.05, 1.1, 0.75, 0.6][day.weekday()]
        n = max(12, round(R.gauss(46 * growth * weekday, 5)))
        for _ in range(n):
            created = day + dt.timedelta(hours=R.uniform(8, 22))
            if created > NOW:
                continue
            repeat = past and (R.random() < (0.44 if created < SLOW_FROM else 0.37) or len(customers) >= 5000)
            if repeat:
                cust = R.choice(past)
            else:
                cust = {"id": "c-%04d" % (len(customers) + 1),
                        "type": "фотограф" if R.random() < 0.22 else "частный",
                        "region": pick(REGIONS)[0], "first_order": iso(created),
                        "contact_hash": "h%06x" % R.getrandbits(24)}
                customers.append(cust)
                past.append(cust)
            weights = []
            for p in PRODUCTS:
                w = p["w"]
                if p["id"] == "calendar":
                    w *= 1 + 1.5 * progress      # календари — к Новому году
                if cust["type"] == "фотограф" and p["id"] in ("album", "book_premium"):
                    w *= 3
                weights.append((p, w))
            prod = pick(weights)[0]
            channel = "b2b" if cust["type"] == "фотограф" and R.random() < 0.8 else pick([c for c in CHANNELS if c[0] != "b2b"])[0]
            qty = 1 if prod["id"] != "prints" else R.choice([20, 30, 50, 80, 100])
            amount = round(R.uniform(*prod["price"]) * (1 if prod["id"] != "prints" else qty / 40), 2)
            if cust["type"] == "фотограф" and prod["id"] == "album":
                qty = R.randint(8, 26)
                amount = round(amount * qty * 0.55, 2)
            cost = round(amount * (prod["cost"] + R.uniform(-0.03, 0.03)), 2)

            slow = created >= SLOW_FROM and prod["bind"]
            t_mod = created + dt.timedelta(hours=R.uniform(0.3, 1.5))
            t_print = t_mod + dt.timedelta(hours=R.uniform(2, 5))
            if prod["bind"]:
                h = R.uniform(2, 4)
                if slow:
                    late_share = 0.035 + 0.05 * min(1, (created - SLOW_FROM).days / 14)
                    h = R.uniform(18, 34) if R.random() < late_share else R.uniform(3, 9)
                t_bind = t_print + dt.timedelta(hours=h)
            else:
                t_bind = t_print
            if R.random() < 0.02:                                   # обычные мелкие задержки
                t_bind += dt.timedelta(hours=R.uniform(16, 26))
            p_def = 0.022
            if created >= DEFECT_FROM and prod["lam"]:
                p_def = 0.09
            defect = R.random() < p_def
            reason = None
            if defect:
                reason = "ламинация: пузыри" if (created >= DEFECT_FROM and prod["lam"] and R.random() < 0.7) else R.choice(DEFECT_REASONS)
                t_bind += dt.timedelta(hours=R.uniform(10, 20))      # перепечатка
            t_q = t_bind + dt.timedelta(hours=R.uniform(0.5, 1.5))
            t_ship = t_q + dt.timedelta(hours=R.uniform(2, 6))
            p_late = 0.16 if created >= CARRIER_FROM else 0.07
            t_deliv = t_ship + dt.timedelta(days=R.uniform(3, 4.5) if R.random() < p_late else R.uniform(0.8, 2))

            stamps = [("accepted", created), ("moderation", t_mod), ("print", t_print), ("binding", t_bind),
                      ("quality", t_q), ("shipped", t_ship), ("done", t_deliv)]
            reached = [(k, t) for k, t in stamps if t <= NOW]
            status = reached[-1][0]
            o = {"id": "o-%05d" % (len(orders) + 1), "customer_id": cust["id"], "product": prod["id"], "qty": qty,
                 "amount": amount, "currency": "BYN", "cost": cost, "channel": channel, "status": status,
                 "defect": bool(defect and t_q <= NOW), "defect_reason": reason if defect and t_q <= NOW else None,
                 "shift": "А" if created.hour < 15 else "Б"}
            for k, t in stamps:
                o["t_" + k] = iso(t) if t <= NOW else None
            orders.append(o)
        day += dt.timedelta(days=1)

    # огрехи данных — чтобы экрану качества данных было что показать
    for o in R.sample(orders, 7):
        o["channel"] = None
    dups = []
    for c in R.sample(customers, 5):
        d = dict(c, id="c-%04d" % (len(customers) + len(dups) + 1))
        dups.append(d)
    customers += dups
    return customers, orders


def tickets(customers, orders):
    topics = [("Где мой заказ", 30), ("Качество печати", 16), ("Оплата", 12), ("Макет и редактор", 24), ("Доставка", 18)]
    chans = [("Telegram", 34), ("Instagram", 26), ("Чат сайта", 24), ("Почта", 16)]
    out = []
    for i in range(640):
        progress = R.random() ** 0.7                         # ближе к концу обращений больше
        created = START + (NOW - START) * progress
        late_period = created >= SLOW_FROM
        tp = pick([(t, w * (2.2 if t == "Где мой заказ" and late_period else 1)) for t, w in topics])[0]
        linked = [o for o in orders if o["t_accepted"] and abs((dt.datetime.fromisoformat(o["t_accepted"]) - created).days) <= 4]
        order = R.choice(linked) if linked and R.random() < 0.72 else None
        resp = R.lognormvariate(2.3, 0.6)                    # минут до первого ответа
        if late_period and R.random() < 0.24:
            resp = R.uniform(32, 95)
        out.append({"id": "t-%04d" % (i + 1), "customer_id": order["customer_id"] if order else R.choice(customers)["id"],
                    "order_id": order["id"] if order else None, "topic": tp, "channel": pick(chans)[0],
                    "created": iso(created), "first_response_min": round(resp, 1), "sla_min": 30,
                    "resolved": created + dt.timedelta(hours=R.uniform(0.5, 30)) <= NOW,
                    "result": R.choice(["решено", "решено", "решено", "перепечатка", "возврат денег"])})
    out.sort(key=lambda t: t["created"])
    return out


def finance(orders):
    months = {}
    for o in orders:
        m = o["t_accepted"][:7]
        x = months.setdefault(m, {"revenue": 0.0, "cogs": 0.0, "n": 0})
        x["revenue"] += o["amount"]
        x["cogs"] += o["cost"]
        x["n"] += 1
    unposted = [o["id"] for o in orders if o["t_accepted"][:7] == "2026-11"][-4:]      # ещё не проведены в учёте
    skip = sum(o["amount"] for o in orders if o["id"] in unposted)
    plan_k = {"2026-09": 1.03, "2026-10": 1.02, "2026-11": 1.09}
    fixed = {"2026-09": (11500, 17000), "2026-10": (21000, 32000), "2026-11": (10500, 12000)}   # маркетинг, аренда и прочее
    rows = []
    for m, x in sorted(months.items()):
        rev_fact = x["revenue"] - (skip if m == "2026-11" else 0)
        mk, rent = fixed[m]
        parts = [("Выручка", "доход", x["revenue"] * plan_k[m], rev_fact),
                 ("Материалы", "расход", x["cogs"] * 0.56, x["cogs"] * (0.58 if m != "2026-11" else 0.63)),
                 ("Оплата труда", "расход", x["cogs"] * 0.30, x["cogs"] * (0.30 if m != "2026-11" else 0.33)),
                 ("Логистика", "расход", x["cogs"] * 0.12, x["cogs"] * 0.12),
                 ("Маркетинг", "расход", mk, mk * (1.0 if m != "2026-11" else 1.12)),
                 ("Аренда и прочее", "расход", rent, rent)]
        for name, kind, plan, fact in parts:
            rows.append({"month": m, "article": name, "kind": kind, "plan": round(plan, 2), "fact": round(fact, 2), "currency": "BYN"})
    cash = []
    for m, x in sorted(months.items()):
        cash.append({"month": m, "inflow_plan": round(x["revenue"] * plan_k[m] * 0.97, 2), "inflow_fact": round(x["revenue"] * 0.95, 2),
                     "outflow_plan": round(x["cogs"] * 1.05 + sum(fixed[m]), 2), "outflow_fact": round(x["cogs"] * 1.1 + sum(fixed[m]), 2),
                     "currency": "BYN"})
    return {"pnl": rows, "cash": cash, "unposted_orders": unposted, "note": "С 14.09.2026 — начало тестового набора"}


def hr():
    depts = [
        {"dept": "production", "name": "Производство", "plan": 176, "fact": 169, "sections": [
            {"id": "moderation", "name": "Допечатная подготовка", "plan": 34, "fact": 33},
            {"id": "print", "name": "Участок печати", "plan": 52, "fact": 52},
            {"id": "lamination", "name": "Ламинация", "plan": 18, "fact": 17},
            {"id": "binding", "name": "Участок сборки", "plan": 36, "fact": 31},
            {"id": "quality", "name": "ОТК", "plan": 16, "fact": 16},
            {"id": "shipping", "name": "Склад отгрузки", "plan": 20, "fact": 20}]},
        {"dept": "sales", "name": "Продажи и маркетинг", "plan": 28, "fact": 27},
        {"dept": "support", "name": "Поддержка клиентов", "plan": 24, "fact": 22},
        {"dept": "logistics", "name": "Логистика", "plan": 22, "fact": 22},
        {"dept": "finance", "name": "Финансы и бухгалтерия", "plan": 14, "fact": 14},
        {"dept": "hr", "name": "Персонал", "plan": 6, "fact": 6},
        {"dept": "admin", "name": "Администрация и ИТ", "plan": 30, "fact": 30},
    ]
    vacancies = [
        {"id": "v-01", "dept": "production", "section": "binding", "title": "Сборщик фотокниг", "opened": "2026-10-19"},
        {"id": "v-02", "dept": "production", "section": "binding", "title": "Сборщик фотокниг", "opened": "2026-10-22"},
        {"id": "v-03", "dept": "production", "section": "binding", "title": "Мастер участка сборки (смена Б)", "opened": "2026-11-02"},
        {"id": "v-09", "dept": "production", "section": "binding", "title": "Сборщик фотокниг", "opened": "2026-10-26"},
        {"id": "v-10", "dept": "production", "section": "binding", "title": "Сборщик фотокниг", "opened": "2026-11-04"},
        {"id": "v-04", "dept": "production", "section": "moderation", "title": "Оператор допечатной подготовки", "opened": "2026-10-28"},
        {"id": "v-05", "dept": "production", "section": "lamination", "title": "Оператор ламинатора", "opened": "2026-11-05"},
        {"id": "v-06", "dept": "support", "section": None, "title": "Специалист поддержки", "opened": "2026-10-30"},
        {"id": "v-07", "dept": "support", "section": None, "title": "Специалист поддержки", "opened": "2026-11-06"},
        {"id": "v-08", "dept": "sales", "section": None, "title": "Менеджер по работе с фотографами", "opened": "2026-11-03"},
    ]
    absences = [
        {"dept": "production", "section": "binding", "kind": "больничный", "people": 3},
        {"dept": "production", "section": "print", "kind": "отпуск", "people": 2},
        {"dept": "production", "section": "moderation", "kind": "больничный", "people": 1},
        {"dept": "support", "section": None, "kind": "больничный", "people": 2},
        {"dept": "sales", "section": None, "kind": "отпуск", "people": 1},
        {"dept": "logistics", "section": None, "kind": "отпуск", "people": 1},
    ]
    # дневная мощность производства в заказах; с 26.10 сборка не тянет полную
    capacity = {"normal_per_day": 72.0, "current_per_day": 66.0, "since": "2026-10-26",
                "bottleneck": "binding", "note": "мощность ограничена участком сборки"}
    return {"depts": depts, "vacancies": vacancies, "absences": absences, "capacity": capacity}


def hr_moves():
    """Движение персонала и табель: приём, увольнение, явка по дням."""
    R2 = random.Random(77)
    places = [("production", "binding", 9), ("production", "print", 5), ("production", "moderation", 4), ("production", "lamination", 2),
              ("production", "shipping", 3), ("support", None, 5), ("sales", None, 3), ("logistics", None, 2), ("admin", None, 1)]
    moves, d = [], START
    while d <= NOW:
        late = d >= dt.datetime(2026, 10, 12, tzinfo=TZ)
        for kind, p_day in (("принят", 0.36), ("уволен", 0.52 if late else 0.3)):
            if R2.random() < p_day:
                w = [(x, x[2] * (2.2 if kind == "уволен" and x[1] == "binding" and late else 1)) for x in places]
                tot, r = sum(v for _, v in w), R2.uniform(0, sum(v for _, v in w))
                for x, v in w:
                    r -= v
                    if r <= 0:
                        break
                moves.append({"date": d.date().isoformat(), "dept": x[0], "section": x[1], "kind": kind,
                              "reason": None if kind == "принят" else R2.choice(["по собственному желанию", "по собственному желанию", "окончание договора", "переезд"])})
        d += dt.timedelta(days=1)
    plan = {"binding": 36, "print": 52, "moderation": 34, "lamination": 18, "quality": 16, "shipping": 20,
            "sales": 28, "support": 24, "logistics": 22, "finance": 14, "hr": 6, "admin": 30}
    sheet, d = [], START
    while d <= NOW:
        if d.weekday() < 6:
            for sec, n in plan.items():
                miss = R2.choice([0, 0, 1, 1, 2]) if n > 14 else R2.choice([0, 0, 0, 1])
                if sec == "binding" and d >= SLOW_FROM:
                    miss = R2.choice([5, 6, 6, 7, 8])
                if sec == "support" and d >= SLOW_FROM:
                    miss = R2.choice([2, 3, 3, 4])
                sheet.append({"date": d.date().isoformat(), "section": sec, "planned": n, "present": n - miss})
        d += dt.timedelta(days=1)
    return {"moves": moves, "timesheet": sheet}


def accounting(months_rev):
    """Бухгалтерия: остатки на начало и конец месяца, расчёты с контрагентами."""
    R3 = random.Random(31)
    bal, cash, recv, pay = [], 86000.0, 41000.0, 37000.0
    for m in sorted(months_rev):
        rev = months_rev[m]
        c2 = cash + rev * 0.07 - (9000 if m == "2026-11" else 0)
        r2 = recv + rev * (0.05 if m != "2026-11" else 0.16)
        p2 = pay + rev * 0.03
        bal.append({"month": m, "cash_start": round(cash), "cash_end": round(c2), "receivable_start": round(recv), "receivable_end": round(r2),
                    "payable_start": round(pay), "payable_end": round(p2), "currency": "BYN"})
        cash, recv, pay = c2, r2, p2
    parts = []
    for i in range(1, 12):
        debt = round(R3.uniform(1800, 9500))
        od = R3.choice([0, 0, 0, 6, 12, 19, 34]) if i > 3 else R3.choice([21, 34, 47])
        parts.append({"id": "k-%03d" % i, "name": "Фотостудия %03d" % (R3.randint(11, 97) * 10 + i), "kind": "покупатель", "debt": debt,
                      "overdue_days": od, "overdue_sum": round(debt * R3.uniform(0.4, 1.0)) if od else 0, "currency": "BYN"})
    for i, nm in enumerate(["Поставщик бумаги 02", "Поставщик расходных материалов 05", "Служба доставки 01", "Служба доставки 03", "Аренда помещений"], 12):
        parts.append({"id": "k-%03d" % i, "name": nm, "kind": "поставщик", "debt": -round(R3.uniform(2500, 14000)),
                      "overdue_days": R3.choice([0, 0, 0, 4]), "overdue_sum": 0, "currency": "BYN"})
    return {"balances": bal, "counterparties": parts}


def office():
    """Делопроизводство: реестр документов и поручений со сроками."""
    R4 = random.Random(58)
    kinds = [("Входящее письмо", 30), ("Договор", 18), ("Счёт", 22), ("Служебная записка", 16), ("Приказ", 8), ("Претензия клиента", 6)]
    depts = ["production", "sales", "support", "logistics", "finance", "hr"]
    docs = []
    for i in range(1, 181):
        reg = START + (NOW - START) * R4.random()
        kind = pick([(k, w) for k, w in kinds])[0] if False else None
        x, r = None, R4.uniform(0, sum(w for _, w in kinds))
        for k, w in kinds:
            r -= w
            if r <= 0:
                x = k
                break
        dept = R4.choice(depts)
        due = reg + dt.timedelta(days=R4.choice([3, 3, 5, 5, 7]))
        slow = reg >= SLOW_FROM and dept in ("production", "hr")
        took = R4.uniform(0.3, 3.3) * (2.1 if slow else 1)
        done = reg + dt.timedelta(days=took)
        docs.append({"id": "doc-%04d" % i, "kind": x or "Входящее письмо", "dept": dept, "registered": iso(reg), "due": iso(due),
                     "done": iso(done) if done <= NOW else None})
    docs.sort(key=lambda d: d["registered"])
    return {"documents": docs}


def app_funnels():
    steps = [("catalog", "Каталог"), ("photos", "Выбор фото"), ("layout", "Макет"), ("check", "Проверка"), ("cart", "Корзина"), ("paid", "Оплата")]
    weeks = []
    d = START
    i = 0
    while d <= NOW:
        base_app = int(380 + 60 * i + R.uniform(-30, 30))
        base_site = int(980 + 55 * i + R.uniform(-50, 50))
        layout_drop = 0.66 if d < dt.datetime(2026, 10, 26, tzinfo=TZ) else 0.47     # новый редактор макета отпугивает
        ra = [1, 0.62, 0.62 * layout_drop, 0.62 * layout_drop * 0.66, 0.62 * layout_drop * 0.66 * 0.8, 0.62 * layout_drop * 0.66 * 0.8 * 0.74]
        rs = [1, 0.48, 0.34, 0.25, 0.2, 0.155]
        weeks.append({"week": d.date().isoformat(),
                      "app": {s[0]: int(base_app * r * R.uniform(0.96, 1.04)) for s, r in zip(steps, ra)},
                      "site": {s[0]: int(base_site * r * R.uniform(0.97, 1.03)) for s, r in zip(steps, rs)}})
        d += dt.timedelta(days=7)
        i += 1
    return {"steps": [{"id": a, "name": b} for a, b in steps], "weeks": weeks}


def decisions():
    def h(ts, who, text):
        return {"ts": ts, "who": who, "change": text}
    return [
        {"id": "d-101", "ts": "2026-10-27T09:40+03:00", "title": "Закрыть вакансии на участке сборки",
         "problem": "Заказы в срок упали ниже 96 %: участок сборки не успевает", "impact": "Каждый день задержки — около 30 заказов позже обещанного срока",
         "cause": "Две вакансии сборщиков открыты с 19 и 22 октября", "action": "Закрыть две вакансии; до выхода людей — подработка смены печати",
         "owner": "Рудая О. В.", "owner_id": "u-hr", "dept": "hr", "kpi": "on_time", "due": "2026-11-05", "priority": "высокий",
         "status": "в работе", "author": "Орлова А. В.",
         "history": [h("2026-10-27T09:40+03:00", "Орлова А. В.", "создано"), h("2026-10-28T11:05+03:00", "Рудая О. В.", "статус: новое → в работе"),
                     h("2026-11-04T17:20+03:00", "Рудая О. В.", "комментарий: два кандидата на собеседовании 10.11")]},
        {"id": "d-102", "ts": "2026-11-09T10:15+03:00", "title": "Внеплановое обслуживание ламинатора №2",
         "problem": "Брак на ламинированных книгах вырос втрое", "impact": "Перепечатка съедает до 20 часов на заказ и бьёт по сроку",
         "cause": "Пузыри при ламинации с 28 октября", "action": "Остановить ламинатор №2 на обслуживание, заказы перевести на №1",
         "owner": "Гринь Д. А.", "owner_id": "u-prod", "dept": "production", "kpi": "defect", "due": "2026-11-13", "priority": "высокий",
         "status": "новое", "author": "Орлова А. В.", "history": [h("2026-11-09T10:15+03:00", "Орлова А. В.", "создано")]},
        {"id": "d-103", "ts": "2026-11-05T15:30+03:00", "title": "Ответ на «Где мой заказ» со ссылкой на статус",
         "problem": "Треть обращений — вопрос о статусе заказа", "impact": "Очередь в поддержке, первый ответ дольше 30 минут",
         "cause": "Клиент не видит этап заказа", "action": "Готовый ответ со ссылкой на статусную ленту; статус — в приложении",
         "owner": "Климович Е. П.", "owner_id": "u-sup", "dept": "support", "kpi": "sla", "due": "2026-11-12", "priority": "средний",
         "status": "на проверке", "author": "Климович Е. П.",
         "history": [h("2026-11-05T15:30+03:00", "Климович Е. П.", "создано"), h("2026-11-10T12:00+03:00", "Климович Е. П.", "статус: в работе → на проверке")]},
        {"id": "d-104", "ts": "2026-10-12T09:00+03:00", "title": "Субботняя смена печати помогает сборке",
         "problem": "По понедельникам очередь на сборку вдвое больше обычной", "impact": "Понедельничные заказы уходили на день позже",
         "cause": "В субботу сборка работает половиной состава", "action": "Четыре человека с печати по субботам выходят на сборку",
         "owner": "Гринь Д. А.", "owner_id": "u-prod", "dept": "production", "kpi": "lead_time", "due": "2026-10-19", "priority": "средний",
         "status": "закрыто", "author": "Гринь Д. А.", "effect": "Очередь по понедельникам: 38 → 21 заказ",
         "history": [h("2026-10-12T09:00+03:00", "Гринь Д. А.", "создано"), h("2026-10-19T18:00+03:00", "Гринь Д. А.", "статус: в работе → на проверке"),
                     h("2026-10-26T10:00+03:00", "Орлова А. В.", "проверено повторно: эффект подтверждён, закрыто")]},
    ]


def main():
    customers, orders = gen()
    tk = tickets(customers, orders)
    fin = finance(orders)
    months_rev = {r["month"]: r["fact"] for r in fin["pnl"] if r["article"] == "Выручка"}
    files = {
        "src_crm": {"system": "CRM (Битрикс24)", "synced": "2026-11-11T13:52+03:00", "customers": customers},
        "src_erp": {"system": "ERP производства", "synced": "2026-11-11T13:58+03:00", "products": [
            {"id": p["id"], "name": p["name"]} for p in PRODUCTS], "channels": [{"id": c[0], "name": c[1]} for c in CHANNELS],
            "sections": SECTIONS, "orders": orders},
        "src_support": {"system": "Поддержка (омниканал)", "synced": "2026-11-11T13:55+03:00", "tickets": tk},
        "src_1c": dict({"system": "1С: финансы и бухгалтерия", "synced": "2026-11-11T07:00+03:00"}, **fin, **accounting(months_rev)),
        "src_hr": dict({"system": "HR: персонал", "synced": "2026-11-10T18:30+03:00"}, **hr(), **hr_moves()),
        "src_office": dict({"system": "Делопроизводство: реестр документов", "synced": "2026-11-11T13:40+03:00"}, **office()),
        "src_web": dict({"system": "Сайт и приложение", "synced": "2026-11-11T13:59+03:00"}, **app_funnels()),
        "decisions": decisions(),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUT / (name + ".json")).write_text(json.dumps(data, ensure_ascii=False, indent=None, separators=(",", ":")), encoding="utf-8")
    print("заказов: %d, клиентов: %d, обращений: %d" % (len(orders), len(customers), len(tk)))


if __name__ == "__main__":
    main()
