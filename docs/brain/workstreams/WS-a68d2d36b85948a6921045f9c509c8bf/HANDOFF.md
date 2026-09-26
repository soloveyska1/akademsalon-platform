# Workstream handoff

- Branch: `codex/salon-services-20260927`
- Outcomes: `OUT-007`
- Goal: redesign services catalogue around always-numeric estimates, unchanged published base prices and transparent optional benefits. User explicitly authorizes catalogue redesign; sole owner performs own work, model hourly-cost scenarios required.
- Base: exact origin/main 8bd8032c60dff9a2e3894c958dd4aa9d982f6139; source checkout dirty .claude/launch.json excluded. Production overlay release223 must be verified and preserved, never rebuilt from stale root HTML.
- Acceptance: all 12 products, scopes, disciplines, deadlines, speeds and VIP show a positive numeric estimate; published prices/multipliers/addons unchanged; new fallback assumptions explicit. Discounts best-of, points <=20%, combined <=25%; no expired welcome promo, gift/advance not called savings, future cashback separate, fees included in plan comparison. Selected estimate survives checkout/back. Mobile/light/dark, keyboard, no false success or real API writes in QA.
- Proof: deterministic price matrix and economics scenarios, exact baseline/delta hashes, browser journey and geometry at 360/390/768/1024/1440 light/dark, two independent reviews, regression; release requires health/smoke and tested rollback. Owner economics report with dated primary market sources and 500/1000/1500 RUB hourly scenarios.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: frontend estimates are not binding payable totals; unknown effort remains a range. No backend, balance, price tariff, eligibility or customer-data mutation. Rollback to verified baseline static release only.
- Next: commit declaration, review conflicts, inspect actual runtime and implement bounded overlay.
