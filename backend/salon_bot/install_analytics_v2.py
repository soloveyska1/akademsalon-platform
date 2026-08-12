#!/usr/bin/env python3
"""Fail-closed installer for the unversioned production bot checkout.

The installer refuses an unknown source hash, creates source and SQLite backups,
applies small deterministic integration seams and never removes v2 tables on
rollback. Run it from the tracked release artifact, not from a hand-edited copy.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


KNOWN_WEBAPP_SHA256 = "219aefda9ee787e8811aad43632468511b993e39ea402a6fb3b7897759ba510c"
KNOWN_DB_SHA256 = "3fa34af2f14f3f6c35b838bb8093326ac5a84f3df9cb09e8f5d1a2fda93a99d0"
KNOWN_NGINX_SITE_SHA256 = "d1945612f13ef1eb7e76912a6e4951cd95126caffc18ddc038110796a9bfc669"
KNOWN_NGINX_HEADERS_SHA256 = "82c448658dac275483e72bbbf06e2e8808a13d2ad3b8aaf10b873d58467a7049"
KNOWN_WEBAPP_POST_SHA256 = "6c30cf2f02fcda1247131cc87078bb643307b5746880825bf7b6bec4fce55c05"
KNOWN_DB_POST_SHA256 = "7611e08b69bbe283b5614fbaaf5bd3f379b95cefb57dcc033b23446ca051dad9"
KNOWN_NGINX_SITE_POST_SHA256 = "0270e47d48ce9e28eb226b06d3e2e37346c79f60fb768a3ce658b3f0e4f881f8"
KNOWN_NGINX_HEADERS_POST_SHA256 = "ebe20503129e3b856f9e3d645ee206877dcc067d21fe7f6b2597c4b2b8e6d77d"
KNOWN_MODULE_SHA256 = "69a9d642263a88570abadc7f56c06138834c573d6f0049b1d7d02b8bc28991ea"
KNOWN_CONTRACT_SHA256 = "68c9e43db498cbef698fd741c09ed1a78dd943dfc914a1cf803a8df69efc0fe2"
MARKER = "analytics-v2-integration:20260812"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, got {count}")
    return text.replace(old, new, 1)


def sqlite_backup(source: Path, destination: Path) -> None:
    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True, timeout=10)
    dst = sqlite3.connect(destination, timeout=10)
    try:
        src.backup(dst)
        result = dst.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise RuntimeError(f"backup integrity_check: {result}")
    finally:
        dst.close()
        src.close()


def atomic_text_replace(path: Path, content: str) -> None:
    """Replace one configuration/source file without exposing a partial write."""
    temporary = path.with_name(f".{path.name}.{os.getpid()}.analytics-v2.tmp")
    shutil.copy2(path, temporary)
    try:
        temporary.write_text(content, encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def atomic_copy(source: Path, destination: Path) -> None:
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.analytics-v2.tmp")
    shutil.copy2(source, temporary)
    try:
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def patch_webapp(text: str) -> str:
    if MARKER in text:
        return text
    text = replace_once(
        text,
        "from . import config, db, keyboards as kb, texts",
        "from . import analytics_v2, config, db, keyboards as kb, texts",
        "webapp import",
    )
    legacy_anchor = '''    Максимально дёшев и неболтлив: битые данные молча отбрасываем,
    ответ всегда 204 — фронт на него не смотрит.
    """
    ip = _ip(request)
