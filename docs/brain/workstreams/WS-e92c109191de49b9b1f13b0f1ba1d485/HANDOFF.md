# Workstream handoff

- Branch: `codex/september-economic-safety`
- Verified implementation: `4acd0e623f5b2a5e2efd6926f799b71032234c4d`
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
- Changed: added the hash-pinned Deposit V2 earned-reserve runtime and
  installer; persistent principal/payment/reward/referral guards; cumulative
  partial-refund audit/tombstones; atomic cancel-versus-recovery with exact
  principal return; separately cumulative monetary and spent-point restoration;
  bidirectional complete-refund guards and a persistent tombstone block on new
  bonus spending; production-shape integration harness; public copy
  aligned to the earned-reserve contract; personal-link validation and a
  keyboard-modal invite dialog. No CSS or cabinet code changed.
- Verified: public 609/609, backend 99/99 with one expected local dependency
  skip, Brain 39/39, build/compile/diff checks, focused 23 Python + 12 Node,
  exact 390/1440 baseline geometry and isolated production-venv apply/reapply/
  check/integration. Fresh-fetch conflict analysis found hard=0; 42 historical
  terminal/unmanaged-ref warnings were explicitly accepted for this local
  snapshot. `E-1034` contains the commands, hashes and observed states.
- Unverified: no production activation, authenticated wallet purchase, real
  payment, message delivery or post-release smoke was performed. Final repeated
  architecture, economics and UX verdicts are GO with P0=0/P1=0; this candidate
  is ready for integration review but is not authorized for production release.
- Risks/rollback: never restore a SQLite snapshot. Disable the exact V2 setting
  before restoring Python; persistent triggers then reject every legacy money
  seam. Existing historical ledger rows are never rewritten. The one legacy
  pending 60 000 ₽ invoice keeps its id and old promise and must be reconciled,
  not silently converted. `assets/js/cabinet.js` remains owned by
  `codex/out-001-claim-continuity`; its one misleading toast is a declared
  integration dependency rather than an overlapping edit here.
- Next: rerun fetch/conflict/full gates on the exact commit; submit the workstream for integration
  without deploying it. Production publication requires owner approval followed
  by backup/apply/restart/check, public smoke and the verified disable rollback.
