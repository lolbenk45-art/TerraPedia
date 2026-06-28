# Front Biome Zh Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前台生态页面中文化，并把已有 biome 数据细分展示到资源、掉落、NPC 出现、来源证据和群系关系几个可读分区。

**Architecture:** 后端 public biome detail 继续走现有 `BiomeService`，但补齐 `itemBiomes`、`npcBiomes`、`itemSources` 三类数组，让 public 前台直接消费和筛选。前台生态索引页与详情页只负责呈现和中文标签映射，不再猜测数据含义；管理端现有 biome 详情测试作为字段对照，前台再补一组 public 侧契约测试和页面结构检查。

**Tech Stack:** Spring Boot + MyBatis-Plus + JUnit 5 + Nuxt 3 + TypeScript + existing public API composables + existing public page check scripts.

---

## Execution Boundaries

- No crawler, import, backfill, refresh, or database write commands are part of this plan.
- This plan may read local API/DB state to prove the existing chain, but must not mutate data.
- Public page copy must not include player-facing `Wiki`, `API`, `接口`, `后端`, `结构化`, `追踪`, `追溯`, `聚合`, `fallback`, `/public/`, or `静态样例`.
- Do not hard-code `terraria.wiki.gg` into templates. It may remain in backend test fixtures and returned source data.
- Full `check-visual-regression.mjs` is a final broad regression option only; task red/green uses scoped checks and `pnpm run check`.
- If local runtime validation is needed, use `http://localhost:18088` for backend and `http://localhost:5174` for front unless `ss -ltnp` proves a different active local-stack port.

## 2026-06-14 Addendum: Biome Drop Source Clarity

**User-visible problem:** 群系详情页的“掉落”只列出物品，不能清楚说明每个物品来自 Boss、NPC、NPC 族群、宝藏袋、环境/世界、宝箱、宝匣或文字来源记录。

**Data-chain finding:** `item_acquisition_sources` already stores biome-scoped rows with `source_type` and `source_ref_type`. The chain contains `drop/npc`, `drop/boss`, `drop/npc_group`, `treasure_bag/treasure_bag`, `crate/crate`, `container/container`, `worldgen/world`, `mining/world`, and `biome_wikitext` phrase rows. Current public biome service only exposes `source_ref_type = biome_wikitext`, so structured source rows are hidden from the public page.

**Closure definition:** Public biome detail returns public-safe structured `itemSources`, including `sourceRefId`; the public biome page groups source rows in the drop/source area by source ownership: Boss 掉落、NPC 掉落、NPC 族群、宝藏袋、环境与世界、宝箱与宝匣、钓鱼/采集/资源、商店/其他来源. Existing generic item-biome and resource rows remain visible as supplemental records.

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/BiomeServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/dto/BiomeItemSourceDTO.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/BiomeServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicBiomeControllerTest.java`
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/pages/biomes/[id].vue`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

**Validation:**
- `cd back && mvn -Dtest=BiomeServiceImplTest,PublicBiomeControllerTest test`
- `cd front-nuxt && pnpm run check:public-pages`
- `cd front-nuxt && pnpm run check`
- Runtime smoke, if stack is up: `curl -fsS http://localhost:18088/api/public/biomes/1` and `curl -fsS http://localhost:18088/api/public/biomes/2`, confirming Forest exposes `From the King Slime` phrase rows and Jungle exposes structured Boss/NPC/container/crate/world rows.

### Task 1: Public biome detail contract

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/BiomeServiceImpl.java`
- Reference only: `back/src/main/java/com/terraria/skills/dto/BiomeDTO.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/BiomeServiceImplTest.java`
- Create: `back/src/test/java/com/terraria/skills/controller/PublicBiomeControllerTest.java`

- [ ] **Step 1: Write the failing tests**

Add a service test that builds a biome with:

```java
Biome biome = new Biome();
biome.setId(10L);
biome.setCode("forest");
biome.setNameEn("Forest");
biome.setNameZh("森林");
biome.setStatus(1);
biome.setDeleted(0);

Item item = new Item();
item.setId(50L);
item.setName("Wood");
item.setNameZh("木材");
item.setInternalName("Wood");
item.setImage("https://terraria.wiki.gg/images/Wood.png");

Npc npc = new Npc();
npc.setId(70L);
npc.setName("Green Slime");
npc.setNameZh("绿史莱姆");
npc.setInternalName("GreenSlime");
npc.setImageUrl("http://localhost:9000/terrapedia-images/npcs/green-slime.png");

