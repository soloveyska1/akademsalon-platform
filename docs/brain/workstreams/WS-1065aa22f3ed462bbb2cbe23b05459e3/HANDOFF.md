# Workstream handoff

- Branch: `codex/incident-502-vhost-isolation`
- Outcomes: `OUT-006`
- Goal: isolate Akademsalon monitoring from unrelated virtual hosts and replace
  the retired Kiskispace proxy to absent `127.0.0.1:4310` with a local response.
- Acceptance: the three reported PHP probes return `404`, Akademsalon `/` and
  `/api/health` remain `200`, the watcher reads a dedicated privacy-safe log,
  `nginx -t` is warning-free, Nginx/bot stay active, and rollback is exact.
- Proof: failing-first live host matrix; exact source/config hashes; focused
  contract test; Python syntax; `nginx -t`; VPS and external GET-only smoke;
  `brain:test`, `brain:validate`, and evidence `E-1017`.
- Changed: added the tracked monitoring/Nginx contract and 3/3 regression;
  production now isolates the Salon log, rejects PHP locally, retires the dead
  4310 proxy with 404, removes the enabled backup duplicate and resets only the
  proven false watcher count/throttle. Exact proof is `E-1017`.
- Verified: site 566/566, backend 30/30, Brain 39/39, external/VPS smoke 14/14,
  scanner isolation 5/5, clean Nginx, active services and executed
  rollback/forward restore.
- Unverified: Duo Space remains intentionally offline; restoring that private
  application is a separate security/product decision, not part of this fix.
- Risks/rollback: no bot/database/static-release change and no production submit.
  Back up the three exact server-owned files before mutation; rollback restores
  those bytes, validates Nginx, reloads it, and repeats the same smoke matrix.
- Next: commit evidence/handoff, rerun exact conflicts, submit the workstream and
  fast-forward integrate the verified result into `origin/main`.
