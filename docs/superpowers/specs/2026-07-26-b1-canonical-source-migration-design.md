# B1 Canonical Source Migration Design

Status: boundary-review repair complete; awaiting user approval before implementation planning.

## Context

The crawler automated-ingestion readiness branch passes its focused Node, Java, admin, T0, and T1 acceptance gates. The repository-wide quality gate still stops on four domain panels representing seven expired B1 exemption references. Those seven references resolve to four physical compatibility inputs:

- `data/generated/recipe-material-reference.json`
- `data/generated/recipe-group-overrides.json`
- `data/generated/item-group-overrides.json`
- `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json`

The first three files are active Any Item Group sources. The fourth registered NPC bridge path is absent from the current worktree. It is not a harmless path drift: `source-dataset-locator.mjs` currently uses that bridge as the only `npcs_raw` landing input, and the surviving base standardized NPC file does not contain crawler enrichment such as `wikiCrawler.buffInflictions`. Extending the expired deadline would hide the problem and is not an acceptable repair.

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

- Design, implementation-plan authoring, and T0/T1 work do not activate L1, L2, the scheduler, or any real crawler operation. The later T2 checkpoint may activate only the exact new L1 capability after separate System Owner authorization.
- Do not run a formal crawler, import, backfill, apply, or database mutation as part of design or implementation-plan authoring.
- Do not delete the compatibility JSON paths in this migration.
- Do not redesign recipes, shimmer transforms, NPC shop/loot semantics, or the V2 attempt engine outside the source migration boundary.
- Do not introduce a second NPC canonical model.

## Decision

Use the complete three-layer canonical approach:

```text
source evidence / admin-approved immutable change
  -> terria_v1_local.source_dataset_landings
  -> terria_v1_maint canonical maintenance rows
  -> terria_v1_relation resolved rows and projections
  -> terria_v1_local runtime rows
  -> read-only compatibility exports
```

The user explicitly chose to retain the compatibility files after cutover. They are outputs and evidence, never runtime or administrative write authorities.

### Migration states

Migration state is explicit and monotonic:

| State | Meaning | B1 status |
| --- | --- | --- |
| `DESIGN_APPROVED` | This design is accepted; no implementation or data mutation is implied | Active and blocking after expiry |
| `CODE_READY` | Schema, parsers, consumers, reports, and guards pass without formal writes | Active |
| `T1_VERIFIED` | The complete chain passes in `terria_v1_automation_acceptance_<runKey>_*` | Active |
| `T2_CUTOVER_VERIFIED` | Separately authorized formal schema/import/cutover and real read-only runtime smoke pass | Eligible for closure |
| `B1_CLOSED` | Positive canonical readiness replaces every exemption check and the full gate passes | Closed |

`CODE_READY` or `T1_VERIFIED` cannot remove, downgrade, or suppress an expired B1 blocker. Formal migration is not authorized by reaching either state.

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
| `source_group` | Source-backed rows bootstrapped from `item-group-overrides.json` or future wiki/shimmer evidence | 300 | Generated cross-domain or shimmer groups |
| `central_override` | System Owner-approved admin group change | 400 | Manual canonical override |

`source_group` and `central_override` may not win a normalized recipe identity or alias collision against a recipe reference or recipe override row. Such a collision is blocking. Within an allowed non-recipe identity, an approved `central_override` wins over `source_group`; deleting that manual override reveals the source-backed group again. Blocked groups remain auditable canonical rows with `status = 'BLOCKED'`; they are never projected into runtime tables.

## Any Item Group Data Model

### Landing

Reuse `terria_v1_local.source_dataset_landings` and add `item_groups_raw` to the accepted dataset type catalog. Bootstrap and steady-state inputs are different contracts.

The current three files may be read exactly once as a frozen, content-addressed bootstrap bundle. Its manifest records `artifact_role = 'bootstrap_input'`, the three hashes, repository commit, parser version, and import run key. A bootstrap hash cannot be accepted twice or become current again after cutover.

