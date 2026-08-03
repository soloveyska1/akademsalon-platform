# Current handoff

## Canonical and production truth

- Canonical integration ref contains exact OUT-005 result
  `db93a45a385521600fbe1a5121334c413ebdbfa4`; terminal manifest revision 9 is
  commit `581e759`.
- Production remains `release99-96156040130c`; `REL-0099` proves health,
  14/14 read-only smoke, mobile/desktop smoke and executed rollback/forward.
- `OUT-002`, `OUT-003`, `OUT-004` and `OUT-005` are verified and integrated.
  No OUT-005 application code has been deployed yet.

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

## Remaining limits

- Production is still release99, so the integrated OUT-005 source is not a live
  production claim until a separate release record, smoke and rollback pass.
- `OUT-001` still needs authoritative backend/bot evidence and safe production
  marker/lookup/cleanup before any real end-to-end mutation.
- Exact pre-integration conflict scan had hard=0 and one explicitly reviewed
  unmanaged dormant-ref warning; the result was fast-forward integrated.
- Reviewer-owned browser/server processes were stopped. Older foreign Playwright
  groups remain visible and were intentionally not killed.

## One exact next step

Create a bounded release workstream from fresh canonical, rerun source gates,
publish OUT-005 as a new atomic production release, then prove health, read-only
key-path smoke and executed rollback/forward before asking the user to review it.
