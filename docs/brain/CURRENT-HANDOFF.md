# Current handoff

## Canonical and production truth

- Canonical source is `c891d24254e671292d327dc485d9d71a342156d1`.
- Production `current` and compatibility `dist` resolve to
  `release157-c891d24`; `previous` resolves to `release156-1b8f03f`.
- Release157 has G10 GO with P0=0/P1=0. Exact files, hashes, tests, synthetic
  cleanup, browser proof and executed rollback/forward are in `REL-0157`.
- Backend rollback is the exact final pre-install backup
  `/root/salon_bot/backups/analytics-v2-20260812T165403022124Z` together with
  static release156. The installer refuses a stale or mixed state.
- The active service and Nginx are healthy; final external and VPS read-only
  smoke each passed 14/14 after forward restore.

## What Analytics v2 now proves

- The Russian master dashboard is live at `/admin-analytics.html` and calculates
  complete server-side metrics for one selected period: anonymous visitors and
  sessions, online activity, time, entry/exit, sources/campaigns, device/browser/
  OS, approximate geography, transitions, six-stage funnel, conversion, safe
  chronology, errors and collection health.
- The contract covers 87 public pages and 45 allowlisted events. Idempotent IDs,
  occurrence time, client sequence, atomic thirty-minute sessionisation and
  server pagination close the previous silent-drop, duplicate, >100% conversion
  and mixed-window failures.
- Live synthetic proof accepted six ordered funnel events, deduplicated the
  replay, deleted all raw rows on revoke and blocked replay. The exact synthetic
  trace was removed; final v2 raw and health counts were zero at the release
  checkpoint.
- A fresh real browser sends no Analytics v2 or legacy request before consent.
  The live private page has strict self-only CSP, no external resources and no
  overflow at 390/1440 px. Unauthenticated admin readback is 403.

## Privacy and interpretation

- A visitor is a random anonymous browser ID, not a known person. Contacts,
  orders, login identity, raw IP/UA/referrer, query, form text and files are not
  linked or stored in the v2 schema.
- Approximate geography is produced locally from the August 2026 DB-IP City Lite
  snapshot. The UI visibly attributes DB-IP / CC BY 4.0 and calls no remote geo
  service.
- Collection is consent-only and blockers/refusal reduce coverage. The dashboard
  explicitly says this; it must not be presented as a census of all people.
- Trustworthy history begins at release157. Legacy rows are intentionally not
  imported or read because their meaning and accuracy cannot be defended.
- Raw v2 events are retained for at most 365 days. Revoke cascades visitor,
  sessions and events and keeps only a bounded deletion-proof hash to reject
  offline replay.

## Verification summary

- Site 553/553; backend 30/30; Brain 39/39; compile, strict validation and diff
  checks green; three independent reviews GO with P0=0/P1=0.
- Deterministic payload: 353 files / 24,940,374 bytes, manifest
  `35dfa8aa…c49`; live immutable tree: 356 files / 24,950,545 bytes, manifest
  `875fd192…73e`.
- Server-first activation disabled legacy `/api/visit` before the public v2
  scripts became live. Exact module, contract, source and Nginx hashes match the
  pinned installer result.
- Rollback to release156 and pre-v2 runtime passed external/VPS 14/14; the second
  backend-first forward install and release157 restore again passed external/VPS
  14/14 plus live Chromium and SQLite integrity.
- Production contacts, orders, logs and legacy visit contents were never read;
  no real order or user was created, changed or deleted.

## Remaining P2

- Replace the monthly DB-IP snapshot with the verified September file by
  15 September 2026; integration/operations owns it.
- Consolidate the pre-existing duplicate Nginx `server_name` definitions before
  the next topology change. Syntax and the active release remain healthy.
- Legacy analytics retention/deletion needs a separate privacy workstream. Do
  not backfill it into Analytics v2.

## One exact next step

Open the authenticated master dashboard at
`https://akademsalon.ru/admin-analytics.html`, confirm the first organic
consented session appears, and treat an initially empty series as correct rather
than seeding or importing unverifiable legacy history.
