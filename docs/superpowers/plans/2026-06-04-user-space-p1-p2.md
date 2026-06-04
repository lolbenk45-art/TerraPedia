# User Space P1/P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the V0.1 user space after P0 by hardening account safety and turning the remaining personal-space surfaces into real, testable product behavior.

**Architecture:** P1 is reliability and safety hardening on top of the existing authenticated user module. P2 is product expansion and must not introduce fake panels; every new visible surface needs a backend source, an API contract, and a runtime smoke path.

**Tech Stack:** Spring Boot 3, MyBatis Plus, Redis user token store, MySQL/Flyway, MinIO, Nuxt 4, Pinia, existing TerraPedia V0.1 CSS.

---

## Current Baseline

P0 is the closure baseline. Do not redo these unless a regression is found:

- User auth pages: login, register, forgot password.
- SMTP-backed password reset.
- Profile settings: display name, password change, avatar upload/delete.
- Authenticated favorites: item/article favorites, `/user/favorites`, public item/article favorite buttons.
- User article workspace: create, edit, submit review, withdraw, delete draft/rejected article.
- User home anti-placeholder cleanup: no fake reading path or fake route records.

## Priority Definition

- **P1:** must be done before calling the user module reliable for repeated local preview. It focuses on session safety, anti-CSRF boundaries, avatar storage hygiene, contract tests, and runtime diagnostics.
- **P2:** can wait until P1 is stable. It adds richer user-space product features such as public profile, reading history, saved route records, notification center, and display preferences.

## Out Of Scope

- Crawler, import, wiki refresh, or data backfill work.
- Admin role redesign.
- Social feed, comments, follow system, private messages.
- Production secret changes or exposing `.env`/local-stack credentials.
- Replacing the V0.1 visual shell with a new visual system.

## Source Chain

```text
browser cookie/auth state
-> front-nuxt Pinia stores and pages
-> user API endpoints under /user-auth and /user
-> Spring services and Redis/MySQL/MinIO
-> response DTOs
-> Nuxt page smoke on local ports
```

Runtime proof must use backend `18088` and the currently assigned frontend preview port for the worktree. Do not rely only on unit tests when the change affects login, cookies, avatar image URLs, or page rendering.

## Multi-Agent Execution Split

Use separate branches or workers with disjoint write targets:

- **Agent A: Auth And Session Safety**
  - Owns backend auth/session endpoints, Redis token checks, interceptor rules, and tests.
  - Writes only `back/src/main/java/com/terraria/skills/auth/**`, `UserAuthController.java`, `UserAuthService*.java`, and focused backend auth tests.

- **Agent B: Avatar Storage Hygiene**
  - Owns avatar object cleanup, validation hardening, object URL resolution, and tests.
  - Writes only avatar validator/storage service files, user profile DTO mapping, Flyway if needed, and focused avatar tests.

- **Agent C: Favorites And Personal Data UX**
  - Owns favorites counters, batch status loading, empty/error states, and Nuxt contracts.
  - Writes only `front-nuxt/pages/user/favorites.vue`, `front-nuxt/stores/userFavorites.ts`, related API wrappers, and contract scripts.

- **Agent D: P2 Product Expansion**
  - Owns public profile, reading history, saved routes, notifications, and preferences, one feature branch at a time.
  - Must not write P1 security files while P1 is in progress.

No two agents may edit the same migration, same Pinia store, same controller, same page section, or same service lifecycle command.

## P1.1 Auth Session Hardening

