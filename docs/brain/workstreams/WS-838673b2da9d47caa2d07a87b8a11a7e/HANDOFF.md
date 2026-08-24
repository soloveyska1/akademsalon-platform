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
- Changed:
  - Salon welcome is 12% from 2,500 RUB capped at 5,000 RUB; retention is 10%
    from 5,000 RUB capped at 2,500 RUB for 72 hours. Copy, five exact examples,
    terms, accessible labels, owner-preview labels and one cache wave agree.
  - The backend economics installer upgrades six pinned production sources and
    campaign rows through a staged sentinel/restart/finalize protocol. One
    authoritative transaction now owns best-of, finite-use CAS, bonus
    consume/refund, repricing and late subscription changes.
  - Invalid/minimum and no-active-subscription paths reconcile stale discounts
    and points; exact claimed finite/dormant promos survive repricing without
    becoming reusable by another order.
  - The v2 patch restores the runtime `why_invalid` function missing from the
    installed v1 promo service and exercises it without a test stub.
  - Companion Kladovaya branch `codex/new-user-promo-value-v2` updates its
    branded first-order sheet to the same welcome contract without changing
    the paid-site/privacy boundary or durable suppression keys.
  - Evidence: `E-1030`.
- Verified:
  - Salon public Node 603/603; backend 19/19 with `ResourceWarning` fatal;
    Brain 39/39; strict validation green; repeat Salon build identical.
  - Kladovaya build + 277/277, lint and repeat 408-file client build identical.
  - Local Chromium mobile welcome/retention/owner states have no horizontal
    overflow, keep scroll/focus containment and preserve one primary.
  - Latest live read-only source preview is `ready`; open-order preflight is
    `stacked_open=0`, `over_cap_open=0`; no client rows were read.
  - UX, architecture and economics each returned GO with P0=0/P1=0 on the
    final freeze.
- Unverified:
  - production backend migration, immutable static activation, health/smoke
    and executed rollback/forward belong to the release workstream after this
    product result is integrated.
- Risks/rollback: a discount cannot be literally costless; this design treats
  it as bounded acquisition/retention spend and proves only the 12% standalone
  ceiling, not net profit without authoritative delivery-cost data. It exceeds
  the recurring Salon+ Pro percentage/cap, so `one first order` must remain
  adjacent to the promise. Retention remains qualified explicit-exit only and
  is suppressed when a stronger welcome code is already applied, so the site
  does not teach casual visitors to leave. Backend rollout backs up the live
  database and exact current promo source. Its rollback keeps the coherent v2
  aggregate guard, turns new claims off, preserves promised rows without
  replacing later orders and fails closed on mixed hashes.
  Static rollback remains immutable pointer rotation.
  A separate kill-switch toggle is forbidden between economics staging and
  finalize/rollback because it would replace the transition sentinel; the
  release owner must complete one of those two actions before any toggle.
- Next: commit the verified implementation, mark this workstream submitted,
  fetch/recheck conflicts, integrate the exact result and open the bounded
  production release workstream.
