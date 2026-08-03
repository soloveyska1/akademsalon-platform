# Workstream handoff

- Branch: `codex/release103-production`
- Outcomes: `OUT-007`
- Goal: publish exact fresh canonical
  `74b6e0937277ddf0afcd433da9a22f973c7a7d26` as immutable
  `release103-74b6e0937277`, closing the live release102 pointer-search P1
  without form, OAuth, payment, analytics-consent or client-data mutation.
- Product source: frozen release103 result
  `8ed1cd5c4f463fbf3a3010c9dd6fd5437d335b79`; shared CSS
  `89dbf8de…46ce`, home CSS `0d463049…5cde`, index `c3f7709b…9104`.
- Artifact contract: two identical public builds; exact deploy selection 337
  files / 24,020,193 bytes / manifest SHA-256
  `16bc13c667fa6212bb9ba26f86ff0e43dad322cefd5232a2a48c547c6a25124b`;
  preserve exact `.indexnow-key` and growth notebook for 339 live files.
- Acceptance: current/dist both resolve to release103; staged/live path and
  hashes exact; ownership `www-data`, directory 755 and file 644; external
  en0-bound and VPS GET/HEAD smoke 14/14; production browser verifies the
  complete 42-state boundary matrix plus out-of-spine consumers; executed
  rollback to release102 and forward restore to release103 both pass exact
  CSS/HTML hashes, health and final smoke; P0=0/P1=0.
- Switch: one server-side script changes compatibility `dist` first and Nginx
  `current` last. An armed ERR/INT/TERM trap restores release102 until every
  post-switch and rollback/forward gate is green.
- Stop conditions: non-clean/noncanonical source, test/Brain red, artifact
  count/bytes/digest mismatch, non-release102 baseline, baseline smoke red,
  backup failure, existing stage/final path, missing server extras, ownership or
  mode mismatch, red live health/browser/smoke, unbound network route or P0/P1.
- Rollback: `release102-e2f76c3d71c8`. It is operationally safe but temporarily
  reopens the known pointer-search P1; forward restore must close it again.
- Boundaries: no submit, OAuth, payment, upload, analytics-consent, client data,
  deletion, local LLM, Docker, watcher or persistent service. The inactive
  release102 sidecar staging tree remains untouched.
- Changed: declaration only; production remains release102.
- Next: commit manifest/handoff, pass strict conflicts, rebuild and verify the
  exact artifact, then perform preflight, backup, inactive stage, atomic switch,
  two-vantage/browser proof and executed rollback/forward.
