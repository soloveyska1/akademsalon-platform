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

Only this release declaration exists so far. Production has not been mutated.

## Risks and rollback

The hard release risks are contract drift, partial server/static activation,
SQLite or Nginx failure, accidental collection before consent, attribution
license omission and an untested rollback. Any failed hard gate stops the
release. The rollback target is the exact current release156 static tree plus
the installer's exact pre-v2 backup; the rollback drill must be executed before
the final GO and then forward-restored to release157.

## Next

Commit this reservation, prove scope is conflict-free, rerun all local gates,
build the immutable artifact, then perform the bounded backend-first rollout.
