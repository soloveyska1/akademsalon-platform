# Workstream handoff

- Branch: `codex/out-003-shared-shell-contract`
- Outcomes: `OUT-003`
- Base: `65adc47cf31ffaa3ba9a797204d938ef866f0e14`, exact terminal
  `origin/codex/full-reference-production` after OUT-004.
- Goal: define one machine-readable and executable state contract for the shared
  shell before changing header, appbar, footer, auth, theme, menu, search or
  consent runtime.
- Acceptance: inventory explicit route families/exceptions; cover
  360/390/768/1024/1440, light/dark/reduced motion, anonymous/guest/authenticated,
  menu/search/footer/consent, one intended primary CTA, ≥44 px targets, no
  overflow/layout jump, overlay inertness and exact focus/history return.
- Proof: failing-first `tests/shared-shell-contract.test.js`, existing shell/home
  source and bundle-parity suites, browser matrix with G9 metadata, full product
  regression, Brain 39/39/validate and fresh conflict scan; durable evidence
  belongs in `E-1006`.
- Changed: bootstrap declaration only. Runtime/CSS/HTML are read-only in revision
  1; root is the only write-owner.
- Unverified: current canonical has source guards but no current-HEAD runtime
  matrix across the complete shell state space. No P0/P1 is assumed.
- Risks/rollback: broad shared-runtime edits have maximum blast radius. Stop if a
  runtime change lacks failing reproduction, consumer inventory, home bundle
  parity or cache bump, or requires live OAuth/production state. Bootstrap
  rollback is an exact commit revert; no external mutation is authorized.
- Next: commit exactly manifest plus this handoff, run strict conflicts, then
  perform read-only inventory and write the execution contract before any test
  or runtime change.
