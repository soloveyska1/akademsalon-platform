# Specification redesign handoff

- Branch: codex/specification-interactive
- Base: e53d11cea40055f2dae41a0f212cbbac4c79055f, freshly fetched origin/main.
- Outcome: OUT-006, explicit user-authorized redesign of specification page and repair of inconsistent footer.
- Scope: isolated specification-interactive.html + order-specification.css/js + unique evidence. Current owner of salon-direct-orders retains sole writes to shared shell and publication; will merge submitted input as before and replace specifikaciya.html, remove intermediate document.
- Acceptance before edits: compact interactive example of composition/result/date/price, no actual contract acceptance or payment; preserve distinctions A1/A2/B1/B2, participation and draft result, change consent/history, initial acceptance window and PDF access; keyboard/noJS/reduced motion and mobile light/dark no overflow. Two independent reviews, deterministic QA then final composed live readback.
- Design: current violet #5136b5, paper #faf9f6, ink #292537, soft #eeeafa, mint #d9f5bb with dark roles; Golos UI/Literata restrained display, mono example metadata. Signature is a real interactive document with four annotated rows and a contextual explanation; short legal particulars under native disclosures. Single direct-order action and separate explicit sample PDF. Do not introduce fictional signature/payment actions.
- Sources: current specifikaciya.html + linked sample PDF + existing offer. PDF is a separate illustrative multi-position example, not an exact copy of the screen; its old offer revision must not be represented as current terms.
- Footer: root-independent audit found dark new footer background depends on body allowlist, while light link colors apply globally. Integration owner requested to migrate footer selectors to .salon-experience .site-footer.salon-bottom; internal document footers must remain untouched.
- Proof plan: browser matrix 320/360/390/768/1024/1440 x light/dark x four fields; keyboard selection, noJS, modes, disclosures; contrast and PDF target. Legacy tests and composed contracts distinguished. Brain validation, scope check, independent review.
- Changed: declaration only.
- Unverified: implementation, shared footer integration and publication.
- Risks/rollback: no backend/legal artifact changes. Restore previous specifikaciya.html and shared footer CSS from retained private version if necessary.
- Next: implement, verify, freeze and submit result to active integration owner.
