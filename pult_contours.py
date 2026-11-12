"""Контуры отделов: у каждого руководителя свой экран — под его боли, а не по общему шаблону.

Контур изолирован: руководитель видит только свой отдел, чужой контур по прямому адресу — отказ и запись в журнал.
Все контуры видит директор (и аналитик — только чтение, как в брифе).

  GET /api/pult/contour?dept=production&days=14   — экран отдела: показатели, отклонения и «боли» с цифрами

Каждая «боль» — вопрос, который руководитель задаёт себе каждый день, и ответ на него из данных:
  {id, title, status, big: [{label, value, unit, st}], bars|table|pairs|list, note, source, kpi, by}
"""
import calendar
import datetime as dt
import statistics

import pult_api as A

ACCESS = {"production": "руководитель производства", "sales": "руководитель продаж и маркетинга", "support": "руководитель поддержки",
          "logistics": "руководитель логистики", "finance": "руководитель финансов", "hr": "руководитель по персоналу",
          "office": "руководитель делопроизводства"}
FOCUS = {
    "production": "Справляемся ли за один день, где копится очередь и почему брак.",
    "sales": "Делаем ли план месяца, где теряем клиентов и кто не вернулся.",
    "support": "Успеваем ли отвечать и во что обходятся ошибки производства и доставки.",
    "logistics": "Доставляем ли за 48 часов, что зависло в пути и куда везём дольше.",
    "finance": "Сколько денег, кто не платит и где уходит маржа.",
    "hr": "Кто пришёл и ушёл, кто не вышел на смену и какие вакансии горят.",
    "office": "Что горит по срокам, кто срывает исполнение и где претензии клиентов.",
}


def _big(label, value, unit="", st="none"):
    return {"label": label, "value": A._r(value) if isinstance(value, (int, float)) else value, "unit": unit, "st": st}


COUNT_UNITS = {
    "заказов": ("заказ", "заказа", "заказов"),
    "обращений": ("обращение", "обращения", "обращений"),
    "клиентов": ("клиент", "клиента", "клиентов"),
    "документов": ("документ", "документа", "документов"),
}


def _tile(pain, label, value, unit="", when="За период", status="none"):
    if unit in COUNT_UNITS and value is not None:
        form = 2
        if not 11 <= value % 100 <= 14:
            last = value % 10
            form = 0 if last == 1 else 1 if 2 <= last <= 4 else 2
        unit = COUNT_UNITS[unit][form]
    return dict(_big(label, value, unit, status), pain=pain["id"], when=when)


def _worse(value, plan, direction, tol):
    """Цвет числа: хуже плана больше чем на tol — плохо, хуже — внимание."""
    if value is None or plan is None:
        return "none"
    gap = (plan - value) * direction
    return "bad" if gap > tol else "warn" if gap > 0 else "ok"


def _days(b, n):
    t = b.replace(hour=0, minute=0)
    return [(t - dt.timedelta(days=i), t - dt.timedelta(days=i - 1)) for i in range(n - 1, -1, -1)]


def _in(product):
    return lambda o: not product or o["product"] == product


# ---------------------------------------------------------------- производство

