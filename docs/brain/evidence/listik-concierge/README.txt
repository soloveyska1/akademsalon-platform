# Listik concierge release209

Production source0821d4c7bf6daa2d77bc03b669f2e123d86469a6; published11September2026MSK. Public artifacts and site sources are tied to exact baseline208-store-current-0e05ce04. verification.json and public209.manifest.json bind source, baseline, all459static hashes, browser cases and final production receipt.

Rebuild: `python3 scripts/build-assistant-knowledge.py --root .brain/listik-release/baseline208 --check`, then `python3 scripts/build-production-release.py --ref 0821d4c7bf6daa2d77bc03b669f2e123d86469a6 --baseline-archive .brain/listik-release/baseline208.tar.gz --baseline-release release208-store-current-0e05ce04 --output <fresh-path>`. Baseline remains immutable at the recorded production release path and locally in ignored .brain.

Deterministic: Python assistant/installer28/28; JS bridge/submit/builder28/28; exact public economic/privacy/PWA/learning/legal/reviews/rewards76/76; Brain39/39. Public read-only smoke14/14.

Browser: local standalone Python server serves frozen artifact and only assistant answer; other customer API calls are intercepted by Playwright CLI scripts. Setup→mobile→submit→guards→matrix→store is the fixture sequence. All posted contacts, files and order IDs in local cases are explicitly synthetic. Actual public browser script submits questions only, never order/lead/payment; checks server version, draft→live form, unchecked consents, distinct store benefits, zero browser/network failures. Final four store files from208 retain their behavior and legal body. Header changes are helper/PWA entrypoints and asset fingerprints.

Rollback: exact source installer roundtrip and real static209→208→209/backend new→old→new passed. Forward source backup is in production receipt. Never roll current back to207; that would remove the concurrent store redesign. dist compatibility pointer was left byte-for-byte as found. No commerce database rollback.

Limitations: broad grounded retrieval and curated dialog do not guarantee every possible formulation. Unknown or conflicting requirements are clarified or offered as an editable human handoff. Public user counts/founding date are not fabricated. Real payment/receipt/paid delivery were not exercised. Source branch is separate from canonical main integration.
