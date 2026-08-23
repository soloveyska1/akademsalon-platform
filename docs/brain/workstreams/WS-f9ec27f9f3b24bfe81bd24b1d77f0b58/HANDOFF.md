# Workstream handoff

- Branch: `codex/release161-practice-continuity`
- Outcomes: `OUT-006`
- Goal: publish canonical `1c5f0eed` as immutable static release161 so the
  public practice ladder remains continuous through configurator, request and
  prepayment specification, without backend or analytics changes.
- Acceptance: inactive release is assembled from exact canonical build while
  preserving the three server-owned files; source/release/HTTP hashes agree;
  external and VPS smoke pass before and after activation; production Chromium
  proves the 2,500 / 8,000 / 14,000 routes at 390 and 1440 in light/dark with
  zero overflow/console regressions; an executed static rollback to release160
  and forward restore both pass; service, Nginx, SQLite and backend hashes remain
  unchanged; G10 closes with P0=0/P1=0.
- Proof: exact canonical tests/build and strict Brain validation; immutable tree
  manifest and owner/mode parity; two-vantage GET/HEAD smoke; read-only browser
  matrix; release160 rollback/forward chronology recorded in `E-1022`.
- Changed: built exact canonical `dist/client`, assembled immutable
  `release161-1c5f0ee` from the release160 baseline, preserved all three
  server-owned files, activated both static pointers, executed rollback to
  release160 and restored release161. Added `REL-0161`, `E-1022` and updated the
  canonical start/current handoffs. No backend, Analytics, pricing or public
  product file was changed by this release workstream.
- Verified: public 589/589, backend 31/31, Brain 39/39, focused 25/25; public
  build 353 files / 25,030,042 bytes / digest `00cc9703…6952`; immutable tree
  356 files / 25,040,213 bytes / manifest `a455a53b…23f4`; source parity
  353/353, owner/mode drift 0 and exactly five expected public differences from
  release160. Repository/tree/HTTP hashes agree. Production Chromium at
  390/1440 light/dark has overflow 0 and console 0 for the selector and exact
  practice routes. External/VPS smoke passed 14/14 after activation, during
  rollback and after forward restore. Service active, Nginx valid, SQLite
  `ok`; backend and infrastructure hashes unchanged. Three independent reviews
  report P0=0/P1=0/P2=0.
- Unverified: organic conversion effect and the rejected lead's acquisition
  source remain unknown by design; release proof must not be used as uplift
  evidence.
- Risks/rollback: this is static-only. Any hash, ownership, smoke or browser
  mismatch blocks activation. Rollback moves both static pointers to immutable
  `release160-135cb45`; backend and database are never restored or restarted.
- Next: commit this release record, submit the exact result SHA, integrate it
  into fresh canonical main, then create a separate bounded workstream for the
  result passport linked to the existing fictional specification.
