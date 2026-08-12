# Workstream handoff

- Branch: `codex/analytics-v2-dbip-attribution`.
- Base: `f215d850d24f45baa7a18eca515ca94a05707f42`.
- Outcome: `OUT-006`.
- Goal: satisfy DB-IP City Lite CC BY 4.0 attribution before production uses
  approximate geography, without changing metrics, collection or layout.
- Acceptance: the geography panel visibly names and links DB-IP with safe
  external-link attributes; strict admin CSP remains green; 390/1024/1440
  geometry and full regressions remain unchanged.

## Changed

- The approximate-geography panel now links `https://db-ip.com`, names DB-IP
  and states `CC BY 4.0` in visible Russian copy.
- The link opens separately with `noopener noreferrer`; no script, image,
  stylesheet or request is loaded from DB-IP.
- A deterministic contract prevents removal of the attribution or conversion
  into a third-party runtime dependency.
- `E-1015` records the license boundary and updated regression count.

## Verified

- Focused admin/contract tests: 9/9.
- Full Node regression: 553/553.
- `git diff --check` and `./bin/brain validate --strict`: green.
- Strict admin CSP remains self-only; an ordinary external navigation link is
  permitted and Referrer-Policy/`noreferrer` prevents URL disclosure.
- Independent Chromium review: GO; 390 px root width 390, readable 12/18 px
  five-line note, no overflow at 1024/1440, 0 CSP violations/console/external
  resource requests; temporary browser/server closed.
- No production mutation or MMDB installation occurred before this gate.

## Risks and rollback

Absent attribution blocks DB-IP deployment. Rollback may remove this text only
if production also stops using DB-IP geography. It must never be compensated by
loading a remote widget or sending an IP to a geolocation API.

## Next

Freeze the implementation result, integrate it into fresh canonical, then
restart the abandoned release157 workstream from that exact SHA.
