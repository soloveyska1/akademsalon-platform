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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: the changed `admin.html` and `admin.js` cache-wave URL must be
  deployed and reverted as one static unit. The rollback target is immutable
  `release157-c891d24`; backend release157 remains active throughout.
- Next: review and commit the manifest plus this handoff.
