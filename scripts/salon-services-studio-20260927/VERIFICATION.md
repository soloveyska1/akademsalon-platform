# Services studio verification

Outcome OUT-007, user-requested replacement of visually rejected release224. Root is the only writer.

## Scope and source

Baseline release224-services-acad423a: 530 exact SHA256-pinned public files. Only services.html, assets/js/salon-catalogue.js and new assets/css/salon-services-studio.css change. Output has531 files. The calculator, estimate model, bonus rules, checkout, submit runtime, shared shell, all other pages, backend and database are byte-identical. No new customer price or bonus promise.

## Reproducible proof

Build: `python3 scripts/salon-services-studio-20260927/build.py BASELINE OUTPUT`.
Browser: `node scripts/salon-services-studio-20260927/verify.mjs OUTPUT EVIDENCE_DIR`. All network requests are intercepted, API responses synthetic; no real order or payment is created. Matrix319/360/390/768/1024/1440, light/dark, reduced motion. Screenshots show clean default and explicit configured states. Final28 tests cover all products/scopes/speeds, native modal focus and tabs, same-product and cross-product return, bfcache, date/quantity errors, mobile and desktop resize, benefits total including subscription cost and deposit, bundle deduplication, VIP, clipboard fallback, and synthetic order line/cart pending-range parity. A390x320 regression covers a short viewport. Actual IAB319x484 also inspected.

Arithmetic: existing estimate.test.cjs8/8 (including6048 quote matrix); canonical public652passed/9skipped; Brain39tests. Root public tests are a shared-contract regression guard, not a substitute for testing the generated overlay. Final generated tree is hash-compared to the tested candidate before publication.

Two independent read-only reviews: see reviews.json. All concrete findings resolved and rechecked. candidate6 only raises small-screen tabs and bottom detail links to44px, then repeats the final browser suite.

## Release proof

Use existing fail-closed deploy.py with whole-baseline inventory, exact archive SHA, public HTTP hash readback, health/features, real apply→rollback→forward, preserving the older compatibility dist symlink. Live smoke blocks all non-GET/HEAD traffic and checks services→VIP→checkout parity and custom editing. Completed: release225-studio-a45b389e, sourcea45b389e; receipt confirms all three switches and exact readbacks. Live319/1440 in both themes4/4, JSerrors0 and APIwrites0. Original user IAB page reloaded and visually verified. See deploy-receipt.json, build.json and live-results.json.

## Limits

The release proves interface behavior and price continuity. It does not prove conversion uplift, new sales, profitability or competitor superiority. Existing financial scenarios are unchanged in scripts/salon-services-20260927/ECONOMICS.md. No auth/payment backend changes are claimed.
