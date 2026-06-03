# User Module Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the public Nuxt user module so visitors can register, log in, recover passwords, manage their account, and use the existing user article workflow instead of seeing the V0.1 unavailable placeholder.

**Architecture:** Reuse the existing backend user contracts (`/api/user-auth/*` and `/api/user/articles/*`) and the old Vue frontend behavior as the source of truth. Add focused Nuxt composables, a Pinia user auth store, route middleware, real user pages, page-contract tests, and a mandatory runtime auth smoke. Auth must work on direct SSR page loads by forwarding incoming cookies on server-side `/user-auth/me` calls while browser requests still use `credentials: 'include'`. Do not add a new favorites database/API in this milestone; `/user/favorites` becomes an authenticated “coming next” page instead of blocking all account functionality.

**Tech Stack:** Nuxt 4, Vue 3, Pinia, TypeScript, TerraPedia Spring Boot backend, existing `usePublicApiFetch` runtime API base, Node contract tests, `pnpm run check`.

---

## Scope Lock

In scope:
- Public Nuxt frontend user auth and account pages under `front-nuxt/pages/user/**`.
- Nuxt user API wrapper and Pinia store.
- Nuxt route middleware for guest-only and authenticated user pages.
- Navigation, breadcrumbs, and about-page copy that currently says accounts are unavailable.
- User article list/create/submit review UI backed by existing `/user/articles` endpoints.
- Contract tests that prove account pages are open and no longer use the unavailable placeholder.

Out of scope:
- New favorite/bookmark database tables.
- New backend auth endpoints or role model.
- Admin login changes.
- Production email/SMS setup changes.
- Full rich article editor parity with the old Vue frontend; first release uses a simple HTML textarea workflow that matches the backend contract.

## Source Of Truth

Backend:
- `back/src/main/java/com/terraria/skills/controller/UserAuthController.java`
- `back/src/main/java/com/terraria/skills/controller/UserArticleController.java`
- `back/src/main/java/com/terraria/skills/auth/UserAuthenticationInterceptor.java`
- `back/src/main/resources/db/migration/V7__add_user_and_article_modules.sql`

Old frontend behavior reference:
- `front/src/api/userAuth.ts`
- `front/src/stores/userAuth.ts`
- `front/src/api/articles.ts`
- `front/src/views/UserLoginView.vue`
- `front/src/views/UserRegisterView.vue`
- `front/src/views/UserForgotPasswordView.vue`
- `front/src/views/UserProfileView.vue`
- `front/src/router/index.ts`
- `front/src/router/routes.ts`

Nuxt implementation target:
- `front-nuxt/composables/useUserApi.ts`
- `front-nuxt/stores/userAuth.ts`
- `front-nuxt/middleware/user-auth.global.ts`
- `front-nuxt/types/public-api.ts`
- `front-nuxt/pages/user/index.vue`
- `front-nuxt/pages/user/login.vue`
- `front-nuxt/pages/user/register.vue`
- `front-nuxt/pages/user/forgot-password.vue`
- `front-nuxt/pages/user/settings.vue`
- `front-nuxt/pages/user/articles/index.vue`
- `front-nuxt/pages/user/articles/new.vue`
- `front-nuxt/pages/user/favorites.vue`
- `front-nuxt/components/TerraNav.vue`
- `front-nuxt/components/TerraBreadcrumb.vue`
- `front-nuxt/pages/about.vue`
- `front-nuxt/scripts/check-public-pages.mjs`
- `front-nuxt/scripts/check-user-module-contract.mjs`
- `front-nuxt/scripts/check-user-module-runtime-smoke.mjs`
- `front-nuxt/assets/css/pages/user.css`
- `front-nuxt/nuxt.config.ts`
- `front-nuxt/package.json`

## File Structure

- `front-nuxt/types/public-api.ts`: add user/profile/article DTO types used by Nuxt only.
- `front-nuxt/composables/usePublicApi.ts`: do not change unless TypeScript proves the existing `options: Record<string, unknown>` cannot pass `$fetch` headers; authenticated SSR cookie forwarding is implemented in `useUserApi.ts`.
- `front-nuxt/composables/useUserApi.ts`: thin API wrapper around `/user-auth` and `/user/articles`; uses `credentials: 'include'`, passes `useRequestHeaders(['cookie'])` into server-side authenticated fetch options, sanitizes redirects through a same-origin pathname helper, and unwraps API responses.
- `front-nuxt/stores/userAuth.ts`: Pinia state and actions; no local token storage because backend uses HttpOnly cookies.
- `front-nuxt/middleware/user-auth.global.ts`: route protection based on `definePageMeta({ requiresUserAuth, guestOnly })`.
- `front-nuxt/assets/css/pages/user.css`: shared account page layout, form, status, workspace, and danger-zone styles.
- `front-nuxt/pages/user/*.vue`: replace unavailable placeholder pages with real flows.
- `front-nuxt/components/TerraNav.vue`: user entry/logout state in nav.
- `front-nuxt/components/TerraBreadcrumb.vue`: remove account-route no-link suppression and add forgot-password label.
- `front-nuxt/pages/about.vue`: update release boundary copy.
- `front-nuxt/scripts/check-user-module-contract.mjs`: direct static contract for opened account module.
- `front-nuxt/scripts/check-user-module-runtime-smoke.mjs`: mandatory runtime smoke that verifies real redirects, auth-cookie session restore, and article calls against the local stack.
- `front-nuxt/scripts/check-public-pages.mjs`: remove V0.1 unavailable assertions for account pages and add the new user-module contract invocation markers.
- `front-nuxt/package.json`: add the user module contract to the normal `pnpm run check` chain.

