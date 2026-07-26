# B1 Canonical Source Migration Design

Status: all open decisions resolved; ready for implementation planning.

## Resolved Decisions

All decisions were taken on 2026-07-26.

| ID | Decision | Effect |
| --- | --- | --- |
| Admin approval | Manual admin group edits do **not** require System Owner approval; they commit synchronously through a registered backend writer identity | Consumer Cutover |
| D1 | **Introduce `b1_migrating`** as a third contract mode, gated on approved design + milestone evidence + a bounded re-registered deadline | Migration states, B1 Closure Criteria |
| D2 | **De-register the bridge path** and point `npcs_raw` at the tracked standardized file; the canonical NPC crawler-fact chain is deferred, not attempted here | Context, NPC Bridge Repair, Migration Sequence, B1 Closure Criteria |
| D3 | **Withdrawn** — the premise was false. The 29 override rows are not provenance-less curation but the deduplicated, id-resolved projection of the reference layer, so they do not become a source layer at all | Current Semantics To Preserve |
| D4 | **Ship Step 0 separately**, ahead of the canonical chain | Migration Sequence |

### What D2 does and does not achieve

D2 does not delete the NPC B1 debt. It makes the registration truthful.

The bridge row is retired because it registers a file that does not exist and is therefore serving as nothing. But its replacement, `data/standardized/npcs.standardized.json`, is itself a B1-tier input under the boundary document's own definition: a tracked `data/standardized/` file acting as a source ahead of canonical migration. Retiring one row and registering the real one keeps the `support.town_npc_maintenance` panel at one reference.

The panel can then pass through `b1_migrating` rather than through an absent file, which is the difference between a satisfied check and a fictional one. Closing that reference for real still requires the canonical NPC chain, which is deferred under D2 and blocked on a separately authorized crawler run.

## Context

The crawler automated-ingestion readiness branch passes its focused Node, Java, admin, T0, and T1 acceptance gates. The repository-wide quality gate still stops on four domain panels representing seven expired B1 exemption references. Those seven references resolve to four physical compatibility inputs:

- `data/generated/recipe-material-reference.json`
- `data/generated/recipe-group-overrides.json`
- `data/generated/item-group-overrides.json`
- `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json`

The first three files are active Any Item Group sources, tracked in the repository, and are the real subject of this migration.

The fourth is a different kind of problem and an earlier draft of this design mischaracterized it. The NPC bridge path is neither path drift nor data loss: it is a deliberately untracked local build artifact, and it has never been committed.

| Date | Commit | Event |
| --- | --- | --- |
| 2026-04-20 | `a743791d` chore: ignore local crawler artifacts | Added `data/generated/wiki-crawler-npc-bridge/` plus four `data/wiki-crawler/*` directories to `.gitignore`, under the `# Large local data artifacts` heading |
| 2026-04-28 | `6be7f81f` | `source-dataset-locator.mjs:170` registered that ignored path as the only `npcs_raw` landing input |
| 2026-05-03 | `2e405018` chore: add trusted data maintenance gate | `docs/audits/canonical-migration-boundary.md` registered the same ignored path as a B1 exemption input with a deadline |

`git log` reports zero commits touching the path. Every clean clone of this repository lacks the file; this is not a condition specific to the current worktree.

Ignoring it was correct. It is produced by `scripts/data/crawler/src/bridge/write-npc-bridge-data-dir.mjs`, and most of its content is a verbatim copy of already-tracked `data/standardized/` datasets (items, buffs, projectiles, armor sets, manifest) alongside the bridged NPC payload. Its own upstream, `data/standardized/npcs.standardized.json`, is tracked.

The defect is therefore the two registrations, not the missing file. Both must be corrected regardless of how the canonical NPC chain is designed. What remains true from the earlier draft is that the base standardized NPC file carries no crawler enrichment such as `wikiCrawler.buffInflictions`, so it is not a drop-in replacement for every downstream consumer; that enrichment is produced by the crawler itself (`scripts/data/crawler/src/domains/npc-parser.mjs`), with the bridge acting only as a relay.

Extending the expired deadline with no evidence would hide the problem and is not an acceptable repair. Per D1, a bounded state that requires approved design, milestone evidence, and a re-registered deadline is a different thing from an unevidenced extension, and is the accepted repair for the migration window.

## Measured Source Volumes

Measured on the current worktree. Every structural and numeric choice below is sized against these figures rather than against a hypothetical future scale.

| Input | Group rows | Max members in one group (raw / deduplicated) | Member rows (raw / deduplicated) | Explicit aliases | Bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `recipe-material-reference.json` | 33 | 38 / 23 | 265 / 153 | 0 | 4,950,220 |
| `recipe-group-overrides.json` | 29 | 19 / 19 | 112 / 112 | 0 | 33,721 |
| `item-group-overrides.json` | 1 active + 1 blocked | 10 / 10 | 10 / 10 | 2 | 3,750 |
| **total** | **63 active + 1 blocked** | **38 / 23** | **387 / 275** | **2** | |

Raw counts include a duplication artifact described below. They are recorded because caps and diff policy must be evaluated against what a parser actually receives, not against the idealized shape.

Five facts change the design:

**1. The surface is smaller than the row counts suggest.** The 63 group rows resolve to **34 distinct canonical keys**: 29 keys carry both a `recipe_reference` and a `recipe_group_overrides` row, 4 reference keys have no override, and 1 key comes from the central file. After the source-layer reduction described under Current Semantics To Preserve, the canonical model holds **34 groups and roughly 163 members**. Alias row volume is dominated not by the `aliases` arrays but by the canonical/EN/ZH display names that also become alias rows, giving roughly `34 x 3 + 2 = 104` alias rows. No alias is owned by more than one distinct canonical key, so the global alias-uniqueness rule holds against current data with zero exceptions.

**2. Group data is a rounding error inside the largest file.** `recipe-material-reference.json` decomposes as:

| Top-level key | Bytes | Share |
| --- | ---: | ---: |
| `supplementalRecipes` | 3,415,095 | 69.0% |
| `sourcePageSnapshots` | 14,569 | 0.3% |
| `groups` | **23,668** | **0.48%** |
| `recipeSourcePages` + `sourceUrls` + other | ~1,100 | <0.1% |

The remainder is JSON formatting overhead. A landing row that retains the complete file payload would store 4.95 MB to govern 23.7 KB of group data, and 3.4 MB of that is recipe data belonging to another domain. See DDL and volume invariants for the corrected payload boundary.

**3. Provenance is not uniform, and 62 of 63 group rows cannot supply group-level source fields.**

| Input | Group-level provenance | File-level provenance |
| --- | --- | --- |
| `recipe-material-reference.json` (33) | none | `sourceUrls`, `recipeSourcePages`, `sourcePageSnapshots` |
| `recipe-group-overrides.json` (29) | none | **none** — the file has only `schemaVersion`, `updatedAt`, `groups` |
| `item-group-overrides.json` (1) | full: `sourceKind`, `sourceProvider`, `sourcePage`, `sourceRevisionTimestamp`, `sourceLabel`, `sourceUrls` | `sourceProvider`, `sourceFiles` |

The 33 recipe reference groups inherit provenance from their landing row, which is coherent because their provenance genuinely is file-level. The 29 override rows have no upstream fact at any level, which was originally read as "hand-authored corrections lacking provenance". Fact 5 shows the real reason: they are derived from the reference layer, so their provenance is the reference landing row, and they do not need a source layer of their own. This resolves what was open decision D3.

