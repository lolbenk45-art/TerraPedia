# B1 Canonical Source Migration Design

Status: measurement-and-scope repair round complete; four open decisions block implementation planning.

## Open Decisions

Implementation planning cannot start until these are answered. Dependent sections are marked inline.

| ID | Question | Sections affected |
| --- | --- | --- |
| D1 | Introduce a `b1_migrating` contract mode so the repository gate can pass while migration is in progress? | Migration states, B1 Closure Criteria |
| D2 | How is the NPC bridge exemption row disposed of, given the artifact is deliberately untracked and its replacement inputs do not currently exist? | Context, NPC Bridge Repair, Migration Sequence |
| D3 | Do the 29 zero-provenance curated recipe override groups pass through the landing layer? | Landing, Maint tables |
| D4 | Ship the locator/boundary repair separately, ahead of the canonical chain? | Migration Sequence |

Resolved on 2026-07-26: manual admin group edits do **not** require System Owner approval. They commit synchronously through a registered backend writer identity. See Consumer Cutover.

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

Extending the expired deadline with no evidence would hide the problem and is not an acceptable repair. Whether a bounded, evidence-bound migrating state is an acceptable repair is open decision D1.

## Measured Source Volumes

Measured on the current worktree. Every structural and numeric choice below is sized against these figures rather than against a hypothetical future scale.

| Input | Groups | Max members in one group | Total members | Explicit aliases | Bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `recipe-material-reference.json` | 33 | 38 | 265 | 0 | 4,950,220 |
| `recipe-group-overrides.json` | 29 | 19 | 112 | 0 | 33,721 |
| `item-group-overrides.json` | 1 active + 1 blocked | 10 | 10 | 2 | 3,750 |
| **total** | **63 active + 1 blocked** | **38** | **387** | **2** | |

Three facts change the design:

**1. The entire Any Item Group surface is 63 groups, 387 members, and 2 explicit aliases.** Alias row volume is dominated not by the `aliases` arrays but by the canonical/EN/ZH display names that also become alias rows, giving roughly `63 x 3 + 2 = 191` alias rows.

**2. Group data is a rounding error inside the largest file.** `recipe-material-reference.json` decomposes as:

| Top-level key | Bytes | Share |
| --- | ---: | ---: |
| `supplementalRecipes` | 3,415,095 | 69.0% |
| `sourcePageSnapshots` | 14,569 | 0.3% |
| `groups` | **23,668** | **0.48%** |
| `recipeSourcePages` + `sourceUrls` + other | ~1,100 | <0.1% |

The remainder is JSON formatting overhead. A landing row that retains the complete file payload would store 4.95 MB to govern 23.7 KB of group data, and 3.4 MB of that is recipe data belonging to another domain. See DDL and volume invariants for the corrected payload boundary.

**3. Provenance is not uniform, and 62 of 63 groups cannot supply group-level source fields.**

| Input | Group-level provenance | File-level provenance |
| --- | --- | --- |
| `recipe-material-reference.json` (33) | none | `sourceUrls`, `recipeSourcePages`, `sourcePageSnapshots` |
| `recipe-group-overrides.json` (29) | none | **none** — the file has only `schemaVersion`, `updatedAt`, `groups` |
| `item-group-overrides.json` (1) | full: `sourceKind`, `sourceProvider`, `sourcePage`, `sourceRevisionTimestamp`, `sourceLabel`, `sourceUrls` | `sourceProvider`, `sourceFiles` |

The 33 recipe reference groups inherit provenance from their landing row, which is coherent. The 29 curated recipe override groups have no upstream fact at any level: they are hand-authored corrections. A landing contract that requires provider, locator, and source revision cannot be satisfied for them without inventing values, which would dilute the meaning of every genuine landing row. This is open decision D3.

Member `image` values in all three files are local MinIO origins (`http://localhost:9000/...`). They are trace evidence only and must never become item image authority.

## Goal

