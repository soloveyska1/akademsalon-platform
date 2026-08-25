# Workstream handoff

- Branch: `codex/release172-smart-rescue`
- Outcomes: `OUT-006`
- Goal: publish the exact canonical smart-rescue static client as immutable
  REL-0172 without changing backend, bot, database, deposit economics or any
  service process, and leave a verified REL-0171 rollback.
- Acceptance: the release directory is created only from the exact canonical
  SHA and deterministic 358-file build, preserves the three server-retained
  files, has zero owner/mode/path/hash drift, and becomes `current`/`dist`
  atomically with REL-0171 as `previous`. External and VPS smoke are 14/14 on
  the forward release, on an executed rollback, and after forward restoration.
  Public candidate hashes, owner preview, old-user suppression, remarks route,
  deposit page/hash, bot PID/restart count, Nginx config, SQLite WAL/quick-check
  and absence of new lock/traceback/error journal entries all match the declared
  contract.
- Proof: `E-1036`, `REL-0172`, canonical public/backend/Brain suites, strict
  validation, reproducible static manifest, exact remote file manifest and
  permissions, two-vantage `production-smoke.js`, browser owner-preview GET-only
  inspection, executed symlink rollback/forward, service/journal/SQLite readback
  and final public SHA checks.
- Changed: published exact canonical `df007e40` as immutable
  `release172-df007e4`, preserved the three retained server files, executed a
  real release171 rollback and forward restore, and recorded the complete
  production proof in `E-1036`, `REL-0172`, `START-HERE.md` and
  `CURRENT-HANDOFF.md`.
- Verified: public 621/621; backend 99/99 with one expected local skip; Brain
  39/39; focused 15/15; Chromium/WebKit mobile 36/36; two identical 358-file
  builds with manifest `63f2f9ed...00cf`; remote content/owner/mode/symlink
  drift zero; external and VPS smoke 14/14 on forward, rollback and restored
  forward; production owner/old-user/remarks browser proof GET-only; bot PID,
  restart count, Nginx, WAL, quick-check and error journal green.
- Unverified: conversion, revenue, contribution margin and profit uplift await
  an authoritative consented sample and fulfilment-cost data. Accepted P2:
  legacy private remark cleanup occurs when the dossier next opens; active code
  never reads or sends the value.
- Risks/rollback: P0 is a changed deposit rate/CTA, backend or DB mutation,
  service restart, asset hash mismatch, missing retained server file, broken
  main journey, unexpected non-GET browser request, or inability to restore
  REL-0171. P1 is any mobile overflow/focus/history regression or stale cache
  version. Before pointer mutation, preserve exact old pointers and retained
  hashes; rollback atomically restores `current` and `dist` to REL-0171 and then
  reruns both smoke vantage points.
- Next: commit these exact proof records, submit the workstream at that result
  SHA, integrate it into fresh `origin/main`, then leave release172 as the
  canonical static truth with release171 as the immediate rollback.
