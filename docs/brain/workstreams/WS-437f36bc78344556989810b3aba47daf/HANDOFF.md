# Workstream handoff

- Branch: `codex/release169-promo-value`
- Outcomes: `OUT-006`
- Goal: publish the verified material promo economics from `E-1030` as
  REL-0169 across the private Salon backend, Academic Salon static site and
  Kladovaya without creating a real order, contact or retention grant.
- Acceptance:
  - the exact six-source backend candidate stages fail-closed, the service is
    restarted, the runtime PID is attested and the snapshotted campaign state
    is finalized without any separate kill-switch toggle;
  - the backend completes an executed safe rollback (coherent v2, campaign
    off) and explicit forward enable, ending installed/on with SQLite, service,
    Nginx and count-only anomaly checks green;
  - immutable Salon and Kladovaya releases correspond to canonical SHAs
    `51f35562...` and `0ec3fed...`, preserve server-owned state and become the
    active pointers;
  - both static sites complete an actual pointer rollback and forward restore;
  - external plus VPS smoke and production Chromium owner/clean-new/returning
    states show the exact 12%/5,000 and retention 10%/2,500 contracts with no
    console error, overflow, entitlement mutation or real submission.
- Proof: `E-1030`, new `E-1031`, exact source and immutable-tree manifests,
  systemd/Nginx/SQLite checks, two-vantage GET-only smoke, production Chromium,
  executed backend/static rollback-forward drills, `brain:test` and
  `brain:validate`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: never run a separate campaign toggle between backend stage
  and finalize/rollback; complete that transition first. Backend rollback keeps
  the aggregate v2 guard and promised rows while closing new claims. Static
  rollback rotates only exact immutable pointers. No production order, code
  grant, contact, file, payment or message may be created as proof.
- Next: review and commit the manifest plus this handoff.