Close the seven B1 exemption references by moving durable ownership into the canonical database chain while preserving the four paths only as read-only compatibility artifacts where they remain useful.

Success requires all of the following:

1. Runtime and admin group consumers no longer treat the three group JSON files as source-of-truth inputs.
2. NPC maintenance, relation, and NPC-Buff paths no longer require the untracked bridge path as an implicit default.
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
| `B1_CLOSED` | All four contracts are `canonical` and the full gate passes | Closed |

`CODE_READY` or `T1_VERIFIED` cannot remove, downgrade, or suppress an expired B1 blocker. Formal migration is not authorized by reaching either state. Whether an evidence-bound intermediate state may unblock the repository gate is open decision D1; see B1 Closure Criteria.

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
| `central_override` | ADMIN-authored group change committed through the registered admin group writer | 400 | Manual canonical override |

`source_group` and `central_override` may not win a normalized recipe identity or alias collision against a recipe reference or recipe override row. Such a collision is blocking. Within an allowed non-recipe identity, a `central_override` wins over `source_group`; deleting that manual override reveals the source-backed group again. Blocked groups remain auditable canonical rows with `status = 'BLOCKED'`; they are never projected into runtime tables.

## Any Item Group Data Model

### Landing

Reuse `terria_v1_local.source_dataset_landings` and add `item_groups_raw` to the accepted dataset type catalog. Bootstrap and steady-state inputs are different contracts.

The current three files may be read exactly once as a frozen, content-addressed bootstrap bundle. Its manifest records `artifact_role = 'bootstrap_input'`, the three hashes, repository commit, parser version, and import run key. A bootstrap hash cannot be accepted twice or become current again after cutover.

Bootstrap classification is deterministic and driven by the row's declared `sourceKind`, not by which file it came from:

| Bootstrap input | Declared kind | Assigned source layer |
| --- | --- | --- |
| `recipe-material-reference.json` groups | (none) | `recipe_reference` |
| `recipe-group-overrides.json` groups | (none) | `recipe_override` |
| `item-group-overrides.json` groups | `curated_wiki_item_group` or any other source-backed kind | `source_group` |
| `item-group-overrides.json` groups | `manual_wiki_source` | `central_override` |
| `item-group-overrides.json` `blockedGroups` | `blocked_consumer_reference` | imported as canonical rows with `status = 'BLOCKED'`, never projected |

The current file contains exactly one active group (`Any Pylon`, `curated_wiki_item_group`, source-backed) and one blocked group (`Recorded Music Boxes`), so bootstrap produces zero `central_override` rows today. An unrecognized `sourceKind` is blocking rather than silently classified.

An earlier draft blocked any row claiming a manual source unless it carried an immutable Owner approval. That rule is removed: it would have converted every future admin-authored group into a blocked, never-projected row, which loses the group at runtime and makes shadow parity fail by construction. Admin authorship is now a first-class layer owned by the registered admin group writer (see Consumer Cutover).

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
| `admin.recipe_group_overrides` | yes, one frozen row (subject to D3) | none — no producer emits it again |
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

`maint_item_groups` requires: `record_key`, `canonical_key`, canonical/display names, normalized domains JSON, source layer and priority, source provider/key/page/locator, source revision, landing id/hash, status, block reason, source metadata JSON, canonical version, timestamps, and soft-delete state.

Provenance columns are required per source layer, not universally, because 62 of 63 current groups have no group-level provenance to record:

| Source layer | Landing id/hash | Group-level provider/page/revision | Locator |
| --- | --- | --- | --- |
| `recipe_reference` | required | inherited from the landing row when absent on the group | file-level |
| `source_group` | required | required | required |
| `recipe_override` | **open decision D3** | not available | not available |
| `central_override` | not applicable | actor and audit row instead | not applicable |

