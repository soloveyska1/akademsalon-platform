# План OUT-007: единый поиск и ясный вход в каталог

- Date: 2026-08-03, Europe/Moscow
- Base: `746551711335c39c49f57f4351fed78e8d613974`
- Discovery workstream: `WS-1d99b0fdd56041e9b830b5ca4cd8b5ef`
- Write owner: one implementation owner; all reviewers read-only.
- Evidence: `E-1009`.
- External boundary: no submit, OAuth, payment, analytics-consent mutation,
  client-data access or deletion. Production deployment is a separate G10 only
  after all local gates are green.

## Outcome and protected contract

One global search sheet must have the same readable anatomy and behavior on
home, services and cabinet. Catalogue-local controls narrow the current list and
must not compete as a second textual search model. Existing OUT-005 contracts
remain immutable in this outcome: 12 hub cards, 9 disciplines, 22 detail URLs,
ItemList 13, exact routes/prices/schema/canonical/no-JS behavior, saved intent,
one primary continuation, AA and 44 px targets.

The implementation is three atomic commits. Each has its own failing-first test,
browser gate and independent rollback; no commit may conceal another gate.

## Commit 1 — geometry and reachability

Only deterministic defects, without a new catalogue visual language:

1. park the catalogue toolbar below the fixed header using the canonical header
   height while keeping it below header z-order; give anchors matching
   `scroll-margin-top`;
2. reserve dock height plus `env(safe-area-inset-bottom)` in the services
   content flow so local controls, saved intent and the final content row remain
   reachable at 360 and 390;
3. remove the late home-mobile rule that compresses a result title to about
   94 px; title owns the row and the arrow remains trailing;
4. make suggestion chips either wrap or horizontally scroll with an explicit
   edge affordance; silent clipping is forbidden;
5. make all touched chips/tabs at least 44×44 px.

Gate 1: at 360/390/768/1024/1440 in light/dark, `elementFromPoint` at every
catalogue control resolves to that control, all content clears header/dock,
body has no horizontal overflow, result title owns ≥70% of its row, chips have
no silent clipping and touched targets meet 44 px. Saved `ВКР / диплом · Шаг 3
из 3` survives open/close/reload and remains visible.

## Commit 2 — canonical shared presentation layer

Move the already-corrected global-search presentation from the home-only layer
to `polish15-chrome.css`, rescoping selectors for the shared markup and removing
the duplicate. This is a pure move: property values must not change. Required
variables may move with the block, but page resets and generic button/mobile-CTA
rules may not enter shared chrome.

Gate 2:

- diff audit finds no property-value change inside the moved layer;
- computed styles of sheet, full-width input, close control, chips, result row
  and focus state match on home/services/cabinet at 390 and 1440, light/dark;
- keyboard `/`, arrows, Enter and Escape work, focus enters the input and returns
  to the invoker, dialog/listbox names and visible focus remain valid;
- cascade smoke covers one representative of every template: home, services,
  service detail, cabinet, application and guide at minimum;
- all touched CSS/JS consumers receive one atomic cache-key wave. Verification
  reads the deployed `current` tree, never stale `dist` or browser cache.

## Commit 3 — deterministic findability

Use one query-side normalization/alias table; create no route or schema alias.
It must cover at least `диплом`, `дипломная`, `дипломная работа`, `ВКР` and
`выпускная квалификационная`. Ranking is explicit: exact discipline match, then
work type, then situation/stage, then commercial/supporting page. An exact
discipline match such as `экономика` cannot rank below Commission.

Render a stable visible `Найдено: N` whose N equals the rendered result rows and
announce changes in a restrained `aria-live` region. Zero state says nothing was
found and gives one recovery path. Do not introduce a second synonym dictionary
or a second visible text input in the services-local controls.

Gate 3 freezes these queries on fresh and saved intent:

| Query | Expected |
|---|---|
| `курсовая по психологии` | existing positive result remains first; count matches rows |
| `экономика` | both discipline matches precede Commission; first relevant result is in the 390 px initial result area |
| `дипломная` | at least one existing ВКР/diploma route; never zero |
| `научрук` | relevant supervisor material is in the first result group |
| synthetic nonsense | `Найдено: 0` is visible/announced with one recovery action |

Run the matrix with keyboard and pointer; verify count/result equality, no
saved-intent mutation, no new routes, and the complete protected inventory.

## Post-fix IA decision, not implementation scope

After all three gates are green, repeat synthetic catalogue tasks against the
fixed version. Continue to a separate IA prototype only if a typical target
takes more than 15 seconds or more than two wrong navigation moves, a user still
cannot explain where to start, or observation shows switching between at least
two navigation models in one task. If feedback is only density, typography or
“некрасиво”, stop the IA branch and treat it as bounded visual polish.

The first prototype, if the gate opens, tests exactly one hypothesis: work type
as the only leading axis; situation, stage and discipline become secondary
facets. It reorders existing entries and must not alter 12/9/22/13, routes,
schema, saved intent or the one-primary handoff.

## Verification, stop conditions and rollback

Before implementation record failing tests for every reproduced P1. After each
commit run focused search/catalogue contracts, full product regression, JS/CSS
syntax where applicable, `git diff --check`, Brain tests/strict validation and
the exact browser matrix. Final review requires P0=0/P1=0 from independent UX
and QA reviewers. Production requires G10 healthcheck, smoke of home/services/
cabinet search and verified rollback.

Stop immediately on any protected contract diff, no-JS/keyboard/focus failure,
body overflow at 360, home regression, property-value mutation in commit 2,
cache-wave mismatch, route/schema data inside aliases, submit/auth/payment
mutation or unresolved manifest conflict. Roll back the three commits
independently; commit 2 must remain a mechanically reversible presentation move.
