# Workstream handoff

- Branch: `codex/release101-out006-privacy`
- Outcomes: `OUT-006`
- Goal: publish exact integrated canonical `b9837a34c4e` as release101 without
  production submit, OAuth, payment, upload, client-data access, analytics
  consent mutation or deletion.
- Acceptance: source/product/Brain gates green; deterministic public tree in a
  new release directory; `current` and `dist` agree; health and checked-in 14/14
  GET/HEAD smoke green; exact privacy runtime hashes match; executed rollback to
  release100 and forward restore reproduce both releases.
- Proof: 492/492 product, Brain 39/39, strict validation, deterministic tree
  count/digest, server backup, exact symlink and live hash evidence, checked-in
  production smoke and real rollback-forward record in `REL-0101`.
- Changed: built the exact 339-file canonical artifact, backed up release100,
  published `release101-b9837a34c4e`, recorded source/tree/live hashes and
  ownership, executed two-vantage smoke, isolated production browser proof and
  release100 rollback/release101 forward restore in `REL-0101`; advanced
  `START-HERE` and `CURRENT-HANDOFF` to current truth.
- Verified: failure-first 10/10, independent P0/P1/P2=0, product 492/492,
  Brain 39/39, strict validation, exact 339-file digest, matching three runtime
  hashes, key routes 200/missing 404, GET/HEAD smoke 14/14 from two vantage
  points, no-consent browser privacy behavior and executed rollback-forward.
- Unverified: no production submit, analytics opt-in, OAuth, payment, upload or
  client-data mutation was attempted; server analytics authority and OUT-001
  marker/lookup/cleanup remain unavailable.
- Risks/rollback: any source mismatch, failed health/smoke, differing symlinks,
  credential-bearing analytics request or unexpected write is a stop. Upload
  uses a new versioned directory without delete sync. Rollback target is exact
  `release100-1c275bffde93`; both symlinks switch atomically together.
- Next: commit and integrate this release proof, ask the user to inspect
  release101, then bootstrap the separately scoped search/catalogue clarity
  workstream described in `CURRENT-HANDOFF`.
