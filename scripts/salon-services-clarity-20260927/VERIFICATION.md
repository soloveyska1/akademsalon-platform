# Services clarity verification

The owner rejected release225 for glued words and insufficient overall quality. OUT-007, one write-owner. The new interface puts the service list and price first; complete headings, explicit scope basis, visible optional costs and an unbroken quote-to-request path replace decorative emphasis and silent state changes.

## Exact scope

Pinned release225-studio-a45b389e, 531 public files. The builder checks every baseline hash and allows exactly six public changes: services HTML/controller/style, estimate-only request UI/style and configurator cache URLs. SalonProducts, SalonCalc, SalonCommerce, SalonEstimate, benefit math and salon-order.js serialization remain byte-identical. No backend, DB, auth, consent, billing, telemetry or service-worker changes. The existing owner economics at 500/1000/1500 RUB/hour is unchanged.

## Verified prototype

Evidence lives in docs/brain/evidence/salon-services-clarity-20260927. `browser-results.json` proves 48/48 isolated Chrome scenarios on candidate4. It covers six widths 319/360/390/768/1024/1440 in light/dark, reduced motion, keyboard, same/different situation browsing, saved quote, Back, bfcache, invalid dates/quantities, exact search intent, VIP disclosure, bundle addition, plan application/focus, copy fallback, selected-benefit handoff and pending synthetic payload parity. Screens include lower sections and short319x484/390x320 dialogs. All API requests were intercepted; no real order was submitted.

The final candidate5 changes only request amount CSS plus its hashed configurator reference. `final-css-delta-results.json` proves 6/6 targeted cases: benefit/points/deposit handoff, benefit reset and one-line course/candidate dissertation ranges at319/390/1440. DOM Range width is within its receipt column; the currency no longer occupies a separate line. Final source will be rebuilt after commit and its entire public hash inventory must equal `final-tested-build-manifest.json` before publication.

Canonical Node tests:652 pass,9 existing skips,0 failures. Pricing tests:8/8, including6048 combinations. Brain tests:39/39. Brain strict validation passes. User-dirty .claude/launch.json is excluded. The initial resize assertion raced an asynchronous matchMedia event; it now awaits the actual dialog state and still verifies focus/docking. Four alternating widths are recorded in resize-event-timing.json.

## Independent reviews and disposition

Two read-only reviewers first reproduced actual release225 failures. Fixed: glued headings; unknown VIP surcharge; bundle action replacing a selected work; inaccessible subscription recommendation; changed apparent price in intake; missing scope basis; search opening a differently priced task. Second prototype review additionally found catalog browsing overwriting speed/VIP, search intent losing priority to the defense tab, and keyboard focus loss after plan application. All are now exercised by the owner regression suite and independently rechecked. Functional reviewer:8/8 GO on candidate4 (all JS unchanged in candidate5). Visual reviewer GO: all scoped P0/P1/P2 closed; final amount confirmed from the exact rendered1440dark screenshot after the six deterministic delta tests. No additional browser run was claimed for this final one-rule CSS check.

## Reproduce

```
python3 scripts/salon-services-clarity-20260927/build.py /path/to/pinned-release225 /tmp/new-clarity-build
node scripts/salon-services-clarity-20260927/verify.mjs /tmp/new-clarity-build /tmp/new-clarity-qa
node --test scripts/salon-services-20260927/estimate.test.cjs
node --test tests/*.test.js
python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v
./bin/brain validate --strict
```

Publication must use deploy.py with the manifest, exact archive digest and expected release225 pointer. It checks the entire live baseline, stages an exact tree, switches atomically and executes apply/rollback/forward with public hashes plus health/features. Live smoke blocks all non-GET/HEAD traffic. Native Safari, physical-device or screen-reader certification, real text zoom and any conversion uplift are not claimed. No unverified new monetary bonus is introduced.
