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
    `draft+editing`, or `draft+support`; the hero first points to the choice.
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
- Changed:
  - `a7a8bf31` adds the page-scoped three-scope price ledger, visible
    lower-orientation/fixed-price explanation, authorship boundary, staged
    right-to-stop wording, route-aware continuation and Otisk light/dark/mobile
    styles.
  - `8a1d70e4` removes the false structured-data maximum, publishes three
    minimum-price Offers, and closes the review-found support mismatch by routing
    a visitor with a draft and real materials to `draft+support` rather than
    `topic+support`.
  - Admin, analytics, calculator values, form submission, backend and production
    client data are unchanged.
- Verified on exact product HEAD `8a1d70e40f307579e9841bf16fb3aacb1465001a`:
  - focused scope/SEO/configurator/context contracts: 32/32;
  - full public product suite: 584/584; backend: 31/31; Brain: 39/39;
  - strict Brain corpus: 78 records / 143 links / 30 manifests;
  - two static builds: 354 files and identical SHA-256 tree
    `531afa6cf9aede44f79ea8ba73ecf95c34ba863ba224ad8c23b7a98e9210b540`;
  - real Chromium flow: diagnostic opens `Разбор черновика` from 2 500 RUB;
    support opens `Сопровождение исследования по этапам` from 14 000 to
    19 500 RUB and identifies the incoming situation as `Свой черновик`;
  - 360/390/1024/1440 light and dark: zero horizontal overflow; console 0 errors
    and 0 warnings; radio focus is visible with a 2 px accent outline;
  - evidence screenshots are under `output/playwright/practice-*-light.png`,
    `output/playwright/practice-*-dark.png` and
    `output/playwright/practice-price-390-*.png` (ignored local QA output);
  - independent final reviews: commercial-value GO (P0/P1/P2 = 0),
    skeptical-buyer GO (its route continuity note was fixed), and UX GO
    (P0/P1/P2 = 0).
- Unverified: production publication and post-release external health/smoke;
  acquisition source for the lost lead remains unknown because admin and
  analytics were deliberately outside this workstream.
- Risks/rollback: the page is intentionally denser because it qualifies scope
  before contact. Revert `8a1d70e4` and `a7a8bf31` together to remove the feature;
  no data/API/submission migration is involved.
- Next: freeze this exact result as submitted, fetch canonical truth, rerun the
  strict conflict snapshot, integrate, then execute the separate production
  release gates or stop before publication if production authority is absent.
