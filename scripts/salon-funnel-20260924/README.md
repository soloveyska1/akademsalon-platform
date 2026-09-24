# Direct intake measurement and guide handoff — 24 September 2026

Outcome OUT-006. This is a bounded overlay for the actual release217 tree, not a full static rebuild from the older canonical root HTML. Root is the only writer.

## Behavior

- Guide CTA enters `configurator.html?service=pl&work=course`. Explicit service intent wins over saved selections and commerce composition; course is selected in the existing plan service. No price or business terms change.
- Existing `config_open`, `first_input`, `validation_error` and `submit_fail` are restored on the direct intake. No new server event or dimension values. The existing server contract is 2.5.0, verified by hash in evidence.
- Open and first input are once per consent period in this document. A later consent starts observation then; earlier input is never replayed. Native trusted input and a committed custom-select action qualify. Search within the select, re-selecting its existing value and programmatic prefills do not.
- The select adapter passes its original trusted event locally after change handlers run. No field content is sent to analytics. `validation_error` uses only existing calculator/service CTA enums; `submit_fail` uses server_rejected/request_conflict/network_fallback. The last category means no confirmed outcome, not proof that the request failed to reach the server.
- Stable request/file IDs, actual payloads, consent document, confirmation logic and pricing are unchanged. Required app/order/select cache URLs change atomically on the form. Additive app/select changes remain backward compatible on other pages.
- Consent and owner/QA exclusions remain enforced by the current analytics transport. Existing legacy `/api/visit` behavior is outside the changed path; no-analytics consent blocks it. Current server funnel has an input stage; legacy contact-step diagnostics should still not be interpreted as an actual direct-form step.

## Reproduction

Capture the immutable public current tree to a private temporary baseline directory. No client data or server secrets belong in that snapshot. Build fails if any of six expected input hashes changes.

```
python3 scripts/salon-funnel-20260924/build.py BASELINE CANDIDATE
SALON_NODE_DEPS=/path/to/node_modules node scripts/salon-funnel-20260924/probe.mjs CANDIDATE
SALON_NODE_DEPS=/path/to/node_modules node scripts/salon-funnel-20260924/verify.mjs CANDIDATE output/playwright/salon-funnel-20260924 SERVER_CONTRACT_JSON
```

`verify.mjs` uses installed Chrome with a new temporary context and intercepts every HTTP request. Static responses come from CANDIDATE; all APIs are mocked. No real order, payment, analytics grant or event is sent. Browser contexts and browser close in finally. Screenshots and an aggregate check report are written under output/playwright.

The build creates build.json and delta.tar.gz next to CANDIDATE. Deployment copies exactly six changed files into a new immutable tree; preserves the 515-file inventory and dist pointer; verifies full baseline and archive hashes; checks health/public hashes after apply, executed rollback and forward. A changed current pointer or byte inventory aborts publication. Backend, DB and Nginx are unchanged. Never restore a database for this static rollback.

## Scope and conflicts

The attempted exact canonical guide write was blocked by historical active worktree reservations and abandoned before any product edit. This stream owns only its unique script/evidence directories and generated handoff. It makes the guide change only as a hash-pinned production overlay. Brain strict scan: hard=0, warnings=62. As integration owner, root explicitly accepted terminal/unmanaged-history warnings for this disjoint local snapshot; no hard item was overridden. Deployment separately fails closed against the complete production inventory.
