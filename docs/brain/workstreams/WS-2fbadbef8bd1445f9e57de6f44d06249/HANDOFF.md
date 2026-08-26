# Workstream handoff

- Branch: `codex/out001-table-xinfo-links-v2`
- Outcomes: `OUT-001`
- Base: `341f55283d53317697b37a02ccf39f2a67deae9b` (`origin/main`).
- Goal: make global synthetic-order link discovery fail closed for SQLite
  generated/hidden columns before the final `OUT-001` release decision.
- Acceptance: a generated `order_id` column that points at the synthetic order
  blocks cleanup without deleting the order or creating a tombstone; the same
  fixture passes after switching link inventory to `PRAGMA table_xinfo`; current
  known links and installer hash pinning remain exact; no pricing, promo,
  deposit, CSS or public design files change.
- Proof: failing-first focused regression; focused and full backend discovery
  with the pinned production fixture; public regression; `brain:test`;
  `brain:validate`; two independent read-only code reviews before submission.
- Changed: `_order_links` now inventories all SQLite columns with
  `PRAGMA table_xinfo`; a dedicated generated `order_id` regression proves the
  order, foreign row and zero-tombstone state survive the fail-closed block;
  installer runtime pin advanced to
  `cba09cf5db96d632d3f07ff45713b9518841b4a6654217bec3ef9f9fa87844a5`.
- Verified: the new regression failed before the runtime edit with
  `CleanupBlocked not raised` and now passes. Pinned fixture
  `/tmp/out001-source.twXZrq` has exact source hashes `51702018…b2a1` and
  `6f36199c…123c`; focused backend 30/30, full backend 129 discovered with the
  one exact production-venv `aiosqlite` skip, public 623/623, Brain 39/39 and
  strict validation (`records=109 links=216 manifests=59`) pass.
- Independent reviews: trust/security GO (`P0=0/P1=0/P2=0`), economics and
  eligibility GO (`P0=0/P1=0/P2=0`), product/ops bounded-code GO
  (`P0=0/P1=0`). Its two P2 requests are closed here: the regression now
  requires exact `synthetic_schema_drift`, and the exact two-installer rehearsal
  is recorded below.
- Transition rehearsal: exact old installer
  `296c21c3a5e01fa5efe19299e896c8692b73ebb0d69ff802924a98d7fe237883`
  installed runtime `7add4843…28cf`; direct new apply failed closed with
  `OUT-001 asset target already exists with incomplete install`. Old rollback
  restored both exact preimages and left all three targets absent. New installer
  `031bedbea5a8a51e4a1409da473afafff0369e1d2305e2afc2d1726da2b0d186`
  then applied runtime `cba09cf5…44a5` over the retained single migration row;
  immediate repeat was `changed=false`, new rollback succeeded, new forward
  succeeded and its repeat was also `changed=false`. Final sources/assets were
  exactly `db=b9ac6409…efd6f`, `webapp=cb5b2624…a200`,
  `runtime=cba09cf5…44a5`, `probe=5dd4cb60…452d` and
  `migration=e6500fa4…f8d8`. The production transition must use the old final
  backup `/root/salon_bot/backups/out001-synthetic-20260826T012302978117Z`;
  direct new apply or new-installer rollback of that old manifest is forbidden.
- Unverified: canonical integration and the same stopped-service transition,
  probe, cleanup, rollback-forward and stabilized live readback remain pending.
- Risks/rollback: the runtime asset hash must be advanced atomically with the
  installer allowlist. Production patching is deferred until the implementation
  is integrated; rollback uses a stopped-service installer transition and never
  restores a SQLite snapshot.
- Next: resolve independent read-only reviews, commit the exact scoped hotfix,
  submit/integrate after a fresh fetch/conflict scan, then perform the stopped-
  service production transition and repeat the bounded probe.
