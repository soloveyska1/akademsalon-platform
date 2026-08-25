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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: P0 is a backend/database/deposit mutation, service restart,
  changed promo economics or eligibility, unexpected non-GET browser request,
  missing retained file, hash/permission/symlink drift or inability to restore
  REL-0172. P1 is clipped text, full-width/slab CTA regression, hidden owner
  marker/close, stale cache wave, broken Back/focus or mobile overflow. Preserve
  exact old pointers before mutation; rollback atomically restores `current`
  and `dist` to `release172-df007e4` and reruns both smoke vantage points.
- Next: review and commit the manifest plus this handoff.
