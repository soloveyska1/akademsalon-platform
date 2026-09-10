#!/usr/bin/env python3
"""Install additive store hooks into an exact verified live source revision.

No configuration secrets or database are copied. Deployment keeps a source-only
backup; rollback must not restore a database over newly received payments.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import py_compile
import shutil
import tempfile


def patch_webapp(text):
    marker = "# material-store:20260910-v1"
    if marker in text:
        return text
    callback_anchor = '    inv_id, amount = res\n    # Robokassa возвращает'
    callback = ('    inv_id, amount = res\n'
                '    # material-store:20260910-v1\n'
                '    from .material_store.http import verified_callback as material_callback\n'
                '    material_response = await material_callback(request.app, inv_id, amount, data)\n'
                '    if material_response is not None:\n'
                '        return material_response\n'
                '    # Robokassa возвращает')
    route_anchor = '    r.add_options("/api/{tail:.*}", handle_options)\n    return app'
    route = ('    from .material_store.http import register as register_material_store\n'
             '    register_material_store(app, _session_user)\n'
             '    r.add_options("/api/{tail:.*}", handle_options)\n    return app')
    for old, new in ((callback_anchor, callback), (route_anchor, route)):
        if text.count(old) != 1:
            raise RuntimeError("live hook changed; inspect the new source before installation")
        text = text.replace(old, new)
    compile(text, "webapp.py", "exec")
    return text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--expected-webapp-sha256", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    target = args.app / "webapp.py"
    original = target.read_bytes()
    actual = hashlib.sha256(original).hexdigest()
    if actual != args.expected_webapp_sha256:
        raise SystemExit("live webapp hash changed; no files modified")
    patched = patch_webapp(original.decode()).encode()
    source = Path(__file__).with_name("material_store")
    files = [source / n for n in ("__init__.py", "core.py", "provider.py", "http.py", "admin.py")]
    for file in files:
        compile(file.read_text(), str(file), "exec")
    report = {"mode": "preflight", "webapp_before": actual,
              "webapp_after": hashlib.sha256(patched).hexdigest(),
              "module": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    if args.apply:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = args.app.parent / "backups" / ("material-store-"+stamp)
        backup.mkdir(parents=True, exist_ok=False, mode=0o700)
        shutil.copy2(target, backup / "webapp.py")
        destination = args.app / "material_store"
        if destination.exists():
            shutil.copytree(destination, backup / "material_store")
        destination.mkdir(exist_ok=True)
        for file in files:
            shutil.copy2(file, destination / file.name)
        temp = target.with_suffix(".store-new")
        temp.write_bytes(patched)
        shutil.copymode(target, temp)
        temp.replace(target)
        report.update(mode="applied", backup=str(backup))
        (backup / "manifest.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
