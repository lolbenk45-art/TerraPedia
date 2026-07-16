# Public Category Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static public category pages with a backend-owned six-entry navigation contract and make `/categories → /categories/weapons → /items?filter=weapon` use one real category scope and total.

**Architecture:** A focused Spring service owns the ordered slug/filter/category-code registry, resolves current categories and descendants, and counts items through the same mapper predicate as the public item list. A typed Nuxt composable consumes that contract for the category index, semantic detail route, and six catalog filters; unresolved navigation filters disable item loading and never fall back to an unfiltered or sample catalog.

**Tech Stack:** Java 17, Spring Boot, MyBatis, JUnit 5/Mockito/MockMvc, Nuxt 4, Vue 3, TypeScript, Node ESM contract checks, pnpm.

---

## File Structure

- Create `back/src/main/java/com/terraria/skills/vo/CategoryNavigationChildVO.java`: public immediate-child response shape.
- Create `back/src/main/java/com/terraria/skills/vo/CategoryNavigationVO.java`: public navigation entry response shape.
- Create `back/src/main/java/com/terraria/skills/service/CategoryNavigationService.java`: read-only navigation boundary.
- Create `back/src/main/java/com/terraria/skills/service/CategoryNavigationUnavailableException.java`: fail-closed missing-code signal.
- Create `back/src/main/java/com/terraria/skills/service/impl/CategoryNavigationServiceImpl.java`: immutable registry, category resolution, descendant expansion, and item counting.
- Modify `back/src/main/java/com/terraria/skills/controller/CategoryController.java`: expose `GET /categories/navigation` and map unavailable navigation to HTTP 503.
- Create `back/src/test/java/com/terraria/skills/service/impl/CategoryNavigationServiceImplTest.java`: registry, resolution, descendant, child, count, and failure tests.
- Modify `back/src/test/java/com/terraria/skills/controller/CategoryControllerTest.java`: success and 503 envelope tests.
- Modify `back/src/test/java/com/terraria/skills/mapper/ItemMapperPreferredImageSqlTest.java`: characterize the count predicate shared with public item filtering.
- Modify `front-nuxt/types/public-api.ts`: navigation types and explicit unavailable item-result source.
- Create `front-nuxt/composables/usePublicCategoryNavigation.ts`: typed public navigation fetch and response validation.
- Modify `front-nuxt/composables/usePublicItems.ts`: allow callers to disable requests and disallow fallback data.
- Modify `front-nuxt/pages/categories/index.vue`: render backend entries, totals, loading, and retry state.
- Modify `front-nuxt/pages/categories/[id].vue`: resolve semantic slug, render real children, retain intermediate page, and link with `itemPath`.
- Modify `front-nuxt/pages/items/index.vue`: bind six filters to backend `categoryIds`/name and fail closed while navigation is unavailable.
- Create `front-nuxt/scripts/check-category-navigation-contract.mjs`: cross-file static contract regression.
- Modify `front-nuxt/package.json`: include the new check in `pnpm run check`.
- Modify `docs/project-governance/current/CURRENT_API_CONTRACTS.md`: document the public endpoint and 503 behavior.
- Modify `docs/devlog/entries/2026-07-16-public-category-navigation.md` and `docs/devlog/current.md`: record implementation and validation handoff.

### Task 1: Pin the Backend Contract with Failing Tests

**Files:**
- Create: `back/src/test/java/com/terraria/skills/service/impl/CategoryNavigationServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/CategoryControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/mapper/ItemMapperPreferredImageSqlTest.java`

- [ ] **Step 1: Write the failing navigation service tests**

Create a Mockito test with these observable assertions:

