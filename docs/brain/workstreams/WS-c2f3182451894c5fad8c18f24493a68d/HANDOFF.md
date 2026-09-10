# Admin replacement: verified and published

Outcome: OUT-006. Write-owner: codex-root. Branch: codex/salon-admin-rebuild.
Canonical base: e53d11cea40055f2dae41a0f212cbbac4c79055f.
Frozen implementation: 1a211115ebeaf4caf98ea9e374e74c0ac61e0ad1.
Production: release202-1a211115. Verified rollback: release201-7ed5e283.

## Goal and result

User explicitly rejected the previous cosmetic admin shell. Replaced admin.html and every admin module renderer, controller and stylesheet with an independent frontend. Legacy admin.js/salon-admin.css/polish15-admin.css are no longer imported. Shared app.js provides existing authentication and API infrastructure; backend/customer records remain unchanged.

Russian workspace has a priority inbox and master/detail orders; clients, questions, leads, pending subscription payments, gifts, reviews, broadcasts, analytics, materials and settings are freshly rendered. Order actions expose contextual forms, composition and AS-SPEC, payment identity, upload/delivery, messages, history and notes. Client bonus journal, moderation, gift actions, broadcasting and settings use actual API contracts. Light/dark themes and responsive navigation cover320–1440. Golos Text body, restrained Literata and violet/lavender palette. New in-memory drafts, auth epochs and uncertain-mutation reconciliation prevent data loss or blind retries.

## Verification

Evidence: docs/brain/evidence/salon-admin-rebuild/README.txt and freeze.json.
20 new admin node tests passed; cabinet regression harness passed. Required public76/76. Independent read-only order/auth/transport/AS-SPEC review47 checks GO; independent non-order44 browser states plus9 mocked POST payloads and keyboard/filter/polling checks GO. P0/P1=0. Frozen source root matrix150/150 states (15 routes, five widths, two themes), no overflow/unnamed buttons/JS errors. Five root synthetic browser order assertions passed, including exact payment ID/amount, pending message draft and create-to-offer composition.

Immutable439-file release verified by full hash tree and24 critical public paths. Executed apply202 -> rollback201 -> forward202. Health and pay_online remained true, pending/delayed uploads zero, DB never restored. Production API smoke14/14. Live unauthenticated login390/1440 no overflow/errors/non-GET; private admin overview403. New production admin opened in user browser. No real order/payment/message mutations performed during QA.

## Boundaries and decisions

Existing server list caps and pending-subscription endpoint boundaries remain. Leads handled marks are explicitly device-local. Bound-order price editor changes specification-position deadlines, not global order deadline, and labels that scope. Unknown mutation outcomes block retry until fresh readback and explicit reconciliation. This is a frontend replacement, not a new backend or evidence of actual payment settlement.

Scope union incorporates already published release201 history. User dirty files untouched. Fresh conflict scan hard0/warnings60/blocking0; inherited terminal/history warnings explicitly accepted by integration owner. Current canonical remains e53d11ce. Production publication does not establish canonical integration. Do not mark integrated before fresh fetch and result ancestry.

## Next step

Submit this verified workstream, then integration owner must integrate its frozen result and submission revision into fresh canonical before terminal integrated status. Continue only bounded reproduced defects. Existing quiet monitor retains health and September10 UTC Telegram-promo expiry obligation; no repeat redesign or real client test operations.
