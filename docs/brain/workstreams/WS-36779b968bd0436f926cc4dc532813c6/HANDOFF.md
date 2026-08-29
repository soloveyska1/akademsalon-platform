# Workstream handoff

- Branch: `codex/out-006-analytics-truth-v6`
- Outcomes: `OUT-006`
- Goal: make the consented funnel truthful, exclude authenticated owner and
  release-QA browsers from first-party and vendor business metrics, and make
  slow mobile configurator navigation single-flight without changing promo,
  deposit or price economics.
- Acceptance: funnel input is `first_input` only; pre-consent input remains
  armed; success remains server-confirmed. Owner is marked only after an
  authenticated admin response, owner preview remains GET-only/zero-storage,
  future owner/QA pages suppress analytics before the shared runtime and
  already-open tabs revoke/stop on native storage. First navigation remains
  native and measurable once; repeats create no second navigation or CTA event.
- Proof: failing-first and full Node/backend suites, focused real-browser
  scenarios, independent exact-diff reviews, Brain validation, exact
  production hashes, two-vantage smoke and contract/static rollback. Durable
  records: `E-1039`, `REL-0175`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: the early exclusion bootstrap may alter only analytics
  preview state, never promo eligibility, consent, draft or money state. The
  current backend overlay accepts only a contract-only update; no full legacy
  installer, DB snapshot or deposit mutation. Static rollback is immutable.
- Next: commit declaration, clear conflicts, port the reviewed candidate,
  close all independent P1/P2 findings, rerun gates and publish safely.
