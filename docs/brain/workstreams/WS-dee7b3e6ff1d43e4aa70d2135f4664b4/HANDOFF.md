# Workstream handoff

- Branch: `codex/release164-practice-back-parity`
- Outcomes: `OUT-008`
- Goal: publish canonical `1ea81c68` as immutable static release164 so the
  selected 2,500 / 8,000 / 14,000 RUB practice scope survives specification
  navigation and Browser Back even with an existing saved draft, without
  changing the Otisk visual concept, prices, backend or analytics.
- Acceptance: build the exact canonical source twice; assemble inactive
  `release164-1ea81c6` from verified release162 while preserving server-owned
  files; prove that only `otchet-po-praktike.html` differs and source/release/
  HTTP hashes agree; external and VPS GET/HEAD smoke pass; production Chromium
  proves fresh diagnostic/editing/support handoffs, initial saved-draft guard,
  pointer and Space activation, one live-region announcement, saved-draft
  support -> fictional specification -> Back parity, 360/390 light/dark and
  hidden 1440 desktop dock; execute rollback to release162 and forward restore
  to release164; service, Nginx, SQLite and backend hashes remain unchanged;
  record the failed-and-rolled-back release163 attempt separately; G10 closes
  with P0=0/P1=0.
- Proof: exact canonical public/backend/Brain tests and deterministic build;
  immutable tree/hash/owner/mode parity; two-vantage GET/HEAD smoke; production
  Playwright; pointer chronology, rollback/forward evidence and final health in
  `E-1024`, `REL-0163` and `REL-0164`.
- Changed: exact canonical `1ea81c68` built twice as 353 files / 25,041,362
  bytes / digest
  `7915d08510de3e24eee8dd95bd49818dc8b52e73619245c10d65148bb789be97`.
  Immutable `release164-1ea81c6` was assembled from release162 plus the exact
  overlay; 353/353 public hashes matched, exactly one page differed, and the
  final tree is 356 files / 25,051,533 bytes / manifest
  `c3050fffb6d1a55b5132cb0fe876e16d5887ba16fe89385887ff754c564e8053`
  with owner/mode drift 0. Production Chromium passed all fresh routes, saved
  draft pointer/Space, single-announcement, support specification/Back parity,
  360/390 light/dark and hidden 1440 dock checks. External and VPS smoke passed
  14/14 after activation, in release162 rollback and after forward restore.
  `REL-0163`, `REL-0164`, `E-1024`, START-HERE and CURRENT-HANDOFF now record
  the failed first attempt and final live truth.
- Unverified: no conversion uplift is inferred and production submit was not
  performed. The separate mobile-keyboard reachability question remains open.
- Risks/rollback: browser history may restore a selected radio after scripts
  build a saved-draft dock, a stale edge response may hide the new source, or a
  static overlay may lose server-owned files. Exact source hashes, an inactive
  baseline-overlay release, cache-busting browser paths and real Back-path proof
  contain those risks. Rollback changes only `current` and `dist` to immutable
  `release162-977c1f6`; backend/database are never restored or restarted.
- Next: rerun deterministic release gates on the documentation revision,
  submit this workstream, fetch canonical truth, integrate the exact result and
  leave production at `current=dist=release164-1ea81c6`,
  `previous=release162-977c1f6`.
