# План authoritative backend и synthetic observability для OUT-001

- Status: read-only audit complete; production submit `NO-GO`.
- Date: 2026-08-03, Europe/Moscow.
- Workstream: `WS-63128478355b483d97dacd4423add367`.
- Base: `90089a84438283af3899e99a5aa703960881964d`.
- Write-owner: `codex-root`; agents and model council are read-only reviewers.
- Mutations: no production submit, OAuth, payment, upload, analytics-consent,
  client-data access, deletion or deployment belongs to this audit.

## Why this is the next product slice

Release103 closes the reproduced search/catalogue P1. OUT-001 is now the only
NOW outcome whose successful business result still depends on an unproved
external chain. Frontend E-1003 already prevents local re-keying and false 2xx
success, but a unique database row is not yet a proven delivered case.

Read-only VPS inspection found the authoritative live backend/bot source. This
closes the old knowledge gap, but exposes a narrower, reproducible reliability
gap: a simple order and its created event are separate commits; operator/bot
delivery is process-memory retry without a durable outbox; no isolated test
sink, exact marker lookup or complete Telegram cleanup exists. A real
production marker would therefore create an artifact that the current system
cannot prove or fully contain.

The next implementation slice is backend reliability plus synthetic
observability. It precedes a production E2E and does not require a broad visual
redesign. Two compatible frontend contract defects can be closed alongside the
backend response schema, but their release must not be described as downstream
delivery proof.

## Current proven contract

- Exactly two tracked browser producers use one shared order helper:
  configurator and guide microlead. The helper owns a cryptographic request ID,
  atomic session record, JSON intent hash, single-flight and ambiguous retry.
- Live `/api/orders` validates consent/intake and has a permanent unique partial
  index on `client_request_id`. Same-owner/same-fingerprint retry normally
  returns the original ID; owner or fingerprint mismatch normally returns 409.
- Initial persisted status is `new`. Guest creation issues an HttpOnly guest
  session and one-time claim exchange; the exchange returns exact `order_id`.
- Cabinet and admin can read an exact order ID. The public GET/HEAD production
  smoke remains mechanically non-mutating.
- Focused frontend/auth/cabinet suite is 63/63. It is source/pure proof, not
  server/bot cardinality proof.

## Blocking facts

1. The active `/root/salon_bot` source has no version-control metadata and no
   backend contract test suite. Exact runtime files can be hashed, but there is
   no reviewable source-to-release lineage.
2. Simple order INSERT and `created` event are separately committed. A crash can
   preserve the order without its first event; bundle creation is already
   transactional and demonstrates the safer pattern.
3. New-order group/admin/client/mail delivery uses in-memory retries at 0, 45
   and 180 seconds. It has no durable outbox, unique delivery key or readback
   receipt, so process restart can lose delivery and ambiguous remote success
   can duplicate it.
4. The server fingerprint intentionally covers only selected fields. The
   contract does not guarantee 409 for every semantically changed payload; the
   IntegrityError race fallback also omits the earlier owner recheck.
5. There is no allowlisted `test_run_id`, exact request-ID admin lookup, default-
   off fake sink or isolated operator/bot channel. Existing admin text search is
   not an exact marker plane.
6. DB purge is exact-ID and payment-aware, but already-sent Telegram messages
   and forum topics are not deleted or verified. Literal zero residue in the
   live operator channel is impossible with the current contract.
7. Frontend success accepts a valid ID without requiring `order.id` equality or
   initial status `new`. The claim exchange returns exact `order_id`, but the
   cabinet ignores it and may open the first other active case.
8. Upload is outside the first proof. Browser `client_file_id` is a 32-bit FNV
   metadata hash and the server does not provide content-bound idempotency; a
   deterministic collision between two different synthetic PDF names was
   reproduced.

## Implementation sequence

### A. Versioned authoritative source

1. Create a secret-free tracked backend/bot source package or private companion
   repository from a reviewed allowlist manifest of exact relative source and
   migration paths. Assert every imported hash against the live receipt and run
   high-entropy/secret and PII scans before staging. A denylist-only copy of the
   production directory is forbidden.
2. Record exact source SHA, migration SHA, dependency lock, service unit
   contract and build/runtime digest in Brain release evidence.
3. Make deployment stage from that exact immutable source. Fail if running
   hashes differ from the release receipt.

### B. Hermetic order unit of work

1. Begin one database transaction for order, optional bundle items, mandatory
   `created` event and one durable delivery-outbox row.
2. Define idempotency scope and retention explicitly. The server must bind key,
   owner/auth generation, `fingerprint_version` and a canonical semantic
   fingerprint. Every meaningful same-key change returns deterministic 409
   before a side effect. Existing rows continue to compare with the basis under
   which they were written; a widened basis must not turn a legitimate old
   retry into a false conflict.
3. Recheck owner and fingerprint after a unique-index race. Same-key/same-intent
   returns the same canonical response; it never creates a second event/outbox.
4. Persist a unique delivery key, sink, status, attempt count, next attempt,
   last error and immutable order ID. A worker claims/replays pending work after
   process restart; an idempotent sink adapter records one receipt.

### C. Synthetic marker, lookup and cleanup plane

