# Workstream handoff

- Branch: `codex/release165-keyboard-shelf`
- Base: `5b1735c2c959ce63733b270259f74965d2fe46d3` (`origin/main`).
- Outcomes: `OUT-008`
- Goal: publish the already integrated mobile configurator keyboard shelf as immutable release165 without changing its verified product blobs, pricing, routes, submit contract, backend or infrastructure.
- Acceptance: two clean public-client builds are byte-identical; only the expected canonical public files differ from release164; server-owned assets, ownership and modes remain intact; production `current` and `dist` resolve to release165 and `previous` to release164; external and VPS read-only smoke pass; live Chromium/iOS verifies one reachable primary above the software keyboard, 39/40 disabled, 40/40 enabled, exact practice-support price/scope and no POST; executed release164 rollback returns old hashes and health, then forward restore returns release165 hashes and health; P0/P1/P2=0.
- Proof: full public/backend/Brain regression, deterministic build counts/digest, public-file and immutable-tree manifests, exact HTTP SHA-256, production 360/390 light/dark keyboard geometry, GET/HEAD-only two-vantage smoke, service/Nginx/SQLite checks, pointer snapshots and executed rollback/forward in `REL-0165` and `E-1025`.
- Changed: none yet.
- Unverified: release165 has not been built, assembled, activated or tested in production; uplift is not claimed.
- Risks/rollback: a stale CSS cache could mix old hide logic with new HTML; iOS and Chromium attach fixed content to different viewports; immutable overlay could disturb server-owned files; pointer rotation could target the wrong previous release. Preflight resolves exact pointers/hashes first; activation uses explicit validated paths; rollback atomically restores both public pointers to release164 and its previous pointer to release162.
- Next: commit this declaration, pass strict conflicts, then build twice and complete read-only production preflight before any pointer mutation.
