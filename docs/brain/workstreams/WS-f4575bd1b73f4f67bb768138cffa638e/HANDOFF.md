# Workstream handoff

- Branch: `codex/out-006-quote-scope-measurement-v1`
- Outcomes: `OUT-006`
- Goal: measure which quote scope an eligible configurator visitor sees and
  carries forward, so demand for a first stage, the next milestone or the full
  route can be compared without collecting form text, contacts or files.
- Acceptance: the eligible recommendation emits `quote_scope_view` at most once
  per document with the initially visible `first|milestone|full` value, and
  emits `quote_scope_continue` at most once per carried-forward value when the
  visitor advances. Both events are consent-only, use exact
  `cta=configurator` plus the three-value enum, are accepted by Analytics v2,
  remain outside the strict conversion funnel, and cannot contain arbitrary
  text. The configurator alone receives a fresh analytics cache key; every
  label, price, focus transition, step gate and pixel geometry remains
  unchanged. No request, public deployment or production-data read is made.
- Proof: failure-first focused Node/Python contracts, full product/backend/Brain
  suites, deterministic build, exact 390/1024 light/dark browser comparison
  against canonical, `git diff --check`, and durable `E-1019`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: a client-first rollout would make the live backend discard the
  new event names. Any later release must install the expanded contract first,
  then publish the configurator asset wave, and verify readback before claiming
  measurement. Rollback restores both contract and static source together.
- Next: review and commit the manifest plus this handoff.
