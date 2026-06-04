import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildUserPostAuthRedirectTarget, buildUserRedirectTarget } from '../lib/userRedirect.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const exists = (path) => existsSync(join(root, path))

const violations = []

const assertFile = (path) => {
  if (!exists(path)) {
    violations.push(`${path}: missing required user module file`)
    return ''
  }
  return read(path)
}

const assertIncludes = (path, content, marker, message) => {
  if (!content.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const assertNotIncludes = (path, content, marker, message) => {
  if (content.includes(marker)) {
    violations.push(`${path}: ${message}`)
  }
}

const assertPattern = (path, content, pattern, message) => {
  if (!pattern.test(content)) {
    violations.push(`${path}: ${message}`)
  }
}

const assertNotPattern = (path, content, pattern, message) => {
  if (pattern.test(content)) {
    violations.push(`${path}: ${message}`)
  }
}

const assertRedirectTarget = (input, expected) => {
  const actual = buildUserRedirectTarget(input)
  if (actual !== expected) {
    violations.push(`scripts/check-user-module-contract.mjs: redirect sanitizer maps ${JSON.stringify(input)} to ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  }
}

const assertPostAuthRedirectTarget = (input, expected) => {
  const actual = buildUserPostAuthRedirectTarget(input)
  if (actual !== expected) {
    violations.push(`scripts/check-user-module-contract.mjs: post-auth redirect sanitizer maps ${JSON.stringify(input)} to ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  }
}

const apiPath = 'composables/useUserApi.ts'
const redirectUtilPath = 'lib/userRedirect.mjs'
const storePath = 'stores/userAuth.ts'
const favoritesStorePath = 'stores/userFavorites.ts'
const middlewarePath = 'middleware/user-auth.global.ts'
const typesPath = 'types/public-api.ts'
const navPath = 'components/TerraNav.vue'
const cssPath = 'assets/css/hifi-preview.css'

const api = assertFile(apiPath)
const redirectUtil = assertFile(redirectUtilPath)
const store = assertFile(storePath)
const favoritesStore = assertFile(favoritesStorePath)
const middleware = assertFile(middlewarePath)
const types = assertFile(typesPath)
const nav = assertFile(navPath)
const css = assertFile(cssPath)
const packageJson = read('package.json')

for (const marker of [
  '/user-auth/register/code',
  '/user-auth/password/reset/code',
  '/user-auth/password/reset',
  '/user-auth/register',
  '/user-auth/login',
  '/user-auth/refresh',
  '/user-auth/me',
  '/user-auth/logout',
  '/user-auth/profile',
  '/user-auth/password',
  '/user/articles',
]) {
  assertIncludes(apiPath, api, marker, `user API must target ${marker}`)
}

for (const marker of [
  'sensitiveUserErrorPattern',
  'sanitizeUserApiError',
  'auth:user:refresh',
  'password_hash',
  'objectKey',
  'tp_user_',
]) {
  assertIncludes(apiPath, api, marker, `user API error handling must guard sensitive diagnostics with ${marker}`)
}

for (const marker of [
  'export const fetchUserArticle =',
  'export const updateUserArticle =',
  'export const submitUserArticleForReview =',
  'export const withdrawUserArticle =',
  'export const deleteUserArticle =',
  '`/user/articles/${id}`',
  '`/user/articles/${id}/submit-review`',
  '`/user/articles/${id}/withdraw`',
]) {
  assertIncludes(apiPath, api, marker, `user article API wrappers must include ${marker}`)
}

for (const marker of [
  "credentials: 'include'",
  "useRequestHeaders(['cookie'])",
  'buildUserRedirectTarget',
  'buildUserPostAuthRedirectTarget',
]) {
  assertIncludes(apiPath, api, marker, `user API must include ${marker}`)
}

for (const marker of [
  'buildUserRedirectTarget',
  'buildUserPostAuthRedirectTarget',
  "raw.startsWith('//')",
  "raw.includes('\\\\')",
  'decodeURIComponent',
]) {
  assertIncludes(redirectUtilPath, redirectUtil, marker, `redirect utility must include ${marker}`)
}

for (const marker of [
  'type UserProfile',
  'type UserAuthResponse',
  'type UserRegisterCodeResponse',
  'expiresInSeconds',
  'type UserArticle',
  'type PublicUserArticle',
  'type PublicUserProfile',
  'type UserArticleUpsertPayload',
]) {
  assertIncludes(typesPath, types, marker, `public API types must expose ${marker}`)
}

for (const marker of [
  'useUserAuthStore',
  'isAuthenticated',
  'displayName',
  'init',
  'login',
  'register',
  'requestRegisterCode',
  'requestPasswordResetCode',
  'resetPassword',
  'refreshUserSession',
  'logout',
  'updateProfile',
  'changePassword',
  'fetchUserArticles',
  'createUserArticle',
  'fetchUserArticle',
  'updateUserArticle',
  'submitUserArticleForReview',
  'withdrawUserArticle',
  'deleteUserArticle',
]) {
  assertIncludes(storePath, store, marker, `user auth store must expose ${marker}`)
}

for (const marker of [
  'pendingStatusLoads',
  'clearUserFavoriteState',
  'isUserApiUnauthorized',
  'clearStatuses',
]) {
  assertIncludes(favoritesStorePath, favoritesStore, marker, `user favorites store must harden runtime state with ${marker}`)
}
assertIncludes(storePath, store, 'clearUserFavoriteState', 'user auth logout must clear favorite state')

for (const marker of [
  'requiresUserAuth',
  'guestOnly',
  'buildUserRedirectTarget',
  'buildUserPostAuthRedirectTarget',
  'authStore.init()',
]) {
  assertIncludes(middlewarePath, middleware, marker, `user auth middleware must handle ${marker}`)
}
assertPattern(
  middlewarePath,
  middleware,
  /navigateTo\([^)]*\/user\/login/,
  'user auth middleware must navigate unauthenticated users to /user/login',
)

for (const marker of [
  'authStore.loading',
  'authStore.isAuthenticated',
  'authStore.displayName',
  '@click.prevent="logout"',
  'account-state-authenticated',
  'account-state-guest',
]) {
  assertIncludes(navPath, nav, marker, `account navigation must expose ${marker}`)
}
assertNotIncludes(navPath, nav, 'Preview account', 'account navigation must not retain preview account copy')

const pageContracts = [
  {
    path: 'pages/user/login.vue',
    required: ['definePageMeta({ guestOnly: true })', '@submit.prevent="submit"', 'authStore.login', 'buildUserPostAuthRedirectTarget', 'type="submit"', 'v-model.trim="form.email"', 'v-model="form.password"', '/user/forgot-password', 'user-form-status', 'user-form-error'],
    forbidden: ['readonly', '登录占位', 'preview-only'],
  },
  {
    path: 'pages/user/register.vue',
    required: ['definePageMeta({ guestOnly: true })', '@submit.prevent="submit"', 'authStore.requestRegisterCode', 'authStore.register', 'verificationCode', 'expiresInSeconds', 'pattern="[0-9]{4,8}"', 'type="submit"', 'user-form-status', 'user-form-error'],
    forbidden: ['readonly', '注册占位', 'preview-only'],
  },
  {
    path: 'pages/user/forgot-password.vue',
    required: ['definePageMeta({ guestOnly: true })', '@submit.prevent="submit"', 'authStore.requestPasswordResetCode', 'authStore.resetPassword', 'verificationCode', 'newPassword', 'expiresInSeconds', 'pattern="[0-9]{4,8}"', 'type="submit"', 'user-form-status', 'user-form-error'],
    forbidden: ['readonly', '找回占位', 'preview-only'],
  },
  {
    path: 'pages/user/index.vue',
    required: ['authStore.init()', 'authStore.isAuthenticated', 'authStore.displayName', 'account-state-authenticated', 'account-state-guest', 'authStore.articlePagination'],
    forbidden: ['静态占位', '<em>24</em>', '<em>6</em>', '泰拉刃制作链', '克苏鲁之眼准备', '最近路径', '阅读路径', '路线记录', '保存进度', '偏好持久化'],
  },
  {
    path: 'pages/user/settings.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', '@submit.prevent="submitProfile"', '@submit.prevent="submitPassword"', 'authStore.updateProfile', 'authStore.changePassword', 'user-form-success', 'user-form-error'],
    forbidden: ['readonly', '保存占位'],
  },
  {
    path: 'pages/user/articles/index.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', 'authStore.fetchUserArticles', 'articlesLoading', 'user-empty-state', 'formatReviewStatus', 'articleActionLabel', 'reviewComment', '编辑', '查看状态', '查看公开页'],
    forbidden: ['近战装备路线补充', '克眼前准备清单'],
  },
  {
    path: 'pages/user/articles/new.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', '@submit.prevent="submit"', 'authStore.createUserArticle', 'contentHtml', 'type="submit"', 'user-form-error'],
    forbidden: ['保存占位', '正文编辑区占位'],
  },
  {
    path: 'pages/user/articles/[id].vue',
    required: ['definePageMeta({ requiresUserAuth: true })', 'authStore.fetchUserArticle', 'authStore.updateUserArticle', 'authStore.submitUserArticleForReview', 'authStore.withdrawUserArticle', 'authStore.deleteUserArticle', 'window.confirm', 'contentHtml', 'user-form-success', 'user-form-error', '保存草稿', '提交审核', '撤回投稿', '删除草稿'],
    forbidden: ['保存占位', '正文编辑区占位'],
  },
  {
    path: 'pages/articles/[slug].vue',
    required: ['usePublicApiFetch<UserArticle>', '/articles/slug/', 'useUserFavoritesStore', "loadStatuses('ARTICLE'", 'toggleArticleFavorite', '收藏文章', '已收藏', 'article.id', '/users/${article.authorId}', 'authorProfilePath'],
    forbidden: ['公开文章暂未开放', '真实文章待接入', '文章未载入', '没有真实发布数据'],
  },
  {
    path: 'pages/users/[id].vue',
    required: ['usePublicApiFetch<PublicUserProfile>', '`/users/${userId.value}`', 'publishedArticles', 'publishedArticleCount', 'user-empty-state', '返回文章入口', 'publicArticlePath'],
    forbidden: ['email', 'token', 'role', 'roles', 'deleted', 'passwordHash', 'avatarObjectKey', 'preview-only', '占位'],
  },
]