ItemBiome itemBiome = new ItemBiome();
itemBiome.setId(60L);
itemBiome.setBiomeId(10L);
itemBiome.setItemId(50L);
itemBiome.setRelationType("drop");
itemBiome.setSortOrder(1);

NpcBiome npcBiome = new NpcBiome();
npcBiome.setId(80L);
npcBiome.setBiomeId(10L);
npcBiome.setNpcId(70L);
npcBiome.setRelationType("appears_in");
npcBiome.setSpawnContext("During the day");
npcBiome.setSortOrder(2);

ItemAcquisitionSource itemSource = new ItemAcquisitionSource();
itemSource.setId(90L);
itemSource.setItemId(50L);
itemSource.setBiomeId(10L);
itemSource.setSourceType("drop");
itemSource.setSourceRefType("biome_wikitext");
itemSource.setSourceRefName("From Goblin Scouts");
itemSource.setSourceProvider("terraria.wiki.gg");
itemSource.setSourcePage("Forest");
itemSource.setSortOrder(3);

ItemAcquisitionSource unrelatedItemSource = new ItemAcquisitionSource();
unrelatedItemSource.setId(91L);
unrelatedItemSource.setItemId(50L);
unrelatedItemSource.setBiomeId(10L);
unrelatedItemSource.setSourceType("drop");
unrelatedItemSource.setSourceRefType("npc");
unrelatedItemSource.setSourceRefName("Green Slime");
unrelatedItemSource.setSourceProvider("terraria.wiki.gg");
unrelatedItemSource.setSourcePage("Forest");
unrelatedItemSource.setStatus(1);
unrelatedItemSource.setDeleted(0);
```

Assert that `BiomeServiceImpl.getBiomeById(10L)` returns `BiomeDTO` with non-empty `itemBiomes`, `npcBiomes`, and `itemSources`, and that the controller public endpoint returns those fields through `ApiResponse`.

The test must also assert:

```java
assertEquals("木材", detail.getItemBiomes().get(0).getItemNameZh());
assertEquals("绿史莱姆", detail.getNpcBiomes().get(0).getNpcNameZh());
assertEquals("biome_wikitext", detail.getItemSources().get(0).getSourceRefType());
assertEquals("From Goblin Scouts", detail.getItemSources().get(0).getSourceRefName());
assertEquals(Boolean.FALSE, detail.getItemBiomes().get(0).getMissingItem());
assertEquals(Boolean.FALSE, detail.getNpcBiomes().get(0).getMissingNpc());
assertEquals(1, detail.getItemSources().size());
```

The negative fixture must prove non-`biome_wikitext` item sources are excluded. Add a deleted or inactive `NpcBiome` and assert it is not returned.

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
cd back
mvn -Dtest=BiomeServiceImplTest,PublicBiomeControllerTest test
```

Expected: fail because public biome detail still drops those arrays.

- [ ] **Step 3: Implement minimal service expansion**

Add loading and mapping for:

```java
List<ItemBiome> itemBiomes = itemBiomeMapper.selectList(new LambdaQueryWrapper<ItemBiome>()
    .eq(ItemBiome::getBiomeId, id)
    .orderByAsc(ItemBiome::getSortOrder, ItemBiome::getId));
List<NpcBiome> npcBiomes = npcBiomeMapper.selectList(new LambdaQueryWrapper<NpcBiome>()
    .eq(NpcBiome::getBiomeId, id)
    .eq(NpcBiome::getStatus, 1)
    .eq(NpcBiome::getDeleted, 0)
    .orderByAsc(NpcBiome::getSortOrder, NpcBiome::getId));
List<ItemAcquisitionSource> itemSources = itemAcquisitionSourceMapper.selectList(new LambdaQueryWrapper<ItemAcquisitionSource>()
    .eq(ItemAcquisitionSource::getBiomeId, id)
    .eq(ItemAcquisitionSource::getSourceRefType, "biome_wikitext")
    .eq(ItemAcquisitionSource::getStatus, 1)
    .eq(ItemAcquisitionSource::getDeleted, 0)
    .and(wrapper -> wrapper.eq(ItemAcquisitionSource::getSourceProvider, "terraria.wiki.gg")
        .or()
        .isNull(ItemAcquisitionSource::getSourceProvider))
    .orderByAsc(ItemAcquisitionSource::getSortOrder, ItemAcquisitionSource::getId));
```

