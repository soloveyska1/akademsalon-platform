# Workstream handoff

- Branch: `codex/out-006-sqlite-recovery`
- Outcomes: `OUT-006`
- Goal: eliminate the production-wide SQLite `BUSY_SNAPSHOT` poison state in
  which one concurrent Analytics v2 commit leaves the shared bot connection
  unable to write until process restart.
- Acceptance: a deterministic two-connection WAL race first reproduces the
  lock; the installed runtime rolls back the stale ordinary transaction and
  retries safely without weakening explicit financial transactions; a failed
  recovery cannot silently commit or discard an explicit unit-of-work; the
  installer is exact-hash/pattern fail-closed and has a verified rollback.
- Proof: focused Python regression tests with `ResourceWarning` as error,
  existing Analytics v2 and promo suites, public/backend smoke, Brain tests and
  strict validation; production evidence in `E-1032` and release record
  `REL-0170`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: changing common DB execution affects every write path. Keep
  explicit `db.transaction()` semantics untouched, make recovery bounded, and
  deploy only after a byte-exact backup. Rollback restores the exact pre-fix
  source and restarts the service; SQLite schema/data are not migrated.
- Next: review and commit the manifest plus this handoff.
