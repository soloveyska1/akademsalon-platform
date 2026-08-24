# Workstream handoff

- Branch: `codex/out-006-new-user-promo-v3`
- Outcomes: `OUT-006`
- Goal: ship one bounded first-order campaign (`ПЕРВЫЙЛИСТ`) across the
  Academic Salon and the Kladovaya referral surface, plus a deliberately small
  return-to-draft offer, without exposing customer data or reviving aggressive
  exit-intent behaviour.
- Base: `fb9b8901f03f32b9e64304ebe99da76ec3a85264` (`origin/main`).
- Acceptance:
  - the Salon waits for `/api/promo/eligibility`; known old accounts, guest
    sessions with orders, prior paid relationships, claimed identities, disabled or
    expired campaigns and browser failures never get a redeemable presentation;
  - anonymous presentation is explicitly provisional because a cleared/new
    browser cannot be linked before contact entry; order creation revalidates
    account and canonicalised contact inside the same SQLite transaction;
  - authenticated owners always receive a labelled, non-redeemable preview;
    the Kladovaya owner bookmark is also non-persistent and preview-only;
  - welcome is 2% from 2,500 RUB, capped at 2,500 RUB; retention is 1% from
    5,000 RUB, capped at 1,000 RUB and valid for 72 hours; both are
    first-order-only, mutually exclusive and use the existing best-of rule;
  - retention is armed only by a server-issued HttpOnly intent at least 60
    seconds old plus the final contact stage and a quote band of at least 5,000
    RUB; pagehide writes only a categorical local marker and sends no request;
  - public campaign dates are Moscow calendar dates: new retention grants stop
    at `2026-09-18T20:59:59Z`, and the campaign stops at
    `2026-09-21T20:59:59Z`; a post-launch Telegram welcome-bonus entry remains
    eligible until the first work order;
  - the Kladovaya handoff is allowlisted and PII-free: no name, group, contact,
    deadline, task text, file metadata or draft token crosses origins;
  - modal focus, Escape/backdrop, return focus, inert background, internal
    scroll, reduced motion, forced colours and 320-1440 px geometry pass.
- Changed:
  - isolated Salon welcome/retention CSS and JS, original campaign art, entry
    hooks on Home and Configurator and plain-language terms in Loyalty;
  - exact-hash backend installer for three production modules, additive claim,
    intent and retention-grant tables, atomic order binding, contact
    canonicalisation, abuse cap and a fail-closed kill switch;
  - Kladovaya global first-visit sheet, original archive-style art, PII-free
    Academic Salon link and a fail-closed local returning-visitor classifier;
  - executable Node/Python contracts for economics, suppression, privacy,
    concurrent claims, installer idempotence and rollback preservation.
- Verified:
  - Salon public regression 602/602, backend 47/47, Brain 39/39 and
    `VALID records=94 links=175 manifests=44`;
  - two Salon static builds were identical: 356 files, 26,170,243 bytes,
    digest `dfc48a71d942acf4a2cd5e0a068447f39eebc5303a2cef0cb2b110733f598a64`;
  - Kladovaya build, lint and 277/277 tests passed; its client payload was
    stable across repeated builds (Vinext regenerates server metadata);
  - local Chromium covered Salon and Kladovaya desktop/mobile, light/dark and
    forced-colour presentations with zero horizontal overflow; the only Salon
    console message was the expected missing local `sw.js` fixture;
  - production source preview matched the pinned post-image hashes
    (`webapp 48a1f40a...`, `db be6bf8c8...`, `promo f912bec3...`) without
    changing the server; architecture, economics and UX each returned final GO
    with no P0/P1 after the anti-abuse, date, bonus, forced-colour and privacy
    corrections.
- Not yet verified: canonical integration, production publication, live
  eligibility/retention smoke and executed rollback/forward restore.
- Risks/rollback: no non-invasive mechanism can recognise an old anonymous
  person after all first-party identifiers are cleared or on another device.
  UI eligibility is therefore provisional and the authoritative account/contact
  check is fail-closed at order creation. Backend rollback disables the
  campaign and restores only source files; it deliberately preserves the live
  database and any orders written after backup. Static rollback uses immutable
  release pointers.
- Next: record exact evidence in `E-1028`, commit the verified candidate and set
  this workstream to `submitted` before canonical integration.
