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
- Changed: documented and tested the non-paging raw-404 contract; added an
  exact reproducible watcher patch; activated watcher
  `31f1f968d4363fb91fccad2736727bccf488ec4883580e6a8d4df15e873bd06f`;
  removed false 404 state under lock; recorded proof in `E-1018` and durable
  handoff/start context.
- Verified: focused 4/4, full site 567/567, backend 30/30, Brain 39/39,
  strict validation, synthetic 500×404/3×502/10×503 policy, live 50×404
  threshold, external/VPS smoke 14/14 each, and executed rollback/forward.
- Unverified: no production submit was attempted; the first organic consented
  Analytics v2 session remains the pre-existing separate P2.
- Risks/rollback: changing the server-owned watcher could suppress real 5xx or
  break its timer. Back up exact watcher/state bytes first; fail closed on hash
  drift; keep the timer stopped only during atomic activation; rollback restores
  both exact files and reruns compile plus synthetic policy checks before restart.
- Next: commit evidence, rerun exact final gates, then submit and integrate this
  workstream from a fresh canonical fetch.
