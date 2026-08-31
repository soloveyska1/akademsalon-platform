# Workstream handoff

- Branch: `codex/september-zero-classes-2026`
- Outcomes: `OUT-006`
- Goal: add a bounded Academic Salon companion page for Kladovaya's 1 September "zero classes" campaign without changing the existing first-order offer or order flow.
- Acceptance: the page calls the benefit a 1,000 RUB discount, states the 5,000 RUB minimum and 21 September deadline, links to the Kladovaya server-authoritative claim flow, and contains no gift-certificate or cash-balance language.
- Proof: focused Node contract test, full public suite, Brain validation, mobile Chromium/WebKit read-only smoke, and exact production GET readback.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: the campaign must not create a refundable gift balance or stack a second promo. Rollback removes only the new static page and assets; issued promo rows remain valid until their own expiry.
- Next: review and commit the manifest plus this handoff.
