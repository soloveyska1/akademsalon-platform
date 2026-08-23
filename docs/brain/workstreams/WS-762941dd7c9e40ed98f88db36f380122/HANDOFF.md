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
- Proof: the new executable contract failed 7/8 on the stale saved-draft marker
  before implementation and passes 8/8 after it. Related practice/cart/
  configurator/analytics tests pass 64/64; the full public suite passes 592/592;
  Brain passes 39/39 and strict validation reports 84 records / 155 links / 37
  manifests. Real Chromium at 360 px proved: initial saved draft remains
  `Черновик`; explicit support produces the exact 14,000 RUB status and service
  route without changing stored draft; support -> fictional specification ->
  Back returns checked support, visible passport, support dock href/aria and
  zero overflow; repeated support activation creates zero live-region writes.
  At 390 light/dark the label is 48/48 px with zero overflow; at 1440 light/dark
  the mobile nav has a zero rect and desktop overflow is zero. Two independent
  read-only reviews of exact implementation `89ddeed5744c428a09d0096b1b37621538a3ff72`
  (commercial and skeptical-buyer) both report GO with P0=0/P1=0/P2=0 and
  reproduce the saved-draft Back path in isolated Chromium. Two public-client
  builds are byte-identical: 353 files / 25,041,362 bytes, digest
  `7915d08510de3e24eee8dd95bd49818dc8b52e73619245c10d65148bb789be97`,
  page SHA-256
  `3292958b15940636f012a51c4c3d0c6cf4e5d610f6f7e3a5c7936e6b4be4585b`.
- Changed: `syncChoice()` now treats a checked radio whose current checked
  state differs from its HTML `defaultChecked` state as history-restored and
  passes that state through the same explicit, allowlisted dock-sync path. The
  initial HTML-default editing choice still preserves `data-resume-draft`.
  The focused VM contract captures the real `pageshow` callback and locks the
  restored-support behavior in addition to pointer, Space and announcement
  idempotence.
- Unverified: canonical integration and a replacement production release have
  not run. No conversion uplift is inferred.
- Risks/rollback: treating every initial state as explicit could steal the
  existing saved-draft action, while treating every `pageshow` as initial
  recreates the stale 8,000 RUB route. The implementation must distinguish the
  HTML default from a history-restored checked radio. Rollback is the single
  bounded implementation commit; production remains on verified release162
  until the fix passes the release gate.
- Next: freeze the verified result as submitted, fetch canonical truth, rerun
  conflict gates and integrate; publication belongs to a new release workstream.
