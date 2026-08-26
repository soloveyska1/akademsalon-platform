# Current handoff

## Canonical and production truth

- Canonical static production source is
  `c245da0e00ce3a9dfaefbe985b9540672687e1d3`.
- Production `current` and compatibility `dist` resolve to
  `release173-c245da0`; `previous` resolves to `release172-df007e4`.
- REL-0169 campaign/economics semantics remain live. Its original six-source
  rollback copy is
  `/root/salon_bot/backups/first-order-promo-economics-20260824T120008432055Z`.
- Backend REL-0170 is live as the exact ten-source SQLite recovery set from
  implementation `1101c16c1fd68d65c6999d3d16f9815284eb4015`. Its final
  source-only rollback copy is
  `/root/salon_bot/backups/sqlite-recovery-20260825T030859216319Z`.
- Backend REL-0171 is live as the exact economic V2 post-image set from
  implementation `4acd0e623f5b2a5e2efd6926f799b71032234c4d`. Deposit issuance
  is `earned-v2:open`; fixed referral is `fixed-200:on`; eleven exact triggers
  and all four invariant counters are green. Source pre-images are at
  `/root/salon_bot/backups/economic-v2-20260825T100618364976Z`.
- Kladovaya is live from exact source `58f4c116…421e` at
  `20260824T1214Z-promo-mobile-58f4c11`.
- Backend OUT-001 is live from canonical source
  `d6f1a1b4783d5600abcfe5ecce835c56e5c3bac4`: authoritative result
  `7cf25718e…19b7`, generated-link hotfix `292784c1…4069`, runtime
  `cba09cf5…44a5`. It is default-off outside an explicit root-only capability;
  public/static remains release173.
- REL-0169 has G10 GO with P0=0/P1=0. Exact source, hashes, browser matrix,
  two-vantage smoke and executed backend/Salon/Kladovaya rollback-forward are
  in `REL-0169` and `E-1031`.
- REL-0170 has G10 GO with P0=0/P1=0. Root-cause reproduction, all ten source
  hashes, transaction proof and executed rollback/forward are in `REL-0170`
  and `E-1032`.
- REL-0171 has G10 GO with P0=0/P1=0 in the bounded first-entry and
  economic-safety scope. Exact combined regressions, production hashes,
  Chromium, two-vantage smoke and both rollback-forward drills are in
  `REL-0171` and `E-1035`.
- REL-0172 has G10 GO with P0=0/P1=0 in the bounded smart-rescue scope. Exact
  public hashes, independent reviews, Chromium/WebKit mobile proof,
  production owner/returning/remarks states, two-vantage smoke and an executed
  static rollback-forward are in `REL-0172` and `E-1036`.
- REL-0173 has G10 GO with P0=0/P1=0 in the bounded retention-preview visual
  scope. Exact public hashes, visual/accessibility reviews, targeted
  WebKit/Chromium and forced-colors proof, production 390/568 owner states,
  two-vantage smoke and executed REL-0172 rollback-forward are in `REL-0173`
  and `E-1037`.
- REL-0174 has G10 GO with P0=0/P1=0 in the bounded technical OUT-001 scope. Its
  exact synthetic API → isolated outbox → cabinet → cleanup proof, security
  stop/hotfix, two-vantage smoke and executed source rollback-forward are in
  `REL-0174` and `E-1038`; all three final reviews report P2=0 as well.
- Analytics v2 contract is 2.3.0. REL-0169's static rollback target is
  release168; REL-0171's target is release169; REL-0172's target is release171;
  REL-0173's target is release172.
  Promo backend rollback preserves SQLite, promised rows and the aggregate
  guard while switching new campaign activity off.
- `salon-bot-v2.service` is active as final PID `768912` with `NRestarts=0`;
  SQLite is WAL with `quick_check=ok`, zero FK violations and exact 30-link
  `table_xinfo` inventory. Active synthetic/outbox/receipt counts are zero,
  capability is absent, economic guard is `49cf27f7…172a3`, and deposit issuance
  is open. Final operator-network and VPS read-only smoke each passed 14/14.

## 26 August REL-0174 bounded OUT-001 proof

- The authoritative backend plane is default-off and accepts only one exact
  no-contact/no-file/no-money fixture signed by a short-lived root-owned
  canonical-origin capability. Ordinary requests never read the capability.
