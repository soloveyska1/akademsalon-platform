# Workstream handoff

- Branch: `codex/out-005-services-choice`
- Outcome: `OUT-005`
- Base: `96156040130c874519d1cd4f6335173a774d7847`
- Workstream: `WS-9f644e92a3a04eb280a49d550b0ae513`, integrated revision 9.
- Frozen result: `db93a45a385521600fbe1a5121334c413ebdbfa4`.
- Implementation head: `b2bd17b0538d88bbd68f041f4e3f0437052c2533`.
- Write owner: `codex-root`; three independent reviewers were read-only.
- Plan: `docs/brain/plans/OUT-005-SERVICES-CHOICE.md`.
- Evidence: `E-1007`.

## Goal and result

The four situation choices remain the first IA, now as “select one → one
explicit continuation”. Saved progress owns the sole primary until the user
explicitly starts a new choice. Incoming intent is never written over the saved
draft before continue/replace. Detail CTA routes are explicit and price/copy
truth is deterministic across the physical catalogue and configurator.

## Changed

- `services.html` plus `polish15-catalog.js/css`: one fresh/saved/selected
  primary per viewport, local desktop-header suppression, mobile dock state,
  readable 9 px stage floor, discipline-aware search and AA action colors.
- `configurator.html`: deferred service/work route conflict, focus/history,
  clean replace, precise discipline profiles and exact client/local-cart versus
  legacy API transport boundary.
- Twenty-two service/detail routes no longer use the stale pre-navigation
  `data-type` mutator. Referat and practice-rework copy/routes were reconciled.
- `app.js` and rebuilt home runtime carry the exact route/price profiles and
  compatible bot/API mapping. All shared consumers use one atomic cache wave.
- Contract coverage grew from the committed 1/8 failing-first baseline to
  focused 73/73 and full 482/482 green.

## Verified

- Independent inventory review: P0=0, P1=0; exact 12 hub cards, 9 discipline
  links, 22 detail pages, ItemList 13, explicit routes, copy/price and cache
  invariants pass.
- Independent UX review: fresh/saved mobile and 1024 desktop have one primary;
  overflow 0; selected continuation hit-test passes; 768 px label is 9 px;
  dark/focus and hidden legacy controls pass.
- Independent final runtime QA: P0=0, P1=0, P2=0. Course draft preservation,
  practice continue/replace, all nine discipline prices, psychology local cart
  11,000–15,500 ₽, `/orders` top/nested transport `law`, and quote-email exact
  client-profile round-trip pass.
- `node --test tests/*.test.js`: 482/482, no fail/skip/todo.
- `node --check assets/js/app.js`, `node --check assets/js/polish15-catalog.js`,
  `git diff --check`: pass.
- Brain: 39/39; strict validation `records=51 links=63 manifests=7`.
- Home runtime SHA-256:
  `3ca97d23193586c8fa3a8ac7b7714f6dc2dcfd4cdb36ee6bcabe00437891168e`.

## Integration and external boundary

- No production deploy, submit, OAuth, client-data access or deletion occurred.
  Production remains release99 exact canonical `9615604`.
- Brain submitted→integrated lifecycle is complete: exact result `db93a45` is an
  ancestor of fresh canonical and terminal revision 9 is commit `581e759`.
- `OUT-001` downstream API→bot/operator→cabinet proof still lacks authoritative
  backend/bot source and safe marker/lookup/cleanup.
- Brain process inspection still sees older foreign Playwright groups and Codex
  kernels; reviewer-owned sessions/servers were stopped, foreign processes were
  not killed.

## Stop and rollback

Stop on physical URL/schema/sitemap/price drift, unsupported route state,
focus/history loss, contrast <4.5, target <44 px, cache divergence, hard
conflict or any production mutation. Roll back OUT-005 by reverting the exact
implementation commits in reverse order; release99 rollback remains the already
exercised switch to `release98-c30dbd4924b5`.

## One next step

Create a separate release workstream from fresh canonical. Do not claim OUT-005
in production until publish, health, read-only smoke and rollback/forward are
recorded in a new release evidence file.