for (const contract of pageContracts) {
  const content = assertFile(contract.path)
  for (const marker of contract.required) {
    assertIncludes(contract.path, content, marker, `page contract must include ${marker}`)
  }
  for (const marker of contract.forbidden) {
    assertNotIncludes(contract.path, content, marker, `page must not remain preview-only with ${marker}`)
  }
}

const publicArticleDetail = assertFile('pages/articles/[slug].vue')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /favoritesStore\.loadStatuses\('ARTICLE',\s*\[article\.value\.id\]\)/, 'article detail favorite status must load by returned article.id')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /favoritesStore\.toggleArticleFavorite\(article\.value\.id\)/, 'article detail favorite toggle must use returned article.id')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /v-if="article\.authorId"[\s\S]*:href="`\/users\/\$\{article\.authorId\}`"/, 'article detail author profile link must be conditional on article.authorId')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /v-if="authorProfilePath"[\s\S]*:href="authorProfilePath"/, 'article detail side author link must be conditional on authorProfilePath')
assertNotPattern('pages/articles/[slug].vue', publicArticleDetail, /v-html=/, 'article detail must not render user article HTML directly without sanitizer')

const publicUserProfile = assertFile('pages/users/[id].vue')
assertIncludes('pages/users/[id].vue', publicUserProfile, 'isValidUserId', 'public user page must validate route id before fetching')
assertPattern('pages/users/[id].vue', publicUserProfile, /\/\^\[1-9\]\\d\*\$\/\.test\(userId\.value\)/, 'public user page must only accept positive integer ids')
assertPattern('pages/users/[id].vue', publicUserProfile, /v-for="article in linkablePublishedArticles"[\s\S]*:href="publicArticlePath\(article\.slug\)"/, 'public user article links must render only linkable slug-backed articles')

