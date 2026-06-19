# ZIP Dependency Decision - 2026-06-18

## Decision

Keep the current no-runtime-dependency ZIP parser for this product stage.

Do not add JSZip, fflate, yauzl, unzipit, a WASM decompressor, or a worker-based archive library until a real fixture fails the current parser and cannot be handled with a small bounded adapter.

## Why

The product promise is narrow: browser-local WordPress package diagnosis and safe extraction/repackaging of common installable ZIP shapes.

The current implementation already has explicit safety limits for:

- max ZIP byte size;
- max total uncompressed bytes;
- max entry count;
- nested ZIP depth/count;
- compression ratio;
- unsafe paths;
- unsupported or encrypted entries.

Adding a broad ZIP dependency would increase the supply-chain and browser-memory surface before there is evidence that the current parser blocks a high-value WordPress package path.

## Current Allowed Scope

- Stored ZIP entries.
- Deflated entries only when a caller supplies a bounded `inflateRaw` implementation.
- One-level nested installable ZIP discovery.
- Repackaging a single valid package folder.
- Diagnostic-only output for unsupported/encrypted/unsafe archives.

## Revisit Criteria

Reopen this decision only if P2 evidence includes at least one of:

- a real high-intent WordPress package fixture that fails only because of parser capability;
- repeated user files requiring a ZIP feature outside current scope;
- a security review showing a maintained parser reduces risk more than it adds dependency risk;
- a browser-memory benchmark proving the dependency stays inside the existing safety contract.

## P1 Test Gate

The package must remain dependency-free until the revisit criteria are met.
