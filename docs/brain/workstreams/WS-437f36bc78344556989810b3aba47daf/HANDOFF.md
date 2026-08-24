# Workstream handoff

- Branch: `codex/release169-promo-value`
- Outcomes: `OUT-006`
- Goal: publish the verified material promo economics from `E-1030` as
  REL-0169 across the private Salon backend, Academic Salon static site and
  Kladovaya without creating a real order, contact or retention grant.
- Acceptance:
  - the exact six-source backend candidate stages fail-closed, the service is
    restarted, the runtime PID is attested and the snapshotted campaign state
    is finalized without any separate kill-switch toggle;
  - the backend completes an executed safe rollback (coherent v2, campaign
    off) and explicit forward enable, ending installed/on with SQLite, service,
    Nginx and count-only anomaly checks green;
  - immutable Salon and Kladovaya releases correspond to canonical SHAs
    `51f35562...` and `58f4c11...`, preserve server-owned state and become the
    active pointers;
  - both static sites complete an actual pointer rollback and forward restore;
  - external plus VPS smoke and production Chromium owner/clean-new/returning
    states show the exact 12%/5,000 and retention 10%/2,500 contracts with no
    console error, overflow, entitlement mutation or real submission.
- Proof: `E-1030`, new `E-1031`, exact source and immutable-tree manifests,
  systemd/Nginx/SQLite checks, two-vantage GET-only smoke, production Chromium,
  executed backend/static rollback-forward drills, `brain:test` and
  `brain:validate`.
- Changed:
  - staged, PID-attested and finalized the exact six-source backend economics
    set, then executed safe rollback and explicit forward enable;
  - published Salon `release169-51f3556`, executed release168 rollback and
    restored release169;
  - published Kladovaya's value release, found an owner-preview P2 at 390 px,
    applied the UX-reviewed mobile inset in canonical `58f4c11`, then published
    `20260824T1214Z-promo-mobile-58f4c11`, rolled back and restored it;
  - added `E-1031`, `REL-0169` and updated `START-HERE` plus
    `CURRENT-HANDOFF` to the exact live state.
- Verified:
  - backend final check is installed/on, database current, open-order anomaly
    counts 0/0, service active, Nginx valid and SQLite `ok`;
  - Salon and Kladovaya immutable manifests, server-owned/runtime files and
    final pointers are exact;
  - GET-only smoke passed 14/14 externally and 14/14 on the VPS;
  - production Chromium covered clean-new, returning suppression and labelled
    owner welcome/retention views; Kladovaya 360/390 preview overlap is zero;
  - Salon 603/603, focused backend 19/19, Kladovaya 277/277 plus lint and Brain
    39/39/strict validation are green; three reviewers report GO, P0=0/P1=0.
- Unverified: conversion, revenue and positive contribution-margin uplift need
  live measurement plus authoritative fulfilment cost and commission data.
- Risks/rollback: never run a separate campaign toggle between backend stage
  and finalize/rollback; complete that transition first. Backend rollback keeps
  the aggregate v2 guard and promised rows while closing new claims. Salon
  static rollback target is release168; Kladovaya's final pointer backup names
  the exact 1203Z predecessor. No production order, code grant, contact, file,
  payment, message or analytics event was created as proof.
- Next: run final Brain gates, commit the release record, set the workstream to
  `submitted`, integrate its exact result into fresh `origin/main`, then mark
  the terminal revision `integrated`.
