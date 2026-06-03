# User Avatar And Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open real user avatar replacement and user favorites for items and articles, while preserving the current V0.1 user module visual style.

**Architecture:** Keep avatar as part of the authenticated user profile chain, backed by MinIO object storage and returned by `/user-auth/me`. Keep favorites as a separate authenticated user domain so auth state stays light and public item/article APIs remain read-only. Use two backend favorite tables for V0.1 (`user_item_favorites`, `user_article_favorites`) and normalize them into one frontend favorites page.

**Tech Stack:** Spring Boot, MyBatis-Plus, Flyway SQL migrations, MinIO, Nuxt 3, Pinia, existing cookie-based user auth.

---

## Scope Lock

### In Scope

- Add avatar fields to `users`.
- Add authenticated avatar upload and avatar removal.
- Add authenticated favorite list, status, add, and remove APIs.
- Support favorite targets:
  - `ITEM` by stable numeric item id.
  - `ARTICLE` by stable article id, only when the article is published.
- Replace `/user/favorites` static placeholder with real user data.
- Add favorite button on item detail page.
- Add article favorite button only after `front-nuxt/pages/articles/[slug].vue` is connected to real `/articles/slug/{slug}` data.
- Render avatar in settings, user center, and top navigation.

### Out Of Scope

- Do not add favorites to the dense item grid in `/items` for the first batch.
- Do not favorite Boss, NPC, Biome, Buff, crafting routes, or search results in this batch.
- Do not expose arbitrary public file upload as user avatar management.
- Do not refactor the current V0.1 user visual shell.
- Do not touch crawler, import, backfill, or production data refresh workflows.

## Current State

- `front-nuxt/pages/user/favorites.vue` is a static placeholder and says it does not implement favorite add/remove.
- `front-nuxt/components/TerraNav.vue` already links to `/user/favorites`.
- `front-nuxt/pages/user/settings.vue` supports display name and password only.
- `front-nuxt/pages/user/index.vue` uses a static icon avatar and says favorites are pending integration.
- `front-nuxt/composables/useUserApi.ts` and `front-nuxt/stores/userAuth.ts` already support login, register, reset password, profile, password, and user articles.
- `back/src/main/java/com/terraria/skills/entity/User.java` and `UserProfileDTO.java` do not have avatar fields.
- `back/src/main/java/com/terraria/skills/controller/UserAuthController.java` has authenticated profile/password/account/logout APIs, but no avatar endpoint.
- `back/src/main/java/com/terraria/skills/auth/UserAuthenticationInterceptor.java` currently protects `/user-auth/me`, `/user-auth/profile`, `/user-auth/password`, `/user-auth/account`, `/user-auth/logout`, and `/user/articles`.
- `back/src/main/java/com/terraria/skills/controller/ArticleController.java` exposes real public article APIs: `/articles`, `/articles/{id}`, `/articles/slug/{slug}`.
- `front-nuxt/pages/articles/[slug].vue` is still a V0.1 placeholder and should not get a fake favorite button before real article data is loaded.
- `back/src/main/java/com/terraria/skills/controller/PublicItemController.java` exposes `/public/items/{id}`, which is suitable for first-batch item favorites.
- Existing storage accepts image uploads through `/files/images`, but this is a generic/admin file endpoint and should not become the user avatar contract.
- Latest migration is `V49__add_audio_asset_display_names.sql`; the next user migration should be `V50__add_user_avatar_and_favorites.sql`.

## Multi-Agent Planning Discussion

### Frontend Agent Conclusion

- Extend `UserProfile` with avatar fields and make `authStore.init()` hydrate avatar from `/user-auth/me`.
- Keep favorites out of `userAuth` store. Add a focused `userFavorites` store or page composable.
- First batch should add a favorite button to item detail only. The item grid is too dense and likely to create layout and tap-target problems.
- `/user/favorites` must become an authenticated real-data page with loading, empty, error, filter, and remove states.
- Article favorite UI should wait for real article detail data on `pages/articles/[slug].vue`; otherwise the button would attach to a placeholder route.
- Avatar updates must sync settings page, user center, and top nav without requiring a full reload.

### Backend/API Conclusion

- Add a dedicated authenticated avatar API instead of reusing `/files/images`.
- Add avatar fields to `users` and return them from `UserProfileDTO`.
- Add separate `user_item_favorites` and `user_article_favorites` tables and services. Do not overload articles or items tables, and avoid a polymorphic table for the V0.1 batch.
- Favorite add should be idempotent. Repeated add returns the existing active favorite.
- Favorite removal should be idempotent. Soft-delete is acceptable, but the unique key must still prevent concurrent duplicate active favorites.
- Validate target existence and visibility:
  - `ITEM`: target exists and is not deleted.
  - `ARTICLE`: target exists, not deleted, and status is `PUBLISHED`.

