# Workstream handoff

- Branch: `codex/september-economic-safety`
- Outcomes: `OUT-004`
- Goal: keep the existing deposit and referral experience available while the
  backend is aligned with the published money contract: atomic principal lots,
  earned (not upfront-spendable) deposit benefit, exact cash refunds and one
  fixed 200-point referral reward.
- Acceptance: the original public layout and 8/10/12/15 tiers remain; no pause
  state is shown; SQLite V2 invariants survive source rollback; a top-up cannot
  be turned into immediately spendable points and then fully refunded; deposit
  pay/refund races cannot overspend principal; used discounts never reduce the
  refundable cash remainder; personal referral links remain available and
  settle exactly 200 points once, never 5/7 percent or an invitee gift.
- Proof: failing-first focused Python/Node contracts; exact live-source hash
  inventory; isolated SQLite apply/check/rollback drills; full public/backend/
  Brain suites; strict conflict and corpus validation; independent architecture,
  economics and UX review. Evidence will be recorded in `E-1034`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: never restore a SQLite snapshot. Disable the exact V2 setting
  before restoring Python; persistent triggers then reject every legacy money
  seam. Existing historical ledger rows are never rewritten. The one legacy
  pending 60 000 ₽ invoice keeps its id and old promise and must be reconciled,
  not silently converted. `assets/js/cabinet.js` remains owned by
  `codex/out-001-claim-continuity`; its one misleading toast is a declared
  integration dependency rather than an overlapping edit here.
- Next: add failing-first Deposit V2/referral contracts, implement the pinned
  runtime asset and installer, then run exact-source, concurrency, visual and
  rollback gates.
