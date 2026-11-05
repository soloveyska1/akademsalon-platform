# Workstream handoff

- Branch: `codex/listik-payments`
- Outcomes: `OUT-004`
- Goal: sell Listik packages on the existing ruble cashier; entitlement shared with Kladovaya website/bot.
- Acceptance: signed prices399/899, 20/60 answers30days, no recurring charge; verified callback only; preserve format_fix and live267 overlays; refuse new checkout when Listik pauses.
- Base: dba7440c7855164b1276c3d4972d0cec051f3605; live cashier source61623e9c4fd9e751610b4ca61b4379f1d7e82f0535d53b6549548696d09d86c7; payment source branch pinnedb4ad1cf037d4d1edde62ffbdf8d1913cdf8008cb.
- Proof: `PYTHONPATH=../listik-test-deps python3 scripts/listik-payments-20261105/test_patch.py`:43 tests PASS, local fake provider only. Two independent internal read-only reviews billing_review/billing_product_review: no remaining P0/P1; both confirmed old-link pause and rollback compatibility. Exact scope conflicts--strict CLEAR after fetching full history.
- Changed: verified-baseline backend/static patch, product-specific archived specification/hash/receipt/return; fail-closed availability probe; scoped deploy/rollback script. Implementation owner Codex; reviewers did not write.
- Environment: brain context passed; doctor limited by unavailable macOS memory_pressure; council doctor found no provider CLI. No customer data sent to external council.
- Unverified: browser scenarios and production deployment still pending; no real payment performed.
- Risks/rollback: restore old static pointer plus rollback-compatible.py; it retains processing of Listik invoices but closes new sales. Never restore payment SQLite. deploy.py exercises rollback and forward switch with healthcheck.
- Next: finish browser checks; commit, deploy scoped patch, verify live quote and health; update this evidence.
