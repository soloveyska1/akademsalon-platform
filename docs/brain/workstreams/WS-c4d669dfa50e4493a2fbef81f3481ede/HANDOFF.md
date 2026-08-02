# Workstream handoff

- Branch: `codex/out-003-shared-shell-contract`
- Outcome: `OUT-003`
- Base: `65adc47cf31ffaa3ba9a797204d938ef866f0e14`
- Implementation: `7e6f33a6088888ccf49dbbd81cb2a8f68c9cecc2`
- Write owner: `codex-root`; three reviewers remained read-only.

## Changed

- Added an executable route/state shell contract and failing-first proof.
- Restored early saved-theme bootstrap on five routes.
- Added the persistent consent settings path and missing ordinary-route runtime;
  consent preferences now inert and restore all background siblings plus exact
  opener focus.
- Removed the duplicate public shortcut owner from admin.
- Migrated normal-text dark CTA/badges to the existing accessible wax token.
- Rebuilt the home CSS/JS bundles and moved every managed consumer to atomic key
  `20260803out003shell1`.
- Updated `UXD-0003`, roadmap/current handoff, plan and `E-1006`.

## Verified

- Failing-first `c8fd314`: 2/7 pass, 5/7 fail.
- Final focused family 78/78; full repository 472/472; JS syntax pass.
- Home rebuild byte-stable; `git diff --check` pass.
- Brain unit suite 39/39; strict validation green.
- Browser spine exact at 360/390/768/1024/1440; overflow 0, mobile footer 44 px,
  AA contrast, preserved dark theme, single menu/search dialogs with exact focus
  return, fully inert consent background and empty final console log.
- Conflict scan hard=0; one dormant-ref overlap warning accepted by the
  integration owner. Fresh fetch and re-scan are required before integration.

## Not verified / boundary

- No live OAuth/auth mutation, production submit, downstream delivery, deploy,
  customer data or deletion.
- Reduced motion and guest/auth shell states are source-contract proof rather
  than live-auth browser evidence.
- OUT-001 still needs authoritative backend/bot contract plus safe
  marker/lookup/cleanup.

## Rollback

Revert implementation commit
`7e6f33a6088888ccf49dbbd81cb2a8f68c9cecc2` as one unit; it contains runtime,
generated bundles, consumers and matching tests. No external rollback exists.

## One next step

Finish the submitted→integrated manifest lifecycle on freshly fetched canonical,
then start `OUT-005` from that exact terminal SHA with read-only services choice,
context-handoff, SEO and mobile baseline proof.
