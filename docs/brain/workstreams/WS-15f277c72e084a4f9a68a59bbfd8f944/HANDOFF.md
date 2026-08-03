# Workstream handoff

- Branch: `codex/out-007-search-catalog-clarity`
- Outcomes: `OUT-007`
- Goal: close release101 global-search presentation and catalogue-findability
  P1s through the three atomic gates frozen in `E-1009`, without changing the
  default catalogue IA or protected OUT-005 inventory/handoff contracts.
- Acceptance: (1) header/dock occlusion and home 390 result/chip geometry green
  at 360/390/768/1024/1440 light/dark; (2) corrected search presentation moves
  to shared chrome with no property-value drift and passes representative
  template/cascade/cache parity; (3) one global text input, aliases/ranking,
  visible + `aria-live` count and zero state pass the frozen fresh/saved query
  matrix while 12/9/22/13, routes/prices/schema/canonical/no-JS remain exact.
- Proof: failing-first `tests/search-catalog-clarity.test.js`, focused
  search/catalogue/shell/cache suites, full product regression, JS syntax,
  reproducible home bundle, `git diff --check`, Brain 39/39 + strict validation,
  exact browser matrix and two independent final reviews. Production remains a
  separate G10 release with healthcheck, smoke and rollback.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: shared chrome touches every template and long-lived asset
  caches; a home-only source can leak generic selectors into cabinet/service
  pages. Stop on protected-contract drift, 360 body overflow, focus/no-JS
  regression, property-value mutation in the pure-move commit or cache mismatch.
  Keep geometry, shared move and findability in separate revertable commits.
- Next: commit this Brain-generated declaration, run strict conflict detection,
  then create the failing-first gate before product edits.
