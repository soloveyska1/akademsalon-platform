# Workstream handoff

- Branch: `codex/salon-return-20260924`; write-owner: root.
- Outcome: `OUT-003`, bounded public return context; user approved four comforts across the site.
- Base: `5682dd77ea3251c3e444c8e3adbeb3a6d99ec665` = fresh origin/main. Original user dirty `.claude/launch.json` excluded and untouched.
- Goal: recent public pages in menu; explicit article resume; remember successfully rendered sample PDF page/zoom; preserve catalogue facet and card position on return.
- Scope: unique overlay scripts/evidence and this handoff only. No form, commerce, backend, DB, analytics contracts, redesign, new search or private routes.
- Acceptance: bounded local-only allowlisted page/doc identifiers; no URLs with queries, arbitrary text, contacts or PDF contents. Clear history, expiry/corruption/storage-denial safe. Explicit anchors win; no surprising article jump. PDF restores valid page/zoom, races and load failure do not overwrite progress. Catalogue Back/Forward/return retains facet and position without overriding direct anchors. Existing controls, focus and layout pass at 360/390/768/1024/1440 light/dark; reduced motion respected.
- Proof: exact live release220 immutable snapshot; pinned bounded build delta; hermetic real Chrome public journeys and storage/privacy edge cases; existing deterministic Node and Brain suites; two independent read-only reviews; live readback/smoke and rollback/forward.
- Freeze: current release220-polish-9f987a75; dist remains release203-09ccfca4; no production mutation until candidate verified. Existing SEO/brand/form overlays retained byte-for-byte outside declared delta.
- Changed: none yet; manifest and acceptance only.
- Unverified: implementation and production release not started.
- Risks/rollback: local resume must not hijack explicit navigation or poison state on initial render; bounded validated stored IDs and explicit resume affordance. Fail-closed deploy verifies full baseline, atomically switches current, verifies rollback and forward; no backend migration.
- Next: commit manifest and this handoff, inspect strict conflict gate, capture immutable baseline.
