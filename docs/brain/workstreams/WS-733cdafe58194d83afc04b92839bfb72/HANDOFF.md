# Workstream handoff

- Branch: `codex/release166-private-checkpoint`
- Base: `a9e038ed62c126e3d54290cfda547c50bd290772` (`origin/main`).
- Outcomes: `OUT-008`
- Goal: publish the already integrated private configurator checkpoint as
  immutable release166 without changing its reviewed product blobs, prices,
  routes, submit contract, backend or infrastructure.
- Acceptance: two clean public-client builds are byte-identical; the immutable
  tree differs from release165 only in the expected canonical public file;
  server-owned assets, ownership and modes remain intact; production `current`
  and `dist` resolve to release166 and `previous` to release165; external and
  VPS read-only smoke pass; production Chromium proves the missing-file
  recovery at 360/390, reattachment and the 40-character alternative, legacy
  contact scrubbing, retained practice-support scope/price and zero POST;
  executed release165 rollback returns old hashes and health, then forward
  restore returns release166 hashes and health; P0/P1/P2=0.
- Proof: full public/backend/Brain regression, deterministic build counts and
  digests, public-file and immutable-tree manifests, exact live HTTP SHA-256,
  production 360/390 light/dark checkpoint journeys, GET/HEAD-only two-vantage
  smoke, service/Nginx/SQLite checks, pointer snapshots and executed
  rollback/forward recorded in `REL-0166` and `E-1026`.
- Changed: built canonical source twice, assembled immutable
  `release166-a9e038e`, activated it, verified production recovery/privacy and
  hashes, executed a complete release165 rollback and restored release166.
  Updated `E-1026`, `REL-0166`, `CURRENT-HANDOFF.md` and `START-HERE.md`;
  product blobs, prices, routes, backend and infrastructure configuration were
  not changed in this release workstream.
- Verified: byte-identical builds are 353 files / 25,054,477 bytes with digest
  `dbec7e39…552`; immutable tree is 356 files / 25,064,648 bytes with manifest
  `79f51ae8…bfd`, full source parity and owner/mode drift 0. Production
  Chromium 360 light and 390 dark proved focused recovery, one disabled 50 px
  primary, exact support scope/price, reattachment, 39/40 -> 40/40, zero
  storage marker, overflow, POST and console error. External and VPS smoke
  passed 14/14 after activation, on release165 rollback and after forward
  restore; service/Nginx/SQLite stayed green and pointer residue is zero.
- Unverified: no production form was submitted. Organic conversion and revenue
  uplift are not claimed.
- Risks/rollback: immutable overlay could disturb server-owned files; pointer
  rotation could target the wrong previous release; a local browser proof
  could accidentally hide persistence residue. Preflight resolves exact
  pointers/hashes and storage state first; activation uses explicit validated
  paths; rollback atomically restores release165 with release164 as previous.
- Next: run the final full public/backend/Brain gates on the exact release
  documentation commit, obtain an independent release-proof review, then
  submit and integrate this workstream without modifying product blobs.
