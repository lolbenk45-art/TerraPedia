# User Space P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current user space from partly decorative pages into a concrete V0.1 personal workspace with real favorites, article workflow, and account settings.

**Architecture:** Keep this as a P0 closure pass, not a social/profile expansion. Reuse existing user auth, favorites, and article APIs where possible; add only the backend endpoints required to complete the user article lifecycle. Preserve the current V0.1 visual style and remove or clearly disable UI promises that do not have real data.

**Tech Stack:** Spring Boot 3, MyBatis Plus, MySQL/Flyway, Redis-backed user auth, Nuxt 4, Pinia, existing TerraPedia V0.1 CSS.

---

## Source Findings

Frontend review found these already working:

- User auth pages: `/user/login`, `/user/register`, `/user/forgot-password`.
- User account settings: display name, avatar upload/delete, password change.
- User favorites list: `/user/favorites` with filter, pagination, removal.
- Item favorite entry: `/items/[id]`.
- User articles list and create page: `/user/articles`, `/user/articles/new`.

Frontend review found these decorative or incomplete:

- `/user` recent path cards are static: "泰拉刃制作链" and "克苏鲁之眼准备".
- `/user` copy promises reading paths and route records without backing data.
- `/user/settings` side menu entries "显示偏好 / 通知 / 公开身份" link back to the same page and have no state.
- User article edit/detail/submit-review flow is missing from the frontend even though backend APIs exist.
- Article favorite APIs and store methods exist, but article detail pages do not expose favorite controls.

Backend review found these already working:

- User auth, password reset, profile update, avatar, logout, account deletion.
- Favorites APIs for items and articles.
- User article APIs: list, detail, create, update, submit review.
- Admin user management.

Backend review found these gaps:

- User article delete/withdraw is missing.
- Refresh-token renewal and token invalidation are security follow-ups, but not required to close this P0 UI/product gap.
- Avatar old-object cleanup is a follow-up, not part of this P0 user-space closure.

## Closure Definition

This plan is complete when a signed-in user can:

- Open `/user` and see only real account, favorites, and article status data; no fake "recent path" cards remain.
- Open `/user/articles`, create a draft, edit that draft, submit it for review, and see the resulting status.
- Remove or withdraw their own draft/rejected article without affecting another user's article.
- Favorite and unfavorite a published article from the public article detail page.
- Open `/user/settings` without seeing clickable fake preference/notification/public-identity controls.
- Retest on `http://localhost:5177` with backend `18088` and see V0.1 layout preserved.

## Out Of Scope

- Public author profile pages.
- User roles or unified admin/user permission model.
- Refresh-token renewal and token-version security hardening.
- Notification center.
- Display preference persistence.
- Reading history, route tracking, crafting path saving, Boss preparation checklists.
- Data crawler, wiki sync, import, or backfill work.

## Multi-Agent Ownership

Use separate agents with disjoint write targets:

- **Agent A: User Articles Backend**
  - Owns backend article lifecycle endpoints and tests.
  - Writes only:
    - `back/src/main/java/com/terraria/skills/controller/UserArticleController.java`
    - `back/src/main/java/com/terraria/skills/service/ArticleService.java`
    - `back/src/main/java/com/terraria/skills/service/impl/ArticleServiceImpl.java`
    - `back/src/test/java/com/terraria/skills/controller/UserArticleControllerTest.java`
    - any new DTO needed only for user article delete/withdraw.

- **Agent B: User Articles Frontend**
  - Owns article list/edit/submit UI.
  - Writes only:
    - `front-nuxt/pages/user/articles/index.vue`
    - `front-nuxt/pages/user/articles/new.vue`
    - `front-nuxt/pages/user/articles/[id].vue`
    - `front-nuxt/stores/userAuth.ts`
    - `front-nuxt/composables/useUserApi.ts`
    - `front-nuxt/types/public-api.ts`

- **Agent C: Favorites And User Home**
  - Owns article favorite entry and removal of fake user-home promises.
  - Writes only:
    - `front-nuxt/pages/articles/[slug].vue`
    - `front-nuxt/pages/user/index.vue`
    - `front-nuxt/pages/user/favorites.vue`
    - `front-nuxt/stores/userFavorites.ts`
    - `front-nuxt/composables/useUserApi.ts` only if Agent B has not already changed the same lines; otherwise coordinate through the controller.

- **Agent D: Settings And Visual Contract**
  - Owns settings fake-entry cleanup and visual contract tests.
  - Writes only:
    - `front-nuxt/pages/user/settings.vue`
    - `front-nuxt/scripts/check-user-module-contract.mjs`
    - optional new focused visual contract script under `front-nuxt/scripts/`.

No agent may edit crawler, data import, MinIO config, `.env`, local stack config, or unrelated public pages.

