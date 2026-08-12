# Workstream handoff

- Branch: `codex/release157-analytics-v2`
- Outcomes: `OUT-006`
- Goal: publish exact integrated canonical
  `f215d850d24f45baa7a18eca515ca94a05707f42` as immutable release157 and
  activate Analytics v2 without mixing it with the untrusted legacy series.
- Acceptance: backend is backed up and switches legacy ingest off before the
  new static release is reachable; local DB-IP City Lite and a root-only
  signing secret are active; `nginx -t`, service health and checked-in 14/14
  smoke are green; synthetic six-stage ingest accepts exactly once, duplicate
  changes nothing, admin readback sees it, revoke leaves zero raw rows; strict
  CSP/mobile dashboard and no-preconsent browser behavior pass; executed
  rollback to release156 and forward restore to release157 are both green.
- Proof: 552/552 product, Python 30/30, Brain 39/39, `E-1015`, exact artifact
  digest/hashes, server backup paths, synthetic IDs/counts without secret,
  two-vantage GET/HEAD smoke, browser console/network/CSP evidence and a durable
  release receipt `REL-0157`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: stop on any live source hash mismatch, failed backup,
  non-release156 baseline, failed geo/runtime install, red nginx/service/smoke,
  legacy write after switch, synthetic residue, unexpected client data or P0/P1.
  Rollback returns release156 symlinks and the exact installer backup, validates
  Nginx, restarts the service and never drops additive v2 tables on hot DB.
- Boundaries: no real submit, order/contact/client-data read, OAuth, payment,
  upload, consent mutation for another person, secret logging or database dump.
- Next: commit this reservation, run strict conflicts, then re-verify live
  baseline and construct the immutable static/backend artifacts.
