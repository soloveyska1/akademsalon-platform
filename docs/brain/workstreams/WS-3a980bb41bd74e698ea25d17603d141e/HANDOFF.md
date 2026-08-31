# Workstream handoff

- Branch: `codex/out-006-psychology-vip-v3`
- Outcomes: `OUT-006`
- Goal: make the psychology VКР route sell and carry one bounded full-project
  package at exactly 91,000 RUB without changing deposits, global pricing or
  the existing promotion ceiling.
- Acceptance: four distinct visible levels and one CTA; the 91,000 RUB route
  keeps one exact price through configurator, cart request and admin
  specification; A2 participation is explicit; clinical/research materials are
  gated by de-identification; scope, exclusions, three feedback cycles and the
  30/40/30 plan remain structured; mobile/light/dark and public regressions pass.
- Proof: public Node 645/645, deterministic build, strict Brain validation,
  syntax and diff checks; real Chromium at desktop and 390 px in light/dark;
  intercepted POST proves 91,000/91,000, `psychology_full_vip`, A2 confirmed,
  7 inclusions, 5 exclusions and 27,300/36,400/27,300; two independent final
  reviews return GO with P0=0/P1=0. Evidence target `E-1043`, release target
  `REL-0179`.
- Changed: rebuilt the psychology landing as a four-level route with an
  empirical passport and truthful SEO; added the scoped VIP service and a
  cache-safe fallback; added a de-identification gate and exact project
  questions; materialized direct VIP submit into the cart; carried bounded
  scope, A2, fixed price and stage allocations into the admin specification;
  defaulted the incoming VIP order to three payments. Deposits are unchanged.
- Production: immutable `release179-0bfa0ee` is live; `current` and `dist` point
  to release179 and `previous` to release178. Exact local/filesystem/public
  hashes match. Public route, configurator, admin and health smoke are green.
  Private Sites version 41 also deployed successfully.
- Rollback: an actual pointer rollback to release178 and forward restore to
  release179 both passed. No backend or database restore is required.
- Post-release health: Nginx syntax valid, bot active with `NRestarts=0`, SQLite
  WAL and `quick_check=ok`, zero lock/busy/traceback/CRITICAL journal matches.
- Council: external Kimi/Sonnet/GLM review was attempted after deterministic
  checks but providers returned 503, expired OAuth and 429 respectively; no
  provider result is counted as evidence.
- Evidence: `docs/brain/evidence/E-1043.md`; release
  `docs/brain/releases/REL-0179.md`.
- Next: measure qualified VIP selections, submitted specifications, accepted
  quotes and realised margin before changing the price or scope.