```java
@ExtendWith(MockitoExtension.class)
class CategoryNavigationServiceImplTest {

    @Mock
    private CategoryManagementService categoryManagementService;

    @Mock
    private ItemMapper itemMapper;

    @InjectMocks
    private CategoryNavigationServiceImpl service;

    @Test
    void shouldResolveOrderedNavigationScopesChildrenAndCounts() {
        Map<Long, CategoryDTO> categories = configuredCategories();
        CategoryDTO melee = category(11L, 1L, "WEAPON_MELEE", "近战武器", 1);
        categories.put(melee.getId(), melee);

        when(categoryManagementService.getCategoryMap()).thenReturn(categories);
        when(categoryManagementService.getAllDescendants(1L)).thenReturn(List.of(melee));
        when(itemMapper.countItemsWithSearch("", null, List.of(1L, 11L), null, null)).thenReturn(37L);

        List<CategoryNavigationVO> result = service.getNavigation();

        assertEquals(List.of("weapons", "armor", "potions", "materials", "furniture", "tools"),
            result.stream().map(CategoryNavigationVO::getSlug).toList());
        assertEquals(List.of("weapon", "armor", "potion", "material", "furniture", "tool"),
            result.stream().map(CategoryNavigationVO::getFilterKey).toList());
        CategoryNavigationVO weapon = result.get(0);
        assertEquals("武器", weapon.getName());
        assertEquals("/categories/weapons", weapon.getCategoryPath());
        assertEquals("/items?filter=weapon", weapon.getItemPath());
        assertEquals(List.of("WEAPON"), weapon.getCategoryCodes());
        assertEquals(List.of(1L, 11L), weapon.getCategoryIds());
        assertEquals(37L, weapon.getItemCount());
        assertEquals(List.of("WEAPON_MELEE"), weapon.getChildren().stream()
            .map(CategoryNavigationChildVO::getCode).toList());
        verify(itemMapper).countItemsWithSearch("", null, List.of(1L, 11L), null, null);
    }

    @Test
    void shouldFailWithoutPartialCountsWhenConfiguredCodeIsMissing() {
        Map<Long, CategoryDTO> categories = configuredCategories();
        categories.remove(6L);
        when(categoryManagementService.getCategoryMap()).thenReturn(categories);

        CategoryNavigationUnavailableException exception = assertThrows(
            CategoryNavigationUnavailableException.class,
            service::getNavigation
        );

        assertTrue(exception.getMessage().contains("TOOL"));
        verifyNoInteractions(itemMapper);
    }

    private Map<Long, CategoryDTO> configuredCategories() {
        Map<Long, CategoryDTO> categories = new LinkedHashMap<>();
        categories.put(1L, category(1L, 0L, "WEAPON", "武器", 1));
        categories.put(2L, category(2L, 0L, "ARMOR", "防具", 2));
        categories.put(3L, category(3L, 0L, "CONSUMABLE_POTION", "药水", 3));
        categories.put(4L, category(4L, 0L, "MATERIAL", "材料", 4));
        categories.put(5L, category(5L, 0L, "FURNITURE", "家具", 5));
        categories.put(6L, category(6L, 0L, "TOOL", "工具", 6));
        return categories;
    }

    private CategoryDTO category(Long id, Long parentId, String code, String name, Integer sort) {
        CategoryDTO category = new CategoryDTO();
        category.setId(id);
        category.setParentId(parentId);
        category.setCode(code);
        category.setName(name);
        category.setSort(sort);
        return category;
    }
}
```

- [ ] **Step 2: Add controller success and unavailable tests**

Add a `CategoryNavigationService` mock and these cases to `CategoryControllerTest`:

```java
@Mock
private CategoryNavigationService categoryNavigationService;

@Test
void shouldReturnPublicCategoryNavigation() throws Exception {
    CategoryNavigationVO weapon = new CategoryNavigationVO();
    weapon.setSlug("weapons");
    weapon.setFilterKey("weapon");
    weapon.setName("武器");
    weapon.setCategoryPath("/categories/weapons");
    weapon.setItemPath("/items?filter=weapon");
    weapon.setCategoryCodes(List.of("WEAPON"));
    weapon.setCategoryIds(List.of(1L, 11L));
    weapon.setItemCount(37L);
    weapon.setChildren(List.of());
    when(categoryNavigationService.getNavigation()).thenReturn(List.of(weapon));

    mockMvc.perform(get("/categories/navigation"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.statusCode").value(200))
        .andExpect(jsonPath("$.data[0].slug").value("weapons"))
        .andExpect(jsonPath("$.data[0].filterKey").value("weapon"))
        .andExpect(jsonPath("$.data[0].categoryIds[1]").value(11))
        .andExpect(jsonPath("$.data[0].itemCount").value(37));
}

@Test
void shouldReturnServiceUnavailableWithoutPartialNavigation() throws Exception {
    when(categoryNavigationService.getNavigation())
        .thenThrow(new CategoryNavigationUnavailableException("Missing category codes: TOOL"));

    mockMvc.perform(get("/categories/navigation"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.success").value(false))
        .andExpect(jsonPath("$.statusCode").value(503))
        .andExpect(jsonPath("$.data").doesNotExist());
}
```