### Security/Storage Review Conclusion

- Avatar upload must require current user auth and must derive `userId` from token claims, never from request body.
- Restrict avatar formats to JPEG, PNG, and WebP. Do not allow SVG for avatars because browser-rendered SVG can become an XSS surface.
- Use a smaller avatar size cap than generic item image upload, preferably 1-2 MB.
- Do not only trust `MultipartFile.getContentType()`: validate magic bytes or decode with `ImageIO`, reject SVG and non-image payloads, and strip EXIF if the server re-encodes.
- Store avatars under a dedicated owner prefix such as `avatars/{userId}/yyyy/mm/dd/<uuid>.<ext>`.
- Do not leak object keys into public HTML unless needed for deletion or audit. Public profile payload should expose `avatarUrl`; server may retain `avatarObjectKey`.
- Add `/user-auth/avatar` and `/user/favorites` to `UserAuthenticationInterceptor`.
- Audit log avatar update/remove and favorite add/remove events.
- Check CORS/CSRF risk for new cookie-auth write endpoints because local CORS currently allows credentials with a broad origin pattern.
- Do not let multiple agents write the same migration, auth interceptor, user profile DTO, or `useUserApi.ts` at the same time.

### Plan Auditor Verdict

- **Status:** Execution-ready after final confirmation from the user.
- **Main goal:** Authenticated users can change avatar and manage real favorites for items and published articles.
- **Closure definition:** A logged-in user can upload/remove avatar, favorite/unfavorite an item, see it in `/user/favorites`, refresh the browser and keep correct state, and article favorites work only on real published article detail pages.
- **Important boundary:** Public article frontend must be connected before article favorite UI is considered complete.

## Data Model Plan

### Migration

Create `back/src/main/resources/db/migration/V50__add_user_avatar_and_favorites.sql`.

Add columns to `users`:

```sql
ALTER TABLE `users`
  ADD COLUMN `avatar_url` VARCHAR(500) DEFAULT NULL AFTER `display_name`,
  ADD COLUMN `avatar_object_key` VARCHAR(500) DEFAULT NULL AFTER `avatar_url`,
  ADD COLUMN `avatar_updated_at` DATETIME DEFAULT NULL AFTER `avatar_object_key`;
```

Create `user_item_favorites`:

