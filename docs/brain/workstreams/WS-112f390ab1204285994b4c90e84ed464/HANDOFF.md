# Workstream handoff

- Branch: `codex/out001-installer-parent-layout`
- Outcomes: `OUT-001`
- Goal: make the OUT-001 hash-pinned installer accept the exact safe legacy
  production parent layout without chowning directories or weakening arbitrary
  path/symlink/owner protection.
- Acceptance: keep the existing same-owner rule. Add one narrow exception only
  for `/root/salon_bot/app` when install root/effective UID are root, the
  directory is exactly `501:50/0755`, UID 501 is absent from the passwd
  database, the path is a real directory inside the install root and every
  existing target remains a single-link regular file with a literal source
  hash. Any named owner, different UID/GID/mode, group/world writable bit,
  symlink, second path or non-root execution must fail before a write. Apply,
  rollback and partial-rollback behavior stay exact; source and asset pins may
  change only as required by this installer source edit.
- Proof: failing-first mocked parent-layout matrix; exact production-layout
  positive fixture; existing symlink/tamper/rollback suites; exact pinned-source
  26/26; full backend, public and Brain suites; two independent final reviews;
  read-only live `stat/getent` reproduction.
- Changed: none yet.
- Unverified: implementation not started; production remains untouched.
- Risks/rollback: a generic non-root-owner allowance, passwd-resolvable owner,
  writable parent or path other than exact `app` is a P0. Rollback is code-only:
  revert this installer/test commit; never chown the production tree as a
  workaround.
- Next: commit declaration, pass conflicts, add failing tests, then implement
  the smallest explicit orphan-layout predicate and obtain security/operations
  reviews.