## Task 1: Backend Article Delete And Withdraw

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/UserArticleController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/ArticleService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ArticleServiceImpl.java`
- Create or modify: `back/src/test/java/com/terraria/skills/controller/UserArticleControllerTest.java`

- [ ] **Step 1: Write failing controller tests**

Add tests for:

- `DELETE /user/articles/{id}` allows the owner to soft-delete a `DRAFT` article.
- `DELETE /user/articles/{id}` allows the owner to soft-delete a `REJECTED` article.
- `DELETE /user/articles/{id}` rejects `PENDING_REVIEW` and `PUBLISHED`.
- `POST /user/articles/{id}/withdraw` moves `PENDING_REVIEW` back to `DRAFT`.
- Another user's article cannot be deleted or withdrawn.

Run:

```bash
cd back
mvn -Dtest=UserArticleControllerTest test
```

Expected before implementation: tests fail because the endpoints or service methods do not exist.

- [ ] **Step 2: Add service contract**

Add methods to `ArticleService`:

```java
ArticleDTO deleteUserArticle(Long userId, Long articleId);
ArticleDTO withdrawUserArticle(Long userId, Long articleId);
```

- [ ] **Step 3: Implement ownership and state rules**

In `ArticleServiceImpl`:

- Load article by id.
- Require `authorId == userId`.
- Reject deleted articles.
- Delete only `DRAFT` or `REJECTED`.
- Withdraw only `PENDING_REVIEW`.
- Preserve existing review log behavior where applicable.
- Return `ArticleDTO` after mutation.

- [ ] **Step 4: Add controller endpoints**

In `UserArticleController`:

```java
@DeleteMapping("/{id}")
public ResponseEntity<ApiResponse<ArticleDTO>> deleteArticle(
    @PathVariable Long id,
    HttpServletRequest httpRequest
)

@PostMapping("/{id}/withdraw")
public ResponseEntity<ApiResponse<ArticleDTO>> withdrawArticle(
    @PathVariable Long id,
    HttpServletRequest httpRequest
)
```

- [ ] **Step 5: Verify backend task**

Run:

```bash
cd back
mvn -Dtest=UserArticleControllerTest test
mvn -DskipTests compile
```

Expected: both pass.

Commit message:

```bash
git commit -m "feat(user): complete article lifecycle endpoints"
```

## Task 2: User Article Edit And Submit UI

**Files:**

- Modify: `front-nuxt/composables/useUserApi.ts`
- Modify: `front-nuxt/stores/userAuth.ts`
- Modify: `front-nuxt/pages/user/articles/index.vue`
- Create: `front-nuxt/pages/user/articles/[id].vue`
- Modify: `front-nuxt/types/public-api.ts` only if generated/declared types are missing.

- [ ] **Step 1: Add API wrappers**

Add wrappers for:

- `fetchUserArticle(id)`
- `updateUserArticle(id, payload)`
- `submitUserArticleForReview(id)`
- `withdrawUserArticle(id)`
- `deleteUserArticle(id)`

Each wrapper must use existing `userFetch` and `unwrapApiResponse`.

- [ ] **Step 2: Add Pinia store actions**

In `userAuth.ts`, add actions that call the wrappers and update `articles` in-place after mutation.

- [ ] **Step 3: Create edit page**

Create `/user/articles/[id]` with:

- Title input.
- Slug input.
- Cover image input.
- HTML body textarea.
- Save draft button.
- Submit review button when status is `DRAFT` or `REJECTED`.
- Withdraw button when status is `PENDING_REVIEW`.
- Delete button when status is `DRAFT` or `REJECTED`.
- Error and success messages using existing `user-form-status` classes.

- [ ] **Step 4: Update article list page**

Change `/user/articles` row actions:

- Draft/rejected: "编辑".
- Pending review: "查看状态".
- Published with slug: "查看公开页".
- Add visible review comment when rejected.

- [ ] **Step 5: Verify frontend task**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected: pass.

Manual smoke:

- Login.
- Create draft.
- Open edit page.
- Save draft.
- Submit review.
- Return to list and see pending status.

Commit message:

```bash
git commit -m "feat(front): complete user article workspace"
```

## Task 3: Article Favorite Entry

**Files:**

- Modify: `front-nuxt/pages/articles/[slug].vue`
- Modify: `front-nuxt/stores/userFavorites.ts`
- Modify: `front-nuxt/composables/useUserApi.ts` only if status helpers are insufficient.

- [ ] **Step 1: Inspect article detail data**

Confirm `front-nuxt/pages/articles/[slug].vue` has a stable article id. If the page only has slug content without id, first use the existing article detail API response shape to expose id.

- [ ] **Step 2: Load favorite status**

On article detail mount:

- If logged in and article id exists, call `favoritesStore.loadStatuses('ARTICLE', [articleId])`.
- If logged out, render a login CTA.

- [ ] **Step 3: Add favorite button**

Add one compact V0.1-style button near article title/actions:

- "收藏文章" when not favorited.
- "已收藏" when favorited.
- Disable while mutating.
- On click call `favoritesStore.toggleArticleFavorite(articleId)`.

- [ ] **Step 4: Verify**

Run:

```bash
cd front-nuxt
pnpm run check
```

Manual smoke:

- Open a published article while logged in.
- Favorite it.
- Open `/user/favorites?type=articles` or the article filter and confirm it appears.
- Unfavorite it and confirm it disappears or status updates.

Commit message:

```bash
git commit -m "feat(front): add article favorite action"
```

## Task 4: User Home And Settings Anti-Placeholder Cleanup

**Files:**

- Modify: `front-nuxt/pages/user/index.vue`
- Modify: `front-nuxt/pages/user/settings.vue`
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Remove fake recent path rows**

In `/user`, remove hard-coded rows:

- "泰拉刃制作链"
- "克苏鲁之眼准备"

Replace with real rows:

- Latest article draft/status from `authStore.articles`.
- Favorites entry linking to `/user/favorites`.
- Account settings entry linking to `/user/settings`.

When logged out, show login/register actions only; do not promise saved routes.

- [ ] **Step 2: Reword unsupported capabilities**

Remove or reword copy that claims:

- reading path records are saved,
- route records exist,
- browsing preferences are persisted.

Use wording that describes current available functions: favorites, drafts, account settings.

- [ ] **Step 3: Disable settings fake side entries**

In `/user/settings`, keep the visual grouping but render unsupported entries as disabled static rows:

- Display preferences: "后续开放"
- Notifications: "后续开放"
- Public identity: "后续开放"

They must not be clickable anchors pointing to the current page.

- [ ] **Step 4: Add contract checks**

Update `check-user-module-contract.mjs` to fail if:

- `/user/index.vue` contains "泰拉刃制作链" or "克苏鲁之眼准备".
- `/user/settings.vue` contains clickable anchors for display preferences, notifications, or public identity.

- [ ] **Step 5: Verify**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
```

