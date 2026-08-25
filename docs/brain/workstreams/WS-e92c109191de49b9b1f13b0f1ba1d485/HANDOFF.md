# Workstream handoff

- Branch: `codex/september-economic-safety`
- Outcomes: `OUT-004`
- Goal: fail-close new deposit/referral issuance while the runtime and public
  money contract disagree, without hiding or revoking an existing balance,
  pending entitlement, refund request or previously earned bonus.
- Acceptance: persistent SQLite guards default OFF and survive source rollback;
  current runtime maps the pause to an honest non-payment state; deposit refund
  never deducts already used promotional bonus from refundable cash; the
  cabinet never converts unavailable account data into zero/empty state or a
  generic bot URL into a personal referral link; public pages say that new
  issuance is paused while existing rights remain accessible.
- Proof: failing-first focused Python/Node contracts; exact live-source hash
  inventory; isolated SQLite apply/check/rollback drills; full public/backend/
  Brain suites; strict conflict and corpus validation; independent architecture,
  economics and UX review. Evidence will be recorded in `E-1034`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: never restore a SQLite snapshot. Disable the exact versioned
  settings first; persistent DB triggers continue blocking unsafe issuance even
  if source files are rolled back. Existing read/spend/refund paths remain
  available and no historical ledger row is rewritten.
- Next: commit this manifest boundary, run strict conflict detection, then add
  the failing-first safety contracts before implementation.
