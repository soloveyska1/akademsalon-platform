Build is a bounded hash-pinned overlay on release218, never a root HTML rebuild.
Run build.py BASELINE OUTPUT (OUTPUT must not exist).
Verify: SALON_NODE_DEPS=<bundled node dependencies> node scripts/salon-comfort-20260924/verify.mjs OUTPUT output/playwright/salon-comfort-20260924 docs/brain/evidence/salon-comfort-20260924/server-contract.json
Also run scripts/salon-funnel-20260924/verify.mjs with the same arguments, node --test tests/*.test.js, and Brain unittest discovery/strict validation.
Deploy accepts full before/after manifest and an exact archive hash, verifies current, atomically applies, rolls back and forwards with health/public hashes.
Live smoke only allows public static GET; all API requests are mocked, no order/analytics/payment is sent.