- [ ] **Step 3: Characterize the shared count SQL**

Add this test to `ItemMapperPreferredImageSqlTest`:

```java
@Test
void categoryScopedCountShouldMatchPrimaryOrActiveRelationWithoutDuplicateRows() throws Exception {
    String mapperXml = Files.readString(Path.of("src/main/resources/mapper/ItemMapper.xml"));
    String countSql = selectSql(mapperXml, "countItemsWithSearch");

    assertTrue(countSql.contains("SELECT COUNT(*)"));
    assertTrue(countSql.contains("i.deleted = 0"));
    assertTrue(countSql.contains("i.category_id IN"));
    assertTrue(countSql.contains("OR EXISTS ("));
    assertTrue(countSql.contains("icr_filter.item_id = i.id"));
    assertTrue(countSql.contains("icr_filter.deleted = 0"));
    assertTrue(countSql.contains("icr_filter.status = 1"));
    assertFalse(countSql.contains("JOIN item_category_rel"),
        "EXISTS must preserve one count row per item when several relations match");
}
```

- [ ] **Step 4: Run the RED tests**

Run:

```bash
cd back
mvn -Dtest=CategoryNavigationServiceImplTest,CategoryControllerTest,ItemMapperPreferredImageSqlTest test
```

Expected: compilation fails because the navigation service, exception, and VOs do not exist. The mapper characterization itself is expected to pass once compilation is restored.

- [ ] **Step 5: Commit the RED checkpoint only if repository policy permits a compiling-test checkpoint**

The repository normally keeps focused commits buildable, so do not commit this RED-only state. Continue directly to Task 2.

### Task 2: Implement the Backend Navigation Endpoint

**Files:**
- Create: `back/src/main/java/com/terraria/skills/vo/CategoryNavigationChildVO.java`
- Create: `back/src/main/java/com/terraria/skills/vo/CategoryNavigationVO.java`
- Create: `back/src/main/java/com/terraria/skills/service/CategoryNavigationService.java`
- Create: `back/src/main/java/com/terraria/skills/service/CategoryNavigationUnavailableException.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/CategoryNavigationServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/CategoryController.java`

- [ ] **Step 1: Add the public response types**

`CategoryNavigationChildVO` contains exactly `id`, `code`, and `name`. `CategoryNavigationVO` contains exactly the approved public fields:

```java
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CategoryNavigationVO implements Serializable {
    private static final long serialVersionUID = 1L;
    private String slug;
    private String filterKey;
    private String name;
    private String description;
    private String icon;
    private String categoryPath;
    private String itemPath;
    private List<String> categoryCodes;
    private List<Long> categoryIds;
    private long itemCount;
    private List<CategoryNavigationChildVO> children;
}
```

- [ ] **Step 2: Add the service boundary and fail-closed exception**

```java
public interface CategoryNavigationService {
    List<CategoryNavigationVO> getNavigation();
}
```

```java
public class CategoryNavigationUnavailableException extends RuntimeException {
    public CategoryNavigationUnavailableException(String message) {
        super(message);
    }
}
```

- [ ] **Step 3: Implement the immutable six-entry registry and resolution**

Use a private `NavigationDefinition` record and this exact order:

```java
private static final List<NavigationDefinition> DEFINITIONS = List.of(
    new NavigationDefinition("weapons", "weapon", List.of("WEAPON")),
    new NavigationDefinition("armor", "armor", List.of("ARMOR")),
    new NavigationDefinition("potions", "potion", List.of("CONSUMABLE_POTION")),
    new NavigationDefinition("materials", "material", List.of("MATERIAL")),
    new NavigationDefinition("furniture", "furniture", List.of("FURNITURE")),
    new NavigationDefinition("tools", "tool", List.of("TOOL"))
);
```

In `getNavigation()`:

