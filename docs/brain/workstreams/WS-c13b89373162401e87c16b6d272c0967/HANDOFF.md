# Workstream handoff

- Branch: `codex/release158-analytics-master-parity`
- Outcomes: `OUT-006`
- Goal: publish the already integrated, independently verified Analytics v2
  master-cabinet parity result as immutable `release158`, without changing the
  backend, database, collector or privacy boundary.
- Acceptance:
  - the exact fresh canonical source builds twice to the same public manifest;
  - the inactive release tree contains the complete payload plus the three
    explicitly preserved server-owned files, and every payload hash verifies;
  - `current` and `dist` move together atomically from release157 to release158;
  - external and VPS 14/14 smoke, service/Nginx/SQLite health, strict analytics
    CSP, unauthenticated API 403 and all five changed live-file hashes pass;
  - an executed static rollback returns both pointers to release157 and passes
    smoke, then forward restore returns both to release158 and passes again;
  - `previous` ends at release157 and no production contact, order, log or raw
    analytics row is read or mutated.
- Proof: `E-1016`, `REL-0158`, full Node/backend/Brain gates, deterministic
  build manifests, checked-in production smoke from operator and VPS, exact
  live SHA-256 comparison and recorded rollback/forward pointer checks.
- Changed:
  - published immutable `release158-fa2b317`; `current` and `dist` resolve to
    it and `previous` resolves to `release157-c891d24`;
  - preserved exactly `.indexnow-key`, the SEO notebook and `sw.js` while every
    one of 353 public payload hashes verified before activation;
  - added `REL-0158`, updated `START-HERE`, `CURRENT-HANDOFF` and `E-1016` with
    the exact live and rollback-forward result.
- Verified:
  - site 563/563, backend 30/30, Brain 39/39, strict validation/syntax/diff;
  - two deterministic builds: 353 files / 24,970,161 bytes, manifest
    `f759b4a9…55b5`; full immutable tree 356 files / 24,980,332 bytes, manifest
    `fab1be44…fe38`;
  - repository/tree/HTTP SHA-256 parity for all five changed files, `analytics3`,
    strict CSP, API 403, active service, Nginx valid and SQLite `ok`;
  - external and VPS smoke 14/14 before activation, after release158, during an
    executed release157 rollback and after final release158 forward restore.
- Unverified: the owner-authenticated first organic consented session; no
  production credential or real analytics row was read for release proof.
- Risks/rollback: the changed `admin.html` and `admin.js` cache-wave URL must be
  deployed and reverted as one static unit. The rollback target is immutable
  `release157-c891d24`; backend release157 remains active throughout.
- Next: validate and commit the durable release truth, submit/integrate this
  exact result into fresh canonical, then let the authenticated owner confirm
  the first organic consented session.
