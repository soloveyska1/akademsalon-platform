# Workstream handoff

- Branch: `codex/out-001-synthetic-e2e`
- Outcomes: `OUT-001`
- Base: exact fetched canonical
  `a7fd11299a88736696bc6573216dbfe025e08604`.
- Write-owner: `codex-root`; agents are read-only reviewers.
- Goal: add a default-off, allowlisted and isolated synthetic plane that can
  prove one application becomes one server case, one created event, one durable
  delivery obligation, one isolated receipt and one cabinet membership, then
  remove every active business record by an exact guarded cleanup.
- Acceptance: ordinary `/api/orders` behavior and economics are byte-for-byte
  outside the new branch; reserved synthetic fields without a current root-only
  capability fail before database work; the signed route rejects user sessions,
  cart, upload, promo, gift, referral, bonus/deposit/payment state and real
  contact routing; order, `created` event, synthetic marker and outbox commit as
  one unit; duplicate/lost-response/concurrent retry returns one ID; changed
  intent returns 409 without another side effect; a restartable worker writes
  one idempotent isolated receipt; lookup returns typed counts only; cleanup
  requires exact `synthetic + test_run_id + order_id`, dry-run cardinality one
  and zero economic blockers, then leaves zero active records and an opaque
  non-PII tombstone; a second cleanup is a no-op.
- Proof: failing-first hermetic SQLite and patched-source tests; crash injection
  at each transaction boundary; signature, expiry, file-mode/symlink and
  ordinary-client negative matrices; source-hash-pinned installer check/apply/
  idempotence/rollback on an isolated exact fixture; existing order, SQLite,
  promo and economic regressions; full public suite; Brain 39/39 plus strict
  validation and conflicts; at least two independent final reviews. Production
  submit is not part of this implementation workstream and remains blocked until
  a separate G10 publication workstream proves exact live hashes, rollback and
  the same cleanup contract.
- Changed: none yet.
- Re-baseline: production read-only on 26 August found the old plan partly
  stale: `app/db.py` now atomically writes order, event and `delivery_outbox`,
  and scheduler replay exists. Exact live hashes are `webapp.py`
  `6f36199c...b123c`, `db.py` `51702018...b2a1`; service PID `557663`,
  `NRestarts=0`. There is still no `synthetic`, `test_run_id`, isolated sink,
  typed lookup, receipt table or complete guarded cleanup. No row data, secret,
  client artifact or mutating request was read or sent.
- Unverified: implementation, hermetic restart recovery, exact installer
  candidate hashes and any external synthetic request.
- Risks/rollback: a forged synthetic flag, real Telegram/mail routing, broad
  deletion, source drift, schema drift, PII in evidence or any payment/promo/
  deposit effect is an immediate stop. The runtime stays disabled unless a
  short-lived root-owned capability exists. Code rollback restores exact
  pre-images and removes only new runtime files; additive synthetic tables may
  remain empty. Never restore the production SQLite snapshot as routine rollback.
- Next: commit this declaration, pass conflict gates, then add a failing test
  that proves unsigned reserved fields make zero writes and one signed request
  creates the five exact typed surfaces in a temporary on-disk SQLite database.
