# Workstream handoff

- Branch: `codex/out-002-cabinet-priority-truth`
- Outcomes: `OUT-002`
- Goal: make the cabinet priority sheet name only a real client action; a quiet
  or paused order with deadline urgency alone must never become a false “new
  master message”, while payment, price, review, files and unread states retain
  their approved priority order and destination.
- Acceptance: extract a deterministic priority/action resolver; table-driven
  cases cover paused/quiet urgent, unread, new files, priced, check, prepay and
  ready-for-payment states; score zero returns no action card so the existing
  calm state renders; composition, mobile/dark and routes remain unchanged.
- Proof: failing-first behavioral resolver cases, focused account tests, full
  `node --test tests/*.test.js`, syntax/cache parity, `brain:test`,
  `brain:validate`, strict conflict scan and independent read-only reviews.
- Changed: executable failing-first priority matrix; pure action resolver with
  lexicographic class/deadline ordering; explicit kind renderer; positive-only
  new-event counters; neutral paused-safe calm copy; dedicated cabinet cache key;
  plan and evidence `E-1004`.
- Brain debt `UXD-0004` records the exact unproven payment-summary contradiction
  and masking risk for `OUT-004`; no speculative payment behavior was added.
- Verified so far: focused 9/9; expanded account/security/release 128/128;
  full repository 454/454; Brain unit 39/39 and strict validation;
  syntax/diff checks; local synthetic 390 px light/dark walkthrough with one
  44 px CTA, no overflow, correct `secDecide` route/focus and zero browser
  warnings/errors. Temporary HTTP server stopped.
- Final gates: post-council full repository 454/454, Brain 39/39,
  `VALID records=45 links=35 manifests=4`; conflict hard=0, warning=1 dormant
  unmanaged refs, info=4, explicit snapshot `2f02e30a...` accepted. Exactly one
  HTML consumer of `cabinet.js` exists and carries the new key.
- Unverified: clean result commit and lifecycle freeze only; no production
  account, auth flow, API mutation or deploy is authorized.
- Risks/rollback: changing ranking can hide a real payment/review/file/message
  action or redirect its CTA. Preserve the approved markup and compare every
  state in a pure resolver test. Rollback is an exact commit revert.
- Council: Kimi/Sonnet/GLM and the one reserved Opus review all approve; no
  P0/P1. Kimi's overdue same-class test was added. Fable remained connectivity-
  only because there was no deadlock.
- Next: rerun exact final gates, commit the implementation/evidence, freeze the
  verified result SHA and submit for canonical integration.
