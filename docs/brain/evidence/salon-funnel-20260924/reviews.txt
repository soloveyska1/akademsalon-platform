# Two independent read-only reviews

Both reviewers used isolated Chrome with all HTTP intercepted, synthetic requests only, and closed browsers. Root is the sole writer. Model conclusions are backed by the concrete observations below and root's reproducible verify.mjs.

## intake_privacy_review

Initial NO-GO identified a reproducible P1: salon-select's synthetic input/change did not count, while the auxiliary search field did. Corrected with an explicit commit adapter and excluding fields without an ID.

Final GO: P0=0/P1=0/P2=0. Independently observed pointer/keyboard choice -> one first_input with current service CTA; search/no-op/synthetic prefill -> no first_input; before consent -> none; consent -> page_view/config_open; revoke stops collection; 503/retry/success keeps request ID, success stays hidden until server confirmation. No synthetic text/contact in analytics; page errors zero.

Exact reviewed SHA-256:
- salon-order.js: 8a4dec27f0054029b42f918284aeb25cf15cc24200e4bf51c26e848182d4e5a0
- salon-select.js: 49c3322c048f29c20a643742cad0d422549a0b51bd2cfc59307600937e5e39b4
- app.js: 601098a65a20cb9514428c861c4e7d5f723481b0813de5559f7a3bbd4e883721

## intake_journey_review

Final repeated GO: P0=0/P1=0/P2=0. Fresh and saved diploma/editing/VIP/express24/addons both open plan course, 3000 RUB, one svc_plan item, plan=true, tier=base, answers.work=course, no composition_intent. Search for master alone does not emit first_input. Committed master selection emits one event, updates existing service price to 5000 and submits answers.work=master. Later inputs do not duplicate first_input. Page errors zero.

Independently checked six changed files of 515, no deletion, all three dependent script URLs updated. Sitemap keeps all 77 URLs and changes only the guide's date. SW HTML is network-first and new asset URLs avoid old cached bytes. Deploy helper pins the full production inventory, preserves dist, and performs rollback/forward. Manifest must be rebuilt after implementation commit before publishing.
