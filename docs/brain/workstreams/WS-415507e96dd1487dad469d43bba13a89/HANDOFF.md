# Workstream handoff

- Branch: `codex/release103-search-trigger-v2`
- Outcome: `OUT-007`
- Goal: close the reproducible P1 search-trigger gap at 921–1240 px without
  changing search semantics, catalogue IA or protected OUT-005 contracts.
- Base: exact fresh canonical
  `e2f76c3d71c82169f52e3c94874424e150cc54d3`; production at bootstrap is
  `release102-e2f76c3d71c8`.
- Supersedes: abandoned underscoped workstream
  `WS-1a22244743cd4de49aabd6da9510fc7f`. That workstream correctly stopped when
  full regression exposed two required exact readiness-test paths outside its
  manifest. Both paths are declared here before replaying any product change.
- Reproduced failure: home, services and dashboard have zero visible pointer
  search triggers from 921 through 1240 px. Release101 has the same release97
  hide rules, so rollback does not repair it; OUT-007 nevertheless requires
  continuous reachability and G5/G6 classify it P1.
- Implementation boundary: replay failure-first commit `cc6d5fe` and product
  commit `b6fdd56`; one late route-qualified CSS rescue, one deterministic home
  CSS rebuild and one CSS-only cache marker across the exact declared consumers.
  Update only the two existing URL assertions that encode that home CSS URL.
- Proof: focused contracts 16/16; full deterministic suite 501/501; identical
  consecutive builds; generated JS and all search/catalog JS remain
  byte-identical; local WebKit 42/42 on index/services/dashboard ×
  920/921/1024/1120/1121/1240/1241 × light/dark with one named 44×44 trigger,
  hit-test, no overlap/overflow, click/focus/query/Escape return and clean
  console/page errors/unsafe requests; independent P0/P1/P2 review.
- Stop conditions: any undeclared path, semantic drift, multiple/zero triggers,
  layout overlap, generated JS change, protected inventory change or P0/P1.
- Rollback: revert the narrow result and CSS cache wave. Production deployment
  belongs to a separate `production:deploy` workstream with immutable release103
  and executed release102 rollback/forward proof.
- Current state: corrected declaration only; no product file changed here yet.
- Next: commit declaration, run conflicts, replay the two bounded commits, update
  the two declared readiness assertions and rerun every deterministic gate.
