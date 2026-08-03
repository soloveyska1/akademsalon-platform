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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: the shared runtime has 89 direct consumers, so its cache wave
  is large but mechanical and must be atomic. Stop on any credential-bearing
  beacon, PII/high-cardinality path or field, send without opt-in, unknown server
  contract, new UI/focus/geometry, product mutation or hard scope conflict.
  Local rollback is a reverse commit revert; deployment is out of scope.
- Next: commit this bootstrap, run strict conflict detection, then record the
  council/audit findings and failure-first execution plan before product code.
