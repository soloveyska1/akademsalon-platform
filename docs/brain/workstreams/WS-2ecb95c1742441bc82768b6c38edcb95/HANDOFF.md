# Workstream handoff

- Branch: `codex/out-008-september-entry`
- Outcomes: `OUT-008`
- Goal: remove the measured first-visit performance regression and make the
  configurator's next-step promise accurate on narrow mobile routes, without
  changing prices, promo economics, eligibility or submission contracts.
- Acceptance: the welcome artwork is at most 50 KiB with the existing PNG as
  fallback; eligible mobile Lighthouse no longer has poor LCP caused by the
  artwork; ineligible visitors do not download it; `/zayavka.html` and the
  configurator consistently describe three steps and the exact response window;
  existing promo, journey and mobile gates stay green.
- Proof: failing-first Node contracts, focused promo/configurator tests, full
  `node --test tests/*.test.js`, Chromium/WebKit mobile matrix, eligible and
  ineligible Lighthouse comparison, Brain validation and `E-1033`.
- Changed: manifest and this preregistered handoff only.
- Unverified: implementation, production parity and external smoke have not
  started. Contract/runtime deposit and referral mismatches found by the
  independent release audit remain a separate hard September release veto.
- Risks/rollback: cache-key mistakes can strand an old script; copy can promise
  an unsupported SLA. Rollback is one exact static release pointer to the prior
  immutable release; no backend or database mutation is in scope.
- Next: commit the manifest and handoff, resolve Brain conflicts, then add the
  failing contracts before implementation.
