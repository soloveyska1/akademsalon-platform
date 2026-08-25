# Workstream handoff

- Branch: `codex/september-full-integration`
- Outcomes: `OUT-004, OUT-008`
- Goal: publish canonical source
  `ffa2421ce9b3aed62b3c508a210fa50a2bb1e438` as the combined September
  production release: reviewed first-entry improvements plus the fail-closed
  deposit/referral V2 runtime, without pausing deposits or changing unrelated
  design.
- Acceptance: exact backend and immutable static parity; active bot and valid
  Nginx; SQLite `quick_check=ok`; public and VPS 14-route smoke; production
  Chromium at 390 and 1440 with no overflow or console errors; exact deposit,
  referral and first-entry readbacks; backend disable/forward and static
  rollback/forward both executed; no real order, payment or client mutation.
- Proof: installer `--check`, compile/service/journal/SQLite checks, SHA-256 and
  full immutable-tree manifest, external plus VPS smoke, production Chromium,
  rollback-forward pointer and settings readbacks, strict Brain validation,
  `E-1035` and final `REL-0171`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: bot is stopped only for the bounded atomic migration. Keep an
  online SQLite safety copy but never restore it during rollback. Backend
  rollback disables new V2 issuance while retaining the safe runtime, then
  reapplies the exact candidate. Static rollback moves only the three release
  symlinks to already verified immutable trees, smokes, then restores forward.
- Next: review and commit the manifest plus this handoff.
