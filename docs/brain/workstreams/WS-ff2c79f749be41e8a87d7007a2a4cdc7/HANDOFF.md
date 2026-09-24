# Workstream handoff

- Branch: `codex/salon-intake-fix-20260924`
- Base: `c1c5eb0d27e63c77f6d6f430a39d3579447f01fa` (fresh origin/main)
- Outcome: `OUT-006`; write-owner: root.
- Goal: restore existing private analytics milestones on the current direct intake and preserve the guide's explicit plan-service intent.
- Scope: bounded static overlay over verified release217, guide-link patch in the overlay, unique build/test/evidence files. No backend/DB/pricing or external messages.
- Acceptance: existing config_open and first_input events occur once per consented document; trusted manual input only, no prefill or field contents; rejected/uncertain submissions and validation have finite private events; no false success or changed retry identities; no new event names or invented wizard stages. Guide opens plan with fresh and saved state and submits plan scope in mocked local request. No production test order or telemetry.
- Proof: failing-first checks, actual authoritative server allowlist readback, isolated real browser with routed local static assets and mocked APIs; light/dark 360/390/768/1024/1440, keyboard, error/retry/upload, privacy consent/owner/QA exclusions. Existing regression suite. Two independent read-only reviews after deterministic checks. Production hash/health/GET-only journey and rollback-forward if all hard gates pass.
- Protected: consent opt-in; no contacts/texts/files/tokens in analytics or evidence; server-confirmed success only; stable request/file IDs; preserve current live overlays and dist pointer.
- Changed: reproducible six-file static overlay, private intake events with custom-select adapter, plan-course guide entry, cache refresh; isolated browser verifier and evidence.
- Verified locally: 10 browser scenario groups including privacy, actual cart payload, 503/conflict/retry and uploads; 10 viewport/theme combinations; Node 652 passed, 9 skipped, 0 failures; Brain 39/39 and strict validation; two independent final GO reviews with no P0/P1/P2. See unique evidence directory.
- Unverified: production remains release217; publication and real rollback-forward still pending.
- Risks/rollback: canonical static sources differ from production. Build starts from full immutable live snapshot and fails on hash drift; deploy only delta with immediate pointer rollback and no DB restore.
- Conflict decision: first canonical-guide declaration was abandoned because of active historical reservations. Overlay owns only unique directories; hard=0, 62 historical warnings consciously accepted by root as integration owner.
- Next: freeze implementation, rebuild identical artifact with implementation SHA, run guarded production apply/rollback/forward and live GET-only smoke.
