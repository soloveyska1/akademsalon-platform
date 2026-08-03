# Current handoff

## Canonical and production truth

- Canonical integration ref contains exact OUT-005 result
  `db93a45a385521600fbe1a5121334c413ebdbfa4`; terminal manifest revision 9 is
  commit `581e759`.
- Production is `release100-1c275bffde93`, exact source
  `1c275bffde9368d52433a137bca11666b7d1230c`; `REL-0100` proves health,
  two-vantage 14/14 read-only smoke, independent mobile/desktop smoke and
  executed rollback/forward to release99 and back.
- `OUT-002`, `OUT-003`, `OUT-004` and `OUT-005` are verified and integrated.
  OUT-005 is deployed and its exact production asset hashes match the staged
  release.

## Latest integrated result

- Outcome: `OUT-005` on `codex/out-005-services-choice`, base exact canonical
  `96156040130c874519d1cd4f6335173a774d7847`.
- Workstream `WS-9f644e92a3a04eb280a49d550b0ae513` is integrated revision 9;
  frozen result is `db93a45a385521600fbe1a5121334c413ebdbfa4` and implementation
  hardening head is `b2bd17b0538d88bbd68f041f4e3f0437052c2533`.
- Plan: `plans/OUT-005-SERVICES-CHOICE.md`; evidence: `E-1007`.
- The old statement “product implementation has not started” is superseded by
  the verified task-branch result below; it remains historical in `E-1007`.

## What is now proved

- Fresh, selected and saved services states have one contextual primary on
  desktop and mobile. Saved progress is not overwritten before explicit
  continue/replace; route parameters and focus survive until resolution.
- The physical catalogue remains 12 hub cards, 9 discipline links, 22 detail
  pages and ItemList 13. All detail handoffs are explicit allowlisted URLs;
  search includes discipline routes; referat/practice copy and route truth agree.
- Nine discipline pages reproduce their displayed entry prices in the routed
  configurator. Exact client profiles stay local; API, cart serialization,
  quote email and bot keep the established `law` transport code.
- Catalogue primary text contrast is 6.010:1 light and 5.914:1 dark. All 24
  catalogue consumers and the shared runtime/home rebuild use atomic cache waves.
- Three independent reviewers returned final P0=0, P1=0; final QA also returned
  P2=0. Focused 73/73, full repository 482/482, Brain 39/39, JS syntax,
  `git diff --check` and strict Brain validation are green.
- Production browser verification covers fresh/selected/saved services at
  390×844 and 1024×900 in light/dark modes: one contextual primary, no horizontal
  overflow and zero console errors/warnings. Psychology preserves its route and
  exact 11,000–15,500 ₽ quote.
- Live `assets/js/app.js` SHA-256 is
  `2e7a955072d6ae595dbd7d5c5341e20f6e33427e5c226f2ac9dd99ad45cc7be8`;
  rollback release99 reproduced
  `70ea63dd8fbf55ddb50eb5677aabb811f6ddf67b626c744f00917e564de0db0b`,
  and forward restore returned the release100 hash.

## Remaining limits

- `OUT-001` still needs authoritative backend/bot evidence and safe production
  marker/lookup/cleanup before any real end-to-end mutation.
- The first release100 switch correctly failed closed on inactive-directory mode
  700 and was rolled back. Corrected `www-data` ownership, 755/644 modes, exact
  hashes, two-vantage smoke and the final rollback/forward are green. Intermittent
  local SSH/HTTPS timeouts remain an operations observation.
- Reviewer-owned browser/server processes were stopped; final process inspection
  shows only Codex kernels and no project browser or watcher.

## One exact next step

Ask the user to review <https://akademsalon.ru/?v=release100>; record any feedback
as reproducible evidence. In parallel, bootstrap a bounded `OUT-006` workstream
from fresh canonical to define privacy-safe first-step comprehension and
time-to-action measurement before any further redesign.
