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
- Changed: the situation-first recommendation now carries exactly three
  optional quote-scope choices with a safe first-stage default. The preference
  survives the local draft and is copied into the human-readable legacy
  request without becoming a required field or analytics event. Eligible
  written plan/review diagnostics disclose one consistent 14-calendar-day,
  one-time credit into the nearest stage on the same material or plan. The
  recommendation also links one route-specific message already published in
  the book of thanks. Full-support routes keep their existing project range,
  label it as support rather than a first-stage price, and do not receive a
  contradictory scope selector. A re-entrant `salon:cart` render discovered by
  the browser flow is guarded at the existing refresh boundary.
- Verified:
  - `node --test tests/configurator-conversion-package.test.js`: 7/7;
  - `node --test tests/*.test.js`: 574/574;
  - `npm run build`: static preview built successfully;
  - `git diff --check`: clean;
  - `./bin/brain validate --strict`: valid (75 records, 136 links, 27
    manifests);
  - `python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v`:
    39/39;
  - Playwright at 390 and 1024 px, light and dark: no horizontal overflow,
    changed controls are at least 44 px, the fixed action bar does not occlude
    the new content, the scope persists into `fDetails`, and the final screen
    still exposes one primary submit; direct plan/review and full-support
    routes preserve truthful eligibility and price labels; console has zero
    errors and warnings. No form was submitted and the production API was
    mocked during local checks;
  - independent text review identified ambiguity around unknown expanded
    totals and “compatible continuation”; both P1 findings were resolved in
    copy, regression tests and browser evidence. The latest independent visual
    review approved the corrected 390/1024 light/dark composition with the P1s
    closed. A repeat call to the second text-review endpoint failed at its SSL
    boundary, so the resolution rests on deterministic tests and the browser
    prototype rather than an unsupported model vote.
- Unverified: no claim is made yet about conversion uplift; that requires
  production Analytics v2 evidence after a separately approved public release.
  Public `akademsalon.ru` has not been changed. Owner-only Sites preview is the
  next release gate and is not yet deployed in this revision.
- Risks/rollback: extra choice may compete with the recommended first step;
  mitigation is a default selection, no validation gate and unchanged primary
  CTA. Extended scopes remain requests for a quote, never a displayed total or
  work authorization. Credit language is limited to eligible diagnostics and
  is repeated in the saved request for manual specification. Rollback is the
  implementation commit revert; no backend, payment, consent or production
  data mutation is in scope.
- Next: commit the verified implementation, publish that exact source commit to
  the existing owner-only Sites preview, smoke the deployed version, record its
  version here, then freeze the workstream as `submitted` after a fresh fetch
  and conflict check.
