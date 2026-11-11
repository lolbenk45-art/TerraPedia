# Buff New-ID Insert-Only Contract - 2026-10-05

## Scope

This is a read-only derivation for Buff IDs `389-400`. It combines the
revision-bound Buff page captures, complete Iteminfo semantic capture,
expanded Npcinfo evidence, and the v3 shared-page variant scope contract. It
does not create a landing row, maint row, relation row, projection row,
authorization packet, scheduler action, or database mutation.

## Inputs

- Scope contract: `.local/tmp/buff-npc-variant-scope-contract-20261005-v3.json`
  — SHA-256 `sha256:98b396fc62ec039e5c3e1bbfa7280d286356efb13bfc80bf50c8df4c38a735c2`.
  It reports 68 `variant-owned-complete-empty` rows, zero unknown rows, and the
  exact missing-baseline fence `389-400`.
- Verified NPC evidence: `.local/tmp/buff-npc-infliction-verified-20261003-v7.json`.
  The derived Buff-level evidence is restricted to IDs `389-400`; it contains
  zero positive infliction facts and is accepted only because the scope
  contract proves the remaining variant blocks complete-empty.
- Iteminfo and Buff page captures are the revision-bound inputs recorded by
  `.local/tmp/build-buff-new-id-insert-contract-20261005-v4.mjs`.

## Result

The derived diagnostic is
`.local/tmp/buff-new-id-insert-contract-diagnostic-20261005-v4.json`
with SHA-256
`sha256:89a5ad5316b4bfcfb3a20b6844c5d47237c467a40cae4b071cd5e42559b8258a`.

- `12/12` records normalize successfully.
- `12/12` source-item groups are complete.
- `12/12` inflicting-NPC groups are complete-empty with zero facts.
- `12/12` immunity groups are complete, using page evidence or the bound
  expanded Npcinfo alternate.
- All 12 partial plans replace `sourceItems`, `inflictingNpcs`, and
  `immuneNpcs`; none preserve a baseline group.
- The artifact remains `executable=false`, `applyAllowed=false`, and
  `databaseWrites=false`.

This clears the former “infliction scope unproven” source sub-gate for the new
IDs. It does not invent historical rows or authorize publication. The remaining
gates are the zero-baseline insert decision, landing-to-maint lineage, relation
and projection candidate construction, and independent owner authorization.

## Validation

The builder passed `node --check` and completed with the exact 12-ID fence. The
focused source-applicability, Buff fetch, and relation synchronization suite
passed `138/138`; no runtime or database write was performed.