## Task 1: Add Nuxt User Types, API Wrapper, And Store

**Files:**
- Modify: `front-nuxt/types/public-api.ts`
- Create: `front-nuxt/composables/useUserApi.ts`
- Create: `front-nuxt/stores/userAuth.ts`
- Test: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Write the failing user API/store contract test**

Create `front-nuxt/scripts/check-user-module-contract.mjs` with these initial assertions:

```js
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))
const failures = []

const assertExists = (file) => {
  if (!exists(file)) failures.push(`${file} must exist`)
}
const assertIncludes = (file, marker) => {
  const content = read(file)
  if (!content.includes(marker)) failures.push(`${file} missing marker: ${marker}`)
}
const assertNotIncludes = (file, marker) => {
  const content = read(file)
  if (content.includes(marker)) failures.push(`${file} must not include marker: ${marker}`)
}

assertExists('composables/useUserApi.ts')
assertExists('stores/userAuth.ts')

for (const marker of [
  "credentials: 'include'",
  'useRequestHeaders',
  'buildUserRedirectTarget',
  '/user-auth/register/code',
  '/user-auth/password/reset/code',
  '/user-auth/register',
  '/user-auth/login',
  '/user-auth/me',
  '/user-auth/logout',
  '/user-auth/profile',
  '/user-auth/password',
  '/user-auth/password/reset',
  '/user-auth/account',
  '/user/articles',
  '/submit-review',
]) {
  assertIncludes('composables/useUserApi.ts', marker)
}

for (const marker of [
  "defineStore('user-auth'",
  'isAuthenticated',
  'displayName',
  'init',
  'login',
  'register',
  'logout',
  'updateProfile',
  'changePassword',
  'resetPassword',
  'deleteAccount',
  'fetchUserArticles',
  'createUserArticle',
  'submitUserArticleReview',
]) {
  assertIncludes('stores/userAuth.ts', marker)
}

for (const marker of ['UserProfile', 'UserAuthResponse', 'UserRegisterCodeResponse', 'UserArticle', 'UserArticleUpsertPayload']) {
  assertIncludes('types/public-api.ts', marker)
}

for (const page of [
  'pages/user/index.vue',
  'pages/user/login.vue',
  'pages/user/register.vue',
  'pages/user/settings.vue',
  'pages/user/articles/index.vue',
  'pages/user/articles/new.vue',
  'pages/user/favorites.vue',
  'pages/user/forgot-password.vue',
]) {
  assertNotIncludes(page, '账户功能暂未开放')
  assertNotIncludes(page, 'TerraPedia V0.1 先作为只读资料站发布')
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: fail because `composables/useUserApi.ts` and `stores/userAuth.ts` do not exist.

- [ ] **Step 3: Add Nuxt user DTO types**

Append these types near the existing `ApiResponse` types in `front-nuxt/types/public-api.ts`:

```ts
export type UserProfile = {
  id: number
  email: string
  displayName?: string | null
  status?: number | null
}

export type UserAuthResponse = {
  user: UserProfile
  tokenType?: string | null
  expiresAt?: number | null
}

export type UserRegisterCodeResponse = {
  expiresInSeconds: number
  cooldownSeconds: number
  debugVerificationCode?: string | null
}

export type UserArticleStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
export type UserArticleReviewStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'

