# Workstream handoff

- Branch: `codex/out-004-case-context-truth`
- Outcomes: `OUT-004`
- Goal: prove and, only if reachable, remove the context contradiction where the
  cabinet priority can demand payment while the opened payment/final/part state
  says zero due or payment claimed; messages, files and money must agree on the
  same active case and never mask the real next client action.
- Acceptance: define one summary/detail action contract for `prepay`, ready part,
  ready final, `due_now`, `claimed`, files and unread; reproduce reachability from
  checked-in fixtures/runtime before changing behavior; priority, case bands and
  destination agree; unavailable evidence fails closed without redesign.
- Proof: failing-first pure matrix plus literal renderer checks, account/case/full
  tests, one local synthetic desktop/mobile light/dark walkthrough, Brain gates,
  exact consumer/cache check, fresh conflict scan and independent reviews.
- Changed: declaration only; implementation has not started. Three independent
  read-only audits reproduced cross-surface contradictions, a stale live-list
  fingerprint, a false prepay test invariant and dark CTA contrast of 4.19:1.
  Scope revision 2 adds only the existing overview test and account CSS token
  required to close those gates; root remains the sole write-owner.
- Unverified: production reachability and exact `/orders` schema remain unknown;
  the implementation must therefore use only explicit positive due/claimed
  evidence and fail closed for absent amounts. No production account, API
  mutation, payment action, OAuth or deploy is allowed.
- Risks/rollback: an inferred guard could hide a real bill, while leaving the
  contradiction could permanently mask price/review/files/message. Stop if the
  server lifecycle cannot be derived from repository evidence. Any future code
  rollback is an exact commit revert; no schema or production data is in scope.
- Next: commit scope revision 2, rerun conflict analysis, record the audited
  contract and then prove the current contradictions with a failing-first literal
  matrix before any runtime change.
