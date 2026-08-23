# Workstream handoff

- Branch: `codex/out-009-practice-back-parity`
- Outcomes: `OUT-008`
- Goal: preserve the exact 2,500 / 8,000 / 14,000 RUB practice scope in the
  fixed mobile dock after history restoration, including when an unrelated
  saved configurator draft exists, without changing prices, layout, backend or
  analytics.
- Acceptance: a saved draft still keeps the initial mobile action as
  `Черновик`; an explicit diagnostic/editing/support choice still replaces it;
  support -> fictional specification -> Browser Back restores the support
  radio, visible 14,000 RUB status, both page links and the mobile dock to the
  same allowlisted `result=support&route=service`; repeated activation remains
  idempotent and emits no duplicate live-region announcement; 360/390 mobile
  and 1440 desktop have no new overflow, clipping or primary-action regression.
- Proof: failing-first executable history-restoration contract; focused and
  full public tests; Brain tests/strict validation; real Chromium with saved
  state, pointer, Space, specification navigation and Back; independent P0/P1
  review before a new production release attempt.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: treating every initial state as explicit could steal the
  existing saved-draft action, while treating every `pageshow` as initial
  recreates the stale 8,000 RUB route. The implementation must distinguish the
  HTML default from a history-restored checked radio. Rollback is the single
  bounded implementation commit; production remains on verified release162
  until the fix passes the release gate.
- Next: review and commit the manifest plus this handoff.
