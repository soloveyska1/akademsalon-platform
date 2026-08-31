# Workstream handoff

- Branch: `codex/september-zero-classes-2026`
- Outcomes: `OUT-006`
- Goal: ship the bounded Academic Salon side of Kladovaya's 1 September
  "zero classes" campaign without changing the existing first-order offer.
- Acceptance: three Moscow-time drops issue exactly 30 bearer promo codes; each
  gives a fixed 1,000 RUB discount on one new order from 5,000 RUB, can be
  claimed once per Telegram account, can be bound to one order only, and must
  be applied by 21 September 2026 at 23:59 MSK. The public page and runtime use
  no gift-certificate, cash-balance or refundable-credit language.
- Changed: added the campaign page, bounded status UI, campaign schema/runtime,
  HMAC-authenticated status and claim endpoints, exact hash-pinned installer,
  systemd credential drop-in, source and economic regressions, and shared-shell
  route contracts. Issuance is default-off until the runtime gate succeeds.
- Verified on the exact rebased tree: focused campaign backend 16/16 and public
  3/3; full public, 146-test backend and 39-test Brain suites green; strict
  Brain validation and diff checks green. The installer rejects marker-bearing
  drift and the pinned production fixture matches both preimage and postimage
  hash sets.
  A hash-pinned copy of the exact production source and database completed an
  isolated end-to-end claim/order race: one code claimant, one winning order,
  one rejected competing order, exact 0/1,000 RUB price boundary, and repeat
  retrieval after issuance was disabled. Chromium desktop/mobile states cover
  upcoming, live, closed, ended and unavailable API paths without fake stock.
  Three independent reviews cover runtime/operations, economics/copy and UX.
- Unverified: production install, live static/API readback and the
  scheduled-publication timer are still release gates.
- Risks/rollback: before the first claim, the installer can restore the exact
  source preimages and disable/deactivate the seeded campaign. After any claim,
  source rollback is deliberately refused: the safe rollback is issuance
  disablement while the patched runtime stays online so an already issued
  bearer code remains bound, gated and redeemable. Never restore the database
  snapshot over live orders or claims. Static rollback is the previous
  immutable release.
- Next: stage the disabled backend and static release, verify shared credential
  digest and live health, then enable issuance and read back the exact
  production state.
