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
- Changed: none yet.
- Unverified: production preflight, activation, rollback and final evidence are
  pending.
- Risks/rollback: this is static-only. Any hash, ownership, smoke or browser
  mismatch blocks activation. Rollback moves both static pointers to immutable
  `release160-135cb45`; backend and database are never restored or restarted.
- Next: review and commit the manifest plus this handoff.