Map them into `BiomeDTO` by intentionally duplicating the current `AdminBiomeController.toDetailDto` enrichment in `BiomeServiceImpl`; do not extract shared admin/public services in this task. Include `missingItem` / `missingNpc` markers and managed item images. Also switch existing public `resources` image enrichment from raw `item.getImage()` to `managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId)` for parity with admin detail.

Add these constructor dependencies to `BiomeServiceImpl`:

```java
private final ItemBiomeMapper itemBiomeMapper;
private final NpcBiomeMapper npcBiomeMapper;
private final ItemAcquisitionSourceMapper itemAcquisitionSourceMapper;
private final NpcMapper npcMapper;
private final ManagedItemImageResolver managedItemImageResolver;
```

Add these import categories explicitly:

```java
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.terraria.skills.dto.BiomeItemRelationDTO;
import com.terraria.skills.dto.BiomeItemSourceDTO;
import com.terraria.skills.dto.BiomeNpcRelationDTO;
import com.terraria.skills.entity.ItemAcquisitionSource;
import com.terraria.skills.entity.ItemBiome;
import com.terraria.skills.entity.Npc;
import com.terraria.skills.entity.NpcBiome;
import com.terraria.skills.mapper.ItemAcquisitionSourceMapper;
import com.terraria.skills.mapper.ItemBiomeMapper;
import com.terraria.skills.mapper.NpcBiomeMapper;
import com.terraria.skills.mapper.NpcMapper;
import com.terraria.skills.service.ManagedItemImageResolver;
import java.util.LinkedHashSet;
import java.util.Set;
```

`PublicBiomeControllerTest` must assert serialized JSON fields using MockMvc or Jackson serialization, including:

```text
$.data.itemBiomes[0].itemNameZh == 木材
$.data.npcBiomes[0].npcNameZh == 绿史莱姆
$.data.itemSources[0].sourceRefType == biome_wikitext
```

- [ ] **Step 4: Re-run the tests and confirm GREEN**

Run:

```bash
cd back
mvn -Dtest=BiomeServiceImplTest,PublicBiomeControllerTest test
```

Expected: PASS.

---

### Task 2: Front biome detail UI

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/usePublicBiomeDetail.ts`
- Modify: `front-nuxt/pages/biomes/[id].vue`
- Modify: `front-nuxt/pages/biomes/index.vue`
- Test: `front-nuxt/scripts/check-public-pages.mjs`
- Test: `front-nuxt/scripts/check-visual-regression.mjs`

- [ ] **Step 1: Write the failing checks**

Add public page contract checks that require:

```ts
export type PublicBiomeItemRelation = {
  id?: number | string | null
  biomeId?: number | string | null
  itemId?: number | string | null
  relationType?: string | null
  notes?: string | null
  sortOrder?: number | string | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
  item_image?: string | null
  image?: string | null
  imageUrl?: string | null
  image_url?: string | null
  previewImage?: string | null
  previewImageUrl?: string | null
  preview_image?: string | null
  preview_image_url?: string | null
  missingItem?: boolean | null
  missing_item?: boolean | null
}

export type PublicBiomeNpcRelation = {
  id?: number | string | null
  biomeId?: number | string | null
  npcId?: number | string | null
  relationType?: string | null
  spawnContext?: string | null
  notes?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sortOrder?: number | string | null
  npcName?: string | null
  npcNameZh?: string | null
  npcInternalName?: string | null
  npcImageUrl?: string | null
  npc_image_url?: string | null
  image?: string | null
  imageUrl?: string | null
  image_url?: string | null
  previewImage?: string | null
  previewImageUrl?: string | null
  preview_image?: string | null
  preview_image_url?: string | null
  missingNpc?: boolean | null
  missing_npc?: boolean | null
}

export type PublicBiomeItemSource = {
  id?: number | string | null
  itemId?: number | string | null
  sourceType?: string | null
  sourceRefType?: string | null
  sourceRefName?: string | null
  biomeId?: number | string | null
  quantityText?: string | null
  chanceText?: string | null
  conditions?: string | null
  notes?: string | null
  sourceProvider?: string | null
  sourcePage?: string | null
  sortOrder?: number | string | null
  itemName?: string | null
  itemNameZh?: string | null
  itemInternalName?: string | null
  itemImage?: string | null
  item_image?: string | null
  image?: string | null
  imageUrl?: string | null
  image_url?: string | null
  previewImage?: string | null
  previewImageUrl?: string | null
  preview_image?: string | null
  preview_image_url?: string | null
  missingItem?: boolean | null
  missing_item?: boolean | null
}