1. Build a normalized uppercase code index from `categoryManagementService.getCategoryMap()`.
2. Resolve every configured code before calling `itemMapper`; if any are missing, throw `CategoryNavigationUnavailableException("Missing category codes: " + String.join(", ", missingCodes))`.
3. For each definition, use a `LinkedHashSet<Long>` to add each configured root and every ID from `getAllDescendants(rootId)`.
4. Build immediate children by matching `parentId` against the configured root IDs, sorted by null-last `sort` then null-last `id`.
5. Call `itemMapper.countItemsWithSearch("", null, categoryIds, null, null)` exactly once per entry.
6. Copy `name`, `description`, and `icon` from the first configured root and construct `categoryPath`/`itemPath` from the stable slug/filter key.

The final construction block is:

```java
CategoryNavigationVO entry = new CategoryNavigationVO();
entry.setSlug(definition.slug());
entry.setFilterKey(definition.filterKey());
entry.setName(primaryRoot.getName());
entry.setDescription(primaryRoot.getDescription());
entry.setIcon(primaryRoot.getIcon());
entry.setCategoryPath("/categories/" + definition.slug());
entry.setItemPath("/items?filter=" + definition.filterKey());
entry.setCategoryCodes(definition.categoryCodes());
entry.setCategoryIds(categoryIds);
entry.setItemCount(itemMapper.countItemsWithSearch("", null, categoryIds, null, null));
entry.setChildren(children);
```

- [ ] **Step 4: Expose and map the route**

Inject `CategoryNavigationService` into `CategoryController` and add:

```java
@GetMapping("/navigation")
public ResponseEntity<ApiResponse<List<CategoryNavigationVO>>> getCategoryNavigation() {
    try {
        return ResponseEntity.ok(ApiResponse.success(categoryNavigationService.getNavigation()));
    } catch (CategoryNavigationUnavailableException e) {
        log.warn("Public category navigation unavailable: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
            .body(ApiResponse.error(503, e.getMessage()));
    }
}
```

- [ ] **Step 5: Run the GREEN backend tests**

Run:

```bash
cd back
mvn -Dtest=CategoryNavigationServiceImplTest,CategoryControllerTest,ItemMapperPreferredImageSqlTest test
```

Expected: all selected tests pass with zero failures and zero errors.

- [ ] **Step 6: Commit the backend contract**

```bash
git add back/src/main/java/com/terraria/skills/vo/CategoryNavigationChildVO.java \
  back/src/main/java/com/terraria/skills/vo/CategoryNavigationVO.java \
  back/src/main/java/com/terraria/skills/service/CategoryNavigationService.java \
  back/src/main/java/com/terraria/skills/service/CategoryNavigationUnavailableException.java \
  back/src/main/java/com/terraria/skills/service/impl/CategoryNavigationServiceImpl.java \
  back/src/main/java/com/terraria/skills/controller/CategoryController.java \
  back/src/test/java/com/terraria/skills/service/impl/CategoryNavigationServiceImplTest.java \
  back/src/test/java/com/terraria/skills/controller/CategoryControllerTest.java \
  back/src/test/java/com/terraria/skills/mapper/ItemMapperPreferredImageSqlTest.java
git diff --cached --stat
git commit -m "feat(categories): expose public navigation contract"
```

### Task 3: Add the Frontend Contract Boundary Test First

**Files:**
- Create: `front-nuxt/scripts/check-category-navigation-contract.mjs`
- Modify: `front-nuxt/package.json`

- [ ] **Step 1: Create a failing cross-file contract check**

The script reads `types/public-api.ts`, `composables/usePublicCategoryNavigation.ts`, `composables/usePublicItems.ts`, and the three pages. It must assert:

```js
requireIncludes('composables/usePublicCategoryNavigation.ts', navigationComposable, "'/categories/navigation'", 'must fetch the backend navigation endpoint')
requireIncludes('pages/categories/index.vue', categoryIndex, 'entry.itemCount', 'category index must render backend totals')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'route.params.id', 'detail must resolve the semantic route slug')
requireIncludes('pages/categories/[id].vue', categoryDetail, 'category.itemPath', 'detail action must use the backend item path')
requireIncludes('pages/items/index.vue', itemsPage, 'navigationSlug', 'six public filters must identify navigation entries')
requireIncludes('pages/items/index.vue', itemsPage, 'selectedNavigationEntry', 'item scope must resolve from backend navigation')
requireIncludes('pages/items/index.vue', itemsPage, 'allowFallback: () => !navigationFilterRequired.value', 'navigation filters must disable sample fallback')
for (const total of ['932', '684', '122', '1186', '1408', '318']) {
  forbidIncludes('pages/categories/index.vue', categoryIndex, total, `must remove hard-coded total ${total}`)
}
```

