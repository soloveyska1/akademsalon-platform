# Workstream handoff

- Branch: `codex/admin-analytics-master-parity-release`
- Outcomes: `OUT-006`
- Base: `3a102e8545e06f57913d51fdc7638dc85bdb1889` (fresh `origin/main`).
- Goal: deliver the exact master-cabinet Analytics v2 UI with a cache-safe
  cross-route search handoff and no change to the analytics backend/privacy
  boundary.
- Acceptance:
  - exact master desktop/mobile shell, typography, tokens, navigation, identity,
    themes and tools; all analytics sections remain source-backed and Russian;
  - 390/1024/1440 light/dark has no overflow/clipping; first phone metric is
    visible without scroll; filters/dialog/menu meet keyboard and 44px contracts;
  - `⌘/Ctrl+K`, sidebar and mobile search open the real Orders search and focus
    `#agQ`; its one-shot marker is removed before API and carries no query/data;
  - changed `admin.js` has a new complete immutable URL in `admin.html`, proven
    against a warmed old service-worker cache;
  - initial/runtime/late-response 403 fully purges data and stale requests;
    immutable applied-query prevents mixed periods, filters and pagination;
  - backend/DB/collector and raw identity/content boundaries remain untouched.
- Proof: failing-first static and warmed-cache browser contracts; Chromium
  390/1024/1440; full Node/backend/Brain suites; deterministic builds; three
  independent final P0/P1 reviews; `E-1016`.
- Changed:
  - rebuilt analytics as a static projection of the exact master shell and
    shared visual tokens while preserving all server-backed tools;
  - added responsive filters, master identity/theme/menu, honest access/stale
    states, auth-loss purge and immutable applied-query isolation;
  - added data-free one-shot focus handoff to the real Orders search for
    `⌘/Ctrl+K`, sidebar and mobile triggers;
  - changed the complete immutable `admin.js` URL from `analytics2` to
    `analytics3` and added a warmed-old-cache regression;
  - added static contracts and real Chromium layout, accessibility, CSP,
    request-race, navigation and cache scenarios.
- Verified:
  - Node 563/563, analytics static 15/15, backend analytics 30/30, Brain 39/39;
  - Chromium 390/1024/1440: exact shell geometry, light/dark, no overflow/CSP/
    external faults; first phone value bottom 784/844; all three search triggers
    focus `#agQ`; initial/runtime/late 403 paths purge; warmed cache gets fresh
    controller URL/bytes;
  - JS syntax, strict Brain validation, diff checks and two deterministic builds
    green (354 files / 24,971,100 bytes, digest
    `6cd0d4da709fa4f4369306c53500c75ea76492f32c7fe7eaf146a28f42742dc2`).
  - three independent final reviewers returned GO with P0=0/P1=0; UX also
    reported no P2 blocker.
- Unverified: production publication, live health/smoke and executed
  rollback/forward belong to a bounded release workstream after integration.
- Risks/rollback: analytics never loads operational `admin.js` or public
  `app.js`. The master controller only consumes/removes a data-free one-shot
  session marker. Rollback is static and must revert controller plus its exact
  URL together; backend/data remain unchanged.
- Next: submit and integrate this exact result into fresh canonical, then open
  the bounded production release workstream and publish `admin.html` plus
  `admin.js` in one atomic static wave with health/smoke/rollback-forward proof.
