# Workstream handoff

- Branch: `codex/release100-out005`
- Outcomes: `OUT-005`
- Goal: publish exact integrated canonical `1c275bffde93` as release100 without
  production submit, OAuth, payment, upload, client-data access or deletion.
- Acceptance: pre-publish source/Brain gates green; deterministic public tree
  staged in a new release directory; `current` and `dist` switch atomically;
  health and 14/14 GET/HEAD smoke green; exact OUT-005 assets/routes verified;
  real rollback to release99 and forward restore reproduce both release hashes.
- Proof: 482/482 product tests, Brain 39/39 and strict validate; public-tree
  count/hash; server backup and resolved symlinks; checked-in read-only
  production smoke; live app/catalog hashes; read-only services/configurator
  browser check by an independent reviewer; executed rollback/forward evidence
  in `REL-0100`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: network interruption before switch must leave release99 live;
  mismatch after switch is an immediate rollback stop. Never use delete sync,
  broaden remote paths or touch data services. Rollback target is exact
  `release99-96156040130c`, already proven in `REL-0099`; both symlinks must
  resolve to the same release before and after every switch.
- Next: review and commit the manifest plus this handoff.
