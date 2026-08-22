# Current handoff

## Canonical and production truth

- Canonical production source is
  `135cb4559ee6c81b0e42633d2ebb2ad48abbb1a1`.
- Production `current` and compatibility `dist` resolve to
  `release160-135cb45`; `previous` resolves to `release159-57703fa`.
- Release160 has G10 GO with P0=0/P1=0. Exact source, hashes, browser matrix,
  two-vantage smoke and executed static rollback/forward are in `REL-0160` and
  `E-1021`.
- Analytics v2 contract is 2.3.0. Full rollback changes both static pointers to
  release159; backend restore or restart is not part of release160.
- `salon-bot-v2.service` is active, Nginx syntax is valid and SQLite integrity
  is `ok`. Final operator-network and VPS read-only smoke each passed 14/14.

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

## One exact next step

For the next practice-report lead, send
`https://akademsalon.ru/otchet-po-praktike.html#service-price` and ask which of
the three visible scopes matches the materials. Do not discount staged support
as if it were the same service as editing, and do not claim conversion uplift
from release proof alone.
