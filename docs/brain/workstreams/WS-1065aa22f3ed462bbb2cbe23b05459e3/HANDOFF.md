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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: no bot/database/static-release change and no production submit.
  Back up the three exact server-owned files before mutation; rollback restores
  those bytes, validates Nginx, reloads it, and repeats the same smoke matrix.
- Next: review and commit the manifest plus this handoff.
