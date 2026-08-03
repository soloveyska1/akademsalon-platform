# Current handoff

## Canonical and production truth

- Canonical integration ref is exact
  `e2f76c3d71c82169f52e3c94874424e150cc54d3`; it contains the verified OUT-007
  search/catalogue result.
- Production is `release102-e2f76c3d71c8`, exact canonical source `e2f76c3`.
  `current` and compatibility `dist` resolve there. `REL-0102` proves 339-file
  publication, 14/14 smoke from two vantage points and executed release101
  rollback/forward restore.
- Release102 is published but is not G10 GO: its final browser audit reproduced
  a P1 missing pointer-search trigger at 921–1240 px on home, services and
  dashboard. Release101 shares the same gap.
- Verified release103 product candidate is exact
  `e97a66afa6765dc8e414e52de34c64faf425819f` on
  `codex/release103-search-trigger-v2`; integration and its own G10 rollout are
  next.

## What release102 proves

- Shared search presentation, deterministic aliases/ranking, stable blank,
  positive and zero states, and the protected catalogue inventory are live.
- Product regression was 500/500 and Brain 39/39. The public payload is 337
  exact files plus `.indexnow-key` and the growth notebook, 339 total.
- Backup is
  `pre-release102-e2f76c3d71c8-20260803T062310Z.tar.gz`, SHA-256
  `5eba3e7da2df9acdef692b6d7c3c6ef2ed72d90c979c9dfe52ba02111cc7c7ca`.
- Rollback selected release101 hash
  `48ed111f36b871f81ad0d890f75bd095294ed161a4db84539992a6251c4dbf3b`;
  forward restore returned release102 catalogue hash
  `a18030aad81f2afada2730c705d91aa8fc6b55273e324547469faf73844eb7cc`.

## Verified release103 candidate

- One late shared-CSS rule restores the 44×44 desktop search trigger from 920
  through 1240 px. The mobile parent remains hidden at 920, closing the
  fractional seam without exposing two controls.
- Only shared chrome CSS, deterministic home CSS and 90 CSS-cache consumers
  change. Production JS and catalogue CSS/JS remain byte-identical.
- Failure-first lineage, 56/56 focused, 501/501 full, 39/39 Brain, exact cache
  closure and a 42/42 WebKit matrix are green. Three independent Codex reviews
  return P0=0/P1=0. Exact evidence and rollback discriminators are carried by
  the release103 product workstream until integration.

## Remaining limits

- `/api/visit` backend IP handling, dedupe, idempotency, retention and aggregate
  readback remain unknown. New `first_step_*` production milestones remain
  forbidden until authoritative server evidence.
- `OUT-001` still needs authoritative backend/bot marker, lookup and cleanup;
  no production submit was attempted.
- Emergency rollback from release103 to release102 intentionally reopens the
  known pointer-search P1; forward restore must close it again.
- Inactive `.release102-e2f76c3d71c8.staging` contains Apple `._` sidecars. It
  is not live and is not to be deleted without an explicit cleanup plan.

## Model and operations boundary

Council doctor has Kimi, Sonnet, GLM, Opus and Fable ready; local LLM remains
disabled. Daily council and Opus are advisory. Fable's systemic requirement is
an atomic server-side switch with automatic rollback; do not call it again
without a genuine deadlock. SSH/VPS commands must bind to `en0` and use the
configured key; no watcher, Docker or persistent local service is allowed.

## One exact next step

Integrate the honest release102 receipt and close its workstream, integrate
exact release103 product result after fresh fetch/conflict gates, then create a
new release103 `production:deploy` workstream. Declare GO only after exact stage
hashes, live 14/14 smoke, production browser proof and an executed rollback to
release102 followed by verified forward restore.
