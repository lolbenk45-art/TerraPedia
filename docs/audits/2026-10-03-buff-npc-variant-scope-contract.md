# Buff NPC Variant Scope Contract — 2026-10-03

## Scope and Boundary

This audit closes the read-only Task 14 contract for the 68 unresolved shared-page NPC variant infliction groups. It consumes the existing revision-bound verifier, scope classification, and partial replay artifacts. It does not fetch Wiki pages, write standardized data, run landing/maint/relation/projection, create a packet or permit, change Redis control state, or write a database.

## Inputs

- Verified NPC infliction evidence: `.local/tmp/buff-npc-infliction-verified-20261003-v7.json`
  - SHA-256: `sha256:813ce0fb049bf5c1cbbd5d412c1c7e951cb87ae211588278ac4c9af3c1ebadd3`
  - Completeness: `complete-exhaustive-npc-page-scope-with-exclusions-and-unresolved-variants`
- Scope classification: `.local/tmp/buff-npc-infliction-scope-gap-classification-20261003-v2.json`
  - SHA-256: `sha256:0c5cb51838426d626e9312ee352fb571c21983212a43ab5cf2b3108cb104d9b5`
  - 68 gaps across 25 raw pages; every page group has a positive owner for another or repeated infobox identity.
- Partial replay: `.local/tmp/buff-partial-contract-replay-20261003-v20.json`
  - SHA-256: `sha256:bb515aca5c2cabb07d453f7a876942855d2128ab874e62081cccba78d4a7698f`

The reproducible contract builder is `pipelines/fetch/buff-npc-variant-scope-contract.mjs`; its unit coverage is `pipelines/fetch/buff-npc-variant-scope-contract.test.mjs`. The generated contract is `.local/tmp/buff-npc-variant-scope-contract-20261003-v1.json` with SHA-256 `sha256:027aaa415cc635143f864f7eda998e1e8b5499672d68e96bb8f1be9d21118e0a`.

## Contract Result

Every gap receives exactly one status:

- `variant-owned-positive`: requires a positive fact whose stable NPC ID, `internalName`, page title/ID, revision ID/timestamp, and raw SHA-256 all bind to the requested variant. Current count: `0`.
- `variant-owned-complete-empty`: requires an independently supplied exhaustive revision-bound page source with zero infliction facts. Current count: `0`.
- `unknown`: shared-page or variant scope is not proven; the active baseline must be preserved. Current count: `68`.

The generated contract has `68/68` statuses as `unknown`, `68/68` with `preserveBaseline=true`, and zero positive facts. Positive facts from another stable NPC identity are recorded only as `positiveOwnerIds`; they are never copied to the requested variant. No unresolved group is converted into an empty list.

## Replay Safety

The contract revalidates the retained partial replay before accepting the scope result:

- `400/400` records accepted by the strict normalizer; `0` rejected.
- `114/114` verified NPC-page facts retained.
- `360` inflicting-NPC groups remain baseline-preserved; six additive facts remain diagnostic.
- Buff IDs `389–400` are all `missing-baseline` and no historical baseline is invented.
- `executable=false`, `applyAllowed=false`, `databaseWrites=false`.

## Disposition

The 68 variant groups remain `unknown` and canonical ingestion remains blocked. A future source refresh may promote only a variant-owned positive fact or an independently complete empty group after the same identity and provenance checks pass. Shared-page positive facts cannot authorize replacement for a different variant, and missing debuff rows cannot authorize an empty relation.
