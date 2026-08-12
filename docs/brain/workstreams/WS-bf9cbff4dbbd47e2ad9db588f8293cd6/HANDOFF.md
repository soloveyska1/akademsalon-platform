# Workstream handoff

- Branch: `codex/analytics-v2-dbip-attribution`
- Outcomes: `OUT-006`
- Goal: satisfy DB-IP City Lite CC BY 4.0 attribution before production uses
  approximate geography, without changing metrics, collection or layout.
- Acceptance: the geography panel visibly names and links DB-IP with safe
  external-link attributes; strict admin CSP remains green; 390/1024/1440
  geometry and full regressions remain unchanged.
- Proof: failure-first admin contract, focused/full Node, strict CSP Chromium
  smoke, Brain strict validation and read-only independent review.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: absent attribution blocks MMDB deployment; link must not leak
  referrer or load a third-party resource. Rollback removes only the text/link,
  but then production must also stop using DB-IP geography.
- Next: commit reservation, run conflicts, add the failing attribution contract.
