# Biome T1 Isolated Acceptance

## Status

`closed`

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
- Implementation plan:
  `docs/superpowers/plans/2026-08-08-biome-t1-implementation.md`.
- Plan audit reserved Redis DB 9 after confirming it is empty; Redis DB 8 has
  35 unrelated keys and must remain untouched. It also corrected the Crimson
  NPC display contract: `Vicious Goldfish` resolves to `CrimsonGoldfish`.
- Review repaired two consumer gaps: formal dependency seeding now requires
  active item/NPC rows, and public detail/readback filters inactive linked
  biome/item/NPC entities. Relation/resource tables have no lifecycle columns,
  so filtering occurs at their owned entity joins.
- `admin-01` and `admin-03` failed closed on credential-scope and decoy-schema
  defects; both cleaned all resources to zero. `admin-02` passed the earlier
  three-decoy contract but was superseded after review strengthened the gate.
- Final ADMIN decision `canonical-biome-t1-acceptance-20260808-admin-04` and
  run `npc-t1-biome-20260808-04` passed. Retained evidence is
  `reports/canonical-migration/canonical-biome-t1-acceptance.json`.
- Exact closure: 2 Biomes, 2 reciprocal relations, 4 resources, 4 item-biome
  rows, 4 active biome-wikitext item sources, and 2 NPC-biome rows. Six stored
  inactive/deleted decoys produced zero consumer leaks. Snapshot verification
  was `129/129`; probes were `0/1/0`.
- Independent cleanup: databases `0`, accounts `0`, Redis DB 9 keys `0`, and
  Biome/authorization processes `0`.
- Commit SHA pending in final response.

## Validation

- Focused Node suite: 205 passed, 1 existing shimmer skip, 0 failures.
- Backend Biome consumer suite: 7/7 passed.
- Read-only re-review: no remaining Critical or Important findings.
- `git diff --check`: passed.

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

Continue with the formal Recipe Apply design-only batch; do not execute that
apply without a separate plan and ADMIN authorization.
