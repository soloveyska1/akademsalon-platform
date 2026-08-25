# Workstream handoff

- Branch: `codex/out-006-sqlite-recovery`
- Outcomes: `OUT-006`
- Goal: eliminate the production-wide SQLite `BUSY_SNAPSHOT` poison state in
  which one concurrent Analytics v2 commit leaves the shared bot connection
  unable to write until process restart.
- Acceptance: a deterministic WAL race first proves that the old shared lane
  raises `SQLITE_BUSY_SNAPSHOT`; the installed runtime sends ordinary `_exec`
  statements through one dedicated autocommit writer and never replays or
  rolls back another task; explicit `db.transaction()` keeps its isolated
  connection and rollback owner; rowcount/lastrowid and post-error usability
  remain intact; the installer is exact-hash/pattern fail-closed and has an
  exact-source rollback that never restores SQLite data.
- Proof: focused Python regression on local CPython and the production Python
  3.10/real-aiosqlite venv; existing Analytics v2, auth and promo suites; full
  public and Brain regressions; strict validation; two independent P0/P1
  reviews; production scheduler/API/journal smoke, exact rollback/forward and
  `PRAGMA quick_check`. Durable production evidence belongs in `E-1032` and
  release record `REL-0170` only after the live gates pass.
- Changed: added one hash-pinned installer over the exact ten live runtime
  sources and eighteen focused tests. The candidate opens an autocommit writer,
  serializes ordinary `_exec` calls with `asyncio.Lock`, makes the shared reader
  `query_only`, migrates every reviewed direct runtime DML call, and converts
  multi-write units to explicit isolated transactions. Deposit activation and
  refund re-read invariants under `BEGIN IMMEDIATE`, use status CAS and include
  all money/bonus ledger effects in one unit-of-work. Installer apply and
  rollback preserve uid/gid/mode and compensate a post-replace verification
  failure to a coherent source set. No schema or SQLite data migration exists.
- Verified: focused local 17 pass + one environment skip; exact production
  Python 3.10/aiosqlite 18/18; backend 76/76 with only that local environment
  skip; public 603/603; Brain 39/39; strict corpus validation
  `records=99 links=184 manifests=48`; Python compile and `git diff --check`.
  Exact copies of all ten production sources passed pinned check, apply,
  idempotent check, rollback and forward apply while retaining metadata; an
  isolated copy of the live database passed real `db.init`, writer, explicit
  transaction and query-only rejection smoke. Two independent final reviews
  report GO with P0=0/P1=0. Pinned candidate `db.py` is
  `51702018cf8bf97d3bfa97675133bf8dc21d8d5b2692577cb079d0609588b2a1`;
  `services/deposit.py` is
  `8ecfa3492bef54bb4501db65c59bb0a403ef2c5ba798b04426c1636a1b24d816`.
- Unverified: production source apply, exact rollback/forward drill,
  130-second scheduler window and final external/VPS smoke.
- Risks/rollback: standard cancellation-at-commit ambiguity remains P2 for a
  bounded transaction audit and 24-hour post-release watch. Rollback stops the
  service, restores only the exact ten pre-fix source files from the installer
  manifest, compiles and restarts; restoring an SQLite backup is forbidden.
- Next: commit this exact reviewed snapshot, repeat fetch/conflict preflight and
  execute the pinned production release with rollback/forward proof.
