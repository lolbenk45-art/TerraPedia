# User Reading History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real authenticated reading history module so `/user` shows recent articles and items the current user actually viewed, and lets the user remove entries.

**Architecture:** Store one soft-deletable row per `(user_id, target_type, target_id)` in `user_reading_history`. Public article and item detail pages call an authenticated endpoint only after the current user session is confirmed, so anonymous visitors are not tracked. The user center loads a paginated list through a Pinia store and renders it only from API data.

**Tech Stack:** Spring Boot, MyBatis-Plus, Flyway SQL migration, Nuxt 3, Pinia, TypeScript, existing TerraPedia user auth cookie flow.

---

## Scope Lock

**In scope**
- Database migration `V51__create_user_reading_history.sql`.
- Backend API under `/user/history`.
- Frontend API wrappers, `useUserHistoryStore`, and `/user` recent reading section.
- Detail-page integration for public articles and public items.
- Contract checks to prevent fake reading-history copy from returning.

**Out of scope**
- Anonymous tracking, localStorage tracking, recommendation ranking, admin UI, crawler/import/backfill, production data writes.
- Public exposure of another user's reading history.
- Redesigning the V0.1 user center style.

**Closure definition**
- Logged-in user opens `/articles/<slug>` or `/items/<id>`, then `/user` shows the entry in “最近阅读”.
- Reopening the same target updates `lastViewedAt` and increments `viewCount`, without duplicate rows.
- Removing an entry from `/user` soft-deletes it and the row disappears from the UI.
- Anonymous users do not call `/user/history/**` and do not create history rows.

---

## Files

**Create**
- `back/src/main/resources/db/migration/V51__create_user_reading_history.sql`
- `back/src/main/java/com/terraria/skills/entity/UserReadingHistory.java`
- `back/src/main/java/com/terraria/skills/dto/UserReadingHistoryDTO.java`
- `back/src/main/java/com/terraria/skills/mapper/UserReadingHistoryMapper.java`
- `back/src/main/resources/mapper/UserReadingHistoryMapper.xml`
- `back/src/main/java/com/terraria/skills/service/UserReadingHistoryService.java`
- `back/src/main/java/com/terraria/skills/service/impl/UserReadingHistoryServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/UserReadingHistoryController.java`
- `back/src/test/java/com/terraria/skills/controller/UserReadingHistoryControllerTest.java`
- `back/src/test/java/com/terraria/skills/service/UserReadingHistoryServiceImplTest.java`
- `back/src/test/java/com/terraria/skills/mapper/UserReadingHistoryMapperTest.java`
- `front-nuxt/stores/userHistory.ts`

**Modify**
- `back/src/main/java/com/terraria/skills/auth/UserAuthenticationInterceptor.java`
- `back/src/test/java/com/terraria/skills/auth/UserAuthenticationInterceptorTest.java`
- `back/src/test/java/com/terraria/skills/auth/UserWriteOriginInterceptorTest.java`
- `front-nuxt/types/public-api.ts`
- `front-nuxt/composables/useUserApi.ts`
- `front-nuxt/stores/userAuth.ts`
- `front-nuxt/pages/user/index.vue`
- `front-nuxt/pages/articles/[slug].vue`
- `front-nuxt/pages/items/[id].vue`
- `front-nuxt/scripts/check-user-module-contract.mjs`

---

## Agent Split

**Agent A: Backend**
- Owns all `back/**` files listed above, including auth interceptor and auth/origin interceptor tests.
- Must write tests before production code.
- Must not edit frontend files.

**Agent B: Frontend**
- Owns `front-nuxt/types/public-api.ts`, `front-nuxt/composables/useUserApi.ts`, `front-nuxt/stores/userHistory.ts`, `front-nuxt/pages/user/index.vue`, `front-nuxt/pages/articles/[slug].vue`, `front-nuxt/pages/items/[id].vue`, and contract script.
- Must preserve current V0.1 visual style.
- Must not edit backend files.

**Agent C: Security and privacy reviewer**
- Read-only review of branch diff.
- Checks no anonymous tracking, no cross-user access, no secrets/diagnostics leaks, no fake UI copy.
- Must not edit files unless explicitly asked after review.