Bootstrap classification is deterministic: recipe reference rows become `recipe_reference`, recipe override rows become `recipe_override`, and source-backed/generated rows from the central item-group file become `source_group`. A row that claims an admin/manual source without an immutable Owner approval is blocked rather than promoted to `central_override`.

Steady-state producers do not write databases and do not re-import compatibility paths. They emit content-addressed immutable payloads under the canonical input artifact store with `artifact_role = 'source_evidence'`. The preview operation validates those artifacts and freezes the landing plus downstream diff; only the approved apply writes it:

- recipe reference generation emits a parsed source-backed group evidence payload;
- recipe override and central override proposals emit an immutable proposed-change payload that is not source evidence until exact-bundle Owner approval;
- shimmer-derived item groups emit accepted shimmer/source evidence.

The canonical input artifact store is distinct from all four compatibility paths. Artifact creation is filesystem-only L0 work; landing insertion is part of the `item-group-canonical-apply` frozen database diff. No generator or exporter receives database writer credentials.

Each source receives an independent current record keyed by:

```text
(dataset_type='item_groups_raw', provider, source_key, source_page, is_current)
```

The stable `source_key` values identify the producer, not the compatibility filename:

- `wiki.recipe_material_groups`
- `admin.recipe_group_overrides`
- `admin.item_group_overrides`
- `wiki.shimmer_item_groups`

Extend `source_dataset_landings` with required `artifact_role`, `producer_id`, `producer_version`, `producer_run_key`, and `bootstrap_manifest_hash` fields for these new dataset types. Existing dataset types receive explicit compatibility defaults during migration; no nullable/unknown role is accepted for the new group or NPC datasets.

The current unique key ending in `is_current` permits only one archived row and the current importer deletes older archived rows before rotation. Replace it with a nullable generated `current_slot` (`1` for current, `NULL` for history) and a unique key on `(dataset_type, provider, source_key, source_page, current_slot)`. Multiple historical rows are then legal while only one current row is allowed. New group and NPC dataset types never call the archived-row deletion path. Historical GC is a separate manual/Owner-governed operation that may delete only rows outside the configured retention window and unreferenced by maint rows, immutable bundles, decisions, evidence sets, or audits.

The landing row retains the complete payload, content hash, source locator, timestamps, provider, parse status, producer identity, artifact role, and current/history state. `artifact_role = 'compat_export'` is always rejected by landing import. A malformed payload, unsupported schema version, producer/source-key mismatch, repeated bootstrap hash, or compatibility-export payload is blocking and cannot replace the current accepted row.

### Maint tables

Add these tables to `terria_v1_maint`:

| Table | Ownership and logical key |
| --- | --- |
| `maint_item_groups` | One source-layer group fact per `(canonical_key, source_layer, source_key)` |
| `maint_item_group_members` | Ordered source members per `(group_record_key, member_key)` |
| `maint_item_group_aliases` | Source aliases per `(group_record_key, normalized_alias)` |

`maint_item_groups` requires: `record_key`, `canonical_key`, canonical/display names, normalized domains JSON, source layer and priority, source provider/key/page/locator, source revision, landing id/hash, status, block reason, source metadata JSON, canonical version, timestamps, and soft-delete state.

`maint_item_group_members` requires: `record_key`, `group_record_key`, source item id, internal/name/name-zh values, member key, sort order, source metadata, and resolution hint. Image values from compatibility JSON are evidence only and must not become item image authority.

`maint_item_group_aliases` requires: `record_key`, `group_record_key`, alias text, normalized alias, alias language when known, and sort order.

Alias rows include canonical name, English display name, Chinese display name, and explicit aliases with an `alias_kind`; they are not limited to the JSON `aliases` array. This preserves current lookup and collision behavior.

Maint rows retain separate source contributions. Duplicate canonical keys are therefore visible and auditable instead of being destroyed during ingestion.

### Relation tables

Add these tables to `terria_v1_relation`:

| Table | Ownership and logical key |
| --- | --- |
| `relation_item_groups` | One resolved group per `(consumer_scope, canonical_key)` |
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