def _production(P, user, cur, prev, a, b, days, product):
    ok = _in(product)
    O = [o for o in P["orders"] if ok(o)]
    today = b.replace(hour=0, minute=0)
    came = sum(1 for o in O if o["d_accepted"] >= today)
    out = sum(1 for o in O if o["d_quality"] and o["d_quality"] >= today)
    pairs = [{"day": d0.date().isoformat(), "a": sum(1 for o in O if d0 <= o["d_accepted"] < d1),
              "b": sum(1 for o in O if o["d_quality"] and d0 <= o["d_quality"] < d1)} for d0, d1 in _days(b, min(days, 14))]
    tin, tout = sum(p["a"] for p in pairs), sum(p["b"] for p in pairs)
    late = sum(1 for o in O if o["d_quality"] and a <= o["d_quality"] < b
               and A._h(o["d_accepted"], o["d_quality"]) > 24)
    p1 = {"id": "oneday", "title": "Справляемся за один день?", "status": _worse(cur["on_time"], A.PLAN["on_time"], 1, 3),
          "big": [_big("Пришло сегодня к %s" % b.strftime("%H:%M"), came), _big("Выдано после ОТК сегодня", out),
                  _big("Сделано за сутки", cur["on_time"], "%", _worse(cur["on_time"], A.PLAN["on_time"], 1, 3)),
                  _big("Изготовлены дольше суток за период", late, "заказов")],
          "pairs": pairs, "pair_names": ["пришло", "выдано"],
          "note": "За %d дн. пришло %d заказов, выдано после ОТК %d — %s." % (
              len(pairs), tin, tout, "очередь выросла на %d" % (tin - tout) if tin > tout else "очередь не растёт"),
          "kpi": "on_time", "by": "day", "source": "ERP: отметки этапов"}

    q = A._queue(P, product)
    sec = {s["id"]: s for d in P["hr"]["depts"] for s in d.get("sections", [])}
    absent = {}
    for x in P["hr"]["absences"]:
        if x["section"]:
            absent[x["section"]] = absent.get(x["section"], 0) + x["people"]
    rows = []
    for st in ("moderation", "print", "binding", "quality", "shipping"):
        s = sec.get(st, {})
        rows.append([A.STAGE_NAMES[st], q[st]["count"], q[st]["stuck"], A._fmt(A.NORMS[st]) + " ч",
                     "%s из %s" % (s.get("fact", 0) - absent.get(st, 0), s.get("plan", "—")) if s else "—"])
    bn = A._bottleneck(P, product, {"all": True, "dept": None})
    p2 = {"id": "queue", "title": "Где копится очередь прямо сейчас?", "status": "bad" if bn and not bn.get("ok") else "ok",
          "table": {"cols": ["Участок", "В очереди", "Дольше нормы", "Норма", "Людей сегодня"], "rows": rows, "num": [1, 2, 3, 4],
                    "hot": [i for i, r in enumerate(rows) if bn and not bn.get("ok") and r[0] == bn.get("name")]},
          "note": (bn.get("text", "") + (" " + bn["advice"] if bn.get("advice") else "")) if bn else "",
          "kpi": "on_time", "by": "stage", "source": "ERP: отметки этапов · HR: штат и отсутствия"}

    fake = {"role": "director"}
    rs, _ = A.drill(P, fake, "defect", "reason", days, product)
    sh, _ = A.drill(P, fake, "defect", "shift", days, product)
    cost = sum(o["cost"] for o in O if a <= o["d_accepted"] < b and o["defect"])
    worst_shift = min(sh["rows"], key=lambda r: -(r["value"] or 0)) if sh and sh["rows"] else None
    p3 = {"id": "defect", "title": "Почему брак?", "status": _worse(cur["defect"], A.PLAN["defect"], -1, 1.5),
          "big": [_big("Брак и перепечатка", cur["defect"], "%", _worse(cur["defect"], A.PLAN["defect"], -1, 1.5)),
                  _big("Перепечатки стоили", cost, "BYN", "bad" if cost else "ok"),
                  _big("Хуже всех смена", worst_shift["name"].replace("Смена ", "") if worst_shift else "—", "",
                       "warn" if worst_shift else "none")],
          "bars": [{"name": r["name"], "value": r["value"], "unit": "% брака", "count": r["count"]} for r in (rs or {}).get("rows", [])[:5]],
          "note": (rs or {}).get("note", ""), "kpi": "defect", "by": "reason", "source": "ERP: контроль качества · 1С: себестоимость"}

    fc = A.forecast(P, user)
    p4 = {"id": "season", "title": "Хватит ли мощности в сезон?", "status": "bad" if fc["deficit_week"] else "ok",
          "weeks": fc["weeks"],
          "note": ("С недели %s спрос превысит мощность на %d заказов. Ограничение — «%s»: %s." % (
              A._fmt(None) if not fc["deficit_week"] else fc["deficit_week"][8:10] + "." + fc["deficit_week"][5:7],
              next(w["gap"] for w in fc["weeks"] if w["week"] == fc["deficit_week"]), fc["bottleneck"], fc["note"])
                   if fc["deficit_week"] else "Мощности хватает на все шесть недель."),
          "source": fc["source"]}
    waiting = sum(row[2] for row in rows)
    return [p1, p2, p3, p4], [
        _tile(p1, "Прошли ОТК", cur["produced"], "заказов"),
        _tile(p1, "Изготовлены дольше суток", late, "заказов", status="warn" if late else "ok"),
        _tile(p2, "Застряли на участках", waiting, "заказов", "Сейчас · дольше нормы", "bad" if waiting else "ok"),
    ]


# ---------------------------------------------------------------- продажи и маркетинг

