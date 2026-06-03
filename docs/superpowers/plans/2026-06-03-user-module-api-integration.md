# User Module API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the restored pre-V0.1 public user module UI to the existing backend user-auth and user-article APIs without replacing the restored visual style.

**Architecture:** Keep the current pre-V0.1 user pages and navigation structure, add a focused public user API composable plus Pinia auth/article store, then update user pages to bind forms and data to that store. Protected user pages should initialize session from cookies and redirect unauthenticated visitors to `/user/login?redirect=<target>`.

**Tech Stack:** Nuxt 4, Vue 3 composition API, Pinia, existing `$fetch` public API helper, Spring Boot backend endpoints under `/api/user-auth` and `/api/user/articles`.

---

## Goal Lock

User-visible closure:
- `/user/login` is a real login form using `POST /api/user-auth/login`, while keeping the pre-V0.1 two-panel visual layout.
- `/user/register` can request a verification code through `POST /api/user-auth/register/code` and register through `POST /api/user-auth/register`.
- `/user` displays a real logged-in profile when authenticated and a guest prompt when not authenticated.
- `/user/settings` allows logged-in users to update display name and password through `PATCH /api/user-auth/profile` and `PATCH /api/user-auth/password`.
- `/user/articles` lists real current-user articles from `GET /api/user/articles`.
- `/user/articles/new` creates a draft through `POST /api/user/articles`.
- Top navigation `TP` menu reflects real session state when initialized.

Out of scope:
- Favorite create/delete APIs, because no backend favorite endpoint is currently present.
- Password reset UI, unless the user asks separately.
- Rich text editor, image upload, markdown preview, article update, or submit-review UI.
- Backend schema or endpoint changes.
- Changing the restored pre-V0.1 visual language into the newer `d7e0bc3` user UI.

## Source Of Truth

Backend API contracts:
- `POST /api/user-auth/login`
- `POST /api/user-auth/register/code`
- `POST /api/user-auth/register`
- `GET /api/user-auth/me`
- `POST /api/user-auth/logout`
- `PATCH /api/user-auth/profile`
- `PATCH /api/user-auth/password`
- `GET /api/user/articles`
- `POST /api/user/articles`

Authentication source:
- Backend writes `tp_user_access` and `tp_user_refresh` HTTP-only cookies.
- Frontend requests must use `credentials: 'include'`.
- SSR requests must forward `cookie` headers for `GET /user-auth/me`.

## Impact Scope

Create:
- `front-nuxt/composables/useUserApi.ts`
- `front-nuxt/stores/userAuth.ts`
- `front-nuxt/middleware/user-auth.global.ts`
- `front-nuxt/scripts/check-user-module-contract.mjs`

Modify:
- `front-nuxt/types/public-api.ts`
- `front-nuxt/assets/css/hifi-preview.css`
- `front-nuxt/components/TerraNav.vue`
- `front-nuxt/pages/user/login.vue`
- `front-nuxt/pages/user/register.vue`
- `front-nuxt/pages/user/index.vue`
- `front-nuxt/pages/user/settings.vue`
- `front-nuxt/pages/user/articles/index.vue`
- `front-nuxt/pages/user/articles/new.vue`
- `front-nuxt/package.json`

No-write boundaries:
- `back/src/main/**` unless validation proves an existing backend bug blocks the integration.
- Database migrations and seed data.
- `/user/favorites` behavior beyond copy explaining favorites are not connected yet.

## Execution Plan

### Task 1: Frontend API Contract And Store

**Files:**
- Create: `front-nuxt/composables/useUserApi.ts`
- Create: `front-nuxt/stores/userAuth.ts`
- Modify: `front-nuxt/types/public-api.ts`

- [ ] Add public user DTO types: `UserProfile`, `UserAuthResponse`, `UserRegisterCodeResponse`, `UserArticle`, `UserArticleUpsertPayload`.
- [ ] Add user API helper functions using existing `usePublicApiFetch` and `unwrapApiResponse`.
- [ ] Exact request bodies and client validation:
  - login: `{ email, password }`, email required and valid, password required.
  - register code: `{ email }`, email required and valid.
  - register: `{ email, password, verificationCode, displayName }`, password 10-64 chars and must contain letters and numbers, verification code 4-8 digits, displayName optional max 120 chars.
  - profile: `{ displayName }`, displayName required 2-120 chars.
  - password: `{ currentPassword, newPassword }`, new password 10-64 chars and must contain letters and numbers.
  - article create: `{ title, slug, summary, coverImage, contentHtml }`, title and contentHtml required, slug/title max 255, summary max 600, coverImage max 500.
