# Direct orders redesign

Outcome: OUT-006. Owner: Codex. Base: e53d11cea40055f2dae41a0f212cbbac4c79055f.

The owner explicitly requests a full redesign and direct order entry on 2026-09-09. This supersedes DEC-0003's situation-first entry and historic restrictions on catalogue redesign. One write owner; two independent read-only reviewers.

Scope: home, catalogue/prices, how-it-works and direct configurator. Preserve backend order/consent/upload/idempotency contract and cabinet. User dirty .claude/launch.json remains in original checkout untouched.

Acceptance before release: service and whole/partial scope directly selectable; published price source and planning times visible before contact; no mandatory paid diagnosis/auth; exact server ID before success; repeat-submit stable request ID; attachments retriable; no client data stored in analytics/local storage; responsive accessible light/dark pages; independent reviews; deterministic build and relevant regressions. Production smoke/rollback only if publishing production.

Proof: Node contracts, build, local browser geometry and synthetic mocked-API journeys, independent reviews. Existing design-specific tests may be intentionally superseded; record each actual regression separately.

Next: implement the direct commercial journey and record reproducible evidence under docs/brain/evidence/salon-direct.
