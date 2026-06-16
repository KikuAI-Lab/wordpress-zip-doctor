# Implementation Notes

- The prior GitHub research established WordPress core installer functions as the source of truth for installability.
- Quality hints are intentionally advisory. They should not block upload-as-is verdicts or automatic clean ZIP export when the structural installability decision is safe.
- The hub event transport and server-side event sink both need explicit allowlist updates for new sanitized metric fields. `qualityHintCount` and `qualityHintBucket` are now included.
- Full Nuxt build currently fails on the existing `/pagefind/pagefind.js` import in `pages/search.vue`. The route-specific test and browser proof for WordPress ZIP Doctor pass.
