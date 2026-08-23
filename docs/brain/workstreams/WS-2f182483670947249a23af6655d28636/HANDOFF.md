# Workstream handoff

- Branch: `codex/out-008-keyboard-action-shelf-v2`
- Base: `f28b3ca79f17bd7bd29ea8eba481edb49c71c5e1` (`origin/main`, release164).
- Outcomes: `OUT-008`
- Goal: keep the existing configurator primary and the focused current-step field reachable while a mobile software keyboard is open, without changing route, scope, price, validation or submit behaviour. Keyboard inset and focus correction stay page-local so the active foreign mobile-shell workstream is untouched.
- Acceptance: at 360x800 and 390x844 in light/dark, the same `#conceptTaskBar` becomes one compact action shelf inside `visualViewport`; active input/textarea/select remains wholly above it; 39 characters keep the existing reason and disabled primary, 40 characters enable it without blur; one tap advances one step; contact focus keeps `Отправить заявку` reachable but no test submits; target is at least 44px, input font at least 16px, root overflow is zero; keyboard close restores the current full bar; 1024/1440 are unchanged; consent precedence remains intact.
- Proof: failing-first static contract plus the actual `tests/mobile-light-smoke.js` journey; Playwright Chromium geometry/hit-test at 360/390; real iOS Simulator software-keyboard screenshots before/after; full public/backend/Brain regression; two independent P0/P1/P2 reviews; production smoke and rollback drill recorded in `E-1025`.
- Changed: none yet.
- Unverified: implementation, Android-equivalent Chromium profile, production and uplift are not yet verified.
- Risks/rollback: iOS may double-apply `visualViewport.offsetTop`; the shelf may cover the caret; a duplicate primary may become visible; a stronger selector may override the consent bar. Roll back the bounded HTML/CSS cache wave if any gate fails.
- Next: commit this manifest and handoff, pass strict conflicts, then add the failing-first contract before implementation.