Requiring group-level provider, page, and revision on every row would force the 29 curated recipe override groups to carry invented values. Inheritance from the landing row is legitimate for the 33 recipe reference groups because their provenance genuinely is file-level. For `recipe_override` the answer depends on D3: if those groups bypass landing, they carry no landing id and are marked `provenance = 'curated_no_upstream'` explicitly, so an audit can distinguish "no upstream exists" from "upstream lost". `central_override` rows are authored, not sourced, and their traceability is the append-only admin audit row.

`maint_item_group_members` requires: `record_key`, `group_record_key`, source item id, internal/name/name-zh values, member key, sort order, source metadata, and resolution hint. Image values from compatibility JSON are evidence only and must not become item image authority.

`maint_item_group_aliases` requires: `record_key`, `group_record_key`, alias text, normalized alias, alias language when known, and sort order.

Alias rows include canonical name, English display name, Chinese display name, and explicit aliases with an `alias_kind`; they are not limited to the JSON `aliases` array. This preserves current lookup and collision behavior.

Maint rows retain separate source contributions. Duplicate canonical keys are therefore visible and auditable instead of being destroyed during ingestion.

### Relation tables

Add these tables to `terria_v1_relation`:

| Table | Ownership and logical key |
| --- | --- |
| `relation_item_groups` | One resolved group per `canonical_key` |
| `relation_item_group_members` | Resolved members per `(group_record_key, member_key)` |
| `relation_item_group_aliases` | Collision-checked aliases per `(group_record_key, normalized_alias)` |

The relation processor resolves each canonical key exactly once. It applies the fixed precedence and collision rules, resolves members against canonical item identity, and records the winning maint record, the winning `source_layer`, and the complete set of contributing maint record keys and their layers. Member resolution states are `RESOLVED`, `UNRESOLVED`, `AMBIGUOUS`, or `REJECTED`.

Any of these conditions blocks projection:

- a referenced blocked group;
- a central override colliding with a protected recipe group identity or alias;
- ambiguous member identity;
- duplicate normalized aliases owned by different active groups;
- an active group with no resolved members;
- source hash or landing identity missing from the winning row.

Unresolved non-referenced groups may remain warning evidence, but an unresolved group referenced by recipe, NPC shop, or shimmer is blocking.

### Consumers filter at read time; they are not separate projections

Each consumer keeps its current effective-source rule, applied as a read-time predicate against the retained `source_layer` and contributing-layer set:

| Consumer | Effective-source predicate | Required parity |
| --- | --- | --- |
| `AdminItemGroupController` | all layers | current merged output |
| `AdminRecipeGroupController` | `recipe_reference`, `recipe_override` | current output |
| `RecipeTreeServiceImpl` | `recipe_reference`, `recipe_override`, plus non-colliding recipe-domain rows won by other layers | current alias lookup |
| recipe group expansion | `recipe_reference` only | current `buildRecipeGroupExpansions` output |
| NPC shop | source-backed rows explicitly referenced by NPC shop evidence | current NPC shop group interpretation |
| shimmer | source-backed rows explicitly referenced by shimmer evidence | current shimmer group interpretation |

An earlier draft materialized one resolved row set per consumer, keyed by `(consumer_scope, canonical_key)`. That is rejected. It would copy 63 groups up to six times and multiply the projection-state rows, cache-invalidation paths, and zero-diff parity reports by six, for no behavioral difference: the scopes differ only in which source layers are effective, which is a predicate, not a distinct resolution. Resolving once and filtering at read preserves the same outputs with one snapshot to verify.

Two properties make single resolution safe:

- precedence is total and consumer-independent, so the winner of a canonical key is the same row for every consumer; a consumer only decides whether it is allowed to see that winner;
- alias uniqueness is already required to be global across active groups (a duplicate normalized alias owned by two active groups is blocking above), so no consumer needs a private alias namespace.

Changing a consumer's predicate remains a separate semantic migration outside this B1 source move. Shadow acceptance still compares each consumer independently, against its own predicate.

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
- Group ingestion caps are set at roughly four times measured volume, so a runaway parse is caught near the real ceiling instead of at an arbitrary large number. Ingestion rejects a group payload over 1 MiB (measured maximum 23.7 KB), more than 256 groups (measured 63), more than 160 members or 32 aliases in one group (measured maxima 38 and 2), or more than 1,600 members total (measured 387). Raising any cap is a reviewed change that must restate the measurement it is derived from.
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

