# NPC Detail Item Image Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the NPC detail page image gap where NPC portraits render, but NPC loot/shop item icons fall back to `ITEM` because public NPC aggregate entries have null item image URLs.

**Architecture:** Keep the public API contract stable and fix the data-consumer boundary first. `PublicNpcServiceImpl` should keep returning `NpcLootEntryDTO.imageUrl` / `NpcShopEntryDTO.imageUrl`, but resolve those values through the existing managed item image chain (`item_images.cached_url` via `ManagedItemImageResolver`) instead of relying only on `items.image`. Frontend work is limited to positive render tests and contract coverage so the UI proves it renders aggregate-provided item images.

**Tech Stack:** Spring Boot, MyBatis-Plus, JdbcTemplate, JUnit 5, Mockito, Vue 3, Vitest, TerraPedia data audit scripts, local MySQL/MinIO stack.

---

## Success Criteria

- Code closure: backend tests prove NPC loot/shop images are resolved through `ManagedItemImageResolver`, frontend tests prove aggregate-provided item images render, and existing managed `items.image` fallback still works.
- Runtime closure: `/api/public/npcs/253/aggregate?include=loot,shop,buffs` returns managed `imageUrl` values for Reaper loot rows whose items have managed image assets.
- Data closure: Task 0 evidence proves whether those managed item image assets exist in `item_images.cached_url`. If they do not exist, code work is complete but the visible Reaper item icons are not closed until a separate approved data repair populates managed item assets.
- Safety closure: no raw wiki image URLs are exposed in public NPC loot/shop `imageUrl`, and no DB-writing command runs in this plan.

## Confirmed Scope

Current evidence:

- Reaper NPC detail page: `/npcs/253`.
- NPC portrait is not the active failure: `data.npc.imageUrl` is present and the image request returns 200.
- Visible missing images are loot item icons: Reaper loot rows such as `Requiem` and `Death Sickle` return `imageUrl: null`, so the UI renders the `ITEM` fallback.
- Current backend cause: `PublicNpcServiceImpl.loadStructuredLootByNpcId()` selects `i.image AS itemImage`, and `toLootEntryDto()` only exposes it when `ManagedImageUrlPolicy` accepts it.
- Current local data gap: `terria_v1_local.items.image` can be empty even when `item_images` / relation image rows exist.

Out of scope for this plan:

- Do not rewrite NPC portrait handling.
- Do not expose raw wiki URLs in public NPC loot/shop image fields.
- Do not treat frontend fallback text or CSS as the root fix.
- Do not run crawler, import, backfill, or DB-writing `--apply=true` commands during planning or automated smoke.
- Do not run item image backfill scripts as the first fix path; they are manual fallback workflows.

## File Structure

Backend implementation:

- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
  - Inject `ManagedItemImageResolver`.
  - Resolve loot/shop item images from `item_images.cached_url` through the resolver.
  - Preserve managed-only policy and existing DTO fields.
- Test: `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`
  - Add coverage for loot/shop rows whose `items.image` is missing or wiki-only while resolver returns a managed cached image.
- Existing support, no planned change: `back/src/main/java/com/terraria/skills/service/impl/ManagedItemImageResolverImpl.java`
  - Already ranks primary managed cached URLs and rejects demo/placed variants.
- Existing support, no planned change: `back/src/test/java/com/terraria/skills/service/impl/ManagedItemImageResolverImplTest.java`
  - Already covers resolver image precedence and filtering.

Frontend implementation:

- Test: `front/src/tests/npc-domain-contract.spec.ts`
  - Add positive contract coverage for loot `item_image` / `image_url` normalization.
- Test: `front/src/tests/npc-public-shell.spec.ts`
  - Add positive render coverage for loot item `<img>` from aggregate `imageUrl`.
  - Fix stale empty-loot copy expectation.
- Test: `front/src/tests/npc-public-acceptance.spec.ts`
  - Fix stale empty-loot copy expectation.
- No planned production change: `front/src/views/NpcDetailView.vue`
  - Existing render rule `entry.imageUrl || entry.itemImage` is correct when the API provides data.
- No planned production change: `front/src/api/npcDomain.ts`
  - Existing normalization already maps `image_url`, `itemImage`, and `item_image`.

Data and QA:

- Use: `scripts/data/audit/image-source-lineage-report.mjs`
- Use: `scripts/data/audit/image-asset-readiness-audit.mjs`
- Use dry-run only: `scripts/data/relation/sync-relation-item-images-to-local.mjs --apply=false`
- Use dry-run only: `scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false`
- Do not use automatically: `scripts/data/backfill/backfill-missing-item-images*.mjs`

## Multi-Agent Execution Split

Use separate agents with disjoint write scopes:

- Backend agent: owns only `PublicNpcServiceImpl.java` and `PublicNpcServiceImplImageTest.java`.
- Frontend agent: owns only `npc-domain-contract.spec.ts`, `npc-public-shell.spec.ts`, and `npc-public-acceptance.spec.ts`.
- Data/QA agent: owns no code files; runs read-only and dry-run checks, then reports evidence.
- Integrator: reviews diffs, resolves constructor/test wiring, runs targeted and final gates, commits only task-related files.

Do not let two agents edit the same file. Do not let any agent run DB apply commands. If data writes are required after review, create a separate approved data-apply task.

---

### Task 0: Minimal Smoke And Evidence Lock

**Files:**
- Read: `front/src/views/NpcDetailView.vue`
- Read: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Read reports generated under: `reports/audit/`

- [ ] **Step 1: Confirm branch and worktree**

Run:

```powershell
git status --short
git branch --show-current
```

Expected:

```text
fix/npc-domain-loot-closure-r2-exec-27c6036
```

If implementation starts from a new branch, record the new branch name and continue only after confirming it was created from the current NPC image/loot closure branch.

Before implementation starts, `git status --short` should be either empty or contain only this plan document:

```text
?? docs/plans/2026-05-13_npc-detail-item-image-closure-plan.md
```

If other paths are present, record them as pre-existing work and do not revert them. Keep the implementation commit scoped to code/tests unless the user explicitly asks to commit this plan document with the implementation.

- [ ] **Step 2: Resolve local runtime ports**

Run:

```powershell
$configPath = 'scripts/dev/config/local-stack.config.json'
$config = if (Test-Path $configPath) { Get-Content $configPath -Raw | ConvertFrom-Json } else { $null }
$backPort = if ($env:APP_PORT) { [int]$env:APP_PORT } elseif ($config -and $config.backend.port) { [int]$config.backend.port } else { 18088 }
$frontPort = if ($env:TERRAPEDIA_FRONT_PORT) { [int]$env:TERRAPEDIA_FRONT_PORT } elseif ($config -and $config.front.port) { [int]$config.front.port } else { 5174 }
"backend=$backPort front=$frontPort"
```

Expected:

```text
backend=18088 front=5174
```

Different values are acceptable when the local config or environment overrides them. Use the printed ports in later runtime commands.

- [ ] **Step 3: Confirm the UI failure is item icon data, not NPC portrait data**

Run against the active backend port:

```powershell
$response = Invoke-RestMethod "http://localhost:$backPort/api/public/npcs/253/aggregate?include=loot,shop,buffs"
$response.data.npc | Select-Object id,name,internalName,imageUrl
$response.data.loot | Select-Object itemName,itemInternalName,imageUrl,chanceText
```

Expected pre-fix shape:

```text
npc.imageUrl is a managed /terrapedia-images/npcs/ URL
loot rows include Requiem and Death Sickle
loot imageUrl values are null before the fix
```

If loot imageUrl values are already non-null, record that as current runtime state and continue with the code/tests anyway; the regression risk still needs coverage.

- [ ] **Step 4: Generate fresh read-only image chain evidence**

Run:

```powershell
node scripts/data/audit/image-source-lineage-report.mjs --source=db --localDatabase=terria_v1_local --maintDatabase=terria_v1_maint --relationDatabase=terria_v1_relation --output=reports/audit/image-source-lineage-npc-item-image-check.json
node scripts/data/audit/image-asset-readiness-audit.mjs --source=db --localDatabase=terria_v1_local --output=reports/audit/image-asset-readiness-npc-item-image-check.json
node scripts/data/relation/relation-health-report.mjs --write-report=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Expected:

```text
Reports are generated or printed without DB writes.
NPC portrait counts remain stable.
Item image readiness identifies whether item_images.cached_url has managed coverage.
The two audit commands write JSON files under reports/audit/.
Those files are evidence artifacts and must not be staged with the implementation unless explicitly requested.
```

- [ ] **Step 5: Dry-run the relation-to-local image repair path**

Run:

```powershell
node scripts/data/relation/sync-relation-item-images-to-local.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --date-tag=NPC-ITEM-IMAGE-DRYRUN
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --local-database=terria_v1_local --relation-database=terria_v1_relation --domains=items,npcs,buffs --date-tag=NPC-ITEM-IMAGE-DRYRUN
```

Expected:

```text
Dry-run summaries show planned item image deltas or confirm no data apply is needed.
The dry-run commands write JSON reports under reports/relation/.
No apply=true command runs.
The generated reports are evidence artifacts and must not be staged with the implementation unless explicitly requested.
```

---

### Task 1: Backend Failing Tests For NPC Loot/Shop Item Images

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`

