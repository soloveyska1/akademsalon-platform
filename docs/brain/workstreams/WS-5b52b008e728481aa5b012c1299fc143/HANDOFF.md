# Workstream handoff

- Branch: `codex/out-006-practice-result-passport-v1`
- Outcomes: `OUT-006`
- Goal: replace the abstract 14,000 RUB explanation on the public practice page
  with one compact, checkable result passport without adding a new offer,
  primary action, script or analytics event.
- Acceptance: the passport names the supplied real materials, exactly four
  support outputs, exclusions and the per-stage specification boundary; its
  only new navigation is a secondary text link to the explicitly fictional
  specification sample. The existing 2,500 / 8,000 / 14,000 RUB radios,
  routes, JSON-LD, diagnostic credit and single primary continuation stay
  unchanged. At 390 and 1440 px in light and dark themes there is no body
  overflow, console error or Otisk regression, and keyboard radio selection
  still reaches the exact route.
- Proof: failing-first contract in `tests/practice-price-trust.test.js`, focused
  Node tests, full site/Brain gates, deterministic build and `git diff --check`;
  local Chromium 390/1440 light/dark plus two independent P0/P1 reviews.
- Changed:
  - `otchet-po-praktike.html` now nests one result passport under the
    `support` radio. It appears only for the selected 14,000 RUB scope, names
    the required real materials and exactly four deliverables, keeps the full
    commercial/authorship boundary visible, states that 14,000 RUB is the
    lower guide for the whole listed composition, and links secondarily to the
    fictional specification sample. A `pageshow` reconciliation keeps the
    restored radio, status and both continuations consistent after Browser
    Back.
  - `assets/css/polish15-catalog.css` adds only page-scoped Otisk rules for the
    nested passport, responsive/dark states, a 54 px disclosure target and an
    AA-readable dark accent. The decorative folio is an `aria-hidden` element,
    not generated accessibility text.
  - `tests/practice-price-trust.test.js` locks the selected-scope visibility,
    four outputs, complete exclusions, whole-composition price meaning,
    fictional-sample link, `pageshow` synchronization, dark/mobile coverage
    and the existing single-primary/route contract.
- Verified:
  - `node --test tests/*.test.js`: 590/590 pass;
  - `python3 -m unittest discover -s backend/salon_bot/tests`: 31/31 pass;
  - `python3 -m unittest discover -s tools/brain/tests`: 39/39 pass;
  - `./bin/brain validate --strict`: `VALID records=82 links=151 manifests=34`;
  - two consecutive `npm run build` outputs: 354 files, 26,161,152 bytes,
    identical digest
    `663e7ae2c9ef75f543f1c846fc19756b4d9f1c584d3cc2ca2a0ed1661a72ecfa`;
  - local Chromium at 320/390/1024/1440, light/dark: passport hidden for the
    default 8,000 RUB radio and visible for support; exact support status and
    routes, one primary action, root overflow 0; dark output indices are about
    6:1; the 54 px summary and Browser Back reconciliation are observed;
  - commercial and skeptical-buyer reviews: GO, no P0/P1/P2.
- Unverified: production deployment/smoke and organic conversion effect. Local
  console contains only the expected production-auth CORS rejection from the
  localhost origin; production must still prove a clean console.
- Risks/rollback: the sample could be mistaken for a fixed package, the 8,000
  and 14,000 RUB scopes could blur, or the page could gain visual density.
  Explicit `Вариант 03`, fictional-sample wording, route contracts and a
  replace-not-append layout contain those risks. Rollback is the single
  implementation commit; no backend or stored data is in scope.
- Next: commit the implementation, rerun fresh fetch/conflicts and release
  gates, submit/integrate the exact result SHA, then publish an immutable
  production release with health, visual/route smoke and rollback proof.