**4. The duplication artifact has exactly one shape, so deduplication is fully specifiable.** Every one of the 33 reference groups contains duplicated members, and all 112 duplicate pairs have the identical form: the same `internalName` appearing twice, once with `nameZh: null` and once with `nameZh` populated. There are zero other duplicate shapes. The deduplication rule is therefore exact rather than heuristic: **collapse by `internalName`, retain the row whose `nameZh` is non-null**. A parser that deduplicates on the whole member object would keep both copies and silently double every reference group.

**5. Member identity resolution has no current backlog, and the override file is where it was already done.** Reference members carry no `itemId` at all (0 of 265); they are `internalName` + `name` + `nameZh`. Override members do carry `itemId`. Resolving all 153 distinct reference `internalName` values against `data/standardized/items.standardized.json` yields **153 unique matches, 0 unresolved, 0 ambiguous**, and 27 of the 29 override groups have exactly the reference group's deduplicated member set. The override file is therefore the deduplicated, id-resolved projection of the reference layer, computed by hand in the absence of a relation layer. See Current Semantics To Preserve for the resulting source-layer reduction.

Because current data resolves completely, any non-zero `UNRESOLVED` or `AMBIGUOUS` count at cutover is a regression rather than a known backlog, and the acceptance gate asserts exactly zero of each rather than a tolerance.

Member `image` values in all three files are local MinIO origins (`http://localhost:9000/...`). They are trace evidence only and must never become item image authority.

## Goal

Close the seven B1 exemption references by moving durable ownership into the canonical database chain while preserving the four paths only as read-only compatibility artifacts where they remain useful.

Success requires all of the following:

1. Runtime and admin group consumers no longer treat the three group JSON files as source-of-truth inputs.
2. NPC maintenance, relation, and NPC-Buff paths no longer require the untracked bridge path as an implicit default.
3. The canonical chain is queryable, deterministic, and guarded by the existing three-database write protocol. Every row is traceable: source-derived rows to landing evidence, admin-authored rows to the append-only admin audit row. No row is traceable to nothing.
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
source evidence                          admin-authored change
  -> terria_v1_local.source_dataset_landings   |
  -> terria_v1_maint canonical maintenance rows <-- (central_override layer)
  -> terria_v1_relation resolved rows and projections
  -> terria_v1_local runtime rows
  -> read-only compatibility exports
