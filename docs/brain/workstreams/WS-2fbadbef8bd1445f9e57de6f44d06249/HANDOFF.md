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
- Changed: none yet.
- Unverified: implementation and production re-proof not started.
- Risks/rollback: the runtime asset hash must be advanced atomically with the
  installer allowlist. Production patching is deferred until the implementation
  is integrated; rollback uses a stopped-service installer transition and never
  restores a SQLite snapshot.
- Next: review and commit the manifest plus this handoff.
