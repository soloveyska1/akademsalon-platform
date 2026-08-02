# Workstream handoff

- Branch: `codex/out-005-services-choice`
- Outcomes: `OUT-005`
- Base: `96156040130c874519d1cd4f6335173a774d7847`, exact terminal
  `origin/codex/full-reference-production` after OUT-003.
- Goal: make `services.html` start from the client's situation and lead to one
  explicit, truthful configurator context without turning the hub into another
  wizard or deleting the physical service catalogue.
- Acceptance: one top-level decision and one primary continuation at a time;
  every existing service/price destination remains reachable and indexable;
  only allowlisted route codes cross to configurator; 360/390/768/1024/1440,
  light/dark/reduced-motion, keyboard/focus, ≥44 px and overflow gates pass; the
  verified global shell remains unchanged.
- Proof: read-only baseline and failing-first
  `tests/services-choice-contract.test.js`; existing catalogue/context/SEO/price
  suites; local browser comprehension and route-state matrix with G9 metadata;
  full repository regression, Brain 39/39/strict validate, fresh conflict scan
  and durable `E-1007`.
- Changed: none yet.
- Unverified: current choice count, comprehension order and any P0/P1 are not yet
  assumed. No catalogue/runtime change has started.
- Risks/rollback: shared catalogue CSS/JS also reach tariffs and service-detail
  pages. Stop on SEO/canonical/schema/sitemap/price drift, hidden physical URL,
  ambiguous or unsafe route context, P0/P1, production request, hard conflict or
  direct-consumer cache divergence. Keep one reversible implementation commit.
- Next: commit exactly manifest plus this handoff, run strict conflicts, then let
  three fresh read-only reviewers audit information architecture, UX/mobile and
  QA/SEO/reliability before write-owner forms the execution plan.
