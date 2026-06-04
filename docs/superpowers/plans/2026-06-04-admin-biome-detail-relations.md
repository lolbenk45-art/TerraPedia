# Admin Biome Detail Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin biome detail dialog show the biome detail data that was just ingested: item-biome relations, NPC biome appearances, and wiki item-source evidence.

**Architecture:** Keep `/admin/biomes/{id}` as the single admin detail endpoint. Extend its DTO with three read-only arrays populated from `item_biomes`, `npc_biomes`, and `item_acquisition_sources`, then render those arrays in the existing `data-query-app/pages/entities/[type].vue` biome detail layout. Existing `resources` and `relations` remain unchanged.

**Tech Stack:** Java/Spring Boot + MyBatis-Plus backend, MySQL local data, Nuxt/Vue admin app, Node contract tests.

---

## Scope

In scope:

- Backfill-facing admin display only.
- Backend read path for `/admin/biomes/{id}`.
- Admin biome detail modal sections:
  - item biome relations from `item_biomes`
  - NPC appearances from `npc_biomes`
  - wiki source evidence from `item_acquisition_sources` where `source_ref_type='biome_wikitext'`
- Contract tests and focused backend tests.

Out of scope:

- Crawling, parsing, importing, or changing data.
- Public frontend pages.
- Editing the item/NPC detail pages.
- Reworking the existing admin biome visual style.
- Manual editing forms for the new relation arrays.

## Files

Backend:

