# Workstream handoff

- Branch: `codex/out001-installer-migrations-layout`
- Outcomes: `OUT-001`
- Goal: extend the literal OUT-001 production-parent compatibility predicate
  from `app` to the equally orphan-owned existing `migrations` directory,
  without widening any root, owner, mode, symlink or path boundary.
- Acceptance: only resolved `/root/salon_bot/{app,migrations}` may use the exact
  orphan tuple `501:50/0755`, and only with root-owned install root, EUID 0 and
  no passwd/NSS entry for UID 501. An alternate root, sibling/subdirectory,
  named UID, wrong UID/GID/mode, writable bit, symlink or non-root caller must
  fail. Existing same-owner creation remains valid. The exact production apply
  failure is reproduced before the change; afterwards an isolated full
  check/apply/idempotence/rollback/forward matrix with both mocked orphan
  parents must pass and remove every asset.
- Proof: failing-first migrations-parent unit; full two-parent installer matrix;
  existing exact-source/symlink/tamper/TOCTOU/partial-rollback suites; backend,
  public and Brain matrices; live read-only predicate on both literal parents;
  two independent final reviews.
- Changed: none yet.
- Unverified: implementation not started. Production was already restored to
  exact preimages by the previous installer's failure path and is healthy.
- Risks/rollback: allowing arbitrary direct children, newly created orphan
  directories or any writable/named-owner path is P0. Code rollback reverts
  this installer/test commit; never chown or manually copy the live migration.
- Next: commit declaration, pass conflicts, add failing migrations-parent and
  full lifecycle tests, then implement the smallest literal-set change.
