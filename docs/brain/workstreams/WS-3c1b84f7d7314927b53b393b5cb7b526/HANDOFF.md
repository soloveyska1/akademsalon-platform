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
