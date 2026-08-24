# Workstream handoff

- Branch: `codex/out-006-promo-value-v3`
- Outcomes: `OUT-006`
- Goal: replace the technically safe but emotionally negligible economics of
  `ПЕРВЫЙЛИСТ` with a simple, material first-order benefit while preserving the
  existing first-order, privacy, best-of, atomic-claim and rollback boundaries
  across Academic Salon and Kladovaya.
- Acceptance:
  - welcome remains the same campaign/family and becomes 12% of the agreed
    first-order price from 2,500 RUB, capped at 5,000 RUB: 2,500 -> 300,
    5,000 -> 600, 10,000 -> 1,200, 20,000 -> 2,400 and about 42,000+ -> at
    most 5,000 RUB;
  - retention remains visibly smaller but material: 10% from 5,000 RUB,
    capped at 2,500 RUB for 72 hours; welcome is never worse at the same price;
  - discount amount and final payable amount are monotonic throughout every
    eligible price, standalone campaign cost never exceeds 12% of GMV and the
    existing aggregate benefit ceiling is not increased;
  - both offers remain one first-order family, mutually exclusive and best-of
    with another promo/subscription; no refund, repricing, guest-to-account,
    cross-contact or concurrent-claim path can duplicate the entitlement;
  - backend migration upgrades the shared welcome row, already-issued live
    retention rows and future retention issuance atomically while preserving
    the current kill-switch/active state; it does not rewrite an already
    stored order discount without an explicit reprice;
  - current Moscow expiry, retention issuance deadline, 72-hour token binding,
    daily issuance cap, Kladovaya PII-free status proxy and both owner previews
    remain unchanged; existing v1 seen/dismissed markers continue suppressing
    people who already saw the sheet;
  - Salon and Kladovaya state the exact 12%, cap, one-first-order boundary and
    five amount examples in plain language without fake urgency or a second
    competing primary action; retention names 10%/2,500/72 hours;
  - the changed JS receives one cache-key wave in Home and Configurator;
    360/390 mobile, dark, forced-colours and keyboard/focus behavior stay green.
- Proof:
  - failure-first Node/Python/cart economics contracts, exhaustive price
    monotonicity and exact v1 -> v2 database/source migration and rollback
    tests, including initial off/inactive state preservation;
  - full Salon public/backend/Brain regression, strict Brain validation and two
    byte-identical public builds;
  - Kladovaya build, lint and full tests plus focused promo contracts;
  - local real-browser Salon/Kladovaya welcome and Salon retention at 360/390,
    including owner previews, focus, overflow, console and zero-submit checks;
  - three independent economics/architecture/UX reviews with P0=P1=0, recorded
    in `E-1030` before submission.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: a discount cannot be literally costless; this design treats
  it as bounded acquisition/retention spend and proves only the 12% standalone
  ceiling, not net profit without authoritative delivery-cost data. It exceeds
  the recurring Salon+ Pro percentage/cap, so `one first order` must remain
  adjacent to the promise. Retention remains qualified explicit-exit only and
  is suppressed when a stronger welcome code is already applied, so the site
  does not teach casual visitors to leave. Backend rollout backs up the live
  database and exact current promo source, supports a real v1 -> v2 -> safe-v1
  rollback without replacing later orders, and fails closed on mixed hashes.
  Static rollback remains immutable pointer rotation.
- Next: review and commit the manifest plus this handoff.
