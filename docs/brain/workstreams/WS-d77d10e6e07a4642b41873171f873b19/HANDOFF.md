# Workstream handoff

- Branch: `codex/out-006-practice-price-trust-v3`
- Outcomes: `OUT-006`
- Base: `2147cbd67fc76277141d5ff0eb2cbbd90681126c` (`origin/main`, release159 proof).
- Goal: remove the unexpected 8 000 -> 14 000 RUB jump on the public
  practice-report page by letting a visitor distinguish and select three
  objectively different scopes before contact, without a discount, fabricated
  proof, admin/analytics work or backend changes.
- Acceptance:
  - The page visibly distinguishes and lets the visitor select a standalone
    diagnostic from 2 500 RUB, editing of a ready factual package from 8 000 RUB,
    and staged support from 14 000 RUB.
  - One selected radio owns the price-section continuation and all later
    continuations. Routes are allowlisted and exact: `draft+diagnostic`,
    `draft+editing`, or `topic+support`; the hero first points to the choice.
  - Every price has an entry condition and a verifiable output. The page says
    these are lower orientations and that direction, requirements and urgency
    can increase the range; preliminary and fixed-price moments are distinct.
  - The student fact, decision and final-author-version obligations are explicit;
    no fabricated practice, grade, acceptance or university decision is promised.
  - Existing specification, stage-payment, right-to-stop and eligible 14-day
    diagnostic-credit terms are surfaced accurately; no fake promotion,
    scarcity, marketplace comparison, case or uplift claim is introduced.
  - Structured data represents the three minimum prices without claiming that
    14 000 RUB is a maximum; visible copy and machine-readable offers agree.
  - Each semantic section retains one primary continuation. Form submission,
    canonical calculator values, analytics, admin and backend stay unchanged.
  - At 360, 390, 1024 and 1440 CSS pixels in light and dark themes there is no
    overflow, clipping, unreadable contrast or console error; selection is
    visible without relying on color and stays in the Otisk system.
- Proof: failure-first/focused price contracts, full product and Brain suites,
  deterministic build, `git diff --check`, route runtime checks for all three
  selections, and browser screenshots/logs carrying commit/route/viewport/theme.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: a selector could fork navigation or make the page denser on
  phones; keep one selected state and one continuation. Rollback is the single
  implementation commit because no data/API/submission contract changes.
- Next: commit the declaration, run strict conflict analysis, then port the
  reviewed prototype and replace the false schema upper bound.
