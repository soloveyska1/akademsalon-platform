# Workstream handoff

- Branch: `codex/out-006-practice-result-passport-v1`
- Outcomes: `OUT-006`
- Goal: replace the abstract 14,000 RUB explanation on the public practice page
  with one compact, checkable result passport without adding a new offer,
  primary action, script or analytics event.
- Acceptance: the passport names the supplied real materials, exactly four
  support outputs, exclusions and the per-stage specification boundary; its
  only new navigation is a secondary text link to the explicitly fictional
  specification sample. The existing 2,500 / 8,000 / 14,000 RUB radios,
  routes, JSON-LD, diagnostic credit and single primary continuation stay
  unchanged. At 390 and 1440 px in light and dark themes there is no body
  overflow, console error or Otisk regression, and keyboard radio selection
  still reaches the exact route.
- Proof: failing-first contract in `tests/practice-price-trust.test.js`, focused
  Node tests, full site/Brain gates, deterministic build and `git diff --check`;
  local Chromium 390/1440 light/dark plus two independent P0/P1 reviews.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: the sample could be mistaken for a fixed package, the 8,000
  and 14,000 RUB scopes could blur, or the page could gain visual density.
  Explicit `Вариант 03`, fictional-sample wording, route contracts and a
  replace-not-append layout contain those risks. Rollback is the single
  implementation commit; no backend or stored data is in scope.
- Next: commit this declaration, run strict conflicts, then add the
  failing-first contract before public markup or styles.
