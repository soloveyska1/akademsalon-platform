# Workstream handoff

- Branch: `codex/out-007-seo-pricing-truth-v1`
- Outcomes: `OUT-007`
- Goal: align the Service JSON-LD entry price on all nine discipline landings with the already visible `от N ₽` orientation, without changing client-facing prices, copy, routes or design.
- Acceptance: every discipline page exposes one `Offer` whose `PriceSpecification.minPrice` exactly matches its visible orientation; no hidden cheaper offers or `AggregateOffer.lowPrice` remain; all JSON-LD parses; the focused test discovers and checks all nine pages; production GET readback matches the release files.
- Proof: failing-first and green `node --test tests/seo-pricing-consistency.test.js`; Schema.org validator/readback evidence where callable; full public/backend/Brain gates; two independent read-only reviews; production health/smoke/hash/rollback evidence in `E-1040` and `REL-0176`.
- Base/head: canonical base `9fd85ce166f022792c9140c3a215573448650c53`; authoritative public implementation `9d44d99f66e4174960777a579d203089f0758f7d`.
- Changed: nine discipline Service JSON-LD blocks now expose one visible-price Offer; the same nine sitemap dates were refreshed; the focused test freezes discovery, exact shape and absence of parallel hidden offers. Production is `release176-9d44d99`.
- Verified: focused 8/8; public 637/637; backend 129 with two expected skips; Brain 39/39; validation, XML, diff and two deterministic builds green; three independent reviews; exact production hashes; final external GET 14/14; executed rollback/forward; service/SQLite/release-window health green. See `E-1040` and `REL-0176`.
- Unverified: search-engine recrawl, rich-result appearance, organic traffic quality and conversion effect; no uplift claim is permitted without a sufficient prospective sample.
- Risks/rollback: malformed or misleading schema is guarded by parsed deep equality and live hashes. Rollback is the verified static pointer switch to `release175-dcbef91`; backend, database, economics, analytics contract and CSS are outside this release.
- Next: commit the durable release proof, freeze the exact result as submitted, fetch canonical and integrate only if the result remains conflict-free.