- The first successful journey was not accepted as final evidence after review
  found a future generated-link gap. Live `table_info`/`table_xinfo` comparison
  proved no residue; failing-first hotfix `292784c1…4069` now detects generated
  and hidden `order_id` columns and blocks before cleanup writes.
- Exact local gates are focused 30/30, backend 129 with one environment skip,
  public 623/623, Brain 39/39. Final security/trust, economics/eligibility and
  product/ops reviews all report GO with P0=0/P1=0/P2=0.
- Production used the rehearsed stopped-service old-installer rollback followed
  by new installer `031bedbe…d186`; direct new apply over the old runtime is
  forbidden. The repeated probe proved one exact order, duplicate recovery,
  isolated delivery, claim/cabinet visibility and exact cleanup. Final active
  residue is zero and the two executed journeys leave two opaque tombstones.
- A real new rollback restored source preimages and removed all three assets;
  both smoke vantage points stayed 14/14. Forward restore created final backup
  `/root/salon_bot/backups/out001-synthetic-20260826T021208015769Z`; immediate
  apply is idempotent.
- Prices, tariffs, promo, deposit mechanics, public design, static pointers and
  Kladovaya did not change. One 10-second upstream Telegram `Bad Gateway`
  polling interval recovered without restart; SQLite lock/traceback/critical
  matches are zero and a subsequent clean window is recorded in `E-1038`.
- The proof closes the controlled technical path only. Organic Telegram/
  operator fulfilment, quality, conversion, revenue, margin and profit remain
  unproved and must not be inferred from the synthetic result.

## 25 August REL-0173 retention preview correction

- The exact design result `5ac8bc8f5af40b1d63fb4b9fd3e18413ffef5a27`
  is contained in canonical source
  `c245da0e00ce3a9dfaefbe985b9540672687e1d3` and published as
  `release173-c245da0`.
- `Не понимаю состав` now opens the compact `Итог уже готов` outcome. The
  retention title is bounded, actions are 340/360 px, primary is Salon wax and
  terms remain subordinate. Inner sheet scroll resets before outcome focus so
  owner label and close cannot stay hidden after a long branch.
- Economics, eligibility and the four decisions are exact. Only the price
  reason can request the existing 10%/2,500 RUB/72-hour offer. Returning users
  remain suppressed and owner preview still cannot claim, navigate, persist or
  alter statistics.
- Focused 14/14, public 623/623, Brain 39/39 and targeted WebKit/Chromium
  light/dark/reduced-motion 24/24 passed. Visual review is P0=0/P1=0/P2=0;
  accessibility/behavior is P0=0/P1=0, including forced-colors and about 7.29:1
  dark hover contrast.
- The deterministic public subset is 358 files / 26,237,792 bytes with manifest
  `94fe2348...736f`. Immutable production is 361 files / 26,247,963 bytes with
  full manifest `40ea966b...4dda`; retained files and all owners/modes/paths are
  exact.
- Production Chromium at 390x844 and 568x514 inspected unclear and price with
  zero overflow, console error, non-GET request, storage or URL mutation. A
  real rollback returned exact release172 hashes; external/VPS smoke passed
  14/14 on initial forward, rollback and final forward.
- Final pointers are release173/release172. Backup:
  `/root/site-backups/release173-retention-preview-20260825T133327Z`. Bot PID
  `557663`, restart count zero, Nginx, WAL and `quick_check=ok` are unchanged;
  release-window lock/traceback/ERROR/CRITICAL matches are zero.
- Backend, database, tariffs, prices, deposits, Salon+, referrals and Kladovaya
  did not change. Deposit issuance remains open. The default index smoke's
  removed `#toc`/`Salon.toc` wait is accepted pre-existing test debt and must be
  handled in a separate workstream.

## 25 August REL-0172 smart rescue

- The exact smart-rescue result
  `925309b2a5380457a336c892ef89fac564898239` is contained in canonical source
  `df007e40399f47a26bd3903b4702fbcc74755ab4` and published as
  `release172-df007e4`.
- An unfinished configurator exit asks one of four finite reasons. Only the
  explicit price objection requests the existing qualified 10% offer from
  5,000 RUB, capped at 2,500 RUB for 72 hours. Materials, composition and
  deadline routes solve the named obstacle without issuing a discount.
- Returning users remain suppressed. The labelled owner preview reproduces the
  client presentation but cannot claim, navigate, persist promo state or alter
  statistics. Browser Back/edge swipe closes the rescue layer before changing
  the wizard.
