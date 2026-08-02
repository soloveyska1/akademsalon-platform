# Workstream handoff

- Branch: `codex/out-004-case-context-truth`
- Outcome: `OUT-004`
- Base: `4c43a42dfc67878d116a79feb528ca3bca4c4309`
- Implementation: `4bb148af0abed033bd113249cda82fe45b60205b`
- Lifecycle truth: read `status` and `result_sha` from this workstream's
  `manifest.json`; it supersedes prose about submission/integration.

## Result

One fail-closed `caseContextFor()` now owns active-case payment phase, action,
destination and pause/terminal precedence. Priority, overview, bands, payment,
ledger and live refresh no longer independently infer money state. Unknown
summary data never invents payment; explicit positive due cannot be masked;
claimed, paused and terminal states suppress all three payment mutations.

The approved cabinet composition was preserved. Mobile navigation, exact Back
focus, drafts/scroll and one-action hierarchy remain intact. The dark CTA and
both changed assets have deterministic AA/cache protection.

## Verification

- failing-first baseline: commit `486af14895d667dc82a2e77948adea2d15415b5f`;
- literal state matrix: 2,304 combinations;
- focused account/case/comfort: 36/36;
- full repository: 465/465;
- Brain: 39/39 and corpus validation green;
- browser: 390×844 light/dark due, checking, transfer and paused scenarios;
  one 44 px action, no horizontal overflow, exact return focus, no top-level
  console errors;
- council doctor/probe: Kimi/Sonnet/GLM/Opus/Fable READY; daily challengers and
  one Opus review produced bounded fixes recorded in `E-1005`.

No production account, API/payment, OAuth, deploy, client data or deletion was
used. Temporary browser fixture/server were removed/stopped.

## Limits and rollback

The authoritative backend summary/detail revision schema and production
frequency remain unknown. This frontend therefore fails closed and does not
claim the downstream server contract. Rollback is exact revert of
`4bb148af0abed033bd113249cda82fe45b60205b`; no schema/data rollback exists.

## Next after terminal integration

Create the next workstream only when this manifest is `integrated` and its
`result_sha` is an ancestor of freshly fetched canonical. Selected outcome:
`OUT-003`, first bounded slice = machine-readable and executable shared-shell
state contract for header/appbar/footer/auth/theme/consent. Current UI is the
baseline; runtime changes require a reproduced failure. `OUT-001` remains
externally gated by safe marker/cleanup, and `OUT-005` follows the shell proof.
