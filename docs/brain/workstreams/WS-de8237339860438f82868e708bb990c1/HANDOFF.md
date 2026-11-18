# Workstream handoff

- Branch: `codex/review-70`
- Outcomes: `OUT-003`
- Publish one new anonymised review, using release277 and its exact source branch as the content baseline.
- The new item must be first, appear under the results filter, open its own redacted proof and bring both home counters to 67.
- Compare the preceding 66 cards and both home pages against the live parent. Check the direct anchor, image viewer and mobile layout in a browser.
- Stage an immutable release alongside release277. Verify the parent and all changed files before switching the current link. Keep release277 available for rollback.

Release `release278-review70-7fa58d36` went live on 19 November 2026. The review sources from the release277 branch reproduced all three original HTML files byte for byte. The new build preserves all 66 previous cards and adds one record, its proof, thumbnail and inline photo. The public page, both home variants, stylesheet, three images and API health endpoint returned HTTP 200.

The gallery showed the new card first, both in the full collection and in the results filter. The viewer opened its proof. On 390px and 1280px screens the conversation fit the card and the page had no horizontal overflow. An isolated pointer round trip verified the predecessor before activation. The deployment record names the exact parent and candidate, together with hashes of the seven published files.
