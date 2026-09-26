# Services studio redesign handoff

- Goal: user explicitly rejects release224 visual result and requests a noticeable stylish, comfortable redesign with useful features. Outcome OUT-007; single write-owner root.
- Base: exact fresh origin/main 924a378c28fc4d8ff4c62785a681565504543161. Original checkout has user-dirty .claude/launch.json, excluded. Live release224-services-acad423a; verified local immutable baseline /tmp/salon-services-20260927/release-final (530 files).
- Scope: new overlay builder, services-only interface, evidence. Existing estimate/math, benefits rules, tariffs and order submission remain byte-identical. No backend/DB/analytics/auth changes.
- Acceptance before edits: visibly different compact catalogue, type remains primary, scope is a secondary control; on-page desktop inspector and phone bottom sheet share one state; numeric quote always reachable, including selected benefits; inline scope price comparison, quick date choices, same saved/copy/checkout contract; no long duplicated form sections.
- Proof: before/after screenshots including actual narrow319px browser; 320/360/390/768/1024/1440 light/dark, native focus/Escape, dropdowns, scenario/unit/quantity and every product; arithmetic parity and synthetic pending request parity; two independent reviews, baseline hash guard, live smoke and rollback.
- Design authority: the user's direct rejection/request authorizes redesign beyond historical old IA freeze; protected pricing/privacy/submit semantics remain.
- Changed: compact service index, four situation shortcuts, sticky desktop inspector / mobile dialog, scope price comparison, budget filter, quick dates, benefit tab with live payable total, saved per-product composition, copy and unchanged request handoff. Three-file public overlay; all math/checkout bytes preserved.
- Verification: independent visual and contract reviews GO with P0/P1/P2=0 after fixes. Existing arithmetic8/8, canonical public652passed/9skipped, Brain39; final28 browser scenarios passed. Screenshots and fully intercepted synthetic payloads saved in own evidence; final generated-tree equality checked after implementation commit.
- Not yet verified: production publication and live smoke.
- Next: commit verified implementation, build exact source tree, publish via guarded delta with rollback, live smoke, then submit/integrate.
