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
  declared viewports, full public regression, Brain unit/strict validation,
  deterministic build, visual captures and two independent final visual and
  accessibility reviews.
- Changed:
  - Replaced the overflowing `Вернёмся к предварительному итогу` outcome with
    the concise `Итог уже готов`, bounded retention typography and balanced
    wrapping. No client promise or decision branch changed.
  - Limited outcome actions to a 360 px editorial column (340 px on phones),
    promoted the primary with the Salon wax color, quieted the secondary and
    separated factual terms with the existing dotted rule.
  - Added an explicit owner-preview presentation class and reset only the
    sheet's inner scroll before each prompt/outcome focus transition. This
    keeps the owner label and close control visible after a scrolled reason
    branch without touching page history, application state or storage.
  - Preserved dark-theme contrast and added specificity-safe Canvas/
    CanvasText text, background and border rules for forced colors.
  - Moved both public entry pages atomically to promo CSS/JS cache wave
    `20260825rescue2`; added static design/accessibility contracts and expanded
    the promo-only browser matrix to 568x514, 760x650 and 1440x900.
- Verified on the final dirty candidate:
  - failing-first focused contracts reported 3 expected failures before the
    product diff; final focused result is 14/14 and full public is 623/623;
  - WebKit and Chromium light/dark/reduced-motion promo journeys are 24/24 at
    320/390/430/568x514/760x650/1440. All four outcome branches keep title,
    description, actions, owner label and close inside the sheet, with title
    <=46 px, primary >=49 px and every secondary target >=44 px;
  - Chromium forced-colors light/dark normal/hover readback is
    CanvasText/Canvas/CanvasText for primary text/background/border and
    CanvasText/Canvas for secondary; dark hover contrast is about 7.29:1;
  - owner preview performs no POST, claim, storage write or navigation, Browser
    Back still consumes the dialog sentinel and application state is restored;
  - Brain unit suite is 39/39 and strict validation is
    `VALID records=107 links=209 manifests=54`; syntax and `git diff --check`
    pass;
  - two clean builds are identical: 358 files, 26,237,792 bytes, sorted
    relative path-and-content digest
    `94fe23488b99eb1b30d896a1346f80def24897b782f8f566e1551b18448c736f`;
  - `deposit.html` remains byte-identical to base at
    `161876c7ab1ac5a19cd9a3f3f1b88db9129c3909184418295d533c87631a83b8`;
    no backend, database, eligibility, payload, claim, pricing or deposit path
    is present in the product diff;
  - final visual review: GO, P0=0/P1=0/P2=0. Final accessibility/behavior
    review: GO, P0=0/P1=0, with one pre-existing harness P2 below.
- Unverified: production publication, exact live-tree readback, public owner
  preview and rollback/forward drill belong to the release workstream. The
  default `mobile-light-smoke.js` index inspector still waits for removed
  legacy `#toc`/`Salon.toc` and times out; this is present on `origin/main`, is
  outside the changed product path and is retained as a separate test-harness
  P2. The new promo-only inspector is the release gate for this surface.
- Risks/rollback: P0 is any claim, storage, navigation, request, eligibility,
  price, deposit or backend change. P1 is clipped/overflowing text, a hidden
  close/owner label, sub-44 px target, broken focus/Back or non-atomic cache.
  Rollback is the exact seven-file product diff to canonical `2061a989`; no
  backend or database rollback belongs to this workstream.
- Next: commit the exact product result, submit/integrate the workstream, then
  publish an immutable static release with live owner-preview smoke and an
  executed rollback/forward drill. Do not deploy backend or deposit artifacts.