def _sales(P, user, cur, prev, a, b, days, product):
    ok = _in(product)
    m0 = b.replace(day=1, hour=0, minute=0)
    mtd = sum(o["amount"] for o in P["orders"] if o["d_accepted"] >= m0 and ok(o))
    dim = calendar.monthrange(b.year, b.month)[1]
    elapsed = max(0.5, A._h(m0, b) / 24)
    plan_td = A._rev_plan(P, m0, b) if not product else None                    # план с 1-го числа по сегодня — из 1С, разложен по дням
    plan_m = plan_td / elapsed * dim if plan_td else None
    fcast = mtd / elapsed * dim
    st = _worse(fcast, plan_m, 1, (plan_m or 0) * 0.03)
    p1 = {"id": "plan", "title": "Делаем план месяца?", "status": st,
          "big": [_big("Выручка за выбранный период", cur["revenue"], "BYN"), _big("Выручка с 1-го числа", mtd, "BYN"), _big("План месяца", plan_m, "BYN"),
                  _big("Прогноз на конец месяца", fcast, "BYN", st)],
          "note": ("По нынешнему темпу (%s BYN в день) месяц закроется на %s %% плана%s." % (
              A._fmt(mtd / elapsed), A._fmt(100 * fcast / plan_m) if plan_m else "—",
              "" if not plan_m or fcast >= plan_m else ": чтобы догнать, нужно по %s BYN в день до конца месяца" % (
                  A._fmt((plan_m - mtd) / max(1, dim - elapsed))))) if plan_m else "План выручки доступен по всем продуктам вместе.",
          "kpi": "revenue", "by": "day", "source": "ERP: заказы · план — 1С"}

    fake = {"role": "director"}
    stp, _ = A.drill(P, fake, "app_conv", "step", days, product)
    rows = (stp or {}).get("rows", [])
    p2 = {"id": "funnel", "title": "Где теряем клиентов в приложении?", "status": "warn" if (stp or {}).get("note") else "ok",
          "funnel": [{"name": r["name"], "count": r["count"], "pass": r.get("pass"), "pass_prev": r.get("pass_prev")} for r in rows],
          "note": (stp or {}).get("note", ""), "kpi": "app_conv", "by": "step", "source": "Сайт и приложение: шаги клиента"}

    by_c = {}
    for o in P["orders"]:
        by_c.setdefault(o["customer_id"], []).append(o)
    lost, lost_ph, lost_sum = 0, 0, 0.0
    for cid, os_ in by_c.items():
        if len(os_) == 1 and ok(os_[0]) and b - dt.timedelta(days=90) <= os_[0]["d_accepted"] < b - dt.timedelta(days=30):
            lost += 1
            lost_sum += os_[0]["amount"]
            lost_ph += os_[0]["client"] == "фотограф"
    p3 = {"id": "return", "title": "Возвращаются ли клиенты?", "status": _worse(cur["repeat"], A.PLAN["repeat"], 1, 5),
          "big": [_big("Повторные заказы", cur["repeat"], "%", _worse(cur["repeat"], A.PLAN["repeat"], 1, 5)),
                  _big("Не вернулись после первого заказа", lost, "клиентов", "warn" if lost else "ok"),
                  _big("из них фотографов", lost_ph, "")],
          "note": "Сделали один заказ 30–90 дней назад и пропали: %d клиентов, первый заказ на %s BYN в сумме. "
                  "Это готовый список для предложения — сегментов и скидок у компании пока нет." % (lost, A._fmt(lost_sum)),
          "kpi": "repeat", "by": "client", "source": "CRM: клиенты · ERP: заказы"}

    ch, _ = A.drill(P, fake, "revenue", "channel", days, product)
    p4 = {"id": "channels", "title": "Какие каналы приносят деньги?", "status": "none",
          "bars": [{"name": r["name"], "value": r["value"], "unit": "BYN",
                    "delta": (100 * (r["value"] - r["prev"]) / r["prev"]) if r.get("prev") else None} for r in (ch or {}).get("rows", [])],
          "note": (ch or {}).get("note", ""), "kpi": "revenue", "by": "channel", "source": "ERP: заказы"}
    lost_at_checkout = rows[0]["count"] - rows[-1]["count"] if len(rows) > 1 else None
    return [p1, p2, p3, p4], [
        _tile(p1, "Выручка", cur["revenue"], "BYN"),
        _tile(p2, "Не дошли до оплаты", lost_at_checkout, "", "За период · воронка всех продуктов"),
        _tile(p3, "Не вернулись после первой покупки", lost, "клиентов", "Первая покупка 30–90 дней назад", "warn" if lost else "ok"),
    ]


# ---------------------------------------------------------------- поддержка клиентов

