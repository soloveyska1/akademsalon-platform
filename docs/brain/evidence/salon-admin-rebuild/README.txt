ADMIN FRONTEND REPLACEMENT — OUT-006

User rejected the former cosmetic shell. New standalone admin.html loads only shared auth/API app.js plus new salon-admin-core.js and salon-admin-workspace.js/CSS. Legacy admin.js, salon-admin.css and polish15-admin.css are not imported. Existing backend and customer records are preserved.

New Russian workspace: priority queue and order master/detail; orders, clients, questions, leads, subscription payments, gifts, reviews, broadcasts, analytics, materials and settings. Contextual action dialogs replace permanently exposed legacy forms. Order composition, payments, uploads, protected delivery, messages, activity, bonus journal, moderation and settings connect to existing API contracts. Responsive light/dark UI, draft preservation and authentication guards included.

PROOF
freeze.json pins implementation bytes and counts. browser-matrix.json records 150 synthetic states (15 routes, five widths 320–1440, two themes), zero overflow/unnamed buttons/page errors. order-browser.json records five real-browser synthetic order journey assertions. Independent contract review records 47 checks; non-order review records 44 states plus mutation payload, keyboard, filter and broadcast polling checks. 20 new node tests, cabinet regression harness, and 76 required public tests passed. Earlier review report source hashes and fixed issues remain historical; freeze.json explains final delta coverage. Screenshots are synthetic.

Production release202-1a211115 contains 439 hash-verified files. production-release.json records executed apply202 -> rollback201 -> forward202, no DB restore. 24 critical public paths match exact hashes; public API smoke 14/14 passed. Live unsigned login at 390/1440 has no overflow, page errors or non-GET requests, and admin overview returns403. Actual authenticated production client mutations/settlement were deliberately not exercised.

LIMITS
The existing server API, permissions and economic rules were not rebuilt. Lists retain API page/cap limits; subscription module covers pending payments supported by the existing endpoint. Lead handled marks explicitly apply only to this device. For a bound order, the price editor deadline changes specification positions, not the global order deadline; its label states that boundary. Existing broadcast and file processing depend on server availability. Unknown mutation outcomes lock retries until fresh readback and explicit reconciliation. The user should perform normal authenticated operations; synthetic tests do not prove actual payment settlement or organic sales.

GOVERNANCE
Canonical origin/main remains e53d11ce. This release branch has not been integrated into canonical. Fresh conflicts: hard0, warnings60, blocking0 with explicit integration-owner acceptance for inherited terminal worktree/history observations. Do not mark integrated without fresh fetch and result ancestry. Workstream handoff carries final status and next step. No user dirty files or singleton registries changed.

REPRODUCERS
Root browser scripts use playwright-cli run-code and the saved synthetic-preview.py/synthetic-fixtures.json server used during QA (restore its /tmp fixture path or adjust the local path); they are source-bound evidence, not a public demo. Independent Python AS-SPEC reproducers require the hash-pinned backend snapshot named in reports. Static release script requires the immutable predecessor and matching packaged archive; do not rerun on a newer production state. Own temporary servers/browser are closed on completion.
