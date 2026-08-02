# Workstream handoff

- Branch: `codex/out-001-submit-safety`
- Outcomes: `OUT-001`
- Goal: make every inventoried public `/orders` producer preserve one durable
  request identity for one unchanged intent, fail closed for changed intent, and
  make the checked-in production smoke incapable of an unguarded order POST.
- Acceptance: strict 2xx/`ok:true`/canonical-ID success; identical intent reuses
  its ID across retry/reload; changed intent, unavailable durable storage and 409
  never rotate the ID or send a new request; default smoke path proves zero POST;
  all product, contract, generated-bundle and Brain gates pass.
- Proof: failing-first executable state tests, generated release parity, full
  `node --test tests/*.test.js`, `brain:test`, `brain:validate`, conflict scan,
  three independent read-only reviews and daily council observations.
- Changed: none yet.
- Unverified: server dedupe/TTL, transaction/outbox, bot/operator delivery,
  cabinet cardinality and cleanup remain external hard gates; no POST is allowed.
- Risks/rollback: stale commit `91bd3c4` is specification input only, never a
  blind cherry-pick; preserve public UI and wire fields; rollback by exact commits.
- Next: commit this bootstrap, run strict conflicts, then reproduce current
  failures before implementation.
