# Review gallery filters and sharing

- Outcome `OUT-003`, branch `codex/reviews-gallery-filters`.
- Deliver independently selectable situation and work type filters, contextual counts, and a shareable permanent link on every review.
- Accept when the 67 published conversations, original images and existing deep links are preserved. A work type must have evidence in its conversation or attachment. Check pagination, mobile layout, the screenshot viewer, copy and manual fallback.
- Build over the immutable release279-reviews-nav-6031ed4a and compare the complete file manifest. Publish atomically with a tested switch back to that release.
- Release `release280-reviews-gallery-74f8e017` is live, built over the immutable release279. The verified deployment receipt records the five delivered files and a rehearsed pointer reversal.
- The 67 conversation bodies and proof links match the parent. Menus are present in all three regenerated pages. The second build is byte-identical. The other 681 files match the production parent.
- Browser checks covered all 20 selectable intersections, counts, the empty state and reset, pagination, keyboard focus, the viewer and deep links to the last card. Copied review 70 on the public site, compared the clipboard with its canonical URL, and opened it in a new tab.
- Dedicated local fixtures exercised Clipboard API success, legacy fallback, manual selection and home attribution. Browser widths 320–1280px and the public dark mobile view passed. Physical devices and screen-reader speech were not exercised.
- Public HTML, JavaScript, CSS, both original images and API health returned 200. All 39 Brain tests passed, strict validation and conflict checks passed. Source commit `74f8e017e303d14a54dae96da808a67ebf2979d1` is on the submitted branch. The integration owner can reconcile this static overlay with main.
