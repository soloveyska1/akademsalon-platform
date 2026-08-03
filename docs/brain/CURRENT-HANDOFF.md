# Current handoff

## Canonical and production truth

- Canonical integration ref is exact
  `b9837a34c4e39e0adfb725dcf5f76f4e96f1e30e`. It contains integrated OUT-006
  frontend privacy result `1011060c9b2f30b55809ab9bb253ae64cf811925` and
  terminal workstream `WS-9e49bd5ae79b479a82005aa32b1fd7fa`.
- Production is `release101-b9837a34c4e`, exact canonical source `b9837a3`.
  `REL-0101` proves staged/live hashes, two-vantage 14/14 read-only smoke,
  isolated browser behavior and executed release100 rollback/forward restore.
- `OUT-002`, `OUT-003`, `OUT-004` and `OUT-005` remain verified. The OUT-006
  privacy foundation is verified; the outcome's server measurement and
  synthetic comprehension portions remain gated.

## What release101 proves

- Internal analytics is canonical-host/HTTPS only, uses `credentials:'omit'`
  and is silent on dashboard, admin, payment-link, impersonation and preview
  contours. It performs one best-effort send without unsafe client retry.
- All 92 root page identities use an exact allowlist and `/other`; legacy stored
  entry paths are canonicalized. Marks/events have finite dimensions, with a
  collision-free 336-variant legacy route migration.
- Reject, revoke and expiry purge browser ID, attribution and `_ym*`; a page
  opened without consent cannot recapture its UTM/referrer after same-document
  regrant. `/qa` no longer combines contact data with `salon_vid`.
- Failure-first contract is 10/10, independent P0/P1/P2=0, product 492/492,
  Brain 39/39. Production WebKit at 390×844 and 1024×900 had no overflow or
  console errors and made no no-consent `/api/visit` request.
- Live app SHA-256 is
  `c46d3984aa291b611af16f2fea808e15a92f7178df18591ee9a5ad8eda66ec41`;
  rollback reproduced release100 hash
  `2e7a955072d6ae595dbd7d5c5341e20f6e33427e5c226f2ac9dd99ad45cc7be8`
  and forward restore returned the release101 hash.

## Reproduced user feedback: next product slice

Three independent read-only reviewers audited search, catalogue and reliability.
The released privacy change itself is GO. Search/catalogue findings are separate
and must not be patched on the release branch.

- Global search markup is shared, but its complete redesigned CSS lives mainly
  in the home-only layer. Services and cabinet therefore render a narrow,
  wrapped overlay on desktop/mobile; home mobile also reintroduces a broken
  three-column result row. The services local search overlaps the fixed dock by
  44 px at 360×800 and 8.7 px at 390×844. Dialog semantics, Escape, arrows and
  focus return are green.
- Catalogue toolbar uses `top:0` under the fixed 70 px header, so its search can
  be visually and hit-test obscured. Query `экономика` finds two discipline
  pages but leaves unrelated Commission content before them; `дипломная` returns
  no result despite ВКР/diploma routes. There is no positive result count/live
  announcement. Cards are dense and four competing IA models obscure the first
  useful route.
- Existing OUT-005 contracts remain protected: 12 hub cards, 9 disciplines,
  22 detail URLs, exact routes/prices/schema, canonical/no-JS behavior, one
  primary, AA contrast and 44 px targets. Redesign is authorized only inside
  those contracts or through an explicit new decision backed by a failing test.

## Remaining limits

- `/api/visit` backend IP handling, dedupe, idempotency, retention and aggregate
  readback remain unknown. New `first_step_*` production milestones and claims
  of measured comprehension are forbidden until authoritative server evidence.
- `OUT-001` still needs authoritative backend/bot marker, lookup and cleanup;
  no production submit was attempted.
- SSH/HTTPS occasionally times out before connection. Final exact hashes,
  server/external smoke and rollback-forward are green; no watcher, local LLM,
  browser or temporary server remains.

## One exact next step

From fresh canonical, create a scoped search/catalogue clarity workstream. Run
the daily Kimi+Sonnet+GLM review on the reproduced evidence, one Opus review on
the key unified-search/IA fork, and use Fable once only if the four-model IA
conflict remains systemic. Fix shared search presentation and dock/header
occlusion first, then simplify catalogue findability while preserving every
OUT-005 route, price, schema and handoff contract.
