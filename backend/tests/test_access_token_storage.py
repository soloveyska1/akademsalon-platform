from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

import aiosqlite
from cryptography.fernet import Fernet

from app import config, db


class AccessTokenStorageTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.previous_key = config.ORDER_ACCESS_TOKEN_KEY
        self.key = Fernet.generate_key().decode("ascii")
        config.ORDER_ACCESS_TOKEN_KEY = self.key
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "tokens.sqlite3")
        await db.init(self.db_path)

    async def asyncTearDown(self) -> None:
        try:
            await db.close()
        finally:
            config.ORDER_ACCESS_TOKEN_KEY = self.previous_key
            self.tmp.cleanup()

    async def _stored_token(self, order_id: int):
        cur = await db.conn().execute(
            "SELECT access_token AS stored_token,"
            "access_token_digest AS stored_digest "
            "FROM orders WHERE id=?",
            (order_id,),
        )
        return await cur.fetchone()

    async def test_new_token_is_encrypted_and_looked_up_only_by_digest(self) -> None:
        raw_token = "test-capability-token"
        order_id = await db.create_order(source="test", access_token=raw_token)

        stored = await self._stored_token(order_id)
        self.assertTrue(stored["stored_token"].startswith("e1$"))
        self.assertNotEqual(stored["stored_token"], raw_token)
        self.assertNotIn(raw_token, stored["stored_token"])
        self.assertEqual(
            stored["stored_digest"],
            "d1$" + hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        )

        order = await db.get_order(order_id)
        self.assertEqual(order["access_token"], raw_token)
        self.assertNotIn("access_token_digest", dict(order))
        self.assertEqual((await db.order_by_access_token(raw_token))["id"], order_id)
        self.assertEqual((await db.order_by_token(order_id, raw_token))["id"], order_id)
        self.assertEqual(
            [row["id"] for row in await db.orders_by_tokens([raw_token])],
            [order_id],
        )
        self.assertIsNone(await db.order_by_access_token("wrong-token"))

    async def test_legacy_plaintext_migration_preserves_link_and_is_repeatable(self) -> None:
        raw_token = "legacy-capability-link"
        cur = await db.conn().execute(
            "INSERT INTO orders(source,access_token,created_at,updated_at) "
            "VALUES('legacy',?,?,?)",
            (raw_token, db.now_iso(), db.now_iso()),
        )
        order_id = int(cur.lastrowid)
        await db.conn().commit()

        await db.close()
        await db.init(self.db_path)
        first = await self._stored_token(order_id)
        first_ciphertext = first["stored_token"]
        first_digest = first["stored_digest"]
        self.assertTrue(first_ciphertext.startswith("e1$"))
        self.assertNotIn(raw_token, first_ciphertext)
        self.assertEqual((await db.order_by_access_token(raw_token))["id"], order_id)

        await db.close()
        await db.init(self.db_path)
        second = await self._stored_token(order_id)
        self.assertEqual(second["stored_token"], first_ciphertext)
        self.assertEqual(second["stored_digest"], first_digest)
        self.assertEqual((await db.get_order(order_id))["access_token"], raw_token)

    async def test_rotation_and_claim_revoke_previously_presented_tokens(self) -> None:
        original = "first-capability-token"
        order_id = await db.create_order(source="test", access_token=original)

        rotated = await db.rotate_access_token(order_id)
        self.assertNotEqual(rotated, original)
        self.assertIsNone(await db.order_by_access_token(original))
        self.assertEqual((await db.order_by_access_token(rotated))["id"], order_id)

        await db.conn().execute(
            "INSERT INTO users(id,first_name,created_at,last_seen_at) "
            "VALUES(812,'Тест',?,?)",
            (db.now_iso(), db.now_iso()),
        )
        await db.conn().commit()
        self.assertTrue(await db.claim_order_to_user(order_id, rotated, 812))
        self.assertIsNone(await db.order_by_access_token(rotated))
        claimed = await db.get_order(order_id)
        self.assertEqual(claimed["user_id"], 812)
        self.assertNotEqual(claimed["access_token"], rotated)

        stored = await self._stored_token(order_id)
        self.assertNotIn(claimed["access_token"], stored["stored_token"])

    async def test_bundle_update_and_lazy_issue_use_protected_storage(self) -> None:
        bundled_token = "bundle-capability-token"
        order_id = await db.create_order_bundle(
            [],
            source="site",
            access_token=bundled_token,
        )
        stored = await self._stored_token(order_id)
        self.assertNotEqual(stored["stored_token"], bundled_token)
        self.assertNotIn(bundled_token, stored["stored_token"])

        replacement = "replacement-capability-token"
        await db.update_order(order_id, access_token=replacement)
        self.assertIsNone(await db.order_by_access_token(bundled_token))
        self.assertEqual((await db.order_by_access_token(replacement))["id"], order_id)
        stored = await self._stored_token(order_id)
        self.assertNotIn(replacement, stored["stored_token"])

        lazy_order_id = await db.create_order(source="bot")
        issued = await db.ensure_access_token(lazy_order_id)
        self.assertTrue(issued)
        stored = await self._stored_token(lazy_order_id)
        self.assertNotIn(issued, stored["stored_token"])
        self.assertEqual(
            (await db.order_by_access_token(issued))["id"],
            lazy_order_id,
        )

    async def test_missing_key_fails_closed_without_changing_legacy_value(self) -> None:
        raw_token = "legacy-token-before-key"
        cur = await db.conn().execute(
            "INSERT INTO orders(source,access_token,created_at,updated_at) "
            "VALUES('legacy',?,?,?)",
            (raw_token, db.now_iso(), db.now_iso()),
        )
        order_id = int(cur.lastrowid)
        await db.conn().commit()
        await db.close()

        config.ORDER_ACCESS_TOKEN_KEY = ""
        with self.assertRaisesRegex(RuntimeError, "ORDER_ACCESS_TOKEN_KEY") as raised:
            await db.init(self.db_path)
        self.assertNotIn(raw_token, str(raised.exception))

        direct = await aiosqlite.connect(self.db_path)
        try:
            cur = await direct.execute(
                "SELECT access_token,access_token_digest FROM orders WHERE id=?",
                (order_id,),
            )
            unchanged = await cur.fetchone()
            self.assertEqual(unchanged[0], raw_token)
            self.assertIsNone(unchanged[1])
        finally:
            await direct.close()

        config.ORDER_ACCESS_TOKEN_KEY = self.key
        await db.init(self.db_path)
        self.assertEqual((await db.order_by_access_token(raw_token))["id"], order_id)

    async def test_write_with_token_fails_before_insert_when_key_is_missing(self) -> None:
        config.ORDER_ACCESS_TOKEN_KEY = ""
        with self.assertRaisesRegex(RuntimeError, "ORDER_ACCESS_TOKEN_KEY"):
            await db.create_order(source="test", access_token="must-not-be-stored")
        cur = await db.conn().execute("SELECT count(*) AS n FROM orders")
        self.assertEqual((await cur.fetchone())["n"], 0)


if __name__ == "__main__":
    unittest.main()