- Supervisor remarks move 40–800 characters through a ten-minute same-tab
  envelope; no private text enters the URL. Existing-draft conflict is explicit,
  legacy handoff keys are scrubbed and inaccessible storage fails closed.
- Public 621/621, backend 99/99, Brain 39/39, focused 15/15 and mobile
  Chromium/WebKit 36/36 passed. Three independent final reviews report GO with
  P0=0/P1=0. One accepted UX P2 is limited to cleanup of a legacy remark when
  the dossier next opens; active code never reads or sends it.
- The deterministic public subset is 358 files / 26,234,987 bytes with manifest
  `63f2f9ed...00cf`; immutable production has 361 files including three exact
  retained server files. Owner/mode/path/symlink/hash drift is zero.
- Initial activation, a real rollback to release171 and forward restore each
  passed external/VPS smoke 14/14. Final pointers are release172/release171.
  Backup: `/root/site-backups/release172-smart-rescue-20260825T121703Z`.
- Production owner, returning-user and remarks browser states were GET-only and
  created no form, order, claim or money mutation. Bot PID `557663`, restart
  count zero, Nginx, WAL and `quick_check=ok` remained unchanged; actual
  lock/traceback/ERROR/CRITICAL matches are zero.
- Backend, database, tariffs, prices, deposits, Salon+, referrals and Kladovaya
  did not change. Deposit issuance remains open. Mechanics and rollback are
  proved; conversion, contribution margin and profit uplift are not.

## 25 August REL-0171 publication

- The reviewed first-entry result
  `1ee9533df1d677c34b44c95bf8e13ec9a7cda5e3` and economic-safety result
  `4acd0e623f5b2a5e2efd6926f799b71032234c4d` are combined in canonical product
  source `ffa2421ce9b3aed62b3c508a210fa50a2bb1e438` and published as
  `release171-ffa2421`.
- The welcome PNG remains fallback while eligible visitors receive the
  33,652-byte WebP. Returning footprints suppress it and owner preview remains
  labelled/non-redeemable. Production Chromium loaded the exact 960x720 WebP
  at 390 and 1440 with zero overflow or console errors.
- Deposits are open. The public 8/10/12/15 ladder and wallet CTA remain; benefit
  is earned from net used principal, ordinary cashback/deposit value is
  best-of, uplift waits 14 days, and cumulative partial refunds return exact
  unused principal. A qualifying first referral settles 200 once.
- Backend apply took four seconds. Final source state is `after`,
  `quick_check=ok`, journal lock/traceback/error matches are zero and
  `NRestarts=0`. The disable/forward drill closed only new issuance for one
  second and restored `earned-v2:open` without restoring SQLite.
- Immutable production is 360 files / 26,220,995 bytes; the 357-file public
  subset manifest is `4a3c2f22...053`. Static rollback to release169 and
  forward restore both passed external/VPS smoke 14/14 with exact old/new
  hashes. Backup: `/root/site-backups/release171-september-20260825T100556Z`.
- Separate legal factual confirmation, SEO cleanup, 320px services/tariffs
  overflow and configurator Back-history debt remain outside REL-0171; do not
  convert this publication into a claim that those scopes or revenue uplift
  are complete.

## 25 August SQLite BUSY_SNAPSHOT recovery

- The bot produced 170 bounded `database is locked` failures while systemd
  still showed an active process. Promo eligibility, `/api/orders` and the
  scheduler failed through the same shared `aiosqlite` write path. A graceful
  04:51 MSK restart restored service and produced no further failures before
  the durable release, but did not constitute the fix.
- The deterministic cause is WAL `SQLITE_BUSY_SNAPSHOT`: a long-lived read on
  the shared connection, an Analytics commit on its correctly isolated writer,
  then a shared snapshot upgrade. SQLite integrity remained `ok`; Analytics was
  the concurrency trigger, not a leaked lock holder.
- Ordinary runtime writes now use one persistent autocommit writer serialized
  by `asyncio.Lock`. The shared reader becomes `query_only`; direct runtime DML
  across the exact ten modules is migrated or placed inside an isolated
  `BEGIN IMMEDIATE` transaction. There is no replay and no rollback owned by a
  different task.