Use the established `violations` pattern and finish with:

```js
if (violations.length > 0) {
  console.error(violations.map((violation) => `- ${violation}`).join('\n'))
  process.exit(1)
}

console.log('Category navigation contract check passed.')
```

- [ ] **Step 2: Register the check**

Add `"check:category-navigation": "node scripts/check-category-navigation-contract.mjs"` and invoke it in the main `check` chain before `nuxt typecheck`.

- [ ] **Step 3: Run the RED frontend check**

Run:

```bash
cd front-nuxt
node scripts/check-category-navigation-contract.mjs
```

Expected: FAIL listing the missing composable, hard-coded totals, static detail route, and absent item navigation integration.

### Task 4: Implement the Typed Navigation Composable and Dynamic Category Pages

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Create: `front-nuxt/composables/usePublicCategoryNavigation.ts`
- Modify: `front-nuxt/pages/categories/index.vue`
- Modify: `front-nuxt/pages/categories/[id].vue`

- [ ] **Step 1: Add exact frontend navigation types**

```ts
export type PublicCategoryNavigationChild = {
  id: number
  code: string
  name: string
}

export type PublicCategoryNavigationEntry = {
  slug: string
  filterKey: string
  name: string
  description?: string | null
  icon?: string | null
  categoryPath: string
  itemPath: string
  categoryCodes: string[]
  categoryIds: number[]
  itemCount: number
  children: PublicCategoryNavigationChild[]
}
```

- [ ] **Step 2: Fetch and validate the contract in one composable**

```ts
import type { PublicCategoryNavigationEntry } from '~/types/public-api'

export const usePublicCategoryNavigation = () => useAsyncData(
  'public-category-navigation',
  async () => {
    const response = await usePublicApiFetch<PublicCategoryNavigationEntry[]>('/categories/navigation')
    if (response.success === false) {
      throw new Error(response.message || '分类资料暂不可用')
    }

    const entries = unwrapApiResponse(response)
    if (!Array.isArray(entries) || entries.length !== 6) {
      throw new Error('分类导航返回了无效的数据')
    }

    return entries
  },
  { default: () => [] },
)
```

- [ ] **Step 3: Replace index hard-coding with ordered response rendering**

Add a script that derives two visual groups without recreating semantic mappings:

```ts
const { data: categoryNavigation, pending, error, refresh } = await usePublicCategoryNavigation()
const navigationEntries = computed(() => categoryNavigation.value ?? [])
const weaponEntry = computed(() => navigationEntries.value.find((entry) => entry.filterKey === 'weapon'))
const categoryGroups = computed(() => [
  { key: 'combat', label: '战斗', entries: navigationEntries.value.slice(0, 3) },
  { key: 'craft-build', label: '制作与建造', entries: navigationEntries.value.slice(3, 6) },
])
```

Render `entry.categoryPath`, `entry.name`, `entry.description || '分类资料入口'`, and `entry.itemCount.toLocaleString('zh-CN')`. While pending show skeleton text; on error show a retry button that calls `refresh`; never render static category entries or totals.

- [ ] **Step 4: Make the semantic detail route real and preserve the intermediate page**

Use:

```ts
const route = useRoute()
const slug = computed(() => String(route.params.id ?? '').trim().toLowerCase())
const { data: categoryNavigation, pending, error, refresh } = await usePublicCategoryNavigation()
const category = computed(() => categoryNavigation.value?.find((entry) => entry.slug === slug.value))

if (!error.value && !pending.value && !category.value) {
  throw createError({ statusCode: 404, statusMessage: 'Category not found' })
}

useSeoMeta({
  title: () => category.value ? `TerraPedia · ${category.value.name}` : 'TerraPedia · 分类资料',
  description: () => category.value?.description || '按真实分类范围浏览 Terraria 物品资料。',
})
```

The template must display the category name, real item total, `category.children`, and one primary `<a :href="category.itemPath">查看{{ category.name }}物品</a>`. It must not call `navigateTo` or redirect automatically.

- [ ] **Step 5: Re-run the focused frontend contract check**

Run:

```bash
cd front-nuxt
node scripts/check-category-navigation-contract.mjs
```

Expected: failures remain only for item-catalog fail-closed integration from Task 5.

### Task 5: Make Six Item Filters Use Backend Scopes and Fail Closed

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/usePublicItems.ts`
- Modify: `front-nuxt/pages/items/index.vue`

- [ ] **Step 1: Add an unavailable result state and controllable fallback**

Change `PublicItemsResult.source` to:

```ts
source: 'api' | 'fallback' | 'unavailable'
```

Add:

```ts
const unavailablePublicItemsResult = (query: PublicItemQuery = {}): PublicItemsResult => ({
  items: [],
  rawItems: [],
  pagination: {
    total: 0,
    page: resolveRequestedPage(query),
    limit: resolveRequestedLimit(query),
    size: resolveRequestedLimit(query),
    totalPages: 1,
  },
  source: 'unavailable',
})
```

Give `fetchPublicItems` an `{ allowFallback?: boolean }` option defaulting to true; after a failed request return `fallbackPublicItemsResult(query)` only when allowed, otherwise return `unavailablePublicItemsResult(query)`.

Give `usePublicItems` reactive `enabled` and `allowFallback` options:

```ts
type UsePublicItemsOptions = {
  enabled?: boolean | (() => boolean)
  allowFallback?: boolean | (() => boolean)
}
```

The async handler must return `unavailablePublicItemsResult` without calling the API when disabled, and watch the resolved enabled/query values so it automatically loads after navigation becomes ready.

- [ ] **Step 2: Mark only the approved six filters as navigation-backed**

Add `navigationSlug?: string` to `CatalogCategoryFilter`. Replace the six duplicated code mappings with:

```ts
{ key: 'weapon', label: '武器', navigationSlug: 'weapons' }
{ key: 'armor', label: '盔甲', navigationSlug: 'armor' }
{ key: 'material', label: '材料', navigationSlug: 'materials' }
{ key: 'tool', label: '工具', navigationSlug: 'tools' }
{ key: 'furniture', label: '家具', navigationSlug: 'furniture' }
{ key: 'potion', label: '药水', navigationSlug: 'potions' }
```

Keep every other existing filter and its category-code behavior unchanged.

- [ ] **Step 3: Hydrate the route before the first item request**

Move `hydrateCatalogStateFromRoute` and its initial invocation above the `usePublicItems` call. This ensures `?filter=weapon` is active before async item loading begins and the first request cannot be an unfiltered `all` request.

- [ ] **Step 4: Resolve category IDs and labels from navigation**

```ts
const {
  data: categoryNavigation,
  pending: categoryNavigationPending,
  error: categoryNavigationError,
  refresh: refreshCategoryNavigation,
} = await usePublicCategoryNavigation()

const selectedNavigationEntry = computed(() => {
  const navigationSlug = selectedFilter.value.navigationSlug
  return navigationSlug
    ? categoryNavigation.value?.find((entry) => entry.slug === navigationSlug)
    : undefined
})
const navigationFilterRequired = computed(() => Boolean(selectedFilter.value.navigationSlug))
const navigationFilterReady = computed(() => !navigationFilterRequired.value || Boolean(selectedNavigationEntry.value))
const navigationFilterUnavailable = computed(() => (
  navigationFilterRequired.value
  && !categoryNavigationPending.value
  && (Boolean(categoryNavigationError.value) || !selectedNavigationEntry.value)
))
```

For navigation filters, `selectedCategoryIds` returns only normalized positive IDs from `selectedNavigationEntry.categoryIds`; otherwise it preserves the existing code-to-ID logic. `activeFilterLabel` uses `selectedNavigationEntry.name` when present.

- [ ] **Step 5: Disable unsafe requests and fallback data**

```ts
} = await usePublicItems(
  () => publicItemsQuery.value,
  {
    enabled: () => navigationFilterReady.value,
    allowFallback: () => !navigationFilterRequired.value,
  },
)
```

Include navigation pending in `catalogRawLoading`, include `navigationFilterUnavailable` in `catalogFallbackUnavailable`, and make retry refresh navigation first and item data second. This preserves the existing fallback behavior for all non-navigation filters while ensuring the six navigation filters show no sample or unrelated items.

- [ ] **Step 6: Run the frontend contract and type gates**

Run:

```bash
cd front-nuxt
node scripts/check-category-navigation-contract.mjs
pnpm run check
```

Expected: contract check passes; the full frontend check and Nuxt typecheck pass.

- [ ] **Step 7: Commit the frontend consumer**

```bash
git add front-nuxt/types/public-api.ts \
  front-nuxt/composables/usePublicCategoryNavigation.ts \
  front-nuxt/composables/usePublicItems.ts \
  front-nuxt/pages/categories/index.vue \
  'front-nuxt/pages/categories/[id].vue' \
  front-nuxt/pages/items/index.vue \
  front-nuxt/scripts/check-category-navigation-contract.mjs \
  front-nuxt/package.json