Manual smoke:

- `/user` logged out.
- `/user` logged in.
- `/user/settings`.

Commit message:

```bash
git commit -m "fix(front): remove decorative user space promises"
```

## Task 5: Integration Verification

**Files:**

- No planned code writes.

- [ ] **Step 1: Run focused backend checks**

```bash
cd back
mvn -Dtest=UserArticleControllerTest,UserFavoriteControllerTest,UserAuthenticationInterceptorTest,AdminAuthenticationInterceptorTest test
mvn -DskipTests compile
```

Expected: pass.

- [ ] **Step 2: Run frontend checks**

```bash
cd front-nuxt
pnpm run check
```

Expected: pass.

- [ ] **Step 3: Runtime smoke**

Restart or reuse the local stack. Verify:

- Backend health: `curl http://127.0.0.1:18088/api/actuator/health`.
- Frontend: `http://localhost:5177/user`.
- Settings: `http://localhost:5177/user/settings`.
- Favorites: `http://localhost:5177/user/favorites`.
- Articles: `http://localhost:5177/user/articles`.
- Article edit: `http://localhost:5177/user/articles/{id}`.
- Public article detail favorite button.

- [ ] **Step 4: Visual stability smoke**

Check desktop and narrow viewport for:

- no overlapping favorite buttons,
- no card text overflow,
- long email remains contained,
- avatar still renders,
- disabled settings entries look intentionally disabled.

- [ ] **Step 5: Final commit or merge readiness**

Run:

```bash
git status --short --branch -uall
git log --oneline --decorate -5
git diff --check
```

If clean and all checks pass, the branch is ready for local merge into `main`.

## Plan Audit

## Verdict

- Status: execution-ready for P0.
- Main goal: remove decorative user-space promises and close the article/favorite/account user workflow.
- Closure definition: user can perform the P0 flows listed above without static placeholder rows or fake settings links.

## Blocking Plan Defects

- Critical: none.
- Important: no two agents may write `front-nuxt/composables/useUserApi.ts` at the same time. Controller must serialize that file or assign the wrapper changes to Agent B first.

## Plan Repairs

- Change: P1 auth security hardening is explicitly out of scope.
- Reason: including refresh-token/token-version work would mix security architecture with user-space P0 product closure.
- Validation added: focused runtime smoke covers the original complaint, and backend/frontend checks cover changed surfaces.

## Execution-Ready Plan

- Scope: user home, settings anti-placeholder cleanup, user article lifecycle, article favorite entry.
- Agent split: backend article lifecycle, frontend article workspace, article favorites/user home, settings visual contract.
- Smoke test: signed-in user creates/edits/submits article, favorites article, opens user home/settings without fake controls.
- Final validation: focused Maven tests, backend compile, Nuxt check, runtime smoke on `5177`/`18088`.

## Residual Risk

- Risk: article detail may not expose a stable article id.
- Follow-up trigger: if `front-nuxt/pages/articles/[slug].vue` lacks id, Agent C must first add id from the existing article API response before adding favorite status.
