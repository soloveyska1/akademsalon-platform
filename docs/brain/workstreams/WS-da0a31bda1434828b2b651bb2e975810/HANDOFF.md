# Workstream handoff

- Branch: `codex/salon-comfort-20260924`; base: `d1b33ce819f6cfab3429446f03a9f2e7c03032f5`, freshly fetched origin/main.
- Outcome: OUT-006. Sole writer: root. Original `.claude/launch.json` is user-dirty and excluded.
- Goal: a comfortable direct intake with file cards/drop, undo removal, quick deadline choices and auto-growing task details in the existing visual language.
- Scope: unique scripts/evidence directories; bounded static overlay on verified release218. No price, consent text, payload schema, auth, backend or database changes.
- Acceptance before edits: picker/drop share validation (5 files, 20 MB, allowed extensions, duplicates); real File objects and stable IDs survive undo and retry; disabled/frozen form cannot mutate attachments or dates; cards say ready until server-confirmed upload; safe filenames and local image preview lifecycle; keyboard 44px actions and polite status; local-date chips refresh correct date and existing quote; textarea grows/shrinks without focus/scroll disruption. No client content enters storage/analytics. Existing plan handoff and input measurement remain correct.
- Design: keep Golos Text/Literata and current sheet/ink/line/soft/accent tokens; document tabs with a quiet folded-corner file badge are the signature, restrained borders and no new palette. Desktop file rows and mobile full-width rows, date chips wrap beneath date field; no hero/layout redesign. Compare screenshots against current form before finalizing.
- Proof: targeted failing-before checks, hermetic actual-browser picker/drop/undo/limits/date/midnight/details/submission/retry/upload/consent tests, 360/390/768/1024/1440 light/dark/reduced motion and keyboard. Existing regression/Brain checks and two independent read-only reviews. Guarded production apply/rollback/forward and public GET-only smoke only after all hard gates pass.
- Protected: success only after confirmed response, stable request/file identities, retained explicit service context; no production test submit, payment or telemetry.
- Changed: declaration only.
- Risks/rollback: production source includes overlays absent from canonical root files; capture immutable live baseline and hash-pin delta. Rollback static pointer only, preserving dist/backend/DB.
- Unverified: implementation and publication pending.
- Next: commit declaration, resolve scope conflicts, capture baseline and build the bounded comfort enhancement.
