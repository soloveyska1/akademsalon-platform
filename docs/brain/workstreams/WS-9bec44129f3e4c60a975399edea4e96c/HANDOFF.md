# Workstream handoff

- Branch: `codex/out-006-smart-rescue`
- Outcomes: `OUT-006`
- Goal: route a qualified first-order exit to one useful next step, disclose the
  existing 10% retention offer only for the explicit price reason, and carry
  remarks from the supervisor dossier into the existing estimate journey
  without putting their text in a URL, analytics event or new API.
- Acceptance: the qualified explicit-exit sheet starts with four finite reasons;
  only `price` can make one existing `/api/promo/retention` request; materials,
  unclear-scope and deadline paths stay local and focus the relevant existing
  control; pagehide and every owner-preview path are network-, storage- and
  navigation-free; existing/new/owner eligibility, 59/60 seconds, 4,999/5,000
  rubles, promo/submission/upload/cutoff boundaries remain fail-closed; the
  dossier handoff is bounded, ten-minute, single-use session storage, never
  appears in the URL, does not overwrite a saved draft without the existing
  choice screen, and preserves the file-or-40-character prerequisite. Deposits,
  Salon+, referral, cart money, order submission, backend promo economics and
  Analytics v2 stay byte-for-byte outside source scope.
- Proof: failing-first Node contracts for the reason/action matrix, zero-network
  non-price paths, categorical pagehide, owner preview and single-use remarks
  handoff; focused promo/configurator suites; complete public/backend/Brain
  regression; 320/360/390/430/1024/1440 light/dark Chromium and WebKit checks
  including focus, Escape/backdrop, keyboard and overflow; independent UX,
  architecture and economics P0/P1 review; `E-1036`; immutable static release,
  two-vantage GET-only smoke and executed static rollback/forward.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: P0 is any discount request outside the explicit price path,
  visibility to an ineligible existing user, owner-preview mutation, raw remarks
  or identity text in promo/analytics/URL, draft loss, duplicate submit, false
  success, changed discount/deposit economics or an SQLite-lock regression. P1
  is an automatic 10% return banner, a free-analysis promise, a hidden keyboard
  primary, focus/history trap or silent handoff loss. Roll back the bounded
  static cache wave to the current immutable release; no backend or database
  migration belongs to this workstream.
- Next: review and commit the manifest plus this handoff.
