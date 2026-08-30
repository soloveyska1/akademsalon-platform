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
  target `E-1041`, release target `REL-0178`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: set a new-series boundary because historical `first_input`
  is undercounted; never rewrite old rows. Roll back exact static, contract and
  backend hashes without restoring SQLite.
- Next: review and commit the manifest plus this handoff.
