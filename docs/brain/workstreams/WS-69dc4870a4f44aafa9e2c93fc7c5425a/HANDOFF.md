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
- Changed: canonical combined product was published as immutable
  `release171-ffa2421`; exact economic V2 backend was applied; release evidence,
  release record, current handoff and start page were updated.
- Verified: combined public 612/612, backend 99/99 and Brain 39/39; deterministic
  357-file build; inactive 360-file production tree parity; installer final
  state `after`, eleven triggers, four zero invariant counters, open issuance,
  active PID with `NRestarts=0`, WAL/quick-check/journal clean; production
  Chromium 390/1440; external and VPS smoke 14/14 after activation, rollback
  and forward; exact backend disable/forward and static release169/forward
  drills; no temporary pointer/source residue.
- Unverified: field conversion, revenue, contribution margin, profit and Core
  Web Vitals remain unclaimed. Separate legal, SEO, 320px overflow and Browser
  Back scopes remain outside this workstream.
- Risks/rollback: bot is stopped only for the bounded atomic migration. Keep an
  online SQLite safety copy but never restore it during rollback. Backend
  rollback disables new V2 issuance while retaining the safe runtime, then
  reapplies the exact candidate. Static rollback moves only the three release
  symlinks to already verified immutable trees, smokes, then restores forward.
- Next: validate and freeze the production proof, integrate its exact result,
  then monitor ordinary consented evidence without changing the release.