export type UserArticle = {
  id: number
  title: string
  slug?: string | null
  summary?: string | null
  coverImage?: string | null
  contentHtml: string
  contentMarkdown?: string | null
  status: UserArticleStatus
  reviewStatus?: UserArticleReviewStatus | null
  reviewComment?: string | null
  submittedAt?: string | null
  reviewedAt?: string | null
  reviewerName?: string | null
  publishedAt?: string | null
  authorId?: number | null
  authorDisplayName?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type UserArticleUpsertPayload = {
  title: string
  slug?: string
  summary?: string
  coverImage?: string
  contentHtml: string
}
```

- [ ] **Step 4: Create `front-nuxt/composables/useUserApi.ts`**

Implement the API wrapper with this shape:

```ts
import type {
  ApiResponse,
  Pagination,
  UserArticle,
  UserArticleUpsertPayload,
  UserAuthResponse,
  UserProfile,
  UserRegisterCodeResponse,
} from '~/types/public-api'
import { unwrapApiResponse, usePublicApiFetch } from './usePublicApi'

type UserArticleListResponse = {
  items: UserArticle[]
  pagination: Pagination
}

const userFetch = async <T>(path: string, options: Record<string, unknown> = {}) => {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  return await usePublicApiFetch<T>(path, {
    credentials: 'include',
    headers,
    ...options,
  })
}

export const buildUserRedirectTarget = (raw: unknown, fallback = '/user') => {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback
  try {
    const url = new URL(raw, 'http://terrapedia.local')
    if (url.origin !== 'http://terrapedia.local') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

const normalizeArticleStatus = (value: unknown): UserArticle['status'] => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  return status === 'PUBLISHED' || status === 'OFFLINE' ? status : 'DRAFT'
}

const normalizeArticleReviewStatus = (value: unknown): UserArticle['reviewStatus'] => {
  const status = String(value ?? 'DRAFT').toUpperCase()
  if (status === 'PENDING_REVIEW' || status === 'APPROVED' || status === 'REJECTED') return status
  return 'DRAFT'
}

const normalizeUserArticle = (raw: Partial<UserArticle> | null | undefined): UserArticle => ({
  id: Number(raw?.id ?? 0),
  title: String(raw?.title ?? ''),
  slug: raw?.slug ?? null,
  summary: raw?.summary ?? null,
  coverImage: raw?.coverImage ?? null,
  contentHtml: String(raw?.contentHtml ?? raw?.contentMarkdown ?? ''),
  contentMarkdown: raw?.contentMarkdown ?? null,
  status: normalizeArticleStatus(raw?.status),
  reviewStatus: normalizeArticleReviewStatus(raw?.reviewStatus),
  reviewComment: raw?.reviewComment ?? null,
  submittedAt: raw?.submittedAt ?? null,
  reviewedAt: raw?.reviewedAt ?? null,
  reviewerName: raw?.reviewerName ?? null,
  publishedAt: raw?.publishedAt ?? null,
  authorId: raw?.authorId ?? null,
  authorDisplayName: raw?.authorDisplayName ?? null,
  createdAt: raw?.createdAt ?? null,
  updatedAt: raw?.updatedAt ?? null,
})

const toArticlePayload = (payload: UserArticleUpsertPayload) => ({
  title: payload.title,
  slug: payload.slug,
  summary: payload.summary,
  coverImage: payload.coverImage,
  contentHtml: payload.contentHtml,
})

export const sendRegisterCode = async (email: string): Promise<UserRegisterCodeResponse> =>
  unwrapApiResponse(await userFetch<UserRegisterCodeResponse>('/user-auth/register/code', { method: 'POST', body: { email } }))

export const sendPasswordResetCode = async (email: string): Promise<UserRegisterCodeResponse> =>
  unwrapApiResponse(await userFetch<UserRegisterCodeResponse>('/user-auth/password/reset/code', { method: 'POST', body: { email } }))

export const registerUser = async (payload: { email: string; password: string; verificationCode: string; displayName?: string }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/register', { method: 'POST', body: payload }))

export const loginUser = async (payload: { email: string; password: string }): Promise<UserAuthResponse> =>
  unwrapApiResponse(await userFetch<UserAuthResponse>('/user-auth/login', { method: 'POST', body: payload }))

export const fetchCurrentUser = async (): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/me'))

export const logoutUser = async (): Promise<void> => {
  await userFetch<void>('/user-auth/logout', { method: 'POST' })
}

export const updateUserProfile = async (payload: { displayName: string }): Promise<UserProfile> =>
  unwrapApiResponse(await userFetch<UserProfile>('/user-auth/profile', { method: 'PATCH', body: payload }))

export const changeUserPassword = async (payload: { currentPassword: string; newPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/password', { method: 'PATCH', body: payload })
}

export const resetUserPassword = async (payload: { email: string; verificationCode: string; newPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/password/reset', { method: 'POST', body: payload })
}

export const deleteOwnAccount = async (payload: { currentPassword: string }): Promise<void> => {
  await userFetch<void>('/user-auth/account', { method: 'DELETE', body: payload })
}

export const fetchUserArticles = async (page = 1, limit = 10, keyword = ''): Promise<UserArticleListResponse> => {
  const response = await userFetch<UserArticle[]>('/user/articles', {
    query: { page, limit, keyword: keyword || undefined },
  })
  const data = response as ApiResponse<UserArticle[]>
  return {
    items: Array.isArray(data.data) ? data.data.map(normalizeUserArticle) : [],
    pagination: data.pagination ?? { total: 0, page, limit, totalPages: 1 },
  }
}

export const createUserArticle = async (payload: UserArticleUpsertPayload): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>('/user/articles', { method: 'POST', body: toArticlePayload(payload) })))

export const submitUserArticleReview = async (id: number): Promise<UserArticle> =>
  normalizeUserArticle(unwrapApiResponse(await userFetch<UserArticle>(`/user/articles/${id}/submit-review`, { method: 'POST' })))
```

- [ ] **Step 5: Create `front-nuxt/stores/userAuth.ts`**

Implement a Pinia store mirroring the old Vue store:

```ts
import { defineStore } from 'pinia'
import type { UserArticle, UserArticleUpsertPayload, UserProfile } from '~/types/public-api'
import {
  changeUserPassword,
  createUserArticle,
  deleteOwnAccount,
  fetchCurrentUser,
  fetchUserArticles,
  loginUser,
  logoutUser,
  registerUser,
  resetUserPassword,
  sendPasswordResetCode,
  sendRegisterCode,
  submitUserArticleReview,
  updateUserProfile,
} from '~/composables/useUserApi'

export const useUserAuthStore = defineStore('user-auth', () => {
  const user = ref<UserProfile | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const initialized = ref(false)
  const initPromise = ref<Promise<void> | null>(null)
  const articles = ref<UserArticle[]>([])
  const articlesLoading = ref(false)
  const articlePagination = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })

  const isAuthenticated = computed(() => Boolean(user.value))
  const displayName = computed(() => user.value?.displayName || user.value?.email || '访客')

  const init = async () => {
    if (initialized.value) return
    if (initPromise.value) return await initPromise.value
    initPromise.value = (async () => {
      loading.value = true
      try {
        user.value = await fetchCurrentUser()
      } catch {
        user.value = null
      } finally {
        loading.value = false
        initialized.value = true
        initPromise.value = null
      }
    })()
    await initPromise.value
  }

  const login = async (email: string, password: string) => {
    submitting.value = true
    try {
      const response = await loginUser({ email, password })
      user.value = response.user
      initialized.value = true
      return response.user
    } finally {
      submitting.value = false
    }
  }

  const requestRegisterCode = (email: string) => sendRegisterCode(email)
  const requestPasswordResetCode = (email: string) => sendPasswordResetCode(email)

  const register = async (payload: { email: string; password: string; verificationCode: string; displayName?: string }) => {
    submitting.value = true
    try {
      const response = await registerUser(payload)
      user.value = response.user
      initialized.value = true
      return response.user
    } finally {
      submitting.value = false
    }
  }

  const logout = async () => {
    try {
      await logoutUser()
    } finally {
      user.value = null
      initialized.value = true
      articles.value = []
    }
  }

  const updateProfile = async (displayName: string) => {
    submitting.value = true
    try {
      user.value = await updateUserProfile({ displayName })
      initialized.value = true
      return user.value
    } finally {
      submitting.value = false
    }
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    submitting.value = true
    try {
      await changeUserPassword({ currentPassword, newPassword })
    } finally {
      submitting.value = false
    }
  }

  const resetPassword = async (payload: { email: string; verificationCode: string; newPassword: string }) => {
    submitting.value = true
    try {
      await resetUserPassword(payload)
    } finally {
      submitting.value = false
    }
  }

  const deleteAccount = async (currentPassword: string) => {
    submitting.value = true
    try {
      await deleteOwnAccount({ currentPassword })
    } finally {
      user.value = null
      initialized.value = true
      submitting.value = false
    }
  }

  const loadUserArticles = async (page = 1, limit = 10, keyword = '') => {
    articlesLoading.value = true
    try {
      const response = await fetchUserArticles(page, limit, keyword)
      articles.value = response.items
      articlePagination.value = {
        total: Number(response.pagination.total ?? 0),
        page: Number(response.pagination.page ?? page),
        limit: Number(response.pagination.limit ?? response.pagination.size ?? limit),
        totalPages: Number(response.pagination.totalPages ?? 1),
      }
      return response
    } finally {
      articlesLoading.value = false
    }
  }

  const saveUserArticle = async (payload: UserArticleUpsertPayload) => createUserArticle(payload)
  const submitArticleReview = async (id: number) => submitUserArticleReview(id)

  return {
    user,
    loading,
    submitting,
    initialized,
    articles,
    articlesLoading,
    articlePagination,
    isAuthenticated,
    displayName,
    init,
    login,
    requestRegisterCode,
    requestPasswordResetCode,
    register,
    logout,
    updateProfile,
    changePassword,
    resetPassword,
    deleteAccount,
    fetchUserArticles: loadUserArticles,
    createUserArticle: saveUserArticle,
    submitUserArticleReview: submitArticleReview,
  }
})
```

- [ ] **Step 6: Run the contract test**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: still fail on pages until later tasks replace placeholders.

## Task 2: Add Route Middleware And Page Metadata

**Files:**
- Create: `front-nuxt/middleware/user-auth.global.ts`
- Modify: all `front-nuxt/pages/user/**/*.vue`
- Test: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Extend the contract test for route protection**

Add these assertions to `front-nuxt/scripts/check-user-module-contract.mjs`:

```js
assertExists('middleware/user-auth.global.ts')
assertIncludes('middleware/user-auth.global.ts', 'requiresUserAuth')
assertIncludes('middleware/user-auth.global.ts', 'guestOnly')
assertIncludes('middleware/user-auth.global.ts', 'buildUserRedirectTarget')
assertIncludes('middleware/user-auth.global.ts', '/user/login')
assertIncludes('pages/user/login.vue', 'guestOnly: true')
assertIncludes('pages/user/register.vue', 'guestOnly: true')
assertIncludes('pages/user/forgot-password.vue', 'guestOnly: true')
assertIncludes('pages/user/index.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/settings.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/articles/index.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/articles/new.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/favorites.vue', 'requiresUserAuth: true')
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: fail because middleware and metadata are absent.

- [ ] **Step 3: Create `front-nuxt/middleware/user-auth.global.ts`**

```ts
import { buildUserRedirectTarget } from '~/composables/useUserApi'

export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/user')) return

  const authStore = useUserAuthStore()
  if (!authStore.initialized) {
    await authStore.init()
  }

  const meta = to.meta as Record<string, unknown>
  if (meta.requiresUserAuth && !authStore.isAuthenticated) {
    return navigateTo({
      path: '/user/login',
      query: { redirect: to.fullPath },
    })
  }

  if (meta.guestOnly && authStore.isAuthenticated) {
    return navigateTo(buildUserRedirectTarget(to.query.redirect, '/user'))
  }
})
```

- [ ] **Step 4: Add page metadata**

Add `definePageMeta({ guestOnly: true })` to:
- `front-nuxt/pages/user/login.vue`
- `front-nuxt/pages/user/register.vue`
- `front-nuxt/pages/user/forgot-password.vue`

Add `definePageMeta({ requiresUserAuth: true })` to:
- `front-nuxt/pages/user/index.vue`
- `front-nuxt/pages/user/settings.vue`
- `front-nuxt/pages/user/articles/index.vue`
- `front-nuxt/pages/user/articles/new.vue`
- `front-nuxt/pages/user/favorites.vue`

- [ ] **Step 5: Run route contract**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: route metadata assertions pass; placeholder page assertions still fail until Task 4 and Task 5.

## Task 3: Add Shared User Page CSS And Config Hook

**Files:**
- Create: `front-nuxt/assets/css/pages/user.css`
- Modify: `front-nuxt/nuxt.config.ts`
- Test: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Add style assertions**

Add:

```js
assertExists('assets/css/pages/user.css')
for (const marker of ['.user-shell', '.user-panel', '.user-form', '.user-action-grid', '.user-danger-zone', '.user-status-pill']) {
  assertIncludes('assets/css/pages/user.css', marker)
}
assertIncludes('nuxt.config.ts', '~/assets/css/pages/user.css')
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: fail on missing CSS/config marker.

- [ ] **Step 3: Create user CSS**

Create `front-nuxt/assets/css/pages/user.css` with reusable classes:

```css
.user-shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 56px;
  display: grid;
  gap: 18px;
}