1. Add a default-off `synthetic` flag plus opaque `test_run_id`. Production
   accepts it only for an allowlisted synthetic identity and explicit isolated
   sink; ordinary clients cannot set or query it.
2. Provide a read-only exact lookup returning typed cardinalities for order,
   created event, outbox, sink receipt, cabinet membership and file rows. The
   public evidence stores only a run hash/suffix and result counts.
3. Cleanup begins with dry-run and requires simultaneous exact
   `synthetic=true + test_run_id + order_id`. More than one match, payment,
   benefit/referral/promo/gift state or a non-test sink blocks apply.
4. Apply quarantines or deletes only typed synthetic records and mock-sink
   artifacts. Replay is a safe no-op. Post-lookup must report zero active
   business records; a documented non-PII audit tombstone may remain. Backups
   and access logs are not falsely described as erased.

### D. Exact frontend continuation

Split this into two release units. D-continuity may ship before the backend
workstream: if exchange returns a valid `order_id`, select that exact cabinet
case; if the field is absent, retain the current fallback. This is a reproduced,
backend-compatible P1 and must not change success semantics or imply operator
delivery.

D-strict ships only after A/B enumerate and test every current success response:

1. Confirm only when response `id` is canonical, equals `order.id`, status is an
   allowlisted initial value and access material matches the deployed schema.
2. Accept only a same-origin, expected fragment claim URL or a structured state;
   carry exchange `order_id` into exact cabinet selection.
3. Verify POST response, list and detail agree on ID, public number, status and
   contract version. Success copy says accepted by the server unless durable
   operator/bot receipt is actually part of the response/readback contract.
4. Add guide microlead live-region/focus proof. Do not redesign unrelated case
   states without a new reproduced failure.

### E. Upload as a later sub-slice

1. Replace metadata-only 32-bit IDs with a cryptographic content-bound identity
   or a server-issued upload intent.
2. Enforce unique `(order_id, client_file_id)` and bind it to digest/size/type.
   Same identity/same bytes returns one file; different bytes return 409 before
   Telegram or object-store delivery.

## Failure-first proof matrix

Use the real handler modules with an ephemeral on-disk SQLite file that survives
a simulated process boundary, plus fake bot/operator/mailer sinks. No external
network is needed.

1. Pre-lookup for a fresh run returns zero on every typed surface.
2. First `(key, payload)` creates exactly one order, `created` event, outbox row,
   fake operator receipt, fake bot receipt and cabinet-visible entry with status
   `new`.
3. Concurrent and sequential retry, lost response and process restart return the
   same ID and do not increase any count.
4. Same key with each meaningful changed field returns 409 and has zero new side
   effects; owner/auth-scope change also conflicts, including the race branch.
5. Crash injection after each transactional statement either rolls back all
   state or leaves one replayable outbox job, never a partial accepted case.
6. Claim exchange returns and opens the exact ID once; replay fails safely and
   creates no second membership.
7. Cleanup dry-run returns exactly one typed target; apply returns active counts
   to zero; second apply is a no-op.
8. Only after the base matrix is green, run the separate file identity matrix.

## First external proof

Only after A-D are integrated and the isolated sink/identity is demonstrated:

- verify exact deployed source/runtime hashes and pre-lookup zero;
- send one synthetic order without upload, OAuth, payment, analytics, promo,
  gift, referral or real contact routing;
- replay identical request concurrently and sequentially, then verify the same
  ID and cardinality one across order/event/outbox/sink/cabinet;
- send changed payload with the same key and require 409 with unchanged counts;
- verify exact initial status and exact claim/cabinet continuation;
- run bounded dry-run/apply cleanup and prove zero active business residue.

## Stop conditions

Stop before or during external proof on source/runtime drift, missing test sink,
unknown idempotency retention/auth scope, partial transaction, non-durable
delivery, marker pre-lookup not zero, any count above one, real-client routing,
payment/benefit state, claim mismatch, broad cleanup predicate, Telegram artifact
outside the isolated sink, secret/contact/client content in evidence, P0/P1 or a
canonical/workstream conflict. Also stop if the source-import manifest is not an
explicit allowlist, fingerprint widening lacks a stored version, any success
response variant is not enumerated before D-strict, or copy says/implies
«передано мастеру» without a durable receipt.

## Rollback

- Backend changes ship behind default-off synthetic and outbox flags, with an
  additive migration only after duplicate pre-scan and a verified database
  backup. Old runtime remains the exact service rollback target.
- If outbox rollout fails, stop new synthetic traffic, restore the previous
  service artifact and quarantine only exact synthetic IDs; never improvise a
  broad delete.
- Frontend hardening is one cache-atomic release unit and can be reverted by its
  exact commit. Reverting it does not downgrade backend idempotency/outbox.
- This plan itself changes documentation only and is reverted by one commit.

## One exact next step

Create a narrow D-continuity workstream with a failing regression where claim
returns ID 202 and the cabinet list is `[101, 202]`; make the cabinet open 202
while preserving the current fallback when `order_id` is absent. Then create the
backend reliability workstream that imports only an exact allowlist of the
secret-free authoritative source and adds the failing atomic
order+created-event+outbox test. Neither step authorizes a production submit.