Consumer scopes preserve current behavior instead of forcing one global winner:

| Consumer scope | Effective sources | Required parity |
| --- | --- | --- |
| `admin_item_group` | reference -> recipe override -> source group -> central override | `AdminItemGroupController` current merged output |
| `admin_recipe_group` | reference -> recipe override | `AdminRecipeGroupController` current output |
| `recipe_tree` | reference -> recipe override; non-colliding recipe-domain source/manual groups appended | `RecipeTreeServiceImpl` current alias lookup |
| `recipe_expansion` | recipe reference only | current `buildRecipeGroupExpansions` output |
| `npc_shop` | source-backed groups explicitly referenced by NPC shop evidence | current NPC shop group interpretation |
| `shimmer` | source-backed groups explicitly referenced by shimmer evidence | current shimmer group interpretation |

Changing a scope's effective-source rule is a separate semantic migration and is outside this B1 source move. Shadow acceptance compares each scope independently.

### Local runtime tables

Add these tables to `terria_v1_local`:

| Table | Ownership and logical key |
| --- | --- |
| `item_groups` | Active runtime group per `(consumer_scope, canonical_key)` |
| `item_group_members` | Runtime members per `(group_id, item_id)` |
| `item_group_aliases` | Runtime alias per `(consumer_scope, normalized_alias)` |
| `item_group_projection_state` | Published snapshot per `consumer_scope` |

Only active, non-blocked, fully resolved relation rows are materialized. Runtime members reference local canonical items by database identity; compatibility names remain display and trace fields, not lookup authority.

The local projection carries relation record key, source content hash, canonical version, and materialized timestamp. `item_group_projection_state` requires consumer scope, canonical snapshot hash/version, relation run key, group/member/alias counts, publication status, and published timestamp. Runtime rows and their `PUBLISHED` state transition commit in the same local transaction, so API responses and acceptance audits can prove which complete snapshot they expose.

### DDL and volume invariants

- Every table has an immutable `record_key` unique key; child tables have an indexed parent key and a unique logical key matching the tables above.
- Maint and relation schemas use record keys for cross-database lineage and do not create cross-database foreign keys. Same-database child foreign keys are restrictive; soft-delete/current rotation happens parent-scope first and never cascades an unbounded physical delete.
- Canonical, alias, member, source, and consumer-scope keys use one shared normalization library and byte-length validation before SQL. Truncation is forbidden.
- Group ingestion rejects a source payload over 16 MiB, more than 512 groups, more than 4,096 members or 256 aliases in one group, or more than 100,000 members total. Current bootstrap evidence must be measured and recorded below those caps before import.
- NPC base ingestion rejects a payload over 16 MiB. NPC crawler-fact ingestion rejects a single fact over 2 MiB, more than 2,048 facts in one run, or more than 64 MiB total accepted crawler-fact payload per run.
- Diff policy applies both absolute and percentage caps to inserted, updated, soft-disabled, unresolved, ambiguous, and rejected rows. A cap breach cannot be approved by ordinary ADMIN and remains an exact-bundle Owner L1 decision.
- Counts, byte sizes, and cap decisions are persisted in preview evidence before any write. Unknown or non-finite counts fail closed.

## Consumer Cutover

Introduce one backend item-group repository/service boundary. The following consumers switch to it:

- `AdminItemGroupController`
- `AdminRecipeGroupController`
- `RecipeTreeServiceImpl`
- recipe group expansion and maint-to-relation sync
- Any Item Group source audit and domain-readiness panels
- admin item-group pages and their delete/edit capability decisions

Controllers no longer read or overwrite files. Read endpoints remain available to authenticated `ADMIN` users. Create, update, and delete endpoints no longer apply canonical changes directly:

1. An authenticated `ADMIN` submits a proposed change.
2. The backend validates it, freezes the exact diff and source evidence into an immutable apply bundle, and returns `PENDING_OWNER_APPROVAL` without writing group landing/maint/relation/runtime rows.
3. The fixed System Owner reauthenticates and approves that exact bundle once.
4. A separately onboarded `item-group-canonical-apply` L1 capability executes the existing same-server transaction or cross-server staged protocol.
5. Post-commit relation/local and API visibility checks complete before the canonical run is marked completed.

