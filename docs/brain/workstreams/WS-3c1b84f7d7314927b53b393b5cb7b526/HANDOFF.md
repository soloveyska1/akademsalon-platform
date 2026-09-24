# Workstream handoff

- Branch: `codex/salon-ease-20260924`; owner root; outcome `OUT-003`.
- Base: `42f2baa06fae28fc89940e22e43deb27392a9a67`, fresh origin/main; original checkout has user-owned `.claude/launch.json`, untouched.
- Goal: all eight user-approved public comforts: header search, system theme, remembered reading size/spacing, overflow chip cues, FAQ links, compact assistant preference, PDF loading, cohesive reduced-motion-aware feedback.
- Protected: one primary journey, current palette, confirmed-server success, existing return/resume features, no sensitive persisted strings, no backend/DB/pricing/analytics changes.
- Acceptance: all eight reproducible in Chrome; keyboard/focus, 44px controls, no body overflow at 360/390/768/1024/1440 light/dark; system changes/manual override/storage denial; stable FAQ links; PDF close/reopen/error; old return and intake regressions pass.
- Proof: pinned release221 overlay and inventory; browser assertions/screens, full Node and Brain tests, two independent read-only reviews, exact production bytes, health/smoke and actual rollback/forward.
- Changed: planning manifest only; root is sole writer.
- Unverified: implementation not started; no live mutations.
- Risks/rollback: shared shell/theme and dynamic assistant integration; fail-closed deploy against exact release221 hash inventory, atomic current-pointer rollback; compatibility dist stays untouched.
- Next: commit manifest/handoff, inspect strict conflicts, then captured runtime and implement bounded overlay.

- Integration-owner exception: inspected all 65 warnings, exclusively terminal integrated/abandoned worktrees. Hard conflicts 0; foreign dirty files are disjoint. Accepted this exact snapshot with `--allow-warnings`; rerun before integration.

## Verified implementation before publication

- All eight features implemented as exact release221 overlay; 101 changed paths,
  3 new assets, 524 output files, no deletions. 91 shell pages, 32 FAQ pages, 25 guides.
- Candidate10 inventory and reproducible scripts in own evidence/scope.
- Chrome22/22 functional/visual; routes91; return18/18; form9/9; Node652 pass/9 skips;
  Brain39; strict validation; two independent GO, P0/P1/P2 new open=0.
- Fixed review findings: failed-write persisted-pageshow handling, custom-select
  visible cross-tab labels, finite reader notification, FAQ inset and calm motion.
- Existing hover y2px produced one test artifact; baseline/candidate layout and
  click/validation equivalence independently proven; unmodified suite rerun passes.
- Publication/health/rollback still pending. No backend, DB, analytics/pricing
  or private data change. All browser API requests so far synthetic.
- Next: freeze implementation; byte-identical clean build; atomic release222,
  health/static readback, actual rollback/forward, live browser smoke.

## Publication readback correction

- First attempt release222-ease-b264e4f2 correctly auto-rolled back to release221
  after expertise.html HTTP bytes differed. Existing Nginx sends exact301 to
  the homepage; automatic urllib redirect had hidden this distinction.
- Read-only inventory of all changed HTML found only this known redirect.
  No server rule or UI changed. New verifier forbids automatic redirects,
  requires exact301+Location for expertise and checks target homepage bytes;
  other redirects fail. All staged immutable files still match full manifest.
- Eight deterministic fail-closed contract tests and live baseline GET proof pass.
- Next: freeze readback correction, rebuild identical UI, deploy unique release
  with repeated apply/rollback/forward and live smoke.

## Verified production result

- Live release222-ease-fa5ea915; source fa5ea9156fbd1315cb48412367af5860b059aa6e,
  exact524-file output equals candidate10 full inventory. UI implementation b264e4f2.
- Actual apply→rollback221→forward222 passes health and 106HTTP checks each forward,
  including the explicit existing expertise301; compatibility dist stays release203.
- Real-static Chrome390/1440 light/dark4/4 PASS: all8 changed runtime/CSS hashes,
  search/focus, real settings keyboard, theme, assistant, FAQ, reading, catalog,
  PDF resume and preserved inline intake helper. JS errors0, API writes0.
- Live smoke now scrolls/focuses the select trigger and waits two frames before
  ArrowDown; simultaneous synthetic focus+open previously let its own scroll close
  the existing select popover. No product change for this harness timing artifact.
- Backend/DB/prices/analytics/order payload untouched; no real order/payment/chat.
- All test contexts closed; no server/watcher started. Original dirty launch.json
  remains untouched. Independent scoped P0/P1/P2 open=0; no new unresolved debt.
- Next: freeze verified result, submit manifest, fresh canonical/conflict check,
  integrate and let sequential owner record release222 in CURRENT-HANDOFF.

## Canonical integration owner closeout

- Fresh origin/main and strict conflict gate before integration: hard0, same65
  reviewed terminal-worktree warnings accepted explicitly; no added warnings.
- Verified result3d6228f0 submitted separately, proved ancestor of fresh
  origin/main, then integrated terminal revisionb88df473fcd8bb8b4ce13008f447bf9a14231785.
- Task branch remains parked at its terminal revision. This sequential main
  documentation update records current release222 and preserves release221 history.
- All eight approved features published and verified. No remaining scoped work.
- Exact next step: daily monitor reads the next complete consented measurement
  day against the actual current release; no new feature or conversion claim inferred.
