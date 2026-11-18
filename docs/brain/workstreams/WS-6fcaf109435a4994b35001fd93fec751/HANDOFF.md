# Workstream handoff

The owner requested a second pass on the header link. Match the normal, hover, focus and current-section treatments of the existing section navigation. Keep the visible mobile link and use the campaign header's own typography on zero-classes. Build over the verified release280 review gallery. Accept after computed-style comparisons and desktop/mobile checks on samples and reviews, with the gallery and all non-stylesheet page content preserved.

Published and confirmed `release281-header-style-24a3f88f` from `24a3f88f783f2d5f7ddad6f1f47051ad0d13e9e1`. The CSS is shared with the sibling items in the primary header and with the adjacent action on the separate campaign page. Remote staging rehearsed the atomic rollback to `release280-reviews-gallery-74f8e017`.

All 132 affected HTML pages differed only in their stylesheet URLs. The second build was unchanged. Production checks passed for eight public pages, both stylesheet hashes and API health. The published gallery retains both filters and 67 share links. Computed normal styling matched the benefits link in light and dark themes. The current reviews link matched the current samples link, including the marker. Keyboard focus and Enter worked. Checks at widths from 320 to 1440px found no overlapping header controls, and the reviews target remained 44px high. On the campaign page both actions matched and were inside the header at 320px. Physical devices were not used. Integration owner can reconcile the submitted overlay with main.

- Branch: `codex/reviews-in-header`
- Outcomes: `OUT-003`
- Give visitors a direct, labelled link to the reviews gallery in every public navigation header.
- Check all 131 shared headers and the separate campaign header against production release278. Preserve the 67 reviews and each page's order destination.
- Test the link on desktop and mobile with search visible, including the 1190px navigation breakpoint. Verify active state, keyboard use and target size.
- Publish only the navigation delta over the verified release278. Keep the immutable predecessor and validate its rollback target.

The live release is `release279-reviews-nav-6031ed4a`, built over `release278-review70-7fa58d36`. Comparison of all 140 HTML documents showed the new link and stylesheet version on 132 pages. All other entries, every original review and the existing order destinations were preserved. A second build produced no changes. Two independent reviewers checked coverage, the active state and accessibility.

Browser checks covered 320–1440px, including 1190/1191 and 1280/1281. The link stays 44px high, is reachable by Tab and opens the gallery with Enter. The compact header, active dark-theme treatment, the special landing page and representative service, configurator and shop pages passed. The public homepage link opened all 67 reviews. Eight public pages, both deployed CSS assets and API health passed the external smoke. The publish-time rollback rehearsal verified the previous immutable tree. The deployment receipt records all 134 file hashes.
