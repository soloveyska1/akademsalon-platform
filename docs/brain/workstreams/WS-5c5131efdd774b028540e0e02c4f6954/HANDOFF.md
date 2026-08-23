# Workstream handoff

- Branch: `codex/out-008-mobile-action-reachability-v2`
- Outcomes: `OUT-008`
- Goal: keep the mobile dock continuation on the exact practice scope selected by the visitor, without changing the visual concept or adding another action.
- Acceptance: at 360/390 px, diagnostic, editing, and support keep the checked radio, live selection, both page continuations, and `.mobile-dock__primary` on the same allowlisted `route=service`; Back/pageshow restores parity; an initial saved-draft dock remains `Черновик`, while an explicit new choice uses the existing draft-conflict flow; desktop is unchanged and no overflow or occlusion appears in light or dark mode.
- Proof: failing-first then 7/7 `node --test tests/practice-price-trust.test.js`; related practice/cart/analytics suite 32/32; full product suite 591/591; `brain:test` alias (`python3 -m unittest discover -s tools/brain/tests -p 'test_*.py' -v`) 39/39; `./bin/brain validate` reports 84 records, 155 links, and 36 manifests; Playwright verified route parity, support handoff to 14–19.5k, specification Back/pageshow, saved-draft preservation, and 360/390 light/dark geometry with zero horizontal overflow; two independent read-only reviews remain before submission.
- Changed: the page-local practice selector now synchronizes the existing mobile dock to the same allowlisted diagnostic/editing/support route and accessible scope name as both page continuations. Initial or pageshow sync preserves a dock marked as a saved draft; an explicit new choice removes that marker and switches scope. The focused contract locks both behaviors.
- Unverified: independent post-change reviews, private Sites preview, and production smoke have not run yet.
- Risks/rollback: a page-local sync could overwrite a saved draft, retain a stale route after browser Back, or accept a non-canonical URL. Restrict the source to the three hardcoded radios, preserve `data-resume-draft` during initial/pageshow sync, and revert the page script plus focused contract if any guardrail fails.
- Next: commit the implementation, obtain two independent reviews on the exact commit, then rerun conflict and release gates.
