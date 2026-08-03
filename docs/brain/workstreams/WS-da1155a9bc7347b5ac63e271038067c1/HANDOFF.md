# Workstream handoff

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
- Changed: none yet.
- Unverified: release102 is not staged or live; production remains release101.
- Risks/rollback: stop before switching on any source/build mismatch, P0/P1,
  failed backup, ownership/mode error or red smoke. After switching, atomically
  repoint both symlinks to `release101-b9837a34c4e`; preserve both release
  directories and the timestamped backup.
- Next: commit this bootstrap, prove the exact public artifact, then stage and
  switch only after every pre-publish gate is green.
