# Current handoff

## Canonical and production truth

- Canonical integration ref before OUT-007 is exact
  `e91d69a8a1687a8df1e4c4e5fb9904e0439b3e20`. Verified OUT-007 implementation
  candidate is `35f5503cda84f06572e36ee7c605dc31a116b9cc` on
  `codex/out-007-search-catalog-clarity`; integration and G10 rollout are next.
- Production is `release101-b9837a34c4e`, exact canonical source `b9837a3`.
  `REL-0101` proves staged/live hashes, two-vantage 14/14 read-only smoke,
  isolated browser behavior and executed release100 rollback/forward restore.
- `OUT-002`, `OUT-003`, `OUT-004` and `OUT-005` remain verified. The OUT-006
  privacy foundation is verified; the outcome's server measurement and
  synthetic comprehension portions remain gated.

## What release101 proves

- Internal analytics is canonical-host/HTTPS only, uses `credentials:'omit'`
  and is silent on dashboard, admin, payment-link, impersonation and preview
  contours. It performs one best-effort send without unsafe client retry.
- All 92 root page identities use an exact allowlist and `/other`; legacy stored
  entry paths are canonicalized. Marks/events have finite dimensions, with a
  collision-free 336-variant legacy route migration.
- Reject, revoke and expiry purge browser ID, attribution and `_ym*`; a page
  opened without consent cannot recapture its UTM/referrer after same-document
  regrant. `/qa` no longer combines contact data with `salon_vid`.
- Failure-first contract is 10/10, independent P0/P1/P2=0, product 492/492,
  Brain 39/39. Production WebKit at 390×844 and 1024×900 had no overflow or
  console errors and made no no-consent `/api/visit` request.
- Live app SHA-256 is
  `c46d3984aa291b611af16f2fea808e15a92f7178df18591ee9a5ad8eda66ec41`;
  rollback reproduced release100 hash
  `2e7a955072d6ae595dbd7d5c5341e20f6e33427e5c226f2ac9dd99ad45cc7be8`
  and forward restore returned the release101 hash.

## Verified OUT-007 candidate

Three independent read-only reviewers audited search visuals, catalogue UX and
QA/reliability. Their initial BLOCK findings (hidden empty state, incomplete
composite aliases and stale catalogue cache keys) were reproduced and fixed;
all three final verdicts are APPROVE with P0=0/P1=0.

- Search presentation is now shared across home, services and cabinet; the
  catalogue clears fixed header/dock, 390 px result/chip geometry is readable,
  controls are at least 44 px and all touched 89/88/24/24 consumers share one
  OUT-007 cache dimension.
- One global text input owns navigation; services-local controls are facets.
  Bounded canonicalization composes diploma/supervisor/discipline forms and
  explicit tiers keep bare work types ahead of detail routes while composite
  work+discipline queries resolve to the exact discipline page.
- Blank, positive and no-match states are exclusive. One atomic polite status
  owns result announcements, zero recovery is outside listbox, keyboard/focus
  are intact and `salon_draft` stays byte-identical.
- Full regression is 500/500; protected 12 hub cards, 9 disciplines, 22 detail
  URLs and ItemList 13 remain exact. Details and hashes are durable in `E-1009`.

## Remaining limits

- `/api/visit` backend IP handling, dedupe, idempotency, retention and aggregate
  readback remain unknown. New `first_step_*` production milestones and claims
  of measured comprehension are forbidden until authoritative server evidence.
- `OUT-001` still needs authoritative backend/bot marker, lookup and cleanup;
  no production submit was attempted.
- SSH/HTTPS occasionally times out before connection. Final exact hashes,
  server/external smoke and rollback-forward are green; no watcher, local LLM,
  browser or temporary server remains.

## Independent council and design boundary

`OUT-007` was the selected bounded implementation slice. Council doctor and the
daily Kimi/Sonnet/GLM run were green; all three independently rejected mixing
catalogue IA redesign into the first bugfix. Opus found that home 390 is not yet
a safe style source and selected a three-commit risk order. One systemic Fable
review approved that boundary and required template-wide cascade/cache proof.
Ignored `.brain/council` reports remain hypotheses; exact reproduced geometry,
source and frozen gates are durable in `E-1009`.

## One exact next step

Integrate exact OUT-007 result after fresh fetch/conflict/Brain gates, then ship
it through a separate production release with healthcheck, read-only smoke and
verified rollback/restore. Do not redesign catalogue IA until a post-fix user
measurement crosses the 15-second/two-wrong-turn threshold.
