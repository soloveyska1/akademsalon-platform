# Workstream handoff — Brain 1.5

- Branch: `codex/brain-v2-out-001`.
- Outcome anchor: `OUT-001`; product implementation is outside this workstream.
- Goal: make the existing Project Brain sufficient for clean new sessions and
  locally coordinated parallel branches without a second durable truth store.
- Acceptance: deterministic context; self-created scoped manifest; frozen result
  lifecycle; actual ref/worktree conflict evidence; explicit terminalization.
- Changed: Brain schema v2 with legacy-v1 normalization, workstream CLI,
  per-workstream handoff, ref-manifest discovery and compact conflict decisions.
- Proof: `brain:test`, `brain:validate`, full product tests, council connectivity
  and independent agent review; exact final results belong in `E-1001`.
- Unverified: remote canonical integration and post-push SHA verification.
- Risks/rollback: no force-push; explicit refspec only; revert commits in reverse
  order; never delete `.brain` because council state shares that ignored root.
- Next: close all P1 review findings, freeze the implementation SHA as submitted,
  fast-forward canonical, then commit the integrated terminal revision.
