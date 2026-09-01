# Workstream handoff

- Branch: `codex/out-006-owner-launcher-layout-v1`
- Outcomes: `OUT-006`
- Goal: remove the owner-preview launcher's overlap with the configurator step rail without changing prices, deposits, promo eligibility or redemption.
- Acceptance: on desktop the launcher participates in the sidebar flow between the step list and help block; it does not intersect either at 1128×804 or 1440×900. On widths up to 920px it remains reachable as a compact floating control above the mobile action area. Explicit click remains the only way to open the non-redeemable owner preview.
- Proof: failing-first `tests/new-user-promo.test.js`; 651/651 full Node suite; Chromium/WebKit geometry and focus at ten viewports plus live resize; build, Brain validation and diff check. Candidate evidence is recorded in `E-1045` and `REL-0181`; production evidence remains explicitly pending.
- Changed: `promo-campaign.js` now reparents one owner launcher between sidebar flow and a <=920px floating host while preserving focus; `promo-campaign.css` removes fixed desktop Y positioning and protects the whole mobile/tablet breakpoint; both entry HTML files carry one cache wave; related contracts were updated.
- Unverified: production exact hashes, live owner geometry, health, rollback-forward and private Sites readback have not yet been performed.
- Risks/rollback: risk is hiding the owner-only control during responsive reflow or crowding the help block on short screens. Rollback restores the prior immutable static release; no database or price state is mutated.
- Next: integrate frozen result `007bf7ba`, publish immutable release181, execute rollback-forward, read back production and Sites, then append only observed evidence.
