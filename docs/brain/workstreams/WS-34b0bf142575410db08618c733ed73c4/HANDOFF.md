# Workstream handoff

- Branch: `codex/incident-404-scanner-noise`
- Outcomes: `OUT-006`
- Goal: stop raw public 404 scan bursts from paging the owner while preserving
  immediate, isolated Akademsalon 5xx monitoring.
- Acceptance: a synthetic burst of 404-only log rows creates no alert, daily
  404 count or 404 throttle; three non-maintenance 5xx rows still create the
  existing server-error alert and counter. The live false `day.404`/throttle is
  reset under the watcher lock, while site/API health, release158 and backend
  remain unchanged.
- Proof: focused Node contract, Python compile and isolated synthetic watcher
  test; full site/backend/Brain gates; privacy-safe production inspection,
  external/VPS GET-only smoke, and executed watcher rollback/forward. Durable
  incident evidence will be `E-1018`.
- Changed: none yet.
- Unverified: implementation and production activation not started.
- Risks/rollback: changing the server-owned watcher could suppress real 5xx or
  break its timer. Back up exact watcher/state bytes first; fail closed on hash
  drift; keep the timer stopped only during atomic activation; rollback restores
  both exact files and reruns compile plus synthetic policy checks before restart.
- Next: review and commit the manifest plus this handoff.
