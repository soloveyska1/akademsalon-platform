Sitewide return context — OUT-003 — sole writer root

User-approved scope: recently viewed public pages, explicit article resume,
PDF sample page/zoom bookmark, catalogue facet/card-position return.
Baseline: immutable release220-polish-9f987a75, 519 hash-pinned files.
Do not deploy root HTML: the immutable live tree contains newer SEO/brand/forms.
Build copies it, injects two cache-keyed assets on 68 allowlisted public pages,
and makes bounded hooks in actual salon-portfolio.js and salon-catalogue.js.
No form, private/account/payment/auth/analytics runtime or backend/DB changes.

Storage contract:
- salon_return_v1: version 1, clear timestamp; at most 5 known public paths,
  25 article checkpoints and 20 PDF checkpoints; logical TTL 30 days.
- Titles come from the build registry. Stored URLs, titles, search terms, file
  contents, contacts, form data and arbitrary hash strings are never accepted.
- Article checkpoint: content hash, section index, fractional section offset,
  percent and timestamp. Explicit click resumes; direct/legacy anchors win.
  Passive initial loading cannot overwrite a bookmark; begin saving after
  reading input reaches a first section. Clear disarms pending writes.
- PDF: ID, PDF-byte version hash, successfully rendered page, fit/manual mode,
  bounded scale and timestamp. Failed/cancelled/stale renders cannot write.
  Opening resumes; the separate first-page button intentionally starts again.
  Existing PDF order links and anonymous PDF files stay identical.
- Catalogue: session/history state only, enum facet/speed, known product ID,
  numeric viewport offset and timestamp, separate from commerce state.
  Back uses the original history entry; normal internal link uses a one-use
  <=2 minute timestamp because site policy intentionally omits Referer.
  Explicit anchors/direct fresh visits win. Clear invalidates old history too.
- Storage denied/corrupt/expired records degrade quietly to existing behavior.
  Clear affects only this browsing context, preserving the existing saved shelf.
- Explicit preview/demo modes excluded. Owner/QA transient desktop-preview
  from the existing navigation guard is distinguished using its original URL.
- No new analytics, timers for tracking, requests, backend APIs or accounts.

Reproduce (SALON_NODE_DEPS points to installed Playwright node_modules):
  python3 scripts/salon-return-20260924/build.py BASELINE NEW_OUTPUT
  node scripts/salon-return-20260924/verify.mjs NEW_OUTPUT EVIDENCE
  node --test tests/*.test.js
  PYTHONPATH=tools/brain/tests:. python3 -m unittest discover -s tools/brain/tests
  ./bin/brain validate --strict

verify.mjs routes every HTTP request to immutable local assets or synthetic API
responses, uses Chrome, closes every context/browser and leaves no server.
Screenshots/results include viewport/theme/browser and exact runtime hashes.
Production publishing uses deploy.py: pinned whole-tree verification, safe
bounded delta, lock, atomic current switch, actual rollback/forward and HTTP
readback. Compatibility dist stays release203-09ccfca4. Final live browser smoke
loads actual public bytes, intercepts APIs, excludes owner/QA analytics and never
creates a real order/payment/chat. No synthetic success is claimed as an order.