The proposal/audit write uses the existing immutable automation bundle, decision, approval, and run tables; it does not introduce an ungoverned group writer. Add the symmetric `item-group-canonical-preview` / `item-group-canonical-apply` pair to the V2 capability manifest and backend registry. Both operations start at `L0 + DISABLED`; the apply operation cannot execute until its independent Owner activation. Existing ADMIN authentication is preserved for proposal authoring, not promoted into formal three-database write authority.

Backend caches are keyed by the published snapshot hash, not a time-only TTL. Each read checks the lightweight `item_group_projection_state` for its consumer scope before reusing cached content. A changed, missing, non-published, or count-mismatched state invalidates the cache and fails closed rather than serving a mixed snapshot. Post-commit verification checks `/admin/item-groups`, `/admin/recipe-groups`, and representative `/public/items/{id}/recipe-tree` responses against the same published hash.

During migration, shadow comparison may read both DB and JSON. The JSON result is never allowed to silently fill a missing DB result after B1 closure. A mismatch blocks cutover and emits a report containing group, alias, member, domain, source, and blocked-state differences.

## Compatibility Export Contract

The three group files remain tracked compatibility artifacts.

- Group, member, alias, domain, source, and blocked-group sections are rendered deterministically from accepted canonical state.
- Stable ordering and canonical JSON serialization make identical state produce identical hashes.
- `recipe-material-reference.json` fields outside the group contract, including supplemental recipe evidence and source-page snapshots, remain sourced from their accepted landing/generator evidence and are preserved by the exporter.
- Export is atomic through temporary-file write plus rename.
- Export runs as a dedicated idempotent `item_group_compat_export` artifact job in one designated writable workspace. It is never executed inside an HTTP request or by every backend instance.
- A canonical commit records export freshness as pending. The admin response reports canonical commit status and export freshness separately.
- Export failure does not make an already committed canonical write appear failed or invite a duplicate apply. It marks only the export job failed/stale, prevents publication of a partial file, and raises an operator-visible retry action.
- Exported roots carry `artifactRole = 'compat_export'`, canonical snapshot hash, export run key, and exporter version. Landing import rejects that role.
- No runtime or admin consumer may treat export absence as permission to reconstruct or write canonical rows.

## NPC Bridge Repair

The missing bridge cannot be replaced by `data/standardized/npcs.standardized.json`: that base file has no crawler enrichment, and the current landing locator reads only the bridge for `npcs_raw`. Replace the bridge input with two independently traceable landing datasets:

```text
data/standardized/npcs.standardized.json
  -> source_dataset_landings(dataset_type='npcs_base_raw')
  -> terria_v1_maint.maint_npcs
  -> terria_v1_relation.relation_npcs
  -> terria_v1_relation.projection_npcs
  -> terria_v1_local.npcs

crawler normalized record + matching audit record
  -> source_dataset_landings(dataset_type='npc_crawler_facts_raw')
  -> terria_v1_maint.maint_npc_crawler_facts
  -> terria_v1_maint.maint_item_sources / relation processors
  -> NPC-Buff / NPC shop / NPC loot relation and local targets
```

`npcs_base_raw` has one current descriptor for the base standardized dataset. `npc_crawler_facts_raw` has one descriptor per crawler entity/page/revision and requires both normalized payload and passing audit identity. Managed URLs or a normalized record without its matching audit cannot become current.

Base standardized and crawler normalized/audit producers emit filesystem-only, content-addressed `source_evidence` artifacts. Add a symmetric `npc-crawler-facts-preview` / `npc-crawler-facts-apply` pair to validate, freeze, and apply the base landing, crawler-fact landing, maint, relation, and local diff. Neither producer receives database writer credentials, and the existing loot-only apply capability is not reused outside its declared ownership.