- Deposit activation/refund re-read state under the transaction, use status
  CAS and include money plus bonus effects in one unit. Concurrent activation,
  concurrent refund and injected-failure tests prove exactly-once/rollback
  behaviour.
- Focused production-Python 18/18, backend 76/76, public 603/603, Brain 39/39
  and strict validation passed. Architecture and economics reviews both report
  GO with P0=0/P1=0.
- Exact production source rollback started healthy and immediate forward apply
  restored the post-set. Final observation ran 158 seconds on one PID with
  zero lock/traceback/scheduler/ERROR/CRITICAL records, exact hashes and
  `quick_check=ok`.
- Rollback is source-only through the final REL-0170 backup. Never restore an
  SQLite snapshot for this incident because that can erase later valid orders
  or payments.

## 24 August first-order campaign

- `ПЕРВЫЙЛИСТ` is 12% for one first order from 2,500 RUB, capped at 5,000 RUB.
  The return-to-draft offer is 10% from 5,000 RUB, capped at 2,500 RUB and valid
  for 72 hours. Both end within 21 September Moscow time and are mutually
  exclusive/best-of with other promos or Salon+.
- Existing accounts, known guest orders, cross-account email/phone/social
  contacts and prior family claims fail closed at the server. A cleared browser
  can see only a provisional sheet; order creation repeats the check and claim
  atomically.
- Kladovaya calls its own PII-free `/promo-status`; it forwards no visitor
  request, cookie or header to Salon. A failed/off status hides the sheet.
- The authenticated Salon owner always receives a labelled non-redeemable
  preview. Kladovaya's `?offer_preview=welcome` is a safe visual bookmark with
  no outbound activation and no persistent owner marker.
- Product regressions are Salon 603/603, focused economics backend 19/19,
  Brain 39/39 and Kladovaya 277/277 plus lint. Three independent reviews
  returned GO with P0=0/P1=0.
- Production Chromium proved clean Salon presentation, returning suppression,
  labelled owner welcome/retention layouts and the safe Kladovaya owner preview
  at 360/390 without overflow or console errors. No live form/order/grant was
  submitted.
- Final Salon tree is 359 files / 26,181,248 bytes; final Kladovaya tree is 559
  files / 50,053,327 bytes. Both static releases and the backend completed real
  rollback plus forward restore. `promo_campaign` is the immediate kill switch.
- Promo/subscription best-of plus spent bonus points is bounded to 25% of the
  agreed price. This is controlled acquisition spend; positive margin is not
  claimed without authoritative fulfilment cost and commission data.
- Exact evidence and rollback paths: `REL-0169` and `E-1031`. Conversion,
  revenue and profit uplift are not claimed before live measurement.

## 24 August admin Telegram-auth recovery

- The production failure was exact: an expired or revoked HttpOnly session
  cookie made `POST /api/auth/start` return CSRF `403`, although the same
  browser was correctly unauthenticated and a clean browser could start login.
- Exact `POST /api/auth/start` now resolves the cookie first. Only
  `_session_user() is None` may invoke the unchanged anonymous handler and
  clear the two stale auth cookies. Valid sessions retain exact-Origin,
  header/cookie and database-bound CSRF; every other unsafe route remains
  fail-closed.
- The originally failing tab now reaches `Подтвердите в боте…` and the normal
  `Открыть бота` link. Telegram confirmation remains the user's action; no
  authenticated admin mutation was performed during release proof.
- Focused 8/8, backend 39/39, public 596/596 and Brain 39/39 passed. Two final
  independent reviews reported P0=0/P1=0/P2=0.
- Exact apply, real rollback to the former `403`, and forward restore were
  executed. Final service is active, Nginx is valid and SQLite quick-check is
  `ok`. Exact evidence and rollback commands are bounded by `REL-0167` and
  `E-1027`.

## 23 August private configurator checkpoint

- Contact, consent and files now remain memory-only. Both legacy draft keys
  scrub old name/contact residue on load while retaining safe scope, deadline
  and working-description data.
- If reload removes a required attachment, every contact/checkout/history/
  defensive-submit path returns only to Materials. One focused explanation
  names the loss and offers reattachment or a 40-character description.
- The exact `practice_draft_support` scope, cart and 14,000–19,500 RUB
  orientation survive recovery. Reattachment removes the stale notice and the
  39/40 -> 40/40 boundary enables the same primary without blur.
