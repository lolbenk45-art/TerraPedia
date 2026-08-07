# Buff T1 Isolated Acceptance

## Status

`closed`

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
- Final ADMIN decision: `canonical-buff-t1-acceptance-20260808-admin-06`;
  packet hash `sha256:0b8c7c4d41d871366bee65c36aa8c9dd9579da01c91f6860ef3a6bcf1ae5458a`.
- Authorized run `npc-t1-buff-20260808-06` completed with `status=passed` and
  `cleanupPassed=true`; retained evidence is
  `reports/canonical-migration/canonical-buff-t1-acceptance.json`.
- Exact closure: 2 Buff imports, 2 maint rows, 2 relation rows, 2 projection
  rows, 11 item relations, 4 canonical inflicting-NPC relations, 0 invented
  immune relations, and 0 unresolved fixture identities.
- Full ordered immune payloads (30/26) and source evidence passed deep
  equality; normalized projection source-item/NPC identities passed exact
  semantic equality.
- Snapshot verification passed `129/129`; transaction probes were `0/1/0`.
- Independent cleanup readback: databases `0`, accounts `0`, transactions `0`,
  Redis DB 7 keys `0`, Buff processes `0`, and current permits `0`.
- Commit SHA pending in final response.

## Validation

- Buff/import/maint/relation focused Node suite: 138 passed, 1 existing
  shimmer skip, 0 failures.
- Authorization/manifest/dispatch focused Node suite: 110 passed, 0 failures.
- Backend Buff consumer tests: 48 passed, 0 failures.
- `git diff --check`: passed.

## Coordination

- Coordinator and sole task-level writer: Codex (`/root`). Owns
  `docs/devlog/current.md`, automation registration, authorization, runtime,
  evidence, and final commit.
- Implementation, review, authorization, execution, evidence, and cleanup are complete.
- Reviewers: read-only spec/code review after each implementation task; no
  file, database, Redis, authorization, or process writes.
- Tasks 1–3 share the Buff executor/test files and are serialized. Expected
  handoff is changed paths, tests/results, concerns, and next dependency.

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

Continue the parent plan with Biome T1 in a separate child. This result does
not authorize formal Buff apply.
