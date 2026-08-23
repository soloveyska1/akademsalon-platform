# Workstream handoff

- Branch: `codex/out-008-mobile-action-reachability-v2`
- Outcomes: `OUT-008`
- Goal: keep the mobile dock continuation on the exact practice scope selected by the visitor, without changing the visual concept or adding another action.
- Acceptance: at 360/390 px, diagnostic, editing, and support keep the checked radio, live selection, both page continuations, and `.mobile-dock__primary` on the same allowlisted `route=service`; Back/pageshow restores parity; an initial saved-draft dock remains `Черновик`, while an explicit new choice uses the existing draft-conflict flow; desktop is unchanged and no overflow or occlusion appears in light or dark mode.
- Proof: failing-first and passing `node --test tests/practice-price-trust.test.js`; browser runtime checks for all three routes, Back/pageshow, saved-draft preservation, and 360/390 light/dark geometry; `./bin/brain test`; `./bin/brain validate`; two independent read-only reviews.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: a page-local sync could overwrite a saved draft, retain a stale route after browser Back, or accept a non-canonical URL. Restrict the source to the three hardcoded radios, preserve `data-resume-draft` during initial/pageshow sync, and revert the page script plus focused contract if any guardrail fails.
- Next: commit this declaration, run strict conflict detection, then add the failing focused contract before implementation.
