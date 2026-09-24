# Workstream handoff

- Branch: `codex/salon-return-20260924`; write-owner: root.
- Outcome: `OUT-003`, bounded public return context; user approved four comforts across the site.
- Base: `5682dd77ea3251c3e444c8e3adbeb3a6d99ec665` = fresh origin/main. Original user dirty `.claude/launch.json` excluded and untouched.
- Goal: recent public pages in menu; explicit article resume; remember successfully rendered sample PDF page/zoom; preserve catalogue facet and card position on return.
- Scope: unique overlay scripts/evidence and this handoff only. No form, commerce, backend, DB, analytics contracts, redesign, new search or private routes.
- Acceptance: bounded local-only allowlisted page/doc identifiers; no URLs with queries, arbitrary text, contacts or PDF contents. Clear history, expiry/corruption/storage-denial safe. Explicit anchors win; no surprising article jump. PDF restores valid page/zoom, races and load failure do not overwrite progress. Catalogue Back/Forward/return retains facet and position without overriding direct anchors. Existing controls, focus and layout pass at 360/390/768/1024/1440 light/dark; reduced motion respected.
- Proof: exact live release220 immutable snapshot; pinned bounded build delta; hermetic real Chrome public journeys and storage/privacy edge cases; existing deterministic Node and Brain suites; two independent read-only reviews; live readback/smoke and rollback/forward.
- Freeze: current release220-polish-9f987a75; dist remains release203-09ccfca4; no production mutation until candidate verified. Existing SEO/brand/form overlays retained byte-for-byte outside declared delta.
- Changed: pinned 68-page public overlay (+2assets; 519→521files), local-only recent/reading checkpoints, bounded PDF/catalogue hooks. PDF queued-close race fixed. Shared menu palette stays consistent; original private/form/commerce/assets preserved.
- Verification: 18/18 hermetic Chrome scenarios, 10viewport/theme states, Node652pass9skip, Brain39/39, strictvalidate, two independent GO; exact hashes/reviews/scripts/screenshots in own evidence. No open P0/P1/P2 in this scope.
- Unverified: G10 production publish/readback/rollback and live smoke pending. Real leads, conversion growth, auth/payment/private journeys not exercised by this UI release.
- Risks/rollback: local resume must not hijack explicit navigation or poison state on initial render; bounded validated stored IDs and explicit resume affordance. Fail-closed deploy verifies full baseline, atomically switches current, verifies rollback and forward; no backend migration.
- Conflict decision: integration owner inspected 64 terminal-worktree warnings, hard0 and dirty paths disjoint; allowed warnings for this unique overlay scope, evidence retained.
- Next: freeze implementation commit, rebuild and compare full inventory, publish bounded release221 then verify rollback/forward and live GET-only browser smoke.