git diff --cached --stat
git commit -m "feat(categories): connect public navigation pages"
```

### Task 6: Document and Review the Integrated Contract

**Files:**
- Modify: `docs/project-governance/current/CURRENT_API_CONTRACTS.md`
- Modify: `docs/devlog/entries/2026-07-16-public-category-navigation.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Add the durable endpoint record**

Document `GET /api/categories/navigation` as public, returning the six ordered fields and HTTP 503 with no `data` when a configured code is missing. List the three public page consumers and the focused backend/frontend validation commands.

- [ ] **Step 2: Record implementation state in the devlog**

Update the active entry with implemented paths, the plan path, test results, contract handoff, and any residual runtime risk. Update `current.md` so its dependency no longer says the design awaits approval.

- [ ] **Step 3: Run integrated static verification**

Run:

```bash
cd back
mvn -Dtest=CategoryNavigationServiceImplTest,CategoryControllerTest,ItemMapperPreferredImageSqlTest test
cd ../front-nuxt
node scripts/check-category-navigation-contract.mjs
pnpm run check
cd ..
git diff --check
git status --short
```

Expected: every focused backend test and frontend gate passes, `git diff --check` emits no output, and status contains only task-owned paths.

- [ ] **Step 4: Review the diff against the approved design**

Confirm all six mappings, stable order, descendant IDs, real immediate children, shared item count, 503 fail-closed behavior, unknown-slug 404, intentional detail intermediate page, query persistence, unchanged non-navigation filters, and no database/admin/crawler/style redesign changes.

### Task 7: Restart and Prove the Real User Journey

**Files:**
- Modify: `docs/devlog/entries/2026-07-16-public-category-navigation.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Restart the maintained local stack**

Run:

```bash
bash ./scripts/dev/start-local-stack.sh
bash ./scripts/dev/smoke-local-stack.sh
```

Expected: public frontend, backend, admin, and Redis report healthy, and smoke completes without failure.

- [ ] **Step 2: Verify the API contract and totals**

Request `http://localhost:18194/api/categories/navigation`. Assert HTTP 200, `success=true`, six ordered entries, weapon `categoryIds` including descendants, and a numeric weapon `itemCount`. Then request `/api/public/items?categoryIds=<weapon ids>&page=1&limit=24&sortBy=id&sortDirection=asc` and assert its `pagination.total` equals the weapon navigation total.

- [ ] **Step 3: Verify the browser journey**

Open and inspect:

```text
http://localhost:15180/categories
http://localhost:15180/categories/weapons
http://localhost:15180/items?filter=weapon
```

Assert the index uses the API total, the detail shows real child categories and links to `/items?filter=weapon`, and the item page displays 武器 with the same total. Change search text and page where possible; assert `filter=weapon` remains in the URL and returned item category IDs intersect the backend weapon scope.

- [ ] **Step 4: Close the devlog and create the task closeout commit**

After validation and review are clear, set the entry to `closed` with `commit SHA pending in final response`, remove it from `current.md` Open Work, stage only the docs/devlog paths, run `git status --short` and `git diff --cached --stat`, then commit:

```bash
git add docs/project-governance/current/CURRENT_API_CONTRACTS.md \
  docs/devlog/entries/2026-07-16-public-category-navigation.md \
  docs/devlog/current.md
git diff --cached --stat
git commit -m "docs(categories): record navigation acceptance"
```

- [ ] **Step 5: Report the running URLs and commit SHAs**

Report backend, frontend, and admin ports; backend/frontend/docs commit SHAs; exact validation commands; API total equality; and any residual risk. Do not push unless the user separately requests it.
