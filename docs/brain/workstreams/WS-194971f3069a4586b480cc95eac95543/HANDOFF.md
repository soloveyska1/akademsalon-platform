# Workstream handoff

- Branch: `codex/out-007-seo-pricing-truth-v1`
- Outcomes: `OUT-007`
- Goal: align the Service JSON-LD entry price on all nine discipline landings with the already visible `от N ₽` orientation, without changing client-facing prices, copy, routes or design.
- Acceptance: every discipline page exposes one `Offer` whose `PriceSpecification.minPrice` exactly matches its visible orientation; no hidden cheaper offers or `AggregateOffer.lowPrice` remain; all JSON-LD parses; the focused test discovers and checks all nine pages; production GET readback matches the release files.
- Proof: failing-first and green `node --test tests/seo-pricing-consistency.test.js`; Schema.org validator/readback evidence where callable; full public/backend/Brain gates; two independent read-only reviews; production health/smoke/hash/rollback evidence in `E-1040` and `REL-0176`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: malformed JSON-LD or an accidental visible price change; mitigate with parsed structural assertions and byte/scope review. Rollback is the previous static release pointer and previous service state; no backend, database, economics, analytics contract or CSS mutation is in scope.
- Next: review and commit the manifest plus this handoff.