const userSettings = assertFile('pages/user/settings.vue')
for (const label of ['显示偏好', '通知', '公开身份']) {
  assertPattern('pages/user/settings.vue', userSettings, new RegExp(`<[^>]+class="[^"]*disabled[^"]*"[^>]*>[\\s\\S]*?<b>${label}<\\/b>[\\s\\S]*?后续开放`), `${label} settings entry must be a disabled static row marked 后续开放`)
  assertNotPattern('pages/user/settings.vue', userSettings, new RegExp(`<a\\b[^>]*href="/user/settings"[^>]*>(?:(?!<\\/a>)[\\s\\S])*<b>${label}<\\/b>(?:(?!<\\/a>)[\\s\\S])*<\\/a>`), `${label} settings entry must not be a fake self-link anchor`)
}

for (const marker of [
  '.user-form-status',
  '.user-form-error',
  '.user-form-success',
  '.user-field-hint',
  '.user-empty-state',
  '.account-state-authenticated',
  '.account-state-guest',
  '.account-state-loading',
  ':disabled',
]) {
  assertIncludes(cssPath, css, marker, `user module CSS must define ${marker}`)
}

assertPattern(
  'package.json',
  packageJson,
  /"check:user-module"\s*:\s*"node scripts\/check-user-module-contract\.mjs"/,
  'package scripts must expose check:user-module',
)
assertPattern(
  'package.json',
  packageJson,
  /"check"\s*:\s*"[^"]*check:user-module[^"]*"/,
  'main check script must include check:user-module',
)

assertRedirectTarget('/user/settings?x=1', '/user/settings?x=1')
assertRedirectTarget('//evil.example/path', '/user')
assertRedirectTarget('http://evil.example', '/user')
assertRedirectTarget('%00/user/settings', '/user')
assertRedirectTarget('\\\\evil', '/user')
assertRedirectTarget('/user/%00/settings', '/user')
assertPostAuthRedirectTarget('/user/settings?x=1', '/user/settings?x=1')
assertPostAuthRedirectTarget('/user/login', '/user')
assertPostAuthRedirectTarget('/user/login?redirect=/user/settings', '/user')
assertPostAuthRedirectTarget('/user/login/', '/user')
assertPostAuthRedirectTarget('/user/register', '/user')
assertPostAuthRedirectTarget('/user/register/', '/user')

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('User module contract checks passed.')
