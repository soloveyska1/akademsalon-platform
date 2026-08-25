# Workstream handoff

- Branch: `codex/release173-retention-preview`
- Outcomes: `OUT-006`
- Goal: publish the exact canonical retention-preview design correction as
  immutable REL-0173 without changing backend, bot, database, eligibility,
  promo economics, deposit economics or any service process.
- Acceptance: the release is built only from canonical
  `c245da0e00ce3a9dfaefbe985b9540672687e1d3`, preserves the three existing
  server-retained files, has zero owner/mode/path/hash drift and becomes both
  `current` and compatibility `dist` atomically with REL-0172 retained as
  `previous`. External and VPS GET-only smoke pass on forward activation, an
  executed rollback and forward restoration. A production browser confirms
  the labelled owner preview at 390 and 568 widths with bounded title/actions,
  wax CTA, visible owner label/close, no overflow, console error, POST, storage
  change, navigation or promo claim. Deposit hash/issuance, bot PID/restarts,
  Nginx, SQLite WAL/quick-check and post-release lock/traceback/error journal
  remain green.
- Proof: `E-1037`, `REL-0173`, canonical public/Brain/focused suites, strict
  validation, two identical static builds, exact remote content and permission
  manifests, two-vantage production smoke, safe browser owner-preview
  inspection, executed symlink rollback/forward, service/database/journal
  readback and final public hashes.
- Changed: published the exact canonical public subset as immutable
  `release173-c245da0`, preserved all three server-retained files, executed a
  real release172 rollback and forward restore, and recorded the bounded
  production proof in `E-1037`, `REL-0173`, `START-HERE.md` and
  `CURRENT-HANDOFF.md`. No product, backend or deposit file was edited here.
- Verified: focused 14/14, public 623/623, Brain 39/39, strict validation,
  WebKit/Chromium promo 24/24 and two deterministic 358-file builds. Remote
  public/full manifests, 361 owners/modes and all symlinks are exact.
  Production Chromium 390/568 is GET-only with zero overflow, console error,
  storage or URL mutation. External/VPS smoke is 14/14 after initial forward,
  executed rollback and final forward. Bot PID/restarts, Nginx, WAL,
  quick-check, deposit hash and error journal are green.
- Unverified: conversion, revenue, contribution margin and profit uplift await
  authoritative consented measurement and fulfilment-cost data. Accepted
  pre-existing P2: the default index mobile-smoke inspector waits for removed
  legacy `#toc`/`Salon.toc`; the dedicated promo-only matrix is green.
- Risks/rollback: P0 is a backend/database/deposit mutation, service restart,
  changed promo economics or eligibility, unexpected non-GET browser request,
  missing retained file, hash/permission/symlink drift or inability to restore
  REL-0172. P1 is clipped text, full-width/slab CTA regression, hidden owner
  marker/close, stale cache wave, broken Back/focus or mobile overflow. Preserve
  exact old pointers before mutation; rollback atomically restores `current`
  and `dist` to `release172-df007e4` and reruns both smoke vantage points.
- Next: validate and commit these exact proof records, submit/integrate the
  frozen result into fresh `origin/main`, then leave release173 as production
  truth with release172 as the immediate static rollback.