def _support(P, user, cur, prev, a, b, days, product):
    T = [t for t in P["tickets"] if a <= t["d"] < b and (not product or t["product"] == product)]
    Tp = [t for t in P["tickets"] if a - dt.timedelta(days=days) <= t["d"] < a and (not product or t["product"] == product)]
    med = statistics.median(t["first_response_min"] for t in T) if T else None
    grow = 100 * (len(T) - len(Tp)) / len(Tp) if Tp else None
    p1 = {"id": "sla", "title": "Успеваем ответить?", "status": _worse(cur["sla"], A.PLAN["sla"], 1, 6),
          "big": [_big("Ответ в срок (30 мин)", cur["sla"], "%", _worse(cur["sla"], A.PLAN["sla"], 1, 6)),
                  _big("Медиана первого ответа", med, "мин"),
                  _big("Обращений в день", len(T) / max(1, days), "", "warn" if grow and grow > 15 else "none")],
          "note": "Обращений стало больше на %s %% к прошлому периоду — а людей в поддержке 22 из 24, двое на больничном." % A._fmt(grow)
          if grow and grow > 0 else "Поток обращений не вырос.",
          "kpi": "sla", "by": "day", "source": "Поддержка: обращения (действующая система клиентского сервиса)"}

    fake = {"role": "director"}
    tp, _ = A.drill(P, fake, "sla", "topic", days, product)
    p2 = {"id": "topics", "title": "О чём пишут и где не успеваем?", "status": "none",
          "table": {"cols": ["Тема", "Обращений", "Доля", "В срок"], "num": [1, 2, 3],
                    "rows": [[r["name"], r["count"], A._fmt(r["share"]) + " %", A._fmt(r["value"]) + " %"] for r in (tp or {}).get("rows", [])],
                    "hot": [i for i, r in enumerate((tp or {}).get("rows", [])) if (r["value"] or 100) < A.PLAN["sla"] - 10]},
          "note": (tp or {}).get("note", ""), "kpi": "sla", "by": "topic", "source": "Поддержка: обращения"}

    orders = {o["id"]: o for o in P["orders"]}
    refund = [t for t in T if t["result"] == "возврат денег"]
    reprint = [t for t in T if t["result"] == "перепечатка"]
    money = sum((orders.get(t["order_id"]) or {}).get("amount", 0) for t in refund)
    rcost = sum((orders.get(t["order_id"]) or {}).get("cost", 0) for t in reprint)
    p3 = {"id": "money", "title": "Во что обходятся ошибки?", "status": "bad" if refund or reprint else "ok",
          "big": [_big("Вернули деньги", len(refund), "раз", "bad" if refund else "ok"), _big("Сумма возвратов", money, "BYN", "bad" if money else "ok"),
                  _big("Перепечатали по жалобам", len(reprint), "раз", "warn" if reprint else "ok")],
          "note": "Себестоимость перепечаток по жалобам — %s BYN. Это деньги, которые теряются после производства, а не в поддержке." % A._fmt(rcost),
          "source": "Поддержка: итоги обращений · ERP: суммы заказов"}

    wm = [t for t in T if t["topic"] == "Где мой заказ" and t.get("order_id") in orders]
    cause = {"Задержка на производстве": 0, "Задержка в доставке": 0, "Заказ шёл в срок": 0}
    for t in wm:
        o = orders[t["order_id"]]
        if o["d_quality"] and A._h(o["d_accepted"], o["d_quality"]) > 24:
            cause["Задержка на производстве"] += 1
        elif o["d_shipped"] and ((o["d_done"] and A._h(o["d_shipped"], o["d_done"]) > 48) or (not o["d_done"] and A._h(o["d_shipped"], b) > 48)):
            cause["Задержка в доставке"] += 1
        else:
            cause["Заказ шёл в срок"] += 1
    n = max(1, len(wm))
    top = max(cause, key=cause.get)
    p4 = {"id": "where", "title": "«Где мой заказ?» — из-за кого?", "status": "warn" if wm else "none",
          "bars": [{"name": k, "value": 100 * v / n, "unit": "%", "count": v} for k, v in cause.items()] if wm else [],
          "note": (("%s %% спрашивают о заказах, которые идут в срок: клиенту просто не хватает статуса. Уведомления о статусе в приложении "
                   "снимут эти обращения без найма людей." % A._fmt(100 * cause["Заказ шёл в срок"] / n)) if top == "Заказ шёл в срок" else
                  "Из %d обращений «где мой заказ» чаще всего причина — %s: ответ на них — не скорость поддержки, а сроки в %s." % (
                      len(wm), top.lower(), "производстве" if "производ" in top else "доставке")) if wm else "",
          "source": "Поддержка: обращения · ERP: отметки этапов"}
    unresolved = sorted((t for t in P["tickets"] if t["d"] < b and not t["resolved"]
                         and (not product or t["product"] == product)), key=lambda t: t["d"])
    aged = sum(1 for t in unresolved if A._h(t["d"], b) >= 24)
    oldest = unresolved[:8]
    p5 = {"id": "backlog", "title": "Какие обращения ждут решения?", "status": "warn" if aged else "ok",
          "big": [_big("Открыто", len(unresolved)), _big("Открыто не меньше суток", aged)],
          "table": {"cols": ["Обращение", "Тема", "Канал", "Открыто, ч"], "num": [3],
                    "rows": [[t["id"], t["topic"], t["channel"], A._fmt(A._h(t["d"], b))] for t in oldest],
                    "hot": [i for i, t in enumerate(oldest) if A._h(t["d"], b) >= 24]},
          "note": "В таблице восемь обращений, которые ждут дольше всего." if len(unresolved) > len(oldest) else "",
          "source": "Поддержка: обращения"}
    late = sum(1 for t in T if t["first_response_min"] > t["sla_min"])
    return [p1, p2, p5, p3, p4], [
        _tile(p1, "Решено из поступивших", sum(1 for t in T if t["resolved"]), "обращений"),
        _tile(p2, "Первый ответ позже нормы", late, "обращений", status="warn" if late else "ok"),
        _tile(p5, "Открыто не меньше суток", aged, "обращений", "Сейчас", "warn" if aged else "ok"),
    ]


# ---------------------------------------------------------------- логистика

