# Branded deadline calendar

OUT-007. Owner requests Salon styling for the native-looking calendar. Root is the only write-owner. The enhancement uses existing theme roles and typography for a Monday-first calendar, selected violet date, today marker, month/year view and clear action. A separate native dialog works above the mobile quote dialog. The original date field remains the form authority and native fallback.

## Scope and artifact binding

Exact release226-clarity-376cd066 baseline:531 files. Four public changes only: add salon-calendar.js/css and their hash-versioned includes to services.html/configurator.html. The builder pins all baseline hashes, requires533 output files and checks JavaScript syntax. Tariffs, estimate math, bonus rules, storage, order serializer, auth, consent, backend, database and service worker remain byte-identical. No new date constraints are invented; existing min/max control availability.

The tested candidate4 manifest is committed under docs/brain/evidence/salon-calendar-20260927/tested-build-manifest.json. Its source field is the declaration HEAD because implementation was still uncommitted during testing. Before publication, rebuild the clean implementation commit and assert that the entire files inventory equals that manifest. This equality binds tested artifacts to the final source commit.

## Reproducible proof

Final calendar checks:25/25 PASS. Six widths319/360/390/768/1024/1440, light/dark, reduced motion,44px targets, keyboard roving focus, min bounds, leap year/month-end, month/year selection, stable popup position, short319x484/319x320, nested Escape/backdrop, resize with/without saved work, invalid-date repair, browser Back, clear/today, native fallback, quote/deadline handoff and synthetic order payload. No real API mutations; the order fixture uses an example.invalid contact. Browser screenshots and results have route/viewport/theme/state metadata in evidence-context.json.

Existing services regression:51/51 PASS against candidate2. Subsequent public changes are confined to calendar month-grid height, stationary render and visible resize-focus fallback; all affected cases are exercised in the final25 checks. Canonical Node:652 pass,9 existing skips,0 failures. Pricing:8/8, including6048 combinations. Brain:39/39 and strict schema validation PASS.

Independent reviewers reproduced and helped close two defects: popup movement when mode height/anchor changed, and resize focus falling onto BODY when an ancestor of the fallback button was hidden. Equal mode heights plus positioning only on open/viewport changes hold the calendar still; fallback checks rendered visibility. Both final independent reviews are GO with P0=0/P1=0/P2=0. The final evidence includes reproducible delta observations and browser scripts, not only model conclusions.

## Commands

```
python3 scripts/salon-calendar-20260927/build.py /path/to/pinned-release226 /tmp/new-calendar-build
node scripts/salon-calendar-20260927/verify.mjs /tmp/new-calendar-build /tmp/calendar-qa
node scripts/salon-services-clarity-20260927/verify.mjs /tmp/new-calendar-build /tmp/services-qa
node --test scripts/salon-services-20260927/estimate.test.cjs
node --test tests/*.test.js
python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v
./bin/brain validate --strict
```

## Release gate

Use deploy.py with the exact manifest/archive digest and expected release226 pointer. It rejects baseline drift, stages the four-file overlay, checks the complete533-file tree and executes real apply/rollback/forward with public static hashes and health/features. Existing compatibility dist is preserved. Live smoke uses fresh private contexts, blocks non-GET/HEAD, exercises selection and quote-to-request in both themes at319/1440, and never submits an order. Finally reload the original IAB tab and inspect the loaded calendar. Cleanup temporary server, tabs and test browsers.

Native Safari, physical devices, screen readers and conversion uplift are not claimed. The calendar preserves a native date-input fallback if its JavaScript is unavailable. Rollback is only the static current pointer to release226; never restore the database for this change.

## Published result

release227-calendar-97e3cc13, clean implementation97e3cc13a023fdf6a625a7bf040d5cde05cb1cad. All533 rebuilt hashes exactly match tested candidate4. Actual apply→rollback226→forward227 passed public hash and health/features checks. Compatibility dist remains release203. Live Chrome319/1440 light/dark4/4 PASS, zero JS errors and zero attempted writes; chosen2026-09-28 and20500–28500 RUB quote match the request form. Original owner IAB tab reloaded, exact new asset versions observed and the open calendar visually checked at319x484. Temporary preview server and tab closed, browser contexts closed, viewport reset. Receipt, final manifest and live evidence committed.