- Production 360 light and 390 dark have one 50 px primary, overflow 0, visible
  focused recovery and no console errors. Synthetic contact markers were
  absent from all local/session storage and network capture contained no POST.
- Release166 completed external/VPS smoke 14/14 after activation, in a real
  rollback to release165 and after forward restore. Service, Nginx and SQLite
  stayed green. Trust and continuity are proved; uplift is not claimed.

## 23 August mobile configurator keyboard action

- While the mobile software keyboard is open, the existing current-step
  primary becomes one compact shelf above it. The active field, validation
  reason and action remain simultaneously reachable; closing the keyboard
  restores the unchanged full taskbar.
- At the 40-character boundary the same primary enables without blur. The
  production practice-support journey keeps one primary, the exact
  `practice_draft_support` scope and 14,000–19,500 RUB orientation; contact
  remains disabled until its existing requirements are met.
- The shelf is mobile, field-focus and keyboard-occlusion gated. Consent keeps
  precedence, desktop geometry does not enter the state, and no second CTA,
  route, submit path, price, discount or promise was added.
- Focused Chromium and WebKit passed 3/3 each at 320/390/430. The reviewed code
  passed a real iOS 26.4 software-keyboard journey; production Chromium 360
  light and 390 dark repeated the live geometry and captured no POST.
- Release165 completed external/VPS smoke 14/14 after activation, in a real
  rollback to release164 and after forward restore. Service, Nginx and SQLite
  stayed green. Reachability is proved; conversion uplift is not claimed.

## 23 August mobile practice scope and Browser Back

- The fixed mobile primary follows the same exact diagnostic/editing/support
  route as both page continuations. Fresh production dock clicks reach the
  matching 2,500 / 8,000 / 14,000 RUB flow and first result.
- An existing configurator draft still owns the initial `Черновик` action. A
  real repeated pointer tap or Space on the checked scope intentionally changes
  the dock to that scope without deleting the saved draft.
- Browser-restored `checked` state is distinguished from the HTML
  `defaultChecked` state. Support -> fictional specification -> Browser Back
  restores support radio, 14,000 RUB status, visible passport, both page routes
  and the dock href/aria to one exact allowlisted route.
- One new selection emits one live-region update and repeated activation emits
  none. At 360/390 light/dark the dock has one visible primary, a 48/48 px
  unclipped label, at least a 67.2x70.4 px target and overflow 0; at 1440 it is
  hidden. Production console errors/warnings are 0.
- Release163 first exposed a real production-only P1 on this Back path and was
  immediately rolled back. Release164 contains the bounded fix and completed a
  successful release162 rollback plus forward restore. Prices, Otisk layout,
  configurator, request, backend, admin and Analytics did not change.

## 23 August practice-support result passport

- Only the selected 14,000 RUB support row expands a compact passport; the
  2,500 RUB diagnostic and 8,000 RUB editing choices remain concise.
- Before contact it names the real input set, requirements map, stage plan,
  agreed report/diary versions and final completeness checklist. Visible
  exclusions preserve student authorship and forbid fictional facts, substitute
  attestation work and grade/admission/acceptance promises.
- 14,000 RUB is explicitly the lower orientation for the complete listed
  composition, not only its first result. The total, stage split and any later
  out-of-scope work are fixed before payment.
- The specification link is secondary and explicitly fictional. Native radio,
  status and both continuation routes remain synchronized after Browser Back.
- Production 390/1440 light/dark has overflow=0 and console=0. Three
  independent final reviews report P0=0/P1=0/P2=0. No price, configurator,
  request, backend, admin or Analytics contract changed.

## 23 August practice-scope continuity

- The selected 2,500 / 8,000 / 14,000 RUB practice scope now remains exact
  through configurator, cart/request and prepayment specification. Direct
  submit materializes the selected position even when the cart was never
  opened.
- Diagnostic remains a 2,500–3,500 RUB written map without edits; editing
  remains an 8,000–11,000 RUB ready-package Word/program/checklist result;
  support remains 14,000–19,500 RUB supplied-material staged editing with a
  requirements map, document versions and final completeness checklist.
- Exact support is A1 and carries the full required-input dependency. Generic
  `topic+support` remains A2/from-zero; the fix did not convert all VIP work to
  A1 or change pricing.
- The next screen repeats the chosen title, result and upload request. Mobile
  shows the compact dossier before fields and desktop preserves form-left /
  dossier-right. `Изменить объём` returns to the public selector rather than
  resetting the generic wizard.
