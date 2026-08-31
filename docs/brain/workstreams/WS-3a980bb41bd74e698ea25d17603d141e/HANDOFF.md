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
- Unverified: production publication, external health/readback, exact live
  hashes and executed rollback-forward.
- Risks/rollback: shared app/cart/admin/search assets are cache-busted at their
  direct consumers. Static rollback is the prior immutable release; no backend
  or database rollback is required.
- Council: external Kimi/Sonnet/GLM review was attempted after deterministic
  checks but providers returned 503, expired OAuth and 429 respectively; no
  provider result is counted as evidence.
- Next: commit the verified implementation, submit/integrate the workstream,
  publish immutable REL-0179, execute static rollback-forward and record exact
  production proof.
