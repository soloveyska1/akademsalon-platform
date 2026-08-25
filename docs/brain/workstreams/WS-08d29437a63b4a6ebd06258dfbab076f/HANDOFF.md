# Workstream handoff

- Branch: `codex/out-006-retention-preview-polish`
- Outcomes: `OUT-006`
- Goal: correct the retention owner/client outcome sheet shown in the supplied
  screenshot without changing eligibility, discounts, storage, navigation,
  backend, deposit economics or any other product surface.
- Acceptance: every rescue outcome keeps its title, copy, actions, owner label
  and close control inside the sheet at 320/390/568/760 and 1440 widths,
  including short-height 514/650 viewports. The title uses a bounded retention-
  specific scale and balanced wrapping; the primary is visually dominant but
  no longer spans the whole editorial column; secondary actions remain at least
  44 px and visually subordinate. Light/dark, focus, reduced motion and forced
  colors stay valid. Owner preview remains labelled and zero-mutation; client
  copy/action semantics and all campaign economics remain exact. Both entry
  pages load one atomic cache version.
- Proof: focused `new-user-promo` and `september-entry-readiness` contracts,
  targeted Chromium/WebKit geometry and owner zero-mutation checks at the
  declared viewports, ordinary mobile smoke, full public regression,
  `brain:test`, `brain:validate`, deterministic build, visual captures and two
  independent final UX/architecture reviews.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: P0 is any claim, storage, navigation, request, eligibility,
  price, deposit or backend change. P1 is clipped/overflowing text, a hidden
  close/owner label, sub-44 px target, broken focus/Back or non-atomic cache.
  Rollback is the exact seven-file product diff to canonical `2061a989`; no
  backend or database rollback belongs to this workstream.
- Next: review and commit the manifest plus this handoff.
