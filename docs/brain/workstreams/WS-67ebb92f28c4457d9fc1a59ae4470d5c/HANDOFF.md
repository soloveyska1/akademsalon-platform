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
- Changed: `_secure_target_parent` retains the same-owner rule and widens the
  legacy exception only from literal `app` to the exact set
  `{root / "app", root / "migrations"}`. The tuple still requires resolved
  literal `/root/salon_bot`, root-owned install root, EUID 0, orphan UID 501,
  exact `501:50/0755` and no writable bits. Tests add a failing-first
  migrations fixture, sibling/alternate-root negatives and a complete
  preview/apply/idempotence/rollback/forward/final-cleanup cycle with both
  parents mocked as the exact live orphan tuple. No source candidate, installed
  runtime asset, schema asset, public file or product behavior changed.
- Verified: the migrations fixture failed before the code edit with
  `unsafe target parent` and passes afterwards. Exact pinned-source focused is
  29/29; the serial backend suite is 128 discovered with one expected
  production-venv skip; public product is 623/623; Brain is 39/39 and strict
  validation is green at 109 records / 216 links / 58 manifests. `py_compile`
  and `git diff --check` pass. The exact dirty installer
  `296c21c3...237883` executed through stdin on production and accepted both
  literal parents read-only: root is `0:0/0755`, each parent is
  `501:50/0755`, UID 501 has no passwd entry, and the observer reported
  `mutated=false`. The service/database/product were not changed by this
  check. Independent product/operations and security reviews are both GO with
  P0/P1/P2 = 0/0/0; the security review additionally injected a failure after
  migration and observed exact source restoration, zero asset residue and a
  successful subsequent forward/rollback cycle.
- Unverified: no production install has used this hotfix yet. Production was
  already restored to exact preimages by the previous installer's failure path
  and is healthy.
- Risks/rollback: allowing arbitrary direct children, newly created orphan
  directories or any writable/named-owner path is P0. Code rollback reverts
  this installer/test commit; never chown or manually copy the live migration.
- Next: commit and freeze the exact hotfix, integrate it after fresh
  fetch/conflict gates, then restart REL-0174 from the resulting canonical SHA.
