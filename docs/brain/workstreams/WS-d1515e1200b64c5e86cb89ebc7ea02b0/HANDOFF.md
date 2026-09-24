# Workstream handoff

- Branch: `codex/salon-reading-v2-20260924`; base `55bb28fd9561dfece859beede0969e3c735ce80c`.
- Outcome: OUT-003; sole write-owner root.
- Goal: implement all eight approved conveniences: typo/alias search with highlighting and suggestions; focus reading; mobile contents sheet; curated example copy; expanded tables; native share of exact guide sections/PDF pages; incoming-content reveal; brand empty/404 illustrations.
- Design: retain existing Golos/Literata and page tokens, paper/ink/violet/mint roles. Signature: small folded-paper/annotation drawings in empty states. Controls use compact existing tool rows; native dialogs for isolated tasks. No header/main CTA redesign.
- Acceptance: exact release222 baseline preserved outside bounded overlay; all eight work in real browser; keyboard/Escape/focus and original reading position restored; no clipped controls at 360/390/768/1024/1440 light/dark; reduced-motion and calm suppress animation; direct share URLs only allowlisted public paths/IDs/pages, no query/private text; denied clipboard/native share gracefully degrades; no new storage/telemetry/order mutations.
- Proof: pinned inventory/build; targeted hermetic Chrome scenarios, prior ease/return/intake regression, route sweep, Node suite and Brain checks; two independent read-only reviews; live hashes/health/GET-only browser smoke; executed static rollback-forward.
- Changed: pinned524-file baseline;97-path overlay adds search/reading/share helpers and CSS, expands14 existing examples, preserves protected runtime. Candidate9 verified (526 files).
- Verified locally:21 owner scenarios; independent UI8 viewport/theme cases and safety10 probes;91 public routes; ease22/return18/intake9 regressions; Node652 pass9 existing skips; Brain39; deploy8. Candidate9 shares asset44047cb5 JS and738299ca CSS; two independent GO reviews, no open P0/P1/P2.
- Production verified: current release223-reading-9876e933 from source9876e9336b2c815c1c75e3b2baf6715cf83a3a56. Actual apply/rollback222/forward pass health and exact hashes. Live Chrome4/4 at390/1440 light/dark;10static hashes each, all new paths plus prior features; JSerrors0/APIwrites0. Compatibility dist release203 untouched.
- Unverified limits: physical devices, native Safari, real OS sharing/delivery and conversion uplift. No new debt; independent findings fixed and rechecked.
- Risks/rollback: shared public search and PDF lifecycle; use current immutable release222-ease-fa5ea915 as static rollback, preserve compatibility dist release203. Backend, DB, prices, order/auth/analytics/service-worker bytes remain outside scope.
- Next: submit verified result, integrate canonical, then sequential integration owner records current production in CURRENT-HANDOFF.

- Bootstrap v1 was abandoned before implementation because a mutable read dependency on CURRENT-HANDOFF intersected another dirty worktree. This workstream uses the fixed canonical snapshot and immutable release222 runtime, not that mutable file.
