# Current handoff

## Canonical and production truth

- Canonical integration ref at incident branch creation is exact
  `1d9d681fcf037d998a81102be82a7f8fb039c952`; release103 static source remains
  `74b6e0937277ddf0afcd433da9a22f973c7a7d26` and its frozen product result is
  `8ed1cd5c4f463fbf3a3010c9dd6fd5437d335b79`.
- Production `current` and compatibility `dist` both resolve to
  `release103-74b6e0937277`. Exact publication, two-vantage smoke, 96 production
  browser states and executed release102 rollback/forward are in `REL-0103`.
- Rollback is `release102-e2f76c3d71c8`. It is healthy but intentionally
  reopens the historical 921–1240 pointer-search P1 until forward restore.

## What release103 proves

- One named 44×44 search trigger is continuously reachable across the 920 px
  mobile seam and through 1240 px on home, services and cabinet in light/dark.
- Search/catalogue JS and the protected 12 hub cards, 9 disciplines, 22 detail
  URLs, ItemList 13, routes/prices/schema and saved intent remain unchanged.
- Product is 501/501; Brain 39/39; shared shell proves every consumer has a live
  dialog runtime. Kimi/Sonnet/GLM and Opus approve; three independent Codex
  reviews report P0=0/P1=0.
- Public artifact is 337 exact files plus two preserved server paths, 339 total.
  Live chrome CSS is `89dbf8de…46ce`, home CSS `0d463049…5cde` and index
  `c3f7709b…9104`.
- Final external and VPS smoke each passed 14/14 before and after the executed
  rollback. Production WebKit passed 48/48 before and 48/48 after restore.

## Production submit incident and recovery

- The user's exact 409 copy exposed a real production-wide outage, not a client
  mistake. Live frontend and documents were consent request 1.0, privacy 3.1 and
  oferta 3.2; active backend order and gift contracts still required 3.0/3.0.
- The backend rejects that mismatch before request-ID lookup or database create,
  so the reported failed attempt did not create an order.
- An authorized backend-only hotfix aligned the active order and gift constants,
  compiled the replacement and restarted `salon-bot-v2.service`. Exact previous
  bytes remain in `config.py.pre-consent-hotfix-20260803`; active source hash is
  `d15fd1f5…93a9`.
- Service health recovered on the first bounded follow-up poll and VPS GET-only
  smoke passed 14/14. No test order, client row, OAuth flow or deletion was used.
  Exact proof and rollback are `E-1013`.

## Remaining limits and debt

- `/api/visit` backend IP handling, dedupe, idempotency, retention and aggregate
  readback remain unknown. New `first_step_*` claims remain forbidden.
- OUT-001 still needs authoritative backend/bot marker, lookup and cleanup; no
  production submit has been attempted by an agent. The user may safely retry
  the unchanged real form because the rejected attempt occurred before create.
- The request-consent page has one stale textual reference to privacy 3.0, and a
  future `consent_version_mismatch` would still show the generic ambiguous 409
  copy. Both are bounded tracked follow-ups for the next frontend release.
- Overlapping legacy header visibility rules are P2. Consolidate them only in a
  separate failure-first workstream before the next breakpoint edit.
- Default network route is `utun6`; production SSH/curl must bind to `en0` or
  execute smoke on the VPS.
- Inactive release102 sidecar staging remains non-live and untouched until an
  explicit cleanup plan.

## One exact next step

Collect the user's result from retrying the unchanged real request. If it is
successful, ship the bounded privacy-reference and stale-page error-copy fix in
its own frontend workstream; agents still do not submit a production test request
until the unique marker, isolated lookup and bounded cleanup contract exists.
