# OUT-006 autonomy checkpoint, 2026-09-09

Root is sole writer. Base 7cbc7ddd; exact content hashes in source-hashes.json.

## Implemented and verified scope

Fresh dashboard markup/CSS/renderer, no legacy cabinet init; shared pure order domain and established auth transport. Email Enter/change, TG polling, guest claim, identity isolation, order messages/files, immutable quote references, manual payment branches, subscription periods, deposit explanation, review consent, voluntary tips, ICS and optional analytics settings.

Grounded deterministic helper on public pages and cabinet; authoritative server order context; individual answer-bound editable handoff; no-order contact request has explicit consent and no silent text truncation. No external LLM or customer documents sent to one.

Server quote core is a conservative explainable estimate, never an issued offer: can_pay=false. Deadline reservations, automatic document extraction and issuance are NOT enabled. Live read-only aggregate:30 active orders;22 priced active orders without active immutable snapshot. Capacity question remains unanswered.

Checkout runtime:18 tests PASS on source-only copied real runtime and schema-only SQLite fixture, /tmp/salon-autonomy-runtime-20260909. Includes12 concurrent modern checkout calls reusing one invoice; real contract validator/PDF, actual bonus apply/cancel, gift-tender provenance, subscription discount, paid/claimed freeze, legacy cohort and snapshot history,12 concurrent promotions only4 x6000 winners; no real customer DB mutations or provider requests. Four assistant unit tests PASS. Installer apply→rollback→forward passes on isolated source tree, exact bytes; no database rollback.

Independent reviews: journey_review production renderer with mocked HTTP (email/TG/logout stale response/bonus/expected quote/manual subscription/review/tip/ICS/analytics),0 JS errors and0 real API mutations. Reproduction scripts retained here. campaign_review32 demo route/viewport states, both themes, helper390/1440 and original video. Initial P1 contrast, deposit wording, TG linking promise, stale helper question and truncated handoff fixed and browser-rechecked. order_contract_review GO for estimate-only + snapshot-bound checkout + legacy compatibility, not automatic issuance.

Existing historical suites retain obsolete old-DOM/cache/service-wizard assertions. Latest targeted source run26/37 PASS,11 failures in those obsolete assertions; current referral prototype also intentionally differs from production200 overlay (39/41 source checks). Public artifact checks must run against SALON_PUBLIC_ROOT. These are not reported as passing.

## Actual external publication

Telegram Kladovaya original pin860 backed up privately on VPS. API rejected media edit MESSAGE_ID_INVALID; sent original evergreen16s1080x1350H264 film as906, pinned906 and unpinned860. getChat confirmed exact new pin/video. https://t.me/kladovaya_gipsr/906

Promotion СВОИ6000 activated via atomic absent-only INSERT:6000 off gross45000+,4 total applications, expires2026-09-10 inclusive UTC (11Sep02:59MSK). Quota tested before activation. Single promotional video post908 sent, message_id/video/caption response verified. https://t.me/kladovaya_gipsr/908 . Deadline and price-confirmation requirement are explicit. Source captions/video in assets/campaigns/autumn-2026. No sales/paid conversions claimed. Private receipts /tmp/salon-channel-20260909 on VPS contain source pin and post receipts; no tokens in this repository.

## Preview incident

After interrupted tool turn, Python8771 stayed alive but returned empty replies because inherited output pipe had closed. Root restarted own process with output redirected /tmp/salon-preview-8771.log. Local dashboard HTTP200 and production home HTTP200 verified. New owned exec session23494. No production interruption.

## Next

Freeze implementation, build public artifact with existing200 referral overlay, verify responsive/auth/cabinet paths and deploy source-only backend plus atomic static release. Preserve legacy cohort under server-side same-lock predicate. Automatic fixed price/capacity issuance remains gated until backlog and available workload are reconciled; do not claim all orders automatically payable.
