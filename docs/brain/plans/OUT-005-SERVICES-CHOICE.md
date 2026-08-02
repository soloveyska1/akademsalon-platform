# План contract-first среза OUT-005: выбор услуги

- Date: 2026-08-03, Europe/Moscow
- Base: `96156040130c874519d1cd4f6335173a774d7847`
- Workstream: `WS-9f644e92a3a04eb280a49d550b0ae513`
- Write owner: `codex-root`; reviewers are read-only.
- Evidence: `E-1007`.
- External boundary: no production request, OAuth, deploy, client data,
  deletion, local LLM, watcher or persistent service.

## Outcome and non-goals

Keep the four proven situation choices, but turn the interaction into
“select one → one explicit continuation”. When a draft exists, continuing it is
the sole primary; starting a new choice is explicit and does not mutate or erase
state before confirmation. The physical catalogue remains an HTML reference.

This is not a redesign of the verified global shell, not removal/JS-rendering of
SEO pages, not a new wizard and not a price change. `OUT-001` downstream proof
is out of scope.

## Acceptance contract

Fresh state:

- four named situation controls, none silently selected;
- after selection exactly one primary continuation;
- exact allowlisted map: topic/diagnostic, draft/editing,
  comments/diagnostic, defense/defense, all with `route=page`;
- no raw phrase, contact, file name or unsupported query key;
- no-JS fallback keeps four ordinary physical links.

Saved state:

- resume is the only primary in the page-head viewport;
- “Начать новый подбор” is secondary and only reveals the selector;
- continue/replace are explicit; no local draft mutation before replace;
- incoming route survives reload/history until resolution;
- every rerender moves focus to the new step heading or exact intended control.

Catalogue/detail contract:

- exact inventory remains 12 hub cards, 9 discipline links, 22 detail pages and
  ItemList 13; canonical/schema/sitemap/prices stay byte-equivalent unless an
  independently proved truth correction is explicitly approved;
- search cannot claim empty while a matching discipline link exists;
- every detail hero/action route carries explicit URL intent and stays usable
  when storage is blocked; no stale `draft.concept/state` contradiction;
- page copy, explicit route and canonical pricing agree. Any ambiguous truth
  stops implementation rather than choosing a convenient tier.

Visual/reliability contract:

- page-owned primary/resume normal text ≥4.5:1 in light/dark;
- 360/390/768/1024/1440, keyboard/focus, reduced motion and ≥44 px pass;
- overflow ≤1 px, console error/warning empty;
- changed catalogue CSS/JS use one cache key across all 24 consumers.

## Execution sequence

1. Correct the stale Brain entry point and freeze this plan/evidence before
   product edits.
2. Add failing-first `tests/services-choice-contract.test.js` covering choice
   states, allowlisted mapping, saved conflict/history/focus, contrast math,
   exact physical inventory, discipline search, explicit detail intent and
   24-consumer cache parity. Capture each red group separately.
3. Implement the smallest hub state machine in `services.html` plus
   `polish15-catalog.js`; keep a `<noscript>` route fallback and do not touch the
   catalogue card URLs/schema/prices.
4. Fix configurator conflict timing/focus in its inline runtime. Do not broaden
   into its three-step composition.
5. Apply an explicit accessible catalogue CTA token in
   `polish15-catalog.css`, then atomically bump the two shared catalogue assets
   on all 24 consumers.
6. Replace storage-only detail handoffs with explicit allowlisted URLs only
   after a generated truth matrix agrees across page copy, `pageCaseContext()`
   and canonical prices. If `assets/js/app.js` is wrong, stop and declare a new
   manifest/cache scope revision before editing it.
7. Run focused tests, full repository tests, JS syntax, `git diff --check`,
   Brain 39/39/strict validate and a local browser matrix: fresh, saved,
   continue, replace, reload/history, services, tariffs, representative detail
   and discipline page in light/dark at the contract viewports.
8. Re-fetch, re-run conflicts and use the submitted→integrated lifecycle only
   after P0/P1=0 and evidence is durable.

## Stop conditions

Stop on any physical URL/canonical/schema/sitemap/price loss, unsupported or raw
URL state, stale draft mutation, focus loss, route loss on reload/history,
contrast below 4.5, target below 44 px, overflow above 1 px, console error,
direct/cache divergence, production request, live OAuth, hard conflict or
unresolved product-truth mismatch. Model preference cannot waive a stop.

## Risks and rollback

The largest blast radius is the 24-consumer catalogue asset wave; the second is
saved configurator state. Keep Brain/test, hub/runtime, configurator, contrast/
cache and detail-intent changes as reviewable commits. Product implementation
is rolled back by reverting those commits in reverse order. There is no
external rollback because no production mutation is authorized.
