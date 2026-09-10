"""Deterministic commerce state machine. Amounts are integer RUB, time UTC epoch.

No provider I/O occurs inside a transaction. Payment confirmation is a privileged
operation: the HTTP adapter must verify the provider signature and exact amount.
"""
from contextlib import contextmanager
import hashlib
import json
import re
import sqlite3
import time

INV_OFFSET = 50_000_000
HOLD_SECONDS = 15 * 60
TERMS_VERSION = "2026-09-10.v1"


class StoreError(ValueError):
    pass


class Store:
    def __init__(self, path, clock=time.time):
        self.path, self.clock = str(path), clock
        with self.read() as c:
            c.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS versions(
              sku TEXT, version TEXT, payload TEXT NOT NULL,
              published INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(sku,version));
            CREATE TABLE IF NOT EXISTS licences(
              id INTEGER PRIMARY KEY, sku TEXT NOT NULL, version TEXT NOT NULL,
              ordinal INTEGER NOT NULL, purchase_id INTEGER UNIQUE,
              state TEXT NOT NULL DEFAULT 'available', UNIQUE(sku,version,ordinal),
              CHECK(state IN ('available','held','sold')));
            CREATE TABLE IF NOT EXISTS wallets(
              user_id INTEGER PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0,
              held INTEGER NOT NULL DEFAULT 0 CHECK(held>=0));
            CREATE TABLE IF NOT EXISTS purchases(
              id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
              request_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
              sku TEXT NOT NULL, version TEXT NOT NULL, snapshot TEXT NOT NULL,
              price INTEGER NOT NULL, discount INTEGER NOT NULL, bonus INTEGER NOT NULL,
              cash INTEGER NOT NULL CHECK(cash>0), state TEXT NOT NULL DEFAULT 'pending',
              created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
              paid_at INTEGER, refunded INTEGER NOT NULL DEFAULT 0,
              reward INTEGER NOT NULL DEFAULT 0, reward_reversed INTEGER NOT NULL DEFAULT 0,
              bonus_restored INTEGER NOT NULL DEFAULT 0,
              payment_url TEXT, receipt TEXT, op_key TEXT,
              refund_request TEXT, last_checked INTEGER, provider_state TEXT,
              delivered_at INTEGER, attribution TEXT NOT NULL, terms TEXT NOT NULL,
              UNIQUE(user_id,request_key));
            CREATE UNIQUE INDEX IF NOT EXISTS one_pending_product
              ON purchases(user_id,sku) WHERE state='pending';
            CREATE TABLE IF NOT EXISTS ledger(
              operation TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
              purchase_id INTEGER NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS achievements(
              user_id INTEGER, code TEXT, purchase_id INTEGER NOT NULL,
              reward INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,code));
            CREATE TABLE IF NOT EXISTS outbox(
              purchase_id INTEGER PRIMARY KEY, state TEXT NOT NULL DEFAULT 'pending',
              attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0,
              lease_until INTEGER NOT NULL DEFAULT 0, channel TEXT, sent_at INTEGER);
            CREATE TABLE IF NOT EXISTS external_refunds(
              request_id TEXT PRIMARY KEY, purchase_id INTEGER NOT NULL,
              amount INTEGER NOT NULL, evidence_sha256 TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS audit(
              id INTEGER PRIMARY KEY, purchase_id INTEGER, event TEXT NOT NULL,
              created_at INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '{}');
            """)

    def connect(self):
        c = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA busy_timeout=15000")
        c.execute("PRAGMA synchronous=FULL")
        return c

    @contextmanager
    def read(self):
        c = self.connect()
        try:
            yield c
        finally:
            c.close()

    @contextmanager
    def tx(self):
        c = self.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:
            c.close()

    def log(self, c, pid, event, detail=None):
        c.execute("INSERT INTO audit(purchase_id,event,created_at,detail) VALUES(?,?,?,?)",
                  (pid, event, int(self.clock()), json.dumps(detail or {})))

    def sync_catalog(self, products):
        with self.tx() as c:
            c.execute("UPDATE versions SET published=0")
            for product in products:
                p = dict(product)
                published = bool(p.pop("published", False))
                if not re.fullmatch(r"[a-z0-9-]{3,64}", p["sku"]):
                    raise StoreError("bad_catalogue")
                if type(p["price"]) is not int or not 100 <= p["price"] <= 100_000:
                    raise StoreError("bad_price")
                if type(p["licences"]) is not int or not 1 <= p["licences"] <= 1000:
                    raise StoreError("bad_licences")
                raw = json.dumps(p, ensure_ascii=False, sort_keys=True)
                old = c.execute("SELECT payload FROM versions WHERE sku=? AND version=?",
                                (p["sku"], p["version"])).fetchone()
                if old and old["payload"] != raw:
                    raise StoreError("immutable_version_changed")
                c.execute("INSERT INTO versions(sku,version,payload,published) VALUES(?,?,?,?) "
                          "ON CONFLICT(sku,version) DO UPDATE SET published=excluded.published",
                          (p["sku"], p["version"], raw, int(published)))
                for n in range(1, p["licences"] + 1):
                    c.execute("INSERT OR IGNORE INTO licences(sku,version,ordinal) VALUES(?,?,?)",
                              (p["sku"], p["version"], n))

    def _product(self, c, sku):
        row = c.execute("SELECT * FROM versions WHERE sku=? AND published=1", (sku,)).fetchall()
        if len(row) != 1:
            raise StoreError("unavailable")
        return json.loads(row[0]["payload"])

    def catalog(self):
        with self.read() as c:
            products = []
            for row in c.execute("SELECT * FROM versions WHERE published=1 ORDER BY sku"):
                p = json.loads(row["payload"])
                counts = dict(c.execute("SELECT state,count(*) FROM licences WHERE sku=? AND version=? GROUP BY state",
                                        (p["sku"], p["version"])).fetchall())
                p.pop("files", None)
                p.update(available=counts.get("available", 0), reserved=counts.get("held", 0),
                         sold=counts.get("sold", 0))
                products.append(p)
            return products

    def _quote(self, c, uid, product, use_bonus, coupon):
        c.execute("INSERT OR IGNORE INTO wallets(user_id) VALUES(?)", (uid,))
        w = c.execute("SELECT * FROM wallets WHERE user_id=?", (uid,)).fetchone()
        code = str(coupon or "").strip().upper()
        if code and code != "СЕМЕСТР":
            raise StoreError("invalid_coupon")
        if code and int(self.clock()) >= 1790802000:
            raise StoreError("coupon_ineligible")
        price = product["price"]
        discount = price * 5 // 100 if code else 0
        cap = price // 10 - discount
        bonus = min(max(0, w["balance"] - w["held"]), cap) if use_bonus else 0
        return dict(price=price, discount=discount, bonus=bonus, cash=price-discount-bonus,
                    balance=max(0, w["balance"]-w["held"]))

    def quote(self, uid, sku, use_bonus=False, coupon=""):
        with self.tx() as c:
            return self._quote(c, uid, self._product(c, sku), use_bonus, coupon)

    def checkout(self, uid, sku, request_key, expected_cash, *, use_bonus=False,
                 coupon="", attribution=None, terms=TERMS_VERSION):
        if not re.fullmatch(r"[a-zA-Z0-9_-]{20,80}", str(request_key)):
            raise StoreError("invalid_request_key")
        if terms != TERMS_VERSION:
            raise StoreError("terms_changed")
        fingerprint = hashlib.sha256(json.dumps([sku, bool(use_bonus), str(coupon).strip().upper(),
                                                  expected_cash, terms]).encode()).hexdigest()
        now = int(self.clock())
        with self.tx() as c:
            old = c.execute("SELECT * FROM purchases WHERE user_id=? AND request_key=?", (uid, request_key)).fetchone()
            if old:
                if old["fingerprint"] != fingerprint:
                    raise StoreError("idempotency_conflict")
                return dict(old)
            active = c.execute("SELECT state FROM purchases WHERE user_id=? AND sku=? "
                               "AND state IN ('pending','paid','paid_unallocated')", (uid, sku)).fetchone()
            if active:
                raise StoreError("already_owned" if active["state"] == "paid" else "already_reserved")
            if c.execute("SELECT count(*) FROM purchases WHERE user_id=? AND state='pending'", (uid,)).fetchone()[0] >= 2:
                raise StoreError("reservation_limit")
            p = self._product(c, sku)
            q = self._quote(c, uid, p, use_bonus, coupon)
            if type(expected_cash) is not int or q["cash"] != expected_cash:
                raise StoreError("quote_changed")
            licence = c.execute("SELECT id FROM licences WHERE sku=? AND version=? AND state='available' ORDER BY id LIMIT 1",
                                (sku, p["version"])).fetchone()
            if not licence:
                raise StoreError("sold_out")
            cur = c.execute("INSERT INTO purchases(user_id,request_key,fingerprint,sku,version,snapshot,price,discount,bonus,cash,"
                            "created_at,expires_at,attribution,terms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (uid, request_key, fingerprint, sku, p["version"], json.dumps(p, ensure_ascii=False),
                             q["price"], q["discount"], q["bonus"], q["cash"], now, now+HOLD_SECONDS,
                             json.dumps(attribution or {}, sort_keys=True), terms))
            pid = cur.lastrowid
            if pid >= 10_000_000:
                raise StoreError("invoice_range_exhausted")
            c.execute("UPDATE licences SET state='held',purchase_id=? WHERE id=? AND state='available'", (pid, licence[0]))
            c.execute("UPDATE wallets SET held=held+? WHERE user_id=?", (q["bonus"], uid))
            self.log(c, pid, "reserved")
            return dict(c.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone())

    def get(self, pid, uid=None):
        with self.read() as c:
            p = c.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone()
            if not p or (uid is not None and p["user_id"] != uid):
                raise StoreError("not_found")
            return dict(p)

    def set_invoice(self, pid, receipt, url=None):
        with self.tx() as c:
            p = c.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone()
            if not p:
                raise StoreError("not_found")
            if p["receipt"] and p["receipt"] != receipt:
                raise StoreError("invoice_snapshot_conflict")
            c.execute("UPDATE purchases SET receipt=?,payment_url=COALESCE(payment_url,?) WHERE id=?", (receipt, url, pid))

    def _ledger(self, c, uid, pid, operation, amount):
        cur = c.execute("INSERT OR IGNORE INTO ledger VALUES(?,?,?,?,?)", (operation, uid, pid, amount, int(self.clock())))
        if cur.rowcount:
            c.execute("UPDATE wallets SET balance=balance+? WHERE user_id=?", (amount, uid))

    def confirm(self, pid, amount, op_key=None):
        with self.tx() as c:
            p = c.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone()
            if not p or type(amount) is not int or amount != p["cash"]:
                raise StoreError("payment_mismatch")
            if p["paid_at"] is not None:
                return dict(p)
            licence = c.execute("SELECT * FROM licences WHERE purchase_id=?", (pid,)).fetchone()
            if not licence:
                licence = c.execute("SELECT * FROM licences WHERE sku=? AND version=? AND state='available' ORDER BY id LIMIT 1",
                                    (p["sku"], p["version"])).fetchone()
            already_paid = c.execute("SELECT 1 FROM purchases WHERE user_id=? AND sku=? AND state='paid' AND id<>?",
                                     (p["user_id"], p["sku"], pid)).fetchone()
            if already_paid:
                licence = None
            state = "paid" if licence else "paid_unallocated"
            if licence:
                c.execute("UPDATE licences SET state='sold',purchase_id=? WHERE id=?", (pid, licence["id"]))
            if p["state"] == "pending":
                c.execute("UPDATE wallets SET held=held-? WHERE user_id=?", (p["bonus"], p["user_id"]))
            self._ledger(c, p["user_id"], pid, f"spend:{pid}", -p["bonus"])
            c.execute("UPDATE purchases SET state=?,paid_at=?,op_key=COALESCE(?,op_key) WHERE id=?",
                      (state, int(self.clock()), op_key, pid))
            if state == "paid":
                self._reward(c, p)
                c.execute("INSERT OR IGNORE INTO outbox(purchase_id) VALUES(?)", (pid,))
            self.log(c, pid, state)
            return dict(c.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone())

    def _reward(self, c, p):
        pid, uid = p["id"], p["user_id"]
        count = c.execute("SELECT count(*),count(DISTINCT sku) FROM purchases WHERE user_id=? AND state='paid' AND refunded=0", (uid,)).fetchone()
        code = "first-material" if count[0] == 1 else ("three-materials" if count[0] == 3 else None)
        reward = p["cash"] * 3 // 100
        if code:
            extra = p["cash"] * 2 // 100
            cur = c.execute("INSERT OR IGNORE INTO achievements VALUES(?,?,?,?,?)", (uid, code, pid, extra, int(self.clock())))
            if cur.rowcount:
                reward += extra
        self._ledger(c, uid, pid, f"reward:{pid}", reward)
        c.execute("UPDATE purchases SET reward=? WHERE id=?", (reward, pid))

    def release(self, pid, provider_state):
        """Only a verified provider terminal/no-operation observation may release.

        The adapter applies expiry/grace and rechecks no-operation observations.
        An unknown provider state must retain the licence and reserved bonuses.
        """
        if provider_state not in ("cancelled", "returned", "not_found_after_expiry"):
            raise StoreError("unsafe_release")
        with self.tx() as c:
            p = c.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone()
            if not p or p["state"] != "pending" or p["expires_at"] > int(self.clock()):
                return False
            c.execute("UPDATE licences SET state='available',purchase_id=NULL WHERE purchase_id=? AND state='held'", (pid,))
            c.execute("UPDATE wallets SET held=held-? WHERE user_id=?", (p["bonus"], p["user_id"]))
            c.execute("UPDATE purchases SET state='expired',provider_state=? WHERE id=?", (provider_state, pid))
            self.log(c, pid, "expired", {"provider_state": provider_state})
            return True

    def refund_confirmed(self, pid, cumulative_amount):
        with self.tx() as c:
            p = c.execute("SELECT * FROM purchases WHERE id=?", (pid,)).fetchone()
            if not p or p["paid_at"] is None or type(cumulative_amount) is not int or not 0 <= cumulative_amount <= p["cash"]:
                raise StoreError("refund_mismatch")
            if cumulative_amount <= p["refunded"]:
                return False
            reverse = p["reward"] * cumulative_amount // p["cash"]
            restore = p["bonus"] * cumulative_amount // p["cash"]
            self._ledger(c, p["user_id"], pid, f"refund-reward:{pid}:{cumulative_amount}", -(reverse-p["reward_reversed"]))
            self._ledger(c, p["user_id"], pid, f"refund-spend:{pid}:{cumulative_amount}", restore-p["bonus_restored"])
            state = "refunded" if cumulative_amount == p["cash"] else p["state"]
            c.execute("UPDATE purchases SET refunded=?,reward_reversed=?,bonus_restored=?,state=? WHERE id=?",
                      (cumulative_amount, reverse, restore, state, pid))
            if state == "refunded":
                c.execute("UPDATE outbox SET state='cancelled' WHERE purchase_id=? AND state<>'sent'", (pid,))
                # A duplicate late payment can still own an unconsumed hold.
                # It never received an entitlement, so this hold can be freed.
                if p["state"] == "paid_unallocated":
                    c.execute("UPDATE licences SET state='available',purchase_id=NULL WHERE purchase_id=? AND state='held'", (pid,))
            # A sold licence stays sold: a downloaded file cannot be recalled.
            self.log(c, pid, "refund_confirmed", {"cumulative": cumulative_amount})
            return True

    def account(self, uid):
        with self.read() as c:
            w = c.execute("SELECT * FROM wallets WHERE user_id=?", (uid,)).fetchone()
            rows = c.execute("SELECT * FROM purchases WHERE user_id=? ORDER BY id DESC LIMIT 100", (uid,)).fetchall()
            return dict(balance=max(0, w["balance"]-w["held"]) if w else 0,
                        reserved_bonus=w["held"] if w else 0,
                        purchases=[self.public_purchase(dict(p)) for p in rows],
                        achievements=[dict(a) for a in c.execute("SELECT code,reward,created_at FROM achievements WHERE user_id=?", (uid,))])

    @staticmethod
    def public_purchase(p):
        product = json.loads(p["snapshot"])
        out = {k: p[k] for k in ("id", "sku", "version", "price", "discount", "bonus", "cash", "state", "expires_at", "paid_at", "refunded", "reward")}
        out.update(title=product["title"], formats=list(product.get("files", {})),
                   download_available=p["state"] == "paid" and p["refunded"] < p["cash"])
        if p["state"] == "pending" and p["expires_at"] > int(time.time()):
            out["payment_url"] = p["payment_url"]
        return out

    def private_file(self, pid, uid, fmt):
        p = self.get(pid, uid)
        if p["state"] != "paid" or p["refunded"] >= p["cash"]:
            raise StoreError("payment_required")
        f = json.loads(p["snapshot"]).get("files", {}).get(fmt)
        if not f:
            raise StoreError("not_found")
        return f

    def pending(self):
        with self.read() as c:
            return [dict(p) for p in c.execute("SELECT * FROM purchases WHERE state IN ('pending','paid_unallocated') ORDER BY COALESCE(last_checked,0) LIMIT 40")]

    def observation(self, pid, state, op_key=None):
        with self.tx() as c:
            c.execute("UPDATE purchases SET provider_state=?,last_checked=?,op_key=COALESCE(?,op_key) WHERE id=?",
                      (state, int(self.clock()), op_key, pid))

    def claim_outbox(self):
        now = int(self.clock())
        with self.tx() as c:
            row = c.execute("SELECT o.* FROM outbox o JOIN purchases p ON p.id=o.purchase_id "
                            "WHERE o.state='pending' AND p.state='paid' AND o.next_attempt<=? AND o.lease_until<=? LIMIT 1", (now, now)).fetchone()
            if not row:
                return None
            c.execute("UPDATE outbox SET lease_until=?,attempts=attempts+1 WHERE purchase_id=?", (now+300, row["purchase_id"]))
            return dict(row)

    def finish_outbox(self, pid, success, channel=None):
        with self.tx() as c:
            c.execute("UPDATE outbox SET state=?,lease_until=0,next_attempt=?,channel=?,sent_at=? WHERE purchase_id=?",
                      ("sent" if success else "pending", int(self.clock())+300, channel,
                       int(self.clock()) if success else None, pid))
            if success:
                c.execute("UPDATE purchases SET delivered_at=? WHERE id=?", (int(self.clock()), pid))
