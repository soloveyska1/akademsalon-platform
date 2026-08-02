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
- Changed: declaration only; implementation has not started.
- Unverified: whether zero-due/claimed ready states are actually present in order
  summaries and whether `due_now` is authoritative without loaded detail. No
  production account, API mutation, payment action, OAuth or deploy is allowed.
- Risks/rollback: an inferred guard could hide a real bill, while leaving the
  contradiction could permanently mask price/review/files/message. Stop if the
  server lifecycle cannot be derived from repository evidence. Any future code
  rollback is an exact commit revert; no schema or production data is in scope.
- Next: commit this declaration, run strict conflict analysis, then let three
  fresh read-only agents independently map behavior, UX and QA before choosing
  whether the next step is code, a contract-only debt refinement or a stop.
