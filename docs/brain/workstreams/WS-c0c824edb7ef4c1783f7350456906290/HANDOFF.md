# Workstream handoff

- Branch: `codex/out-006-vip-entry-clarity-v1`
- Outcomes: `OUT-006`
- Goal: make the 91,000 RUB psychology VIP entry understandable before form
  completion: the owner promo preview must not cover the configurator, the
  first screen must explain the bounded full-project value, and desktop action
  controls must not obscure the form.
- Acceptance: owner `owner_preview` on the configurator is available through a
  labelled compact control and opens only on explicit action/query; ordinary
  eligible new users keep the reviewed welcome campaign; VIP shows price,
  payment stages, included outcomes and the immediate next action before the
  detailed fields; desktop 921+ uses an in-flow footer with no fixed overlay;
  mobile retains a reachable action; deposits, discounts, quote, payload and
  submission contracts are unchanged.
- Proof: focused promo/VIP contracts, full public Node suite, deterministic
  build, strict Brain validation, desktop/mobile light/dark Chromium snapshots,
  owner/new/returning eligibility scenarios, no production submit, two
  independent final reviews, exact production hashes and rollback-forward.
- Changed: added the VIP package passport before form fields; exposed exact
  91,000 RUB and 27,300 / 36,400 / 27,300; made the owner welcome preview an
  explicit compact launcher; moved the VIP mobile action into document flow;
  removed the desktop overlay; restored VIP CTA truth on `pageshow`; clarified
  the single-choice question as the strongest change.
- Verified: 648/648 Node tests, deterministic build, WebKit/Chromium mobile
  6/6, real browser BFCache and authenticated owner-preview scenarios, two GO
  reviews, exact public hashes, HTTP smokes, service/Nginx/SQLite/journal checks,
  executed rollback-forward and private Sites version 42.
- Unverified: no real customer order or conversion uplift was created or
  claimed.
- Risks/rollback: shared promo assets are cache-busted together at both direct
  consumers. The change is static-only; rollback is the prior immutable
  release and requires no backend or database restore.
- Next: observe real VIP selection and qualified-submission data before any
  price, scope or multi-select contract change.
