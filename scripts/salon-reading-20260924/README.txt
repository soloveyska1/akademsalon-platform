Academic Salon — eight public reading/navigation comforts, release223.
OUT-003; sole owner root; WS-d1515e1200b64c5e86cb89ebc7ea02b0.

Build only over exact immutable release222-ease-fa5ea915. Canonical root HTML
is older than live overlays and must never replace that baseline.
python3 scripts/salon-reading-20260924/build.py BASELINE NEW_OUTPUT
Pins all524 inputs, changes97 paths, adds2 assets, preserves every input path.

Features: typo/alias local global and library search, escaped highlights and
honest partial/default suggestions; focus reader with semantic-anchor position;
mobile contents dialog; copy14 explicitly marked existing examples/templates;
expanded semantic table with sanitized clone; canonical section/PDF page shares
(native if supported, clipboard/selectable fallback);160ms incoming-main reveal;
small original SVG illustrations for search, saved shelf and404.

Search caps query160 chars/12tokens and deduplicates global paths. No new stored
queries, arbitrary URLs, contacts, file/chat/task text or telemetry. Only public
static IDs/page integers enter share URLs. PDF share arms only on a successful
current epoch/paint; direct hash overrides bookmark in fit mode, strict parser
rejects invalid/unknown/out-of-range pages. Hash-driven Back closes the viewer
without rewriting the destination; ordinary card-open viewers remain separate.
Dialogs preserve page position, original table DOM and focus; explicit Tab loop.
Heading text/IDs/legacy aliases and reader bookmarks remain compatible.

Motion is a short incoming-main opacity .88 to1, no navigation interception,
no cross-document snapshots; OS reduced motion, calm and motionoff disable it.
Back/Forward skips arrival motion. Header remains immediately interactive.
Existing root palette/type and one primary CTA retained. Backend/DB/order/auth/
pricing/consent/analytics/service-worker outside scope and byte-identical.

SALON_NODE_DEPS points to bundled node_modules. Reproduce with:
node scripts/salon-reading-20260924/verify.mjs OUTPUT EVIDENCE
node scripts/salon-ease-20260924/route-check.mjs OUTPUT EVIDENCE
node scripts/salon-ease-20260924/verify.mjs OUTPUT EVIDENCE
node scripts/salon-return-20260924/verify.mjs OUTPUT EVIDENCE
node scripts/salon-form-polish-20260924/verify.mjs OUTPUT EVIDENCE docs/brain/evidence/salon-comfort-20260924/server-contract.json
node --test tests/*.test.js
PYTHONPATH=tools/brain/tests:. python3 -m unittest discover -s tools/brain/tests
python3 scripts/salon-reading-20260924/test_deploy.py
./bin/brain validate --strict
All local browser requests routed to exact artifact or synthetic API. No real
orders/messages/payments sent. Independent probes retained in evidence/scripts.

Deploy uses full inventory/pointer checks, immutable delta, atomic current only,
health/exact HTTP readback and executed rollback-forward. Compatibility dist
remains release203. Rollback target release222; never restore DB for this patch.
Live smoke uses actual static HTTP/hashes with all APIs/externals intercepted.
