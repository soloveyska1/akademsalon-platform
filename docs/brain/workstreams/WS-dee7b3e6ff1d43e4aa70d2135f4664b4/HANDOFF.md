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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: browser history may restore a selected radio after scripts
  build a saved-draft dock, a stale edge response may hide the new source, or a
  static overlay may lose server-owned files. Exact source hashes, an inactive
  baseline-overlay release, cache-busting browser paths and real Back-path proof
  contain those risks. Rollback changes only `current` and `dist` to immutable
  `release162-977c1f6`; backend/database are never restored or restarted.
- Next: review and commit the manifest plus this handoff.
