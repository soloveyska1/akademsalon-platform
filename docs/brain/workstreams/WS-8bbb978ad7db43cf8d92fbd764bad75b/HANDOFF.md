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
- Changed:
  - installed the exact backend candidate, additive SQLite campaign contract
    and active kill-switch setting;
  - published Salon `release168-afe4755` and Kladovaya
    `20260824T0947Z-first-order-promo-ff84840`;
  - recorded exact production proof in `E-1029`, release truth in `REL-0168`
    and refreshed `START-HERE`/`CURRENT-HANDOFF`.
- Verified:
  - backend exact check/apply, Python compile, active service, Nginx and SQLite;
  - external and VPS Salon smoke 14/14 after activation, rollback and restore;
  - Salon and Kladovaya immutable manifests and live key-file hashes;
  - production Chromium clean-new/returning/preview states at 360/390 with
    zero overflow and zero console errors;
  - executed backend, Salon static and Kladovaya static rollback plus forward
    restore; final pointers and campaign state are active with zero residue.
- Unverified: no real order or retention grant was created; financial uplift
  remains unmeasured.
- Risks/rollback: campaign has an immediate database kill switch; backend
  rollback restores only pinned source and preserves live SQLite writes;
  static rollback switches immutable pointers to the exact previous releases.
- Next: validate the durable records, commit the verified release candidate and
  submit this workstream for canonical integration.
