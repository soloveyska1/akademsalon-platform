import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from argparse import Namespace
from unittest import mock

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))

import install_shop_one_copy as installer  # noqa: E402

SOURCE = HERE.parents[1] / "material_store"
core = installer.load_core(SOURCE / "core.py")


def old_core():
    """The pre-change core: any difference from a stored version stops the service start."""
    old = installer.load_core(SOURCE / "core.py")
    def refuse(self, c, prev, new, raw):
        raise old.StoreError("immutable_version_changed")
    old.Store._withdraw_licences = refuse
    return old


def product(sku, files):
    return {"sku": sku, "title": sku, "price": 1490, "version": "2026-09-10.v1", "licences": 5,
            "published": True, "receipt_name": "Учебный материал", "files": files}


class InstallShopOneCopy(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.app, self.store = root / "salon_bot/app", root / "store"
        (self.app / "material_store").mkdir(parents=True)
        (self.app / "services").mkdir()
        self.store.mkdir()
        (root / "salon_bot/backups").mkdir()
        self.backups = root / "salon_bot/backups"
        files = {"pdf": {"path": "private/a.pdf", "sha256": "abc"}}
        manifest = {"checkout_enabled": True, "products": [product("housing-first", files), product("social-pedagogy", files)]}
        (self.store / "catalogue.json").write_bytes(installer.dump(manifest))
        self.db = self.store / "store.sqlite3"
        core.Store(self.db).sync_catalog(manifest["products"])
        (self.app / "material_store/core.py").write_text("# old core\n")
        (self.app / "material_store/http.py").write_text("# old http\n")
        (self.app / "services/assistant_knowledge.json").write_text('{"pages":[]}\n')
        self.knowledge = root / "knowledge.json"
        self.knowledge.write_text('{"pages":[{"url":"/shop.html"}]}\n')
        self.live = installer.LIVE
        installer.LIVE = self.hashes()

    def tearDown(self):
        installer.LIVE = self.live
        self.tmp.cleanup()

    def hashes(self):
        return {name: installer.sha(path) for name, path in installer.paths(self.app, self.store).items()}

    def args(self, **kw):
        return Namespace(**dict(dict(app=self.app, store=self.store, source=SOURCE, knowledge=self.knowledge,
                                     apply=False, rollback=None, unit="shop-one-copy-test-unit"), **kw))

    def run_quiet(self, fn, **kw):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            fn(self.args(**kw))
        return json.loads(out.getvalue())

    def counts(self):
        return {p["sku"]: (p["licences"], p["available"], p["sold"]) for p in core.Store(self.db).catalog()}

    def manifest(self):
        return json.loads((self.store / "catalogue.json").read_text(encoding="utf-8"))["products"]

    def start(self, module):
        module.Store(self.db).sync_catalog(self.manifest())

    def strays(self):
        return [p.name for d in (self.store, self.app / "material_store", self.app / "services")
                for p in d.iterdir() if p.name.startswith(".")]

    def sell(self, sku, uid=1):
        s = core.Store(self.db)
        q = s.quote(uid, sku)
        p = s.checkout(uid, sku, f"request_{uid:020d}", q["cash"])
        return s.confirm(p["id"], p["cash"])

    def test_preflight_changes_nothing_and_refuses_changed_live_files(self):
        report = self.run_quiet(installer.install)
        self.assertEqual(report["mode"], "preflight")
        self.assertEqual([p["licences"] for p in report["rehearsal"]], [1, 1])
        self.assertEqual(self.counts(), {"housing-first": (5, 5, 0), "social-pedagogy": (5, 5, 0)})
        self.assertEqual(self.hashes(), installer.LIVE)
        (self.app / "material_store/http.py").write_text("# someone else's change\n")
        with self.assertRaises(SystemExit):
            installer.install(self.args(apply=True))
        self.assertEqual(self.counts(), {"housing-first": (5, 5, 0), "social-pedagogy": (5, 5, 0)})

    def test_held_second_copy_stops_installation_before_any_write(self):
        s = core.Store(self.db)
        for uid in (1, 2):
            s.checkout(uid, "housing-first", f"request_{uid:020d}", s.quote(uid, "housing-first")["cash"])
        with self.assertRaisesRegex(Exception, "licence_in_use"):  # the installer loads its own core module
            installer.install(self.args(apply=True))
        self.assertEqual(self.hashes(), installer.LIVE)
        self.assertEqual(list(self.backups.iterdir()), [])
        self.assertEqual(self.strays(), [])
        self.assertEqual(self.counts()["housing-first"], (5, 3, 0))

    def test_apply_then_rollback(self):
        report = self.run_quiet(installer.install, apply=True)
        backup = Path(report["backup"])
        self.assertEqual(self.counts(), {"housing-first": (1, 1, 0), "social-pedagogy": (1, 1, 0)})
        self.assertEqual([p["licences"] for p in self.manifest()], [1, 1])
        self.assertEqual((self.app / "material_store/core.py").read_bytes(), (SOURCE / "core.py").read_bytes())
        for name in ("store.sqlite3", "catalogue.json", "core.py", "http.py", "assistant_knowledge.json", "manifest.json"):
            self.assertTrue((backup / name).exists(), name)
        self.assertEqual(self.strays(), [])
        self.start(core)
        self.start(old_core())  # an old core next to the new manifest would start too
        result = self.run_quiet(installer.rollback, rollback=backup)
        self.assertEqual(result["kept_one_copy"], [])
        self.assertEqual(self.counts(), {"housing-first": (5, 5, 0), "social-pedagogy": (5, 5, 0)})
        self.assertEqual(self.hashes(), installer.LIVE)
        self.start(old_core())
        self.assertEqual(self.counts(), {"housing-first": (5, 5, 0), "social-pedagogy": (5, 5, 0)})

    def test_interrupted_publish_leaves_a_startable_state_and_rolls_back(self):
        real, calls = os.replace, []
        def flaky(src, dst):
            calls.append(Path(dst).name)
            if len(calls) == 2:
                raise OSError(28, "No space left on device")
            return real(src, dst)
        with mock.patch.object(installer.os, "replace", flaky), contextlib.redirect_stderr(io.StringIO()) as err, \
                contextlib.redirect_stdout(io.StringIO()), self.assertRaises(OSError):
            installer.install(self.args(apply=True))
        self.assertEqual(calls, ["catalogue.json", "core.py"])
        self.assertIn("--rollback", err.getvalue())
        self.assertEqual(self.strays(), [])
        self.assertEqual([p["licences"] for p in self.manifest()], [1, 1])
        self.assertEqual(installer.sha(self.app / "material_store/core.py"), installer.LIVE["core.py"])
        self.start(old_core())
        backup = next(self.backups.iterdir())
        self.run_quiet(installer.rollback, rollback=backup)
        self.assertEqual(self.hashes(), installer.LIVE)
        self.start(old_core())
        self.assertEqual(self.counts(), {"housing-first": (5, 5, 0), "social-pedagogy": (5, 5, 0)})

    def test_rollback_keeps_a_work_sold_under_one_copy_terms(self):
        backup = Path(self.run_quiet(installer.install, apply=True)["backup"])
        self.assertEqual(self.sell("housing-first")["terms"], installer.ONE_COPY_TERMS)
        result = self.run_quiet(installer.rollback, rollback=backup)
        self.assertEqual(result["kept_one_copy"], ["housing-first"])
        self.assertEqual(self.counts(), {"housing-first": (1, 0, 1), "social-pedagogy": (5, 5, 0)})
        self.assertEqual({p["sku"]: p["licences"] for p in self.manifest()}, {"housing-first": 1, "social-pedagogy": 5})
        self.start(old_core())

    def test_rollback_refuses_changed_files_and_a_running_service(self):
        backup = Path(self.run_quiet(installer.install, apply=True)["backup"])
        knowledge = self.app / "services/assistant_knowledge.json"
        saved = knowledge.read_bytes()
        knowledge.write_text('{"pages":["a later change"]}\n')
        with self.assertRaisesRegex(SystemExit, "assistant_knowledge.json"):
            installer.rollback(self.args(rollback=backup))
        knowledge.write_bytes(saved)
        with mock.patch.object(installer, "service_active", lambda unit: True), \
                self.assertRaisesRegex(SystemExit, "stop shop-one-copy-test-unit"):
            installer.rollback(self.args(rollback=backup))
        self.assertEqual(self.counts(), {"housing-first": (1, 1, 0), "social-pedagogy": (1, 1, 0)})


if __name__ == "__main__":
    unittest.main()
