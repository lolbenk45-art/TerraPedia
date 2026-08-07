# Biome T1 Isolated Acceptance

## Status

`active`

## Goal

Execute Batch 4 as a bounded offline two-biome acceptance against the real
local-owned Biome chain, with exact wikitext item/NPC sources, public consumer
filters, and cleanup evidence.

## Scope

- `corruption` and `crimson`, with closed counterpart relations.
- Four exact item sources and two exact NPC sources derived from fixture
  wikitext.
- Disposable three-database set, temporary accounts, a separately verified
  empty Redis DB, and a fresh ADMIN decision.
- Formal apply, Wiki fetch, scheduler, crawler, V1 queue, full Biome dataset,
  and release operations are out of scope.

## Current State

- Read-only audit confirmed 48 formal biomes, 14 biome relations, 1,204
  resources, 1,519 item-biome rows, 229 NPC-biome rows, and 991 active
  biome-wikitext item sources.
- The real consumer reads local-owned tables; no Biome relation projection
  exists. The T1 design therefore validates local collection relations instead
  of inventing a new ownership path.
- Exact dependency items and NPCs exist in formal local data.
- Audit found `BiomeServiceImpl.getBiomes()` filters active status but not
  `deleted=0`; repair and regression coverage are part of this batch.
- Design: `docs/superpowers/specs/2026-08-08-biome-t1-design.md`.

## Success Criteria

- Exact core, relation, wikitext candidate, resource, item-biome, item-source,
  and NPC-biome counts pass.
- Inactive/deleted decoys are excluded from consumer readback.
- Snapshot, transaction probes, evidence publication, and independent cleanup
  pass.

## Residual Risks

- Two fixtures do not prove all 48 biomes or authorize formal Biome apply.
- This batch preserves the current local-owned architecture and does not add a
  Biome relation projection.

## Follow-Up

After a focused commit, continue with the formal Recipe Apply design-only
batch; do not execute that apply.
