# План безопасной отправки и read-only preflight для OUT-001

- Date: 2026-08-02, Europe/Moscow
- Workstream: `WS-a6aece1c10d0439f99e75df4d7bcb66f`
- Base: `d5eb76cec58fcf7a79dd59096ae1a097a47d5a99`
- Branch: `codex/out-001-submit-safety`
- Write-owner: `codex-root`; independent agents are read-only reviewers.
- External mutations: prohibited. No production order, OAuth mutation, deploy or
  data deletion belongs to this slice.

## Why this slice comes first

`E-1002` found two locally reproducible safety defects in the highest-priority
client path. The frontend retained one request ID without atomically binding it
to the serialized intent, and the checked-in production smoke could send a real
`POST /orders`. These facts block a truthful claim that one submit becomes one
confirmed case. Public shell redesign has no reproduced P0/P1; the cabinet false
priority message remains the next bounded `OUT-002` defect after this slice.

## Execution contract

1. Inventory every browser producer of `POST /orders` and route both the full
   configurator and guide microlead through one pure shared helper.
2. Store one atomic session record per producer/scope:
   `{v:2, producer, scope, id, intent_sha256}`. The helper owns ID injection;
   producers cannot provide `client_request_id`.
3. Fingerprint the exact JSON-wire value after serialization semantics have
   removed object `undefined` and converted array `undefined` to `null`.
4. Fail closed with zero fetch for legacy v1 residue, corrupt/partial/future
   records, storage/crypto/auth-header failure, invalid scope or changed intent.
5. Use a cryptographically generated ID only. Success requires 2xx, `ok:true`
   and a canonical positive safe-integer ID, including safe decimal strings.
6. Keep one physical POST while an identical intent is in flight. A soft timeout
   may return control to the UI but never aborts the POST; retry joins that same
   promise. After an actual ambiguous response, a later retry keeps the atomic ID.
7. Clear by compare-and-swap with the exact attempt ID only after confirmed
   success or definitive rejection. Retain state for ambiguity, conflict and
   local fail-closed outcomes.
   Before a durable state exists, a same-tick changed-intent conflict may expose
   an empty diagnostic `clientRequestId`; consumers must not use that optional
   field to clear state or decide user-visible conflict handling.
8. Make `tests/production-smoke.js` export an injectable runner and mechanically
   reject every method except GET/HEAD. Remove the order probe entirely.
9. Rebuild the home JS bundle and move all `app.js`, `extras.js` and home JS
   bundle consumers to one new cache key before calling the change deploy-ready.

## Proof and acceptance

- Failing-first contract test proves the canonical baseline lacks the helper.
- Pure state-machine tests cover atomicity, reload, changed intent, legacy and
  corrupt state, unavailable dependencies, JSON semantics, safe IDs, CAS clear,
  single-flight, soft timeout, auth-status ordering and producer bypasses.
- An injected complete smoke run records every attempted method and URL; it must
  contain only GET/HEAD and no `/orders` request.
- Generated bundle contains the same v2 contract and every shared consumer uses
  cache key `20260802out001submit1`.
- `node --test tests/*.test.js`, build, Brain validation and a fresh conflict
  scan must pass. Independent Kimi/Sonnet/GLM and one Opus release review may
  raise vetoes but cannot replace deterministic proof.

## Stop conditions

Stop before any external POST until authoritative server evidence defines and
proves all of the following: idempotency scope and TTL, same-ID/different-payload
conflict, transaction/outbox boundary, allowlisted synthetic marker, lookup
cardinality zero-or-one, exact cleanup across order/events/operator/bot/cabinet,
and zero residue after cleanup. Also stop on a second record/notification, real
client routing, missing rollback, secret/contact material in evidence, P0/P1
regression, or canonical/manifest conflict.

## Risks and rollback

- A stale cached helper combined with a new producer could bypass the contract;
  the shared cache-key bump is therefore part of the same release unit.
- A late response could clear a newer attempt; compare-and-swap prevents it.
- Old v1 state cannot be safely bound to a new payload; it deliberately blocks
  in that tab and the UI directs the user to a new tab or direct contact.
- The server may not deduplicate at all. Frontend single-flight reduces local
  duplication but does not close server/delivery proof.
- Code rollback is an exact revert of the implementation commit plus the cache
  references. Production rollback is not exercised because this workstream does
  not authorize publication.
