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
  rollback and partial-rollback behavior stay exact; an alternate root with
  the same child tuple must fail. Source and asset pins may
  change only as required by this installer source edit.
- Proof: failing-first mocked parent-layout matrix; exact production-layout
  positive fixture; existing symlink/tamper/rollback suites; exact pinned-source
  27/27; full backend, public and Brain suites; two independent final reviews;
  read-only live `stat/getent` reproduction.
- Changed: `_secure_target_parent` keeps the same-owner rule and adds one
  literal legacy predicate: root-owned install root, root effective UID, exact
  direct child `app`, `501:50/0755`, and no passwd entry for UID 501. The test
  matrix accepts that tuple and rejects wrong UID/GID/mode, writable bits,
  named owner, non-root execution, a sibling path and the same `app` tuple
  beneath an alternate root. No source
  candidate, installed asset, database or product behavior changed.
- Verified: failing-first reproduced missing `pwd`/layout support. Final exact
  pinned-source suite is 27/27; backend 126 discovered with two expected
  environment/fixture skips; public 623/623; Brain 39/39 and strict validation
  green. The exact dirty installer executed through stdin on the live server
  and accepted both `app/db.py` and the future `app/out001_synthetic.py` parent
  read-only; no server file or process changed. Independent security and
  operations reviews are both GO with P0/P1/P2 = 0/0/0 after the literal-root
  regression.
- Unverified: production install remains untouched.
- Risks/rollback: a generic non-root-owner allowance, passwd-resolvable owner,
  writable parent or path other than exact `app` is a P0. Rollback is code-only:
  revert this installer/test commit; never chown the production tree as a
  workaround.
- Next: close two independent reviews, commit/freeze/integrate the hotfix after
  a fresh fetch/conflict audit, then restart REL-0174 from that canonical SHA.
