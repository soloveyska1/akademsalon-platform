Bounded static overlay on live release219, never rebuild the older canonical HTML.
Build: python3 scripts/salon-form-polish-20260924/build.py BASELINE OUTPUT (fresh output directory).
Set SALON_NODE_DEPS to the installed bundled node dependencies.
Run verify.mjs OUTPUT output/playwright/salon-form-polish-20260924 docs/brain/evidence/salon-comfort-20260924/server-contract.json.
Run inherited scripts/salon-comfort-20260924/verify.mjs and scripts/salon-funnel-20260924/verify.mjs on the same candidate, then Node tests and Brain unittest discovery/strict validation.
All browser regression HTTP routes intercepted. Contact and order fixtures synthetic; no real submit or telemetry.
Deploy uses exact archive hash and full baseline/post manifests, checks pointer and contents, performs atomic apply/rollback/forward with health/public hash readback.
Live smoke requires output directory and release label, allows only public static GET, mocks all APIs and blocks all POST. No real order, payment, analytics or chat message.
