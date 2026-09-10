"""Host-only reconciliation; never exposed as a customer HTTP endpoint.

Run from the live application parent: python -m app.material_store.admin ...
Evidence for an external refund must come from the merchant operation detail.
GetState alone does not identify the original invoice, so binding is explicit.
"""
import argparse
import asyncio
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import uuid

from .core import Store, StoreError, INV_OFFSET
from . import provider


async def reconcile(store, pid, evidence_path):
    evidence = json.loads(evidence_path.read_text())
    p = store.get(pid)
    request_id = str(uuid.UUID(evidence["request_id"]))
    if (str(evidence.get("invoice_id")) != str(INV_OFFSET + pid)
            or not evidence.get("operation_key")
            or not evidence.get("merchant_reference")):
        raise StoreError("refund_evidence_mismatch")
    # The saved merchant reference establishes invoice association. The remote
    # operation and refund endpoint independently verify their current states.
    operation = await provider.operation(INV_OFFSET + pid)
    provider.verified_operation_amount(operation, p)
    op_key = operation.get("op_key")
    if not op_key or evidence["operation_key"] != op_key or (p["op_key"] and op_key != p["op_key"]):
        raise StoreError("payment_mismatch")
    store.observation(pid, str(operation.get("state")), op_key)
    state = await provider.refund_status(request_id)
    try:
        same_request = uuid.UUID(str(state.get("requestId"))) == uuid.UUID(request_id)
    except (ValueError, TypeError, AttributeError):
        same_request = False
    if not same_request or state.get("label") != "finished":
        raise StoreError("refund_not_finished")
    amount = Decimal(str(state.get("amount")))
    if not amount.is_finite() or amount <= 0 or amount != int(amount):
        raise StoreError("refund_amount_mismatch")
    digest = hashlib.sha256(evidence_path.read_bytes()).hexdigest()
    with store.tx() as c:
        prior = c.execute("SELECT purchase_id,amount FROM external_refunds WHERE request_id=?", (request_id,)).fetchone()
        if prior and (prior["purchase_id"] != pid or prior["amount"] != int(amount)):
            raise StoreError("refund_evidence_mismatch")
        c.execute("INSERT OR IGNORE INTO external_refunds(request_id,purchase_id,amount,evidence_sha256) VALUES(?,?,?,?)",
                  (request_id, pid, int(amount), digest))
        total = c.execute("SELECT SUM(amount) FROM external_refunds WHERE purchase_id=?", (pid,)).fetchone()[0]
        # An automatic full refund may already be reflected. A repeat is safe.
        cumulative = max(p["refunded"], total)
        if cumulative > p["cash"]:
            raise StoreError("refund_amount_mismatch")
        store.log(c, pid, "external_refund_verified", {"request_id": request_id, "evidence_sha256": digest})
    store.refund_confirmed(pid, cumulative)
    return {"purchase_id": pid, "state": store.get(pid)["state"], "refunded": cumulative}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/var/lib/academic-material-store"))
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    rec = sub.add_parser("reconcile-refund")
    rec.add_argument("purchase_id", type=int)
    rec.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Host administrator access is required; no public override is available.")
    store = Store(args.root / "store.sqlite3")
    if args.command == "status":
        with store.read() as c:
            rows = [dict(r) for r in c.execute("SELECT state,COUNT(*) AS purchases FROM purchases GROUP BY state")]
            uncertain = [r[0] for r in c.execute("SELECT id FROM purchases WHERE state<>'refunded' AND refund_request IN ('creating','needs_review')")]
            delayed = c.execute("SELECT COUNT(*) FROM outbox WHERE state='pending' AND attempts>=3").fetchone()[0]
        print(json.dumps({"purchases": rows, "refunds_need_reconciliation": uncertain, "delayed_deliveries": delayed}))
    else:
        print(json.dumps(asyncio.run(reconcile(store, args.purchase_id, args.evidence))))


if __name__ == "__main__":
    main()
