#!/usr/bin/env python3
"""Exact-source atomic patch: conservative estimate + snapshot-bound checkout.

No schema changes. No balance/payment status mutation by the installer.
Rollback is source-only with an exact after-hash and a stopped runtime writer.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import tempfile

EXPECTED_WEBAPP = "ade607b6005ffb359c6841fdd8ed28c6773a1cbd67109567710972d85928ed29"
MARKER = "# salon-autoquote:20260909-v1"

ORDER_PAY = '''async def order_pay(request: web.Request) -> web.Response:
    """Authenticated checkout, exact snapshot and amount under one DB lock."""
    # salon-autoquote:20260909-v1
    if not _rate_ok("pay:" + _ip(request), cost=2):
        return _err("rate_limit", 429)
    order_id = int(request.match_info["id"])
    o, user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if _sess_imp(user):
        return _err("admin_session", 409)
    try:
        body = await request.json()
        if not isinstance(body, dict):
            return _err("bad_request", 400)
    except Exception:
        return _err("bad_json", 400)
    email = body.get("email") or ""
    if not isinstance(email, str) or len(email) > 120 or (email and not mailer.looks_email(email)):
        return _err("bad_email", 400)
    expected_keys = ("expected_snapshot", "expected_hash", "expected_amount")
    if any(k in body for k in expected_keys):
        if any(k not in body for k in expected_keys) or type(body["expected_snapshot"]) is not int or type(body["expected_amount"]) is not int or not isinstance(body["expected_hash"], str) or not re.fullmatch(r"[a-f0-9]{64}", body["expected_hash"]):
            return _err("bad_quote_reference", 400)
    if config.pay_provider() != "robokassa":
        return await legacy_order_pay(request)
    from .services import autoquote
    try:
        result = await autoquote.checkout(order_id, receipt_email=email or None,
            expected_snapshot=body.get("expected_snapshot"), expected_hash=body.get("expected_hash"),
            expected_amount=body.get("expected_amount"))
        return _json(result)
    except ValueError as exc:
        allowed = {"pay_stage", "nothing_due", "online_unavailable", "specification_not_frozen",
                   "specification_receipt_mismatch", "financial_revision_requires_review", "quote_changed", "pay_failed"}
        reason = str(exc) if str(exc) in allowed else "pay_failed"
        return _err(reason, 502 if reason == "pay_failed" else 409)


async def autoquote_preview(request: web.Request) -> web.Response:
    """Stateless workload preview; attachments cannot self-certify as read."""
    if not _rate_ok("autoquote:" + _ip(request), cost=3):
        return _err("rate_limit", 429)
    try:
        body = await request.json()
        if not isinstance(body, dict) or len(json.dumps(body, ensure_ascii=False)) > 180000:
            return _err("bad_request", 400)
    except Exception:
        return _err("bad_json", 400)
    from .services import autoquote
    result = autoquote.analyze(body, materials=[])
    # Planning margins/cost reserves are internal, not a customer's quote.
    public = {k: result[k] for k in ("version", "state", "can_pay", "intent_hash", "components",
        "standard_rub", "express_rub", "gross_rub", "main_rub", "addon_prices", "reasons",
        "deadline_at", "expires_at")}
    public["state"] = "estimate" if not public["reasons"] else "manual_required"
    return _json({"ok": True, "quote": public})


async def assistant_answer(request: web.Request) -> web.Response:
    if not _rate_ok("assistant:" + _ip(request), cost=2):
        return _err("rate_limit", 429)
    try:
        body = await request.json()
        if not isinstance(body, dict) or not isinstance(body.get("question"), str) or not 1 <= len(body["question"].strip()) <= 2000:
            return _err("question_required", 400)
    except Exception:
        return _err("bad_json", 400)
    order = None
    if body.get("order_id") is not None:
        if type(body["order_id"]) is not int or body["order_id"] <= 0:
            return _err("bad_request", 400)
        saved, user = await _order_access(request, body["order_id"])
        if not saved:
            return _err("not_found", 404)
        order = _order_json(saved)
        kind, amount = await payments.stage_amount(saved)
        order["due_now"] = {"kind": kind, "amount": amount}
    from .services import assistant
    return _json(assistant.answer(body["question"], order))
'''


def sha(value):
    return hashlib.sha256(value).hexdigest()


def patch(source):
    if MARKER in source:
        raise ValueError("already_installed")
    start = source.index("async def order_pay(")
    end = source.index("async def order_tip(", start)
    legacy = source[start:end].replace("async def order_pay(", "async def legacy_order_pay(", 1)
    source = source[:start] + ORDER_PAY + "\n\n" + legacy + source[end:]
    anchor = '    r.add_post("/api/orders", orders_create)'
    if source.count(anchor) != 1:
        raise ValueError("route_anchor_changed")
    source = source.replace(anchor, anchor + '\n    r.add_post("/api/quote/preview", autoquote_preview)\n    r.add_post("/api/assistant/answer", assistant_answer)')
    full_anchor = '    return d\n\n# ------------------------------------------------------------------- auth'
    if source.count(full_anchor) != 1:
        raise ValueError("full_order_anchor_changed")
    source = source.replace(full_anchor, '    from .services import autoquote\n    d["legacy_checkout"] = await autoquote.legacy_checkout_allowed(o)\n' + full_anchor)
    action_anchor = '    return _json({"ok": True, "order": await _order_full_json(o), **resp_extra})'
    source = source.replace(action_anchor, '    if action in ("bonus_apply", "bonus_cancel", "gift_apply", "gift_remove"):\n        from .services import autoquote\n        try:\n            await autoquote.refresh_financial_revision(order_id)\n        except ValueError:\n            resp_extra["financial_review"] = True\n' + action_anchor)
    compile(source, "webapp.py", "exec")
    return source.encode()


def atomic(path, data, mode=0o600):
    fd, name = tempfile.mkstemp(prefix=".salon-autonomy-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data); f.flush(); os.fsync(f.fileno())
        os.chmod(name, mode); os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)


def prepare(root, module):
    web = root / "app/webapp.py"
    source = web.read_bytes()
    if sha(source) != EXPECTED_WEBAPP:
        raise ValueError("reviewed_source_changed")
    payload = module.read_bytes()
    compile(payload, "autoquote.py", "exec")
    dest = root / "app/services/autoquote.py"
    if dest.exists() and dest.read_bytes() != payload:
        raise ValueError("module_bytes_differ")
    assistant = module.with_name("assistant.py").read_bytes()
    compile(assistant, "assistant.py", "exec")
    assistant_dest = root / "app/services/assistant.py"
    if assistant_dest.exists() and assistant_dest.read_bytes() != assistant:
        raise ValueError("assistant_bytes_differ")
    return source, patch(source.decode()), payload


def apply(root, module):
    original, patched, payload = prepare(root, module)
    backup = root / "backups" / ("autoquote-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    backup.mkdir(parents=True, mode=0o700)
    assistant = module.with_name("assistant.py").read_bytes()
    receipt = {"before": sha(original), "after": sha(patched), "module": sha(payload), "assistant": sha(assistant), "database_changed": False}
    atomic(backup / "webapp.py", original)
    atomic(backup / "receipt.json", json.dumps(receipt, indent=2).encode())
    web = root / "app/webapp.py"
    if sha(web.read_bytes()) != EXPECTED_WEBAPP:
        raise ValueError("concurrent_source_change")
    atomic(root / "app/services/autoquote.py", payload)
    atomic(root / "app/services/assistant.py", assistant)
    atomic(web, patched, web.stat().st_mode & 0o777)
    return {"backup": str(backup), **receipt}


def rollback(root, backup):
    isolated_root = root.resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
    if not isolated_root:
        output = subprocess.check_output(["systemctl", "show", "salon-bot-v2.service", "-p", "ActiveState", "-p", "MainPID"], text=True)
        state = dict(x.split("=", 1) for x in output.splitlines())
        if state.get("ActiveState") not in ("inactive", "failed") or state.get("MainPID") != "0":
            raise ValueError("stop_runtime_before_rollback")
    receipt = json.loads((backup / "receipt.json").read_text())
    web = root / "app/webapp.py"
    if sha(web.read_bytes()) != receipt["after"] or sha((root / "app/services/autoquote.py").read_bytes()) != receipt["module"] or sha((root / "app/services/assistant.py").read_bytes()) != receipt["assistant"]:
        raise ValueError("source_changed_after_deploy")
    original = (backup / "webapp.py").read_bytes()
    if sha(original) != receipt["before"]:
        raise ValueError("backup_corrupt")
    atomic(web, original, web.stat().st_mode & 0o777)
    return {"rolled_back": True, "database_changed": False}


if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("mode", choices=["prepare", "apply", "rollback"])
    p.add_argument("--root", type=Path, required=True); p.add_argument("--module", type=Path, default=Path(__file__).with_name("autoquote.py")); p.add_argument("--backup", type=Path)
    args = p.parse_args()
    if args.mode == "prepare":
        before, after, payload = prepare(args.root, args.module)
        result = {"before": sha(before), "after": sha(after), "module": sha(payload)}
    elif args.mode == "apply": result = apply(args.root, args.module)
    else: result = rollback(args.root, args.backup)
    print(json.dumps(result))