**Plan repair decisions from multi-agent review**
- `/user/history` must be added to the real user authentication interceptor and verified with interceptor tests; controller-only claims checks are not enough.
- Detail pages must record history only on the client, only after a real detail entity exists, and only once per target per page lifecycle.
- Backend must handle duplicate-key races with either an atomic SQL upsert or `DuplicateKeyException` recovery equivalent to the favorites module.
- UI must never surface raw backend exception text for history actions; use fixed sanitized fallback messages.
- Audit logs may include only event name, current claims user id, target type/id, IP, and a compact detail string. They must not include email, cookies, tokens, object keys, URLs with credentials, stack traces, SMTP, or `.env` values.
- DTO image URLs must be public display URLs only. Do not expose object keys, signed URLs, bucket paths, or tokenized storage URLs.

---

## Task 1: Backend Reading History Contract

**Files:**
- Create: `back/src/test/java/com/terraria/skills/controller/UserReadingHistoryControllerTest.java`
- Create: `back/src/test/java/com/terraria/skills/service/UserReadingHistoryServiceImplTest.java`
- Create: `back/src/test/java/com/terraria/skills/mapper/UserReadingHistoryMapperTest.java`
- Modify: `back/src/test/java/com/terraria/skills/auth/UserAuthenticationInterceptorTest.java`
- Modify: `back/src/test/java/com/terraria/skills/auth/UserWriteOriginInterceptorTest.java`

- [ ] **Step 1: Write failing controller tests**

Create tests that prove the controller always uses `UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE`, never a request user id:

```java
@Test
void shouldRecordArticleHistoryForCurrentClaimsUserOnly() throws Exception {
    when(userReadingHistoryService.record(eq(42L), eq("ARTICLE"), eq(77L), anyString()))
        .thenReturn(UserReadingHistoryDTO.builder()
            .targetType("ARTICLE")
            .targetId(77L)
            .title("Guide")
            .url("/articles/guide")
            .viewCount(1)
            .build());

    mockMvc.perform(post("/user/history/ARTICLE/77")
            .requestAttr(UserAuthenticationInterceptor.USER_CLAIMS_ATTRIBUTE, UserTokenClaims.builder()
                .userId(42L)
                .email("user@example.com")
                .build()))
        .andExpect(status().isOk());

    verify(userReadingHistoryService).record(eq(42L), eq("ARTICLE"), eq(77L), anyString());
}
```

Add equivalent tests for:
- `GET /user/history?type=all&page=1&limit=20`
- `DELETE /user/history/ITEM/88`
- missing claims returns a sanitized 4xx error through existing exception handling.
- a forged `userId=43` query parameter is ignored and the service still receives claims user `42`.
- response for `GET /user/history` is `ApiResponse<List<UserReadingHistoryDTO>>` with `Pagination` set from `Page<UserReadingHistoryDTO>`.

- [ ] **Step 2: Run red test**

Run:

```bash
cd back
mvn -Dtest=UserReadingHistoryControllerTest test
```

Expected: FAIL because `UserReadingHistoryController` does not exist.

- [ ] **Step 3: Write failing auth interceptor tests**

Extend `UserAuthenticationInterceptorTest`:
- `GET /user/history` without user token returns 401.
- `POST /user/history/ARTICLE/77` without user token returns 401.
- `DELETE /user/history/ITEM/88` without user token returns 401.

Extend `UserWriteOriginInterceptorTest`:
- `POST /user/history/ARTICLE/77` is treated as a protected user write route.
- `DELETE /user/history/ITEM/88` is treated as a protected user write route.

Run:

```bash
cd back
mvn -Dtest=UserAuthenticationInterceptorTest,UserWriteOriginInterceptorTest test
```

Expected: FAIL because `/user/history` is not covered yet.

- [ ] **Step 4: Write failing service tests**

