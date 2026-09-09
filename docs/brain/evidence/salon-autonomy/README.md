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


## Release185 published and read back — 2026-09-09 13:36 UTC

PUBLIC LIVE https://akademsalon.ru/dashboard.html?v=release185 . Static release185-432dfa9b, exact source432dfa9bd03a716c38b85d5d648d2655ed1ab8ed,420 files, archive SHA94e7ca729a2f6d2020091bc6c28ee870f2a1ba4ae7bea23b6f97718b31326eb4. current/dist both185; previous184. Manifest tree parity and hashes checked before activation. Executed static apply → rollback184 → forward185, exact public index/dashboard/JS/CSS/manifest readback; PDF module MIME correct. Backend exact webapp2e7f7e959049c22feb3b108c64f9f87b6d1a97703eb95f068e4327d64b14df9f, autoquote3e48174c95853ab0537d47254fba3319a1f32d39aadf27cd344355cb95ce4a80, assistantd736615ea0f51f8886451394222d316fe8e45aae22811fedb4bb703bc7293c63. Actual source-only apply → rollback → forward healthy; backup /root/salon_bot/backups/autoquote-20260909T133113115892Z. No schema changes, no database restore. Rollback must stop runtime and preserve financial snapshots/invoices.

Evidence in docs/brain/evidence/salon-autonomy/: backend-release.json, static-release.json, public-tests-release185.txt (48/48), public-browser-release185.json (144 states:12 routes ×6 widths ×2 themes, no overflow/JS errors/missing assets/private fixtures), live-browser-release185.json (8 live GET-only states, stable signed-out login awaited, assistant visible, no JS errors/mutations), live-smoke-release185.txt (14/14), final-health-release185.json. Existing independent authenticated journey and actual runtime financial proofs remain applicable to exact frozen source; PWA metadata-only432dfa fix covered by48 tests. Fresh real bank charge and full third-party account creation were NOT performed. Historic old-DOM suites remain documented separately, not misrepresented as passing.

Final health: bot/nginx/watch active, Restart=always,NRestarts0, SQLite quick_check ok, uploads pending/delayed0, private .env/Brain/demo/preview/AppleDouble URLs404. Bot Telegram warmup timed out three times after controlled restart, then recovered automatically and started actual polling at13:33:06UTC; no later runtime errors observed. Do not classify initial three warnings as ongoing outage. Promo СВОИ6000 still4 uses left (0 applications), paid conversions not established; don't claim3–4 premium orders. Pin906/promo908 remain published.

Owner-facing preview8771 recovered and retained because user explicitly wants ongoing real-time preview; logfile /tmp/salon-preview-8771.log. Task remains active. Temporary QA server8772 and root Playwright salon-workspace closed after release. Production browser open request was queued by app; do not claim it became visible. Night automation-3 updated with actual185/backend rollback, campaign expiry/read-only monitoring and quiet unchanged state. Codex continuation depends on app availability; VPS watch runs independently.

Fresh canonical e53d11ce unchanged; exact HEAD432dfa conflict audit hard0/blocking0,60 inherited warnings consciously accepted. Root remains sole writer. Source not merged into canonical; workstream stays active because larger automatic-issuance outcome is incomplete. CURRENT-HANDOFF remains reserved by another owner and untouched.

NEXT EXACT STEP: implement server material extraction into bounded quote facts (DOCX/PDF/plain text with explicit unreadable/ambiguous cases), validate against manual selected scope, then design immutable issued-price adapter and capacity reservation using existing actual order/payment contracts. Do not enable automatic fixed quotes while materials/capacity are unknown. User's capacity-hours question remains pending; estimate endpoint always can_pay=false. No safe assertion of free capacity from active-order count alone. Keep candidate, sub24-hour/unclear express and complex research on manual approval. Public referral stays200 until proposed new program has authoritative payment/refund integration.
