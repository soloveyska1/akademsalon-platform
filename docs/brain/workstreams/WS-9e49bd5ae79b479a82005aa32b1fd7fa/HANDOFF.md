# Workstream handoff

- Branch: `codex/out-006-first-step-measurement`
- Outcomes: `OUT-006`
- Goal: make the existing analytics beacon privacy-safe, freeze a falsifiable
  first-step measurement contract for the fresh home editorial desk and gather
  synthetic comprehension evidence before considering any redesign.
- Acceptance: `/api/visit` cannot carry cabinet credentials; dashboard/admin/
  order surfaces are silent; unknown paths canonicalize to `/other`; reject,
  revoke and expiry purge analytics identifiers and attribution; no new
  milestone ships without authoritative backend dedupe/readback/retention proof.
  A preregistered 5–8-person synthetic task test, not click-through alone,
  decides whether the visible `guided-desk` needs redesign.
- Proof: failing-first `tests/first-step-measurement-contract.test.js`, existing
  privacy/cache suites, full product and Brain regression, JS syntax and exact
  cache-key parity across all 89 direct `app.js` consumers; durable `E-1008`.
- Changed: selected the fresh home editorial desk as the exact OUT-006 surface;
  recorded the preregistered contract, then implemented the invisible privacy
  foundation in `1011060`: credential-free best-effort visit delivery, silent
  private/demo contours, exact route/event dimensions, legacy attribution
  migration, complete revoke/expiry purge, same-document regrant isolation,
  `/qa` unlinking and one atomic cache wave.
- Verified: failure-first 1/5→10/10; independent final P0/P1/P2=0 and 59/59;
  product 492/492, Brain 39/39, strict validation, JS syntax, reproducible home
  bundle, clean diff and clean local WebKit runtime at 390/1024. No UI geometry
  or production data was mutated; browser/server were stopped.
- Unverified: `/api/visit` backend storage/IP handling/dedupe/readback/retention
  and the 5–8-person synthetic comprehension task remain unavailable. No new
  production measurement milestone is authorized.
- Risks/rollback: the shared runtime has 89 direct consumers, so its cache wave
  is large but mechanical and must be atomic. Stop on any credential-bearing
  beacon, PII/high-cardinality path or field, send without opt-in, unknown server
  contract, new UI/focus/geometry, product mutation or hard scope conflict.
  Local rollback is a reverse commit revert. Release must use the standard
  canonical-source backup, health, smoke and rollback-forward proof.
- Next: submit and integrate exact result `1011060`, publish the unchanged-UI
  privacy foundation through a separate release workstream, then return to the
  newly reproduced search/catalog P1s in their own scoped outcome. OUT-006
  milestone work remains blocked on authoritative server proof.
