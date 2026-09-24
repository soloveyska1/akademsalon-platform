# Workstream handoff

- Branch: `codex/salon-reading-v2-20260924`; base `55bb28fd9561dfece859beede0969e3c735ce80c`.
- Outcome: OUT-003; sole write-owner root.
- Goal: implement all eight approved conveniences: typo/alias search with highlighting and suggestions; focus reading; mobile contents sheet; curated example copy; expanded tables; native share of exact guide sections/PDF pages; restrained page transitions; brand empty/404 illustrations.
- Design: retain existing Golos/Literata and page tokens, paper/ink/violet/mint roles. Signature: small folded-paper/annotation drawings in empty states. Controls use compact existing tool rows; native dialogs for isolated tasks. No header/main CTA redesign.
- Acceptance: exact release222 baseline preserved outside bounded overlay; all eight work in real browser; keyboard/Escape/focus and original reading position restored; no clipped controls at 360/390/768/1024/1440 light/dark; reduced-motion and calm suppress animation; direct share URLs only allowlisted public paths/IDs/pages, no query/private text; denied clipboard/native share gracefully degrades; no new storage/telemetry/order mutations.
- Proof: pinned inventory/build; targeted hermetic Chrome scenarios, prior ease/return/intake regression, route sweep, Node suite and Brain checks; two independent read-only reviews; live hashes/health/GET-only browser smoke; executed static rollback-forward.
- Changed: none yet.
- Unverified: implementation, browser, release.
- Risks/rollback: shared public search and PDF lifecycle; use current immutable release222-ease-fa5ea915 as static rollback, preserve compatibility dist release203. Backend, DB, prices, order/auth/analytics/service-worker bytes remain outside scope.
- Next: commit manifest/handoff and review strict conflict scan before editing.

- Bootstrap v1 was abandoned before implementation because a mutable read dependency on CURRENT-HANDOFF intersected another dirty worktree. This workstream uses the fixed canonical snapshot and immutable release222 runtime, not that mutable file.
