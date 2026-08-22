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
- Changed:
  - published immutable static `release160-135cb45`; `current` and `dist`
    resolve to it and `previous` resolves to `release159-57703fa`;
  - preserved the three established server-owned files and changed exactly
    `otchet-po-praktike.html` plus `assets/css/polish15-catalog.css` relative to
    release159;
  - deployed owner-only Sites preview version 36 from the same canonical source;
  - added `E-1021` and `REL-0160`, then updated `START-HERE` and
    `CURRENT-HANDOFF` with exact production truth.
- Verified:
  - site 584/584, backend 31/31, Brain 39/39, focused 32/32, strict validation,
    diff checks and two deterministic builds;
  - public payload 353 files / 25 006 595 bytes, digest
    `4bba587fbbf9c5c2b3213d54392957f17bb703bbd3851d2c74b4faa7136efcdf`;
    immutable live tree 356 files / 25 016 766 bytes, manifest
    `4b6c07fbc8a86cd64dede460680a76f1bb687a34ab9a85ac0f42787bf00c2e9b`,
    source parity 353/353 and owner/mode drift 0;
  - repository/tree/external/VPS HTTP parity for both changed files; backend,
    Analytics contract/runtime, Nginx, headers and SQLite unchanged;
  - production 390/1440 light/dark with three radios/prices, `draft+support`,
    no false schema maximum, overflow 0 and console 0;
  - external and VPS smoke 14/14 after activation, in the executed release159
    rollback and after final release160 forward restore.
- Unverified: organic conversion uplift and acquisition source of the lost lead;
  admin and analytics were intentionally not inspected or changed.
- Risks/rollback: a mixed static pointer or lost server-owned path is a hard
  stop. Rollback changes only paired `current`/`dist` symlinks to immutable
  `release159-57703fa`; backend and database are outside this release.
- Next: for the next practice lead, send the direct price-scope link and discuss
  the selected scope; do not turn staged support into a discounted editing job.