Historical `npcs_raw` rows sourced from the bridge remain immutable history and are rotated out of current status during the authorized migration. They are never relabeled as `npcs_base_raw` or `npc_crawler_facts_raw` because that would falsify their source identity.

Add `terria_v1_maint.maint_npc_crawler_facts` with logical key `(npc_identity_key, source_page, source_revision_timestamp)`. Required fields are: `record_key`, NPC source id/internal name/name hints, match status, normalized source page, revision/fetch/parse timestamps, landing id/key/hash, crawler audit hash/status, buff-infliction facts JSON, shop facts JSON, loot facts JSON, source metadata JSON, raw evidence JSON, review status, timestamps, and soft-delete state. Match states are `MATCHED`, `UNMATCHED`, `AMBIGUOUS`, and `REJECTED`; only `MATCHED` facts may feed relations.

NPC base identity and crawler facts remain separate ownership surfaces. The crawler facts processor may create only registered `maint_item_sources` fields and the listed NPC relation rows; it cannot overwrite base NPC identity, stats, names, images, or flags.

Existing downstream targets remain:

- `terria_v1_relation.npc_buff_relations`
- `terria_v1_relation.item_npc_shop_relations`
- `terria_v1_relation.item_npc_loot_relations`
- `terria_v1_local.npc_buff_relations`
- `terria_v1_local.npc_shop_entries`
- `terria_v1_local.npc_shop_conditions`
- `terria_v1_local.npc_loot_entries`

Scripts that currently default to the missing bridge path must require an explicit accepted landing/maint source descriptor. They fail with a concise missing-source error rather than silently switching to the base standardized file. NPC coverage compares base landing, crawler-fact landing, maint facts, relation, projection, and local identities and hashes, including positive buff/shop/loot samples.

The bridge path may be regenerated by a dedicated compatibility exporter that joins accepted `maint_npcs` and `maint_npc_crawler_facts`. Its root is marked `artifactRole = 'compat_export'`; it cannot be ingested as `npcs_base_raw` or `npc_crawler_facts_raw`, and no canonical or automated consumer may require it.

Together, the two new preview/apply pairs deliberately expand the locked V2 capability catalog from 19 to 23 operations. The manifest count, exact-ID contract, progress ownership, preview/apply symmetry, disabled defaults, backend registry, admin overview, and ownership tests change atomically. All four new operations start at `L0 + DISABLED`; neither apply shares an approval with the other.

## Write Ownership And Safety

The new tables and landing fields must be added to the authoritative local Flyway, maint schema, relation/projection schema catalogs, relation table catalog, and `tableOwnershipMatrix`. Group ingestion owns only the group tables listed above. NPC crawler-fact ingestion owns only `maint_npc_crawler_facts` and the already registered crawler-owned fields/scopes of `maint_item_sources` and NPC relation targets. Neither capability can mutate item identity, NPC base identity, or image ownership tables.

Writes serialize on physical ownership, not only domain name:

- group source refresh and manual override apply lock the affected normalized canonical keys plus all group projection-state scopes;
- NPC crawler-fact apply locks affected NPC identity keys/source pages and intersects those predicates with Town NPC, NPC loot, NPC-Buff, shop, and loot owners of shared tables;
- any overlapping `maint_item_sources`, `npc_buff_relations`, `item_npc_shop_relations`, `item_npc_loot_relations`, or local NPC parent scope blocks the later run before snapshot/apply;
- compatibility export locks each exact artifact path and snapshot hash, but never acquires a database writer lock;
- unknown or non-intersectable predicates are treated as overlapping and fail closed.

All automated apply paths retain these boundaries:

- T0 writes only to `terria_v1_automation_test_<runKey>_{local,maint,relation}`.
- T1 writes only to `terria_v1_automation_acceptance_<runKey>_{local,maint,relation}`.
- Any reference to formal `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation` during test/acceptance hard-stops.
- Formal schema migration and initial canonical import require a separate operation-level authorization.
- Same-server targets use one physical connection and one transaction.
- Cross-server targets use the existing staged protocol, immutable bundle, mutation generation, snapshot verification, and circuit-break behavior.
- Unknown columns, tables, source layers, dataset types, predicates, or ownership scopes fail closed.
- No hard delete is required. Source rows and runtime projections use bounded soft-delete/current-state transitions.

