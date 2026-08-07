# Buff T1 Isolated Acceptance

## Status

`active`

## Goal

Execute the parent plan's bounded offline Buff T1 with exact source-item,
inflicting-NPC, full immune-NPC payload, projection-consumer, transaction, and
cleanup evidence.

## Scope

- Fixture Buffs: `ShadowFlame` and `Venom`.
- Exact expected relations: eleven source items and four inflicting NPCs after
  the existing reviewed `SandPoacher` alias resolves.
- Full ordered `immuneNpcs` payloads: 30 and 26 rows.
- Isolated local/maint/relation databases, temporary accounts, and an empty
  dedicated Redis logical DB only.
- Formal apply, Wiki/network completion, crawler, scheduler, V1 queue, Biome,
  push, merge, and worktree cleanup are out of scope.

## Current State

- Read-only audit confirmed all eleven source items and the required canonical
  inflicting-NPC targets exist in formal data.
- Existing import, maint, relation, projection, and backend consumer paths are
  reusable. The production consumer's formal relation qualifier prevents a
  safe live API redirect, so isolated readback will use the exact consumer
  projection-column contract plus focused backend tests.
- Design: `docs/superpowers/specs/2026-08-08-buff-t1-design.md`.
- Implementation plan:
  `docs/superpowers/plans/2026-08-08-buff-t1-implementation.md`.
- Plan audit repaired two Important gaps: isolated snapshot item/NPC rows must
  be cleared before exact dependency seeding, and backend consumer validation
  is pinned to the three focused Buff test classes. No critical or Important
  plan defect remains.
- Implementation and authorization have not started.

## Success Criteria

- Exact import/maint/relation/projection counts and identities pass.
- Projection readback preserves both complete immune-NPC arrays and all other
  governed Buff evidence fields.
- No unexpected unresolved entity, duplicate relation, or non-entity coercion
  passes the gate.
- Snapshot, transaction probes, evidence publication, and independent cleanup
  all pass.

## Residual Risks

- This batch proves only two Buffs and does not authorize a full or formal Buff
  apply.
- Full immune-NPC payload preservation does not create immune relations; those
  remain owned by NPC-side structured immunity evidence.

## Follow-Up

After exact cleanup and a focused commit, continue the parent plan with Biome
T1 in a separate child.
