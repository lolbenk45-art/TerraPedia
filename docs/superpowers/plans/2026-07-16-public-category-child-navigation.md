# Public Category Child Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every immediate child returned by the public category navigation API an image-backed link to an exactly scoped `/items?category=<code>` catalog while unknown child codes fail closed.

**Architecture:** The backend remains the source of truth. `CategoryNavigationServiceImpl` builds a deterministic flattened `childId -> scopedCategoryId` membership list, and one grouped mapper query returns each child's distinct item count plus the first usable managed item image. The frontend validates the complete child contract, resolves exact case-sensitive codes through pure helpers, renders semantic cards, and gates item requests until the child scope is known.

**Tech Stack:** Spring Boot 3, MyBatis XML, MySQL 8.4+, JUnit 5/Mockito, Nuxt 3, Vue 3, TypeScript, Node test runner.

---

## File Structure

- Create `back/src/main/java/com/terraria/skills/dto/CategoryNavigationScopeMembershipDTO.java`: mapper input row containing `childId` and one scoped category ID.
- Create `back/src/main/java/com/terraria/skills/dto/CategoryNavigationChildAggregateDTO.java`: grouped mapper result containing `childId`, `itemCount`, and nullable `image`.
- Modify `back/src/main/java/com/terraria/skills/mapper/ItemMapper.java`: expose one batch aggregate method.
- Modify `back/src/main/resources/mapper/ItemMapper.xml`: build a membership derived table, relation-aware distinct item scope, and deterministic managed-image aggregation.
- Modify `back/src/main/java/com/terraria/skills/vo/CategoryNavigationChildVO.java`: publish `categoryIds`, `itemPath`, `itemCount`, and `image`.
- Modify `back/src/main/java/com/terraria/skills/service/impl/CategoryNavigationServiceImpl.java`: build all child scopes once and assemble the grouped results.
- Modify `back/src/test/java/com/terraria/skills/service/impl/CategoryNavigationServiceImplTest.java`: verify descendant scope, one batch mapper call, empty child values, and malformed aggregate failure.
- Create `back/src/test/java/com/terraria/skills/mapper/ItemMapperCategoryNavigationAggregateSqlTest.java`: verify the grouped SQL contract and absence of per-child query behavior.
- Modify `back/src/test/java/com/terraria/skills/controller/CategoryControllerTest.java`: verify the expanded JSON child contract.
- Modify `front-nuxt/types/public-api.ts`: type the complete navigation child.
- Modify `front-nuxt/utils/publicCategoryNavigation.ts`: validate children and resolve exact child codes through pure functions.
- Modify `front-nuxt/tests/unit/publicCategoryNavigation.test.mjs`: test normalization, exact matching, readiness, unknown-code fail-closed behavior, and descendant scope preservation.
- Modify `front-nuxt/pages/categories/[id].vue`: render the full child DTO as an image-backed semantic anchor.
- Modify `front-nuxt/scripts/check-category-navigation-contract.mjs`: update the existing source contract in the same task as the detail cards.
- Modify the existing category detail stylesheet identified by `rg "category-detail-grid" front-nuxt/assets`: add stable card layout, focus, press, image, and mobile rules using existing tokens.
- Modify `front-nuxt/pages/items/index.vue`: prioritize `category`, preserve it through search/paging, clear it on quick filters, and disable requests/fallback for unresolved or unknown codes.
- Modify `docs/api/public-api-contract.md` if present, otherwise the existing public API reference found by `rg --files docs | rg 'api.*\.md$'`: document the child fields and fail-closed URL behavior.
- Modify `docs/devlog/entries/2026-07-16-public-category-child-navigation.md` and `docs/devlog/current.md`: record implementation and validation state.
- Create `back/src/main/java/com/terraria/skills/config/CategorySnapshotWarmup.java`: initialize the existing category snapshot before the backend accepts traffic so the first navigation request stays within budget.
- Create `back/src/test/java/com/terraria/skills/config/CategorySnapshotWarmupTest.java`: verify startup initialization and fail-fast error propagation.

### Task 1: Grouped Child Aggregate SQL

- [x] **Step 1: Write the failing mapper contract test**

Create `ItemMapperCategoryNavigationAggregateSqlTest` with assertions that the mapper XML contains one `selectCategoryNavigationChildAggregates` statement, a `<foreach collection="scopeMemberships">` membership table, primary-category and active `item_category_rel` branches, `COUNT(*)`, deterministic item-ID image ordering, managed-image prefixes, and demo/placed exclusions.

- [x] **Step 2: Run the test and verify RED**

Run: `cd back && mvn -Dtest=ItemMapperCategoryNavigationAggregateSqlTest test`

Expected: FAIL because the aggregate statement and DTO contract do not exist.

- [x] **Step 3: Add mapper input/output DTOs and method**

Add immutable or Lombok-backed DTOs with these fields:

```java
private Long childId;
private Long categoryId;
```

```java
private Long childId;
private long itemCount;
private String image;
```

Expose:

```java
List<CategoryNavigationChildAggregateDTO> selectCategoryNavigationChildAggregates(
    @Param("scopeMemberships") List<CategoryNavigationScopeMembershipDTO> scopeMemberships,
    @Param("managedImagePrefixes") List<String> managedImagePrefixes
);
```

- [x] **Step 4: Implement the grouped SQL**

Use one statement with these logical stages:

```text
scope_membership(child_id, category_id)
-> scoped_items(child_id, item_id), deduplicated across primary and active relations
-> scoped_item_images(child_id, item_id, usable_image)
-> grouped count plus first non-null usable image ordered by item_id
```

The query must return one row for every requested child, including zero-item children, and must use the same membership set for count and image selection. Reuse the configured managed-image prefixes and existing demo/placed exclusions; do not add a per-child mapper loop.

- [x] **Step 5: Run the mapper test and verify GREEN**

Run: `cd back && mvn -Dtest=ItemMapperCategoryNavigationAggregateSqlTest test`

Expected: PASS.

### Task 2: Backend Child Navigation Contract

- [x] **Step 1: Extend the service test for the complete child DTO**

Update `CategoryNavigationServiceImplTest` so a child with descendants expects:

```text
categoryIds = [childId, descendantIds...]
itemPath = /items?category=<exact code>
itemCount = aggregate count
image = normalized managed path or null
```

Verify exactly one `selectCategoryNavigationChildAggregates` call for all children, no child-level `countItemsWithSearch` calls, stable child order, and a zero-item child with `0/null`. Add a malformed-result case that fails the complete navigation response instead of returning an empty scope.

- [x] **Step 2: Run the service test and verify RED**

Run: `cd back && mvn -Dtest=CategoryNavigationServiceImplTest test`

Expected: FAIL because child enrichment and the batch call are missing.

- [x] **Step 3: Implement DTO and service assembly**

Add the four child fields. In the service:

1. Resolve immediate children in existing deterministic order.
2. Resolve each child's descendants through `CategoryManagementService`.
3. Build the flattened membership list once.
4. Call the grouped mapper once with trusted managed-image read prefixes.
5. Assemble only complete child scopes and aggregate rows.
6. Preserve the existing six top-level counts and HTTP 503 behavior.

- [x] **Step 4: Extend the controller contract test**

Assert `categoryIds`, `itemPath`, `itemCount`, and nullable/present `image` in `GET /categories/navigation` JSON.

- [x] **Step 5: Run focused backend tests and verify GREEN**

Run: `cd back && mvn -Dtest=CategoryNavigationServiceImplTest,CategoryControllerTest,ItemMapperCategoryNavigationAggregateSqlTest test`

Expected: PASS.

### Task 3: Frontend Contract And Exact Resolver

- [x] **Step 1: Write failing normalizer and resolver tests**

Extend the navigation fixture with complete children. Test that normalization rejects missing/empty child scopes, malformed item paths, invalid counts, and unmanaged non-null image values. Test exact case-sensitive resolution for `MATERIAL_KEY`, rejection of `material_key`, verbatim preservation of a descendant scope such as `[316, 342, 341]`, and readiness states for pending, failed, resolved, and unknown codes.

- [x] **Step 2: Run the unit test and verify RED**

Run: `cd front-nuxt && node --test tests/unit/publicCategoryNavigation.test.mjs`

Expected: FAIL because the child fields and resolver do not exist.

- [x] **Step 3: Implement the complete child type and pure resolver**

The normalized child contains:

```ts
type PublicCategoryNavigationChild = {
  id: number
  code: string
  name: string
  categoryIds: number[]
  itemPath: string
  itemCount: number
  image: string | null
}
```

Add a pure exact-code resolver returning both parent and child, plus a pure navigation-state helper whose required/ready/unavailable result prevents unknown categories from becoming an unfiltered request.

- [x] **Step 4: Run the unit test and verify GREEN**

Run: `cd front-nuxt && node --test tests/unit/publicCategoryNavigation.test.mjs`

Expected: PASS.

### Task 4: Clickable Image-Backed Detail Cards

- [x] **Step 1: Update the existing contract check to describe the new card behavior**

In the same change as the detail page, require child `itemPath`, `CommonPreviewImage`, `itemCount`, and a semantic anchor; remove the obsolete assertion that blocks child navigation. Do not add a second source-regex script.

- [x] **Step 2: Run the contract check and verify RED**

Run: `cd front-nuxt && node scripts/check-category-navigation-contract.mjs`

Expected: FAIL because the detail cards are still non-interactive articles.

- [x] **Step 3: Render the complete child card**

Replace each child article with one full-surface anchor bound to `child.itemPath`. Include `CommonPreviewImage` with fixed dimensions, meaningful alt text, `icon-category` fallback, name, code, localized item count, and visible “查看图鉴” text. Preserve the potions empty state.

