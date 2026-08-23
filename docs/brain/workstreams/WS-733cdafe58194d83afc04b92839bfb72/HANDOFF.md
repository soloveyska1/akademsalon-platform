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
- Changed: none yet.
- Unverified: production publication and all release proof are not started; no
  production form will be submitted.
- Risks/rollback: immutable overlay could disturb server-owned files; pointer
  rotation could target the wrong previous release; a local browser proof
  could accidentally hide persistence residue. Preflight resolves exact
  pointers/hashes and storage state first; activation uses explicit validated
  paths; rollback atomically restores release165 with release164 as previous.
- Next: review and commit the manifest plus this handoff.
