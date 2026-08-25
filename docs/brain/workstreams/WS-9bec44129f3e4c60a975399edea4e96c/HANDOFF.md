# Workstream handoff

- Branch: `codex/out-006-smart-rescue`
- Outcomes: `OUT-006`
- Base: `0fbdde35d12c5b8d84e043faa4e502c2a5fcf575`
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
  appears in the URL, does not overwrite a saved draft without an explicit
  choice, and preserves the file-or-40-character prerequisite. Deposits,
  Salon+, referral, cart money, order submission, backend promo economics and
  Analytics v2 stay byte-for-byte outside source scope.
- Changed:
  - `assets/js/promo-campaign.js` now asks one of four finite exit reasons. Only
    `price` can enter the unchanged 10%, minimum 5,000-ruble, 2,500-ruble-cap,
    72-hour server issue path; the other three choices call a bounded local
    configurator bridge. Pagehide stores only a categorical checkpoint. A
    history sentinel makes Browser Back or edge-swipe close the sheet before
    the wizard changes step. Owner preview exposes the exact client labels but
    cannot claim, store or navigate.
  - `assets/css/promo-campaign.css` adds the reason/outcome layout, bounded
    320-pixel composition, focus and forced-colors treatment, and a complete
    reduced-motion state including hover transform.
  - `dosie-nauchruka.html` plus the dedicated
    `assets/js/remarks-handoff.js` add a 40–800-character, ten-minute,
    same-tab remarks-to-estimate handoff. It carries no text in the URL, deletes
    the two legacy private-text keys on this originating page and fails closed
    even when browser storage getters throw.
  - `configurator.html` validates and imports the handoff into the ordinary
    local draft, removes the code-only route parameters and presents an explicit
    saved-draft choice before consuming a valid session record. Continuing the
    saved draft preserves its old comment and cannot show a false transfer;
    starting a new application imports the new remarks. Browser actions focus
    existing materials, summary or deadline controls.
  - `index.html` and `configurator.html` use the atomic
    `20260825rescue1` promo cache wave. Dedicated regression contracts and
    WebKit/Chromium mobile smoke cover the new states.
- Verified on the final dirty candidate before its implementation commit:
  - public Node: 621/621; backend: 99/99 with one expected local-only
    `aiosqlite` skip; Brain: 39/39; strict corpus validation:
    `VALID records=105 links=201 manifests=52`;
  - ordinary WebKit+Chromium mobile smoke: 12/12 at 320/390/430; targeted
    Browser-Back, both draft-conflict branches, seeded legacy storage and owner
    zero-mutation scenarios: 24/24 at the same engines and widths;
  - focused promo/remarks contract: 15/15; both changed JavaScript files pass
    syntax checks; `git diff --check` passes;
  - two consecutive static builds are identical: 358 files, 26,234,987 bytes,
    relative path-and-content digest
    `63f2f9ed657e9a128d6c23295345ad5be5f93901be9772a8a1129d95895a00cf`;
  - independent economics, architecture and UX reviews ended GO with P0=0 and
    P1=0. Architecture has P2=0. UX accepts one bounded P2: a legacy private
    remark persists until that browser reopens the dossier; the active code
    never reads or sends it, and broad cleanup was rejected because owner
    preview must remain strictly zero-storage.
- Unverified: no production publication has occurred in this workstream. No
  conversion, profit or contribution-per-hour uplift is claimed; measure only
  after enough paid comparable orders. Final public hashes, two-vantage smoke,
  executed rollback/forward and service/SQLite readback belong to the release
  proof workstream after this result becomes canonical.
- Risks/rollback: P0 is any discount request outside the explicit price path,
  visibility to an ineligible existing user, owner-preview mutation, raw remarks
  or identity text in promo/analytics/URL, draft loss, duplicate submit, false
  success, changed discount/deposit economics or an SQLite-lock regression. P1
  is an automatic 10% return banner, a free-analysis promise, a hidden keyboard
  primary or a focus/history trap. Rollback is the bounded static cache wave to
  immutable REL-0171; no backend, bot, database migration or service restart is
  part of this implementation.
- Next: commit the implementation and this handoff, fetch canonical, rerun strict
  conflicts, submit/freeze the exact result SHA, integrate it into `origin/main`,
  then open the isolated REL-0172 production-proof workstream.
