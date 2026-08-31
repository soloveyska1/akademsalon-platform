#!/usr/bin/env python3
"""Install, seed and control the bounded Zero Classes promo campaign.

The full production backend is intentionally private.  This installer accepts
only an exact reviewed source image, creates an atomic backup, applies narrow
marker-based patches and never prints generated promo codes or claimant keys.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path


MARKER = "zero-classes-campaign:20260831-v1"
KNOWN_BEFORE = {
    "webapp": "cb5b2624f9ed9769e9464f2a198ad997127641fba6fa19d30cec9fbc3943a200",
    "db": "b9ac6409c834f6858855d13aba862e3c0dc063c064837e4f5c5d5b75ea4efd6f",
    "promo": "b10967c095969099e8ecfbb5679e2e3db8d8993bd5ba9e76b74d32c508c8a00c",
}
CAMPAIGN_ID = "zero-classes-2026-09-01"
DEFAULT_CREDENTIAL = Path("/etc/academic-salon/zero_campaign_hmac")
DEFAULT_DROPIN = Path(
    "/etc/systemd/system/salon-bot-v2.service.d/zero-campaign.conf"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def paths(root: Path) -> dict[str, Path]:
    return {
        "webapp": root / "app/webapp.py",
        "db": root / "app/db.py",
        "promo": root / "app/services/promo.py",
        "zero": root / "app/services/zero_campaign.py",
    }


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def patch_db(text: str) -> str:
    if f"# {MARKER}:db" in text:
        return text
    anchor = '''async def _promo_claim_validate(c, claim: dict[str, Any] | None) -> None:
    if not claim:
        return
    if claim.get("family") != "first-order-2026-08":
        raise PromoEligibilityError("unknown campaign family")
'''
    replacement = '''async def _promo_claim_validate(c, claim: dict[str, Any] | None) -> None:
    if not claim:
        return
    # zero-classes-campaign:20260831-v1:db
    family = str(claim.get("family") or "")
    if family == "zero-classes-2026-09-01":
        setting = await (await c.execute(
            "SELECT expires_at FROM zero_campaigns WHERE campaign_id=?",
            (family,),
        )).fetchone()
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        if not setting or now_utc > str(setting["expires_at"]):
            raise PromoEligibilityError("campaign off")
        code = str(claim.get("code") or "").strip().upper()
        user_id = claim.get("user_id")
        contact = str(claim.get("contact") or "").strip()
        contact_key = claim.get("contact_key") or _promo_contact_key(contact)
        if not code or (not user_id and not contact_key):
            raise PromoEligibilityError("identity required")
        promo = await (await c.execute(
            "SELECT family,active,amount,min_price,uses_left FROM promos WHERE code=?",
            (code,),
        )).fetchone()
        if (not promo or promo["family"] != family or not promo["active"] or
                int(promo["amount"] or 0) != 1000 or
                int(promo["min_price"] or 0) != 5000 or
                int(promo["uses_left"] or 0) <= 0):
            raise PromoEligibilityError("campaign code unavailable")
        if not await (await c.execute(
            "SELECT 1 FROM zero_campaign_claims WHERE campaign_id=? AND code=? LIMIT 1",
            (family, code),
        )).fetchone():
            raise PromoEligibilityError("campaign code not issued")
        if await (await c.execute(
            "SELECT 1 FROM promo_first_order_claims "
            "WHERE family=? AND code=? LIMIT 1",
            (family, code),
        )).fetchone():
            raise PromoEligibilityError("campaign code already bound")
        if await (await c.execute(
            "SELECT 1 FROM promo_first_order_claims WHERE family=? AND "
            "((? IS NOT NULL AND user_id=?) OR (? IS NOT NULL AND contact_key=?)) LIMIT 1",
            (family, user_id, user_id, contact_key, contact_key),
        )).fetchone():
            raise PromoEligibilityError("campaign already claimed")
        return
    if family != "first-order-2026-08":
        raise PromoEligibilityError("unknown campaign family")
'''
    text = replace_once(text, anchor, replacement, "db validate")
    text = replace_once(
        text,
        '''    if code != "ПЕРВЫЙЛИСТ":
        cur = await c.execute(
''',
        '''    if claim["family"] == "first-order-2026-08" and code != "ПЕРВЫЙЛИСТ":
        cur = await c.execute(
''',
        "db retention consume",
    )
    text = replace_once(
        text,
        '''    await c.execute(
        "INSERT INTO promo_first_order_claims"
        "(family,code,user_id,contact_key,order_id,created_at) VALUES(?,?,?,?,?,?)",
        (claim["family"], code, claim.get("user_id"),
         claim.get("contact_key") or _promo_contact_key(claim.get("contact")),
         order_id, created_at),
    )
''',
        '''    try:
        await c.execute(
            "INSERT INTO promo_first_order_claims"
            "(family,code,user_id,contact_key,order_id,created_at) VALUES(?,?,?,?,?,?)",
            (claim["family"], code, claim.get("user_id"),
             claim.get("contact_key") or _promo_contact_key(claim.get("contact")),
             order_id, created_at),
        )
    except sqlite3.IntegrityError as exc:
        if claim["family"] == "zero-classes-2026-09-01":
            raise PromoEligibilityError("campaign code already bound") from exc
        raise
''',
        "db claim race mapping",
    )
    return text


def patch_promo(text: str) -> str:
    if f"# {MARKER}:promo" in text:
        return text
    text = replace_once(
        text,
        'FIRST_ORDER_FAMILY = "first-order-2026-08"\n',
        'FIRST_ORDER_FAMILY = "first-order-2026-08"\n'
        '# zero-classes-campaign:20260831-v1:promo\n'
        'ZERO_CLASSES_FAMILY = "zero-classes-2026-09-01"\n'
        'BOUND_PROMO_FAMILIES = frozenset({FIRST_ORDER_FAMILY, ZERO_CLASSES_FAMILY})\n',
        "promo constants",
    )
    text = replace_once(
        text,
        '''    claimed_first_order = bool(
        p and p["family"] == FIRST_ORDER_FAMILY and
        await db.promo_claim_matches(
            FIRST_ORDER_FAMILY, o["user_id"], o["guest_contact"], order_id,
            code=code,
        )
    )
''',
        '''    claimed_bound_promo = bool(
        p and p["family"] in BOUND_PROMO_FAMILIES and
        await db.promo_claim_matches(
            p["family"], o["user_id"], o["guest_contact"], order_id,
            code=code,
        )
    )
''',
        "promo claimed binding",
    )
    text = text.replace("if claimed_first_order and bad in (", "if claimed_bound_promo and bad in (", 1)
    text = text.replace(
        'if p["family"] == FIRST_ORDER_FAMILY and not claimed_first_order:',
        'if p["family"] in BOUND_PROMO_FAMILIES and not claimed_bound_promo:',
        1,
    )
    return text


ZERO_HANDLERS = r'''

# zero-classes-campaign:20260831-v1:web
ZERO_CAMPAIGN_ORIGINS = {
    "https://studkladovaya.ru", "https://www.studkladovaya.ru",
    "https://akademsalon.ru", "https://www.akademsalon.ru",
}


def _zero_headers(request: web.Request, *, public: bool) -> dict[str, str]:
    headers = {
        "Cache-Control": "public, max-age=2" if public else "no-store",
        "Vary": "Origin",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
    }
    origin = request.headers.get("Origin", "")
    if origin in ZERO_CAMPAIGN_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
    return headers


async def zero_campaign_status(request: web.Request) -> web.Response:
    try:
        payload = await zero_campaign.public_status()
        return web.json_response(payload, headers=_zero_headers(request, public=True))
    except (sqlite3.Error, RuntimeError):
        log.exception("zero campaign status unavailable")
        return web.json_response(
            {"ok": False, "state": "unavailable", "drops": []}, status=503,
            headers=_zero_headers(request, public=True),
        )


async def zero_campaign_claim(request: web.Request) -> web.Response:
    try:
        body = await request.read()
        if len(body) > 1024:
            raise zero_campaign.CampaignError("body_too_large", 413)
        value = zero_campaign.authenticated_claim_payload(
            body=body,
            timestamp=request.headers.get("X-Zero-Timestamp", ""),
            nonce=request.headers.get("X-Zero-Nonce", ""),
            signature=request.headers.get("X-Zero-Signature", ""),
            source_ip=_ip(request),
        )
        result = await zero_campaign.claim(
            drop_id=str(value["drop_id"]),
            claimant=str(value["claimant_key"]),
            request_id=str(value["request_id"]),
            nonce=request.headers.get("X-Zero-Nonce", ""),
        )
        return web.json_response(result, headers=_zero_headers(request, public=False))
    except zero_campaign.CampaignError as error:
        return web.json_response(
            {"ok": False, "error": error.code}, status=error.status,
            headers=_zero_headers(request, public=False),
        )
    except (TypeError, ValueError):
        return web.json_response(
            {"ok": False, "error": "bad_payload"}, status=400,
            headers=_zero_headers(request, public=False),
        )
'''


def patch_webapp(text: str) -> str:
    if f"# {MARKER}:web" in text:
        return text
    text = replace_once(
        text,
        "from .services import promo as promo_svc\n",
        "from .services import promo as promo_svc\nfrom .services import zero_campaign\n",
        "webapp import",
    )
    order_anchor = '''        elif not bad and p["family"] and await db.promo_family_used(
                p["family"], user["id"] if user else None, guest_contact or None):
            bad = "already_used"
'''
    order_replacement = '''        elif not bad and p["family"] == zero_campaign.FAMILY:
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            campaign = await (await db.conn().execute(
                "SELECT expires_at FROM zero_campaigns WHERE campaign_id=?",
                (zero_campaign.CAMPAIGN_ID,),
            )).fetchone()
            if not campaign or now_utc > str(campaign["expires_at"]):
                bad = "off"
            elif not await (await db.conn().execute(
                "SELECT 1 FROM zero_campaign_claims WHERE campaign_id=? AND code=? LIMIT 1",
                (zero_campaign.CAMPAIGN_ID, raw_promo),
            )).fetchone():
                bad = "not_issued"
            elif user and user["id"] in config.ADMIN_IDS:
                bad = "preview_only"
            else:
                promo_claim = {
                    "family": zero_campaign.FAMILY, "code": raw_promo,
                    "user_id": user["id"] if user else None,
                    "contact": guest_contact or None,
                    "contact_key": db._promo_contact_key(guest_contact),
                }
        elif not bad and p["family"] and await db.promo_family_used(
                p["family"], user["id"] if user else None, guest_contact or None):
            bad = "already_used"
'''
    text = replace_once(text, order_anchor, order_replacement, "webapp order promo")
    check_anchor = '''    elif not bad and p["family"]:
        user = await _session_user(request)
        if user and await db.promo_family_used(p["family"], user["id"], None):
            bad = "already_used"
'''
    check_replacement = '''    elif not bad and p["family"] == zero_campaign.FAMILY:
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        campaign = await (await db.conn().execute(
            "SELECT expires_at FROM zero_campaigns WHERE campaign_id=?",
            (zero_campaign.CAMPAIGN_ID,),
        )).fetchone()
        user = await _session_user(request)
        if not campaign or now_utc > str(campaign["expires_at"]):
            bad = "off"
        elif not await (await db.conn().execute(
            "SELECT 1 FROM zero_campaign_claims WHERE campaign_id=? AND code=? LIMIT 1",
            (zero_campaign.CAMPAIGN_ID, code),
        )).fetchone():
            bad = "not_issued"
        elif user and user["id"] in config.ADMIN_IDS:
            bad = "preview_only"
        elif user and await db.promo_family_used(p["family"], user["id"], None):
            bad = "already_used"
    elif not bad and p["family"]:
        user = await _session_user(request)
        if user and await db.promo_family_used(p["family"], user["id"], None):
            bad = "already_used"
'''
    text = replace_once(text, check_anchor, check_replacement, "webapp promo check")
    text = replace_once(
        text,
        "\nasync def promo_eligibility(request: web.Request) -> web.Response:\n",
        ZERO_HANDLERS + "\n\nasync def promo_eligibility(request: web.Request) -> web.Response:\n",
        "webapp campaign handlers",
    )
    text = replace_once(
        text,
        '    r.add_get("/api/promo/eligibility", promo_eligibility)\n',
        '    r.add_get("/api/campaigns/zero-classes-2026-09-01/status", zero_campaign_status)\n'
        '    r.add_post("/api/campaigns/zero-classes-2026-09-01/claim", zero_campaign_claim)\n'
        '    r.add_get("/api/promo/eligibility", promo_eligibility)\n',
        "webapp campaign routes",
    )
    return text


def module_from_source(path: Path):
    spec = importlib.util.spec_from_file_location("zero_campaign_installer_runtime", path)
    module = importlib.util.module_from_spec(spec)
    # Relative app import is irrelevant for the synchronous installer helpers.
    module.__package__ = "app.services"
    import types, sys
    app = sys.modules.setdefault("app", types.ModuleType("app"))
    app.__path__ = []
    app.db = types.SimpleNamespace()
    services = sys.modules.setdefault("app.services", types.ModuleType("app.services"))
    services.__path__ = []
    sys.modules["app.db"] = app.db
    spec.loader.exec_module(module)
    return module


def atomic_write(path: Path, content: str, *, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if mode is not None:
            os.chmod(name, mode)
        os.replace(name, path)
    finally:
        try:
            os.unlink(name)
        except FileNotFoundError:
            pass


def source_candidates(root: Path) -> dict[str, str]:
    target = paths(root)
    return {
        "webapp": patch_webapp(target["webapp"].read_text(encoding="utf-8")),
        "db": patch_db(target["db"].read_text(encoding="utf-8")),
        "promo": patch_promo(target["promo"].read_text(encoding="utf-8")),
        "zero": Path(__file__).with_name("zero_campaign.py").read_text(encoding="utf-8"),
    }


def packaged_dropin() -> str:
    return (
        Path(__file__).with_name("systemd")
        / "salon-bot-v2-zero-campaign.conf"
    ).read_text(encoding="utf-8")


def prepare_runtime(credential: Path, dropin: Path) -> None:
    """Fail closed unless the shared HMAC secret and systemd unit are safe."""
    if not credential.is_file() or credential.is_symlink():
        raise RuntimeError("zero campaign credential is missing or unsafe")
    stat = credential.stat()
    if stat.st_uid != 0 or stat.st_gid != 0 or (stat.st_mode & 0o777) != 0o400:
        raise RuntimeError("zero campaign credential must be root:root 0400")
    if len(credential.read_text(encoding="utf-8").strip()) < 32:
        raise RuntimeError("zero campaign credential must contain at least 32 characters")
    content = packaged_dropin()
    if dropin.exists():
        if dropin.is_symlink() or dropin.read_text(encoding="utf-8") != content:
            raise RuntimeError("unexpected zero campaign systemd drop-in")
    else:
        atomic_write(dropin, content, mode=0o644)


def restart_service() -> None:
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "restart", "salon-bot-v2.service"], check=True)
    subprocess.run(
        ["systemctl", "is-active", "--quiet", "salon-bot-v2.service"],
        check=True,
    )


def install(
    root: Path,
    database: Path,
    backup_root: Path,
    *,
    restart: bool,
    credential: Path = DEFAULT_CREDENTIAL,
    dropin: Path = DEFAULT_DROPIN,
) -> dict:
    target = paths(root)
    current = {key: sha256(target[key]) for key in ("webapp", "db", "promo")}
    if all(MARKER in target[key].read_text(encoding="utf-8") for key in current):
        if restart:
            prepare_runtime(credential, dropin)
            restart_service()
        return check(root, database)
    if current != KNOWN_BEFORE:
        raise RuntimeError(f"unknown source image: {current}")
    if restart:
        prepare_runtime(credential, dropin)
    candidates = source_candidates(root)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = backup_root / f"zero-classes-{stamp}"
    backup.mkdir(parents=True, exist_ok=False)
    for key in ("webapp", "db", "promo"):
        shutil.copy2(target[key], backup / target[key].name)
    if target["zero"].exists():
        shutil.copy2(target["zero"], backup / "zero_campaign.py")
    for key, content in candidates.items():
        mode = target[key].stat().st_mode & 0o777 if target[key].exists() else 0o640
        atomic_write(target[key], content, mode=mode)
    module = module_from_source(Path(__file__).with_name("zero_campaign.py"))
    connection = sqlite3.connect(database)
    try:
        connection.executescript(module.SCHEMA)
        connection.commit()
    finally:
        connection.close()
    if restart:
        restart_service()
    result = check(root, database)
    result["backup"] = str(backup)
    return result


def restore(
    root: Path,
    database: Path,
    backup_root: Path,
    backup: Path,
    *,
    restart: bool,
    dropin: Path = DEFAULT_DROPIN,
) -> dict:
    """Restore the reviewed preimage only before the first issued code."""
    backup_root = backup_root.resolve()
    backup = backup.resolve()
    if (
        backup.parent != backup_root
        or not backup.name.startswith("zero-classes-")
        or not backup.is_dir()
    ):
        raise RuntimeError("restore path is outside the campaign backup root")
    target = paths(root)
    restore_files = {
        "webapp": backup / "webapp.py",
        "db": backup / "db.py",
        "promo": backup / "promo.py",
    }
    for key, source in restore_files.items():
        if (
            not source.is_file()
            or source.is_symlink()
            or source.resolve().parent != backup
            or sha256(source) != KNOWN_BEFORE[key]
        ):
            raise RuntimeError(f"invalid {key} restore image")
    if dropin.exists() and (
        dropin.is_symlink() or dropin.read_text(encoding="utf-8") != packaged_dropin()
    ):
        raise RuntimeError("refusing to remove an unexpected systemd drop-in")

    connection = sqlite3.connect(database, timeout=10)
    try:
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("BEGIN IMMEDIATE")
        claims = int(connection.execute(
            "SELECT COUNT(*) FROM zero_campaign_claims WHERE campaign_id=?",
            (CAMPAIGN_ID,),
        ).fetchone()[0])
        if claims:
            raise RuntimeError("issued codes exist; disable issuance instead of restoring")
        connection.execute(
            "UPDATE zero_campaigns SET enabled=0 WHERE campaign_id=?",
            (CAMPAIGN_ID,),
        )
        connection.execute(
            "UPDATE promos SET active=0 WHERE family=?",
            (CAMPAIGN_ID,),
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    for key, source in restore_files.items():
        mode = target[key].stat().st_mode & 0o777
        atomic_write(target[key], source.read_text(encoding="utf-8"), mode=mode)
    if target["zero"].exists():
        target["zero"].unlink()
    if dropin.exists():
        dropin.unlink()
    if restart:
        restart_service()
    result = check(root, database)
    result.update({"restored": True, "backup": str(backup)})
    return result


def check(root: Path, database: Path) -> dict:
    target = paths(root)
    installed = all(
        target[key].exists() and MARKER in target[key].read_text(encoding="utf-8")
        for key in ("webapp", "db", "promo")
    ) and target["zero"].exists()
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    integrity = "schema_missing"
    try:
        row = connection.execute(
            "SELECT enabled FROM zero_campaigns WHERE campaign_id='zero-classes-2026-09-01'"
        ).fetchone()
        slots = connection.execute(
            "SELECT COUNT(*) FROM zero_campaign_slots WHERE campaign_id=?",
            ("zero-classes-2026-09-01",),
        ).fetchone()[0]
        claims = connection.execute("SELECT COUNT(*) FROM zero_campaign_claims").fetchone()[0]
        quick = connection.execute("PRAGMA quick_check").fetchone()[0]
        if row and int(slots) == 30:
            module = module_from_source(Path(__file__).with_name("zero_campaign.py"))
            module.campaign_integrity(connection)
            integrity = "ok"
        else:
            integrity = "not_seeded"
    except (sqlite3.OperationalError, RuntimeError) as error:
        row, slots, claims, quick = None, 0, 0, "schema_missing"
        integrity = type(error).__name__
    finally:
        connection.close()
    return {
        "ok": installed and quick == "ok" and integrity in {"ok", "not_seeded"},
        "installed": installed,
        "seeded_slots": int(slots), "claims": int(claims),
        "enabled": bool(row and row[0]), "quick_check": quick,
        "integrity": integrity,
        "sha256": {key: sha256(path) for key, path in target.items() if path.exists()},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/root/salon_bot"))
    parser.add_argument("--db", type=Path, default=Path("/root/salon_bot/salon.db"))
    parser.add_argument("--backup-root", type=Path, default=Path("/root/salon_bot/backups"))
    parser.add_argument("--credential", type=Path, default=DEFAULT_CREDENTIAL)
    parser.add_argument("--dropin", type=Path, default=DEFAULT_DROPIN)
    parser.add_argument("--restart", action="store_true")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--apply", action="store_true")
    action.add_argument("--seed", action="store_true")
    action.add_argument("--enable", action="store_true")
    action.add_argument("--disable", action="store_true")
    action.add_argument("--check", action="store_true")
    action.add_argument("--restore", type=Path)
    args = parser.parse_args()
    if args.apply:
        result = install(
            args.root, args.db, args.backup_root, restart=args.restart,
            credential=args.credential, dropin=args.dropin,
        )
    elif args.restore:
        result = restore(
            args.root, args.db, args.backup_root, args.restore,
            restart=args.restart, dropin=args.dropin,
        )
    else:
        module = module_from_source(Path(__file__).with_name("zero_campaign.py"))
        if args.seed:
            result = module.seed_database(args.db, enabled=False)
        elif args.enable:
            if not args.restart:
                raise RuntimeError("--enable requires --restart and runtime preflight")
            before = check(args.root, args.db)
            if (
                not before["ok"]
                or not before["installed"]
                or before["integrity"] != "ok"
            ):
                raise RuntimeError("campaign runtime is not installed and seeded")
            prepare_runtime(args.credential, args.dropin)
            restart_service()
            module.set_enabled(args.db, True)
            result = check(args.root, args.db)
        elif args.disable:
            module.set_enabled(args.db, False)
            result = check(args.root, args.db)
        else:
            result = check(args.root, args.db)
    # Deliberately restricted to aggregate counts, hashes and paths: never codes.
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
