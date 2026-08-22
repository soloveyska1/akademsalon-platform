# Workstream handoff

- Branch: `codex/release160-practice-price-trust`
- Outcomes: `OUT-006`
- Goal: publish the integrated practice-price trust result as immutable public
  release160, without changing backend, analytics, admin, client data or the
  approved Otisk visual concept.
- Acceptance:
  - exact canonical `135cb4559ee6c81b0e42633d2ebb2ad48abbb1a1`
    passes full site/backend/Brain gates, strict validation and two identical
    public builds;
  - read-only production preflight proves both static pointers still resolve to
    `release159-57703fa`, `previous` is `release158-fa2b317`, service is active,
    Nginx is valid, SQLite is `ok`, and external/VPS smoke is green;
  - an inactive immutable `release160-135cb45` is assembled from the exact
    public build while preserving only the three established server-owned paths,
    then every payload hash, owner and mode is verified before activation;
  - `current` and compatibility `dist` switch together to release160 and
    `previous` becomes exact release159; backend files and service remain
    byte-identical and uninterrupted;
  - the live practice page exposes the selectable 2 500 / 8 000 / 14 000 RUB
    scopes, `draft+support` continuity and truthful structured minimum prices;
    external and VPS GET/HEAD-only smoke plus real Chromium 390/1440 light/dark
    remain green with no overflow or console errors;
  - an executed static-only rollback returns both pointers to release159 with
    green smoke, then forward restore returns release160; no order, contact,
    payment, file, message, raw analytics row or OAuth material is read or
    mutated.
- Proof: full deterministic suites/build manifest, exact preflight and live
  hashes, `E-1021`, `REL-0160`, two-vantage read-only smoke, browser runtime and
  executed static rollback/forward evidence.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: a mixed static pointer or lost server-owned path is a hard
  stop. Rollback changes only paired `current`/`dist` symlinks to immutable
  `release159-57703fa`; backend and database are outside this release.
- Next: commit this declaration, pass strict conflicts, then run exact
  preflight before creating any production path.