.user-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 18px;
  align-items: start;
}

.user-panel {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: var(--panel-shadow);
  padding: 20px;
}

.user-panel h2,
.user-panel h3 {
  margin: 0;
  color: var(--text-primary);
}

.user-muted {
  color: var(--text-secondary);
  line-height: 1.65;
}

.user-form {
  display: grid;
  gap: 14px;
}

.user-field {
  display: grid;
  gap: 7px;
}

.user-field span {
  font-size: .88rem;
  font-weight: 700;
  color: var(--text-primary);
}

.user-input,
.user-textarea {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 11px 12px;
  background: var(--surface-bg);
  color: var(--text-primary);
  font: inherit;
}

.user-textarea {
  min-height: 220px;
  resize: vertical;
  line-height: 1.65;
}

.user-input:focus,
.user-textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-primary) 42%, transparent);
  outline-offset: 2px;
}

.user-button-row,
.user-action-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.user-action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.user-action-card {
  min-height: 92px;
  display: grid;
  gap: 6px;
  align-content: center;
  text-decoration: none;
  color: var(--text-primary);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 14px;
  background: color-mix(in srgb, var(--surface-bg) 92%, transparent);
}

.user-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: .78rem;
  font-weight: 800;
  background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  color: var(--text-primary);
}

.user-feedback {
  margin: 0;
  line-height: 1.5;
}

