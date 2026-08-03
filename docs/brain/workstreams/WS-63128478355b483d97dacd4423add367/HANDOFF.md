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
- Changed: declaration only. Root is the sole write-owner; reviewers remain
  read-only. Production remains release103.
- Unverified: authoritative backend/bot source, database uniqueness/TTL,
  outbox/notification behavior, isolated test identity/channel, lookup and exact
  cleanup are not yet proven.
- Risks/rollback: no production submit, OAuth, payment, upload, analytics-consent,
  client-data access or deletion is authorized. Stop on missing authority,
  secrets/client material in evidence, non-isolated delivery, ambiguous cleanup,
  multiple matches, canonical drift or any P0/P1. Documentation rollback is an
  exact revert of this workstream; no runtime mutation should exist to undo.
- Next: commit only the manifest and this handoff, pass fresh strict conflict
  gates, then run three independent read-only audits before writing the plan.
