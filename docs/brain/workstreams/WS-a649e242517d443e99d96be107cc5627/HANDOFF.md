# Workstream handoff

- Branch: `codex/release157-analytics-v2-v2`.
- Base: `c891d24254e671292d327dc485d9d71a342156d1`.
- Outcome: `OUT-006`.
- Goal: publish Analytics v2 as immutable production release157, with the
  server boundary activated before the static client, local approximate
  geography, exact health/smoke evidence and an executed rollback/forward
  restore.

## Acceptance

- The exact canonical Analytics v2 result passes 553/553 Node, 30/30 backend,
  39/39 Brain tests, strict validation and compile/diff checks.
- Two complete static builds are byte-identical and the inactive release tree
  matches its recorded file count, bytes and SHA-256 manifest.
- The backend installer accepts only pinned source hashes and the exact live
  pre-state; Nginx validates before restart and the service returns healthy.
- Rollout order is server first, static second. Legacy `/api/visit` is disabled
  before any Analytics v2 public page is live.
- The public endpoint accepts one synthetic consented funnel, deduplicates its
  replay, exposes only the matching anonymous session, then deletes it on a
  signed revoke; no real contact, order, text, file or production row is read.
- Fresh public browsing emits no analytics before consent; the admin endpoint
  is forbidden without authentication; the Russian dashboard loads under its
  strict self-only CSP without console or layout errors.
- External and VPS production smoke pass before mutation, after release, during
  rollback and after forward restore. Both static symlinks and the backend are
  restored together at every checked point.

## Proof plan

- `node --test tests/*.test.js`.
- `python3 -X dev -W error::ResourceWarning -m unittest discover -s backend/salon_bot/tests -p 'test_*.py' -v`.
- `python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v`.
- `python3 -m py_compile backend/salon_bot/analytics_v2.py backend/salon_bot/install_analytics_v2.py`.
- `./bin/brain validate --strict`, `git diff --check`, two deterministic builds.
- Checked-in GET/HEAD production smoke from the operator network and VPS.
- Exact synthetic anonymous event/dedupe/readback/revoke check and real-browser
  consent/CSP/responsive checks.
- Installer rollback to the captured pre-state followed by a second forward
  install and complete smoke repetition.

## Changed

- Published immutable `release157-c891d24`; `current` and `dist` resolve to it,
  and `previous` resolves to `release156-1b8f03f`.
- Installed pinned Analytics v2 backend/contract, root-only signing secret,
  local DB-IP City Lite August 2026, edge limits and strict admin CSP.
- Disabled legacy `/api/visit` before switching static clients.
- Added durable release record `REL-0157`, refreshed `START-HERE` and replaced
  `CURRENT-HANDOFF` with current production truth.

## Verified result

- Site 553/553, backend 30/30, Brain 39/39; compile, strict validation and diff
  checks green.
- Deterministic 353-file payload and exact 356-file immutable live tree verified.
- Production synthetic funnel 6/6, duplicate replay 6/6, ordered chronology,
  revoke 6/6 and replay block; exact synthetic trace cleaned to zero.
- External/VPS smoke 14/14 before release, after first activation, in executed
  release156/backend rollback and after second forward restore.
- Live Chromium: no collection before consent, strict admin CSP, 390/1440 no
  overflow, honest unauthenticated state and zero external admin resources.
- Three independent final reviewers returned GO with P0=0/P1=0.

## Risks and rollback

Rollback was executed and forward-restored. The current exact rollback target
is release156 plus
`/root/salon_bot/backups/analytics-v2-20260812T165403022124Z`. Monthly DB-IP
replacement and the pre-existing duplicate Nginx server-name warnings are P2
owned by integration/operations; legacy analytics remains outside v2 readback.

## Next

Freeze this verified result, integrate the durable release truth into fresh
canonical, and let the authenticated owner confirm the first organic consented
session without importing or seeding legacy data.