// types/public-api.ts
export type PublicBiomeDetailResult = {
  detail: PublicBiomeListItem | null
  item: BiomeCatalogTile | null
  resources: PublicBiomeResource[]
  relations: PublicBiomeRelation[]
  itemBiomes: PublicBiomeItemRelation[]
  npcBiomes: PublicBiomeNpcRelation[]
  itemSources: PublicBiomeItemSource[]
  source: 'api' | 'missing'
}
```

Also extend `PublicBiomeListItem` with:

```ts
itemBiomes?: PublicBiomeItemRelation[] | null
npcBiomes?: PublicBiomeNpcRelation[] | null
itemSources?: PublicBiomeItemSource[] | null
```

Then require the page to render Chinese section headings for:

```text
资源
掉落
NPC 出现
来源证据
群系关系
```

and the empty states:

```text
暂无掉落数据。
暂无 NPC 出现数据。
暂无来源证据数据。
```

Add check markers in `check-public-pages.mjs` for:

```text
PublicBiomeItemRelation
PublicBiomeNpcRelation
PublicBiomeItemSource
biomeItemBiomes
biomeNpcBiomes
biomeItemSources
掉落
NPC 出现
来源证据
群系关系
```

- [ ] **Step 2: Run checks and confirm RED**

Run:

```bash
cd front-nuxt
pnpm exec node scripts/check-public-pages.mjs
pnpm run check
```

Expected: fail until the new sections and data bindings exist.

- [ ] **Step 3: Implement the front end expansion**

Update `usePublicBiomeDetail` to normalize the new arrays. The result object must always contain concrete arrays:

```ts
itemBiomes: normalizeItemBiomes(detail.itemBiomes),
npcBiomes: normalizeNpcBiomes(detail.npcBiomes),
itemSources: normalizeItemSources(detail.itemSources),
```

Update `pages/biomes/[id].vue` to create these computed arrays:

```ts
const biomeItemBiomes = computed(() => biomeBundle.value?.itemBiomes ?? [])
const biomeNpcBiomes = computed(() => biomeBundle.value?.npcBiomes ?? [])
const biomeItemSources = computed(() => biomeBundle.value?.itemSources ?? [])
const biomeDropResources = computed(() => biomeResources.value.filter((resource) => normalizeType(resource.resourceType) === 'drop'))
const biomeGeneralResources = computed(() => biomeResources.value.filter((resource) => normalizeType(resource.resourceType) !== 'drop'))
```

Update `pages/biomes/[id].vue` to render separate grids for:

```text
资源
掉落
NPC 出现
来源证据
群系关系
```

Use Chinese labels for `resourceType`, `relationType`, `sourceType`, and `spawnContext`. Keep `CommonPreviewImage` and existing card layout patterns.

The minimum label map is:

```ts
const biomeSourceTypeLabels: Record<string, string> = {
  drop: '掉落',
  resource: '资源',
  feature: '生态资源',
  fishing: '钓鱼',
  for_sale: '出售',
  worldgen: '世界生成',
}

