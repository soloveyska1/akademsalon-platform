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
- Changed: none yet.
- Unverified: implementation and runtime browser walkthrough not started; no
  production account, auth flow, API mutation or deploy is authorized.
- Risks/rollback: changing ranking can hide a real payment/review/file/message
  action or redirect its CTA. Preserve the approved markup and compare every
  state in a pure resolver test. Rollback is an exact commit revert.
- Next: commit this declaration, run strict conflicts, then freeze the current
  false-message repro before any implementation.