Create, update, and delete keep their current synchronous semantics. The user decided on 2026-07-26 that manual group curation must not require System Owner approval. The maintenance surface is one active group today and the whole domain is 63 groups; a two-person, bundle-frozen protocol in front of it would make the admin page unusable without buying meaningful safety.

1. An authenticated `ADMIN` submits a create, update, or delete.
2. The backend validates it against the precedence and collision rules, then commits maint, relation, and local rows plus the projection-state transition in one transaction.
3. The response reports the committed group, exactly as today.

The change is the write target, not the workflow: the file write becomes a database transaction.

This does not create an ungoverned writer. Admin edits are owned by a registered `admin_item_group_writer` identity with its own row in `tableOwnershipMatrix`, restricted to `source_layer = 'central_override'` rows of the group tables and to the group projection state. It:

- acquires the same fences as the automated group capability, so an admin edit and a source refresh cannot interleave on the same normalized canonical keys;
- cannot touch `recipe_reference`, `recipe_override`, or `source_group` rows, item identity, NPC identity, or image ownership tables;
- writes an append-only audit row per change carrying actor, before/after logical keys, and the resulting snapshot hash;
- is bound by the same diff caps as any other writer. A cap breach fails the request rather than escalating to an approval queue, because there is no approval queue for this path.

Automated, source-derived group ingestion is separate and keeps its governance. Add the symmetric `item-group-canonical-preview` / `item-group-canonical-apply` pair to the V2 capability manifest and backend registry for recipe reference regeneration and shimmer-derived groups. Both start at `L0 + DISABLED` and the apply operation cannot execute until its independent Owner activation. That pair never carries an admin-authored change.

Consequence for the locked catalog: the group pair remains justified by source-derived ingestion even though the admin proposal flow is gone, so the count still grows. It grows in two stages rather than one: 19 -> 21 when the group pair registers, then 21 -> 23 when the NPC pair registers. See Migration Sequence.

Backend caches are keyed by the published snapshot hash plus the consumer's effective-source predicate, not a time-only TTL. Each read checks the singleton `item_group_projection_state` before reusing cached content. A changed, missing, non-published, or count-mismatched state invalidates every consumer's cache and fails closed rather than serving a mixed snapshot. Post-commit verification checks `/admin/item-groups`, `/admin/recipe-groups`, and representative `/public/items/{id}/recipe-tree` responses against the same published hash.

During migration, shadow comparison may read both DB and JSON. The JSON result is never allowed to silently fill a missing DB result after B1 closure. A mismatch blocks cutover and emits a report containing group, alias, member, domain, source, and blocked-state differences.

## Compatibility Export Contract

The three group files remain tracked compatibility artifacts.

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

This section has an unmet prerequisite. Its disposition is open decision D2.

### The immediate defect, and its independent repair

Two registrations point at a deliberately untracked artifact (see Context). Both are wrong today, independently of whether the canonical NPC chain is ever built:

- `source-dataset-locator.mjs:170` silently skips `npcs_raw` when the ignored path is absent, because the locator only pushes a descriptor for files that exist. On any clean clone this means the dataset is not merely stale, it is not landed at all, and nothing says so.
- `docs/audits/canonical-migration-boundary.md` registers the same path as a B1 exemption input with a migration target and deadline, treating a build artifact as durable source data.

The repair is small and does not depend on the rest of this section: require an explicit accepted landing/maint source descriptor, fail loudly with a concise missing-source error rather than silently omitting the dataset, and correct the boundary registration to name a real input. Whether this ships ahead of the canonical chain is open decision D4.

### The prerequisite that does not currently hold

