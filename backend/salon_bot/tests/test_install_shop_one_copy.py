import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from argparse import Namespace

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))

import install_shop_one_copy as installer  # noqa: E402

SOURCE = HERE.parents[1] / "material_store"
core = installer.load_core(SOURCE / "core.py")


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
        files = {"pdf": {"path": "private/a.pdf", "sha256": "abc"}}
        manifest = {"checkout_enabled": True, "products": [product("housing-first", files), product("social-pedagogy", files)]}
        (self.store / "catalogue.json").write_bytes(
            (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        core.Store(self.store / "store.sqlite3").sync_catalog(manifest["products"])
        (self.app / "material_store/core.py").write_text("# old core\n")
        (self.app / "material_store/http.py").write_text("# old http\n")
        (self.app / "services/assistant_knowledge.json").write_text('{"pages":[]}\n')
        self.knowledge = root / "knowledge.json"
        self.knowledge.write_text('{"pages":[{"url":"/shop.html"}]}\n')
        self.live = installer.LIVE
        installer.LIVE = {name: installer.sha(path) for name, path in installer.paths(self.app, self.store).items()}

    def tearDown(self):
        installer.LIVE = self.live
        self.tmp.cleanup()

    def args(self, **kw):
        return Namespace(**dict(dict(app=self.app, store=self.store, source=SOURCE, knowledge=self.knowledge,
                                     apply=False, rollback=None), **kw))

    def run_quiet(self, fn, **kw):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            fn(self.args(**kw))
        return json.loads(out.getvalue())

    def counts(self):
        return [(p["licences"], p["available"], p["sold"]) for p in core.Store(self.store / "store.sqlite3").catalog()]

    def test_preflight_changes_nothing_and_refuses_changed_live_files(self):
        before = {name: installer.sha(path) for name, path in installer.paths(self.app, self.store).items()}
        report = self.run_quiet(installer.install)
        self.assertEqual(report["mode"], "preflight")
        self.assertEqual([p["licences"] for p in report["rehearsal"]], [1, 1])
        self.assertEqual(self.counts(), [(5, 5, 0), (5, 5, 0)])
        self.assertEqual(before, {name: installer.sha(path) for name, path in installer.paths(self.app, self.store).items()})
        (self.app / "material_store/http.py").write_text("# someone else's change\n")
        with self.assertRaises(SystemExit):
            installer.install(self.args(apply=True))
        self.assertEqual(self.counts(), [(5, 5, 0), (5, 5, 0)])

    def test_apply_then_rollback(self):
        report = self.run_quiet(installer.install, apply=True)
        backup = Path(report["backup"])
        self.assertEqual(self.counts(), [(1, 1, 0), (1, 1, 0)])
        manifest = json.loads((self.store / "catalogue.json").read_text(encoding="utf-8"))
        self.assertEqual([p["licences"] for p in manifest["products"]], [1, 1])
        self.assertEqual((self.app / "material_store/core.py").read_bytes(), (SOURCE / "core.py").read_bytes())
        for name in ("store.sqlite3", "catalogue.json", "core.py", "http.py", "assistant_knowledge.json", "manifest.json"):
            self.assertTrue((backup / name).exists(), name)
        # The new service start: the same manifest is now a no-op.
        core.Store(self.store / "store.sqlite3").sync_catalog(manifest["products"])
        self.run_quiet(installer.rollback, rollback=backup)
        self.assertEqual(self.counts(), [(5, 5, 0), (5, 5, 0)])
        for name, path in installer.paths(self.app, self.store).items():
            self.assertEqual(installer.sha(path), installer.LIVE[name], name)
        # The old service start after rollback: the old manifest matches the stored versions.
        old = json.loads((self.store / "catalogue.json").read_text(encoding="utf-8"))["products"]
        core.Store(self.store / "store.sqlite3").sync_catalog(old)
        self.assertEqual(self.counts(), [(5, 5, 0), (5, 5, 0)])


if __name__ == "__main__":
    unittest.main()
