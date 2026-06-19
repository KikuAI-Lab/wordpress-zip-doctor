# ZIP Safety Contract - 2026-06-18

## Decision

Keep WordPress ZIP Doctor browser-local and dependency-light for P0. Do not add WordPress login, PHP execution, malware scanning, hosted upload, or support-service behavior.

The current ZIP reader is acceptable for validation only if safety caps and malicious fixture coverage stay explicit.

## Required Safety Blocks

- Invalid or unreadable ZIP: `invalid_zip`.
- Total file bytes above browser-local cap: `too_large_or_unsafe_to_scan`.
- Entry count above cap: `too_large_or_unsafe_to_scan`.
- Unsafe paths such as absolute paths, drive letters or `..`: `too_large_or_unsafe_to_scan`.
- Encrypted, ZIP64 or unsupported compression methods: `encrypted_or_unsupported`.
- Excessive total uncompressed size: `zip_bomb_risk`.
- Excessive compression ratio: `zip_bomb_risk`.

## Dependency Rule

Do not add `fflate`, `jszip`, or another ZIP dependency only for convenience.

Add one only if P1 finds a concrete parser correctness or safety gap that cannot be fixed with the current central-directory reader and fixture coverage.

## Not P0

- Runtime PHP analysis.
- Marketplace license validation.
- Malware/security scan.
- Demo import or hosting/upload-limit fixes.
- WordPress admin login.