- Production 390/1440 light/dark has overflow=0 and console=0. Three
  independent final reviews report P0=0/P1=0/P2=0. Admin UI, Analytics and the
  backend were not changed.

## 23 August practice-price trust

- The practice page presents written diagnostic from 2 500 RUB, editing of a
  ready factual package from 8 000 RUB and staged support from 14 000 RUB as
  three selectable scopes rather than three prices for one job.
- One native radio owns both continuations. `draft+diagnostic`,
  `draft+editing` and `draft+support` reach the matching configurator result;
  live support shows the 14 000–19 500 RUB range.
- Lower-orientation factors and the fixed-price moment are explicit. Stage
  stop, student authorship and the bounded compatible diagnostic credit remain
  visible; no discount, fake scarcity, grade promise or uplift claim was added.
- The Otisk layout is preserved. Production 390/1440 light/dark has overflow=0
  and console errors/warnings=0. JSON-LD has three minimum-price Offers and no
  false `highPrice`.
- The lost lead's acquisition source remains unknown: admin and analytics were
  intentionally outside this release.

## 23 August quote-scope price clarity

- `Только первый этап` keeps the known first-stage price. `До следующего
  рубежа` and `До сдачи / защиты` replace the ambiguous row with an honest
  `после просмотра материалов` estimate while preserving the first-stage
  anchor below it.
- The choice is only a quote preference: it neither starts work nor blocks the
  request and can be changed before submission. No unknown total is invented.
- The approved «Оттиск» composition remains intact. Production Chromium at
  360/390/1024/1440 in light/dark has root overflow=0 and console errors=0;
  the price and note update in place without rerendering the wizard.
- Consented Analytics v2 now accepts only `quote_scope_seen` and
  `quote_scope_continue` with `first|milestone|full`. The events sit outside
  the strict submit funnel and carry no arbitrary text, contact or file data.

## 20–21 August server-error isolation

- The reported PHP/WordPress `502` burst did not hit Akademsalon. Sanitized
  Nginx evidence mapped it to a stopped neighbouring Duo Space/Kiskispace
  upstream on absent port 4310; the Salon watcher had incorrectly consumed the
  VPS-wide access log.
- Akademsalon now owns a dedicated privacy-safe `noqs` log and local PHP `404`;
  the retired host returns local `404`; the watcher reads only the Salon log.
  Its proven false daily 5xx count/throttle were cleared under lock.
- The executable backup copy was removed from `sites-enabled`, so `nginx -t` is
  clean instead of emitting six duplicate-name warnings. Static release158,
  backend, database and Analytics v2 were unchanged.
- Final external/VPS smoke is 14/14 + 14/14; five cross-vhost scanner probes
  changed neither the dedicated log nor `day.5xx=0`. Exact hashes, root-only
  backup and executed rollback/forward proof are in `E-1017`.

## 21 August 404 scanner-noise policy

- Повторный alert соответствовал ровно 500 `GET 404` за 12 секунд;
  `day.5xx=0`, все watcher checks были `up`. Legacy «Визиты» не содержали
  строк за интервал, а consent-only Analytics v2 оставалась пустой; отсутствие
  сессии использовано только как corroboration, не как перепись HTTP traffic.
- Raw public 404 больше не создаёт Telegram alert, throttle или суточный
  health-счётчик. Internal links/routes остаются под детерминированными тестами,
  а прежний порог настоящих 5xx сохранён без изменения.
- Active watcher hash: `31f1f968d4363fb91fccad2736727bccf488ec4883580e6a8d4df15e873bd06f`.
  Ложные `day.404=591` и throttle удалены под lock; live 50-request threshold
  оставил 404 state пустым и `day.5xx=0`.
- External/VPS smoke 14/14 + 14/14, synthetic old/new policy и executed
  rollback/forward зелёные. Root-only backup и exact hashes находятся в
  `E-1018`; static release158, Nginx, backend и SQLite не менялись.

## What the master now sees

- `/admin-analytics.html` uses the same cabinet shell, desktop sidebar, mobile
  appbar, navigation order, identity, themes, typography and flat surface
  language as the master's operational cabinet.
- The Russian decision path remains complete: trust/freshness, period and
  source/device/page filters, six metrics and trend, online activity, sources,
  approximate geography, devices, browsers, operating systems, pages,
  transitions, six-stage funnel, safe events/errors, sessions and data health.
