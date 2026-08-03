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
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: any source mismatch, failed health/smoke, differing symlinks,
  credential-bearing analytics request or unexpected write is a stop. Upload
  uses a new versioned directory without delete sync. Rollback target is exact
  `release100-1c275bffde93`; both symlinks switch atomically together.
- Next: commit this bootstrap, run strict conflict detection, then build and
  verify the exact public artifact before any production switch.