The canonical NPC design below consumes crawler normalized records and their matching audit records. Those artifacts do not exist in this repository: `data/wiki-crawler/` contains only `README.md`, and `audit/`, `canonical/`, `normalized-light/`, and `report/` are all ignored by the same 2026-04-20 commit. Producing them requires a real crawler run, which this design's Non-Goals forbid.

Two consequences must be stated rather than discovered during implementation:

- `npc_crawler_facts_raw` has no bootstrap definition, and cannot have one, because there is no frozen artifact to content-address. The bootstrap bundle contract defined under Landing covers the three group files only.
- The NPC half can reach fixture-level `CODE_READY` but cannot reach `T1_VERIFIED` against real data, and cannot reach `T2_CUTOVER_VERIFIED` at all, until a crawler run is separately authorized. Migration Sequence steps 5, 12, and 13 inherit this constraint.

The `wikiCrawler.buffInflictions` enrichment is produced by `scripts/data/crawler/src/domains/npc-parser.mjs`; the bridge only relayed it. Consuming crawler normalized output directly is the right long-term target. The blocker is availability, not design.

### Target chain

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

Scripts that currently default to the missing bridge path must require an explicit accepted landing/maint source descriptor. `backfill-npc-buff-relations-from-wiki-crawler.mjs:127` uses the bridge path as a `??` fallback default and is the concrete instance. They fail with a concise missing-source error rather than silently switching to the base standardized file or silently omitting the dataset. NPC coverage compares base landing, crawler-fact landing, maint facts, relation, projection, and local identities and hashes, including positive buff/shop/loot samples.

No compatibility exporter is built for the bridge path. An earlier draft proposed regenerating it from accepted `maint_npcs` and `maint_npc_crawler_facts`. That is removed as dead weight: the path is gitignored, so unlike the three group files it is not a tracked compatibility artifact, and the same draft already required that no canonical or automated consumer may depend on it. Building a governed exporter whose output nothing may consume and version control does not retain has no consumer. If a local operator wants the bridge shape, the existing bridge generator still produces it.

Together, the two new preview/apply pairs deliberately expand the locked V2 capability catalog from 19 to 23 operations: `item-group-canonical-preview` / `-apply` for source-derived group ingestion, and `npc-crawler-facts-preview` / `-apply`. They register in two stages, 19 -> 21 then 21 -> 23, matching the two independently authorized chains. The admin group writer is not among them; it is a backend-owned writer with a `tableOwnershipMatrix` row, not a crawler-monitor operation. At each stage the manifest count, exact-ID contract, progress ownership, preview/apply symmetry, disabled defaults, backend registry, admin overview, and ownership tests change atomically. All four new operations start at `L0 + DISABLED`; neither apply shares an approval with the other. If D2 defers the NPC chain indefinitely, the catalog stops at 21.

## Write Ownership And Safety

The new tables and landing fields must be added to the authoritative local Flyway, maint schema, relation/projection schema catalogs, relation table catalog, and `tableOwnershipMatrix`. Group ingestion owns only the group tables listed above. NPC crawler-fact ingestion owns only `maint_npc_crawler_facts` and the already registered crawler-owned fields/scopes of `maint_item_sources` and NPC relation targets. Neither capability can mutate item identity, NPC base identity, or image ownership tables.

Three writers touch the group tables and all three need ownership rows:

| Writer | Owned rows | Governance |
| --- | --- | --- |
| `item-group-canonical-apply` | `recipe_reference`, `recipe_override`, `source_group` rows plus projection state | L1 capability, `L0 + DISABLED` by default |
| `admin_item_group_writer` | `central_override` rows only, plus projection state | backend-owned, synchronous, ADMIN-authenticated, no approval queue |
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

### Step 0, independent of everything below

0. Correct the two bridge registrations: require an explicit landing source descriptor with a loud missing-source failure, and replace the untracked path in the boundary registration with a real input. Whether this ships as its own change is open decision D4; it must not be blocked behind the canonical chain either way.

### Group chain