- At 390x844 the first metric is visible without scrolling. The 390/1024/1440
  browser matrix has no root overflow, CSP violation, external resource or
  console error; menus, filters, dialog and tables retain their focus/scroll
  contracts in light and dark themes.
- Sidebar/mobile search and `Cmd/Ctrl+K` open the real Orders search and focus
  `#agQ` through a data-free one-shot marker removed before API access.
- Initial/runtime 403 replaces the workspace with the access gate and purges
  rows, detail and counters. Late responses cannot restore private DOM. One
  immutable applied query prevents mixed periods, filters and pagination.

## Analytics accuracy and privacy

- The server calculates every metric for one selected window and paginates the
  complete matching session set. Idempotent event IDs, occurrence time, client
  sequence and atomic sessionisation remain the release157 contract.
- A visitor is a random anonymous browser ID, not a known person. Contacts,
  orders, login identity, raw IP/UA/referrer, query/form text, files and OAuth
  data are neither linked nor stored in Analytics v2.
- Collection is consent-only; refusal, blockers and bot filtering reduce
  coverage. The dashboard names that limitation and must not be presented as a
  census of everyone who opened the site.
- Trustworthy history begins at release157. Legacy rows remain excluded because
  their meaning and accuracy cannot be defended.
- Raw events have a maximum 365-day lifetime; signed revoke cascades visitor,
  sessions and events and retains only a bounded hashed replay tombstone.

## Release166 verification summary

- Site 596/596; backend 31/31; Brain 39/39; focused 4/4 and related 85/85;
  deterministic builds and diff checks green. Three independent final reviews
  report P0=0/P1=0/P2=0.
- Public payload: 353 files / 25,054,477 bytes, digest `dbec7e39…552`;
  immutable live tree: 356 files / 25,064,648 bytes, manifest
  `79f51ae8…bfd`, owner/mode drift 0.
- Exactly one public file differs from release165. Repository, immutable tree
  and live HTTP hash agree at `295b2b3d…8a6e`; server-owned files and
  backend/Nginx stayed byte-identical.
- External/VPS smoke passed 14/14 after activation, 14/14 in the executed
  release165 rollback and 14/14 after final forward restore to release166.
- No production form was submitted and no client contact, file, order,
  message, payment or analytics row was read or changed.

## Release165 verification summary

- Site 592/592; backend 31/31; focused Chromium/WebKit 6/6; Brain validation,
  deterministic builds and diff checks green. Two independent final reviews
  report P0=0/P1=0/P2=0.
- Public payload: 353 files / 25,048,287 bytes, digest `51f75570…2e7`;
  immutable live tree: 356 files / 25,058,458 bytes, manifest
  `7ea25e87…e4c`, owner/mode drift 0.
- Exactly two public files differ from release164. Repository, immutable tree
  and live HTTP hashes agree at `7f99eda2…0cd4` and `d474c38e…b1b`; three
  server-owned files and backend/Nginx stayed byte-identical.
- External/VPS smoke passed 14/14 after activation, 14/14 in the executed
  release164 rollback and 14/14 after final forward restore to release165.
- No production form was submitted and no contact, order, client file,
  message, payment or analytics record was read or changed.

## Release164 verification summary

- Site 592/592; backend 31/31; Brain 39/39; focused 8/8 and related 64/64;
  strict validation, deterministic builds and diff checks green. Three
  independent final reviews report P0=0/P1=0/P2=0.
- Public payload: 353 files / 25,041,362 bytes, digest `7915d085…be97`;
  immutable live tree: 356 files / 25,051,533 bytes, manifest
  `c3050fff…e053`, owner/mode drift 0.
- Exactly one public file differs from release162. Repository, immutable tree
  and live HTTP page SHA-256 agree at `3292958b…4585`; CSS, three server-owned
  files and all backend/Nginx hashes stayed byte-identical.
- External/VPS smoke passed 14/14 after activation, 14/14 in the executed
  release162 rollback and 14/14 after final forward restore to release164.
- Release163 is recorded as failed and rolled back, not as an earlier success.
  No production form was submitted and no contact, order, client file,
  message, payment or analytics record was read or changed.

## Release162 verification summary

- Site 590/590; backend 31/31; Brain 39/39; strict validation, deterministic
  builds and diff checks green.
