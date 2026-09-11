# Workstream handoff

- Branch: `codex/salon-seo-overlay-20260911`
- Base: `e53d11cea40055f2dae41a0f212cbbac4c79055f` (fresh origin/main).
- Outcomes: `OUT-006`, bounded search entry and discoverability slice.
- Goal: improve free organic acquisition and search identity, retain direct-order flow.
- Acceptance: public sitemap URLs return 200/self canonical/indexable; unique relevant titles/descriptions; consistent Organization/WebSite/logo and supported breadcrumbs; refreshed SVG/ICO/PNG/touch/maskable identities; contextual visible links from useful guides to explicit service order intent; no fake reviews, dates, rankings or traffic.
- Proof: snapshot-based reproducible SEO audit/tests, full applicable regression, 2 independent read-only reviews, mobile/desktop browser checks, exact production hash readback, GET-only health/order-entry smoke, executed rollback/forward, changed-URL IndexNow receipt.
- Changed: declaration only.
- Production baseline: `release215-coursework-cd4061a3`; current and compatibility dist point to different releases. The task must preserve both exact baseline pointers in rollback and never overwrite production with the older canonical body/runtime.
- Implementation plan: deterministic SEO transform applied only to an immutable copy of exact live public assets, with full before/after inventory; narrowly scoped head/content updates; new identity assets. Production private/runtime/client data untouched.
- Unverified: current Search Console access, actual post-release organic lift and paid orders. Earlier search report is context, not new measurement.
- Risks/rollback: preserve exact live release and independent current/dist symlinks; fail closed if live pointer/content changes; revert both pointers on failed smoke. No backend/database changes.
- Reviews: two read-only agents; root is sole write owner.
- Next: commit declaration, inspect conflicts, implement only this scope.

- Scope correction: initial full HTML reservation collided with existing product workstreams and was abandoned before implementation. This branch owns new scripts, assets and evidence only. Existing repository HTML/runtime remain untouched; production changes are a verified overlay on the exact live release.