- [ ] **Step 1: Add resolver mock import and field**

Add import:

```java
import com.terraria.skills.entity.Item;
import com.terraria.skills.service.ManagedItemImageResolver;
import org.junit.jupiter.api.BeforeEach;
```

Add static import:

```java
import static org.mockito.ArgumentMatchers.anyMap;
```

Add field beside the other mocks:

```java
    @Mock
    private ManagedItemImageResolver managedItemImageResolver;
```

- [ ] **Step 2: Add default resolver stub for existing tests**

Add before the first test method:

```java
    @BeforeEach
    void setUpManagedItemImageResolver() {
        lenient().when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of());
        lenient().when(managedItemImageResolver.resolveManagedImage(any(), anyMap())).thenAnswer(invocation -> {
            Item item = invocation.getArgument(0);
            Map<Long, String> managedImagesByItemId = invocation.getArgument(1);
            if (item == null || item.getId() == null) {
                return null;
            }
            String resolved = managedImagesByItemId == null ? null : managedImagesByItemId.get(item.getId());
            if (managedImageUrlPolicy().isManagedImageUrl(resolved)) {
                return resolved;
            }
            String fallback = item.getImage();
            return managedImageUrlPolicy().isManagedImageUrl(fallback) ? fallback : null;
        });
    }
```

This keeps existing tests that do not care about item image resolver behavior on the old fallback path and avoids Mockito strict-stubbing noise. Stubbing both resolver methods is required because the implementation should call `resolveManagedImages(...)` once per row batch and `resolveManagedImage(...)` per row, matching the existing recipe services and keeping resolver filtering rules centralized.

- [ ] **Step 3: Update service construction in the test**

Replace:

```java
        return new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper(), managedImageUrlPolicy());
```

With:

```java
        return new PublicNpcServiceImpl(npcMapper, categoryMapper, jdbcTemplate, new ObjectMapper(), managedImageUrlPolicy(), managedItemImageResolver);
```

- [ ] **Step 4: Add failing loot test**

Add this test near the existing loot/shop image tests:

```java
    @Test
    void shouldResolveLootImageFromManagedItemImagesWhenItemsImageIsMissing() {
        String managedLootImage = "http://localhost:9000/terrapedia-images/items/wiki/items/re/requiem.png";
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(253L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 401L),
            Map.entry("itemId", 5001L),
            Map.entry("itemName", "Requiem"),
            Map.entry("itemInternalName", "Requiem"),
            Map.entry("chanceText", "1.56%")
        )));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(5001L, managedLootImage));

        PublicNpcServiceImpl service = newService();
        NpcLootEntryDTO loot = service.getNpcLoot(253L, 253L, "Reaper").get(0);

        assertEquals(managedLootImage, loot.getImageUrl());
    }
```

- [ ] **Step 5: Add failing loot precedence test**

Add:

```java
    @Test
    void shouldPreferManagedItemImageResolverOverWikiLootItemImage() {
        String managedLootImage = "http://localhost:9000/terrapedia-images/items/wiki/items/de/death-sickle.png";
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(253L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 402L),
            Map.entry("itemId", 1327L),
            Map.entry("itemName", "Death Sickle"),
            Map.entry("itemInternalName", "DeathSickle"),
            Map.entry("itemImage", WIKI_IMAGE)
        )));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(1327L, managedLootImage));

        PublicNpcServiceImpl service = newService();
        NpcLootEntryDTO loot = service.getNpcLoot(253L, 253L, "Reaper").get(0);

        assertEquals(managedLootImage, loot.getImageUrl());
    }
```

- [ ] **Step 6: Add failing shop test**