Create tests for service behavior with mocked mappers:
- `record(42, "ARTICLE", 77, "127.0.0.1")` inserts when no existing row exists.
- `record(42, "ITEM", 88, "127.0.0.1")` updates `lastViewedAt`, `viewCount`, and `deleted=0` when row exists.
- `getHistory(42, "all", 1, 20)` merges item and article projections ordered by `lastViewedAt`.
- `remove(42, "ARTICLE", 77, "127.0.0.1")` soft-deletes only the current user's row.
- invalid target type throws `IllegalArgumentException("Unsupported history type")`.
- `record` rejects non-positive `targetId`.
- unpublished/deleted article and deleted/inactive item do not insert history.
- duplicate insert race is recovered by reselecting the row and incrementing/reactivating it.
- delete/list/reactivate operations are always scoped by `userId`; user `42` cannot delete or reactivate user `43` history for the same target.

- [ ] **Step 5: Write failing mapper SQL contract tests**

Use the existing mapper test style in the repo. Verify:
- `selectActiveHistoryPageAll` mixes ITEM and ARTICLE rows with `UNION ALL` or equivalent safe projection.
- all list/count queries filter `user_id`.
- unpublished/deleted articles are excluded.
- article rows with blank slug are excluded from the list so the frontend never gets invented article URLs.
- item rows for deleted/inactive items are excluded.
- `ORDER BY last_viewed_at DESC, id DESC` is stable.

- [ ] **Step 6: Run red tests**

Run:

```bash
cd back
mvn -Dtest=UserReadingHistoryServiceImplTest,UserReadingHistoryMapperTest test
```

Expected: FAIL because service classes do not exist.

---

## Task 2: Backend Implementation

**Files:**
- Create: backend files listed in Task 1 plus migration, entity, DTO, mapper, XML, service, controller.
- Modify: `back/src/main/java/com/terraria/skills/auth/UserAuthenticationInterceptor.java`

- [ ] **Step 1: Add migration**

Create `back/src/main/resources/db/migration/V51__create_user_reading_history.sql`:

```sql
CREATE TABLE IF NOT EXISTS `user_reading_history` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `target_type` VARCHAR(20) NOT NULL,
  `target_id` BIGINT NOT NULL,
  `view_count` INT NOT NULL DEFAULT 1,
  `last_viewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_reading_history_target` (`user_id`, `target_type`, `target_id`),
  KEY `idx_user_reading_history_user_last_viewed` (`user_id`, `deleted`, `last_viewed_at`),
  KEY `idx_user_reading_history_target` (`target_type`, `target_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Do not rely on a database `CHECK` constraint for target type compatibility. Service normalization is the source of truth for allowed `ITEM` and `ARTICLE` values.

- [ ] **Step 2: Add entity and DTO**

`UserReadingHistory` fields:
- `id`
- `userId`
- `targetType`
- `targetId`
- `viewCount`
- `lastViewedAt`
- `deleted`
- `createdAt`
- `updatedAt`

`UserReadingHistoryDTO` fields:
- `id`
- `targetType`
- `targetId`
- `title`
- `imageUrl`
- `url`
- `viewCount`
- `lastViewedAt`

- [ ] **Step 3: Add mapper interface and XML**

Mapper methods must use explicit `@Param` names for every multi-argument method:

```java
UserReadingHistory selectByUserAndTargetIncludeDeleted(@Param("userId") Long userId, @Param("targetType") String targetType, @Param("targetId") Long targetId);
void reactivateAndIncrement(@Param("id") Long id);
void incrementExisting(@Param("id") Long id);
int softDelete(@Param("userId") Long userId, @Param("targetType") String targetType, @Param("targetId") Long targetId);
long countActiveByUserAndType(@Param("userId") Long userId, @Param("targetType") String targetType);
long countActiveByUser(@Param("userId") Long userId);
List<UserReadingHistoryDTO> selectActiveHistoryPage(@Param("userId") Long userId, @Param("targetType") String targetType, @Param("limit") long limit, @Param("offset") long offset);
List<UserReadingHistoryDTO> selectActiveHistoryPageAll(@Param("userId") Long userId, @Param("limit") long limit, @Param("offset") long offset);
```

XML must join:
- `target_type = 'ITEM'` to `items` and expose `/items/{id}`.
- `target_type = 'ARTICLE'` to published non-deleted `articles` and expose `/articles/{slug}` only when slug is not blank.

