# Workstream handoff

- Branch: `codex/release159-quote-scope-measurement-v2`
- Outcomes: `OUT-006`
- Goal: publish the already integrated quote-scope price clarity and
  privacy-safe measurement as one backend-first immutable release, without
  changing the approved visual concept or reading client data.
- Acceptance:
  - exact canonical `57703fa7d97fb8ad9b8685dda0a6e684801e939d`
    passes full site/backend/Brain gates and two deterministic builds with one
    identical public manifest;
  - preflight proves release158, service, Nginx and SQLite healthy and binds all
    server-owned files to exact hashes before mutation;
  - Analytics contract 2.3 is installed first from the tracked artifact with a
    root-only backup, while existing post-v2 seams and the incident-hardened
    Nginx source remain byte-identical; service restart, health and safe
    accepted/rejected contract checks pass;
  - inactive `release159-57703fa` contains the complete verified payload plus
    only the explicitly preserved server-owned files; then `current` and
    `dist` move together and `previous` becomes exact release158;
  - live configurator serves the fresh quote cache key, 360/390/1024/1440
    light/dark have no new console/overflow/visual regression, and external plus
    VPS GET/HEAD-only smoke pass;
  - one synthetic anonymous quote-scope sequence proves accepted/rejected
    readback, is revoked, and leaves zero matching event/session/visitor rows;
  - an executed full rollback restores static release158 and contract 2.2 with
    green health/smoke, then backend-first forward restore returns release159
    plus contract 2.3 and passes again;
  - no order, contact, payment, file, raw production analytics row, IP/UA,
    query/referrer or OAuth material is read or mutated.
- Proof: `E-1019`, `E-1020` and `REL-0159`; full Node/backend/Brain gates, two
  exact builds, tracked installer cycle on exact production copies, read-only
  production smoke from operator and VPS, browser matrix, exact live hashes,
  bounded synthetic revoke proof and executed rollback/forward checks. GLM gave
  an additional read-only GO; the other council providers were unavailable and
  are not counted as evidence.
- Changed:
  - published immutable `release159-57703fa`; `current` and `dist` resolve to
    it and `previous` resolves to `release158-fa2b317`;
  - installed Analytics v2 contract 2.3.0 backend-first while webapp, DB seam,
    runtime module, incident-hardened Nginx and security headers stayed
    byte-identical;
  - added `E-1020` and `REL-0159`, then updated `START-HERE` and
    `CURRENT-HANDOFF` with exact production truth.
- Verified:
  - site 580/580, backend 31/31, Brain 39/39, strict validation/syntax/build/
    diff and two deterministic builds;
  - 353 public files / 24,987,483 bytes; immutable 356 files / 24,997,654 bytes,
    full manifest `842dd247…4b53`, owner/mode drift 0;
  - repository/tree/HTTP parity for all three changed public files, contract
    2.3.0, active service, Nginx valid, SQLite `ok`, admin Analytics 403;
  - 360/390/1024/1440 light/dark without root overflow or console errors;
  - accepted/rejected/duplicate/revoke synthetic proof with zero final matching
    visitor/session/event/revocation residue;
  - external and VPS smoke 14/14 after activation, in full rollback to
    release158 + contract 2.2.0, and after final backend-first forward restore.
- Unverified: organic conversion uplift and the owner-authenticated first
  consented session. Release proof establishes correctness, not business lift.
- Risks/rollback: client-first publication would silently lose the new events,
  and the active Nginx site hash intentionally differs from the historical
  installer default after the vhost-isolation incident. The release must pin
  that current hash explicitly, prove the installer leaves Nginx unchanged,
  deploy backend before static, and roll static back before restoring contract
  2.2. Final rollback uses static `release158-fa2b317` plus exact backend backup
  `/root/salon_bot/backups/analytics-v2-20260822T221327303991Z`. Any unknown
  hash, mixed pointer, failed cleanup or red P0/P1 is NO-GO.
- Next: validate and commit this durable release truth, freeze the exact result,
  submit/integrate it into fresh canonical, then measure only a sufficient
  fixed-window organic consented sample.
