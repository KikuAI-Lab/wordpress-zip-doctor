# WordPress ZIP Doctor Core-Parity Hardening

## Original Task

Implement the GitHub research recommendations for WordPress ZIP Doctor:

- align installability checks more closely with WordPress core behavior;
- add fixture-backed tests for official installer edge cases;
- separate blocking installability results from non-blocking package-quality hints;
- add source/distribution package warnings without expanding into WordPress support;
- verify and sync the standalone tool and the KikuAI hub copy if needed.

## Acceptance Criteria

- AC1: Plugin detection accepts WordPress-style plugin headers in the first 8 KB, including a header on the same line after `<?php`, and still ignores plugin headers buried below the package root.
- AC2: Theme detection preserves core-parity installability behavior for classic themes, block themes, and child themes, while treating missing metadata such as `License`, `Text Domain`, or `Requires PHP` as non-blocking quality hints.
- AC3: Installable packages that contain dev/source markers such as `.git`, `.github`, `node_modules`, `src`, `tests`, `package.json`, or `composer.json` remain installable but expose explicit quality hints.
- AC4: Non-installable source/archive packages can be diagnosed from dev/source markers even when those paths are otherwise ignored for package-root detection.
- AC5: Result data and the downloadable markdown report distinguish `blockingIssues` from `qualityHints`; quality hints must not change the primary installability verdict or clean ZIP export decision.
- AC6: The standalone repo passes `npm test` and `npm run smoke`.
- AC7: The KikuAI hub copy of the analyzer is synced and its WordPress ZIP Doctor test command passes.

## Constraints

- Keep the product scoped to browser-local ZIP installability, not broad WordPress linting, malware scanning, licensing validation, hosting/debug support, PHP execution, or WordPress login.
- Do not retain or include raw file contents in reports.
- Prefer the existing no-dependency static architecture.
- Keep quality hints small and actionable.

## Verification Plan

- Add failing tests in `test/wordpress-zip-doctor.test.mjs` before production edits.
- Implement minimal changes in `src/wordpress-zip-doctor.js` and `src/main.js`.
- Run `npm test` and `npm run smoke`.
- Copy the hardened module/UI delta into `kikuai.dev` and run its scoped WordPress ZIP Doctor test.
