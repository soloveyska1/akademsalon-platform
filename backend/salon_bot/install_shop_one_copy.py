#!/usr/bin/env python3
"""Магазин готовых работ: один экземпляр на работу вместо пяти (решение владельца 30.10.2026).

  preflight:  install_shop_one_copy.py --app APP --store STORE --source SRC --knowledge NEW.json
  установка:  ... --apply
  откат:      install_shop_one_copy.py --app APP --store STORE --rollback BACKUP_DIR

Установка закрепляет точные хэши живых файлов, сохраняет копию базы магазина (backup API
SQLite), catalogue.json, core.py, http.py и индекса Листика, затем новым core.py снимает
лишние непроданные экземпляры в одной транзакции и только после этого кладёт новые файлы.
Сервис перезапускает оператор. Откат возвращает пять экземпляров прямой правкой базы
(занятые и проданные строки не трогает) и файлы из копии; файл базы из копии никогда
не восстанавливается поверх новых покупок."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile

LIVE = {
    "core.py": "829fc1751b312a1873b78b6176aae487aeb8c2138eb1127c426c67dcba69c235",
    "http.py": "8882c90cb2627fb592e19c1a56a3158a5c2ec54ee6464132fc1ea7465e2cc4e0",
    "catalogue.json": "cd4061a32650d52944bcc739fe0979c429d0e57a4ef45c56c8ec10aeafe54b4a",
    "assistant_knowledge.json": "90bf87ee1d35b24a9014b6c567bf31923b8ba83c6e09472ae111cc9f51a3a030",
}
ONE_COPY = 1


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def paths(app, store):
    return {"core.py": app / "material_store/core.py", "http.py": app / "material_store/http.py",
            "catalogue.json": store / "catalogue.json",
            "assistant_knowledge.json": app / "services/assistant_knowledge.json"}


def put(target, data):
    """Atomic replace that keeps the target's mode and owner."""
    st = target.stat()
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix="." + target.name + ".")
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)
        fh.flush()
        os.fsync(fh.fileno())
    os.chmod(tmp, st.st_mode & 0o7777)
    if hasattr(os, "chown"):
        os.chown(tmp, st.st_uid, st.st_gid)
    os.replace(tmp, target)


def load_core(path):
    spec = importlib.util.spec_from_file_location("shop_one_copy_core", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def snapshot(db, target):
    src, dst = sqlite3.connect(db), sqlite3.connect(target)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


def catalogue_state(core, db):
    return [{k: p[k] for k in ("sku", "version", "licences", "available", "reserved", "sold")}
            for p in core.Store(db).catalog()]


def one_copy_manifest(raw):
    dump = lambda value: (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    manifest = json.loads(raw)
    # The live manifest is exactly this dump, so the diff is the licences lines only.
    if dump(manifest) != raw:
        raise SystemExit("catalogue.json formatting changed; inspect before installation")
    for product in manifest["products"]:
        product["licences"] = ONE_COPY
    return dump(manifest)


def install(args):
    files = paths(args.app, args.store)
    actual = {name: sha(path) for name, path in files.items()}
    if actual != LIVE:
        raise SystemExit("live files changed; nothing modified: " + json.dumps(actual))
    new = {"core.py": (args.source / "core.py").read_bytes(), "http.py": (args.source / "http.py").read_bytes(),
           "catalogue.json": one_copy_manifest(files["catalogue.json"].read_bytes()),
           "assistant_knowledge.json": args.knowledge.read_bytes()}
    for name in ("core.py", "http.py"):
        compile(new[name], name, "exec")
    json.loads(new["assistant_knowledge.json"])
    core = load_core(args.source / "core.py")
    products = json.loads(new["catalogue.json"])["products"]
    db = args.store / "store.sqlite3"
    with tempfile.TemporaryDirectory() as tmp:
        rehearsal = Path(tmp) / "store.sqlite3"
        snapshot(db, rehearsal)
        core.Store(rehearsal).sync_catalog(products)
        expected = catalogue_state(core, rehearsal)
    if not expected or any((p["licences"], p["available"]) != (1, 1 - p["reserved"] - p["sold"]) for p in expected):
        raise SystemExit("rehearsal did not give one copy per work: " + json.dumps(expected))
    report = {"mode": "preflight", "before": catalogue_state(core, db), "rehearsal": expected,
              "after_sha256": {name: hashlib.sha256(data).hexdigest() for name, data in new.items()}}
    if args.apply:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = args.app.parent / "backups" / ("shop-one-copy-" + stamp)
        backup.mkdir(parents=True, mode=0o700)
        for name, path in files.items():
            shutil.copy2(path, backup / name)
        snapshot(db, backup / "store.sqlite3")
        core.Store(db).sync_catalog(products)
        for name in ("catalogue.json", "core.py", "http.py", "assistant_knowledge.json"):
            put(files[name], new[name])
        report.update(mode="applied", backup=str(backup), after=catalogue_state(core, db))
        (backup / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


def rollback(args):
    backup, files = args.rollback, paths(args.app, args.store)
    products = json.loads((backup / "catalogue.json").read_text())["products"]
    con = sqlite3.connect(args.store / "store.sqlite3", timeout=15, isolation_level=None)
    try:
        con.execute("PRAGMA busy_timeout=15000")
        con.execute("BEGIN IMMEDIATE")
        for product in products:
            p = {k: v for k, v in product.items() if k != "published"}
            raw = json.dumps(p, ensure_ascii=False, sort_keys=True)
            row = con.execute("SELECT payload FROM versions WHERE sku=? AND version=?", (p["sku"], p["version"])).fetchone()
            current = json.loads(row[0])
            if json.dumps(dict(current, licences=p["licences"]), ensure_ascii=False, sort_keys=True) != raw:
                raise SystemExit(f"{p['sku']}: stored version differs beyond licences; nothing restored")
            con.execute("UPDATE versions SET payload=? WHERE sku=? AND version=?", (raw, p["sku"], p["version"]))
            for n in range(1, p["licences"] + 1):
                con.execute("INSERT OR IGNORE INTO licences(sku,version,ordinal) VALUES(?,?,?)", (p["sku"], p["version"], n))
            con.execute("INSERT INTO audit(purchase_id,event,created_at,detail) VALUES(NULL,'licences_restored',strftime('%s','now'),?)",
                        (json.dumps({"sku": p["sku"], "version": p["version"], "to": p["licences"]}),))
        con.execute("COMMIT")
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise
    finally:
        con.close()
    for name, path in files.items():
        put(path, (backup / name).read_bytes())
    print(json.dumps({"mode": "rolled_back", "backup": str(backup),
                      "sha256": {name: sha(path) for name, path in files.items()}}, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--source", type=Path, help="folder with the new core.py and http.py")
    parser.add_argument("--knowledge", type=Path, help="refreshed assistant_knowledge.json")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", type=Path, metavar="BACKUP_DIR")
    args = parser.parse_args()
    if args.rollback:
        rollback(args)
    elif args.source and args.knowledge:
        install(args)
    else:
        parser.error("--source and --knowledge, or --rollback")


if __name__ == "__main__":
    main()