- [x] **Step 4: Add focused existing-theme styling**

Use existing tokens. Ensure a minimum 44px interactive target, visible `:focus-visible`, stable hover/pressed states without layout shift, reserved image dimensions, responsive grid behavior, and no horizontal overflow.

- [x] **Step 5: Run the contract and frontend unit checks**

Run: `cd front-nuxt && node scripts/check-category-navigation-contract.mjs && node --test tests/unit/publicCategoryNavigation.test.mjs`

Expected: PASS.

### Task 5: Item Catalog Child State Machine

- [x] **Step 1: Add failing pure behavior cases**

Add cases proving `category` takes precedence over `filter`, exact child resolution supplies the backend `categoryIds` unchanged, pending navigation disables requests, unknown codes set unavailable, and unknown/failed child navigation disables sample fallback.

- [x] **Step 2: Run the unit test and verify RED**

Run: `cd front-nuxt && node --test tests/unit/publicCategoryNavigation.test.mjs`

Expected: FAIL until the helper exposes the required state.

- [x] **Step 3: Integrate child state into `pages/items/index.vue`**

Track whether the route contains `category`, preserve the exact raw code, and resolve it before quick filters. Use child scope, title `<child name>图鉴`, and summary `<parent> / <child>`. Make the shared request gate require settled successful navigation and a non-empty scope for either parent navigation filters or child categories. Set `allowFallback` false whenever either navigation mode is required.

- [x] **Step 4: Preserve and clear query state correctly**

Search, page, and page-size route updates retain `category`. `setActiveFilter` and reset actions clear it. Refresh reconstructs from the navigation API. An unknown code renders the unavailable state, issues no item request, and shows an anchor to `/items`.

- [x] **Step 5: Run focused and full frontend checks**

Run: `cd front-nuxt && node --test tests/unit/publicCategoryNavigation.test.mjs && pnpm run check`

Expected: PASS.

### Task 6: API, Runtime, And Browser Acceptance

- [x] **Step 1: Document the public contract and update devlog implementation state**

Document all child fields, nullable image behavior, exact code matching, and unknown category fail-closed behavior. Record test evidence and remaining risks in the active devlog.

- [x] **Step 2: Run backend focused tests and frontend check**

Run:

```bash
cd back && mvn -Dtest=CategoryNavigationServiceImplTest,CategoryControllerTest,ItemMapperCategoryNavigationAggregateSqlTest test
cd ../front-nuxt && pnpm run check
```

Expected: PASS.

- [x] **Step 3: Restart the local stack through the maintained scripts**

Run from repository root:

```bash
bash ./scripts/dev/stop-local-stack.sh
bash ./scripts/dev/start-local-stack.sh
```

Expected: backend and public frontend become healthy on their configured ports, including public frontend `15180` and backend `18194` in the current worktree runtime.

If the first post-restart navigation request alone exceeds the latency budget
because the existing category snapshot initializes lazily, add a fail-fast
startup warmup for that snapshot. Do not cache the navigation response or
weaken the grouped aggregation requirement.

- [x] **Step 4: Verify API contract, counts, images, and latency**

Request `GET http://localhost:18194/api/categories/navigation` five times. Assert six parents, complete children, materials has twelve children, potions has zero, all child paths and scopes are valid, image is null or begins `/terrapedia-images/items/`, each child count equals `/api/public/items?categoryIds=...`, and every navigation request is below 500ms.

- [x] **Step 5: Verify the original browser journey**

Using local Chromium, verify:

```text
/categories/materials
-> click 钥匙
-> /items?category=MATERIAL_KEY
-> heading 钥匙图鉴
```

Also verify an image-backed child, one image fallback, `/categories/potions`, `WEAPON_OTHER` descendant scope, search and page preservation, unknown-code recovery to `/items`, keyboard focus, mobile width, and unchanged `/items?filter=weapon` behavior.

- [x] **Step 6: Run final diff and status checks**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: only task files are modified, no whitespace errors, and the devlog is left `ready-for-commit` because no commit was requested.

## Plan Audit Result

- Goal lock: the exact user journey and universal six-parent contract are measurable.
- Source-chain lock: category tree and managed item image data remain backend-owned; the frontend consumes only normalized navigation DTOs.
- Boundary lock: no database writes, crawler work, migrations, page redesign, or legacy filter migration.
- Evidence lock: mapper/service/controller RED→GREEN, frontend behavior RED→GREEN, stack restart, API reconciliation, performance, and browser acceptance cover the original symptom.
- Continuity: if a focused check exposes a contract gap, repair this plan and re-audit the affected task before continuing; do not weaken fail-closed behavior or substitute per-child queries.
- Commit readiness: leave the branch uncommitted and devlog `ready-for-commit` unless the user separately requests a checkpoint commit.
