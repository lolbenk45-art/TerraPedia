# B1 Canonical Source Migration Design

Status: user-approved design for closing the expired Any Item Group and NPC bridge B1 exemptions.

## Context

The crawler automated-ingestion readiness branch passes its focused Node, Java, admin, T0, and T1 acceptance gates. The repository-wide quality gate still stops on four domain panels representing seven expired B1 exemption references. Those seven references resolve to four physical compatibility inputs:

- `data/generated/recipe-material-reference.json`
- `data/generated/recipe-group-overrides.json`
- `data/generated/item-group-overrides.json`
- `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json`

The first three files are active Any Item Group sources. The fourth registered NPC bridge path is absent from the current worktree, while `data/standardized/npcs.standardized.json` and the landing/maint/relation NPC chain remain active. Extending the expired deadline would hide the problem and is not an acceptable repair.

## Goal

Close the seven B1 exemption references by moving durable ownership into the canonical database chain while preserving the four paths only as read-only compatibility artifacts where they remain useful.

Success requires all of the following:

1. Runtime and admin group consumers no longer treat the three group JSON files as source-of-truth inputs.
2. NPC maintenance, relation, and NPC-Buff paths no longer require the missing bridge path as an implicit default.
3. The canonical chain is queryable, traceable to landing evidence, deterministic, and guarded by the existing three-database write protocol.
4. Compatibility JSON generation is one-way from accepted evidence or canonical state; writing a compatibility file cannot mutate canonical state.
5. The B1 compliance panels pass because migration evidence is complete, not because a deadline was extended or a blocker was suppressed.
6. All write-capable acceptance remains confined to runKey-scoped T0/T1 isolation databases until a separate formal-write authorization is granted.

## Non-Goals

- Do not activate L1, L2, the scheduler, or any real crawler operation.
- Do not run a formal crawler, import, backfill, apply, or database mutation as part of design or implementation-plan authoring.
- Do not delete the compatibility JSON paths in this migration.
- Do not redesign recipes, shimmer transforms, NPC shop/loot semantics, or the V2 attempt engine outside the source migration boundary.
- Do not introduce a second NPC canonical model.

## Decision

Use the complete three-layer canonical approach:

```text
source evidence / generated compatibility artifact
  -> terria_v1_local.source_dataset_landings
  -> terria_v1_maint canonical maintenance rows
  -> terria_v1_relation resolved rows and projections
  -> terria_v1_local runtime rows
  -> read-only compatibility exports
```

The user explicitly chose to retain the compatibility files after cutover. They are outputs and evidence, never runtime or administrative write authorities.

### Rejected alternatives

- Local-only group tables were rejected because they bypass source lineage, relation resolution, and the existing three-database automation boundary.
- Landing-payload-only runtime reads were rejected because they preserve large JSON parsing in request paths and do not provide safe transactional admin editing, member lookup, collision checks, or relation joins.

## Current Semantics To Preserve

The current backend merge order is:

1. recipe material reference
2. recipe group override
3. central item group override

Later layers replace earlier rows by normalized group identity, subject to the existing rule that a central recipe-domain group or alias cannot shadow a recipe reference group. The migration must preserve this behavior explicitly rather than relying on file read order.

Source layers and precedence are fixed as:

| Source layer | Input | Precedence | Purpose |
| --- | --- | ---: | --- |
| `recipe_reference` | `recipe-material-reference.json` | 100 | Source-backed recipe material groups |
| `recipe_override` | `recipe-group-overrides.json` | 200 | Curated recipe corrections |
| `central_override` | `item-group-overrides.json` | 300 | Source-backed cross-domain or shimmer overrides |

`central_override` may not win a normalized recipe identity or alias collision against a recipe reference or recipe override row. Such a collision is blocking. Blocked groups remain auditable canonical rows with `status = 'BLOCKED'`; they are never projected into runtime tables.

## Any Item Group Data Model

### Landing

Reuse `terria_v1_local.source_dataset_landings` and add `item_groups_raw` to the accepted dataset type catalog. Each physical input receives an independent current record keyed by:

```text
(dataset_type='item_groups_raw', provider, source_key, source_page, is_current)
```

The three stable `source_key` values are:

- `generated.recipe_material_reference`
- `generated.recipe_group_overrides`
- `generated.item_group_overrides`

The landing row retains the complete payload, content hash, source locator, timestamps, provider, parse status, and current/history state. A malformed payload or unsupported schema version is blocking and cannot replace the current accepted row.

### Maint tables

Add these tables to `terria_v1_maint`:

| Table | Ownership and logical key |
| --- | --- |
| `maint_item_groups` | One source-layer group fact per `(canonical_key, source_layer, source_key)` |
| `maint_item_group_members` | Ordered source members per `(group_record_key, member_key)` |
| `maint_item_group_aliases` | Source aliases per `(group_record_key, normalized_alias)` |

`maint_item_groups` contains at least: `record_key`, `canonical_key`, canonical/display names, domains, source layer and priority, source provider/key/page/file, source revision, landing id/hash, status, block reason, source metadata JSON, canonical version, timestamps, and soft-delete state.

`maint_item_group_members` contains at least: `record_key`, `group_record_key`, source item id, internal/name/name-zh values, member key, sort order, source metadata, and resolution hint. Image values from compatibility JSON are evidence only and must not become item image authority.

`maint_item_group_aliases` contains at least: `record_key`, `group_record_key`, alias text, normalized alias, alias language when known, and sort order.

Maint rows retain separate source contributions. Duplicate canonical keys are therefore visible and auditable instead of being destroyed during ingestion.

### Relation tables

Add these tables to `terria_v1_relation`:

| Table | Ownership and logical key |
| --- | --- |
| `relation_item_groups` | One resolved group per `canonical_key` |
| `relation_item_group_members` | Resolved members per `(group_record_key, member_key)` |
| `relation_item_group_aliases` | Collision-checked aliases per `(group_record_key, normalized_alias)` |

The relation processor applies the fixed precedence and collision rules, resolves members against canonical item identity, and records the winning maint record plus all contributing maint record keys. Member resolution states are `RESOLVED`, `UNRESOLVED`, `AMBIGUOUS`, or `REJECTED`.

Any of these conditions blocks projection:

- a referenced blocked group;
- a central override colliding with a protected recipe group identity or alias;
- ambiguous member identity;
- duplicate normalized aliases owned by different active groups;
- an active group with no resolved members;
- source hash or landing identity missing from the winning row.

Unresolved non-referenced groups may remain warning evidence, but an unresolved group referenced by recipe, NPC shop, or shimmer is blocking.

### Local runtime tables

Add these tables to `terria_v1_local`:

| Table | Ownership and logical key |
| --- | --- |
| `item_groups` | Active runtime group per `canonical_key` |
| `item_group_members` | Runtime members per `(group_id, item_id)` |
| `item_group_aliases` | Runtime alias per normalized alias |

Only active, non-blocked, fully resolved relation rows are materialized. Runtime members reference local canonical items by database identity; compatibility names remain display and trace fields, not lookup authority.

The local projection carries relation record key, source content hash, canonical version, and materialized timestamp so API responses and acceptance audits can prove which canonical snapshot they expose.

## Consumer Cutover

Introduce one backend item-group repository/service boundary. The following consumers switch to it:

- `AdminItemGroupController`
- `AdminRecipeGroupController`
- `RecipeTreeServiceImpl`
- recipe group expansion and maint-to-relation sync
- Any Item Group source audit and domain-readiness panels
- admin item-group pages and their delete/edit capability decisions

Controllers no longer read or overwrite files. Existing admin create/update/delete behavior is preserved through a canonical command service. That service writes a frozen diff through the existing same-server transaction or cross-server staged protocol, refreshes relation/local projections, verifies post-commit visibility, and only then regenerates compatibility outputs. It preserves current admin authorization; it does not grant crawler L1/L2 authority.