1. Add schema/catalog/ownership contracts, landing artifact-role fields, and isolated schema tests. This includes the `current_slot` replacement of the `is_current` unique key on the shared `source_dataset_landings` table; see the shared-table note below.
2. Add pure group parsers and deterministic canonical key/member/alias normalization tests.
3. Add immutable group bootstrap and steady-state landing descriptors; reject compatibility-export feedback.
4. Add group maint ingestion, single-pass relation resolution with retained source layers, and local projection.
5. Add backend repositories and DB shadow readers while JSON remains the live source.
6. Convert the admin write path from file writes to the transactional `admin_item_group_writer`, and register the `item-group-canonical-preview` / `-apply` pair at `L0 + DISABLED` for source-derived ingestion. Locked catalog count moves 19 -> 21.
7. Add the independent deterministic compatibility export jobs, including the group/non-group merge and round-trip equivalence.
8. Add positive canonical readiness reports and the legacy-to-canonical source contract registry.
9. Reach `CODE_READY` through focused tests and consumer scans without formal writes.
10. Run the complete group chain in isolated T1 databases and reach `T1_VERIFIED`.
11. Obtain authorization bound to the exact formal DDL and three database fingerprints. After schema verification, obtain one System Owner approval bound to the frozen item-group bootstrap bundle.
12. On formal databases, apply the frozen bootstrap once, run per-consumer shadow comparison, cut over DB reads, disable JSON fallback, restart the local stack through the standard lifecycle scripts, and run real read-only API/runtime smoke.
13. Reach `T2_CUTOVER_VERIFIED` for the group chain and flip the three group source contracts from `b1` to `canonical`. Regenerate the group readiness report.

### NPC chain

14. Blocked on D2. Add `npcs_base_raw`, `npc_crawler_facts_raw`, `maint_npc_crawler_facts`, and their guarded processors; register the `npc-crawler-facts-preview` / `-apply` pair at `L0 + DISABLED`. Locked catalog count moves 21 -> 23.
15. Fixture-level `CODE_READY` is reachable here. `T1_VERIFIED` against real data and any T2 cutover require a separately authorized crawler run, because no crawler-fact artifact exists to freeze. Provisional NPC caps must be re-derived from that run.
16. On its own authorization and its own frozen bundle, apply, verify, and flip the NPC source contract.

### Closure

17. Rerun the complete quality gate from the beginning; only a passing gate permits `B1_CLOSED`.

Contract flips are per input, not atomic across all four. An earlier draft required changing all four contracts in one step, which coupled two independently authorized workstreams: the group chain would have delivered zero gate improvement until the NPC chain also landed, even though step 11 and step 16 are deliberately separate approvals. Each of the four legacy identities flips when its own readiness evidence passes. `B1_CLOSED` still requires all four.

Steps 1-10 and 14-15 do not authorize any formal database mutation. Every authorization is a hard checkpoint and none are interchangeable. If DDL succeeds but a data apply fails, the unused new tables may remain after schema verification, but pre-cutover readers remain unchanged, no fallback is disabled, and B1 remains active. Any data/cutover failure rolls back or circuit-breaks under the existing latest-writer rules.

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
4. Admin contract tests proving edit/delete capabilities come from backend data rather than file paths, that an admin edit commits maint/relation/local/projection-state in one transaction, and that a cap breach on the admin path fails the request rather than queueing anything.
5. Concurrency tests proving an admin override commit and a source refresh cannot interleave on the same normalized canonical keys, and that the admin writer cannot modify a `recipe_reference`, `recipe_override`, or `source_group` row.
6. T0 and T1 isolated three-database acceptance using their distinct required prefixes for rollback, commit, verification, export, and restoration.
7. Per-consumer zero-diff shadow reports covering identity, names, domains, aliases, members, source metadata, blocked state, and recipe expansion rows, each evaluated against that consumer's effective-source predicate.
8. Export round-trip equivalence: rendering canonical state to each compatibility file and re-parsing it reproduces exactly the canonical group state, including blocked groups. Determinism tests alone are insufficient because they prove stability, not fidelity.
9. Export merge tests for `recipe-material-reference.json` proving the non-group sections are carried from the same landing revision, that a revision mismatch blocks, and that unavailable non-group evidence fails the job instead of publishing a file with truncated `supplementalRecipes`.
10. NPC coverage across base landing, crawler-fact landing, maint facts, relation, projection, and local rows, including positive NPC-Buff/shop/loot samples. Fixture-backed until a crawler run is authorized; fixture evidence must be labeled and cannot satisfy `mode = 'canonical'`.
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

