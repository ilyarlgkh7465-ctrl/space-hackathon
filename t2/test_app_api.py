"""Проверка серверной части приложения: python -m unittest t2.test_app_api -v
Запускает копию сервера во временной папке (данные репозитория не трогает)."""
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def png(w, h):
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"\x80\x80\x80" * w for _ in range(h))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        for f in ("server.py", "app_api.py"):
            shutil.copy(ROOT / f, cls.tmp / f)
        shutil.copytree(ROOT / "data" / "seed", cls.tmp / "data" / "seed")
        s = socket.socket(); s.bind(("127.0.0.1", 0)); cls.port = s.getsockname()[1]; s.close()
        cls.proc = subprocess.Popen([sys.executable, "server.py", str(cls.port)], cwd=cls.tmp,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        for _ in range(50):
            try:
                urllib.request.urlopen("http://127.0.0.1:%d/api/health" % cls.port, timeout=1); break
            except OSError:
                time.sleep(0.2)
        cls.client = cls.login("client")
        cls.guest = cls.call("POST", "/api/app/guest")[1]["token"]

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate(); cls.proc.wait(5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @classmethod
    def call(cls, method, path, body=None, token=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else (b"{}" if method == "POST" else None))
        req = urllib.request.Request("http://127.0.0.1:%d%s" % (cls.port, path), data=data, method=method)
        if raw is None:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", "Bearer " + token)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                b = r.read()
                return r.status, (json.loads(b) if r.headers.get_content_type() == "application/json" else b)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    @classmethod
    def login(cls, who):
        return cls.call("POST", "/api/login", {"login": who, "password": "demo2026"})[1]["token"]

    # ---- каталог и цена (МП-01, МП-04)
    def test_catalog_from_server(self):
        st, c = self.call("GET", "/api/app/catalog")
        self.assertEqual(st, 200)
        self.assertGreaterEqual(len(c["products"]), 5)
        self.assertEqual(c["currency"], "BYN")

    def test_price_recalculates(self):
        item = lambda q: {"items": [{"product": "print", "variant": "10x15", "qty": q}], "delivery": "pickup"}
        self.assertEqual(self.call("POST", "/api/app/price", item(10))[1]["total"], "6.50")
        self.assertEqual(self.call("POST", "/api/app/price", item(60))[1]["total"], "33.00")   # ступень от 50 шт
        d = item(10); d["delivery"] = "courier"
        self.assertEqual(self.call("POST", "/api/app/price", d)[1]["total"], "21.40")
        d["promo"] = "PICPAC10"
        self.assertEqual(self.call("POST", "/api/app/price", d)[1]["total"], "20.75")           # 6.50 − 0.65 + 14.90
        d["promo"] = "НЕТ"
        self.assertEqual(self.call("POST", "/api/app/price", d)[0], 400)
        b = {"items": [{"product": "book", "variant": "classic", "qty": 1, "options": {"pages": 24}}], "delivery": "belpochta"}
        self.assertEqual(self.call("POST", "/api/app/price", b)[1]["goods"], "80.50")           # 72.90 + 4 × 1.90
        b["items"][0]["options"]["pages"] = 23
        self.assertEqual(self.call("POST", "/api/app/price", b)[0], 400)

    # ---- роли
    def test_needs_login(self):
        for path in ("/api/app/projects", "/api/app/orders", "/api/app/staff/orders"):
            self.assertEqual(self.call("GET", path)[0], 401)

    def test_customer_cannot_use_staff(self):
        self.assertEqual(self.call("GET", "/api/app/staff/orders", token=self.client)[0], 403)

    # ---- фото (МП-02)
    def test_upload_validation(self):
        st, r = self.call("POST", "/api/app/photos", token=self.client, raw=png(800, 600), headers={"Content-Type": "image/png", "X-File-Name": "a.png"})
        self.assertEqual((st, r["w"], r["h"]), (200, 800, 600))
        self.assertEqual(self.call("POST", "/api/app/photos", token=self.client, raw=b"GIF89a....")[0], 415)
        self.assertEqual(self.call("POST", "/api/app/photos", token=self.client, raw=png(200, 200))[0], 422)

    # ---- черновик (МП-03), проверка, безопасный повтор (МП-05)
    def test_draft_check_order_and_replay(self):
        photos = [{"id": "p%d" % i, "name": "кадр %d" % i, "w": 3000, "h": 4000, "qty": 2} for i in range(10)]
        photos.append({"id": "p-bad", "name": "мелкое", "w": 600, "h": 800, "qty": 1})
        st, pr = self.call("POST", "/api/app/projects", {"product": "print", "variant": "15x21", "photos": photos}, self.client)
        self.assertEqual(st, 200)
        self.assertEqual([p["id"] for p in pr["photos"]], [p["id"] for p in photos])              # порядок сохранён
        st, back = self.call("GET", "/api/app/projects/" + pr["id"], token=self.client)
        self.assertEqual([p["id"] for p in back["photos"]], [p["id"] for p in photos])
        issues = self.call("GET", "/api/app/projects/%s/check" % pr["id"], token=self.client)[1]["issues"]
        self.assertTrue(any(i["code"] == "low_res" and i["photo"] == "p-bad" for i in issues))
        order = {"project_id": pr["id"], "delivery": {"id": "pickup", "point": "center"},
                 "contact": {"name": "Анна", "phone": "+375 29 111-22-33"}}
        hdr = {"Idempotency-Key": "k-1"}
        st, r = self.call("POST", "/api/app/orders", order, self.client, hdr)
        self.assertEqual(st, 409)                                                                  # без согласия на замечания не оформляем
        order["accept_warnings"] = True
        st, o1 = self.call("POST", "/api/app/orders", order, self.client, hdr)
        self.assertEqual(st, 201)
        st, o2 = self.call("POST", "/api/app/orders", order, self.client, hdr)                     # повтор того же запроса
        self.assertEqual((o2["id"], o2["replayed"]), (o1["id"], True))
        self.assertEqual(len(self.call("GET", "/api/app/orders", token=self.client)[1]), 1)
        # клиент видит только свои заказы
        self.assertEqual(self.call("GET", "/api/app/orders", token=self.guest)[1], [])
        self.assertEqual(self.call("GET", "/api/app/orders/" + o1["id"], token=self.guest)[0], 404)
        # статусы: оператор отмечает производство, контроль ему недоступен
        op, qa = self.login("operator"), self.login("quality")
        oid = o1["id"]
        self.assertEqual(self.call("POST", "/api/app/staff/orders/%s/mark" % oid, {"action": "accept"}, op)[1]["stage_status"], "started")
        self.assertEqual(self.call("POST", "/api/app/staff/orders/%s/mark" % oid, {"action": "handoff"}, op)[1]["stage"], "production")
        self.assertEqual(self.call("POST", "/api/app/staff/orders/%s/mark" % oid, {"action": "accept"}, op)[0], 200)
        self.assertEqual(self.call("POST", "/api/app/staff/orders/%s/mark" % oid, {"action": "handoff"}, op)[1]["stage"], "quality")
        self.assertEqual(self.call("POST", "/api/app/staff/orders/%s/mark" % oid, {"action": "accept"}, op)[0], 403)
        self.assertEqual(self.call("POST", "/api/app/staff/orders/%s/mark" % oid, {"action": "accept"}, qa)[0], 200)
        stages = [(e["stage"], e["status"]) for e in self.call("GET", "/api/app/orders/%s/events" % oid, token=self.client)[1]]
        self.assertIn(("production", "passed"), stages)
        audit = self.call("GET", "/api/store/audit")[1]
        self.assertTrue(any(a["result"] == "отказ" and "order" in a["object"] for a in audit))
        # обращение привязано к заказу и тоже защищено ключом
        s = {"order_id": oid, "text": "Когда будет готово?"}
        a = self.call("POST", "/api/app/support", s, self.client, {"Idempotency-Key": "s-1"})[1]
        b = self.call("POST", "/api/app/support", s, self.client, {"Idempotency-Key": "s-1"})[1]
        self.assertEqual((a["id"], a["order_id"]), (b["id"], oid))
        self.assertEqual(self.call("POST", "/api/app/support", {"order_id": oid, "text": "чужой"}, self.guest)[0], 404)

    def test_book_layout_empty_pages(self):
        photos = [{"id": "b%d" % i, "w": 3000, "h": 3000} for i in range(10)]
        base = {"product": "book", "variant": "classic", "options": {"pages": 20}, "photos": photos}
        pid = self.call("POST", "/api/app/projects", base, self.client)[1]["id"]
        n = lambda: [i for i in self.call("GET", "/api/app/projects/%s/check" % pid, token=self.client)[1]["issues"] if i["code"] == "empty_pages"]
        self.assertIn("10 из 20", n()[0]["text"])                                                  # без макета: 20 страниц − 10 фото
        lay = [[photos[i]["id"]] for i in range(10)] + [[] for _ in range(10)]
        self.call("POST", "/api/app/projects/" + pid, dict(base, layout=lay), self.client)
        self.assertIn("10 из 20", n()[0]["text"])
        lay = [[photos[i % 10]["id"], photos[(i + 1) % 10]["id"]] for i in range(20)]               # по 2 фото на странице
        self.call("POST", "/api/app/projects/" + pid, dict(base, layout=lay), self.client)
        self.assertEqual(n(), [])

    def test_order_requires_key(self):
        st, _ = self.call("POST", "/api/app/orders", {"items": [{"product": "magnet", "variant": "10x10", "qty": 1}]}, self.client)
        self.assertEqual(st, 400)

    # ---- соцсеть: отзывы и шаблоны
    def test_social_reviews_and_templates(self):
        feed = self.call("GET", "/api/app/social/feed")[1]                                        # читать ленту можно без входа
        self.assertGreaterEqual(len(feed["templates"]), 6)
        self.assertFalse(feed["can_publish"])
        t = self.login("sales")
        # шаблон публикует только сотрудник компании (head/director)
        tpl = {"title": "Выпускной альбом", "product": "book", "variant": "lite", "options": {"pages": 24}, "per_page": 2, "occasion": "Праздник"}
        self.assertEqual(self.call("POST", "/api/app/social/templates", tpl, self.client)[0], 403)
        self.assertEqual(self.call("POST", "/api/app/social/templates", dict(tpl, variant="нет"), t)[0], 400)
        self.assertEqual(self.call("POST", "/api/app/social/templates", dict(tpl, options={"pages": 23}), t)[0], 400)
        a = self.call("POST", "/api/app/social/templates", tpl, t, {"Idempotency-Key": "t-1"})[1]
        b = self.call("POST", "/api/app/social/templates", tpl, t, {"Idempotency-Key": "t-1"})[1]
        self.assertEqual(a["id"], b["id"])
        feed = self.call("GET", "/api/app/social/feed", token=self.client)[1]
        self.assertEqual(feed["templates"][0]["id"], a["id"])
        self.assertEqual(self.call("POST", "/api/app/social/templates/%s/use" % a["id"], token=self.client)[1]["uses"], 1)
        lk = self.call("POST", "/api/app/social/templates/%s/like" % a["id"], token=self.client)[1]
        self.assertEqual((lk["likes"], lk["liked"]), (1, True))
        self.assertEqual(self.call("POST", "/api/app/social/templates/%s/like" % a["id"], token=self.client)[1]["likes"], 0)
        self.assertEqual(self.call("POST", "/api/app/social/templates/t-seed-year/delete", token=t)[0], 403)   # шаблоны picPac не удаляются
        self.assertEqual(self.call("POST", "/api/app/social/templates/%s/delete" % a["id"], token=self.client)[0], 403)
        self.assertEqual(self.call("POST", "/api/app/social/templates/%s/delete" % a["id"], token=t)[0], 200)
        # отзыв — только по своему заказу, без ссылок, один на заказ
        tok = self.call("POST", "/api/app/guest")[1]["token"]
        rv = {"order_id": "нет", "rating": 5, "text": "Всё получилось быстро и красиво"}
        self.assertEqual(self.call("POST", "/api/app/social/reviews", rv, tok)[0], 404)
        self.assertEqual(self.call("POST", "/api/app/social/reviews", rv)[0], 401)
        order = {"items": [{"product": "magnet", "variant": "10x10", "qty": 3}], "delivery": {"id": "pickup", "point": "center"},
                 "contact": {"name": "Вера Иванова", "phone": "+375 29 111-22-33"}}
        o = self.call("POST", "/api/app/orders", order, tok, {"Idempotency-Key": "rv-o"})[1]
        rv["order_id"] = o["id"]
        self.assertEqual(self.call("POST", "/api/app/social/reviews", dict(rv, rating=7), tok)[0], 400)
        self.assertEqual(self.call("POST", "/api/app/social/reviews", dict(rv, text="смотри www.site.by"), tok)[0], 422)
        self.assertEqual(self.call("POST", "/api/app/social/reviews", dict(rv, text="коротко"), tok)[0], 400)
        st, r1 = self.call("POST", "/api/app/social/reviews", rv, tok)
        self.assertEqual((st, r1["name"], r1["mine"]), (201, "Вера", True))
        st, r2 = self.call("POST", "/api/app/social/reviews", dict(rv, rating=4), tok)             # повтор правит тот же отзыв
        self.assertEqual((st, r2["id"], r2["rating"]), (200, r1["id"], 4))
        mine = self.call("GET", "/api/app/social/feed", token=tok)[1]
        self.assertEqual(len([x for x in mine["reviews"] if not x["demo"]]), 1)
        self.assertTrue(mine["my_orders"][0]["reviewed"])
        # чужой отзыв не удалить, ответить может только компания, скрыть тоже
        other = self.call("POST", "/api/app/guest")[1]["token"]
        self.assertEqual(self.call("POST", "/api/app/social/reviews/%s/delete" % r1["id"], token=other)[0], 403)
        self.assertEqual(self.call("POST", "/api/app/social/reviews/%s/reply" % r1["id"], {"text": "Спасибо!"}, tok)[0], 403)
        self.assertEqual(self.call("POST", "/api/app/social/reviews/%s/reply" % r1["id"], {"text": "Спасибо, Вера!"}, t)[0], 200)
        self.call("POST", "/api/app/social/reviews/%s/hide" % r1["id"], token=t)
        pub = self.call("GET", "/api/app/social/feed", token=other)[1]
        self.assertFalse(any(x["id"] == r1["id"] for x in pub["reviews"]))                        # скрытый отзыв посторонним не виден
        self.call("POST", "/api/app/social/reviews/%s/hide" % r1["id"], token=t)
        shown = [x for x in self.call("GET", "/api/app/social/feed", token=other)[1]["reviews"] if x["id"] == r1["id"]][0]
        self.assertEqual(shown["reply"]["text"], "Спасибо, Вера!")
        # удаление данных забирает и отзывы
        self.call("POST", "/api/app/account/delete", {"confirm": True}, tok)
        self.assertFalse(any(x["id"] == r1["id"] for x in self.call("GET", "/api/app/social/feed", token=other)[1]["reviews"]))

    # ---- удаление данных (МП-06)
    def test_delete_account(self):
        t = self.call("POST", "/api/app/guest")[1]["token"]
        self.call("POST", "/api/app/photos", token=t, raw=png(800, 600))
        st, r = self.call("POST", "/api/app/account/delete", {"confirm": True}, t)
        self.assertEqual((st, r["photos_deleted"], r["account_removed"]), (200, 1, True))
        self.assertEqual(self.call("GET", "/api/app/projects", token=t)[0], 401)


if __name__ == "__main__":
    unittest.main()