def _logistics(P, user, cur, prev, a, b, days, product):
    ok = _in(product)
    D = [o for o in P["orders"] if o["d_done"] and o["d_shipped"] and a <= o["d_done"] < b and ok(o)]
    late_total = sum(1 for o in D if A._h(o["d_shipped"], o["d_done"]) > 48)
    in_time = 100 * (len(D) - late_total) / len(D) if D else None
    med = statistics.median(A._h(o["d_shipped"], o["d_done"]) for o in D) if D else None
    region = {c["id"]: c["region"] for c in P["crm"]["customers"]}
    recent = sorted(D, key=lambda o: o["d_done"], reverse=True)[:8]
    transit = [o for o in P["orders"] if o["status"] == "shipped" and o["d_shipped"] and ok(o)]
    stuck = [o for o in transit if A._h(o["d_shipped"], b) > 48]
    p1 = {"id": "48h", "title": "Доставляем за 48 часов?", "status": _worse(in_time, A.PLAN["delivery"], 1, 5),
          "big": [_big("Доставлено за период", len(D), "заказов"),
                  _big("Доставлено в срок", in_time, "%", _worse(in_time, A.PLAN["delivery"], 1, 5)),
                  _big("Медиана доставки", med, "ч")],
          "table": {"cols": ["Заказ", "Регион", "Вручён", "Доставка, ч"], "num": [3],
                    "rows": [[o["id"], region.get(o["customer_id"], "не указан"), o["d_done"].strftime("%d.%m %H:%M"),
                              A._fmt(A._h(o["d_shipped"], o["d_done"]))] for o in recent],
                    "hot": [i for i, o in enumerate(recent) if A._h(o["d_shipped"], o["d_done"]) > 48]},
          "note": "Считаем по дате вручения заказа. Срок доставки — 48 часов после отгрузки."
                  + (" В таблице восемь последних доставок." if len(D) > len(recent) else ""),
          "kpi": "delivery", "by": "client", "source": "ERP: отгрузка · перевозчики"}

    pairs = []
    for d0, d1 in _days(b, min(days, 14)):
        dd = [o for o in D if d0 <= o["d_done"] < d1]
        late = sum(1 for o in dd if A._h(o["d_shipped"], o["d_done"]) > 48)
        pairs.append({"day": d0.date().isoformat(), "a": len(dd) - late, "b": late})
    peak = max(pairs, key=lambda row: row["b"])
    p2 = {"id": "when", "title": "В какие дни доставили с опозданием?", "status": "warn" if late_total else "ok",
          "big": [_big("Доставлено позже 48 часов", late_total, "заказов")],
          "pairs": pairs, "pair_names": ["в срок", "дольше 48 ч"],
          "note": ("Больше всего опозданий на графике %s — %d." % (peak["day"][8:10] + "." + peak["day"][5:7], peak["b"]))
                  if peak["b"] else "На графике за последние дни опозданий нет.",
          "source": "ERP: отгрузка и вручение · по дате вручения"}

    g = {}
    for o in D:
        g.setdefault(region.get(o["customer_id"], "не указан"), []).append(A._h(o["d_shipped"], o["d_done"]))
    p3 = {"id": "regions", "title": "Куда везём дольше?", "status": "none",
          "bars": sorted(({"name": r, "value": 100 * sum(1 for h in hs if h <= 48) / len(hs), "unit": "% в срок", "count": len(hs),
                           "extra": "медиана %s ч" % A._fmt(statistics.median(hs))} for r, hs in g.items()), key=lambda x: x["value"]),
          "note": "", "source": "ERP: отгрузка · CRM: регион клиента"}
    if p3["bars"]:
        w = p3["bars"][0]
        p3["note"] = "Хуже всего — «%s»: в срок %s %% доставок, %s." % (w["name"], A._fmt(w["value"]), w["extra"])
        p3["status"] = "warn" if w["value"] < A.PLAN["delivery"] else "ok"
    q = A._queue(P, product)
    p4 = {"id": "dock", "title": "Что ждёт отгрузки?", "status": "warn" if q["shipping"]["stuck"] else "ok",
          "big": [_big("На складе отгрузки", q["shipping"]["count"], "заказов"),
                  _big("Ждут дольше нормы (6 ч)", q["shipping"]["stuck"], "", "warn" if q["shipping"]["stuck"] else "ok"),
                  _big("Отгружено за период", cur["shipped"], "")],
          "note": "Если очередь на складе растёт к вечеру — нужен второй забор у службы доставки.",
          "source": "ERP: склад отгрузки"}
    oldest = sorted(stuck, key=lambda o: o["d_shipped"])[:8]
    p5 = {"id": "transit", "title": "Какие заказы застряли в пути?", "status": "bad" if stuck else "ok",
          "big": [_big("В пути сейчас", len(transit)), _big("Дольше 48 часов", len(stuck))],
          "table": {"cols": ["Заказ", "Регион", "Отгружен", "В пути, ч"], "num": [3],
                    "rows": [[o["id"], region.get(o["customer_id"], "не указан"), o["d_shipped"].strftime("%d.%m %H:%M"),
                              A._fmt(A._h(o["d_shipped"], b))] for o in oldest]},
          "note": "В таблице восемь заказов, которые ждут дольше всего." if len(stuck) > len(oldest) else "",
          "source": "ERP: отгрузка · CRM: регион клиента"}
    return [p1, p2, p5, p3, p4], [
        _tile(p1, "Доставлено", len(D), "заказов", "За период · по дате вручения"),
        _tile(p2, "Доставлено позже 48 часов", late_total, "заказов", status="warn" if late_total else "ok"),
        _tile(p5, "В пути дольше 48 часов", len(stuck), "заказов", "Сейчас", "bad" if stuck else "ok"),
    ]


# ---------------------------------------------------------------- финансы и бухгалтерия