'''
    legacy_replacement = '''    Максимально дёшев и неболтлив: битые данные молча отбрасываем,
    ответ всегда 204 — фронт на него не смотрит.
    """
    # analytics-v2-integration:20260812
    # После выхода v2 legacy-контур не пишет новые IP/UA. Временный opt-in
    # разрешён только явным rollback-флагом и всё равно требует exact Origin.
    if os.environ.get("ANALYTICS_LEGACY_ENABLED", "0") != "1":
        return web.Response(status=204, headers=CORS)
    if request.headers.get("Origin", "") != _SITE_ORIGIN:
        return web.Response(status=204, headers=CORS)
    if request.content_length is not None and request.content_length > 4096:
        return web.Response(status=204, headers=CORS)
    ip = _ip(request)
'''
    text = replace_once(text, legacy_anchor, legacy_replacement, "legacy boundary")
    route_anchor = '''    r.add_post("/api/admin/requisites", admin_requisites)
    r.add_options("/api/{tail:.*}", handle_options)
'''
    route_replacement = '''    r.add_post("/api/admin/requisites", admin_requisites)
    analytics_v2.register_aiohttp(
        app,
        db_path=config.DB_PATH,
        site_origin=_SITE_ORIGIN,
        admin_guard=_admin_user,
        signing_secret=os.environ.get("ANALYTICS_SIGNING_SECRET", ""),
        contract_path=os.path.join(os.path.dirname(__file__), "analytics_contract_v2.json"),
        geo_db_path=os.environ.get("ANALYTICS_GEO_DB") or None,
    )
    r.add_options("/api/{tail:.*}", handle_options)
'''
    return replace_once(text, route_anchor, route_replacement, "analytics routes")


def patch_db(text: str) -> str:
    marker = "analytics-v2-retention-order:20260812"
    if marker in text:
        return text
    anchor = '    await _conn.execute("DELETE FROM visits WHERE last_at < ?", (analytics_cutoff,))\n'
    replacement = '''    # analytics-v2-retention-order:20260812
    # У legacy funnel_events нет ON DELETE CASCADE: сначала удаляем детей,
    # иначе первая сессия старше retention срывает весь запуск по FK.
    await _conn.execute(
        "DELETE FROM funnel_events WHERE created_at < ? OR visit_id IN ("
        "SELECT id FROM visits WHERE last_at < ?)",
        (analytics_cutoff, analytics_cutoff),
    )
    await _conn.execute("DELETE FROM visits WHERE last_at < ?", (analytics_cutoff,))
'''
    return replace_once(text, anchor, replacement, "legacy retention")


def patch_nginx_headers(text: str) -> str:
    marker = "analytics-v2-csp:20260812"
    if marker in text:
        return text
    anchor = 'add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n'
    replacement = anchor + '''# analytics-v2-csp:20260812
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://yastatic.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://mc.yandex.ru https://api.crossref.org; child-src 'self' blob: https://mc.yandex.ru; frame-src 'self' blob: https://mc.yandex.ru; worker-src 'self' blob:; manifest-src 'self'; media-src 'self' blob: https:; upgrade-insecure-requests" always;
'''
    return replace_once(text, anchor, replacement, "nginx CSP")


def patch_nginx_site(text: str) -> str:
    marker = "analytics-v2-nginx:20260812"
    if marker in text:
        return text
    zone_anchor = "# Академический Салон · основной домен akademsalon.ru (переезд 20260710-042330)\n"
    zone_replacement = zone_anchor + '''# analytics-v2-rate-limit:20260812
limit_req_zone $binary_remote_addr zone=analytics_v2_public:10m rate=5r/s;
'''
    text = replace_once(text, zone_anchor, zone_replacement, "analytics edge rate zone")
    admin_anchor = '''    location = /admin.html {
        root /var/www/academic_saloon/current;
        try_files $uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        include /etc/nginx/snippets/akademsalon-security-headers.conf;
    }
'''
    admin_replacement = admin_anchor + '''
    # analytics-v2-nginx:20260812
    location = /admin-analytics.html {
        root /var/www/academic_saloon/current;
        try_files $uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "no-referrer" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
        add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; upgrade-insecure-requests" always;
    }
'''
    text = replace_once(text, admin_anchor, admin_replacement, "admin analytics location")
    api_anchor = '''    # --- API бота (SQLite-картотека, 8090) ---
    location /api/ {
'''
    api_replacement = '''    # --- API бота (SQLite-картотека, 8090) ---
    location ~ ^/api/analytics/(grant|events|revoke)$ {
        access_log /var/log/nginx/api.log noqs;
        client_max_body_size 32k;
        limit_req zone=analytics_v2_public burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
'''
    return replace_once(text, api_anchor, api_replacement, "analytics body limit")


def require_hash(path: Path, *expected: str) -> str:
    actual = sha256(path)
    allowed = {value for value in expected if value}
    if actual not in allowed:
        raise RuntimeError(
            f"unknown source {path}: {actual}; expected one of {sorted(allowed)}"
        )
    return actual


BACKUP_NAMES = {
    "webapp": "webapp.py",
    "db": "db.py",
    "nginx_site": "nginx-site.conf",
    "nginx_headers": "nginx-security-headers.conf",
    "module": "previous-analytics_v2.py",
    "contract": "previous-analytics-contract.json",
}


def optional_hash(path: Path) -> str | None:
    return sha256(path) if path.is_file() else None


def state_hashes(paths: dict[str, Path]) -> dict[str, str | None]:
    return {key: optional_hash(path) for key, path in paths.items()}


def validate_release(
    module: Path,
    contract_path: Path,
    *,
    module_sha: str,
    contract_sha: str,
) -> None:
    """Verify the immutable artifact and its callable integration surface."""
    require_hash(module, module_sha)
    require_hash(contract_path, contract_sha)
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    if (
        contract.get("schema_version") != 2
        or contract.get("release") != "20260812analytics2"
        or not isinstance(contract.get("pages"), dict)
        or not isinstance(contract.get("events"), dict)
    ):
        raise RuntimeError("unexpected analytics v2 contract")
    spec = importlib.util.spec_from_file_location("_analytics_v2_release_smoke", module)
    if spec is None or spec.loader is None:
        raise RuntimeError("analytics v2 module cannot be imported")
    release = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(release)
    required_api = (
        "AnalyticsStore",
        "GrantSigner",
        "register_aiohttp",
        "retention_cleanup_worker",
    )
    missing = [name for name in required_api if not callable(getattr(release, name, None))]
    if missing:
        raise RuntimeError(f"analytics v2 required API missing: {', '.join(missing)}")


def install(args: argparse.Namespace) -> Path:
    root = args.root.resolve()
    app = root / "app"
    webapp = app / "webapp.py"
    db_module = app / "db.py"
    database = root / args.database
    module = args.module.resolve()
    contract_source = args.contract.resolve()
    nginx_site = args.nginx_site.resolve()
    nginx_headers = args.nginx_headers.resolve()
    for path in (webapp, db_module, database, module, contract_source, nginx_site, nginx_headers):
        if not path.is_file():
            raise RuntimeError(f"missing required file: {path}")
    validate_release(
        module,
        contract_source,
        module_sha=KNOWN_MODULE_SHA256,
        contract_sha=KNOWN_CONTRACT_SHA256,
    )
    pre_hashes = {
        "webapp": args.webapp_sha,
        "db": args.db_sha,
        "nginx_site": args.nginx_site_sha,
        "nginx_headers": args.nginx_headers_sha,
    }
    post_hashes = {
        "webapp": args.webapp_post_sha,
        "db": args.db_post_sha,
        "nginx_site": args.nginx_site_post_sha,
        "nginx_headers": args.nginx_headers_post_sha,
    }
    paths = {
        "webapp": webapp,
        "db": db_module,
        "nginx_site": nginx_site,
        "nginx_headers": nginx_headers,
    }
    module_destination = app / "analytics_v2.py"
    contract_destination = app / "analytics_contract_v2.json"
    current_hashes = {
        key: require_hash(path, pre_hashes[key], post_hashes[key])
        for key, path in paths.items()
    }
    if all(current_hashes[key] == pre_hashes[key] for key in paths):
        source_state = "pre_v2"
    elif all(post_hashes[key] and current_hashes[key] == post_hashes[key] for key in paths):
        source_state = "post_v2"
    else:
        raise RuntimeError("mixed pre/post source state; refusing partial integration")
    existing_release_files = (module_destination.is_file(), contract_destination.is_file())
    if source_state == "pre_v2" and any(existing_release_files):
        raise RuntimeError("pre-v2 seams with existing analytics release files; refusing mixed state")
    if source_state == "post_v2" and not all(existing_release_files):
        raise RuntimeError("post-v2 seams without a complete analytics release; refusing mixed state")

    # Сначала строим и проверяем весь результат в памяти: неизвестный anchor,
    # битый Python или договор не должны оставлять частично изменённый сервер.
    patched_webapp = patch_webapp(webapp.read_text(encoding="utf-8"))
    patched_db = patch_db(db_module.read_text(encoding="utf-8"))
    patched_nginx_site = patch_nginx_site(nginx_site.read_text(encoding="utf-8"))
    patched_nginx_headers = patch_nginx_headers(nginx_headers.read_text(encoding="utf-8"))
    calculated_post = {
        "webapp": sha256_text(patched_webapp),
        "db": sha256_text(patched_db),
        "nginx_site": sha256_text(patched_nginx_site),
        "nginx_headers": sha256_text(patched_nginx_headers),
    }
    if calculated_post != post_hashes:
        raise RuntimeError(
            f"patched source hash mismatch: calculated {calculated_post}; expected {post_hashes}"
        )
    compile(patched_webapp, str(webapp), "exec")
    compile(patched_db, str(db_module), "exec")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = root / "backups" / f"analytics-v2-{stamp}"
    backup.mkdir(parents=True, exist_ok=False)
    for key, source in paths.items():
        if sha256(source) != current_hashes[key]:
            raise RuntimeError(f"source changed while preparing backup: {key}")
        shutil.copy2(source, backup / BACKUP_NAMES[key])
    sqlite_backup(database, backup / "salon.db")
    previous_module = module_destination.is_file()
    previous_contract = contract_destination.is_file()
    if previous_module:
        shutil.copy2(module_destination, backup / BACKUP_NAMES["module"])
    if previous_contract:
        shutil.copy2(contract_destination, backup / BACKUP_NAMES["contract"])
    before_hashes: dict[str, str | None] = {
        **current_hashes,
        "module": optional_hash(module_destination),
        "contract": optional_hash(contract_destination),
    }
    installed_hashes: dict[str, str | None] = {
        **post_hashes,
        "module": KNOWN_MODULE_SHA256,
        "contract": KNOWN_CONTRACT_SHA256,
    }
    (backup / "manifest.json").write_text(
        json.dumps(
            {
                "format": 2,
                "kind": "analytics-v2-install",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source_state": source_state,
                "before_hashes": before_hashes,
                "installed_hashes": installed_hashes,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ) + "\n",
        encoding="utf-8",
    )

    def restore_before_install() -> None:
        for key, destination in paths.items():
            atomic_copy(backup / BACKUP_NAMES[key], destination)
        if previous_module:
            atomic_copy(backup / BACKUP_NAMES["module"], module_destination)
        else:
            module_destination.unlink(missing_ok=True)
        if previous_contract:
            atomic_copy(backup / BACKUP_NAMES["contract"], contract_destination)
        else:
            contract_destination.unlink(missing_ok=True)

    try:
        atomic_text_replace(webapp, patched_webapp)
        atomic_text_replace(db_module, patched_db)
        atomic_text_replace(nginx_site, patched_nginx_site)
        atomic_text_replace(nginx_headers, patched_nginx_headers)
        atomic_copy(module, module_destination)
        atomic_copy(contract_source, contract_destination)
        installed_paths = {
            **paths,
            "module": module_destination,
            "contract": contract_destination,
        }
        actual_installed = state_hashes(installed_paths)
        if actual_installed != installed_hashes:
            raise RuntimeError(
                f"installed state verification failed: {actual_installed}"
            )
    except Exception:
        # До перезапуска процессов безопасно вернуть исходники автоматически.
        restore_before_install()
        raise

    print(f"BACKUP={backup}")
    print(f"WEBAPP_SHA256={sha256(webapp)}")
    print(f"DB_MODULE_SHA256={sha256(db_module)}")
    print(f"ANALYTICS_MODULE_SHA256={sha256(app / 'analytics_v2.py')}")
    print(f"CONTRACT_SHA256={sha256(app / 'analytics_contract_v2.json')}")
    print(f"NGINX_SITE_SHA256={sha256(nginx_site)}")
    print(f"NGINX_HEADERS_SHA256={sha256(nginx_headers)}")
    return backup


def rollback(args: argparse.Namespace) -> None:
    root = args.root.resolve()
    backup = args.rollback.resolve()
    if backup.parent != root / "backups" or not backup.name.startswith("analytics-v2-"):
        raise RuntimeError("rollback path is outside the exact analytics backup directory")
    manifest_path = backup / "manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError("rollback manifest missing")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    before_hashes = manifest.get("before_hashes")
    installed_hashes = manifest.get("installed_hashes")
    expected_keys = {"webapp", "db", "nginx_site", "nginx_headers", "module", "contract"}
    valid_hash = lambda value: (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )
    if (
        manifest.get("format") != 2
        or manifest.get("kind") != "analytics-v2-install"
        or not isinstance(before_hashes, dict)
        or not isinstance(installed_hashes, dict)
        or set(before_hashes) != expected_keys
        or set(installed_hashes) != expected_keys
        or any(value is not None and not valid_hash(value) for value in before_hashes.values())
        or any(not valid_hash(value) for value in installed_hashes.values())
    ):
        raise RuntimeError("rollback manifest invalid")
    destinations = {
        "webapp": root / "app" / "webapp.py",
        "db": root / "app" / "db.py",
        "nginx_site": args.nginx_site.resolve(),
        "nginx_headers": args.nginx_headers.resolve(),
        "module": root / "app" / "analytics_v2.py",
        "contract": root / "app" / "analytics_contract_v2.json",
    }
    current_hashes = state_hashes(destinations)
    if current_hashes != installed_hashes:
        raise RuntimeError(
            "current files no longer match this backup's installed state; refusing stale rollback"
        )
    for key, expected in before_hashes.items():
        source = backup / BACKUP_NAMES[key]
        if expected is None:
            if source.exists():
                raise RuntimeError(f"unexpected rollback source: {source}")
        elif not source.is_file() or sha256(source) != expected:
            raise RuntimeError(f"rollback source hash mismatch: {source}")

    database = root / args.database
    if not database.is_file():
        raise RuntimeError(f"missing required file: {database}")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    safety = root / "backups" / f"rollback-safety-analytics-v2-{stamp}"
    safety.mkdir(parents=True, exist_ok=False)
    for key, source in destinations.items():
        shutil.copy2(source, safety / BACKUP_NAMES[key])
    sqlite_backup(database, safety / "salon.db")
    (safety / "manifest.json").write_text(
        json.dumps(
            {
                "format": 1,
                "kind": "analytics-v2-rollback-safety",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "rollback_source": str(backup),
                "saved_hashes": current_hashes,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ) + "\n",
        encoding="utf-8",
    )

    try:
        for key, destination in destinations.items():
            expected = before_hashes[key]
            if expected is None:
                destination.unlink(missing_ok=True)
            else:
                atomic_copy(backup / BACKUP_NAMES[key], destination)
        restored_hashes = state_hashes(destinations)
        if restored_hashes != before_hashes:
            raise RuntimeError(
                f"rollback destination verification failed: {restored_hashes}"
            )
    except Exception:
        for key, destination in destinations.items():
            atomic_copy(safety / BACKUP_NAMES[key], destination)
        raise
    print(f"ROLLBACK_SAFETY_BACKUP={safety}")
    print("ROLLBACK_SOURCE_RESTORED=1")
    print("NOTE=v2 tables intentionally retained; restore SQLite only for proven data corruption")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--root", type=Path, required=True)
    result.add_argument("--module", type=Path, default=Path(__file__).with_name("analytics_v2.py"))
    result.add_argument(
        "--contract",
        type=Path,
        default=Path(__file__).parents[2] / "analytics" / "contract.json",
    )
    result.add_argument("--database", default="salon.db")
    result.add_argument("--webapp-sha", default=KNOWN_WEBAPP_SHA256)
    result.add_argument("--webapp-post-sha", default=KNOWN_WEBAPP_POST_SHA256)
    result.add_argument("--db-sha", default=KNOWN_DB_SHA256)
    result.add_argument("--db-post-sha", default=KNOWN_DB_POST_SHA256)
    result.add_argument("--nginx-site", type=Path, default=Path("/etc/nginx/sites-enabled/api"))
    result.add_argument(
        "--nginx-headers",
        type=Path,
        default=Path("/etc/nginx/snippets/akademsalon-security-headers.conf"),
    )
    result.add_argument("--nginx-site-sha", default=KNOWN_NGINX_SITE_SHA256)
    result.add_argument("--nginx-site-post-sha", default=KNOWN_NGINX_SITE_POST_SHA256)
    result.add_argument("--nginx-headers-sha", default=KNOWN_NGINX_HEADERS_SHA256)
    result.add_argument("--nginx-headers-post-sha", default=KNOWN_NGINX_HEADERS_POST_SHA256)
    result.add_argument("--rollback", type=Path)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        if args.rollback:
            rollback(args)
        else:
            install(args)
    except Exception as exc:
        print(f"ERROR={exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
