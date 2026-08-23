# Workstream handoff

- Branch: `codex/release165-keyboard-shelf`
- Base: `5b1735c2c959ce63733b270259f74965d2fe46d3` (`origin/main`).
- Outcomes: `OUT-008`
- Goal: publish the already integrated mobile configurator keyboard shelf as immutable release165 without changing its verified product blobs, pricing, routes, submit contract, backend or infrastructure.
- Acceptance: two clean public-client builds are byte-identical; only the expected canonical public files differ from release164; server-owned assets, ownership and modes remain intact; production `current` and `dist` resolve to release165 and `previous` to release164; external and VPS read-only smoke pass; production Chromium verifies one reachable primary above the emulated software keyboard, 39/40 disabled, 40/40 enabled, exact practice-support price/scope and no POST; the same reviewed source passes the actual iOS software-keyboard journey before publication and live iOS loads its production route; executed release164 rollback returns old hashes and health, then forward restore returns release165 hashes and health; P0/P1/P2=0.
- Proof: full public/backend/Brain regression, deterministic build counts/digest, public-file and immutable-tree manifests, exact HTTP SHA-256, production 360/390 light/dark keyboard geometry, GET/HEAD-only two-vantage smoke, service/Nginx/SQLite checks, pointer snapshots and executed rollback/forward in `REL-0165` and `E-1025`.
- Changed: built canonical source twice, assembled immutable
  `release165-5b1735c`, activated it, verified production geometry and hashes,
  executed a complete release164 rollback and restored release165. Updated
  `E-1025`, `REL-0165`, `CURRENT-HANDOFF.md` and `START-HERE.md`; product blobs,
  prices, routes, backend and infrastructure configuration were not changed in
  this release workstream.
- Verified: byte-identical builds are 353 files / 25,048,287 bytes with digest
  `51f75570…2e7`; immutable tree is 356 files / 25,058,458 bytes with manifest
  `7ea25e87…e4c`, full source parity and owner/mode drift 0. Production
  Chromium 360 light and 390 dark proved 39/40 disabled, 40/40 enabled without
  blur, one hit-testable primary, exact support scope/price, contact handoff,
  zero overflow and no POST. External and VPS smoke passed 14/14 after
  activation, 14/14 on release164 rollback and 14/14 after forward restore;
  service/Nginx/SQLite stayed green and pointer residue is zero.
- Unverified: no production form was submitted; live iOS loaded the exact
  production route, while the actual software-keyboard interaction was run on
  the same reviewed source before publication and bound to production by exact
  HTTP hashes. Organic conversion uplift and revenue impact are not claimed.
- Risks/rollback: a stale CSS cache could mix old hide logic with new HTML; iOS and Chromium attach fixed content to different viewports; immutable overlay could disturb server-owned files; pointer rotation could target the wrong previous release. Preflight resolves exact pointers/hashes first; activation uses explicit validated paths; rollback atomically restores both public pointers to release164 and its previous pointer to release162.
- Next: run the final full public/backend/Brain and focused browser gates on the
  exact release documentation commit, obtain independent release-proof review,
  then submit and integrate this workstream without modifying product blobs.
