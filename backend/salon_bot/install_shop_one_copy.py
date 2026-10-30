#!/usr/bin/env python3
"""Магазин готовых работ: один экземпляр на работу вместо пяти (решение владельца 30.10.2026).

  preflight:  install_shop_one_copy.py --app APP --store STORE --source SRC --knowledge NEW.json
  установка:  ... --apply
  откат:      systemctl stop salon-bot-v2
              install_shop_one_copy.py --app APP --store STORE --rollback BACKUP_DIR
              systemctl start salon-bot-v2

Установка закрепляет точные хэши живых файлов, сохраняет копию базы магазина (backup API
SQLite) и четыре файла, репетирует снятие экземпляров на копии базы, заранее готовит новые
файлы рядом с живыми, затем одной транзакцией снимает лишние непроданные экземпляры и только
после коммита публикует файлы атомарными переименованиями — первым catalogue.json. Каждое
промежуточное состояние запускается и старым, и новым core.py.

Откат требует остановленного сервиса: иначе новый код продолжил бы продавать «в одном
экземпляре» уже после возврата пяти. Работы, которые за это время забронировали, купили или
оплачивали по новым условиям, остаются в одном экземпляре; остальным база возвращает пять
(занятые строки не трогаются). Файл базы из копии никогда не восстанавливается поверх
новых покупок."""
import argparse
from contextlib import suppress
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile

LIVE = {
    "core.py": "829fc1751b312a1873b78b6176aae487aeb8c2138eb1127c426c67dcba69c235",
    "http.py": "8882c90cb2627fb592e19c1a56a3158a5c2ec54ee6464132fc1ea7465e2cc4e0",
    "catalogue.json": "cd4061a32650d52944bcc739fe0979c429d0e57a4ef45c56c8ec10aeafe54b4a",
    "assistant_knowledge.json": "90bf87ee1d35b24a9014b6c567bf31923b8ba83c6e09472ae111cc9f51a3a030",
}
ONE_COPY = 1
ONE_COPY_TERMS = "2026-10-30.v1"
# catalogue.json first: it alone decides whether the next start matches the database.
ORDER = ("catalogue.json", "core.py", "http.py", "assistant_knowledge.json")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def paths(app, store):
    return {"core.py": app / "material_store/core.py", "http.py": app / "material_store/http.py",
            "catalogue.json": store / "catalogue.json",
            "assistant_knowledge.json": app / "services/assistant_knowledge.json"}


def stage(target, data):
    """Write data next to target with its mode and owner; publish() renames it into place."""
    st = target.stat()
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix="." + target.name + ".")
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)
        fh.flush()
        os.fsync(fh.fileno())
    os.chmod(tmp, st.st_mode & 0o7777)
    if hasattr(os, "chown"):
        os.chown(tmp, st.st_uid, st.st_gid)
    return Path(tmp)


def discard(staged):
    for tmp in staged.values():
        with suppress(FileNotFoundError):
            tmp.unlink()


def publish(files, staged, recovery):
    try:
        for name in ORDER:
            os.replace(staged[name], files[name])
            del staged[name]
    except BaseException:
        discard(staged)
        print("files only partly replaced; next step: " + recovery, file=sys.stderr)
        raise


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


def dump(manifest):
    return (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def one_copy_manifest(raw):
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
        (backup / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        staged = {}
        try:
            for name in ORDER:
                staged[name] = stage(files[name], new[name])
            core.Store(db).sync_catalog(products)
        except BaseException:
            discard(staged)
            raise
        recovery = (f"systemctl stop salon-bot-v2 && {sys.executable} {Path(__file__).resolve()} --app {args.app} "
                    f"--store {args.store} --rollback {backup} && systemctl start salon-bot-v2")
        publish(files, staged, recovery)
        report.update(mode="applied", backup=str(backup), after=catalogue_state(core, db))
        (backup / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


def service_active(unit):
    return bool(shutil.which("systemctl")) and subprocess.run(
        ["systemctl", "is-active", "--quiet", unit]).returncode == 0


def rollback(args):
    backup, files = args.rollback, paths(args.app, args.store)
    after = json.loads((backup / "manifest.json").read_text())["after_sha256"]
    # A file is either the installed one or still the original (an interrupted publish).
    changed = sorted(name for name, path in files.items() if sha(path) not in (after[name], sha(backup / name)))
    if changed:
        raise SystemExit("files changed after installation, nothing restored: " + ", ".join(changed))
    if service_active(args.unit):
        raise SystemExit(f"stop {args.unit} first: until restart it keeps selling under the one-copy terms")
    manifest = json.loads((backup / "catalogue.json").read_text(encoding="utf-8"))
    con = sqlite3.connect(args.store / "store.sqlite3", timeout=15, isolation_level=None)
    staged = {}
    try:
        con.execute("PRAGMA busy_timeout=15000")
        con.execute("BEGIN IMMEDIATE")
        engaged = {tuple(r) for r in con.execute(
            "SELECT sku,version FROM licences WHERE state<>'available' OR purchase_id IS NOT NULL "
            "UNION SELECT sku,version FROM purchases WHERE terms=? AND state<>'expired'", (ONE_COPY_TERMS,))}
        kept = []
        for product in manifest["products"]:
            p = {k: v for k, v in product.items() if k != "published"}
            current = json.loads(con.execute("SELECT payload FROM versions WHERE sku=? AND version=?",
                                             (p["sku"], p["version"])).fetchone()[0])
            if (p["sku"], p["version"]) in engaged:
                # Sold or promised under the one-copy terms: it stays one copy.
                product["licences"] = current["licences"]
                kept.append(p["sku"])
                continue
            raw = json.dumps(p, ensure_ascii=False, sort_keys=True)
            if json.dumps(dict(current, licences=p["licences"]), ensure_ascii=False, sort_keys=True) != raw:
                raise SystemExit(f"{p['sku']}: stored version differs beyond licences; nothing restored")
            con.execute("UPDATE versions SET payload=? WHERE sku=? AND version=?", (raw, p["sku"], p["version"]))
            for n in range(1, p["licences"] + 1):
                con.execute("INSERT OR IGNORE INTO licences(sku,version,ordinal) VALUES(?,?,?)", (p["sku"], p["version"], n))
            con.execute("INSERT INTO audit(purchase_id,event,created_at,detail) VALUES(NULL,'licences_restored',strftime('%s','now'),?)",
                        (json.dumps({"sku": p["sku"], "version": p["version"], "to": p["licences"]}),))
        restored = {name: (backup / name).read_bytes() for name in ORDER}
        if kept:
            restored["catalogue.json"] = dump(manifest)
        for name, data in restored.items():
            staged[name] = stage(files[name], data)
        con.execute("COMMIT")
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        discard(staged)
        raise
    finally:
        con.close()
    publish(files, staged, "replace the remaining files from " + str(backup) + " in the order " + ", ".join(ORDER))
    print(json.dumps({"mode": "rolled_back", "backup": str(backup), "kept_one_copy": kept,
                      "sha256": {name: sha(path) for name, path in files.items()}}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--source", type=Path, help="folder with the new core.py and http.py")
    parser.add_argument("--knowledge", type=Path, help="refreshed assistant_knowledge.json")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", type=Path, metavar="BACKUP_DIR")
    parser.add_argument("--unit", default="salon-bot-v2", help="service that must be stopped for --rollback")
    args = parser.parse_args()
    if args.rollback:
        rollback(args)
    elif args.source and args.knowledge:
        install(args)
    else:
        parser.error("--source and --knowledge, or --rollback")


if __name__ == "__main__":
    main()
