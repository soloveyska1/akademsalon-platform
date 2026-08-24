# Workstream handoff

- Branch: `codex/out-006-new-user-promo-v3`
- Outcomes: `OUT-006`
- Goal: ship one bounded first-order campaign (`ПЕРВЫЙЛИСТ`) across the
  Academic Salon and the Kladovaya referral surface, plus a deliberately small
  return-to-draft offer, without exposing customer data or reviving aggressive
  exit-intent behavior.
- Acceptance:
  - the Salon stays hidden until `/api/promo/eligibility` resolves; known old
    users, guest-order holders, pre-campaign accounts, owner impersonation,
    disabled campaigns, storage failures, timeouts and server errors never get
    a redeemable presentation;
  - anonymous first-device presentation is explicitly provisional: existing
    local footprints suppress it and the order endpoint rejects historical
    identities/contacts atomically even when a public code is typed directly;
  - authenticated owner preview is always visible, clearly labelled, excluded
    from campaign analytics and technically non-redeemable;
  - welcome follows the reviewed conservative schedule (2%, minimum 100 ₽,
    maximum 2 500 ₽, order from 2 500 ₽); retention follows 3%, minimum 150 ₽,
    maximum 3 000 ₽, order from 5 000 ₽, 72 hours; both are first-order-only,
    mutually exclusive and compete best-of with Salon+ under the existing 25%
    total-benefit ceiling;
  - retention is armed only by a valid near-final draft and shown on explicit
    exit or a later return; pagehide stores one categorical marker and performs
    no request, while uploads, submit-in-flight, success and network recovery
    suppress it;
  - the Kladovaya handoff remains allowlisted and PII-free; no name, group,
    contact, deadline, task text, file metadata or draft token crosses origins;
  - modal focus, Escape/backdrop, return focus, inert background, 44 px targets,
    reduced motion, forced colors, image-failure fallback and 320-1440 px
    geometry are verified.
- Proof: failure-first Node and Python contract tests; exhaustive schedule and
  race cases; exact-hash installer preview/apply/rollback against a production
  source copy; full `node --test tests/*.test.js`; Brain 39/39 and strict
  validation; deterministic build; local Chromium/WebKit eligibility and
  geometry matrix; independent economics, architecture/privacy and UX review;
  exact evidence in `E-1028`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: no non-invasive mechanism can recognise an old anonymous
  person after they clear every first-party identifier or change device. The UI
  therefore calls anonymous eligibility provisional and the authoritative
  contact/account check remains fail-closed at order creation. Rollback order:
  campaign kill switch, static asset rollback, then exact installer rollback;
  additive claim records remain for audit and are never destructively dropped.
- Next: commit this declaration, run the strict conflict scan, then write the
  failure-first API/economics/privacy contracts before implementation.