`selectActiveHistoryPageAll` must use `UNION ALL` item projection and article projection, then sort and page the union by `lastViewedAt DESC, id DESC`. It must not use inner joins that drop the other target type, and it must not invent `/articles/slug/{id}` for blank slugs. Exclude blank-slug article rows from the list.

- [ ] **Step 4: Add service**

Rules:
- `type` accepts `all`, `items`, `articles`, `ITEM`, `ARTICLE`.
- `record(Long userId, String targetType, Long targetId, String ipAddress)` accepts only `ARTICLE` or `ITEM`.
- `getHistory(Long userId, String type, int page, int limit)` returns `Page<UserReadingHistoryDTO>`.
- `remove(Long userId, String targetType, Long targetId, String ipAddress)` soft-deletes only the current user's row.
- `ARTICLE` target must exist, be non-deleted, and be `PUBLISHED`.
- `ITEM` target must exist, be non-deleted, and if `status` exists it must be active.
- Record never trusts a user id from request body or query.
- Record handles duplicate-key races by catching `DuplicateKeyException` and then incrementing/reactivating the existing row for the same `(userId, targetType, targetId)`.
- Record logs `USER_READING_HISTORY_RECORDED`; delete logs `USER_READING_HISTORY_REMOVED`.
- Audit details format: `targetType=ARTICLE,targetId=77`. Do not log title, URL, email, auth claims, cookies, tokens, object keys, SMTP, stack traces, or local config values.
- Do not expose signed image URLs, object keys, or tokenized storage URLs in `UserReadingHistoryDTO.imageUrl`.

- [ ] **Step 5: Add authentication coverage**

Modify `UserAuthenticationInterceptor` so `/user/history` is a required-auth user route with the same cookie/session behavior as `/user/favorites` and `/user/articles`.

Confirm `UserWriteOriginInterceptor` already covers `/user/**` write routes. If not, add `/user/history/**` coverage there too.

- [ ] **Step 6: Add controller**

Endpoints:

```text
POST /user/history/{targetType}/{targetId}
GET /user/history?type=all&page=1&limit=20
DELETE /user/history/{targetType}/{targetId}
```

Controller uses `PaginationParams.resolvePage` and `PaginationParams.resolveLimit(limit, size, 20, 100)`.

Controller returns:
- record/delete: `ApiResponse<UserReadingHistoryDTO>`.
- list: `ApiResponse<List<UserReadingHistoryDTO>>` with `Pagination` derived from the service page.

Controller passes `getClientIp(request)` to service for record/delete. It never accepts a body or query user id.

- [ ] **Step 7: Run green backend tests**

Run:

```bash
cd back
mvn -Dtest=UserReadingHistoryControllerTest,UserReadingHistoryServiceImplTest,UserReadingHistoryMapperTest,UserAuthenticationInterceptorTest,UserWriteOriginInterceptorTest,UserFavoriteControllerTest test
mvn -DskipTests compile
```

Expected: PASS.

---

## Task 3: Frontend API and Store

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/useUserApi.ts`
- Create: `front-nuxt/stores/userHistory.ts`
- Modify: `front-nuxt/stores/userAuth.ts`

- [ ] **Step 1: Add types**

Add:

```ts
export type UserHistoryTargetType = 'ITEM' | 'ARTICLE'

export type UserReadingHistory = {
  id?: number | string
  targetType: UserHistoryTargetType
  targetId: number | string
  title: string
  imageUrl?: string | null
  url: string
  viewCount?: number
  lastViewedAt?: string | null
}

