# Workstream handoff

- Branch: `codex/out-006-conversion-package-v1`
- Outcomes: `OUT-006`
- Goal: add a bounded conversion package to the existing configurator: one
  contextual source-backed proof, three optional quote scopes and a consistent
  14-day credit for eligible written diagnostics, without adding a competing
  primary action or changing the order API.
- Acceptance: after situation and work selection the recommendation explains
  one first result and exposes exactly three non-blocking quote-scope choices;
  the selected scope survives the local draft and appears in the human-readable
  request details; diagnostic plan/review routes state the same one-time credit
  boundary; contextual proof links to an existing published source message;
  the final screen still has one primary submit, no new required field, no new
  analytics event or PII, and 390/1024 light/dark have no overflow, occlusion,
  console error or target below 44 px in the changed control.
- Proof: failing-first `tests/configurator-conversion-package.test.js`, focused
  Node tests, full `node --test tests/*.test.js`, `npm run build`,
  `brain:test`, `brain:validate`, exact browser scenarios at 390 and 1024,
  plus `git diff --check` and independent council reviews.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: extra choice may compete with the recommended first step;
  mitigation is a default selection, no validation gate and unchanged primary
  CTA. Extended scopes remain requests for a quote, never a displayed total or
  work authorization. Credit language is limited to eligible diagnostics and
  is repeated in the saved request for manual specification. Rollback is the
  implementation commit revert; no backend, payment, consent or production
  data mutation is in scope.
- Next: review and commit the manifest plus this handoff.
