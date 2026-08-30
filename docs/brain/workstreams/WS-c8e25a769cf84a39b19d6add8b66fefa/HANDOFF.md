# Workstream handoff

- Branch: `codex/out-006-form-input-truth-v2`
- Outcomes: `OUT-006`
- Goal: correct the current wizard's `first_input` coverage and add truthful
  aggregate engagement diagnostics after the prospective REL-0175 sample
  reached contact through clicks while the legacy listener remained blind.
- Acceptance: the delegated listener covers the dynamic current wizard and
  legacy form, fires once only after analytics consent and sends no field name
  or value; strict funnel IDs/order and historical counts remain unchanged;
  labels describe field input; aggregate human-session diagnostics distinguish
  meaningful continuation and contact-step reach from strict conversion; no
  client UI, prices, promo, deposits or submission behavior changes.
- Proof: failing-first browser/contract/backend/admin tests, full regression,
  strict Brain validation, two independent read-only reviews, privacy-safe
  production readback, service/health smoke and tested rollback; evidence
  target `E-1042`, release target `REL-0178`.
- Changed: delegated `first_input` from hidden legacy-only `#confBody` to the
  stable shared `#main`; clarified contract 2.4.1 labels without changing the
  strict funnel; added read-only aggregate configurator/engagement/contact
  metrics and two admin cards; pinned the new module/contract hashes; added
  regression fixtures for route/service, mixed openings, event ordering and a
  click without a real configurator open. Product system documentation records
  the diagnostic boundary.
- Verified before production: failing-first failures reproduced; public Node
  638/638; backend 130/130 with two expected environment skips; focused JS
  21/21; Brain 39/39 and strict validation; admin Chromium 390/1024/1440 with
  eight cards, no overflow or CSP violations; manual Chromium runtime proves
  clicks=0, first dynamic-field input=1 and repeated input remains 1; two
  independent final reviews return GO with P0=0/P1=0.
- Unverified: production forward, exact corrected-series timestamp, live
  authenticated admin readback, health/journal smoke and rollback-forward.
- Risks/rollback: set a new-series boundary because historical `first_input`
  is undercounted; never rewrite old rows. Roll back exact static, contract and
  backend hashes without restoring SQLite.
- P2: write-owner `codex-root` will add the manual dynamic-input Chromium
  scenario as a tracked automated browser test in the first analytics
  maintenance after `REL-0178`; this release already has runtime proof.
- Warning decision: the integration owner reviewed terminal worktree and dormant
  unmanaged-ref warnings; no hard overlap remained and explicit
  `brain conflicts --allow-warnings` returned `PROCEED_LOCAL_SNAPSHOT`.
- Next: review and commit the manifest plus this handoff.
