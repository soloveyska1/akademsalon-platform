# Services catalogue and economics verification — 2026-09-27

Owner: root. Workstream WS-a68d2d36b85948a6921045f9c509c8bf; OUT-007. Exact canonical base 8bd8032c60dff9a2e3894c958dd4aa9d982f6139. Original checkout dirty .claude/launch.json untouched.

## Scope and pricing authority

Hash-pinned overlay on verified release223-reading-9876e933: 526 baseline files, 530 final files, eight changed paths. app.js / salon-products.js / salon-commerce.js / salon-benefits.js / sw.js and every other non-delta file remain byte-identical. Current root HTML is older than production and is deliberately not deployed. Full baseline map lives in scripts/salon-services-20260927/baseline-hashes.json; build refuses drift. Build manifest records the frozen implementation commit. Preliminary quotes remain pending; authenticated benefits and payable amounts remain server-owned.

## Reproducible verification

Run from this checkout, with an exact release223 directory exported from the immutable release (or /tmp/salon-reading-20260924/release-final):

```sh
python3 scripts/salon-services-20260927/build.py BASELINE CANDIDATE
SALON_BASELINE=BASELINE node --test scripts/salon-services-20260927/estimate.test.cjs
node scripts/salon-services-20260927/verify.mjs CANDIDATE OUTPUT
node scripts/salon-services-20260927/review-guards.mjs CANDIDATE GUARDS
node scripts/salon-services-20260927/verify-economics.mjs ECONOMICS_QA
node --test tests/*.test.js
python3 -m unittest discover -s tools/brain/tests -p 'test_*.py'
./bin/brain validate --strict
```

Playwright harnesses use bundled Chrome/dependencies, isolate storage, route all HTTP to the candidate, intercept every API request and close browser contexts. Fixtures are synthetic and never sent to production. SALON_NODE_DEPS can override the documented bundled runtime location.

- Estimate suite: 8/8; 6,048 matrix combinations; published-price parity; deadline/discipline parity; bundle boundary/deduplication; benefits caps; membership fee; deposit reserve; same chapter edit tariff across entry paths; correct diagnostic text.
- Browser: 21/21, zero page errors. Ten viewport/theme states (360,390,768,1024,1440; light/dark), no overflow, minimum speed targets, keyboard focus/escape, all catalogue products/scopes/speeds, accessible custom-select operation, copy fallback, persistence, exact preview/cart/line parity, pending quotes and basis/quantity in intercepted orders. Final candidate8 differs only by the explicit search accessible name; review-guards verifies it and the unchanged latest scripts.
- Focused review guards: light/dark PASS; explicit search name, live estimate announcement, measured hero-badge contrast >=4.5, visible VIP limits, under-24h preliminary wording, deposit principal/future reserve disclosure.
- Existing form regression: 9/9 groups including ten viewport/theme states, original contacts, validation, held-pointer submission, stable retry IDs, rejected/uncertain responses, no client data in storage/analytics. Tested candidate6; later runtime changes only diagnostic description and search label.
- Existing return/reading regression: 18/18 (candidate5, same catalogue return code). A real initial Back-position regression from the taller hero was fixed by preserving the last substantially visible card when navigation autoscrolls it out of view.
- Canonical regression: 652 PASS / 0 FAIL / 9 pre-existing skipped (661 total). Brain: 39/39, strict validation 125 records / 263 links / 77 manifests.
- Owner calculator: two viewport checks, 15 tariff rows, base profit 2,580 and stress -1,515 for course14k / rate1k / 8 production hours +20%; hour ceilings 11.97/5.99/3.99 at 500/1000/1500. Half-up rounding matches narrative. Inputs are scenarios, not actual costs or a guaranteed margin.

## Reviews and issue disposition

Two independent reviewers: external GLM through project council and read-only services_independent_review agent. Sonnet OAuth expired; Kimi returned provider503, so their absence is not counted as review. Reports are opinions; repeatable tests above determine readiness.

Independent agent initially identified VIP line/cart mismatch, custom chapter-edit tariff mismatch, hidden optional invalid controls blocking submission, and inaccurate addon deadline wording. All were fixed and covered. A further independent POST audit found serializer recalculation on non-composed custom/diagnostic/support; now every E.estimate-derived quote is finalized after serialization and details carry its basis/quantity. Final independent check: seven intercepted submissions agree (screen=cart=sum(lines)), P0/P1 zero. Its remaining diagnostic-copy P2 was fixed and covered by the eighth deterministic test.

GLM final report is conditional GO. Its generic P0/P1 concerns are resolved by observable behavior, not a vote:
- VIP: a minimum coordination budget, not a maximum cap; UI states 15%, minimum3,000 and bounded iterations/scope/time agreed before payment. Correct formula is max(3000,15% work); GLM suggestion to describe it as a cap is rejected.
- Under24h: ×2–3 is labelled preliminary and feasibility/materials/agreement precede any payment. Clicking a speed changes only an estimate; pending request tests prove no binding charge. An extra confirmation modal would not add payment protection.
- Deposit: own principal, upfront contribution, remaining money, earned cashback and conditional reserve are separate. Guards verify explicit not-a-discount / not-available-now copy.
- Preview consistency: exact POST assertions cover ordinary/custom/editing/diagnostic/support/VIP routes, superseding speculative concern.
- Search accessible name was added; keyboard/focus/live-region/touch/contrast checks are recorded. Manual screen-reader/device lab testing was not performed.

P0=0, P1=0. No unresolved product P2 from these reviews. Conversion uplift, real average ticket/profit, real customer hours and comparative service quality are not measured or claimed.

## Release status

Production publication and rollback receipts are appended only after verified deployment. G3/G4 authenticated surfaces and backend/DB/payment logic are outside this frontend scope and byte-identical; public health and unchanged asset hashes are checked at release. Never call a candidate a live release without the receipt and live browser results.
