# Workstream handoff

- Branch: `codex/salon-cloud-access`
- Outcomes: `OUT-001`
- Goal: user's explicit infrastructure request: work in a browser while the Mac is off. OUT-001 development-environment enabler only; no customer-path or production change.
- Base: `8c960b733dda103e170811b1795c93f03465934f` after fresh fetch. Original `.claude/launch.json` is user-owned and remains untouched.
- Acceptance: current repository selectable in Codex Cloud; setup and checks run in a clean cloud checkout; actual release baseline and project context available without Mac paths or credentials.
- Proof: cloud configuration and terminal readback; clean-checkout setup; pinned preview hash verification and isolation tests; Brain test/validate. Evidence: `docs/brain/evidence/cloud-workspace-20261003/`.
- Changed: portable stdlib-only setup, pinned public reference, isolated preview server, verification commands, cloud continuation guide and agent/README entrypoints.
- Verified locally: 534 exact public hashes plus the server redirect; 7 workspace tests, 39 Brain tests, 652 Node tests pass / 9 existing skips; Brain strict validation and diff whitespace check. Source versions: Node 22.22.3 and Python 3.14.7.
- Unverified: cloud container execution and saved environment readback are pending. No claim of backend, payment, deployment or device-specific browser testing.
- Scope checks: strict scan hard=0/warnings=74; integration owner explicitly accepted pre-existing terminal-worktree and dormant-ref warnings through `conflicts --allow-warnings`. No dirty overlap accepted.
- Risks/rollback: fail on baseline hash drift; never present old root HTML as current production. No production, database, payment, contact or credential changes. Revert development files or disable the environment for rollback.
- Scope decision: CURRENT-HANDOFF.md is reserved by an active workstream. The first declaration was abandoned through Brain; this declaration excludes that singleton. Durable cloud documentation is in docs/CLOUD-WORKSPACE.md and this handoff.
- Next: integrate the locally verified setup, then test and save the configured Codex Cloud environment from a clean cloud container.
