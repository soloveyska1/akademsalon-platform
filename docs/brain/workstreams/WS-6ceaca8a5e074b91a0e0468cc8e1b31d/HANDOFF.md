# Workstream handoff

- Branch: `codex/out-006-owner-launcher-layout-v1`
- Outcomes: `OUT-006`
- Goal: remove the owner-preview launcher's overlap with the configurator step rail without changing prices, deposits, promo eligibility or redemption.
- Acceptance: on desktop the launcher participates in the sidebar flow between the step list and help block; it does not intersect either at 1128×804 or 1440×900. On widths up to 920px it remains reachable as a compact floating control above the mobile action area. Explicit click remains the only way to open the non-redeemable owner preview.
- Proof: failing-first `tests/new-user-promo.test.js`; focused and full Node suites; desktop light/dark and mobile browser geometry checks; build; two independent UX reviews; production health/smoke plus rollback-forward proof recorded as `E-1045` / `REL-0181`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: risk is hiding the owner-only control during responsive reflow or crowding the help block on short screens. Rollback restores the prior immutable static release; no database or price state is mutated.
- Next: review and commit the manifest plus this handoff.
