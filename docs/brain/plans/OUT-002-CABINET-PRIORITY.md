# План достоверного приоритета кабинета для OUT-002

- Date: 2026-08-03, Europe/Moscow
- Workstream: `WS-e08156212817409b803adf1d40e4ef2e`
- Base: `1426b4e602cffda2a291c43076a089ffd13cd857`
- Branch: `codex/out-002-cabinet-priority-truth`
- Write-owner: `codex-root`; independent agents are read-only reviewers.
- External mutations: prohibited. Only the local synthetic `demo=alexey`
  cabinet fixture may be used for runtime proof.

## Why this slice comes next

`OUT-001` frontend submit safety is integrated in the canonical branch. `E-1002`
then leaves one reproducible P1 on the first cabinet viewport: deadline urgency
can turn a quiet or paused case into a false “new master message”, and additive
urgency can let a lower action class outrank payment, price or review. The public
home/header/footer have no reproduced P0/P1 that should displace this client-path
defect, and this repair does not require a redesign.

## Execution contract

1. Freeze the current failure with executable tests, not source-pattern checks:
   quiet and paused cases return no card for any finite deadline; zero-like or
   negative counters do not create file/message actions.
2. Resolve only real actions in the approved order:
   `payment > price > review > files > message`.
3. Use deadline only to choose between actions of the same class. A finite
   nearer deadline beats a later or missing deadline; exact ties preserve the
   existing `activeOrders()` order.
4. Keep the current payment classification (`prepay`, or ready part/final in
   `work`/`fix`) in this bounded slice. Whether zero-due or claimed payment state
   needs a wider cross-component contract is a separate evidence question and
   must not silently expand this workstream.
5. Render every action kind explicitly and fail closed for an unknown kind. A
   fallback branch must never reinterpret score zero as a chat message.
6. Preserve the approved one-card/one-CTA composition, copy and destinations.
   Change the calm explanation only so it remains truthful for paused cases.
7. Keep the existing cabinet asset keys and add one dedicated query component
   to the sole `cabinet.js` consumer in `dashboard.html`.

## Proof and acceptance

- Failing-first harness executes the literal `nowCard()` against a deterministic
  matrix and proves the canonical baseline has false quiet/paused cards,
  adjacent priority inversions and truthy zero counters.
- Focused and expanded account tests prove every action kind, CTA destination,
  same-class deadline ordering, stable ties and the cache reference.
- The full repository suite, syntax check, Brain unit tests, Brain validation and
  a fresh strict conflict scan must pass.
- A local synthetic browser walkthrough at desktop and 390 px checks one visible
  priority card, one 44 px CTA, destination, no horizontal overflow, light/dark
  rendering and zero console warnings/errors.
- Kimi, Sonnet and GLM provide independent daily review; one Opus review checks
  the contract/UX boundary. Fable remains connectivity-only unless a genuine
  system deadlock appears.

## Stop conditions

Stop if a quiet or paused case produces an action, a lower class outranks a
higher one, a CTA destination changes, more than one primary action appears,
mobile width overflows, keyboard/focus behavior regresses, a changed asset lacks
cache invalidation, any P0/P1 test fails, or manifest/conflict proof turns hard.
Stop rather than infer new payment semantics from incomplete due/claimed data.

## Risks and rollback

- A comparator mistake can hide an actual payment or review. The ordered pair
  matrix tests every adjacent class, while the fixture proves the live price CTA.
- A generic renderer fallback can recreate the false message. Unknown kinds
  therefore return an empty card.
- Cached JS can leave the old bug active; the sole consumer receives the
  additive `priority=truth1` key without widening release-version scope.
- Rollback is an exact revert of the implementation commit. There are no schema,
  production-data, OAuth or deployment effects.
