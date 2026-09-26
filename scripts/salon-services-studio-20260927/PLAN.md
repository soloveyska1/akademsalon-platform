# Services studio — design decision

The user rejected release224 as visually unchanged and awkward. The active319px pane confirms a tall repeated-card catalogue, dispersed controls and long scrolling. Actual release224 is loaded; this is not a cache explanation.

Audience: a student choosing a precisely bounded academic service. Single job: understand scope and budget, then carry the chosen estimate to the existing request.

Pass1 alternatives:
A: larger illustrated price cards. [hero][12 independent cards][modal]. Rejected: same architecture and repeated CTA clutter as the disliked result.
B: service index and a live workbench. [compact violet masthead][scope shortcuts][service rows | selected task inspector]. Mobile: compact index → full-height bottom sheet with stationary price/action. Selected.

Tokens: paper #f7f7fb, ink #272238, violet #5140c9, lilac #eee9ff, plum #2a2242, sage #e4efdb. Dark roles: ink paper #171321, surface #241e32, violet accent #c4b5ff, restrained sage badge. Display Literata italic for one phrase; Golos Text for service labels and controls; JetBrains Mono only the small desk labels. The actual current violet Salon identity is preserved.

Signature: a single workbench with three priced scope choices and a folded-corner summary; compact service rows replace repeated bordered promotional cards. The colored masthead and attached situation tabs make the page visibly different at first glance. No arbitrary decorative numbering.

Pass2 critique: a giant hero/example quote would repeat the rejected layout. Cut it. Keep the intro under~200px on mobile and use real interactive content immediately. Remove duplicated benefit setup above the catalogue. Type remains the service index; situations adjust scope rather than introducing another catalogue. Budget filter changes visibility, never price. Same mathematical model and checkout bytes as release224.

Features: priced whole/part/edit choices before selecting; reusable custom unit controls; quick deadline chips with actual dates; optional add-ons visibly priced; two tabs (composition/benefits); payable preview visible while editing; explicit membership cost/cashback distinction; compare subscription costs for1/3/5works; copy estimate; saved selection; keyboard/native dialog. No pricing or bonus-rule changes.

Owner accepts only69 terminal-worktree warnings; zero hard conflicts. User's direct redesign request takes precedence over the older IA freeze. Root is sole write-owner; two read-only independent reviews after deterministic tests.
