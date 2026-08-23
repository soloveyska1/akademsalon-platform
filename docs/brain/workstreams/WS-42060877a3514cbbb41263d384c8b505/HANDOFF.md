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
- Proof: failing-first executable `tests/configurator-private-checkpoint.test.js`
  now passes 4/4; related paths 85/85; full public 596/596; Brain 39/39;
  backend 31/31; two identical 353-file builds; real Chromium file-loss,
  cart-bypass, persisted-description and legacy-plan privacy journeys; 360/390
  light/dark and 1440 geometry; `brain:validate`; `git diff --check`; `E-1026`.
- Changed: implementation `3fb1671444c4f73452c28b5751315b77f1497740`
  removes legacy private residue and consolidates contact preflight, visible
  recovery and post-render focus. Recovery copy clears as soon as a real file
  or sufficient description is present. New regression contract binds all
  bypasses and privacy copy. No CSS/backend/admin/analytics/price file changed.
- Unverified: independent exact-result reviews; production publication,
  production smoke and rollback/forward proof. No local or production form was
  submitted during implementation verification.
- Risks/rollback: do not persist contact in sessionStorage as a hidden exception;
  do not reset price/scope/cart; do not loop on history; do not focus a hidden
  legacy contact field. Rollback is implementation commit
  `3fb1671444c4f73452c28b5751315b77f1497740` plus its evidence revision.
- Next: obtain two independent read-only reviews of the exact evidence commit;
  close every P0/P1 before freezing the workstream result.
