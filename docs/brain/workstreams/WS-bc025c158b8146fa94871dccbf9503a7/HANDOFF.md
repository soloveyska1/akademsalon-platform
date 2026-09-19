# Workstream handoff

- Branch: codex/salon-seo-overlay-20260911.
- Base: e53d11cea40055f2dae41a0f212cbbac4c79055f, fresh origin/main at bootstrap and pre-publish.
- Outcome: OUT-006, bounded search entry and discoverability slice.
- Goal: improve free organic acquisition and search identity, retain direct-order flow.
- Acceptance: sitemap URLs 200/self canonical/indexable; relevant unique metadata; consistent Organization/WebSite and breadcrumbs; refreshed SVG/ICO/PNG/touch/maskable identity; contextual links to relevant services; verified release/rollback and search-engine submissions. No fake reviews, dates, traffic or ranking promises.

## Implementation and release

- Reproducible SEO overlay on exact live release215-coursework-cd4061a3. Canonical Git is older than live product HTML/runtime, so only new scripts/assets/tests/evidence are committed here. Existing source HTML/runtime and user dirty files remain untouched.
- Ten useful content blocks and ten improved metadata pairs; contextual links in seven guides; home/service links to formerly isolated search landing pages; unified Organization identity and current breadcrumbs; synchronized genuine content modification dates in article, schema, Sitemap and Atom.
- New geometric lowercase a with green dot uses current violet #5136b5. SVG, ICO 16/32/48, PNG 16/32/48/96/120/180/192/512, maskable and six topic-specific 1200x630 share cards. Replaced old declared favicon paths too.
- Mobile home overflow fixed by preserving word spacing after hidden line breaks. New links have 44px targets; article table styles scoped to the added block.
- Exact public candidate source: c8ee010575d8b5263f4636430814d428885061fd; build inventory in evidence/build.json. 513 files, 138 changed, zero removed; runtime/vendor/font bytes and private-page bodies preserved; only service-worker cache version refreshed.
- Published release216-seo-c8ee0105; independent compatibility dist remains release203-09ccfca4. Executed activation -> rollback to release215 -> forward to release216. Health/readback passed each stage. No backend/database changes. Receipt includes exact pointers, archive hash and checked paths.
- IndexNow tooling supports an explicit existing key-file path because recent releases preserve the public key proof file but omit the hidden helper file. Existing key validated against public URL; no key recorded. One request accepted, HTTP 202, 79 changed canonical/indexable URLs.

## Verification

- SEO tests 10/10 against exact candidate/baseline; source full regression 652 pass / 0 fail / 9 skipped, with candidate-only checks separately executed without skips. Brain tests: 39 passed; strict graph validation passed: 125 records / 263 links / 69 manifests.
- 64 local browser checks: six pages, five widths, two themes, plus four order entries; zero page errors/overflow/undersized new links. Local anonymous API fixture explicitly recorded.
- Seven fresh live browser checks without API fixtures; all 200, no page errors/overflow. Normocontrol, defense, review and course/editing/psychology selections verified. Only real guest GET session requests; no submitted order or payment.
- Post-release public readback: all 77 sitemap URLs plus 10 critical paths returned 200 and matched exact candidate hashes. Final mobile/desktop screenshots inspected and retained.
- Two independent read-only reviewers. P0/P1=0; date consistency and commission/table layout feedback fixed. Final conversion visual review P0/P1/P2=0 within observed scope. Root is sole writer.

## Search console observations

- Yandex: 40 added / 25 in search before changes; Metrika crawling already enabled. Current robots analyzer: 0 errors, five priority URLs explicitly allowed. Historical robots warning submitted for recheck 11 September.
- Google: 16 indexed / 36 excluded as of 4 September, with reason distinctions recorded. Sitemap previously read 16 July with 40 URLs; successfully resubmitted 11 September for current 77 URL map. Main page, remarks landing and weekly course guide accepted into priority crawl queue.
- Receipts under docs/brain/evidence/salon-seo-20260911/: production-receipt, public-readback, public-browser, indexnow-receipt, search-console-observations, independent-reviews and strategy.

## Decisions, limits and next step

- Initial broad HTML workstream was abandoned before changes because of overlapping reservations; this isolated overlay has no hard conflicts. Integration owner explicitly accepted only 60 TERMINAL_WORKTREE_PRESENT observations, no path/semantic overlap; CLI --allow-warnings and --strict are mutually exclusive.
- Do not deploy old canonical HTML over live. Future product releases must apply this overlay or preserve its changes until live/canonical reconciliation is deliberately owned.
- Search-engine acceptance is not completed indexing or proof of higher rankings, visits or paid orders. Index reports lag. Real organic lift and customer payments are unmeasured; current availability cannot guarantee universal uninterrupted access.
- Existing analytics consent behavior retained. Old Google 404 paths /orders and /quote/ are not sitemap entries and were not blanket-redirected. Broader legal-claims consistency remains separate existing debt; no legal text rewritten.
- Singleton CURRENT-HANDOFF remains outside this reservation; durable result is this workstream handoff plus canonical source/evidence. Aggregate only after its existing owner releases the scope.
- One next step: on 25 September compare complete 14-day organic query/page and confirmed-order data with previous 14 days, separating branded queries and own QA visits; use results to prioritize the next content/entry change. No follow-up automation was created.
