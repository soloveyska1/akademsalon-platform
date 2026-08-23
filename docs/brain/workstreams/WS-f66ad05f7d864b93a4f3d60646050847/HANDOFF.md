# Workstream handoff

- Branch: `codex/out-006-practice-support-continuity-v4`
- Outcomes: `OUT-006`
- Goal: preserve the public `practice + draft` ladder through the configurator,
  cart, raw request and prepayment specification without lowering the canonical
  2,500 / 8,000 / 14,000 RUB entry prices or changing the Otisk concept.
- Acceptance: diagnostic, editing and support keep distinct route/result codes,
  human labels, required inputs, deliverables, inclusions and exclusions.
  Diagnostic remains a written map without document edits; editing remains a
  visible-corrections package; support remains supplied-material staged editing
  at 14,000–19,500 RUB. Exact support is A1, generic missing-mode VIP remains
  A2. A single direct submit must materialize the selected position, and admin
  specification generation must consume both direct `items` and raw
  `cart.items`, retain the exact required inputs, and make receipt of the full
  input set a visible start dependency. Existing one-primary, privacy,
  authorship, no-guarantee and specification-before-payment boundaries remain.
- Proof plan: failure-first executable cart/request/specification contracts;
  intercepted real local POSTs without opening the cart; full public, backend
  and Brain suites; strict validation, diff/syntax checks and two deterministic
  builds; Chromium exact/generic routes at 390/1024/1440 light/dark; three
  independent post-implementation reviews; protected preview and production
  smoke plus executed static rollback/forward.
- Changed: `practiceDraftScopeCode()` now safely carries all three exact scopes
  and `result_code`; the support branch remains the only VIP route forced to
  supplied-material A1. `practiceScopeProfile()` is the canonical cart/request
  ledger for diagnostic, editing and support, including explicit boundaries
  against invented facts, grade guarantees and work submitted for the client.
  Final submit materializes an exact single practice position even when the
  drawer was never opened, and the diagnostic route is no longer downgraded to
  a generic service payload. Admin honors explicit A1 before legacy VIP/A2
  inference, reads raw `cart.items` when direct `items` are absent, preserves
  each route's required inputs in the resulting scope/customer-input record and
  states that work starts after the complete listed set is received. A raw A2
  request without cart rows now keeps its top-level contour, participation and
  from-zero result rather than falling back to A1. All three routed practice
  scopes repeat their exact title, first result and upload request on the next
  screen; their compact summary precedes fields on phones and links back to the
  public scope selector. Existing support 40-character no-file path and cache
  keys remain; admin UI and pricing logic were not changed.
- Verified: failure-first all-scope contracts failed before implementation.
  Final focused coverage is 25/25. Full public regression is 589/589, backend
  31/31 and Brain 39/39. Strict Brain validation reports 80 records / 147 links
  / 32 manifests; syntax and `git diff --check` pass. Two builds are byte-stable:
  354 files / 25,030,981 bytes / digest
  `946eedded541877a10cf4ba41d7f9d2b54618786666d2c91faa23594c65c15e3`.
  Real Chromium POST interception without opening the cart proves:
  `diagnostic` → A1/consultation, 2,500–3,500 RUB, mismatch map and explicit
  no-edits exclusions; `support` → A1/editing, 14,000–19,500 RUB, requirements
  map, staged versions, final checklist and five exclusions. Both raw requests
  contain `cart.items`; the executable admin test consumes that exact nesting
  and proves that all three required-input lists survive into the prepayment
  specification while a raw no-cart generic route remains A2 and receives no
  invented practice inputs. At 390 light, exact diagnostic, editing and support
  each show their selected title/result before the fields with zero root
  overflow; editing also keeps the established two-column composition at 1440.
  The editing hint names the ready report/diary set and the start dependency,
  rather than calling editing a diagnostic. The earlier 1024 light and 1440 dark
  support checks remain green. Local console errors are only expected
  production-auth CORS failures from localhost. Three independent final reviews
  report P0=0, P1=0 and P2=0.
- Unverified: immutable integration, protected preview and public production
  smoke/rollback are pending.
- Risks/rollback: accepting an unrecognized scope would allow metadata spoofing;
  profiles therefore require allowlisted scope/result agreement and explicit A1.
  Making every VIP A1 would weaken the lawful generic A2 path, so absent-mode VIP
  still falls back to A2. Rolling back this bounded result restores release160;
  no backend migration or data rollback is involved.
- Next: require independent GO with P0/P1 zero, commit and submit the bounded
  workstream, integrate exact result, then publish and execute release rollback.
