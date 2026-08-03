# Workstream handoff

- Branch: `codex/out-001-claim-continuity`
- Outcomes: `OUT-001`
- Goal: preserve the exact `order_id` returned by one-time claim exchange and
  open that case after the cabinet list loads, without tightening the broader
  submit response contract.
- Acceptance: a valid positive safe `order_id` from `/orders/access/exchange`
  remains selected when the returned order list also contains another active
  case; absent, invalid or missing claim identity keeps the current fail-open
  default selection; no copy, API route, backend or production data changes.
- Proof: failure-first cases in `tests/account-case-context.test.js`, focused
  cabinet tests, `./bin/brain test`, `./bin/brain validate`, two independent
  read-only diff reviews and the release gates required before any publish.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: a malformed identity must never pin a non-existent case; if
  the exact ID is not present in the authorized list, existing list fallback
  remains authoritative. Rollback is the isolated cabinet JS/cache-key commit;
  no server or data rollback is involved.
- Stop conditions: unexpected scope conflict, production mutation requirement,
  response variants that cannot be handled fail-open, or any P0/P1 release-gate
  regression.
- Next: commit this Brain-created reservation, run strict conflict checks, then
  add the failing exact-claim continuity test before implementation.