Replace the current path-only matcher in `scripts/data/audit/b1-exemption-compliance.mjs` with `scripts/data/audit/canonical-source-contract-registry.mjs`. Each of the four legacy input identities remains permanently represented with exactly one mode:

- `mode = 'b1'`: validate the boundary registration and deadline;
- `mode = 'canonical'`: validate a named positive canonical readiness report and its T2 cutover identity.

The seven domain references point to those four contracts instead of duplicating physical migration work. A domain with an expected contract count of zero, a missing contract, an unknown mode, or a missing readiness report is blocked.

**Open decision D1: the gap between `b1` and `canonical`.** As written, the two modes leave no legitimate state for work in progress. `mode = 'canonical'` requires a fresh readiness report generated after an authorized T2 cutover; the Migration states table forbids `CODE_READY` or `T1_VERIFIED` from downgrading an expired blocker; and extending a deadline with no evidence is rejected above. The consequence is that the repository gate stays blocked for the entire duration of the migration with no passing path, which in practice pressures the next contributor to suppress the check rather than satisfy it.

The distinction this design has not drawn is between extending a deadline with nothing behind it, which is concealment, and re-registering a bounded deadline bound to approved, evidenced, in-progress work, which is ordinary governance. If D1 is answered yes, add a third mode:

- `mode = 'b1_migrating'`: validate an approved design reference, a named milestone evidence artifact matching the current declared state, and a re-registered deadline within a bounded window. A missing or stale milestone artifact, an unrecognized declared state, or a deadline beyond the window is blocked exactly as an expired `b1` row is today.

That mode would not weaken closure: `B1_CLOSED` would still require `mode = 'canonical'` on all four contracts with fresh T2 evidence. It only distinguishes "not yet migrated, and nothing is happening" from "not yet migrated, and here is the evidence of progress". If D1 is answered no, the branch cannot pass the repository gate until the group chain reaches step 13 and the NPC chain reaches step 16, and that should be stated as an accepted cost rather than left implicit.

Two read-only positive reports are required:

| Report path | Required evidence |
| --- | --- |
| `reports/canonical-migration/canonical-item-group-readiness.json` | formal schema/version; landing/maint/relation/local counts and hashes; per-consumer shadow parity; zero runtime/admin direct reads; JSON fallback disabled; API snapshot hash; export freshness |
| `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json` | formal base and crawler-fact landing freshness; maint match counts; NPC-Buff/shop/loot relation and local hashes; zero bridge-path reads outside explicit bootstrap/export compatibility code; positive API/runtime samples |

The reports declare `requiresDatabase: true`, `writesDatabase: false`, exact formal database roles, generation time, source snapshot hashes, code commit, and cutover run/decision identity. They must be generated after the exact cutover and be no older than 24 hours when the closure gate runs. Fixture or T1 reports can prove `CODE_READY`/`T1_VERIFIED`, but cannot satisfy `mode = 'canonical'`.

Add both reports to the domain acceptance report manifest, freshness audit, manual-only refresh plan, backend acceptance DTO/API, admin acceptance view, and `quality-gate.sh`. The refresh plan displays the read-only generation commands but never executes them. Missing, malformed, stale, unknown-risk, database-writing, or non-T2 evidence is blocking. UI/API consumers render the backend-owned report state and do not derive freshness independently.

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