export type UserHistoryTypeFilter = 'all' | 'items' | 'articles'
```

- [ ] **Step 2: Add API wrappers**

Add to `useUserApi.ts`:
- `fetchUserHistory({ type, page, limit })`
- `recordUserHistory(targetType, targetId)`
- `deleteUserHistory(targetType, targetId)`
- normalizers equivalent to favorites, with fallback URLs `/items/{id}` and article URL from backend only.

- [ ] **Step 3: Add Pinia store**

`stores/userHistory.ts` state:
- `items`
- `pagination`
- `filter`
- `loading`
- `mutating`
- `error`
- `pendingRecords`

Actions:
- `loadList(type = 'all', page = 1, limit = 8)`
- `record(targetType, targetId)`
- `remove(entry)`
- `clearUserHistoryState()`
- `isUserApiUnauthorized(exception)`

Store rules:
- `record` calls `authStore.init()` and returns `null` without API call when unauthenticated.
- Unauthorized clears state and shows `请先登录后再查看阅读记录。`.
- Duplicate fast calls are deduped by key `${targetType}:${targetId}`.
- Store uses the same `userFetch` cookie forwarding and `credentials: 'include'` path as existing user APIs.
- Store uses `extractUserApiError` only for internal state; page UI should display fixed sanitized fallback messages.
- `record` dedupe must prevent parallel calls for the same target during route hydration/watch reruns.
- Do not use `localStorage` or `sessionStorage`.

- [ ] **Step 4: Clear on logout**

Modify `userAuth.ts` logout to call:

```ts
const historyStore = useUserHistoryStore()
historyStore.clearUserHistoryState()
```

- [ ] **Step 5: Run frontend checks**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected: PASS, aside from the known Nuxt module deprecation warning if it appears.

---

## Task 4: Detail Page Recording

**Files:**
- Modify: `front-nuxt/pages/articles/[slug].vue`
- Modify: `front-nuxt/pages/items/[id].vue`

- [ ] **Step 1: Article detail**

After article load succeeds and `article.value.id` is present, record only on the client and only once per article id:

```ts
const historyStore = useUserHistoryStore()
const recordedArticleHistoryIds = new Set<string>()

const recordArticleHistoryOnce = async () => {
  if (!import.meta.client || !article.value?.id) return
  const id = String(article.value.id)
  if (recordedArticleHistoryIds.has(id)) return
  recordedArticleHistoryIds.add(id)
  try {
    await historyStore.record('ARTICLE', article.value.id)
  } catch {
    // Reading history must not block public article rendering.
  }
}

watch(() => article.value?.id, recordArticleHistoryOnce, { immediate: true })
```

Do not block article rendering if history recording fails.

- [ ] **Step 2: Item detail**

After item load succeeds, record only the canonical id from the loaded item entity. Do not use route id fallback before `detailItem.value` exists:

```ts
const historyStore = useUserHistoryStore()
const recordedItemHistoryIds = new Set<string>()

const itemHistoryId = computed(() => detailItem.value?.id ?? detailItem.value?.itemId ?? null)

const recordItemHistoryOnce = async () => {
  if (!import.meta.client || !itemHistoryId.value) return
  const id = String(itemHistoryId.value)
  if (recordedItemHistoryIds.has(id)) return
  recordedItemHistoryIds.add(id)
  try {
    await historyStore.record('ITEM', itemHistoryId.value)
  } catch {
    // Reading history must not block public item rendering.
  }
}

watch(() => itemHistoryId.value, recordItemHistoryOnce, { immediate: true })
```

Do not record for invalid route ids.

- [ ] **Step 3: Anonymous guard**

Both pages must let `useUserHistoryStore.record` decide based on authenticated state. The page must not write localStorage history and must not send history for guests.

---

## Task 5: User Center Recent Reading UI

**Files:**
- Modify: `front-nuxt/pages/user/index.vue`

- [ ] **Step 1: Load real history**

When authenticated:

```ts
const historyStore = useUserHistoryStore()
const historyError = ref('')

