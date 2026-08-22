# Workstream handoff

- Branch: `codex/release159-quote-scope-measurement`
- Outcomes: `OUT-006`
- Goal: publish the already integrated quote-scope price clarity and
  privacy-safe measurement as one backend-first immutable release, without
  changing the approved visual concept or reading client data.
- Acceptance:
  - exact canonical `5ef6d177227c7559f58ae69ff5290f0f5cce3296`
    passes full site/backend/Brain gates and two deterministic builds with one
    identical public manifest;
  - preflight proves release158, service, Nginx and SQLite healthy and binds all
    server-owned files to exact hashes before mutation;
  - Analytics contract 2.3 is installed first from the tracked artifact with a
    root-only backup, while existing post-v2 seams and the incident-hardened
    Nginx source remain byte-identical; service restart, health and safe
    accepted/rejected contract checks pass;
  - inactive `release159-5ef6d17` contains the complete verified payload plus
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
- Proof: `E-1019`, new `E-1020` and `REL-0159`; full Node/backend/Brain gates,
  two exact build manifests, two independent council reviews, tracked installer
  cycle on exact production copies, read-only production smoke from operator
  and VPS, browser matrix, exact live hashes, bounded synthetic revoke proof and
  executed rollback/forward checks.
- Changed: none yet.
- Unverified: production has not been mutated in this workstream.
- Risks/rollback: client-first publication would silently lose the new events,
  and the active Nginx site hash intentionally differs from the historical
  installer default after the vhost-isolation incident. The release must pin
  that current hash explicitly, prove the installer leaves Nginx unchanged,
  deploy backend before static, and roll static back before restoring contract
  2.2. Any unknown hash, mixed pointer, failed cleanup or red P0/P1 is NO-GO.
- Next: review and commit the manifest plus this handoff.
