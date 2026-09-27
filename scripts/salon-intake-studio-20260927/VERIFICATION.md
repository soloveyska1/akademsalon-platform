# Intake form comfort

OUT-001. The owner identified the requirements/contact/codes/consents area as inconvenient and visually weak. Root is sole write-owner. The focused enhancement adds explicit contact cards, optional name outside the codes disclosure, readable consent rows, and a compact requirements helper. Prices and the branded calendar are preserved.

The five optional requirement prompts append an empty heading without replacing existing prose. Duplicate headings receive focus. Undo only removes an untouched insertion. The12000-character limit rejects an insertion instead of truncating user text; generated headings cannot silently become the required topic. Helpers follow the existing retry freeze and independently reject clicks while the source textarea is disabled.

The contact input keeps its raw value and existing accepted formats. A selected method changes guidance, not validation authority. A status explains a mismatch after switching channels. Observing actual selected-state changes also keeps that status consistent with legacy focusout validation. Name/promo/gift remain the original nodes and payload keys. Codes are explicitly unconfirmed and never manufacture a discount. All original legal spans, links, consent version and unchecked state remain exact.

## Artifact and tests

build.py requires the complete533-file release227 inventory, adds two assets and patches only configurator.html and form-polish-20260924.js. Output535 files, four changed paths, no deletion. Existing pricing, calendar, intake, order, backend/auth and storage contracts remain byte-identical. The form-polish patch selects Telegram initially and detects pasted formats without changing raw input.

Candidate3:19/19 isolated studio checks;319/360/390/768/1024/1440 in both themes,44px targets,16px mobile inputs, no overflow, keyboard, codes, exact legal text and synthetic payload, helpers/Undo/limit, false topic protection,503 stable retry and400 unlock. Candidate4 adds only selected-state observation after the independent review reproduced a stale message following focusout. Both affected contact scenarios pass on candidate4; its CSS is identical to candidate3.

Existing comfort9/9 and form-polish9/9 PASS, including file queues, removal/Undo, errors, held-pointer submission, autogrow, private-data isolation and retry identity. Calendar25/25 PASS. Canonical Node652 pass,9 existing skips,0 failures; Brain39/39. No real order, message, upload or analytics write was used. Own IAB inspection confirmed the loaded candidate and compact composition.

Evidence lives in docs/brain/evidence/salon-intake-studio-20260927. Review findings were resolved by new prototypes and reproducible browser cases: mobile helper overload, selected marker collision, channel mismatch and stale focusout explanation. Final independent visual review GO on candidate3 CSS; functional final delta4/4 GO on candidate4. P0=0/P1=0/P2=0. The declaration SHA in test metadata is not the implementation SHA. Rebuild a clean implementation commit and require complete equality with tested-build-manifest.json before publishing.

## Reproduce

```
python3 scripts/salon-intake-studio-20260927/build.py /path/to/pinned-release227 /tmp/new-intake
node scripts/salon-intake-studio-20260927/verify.mjs /tmp/new-intake /tmp/intake-qa
SALON_NODE_DEPS=/path/to/node_modules node scripts/salon-form-polish-20260924/verify.mjs /tmp/new-intake /tmp/polish-qa docs/brain/evidence/salon-comfort-20260924/server-contract.json
SALON_NODE_DEPS=/path/to/node_modules node scripts/salon-comfort-20260924/verify.mjs /tmp/new-intake /tmp/comfort-qa docs/brain/evidence/salon-comfort-20260924/server-contract.json
node scripts/salon-calendar-20260927/verify.mjs /tmp/new-intake /tmp/calendar-qa
node --test tests/*.test.js
python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v
./bin/brain validate --strict
```

## Release

The guarded deploy script checks the baseline pointer, all file hashes, the exact archive and its four entries, then verifies apply→rollback→forward with health/features and public hashes. Preserve compatibility dist; never roll back the database. Live smoke uses fresh contexts and blocks all non-GET/HEAD requests, carries the service price/date into intake, exercises helpers/contact/code states without submission, and verifies the loaded asset hashes. Inspect the exact live result and stop the temporary preview afterward.

Auth/cabinet are outside this bounded change; their bytes remain exact. Native Safari, physical phones, screen readers and commercial uplift are not claimed.

## Published result

release228-intake-da171f06, clean source da171f06d5bbae3ada221fa5dde3fe997ae31b10. All535 rebuilt hashes equal the tested candidate4 inventory. Apply→rollback227→forward228 passed public hashes and health/features; compatibility dist remains release203, backend/database unchanged. Live319/1440 light/dark4/4 PASS, zero JS errors and zero attempted mutations. The chosen2026-10-11 date and16000–22500 RUB quote survive the service→intake transition. Helpers, raw contact, mismatch, optional code count and unchecked consent verified live without submission. Original owner IAB also navigated from its course quote to the new form,14000–19500 budget preserved, exact new assets read back and screenshot inspected. Temporary preview tab/server closed; viewport reset.
