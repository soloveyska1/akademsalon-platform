# Current handoff

## Canonical and production truth

- Canonical production source is
  `fa2b317f8e99abcc7917a9d867407c460d82b9b6`.
- Production `current` and compatibility `dist` resolve to
  `release158-fa2b317`; `previous` resolves to `release157-c891d24`.
- Release158 has G10 GO with P0=0/P1=0. Exact source, hashes, tests, CSP,
  two-vantage smoke and executed static rollback/forward are in `REL-0158`.
- The Analytics v2 backend remains the exact release157 runtime. Static
  rollback changes both pointers to release157; the separate full pre-v2
  backend rollback remains documented in `REL-0157`.
- `salon-bot-v2.service` is active, Nginx syntax is valid and SQLite integrity
  is `ok`. Final operator-network and VPS read-only smoke each passed 14/14.

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

## Verification summary

- Release158 proof remains site 563/563. The current incident branch is site
  566/566; backend 30/30; Brain 39/39; syntax, strict validation and diff checks
  green. The release158 three-review GO remains unchanged.
- Deterministic payload: 353 files / 24,970,161 bytes, manifest
  `f759b4a9…55b5`; immutable live tree: 356 files / 24,980,332 bytes, manifest
  `fab1be44…fe38`.
- Repository, immutable tree and live HTTP hashes agree for `admin.html`,
  `admin-analytics.html`, analytics CSS/JS and the master `admin.js`.
- `admin.html` uses the fresh `analytics3` controller URL; the live analytics
  page has strict same-origin CSP and unauthenticated readback returns 403.
- External/VPS smoke passed 14/14 before activation and after release158. It
  passed 14/14 during the executed rollback to release157 and again after
  forward restore to release158.
- Production contacts, orders, logs, raw analytics and legacy rows were not
  read; no backend, database or collector file changed.

## Remaining P2

- The authenticated owner should confirm the first organic consented session;
  an initially empty series is correct and must not be seeded from legacy data.
- Replace the monthly DB-IP snapshot with the verified September file by
  15 September 2026; integration/operations owns it.
- Legacy analytics retention/deletion needs a separate privacy workstream and
  must not be exposed as Analytics v2 history.

## One exact next step

Open the authenticated master dashboard at
`https://akademsalon.ru/admin-analytics.html`, confirm that the first organic
consented session appears in the new cabinet shell, and report any real-world
classification discrepancy with its selected period and filters.
