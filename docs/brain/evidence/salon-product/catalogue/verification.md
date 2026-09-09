# Works and prices catalogue verification · 2026-09-09

Outcome OUT-006, owner-requested redesign continuation. Implementation base 2f35f4b3, source binding is the implementation commit containing this evidence and immutable asset hashes in source-hashes.json. Browser Chromium 152.0.7977.84, fresh contexts with serviceWorkers blocked. Routes services.html, index.html, configurator.html?composition=1. Synthetic state only, no client materials.

## Verified behavior

- 12 static direct-order links enhanced into native dialog buttons. This avoids the legacy capture-phase configurator navigation guard freezing a card as “opening”. Without JavaScript the original direct links remain.
- Search aliases, categories, empty recovery and no search-query storage. Price/speed switches use canonical SalonCalc + SalonCommerce.
- Course express24 28,000 plus defense/norm bundle9,500 =37,500; tutor raises to40,500. VIP total is unknown, all selected extras included without duplicate lines. Disabling VIP restores chosen extras.
- Candidate remains planned; explicit chapter transition is express eligible. Unknown custom/editing/parts never display an invented total.
- Five product/scope browser quotes exactly match the destination form, retaining psychology and deadline. Closing/reopening the modal retains memory-only choices; checkout persists finite composition; stored continuation is explicit.
- Real Browser Back retains updated context and exact form quote. Separate persisted PageTransitionEvent verifies context refresh in an already initialized page; actual Chromium BFCache admission was not established.
- Native modal Escape/backdrop closure, explicit cyclic Tab handling, return focus, mobile sticky checkout, reduced motion. Existing shared menu/search/theme/cookie behavior preserved.

## Evidence

- focused-tests.txt: 85/85 passed.
- price-parity.cjs: independent reviewer reproduction, 6048/6048 catalogue/form price states passed. Run node docs/brain/evidence/salon-product/catalogue/price-parity.cjs from repository root.
- look.js / look.log: 42 catalogue/sheet/extras states across 320,360,390,608,768,1024,1440 widths and light/dark themes; no horizontal overflow and checkout visible. Screenshots labelled by route state/width/theme, height900. Cards begin at498px desktop1440 and569px mobile390 in clean synthetic state.
- journey.js / journey.log: five grouped search/order/continuation/keyboard journeys with detailed assertions. No real POST.
- back.js / back.log: actual Back plus persisted-event regression.
- contrast.js / contrast.log:34 text/background pairs, minimum4.7266. Samples wait for theme transition completion.
- home-qa.js / home-qa.log: six existing commerce journeys,36 main/extras viewport-theme states,2mocked retry POST; zero real submission.
- home-journey.js / home-journey.log: six shell/benefit journeys and36 benefit states.
- source-hashes.json pins exact changed product assets. Brain validate passed records125; conflicts hard0 warnings60 info8 blocking0. Existing legacy warnings accepted deliberately by integration owner, no new hard conflict.

## Independent review

journey_review: initial P1 cached context and P2 past date; fixed with pageshow/open/save refresh and min/invalid date guard. Final GO, no remaining findings.
order_contract_review: independently confirmed same P1 and6048 price parity cases; rereview of fixed context paths and Back evidence GO for private preview, no remaining findings. Root remains sole writer.

## Limits and next step

Owner-only Sites review is the release target. Public akademsalon.ru and its backend unchanged. Historical full suite had506/681 before this iteration; it was not rerun or claimed green. Public authoritative parsing of new composition, release-wide gates and production smoke/rollback remain pending. Previous private version49 is the retained rollback target; rollback is available, not executed in this iteration. Next: exact clean source build, save/private publication and deployed route readback.