- [ ] Add Pinia store for session init, login, register, logout, profile update, password change, user article list, and article create.
- [ ] Ensure all user API calls use `credentials: 'include'`.
- [ ] Ensure SSR session init forwards cookies by reading `useRequestHeaders(['cookie'])` inside `useUserApi.ts` and passing a `cookie` header to `$fetch` only on the server.
- [ ] Do not store bearer tokens in client state; backend HttpOnly cookies remain the auth source.

### Task 2: Route Guards And Navigation Session State

**Files:**
- Create: `front-nuxt/middleware/user-auth.global.ts`
- Modify: `front-nuxt/components/TerraNav.vue`

- [ ] Add route metadata handling:
  - `requiresUserAuth` redirects unauthenticated visitors to `/user/login?redirect=<target>`.
  - `guestOnly` redirects authenticated users away from login/register to `/user`.
- [ ] Implement a shared redirect sanitizer that accepts only same-site paths beginning with one `/`, rejects `//evil.com`, backslashes, absolute URLs, encoded control characters, and falls back to `/user`.
- [ ] Initialize session only for `/user` routes or when navigation renders the account menu.
- [ ] Update `TP` menu with three visible states: initializing, guest, and authenticated. Long display names or email text must not widen the 286px menu.
- [ ] Add logout action in the account menu when authenticated.

### Task 3: Login And Register Forms

**Files:**
- Modify: `front-nuxt/pages/user/login.vue`
- Modify: `front-nuxt/pages/user/register.vue`

- [ ] Keep the current `user-auth-layout`, `user-auth-copy`, and `user-form-panel` visual structure.
- [ ] Replace readonly preview fields with bound inputs.
- [ ] Login: call `authStore.login(email, password)` and navigate to sanitized redirect target or `/user`.
- [ ] Register: call `authStore.requestRegisterCode(email)` and `authStore.register({ email, password, verificationCode, displayName })`.
- [ ] Render inline loading, success, hint, cooldown/debug-code, disabled, and error states inside the current right-side panel without horizontal overflow at 375px, 720px, 1180px, or 1440px.

### Task 4: User Center And Settings

**Files:**
- Modify: `front-nuxt/pages/user/index.vue`
- Modify: `front-nuxt/pages/user/settings.vue`

- [ ] `/user` initializes current session and displays authenticated profile status.
- [ ] `/user` remains public: guest state shows login/register prompts and no fake counts; authenticated state shows displayName/email and real article counts when loaded.
- [ ] `/user/settings` requires auth and binds display name to `PATCH /user-auth/profile`.
- [ ] Add password change fields bound to `PATCH /user-auth/password`.
- [ ] Preserve settings panel/list layout and existing visual classes; profile and password forms must have clear separate groups with success/error feedback.

### Task 5: User Article List And Draft Creation

**Files:**
- Modify: `front-nuxt/pages/user/articles/index.vue`
- Modify: `front-nuxt/pages/user/articles/new.vue`

- [ ] `/user/articles` requires auth, fetches `GET /user/articles`, and maps review status to Chinese labels.
- [ ] Show loading, empty, error, one-row, ten-row, long-title, and long-status states without overflowing the existing row layout.
- [ ] `/user/articles/new` requires auth and exposes title, summary, slug, cover image, and content fields.
- [ ] Save draft through `POST /user/articles`, then navigate back to `/user/articles`.
- [ ] Keep current editor-side visual affordances but make validation state reflect real form fields; the content textarea keeps at least the previous 300px visual weight.

### Task 6: Contract Checks And Runtime Smoke

**Files:**
- Create: `front-nuxt/scripts/check-user-module-contract.mjs`
- Modify: `front-nuxt/package.json`

- [ ] Add a static contract check that verifies:
  - login/register/settings/article pages no longer contain readonly preview-only inputs or `登录占位`/`注册占位` copy.
  - user API functions target the backend endpoints listed in this plan.
  - store exposes session and article actions.
  - middleware recognizes `requiresUserAuth` and `guestOnly`.
  - forms use `@submit.prevent`, submit buttons use `type="submit"`, and submit handlers call store actions.
  - `credentials: 'include'` and SSR cookie forwarding are present.
  - redirect sanitizer negative cases are present in script fixtures.
  - UI state classes for loading, error, success, empty, disabled, guest, and authenticated nav are present.