- Public payload: 353 files / 25,039,823 bytes, digest `c7a7fff…dd7c`;
  immutable live tree: 356 files / 25,049,994 bytes, manifest
  `20cd81dc…a70`, owner/mode drift 0.
- Repository, immutable tree and HTTP SHA-256 agree for exactly two changed
  public files. The three server-owned files and all backend/Nginx hashes stayed
  byte-identical.
- External/VPS smoke passed 14/14 after activation, 14/14 in the executed
  release161 rollback and 14/14 after final forward restore to release162.
- No production contact, order, client file, message, payment, raw analytics
  row, IP/UA, query/referrer or OAuth material was read or changed.

## Release161 verification summary

- Site 589/589; backend 31/31; Brain 39/39; focused 25/25; strict validation,
  syntax, deterministic builds and diff checks green.
- Public payload: 353 files / 25,030,042 bytes, digest `00cc9703…6952`;
  immutable live tree: 356 files / 25,040,213 bytes, manifest
  `a455a53b…23f4`, owner/mode drift 0.
- Repository, immutable tree and HTTP SHA-256 agree for exactly five changed
  public files. The three server-owned files and all backend/Nginx hashes stayed
  byte-identical.
- External/VPS smoke passed 14/14 after activation, 14/14 in the executed
  release160 rollback and 14/14 after final forward restore to release161.
- No production contact, order, client file, message, payment, raw analytics
  row, IP/UA, query/referrer or OAuth material was read or changed.

## Release160 verification summary

- Site 584/584; backend 31/31; Brain 39/39; focused 32/32; strict validation
  and two deterministic builds green.
- Public payload: 353 files / 25 006 595 bytes, digest `4bba587f…efcdf`;
  immutable live tree: 356 files / 25 016 766 bytes, manifest
  `4b6c07fb…c2e9b`, owner/mode drift 0.
- Repository, immutable tree and HTTP SHA-256 agree for the only two changed
  public files. Backend, DB seam, Analytics runtime/contract, Nginx and security
  headers stayed byte-identical.
- External/VPS smoke passed 14/14 after activation, 14/14 in the executed
  release159 rollback and 14/14 after final forward restore to release160.
- No production contact, order, file, message, raw analytics row, IP/UA,
  query/referrer or OAuth material was read or changed.

## Release159 verification summary

- Site 580/580; backend 31/31; Brain 39/39; strict validation, syntax, two
  deterministic builds and diff checks green. `E-1019` separately proves
  byte-identical baseline/current UI for instrumentation.
- Public payload: 353 files / 24,987,483 bytes, deterministic build digest
  `44736478…55f`; immutable live tree: 356 files / 24,997,654 bytes, manifest
  `842dd247…4b53`, owner/mode drift 0.
- Repository, immutable tree and HTTP SHA-256 agree for the three changed
  public files. Webapp, DB seam, Analytics runtime, incident-hardened Nginx and
  security headers stayed byte-identical; contract alone advanced to 2.3.0.
- A bounded synthetic cycle was run before and after rollback: accepted=2,
  rejected=1, duplicate=2, revoke removed visitor=1/session=1/events=2, final
  matching visitor/session/event/revocation residue=0 and SQLite `ok`.
- External/VPS smoke passed 14/14 after activation, 14/14 during the executed
  release158 + contract 2.2.0 rollback and 14/14 after backend-first forward
  restore to release159 + contract 2.3.0.
- No production contact, order, file, message, raw analytics row, IP/UA,
  query/referrer or OAuth material was read. Synthetic IDs and technical smoke
  deltas were removed exactly.

## Remaining P2

- The authenticated owner should confirm the first organic consented session;
  an initially empty series is correct and must not be seeded from legacy data.
- Replace the monthly DB-IP snapshot with the verified September file by
  15 September 2026; integration/operations owns it.
- Legacy analytics retention/deletion needs a separate privacy workstream and
  must not be exposed as Analytics v2 history.
- Integration/operations should audit cancellation at the explicit SQLite
  transaction commit boundary and perform a 24-hour REL-0170 journal readback
  by 26 August 2026 06:09 MSK.

## One exact next step

At or after 26 August 2026 06:09 MSK, read the REL-0170 service journal from the
final forward start and record the 24-hour counts for `database is locked`,
tracebacks, scheduler failures and PID restarts. Make no further SQLite change
unless that bounded observation produces a reproducible signal.
