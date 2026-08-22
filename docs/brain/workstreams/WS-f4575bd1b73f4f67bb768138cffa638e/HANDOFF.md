# Workstream handoff

- Branch: `codex/out-006-quote-scope-measurement-v1`
- Outcomes: `OUT-006`
- Goal: measure which quote scope an eligible configurator visitor sees and
  carries forward, so demand for a first stage, the next milestone or the full
  route can be compared without collecting form text, contacts or files.
- Acceptance: the eligible recommendation emits `quote_scope_seen` at most once
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
- Changed: expanded the Analytics v2 contract with two bounded quote-scope
  progress events; added the consent-gated exact-enum client helper; connected
  first exposure and carried-forward scope in the configurator; pinned the
  backend installer fingerprint; added frontend/backend regression coverage and
  durable `E-1019`. Only the configurator analytics URL received a fresh cache
  key; its DOM, copy and styles did not change.
- Verified: failure-first focused suite; final focused Node 32/32, full Node
  580/580, backend 31/31, Brain 39/39, deterministic build, syntax checks and
  `git diff --check`. Exact 390-light and 1024-dark baseline/current PNGs are
  byte-identical. A local browser route recorded exactly `seen:first` then
  `continue:full`; returning to the first step created no duplicate, preserved
  `full`, kept all three controls and produced 0 console errors/warnings.
- Unverified: no production contract install, asset publish, analytics readback
  or real request submit was performed. Council review endpoints were
  unavailable and their failures are not treated as evidence.
- Risks/rollback: a client-first rollout would make the live backend discard the
  new event names. Any later release must install the expanded contract first,
  then publish the configurator asset wave, and verify readback before claiming
  measurement. Rollback restores both contract and static source together.
- Next: rerun the final Brain/repository gates, commit the implementation, then
  freeze the exact result SHA as `submitted`. A later release owner must deploy
  backend contract first, static asset wave second, and prove live readback and
  rollback before claiming measurement.
