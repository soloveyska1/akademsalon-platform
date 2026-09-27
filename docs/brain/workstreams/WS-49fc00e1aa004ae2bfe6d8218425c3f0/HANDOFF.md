# Branded deadline calendar

- Goal/outcome: OUT-007, owner explicitly requests the native-looking calendar be styled like Salon. Root is sole write-owner. Scope is the services/request date selector, with an additive live overlay; no tariff, estimate, order serializer, backend or unrelated page changes.
- Base: fresh origin/main ad7b75ced04b. Live release226-clarity-376cd066 verified through SSH; pinned baseline /tmp/salon-services-clarity-20260927/release-final (531 files). Root user-dirty .claude/launch.json excluded.
- Acceptance before edits: branded light/dark calendar; clear selected/today/disabled states; month/year selection; readable at319/390/768/1024/1440 and short viewport; 44px date targets; keyboard arrows/Home/End/PageUp/PageDown, Escape closes only calendar and restores focus; date selects/clears the existing source field, updates quote, survives handoff and stays in the synthetic payload. No extra data storage or network calls. Native input remains fallback when enhancement fails.
- Proof: deterministic calendar/date integration checks, exact live hash overlay, two independent read-only reviews, guarded deploy with real rollback/forward and live no-write smoke. Protected tariff/privacy/submit and theme roles remain.
- State: declaration; implementation not started.
- Next: commit declaration and conflicts gate, implement focused calendar, verify and publish.