Add:

```java
    @Test
    void shouldResolveShopImageFromManagedItemImagesWhenItemsImageIsMissing() {
        String managedShopImage = "http://localhost:9000/terrapedia-images/items/wiki/items/to/torch.png";
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_entries"), eq(22L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 501L),
            Map.entry("itemId", 8L),
            Map.entry("itemName", "Torch"),
            Map.entry("itemInternalName", "Torch"),
            Map.entry("priceText", "50 Copper")
        )));
        when(jdbcTemplate.queryForList(contains("FROM npc_shop_conditions"), any(Object[].class))).thenReturn(List.of());
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of(8L, managedShopImage));

        PublicNpcServiceImpl service = newService();

        assertEquals(managedShopImage, service.getNpcShopEntries(22L).get(0).getImageUrl());
    }
```

- [ ] **Step 7: Add regression test for existing managed `items.image` fallback**

Add:

```java
    @Test
    void shouldKeepManagedItemsImageFallbackWhenResolverHasNoCachedImage() {
        String managedLootImage = "http://localhost:9000/terrapedia-images/items/wiki/items/gl/glowstick.png";
        when(jdbcTemplate.queryForList(contains("WHERE nle.npc_id = ?"), eq(7L))).thenReturn(List.of(Map.ofEntries(
            Map.entry("id", 41L),
            Map.entry("itemId", 282L),
            Map.entry("itemName", "Glowstick"),
            Map.entry("itemInternalName", "Glowstick"),
            Map.entry("itemImage", managedLootImage)
        )));
        when(managedItemImageResolver.resolveManagedImages(any())).thenReturn(Map.of());

        PublicNpcServiceImpl service = newService();
        NpcLootEntryDTO loot = service.getNpcLoot(7L, 7L, "Zombie").get(0);

        assertEquals(managedLootImage, loot.getImageUrl());
    }
```

- [ ] **Step 8: Run the failing backend test**

Run:

```powershell
cd back
mvn "-Dtest=PublicNpcServiceImplImageTest" test
```

Expected before implementation:

```text
The test compile can fail at this point because PublicNpcServiceImpl does not accept ManagedItemImageResolver yet.
That compile failure is expected for this red step. Task 2 first adds the constructor dependency, then reruns the test to reach assertion-level failures.
```

---

### Task 2: Backend Implementation Using ManagedItemImageResolver

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`

- [ ] **Step 1: Add imports**

Add:

```java
import com.terraria.skills.entity.Item;
import com.terraria.skills.service.ManagedItemImageResolver;
```

- [ ] **Step 2: Inject resolver**

Add the final field after `managedImageUrlPolicy`:

```java
    private final ManagedItemImageResolver managedItemImageResolver;
```

- [ ] **Step 3: Run the constructor-wiring red test**

Run:

```powershell
cd back
mvn "-Dtest=PublicNpcServiceImplImageTest" test
```

Expected after adding only imports and the resolver field:

```text
The test class compiles.
The new loot/shop tests fail because PublicNpcServiceImpl still maps only row itemImage from items.image.
```

- [ ] **Step 4: Resolve loot rows before DTO mapping**

Replace the direct `jdbcTemplate.queryForList(...).stream()` return in `loadStructuredLootByNpcId` with:

```java
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              nle.id,
              nle.item_id AS itemId,
              nle.source_item_id AS sourceItemId,
              nle.drop_source_kind AS dropSourceKind,
              nle.quantity_min AS quantityMin,
              nle.quantity_max AS quantityMax,
              nle.quantity_text AS quantityText,
              nle.chance_value AS chanceValue,
              nle.chance_text AS chanceText,
              nle.conditions,
              nle.notes,
              nle.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM npc_loot_entries nle
            LEFT JOIN items i ON i.id = nle.item_id AND i.deleted = 0
            WHERE nle.npc_id = ? AND nle.deleted = 0
              AND (nle.drop_source_kind IS NULL OR nle.drop_source_kind = 'npc_drop')
            ORDER BY nle.sort_order ASC, nle.id ASC
            """,
            npcId
        );
        Map<Long, String> managedImagesByItemId = resolveManagedItemImages(rows);
        return rows.stream()
            .map(row -> toLootEntryDto(row, managedImagesByItemId))
            .map(dto -> stampLootProvenance(dto, "direct", true, npcId, null))
            .toList();
```

- [ ] **Step 5: Resolve shop rows before DTO mapping**

Replace the `entries` query stream in `getNpcShopEntries` with:

```java
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
            SELECT
              nse.id,
              nse.item_id AS itemId,
              nse.source_item_id AS sourceItemId,
              nse.price_text AS priceText,
              nse.notes,
              nse.sort_order AS sortOrder,
              i.name AS itemName,
              i.name_zh AS itemNameZh,
              i.internal_name AS itemInternalName,
              i.image AS itemImage
            FROM npc_shop_entries nse
            LEFT JOIN items i ON i.id = nse.item_id AND i.deleted = 0
            WHERE nse.npc_id = ? AND nse.deleted = 0
            ORDER BY nse.sort_order ASC, nse.id ASC
            """,
            npcId
        );
        Map<Long, String> managedImagesByItemId = resolveManagedItemImages(rows);
        List<NpcShopEntryDTO> entries = rows.stream()
            .map(row -> toShopEntryDto(row, managedImagesByItemId))
            .collect(Collectors.toCollection(ArrayList::new));