During migration, shadow comparison may read both DB and JSON. The JSON result is never allowed to silently fill a missing DB result after B1 closure. A mismatch blocks cutover and emits a report containing group, alias, member, domain, source, and blocked-state differences.

## Compatibility Export Contract

The three group files remain tracked compatibility artifacts.

- Group, member, alias, domain, source, and blocked-group sections are rendered deterministically from accepted canonical state.
- Stable ordering and canonical JSON serialization make identical state produce identical hashes.
- `recipe-material-reference.json` fields outside the group contract, including supplemental recipe evidence and source-page snapshots, remain sourced from their accepted landing/generator evidence and are preserved by the exporter.
- Export is atomic through temporary-file write plus rename.
- Export failure does not roll back already committed canonical data, but it marks the run incomplete/circuit-broken and prevents publication of a partial file.
- No runtime or admin consumer may treat export absence as permission to reconstruct or write canonical rows.

## NPC Bridge Repair

The registered bridge path is absent, so this work must not fabricate a migration from a nonexistent file. NPC canonical ownership remains on the existing chain:

```text
terria_v1_local.source_dataset_landings(dataset_type='npcs_raw')
  -> terria_v1_maint.maint_npcs
  -> terria_v1_relation.relation_npcs
  -> terria_v1_relation.projection_npcs
  -> terria_v1_local.npcs
```

Existing downstream targets remain:

- `terria_v1_relation.npc_buff_relations`
- `terria_v1_relation.item_npc_shop_relations`
- `terria_v1_relation.item_npc_loot_relations`
- `terria_v1_local.npc_buff_relations`
- `terria_v1_local.npc_shop_entries`
- `terria_v1_local.npc_shop_conditions`
- `terria_v1_local.npc_loot_entries`

Scripts that currently default to the missing bridge path must require an explicit accepted source descriptor or use the current landing/maint adapter. They must fail with a concise missing-source error rather than silently switching to another file. NPC coverage compares landing, maint, relation, projection, and local identities and hashes. A compatibility bridge export may be regenerated for legacy offline consumers, but no canonical or automated path may require it.

## Write Ownership And Safety

The new tables and fields must be added to the authoritative schema catalogs and `tableOwnershipMatrix`. Group ingestion owns only the group tables listed above. It cannot mutate item identity or image ownership tables.

All automated apply paths retain these boundaries:

- T0/T1 writes only to `terria_v1_automation_test_<runKey>_*` databases.
- Any reference to formal `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation` during test/acceptance hard-stops.
- Formal schema migration and initial canonical import require a separate operation-level authorization.
- Same-server targets use one physical connection and one transaction.
- Cross-server targets use the existing staged protocol, immutable bundle, mutation generation, snapshot verification, and circuit-break behavior.
- Unknown columns, tables, source layers, dataset types, predicates, or ownership scopes fail closed.
- No hard delete is required. Source rows and runtime projections use bounded soft-delete/current-state transitions.

## Migration Sequence

1. Add schema/catalog/ownership contracts and isolated schema tests.
2. Add pure parsers and deterministic canonical key/member/alias normalization tests.
3. Add landing descriptors and maint ingestion in dry-run mode.
4. Add relation precedence, collision, blocked-group, and member-resolution processing.
5. Add local projection and backend repository reads.
6. Run an isolated one-time import from the three current group files and compare canonical output to current merged behavior.
7. Switch backend consumers to DB-primary shadow mode and require zero unexplained diff.
8. Switch runtime/admin reads and writes to canonical services; disable JSON fallback.
9. Add deterministic compatibility export and prove it cannot write back.
10. Replace missing NPC bridge defaults with explicit landing/maint source contracts and run read-only coverage.
11. Remove the four B1 registrations and their seven domain matcher entries only after direct-consumer scans and canonical acceptance pass.
12. Rerun the complete quality gate from the beginning.

Steps 1-10 are first proven in code-level and isolated T0/T1 tests. Any execution against formal databases is a separately authorized operational checkpoint and is not implied by approval of this design or its implementation plan.

## Error Handling

