# Workstream handoff

## Historical pre-publish checkpoint — superseded

The following block records the exact state before network recovery. Its
statements that release102 was not staged/live were true at that checkpoint and
are superseded by the actual-result block below; they are retained rather than
rewritten as if publication had already happened.

- Branch: `codex/release102-out007-search-catalog`
- Outcomes: `OUT-007`
- Goal: publish the exact integrated OUT-007 result as a deterministic static
  release without form, OAuth, payment, analytics-consent or client-data
  mutation.
- Acceptance: the staged and live public trees have the same recorded digest;
  `current` and compatibility `dist` resolve to release102; checked-in GET/HEAD
  smoke passes 14/14 externally and on the VPS; production browser proof covers
  home, services and cabinet search at mobile/desktop in light/dark; an executed
  switch to release101 and forward restore both pass health/hash checks.
- Proof: full deterministic regression, strict Brain validation, reproducible
  public build, exact file/tree hashes, `tests/production-smoke.js`, isolated
  production browser matrix and release receipt `REL-0102`.
- Changed: no repository product file and no production path. Exact OUT-007
  source `1c9c7a382de13e9c2877221034269144eab702a5` is integrated in canonical
  `e2f76c3d71c82169f52e3c94874424e150cc54d3`. Product regression is 500/500,
  Brain is 39/39 and strict-valid. Two static builds are identical: builder
  output 338 files / 24,016,962 bytes / SHA-256 manifest digest
  `eb7794ed352b7a065691ff68d1103063a8a044ac88f9d90a0a18ee9ab96cb145`;
  the deploy selection excludes public `package.json` and is 337 files /
  24,016,342 bytes / digest
  `54f8352b3686bee99957591e2fb5b2a78ab85ba329aa5f141a35f01258d56b76`.
- Verified: one successful read-only VPS session resolved both production
  symlinks to `release101-b9837a34c4e`, counted 339 server files and reproduced
  app SHA-256
  `c46d3984aa291b611af16f2fea808e15a92f7178df18591ee9a5ad8eda66ec41`.
  The count difference is explicit: release101 excludes source `package.json`
  and preserves server-managed `.indexnow-key` plus
  `analysis/growth-baseline-2026-07-24.ipynb`. Release102 must preserve those
  two paths and upload the 337-file selection without delete sync.
- Unverified: release102 is not staged or live; no release102 backup exists;
  production remains release101. After the successful read-only session, the
  VPS stopped completing SSH banners and TLS handshakes. External smoke against
  unchanged release101 was 5/14 with transport status 0, and isolated WebKit
  timed out before DOMContentLoaded. All later SSH attempts failed before a
  session, so no remote command or file mutation occurred.
- Risks/rollback: stop before switching on any source/build mismatch, P0/P1,
  failed backup, ownership/mode error or red smoke. After switching, atomically
  repoint both symlinks to `release101-b9837a34c4e`; preserve both release
  directories and the timestamped backup.
- Next: after SSH/TLS recovery, first re-prove exact release101 symlinks and app
  hash; create the timestamped backup and inactive `release102-1c9c7a382de`;
  verify all 337 payload hashes and the preserved server paths; require a green
  14/14 baseline before switching. Then run two-vantage smoke, production
  browser matrix and executed release101 rollback/forward restore before
  creating `REL-0102`.

## Actual result after network recovery

- Published exact canonical `e2f76c3d71c82169f52e3c94874424e150cc54d3`
  as immutable `release102-e2f76c3d71c8`; `current` and `dist` resolve there.
- Live tree: 337 exact public payload files plus the two preserved server paths,
  339 total; ownership/modes and isolated release inode were verified.
- Backup:
  `pre-release102-e2f76c3d71c8-20260803T062310Z.tar.gz`, 19,241,636 bytes,
  SHA-256
  `5eba3e7da2df9acdef692b6d7c3c6ef2ed72d90c979c9dfe52ba02111cc7c7ca`.
- Checked-in read-only smoke passed 14/14 on the VPS and 14/14 externally.
  Executed rollback to release101 and forward restore to release102 both passed
  health and exact catalogue-JS hash discrimination.
- Post-publish browser proof then reproduced a P1: home, services and dashboard
  expose no visible pointer search trigger from 921 through 1240 px. Release101
  has the same gap, so rollback is operationally valid but does not repair it.
- Verdict: publication and rollback succeeded, but release102 is not a truthful
  G10 GO/P1=0. `REL-0102` records the exception window; release103 candidate
  `e97a66a` owns the bounded closure under `E-1010`.
- No form submit, OAuth, payment, analytics-consent or client-data mutation was
  used. The failed inactive staging tree with Apple `._` sidecars was preserved
  rather than deleted without a cleanup plan.
- Current state: durable receipt complete and ready for workstream submission.
- Next: integrate this historical record, close the `production:deploy`
  reservation, integrate release103 product result, then deploy release103 from
  a fresh dedicated workstream with live smoke and executed rollback/forward.
