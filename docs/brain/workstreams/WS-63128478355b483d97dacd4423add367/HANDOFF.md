# Workstream handoff

- Branch: `codex/out-001-authoritative-contract-v2`
- Outcomes: `OUT-001`
- Base: exact canonical `90089a84438283af3899e99a5aa703960881964d`.
- Goal: prove the authoritative `submit → API → persistence/outbox →
  bot/operator → cabinet` contract and design a unique synthetic marker,
  zero-or-one lookup and bounded cleanup procedure before any external POST.
- Acceptance: enumerate every frontend producer and downstream identity hop;
  cite authoritative server/bot evidence for idempotency scope/TTL,
  same-key/different-payload conflict, transaction/outbox boundary, initial
  status and delivery cardinality; produce a marker/lookup/cleanup plan whose
  stop conditions prevent real-client or payment impact.
- Proof: repository/VPS read-only source and configuration inventory with exact
  paths and hashes; GET/HEAD-only observations; deterministic contract tests if
  authoritative source is available; `brain:test`, `brain:validate`; independent
  submit/API/auth/delivery, UX/mobile/dark and QA/a11y/reliability reviews;
  Kimi+Sonnet+GLM daily council and one Opus contract/UX fork.
- Changed: added `docs/brain/evidence/E-1011.md` and
  `docs/brain/plans/OUT-001-AUTHORITATIVE-BACKEND.md`. They locate/hash the live
  backend, separate proven frontend/DB facts from P1 gaps, and define the ordered
  versioning, atomic-outbox, marker/lookup/cleanup and exact-continuation proof.
  Root remained the sole write-owner; production remains release103.
- Verified: active VPS service/source/schema without secrets or row data;
  permanent unique request-ID index, initial `new` status and one-time exchange;
  separate order/event commits, process-memory delivery retry, absent outbox/test
  sink/request-ID lookup/Telegram cleanup; frontend wrong-case and upload-ID
  collision repros; focused 63/63. Three Codex reviews converged on NO-GO.
  Kimi/Sonnet and one Opus review upheld it; GLM returned provider 429 twice and
  was not replaced; Fable was not used without a deadlock.
- Unverified: versioned backend lineage, atomic order+event+outbox, explicit
  idempotency retention/version, isolated synthetic sink, exact lookup/cleanup,
  durable delivery cardinality and external marker remain unimplemented.
- Risks/rollback: no production submit, OAuth, payment, upload, analytics-consent,
  client-data access or deletion is authorized. Stop on missing authority,
  secrets/client material in evidence, non-isolated delivery, ambiguous cleanup,
  multiple matches, canonical drift or any P0/P1. Documentation rollback is an
  exact revert of this workstream; no runtime mutation should exist to undo.
- Next: validate and integrate this read-only receipt. Then open a narrow
  fail-open claim-continuity workstream where exchange ID 202 opens 202 from
  `[101,202]`; after that, import the backend from an exact source allowlist and
  add a failing atomic order+created-event+outbox test. No production submit.
