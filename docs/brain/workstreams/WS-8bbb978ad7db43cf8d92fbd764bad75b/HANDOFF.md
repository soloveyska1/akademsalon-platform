# Workstream handoff

- Branch: `codex/release168-first-order-promo`
- Outcomes: `OUT-006`
- Goal: publish the reviewed first-order campaign as REL-0168 across Academic
  Salon and Kladovaya without submitting a real order or exposing client data.
- Acceptance:
  - the exact pinned Salon backend candidate installs transactionally before
    either public surface can advertise an active offer;
  - immutable Salon and Kladovaya releases correspond to their canonical SHAs,
    preserve server-owned state and become the active pointers;
  - clean-new, known-returning, owner-preview and cross-site kill-switch states
    behave as reviewed, with no real order/contact mutation;
  - service, Nginx, SQLite and HTTP health stay green;
  - backend and both static releases complete an executed rollback plus forward
    restore, leaving the final production state on the new release.
- Proof: `E-1028`, new `E-1029`, exact hashes, GET-only/API eligibility smoke,
  production Chromium, pointer/source readback, `brain:test` and
  `brain:validate`.
- Changed: none yet.
- Unverified: production has not yet been changed.
- Risks/rollback: campaign has an immediate database kill switch; backend
  rollback restores only pinned source and preserves live SQLite writes;
  static rollback switches immutable pointers to the exact previous releases.
- Next: commit this declaration, run the strict conflict gate, then deploy
  backend first and execute bounded rollback/forward proof before public
  activation.