```

- [ ] **Step 6: Add resolver helper methods**

Add near the DTO mapper helpers:

```java
    private Map<Long, String> resolveManagedItemImages(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }
        Map<Long, Item> itemsById = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long itemId = toLong(row.get("itemId"));
            if (itemId == null) {
                continue;
            }
            Item item = new Item();
            item.setId(itemId);
            item.setImage(toStringValue(row.get("itemImage")));
            itemsById.putIfAbsent(itemId, item);
        }
        if (itemsById.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> resolved = managedItemImageResolver.resolveManagedImages(itemsById.values());
        return resolved == null ? Map.of() : resolved;
    }

    private String resolveManagedItemImage(Map<String, Object> row, Map<Long, String> managedImagesByItemId) {
        Long itemId = toLong(row.get("itemId"));
        if (itemId == null) {
            return null;
        }
        Item item = new Item();
        item.setId(itemId);
        item.setImage(toStringValue(row.get("itemImage")));
        return managedItemImageResolver.resolveManagedImage(item, managedImagesByItemId);
    }
```

- [ ] **Step 7: Update the loot DTO mapper signature**

Replace `private NpcLootEntryDTO toLootEntryDto(Map<String, Object> row)` with:

```java
    private NpcLootEntryDTO toLootEntryDto(Map<String, Object> row, Map<Long, String> managedImagesByItemId) {
```

Replace the image assignment inside that method with:

```java
        dto.setImageUrl(resolveManagedItemImage(row, managedImagesByItemId));
```

- [ ] **Step 8: Update the shop DTO mapper signature**

Replace `private NpcShopEntryDTO toShopEntryDto(Map<String, Object> row)` with:

```java
    private NpcShopEntryDTO toShopEntryDto(Map<String, Object> row, Map<Long, String> managedImagesByItemId) {
```

Replace the image assignment inside that method with:

```java
        dto.setImageUrl(resolveManagedItemImage(row, managedImagesByItemId));
```

- [ ] **Step 9: Run backend targeted tests**

Run:

```powershell
cd back
mvn "-Dtest=PublicNpcServiceImplImageTest,ManagedItemImageResolverImplTest,PublicNpcAggregateControllerTest" test
```

Expected:

```text
All selected backend tests pass.
Existing non-managed image hiding tests still pass.
Managed resolver tests still pass.
```

---

### Task 3: Frontend Positive Render And Contract Tests

**Files:**
- Modify: `front/src/tests/npc-domain-contract.spec.ts`
- Modify: `front/src/tests/npc-public-shell.spec.ts`
- Modify: `front/src/tests/npc-public-acceptance.spec.ts`

- [ ] **Step 1: Fix stale empty-loot expectations**

In both `npc-public-shell.spec.ts` and `npc-public-acceptance.spec.ts`, replace:

```ts
expect(wrapper.text()).toContain('No loot data yet')
```

With:

```ts
expect(wrapper.text()).toContain('No trusted structured loot data yet')
```

- [ ] **Step 2: Add contract test for loot item image aliases**

Add to `npc-domain-contract.spec.ts`:

```ts
  it('normalizes NPC loot item image aliases into imageUrl', () => {
    const deathSickleImage = 'http://localhost:9000/terrapedia-images/items/wiki/items/de/death-sickle.png'
    const requiemImage = 'http://localhost:9000/terrapedia-images/items/wiki/items/re/requiem.png'

    const result = normalizeNpcPublicAggregate({
      npc: { id: 253, name: 'Reaper' },
      loot: [
        {
          item_id: 1327,
          item_name: 'Death Sickle',
          item_internal_name: 'DeathSickle',
          item_image: deathSickleImage,
          loot_source_mode: 'direct',
          trusted_structured: true,
        },
        {
          item_id: 5001,
          item_name: 'Requiem',
          item_internal_name: 'Requiem',
          image_url: requiemImage,
          loot_source_mode: 'direct',
          trusted_structured: true,
        },
      ],
      shopEntries: [],
      buffRelations: [],
      moduleStatus: {},
    } as any)

    expect(result.loot[0]).toMatchObject({
      itemId: 1327,
      itemName: 'Death Sickle',
      itemInternalName: 'DeathSickle',
      itemImage: deathSickleImage,
      imageUrl: deathSickleImage,
      lootSourceMode: 'direct',
      trustedStructured: true,
    })
    expect(result.loot[1]).toMatchObject({
      itemId: 5001,
      itemName: 'Requiem',
      itemInternalName: 'Requiem',
      imageUrl: requiemImage,
      lootSourceMode: 'direct',
      trustedStructured: true,
    })
  })
```

- [ ] **Step 3: Add component render test for aggregate-provided loot image**

Add to `npc-public-shell.spec.ts`:

```ts
  it('renders trusted loot item images from the NPC aggregate payload', async () => {
    applyRoute('/npcs/253')
    routeState.params = { id: '253' }
    const deathSickleImage = 'http://localhost:9000/terrapedia-images/items/wiki/items/de/death-sickle.png'

    mocks.fetchNpcAggregateById.mockResolvedValue({
      success: true,
      data: {
        npc: {
          id: 253,
          gameId: 253,
          internalName: 'Reaper',
          name: 'Reaper',
          nameZh: 'Reaper',
          categoryId: 2,
          categoryName: 'Enemy',
          isBoss: false,
          isFriendly: false,
          isTownNpc: false,
          imageUrl: 'http://localhost:9000/terrapedia-images/npcs/2026/05/08/reaper.gif',
        },
        loot: [
          {
            id: 401,
            itemId: 1327,
            itemName: 'Death Sickle',
            itemInternalName: 'DeathSickle',
            imageUrl: deathSickleImage,
            chanceText: '2.5%',
            lootSourceMode: 'direct',
            trustedStructured: true,
            sourceNpcId: 253,
          },
        ],
        shopEntries: [],
        buffRelations: [],
        moduleStatus: {
          loot: 'ok',
          shop: 'empty',
          buffs: 'empty',
        },
        aggregatedAt: '2026-05-13T00:00:00Z',
      },
      message: 'ok',
      statusCode: 200,
    } satisfies ApiResponse<NpcAggregateData>)

    const wrapper = mount(NpcDetailView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    const image = wrapper.find(`img[src="${deathSickleImage}"]`)
    expect(image.exists()).toBe(true)
    expect(image.attributes('alt')).toBe('Death Sickle')
    expect(wrapper.find('.npc-entry__fallback').exists()).toBe(false)
  })
```

- [ ] **Step 4: Run frontend targeted tests**

Run:

```powershell
cd front
pnpm vitest run src/tests/npc-domain-contract.spec.ts src/tests/npc-public-shell.spec.ts src/tests/npc-public-acceptance.spec.ts
```

Expected:

```text
All selected frontend tests pass.
The new component test proves item images render when the aggregate provides imageUrl.
```

---

### Task 4: Runtime API And Page Verification

**Files:**
- No code files.

- [ ] **Step 1: Restart only if backend/frontend processes do not pick up the change**

Run only when the current stack is not serving updated code:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
```

Expected:

```text
Backend, frontend, and MinIO are available.
Use the configured backend/frontend ports from `scripts/dev/config/local-stack.config.json`, or the fallback ports printed in Task 0.
```

- [ ] **Step 2: Smoke the local stack before API/page checks**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\smoke-local-stack.ps1 -SkipAuth
```

Expected:

```text
The smoke script reports backend public endpoints and admin shell/proxy endpoints as reachable.
If the smoke script fails, fix the local runtime state before interpreting NPC image results.
```

- [ ] **Step 3: Verify Reaper aggregate after backend implementation**

Run:

```powershell
$configPath = 'scripts/dev/config/local-stack.config.json'
$config = if (Test-Path $configPath) { Get-Content $configPath -Raw | ConvertFrom-Json } else { $null }
$backPort = if ($env:APP_PORT) { [int]$env:APP_PORT } elseif ($config -and $config.backend.port) { [int]$config.backend.port } else { 18088 }
$response = Invoke-RestMethod "http://localhost:$backPort/api/public/npcs/253/aggregate?include=loot,shop,buffs"
$response.data.npc | Select-Object id,name,internalName,imageUrl
$response.data.loot | Select-Object itemName,itemInternalName,imageUrl,chanceText
```

Expected after code fix and with local `item_images.cached_url` coverage:

```text
npc.imageUrl remains a managed NPC image URL.
Requiem and Death Sickle imageUrl values are managed /terrapedia-images/items/ URLs.
No raw terraria.wiki.gg image URL is returned as imageUrl.
```

If loot imageUrl is still null after the backend fix, check the Task 0 data reports. That means `item_images.cached_url` lacks managed rows for those items, and the next action is a separate approved data repair, not a frontend patch.

- [ ] **Step 4: Verify page behavior**

Resolve the frontend port and open the printed URL:

```powershell
$configPath = 'scripts/dev/config/local-stack.config.json'
$config = if (Test-Path $configPath) { Get-Content $configPath -Raw | ConvertFrom-Json } else { $null }
$frontPort = if ($env:TERRAPEDIA_FRONT_PORT) { [int]$env:TERRAPEDIA_FRONT_PORT } elseif ($config -and $config.front.port) { [int]$config.front.port } else { 5174 }
"http://localhost:$frontPort/npcs/253"
```

Expected:

```text
The Reaper portrait renders.
Trusted Loot renders item images for loot rows whose aggregate imageUrl is non-null.
Rows without a managed item image still show ITEM fallback.
Console has no new NPC aggregate or image loading errors.
```

---

### Task 5: Final Gate And Commit

**Files:**
- Review all touched files before staging.

- [ ] **Step 1: Run backend gate**

Run:

```powershell
cd back
mvn "-Dtest=PublicNpcServiceImplImageTest,ManagedItemImageResolverImplTest,PublicNpcAggregateControllerTest" test
```

Expected:

```text
BUILD SUCCESS
```

- [ ] **Step 2: Run frontend gate**

Run:

```powershell
cd front
pnpm vitest run src/tests/npc-domain-contract.spec.ts src/tests/npc-public-shell.spec.ts src/tests/npc-public-acceptance.spec.ts
pnpm run check
pnpm run build
```

Expected:

```text
All selected Vitest tests pass.
Type/check command passes.
Build command passes.
```

- [ ] **Step 3: Review changed scope**

Run:

```powershell
git status --short
git diff -- back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java front/src/tests/npc-domain-contract.spec.ts front/src/tests/npc-public-shell.spec.ts front/src/tests/npc-public-acceptance.spec.ts
```

Expected:

```text
Only task-related backend service/test and frontend test files are modified.
This plan document and generated reports are not staged unless the user explicitly asks to include planning/audit evidence.
```

- [ ] **Step 4: Stage explicit files and commit**

Run:

```powershell
git add back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java `
  back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java `
  front/src/tests/npc-domain-contract.spec.ts `
  front/src/tests/npc-public-shell.spec.ts `
  front/src/tests/npc-public-acceptance.spec.ts
git diff --cached --stat
git commit -m "fix: resolve npc detail item images from managed item assets"
```

Expected:

```text
Commit includes only the NPC detail item image closure implementation and tests.
```

---

## Self-Review

- Boundary check: the plan does not diagnose the Reaper portrait as broken; it keeps the root failure on loot/shop item icon data.
- Source-of-truth check: the main implementation uses `ManagedItemImageResolver` and `item_images.cached_url`, not raw wiki URL exposure and not frontend-only fallback.
- Data safety check: all data commands before implementation are read-only or `--apply=false`; `--apply=true` is explicitly outside automated execution.
- Frontend check: production frontend code is not changed unless tests prove current normalization cannot consume aggregate images.
- Multi-agent check: write scopes are disjoint, and the data/QA agent owns no code files.