- Modify: `back/src/main/java/com/terraria/skills/dto/BiomeDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/BiomeItemRelationDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/BiomeNpcRelationDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/BiomeItemSourceDTO.java`
- Create: `back/src/main/java/com/terraria/skills/entity/ItemBiome.java`
- Create: `back/src/main/java/com/terraria/skills/entity/NpcBiome.java`
- Create: `back/src/main/java/com/terraria/skills/mapper/ItemBiomeMapper.java`
- Create: `back/src/main/java/com/terraria/skills/mapper/NpcBiomeMapper.java`
- Modify: `back/src/main/java/com/terraria/skills/mapper/ItemAcquisitionSourceMapper.java` only if a custom query is needed; otherwise use the existing `BaseMapper`.
- Modify: `back/src/main/java/com/terraria/skills/mapper/NpcMapper.java` is not expected; inject and use the existing mapper.
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBiomeController.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminBiomeControllerTest.java`

Admin UI:

- Modify: `data-query-app/pages/entities/[type].vue`
- Modify: `data-query-app/tests/biome-admin-detail-contract.test.mjs`

## Task 1: Backend DTO And Detail Endpoint

- [ ] **Step 1: Write failing backend test**

Add a test to `back/src/test/java/com/terraria/skills/controller/AdminBiomeControllerTest.java` that constructs:

- one `ItemBiome` for `Wood`
- one unresolved `ItemBiome` whose `item_id` does not resolve
- one `NpcBiome` for `GreenSlime`
- one unresolved `NpcBiome` whose `npc_id` does not resolve
- one `ItemAcquisitionSource` with `source_ref_type='biome_wikitext'`

Expected assertions:

- `detail.getItemBiomes().size() == 2`
- resolved item relation has item name, Chinese name, internal name, relation type, notes, sort order, and managed image
- unresolved item relation is still returned with `missingItem=true` and its raw `itemId`
- `detail.getNpcBiomes().size() == 2`
- resolved NPC relation has NPC name, Chinese name, internal name, spawn context, notes, source page, and image URL
- unresolved NPC relation is still returned with `missingNpc=true` and its raw `npcId`
- `detail.getItemSources().size() == 1`
- first source has item name, Chinese name, internal name, source type, source ref type, source ref name, notes, source provider, source page, sort order, and managed image
- existing `resources` still returns independently even when the same item also appears in `itemBiomes`

Run:

```bash
cd back
mvn -Dtest=AdminBiomeControllerTest test
```

Expected: fail because DTO fields, entities, and mappers do not exist yet.

- [ ] **Step 2: Add backend model classes**

Create DTOs:

- `BiomeItemRelationDTO`
- `BiomeNpcRelationDTO`
- `BiomeItemSourceDTO`

Exact DTO fields:

- `BiomeItemRelationDTO`: `id`, `biomeId`, `itemId`, `relationType`, `notes`, `sortOrder`, `itemName`, `itemNameZh`, `itemInternalName`, `itemImage`, `missingItem`.
- `BiomeNpcRelationDTO`: `id`, `biomeId`, `npcId`, `relationType`, `spawnContext`, `notes`, `sourceProvider`, `sourcePage`, `sortOrder`, `npcName`, `npcNameZh`, `npcInternalName`, `npcImageUrl`, `missingNpc`.
- `BiomeItemSourceDTO`: `id`, `itemId`, `sourceType`, `sourceRefType`, `sourceRefName`, `biomeId`, `quantityText`, `chanceText`, `conditions`, `notes`, `sourceProvider`, `sourcePage`, `sortOrder`, `itemName`, `itemNameZh`, `itemInternalName`, `itemImage`, `missingItem`.

Create entities and mappers:

- `ItemBiome` mapped to `item_biomes`; this table has no `status` or `deleted` columns, so do not add those fields.
- `NpcBiome` mapped to `npc_biomes`; include `status` and `@TableLogic deleted`.
- `ItemBiomeMapper`
- `NpcBiomeMapper`

- [ ] **Step 3: Extend `BiomeDTO`**

Add:

```java
private List<BiomeItemRelationDTO> itemBiomes = new ArrayList<>();
private List<BiomeNpcRelationDTO> npcBiomes = new ArrayList<>();
private List<BiomeItemSourceDTO> itemSources = new ArrayList<>();
```

- [ ] **Step 4: Populate arrays in `AdminBiomeController.toDetailDto`**

Query:

- `item_biomes` by `biome_id`, ordered by `sort_order,id`
- `npc_biomes` by `biome_id`, `deleted=0`, `status=1`
- `item_acquisition_sources` by `biome_id`, `source_ref_type='biome_wikitext'`, `deleted=0`, `status=1`, and provider policy:
  - use `(source_provider='terraria.wiki.gg' OR source_provider IS NULL)` so older valid rows are not hidden
  - expose `sourceProvider` so missing-provider evidence remains visible as a quality issue

Batch-load linked `items` and `npcs`. Keep relation/source rows even when linked item/NPC metadata is missing; set `missingItem` or `missingNpc` instead of dropping the row.

Build one distinct item-id set across `resources`, `itemBiomes`, and `itemSources`; call `ItemMapper.selectBatchIds` and `ManagedItemImageResolver.resolveManagedImages` once; use that shared lookup for all item images.

Inject the new controller dependencies and update all direct constructor calls in `AdminBiomeControllerTest`:

- `ItemBiomeMapper`
- `NpcBiomeMapper`
- `ItemAcquisitionSourceMapper`
- `NpcMapper`

- [ ] **Step 5: Verify backend test passes**

Run:

```bash
cd back
mvn -Dtest=AdminBiomeControllerTest test
```

Expected: pass.

## Task 2: Admin UI Contract And Rendering

- [ ] **Step 1: Write failing admin contract test**

Extend `data-query-app/tests/biome-admin-detail-contract.test.mjs` to assert the biome detail section contains:

- `biomeItemRelationCards`
- `biomeNpcRelationCards`
- `biomeItemSourceCards`
- visible section headings:
  - `物品关系`
  - `NPC 出现`
  - `来源证据`
- existing headings `相关群系` and `资源与物品`
- `v-if`/`v-for` blocks for each new section
- empty-state text for each new section
- biome-scoped overflow CSS for long source/reference text

Run:

```bash
cd data-query-app
node --test tests/biome-admin-detail-contract.test.mjs
```

Expected: fail because these computed values and sections do not exist yet.

- [ ] **Step 2: Add computed card normalizers**

In `data-query-app/pages/entities/[type].vue`, add computed arrays:

- `biomeItemRelationCards`
- `biomeNpcRelationCards`
- `biomeItemSourceCards`

Add an array-only helper for backend DTO arrays instead of routing new fields through `getBiomeStructuredArray`, which is primarily for legacy structured JSON/string arrays.

Use existing `pickFirstString` and card normalization patterns. Do not introduce a new component unless the page becomes unmanageable.

Item relation and source cards must expose `raw` with `itemId`, `itemInternalName`, and image fields compatible with `canOpenLinkedItemDetail`. NPC cards should display image/name/context but should not add an NPC detail link unless an established linked NPC opener already exists in this page.

- [ ] **Step 3: Render three sections**

In the existing biome detail block, keep the current `相关群系` and `资源与物品` sections intact, then add sections in this order:

- `物品关系`
- `NPC 出现`
- `来源证据`

Reuse existing `armor-detail__item-grid`, `armor-detail__item-card`, `preview-note`, and `armor-detail__item-meta` patterns so the style matches the current admin page.

Update hero pills/stats to include separate counts for `物品关系`, `NPC 出现`, and `来源证据`, without changing the meaning of existing `关系` and `资源` counts.

Add biome-scoped overflow protection:

```css
.biome-detail .armor-detail__item-body,
.biome-detail .armor-detail__item-body strong,
.biome-detail .armor-detail__item-body span,
.biome-detail .preview-note p {
  min-width: 0;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 4: Verify admin contract test passes**

Run:

```bash
cd data-query-app
node --test tests/biome-admin-detail-contract.test.mjs
```

Expected: pass.

## Task 3: Runtime Smoke And Quality Gate

- [ ] **Step 1: Verify DB has forest sample data**

Run:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -e "
SELECT b.id,b.code FROM biomes b WHERE b.code='forest';
SELECT COUNT(*) item_biomes FROM item_biomes ib JOIN biomes b ON b.id=ib.biome_id WHERE b.code='forest';
SELECT COUNT(*) npc_biomes FROM npc_biomes nb JOIN biomes b ON b.id=nb.biome_id WHERE b.code='forest' AND nb.deleted=0;
SELECT COUNT(*) item_sources_strict FROM item_acquisition_sources ias JOIN biomes b ON b.id=ias.biome_id WHERE b.code='forest' AND ias.source_ref_type='biome_wikitext' AND ias.source_provider='terraria.wiki.gg' AND ias.deleted=0 AND ias.status=1;
SELECT COUNT(*) item_sources_relaxed FROM item_acquisition_sources ias JOIN biomes b ON b.id=ias.biome_id WHERE b.code='forest' AND ias.source_ref_type='biome_wikitext' AND (ias.source_provider='terraria.wiki.gg' OR ias.source_provider IS NULL) AND ias.deleted=0 AND ias.status=1;
"
```

Expected: forest exists; counts are non-zero; relaxed count must be greater than or equal to strict count.

- [ ] **Step 2: Start or reuse local stack**

If stack is not running:

```bash
bash ./scripts/dev/start-local-stack.sh
```

- [ ] **Step 3: Smoke `/admin/biomes/{forestId}`**

Run the admin endpoint against the local backend and verify JSON contains:

- `itemBiomes`
- `npcBiomes`
- `itemSources`
- `resources`
- non-empty forest `itemBiomes`, including a known forest item such as `Wood`, `Gel`, or `Daybloom`
- non-empty forest `npcBiomes`, including `GreenSlime` or another forest NPC with `spawnContext`
- non-empty forest `itemSources` with `sourcePage`
- existing `resources` still non-empty

- [ ] **Step 4: Run focused verification**

Run:

```bash
cd back
mvn -Dtest=AdminBiomeControllerTest test
cd ../data-query-app
node --test tests/biome-admin-detail-contract.test.mjs
```

- [ ] **Step 5: Commit focused changes**

Run:

```bash
git status --short
git diff --cached --stat
```

Stage explicit files only and commit:

```bash
git add back/src/main/java/com/terraria/skills/dto/BiomeDTO.java \
  back/src/main/java/com/terraria/skills/dto/BiomeItemRelationDTO.java \
  back/src/main/java/com/terraria/skills/dto/BiomeNpcRelationDTO.java \
  back/src/main/java/com/terraria/skills/dto/BiomeItemSourceDTO.java \
  back/src/main/java/com/terraria/skills/entity/ItemBiome.java \
  back/src/main/java/com/terraria/skills/entity/NpcBiome.java \
  back/src/main/java/com/terraria/skills/mapper/ItemBiomeMapper.java \
  back/src/main/java/com/terraria/skills/mapper/NpcBiomeMapper.java \
  back/src/main/java/com/terraria/skills/controller/AdminBiomeController.java \
  back/src/test/java/com/terraria/skills/controller/AdminBiomeControllerTest.java \
  data-query-app/pages/entities/[type].vue \
  data-query-app/tests/biome-admin-detail-contract.test.mjs \
  docs/superpowers/plans/2026-06-04-admin-biome-detail-relations.md
git commit -m "feat(admin): show biome relation details"
```

## Acceptance

- `/admin/biomes/{id}` returns existing `relations/resources` plus `itemBiomes/npcBiomes/itemSources`.
- Admin biome detail dialog shows counts and sections for resources, item relations, NPC appearances, and source evidence.
- Forest biome can be used as smoke sample because it has non-zero rows in all target tables.
- No crawler, import, or DB-writing command is run by this feature work.
