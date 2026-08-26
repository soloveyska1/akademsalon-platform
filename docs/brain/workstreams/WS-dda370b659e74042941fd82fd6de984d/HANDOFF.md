# Workstream handoff

- Branch: `codex/release174-out001-final`
- Outcomes: `OUT-001`
- Base: `d6f1a1b4783d5600abcfe5ecce835c56e5c3bac4` (`origin/main`).
- Goal: finish `REL-0174` from the integrated generated-link hotfix, repeat the
  exact bounded production journey, and reconcile the durable OUT-001 record.
- Acceptance: only the stopped-service two-installer transition is used; exact
  hashes and preimages are read back; probe proves one idempotent synthetic case
  through API, isolated delivery and cabinet, then leaves zero active residue and
  a second opaque tombstone; rollback and forward are executed; ordinary health,
  economic guard, open deposit issuance, static release pointers and journal stay
  unchanged; final independent reviews have P0=0/P1=0.
- Proof: exact local 30/30 focused, 129 backend, 623 public and 39 Brain suites;
  production preflight; installer JSON; digest-only probe JSON; aggregate SQLite
  inventory including `table_xinfo`; two-vantage GET-only 14/14 smoke; executed
  rollback-forward; stabilized service/log readback; `brain:test` and
  `brain:validate`.
- Changed: added `E-1038` and `REL-0174`; reconciled OUT-001 in ROADMAP and the
  current truth in START-HERE/CURRENT-HANDOFF. Production runtime advanced from
  `7add4843…28cf` to `cba09cf5…44a5` through the exact two-installer chain.
- Verified: preflight health/SQLite/economics/link inventory; staged exact
  hashes; old rollback → new apply → `changed=false`; repeated digest-only probe
  with one exact case and zero active residue; new rollback and final forward;
  external and VPS smoke 14/14 before, after initial activation, on rollback and
  after forward. Final PID `768912`, `NRestarts=0`, Nginx valid, WAL,
  `quick_check=ok`, FK=0, link inventory 30/30, hidden links none, guard
  `49cf27f7…172a3`, deposits `earned-v2:open`, two opaque tombstones and static
  release173/release172 pointers.
- Reviews: final security/trust, economics/eligibility and product/ops all report
  GO with P0=0/P1=0/P2=0; all documentary P2 requests are closed.
- Journal: SQLite lock/traceback/critical counts are zero. Six upstream Telegram
  `Bad Gateway` polling messages between `05:13:50` and `05:14:00` recovered
  without restart; the `05:14:05–05:19:13` window was clean while health, PID
  and DB stayed stable.
- Final read-only freeze at `05:30:25+03:00`: same PID, `NRestarts=0`, health
  uptime 1095 seconds, exact release hashes, zero active residue, capability
  absent, two tombstones, exact 30/30 link inventory, unchanged guard/open
  deposits and clean exact failure-pattern journal since `05:14:05`.
- Final local gates: exact pinned focused 30/30, backend 129 with one expected
  `aiosqlite` skip, public 623/623, Brain 39/39, clean diff check and strict
  `VALID records=111 links=223 manifests=60`.
- Unverified: canonical integration remains. Exact staging path was validated
  `0:0/0700` non-symlink and removed; source backups remain.
- Risks/rollback: direct new-installer apply against the old installed runtime is
  forbidden. Stop and verify `salon-bot-v2`, use exact old installer
  `296c21c3…7883` with backup
  `/root/salon_bot/backups/out001-synthetic-20260826T012302978117Z`, verify the
  preimage/assets-absent state, then use new installer `031bedbe…d186`. Never
  restore SQLite; additive migration and opaque tombstones remain.
- Next: freeze the evidence commit and integrate.
