Academic Salon — eight public appearance/comfort features, release222
Owner root; OUT-003; WS-3c1b84f7d7314927b53b393b5cb7b526.

Build only over the exact immutable release221 tree. The canonical root HTML
is older than production overlays and MUST NOT replace the captured tree.
python3 scripts/salon-ease-20260924/build.py BASELINE NEW_OUTPUT
The inventory pins all 521 input files, changes 101 files, adds 3 assets,
preserves all input paths and produces a 524-file tree plus hashed delta.

Features:
1. Static accessible header search button reuses experience search and focus.
2. Early system/manual theme; manual legacy salon_theme values remain light/dark,
   system removes the override. app delegates only when the new bridge exists.
3. Reading size and line spacing applied before layout/restoration across 25 guides.
4. Native horizontal mobile chips with noninteractive edge cues; axis-only reveal.
5. Explicit frozen FAQ ID registry, native details, canonical no-query share URLs,
   clipboard fallback; all 32 FAQ consumers covered; IDs never derive at runtime.
6. Compact assistant controls root CSS only, retaining one original launcher and
   its existing inline/intake placement. Mobile existing visibility policies stay.
7. Decorative PDF outline uses existing loading state, epoch/paintId lifecycle,
   error/retry/close guard; successful-page-only reveal and bookmark remain.
8. Short intentional press/save/FAQ feedback, reduced motion + calm respected.

Only finite preferences are saved: readingSize normal/large, readingSpace
normal/roomy, assistant full/compact; no query, task, contact, chat or document
text is added to storage, URLs or analytics. Storage denial is honest and keeps
in-memory choice even on persisted pageshow. Cross-tab changes also refresh
custom-select visible labels. Reader confirmation auto-clears after 4.2 s.
No API, backend, DB, prices, consent/analytics payload, service taxonomy changes.

Verify with SALON_NODE_DEPS set to the installed bundled node_modules:
node scripts/salon-ease-20260924/verify.mjs OUTPUT EVIDENCE_DIR
node scripts/salon-ease-20260924/route-check.mjs OUTPUT EVIDENCE_DIR
node scripts/salon-return-20260924/verify.mjs OUTPUT EVIDENCE_DIR
node scripts/salon-form-polish-20260924/verify.mjs OUTPUT EVIDENCE_DIR docs/brain/evidence/salon-comfort-20260924/server-contract.json
node --test tests/*.test.js
PYTHONPATH=tools/brain/tests:. python3 -m unittest discover -s tools/brain/tests
./bin/brain validate --strict
All local browser HTTP is routed; API is synthetic, no production mutations.
Physical mouse coordinates are used for the sticky header (locator.click can
scroll the underlying page before pointerdown). Reading resume is verified by
section plus saved within-section fraction, not an assumed heading position.

Deploy.py fail-closes on the full baseline and pointer, validates archive paths,
switches current atomically and performs apply/rollback/forward + exact HTTP
readback. Compatibility dist remains release203. No full rebuild or restart.
After live smoke freeze clean result; submit/integrate via Brain lifecycle,
then canonical owner updates CURRENT-HANDOFF. Keep terminal task branch parked.

HTTP expertise.html is shadowed by a pre-existing Nginx301 to /. Verify that
exact status/location plus target homepage bytes; never follow arbitrary
redirects. Full immutable file inventory still covers expertise.html itself.
python3 scripts/salon-ease-20260924/test_deploy.py proves readback fail-closed.