**Goal:** Make login/logout/password reset predictable across refresh, expired token, and stolen-cookie scenarios.

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/auth/UserJwtService.java`
- Modify: `back/src/main/java/com/terraria/skills/auth/UserRefreshTokenStoreService.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/UserAuthController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/UserAuthService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/UserAuthServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/controller/UserAuthControllerTest.java`
- Test: `back/src/test/java/com/terraria/skills/auth/UserAuthenticationInterceptorTest.java`

- [ ] **Step 1: Add refresh endpoint tests**

Add tests for:

- `POST /user-auth/refresh` rotates access token when refresh cookie is valid.
- Reusing a revoked refresh token returns `401`.
- Logout revokes the current refresh token and clears both cookies.
- Password reset revokes all refresh tokens for that user.

Run:

```bash
cd back
mvn -Dtest=UserAuthControllerTest,UserAuthenticationInterceptorTest test
```

Expected before implementation: refresh-specific tests fail.

- [ ] **Step 2: Implement refresh rotation**

Add:

- `POST /user-auth/refresh`
- refresh cookie lookup from `tp_user_refresh`
- Redis token existence check by hashed token
- current refresh token revocation
- new refresh token creation
- new access and refresh cookies

Do not put raw refresh tokens in logs or DTO JSON.

- [ ] **Step 3: Revoke tokens after sensitive events**

When these operations succeed, revoke all existing refresh tokens for the user:

- password reset
- account deletion
- password change

After password change, return success and require the user to log in again unless the implementation intentionally issues a fresh session in the same response.

- [ ] **Step 4: Verify**

Run:

```bash
cd back
mvn -Dtest=UserAuthControllerTest,UserAuthenticationInterceptorTest test
mvn -DskipTests compile
```

Expected: pass.

Commit:

```bash
git add back/src/main/java/com/terraria/skills/auth back/src/main/java/com/terraria/skills/controller/UserAuthController.java back/src/main/java/com/terraria/skills/service back/src/test/java/com/terraria/skills
git commit -m "feat(user): harden session refresh lifecycle"
```

## P1.2 Cookie Write Origin Guard

**Goal:** Reduce cross-origin risk for cookie-authenticated write endpoints without breaking local multi-port preview.

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/config/CorsConfig.java`
- Create: `back/src/main/java/com/terraria/skills/auth/UserWriteOriginInterceptor.java`
- Modify: `back/src/main/java/com/terraria/skills/config/WebConfig.java`
- Test: `back/src/test/java/com/terraria/skills/auth/UserWriteOriginInterceptorTest.java`

- [ ] **Step 1: Define allowed local origins**

Allow local preview origins explicitly:

- `http://localhost:*`
- `http://127.0.0.1:*`

If production origins are configured later, read them from config. Do not hard-code secrets or local machine paths.

- [ ] **Step 2: Block cookie-auth write requests from unknown origins**

Apply to state-changing authenticated user endpoints:

- `POST`, `PUT`, `PATCH`, `DELETE`
- `/user-auth/profile`
- `/user-auth/password`
- `/user-auth/avatar`
- `/user-auth/account`
- `/user-auth/logout`
- `/user/articles/**`
- `/user/favorites/**`

Bearer-token requests may continue through the existing auth path, but cookie-auth requests need an allowed `Origin` or no `Origin` for same-origin/server tools.

- [ ] **Step 3: Verify**

Run:

```bash
cd back
mvn -Dtest=UserWriteOriginInterceptorTest,UserAuthenticationInterceptorTest test
mvn -DskipTests compile
```

Expected: pass.

Commit:

```bash
git commit -m "fix(user): guard cookie write origins"
```

## P1.3 Avatar Storage Cleanup And Image Safety