```sql
CREATE TABLE IF NOT EXISTS `user_item_favorites` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `item_id` BIGINT NOT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_item_favorite` (`user_id`, `item_id`),
  KEY `idx_user_item_favorites_user_created` (`user_id`, `deleted`, `created_at`),
  KEY `idx_user_item_favorites_item` (`item_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Create `user_article_favorites`:

```sql
CREATE TABLE IF NOT EXISTS `user_article_favorites` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `article_id` BIGINT NOT NULL,
  `deleted` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_article_favorite` (`user_id`, `article_id`),
  KEY `idx_user_article_favorites_user_created` (`user_id`, `deleted`, `created_at`),
  KEY `idx_user_article_favorites_article` (`article_id`, `deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Implementation note: because the repo removed physical foreign keys earlier, both favorite tables rely on service-layer existence and visibility checks. `deleted=1` rows are reactivated on repeat favorite requests instead of inserting duplicate rows.

## Backend Plan

### Avatar API

Modify:

- `back/src/main/java/com/terraria/skills/entity/User.java`
- `back/src/main/java/com/terraria/skills/dto/UserProfileDTO.java`
- `back/src/main/resources/mapper/UserMapper.xml`
- `back/src/main/java/com/terraria/skills/service/UserAuthService.java`
- `back/src/main/java/com/terraria/skills/service/impl/UserAuthServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/UserAuthController.java`
- `back/src/main/java/com/terraria/skills/auth/UserAuthenticationInterceptor.java`
- `back/src/main/java/com/terraria/skills/service/ObjectStorageService.java`
- `back/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java`

Endpoints:

- `POST /user-auth/avatar`
  - Auth required.
  - Multipart field: `file`.
  - Returns `UserProfileDTO`.
  - Validates image is JPEG, PNG, or WebP by content type plus magic bytes or image decode.
  - Uses avatar-specific 1-2 MB cap and rejects empty files.
  - Rejects SVG and non-image payloads even when content type is forged.
  - Uploads to `avatars/{userId}/...`.
  - Updates `users.avatar_url`, `users.avatar_object_key`, `users.avatar_updated_at`.

- `DELETE /user-auth/avatar`
  - Auth required.
  - Clears avatar columns.
  - Returns `UserProfileDTO`.
  - Optional object deletion can be deferred; do not block UX on object cleanup in this batch.

Account reactivation rule:

- When a previously deleted user is reactivated during registration, clear `avatar_url`, `avatar_object_key`, and `avatar_updated_at` so old profile images are not leaked into the new account lifecycle.

### Favorites API

Create:

- `back/src/main/java/com/terraria/skills/entity/UserItemFavorite.java`
- `back/src/main/java/com/terraria/skills/entity/UserArticleFavorite.java`
- `back/src/main/java/com/terraria/skills/dto/UserFavoriteDTO.java`
- `back/src/main/java/com/terraria/skills/dto/UserFavoriteStatusDTO.java`
- `back/src/main/java/com/terraria/skills/mapper/UserItemFavoriteMapper.java`
- `back/src/main/java/com/terraria/skills/mapper/UserArticleFavoriteMapper.java`
- `back/src/main/java/com/terraria/skills/service/UserFavoriteService.java`
- `back/src/main/java/com/terraria/skills/service/impl/UserFavoriteServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/UserFavoriteController.java`

Endpoints:

- `GET /user/favorites?type=all&page=1&limit=20`
  - Auth required.
  - `type` allowed values: `all`, `items`, `articles`.
  - Returns paginated normalized `UserFavoriteDTO[]` with `targetType`, `targetId`, `title`, `imageUrl`, `url`, `createdAt`.

- `GET /user/favorites/items/status?ids=1,2,3`
  - Auth required.
  - Returns a map or list of item favorite states.

- `GET /user/favorites/articles/status?ids=1,2,3`
  - Auth required.
  - Returns a map or list of article favorite states.

- `PUT /user/favorites/items/{itemId}`
  - Auth required.
  - Validates item exists and is visible.
  - Idempotent: if the row exists and is active, return success; if it exists deleted, reactivate it; if missing, insert it.

- `DELETE /user/favorites/items/{itemId}`
  - Auth required.
  - Idempotent: missing or already deleted returns success.

- `PUT /user/favorites/articles/{articleId}`
  - Auth required.
  - Validates article exists, is not deleted, and status is `PUBLISHED`.
  - Idempotent.

- `DELETE /user/favorites/articles/{articleId}`
  - Auth required.
  - Idempotent.

Validation rules:

- Item favorites use `ItemMapper` or public item service and reject missing, deleted, or disabled items.
- Article favorites use `ArticleMapper` or `ArticleService`, rejecting missing, deleted, draft, offline, or unapproved articles.
- Do not add login-dependent favorite state to cached public item/article DTOs. Use user-only status endpoints to avoid cache pollution.
- List DTOs may snapshot public target title/image/url at read time through joins or service composition. Do not trust client-supplied target metadata.

## Frontend Plan

### Types And API Client

Modify:

- `front-nuxt/types/public-api.ts`
- `front-nuxt/composables/useUserApi.ts`

Add types:

- `UserProfile.avatarUrl?: string | null`
- `UserProfile.avatarObjectKey?: string | null` only if backend intentionally exposes it; preferred frontend contract is `avatarUrl` only.
- `FavoriteTargetType = 'ITEM' | 'ARTICLE'`
- `UserFavorite`
- `UserFavoriteStatus`

Add API functions:

- `uploadUserAvatar(file: File): Promise<UserProfile>`
- `deleteUserAvatar(): Promise<UserProfile>`
- `fetchUserFavorites(params): Promise<{ items, pagination }>`
- `fetchUserFavoriteStatuses(type, ids): Promise<Record<string, UserFavoriteStatus>>`
- `addItemFavorite(itemId): Promise<UserFavoriteStatus>`
- `deleteItemFavorite(itemId): Promise<UserFavoriteStatus>`
- `addArticleFavorite(articleId): Promise<UserFavoriteStatus>`
- `deleteArticleFavorite(articleId): Promise<UserFavoriteStatus>`

### User Auth Store

Modify:

- `front-nuxt/stores/userAuth.ts`

Add:

- `uploadAvatar(file)` action.
- `deleteAvatar()` action.
- Both update `user.value` from returned profile.
- Existing `init()` continues to hydrate avatar through `/user-auth/me`.

Do not put favorite lists into this store.

### User Favorites Store

Create:

- `front-nuxt/stores/userFavorites.ts`

Responsibilities:

- Hold current favorites page items, pagination, filter, loading, error.
- Hold detail-page favorite status by key `ITEM:123` or `ARTICLE:456`.
- Provide `loadList`, `loadStatuses`, `toggleItemFavorite`, `toggleArticleFavorite`, `removeFavorite`.
- Redirect unauthenticated users to `/user/login?redirect=<currentRoute>` before mutation.

### Avatar UI

Modify:

- `front-nuxt/pages/user/settings.vue`
- `front-nuxt/pages/user/index.vue`
- `front-nuxt/components/TerraNav.vue`

Behavior:

- Settings page shows current avatar preview, upload/replace button, remove button, loading state, and validation error.
- User center uses `user.avatarUrl` first, then current icon fallback.
- Top nav account entry uses avatar thumbnail first, then initials/icon fallback.
- Preserve existing V0.1 styling and compact account menu shape.

### Favorites UI

Modify:

- `front-nuxt/pages/user/favorites.vue`
- `front-nuxt/pages/items/[id].vue`
- `front-nuxt/pages/articles/[slug].vue` only after real article detail data is implemented.

Behavior:

- `/user/favorites` adds `definePageMeta({ requiresUserAuth: true })`.
- Replace static cards with real cards from API.
- Tabs: all, items, articles.
- Empty state: no favorites yet.
- Error state: retry button.
- Remove action updates list in place.
- Item detail favorite button:
  - visible near title/hero action area.
  - loads status after item detail is known.
  - unauthenticated click redirects to login with current URL.
  - toggles without layout jump.
- Article favorite button:
  - only on real published article detail.
  - uses article id, not slug, for API mutation.
  - if article detail remains a placeholder in this execution batch, backend article favorites are implemented and frontend article favorite UI is marked deferred.

## Multi-Agent Execution Split

### Agent A: DB And Favorites Backend

Owns:

- `V50__add_user_avatar_and_favorites.sql`
- `UserItemFavorite` and `UserArticleFavorite` entities
- `UserFavoriteDTO` and `UserFavoriteStatusDTO`
- `UserItemFavoriteMapper` and `UserArticleFavoriteMapper`
- `UserFavoriteService`
- `UserFavoriteServiceImpl`
- `UserFavoriteController`

Does not touch:

- Avatar upload service.
- Frontend files.
- `UserAuthServiceImpl` except only if target validation needs an existing helper, and then coordinate first.

### Agent B: Avatar Backend And Storage

Owns:

- `User` avatar fields.
- `UserProfileDTO`.
- `UserAuthService` and `UserAuthServiceImpl` avatar methods.
- `UserAuthController` avatar endpoints.
- `ObjectStorageService` avatar upload contract.
- `MinioObjectStorageServiceImpl` avatar validation/prefix.
- `UserAuthenticationInterceptor` additions.

Does not touch:

- Favorites backend files except auth interceptor route additions if already coordinated.
- Frontend files.

### Agent C: Frontend Avatar

Owns:

- `UserProfile` type extension.
- `uploadUserAvatar` / `deleteUserAvatar` API client functions.
- `userAuth` avatar actions.
- `settings.vue`, `user/index.vue`, `TerraNav.vue` avatar rendering.

Does not touch:

- Favorites store/page/button files.

### Agent D: Frontend Favorites

Owns:

- Favorite types.
- Favorite API client functions.
- `stores/userFavorites.ts`.
- `/user/favorites`.
- `/items/[id].vue` favorite button.

Does not touch:

- Avatar UI files.
- Article placeholder unless Agent E has already connected real article detail.

### Agent E: Article Detail Gate And QA

Owns:

- Verify whether public article detail is ready.
- If not ready, mark article favorite UI as deferred and test backend article favorite by API only.
- Runtime smoke tests after integration.

Does not touch:

- Backend data model.
- User auth store.

## Validation Plan

### Backend

- Run Flyway migration against local DB.
- Add and run focused backend tests where existing test framework allows:
  - avatar upload rejects unauthenticated request.
  - avatar upload rejects SVG, forged content type, empty file, and oversized file.
  - avatar upload returns `avatarUrl` in `/user-auth/me`.
  - add item favorite is idempotent.
  - delete item/article favorite is idempotent.
  - user A cannot see or mutate user B favorites.
  - article favorite rejects draft/offline article.
  - duplicate favorite under concurrent requests does not create duplicate rows.
  - reactivated user does not inherit old avatar fields.
- Smoke with curl or HTTP client:
  - login, keep cookies.
  - `POST /user-auth/avatar`.
  - `GET /user-auth/me` shows `avatarUrl`.
  - `PUT /user/favorites/items/{itemId}`.
  - `GET /user/favorites/items/status?ids={itemId}` true.
  - `GET /user/favorites` includes item.
  - `DELETE /user/favorites/items/{itemId}` then status false.
  - Confirm broad CORS credentials behavior is understood or narrowed before production deployment.

### Frontend

- Run typecheck/lint command used by the repo for `front-nuxt`.
- Browser smoke:
  - login.
  - open settings, upload avatar, confirm nav and user center update.
  - remove avatar, confirm fallback returns.
  - open item detail, favorite, refresh page, status remains active.
  - open `/user/favorites`, item appears.
  - remove favorite from list, item disappears and detail status turns false after reload.
  - unauthenticated favorite click redirects to `/user/login?redirect=...`.

### Runtime

- Restart backend after migration and Java changes.
- Restart frontend after Nuxt changes.
- Verify:
  - backend docs or health endpoint returns 200.
  - `/user/login` returns 200.
  - `/user/favorites` returns 200 after login.

## Execution Checkpoints

- [ ] Confirm user approval to implement this plan.
- [ ] Check `git status --short --branch` before edits.
- [ ] Re-check any late agent review result before writing code.
- [ ] Implement backend DB/API first.
- [ ] Validate backend endpoints.
- [ ] Implement frontend avatar.
- [ ] Implement frontend favorites.
- [ ] Run full focused validation.
- [ ] Check `git status --short`.
- [ ] Check `git diff --stat`.
- [ ] Commit as one focused user feature commit, or split backend/frontend commits if changes are large.

## Residual Risks

- The two-table favorite model is less generic than a polymorphic table, but it gives clearer constraints for V0.1 item/article favorites and can be extended later with new target tables.
- Article favorite UI depends on connecting the public article detail page to real data. Backend article favorite can be completed earlier.
- Avatar object cleanup is intentionally deferred; removing avatar clears profile fields but may leave old objects in MinIO until a cleanup job is added.
- Existing generic `/files/images` remains available. This plan does not change its access model, but avatar UX must use the dedicated authenticated endpoint only.
- Cookie-auth write endpoints carry CORS/CSRF considerations. Local development can stay permissive, but production should narrow allowed origins or add CSRF protection before opening to external users.

## TerraPedia Plan Auditor Review

### Verdict

- Status: execution-ready after user approval.
- Main goal: open authenticated avatar replacement and real item/article favorites.
- Closure definition: upload/remove avatar works through `/user-auth/me`, item favorite toggle persists across refresh, `/user/favorites` lists only the current user's real favorites, and article favorites are only exposed on real published article detail data.

### Blocking Plan Defects

- Critical: none after replacing the initial polymorphic favorite table with two concrete favorite tables.
- Important: article detail frontend is still placeholder, so article favorite UI is gated until real article detail data is connected.

### Plan Repairs Applied

- Change: replaced `user_favorites` polymorphic table with `user_item_favorites` and `user_article_favorites`.
- Reason: backend review found concrete tables give clearer constraints, simpler target validation, and safer idempotency for V0.1.
- Validation added: duplicate/concurrent favorite checks, user A/B isolation, unpublished article rejection, and cache-pollution guard.
- Change: hardened avatar upload plan with decode/magic-byte validation, SVG rejection, owner-prefixed object keys, reactivated-account avatar clearing, and CORS/CSRF review.
- Reason: security review found generic image upload rules are too broad for user avatars.
- Validation added: forged content-type, empty file, oversized file, reactivation leak, and unauthenticated access checks.

### Execution-Ready Plan

- Scope: backend migration/API, avatar storage/profile chain, frontend avatar rendering, frontend favorites page, item detail favorite button, article favorite backend plus gated frontend UI.
- Agent split: DB/favorites backend, avatar backend/storage, frontend avatar, frontend favorites, article gate/QA.
- Smoke test: login, upload avatar, confirm `/user-auth/me`, favorite item, confirm status/list, delete item favorite, confirm status false.
- Final validation: backend tests, frontend typecheck/lint, browser smoke, backend/frontend restart verification, git status and diff scope check before commit.

### Residual Risk

- Risk: article favorite UI can remain deferred if public article detail is still placeholder.
- Follow-up trigger: when `front-nuxt/pages/articles/[slug].vue` renders real `/articles/slug/{slug}` data, enable article favorite button using article id.
- Risk: old avatar objects may remain public after profile removal.
- Follow-up trigger: add object delete or scheduled cleanup once avatar volume justifies it.
