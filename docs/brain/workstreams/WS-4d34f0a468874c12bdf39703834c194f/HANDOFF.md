# Workstream handoff

- Branch: `codex/out-001-synthetic-e2e`
- Outcomes: `OUT-001`
- Base: exact fetched canonical
  `a7fd11299a88736696bc6573216dbfe025e08604`.
- Write-owner: `codex-root`; agents are read-only reviewers.
- Goal: add a default-off, allowlisted and isolated synthetic plane that can
  prove six exact surfaces: one marked server case, one `created` event, one
  durable isolated outbox obligation, one isolated receipt and one cabinet
  membership, then
  remove every active business record by an exact guarded cleanup.
- Acceptance: ordinary `/api/orders` behavior and economics are byte-for-byte
  outside the new branch; reserved synthetic fields without a current root-only
  capability fail before database work; the signed route rejects user sessions,
  cart, upload, promo, gift, referral, bonus/deposit/payment state and real
  contact routing; order, `created` event, synthetic marker and outbox commit as
  one unit; duplicate/lost-response/concurrent retry returns one ID; a changed
  signed fixture returns `403` before database work, while an ordinary reused
  request ID with a changed payload retains its existing `409`; a restartable
  worker writes one idempotent isolated receipt; lookup returns typed counts only; cleanup
  requires exact `synthetic + test_run_id + order_id`, dry-run cardinality one
  and zero economic blockers, then leaves zero active records and an opaque
  non-PII tombstone; a second cleanup is a no-op.
- Proof: 26/26 focused tests with exact hash-pinned production-source handler
  execution, forced duplicate `IntegrityError`, ordinary before/after differential
  and two fresh-process outbox replay; crash/TOCTOU injection at transaction
  boundaries; signature, expiry, schema, deletion-cardinality, file-mode and
  symlink negative matrices; source-hash-pinned installer check/apply/idempotence/
  rollback on an isolated exact fixture; existing order, SQLite, promo and
  economic regressions; full public suite; Brain 39/39 plus strict validation
  and conflicts; at least two independent final reviews. Production
  submit is not part of this implementation workstream and remains blocked until
  a separate G10 publication workstream proves exact live hashes, rollback and
  the same cleanup contract.
- Changed: added migration `0010_out001_synthetic.sql`, the default-off runtime
  and root-only probe, plus a hash-pinned installer that patches only reviewed
  `db.py`/`webapp.py` seams. The runtime enforces an exact non-client fixture,
  canonical-origin HMAC capability, DB-local sink, exact order/link and
  required surface-column contracts,
  full eligibility/economic guard, typed digest-only evidence and cardinality-
  checked cleanup with an opaque tombstone. No pricing, promo, deposit, ordinary
  order, CSS or public-design contract was changed.
- Re-baseline: production read-only on 26 August found the old plan partly
  stale: `app/db.py` now atomically writes order, event and `delivery_outbox`,
  and scheduler replay exists. Exact live hashes are `webapp.py`
  `6f36199c...b123c`, `db.py` `51702018...b2a1`; service PID `557663`,
  `NRestarts=0`. There is still no `synthetic`, `test_run_id`, isolated sink,
  typed lookup, receipt table or complete guarded cleanup. No row data, secret,
  client artifact or mutating request was read or sent.
- Verified before publication: exact live-source candidates compile and validate;
  hashes are `db.py` `b9ac6409...a4efd6f` and `webapp.py`
  `cb5b2624...3a200`; runtime `7add4843...f28cf` and migration assets are
  literal-pinned; focused tests
  are 26/26, including exact handler execution and process-reopen recovery.
  The serial backend matrix discovered 125 tests (123 pass, two expected
  environment/fixture skips); public product is 623/623; Brain is 39/39 and
  strict-valid at 109 records / 216 links / 56 manifests. Fresh conflict audit
  has zero hard conflicts; the integration owner explicitly reviewed and
  accepted 45 terminal-worktree/read-only-overlap warnings. Independent final
  economics, product and trust/security reviews are GO with P0/P1/P2 = 0/0/0;
  six service-column rename regressions fail before migration. A current
  read-only production check confirms the complete required surface-column set,
  SQLite `quick_check=ok` and zero foreign-key violations.
- Unverified: production installation, service restart, real HTTPS synthetic
  request, post-cleanup live readback and production rollback/forward drill.
- Risks/rollback: a forged synthetic flag, real Telegram/mail routing, broad
  deletion, source drift, schema drift, PII in evidence or any payment/promo/
  deposit effect is an immediate stop. The runtime stays disabled unless a
  short-lived root-owned capability exists. Code rollback restores exact
  pre-images and removes only new runtime files; additive synthetic tables may
  remain empty. Never restore the production SQLite snapshot as routine rollback.
- Scope revision: production already owns migration `0009_wizard_drafts`, so
  the reviewed OUT-001 migration asset is `0010_out001_synthetic.sql`. The
  declaration revision is chained to the committed revision-1 manifest hash.
- Next: commit the reviewed implementation, freeze `result_sha`, integrate it
  against fresh canonical,
  then open the separate G10 publication workstream for stopped-service install,
  live probe, cleanup proof and rollback/forward drill.