## Migration Sequence

1. Add schema/catalog/ownership contracts, landing artifact-role fields, and isolated schema tests.
2. Add pure group parsers and deterministic canonical key/member/alias normalization tests.
3. Add immutable group bootstrap and steady-state landing descriptors; reject compatibility-export feedback.
4. Add group maint ingestion, consumer-scoped relation resolution, and local projection.
5. Add `npcs_base_raw`, `npc_crawler_facts_raw`, `maint_npc_crawler_facts`, and their guarded processors.
6. Add backend repositories and DB shadow readers while JSON remains the live source.
7. Add ADMIN proposal submission plus the group and NPC canonical preview/apply pairs; expand the locked capability catalog from 19 to 23 with all four operations at `L0 + DISABLED`.
8. Add the independent deterministic compatibility export jobs.
9. Add positive canonical readiness reports and the legacy-to-canonical source contract registry.
10. Reach `CODE_READY` through focused tests and consumer scans without formal writes.
11. Run the complete chain in isolated T1 databases and reach `T1_VERIFIED`.
12. Stop at three independent checkpoints: first obtain authorization bound to the exact formal DDL and three database fingerprints; after schema verification, obtain one System Owner approval bound to the frozen item-group bundle and another approval bound to the frozen NPC crawler-facts bundle.
13. On formal databases, apply the frozen bootstrap once, run consumer-scoped shadow comparison, cut over DB reads, disable JSON fallback, restart the local stack through the standard lifecycle scripts, and run real read-only API/runtime smoke.
14. Reach `T2_CUTOVER_VERIFIED`, atomically change all four source contracts from `b1` to `canonical`, and regenerate the positive readiness reports.
15. Rerun the complete quality gate from the beginning; only a passing gate permits `B1_CLOSED`.

Steps 1-11 do not authorize any formal database mutation. All three authorizations in step 12 are hard checkpoints and are not interchangeable. If DDL succeeds but either data apply fails, the unused new tables may remain after schema verification, but pre-cutover readers remain unchanged, no fallback is disabled, and B1 remains active. Any data/cutover failure in steps 12-14 rolls back or circuit-breaks under the existing latest-writer rules.

## Error Handling

- Invalid JSON, unsupported schema, missing canonical key, invalid member identity, or missing source lineage blocks ingestion before database mutation.
- Duplicate members within a source row are normalized deterministically and reported; conflicting identities are blocking.
- Transaction failure rolls back the active same-server transaction.
- Cross-server partial failure follows staged compensation and enters `CIRCUIT_BROKEN` when exact restoration cannot be proven.
- Post-commit API/cache mismatch requires compensation when safe; otherwise it blocks further writes.
- Compatibility export failure never publishes a partial file.
- A compatibility export presented to landing fails before current-row rotation or transaction start.
- Shadow mismatch identifies the exact group/member/alias field and prevents cutover.
- A missing NPC source descriptor fails before opening a write transaction.
- A canonical readiness report with missing, stale, malformed, zero-check, non-T2, or hash-mismatched evidence is blocked.

## Testing And Acceptance

Implementation follows test-driven development. Required evidence includes:

1. Node unit tests for parsing, canonical keys, precedence, alias collision, member resolution, blocked references, export stability, and missing NPC source behavior.
2. Schema and ownership contract tests covering every new table, column owner, logical predicate, and database role.
3. Java repository/service/controller tests proving no direct file access, preserved read behavior, pending-Owner proposal responses, DB-backed recipe-tree resolution, and fail-closed errors.
4. Admin contract tests proving edit/delete capabilities come from backend data rather than file paths and ordinary ADMIN cannot apply a proposal.
5. T0 and T1 isolated three-database acceptance using their distinct required prefixes for rollback, commit, verification, export, and restoration.
6. Consumer-scoped zero-diff shadow reports covering identity, names, domains, aliases, members, source metadata, blocked state, and recipe expansion rows.
7. NPC coverage across base landing, crawler-fact landing, maint facts, relation, projection, and local rows, including positive NPC-Buff/shop/loot samples.
8. Targeted direct-consumer scans proving the four compatibility paths remain only in bootstrap migration code, exporters, explicit compatibility tests, and documentation.
9. Contract tests proving ADMIN cannot apply, each Owner approval is exact-bundle/one-time/non-shareable, the capability registry contains exactly the approved 23 operations, and both new preview/apply pairs start disabled.
10. Feedback-loop tests proving exported artifacts cannot become landing current rows.
11. Positive canonical readiness reports against T2 using read-only credentials after separately authorized cutover.
12. `bash ./scripts/dev/quality-gate.sh` passing from the beginning after the source-contract transition.

The existing audit commands may be evolved to query canonical evidence, but their safety properties remain read-only:

```bash
node scripts/data/audit/audit-any-item-group-sources.mjs
node scripts/data/crawler/src/cli.mjs coverage-audit --domain=npc
```

## B1 Closure Criteria

Replace the current path-only matcher with `scripts/data/audit/canonical-source-contract-registry.mjs`. Each of the four legacy input identities remains permanently represented with exactly one mode:

- `mode = 'b1'`: validate the boundary registration and deadline;
- `mode = 'canonical'`: validate a named positive canonical readiness report and its T2 cutover identity.

The seven domain references point to those four contracts instead of duplicating physical migration work. A domain with an expected contract count of zero, a missing contract, an unknown mode, or a missing readiness report is blocked.

Two read-only positive reports are required:

| Report path | Required evidence |
| --- | --- |
| `reports/canonical-migration/canonical-item-group-readiness.json` | formal schema/version; landing/maint/relation/local counts and hashes; per-consumer shadow parity; zero runtime/admin direct reads; JSON fallback disabled; API snapshot hash; export freshness |
| `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json` | formal base and crawler-fact landing freshness; maint match counts; NPC-Buff/shop/loot relation and local hashes; zero bridge-path reads outside explicit bootstrap/export compatibility code; positive API/runtime samples |

The reports declare `requiresDatabase: true`, `writesDatabase: false`, exact formal database roles, generation time, source snapshot hashes, code commit, and cutover run/decision identity. They must be generated after the exact cutover and be no older than 24 hours when the closure gate runs. Fixture or T1 reports can prove `CODE_READY`/`T1_VERIFIED`, but cannot satisfy `mode = 'canonical'`.

Add both reports to the domain acceptance report manifest, freshness audit, manual-only refresh plan, backend acceptance DTO/API, admin acceptance view, and `quality-gate.sh`. The refresh plan displays the read-only generation commands but never executes them. Missing, malformed, stale, unknown-risk, database-writing, or non-T2 evidence is blocking. UI/API consumers render the backend-owned report state and do not derive freshness independently.

The B1 rows may be replaced by canonical migration records in `docs/audits/canonical-migration-boundary.md` only when all conditions are true:

- canonical schema, ownership, and source lineage tests pass;
- isolated import and three-database acceptance pass;
- shadow comparison has no unexplained difference;
- all runtime/admin/relation consumers use canonical repositories;
- JSON fallback is disabled;
- compatibility export is deterministic and one-way;
- NPC bridge defaults no longer point to the absent path;
- group audit has no blocked consumer reference;
- formal schema/import/apply has recorded operation-level authorization, exact-bundle identity, and verification evidence;
- real read-only backend/API smoke proves non-empty canonical group and NPC crawler-fact consumption;
- both positive readiness reports are fresh and passing against the exact T2 cutover;
- the complete repository quality gate passes.

The transition from `b1` to `canonical` is one reviewed code/data-governance change after `T2_CUTOVER_VERIFIED`. It never removes the expected source contract and never treats zero checks as pass.

Replacing the B1 rows with canonical migration records changes governance classification to the landing/maint/relation/local chain. It does not authorize any additional L1/L2 promotion, scheduler activation, or crawler/apply run.

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
