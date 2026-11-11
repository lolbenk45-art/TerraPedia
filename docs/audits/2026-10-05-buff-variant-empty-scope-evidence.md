# Buff Variant Empty-Scope Evidence — 2026-10-05

## Scope and Boundary

This is a read-only replay of the retained revision-bound NPC page capture for
the 68 shared-page Buff infliction scope gaps. It does not fetch Wiki pages,
write standardized data, run landing/maint/relation/projection, change Redis
or scheduler state, create an authorization packet, or write a database.

The evidence builder is
`pipelines/fetch/buff-npc-variant-empty-scope-evidence.mjs`. It binds each
candidate to the target stable NPC ID and `internalName`, requested/resolved
page, page ID, revision ID and timestamp, raw-byte SHA-256, and a complete
parsed target infobox field map. Each row also carries the frozen capture
manifest SHA-256. A row is emitted only when the target has no `debuff*` field.
Positive debuff fields belonging to another infobox remain page-wide
diagnostics and are never copied to the target.

## Frozen Inputs

- Raw capture manifest:
  `.local/tmp/buff-npc-infliction-capture-20261001-v6-derived3/pages/capture.json`
  — SHA-256
  `sha256:70a243c593efd8429de230bc8fe394a3a39aafc5ae858656b787f7f9dee6676b`.
  It contains 511 target descriptors and 443 unique raw pages, with
  `databaseWrites=false` and completed status.
- Target manifest:
  `.local/tmp/buff-npc-infliction-capture-20261001-v6-derived3/targets.json`
  — SHA-256
  `sha256:61c3e5e98b333731fb95d0dcf2f3a19c9e9a7bee6c8648a5be1a94f07389c570`.
- Verified NPC evidence:
  `.local/tmp/buff-npc-infliction-verified-20261003-v7.json` — SHA-256
  `sha256:813ce0fb049bf5c1cbbd5d412c1c7e951cb87ae211588278ac4c9af3c1ebadd3`.
- Scope classification:
  `.local/tmp/buff-npc-infliction-scope-gap-classification-20261003-v2.json`
  — SHA-256
  `sha256:0c5cb51838426d626e9312ee352fb571c21983212a43ab5cf2b3108cb104d9b5`.
- Partial replay:
  `.local/tmp/buff-partial-contract-replay-20261003-v20.json` — SHA-256
  `sha256:bb515aca5c2cabb07d453f7a876942855d2128ab874e62081cccba78d4a7698f`.

The reproducible driver is
`.local/tmp/build-buff-npc-variant-empty-scope-evidence-20261005.mjs`.

## Result

The private report is
`.local/tmp/buff-npc-variant-empty-scope-evidence-20261005.json`. The file
SHA-256 is
`sha256:3866b8902cca2122afd67cff010b31f5d4fbcd67bd1a4c20120e4cd9b16e3108`.
The builder payload hash printed by the driver is
`sha256:f7c909880413fa51fd7031c67cabb888578c770d517fe9798f3e2961cf0fc9b1`.

- Gaps inspected: `68`.
- Independently complete empty rows: `67`.
- Rows rejected and left `unknown`: `1`.
- Target rows with a promoted positive fact: `0`.
- Target rows with a non-empty `debuffFieldNames` list: `0`.
- `databaseWrites=false`, `networkRequests=0`, `executable=false`,
  `applyAllowed=false`.

The single rejected row is stable NPC `125` (`Retinazer`). The frozen `The
Twins` revision contains three infobox blocks with `auto=125`; selecting one
would be ambiguous, so the builder records `duplicate-target-infobox` and the
scope contract preserves the active baseline. This is a deliberate fail-closed
outcome, not an inference of an empty relation.

Page-wide positive debuff owners are retained as diagnostics on every accepted
row. They are not assigned to a target variant with a different stable ID.

## Contract Replay

The 67 accepted rows were passed to
`buildBuffNpcVariantScopeContract`. The replay reports:

- `67` `variant-owned-complete-empty` rows;
- `1` `unknown` row (`125`), with `preserveBaseline=true`;
- `0` `variant-owned-positive` rows;
- `executable=false`, `applyAllowed=false`, `databaseWrites=false`;
- Buff IDs `389–400` remain `missing-baseline` with no insert candidate.

Canonical landing, maint, relation, projection, scheduler, and crawler writes
remain blocked. A future source refresh may resolve NPC `125` only with an
unambiguous exhaustive identity-bound page contract and independent owner
authorization.

## Validation

The focused evidence and scope-contract tests passed `12/12`. The driver was
syntax-checked with `node --check`; broader Buff/NPC/parser/relation tests and
`git diff --check` are recorded in the active devlog after this audit update.
