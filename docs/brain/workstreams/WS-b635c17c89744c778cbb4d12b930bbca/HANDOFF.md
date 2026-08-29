# Workstream handoff

- Branch: `codex/out-008-case-bridge-320-v1`
- Outcomes: `OUT-008`
- Goal: remove the reproducible 320 px clipping of the shared case-bridge stages with a bounded sub-360 px layout, without changing copy, routes, analytics, economics or approved geometry at wider viewports.
- Acceptance: at 320 px the bridge, stage grid and all four stage cells remain inside the 16 px content bounds with body/root overflow <=1 px; all labels remain whole and readable; current `aria-current=step`, self action and route semantics remain exact. At 360/390/768/1024/1440 the existing computed layout remains unchanged. Light/dark, Chromium/WebKit, forced-colors and 200% text zoom remain usable.
- Proof: failing-first source contract; real browser baseline and post-fix geometry on representative shared-component routes; full public/backend/Brain regression; atomic cache wave over every `chrome.css` consumer; two independent UX/accessibility reviews; production GET/hash smoke and executed static rollback-forward in `E-1041` and `REL-0177`.
- Changed: closed stale reservation `WS-726d9df023f744aea194ced800dd28a3` through the Brain lifecycle command after proving its 2026-08-06 result is already an ancestor of canonical and no process owns its old worktree. The exact terminal manifest path was added to this workstream scope; no product file is changed yet.
- Unverified: implementation not started; strict conflict scan still reports repository-wide terminal-worktree/unmanaged-ref warnings, which require an explicit integration-owner waiver after all hard conflicts are removed.
- Risks/rollback: a broad shared-CSS cache wave could drift unrelated HTML, or the compact layout could introduce border/reading-order regressions. Limit the semantic CSS change to one sub-360 px media block, update only the asset query in consumers, and verify non-bridge files mechanically. Rollback is the previous immutable static release; backend/database are outside scope.
- Next: commit the scoped stale-reservation cleanup, prove a failing source contract, then implement the bounded CSS/cache-wave change.
