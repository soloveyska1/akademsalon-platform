# Workstream handoff

- Branch: `codex/out-006-analytics-truth-v6`.
- Base: `2683a4ec3337620022049f755b3e5d23a0ccfeb6` (`origin/main` at init).
- Outcome: `OUT-006`.
- Goal: make the consented funnel truthful, exclude authenticated owner and QA
  browsers from first-party/vendor business metrics, and make slow mobile
  configurator navigation single-flight without changing promo, deposit or
  price economics.
- Authoritative implementation:
  `dcbef91b604a8eec9a2e7a67439eee4069d77222`.

## Changed

- Analytics contract 2.4 interprets input as `first_input` only; attempt and
  server-confirmed success remain distinct.
- Pre-consent first input stays armed.
- Successful authenticated admin overview marks the local owner device. An
  early guard suppresses legacy/Yandex collection; strict attribution and
  Analytics v2 exclude owner/QA, including cross-tab confirmation and ordered
  anonymous revocation. Protected retention preview remains GET-only and
  zero-storage.
- All 87 measured pages load one cache-busted guard/attribution/analytics wave.
  First configurator activation is native; immediate repeats are blocked before
  a second telemetry intent and accessible state is restored on `pageshow`.
- Production contract and static payload were released as REL-0175. Promo,
  drafts, prices, tariffs, deposits, Salon+, referrals and Kladovaya were not
  changed.

## Verified

- Public 636/636; backend 129 with two expected skips; Brain 39/39; focused
  final 68/68; strict validation and diff checks green.
- Final independent reviews: analytics P0=0/P1=0/P2=0; mobile
  P0=0/P1=0/P2=0; SQLite/release P0=0/P1=0.
- Two byte-identical 359-file builds; immutable live release175 has 362 files
  with three exact retained server files and zero ownership/mode/symlink drift.
- Production Chromium 390×844, two-vantage smoke, exact public hashes, service,
  Nginx, WAL, `quick_check`, FK and clean journal verified.
- Real static release173 rollback/forward and contract 2.3/2.4 rollback/forward
  passed. No SQLite restore or deposit action occurred.
- Durable proof: `E-1039`; release record: `REL-0175`.

## Limits and rollback

- Historical `config_step_1` events are not true input and cannot be repaired.
  Use only the prospective post-REL-0175 series. No conversion, revenue, margin
  or profit uplift is claimed yet.
- The full tracked analytics installer must not run on the current production
  overlay. Static rollback is `release173-c245da0`; backend rollback is the
  exact contract JSON swap plus service restart, never a DB restore.
- User dirty file `.claude/launch.json` in the original checkout was untouched.

## One exact next step

After at least seven full days or 100 consented sessions, whichever is later,
compare `first_input → submit_attempt → submit_success` by device and source,
excluding owner/QA. Do not tune prices or promo from the historical
`config_step_1` series.