def _finance(P, user, cur, prev, a, b, days, product):
    bal = P["fin"]["balances"][-1]
    cash = next((c for c in P["fin"]["cash"] if c["month"] == bal["month"]), None)
    p1 = {"id": "cash", "title": "Сколько денег и долгов?", "status": "warn" if bal["receivable_end"] > bal["receivable_start"] * 1.2 else "ok",
          "big": [_big("Деньги на конец периода", bal["cash_end"], "BYN"),
                  _big("Нам должны", bal["receivable_end"], "BYN", "warn" if bal["receivable_end"] > bal["receivable_start"] * 1.2 else "none"),
                  _big("Мы должны", bal["payable_end"], "BYN")],
          "note": "С начала месяца долг покупателей вырос на %s BYN (+%s %%)%s." % (
              A._fmt(bal["receivable_end"] - bal["receivable_start"]), A._fmt(100 * (bal["receivable_end"] - bal["receivable_start"]) / bal["receivable_start"]),
              "; поступления %s BYN при плане %s" % (A._fmt(cash["inflow_fact"]), A._fmt(cash["inflow_plan"])) if cash else ""),
          "source": "1С: деньги и расчёты"}

    cps = sorted((c for c in P["fin"]["counterparties"] if c["overdue_sum"]), key=lambda c: -c["overdue_sum"])
    tot = sum(c["overdue_sum"] for c in cps)
    old = sum(c["overdue_sum"] for c in cps if c["overdue_days"] > 30)
    p2 = {"id": "debtors", "title": "Кто не платит?", "status": "bad" if old else "warn" if cps else "ok",
          "big": [_big("Просрочено всего", tot, "BYN", "warn" if cps else "ok"), _big("Старше 30 дней", old, "BYN", "bad" if old else "ok"),
                  _big("Три крупнейших", 100 * sum(c["overdue_sum"] for c in cps[:3]) / tot if tot else None, "% просрочки")],
          "table": {"cols": ["Контрагент", "Просрочено, BYN", "Дней", "Весь долг, BYN"], "num": [1, 2, 3],
                    "rows": [[c["name"], A._fmt(c["overdue_sum"]), c["overdue_days"], A._fmt(c["debt"])] for c in cps[:6]],
                    "hot": [i for i, c in enumerate(cps[:6]) if c["overdue_days"] > 30]},
          "note": "Звонить в первую очередь трём крупнейшим — они держат большую часть просрочки.",
          "kpi": "overdue_recv", "by": "counterparty", "source": "1С: расчёты с контрагентами"}

    fake = {"role": "director"}
    mg, _ = A.drill(P, fake, "margin", "product", days, product)
    rcost = sum(o["cost"] for o in P["orders"] if a <= o["d_accepted"] < b and o["defect"] and _in(product)(o))
    p3 = {"id": "margin", "title": "Где уходит маржа?", "status": _worse(cur["margin"], A.PLAN["margin"], 1, 2.5),
          "big": [_big("Валовая маржа", cur["margin"], "%", _worse(cur["margin"], A.PLAN["margin"], 1, 2.5)),
                  _big("Перепечатки за период", rcost, "BYN", "bad" if rcost else "ok"),
                  _big("Это от оборота", 100 * rcost / cur["revenue"] if cur["revenue"] else None, "%")],
          "bars": [{"name": r["name"], "value": r["value"], "unit": "% маржи", "count": r["count"]} for r in (mg or {}).get("rows", [])],
          "note": (mg or {}).get("note", ""), "kpi": "margin", "by": "product", "source": "ERP: заказы и брак · 1С: себестоимость"}

    month = bal["month"]
    rows = []
    for r in P["fin"]["pnl"]:
        if r["month"] == month:
            dev = 100 * (r["fact"] - r["plan"]) / r["plan"] if r["plan"] else 0
            rows.append((abs(dev) * (1 if (dev < 0) == (r["kind"] == "доход") else 0.6), r, dev))
    rows.sort(key=lambda x: -x[0])
    ql = A.quality(P)
    diff = [x for x in ql["reconciliation"] if x.get("diff")]
    p4 = {"id": "pnl", "title": "План-факт месяца и сверка с производством", "status": "warn" if diff else "ok",
          "table": {"cols": ["Статья", "План", "Факт", "Откл."], "num": [1, 2, 3],
                    "rows": [[r["article"], A._fmt(r["plan"]), A._fmt(r["fact"]), ("+" if dev > 0 else "−") + A._fmt(abs(dev)) + " %"] for _, r, dev in rows],
                    "hot": [i for i, (_, r, dev) in enumerate(rows) if (dev < -3 if r["kind"] == "доход" else dev > 3)]},
          "note": "Сверка ERP и 1С: %s" % ("расходится в %d мес. — не проведены заказы %s." % (len(diff), ", ".join(ql["unposted"])) if diff else "сходится."),
          "source": "1С: финансы · ERP: заказы"}
    margin_gap = max(0, A.PLAN["margin"] - cur["margin"]) if cur["margin"] is not None else None
    return [p1, p3, p2, p4], [
        _tile(p1, "Поступило на счета", cash["inflow_fact"] if cash else None, "BYN", "За " + bal["month"][5:7] + "." + bal["month"][:4] + " · все продукты"),
        _tile(p3, "Отставание маржи от плана", margin_gap, "п. п.", status=p3["status"]),
        _tile(p2, "Покупатели просрочили оплату", tot, "BYN", "Сейчас · все продукты", p2["status"]),
    ]


# ---------------------------------------------------------------- кадры

