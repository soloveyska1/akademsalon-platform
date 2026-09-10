# Workstream handoff

- Branch: `codex/material-catalogue-20260910`
- Scope decision: preserve all existing release202 pages; deploy only additive shop files. Earlier unused declaration was abandoned because index.html overlaps active design branches.
- Outcomes: `OUT-006`
- Goal: launch original study-material catalogue with automatic Robokassa payment and private delivery; connect Kladovaya acquisition to the live Salon journey.
- Acceptance: genuine finite licences; idempotent checkout and signed callback; account-bound private downloads; bounded purchase-funded bonuses; production preserves release202; preview never exposes full files.
- Proof: SQLite concurrency and state-transition tests, authorization and replay fixtures, source/requirements and all-page document QA, independent payment and growth reviews, staged and live GET smoke, exact file hashes.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: additive backend module and private files; source backup and atomic static release based on live release202. Never restore a production database over newer payments. Do not publish checkout until provider configuration and automatic delivery are verified.
- Next: commit declaration, check conflicts, implement additive module and storefront.
