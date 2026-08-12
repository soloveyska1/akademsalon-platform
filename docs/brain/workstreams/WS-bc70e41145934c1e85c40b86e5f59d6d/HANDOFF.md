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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: analytics never loads operational `admin.js` or public
  `app.js`. The master controller only consumes/removes a data-free one-shot
  session marker. Rollback is static and must revert controller plus its exact
  URL together; backend/data remain unchanged.
- Next: review and commit the manifest plus this handoff.