- [ ] Add `check:user-module` script.
- [ ] Include `pnpm run check:user-module` in the main `pnpm run check` chain.
- [ ] Run `pnpm run check:user-module`.
- [ ] Run `pnpm run check`.
- [ ] Run `mvn -DskipTests compile`.
- [ ] With local backend running, smoke check:
  - `GET http://localhost:5176/user/login` contains login form labels and not `登录占位`.
  - `GET http://localhost:5176/user` renders user center without server errors.
  - unauthenticated `/user/settings` and `/user/articles` navigate to login with relative redirect.
  - malicious redirect values such as `//evil.example/path` and encoded control characters fall back to `/user`.
  - after login with a local test user, reload `/user/settings` still recognizes the cookie, `/api/user-auth/me` succeeds, and `/api/user/articles` returns a list or empty list.
  - after logout, protected pages block again.

## Multi-Agent Review Split

Agent A, backend/API contract review:
- Read backend controllers, DTOs, auth interceptor, and API helper plan.
- Verify endpoint names, HTTP methods, auth cookies, request bodies, and protected routes.
- Flag any mismatch that would make the frontend call fail.

Agent B, frontend UI/state review:
- Read current pre-V0.1 user pages and `TerraNav.vue`.
- Verify the plan preserves visual layout while replacing preview-only behavior.
- Flag UX gaps or likely hydration/session problems.

Agent C, validation/security review:
- Review the planned guard, redirect sanitization, cookie forwarding, and contract tests.
- Flag missing smoke tests, unsafe redirects, accidental exposure of auth tokens, or insufficient negative states.

## Acceptance Criteria

- `pnpm run check:user-module` exits 0.
- `pnpm run check` exits 0.
- `mvn -DskipTests compile` exits 0.
- `/user/login` is no longer preview-only and can submit to the backend.
- `/user/register` can request a verification code and submit registration fields.
- Protected pages redirect unauthenticated visitors to login with a same-origin relative redirect.
- `TP` menu renders a guest state before login and a profile/logout state after session init.
- User module dynamic states keep the pre-V0.1 layout classes: `user-auth-layout`, `user-form-panel`, `user-layout`, `user-dashboard-grid`, `editor-layout`, and `settings-layout`.
- Same-origin Nuxt `/api` proxy remains the expected browser path for credentialed calls; cross-site credentialed API deployment needs a separate backend CSRF/origin review before production.
- Work is committed as a focused branch commit and can be fast-forward merged to local `main`.

## Residual Risks

- Local mail sending may be disabled or unavailable; registration-code UI must surface backend errors rather than pretending success.
- Existing backend may have no seeded public user account; runtime login smoke may need a local test account if we validate full login.
- Favorites remain visual-only until a backend favorite contract exists.

## Execution Record - 2026-06-03

Implemented:
- Added a shared public user API layer, Pinia auth/article store, and global user-auth middleware.
- Connected login, register, user center, settings, article list, and draft creation pages to the backend APIs while preserving the pre-V0.1 visual classes.
- Updated the `TP` account menu to render loading, guest, authenticated, and logout states.
- Added `check:user-module` and included it in the front-end `check` chain.
- Extracted redirect sanitization to `front-nuxt/lib/userRedirect.mjs` so production code and contract checks execute the same sanitizer.

Multi-agent review closure:
- Backend/API review: no Critical, Important, or Minor findings after fixes; endpoint paths, methods, DTO fields, cookies, and article payloads match the backend.
- Frontend UI/state review: no remaining findings after replacing `Preview account` and making article-list loading state visible before the async fetch resolves.
- Security/validation review: no remaining Critical or Important findings after executable production sanitizer assertions, guest-only loop protection, and trailing-slash redirect assertions.

Validation evidence:
- `cd front-nuxt && pnpm run check:user-module`: passed.
- `cd front-nuxt && pnpm run check`: passed. Nuxt typecheck prints the existing Node `DEP0205` deprecation warning, but exits 0.
- `cd back && mvn -DskipTests compile`: passed.
- `git diff --check`: passed.

Runtime smoke evidence with local services:
- `GET http://localhost:5176/user/login`: rendered the real login form with `Account login`, email/password inputs, `user-form-panel`, and no `登录占位` or `Preview account`.
- `GET http://localhost:5176/user/register`: rendered the real register form with verification-code input using `pattern="[0-9]{4,8}"`, and no `注册占位` or `Preview account`.
- `HEAD http://localhost:5176/user/settings`: returned `302` to `/user/login?redirect=/user/settings` when unauthenticated.
- `HEAD http://localhost:5176/user/articles`: returned `302` to `/user/login?redirect=/user/articles` when unauthenticated.
- `GET http://localhost:5176/user/login?redirect=%2Fuser%2Flogin%2F`: rendered login with register link falling back to `/user`, confirming guest-only loop targets are downgraded.
- `POST http://localhost:18088/api/user-auth/register/code`: returned `{"success":false,"message":"Email verification is disabled","statusCode":400}` in this local environment, so full register/login cookie persistence smoke was not executable here.
