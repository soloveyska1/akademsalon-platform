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
- Published: `current` and `dist` resolve to immutable
  `release103-74b6e0937277`; exact live tree is 339 files / 24,025,620 bytes.
- Backup:
  `pre-release103-74b6e0937277-20260803T081311Z.tar.gz`, 19,244,048 bytes,
  SHA-256
  `09bfa1a9f850bd26bc18d38b25f30f94d2f1f07cd3b9cd8c117fee6a86eb06f6`.
- Verified: external en0 and VPS smoke 14/14 before switch and before/after the
  successful rollback drill; live WebKit 48/48 before rollback and 48/48 after
  forward restore; exact CSS/HTML discriminators, cache marker, modes and owner.
- Harness recovery: two earlier attempts auto-rolled back release102 on a
  benign pipefail and then an owned SOCKS port-lifecycle stop. Both were fixed
  without override; the final complete run passed and disarmed rollback only at
  `RELEASE103_GO`.
- Current state: G10 GO, P0=0/P1=0. No submit/OAuth/payment/consent/client-data
  mutation occurred. Exact receipt is `docs/brain/releases/REL-0103.md`.
- Independent audit: live source hashes and GET-only 14/14 semantics; counts,
  bytes, modes, ownership, extras and backup integrity; and the exact release102
  target plus rollback/forward contract were re-derived by three separate
  read-only reviews. All returned P0=0/P1=0. The sole generated `/var/tmp`
  manifest residue was verified and then removed by its exact path.
- Next: validate/commit this receipt, submit and integrate the deploy
  workstream, then collect user feedback.
