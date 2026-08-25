# Workstream handoff

- Branch: `codex/out-008-september-entry`
- Outcomes: `OUT-008`
- Base: `a84bd0a8bdab431198b1fb1cbd6427be76b7d85a`.
- Implementation: `1ee9533df1d677c34b44c95bf8e13ec9a7cda5e3`.
- Goal: remove first-visit artwork waste, suppress every returning footprint
  and make the configurator's next-step promise accurate on narrow mobile
  routes, without changing prices, promo economics, backend authority or
  submission contracts.
- Acceptance: the welcome artwork is at most 50 KiB with the existing PNG as
  fallback; eligible mobile transfer falls materially without a score or LCP
  regression; ineligible visitors do not download it; `/zayavka.html` and the
  configurator consistently describe three steps and one conditional response
  window; existing promo, journey and mobile gates stay green.
- Proof: failing-first Node contracts, focused promo/configurator tests, full
  `node --test tests/*.test.js`, Chromium/WebKit mobile matrix, eligible and
  ineligible Lighthouse comparison, Brain validation and `E-1033`.
- Changed: versioned 33,652-byte WebP with PNG fallback; fail-closed returning
  eligibility boundary; atomic promo3 cache wave; zero-file/conditional
  response copy; exact three-step empty-application contract; two regression
  suites; `E-1033` and candidate `REL-0171`.
- Verified: public 606/606, Brain 39/39, strict validation, diff check;
  Chromium/WebKit twelve-case eligibility/fallback matrix; 320/390 entry-route
  matrix; twelve cold Lighthouse runs. Eligible median bytes fall 70.2%; score
  and LCP are unchanged. Architecture, economics and UX final exact-result
  reviews are GO P0=0/P1=0. Remaining P2: preserve a reusable browser harness
  and name working hours only after operations confirms the real schedule.
- Unverified: production parity, external smoke and static rollback-forward
  were intentionally not run because the candidate was not published. Full
  September G10 remains blocked by the deposit/referral contract mismatch,
  legal factual confirmations and separate UX debt in `E-1033`.
- Risks/rollback: cache-key mistakes can strand an old script; copy can promise
  an unsupported SLA. Rollback is one exact static release pointer to the prior
  immutable release; no backend or database mutation is in scope.
- Next: keep this candidate submitted and start a separate fail-closed
  deposit/referral safety workstream before any full September production
  release.
