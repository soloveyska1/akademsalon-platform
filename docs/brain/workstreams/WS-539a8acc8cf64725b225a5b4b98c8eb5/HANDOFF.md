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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: P0 is a changed deposit rate/CTA, backend or DB mutation,
  service restart, asset hash mismatch, missing retained server file, broken
  main journey, unexpected non-GET browser request, or inability to restore
  REL-0171. P1 is any mobile overflow/focus/history regression or stale cache
  version. Before pointer mutation, preserve exact old pointers and retained
  hashes; rollback atomically restores `current` and `dist` to REL-0171 and then
  reruns both smoke vantage points.
- Next: review and commit the manifest plus this handoff.
