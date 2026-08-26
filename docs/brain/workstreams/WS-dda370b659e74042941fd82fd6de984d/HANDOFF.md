# Workstream handoff

- Branch: `codex/release174-out001-final`
- Outcomes: `OUT-001`
- Base: `d6f1a1b4783d5600abcfe5ecce835c56e5c3bac4` (`origin/main`).
- Goal: finish `REL-0174` from the integrated generated-link hotfix, repeat the
  exact bounded production journey, and reconcile the durable OUT-001 record.
- Acceptance: only the stopped-service two-installer transition is used; exact
  hashes and preimages are read back; probe proves one idempotent synthetic case
  through API, isolated delivery and cabinet, then leaves zero active residue and
  a second opaque tombstone; rollback and forward are executed; ordinary health,
  economic guard, open deposit issuance, static release pointers and journal stay
  unchanged; final independent reviews have P0=0/P1=0.
- Proof: exact local 30/30 focused, 129 backend, 623 public and 39 Brain suites;
  production preflight; installer JSON; digest-only probe JSON; aggregate SQLite
  inventory including `table_xinfo`; two-vantage GET-only 14/14 smoke; executed
  rollback-forward; stabilized service/log readback; `brain:test` and
  `brain:validate`.
- Changed: none yet.
- Unverified: final production transition and evidence not started.
- Risks/rollback: direct new-installer apply against the old installed runtime is
  forbidden. Stop and verify `salon-bot-v2`, use exact old installer
  `296c21c3…7883` with backup
  `/root/salon_bot/backups/out001-synthetic-20260826T012302978117Z`, verify the
  preimage/assets-absent state, then use new installer `031bedbe…d186`. Never
  restore SQLite; additive migration and opaque tombstones remain.
- Next: review and commit the manifest plus this handoff.