def _hr(P, user, cur, prev, a, b, days, product):
    today = b.date().isoformat()
    mv = P["hr"]["moves"]
    h_t = sum(1 for m in mv if m["date"] == today and m["kind"] == "принят")
    f_t = sum(1 for m in mv if m["date"] == today and m["kind"] == "уволен")
    depts = P["hr"]["depts"]
    staff_f, staff_p = sum(d["fact"] for d in depts), sum(d["plan"] for d in depts)
    pairs = []
    for i in range(7, -1, -1):
        w0 = (b - dt.timedelta(days=b.weekday() + 7 * i)).date()
        w1 = w0 + dt.timedelta(days=7)
        ms = [m for m in mv if w0.isoformat() <= m["date"] < w1.isoformat()]
        pairs.append({"day": w0.isoformat(), "a": sum(1 for m in ms if m["kind"] == "принят"), "b": sum(1 for m in ms if m["kind"] == "уволен")})
    p1 = {"id": "today", "title": "Кто пришёл и кто ушёл?", "status": "warn" if cur["fired"] > cur["hired"] else "ok",
          "big": [_big("Сегодня принято", h_t), _big("Сегодня уволено", f_t, "", "warn" if f_t else "none"),
                  _big("Работает из штата", "%d из %d" % (staff_f, staff_p))],
          "pairs": pairs, "pair_names": ["принято", "уволено"], "pair_unit": "неделя",
          "note": "За период принято %d, уволено %d человек." % (cur["hired"], cur["fired"]),
          "source": "HR: приём и увольнение"}

    fin = A.finance(P, {"role": "director", "dept": None})
    sheet = {}
    for row in P["hr"]["timesheet"]:
        if a.date().isoformat() <= row["date"] < today:
            totals = sheet.setdefault(row["section"], [0, 0])
            totals[0] += row["present"]
            totals[1] += row["planned"]
    names = {section["id"]: section["name"] for d in depts for section in d.get("sections", [])}
    att = sorted(({"name": names.get(key, A.DEPTS.get(key, key)), "value": 100 * present / planned,
                   "missed": planned - present}
                  for key, (present, planned) in sheet.items() if planned), key=lambda x: x["value"])
    p2 = {"id": "attendance", "title": "Кто не вышел на смену?", "status": _worse(cur["attendance"], A.PLAN["attendance"], 1, 3.5),
          "bars": [{"name": r["name"], "value": r["value"], "unit": "%", "extra": "пропущено смен: %d" % r["missed"]} for r in att[:6]],
          "list": ["%s — %s: %d чел." % (x["where"], x["kind"], x["people"]) for x in fin["absences"]],
          "note": "Сегодня отсутствуют %d человек." % sum(x["people"] for x in fin["absences"]),
          "kpi": "attendance", "by": "att_section", "source": "HR: табель"}

    bott = P["hr"]["capacity"].get("bottleneck")
    vac = fin["vacancies"]
    p3 = {"id": "vacancies", "title": "Какие вакансии горят?", "status": "bad" if any(v["days"] > 14 for v in vac) else "warn" if vac else "ok",
          "table": {"cols": ["Должность", "Где", "Открыта, дней"], "num": [2],
                    "rows": [[v["title"] + (" · узкое место производства" if v["section"] == bott else ""), v["where"], v["days"]] for v in vac],
                    "hot": [i for i, v in enumerate(vac) if v["days"] > 14 or v["section"] == bott]},
          "note": "%d из %d вакансий — на участке сборки, который сейчас ограничивает выпуск: закрыть их — значит вернуть заказы в срок." % (
              sum(1 for v in vac if v["section"] == bott), len(vac)),
          "source": "HR: вакансии"}

    reasons = {}
    for m in mv:
        if a.date().isoformat() <= m["date"] <= today and m["kind"] == "уволен":
            reasons[m["reason"] or "не указана"] = reasons.get(m["reason"] or "не указана", 0) + 1
    hr_docs = [d for d in P["docs"] if d["dept"] == "hr" and a <= d["d_due"] < b]
    on_t = 100 * sum(1 for d in hr_docs if d["d_done"] and d["d_done"] <= d["d_due"]) / len(hr_docs) if hr_docs else None
    p4 = {"id": "leave", "title": "Почему уходят?", "status": _worse(cur["turnover"], A._plan(P, "turnover", a, b, "", cur), -1, 1.5),
          "bars": [{"name": k.capitalize(), "value": v, "unit": "чел."} for k, v in sorted(reasons.items(), key=lambda x: -x[1])],
          "big": [_big("Текучесть за период", cur["turnover"], "%"), _big("Кадровые документы в срок", on_t, "%", _worse(on_t, A.PLAN["docs_on_time"], 1, 8))],
          "note": "Кадровые документы исполняются в срок хуже, чем в других отделах — это видно в контуре делопроизводства." if on_t is not None and on_t < A.PLAN["docs_on_time"] else "",
          "kpi": "turnover", "by": "hr_dept", "source": "HR: увольнения · Делопроизводство: реестр"}
    missed = sum(r["missed"] for r in att) if att else None
    overdue = sum(1 for v in vac if v["days"] > 14)
    return [p1, p2, p3, p4], [
        _tile(p1, "Принято сотрудников", cur["hired"], ""),
        _tile(p2, "Пропущено выходов на смену", missed, "", "За период · по табелю", p2["status"]),
        _tile(p3, "Вакансии открыты больше 14 дней", overdue, "", "Сейчас", "bad" if overdue else "ok"),
    ]


# ---------------------------------------------------------------- делопроизводство