.user-feedback--error {
  color: var(--danger-text, #b91c1c);
}

.user-feedback--success {
  color: var(--success-text, #047857);
}

.user-danger-zone {
  border-color: color-mix(in srgb, #ef4444 40%, var(--panel-border));
}

.user-article-list {
  display: grid;
  gap: 10px;
}

.user-article-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 12px;
  background: color-mix(in srgb, var(--surface-bg) 92%, transparent);
}

@media (max-width: 860px) {
  .user-grid {
    grid-template-columns: 1fr;
  }

  .user-article-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Register the CSS file**

Add this line to `front-nuxt/nuxt.config.ts` `css` array:

```ts
'~/assets/css/pages/user.css',
```

- [ ] **Step 5: Run style contract**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: CSS/config assertions pass.

## Task 4: Implement Login, Register, And Forgot Password Pages

**Files:**
- Modify: `front-nuxt/pages/user/login.vue`
- Modify: `front-nuxt/pages/user/register.vue`
- Create: `front-nuxt/pages/user/forgot-password.vue`
- Test: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Add auth page assertions**

Add:

```js
for (const marker of ['authStore.login', 'redirectTarget', 'autocomplete="email"', 'autocomplete="current-password"', '/user/register', '/user/forgot-password']) {
  assertIncludes('pages/user/login.vue', marker)
}
for (const marker of ['authStore.requestRegisterCode', 'authStore.register', 'debugVerificationCode', 'verificationCode', 'autocomplete="new-password"']) {
  assertIncludes('pages/user/register.vue', marker)
}
for (const marker of ['authStore.requestPasswordResetCode', 'authStore.resetPassword', 'newPassword', 'verificationCode']) {
  assertIncludes('pages/user/forgot-password.vue', marker)
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: fail because pages are still placeholders.

- [ ] **Step 3: Replace `login.vue`**

Implement:
- `definePageMeta({ guestOnly: true })`
- `useUserAuthStore()`
- `redirectTarget` from `buildUserRedirectTarget(route.query.redirect, '/')`; reject protocol-relative paths, backslashes, and non-path values.
- form fields: email, password
- on submit: call `authStore.login(email, password)` and `navigateTo(redirectTarget.value)`
- links to `/user/register` and `/user/forgot-password`
- visible labels, `required` fields, `aria-live="polite"` feedback, inline error, and disabled submit while `authStore.submitting`

- [ ] **Step 4: Replace `register.vue`**

Implement:
- `definePageMeta({ guestOnly: true })`
- fields: display name, email, verification code, password, confirm password
- send-code button with cooldown
- disable send-code for empty/invalid email and while a request is active
- if backend returns `debugVerificationCode`, fill it and show local-dev helper text
- validate password match before submit
- call `authStore.register(...)`, then redirect

- [ ] **Step 5: Create `forgot-password.vue`**

Implement:
- `definePageMeta({ guestOnly: true })`
- fields: email, verification code, new password, confirm password
- send reset code with cooldown
- disable send-code for empty/invalid email and while a request is active
- call `authStore.resetPassword(...)`
- after success, navigate to `/user/login`

- [ ] **Step 6: Run auth page contract**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: auth page assertions pass.

## Task 5: Implement User Center And Account Settings

**Files:**
- Modify: `front-nuxt/pages/user/index.vue`
- Modify: `front-nuxt/pages/user/settings.vue`
- Modify: `front-nuxt/pages/user/favorites.vue`
- Test: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Add account page assertions**

Add:

```js
for (const marker of ['requiresUserAuth: true', 'authStore.displayName', 'authStore.user?.email', '/user/articles', '/user/settings', '/user/favorites']) {
  assertIncludes('pages/user/index.vue', marker)
}
for (const marker of ['authStore.updateProfile', 'authStore.changePassword', 'authStore.deleteAccount', 'authStore.logout', 'window.confirm']) {
  assertIncludes('pages/user/settings.vue', marker)
}
for (const marker of ['requiresUserAuth: true', '收藏功能', '暂不接入新数据表', '/items', '/articles']) {
  assertIncludes('pages/user/favorites.vue', marker)
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: fail because account pages are placeholders.

- [ ] **Step 3: Replace `index.vue`**

Implement authenticated user center:
- show `authStore.displayName`, email, status pill
- action cards for `/user/articles`, `/user/articles/new`, `/user/settings`, `/user/favorites`, `/items`, `/articles`
- logout button calling `authStore.logout()` then `navigateTo('/')`

- [ ] **Step 4: Replace `settings.vue`**

Implement:
- profile display name form
- password change form with current/new/confirm fields
- logout button
- delete account form with current password and `window.confirm`
- success/error feedback near each form

- [ ] **Step 5: Replace `favorites.vue`**

Implement authenticated scoped coming-next page:
- clearly say collection/favorites storage is not yet backed by a database in this milestone
- provide links to `/items` and `/articles`
- do not say all account functionality is unavailable

- [ ] **Step 6: Run account page contract**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: account page assertions pass.

## Task 6: Implement User Article List And New Article Page

**Files:**
- Modify: `front-nuxt/pages/user/articles/index.vue`
- Modify: `front-nuxt/pages/user/articles/new.vue`
- Test: `front-nuxt/scripts/check-user-module-contract.mjs`

- [ ] **Step 1: Add article page assertions**

Add:

```js
for (const marker of ['authStore.fetchUserArticles', 'authStore.articles', 'articlePagination', 'submitUserArticleReview', '/user/articles/new', 'user-article-list', 'user-article-row']) {
  assertIncludes('pages/user/articles/index.vue', marker)
}
for (const marker of ['authStore.createUserArticle', 'title', 'slug', 'summary', 'contentHtml', 'submitUserArticleReview']) {
  assertIncludes('pages/user/articles/new.vue', marker)
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: fail because article pages are placeholders.

- [ ] **Step 3: Replace `articles/index.vue`**

Implement:
- search keyword field
- on mounted: `authStore.fetchUserArticles(1, 10, keyword)`
- responsive `.user-article-list` card rows with title, status, review status, created date, updated date, and visible action buttons; do not use a horizontally scrolling table
- empty state with link to `/user/articles/new`
- submit review action calling `authStore.submitUserArticleReview(article.id)` then reload
- simple prev/next controls using `articlePagination`

- [ ] **Step 4: Replace `articles/new.vue`**

Implement:
- fields: title, optional slug, summary, cover image, content HTML textarea
- save draft button: calls `authStore.createUserArticle({ title, slug, summary, coverImage, contentHtml })`
- save and submit button: create draft, then call `authStore.submitUserArticleReview(created.id)`
- after success navigate to `/user/articles`

- [ ] **Step 5: Run article page contract**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
```

Expected: article page assertions pass.

## Task 7: Update Navigation, Breadcrumbs, About Copy, Package Check, And Public Page Contract

**Files:**
- Modify: `front-nuxt/components/TerraNav.vue`
- Modify: `front-nuxt/components/TerraBreadcrumb.vue`
- Modify: `front-nuxt/pages/about.vue`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Modify: `front-nuxt/package.json`
- Test: `front-nuxt/scripts/check-user-module-contract.mjs`
- Test: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add navigation assertions**

Add to user module contract:

```js
for (const marker of ['useUserAuthStore', 'authStore.init', 'authStore.loading', 'authStore.isAuthenticated', '/user/login', '/user', 'authStore.logout', 'aria-label="用户中心"', 'aria-label="退出登录"']) {
  assertIncludes('components/TerraNav.vue', marker)
}
assertIncludes('components/TerraBreadcrumb.vue', '/user/forgot-password')
assertNotIncludes('components/TerraBreadcrumb.vue', 'unavailableAccountRoutes')
assertNotIncludes('pages/about.vue', 'V0.1 不开放账户、收藏、投稿或社区功能')
assertIncludes('pages/about.vue', '账户、投稿和账号设置已开放')
assertIncludes('package.json', 'check:user-module')
assertIncludes('package.json', 'node scripts/check-user-module-contract.mjs')
```

- [ ] **Step 2: Run tests and confirm failures**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
cd front-nuxt && node scripts/check-public-pages.mjs
```

Expected: fail on old unavailable assertions.

- [ ] **Step 3: Update `TerraNav.vue`**

Add:
- `const authStore = useUserAuthStore()`
- `onMounted(() => authStore.init())`
- while initializing/loading: reserve the auth action area with a disabled loading control so login/logout does not flash
- when not authenticated: show touch-sized login link `/user/login` with an accessible label
- when authenticated: show touch-sized user center link `/user` and logout button with accessible labels
- logout button calls `authStore.logout()` and navigates to `/`
- keep the auth controls in `.site-actions` without disturbing search, theme, or resource menu wrapping on narrow screens

- [ ] **Step 4: Update `TerraBreadcrumb.vue`**

Change:
- Add route label `'/user/forgot-password': '找回密码'`.
- Add segment label `'forgot-password': '找回密码'`.
- Remove `unavailableAccountRoutes` and `isUnavailableAccountRoute`.
- Breadcrumb links should only suppress current path, not all account routes.

- [ ] **Step 5: Update `about.vue` copy**

Change public boundary section:

```html
<p>账户、投稿和账号设置已开放；收藏夹保留为已登录用户的规划入口，待后续接入持久化收藏数据。</p>
```

- [ ] **Step 6: Repair `check-public-pages.mjs`**

Remove the `accountUnavailablePageFiles` assertions that require:
- `账户功能暂未开放`
- `TerraPedia V0.1 先作为只读资料站发布`
- `先浏览资料：物品图鉴 / 搜索 / 合成树`

Replace with assertions that user files must not contain those markers and must contain page-specific account markers.

- [ ] **Step 7: Add user module contract to `package.json`**

Add:

```json
"check:user-module": "node scripts/check-user-module-contract.mjs"
```

Then include it in the start of the `check` chain:

```json
"check": "pnpm run check:user-module && pnpm run check:nav-layout && ..."
```

- [ ] **Step 8: Run navigation/public contracts**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
cd front-nuxt && node scripts/check-public-pages.mjs
```

Expected: both pass.

## Task 8: Typecheck, Backend Smoke Tests, And Runtime Validation

**Files:**
- Create: `front-nuxt/scripts/check-user-module-runtime-smoke.mjs`
- Test: backend compile or focused tests if user tests are added.
- Test: Nuxt contract/typecheck.
- Test: mandatory runtime auth smoke against the local stack.

- [ ] **Step 1: Add runtime smoke script**

Create `front-nuxt/scripts/check-user-module-runtime-smoke.mjs` as a deterministic local-stack probe. It must:
- accept `FRONT_BASE_URL` defaulting to `http://localhost:5176`;
- accept `API_BASE_URL` defaulting to `http://localhost:18088/api`;
- fetch `/user/login` and assert the response contains a real login form marker;
- fetch `/user/register` and assert the response contains verification-code and password markers;
- fetch `/user/settings` without cookies and assert it redirects or renders a login redirect target for `/user/settings`;
- fetch `/user/login` with an invalid `tp_user_access` cookie and assert the login form still renders without a redirect loop or server error;
- call `POST /user-auth/login` with `TERRAPEDIA_TEST_USER_EMAIL` and `TERRAPEDIA_TEST_USER_PASSWORD` when those env vars are set, preserve returned cookies, then fetch `/user` and `/user/settings` with those cookies and assert profile/account markers render;
- fetch `/user/articles` with authenticated cookies and assert the user article list shell renders;
- when auth env vars are not set, fail with a clear message rather than silently skipping authenticated checks.

Use bounded `fetch` requests and no database writes except login/session activity. Do not register throwaway users in this script. The final report must record the target API base, frontend base, database named by local stack config, and the test user email without printing its password.

- [ ] **Step 2: Run backend focused evidence**

Run:

```bash
cd back && mvn -DskipTests compile
```

Expected:
- PASS. Current worktree does not contain focused `UserAuth*`, `UserArticle*`, or `AdminUser*` tests. Because backend behavior is not changed in this milestone, backend compile plus mandatory runtime endpoint smoke is the required evidence.

- [ ] **Step 3: Run Nuxt user contracts**

Run:

```bash
cd front-nuxt && node scripts/check-user-module-contract.mjs
cd front-nuxt && node scripts/check-public-pages.mjs
```

Expected: PASS.

- [ ] **Step 4: Run Nuxt typecheck gate**

Run:

```bash
cd front-nuxt && pnpm run check
```

Expected: PASS.

- [ ] **Step 5: Run mandatory local runtime smoke**

Install Nuxt dependencies if the isolated worktree does not have them:

```bash
cd front-nuxt && pnpm install --frozen-lockfile
```

Start or reuse the local stack, then run:

```bash
bash ./scripts/dev/start-local-stack.sh
cd front-nuxt && TERRAPEDIA_TEST_USER_EMAIL=<known-user-email> TERRAPEDIA_TEST_USER_PASSWORD=<known-user-password> node scripts/check-user-module-runtime-smoke.mjs
```

Expected: PASS. If no known user exists, create one through the existing admin/user workflow or database seed only after recording the target database and user email. Use only local-stack credentials and never production-like credentials. Do not mark the feature complete without this runtime smoke.

## Task 9: Review, Commit, And Merge

**Files:**
- All files modified by Tasks 1-8.

- [ ] **Step 1: Run final status checks**

Run:

```bash
git status --short --branch -uall
git diff --cached --stat
```

Expected: no staged files before final staging; only user module files modified.

- [ ] **Step 2: Stage explicit file list**

Run:

```bash
git add \
  front-nuxt/types/public-api.ts \
  front-nuxt/composables/useUserApi.ts \
  front-nuxt/stores/userAuth.ts \
  front-nuxt/middleware/user-auth.global.ts \
  front-nuxt/assets/css/pages/user.css \
  front-nuxt/pages/user/index.vue \
  front-nuxt/pages/user/login.vue \
  front-nuxt/pages/user/register.vue \
  front-nuxt/pages/user/forgot-password.vue \
  front-nuxt/pages/user/settings.vue \
  front-nuxt/pages/user/articles/index.vue \
  front-nuxt/pages/user/articles/new.vue \
  front-nuxt/pages/user/favorites.vue \
  front-nuxt/components/TerraNav.vue \
  front-nuxt/components/TerraBreadcrumb.vue \
  front-nuxt/pages/about.vue \
  front-nuxt/scripts/check-public-pages.mjs \
  front-nuxt/scripts/check-user-module-contract.mjs \
  front-nuxt/scripts/check-user-module-runtime-smoke.mjs \
  front-nuxt/nuxt.config.ts \
  front-nuxt/package.json \
  docs/superpowers/plans/2026-06-03-user-module-open.md
```

- [ ] **Step 3: Commit**

Run:

```bash
git diff --cached --stat
git commit -m "feat(front): open public user module"
```

- [ ] **Step 4: Review before merge**

Use code review with:
- Base SHA: branch point from `main`.
- Head SHA: new feature commit.
- Requirements: this plan file.

Fix any Critical or Important findings before merging.

- [ ] **Step 5: Merge to local `main`**

Before merging, run:

```bash
git status --short --branch -uall
git rev-parse --abbrev-ref HEAD
git -C /home/lolben/.config/superpowers/worktrees/TerraPedia/main-biome-collection-merge-2026-06-03 status --short --branch -uall
git -C /home/lolben/.config/superpowers/worktrees/TerraPedia/main-biome-collection-merge-2026-06-03 rev-parse main
```

Expected:
- feature worktree is clean after commit;
- current branch is `feat/user-module-open-2026-06-03`;
- target `main` worktree exists and is clean;
- target branch state is recorded in the final report.

If verification and review pass:

```bash
git -C /home/lolben/.config/superpowers/worktrees/TerraPedia/main-biome-collection-merge-2026-06-03 merge --no-ff feat/user-module-open-2026-06-03 -m "merge: open public user module"
```

Expected: merge succeeds or reports conflicts. If conflicts happen, resolve them in the `main` worktree and rerun Task 8 validations.

## Multi-Agent Review Plan

Run these review agents before Task 1 execution:

1. **Plan auditor:** Review this Markdown plan for TerraPedia scope, source-chain, boundary, evidence, and merge readiness.
2. **Frontend auth reviewer:** Review whether the planned Nuxt API/store/middleware correctly matches the backend and old Vue frontend behavior.
3. **UI contract reviewer:** Review the page/UI/test split for accessibility, navigation, mobile responsiveness, and whether the plan can pass while user functionality remains blocked.

Review repair rule:
- Critical or Important plan defects must be patched in this document before implementation.
- Minor concerns can be recorded in the final execution notes if they do not block the first open-user milestone.

Implementation ownership split:
- Worker A may write only `front-nuxt/types/public-api.ts`, `front-nuxt/composables/useUserApi.ts`, `front-nuxt/stores/userAuth.ts`, and `front-nuxt/middleware/user-auth.global.ts`.
- Worker B may write only `front-nuxt/pages/user/login.vue`, `front-nuxt/pages/user/register.vue`, `front-nuxt/pages/user/forgot-password.vue`, `front-nuxt/pages/user/index.vue`, `front-nuxt/pages/user/settings.vue`, and `front-nuxt/pages/user/favorites.vue`.
- Worker C may write only `front-nuxt/pages/user/articles/index.vue` and `front-nuxt/pages/user/articles/new.vue`.
- The coordinator writes shared contract files, runtime smoke, navigation, breadcrumbs, about copy, CSS, `package.json`, and this plan. No two workers edit the same file.

## Acceptance Criteria

- `/user/login`, `/user/register`, `/user/forgot-password`, `/user`, `/user/settings`, `/user/articles`, `/user/articles/new`, and `/user/favorites` no longer display the unified unavailable placeholder.
- Guest-only pages redirect authenticated users to `/user` or the safe redirect target.
- Authenticated-only pages redirect guests to `/user/login?redirect=<target>`.
- Redirect targets reject protocol-relative URLs, backslashes, and non-path values.
- User auth uses HttpOnly backend cookies through `credentials: 'include'`; SSR `/user-auth/me` forwards incoming cookies; no token is stored in localStorage.
- User article workflow can list current user articles, create a draft, and submit it for review using existing backend endpoints.
- `front-nuxt/scripts/check-user-module-contract.mjs` passes.
- `front-nuxt/scripts/check-public-pages.mjs` passes.
- `front-nuxt/scripts/check-user-module-runtime-smoke.mjs` passes against the local stack with a known test user.
- `cd front-nuxt && pnpm run check` passes.
- `cd back && mvn -DskipTests compile` passes; backend runtime endpoint behavior is covered by the mandatory smoke because backend user code is not changed.
