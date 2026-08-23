# Workstream handoff

- Branch: `codex/release162-practice-passport`
- Outcomes: `OUT-006`
- Goal: publish canonical `977c1f6a` as immutable static release162 so the
  public practice page explains and proves the complete 14,000 RUB support
  composition before contact, without backend, analytics or pricing changes.
- Acceptance: build exact canonical source; assemble inactive release162 from
  immutable release161 while preserving server-owned files; prove that only
  `otchet-po-praktike.html` and `assets/css/polish15-catalog.css` change in the
  public tree; source/release/HTTP hashes agree; external and VPS smoke pass
  before/after activation; production Chromium proves conditional 8,000 vs
  14,000 states, exact CTA routes, Browser Back reconciliation, 390/1440
  light/dark layout, accessibility targets and console 0; execute rollback to
  release161 and forward restore; service, Nginx, SQLite and backend hashes
  remain unchanged; G10 closes with P0=0/P1=0.
- Proof: exact canonical public/backend/Brain tests and deterministic build;
  strict Brain validation; immutable tree/hash/owner/mode parity; two-vantage
  GET/HEAD-only smoke; production Playwright; rollback/forward chronology in
  `E-1023` and release truth in `REL-0162`.
- Changed: published canonical source `977c1f6a` as immutable
  `release162-977c1f6`; recorded `REL-0162`, `E-1023`, current truth and the
  next bounded product focus. The public payload changes only the practice page
  and its page-scoped catalogue CSS.
- Verified: site 590/590, backend 31/31, Brain 39/39, strict validation, two
  byte-identical builds, source/tree/HTTP hash agreement, 353/353 parity,
  owner/mode drift 0, three independent GO reviews, production Chromium at
  390/1440 light/dark, keyboard and Browser Back, external/VPS smoke 14/14 and
  executed release161 rollback/forward. Service, Nginx, SQLite and backend
  hashes remained unchanged.
- Unverified: conversion uplift and the rejected lead's acquisition source;
  neither can be inferred from release correctness.
- Risks/rollback: stale cache could preserve the unconditional passport; a
  restored support radio could disagree with the CTA; or the immutable tree
  could overwrite server-owned files. Exact cache key, runtime state proof and
  baseline-overlay assembly contain these risks. Rollback changes only paired
  static pointers to immutable `release161-1c5f0ee`; backend/database are never
  restored or restarted.
- Next: integrate the exact verified release record into fresh `origin/main`,
  then open a separate bounded OUT-008 mobile-first audit without changing the
  released offer.
