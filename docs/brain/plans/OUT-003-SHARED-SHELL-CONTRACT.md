# План executable contract общей оболочки для OUT-003

- Date: 2026-08-03, Europe/Moscow
- Base: `65adc47cf31ffaa3ba9a797204d938ef866f0e14`
- Bootstrap HEAD: `78c677c02ea298b1a62788b8051536eb481f3b05`
- Workstream: `WS-c4d669dfa50e4493a2fbef81f3481ede`
- Write owner: `codex-root`; reviewers are read-only.
- External boundary: no production requests, OAuth, deploy, customer data,
  deletion, local LLM, watcher or persistent service.

## Why this outcome now

OUT-001 remains externally gated by missing marker/lookup/cleanup and an
authoritative downstream contract. OUT-002 and OUT-004 are integrated. OUT-003
has the widest locally provable blast radius: 89 public shared-shell routes,
one bundled home delivery, an account variant, an admin foundation and two
standalone exceptions. It is therefore the next safe product slice before
changing the catalogue or service choice.

## Audited topology

- 92 root HTML documents.
- 89 public-shell routes resolve exactly once into fixed, legal, tools,
  disciplines, services or guides families.
- `index.html` receives the same source runtime through
  `home-release.min.{css,js}`; the other public routes receive direct assets.
- `dashboard.html` is the account-shell variant; `configurator.html` replaces
  the shared acquisition dock; `404.html` and `zayavka.html` are quiet consent /
  analytics exceptions.
- `admin.html` is an app foundation with public chrome disabled.
- `admin-covers.html` and `oplaceno.html` are explicit standalone exceptions.

## Reproduced baseline, not assumptions

P0 is empty. The following P1 candidates must be encoded as red checks before
runtime changes:

1. Saved dark theme is lost on five legal routes without the early
   `salon_theme` bootstrap: `academic-integrity.html`,
   `consent-analytics.html`, `consent-marketing.html`,
   `consent-publication.html`, `refunds.html`. A local 390x844 navigation from a
   dark standard route reproduces `data-theme=light` and a light body.
2. The mobile footer primary uses `#fff8ef` on dark `--wax:#C65B41`, contrast
   4.006:1. Unread/auth badges use an equivalent light-on-wax pair at 4.181:1.
3. `admin.html` loads public `polish15-chrome.js` while its own search also owns
   Cmd/Ctrl+K, so both handlers can execute.
4. Consent preferences declare `aria-modal=true` and trap Tab, but do not make
   the page background inert.
5. Legal copy promises persistent “Настройки данных”, and `extras.js` has its
   listener, but the shared footer has no opener. Eight ordinary public routes
   also omit `extras.js`. This is treated as a hard product-truth/privacy gate
   until a deterministic test proves the complete route contract.

Existing source-regex suites are green and therefore do not prove these states.

## Executable contract

The contract resolves every root document to one delivery and shell family and
records explicit flags for header, appbar, footer, dock variant, auth entry,
menu/search, theme bootstrap, consent runtime/settings, analytics and approved
exceptions. State axes are:

- viewport: 360, 390, 768, 1024, 1440;
- theme: light, dark;
- motion: normal, reduced;
- auth: pending, anonymous, guest, authenticated;
- overlay: none, header popover, menu, search, consent banner/preferences;
- consent: unset, necessary-only, analytics;
- delivery: direct, home bundle, account, admin, standalone.

Invariants: one resolved family; one intended primary CTA; no public dialog on
excluded routes; at most one modal; background inert while modal; exact focus
return; trigger `aria-expanded` parity; preserved theme/auth/history; touch
targets at least 44px; contrast at least 4.5:1 for normal text; no overflow,
overlap or clipping; source/home-bundle parity; changed assets have complete
consumer cache keys.

## Execution sequence and proof

1. Freeze inventory, expand the manifest to the exact consumers and commit that
   revision separately. Re-run `brain conflicts`; warning-only overlap with
   dormant remote refs requires an explicit integration-owner decision, while
   any hard/dirty active overlap stops work.
2. Add `tests/shared-shell-contract.test.js` and capture the red baseline for
   each candidate independently. If a candidate is not reproducible, record it
   as debt rather than changing runtime.
3. Apply the smallest reversible corrections without visual redesign:
   bootstrap parity on the five routes; existing accessible `--wax-cta` token
   for dark CTA/badges; single shortcut owner on admin; true consent inertness;
   persistent settings opener and complete ordinary-route runtime.
4. Rebuild the home bundle from canonical sources and update only the cache keys
   of exact direct consumers plus `index.html`. Byte/parity and consumer checks
   are hard gates.
5. Run focused tests, full repository tests, `git diff --check`, Brain tests and
   validation. Then run a local browser spine using blocked/fixture-only APIs:
   home, standard, legal, account, configurator, admin, 404 and standalone at
   the contract viewports/states. Record commit, route, viewport, theme,
   browser, data state and expected/actual in `E-1006`.
6. Ask Kimi/Sonnet/GLM for independent daily review and Opus once for the key
   contract/UX decision. Fable is connectivity-only unless a real systemic
   deadlock appears. Model output cannot override executable evidence.

## Stop conditions

Stop implementation or integration on any P0/P1, contrast below 4.5:1, touch
target below 44px, horizontal overflow above 1px, focus escaping a modal,
theme/auth/history loss, direct/bundle divergence, stale changed-asset consumer,
unexpected external/production request, live OAuth requirement, dirty active
overlap or hard Brain conflict. Do not broaden into header/footer redesign or
OUT-005 catalogue work.

## Risks and rollback

The primary risk is an atomic shared-asset wave reaching nearly all routes.
Mitigation is failing-first isolation, exact consumer inventory, one build
command, version assertions and representative browser coverage. Runtime plus
generated bundles stay in one implementation commit; if parity/browser/full
regression is red, revert that commit as a unit. Documentation/test commits are
independent and external state remains untouched.
