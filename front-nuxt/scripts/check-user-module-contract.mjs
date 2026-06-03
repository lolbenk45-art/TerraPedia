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
  if (!exists(file)) {
    failures.push(`${file} must exist before checking marker: ${marker}`)
    return
  }
  const content = read(file)
  if (!content.includes(marker)) failures.push(`${file} missing marker: ${marker}`)
}

const assertNotIncludes = (file, marker) => {
  if (!exists(file)) {
    failures.push(`${file} must exist before checking forbidden marker: ${marker}`)
    return
  }
  const content = read(file)
  if (content.includes(marker)) failures.push(`${file} must not include marker: ${marker}`)
}

assertExists('composables/useUserApi.ts')
assertExists('stores/userAuth.ts')
assertExists('middleware/user-auth.global.ts')
assertExists('assets/css/pages/user.css')

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

for (const marker of ['requiresUserAuth', 'guestOnly', 'buildUserRedirectTarget', '/user/login']) {
  assertIncludes('middleware/user-auth.global.ts', marker)
}

for (const marker of ['.user-shell', '.user-panel', '.user-form', '.user-action-grid', '.user-danger-zone', '.user-status-pill']) {
  assertIncludes('assets/css/pages/user.css', marker)
}
assertIncludes('nuxt.config.ts', '~/assets/css/pages/user.css')

assertIncludes('pages/user/login.vue', 'guestOnly: true')
assertIncludes('pages/user/register.vue', 'guestOnly: true')
assertIncludes('pages/user/forgot-password.vue', 'guestOnly: true')
assertIncludes('pages/user/index.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/settings.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/articles/index.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/articles/new.vue', 'requiresUserAuth: true')
assertIncludes('pages/user/favorites.vue', 'requiresUserAuth: true')

for (const marker of ['authStore.login', 'redirectTarget', 'autocomplete="email"', 'autocomplete="current-password"', '/user/register', '/user/forgot-password']) {
  assertIncludes('pages/user/login.vue', marker)
}
for (const marker of ['authStore.requestRegisterCode', 'authStore.register', 'debugVerificationCode', 'verificationCode', 'autocomplete="new-password"']) {
  assertIncludes('pages/user/register.vue', marker)
}
for (const marker of ['authStore.requestPasswordResetCode', 'authStore.resetPassword', 'newPassword', 'verificationCode']) {
  assertIncludes('pages/user/forgot-password.vue', marker)
}

for (const marker of ['requiresUserAuth: true', 'authStore.displayName', 'authStore.user?.email', '/user/articles', '/user/settings', '/user/favorites']) {
  assertIncludes('pages/user/index.vue', marker)
}
for (const marker of ['authStore.updateProfile', 'authStore.changePassword', 'authStore.deleteAccount', 'authStore.logout', 'window.confirm']) {
  assertIncludes('pages/user/settings.vue', marker)
}
for (const marker of ['requiresUserAuth: true', '收藏功能', '暂不接入新数据表', '/items', '/articles']) {
  assertIncludes('pages/user/favorites.vue', marker)
}

for (const marker of ['authStore.fetchUserArticles', 'authStore.articles', 'articlePagination', 'submitUserArticleReview', '/user/articles/new', 'user-article-list', 'user-article-row']) {
  assertIncludes('pages/user/articles/index.vue', marker)
}
for (const marker of ['authStore.createUserArticle', 'title', 'slug', 'summary', 'contentHtml', 'submitUserArticleReview']) {
  assertIncludes('pages/user/articles/new.vue', marker)
}

for (const marker of ['useUserAuthStore', 'authStore.init', 'authStore.loading', 'authStore.isAuthenticated', '/user/login', '/user', 'authStore.logout', 'aria-label="用户中心"', 'aria-label="退出登录"']) {
  assertIncludes('components/TerraNav.vue', marker)
}
assertIncludes('components/TerraBreadcrumb.vue', '/user/forgot-password')
assertNotIncludes('components/TerraBreadcrumb.vue', 'unavailableAccountRoutes')
assertNotIncludes('pages/about.vue', 'V0.1 不开放账户、收藏、投稿或社区功能')
assertIncludes('pages/about.vue', '账户、投稿和账号设置已开放')
assertIncludes('package.json', 'check:user-module')
assertIncludes('package.json', 'node scripts/check-user-module-contract.mjs')

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
