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
- Proof: baseline 0/15; focused affected suite 60/60; full product regression
  452/452; injected default smoke records GET/HEAD only and zero `/orders`;
  generated release parity, `brain:validate`, conflict digest
  `b8232f219111685c429cc49fc4311bba4cda58ab050eede1f6d2e83922bbfa93`,
  Brain unit suite 39/39, three independent read-only agent reviews, evidence-
  bound Kimi/GLM, code-reading Sonnet approve and one Opus veto review.
- Changed: atomic v2 producer/scope/ID/intent record; strict safe-ID success;
  single-flight non-aborted POST; exact-ID terminal clear; both producers use the
  helper; production smoke is default-refusing read-only; home bundle rebuilt;
  all 90 shared-runtime HTML consumers use `20260802out001submit1`; durable
  plan and `E-1003` added without a parallel JSON truth store.
- Unverified: server dedupe/TTL, transaction/outbox, bot/operator delivery,
  cabinet cardinality and cleanup remain external hard gates; no POST is allowed.
- Risks/rollback: stale commit `91bd3c4` was specification input only, never a
  blind cherry-pick. Legacy v1 state fails closed; server dedupe remains unknown;
  rollback by reverting the exact implementation and cache-key commit.
- Next: commit the clean verified implementation, rerun exact fetch/conflicts,
  then freeze its SHA with `workstream set-status submitted`.