```

Source evidence enters through landing. Admin-authored changes enter at the maint layer as `central_override` rows through the registered admin writer; they are curation, not upstream fact, and inventing landing rows for them would dilute what a landing row means. Both converge before relation resolution, so precedence, collision checks, and projection are identical regardless of entry point.

The user explicitly chose to retain the compatibility files after cutover. They are outputs and evidence, never runtime or administrative write authorities.

### Migration states

Migration state is explicit and monotonic, and is tracked per chain rather than globally, because the group and NPC chains carry independent authorizations:

| State | Meaning | B1 status |
| --- | --- | --- |
| `DESIGN_APPROVED` | This design is accepted; no implementation or data mutation is implied | Active and blocking after expiry |
| `CODE_READY` | Schema, parsers, consumers, reports, and guards pass without formal writes | Active |
| `T1_VERIFIED` | The chain passes in `terria_v1_automation_acceptance_<runKey>_*` | Active |
| `T2_CUTOVER_VERIFIED` | Separately authorized formal schema/import/cutover and real read-only runtime smoke pass | That chain's contracts eligible for flip |
| `B1_CLOSED` | Every contract is `canonical` or `retired` and the full gate passes | Closed |

`CODE_READY` or `T1_VERIFIED` cannot remove, downgrade, or suppress an expired B1 blocker, and reaching either state does not authorize formal migration. What they can do, per D1, is satisfy the milestone-evidence requirement of a `b1_migrating` registration, which is a separate registration act with its own bounded deadline rather than an automatic consequence of writing code. See B1 Closure Criteria.

### Rejected alternatives

- Local-only group tables were rejected because they bypass source lineage, relation resolution, and the existing three-database automation boundary.
- Landing-payload-only runtime reads were rejected because they preserve large JSON parsing in request paths and do not provide safe transactional admin editing, member lookup, collision checks, or relation joins.

## Current Semantics To Preserve

The current backend merge order is:

1. recipe material reference
2. recipe group override
3. central item group override

Later layers replace earlier rows by normalized group identity, subject to the existing rule that a central recipe-domain group or alias cannot shadow a recipe reference group. The migration must preserve the resulting behavior explicitly rather than relying on file read order.

### Why `recipe_override` is not carried forward as a source layer

An earlier draft modeled the recipe override file as a curated correction layer at precedence 200. Measurement shows it is not a curation layer. It is the deduplicated, id-resolved projection of the reference layer, computed by hand because no relation layer existed to compute it:

- 29 of its 29 groups shadow an existing `recipe_reference` group; none introduces a new canonical key;
- 27 of those 29 have exactly the same member set as the reference group after deduplication by `internalName`;
- reference members carry no `itemId` at all (0 of 265) while override members do, so the override file is where identity resolution was already performed;
- the entire genuinely curated content is two member exclusions.

| Group | Member excluded by the override |
| --- | --- |
| Any Guide to Critter Companionship | `DontHurtCrittersBookInactive` |
| Any Guide to Environmental Preservation | `DontHurtNatureBookInactive` |

Preserving it as a source layer would permanently canonicalize a pre-canonical workaround: the chain would carry 29 maint rows whose only content is work the relation layer is defined to do. Deduplication and identity resolution move to the relation layer where they belong, and the two exclusions become explicit member rules.

This is a deliberate semantic reduction rather than a pure source move. It is in scope because the alternative is to freeze the workaround into the canonical model. Observable consumer output is unchanged except for the deduplication effect described under Shadow parity below, which is the point of the migration rather than a regression.

### Source layers

| Source layer | Input | Precedence | Purpose |
| --- | --- | ---: | --- |
| `recipe_reference` | `recipe-material-reference.json` | 100 | Source-backed recipe material groups |
| `source_group` | Source-backed rows bootstrapped from `item-group-overrides.json` or future wiki/shimmer evidence | 300 | Generated cross-domain or shimmer groups |
| `central_override` | ADMIN-authored group change committed through the registered admin group writer | 400 | Manual canonical override |

Precedence 200 is left unallocated so that existing evidence referring to the old four-layer numbering remains unambiguous.

`source_group` and `central_override` may not win a normalized recipe identity or alias collision against a recipe reference row. Such a collision is blocking. Within an allowed non-recipe identity, a `central_override` wins over `source_group`; deleting that manual override reveals the source-backed group again. Blocked groups remain auditable canonical rows with `status = 'BLOCKED'`; they are never projected into runtime tables.

### Member exclusion rules

Add `terria_v1_maint.maint_item_group_member_exclusions`, logical key `(canonical_key, member_key)`, requiring `record_key`, canonical key, member key, reason, actor, evidence reference, timestamps, and soft-delete state. It is owned by `admin_item_group_writer`, applied during relation resolution after deduplication and identity resolution, and reported in the group audit so an exclusion can never be silent.

An exclusion naming a member that the resolved group does not contain is blocking, not a no-op. Otherwise a rule that has quietly stopped matching would look healthy forever.

## Any Item Group Data Model

### Landing

Reuse `terria_v1_local.source_dataset_landings` and add `item_groups_raw` to the accepted dataset type catalog. Bootstrap and steady-state inputs are different contracts.

The current three files may be read exactly once as a frozen, content-addressed bootstrap bundle. Its manifest records `artifact_role = 'bootstrap_input'`, the three hashes, repository commit, parser version, and import run key. A bootstrap hash cannot be accepted twice or become current again after cutover.

Bootstrap classification is deterministic and driven by the row's declared `sourceKind`, not by which file it came from:

| Bootstrap input | Declared kind | Assigned source layer |
| --- | --- | --- |
| `recipe-material-reference.json` groups | (none) | `recipe_reference` |
| `item-group-overrides.json` groups | `curated_wiki_item_group` or any other source-backed kind | `source_group` |
| `item-group-overrides.json` groups | `manual_wiki_source` | `central_override` |
| `item-group-overrides.json` `blockedGroups` | `blocked_consumer_reference` | imported as canonical rows with `status = 'BLOCKED'`, never projected |
| `recipe-group-overrides.json` groups | (none) | **no source layer** — reconciled against the reference layer, see below |

The current central file contains exactly one active group (`Any Pylon`, `curated_wiki_item_group`, source-backed) and one blocked group (`Recorded Music Boxes`), so bootstrap produces zero `central_override` rows today. An unrecognized `sourceKind` is blocking rather than silently classified.

An earlier draft blocked any row claiming a manual source unless it carried an immutable Owner approval. That rule is removed: it would have converted every future admin-authored group into a blocked, never-projected row, which loses the group at runtime and makes shadow parity fail by construction. Admin authorship is now a first-class layer owned by the registered admin group writer (see Consumer Cutover).

### Bootstrap reconciliation of the recipe override file

The override file becomes member exclusion rules and evidence, not source rows. Bootstrap must **prove** each row's disposition rather than assume the measured pattern still holds:

For each override group, compute the reference group's member set after `internalName` deduplication, then compare:

| Comparison result | Disposition | Current count |
| --- | --- | ---: |
| identical member sets | drop the override row; record it in bootstrap evidence as redundant with both hashes | 27 |
| override omits members present in the reference | emit one `maint_item_group_member_exclusions` row per omitted member, with the override file as evidence reference | 2 |
| override **adds** a member absent from the reference | **blocking** | 0 |
| override group has no matching reference group | **blocking** | 0 |

The last two rows are blocking rather than handled because an added member or an orphan group would mean the file carries source content this model does not represent, and silently importing it as a `source_group` would invent provenance it does not have. Both are zero today, so the strict rule costs nothing now and fails closed if the file drifts before cutover.

Bootstrap evidence records all four counts. The redundant-row count is expected to be 27 and the exclusion count 2; a different distribution does not by itself block, but it must appear in the preview diff for review rather than being applied silently.

Steady-state producers do not write databases and do not re-import compatibility paths. They emit content-addressed immutable payloads under the canonical input artifact store with `artifact_role = 'source_evidence'`. The preview operation validates those artifacts and freezes the landing plus downstream diff:

- recipe reference generation emits a parsed source-backed group evidence payload;
- shimmer-derived item groups emit accepted shimmer/source evidence.

Admin-authored group changes are not source evidence and do not use this path. They are committed transactionally by the backend (see Consumer Cutover) and produce their own audit rows rather than landing rows.

The canonical input artifact store is distinct from all four compatibility paths. Artifact creation is filesystem-only L0 work; landing insertion is part of the `item-group-canonical-apply` frozen database diff. No generator or exporter receives database writer credentials.

Each source receives an independent current record keyed by:

```text
(dataset_type='item_groups_raw', provider, source_key, source_page, is_current)
```

The stable `source_key` values identify the producer, not the compatibility filename:

| `source_key` | Bootstrap | Steady state |
| --- | --- | --- |
| `wiki.recipe_material_groups` | yes | yes — recipe reference generation |
| `wiki.shimmer_item_groups` | yes, via the source-backed rows of the central file | yes — shimmer evidence |
| `admin.recipe_group_overrides` | yes, one frozen row, as reconciliation evidence only | none — no producer emits it again |
| `admin.item_group_overrides` | yes, one frozen row | none — admin edits commit transactionally, not through landing |

The two `admin.*` keys exist so that bootstrap lineage stays traceable to the exact file bytes that seeded the canonical rows. After cutover they have no live producer, and their landing rows are permanent history.

Extend `source_dataset_landings` with required `artifact_role`, `producer_id`, `producer_version`, `producer_run_key`, and `bootstrap_manifest_hash` fields for these new dataset types. Existing dataset types receive explicit compatibility defaults during migration; no nullable/unknown role is accepted for the new group or NPC datasets.

The current unique key ending in `is_current` permits only one archived row and the current importer deletes older archived rows before rotation. Replace it with a nullable generated `current_slot` (`1` for current, `NULL` for history) and a unique key on `(dataset_type, provider, source_key, source_page, current_slot)`. Multiple historical rows are then legal while only one current row is allowed. New group and NPC dataset types never call the archived-row deletion path. Historical GC is a separate manual/Owner-governed operation that may delete only rows outside the configured retention window and unreferenced by maint rows, immutable bundles, decisions, evidence sets, or audits.

The landing row retains the group payload and its file-level provenance, the payload content hash, the full-file content hash and byte size, source locator, timestamps, provider, parse status, producer identity, artifact role, and current/history state. It does not retain non-group sections of the source file; see DDL and volume invariants for why. `artifact_role = 'compat_export'` is always rejected by landing import. A malformed payload, unsupported schema version, producer/source-key mismatch, repeated bootstrap hash, or compatibility-export payload is blocking and cannot replace the current accepted row.

### Maint tables

Add these tables to `terria_v1_maint`:

| Table | Ownership and logical key |
| --- | --- |
| `maint_item_groups` | One source-layer group fact per `(canonical_key, source_layer, source_key)` |
| `maint_item_group_members` | Ordered source members per `(group_record_key, member_key)` |
| `maint_item_group_aliases` | Source aliases per `(group_record_key, normalized_alias)` |
| `maint_item_group_member_exclusions` | Curated member exclusions per `(canonical_key, member_key)`; see Current Semantics To Preserve |

`maint_item_groups` requires: `record_key`, `canonical_key`, canonical/display names, normalized domains JSON, source layer and priority, source provider/key/page/locator, source revision, landing id/hash, status, block reason, source metadata JSON, canonical version, timestamps, and soft-delete state.

Provenance columns are required per source layer, not universally, because 62 of 63 current groups have no group-level provenance to record:

| Source layer | Landing id/hash | Group-level provider/page/revision | Locator |
| --- | --- | --- | --- |
| `recipe_reference` | required | inherited from the landing row when absent on the group | file-level |
| `source_group` | required | required | required |
| `central_override` | not applicable | actor and audit row instead | not applicable |

Requiring group-level provider, page, and revision on every row would force the 33 recipe reference groups to carry invented values, because their provenance genuinely is file-level rather than per-group. Inheritance from the landing row is legitimate there and must be recorded as inheritance, so an audit can distinguish "provenance is file-level" from "provenance is missing". `source_group` rows do carry full group-level provenance today and are held to it. `central_override` rows are authored rather than sourced, and their traceability is the append-only admin audit row rather than a landing reference.

`maint_item_group_members` requires: `record_key`, `group_record_key`, source item id, internal/name/name-zh values, member key, sort order, source metadata, and resolution hint. Image values from compatibility JSON are evidence only and must not become item image authority.

`maint_item_group_aliases` requires: `record_key`, `group_record_key`, alias text, normalized alias, alias language when known, and sort order.

Alias rows include canonical name, English display name, Chinese display name, and explicit aliases with an `alias_kind`; they are not limited to the JSON `aliases` array. This preserves current lookup and collision behavior.

Maint rows retain separate source contributions. Duplicate canonical keys are therefore visible and auditable instead of being destroyed during ingestion.

### Relation tables

Add these tables to `terria_v1_relation`:

| Table | Ownership and logical key |
| --- | --- |
| `relation_item_groups` | One resolved row per `(canonical_key, source_layer)` |
| `relation_item_group_members` | Resolved members per `(group_record_key, member_key)` |
| `relation_item_group_aliases` | Collision-checked aliases per `(group_record_key, normalized_alias)` |

The relation processor performs the layer-independent work once per contributing maint row: deduplicate members by `internalName` keeping the non-null `nameZh` row, resolve member identity against canonical items, apply member exclusion rules, and run collision checks. Each row records its `source_layer`, its precedence, its originating maint record key, and its resolution counters. Member resolution states are `RESOLVED`, `UNRESOLVED`, `AMBIGUOUS`, or `REJECTED`.

Precedence is **not** applied here. Winner selection is deferred to read time because it is consumer-dependent; see below.

Any of these conditions blocks projection:

- a referenced blocked group;
- a central override colliding with a protected recipe group identity or alias;
- ambiguous member identity;
- duplicate normalized aliases owned by different active groups;
- an active group with no resolved members;
- source hash or landing identity missing from the winning row.

Unresolved non-referenced groups may remain warning evidence, but an unresolved group referenced by recipe, NPC shop, or shimmer is blocking.

### Consumers select the winner at read time; they are not separate projections

Each consumer keeps its current effective-source rule as a read-time predicate over `source_layer`, and applies precedence **within its own allowed subset**:

| Consumer | Allowed source layers | Writes to | Required parity |
| --- | --- | --- | --- |
| `AdminItemGroupController` | all | `central_override` | current merged output |
| `AdminRecipeGroupController` | `recipe_reference`, `central_override` | `central_override` | current output |
| `RecipeTreeServiceImpl` | `recipe_reference`, plus non-colliding recipe-domain rows from other layers | read-only | current alias lookup |
| `buildRecipeGroupExpansions` (`scripts/data/relation/recipe-expansion-processor.mjs`) | `recipe_reference` only | read-only | current expansion output, subject to the deduplication difference below |
| NPC shop | source-backed rows explicitly referenced by NPC shop evidence | read-only | current NPC shop group interpretation |
| shimmer | source-backed rows explicitly referenced by shimmer evidence | read-only | current shimmer group interpretation |

`AdminRecipeGroupController` must include `central_override` in its allowed set even though it does not today, because that is the layer its own writes land in. It currently creates, updates, and deletes by writing `recipe-group-overrides.json` (`AdminRecipeGroupController.java:328`). With `recipe_override` removed as a source layer, those edits have to land somewhere canonical, and `central_override` is the layer that already means "admin-authored". Omitting it from the read set would make an admin's own newly created recipe group invisible in the page that created it.

`buildRecipeGroupExpansions` is a Node relation processor, not a Java service. It reads `recipe-material-reference.json` directly at `sync-maint-to-relation.mjs:1414` and matches members by `internalName`, which is consistent with the reference layer carrying no `itemId`.

The read is one indexed query per consumer: filter by allowed layers, order by precedence descending, take the highest-precedence row per canonical key.

Two rejected alternatives, and why:

**Materializing one row set per consumer** was the original draft, keyed `(consumer_scope, canonical_key)`. It multiplies the projection-state rows, cache-invalidation paths, and zero-diff parity reports by six for no behavioral gain, because the consumers differ only in which layers are effective.

**Resolving to a single global winner per canonical key and then filtering on that winner's layer** was the previous repair, and it is wrong. Filtering after global winner selection is not equivalent to resolving within the allowed subset. Under the four-layer model this broke 29 of 34 keys: a key contributed by both `recipe_reference` and `recipe_override` has a global winner of `recipe_override`, so the recipe-expansion consumer, whose predicate admits `recipe_reference` only, would filter out the winner and see nothing at all rather than seeing the reference row. Global winner selection discards exactly the information a narrower consumer needs.

Keeping one relation row per contributing layer costs one row per source contribution, which is what the maint layer already holds, and it makes the correct read trivially expressible. Both properties below are verified against current data:

- no normalized alias is owned by more than one distinct canonical key, so global alias uniqueness holds and no consumer needs a private alias namespace;
- after the source-layer reduction, no canonical key currently has more than one contributing layer, so the read-time precedence step has zero current instances. It remains required for correctness the moment a `central_override` lands on an existing key, and it is tested with synthetic multi-layer fixtures rather than left unexercised.

Changing a consumer's allowed-layer set remains a separate semantic migration outside this B1 source move. Shadow acceptance compares each consumer independently, against its own predicate.

### Shadow parity: two systematic expected differences

Both come from deduplication, and both are the migration working rather than regressions. A naive zero-diff comparison fails on both, so each needs an explicit normalization rather than an allowlist.

**Difference 1: member sets, for reference groups with no override twin.** Four keys are in that state: `Any Fragment`, `Any Jellyfish`, `Any Torch`, `Any Wood`. Consumers reading the reference layer for those four currently receive duplicated members and afterwards receive the deduplicated set. The comparison normalizes the current output by the same `internalName` deduplication before diffing. A difference that survives that normalization is blocking. An unconditional allowlist of the four keys is not acceptable, because it would also mask a genuine member loss in the same groups.

**Difference 2: Chinese member names in recipe expansion.** `recipe-expansion-processor.mjs:33-38` already deduplicates by `internalName`, but with first-occurrence-wins. Measurement shows the duplicate pairs are ordered `nameZh: null` first in 112 of 112 cases, and never the other way, so the current expansion output carries `memberNameZh: null` for **112 of 153 members**. This design's rule retains the non-null row, so those 112 members gain their Chinese name.

That is the correct outcome and the reason the rule is specified as "retain non-null" rather than "keep the first". It is also a diff on nearly every expanded group, not a rare edge case, so it must be declared before cutover rather than discovered during step 12. The comparison treats a `memberNameZh` change from `null` to a non-empty value as expected, and treats any other `memberNameZh` change, including value-to-different-value or value-to-null, as blocking.

Both normalizations are themselves tested: a fixture where a member is genuinely lost, and a fixture where `memberNameZh` changes from one value to another, must both fail the comparison.

### Local runtime tables

Add these tables to `terria_v1_local`:

| Table | Ownership and logical key |
| --- | --- |
| `item_groups` | Active runtime group per `canonical_key`, carrying `source_layer` |
| `item_group_members` | Runtime members per `(group_id, item_id)` |
| `item_group_aliases` | Runtime alias per `normalized_alias` |
| `item_group_projection_state` | Single published snapshot row |

Only active, non-blocked, fully resolved relation rows are materialized. Runtime members reference local canonical items by database identity; compatibility names remain display and trace fields, not lookup authority. `source_layer` is indexed because it is the read-time predicate every consumer applies.

The local projection carries relation record key, source content hash, canonical version, and materialized timestamp. `item_group_projection_state` is a singleton requiring canonical snapshot hash/version, relation run key, group/member/alias counts, publication status, and published timestamp. Runtime rows and their `PUBLISHED` state transition commit in the same local transaction, so API responses and acceptance audits can prove which complete snapshot they expose. One snapshot row rather than one per consumer means a single hash identifies what every consumer is reading.

### DDL and volume invariants

- Every table has an immutable `record_key` unique key; child tables have an indexed parent key and a unique logical key matching the tables above.
- Maint and relation schemas use record keys for cross-database lineage and do not create cross-database foreign keys. Same-database child foreign keys are restrictive; soft-delete/current rotation happens parent-scope first and never cascades an unbounded physical delete.
- Canonical, alias, member, and source keys use one shared normalization library and byte-length validation before SQL. Truncation is forbidden.
- The group landing payload is the group section plus file-level provenance, not the complete file. `recipe-material-reference.json` is 4.95 MB of which 23.7 KB is group data and 3.4 MB is `supplementalRecipes` belonging to the recipe domain; storing the whole file would make the landing row 200x larger than the facts it governs and would place another domain's data under group ownership. The landing row records the full-file content hash and byte size so lineage back to the exact file is preserved, and the exporter reads non-group sections from their own accepted evidence (see Compatibility Export Contract).
- Group ingestion caps are set at roughly four times measured volume, so a runaway parse is caught near the real ceiling instead of at an arbitrary large number. Caps are evaluated against raw parsed input, before deduplication, because that is what a runaway parse would produce. Ingestion rejects a group payload over 1 MiB (measured maximum 23.7 KB), more than 256 group rows (measured 63), more than 160 members or 32 aliases in one group (measured raw maxima 38 and 2), or more than 1,600 member rows total (measured raw 387). Raising any cap is a reviewed change that must restate the measurement it is derived from.
- NPC base ingestion rejects a payload over 16 MiB (`data/standardized/npcs.standardized.json` is currently 1.3 MB). NPC crawler-fact caps cannot be derived from measurement because no crawler-fact artifact exists in the repository; they remain provisional at 2 MiB per fact, 2,048 facts per run, and 64 MiB total per run, and must be re-derived from a real run before the NPC apply is authorized. See D2.
- Diff policy applies both absolute and percentage caps to inserted, updated, soft-disabled, unresolved, ambiguous, and rejected rows. For automated source-derived ingestion a cap breach remains an exact-bundle Owner L1 decision. For the admin group writer there is no approval queue, so a cap breach fails the request outright.
- Percentage caps are evaluated against a 63-group baseline, where a single group is 1.6% of the domain. Percentage-only thresholds are therefore meaningless at this scale and every group cap must carry an absolute floor; a rule expressed only as a percentage is a configuration error and fails closed.
- Counts, byte sizes, and cap decisions are persisted in preview evidence before any write. Unknown or non-finite counts fail closed.

## Consumer Cutover

Introduce one backend item-group repository/service boundary. The following consumers switch to it:

- `AdminItemGroupController`
- `AdminRecipeGroupController`
- `RecipeTreeServiceImpl`
- recipe group expansion and maint-to-relation sync
- Any Item Group source audit and domain-readiness panels
- admin item-group pages and their delete/edit capability decisions

Controllers no longer read or overwrite files. Read endpoints remain available to authenticated `ADMIN` users.

### Admin edits commit synchronously

Create, update, and delete keep their current synchronous semantics. The user decided on 2026-07-26 that manual group curation must not require System Owner approval. The maintenance surface is one active group today and the whole canonical domain is 34 groups; a two-person, bundle-frozen protocol in front of it would make the admin page unusable without buying meaningful safety.

1. An authenticated `ADMIN` submits a create, update, or delete to `/admin/item-groups` or `/admin/recipe-groups`.
2. The backend validates it against the precedence and collision rules, then commits the `central_override` maint row, its relation rows, its local rows, and the projection-state transition in one transaction.
3. The response reports the committed group, exactly as today.

The change is the write target, not the workflow: the file write becomes a database transaction.

**Same-server co-location is a precondition, checked at startup.** Step 2 spans `terria_v1_maint`, `terria_v1_relation`, and `terria_v1_local`, and the write protocol only permits a single transaction across them when they are same-server. The cross-server path is the staged protocol with markers and compensation, which must not run inside a synchronous HTTP request: an admin clicking save cannot be the thing that owns a partially committed three-database mutation.

The group tables are small enough that co-location is a reasonable requirement rather than a burden. So:

- at startup the backend resolves the three database roles and records whether they are same-server;
- if they are, the synchronous admin write path is enabled;
- if they are not, the admin write path is **disabled and reported as such in the API response and the admin UI**, while read endpoints continue working. Group changes then go through the `item-group-canonical-apply` capability, which already owns the staged protocol.

Failing closed here is deliberate. The alternative, letting the request start a staged cross-server mutation it cannot supervise, converts a deployment-topology surprise into a partially applied canonical write.

This does not create an ungoverned writer. Admin edits are owned by a registered `admin_item_group_writer` identity with its own row in `tableOwnershipMatrix`, restricted to `source_layer = 'central_override'` rows of the group tables and to the group projection state. It:

- acquires the same fences as the automated group capability, so an admin edit and a source refresh cannot interleave on the same normalized canonical keys;
- cannot touch `recipe_reference` or `source_group` rows, item identity, NPC identity, or image ownership tables;
- writes an append-only audit row per change carrying actor, before/after logical keys, and the resulting snapshot hash;
- is bound by the same diff caps as any other writer. A cap breach fails the request rather than escalating to an approval queue, because there is no approval queue for this path.

Automated, source-derived group ingestion is separate and keeps its governance. Add the symmetric `item-group-canonical-preview` / `item-group-canonical-apply` pair to the V2 capability manifest and backend registry for recipe reference regeneration and shimmer-derived groups. Both start at `L0 + DISABLED` and the apply operation cannot execute until its independent Owner activation. That pair never carries an admin-authored change.

Consequence for the locked catalog: the group pair remains justified by source-derived ingestion even though the admin proposal flow is gone, so the count grows 19 -> 21. It would reach 23 only if the deferred NPC pair is later registered. See Migration Sequence.

Backend caches are keyed by the published snapshot hash plus the consumer's effective-source predicate, not a time-only TTL. Each read checks the singleton `item_group_projection_state` before reusing cached content. A changed, missing, non-published, or count-mismatched state invalidates every consumer's cache and fails closed rather than serving a mixed snapshot. Post-commit verification checks `/admin/item-groups`, `/admin/recipe-groups`, and representative `/public/items/{id}/recipe-tree` responses against the same published hash.

During migration, shadow comparison may read both DB and JSON. The JSON result is never allowed to silently fill a missing DB result after B1 closure. A mismatch blocks cutover and emits a report containing group, alias, member, domain, source, and blocked-state differences.

## Compatibility Export Contract

The three group files remain tracked compatibility artifacts, but they no longer render the same way, because they no longer occupy the same position in the model.

| File | Rendered from | Note |
| --- | --- | --- |
| `recipe-material-reference.json` | canonical `recipe_reference` groups, merged with non-group recipe evidence | see the merge contract below |
| `item-group-overrides.json` | canonical `source_group` and `central_override` groups plus blocked groups | pure projection |
| `recipe-group-overrides.json` | canonical resolved state for the affected keys | **the exported content is not what the file contained before cutover** |

The third row needs stating plainly. Before cutover that file was a hand-maintained source input. After cutover it is a rendering of resolved state, which is exactly what its 27 redundant groups already were. Two consequences:

- the export includes the member exclusions in effect, so the two curated exclusions remain visible in the artifact rather than disappearing into the database;
- the first export after cutover will produce a byte-different file even where semantics are unchanged, because ordering, `itemId` population, and formatting now come from the exporter. That diff must be reviewed once and recorded as expected, rather than being read as data loss.

Common properties:

- Group, member, alias, domain, source, and blocked-group sections are rendered deterministically from accepted canonical state.
- Stable ordering and canonical JSON serialization make identical state produce identical hashes.
- Export is atomic through temporary-file write plus rename.

The exporter for `recipe-material-reference.json` is not a pure projection, and this is the hardest part of the contract rather than a footnote. Only 0.48% of that file is group data. `supplementalRecipes` (3.4 MB), `sourcePageSnapshots`, `recipeSourcePages`, `sourceUrls`, and `sourceType` are outside the group contract and outside canonical group ownership. The exporter therefore merges two inputs:

| Section | Source | Ownership |
| --- | --- | --- |
| `groups` | canonical group state | group tables |
| `supplementalRecipes`, `sourcePageSnapshots`, `recipeSourcePages`, `sourceUrls`, `sourceType`, `generatedAt` | the accepted recipe reference generator evidence for the same landing revision | recipe domain |

Required properties for that merge:

- both inputs must resolve to the same landing revision; a canonical group snapshot merged with non-group evidence from a different revision is blocking, not a warning;
- the exporter has read-only access to the recipe evidence and may not regenerate, re-normalize, or re-parse it;
- if the non-group evidence for the current revision is unavailable, the export job fails and publishes nothing. It never emits a file with an empty or stale `supplementalRecipes`, because that file is a tracked artifact and a truncated version would look like a legitimate 3.4 MB deletion.
- the round-trip property is explicit: parsing an exported file must reproduce exactly the canonical group state it was rendered from. Determinism alone only proves the exporter is stable, not that it is faithful.
- Export runs as a dedicated idempotent `item_group_compat_export` artifact job in one designated writable workspace. It is never executed inside an HTTP request or by every backend instance.
- A canonical commit records export freshness as pending. The admin response reports canonical commit status and export freshness separately.
- Export failure does not make an already committed canonical write appear failed or invite a duplicate apply. It marks only the export job failed/stale, prevents publication of a partial file, and raises an operator-visible retry action.
- Exported roots carry `artifactRole = 'compat_export'`, canonical snapshot hash, export run key, and exporter version. Landing import rejects that role.
- No runtime or admin consumer may treat export absence as permission to reconstruct or write canonical rows.

## NPC Bridge Repair

D2 splits this into a repair that ships now and a canonical chain that is deferred. Only the repair is in scope for B1; the deferred chain is retained here as the agreed target so it is not redesigned from scratch later.

### The immediate defect, and its independent repair

Two registrations point at a deliberately untracked artifact (see Context). Both are wrong today, independently of whether the canonical NPC chain is ever built:

- `source-dataset-locator.mjs:170` silently skips `npcs_raw` when the ignored path is absent, because the locator only pushes a descriptor for files that exist. On any clean clone this means the dataset is not merely stale, it is not landed at all, and nothing says so.
- `docs/audits/canonical-migration-boundary.md` registers the same path as a B1 exemption input with a migration target and deadline, treating a build artifact as durable source data.

The repair is small and does not depend on the rest of this section, and per D4 it ships as its own change:

1. `source-dataset-locator.mjs` requires an explicit accepted landing source descriptor for `npcs_raw` and fails loudly with a concise missing-source error rather than silently omitting the dataset.
2. `npcs_raw` points at `data/standardized/npcs.standardized.json`, which is tracked and present.
3. The boundary document retires the bridge row and registers the standardized file in its place at `b1_migrating`.
4. `backfill-npc-buff-relations-from-wiki-crawler.mjs:127` loses its `??` bridge default and requires an explicit path.

**Required pre-check before step 2 lands.** Pointing `npcs_raw` at the base standardized file drops `wikiCrawler.buffInflictions` from the landed payload. That is safe only if the NPC-Buff relations derived from it are already materialized in `terria_v1_relation.npc_buff_relations` and `terria_v1_local.npc_buff_relations`. This has not been verified: the local stack was unreachable when this design was written. Step 0 must confirm non-empty, current NPC-Buff relation rows with a read-only query before the locator change is accepted. If those rows are empty or stale, the enrichment is live-critical and D2 must be revisited rather than worked around.

### Deferred: the canonical NPC chain

The design below is agreed but **not in scope for B1 closure**, because its inputs do not exist. The canonical NPC design consumes crawler normalized records and their matching audit records, and those artifacts are absent: `data/wiki-crawler/` contains only `README.md`, while `audit/`, `canonical/`, `normalized-light/`, and `report/` are ignored by the same 2026-04-20 commit. Producing them requires a real crawler run, which this design's Non-Goals forbid.

Consequences, stated rather than discovered later:

- `npc_crawler_facts_raw` has no bootstrap definition and cannot have one, because there is no frozen artifact to content-address. The bootstrap bundle contract under Landing covers the three group files only.
- The chain can reach fixture-level `CODE_READY` but not `T1_VERIFIED` against real data, and not `T2_CUTOVER_VERIFIED` at all, until a crawler run is separately authorized.
- The `npc-crawler-facts-preview` / `-apply` pair is therefore **not registered** as part of this work. The locked capability catalog moves 19 -> 21, not 19 -> 23.
- The NPC readiness report is not a B1 closure requirement under this design; the NPC identity stays at `b1_migrating` until the deferred chain runs.

The `wikiCrawler.buffInflictions` enrichment is produced by `scripts/data/crawler/src/domains/npc-parser.mjs`; the bridge only relayed it. Consuming crawler normalized output directly remains the right long-term target. The blocker is availability, not design.

### Deferred target chain

Replace the bridge input with two independently traceable landing datasets:

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

Scripts that currently default to the bridge path must require an explicit accepted landing/maint source descriptor; `backfill-npc-buff-relations-from-wiki-crawler.mjs:127` is the concrete instance. They fail with a concise missing-source error rather than silently switching to the base standardized file or silently omitting the dataset. Once the deferred chain runs, NPC coverage compares base landing, crawler-fact landing, maint facts, relation, projection, and local identities and hashes, including positive buff/shop/loot samples.

No compatibility exporter is built for the bridge path. An earlier draft proposed regenerating it from accepted `maint_npcs` and `maint_npc_crawler_facts`. That is removed as dead weight: the path is gitignored, so unlike the three group files it is not a tracked compatibility artifact, and the same draft already required that no canonical or automated consumer may depend on it. Building a governed exporter whose output nothing may consume and version control does not retain has no consumer. If a local operator wants the bridge shape, the existing bridge generator still produces it.

Under D2 only the group pair registers now, expanding the locked V2 capability catalog from 19 to 21 operations: `item-group-canonical-preview` / `-apply` for source-derived group ingestion. The `npc-crawler-facts-preview` / `-apply` pair is specified here but not registered, and would take the catalog to 23 when the deferred chain is authorized. The admin group writer is not a capability at all; it is a backend-owned writer with a `tableOwnershipMatrix` row, not a crawler-monitor operation. At each registration the manifest count, exact-ID contract, progress ownership, preview/apply symmetry, disabled defaults, backend registry, admin overview, and ownership tests change atomically. New operations start at `L0 + DISABLED` and no apply shares an approval with another.

## Write Ownership And Safety

The new tables and landing fields must be added to the authoritative local Flyway, maint schema, relation/projection schema catalogs, relation table catalog, and `tableOwnershipMatrix`. Group ingestion owns only the group tables listed above. NPC crawler-fact ingestion owns only `maint_npc_crawler_facts` and the already registered crawler-owned fields/scopes of `maint_item_sources` and NPC relation targets. Neither capability can mutate item identity, NPC base identity, or image ownership tables.

Three writers touch the group tables and all three need ownership rows:

| Writer | Owned rows | Governance |
| --- | --- | --- |
| `item-group-canonical-apply` | `recipe_reference` and `source_group` rows plus projection state | L1 capability, `L0 + DISABLED` by default |
| `admin_item_group_writer` | `central_override` rows and member exclusion rules, plus projection state | backend-owned, synchronous, ADMIN-authenticated, no approval queue |
| `item_group_compat_export` | no database rows | filesystem only, never acquires a writer lock |

Ownership is enforced by `source_layer` predicate intersection, so the admin writer cannot modify a source-derived row and the capability cannot modify an admin-authored one. An attempt to write outside the owned layer fails closed rather than succeeding with a warning.

Writes serialize on physical ownership, not only domain name:

- group source refresh and admin override commit both lock the affected normalized canonical keys plus the singleton group projection state, and therefore serialize against each other even though only one of them is an L1 capability;
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

### Step 0, shipped as its own change (D4)

0. Correct the bridge registrations. In order: run the read-only NPC-Buff pre-check described under NPC Bridge Repair and stop if the relations are empty or stale; require an explicit landing source descriptor for `npcs_raw` with a loud missing-source failure; point it at `data/standardized/npcs.standardized.json`; remove the `??` bridge default from the buff backfill; retire the bridge row in the boundary document and register the standardized file at `b1_migrating`. Add the `retired` and `b1_migrating` modes to the contract registry as part of this step, since Step 0 is the first consumer of both.

### Group chain

1. Add schema/catalog/ownership contracts, landing artifact-role fields, and isolated schema tests. This includes the `current_slot` replacement of the `is_current` unique key on the shared `source_dataset_landings` table; see the shared-table note below.
2. Add pure group parsers, the exact `internalName` deduplication rule, and deterministic canonical key/member/alias normalization tests.
3. Add immutable group bootstrap and steady-state landing descriptors; add the override-file reconciliation that produces member exclusion rules and blocks on added members or orphan groups; reject compatibility-export feedback.
4. Add group maint ingestion, per-layer relation resolution with member exclusion application, and local projection. Precedence stays at read time.
5. Add backend repositories and DB shadow readers while JSON remains the live source.
6. Convert the admin write path from file writes to the transactional `admin_item_group_writer`, and register the `item-group-canonical-preview` / `-apply` pair at `L0 + DISABLED` for source-derived ingestion. Locked catalog count moves 19 -> 21.
7. Add the independent deterministic compatibility export jobs, including the group/non-group merge and round-trip equivalence.
8. Add positive canonical readiness reports and the legacy-to-canonical source contract registry.
9. Reach `CODE_READY` through focused tests and consumer scans without formal writes.
10. Run the complete group chain in isolated T1 databases and reach `T1_VERIFIED`.
11. Obtain authorization bound to the exact formal DDL and three database fingerprints. After schema verification, obtain one System Owner approval bound to the frozen item-group bootstrap bundle.
12. On formal databases, apply the frozen bootstrap once, run per-consumer shadow comparison, cut over DB reads, disable JSON fallback, restart the local stack through the standard lifecycle scripts, and run real read-only API/runtime smoke.
13. Reach `T2_CUTOVER_VERIFIED` for the group chain and flip the three group source contracts from `b1` to `canonical`. Regenerate the group readiness report.

### Deferred: NPC chain, not part of this delivery

Per D2 these steps are specified but not scheduled. They require a separately authorized crawler run, because no crawler-fact artifact exists to freeze.

- D. Add `npcs_base_raw`, `npc_crawler_facts_raw`, `maint_npc_crawler_facts`, and their guarded processors; register the `npc-crawler-facts-preview` / `-apply` pair at `L0 + DISABLED`, taking the locked catalog 21 -> 23.
- D. Re-derive the provisional NPC caps from a real run. Fixture-level `CODE_READY` is reachable without one; `T1_VERIFIED` against real data and any T2 cutover are not.
- D. On its own authorization and its own frozen bundle, apply, verify, and flip the NPC source contract from `b1_migrating` to `canonical`.

### Closure

14. Rerun the complete quality gate from the beginning. `B1_CLOSED` requires every registered identity to be `canonical` or `retired`, so it is not reachable until the deferred NPC chain runs. The gate itself can pass before then, because the NPC identity sits at `b1_migrating` with real evidence.

Contract flips are per input, not atomic. An earlier draft required changing all four contracts in one step, which coupled independently authorized workstreams: the group chain would have delivered zero gate improvement until the NPC chain also landed, even though their approvals are deliberately separate. Each identity flips when its own evidence passes.

Steps 1-10 do not authorize any formal database mutation. Every authorization is a hard checkpoint and none are interchangeable. If DDL succeeds but a data apply fails, the unused new tables may remain after schema verification, but pre-cutover readers remain unchanged, no fallback is disabled, and B1 remains active. Any data/cutover failure rolls back or circuit-breaks under the existing latest-writer rules.

**Shared-table note for step 1.** `source_dataset_landings` is shared by roughly fifteen existing dataset types, so replacing its unique key is not an additive change confined to this migration. The step-1 DDL bundle must include, and its authorization must cover: the `current_slot` generated column and new unique key; a backfill setting explicit `artifact_role`, `producer_id`, `producer_version`, `producer_run_key`, and `bootstrap_manifest_hash` compatibility defaults for every existing dataset type; and updates to the existing consumers of the old shape, namely the importer's archived-row deletion path in `import-source-dataset-landings.mjs`, `audit-source-dataset-landings.mjs`, `cross-db-referential-integrity.mjs`, and `record-lineage-trace.mjs`. Omitting the backfill from the authorized bundle would leave ten steps of code assuming a shape the formal table does not have.

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

1. Node unit tests for parsing, canonical keys, precedence, alias collision, member resolution, blocked references, export stability, bootstrap `sourceKind` classification including the unknown-kind rejection, and missing NPC source behavior.
2. Schema and ownership contract tests covering every new table, column owner, logical predicate, and database role, plus `source_layer` predicate intersection between the capability writer and the admin writer.
3. Java repository/service/controller tests proving no direct file access, preserved read behavior, synchronous commit semantics for admin create/update/delete, DB-backed recipe-tree resolution, and fail-closed errors.
4. Admin contract tests proving edit/delete capabilities come from backend data rather than file paths, that an admin edit commits maint/relation/local/projection-state in one transaction, that a cap breach on the admin path fails the request rather than queueing anything, that an admin-created recipe group is immediately visible in `AdminRecipeGroupController` because `central_override` is in its allowed layer set, and that a cross-server topology disables the synchronous write path while leaving reads working.
5. Concurrency tests proving an admin override commit and a source refresh cannot interleave on the same normalized canonical keys, and that the admin writer cannot modify a `recipe_reference` or `source_group` row.
5a. Deduplication tests asserting the exact rule: collapse by `internalName`, retain the non-null `nameZh` row; 265 raw reference members reduce to 153; a member set differing only in `nameZh` nullity must not survive as two rows.
5b. Bootstrap reconciliation tests for the override file covering all four dispositions, including the two blocking cases (an override that adds a member, an override with no matching reference group) which have zero current instances and must therefore be exercised with synthetic fixtures.
5c. Member exclusion tests proving an exclusion naming an absent member blocks rather than silently passing, and that the two current exclusions remove exactly `DontHurtCrittersBookInactive` and `DontHurtNatureBookInactive`.
5d. Multi-layer precedence tests using synthetic fixtures, because no canonical key currently has more than one contributing layer. At minimum: a `central_override` landing on a key that already has a `recipe_reference` row must win for `AdminItemGroupController` and must not appear for recipe group expansion, which admits `recipe_reference` only.
6. T0 and T1 isolated three-database acceptance using their distinct required prefixes for rollback, commit, verification, export, and restoration.
7. Per-consumer zero-diff shadow reports covering identity, names, domains, aliases, members, source metadata, blocked state, and recipe expansion rows, each evaluated against that consumer's allowed-layer predicate. The comparison normalizes the current output by the same `internalName` deduplication before diffing, so the four override-less reference groups (`Any Fragment`, `Any Jellyfish`, `Any Torch`, `Any Wood`) match rather than being allowlisted. A test must prove that removing a genuine member from one of those four still fails the comparison.
7a. Resolution-count assertions requiring exactly zero `UNRESOLVED` and zero `AMBIGUOUS` members at cutover, not a tolerance, because all 153 distinct reference member names resolve uniquely today.
7b. Shadow-normalization tests proving both declared expected differences are bounded: a fixture that genuinely loses a member must fail the comparison, and a fixture whose `memberNameZh` changes from one non-null value to another must fail. Only `null` to non-empty is accepted.
8. Export round-trip equivalence: rendering canonical state to each compatibility file and re-parsing it reproduces exactly the canonical group state, including blocked groups. Determinism tests alone are insufficient because they prove stability, not fidelity.
9. Export merge tests for `recipe-material-reference.json` proving the non-group sections are carried from the same landing revision, that a revision mismatch blocks, and that unavailable non-group evidence fails the job instead of publishing a file with truncated `supplementalRecipes`.
10. NPC retirement evidence for this delivery: the `npcs_raw` descriptor resolves to the tracked standardized file; a missing descriptor fails loudly instead of omitting the dataset; the positive absence scan finds zero bridge-path references outside documentation and the retirement test itself; and NPC-Buff relation rows are non-empty and current. Full NPC coverage across crawler-fact landing, maint facts, and shop/loot relations belongs to the deferred chain and is not produced here.
11. Targeted direct-consumer scans proving the four compatibility paths remain only in bootstrap migration code, exporters, explicit compatibility tests, and documentation.
12. Contract tests proving each Owner approval is exact-bundle/one-time/non-shareable, that the capability registry contains exactly the approved operation set for the current step (21 after the group chain, 23 after the NPC chain), and that every new preview/apply pair starts disabled.
13. Feedback-loop tests proving exported artifacts cannot become landing current rows.
14. Shared-table regression tests proving the four existing consumers of `source_dataset_landings` still pass against the `current_slot` shape, and that every pre-existing dataset type has non-null compatibility defaults for the new required fields.
15. Positive canonical readiness reports against T2 using read-only credentials after separately authorized cutover.
16. `bash ./scripts/dev/quality-gate.sh` passing from the beginning after each source-contract transition.

The existing audit commands may be evolved to query canonical evidence, but their safety properties remain read-only:

```bash
node scripts/data/audit/audit-any-item-group-sources.mjs
node scripts/data/crawler/src/cli.mjs coverage-audit --domain=npc
```

## B1 Closure Criteria

Replace the current path-only matcher in `scripts/data/audit/b1-exemption-compliance.mjs` with `scripts/data/audit/canonical-source-contract-registry.mjs`. Every registered input identity remains permanently represented with exactly one mode. Identities are never deleted from the registry, because a deleted row and a satisfied row are indistinguishable to a later reader.

| Mode | Validates | Passes when |
| --- | --- | --- |
| `b1` | boundary registration and deadline | deadline not expired |
| `b1_migrating` | approved design reference, a named milestone evidence artifact matching the declared state, and a re-registered deadline inside a bounded window | all three present, evidence fresh, deadline inside the window |
| `canonical` | a named positive canonical readiness report and its T2 cutover identity | report fresh, passing, and bound to the exact cutover |
| `retired` | that the path is referenced by no landing descriptor, no runtime or admin consumer, and no boundary exemption row | the positive absence scan finds zero references outside documentation and explicit retirement tests |

A domain with an expected contract count of zero, a missing contract, an unknown mode, or missing evidence for its declared mode is blocked.

### `b1_migrating`

D1 introduces this mode to distinguish two things the earlier two-mode design conflated: extending a deadline with nothing behind it, which is concealment, and re-registering a bounded deadline against approved, evidenced, in-progress work, which is ordinary governance. Without it the repository gate stays blocked for the entire migration with no passing path, which pressures the next contributor to suppress the check rather than satisfy it.

Guardrails, so the mode cannot become a permanent parking space:

- registration is an explicit act with a named approved design and a declared state drawn from the Migration states table; it is never inferred from code existing;
- the milestone evidence artifact must match the declared state, so a row claiming `T1_VERIFIED` fails if the T1 evidence is absent or stale;
- the re-registered deadline is bounded, and expiry blocks exactly as an expired `b1` row does today;
- `b1_migrating` never satisfies `B1_CLOSED`.

### `retired`

D2 retires the bridge identity. Retirement is not deletion: the row stays in the registry forever with a positive assertion that nothing references the path. That is what makes it verifiable rather than merely absent, and it is the check that prevents a future change from quietly re-registering an untracked artifact as a source input.

Retiring the bridge does not reduce the reference count for `support.town_npc_maintenance`. The replacement input, `data/standardized/npcs.standardized.json`, is itself a B1-tier input under the boundary document's definition, and is registered as such at `b1_migrating`. The panel passes on a real file with real evidence instead of on a file that does not exist.

### Closure

`B1_CLOSED` requires every registered identity to be `canonical` or `retired`, with fresh evidence, and the complete gate green. The three group identities reach `canonical` through this design. The NPC identity reaches `canonical` only through the deferred canonical NPC chain, which is blocked on a separately authorized crawler run.

Read-only positive reports required by this delivery:

| Report path | Mode served | Required evidence |
| --- | --- | --- |
| `reports/canonical-migration/canonical-item-group-readiness.json` | `canonical` for the three group identities | formal schema/version; landing/maint/relation/local counts and hashes; per-consumer shadow parity; zero runtime/admin direct reads; JSON fallback disabled; API snapshot hash; export freshness |
| `reports/canonical-migration/npc-bridge-retirement.json` | `retired` for the bridge identity | positive absence scan showing zero references to the bridge path in landing descriptors, runtime and admin consumers, and boundary exemption rows; the `npcs_raw` descriptor resolving to the tracked standardized file; non-empty current NPC-Buff relation rows proving the enrichment already materialized |
| `reports/canonical-migration/npc-standardized-migrating.json` | `b1_migrating` for the standardized NPC identity | approved design reference, declared state, matching milestone evidence, and the re-registered deadline |

`reports/canonical-migration/canonical-npc-crawler-facts-readiness.json` is specified for the deferred chain and is not produced by this delivery. Its required evidence is formal base and crawler-fact landing freshness, maint match counts, NPC-Buff/shop/loot relation and local hashes, and positive API/runtime samples.

The `canonical` and `retired` reports declare `requiresDatabase: true`, `writesDatabase: false`, exact formal database roles, generation time, source snapshot hashes, code commit, and cutover run/decision identity. They must be generated after the exact cutover and be no older than 24 hours when the closure gate runs. Fixture or T1 reports can prove `CODE_READY`/`T1_VERIFIED`, but cannot satisfy `mode = 'canonical'` or `mode = 'retired'`.

The retirement report is the reason `retired` is a verifiable state rather than a deletion: it asserts absence positively, with a scan that fails if anything re-introduces a reference to the path.

Add every produced report to the domain acceptance report manifest, freshness audit, manual-only refresh plan, backend acceptance DTO/API, admin acceptance view, and `quality-gate.sh`. The refresh plan displays the read-only generation commands but never executes them. Missing, malformed, stale, unknown-risk, database-writing, or non-T2 evidence is blocking. UI/API consumers render the backend-owned report state and do not derive freshness independently.

A B1 row may be replaced by a canonical migration record in `docs/audits/canonical-migration-boundary.md` only when all conditions are true for that input's chain:

- canonical schema, ownership, and source lineage tests pass;
- isolated import and three-database acceptance pass;
- shadow comparison has no unexplained difference;
- all runtime/admin/relation consumers use canonical repositories;
- JSON fallback is disabled;
- compatibility export is deterministic, one-way, and round-trip faithful;
- NPC bridge registrations no longer name the untracked path;
- group audit has no blocked consumer reference;
- formal schema/import/apply has recorded operation-level authorization, exact-bundle identity, and verification evidence;
- real read-only backend/API smoke proves non-empty canonical consumption for that chain;
- that chain's positive readiness report is fresh and passing against the exact T2 cutover;
- the complete repository quality gate passes.

Each transition from `b1` to `canonical` is one reviewed code/data-governance change after that chain reaches `T2_CUTOVER_VERIFIED`. Flips are per input; `B1_CLOSED` requires all four. A flip never removes the expected source contract and never treats zero checks as pass.

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
