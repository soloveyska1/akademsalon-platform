# План OUT-006: доказать понимание первого шага без чувствительных данных

- Date: 2026-08-03, Europe/Moscow
- Base: `7dc6b9bbd20fcd6dad4f2a470b199b0021cdab4a`
- Workstream: `WS-9e49bd5ae79b479a82005aa32b1fd7fa`
- Write owner: `codex-root`; reviewers are read-only.
- Evidence: `E-1008`.
- External boundary: no production analytics rollout, submit, OAuth, payment,
  client-data access, deletion, local LLM, watcher or persistent service.

## Decision and exact surface

The next slice is `OUT-006` on the fresh path `SUR-001` → `SUR-002`: the visible
home `guided-desk` situation choice, its dossier and the continuation to the
configurator. Header/footer, cabinet and the released services catalogue have no
new reproduced P0/P1 and remain controls, not redesign targets. `OUT-001` remains
separately blocked by backend/bot marker, lookup and cleanup.

No visual redesign is authorized at baseline. Existing behavioral events are
proxies for action, not proof of comprehension. The order is:

1. make the already-running analytics beacon fail-closed and locally testable;
2. preregister the measurement/server contract without inventing backend facts;
3. run 5–8 moderated tasks with synthetic scenarios;
4. open a bounded `guided-desk` prototype only if the preregistered threshold
   reproduces a comprehension problem.

## Slice A — existing beacon privacy foundation

Before adding any event or collecting a baseline:

- `/api/visit` must use `credentials:'omit'`; no Cookie, Authorization, CSRF or
  cabinet session material may accompany the analytics request;
- internal analytics must be silent on `dashboard.html`, `zayavka.html`, admin
  and impact/demo contours;
- public page identity must use one canonical allowlist and `/other` fallback,
  never an arbitrary pathname from a 404 URL; query and hash remain absent;
- reject, revoke and expiry must remove `salon_vid`, `salon_attr_v2` and the
  analytics data already covered by the Metrika cleanup path;
- without an authoritative server idempotency contract the client is
  deliberately best-effort and must not retry; any future retry must preserve
  one logical event identity before a milestone is used for aggregation;
- the send policy and request builder must have a local stub seam. Product tests
  must never need a production request.

The client can prove absence of credentials and forbidden fields. Whether the
server stores cookies/IP, deduplicates, retains or exposes aggregates is unknown
until an authoritative backend contract is supplied; do not infer it.

## Slice B — preregistered measurement contract

Target only a fresh document lifetime of the home editorial desk. Saved drafts,
service-entry, cabinet, order submit and hidden legacy home sections are excluded.

Candidate milestones, not authorized for production until server proof:

- `first_step_exposed` after analytics opt-in, actual desk visibility and visible
  document state;
- `first_step_selected` on the first situation choice;
- exactly one of `first_step_continued` or `first_step_alternate`.

Allow only versioned enums: `cta_id=home_editorial_desk`, situation
`text|comments|defense|none`, destination `cfg|services`, changed `0|1`, and a
coarse active-visible bucket. Never send free text, raw href/path/query/hash/
referrer, contact, order/draft/account/session IDs, file names, exact client
timestamps, raw milliseconds or viewport fingerprints. Do not buffer actions
performed before consent.

Server acceptance is authoritative proof of anonymous ingest, unique logical
event handling, server timestamp/ordering, retention and aggregate readback that
does not expose raw browser IDs or IP. Until then OUT-006 may be planned and the
privacy foundation may be fixed, but production measurement remains blocked.

## Slice C — comprehension task test

Run 5–8 moderated sessions using only synthetic situations: a topic, an existing
draft, supervisor comments, defence urgency and an imprecise “other” case. Do not
collect real works, contacts or free-text answers in Brain. Record only aggregate
task outcome, reason-understood yes/no, route choice, device class and coarse
active-time bucket.

Preregistered product pass: at least 80% choose an appropriate first step within
90 seconds and can explain what result, term and price clarity they will receive
before commitment. A design investigation opens only if at least 3 of 8 cannot
name the first step within 20 seconds, median time to the primary continuation is
above 30 seconds, or at least 2 of 8 detour to the catalogue when asked to start.
The final threshold must be frozen before the first participant and cannot be
changed after observing results.

## Failing-first proof

`tests/first-step-measurement-contract.test.js` must first reproduce the current
failures independently:

1. visit fetch credentials are omitted;
2. dashboard/admin/order/demo contours make zero visit requests;
3. arbitrary and encoded 404 paths canonicalize to `/other`;
4. reject/revoke/expiry purge browser ID and attribution;
5. regrant cannot resurrect pre-revoke first-touch data;
6. exact payload allowlist excludes PII and high-cardinality values;
7. the existing beacon performs no retry; future retry/double click/BFCache
   identity tests stay blocked until the server contract exists;
8. active-time buckets exclude hidden time and respect exact boundaries;
9. keyboard and pointer expose the same milestone semantics without changing
   focus, accessible names or the default action;
10. one new `app.js` cache key is present on all 89 direct consumers.

Then run the focused privacy/home/cache suites, full product regression, JS
syntax, `git diff --check`, Brain tests/strict validation and read-only browser
smoke at 360/390/768/1024/1440 in light/dark and keyboard/reduced-motion states.

The frontend privacy foundation completed in `1011060`; items 8–9 above belong
to the still-blocked milestone implementation and synthetic comprehension test,
not to this invisible hardening release.

## Stop conditions and rollback

Stop on a credential-bearing request, unknown/high-cardinality path or field,
any send without opt-in or after revoke, incomplete purge, unknown server schema,
non-reproducible denominator, UI/focus/ARIA/geometry change, P0/P1 regression,
real submit or hard manifest conflict. Do not call a behavioral proxy
“comprehension” without the moderated task result.

Product code changes remain local until a separate release gate. Roll back by
reverting the privacy implementation and its atomic cache-wave commit; the plan
and red-test evidence remain historical. If `credentials:'omit'` is incompatible
with an unknown server, stop and obtain the server contract rather than restoring
a cookie-bearing analytics request.