const biomeRelationTypeLabels: Record<string, string> = {
  appears_in: '出现于',
  drop: '掉落',
  resource: '资源',
  contains: '包含',
  related: '相关',
}
```

Add helpers for item/NPC/source title and image resolution using the same alias-tolerant order as `resourceImage`. Replace visible `Wiki` and `静态样例` wording in biome index/detail copy with player-safe Chinese wording such as `资料页` and `示例内容`.

Update `pages/biomes/index.vue` copy so the index reads like a Chinese ecosystem catalog, not an English wiki index.

- [ ] **Step 4: Re-run the checks and confirm GREEN**

Run:

```bash
cd front-nuxt
pnpm exec node scripts/check-public-pages.mjs
pnpm run check
```

Expected: PASS.

---

### Task 3: Cross-agent verification

**Files:**
- Test only: `back/src/test/java/com/terraria/skills/service/impl/BiomeServiceImplTest.java`
- Test only: `back/src/test/java/com/terraria/skills/controller/PublicBiomeControllerTest.java`
- Test only: `front-nuxt/scripts/check-public-pages.mjs`
- Test only: `front-nuxt/scripts/check-visual-regression.mjs`
- Test only: `front-nuxt/pages/biomes/[id].vue`

- [ ] **Step 1: Confirm local runtime ports**

Run:

```bash
ss -ltnp | rg ':(18088|5174|3001)\b'
```

Expected:

```text
*:18088
*:5174
```

If either backend or front is missing, start or reuse the local stack:

```bash
bash ./scripts/dev/start-local-stack.sh --reuse-existing
```

- [ ] **Step 2: Run backend and frontend test slices independently**

Run backend tests:

```bash
cd back
mvn -Dtest=BiomeServiceImplTest,PublicBiomeControllerTest test
```

Run frontend checks:

```bash
cd front-nuxt
pnpm exec node scripts/check-public-pages.mjs
pnpm run check
```

- [ ] **Step 3: Verify the deterministic runtime path**

Resolve an active biome route from the running backend:

```bash
node - <<'NODE'
const backend = 'http://localhost:18088';
const front = 'http://localhost:5174';
const response = await fetch(`${backend}/api/public/biomes`);
const payload = await response.json();
const rows = Array.isArray(payload?.data) ? payload.data : [];
const forest = rows.find((row) => row.code === 'forest' || row.nameZh === '森林');
const selected = forest ?? rows[0];
if (!selected?.id) throw new Error('No public biome row available');
const detail = await fetch(`${backend}/api/public/biomes/${selected.id}`).then((res) => res.json());
const data = detail.data ?? {};
console.log(JSON.stringify({
  route: `${front}/biomes/${selected.id}`,
  nameZh: data.nameZh,
  resources: data.resources?.length ?? 0,
  itemBiomes: data.itemBiomes?.length ?? 0,
  npcBiomes: data.npcBiomes?.length ?? 0,
  itemSources: data.itemSources?.length ?? 0,
}, null, 2));
NODE
```

Expected: output has a `route`, a Chinese `nameZh`, and at least one of `resources`, `itemBiomes`, `npcBiomes`, or `itemSources` greater than `0`.

- [ ] **Step 4: Verify the page route**

Open the route printed by the previous command, normally `http://localhost:5174/biomes/1` when Forest is present, and confirm the page is public and does not require login. It must show real biome content and these Chinese sections:

```text
资源
掉落
NPC 出现
来源证据
```

If Forest is present, also confirm `森林` appears. If a different biome route is selected, confirm that route's printed `nameZh` appears.

- [ ] **Step 5: Optional scoped visual smoke**

Run the broad visual suite only after the focused checks pass:

```bash
cd front-nuxt
TERRAPEDIA_FRONT_NUXT_URL=http://localhost:5174 CHECK_LOCAL_ASSET_LEAKS=1 pnpm exec node scripts/check-visual-regression.mjs
```

If this fails on unrelated routes, record the unrelated failure and do not block the biome task solely on that failure.

- [ ] **Step 6: Commit**

Use one focused commit after tests pass:

```bash
git add back/src/main/java/com/terraria/skills/service/impl/BiomeServiceImpl.java back/src/main/java/com/terraria/skills/dto/BiomeDTO.java back/src/test/java/com/terraria/skills/service/impl/BiomeServiceImplTest.java back/src/test/java/com/terraria/skills/controller/PublicBiomeControllerTest.java front-nuxt/types/public-api.ts front-nuxt/composables/usePublicBiomeDetail.ts front-nuxt/pages/biomes/index.vue front-nuxt/pages/biomes/[id].vue front-nuxt/scripts/check-public-pages.mjs front-nuxt/scripts/check-visual-regression.mjs
git status --short
git diff --cached --stat
git diff --cached --name-only
git commit -m "feat(front): localize biome detail and split biome data"
```

## Validation
- Backend red-green: `BiomeServiceImplTest`, `PublicBiomeControllerTest`
- Frontend contract: `check-public-pages.mjs`
- Frontend type/runtime compile: `pnpm run check`
- Deterministic runtime smoke: `GET http://localhost:18088/api/public/biomes`, `GET http://localhost:18088/api/public/biomes/{id}`, and browser check of `http://localhost:5174/biomes/{id}`
- Optional broad regression: scoped environment run of `check-visual-regression.mjs`

## Residual Risk
- `npcBiomes` and `itemSources` are already present in admin DTOs, but public copy may need one extra normalization pass if API field names differ from admin naming.
- The public detail page can still look sparse if some biomes genuinely have only `resources`; that is a data condition, not a UI bug.
