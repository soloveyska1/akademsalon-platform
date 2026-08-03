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
- Implementation result: exact product HEAD
  `e97a66afa6765dc8e414e52de34c64faf425819f`; one late global shared-CSS
  rescue for both header variants at 920–1240 px, one deterministic home CSS rebuild and one CSS-only
  cache marker across 89 direct shared-CSS consumers plus the home bundle URL.
  The 920 px lower bound closes the fractional seam while the existing mobile
  parent hide preserves exactly one trigger at the boundary.
- Proof: focused contracts 56/56; full deterministic suite 501/501; identical
  consecutive builds; generated JS and all search/catalog JS remain
  byte-identical; local WebKit 42/42 on index/services/dashboard ×
  920/921/1024/1120/1121/1240/1241 × light/dark with one named 44×44 trigger,
  hit-test, no overlap/overflow, click/focus/query/Escape return and clean
  console/page errors/unsafe requests; independent P0/P1/P2 review.
- Cross-engine closure: Chromium 24/24 on index/services/dashboard ×
  920/921/1240/1241 × light/dark with a forced vertical scrollbar and the same
  one-trigger/interaction/error assertions. The existing shared-shell contract
  proves every public chrome consumer also loads its dialog runtime and mobile
  shell; the release103 header test now freezes the mobile-parent 920 px seam.
- Stop conditions: any undeclared path, semantic drift, multiple/zero triggers,
  layout overlap, generated JS change, protected inventory change or P0/P1.
- Rollback: revert the narrow result and CSS cache wave. Production deployment
  belongs to a separate `production:deploy` workstream with immutable release103
  and executed release102 rollback/forward proof.
- Independent review: three read-only Codex reviewers approve exact `e97a66a`
  with P0=0/P1=0. Kimi/Sonnet/GLM all approve; Opus independently inspected the
  cascade, selected the narrow rescue for release and deferred legacy-rule
  consolidation to a post-release workstream. Their documentation/contract P2
  findings are closed by the current evidence and seam assertion. Fable is not
  repeated absent a systemic deadlock.
- Durable evidence: `docs/brain/evidence/E-1010.md` contains the exact hashes,
  failure-first lineage, 42/42 browser matrix and production rollback boundary.
- Current state: product verified and documentation current; no P0/P1 remains.
  Production is still `release102-e2f76c3d71c8`.
- Next: finish council advice, submit and freeze the exact result SHA, fetch and
  integrate into fresh canonical, then open a separate release103
  `production:deploy` workstream and execute smoke plus rollback/forward proof.

## Lifecycle correction

After the release102 receipt advanced canonical, an attempted merge of fresh
canonical into this still-active task branch was rejected by Brain with
`MANIFEST_BASE_STALE` and five `SCOPE_ESCAPE` findings for the receipt's
singleton documents. No remote product integration or production mutation
occurred. This branch is intentionally abandoned rather than rewriting history
or weakening the hard gate. The verified product/evidence commits remain exact
replay sources for a fresh v3 workstream initialized from the new canonical;
v3 must redeclare its own scope before replay and rerun every gate.