**Goal:** Keep avatar replacement from leaving unbounded object clutter and harden image validation.

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/service/UserAvatarValidator.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/UserAuthServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java`
- Test: `back/src/test/java/com/terraria/skills/service/UserAvatarValidatorTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/UserAuthControllerTest.java`

- [ ] **Step 1: Add validation tests**

Test:

- JPEG/PNG/WebP accepted.
- SVG rejected even if renamed.
- empty file rejected.
- file larger than 2 MB rejected.
- image with forged content type rejected.

- [ ] **Step 2: Delete or schedule old avatar object**

When a user replaces or removes an avatar:

- read old `avatar_object_key`;
- clear DB state only after new upload succeeds;
- best-effort delete old object if it is under `avatars/{userId}/`;
- never delete keys outside `avatars/`.

- [ ] **Step 3: Verify**

Run:

```bash
cd back
mvn -Dtest=UserAvatarValidatorTest,UserAuthControllerTest test
mvn -DskipTests compile
```

Expected: pass.

Commit:

```bash
git commit -m "fix(user): clean up avatar object lifecycle"
```

## P1.4 Favorites Reliability And Runtime Contract

**Goal:** Make favorites stable across list pages, detail pages, refresh, and removal.

**Files:**

- Modify: `front-nuxt/composables/useUserApi.ts`
- Modify: `front-nuxt/stores/userFavorites.ts`
- Modify: `front-nuxt/pages/user/favorites.vue`
- Modify: `front-nuxt/pages/items/[id].vue`
- Modify: `front-nuxt/pages/articles/[slug].vue`
- Modify: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Add contract markers**

Extend `check-user-module-contract.mjs` to require:

- item detail loads favorite status by stable item id;
- article detail loads favorite status by stable article id;
- `/user/favorites` renders loading, empty, error, removal, pagination;
- no text claims Boss/NPC/Biome favorites exist yet.

- [ ] **Step 2: Harden store behavior**

Ensure `userFavorites`:

- dedupes status requests;
- clears user-specific status on logout;
- handles `401` by showing login-required state instead of stale success;
- updates list and status cache after remove.

- [ ] **Step 3: Verify**

Run:

```bash
cd front-nuxt
pnpm run check:user-module
pnpm run check
```

Runtime smoke:

- login;
- favorite item;
- favorite article;
- refresh browser;
- open `/user/favorites`;
- remove each favorite;
- confirm status updates on detail pages.

Commit:

```bash
git commit -m "fix(front): harden user favorite runtime state"
```

## P1.5 User Module Diagnostics

**Goal:** Make local preview failures easier to localize without exposing secrets.

**Files:**

- Modify: `front-nuxt/composables/useUserApi.ts`
- Modify: `front-nuxt/pages/user/login.vue`
- Modify: `front-nuxt/pages/user/forgot-password.vue`
- Modify: `back/src/main/java/com/terraria/skills/controller/UserAuthController.java`
- Test: focused frontend contract and backend controller tests.

- [ ] **Step 1: Normalize user-facing errors**

Use short Chinese messages for:

- backend unavailable;
- unauthorized;
- validation failure;
- email code sending failure;
- avatar upload failure.

Do not render SMTP host, Redis key, stack trace, token value, or object key.

- [ ] **Step 2: Add local smoke commands to docs**

Add a small section to this plan or the runbook with:

```bash
curl -i http://127.0.0.1:18088/api/user-auth/me
curl -i http://127.0.0.1:18088/api/articles?page=1&limit=5
```

Expected:

- `/user-auth/me` returns `401` when logged out.
- `/articles` returns public published data.

- [ ] **Step 3: Verify**

Run:

```bash
cd front-nuxt
pnpm run check
cd ../back
mvn -Dtest=UserAuthControllerTest test
```

Commit:

```bash
git commit -m "fix(user): clarify auth error diagnostics"
```

## P2.1 Public User Profile Page

**Goal:** Add a real public profile page for authors without exposing private account fields.

**Files:**

- Create: `back/src/main/java/com/terraria/skills/controller/PublicUserController.java`
- Create: `back/src/main/java/com/terraria/skills/dto/PublicUserProfileDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/UserAuthService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/UserAuthServiceImpl.java`
- Create: `front-nuxt/pages/users/[id].vue`
- Modify: `front-nuxt/pages/articles/[slug].vue`

- [ ] **Step 1: Backend read-only DTO**

Expose only:

- user id;
- display name;
- avatar URL;
- created month or joined date if already public-safe;
- published article count;
- latest published articles.

Do not expose email, roles, token state, deleted flag, refresh-token state, or audit logs.

- [ ] **Step 2: Frontend page**

Create `/users/{id}` with:

- avatar/name;
- published article list;
- empty state;
- link back to articles.

- [ ] **Step 3: Link article author**

On article detail, link author display name to `/users/{authorId}` only when `authorId` exists.

- [ ] **Step 4: Verify**

Run:

```bash
cd back
mvn -Dtest=PublicUserControllerTest test
cd ../front-nuxt
pnpm run check
```

Runtime smoke:

- open public article;
- click author;
- confirm profile renders without login and without private fields.

Commit:

```bash
git commit -m "feat(user): add public author profile"
```

## P2.2 Reading History

**Goal:** Replace future reading-history copy with real per-user recent views.

**Files:**

- Create migration for `user_reading_history`.
- Create backend controller/service under `/user/history`.
- Create frontend store `front-nuxt/stores/userHistory.ts`.
- Modify public detail pages that should record reads:
  - `front-nuxt/pages/articles/[slug].vue`
  - optionally `front-nuxt/pages/items/[id].vue`

- [ ] **Step 1: Data contract**

Record:

- user id;
- target type: `ARTICLE` or `ITEM` for first batch;
- target id;
- last viewed time;
- view count;
- deleted flag.

Do not record anonymous users in P2.2.

- [ ] **Step 2: Backend API**

Add:

- `POST /user/history/{targetType}/{targetId}`
- `GET /user/history?type=all&page=1&limit=20`
- `DELETE /user/history/{targetType}/{targetId}`

- [ ] **Step 3: Frontend UI**

Add a real recent reading section on `/user` only when data exists. If no data exists, show an empty state and do not claim routes have been saved.

- [ ] **Step 4: Verify**

Runtime smoke:

- login;
- open an article detail;
- return to `/user`;
- recent article appears;
- remove history entry;
- it disappears.

Commit:

```bash
git commit -m "feat(user): add reading history"
```

## P2.3 Saved Routes

**Goal:** Add real saved route records for user-curated paths, separate from favorites.

**Scope:**

- First target type: crafting route from a target item.
- Later targets: Boss prep checklist and custom article collection.

- [ ] **Step 1: Do not reuse favorites**

Saved routes need their own table because they may contain:

- target id;
- route mode;
- selected recipe variant;
- note/title;
- serialized route snapshot;
- updated time.

- [ ] **Step 2: Add API and UI**

Add:

- `POST /user/saved-routes`
- `GET /user/saved-routes`
- `DELETE /user/saved-routes/{id}`

Frontend:

- save action on crafting page after route is resolved;
- `/user/routes` list page;
- `/user` summary entry only after real data exists.

- [ ] **Step 3: Verify**

Runtime smoke:

- login;
- resolve crafting route;
- save route;
- open `/user/routes`;
- route opens back into crafting page with the target item.

Commit:

```bash
git commit -m "feat(user): add saved crafting routes"
```

## P2.4 Notification Center

**Goal:** Turn review-status and account events into real notifications.

**First event types:**

- article approved;
- article rejected with review comment;
- password changed;
- avatar changed.

- [ ] **Step 1: Add notification table and service**

Fields:

- user id;
- type;
- title;
- body;
- read flag;
- created time;
- target URL.

- [ ] **Step 2: Emit events**

Emit notifications from:

- admin article review approval/rejection;
- user password change;
- avatar replacement/removal.

- [ ] **Step 3: Frontend**

Add:

- `/user/notifications`;
- unread count in user menu;
- mark as read;
- mark all as read.

- [ ] **Step 4: Verify**

Runtime smoke:

- submit article;
- approve or reject from admin;
- user sees notification.

Commit:

```bash
git commit -m "feat(user): add notification center"
```

## P2.5 Display Preferences

**Goal:** Make the currently disabled settings entries real only after there is backend persistence.

**First preferences:**

- theme preference;
- compact card density;
- default favorites filter.

- [ ] **Step 1: Backend persistence**

Add user preferences as JSON or typed columns. Prefer typed columns for the first three fields unless there is an existing JSON preference pattern.

- [ ] **Step 2: Frontend settings**

Enable display-preference controls only after the API exists. Remove the disabled row state for that section in the same commit.

- [ ] **Step 3: Verify**

Runtime smoke:

- change preference;
- refresh browser;
- preference persists.

Commit:

```bash
git commit -m "feat(user): persist display preferences"
```

## Final Validation

Before merging any P1 or P2 branch:

```bash
git status --short --branch -uall
git diff --check
cd back && mvn -DskipTests compile
cd ../front-nuxt && pnpm run check
```

For runtime work, also run local smoke on the active preview ports:

```bash
curl -i http://127.0.0.1:18088/api/user-auth/me
curl -sS 'http://127.0.0.1:18088/api/articles?page=1&limit=5'
```

Manual browser checks:

- `/user`
- `/user/settings`
- `/user/favorites`
- `/user/articles`
- `/articles`
- one public article detail page

## Plan Audit

## Verdict

- Status: execution-ready as a staged follow-up plan, not a single all-in-one branch.
- Main goal: harden the P0 user module and then add real user-space expansion features without fake UI.
- Closure definition: each P1/P2 feature has a backend source, frontend page/store integration, contract or focused tests, and runtime smoke.

## Blocking Plan Defects

- Critical: none.
- Important: P1 auth/session work must land before P2 public profile/history/notification work if those features rely on cookie-auth writes.

## Plan Repairs

- Change: P1 and P2 are explicitly split.
- Reason: session security and product expansion should not share one branch or one commit.
- Validation added: each task defines focused backend/frontend checks plus runtime smoke where page behavior matters.

## Execution-Ready Plan

- Scope: P1 session, origin, avatar, favorites, diagnostics; P2 public profile, reading history, saved routes, notifications, preferences.
- Agent split: auth/session, avatar/storage, favorites/runtime UX, product expansion.
- Smoke test: authenticated user can keep a stable session, safely update account state, and use each new P2 surface with real data.
- Final validation: Maven focused tests, backend compile, Nuxt check, local runtime smoke.

## Residual Risk

- Risk: P2 saved routes may expose crafting-route snapshot complexity.
- Follow-up trigger: if route snapshots require large serialized graph data, split P2.3 into a separate data-contract plan before coding.
