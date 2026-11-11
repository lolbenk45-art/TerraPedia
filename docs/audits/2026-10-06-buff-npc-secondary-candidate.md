# Buff NPC Secondary Candidate Audit - 2026-10-06

## Scope

This is a read-only candidate for the deferred NPC-Buff immunity lane after
the Buff `389-400` zero-baseline publication. It considers only the exact new
Buff IDs `389-400`, uses the revision-bound identity lineage artifact, and
preserves the existing relation snapshot. It does not create an authorization
packet, consume a permit, acquire a write fence, or write a database row.

## Evidence

- Candidate: `.local/tmp/buff-npc-secondary-candidate-20261006-v1.json`
- Candidate SHA-256: `sha256:6c51c7be7b2c76a3d40ef01d1e15dbaa1659ea1252356f3003518340ba75d91e`
- Identity lineage: `.local/tmp/buff-secondary-identity-lineage-audit-20261005-v1.json`
- Candidate input lineage SHA-256: `sha256:4282ef4723d06812867918458ef2bc7793d3a944294f66156be0ce578e6d9a99`
- MySQL server: `b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`

The candidate was derived in one `START TRANSACTION READ ONLY` transaction
from the current `maint_buffs` rows for `389-400`, all active relation
`npc_buff_relations` rows, and the frozen lineage facts. The transaction was
rolled back after the snapshot was read.

## Result

- Existing active NPC-Buff rows: `1290`
- Proposed insert-only rows: `259`
- Deferred display-only facts: `114`
- Candidate after-set rows: `1549`
- Proposed relation type: `immune`
- Deletes: `0`
- Updates: `0`
- Database writes: `false`
- Executable/applyAllowed: `false/false`

The candidate uses only facts classified as `resolved-maint-source-id` with a
stable NPC source ID matching the maint identity. It retains all 114
`display-only-npc-source-id-missing` facts as deferred evidence. No display name
was promoted to a source ID.

The 259 candidate rows are distributed as 37 each for Buffs `389-394` and
`396`. Buff `395` and Buffs `397-400` remain deferred because their retained
immunity facts have no stable NPC source IDs in the current lineage artifact.

## Validation

- `node --test pipelines/relation/buff-npc-secondary-candidate.test.mjs` - `3/3`
- Candidate generation completed from SELECT-only MySQL reads.
- Existing relation baseline was `1290` rows; no target-scope row was overwritten.
- `git diff --check` and syntax checks are required before any future packet or
  apply work.

## Next Gate

This artifact is not an authorization to apply. A future write would require a
separate governed additive NPC-Buff operation with exact ownership, fresh
source/maint/relation snapshots, a new decision identity, packet, permit,
fences, and independent after-set readback. The Item `1340` spelling drift is a
separate disposition and is not changed by this candidate.

## Apply Follow-up

The v1 candidate was retained as historical evidence. Before the approved
apply, one existing `record_key` differed from the live relation snapshot, so
the candidate was refreshed from a SELECT-only current baseline as
`.local/tmp/buff-npc-secondary-candidate-20261006-v3.json`.

The v3 candidate normalized source revision timestamps to MySQL `DATETIME`,
retained the same `259` promotable and `114` deferred counts, and was bound to
the separate `canonical-buff-npc-secondary-apply` operation. The apply audit is
`docs/audits/2026-10-06-buff-npc-secondary-apply.md`.