if (authStore.isAuthenticated) {
  try {
    await historyStore.loadList('all', 1, 6)
  } catch (exception: unknown) {
    historyError.value = '阅读记录加载失败。'
  }
}
```

- [ ] **Step 2: Render section only from real data**

Add a `support-panel user-feed-panel` headed `最近阅读`.

Render:
- error row when `historyError` exists.
- actual rows when `historyStore.items.length > 0`.
- `user-empty-state` text `还没有阅读记录。` when authenticated and empty.
- guest text `登录后显示真实阅读记录。` when unauthenticated.

Each actual row links to `entry.url`, shows `entry.title`, target type label, and a remove button.

Reuse the current `/user` structure: `support-panel user-feed-panel`, `user-feed-row`, compact text, and existing tag/button classes. Do not add hero-scale type, marketing cards, decorative stats, hard-coded counts, or copy implying guest users already have reading history.

- [ ] **Step 3: Remove action**

Add:

```ts
const removeHistoryEntry = async (entry: UserReadingHistory) => {
  try {
    await historyStore.remove(entry)
  } catch (exception: unknown) {
    historyError.value = '阅读记录移除失败。'
  }
}
```

Button disabled while `historyStore.mutating`.

---

## Task 6: Contract Checks and Runtime Smoke

**Files:**
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Extend contract script**

Required markers:
- `stores/userHistory.ts`
- `/user/history`
- `recordUserHistory`
- `fetchUserHistory`
- `deleteUserHistory`
- `clearUserHistoryState`
- `useUserHistoryStore`
- `historyStore.record('ARTICLE'`
- `historyStore.record('ITEM'`
- `recordArticleHistoryOnce`
- `recordItemHistoryOnce`
- `import.meta.client`
- `recordedArticleHistoryIds`
- `recordedItemHistoryIds`
- `historyStore.items`
- `historyStore.loadList('all', 1, 6)`
- `historyStore.remove(entry)`
- `historyStore.mutating`
- `最近阅读`

Forbidden markers in `/user`:
- `泰拉刃制作链`
- `克苏鲁之眼准备`
- `路线记录`
- `阅读路径`
- fake hard-coded counts such as `<em>24</em>` or `<em>6</em>`.
- `localStorage`
- `sessionStorage`

Add regex assertions:
- article history recording is inside a `recordArticleHistoryOnce` function guarded by `import.meta.client`.
- item history recording is inside a `recordItemHistoryOnce` function guarded by `import.meta.client`.
- `/user` history rows are rendered from `historyStore.items`, not literal arrays.
- `/user` removal calls `historyStore.remove(entry)`.

- [ ] **Step 2: Run full verification**

Run:

```bash
cd back
mvn -Dtest=UserReadingHistoryControllerTest,UserReadingHistoryServiceImplTest,UserReadingHistoryMapperTest,UserAuthenticationInterceptorTest,UserWriteOriginInterceptorTest,UserFavoriteControllerTest test
mvn -DskipTests compile

cd ../front-nuxt
pnpm run check
```

Expected: PASS.

- [ ] **Step 3: Runtime smoke**

Start or reuse local stack on alternate ports:

```bash
APP_PORT=18092 TERRAPEDIA_FRONT_PORT=5182 TERRAPEDIA_ADMIN_PORT=3005 bash ./scripts/dev/start-local-stack.sh --reuse-existing
```

Manual smoke:
- Login.
- Open a published article detail page.
- Open an item detail page.
- Open `/user`.
- Confirm “最近阅读” contains the viewed article/item.
- Remove one entry.
- Refresh `/user`; removed entry remains absent.

---

## Commit Plan

- Commit 1: `docs(user): plan reading history`
- Commit 2: `feat(user): add reading history api`
- Commit 3: `feat(front): show user reading history`
- Merge after verification if the user asks to合并.

Before each commit:

```bash
git status --short
git diff --cached --stat
```

Never use `git add .`.

---

## Plan Audit Notes

- Source of truth: authenticated user session cookie plus `user_reading_history` table.
- Privacy: rows are private to the current claims user; no public endpoint exposes them.
- Session boundary: `/user/history` must be authenticated by `UserAuthenticationInterceptor`; cookie-authenticated writes must remain covered by the existing user write origin guard.
- Rate/abuse boundary: frontend dedupe is UX only. Backend must tolerate repeated writes through duplicate-key recovery and positive target validation. If existing project rate-limit infrastructure has a user write limiter, wire `/user/history` into it; otherwise leave a follow-up note rather than adding a new limiter ad hoc in this task.
- Retention: user removal soft-deletes the entry immediately from list/API results. Hard-delete retention policy is out of scope for this task.
- No-write boundaries: no crawler, import, backfill, production DB, or `.env` changes.
- Failure handling: if runtime smoke fails, patch the plan or implementation at the failing chain point, rerun the focused test, then rerun final verification.
