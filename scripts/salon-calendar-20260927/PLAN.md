# Salon calendar design plan

Subject: choosing a delivery date for an academic-service estimate. One job: choose/clear the existing deadline without losing the selected work or quote.

Pass one: native browser calendar cannot carry the Salon styling consistently. Compare [date field | OS popup] with [Salon field → compact paper calendar → same source date]. Choose a scoped progressive enhancement with its own native dialog, a Monday-first grid and a month/year switch; preserve the original date input and all existing events/validation as the authority.

Tokens: white surface #ffffff, paper #f7f7fb, ink #272238, muted #645e73, violet #5140c9, lavender #eee9ff. In implementation inherit existing --sheet/--ink/--muted/--accent/--soft/--line roles with dark equivalents, rather than literal light fills. Golos Text for month/day/action text, JetBrains Mono only for the short utility caption. Selected date is a violet paper-tab shape; today has a small dot and semantic current-date attribute. Single restrained signature, no decorative illustrations or new headline.

[Deadline field]
    [caption                 ×]
    [‹    September 2026 ▾   ›]
    [Mo Tu We Th Fr Sa Su     ]
    [six aligned rows of days]
    [Today          No date  ]

Pass two: make the date button and month navigation generous, keep all day targets >=44px even at319px, preserve space between month/year, and use the real receipt palette. A simple modal dialog avoids a native-sheet/popover layering clash on mobile. Month grid supports direct month/year selection; calendar grid follows arrow/Home/End/PageUp/PageDown/Shift+Page conventions. Closing restores the trigger; Escape must never dismiss the parent quote at the same time. No price, subscription, new date constraint, storage or network behavior is introduced.

Reference for keyboard semantics only: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/ . Original implementation, tested against the actual nested services dialog and request form; no claim of assistive-technology certification.
