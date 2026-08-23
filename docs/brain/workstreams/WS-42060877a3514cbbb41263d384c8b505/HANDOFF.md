# Workstream handoff

- Branch: `codex/out-008-private-checkpoint-v1`
- Outcomes: `OUT-008`
- Goal: make the visible promise “Contacts and files are not saved” true end
  to end. Legacy local drafts must contain no name/contact, and a restored
  file-dependent request must not reach contact or submit after its in-memory
  attachment disappeared.
- Acceptance:
  - synthetic name/contact values are absent from every localStorage draft
    after plan-service and generic Back/edit/reload paths; existing legacy
    residue is removed on the next configurator load;
  - file-only `practice+draft+support` returns from reload to the materials
    step with one factual recovery notice and no POST; exact scope, 14–19.5k
    range, deadline, cart and authorship remain intact;
  - a persisted description of at least 40 characters stays on contact;
    reattaching a file or writing 40 characters enables the existing single
    `К проверке` continuation;
  - cart checkout, history restore, contact validation and defensive submit
    use the same source prerequisite; generic routes without required source
    remain unchanged;
  - consent and contacts remain memory-only, no filename/contact telemetry is
    added, and the existing submit/backend/price contracts are unchanged;
  - 360/390 light/dark and 1440 preserve one primary, focus, at least 44 px
    targets, at least 16 px fields and zero horizontal overflow.
- Proof: failing-first executable `tests/configurator-private-checkpoint.test.js`;
  Chromium/WebKit runtime with all POST requests captured and zero submissions;
  focused/related/full public regressions; `brain:test`, `brain:validate`,
  `git diff --check`; two independent exact-result reviews; `E-1026`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: do not persist contact in sessionStorage as a hidden exception;
  do not reset price/scope/cart; do not loop on history; do not focus a hidden
  legacy contact field. Rollback is one implementation commit.
- Next: review and commit the manifest plus this handoff.