def _office(P, user, cur, prev, a, b, days, product):
    docs = P["docs"]
    open_ = [d for d in docs if not d["d_done"]]
    over = [d for d in open_ if d["d_due"] < b]
    soon = [d for d in open_ if b <= d["d_due"] < b + dt.timedelta(hours=48)]
    p1 = {"id": "burn", "title": "Что горит по срокам?", "status": "bad" if over else "warn" if soon else "ok",
          "big": [_big("На исполнении", len(open_)), _big("Просрочено", len(over), "", "bad" if over else "ok"),
                  _big("Срок в ближайшие 48 ч", len(soon), "", "warn" if soon else "ok")],
          "table": {"cols": ["Документ", "Вид", "Подразделение", "Срок"], "num": [],
                    "rows": [[d["id"], d["kind"], A.DEPTS.get(d["dept"], d["dept"]), d["due"][8:10] + "." + d["due"][5:7] + " " + d["due"][11:16]]
                             for d in sorted(over + soon, key=lambda d: d["due"])[:10]],
                    "hot": [i for i, d in enumerate(sorted(over + soon, key=lambda d: d["due"])[:10]) if d["d_due"] < b]},
          "source": "Делопроизводство: реестр документов"}

    fake = {"role": "director"}
    dd, _ = A.drill(P, fake, "docs_on_time", "doc_dept", days, product)
    p2 = {"id": "who", "title": "Кто срывает сроки?", "status": _worse(cur["docs_on_time"], A.PLAN["docs_on_time"], 1, 8),
          "bars": [{"name": r["name"], "value": r["value"], "unit": "% в срок", "count": r["count"]} for r in (dd or {}).get("rows", [])],
          "note": (dd or {}).get("note", ""), "kpi": "docs_on_time", "by": "doc_dept", "source": "Делопроизводство: реестр документов"}

    kinds = {}
    for d in docs:
        if d["d_done"] and a <= d["d_due"] < b:
            kinds.setdefault(d["kind"], []).append(A._h(d["d_due"], d["d_done"]) / 24)
    p3 = {"id": "kinds", "title": "Какие документы задерживают?", "status": "none",
          "bars": sorted(({"name": k, "value": 100 * sum(1 for x in v if x <= 0) / len(v), "unit": "% в срок", "count": len(v),
                           "extra": "в среднем %s дн. %s" % (A._fmt(abs(statistics.mean(v))), "раньше срока" if statistics.mean(v) <= 0 else "после срока")}
                          for k, v in kinds.items()), key=lambda x: x["value"]),
          "source": "Делопроизводство: реестр документов"}

    cl = [d for d in docs if d["kind"] == "Претензия клиента"]
    cl_open = [d for d in cl if not d["d_done"]]
    cl_over = [d for d in cl if (d["d_done"] and d["d_done"] > d["d_due"]) or (not d["d_done"] and d["d_due"] < b)]
    p4 = {"id": "claims", "title": "Претензии клиентов", "status": "bad" if cl_over else "ok",
          "big": [_big("Всего за период набора", len(cl)), _big("Открыто сейчас", len(cl_open), "", "warn" if cl_open else "ok"),
                  _big("Ответили позже срока", len(cl_over), "", "bad" if cl_over else "ok")],
          "note": "Ответ на претензию позже срока — юридический риск для компании. Связанные обращения видит поддержка.",
          "source": "Делопроизводство: реестр документов"}
    completed = {}
    for d in docs:
        if d["d_done"] and a <= d["d_done"] < b:
            counts = completed.setdefault(d["dept"], [0, 0])
            counts[0] += 1
            counts[1] += d["d_done"] > d["d_due"]
    total = sum(n for n, _ in completed.values())
    late = sum(n for _, n in completed.values())
    rows = sorted(completed.items(), key=lambda row: (-row[1][1], -row[1][0]))
    p5 = {"id": "completed", "title": "Что закрыли и где опоздали?", "status": "warn" if late else "ok",
          "table": {"cols": ["Подразделение", "Закрыто", "Из них позже срока"], "num": [1, 2],
                    "rows": [[A.DEPTS.get(dept, dept), n, late_count] for dept, (n, late_count) in rows],
                    "hot": [i for i, (_, (_, late_count)) in enumerate(rows) if late_count]},
          "source": "Делопроизводство: реестр документов · по дате исполнения"}
    return [p5, p1, p2, p3, p4], [
        _tile(p5, "Документы исполнены", total, ""),
        _tile(p5, "Исполнены позже срока", late, "документов", status="warn" if late else "ok"),
        _tile(p1, "Просрочены и ещё открыты", len(over), "документов", "Сейчас", "bad" if over else "ok"),
    ]


PAINS = {"production": _production, "sales": _sales, "support": _support, "logistics": _logistics,
         "finance": _finance, "hr": _hr, "office": _office}


def contour(core, P, user, dept, days=14, product=""):
    sc = A._scope(user)
    if dept not in PAINS:
        return None, "нет такого отдела"
    if not sc or (not sc["all"] and sc["dept"] != dept):
        return None, "denied"
    b = P["asof"]
    a = b - dt.timedelta(days=days)
    cur = A.measure(P, a, b, product)
    prev = A.measure(P, a - dt.timedelta(days=days), a, product)
    data = A.pulse(P, user, days, product, dept)
    kpis = [k for k in data["kpis"] if k["dept"] == dept]
    order = {"bad": 0, "warn": 1, "ok": 2, "none": 3}
    pains, overview = PAINS[dept](P, user, cur, prev, a, b, days, product)
    statuses = [k["status"] for k in kpis] + [item["st"] for item in overview]
    status = min(statuses, key=lambda s: order.get(s, 3), default="none")
    return {"dept": dept, "name": A.DEPTS[dept], "head": A.OWNERS[dept][1], "focus": FOCUS[dept], "status": status,
            "access": "Контур изолирован: видят %s и директор%s." % (ACCESS[dept], " (вы — аналитик, только чтение)" if user.get("role") == "analyst" else ""),
            "kpis": kpis, "alerts": [x for x in data["alerts"] if x["dept"] == dept],
            "pains": pains, "overview": overview,
            "asof": data["asof"], "period": data["period"]}, None


def contours_summary(P, user, days=14, product=""):
    """Для боковой панели: какие контуры видит пользователь, их цвет и сколько отклонений."""
    sc = A._scope(user)
    if not sc:
        return []
    data = A.pulse(P, user, days, product)
    order = {"bad": 0, "warn": 1, "ok": 2, "none": 3}
    out = []
    for d in PAINS:
        if not sc["all"] and sc["dept"] != d:
            continue
        ks = [k for k in data["kpis"] if k["dept"] == d]
        out.append({"id": d, "name": A.DEPTS[d], "head": A.OWNERS[d][1],
                    "status": min((k["status"] for k in ks), key=lambda s: order.get(s, 3)) if ks else "none",
                    "alerts": sum(1 for x in data["alerts"] if x["dept"] == d)})
    return out