- Invalid JSON, unsupported schema, missing canonical key, invalid member identity, or missing source lineage blocks ingestion before database mutation.
- Duplicate members within a source row are normalized deterministically and reported; conflicting identities are blocking.
- Transaction failure rolls back the active same-server transaction.
- Cross-server partial failure follows staged compensation and enters `CIRCUIT_BROKEN` when exact restoration cannot be proven.
- Post-commit API/cache mismatch requires compensation when safe; otherwise it blocks further writes.
- Compatibility export failure never publishes a partial file.
- Shadow mismatch identifies the exact group/member/alias field and prevents cutover.
- A missing NPC source descriptor fails before opening a write transaction.

## Testing And Acceptance

Implementation follows test-driven development. Required evidence includes:

1. Node unit tests for parsing, canonical keys, precedence, alias collision, member resolution, blocked references, export stability, and missing NPC source behavior.
2. Schema and ownership contract tests covering every new table, column owner, logical predicate, and database role.
3. Java repository/service/controller tests proving no direct file access, preserved admin behavior, DB-backed recipe-tree resolution, and fail-closed errors.
4. Admin contract tests proving edit/delete capabilities come from backend data rather than file paths.
5. T0/T1 isolated three-database acceptance for rollback, commit, verification, export, and restoration.
6. A zero-diff shadow report across canonical group identity, names, domains, aliases, members, source metadata, and blocked state.
7. Read-only NPC coverage across landing, maint, relation, projection, and local rows.
8. Targeted direct-consumer scans proving the four compatibility paths remain only in generators, exporters, explicit compatibility tests, documentation, and migration tooling.
9. Updated B1 compliance reports showing no expired active exemption.
10. `bash ./scripts/dev/quality-gate.sh` passing from the beginning.

The existing audit commands may be evolved to query canonical evidence, but their safety properties remain read-only:

```bash
node scripts/data/audit/audit-any-item-group-sources.mjs
node scripts/data/crawler/src/cli.mjs coverage-audit --domain=npc
```

## B1 Closure Criteria

The B1 rows may be removed from `docs/audits/canonical-migration-boundary.md` only when all conditions are true:

- canonical schema, ownership, and source lineage tests pass;
- isolated import and three-database acceptance pass;
- shadow comparison has no unexplained difference;
- all runtime/admin/relation consumers use canonical repositories;
- JSON fallback is disabled;
- compatibility export is deterministic and one-way;
- NPC bridge defaults no longer point to the absent path;
- group audit has no blocked consumer reference;
- formal write remains either unexecuted or has its own recorded authorization and verification evidence;
- the complete repository quality gate passes.

At the same checkpoint, remove the migrated entries from `DOMAIN_INPUT_MATCHERS` in `scripts/data/audit/b1-exemption-compliance.mjs` and update its contract tests. A missing registration must continue to block any input that remains in the matcher; closure is represented by removing both the active exemption and its migrated matcher, never by teaching the audit to ignore an expired or missing record.

Removing the rows changes governance classification from B1 to the canonical landing/maint/relation/local chain. It does not authorize L1/L2 promotion, scheduler activation, or a real crawler/apply run.

## Rollback

Before runtime cutover, rollback means discarding isolated databases or reverting the unactivated code path. During an authorized formal cutover, retain the frozen pre-cutover table snapshots and current compatibility files. Rollback restores the exact latest-writer snapshot only when mutation generation and hash checks prove no later writer exists.

After B1 closure, rollback may restore the prior canonical snapshot and consumer version, but it must not silently re-enable JSON as source of truth. Re-enabling a compatibility reader requires a recorded emergency decision and reopens the B1 governance blocker.

## Documentation Impact

Implementation will update current project facts only when the canonical chain becomes real:

- `docs/project-governance/00_CURRENT_SPEC.md`
- `docs/audits/canonical-migration-boundary.md`
- `docs/audits/generated-data-consumer-map.md`
- the active crawler automated-ingestion devlog entry

This design does not itself claim that the schema, import, cutover, or formal migration has occurred.
