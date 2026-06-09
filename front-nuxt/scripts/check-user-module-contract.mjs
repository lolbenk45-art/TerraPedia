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
const historyStorePath = 'stores/userHistory.ts'
const savedRoutesStorePath = 'stores/userSavedRoutes.ts'
const notificationsStorePath = 'stores/userNotifications.ts'
const preferencesStorePath = 'stores/userPreferences.ts'
const middlewarePath = 'middleware/user-auth.global.ts'
const typesPath = 'types/public-api.ts'
const navPath = 'components/TerraNav.vue'
const cssPath = 'assets/css/hifi-preview.css'

const api = assertFile(apiPath)
const redirectUtil = assertFile(redirectUtilPath)
const store = assertFile(storePath)
const favoritesStore = assertFile(favoritesStorePath)
const historyStore = assertFile(historyStorePath)
const savedRoutesStore = assertFile(savedRoutesStorePath)
const notificationsStore = assertFile(notificationsStorePath)
const preferencesStore = assertFile(preferencesStorePath)
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
  '/user/history',
  '/user/saved-routes',
  '/user/notifications',
  '/user/preferences',
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
  'export const offlineUserArticle =',
  'export const deleteUserArticle =',
  'export const uploadUserArticleImage =',
  'export const uploadUserArticleEmbeddedImages =',
  '`/user/articles/${id}`',
  '`/user/articles/${id}/submit-review`',
  '`/user/articles/${id}/withdraw`',
  '`/user/articles/${id}/offline`',
  "'/user/articles/images'",
]) {
  assertIncludes(apiPath, api, marker, `user article API wrappers must include ${marker}`)
}

for (const marker of [
  'fetchArticleComments',
  'fetchArticleCommentReplies',
  'createArticleCommentReply',
  'likeArticleComment',
  'unlikeArticleComment',
  'normalizeArticleComment',
  'normalizeArticleCommentListResult',
  '`/articles/${articleId}/comments`',
  '`/articles/${articleId}/comments/${commentId}/replies`',
  '`/articles/${articleId}/comments/${commentId}/like`',
  'replyToCommentId',
]) {
  assertIncludes(apiPath, api, marker, `article comment API wrappers must include ${marker}`)
}

for (const marker of [
  "credentials: 'include'",
  "useRequestHeaders(['cookie'])",
  'buildUserRedirectTarget',
  'buildUserPostAuthRedirectTarget',
  'normalizeUserProfile',
  'normalizeUserImageUrl',
  'avatarUrl: normalizeUserImageUrl',
  'authorAvatarUrl: normalizeUserImageUrl',
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
  'type UserReadingHistory',
  'type UserHistoryTargetType',
  'type UserHistoryTypeFilter',
  'type UserSavedRoute',
  'type UserSavedRoutePayload',
  'type UserNotification',
  'type UserPreferences',
  'type UserPreferencesPayload',
  'type PublicUserArticle',
  'type PublicUserProfile',
  'type UserArticleUpsertPayload',
  'authorAvatarUrl',
  'viewCount',
  'favoriteCount',
  'parentId',
  'rootId',
  'replyToUserId',
  'replyToDisplayName',
  'likeCount',
  'likedByCurrentUser',
  'replyCount',
  'replies',
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
  'offlineUserArticle',
  'deleteUserArticle',
  'uploadUserArticleImage',
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
assertIncludes(storePath, store, 'clearUserHistoryState', 'user auth logout must clear history state')
assertIncludes(storePath, store, 'clearUserSavedRoutesState', 'user auth logout must clear saved route state')
assertIncludes(storePath, store, 'clearUserNotificationsState', 'user auth logout must clear notification state')
assertIncludes(storePath, store, 'clearUserPreferencesState', 'user auth logout must clear preference state')

for (const marker of [
  'pendingRecords',
  'clearUserHistoryState',
  'isUserApiUnauthorized',
  'authStore.init()',
  'if (!authStore.isAuthenticated) return null',
  'recordUserHistory',
  'fetchUserHistory',
  'deleteUserHistory',
]) {
  assertIncludes(historyStorePath, historyStore, marker, `user history store must harden runtime state with ${marker}`)
}
for (const forbidden of ['localStorage', 'sessionStorage']) {
  assertNotIncludes(historyStorePath, historyStore, forbidden, `user history store must not use ${forbidden}`)
}

for (const marker of [
  'clearUserSavedRoutesState',
  'fetchUserSavedRoutes',
  'saveUserRoute',
  'deleteUserSavedRoute',
]) {
  assertIncludes(savedRoutesStorePath, savedRoutesStore, marker, `saved routes store must expose ${marker}`)
}

for (const marker of [
  'clearUserNotificationsState',
  'loadUnreadCount',
  'fetchUserNotifications',
  'fetchUserNotificationUnreadCount',
  'markUserNotificationRead',
  'markAllUserNotificationsRead',
]) {
  assertIncludes(notificationsStorePath, notificationsStore, marker, `notifications store must expose ${marker}`)
}

for (const marker of [
  'clearUserPreferencesState',
  'fetchUserPreferences',
  'updateUserPreferences',
  'themePreference',
  'detailDensity',
  'defaultFavoritesFilter',
]) {
  assertIncludes(preferencesStorePath, preferencesStore, marker, `preferences store must expose ${marker}`)
}

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
  'selectThemePreference',
  'preferencesStore.save',
  'account-state-authenticated',
  'account-state-guest',
]) {
  assertIncludes(navPath, nav, marker, `account navigation must expose ${marker}`)
}
assertNotIncludes(navPath, nav, 'Preview account', 'account navigation must not retain preview account copy')
assertNotIncludes(
  navPath,
  nav,
  '@click="themeStore.setTheme(option.value)"',
  'account theme selector must persist authenticated user theme preference instead of only changing the local cookie',
)

const pageContracts = [
  {
    path: 'pages/user/login.vue',
    required: ['definePageMeta({ guestOnly: true })', '@submit.prevent="submit"', 'authStore.login', 'buildUserPostAuthRedirectTarget', 'type="submit"', 'v-model.trim="form.email"', 'v-model="form.password"', '/user/forgot-password', 'user-form-status', 'user-form-error'],
    forbidden: ['readonly', '登录占位', 'preview-only', '后端写入', 'HttpOnly Cookie'],
  },
  {
    path: 'pages/user/register.vue',
    required: ['definePageMeta({ guestOnly: true })', '@submit.prevent="submit"', 'authStore.requestRegisterCode', 'authStore.register', 'verificationCode', 'expiresInSeconds', 'pattern="[0-9]{4,8}"', 'type="submit"', 'user-form-status', 'user-form-error'],
    forbidden: ['readonly', '注册占位', 'preview-only', '本地调试验证码', '投稿审核流程'],
  },
  {
    path: 'pages/user/forgot-password.vue',
    required: ['definePageMeta({ guestOnly: true })', '@submit.prevent="submit"', 'authStore.requestPasswordResetCode', 'authStore.resetPassword', 'verificationCode', 'newPassword', 'expiresInSeconds', 'pattern="[0-9]{4,8}"', 'type="submit"', 'user-form-status', 'user-form-error'],
    forbidden: ['readonly', '找回占位', 'preview-only', '本地调试验证码'],
  },
  {
    path: 'pages/user/index.vue',
    required: ['authStore.init()', 'authStore.isAuthenticated', 'authStore.displayName', 'account-state-authenticated', 'account-state-guest', 'authStore.articlePagination', 'useUserHistoryStore', "historyStore.loadList('all', 1, 6)", 'historyStore.items', 'historyStore.remove(entry)', 'historyStore.mutating', 'useUserSavedRoutesStore', 'routesStore.loadList(1, 3)', 'useUserNotificationsStore', 'notificationsStore.loadUnreadCount', '最近阅读', '保存路线', '通知中心'],
    forbidden: ['静态占位', '<em>24</em>', '<em>6</em>', '泰拉刃制作链', '克苏鲁之眼准备', '最近路径', '阅读路径', '保存进度', '偏好持久化', 'localStorage', 'sessionStorage', '不在首页塞用户功能'],
  },
  {
    path: 'pages/user/settings.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', '@submit.prevent="submitProfile"', '@submit.prevent="submitPassword"', '@submit.prevent="submitPreferences"', 'authStore.updateProfile', 'authStore.changePassword', 'preferencesStore.save', 'themePreference', 'detailDensity', 'defaultFavoritesFilter', 'user-form-success', 'user-form-error'],
    forbidden: ['readonly', '保存占位'],
  },
  {
    path: 'pages/user/routes.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', 'useUserSavedRoutesStore', 'routesStore.loadList', 'routesStore.remove(route)', 'route.url', '保存路线'],
    forbidden: ['preview-only', '占位'],
  },
  {
    path: 'pages/user/notifications.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', 'useUserNotificationsStore', 'notificationsStore.loadList(true', 'notificationsStore.loadList(false', 'historyVisible', 'handleNotificationOpen', 'notificationsStore.markRead(notification)', 'notificationsStore.unreadCount', 'notification-inbox-shell', 'notification-filter-rail', 'notification-view-switch', 'notification-inbox-row', 'notification-unread-dot', 'notification-row-copy', 'notification-title', 'notification-body', '历史通知', '通知中心'],
    forbidden: ['preview-only', '占位', 'markAllRead', '全部已读', 'notification-status-rail'],
  },
  {
    path: 'pages/user/articles/index.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', 'authStore.fetchUserArticles', 'articlesLoading', 'user-empty-state', 'formatReviewStatus', 'articleActionLabel', 'reviewComment', '编辑', '查看状态', '管理', '查看公开页', '`/user/articles/${article.id}`', 'article-table-shell', 'article-table-panel', 'article-table-row', 'article-cover-thumb', 'resolvePreviewImageUrl', '封面', '文章', '状态', '内容量', '时间', '下一步', '操作', 'article-category-filter', 'selectedArticleCategory', 'articleEngagementStats', '浏览', '评论', '点赞', '收藏'],
    forbidden: ['近战装备路线补充', '克眼前准备清单', 'overflow-x: auto', 'min-width: 1380px', '不是后台管理'],
  },
  {
    path: 'pages/user/articles/new.vue',
    required: ['definePageMeta({ requiresUserAuth: true })', '@submit.prevent="submit"', 'authStore.createUserArticle', 'authStore.submitUserArticleForReview', 'contentHtml', 'UserArticleRichEditor', 'user-form-error', '保存并提交管理员审核'],
    forbidden: ['保存占位', '正文编辑区占位', '输入 HTML', '<textarea v-model="form.contentHtml"'],
  },
  {
    path: 'pages/user/articles/[id].vue',
    required: ['definePageMeta({ requiresUserAuth: true })', 'authStore.fetchUserArticle', 'authStore.updateUserArticle', 'authStore.submitUserArticleForReview', 'authStore.withdrawUserArticle', 'authStore.offlineUserArticle', 'authStore.deleteUserArticle', 'window.confirm', 'contentHtml', 'UserArticleRichEditor', 'user-form-success', 'user-form-error', '保存草稿', '提交审核', '撤回投稿', '下架文章', '删除文章', 'canOfflineArticle', 'canDeleteArticle'],
    forbidden: ['保存占位', '正文编辑区占位', '输入 HTML', '<textarea v-model="form.contentHtml"'],
  },
  {
    path: 'pages/articles/index.vue',
    required: [
      'usePublicApiFetch<UserArticle[]>',
      "'/articles'",
      'articlePagination',
      'articleError',
      'articleLoading',
      '`/articles/${article.slug}`',
      'article.title',
      'article.summary',
      'resolvePreviewImageUrl',
      'articleCoverUrl',
      'articleCoverFallback',
      'article.coverImage',
      'public-article-cover',
      'public-article-cover-fallback',
      'loading="lazy"',
      'articleAuthorAvatarUrl',
      'CommonPaginationDock',
      '@page-change="goToPage"',
      'jump-id="article-page-jump"',
    ],
    forbidden: [
      '公开文章暂未开放',
      '真实文章待接入',
      '后续接入真实内容',
      '等公开文章来源和发布状态接入后',
      'class="article-pagination support-panel"',
    ],
  },
  {
    path: 'pages/articles/[slug].vue',
    required: ['usePublicApiFetch<UserArticle>', '/articles/slug/', 'useUserFavoritesStore', 'useUserHistoryStore', "loadStatuses('ARTICLE'", 'toggleArticleFavorite', 'recordArticleHistoryOnce', 'recordedArticleHistoryIds', 'import.meta.client', "historyStore.record('ARTICLE'", '收藏文章', '已收藏', 'article.id', 'authorProfilePath', 'resolvePreviewImageUrl', 'articleCoverUrl', 'article.coverImage', 'authorAvatarUrl', 'commentAvatarUrl', 'article-cover-figure', 'article-primary-meta', 'sanitizeArticleHtml', 'renderPlainArticleText', 'sanitizedArticleHtml', 'article-inline-header', 'article-section-title', 'viewCount', 'favoriteCount', 'recommendedArticles', 'article-related-articles', 'article-related-cover', 'article-related-copy', '推荐文章', 'article-toc', 'article-comments', 'articleCommentTargetId', 'focusArticleCommentTarget', 'article-comment-item--targeted', 'articleCommentText', 'loadArticleComments', 'submitArticleComment', 'deleteArticleComment', '/comments'],
    forbidden: ['公开文章暂未开放', '真实文章待接入', '文章未载入', '没有真实发布数据', 'article-detail-cover-frame', 'article-detail-cover-fallback', '<span class="eyebrow">文章状态</span>', '<span class="eyebrow">推荐跳转</span>'],
  },
  {
    path: 'pages/users/[id].vue',
    required: ['usePublicApiFetch<PublicUserProfile>', '`/users/${userId.value}`', 'publishedArticles', 'publishedArticleCount', 'user-empty-state', '返回文章入口', 'publicArticlePath', 'profileAvatarUrl'],
    forbidden: ['email', 'token', 'role', 'roles', 'deleted', 'passwordHash', 'avatarObjectKey', 'preview-only', '占位', '公开用户接口'],
  },
  {
    path: 'pages/articles/index.vue',
    required: ['usePublicApiFetch<UserArticle[]>', "'/articles'", 'articlePagination', 'articleError', 'articleLoading', '`/articles/${article.slug}`', 'article.title', 'article.summary'],
    forbidden: ['公开文章暂未开放', '真实文章待接入', '后续接入真实内容', '等公开文章来源和发布状态接入后'],
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
const userArticleRichEditor = assertFile('components/user/UserArticleRichEditor.vue')
const userArticleCoverCropper = assertFile('composables/useUserArticleCoverCropper.ts')
for (const marker of [
  'article-comment-replies',
  'article-comment-reply-form',
  'toggleArticleCommentLike',
  'aria-pressed',
  'replyToDisplayName',
  'loadMoreArticleComments',
  '#article-comments',
  'appendArticleComments',
  'appendArticleCommentReplies',
]) {
  assertIncludes('pages/articles/[slug].vue', publicArticleDetail, marker, `public article comments UI must include ${marker}`)
}
for (const marker of ['sanitizeEditorHtml', 'sanitizeEditorElement', 'isSafeEditorUrl', "src.startsWith('file:')", "src.startsWith('blob:')", 'readUserArticleImageAsDataUrl']) {
  assertIncludes('components/user/UserArticleRichEditor.vue', userArticleRichEditor, marker, `user article rich editor must sanitize saved HTML via ${marker}`)
}
for (const marker of [
  'userArticleEditorDom.mjs',
  'buildUserArticleInlineStyle',
  'buildUserArticleTypingSpanHtml',
  'buildUserArticleLinkHtml',
  'normalizeUserArticleLinkHref',
  'isSafeUserArticleLinkHref',
  'sanitizeUserArticlePastedHtml',
  'setUserArticleBlockTag',
  'setUserArticleOrderedList',
  'unwrapUserArticleTypingPlaceholders',
  'fontSizeOptions',
  'lineHeightOptions',
  'textIndentOptions',
  'applyFontSize',
  'applyLineHeight',
  'applyTextIndent',
  'applyTextColor',
  'colorMenuOpen',
  'textColorPresets',
  'user-rich-editor__color-trigger',
  'user-rich-editor__color-popover',
  'user-rich-editor__color-current',
  'user-rich-editor__link-trigger',
  'user-rich-editor__link-popover',
  'linkTitleValue',
  'applyLink',
  'removeLink',
  'openEditorLink',
  'selectedImage',
  'selectEditorImage',
  'setSelectedImageWidth',
  'setSelectedImageAlign',
  'removeSelectedImage',
  'user-rich-editor__image-tools',
  'user-rich-editor__selected-image',
  'user-rich-editor__image-tool-group',
  'user-rich-editor__image-alt',
  'user-rich-editor__image-remove',
  'getData(\'text/html\')',
  '@click="openEditorLink"',
  'type="color"',
  'clearFormatting',
  "exec('justifyLeft')",
  "exec('justifyCenter')",
  "exec('justifyRight')",
  "exec('justifyFull')",
  "property === 'font-size'",
  "property === 'color'",
  "property === 'line-height'",
  "property === 'text-indent'",
]) {
  assertIncludes('components/user/UserArticleRichEditor.vue', userArticleRichEditor, marker, `user article rich editor must include word-style editing support via ${marker}`)
}
assertPattern('components/user/UserArticleRichEditor.vue', userArticleRichEditor, /emit\('update:modelValue', sanitizeEditorHtml\(editor\.innerHTML\)\)/, 'user article rich editor must emit sanitized HTML instead of raw contenteditable HTML')
assertNotPattern('components/user/UserArticleRichEditor.vue', userArticleRichEditor, /emit\('update:modelValue', editor\.innerHTML\)/, 'user article rich editor must not emit raw contenteditable HTML')
assertNotIncludes('components/user/UserArticleRichEditor.vue', userArticleRichEditor, 'uploadUserArticleImage(file)', 'user article rich editor must not upload images before draft save')
assertNotIncludes('components/user/UserArticleRichEditor.vue', userArticleRichEditor, '<figcaption>${alt}</figcaption>', 'user article rich editor must not auto-render pasted image filenames as captions')
assertNotIncludes('components/user/UserArticleRichEditor.vue', userArticleRichEditor, 'sanitizeImageAlt(file.name)', 'user article rich editor must not display local image filenames in the editing surface')
assertNotIncludes('components/user/UserArticleRichEditor.vue', userArticleRichEditor, 'user-rich-editor__colors', 'user article rich editor must collapse default color swatches behind a single color menu trigger')
assertPattern('components/user/UserArticleRichEditor.vue', userArticleRichEditor, /\.user-rich-editor__toolbar\s*\{[\s\S]*position:\s*sticky[\s\S]*top:\s*var\(--user-article-toolbar-top/, 'user article rich editor toolbar must stick while scrolling the body')
assertIncludes('components/user/UserArticleRichEditor.vue', userArticleRichEditor, '--user-article-toolbar-top', 'user article rich editor sticky toolbar offset must be controlled by a theme/layout variable')

for (const marker of [
  'sanitizeArticleStyle',
  "style: ['style']",
  "property === 'font-size'",
  "property === 'color'",
  "property === 'line-height'",
  "property === 'text-indent'",
  "img: ['src', 'alt', 'title', 'style']",
  "property === 'width'",
  "property === 'max-width'",
  "property === 'height'",
  "property === 'display'",
  "property === 'margin-left'",
  "property === 'margin-right'",
  "'span'",
  "'div'",
]) {
  assertIncludes('pages/articles/[slug].vue', publicArticleDetail, marker, `public article sanitizer must preserve safe word-style markup via ${marker}`)
}
assertNotIncludes('pages/articles/[slug].vue', publicArticleDetail, 'articleHeroImageUrl', 'article detail page must not render a large hero cover before the article body')
assertNotIncludes('pages/articles/[slug].vue', publicArticleDetail, 'firstArticleImageUrl', 'article detail page must not promote body images into a large hero cover')

for (const path of ['pages/user/articles/new.vue', 'pages/user/articles/[id].vue']) {
  const content = assertFile(path)
  assertIncludes(path, content, 'writingModeEnabled', 'user article page must expose the selected immersive writing mode toggle')
  assertIncludes(path, content, 'article-focus-shell--writing', 'user article page must apply the immersive writing layout class')
  assertIncludes(path, content, 'article-writing-toggle', 'user article page must render a button to control writing mode')
  assertNotIncludes(path, content, '#08110c', 'user article writing mode must not hard-code the dark design draft background')
  assertNotIncludes(path, content, '#0f1912', 'user article writing mode must follow theme variables instead of fixed dark surface colors')
  assertIncludes(path, content, 'useUserArticleCoverCropper', 'user article page must use the shared cover cropper')
  assertIncludes(path, content, 'pendingCoverFile', 'user article page must defer cover uploads until save')
  assertIncludes(path, content, 'uploadUserArticleEmbeddedImages', 'user article page must upload embedded images during save')
  assertIncludes(path, content, 'resolvePreviewImageUrl', 'user article cover preview must resolve backend preview image paths')
  assertIncludes(path, content, 'cropScale', 'user article page must support zooming selected cover before save')
  assertIncludes(path, content, 'confirmCoverCrop', 'user article page must apply the cropped cover before save')
  assertIncludes(path, content, 'user-cover-cropper', 'user article page must render the cover cropper controls')
  assertNotIncludes(path, content, 'authStore.uploadUserArticleImage(file)', 'user article page must not upload selected cover immediately')
  assertIncludes(path, content, 'article-focus-shell', 'user article editor must use the selected focus-writing layout shell')
  assertIncludes(path, content, 'article-focus-rail', 'user article editor must expose a compact left anchor rail')
  assertIncludes(path, content, 'article-writing-surface', 'user article editor must prioritize the central writing surface')
  assertIncludes(path, content, 'article-focus-status', 'user article editor must keep publish checks in a right status column')
  assertIncludes(path, content, 'article-settings-workspace', 'user article editor must move cover and slug controls into a secondary settings section')
  assertIncludes(path, content, 'article-settings-panel', 'user article editor settings must use a visible optimized settings panel')
  assertNotIncludes(path, content, '<details>', 'user article editor settings must not hide slug and cover controls in a default details block')
  assertIncludes(path, content, '公开链接地址', 'user article editor must explain slug as the public link path')
  assertIncludes(path, content, '选择封面', 'user article cover action must be labeled as choosing a cover')
  assertNotIncludes(path, content, '裁剪/放大封面', 'user article cover action label must not lead with crop and zoom')
  assertIncludes(path, content, 'article-review-action', 'user article editor must expose the admin review action in the top action area')
  assertIncludes(path, content, '提交管理员审核', 'user article editor must label the review action as submitting to admin review')
  assertPattern(path, content, /id="article-body"[\s\S]*id="article-settings"/, 'user article editor must place the writing body before secondary cover and slug settings')
  assertIncludes(path, content, 'article-compact-head', 'user article editor must replace the large page head with the selected compact toolbar')
  assertNotIncludes(path, content, 'page-head entity-head', 'user article editor must not keep the large page head block')
}

const userArticleEditPage = assertFile('pages/user/articles/[id].vue')
assertPattern('pages/user/articles/[id].vue', userArticleEditPage, /const canSubmitReview = computed\(\(\) => .*isDraftLike\.value.*isOfflineArticle\.value/s, 'offline user articles must expose the admin review action after the author takes them offline')
assertNotPattern('pages/user/articles/[id].vue', userArticleEditPage, /if \(!isDraftLike\.value \|\| !canEditArticle\.value\) return/, 'offline user articles must not be blocked by a draft-only submitReview guard')
assertPattern('pages/user/articles/[id].vue', userArticleEditPage, /v-if="canSubmitReview"[\s\S]*提交管理员审核/, 'top admin review action must remain visible for offline editable articles')

for (const marker of [
  'cropScale',
  'const CROP_OUTPUT_WIDTH = 1280',
  'const CROP_OUTPUT_HEIGHT = 720',
  'renderCroppedCoverBlob',
  'confirmCoverCrop',
]) {
  assertIncludes('composables/useUserArticleCoverCropper.ts', userArticleCoverCropper, marker, `user article cover cropper must include ${marker}`)
}

assertPattern('pages/articles/[slug].vue', publicArticleDetail, /favoritesStore\.loadStatuses\('ARTICLE',\s*\[article\.value\.id\]\)/, 'article detail favorite status must load by returned article.id')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /favoritesStore\.toggleArticleFavorite\(article\.value\.id\)/, 'article detail favorite toggle must use returned article.id')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /const recordArticleHistoryOnce = async \(\) => \{[\s\S]*import\.meta\.client[\s\S]*historyStore\.record\('ARTICLE', article\.value\.id\)/, 'article detail history recording must be client-only inside recordArticleHistoryOnce')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /watch\(\(\) => article\.value\?\.id,[\s\S]*recordArticleHistoryOnce[\s\S]*immediate: true/, 'article detail history recording must be watch-driven with immediate once guard')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /v-if="authorProfilePath"[\s\S]*:href="authorProfilePath"/, 'article detail author profile link must be conditional on authorProfilePath')
assertPattern('pages/articles/[slug].vue', publicArticleDetail, /v-html="sanitizedArticleHtml"/, 'article detail HTML rendering must bind only sanitizedArticleHtml')
assertNotPattern('pages/articles/[slug].vue', publicArticleDetail, /v-html="article\./, 'article detail must not render raw article HTML fields directly')
assertIncludes('pages/articles/[slug].vue', publicArticleDetail, 'if (/^data:image\\/(png|jpe?g|webp|gif);base64,/i.test(resolved)) return resolved', 'article detail sanitizer must restrict inline image data URLs to common raster formats')
assertIncludes('pages/articles/[slug].vue', publicArticleDetail, "if (/^(https?:|\\/)/i.test(resolved) && !resolved.startsWith('//')) return resolved", 'article detail sanitizer must restrict image src URLs to http(s) or root-relative paths')

const publicItemDetail = assertFile('pages/items/[id].vue')
assertIncludes('pages/items/[id].vue', publicItemDetail, 'useUserHistoryStore', 'item detail must use user history store')
assertIncludes('pages/items/[id].vue', publicItemDetail, 'recordItemHistoryOnce', 'item detail must define recordItemHistoryOnce')
assertIncludes('pages/items/[id].vue', publicItemDetail, 'recordedItemHistoryIds', 'item detail must dedupe history records')
assertPattern('pages/items/[id].vue', publicItemDetail, /const itemHistoryId = computed\(\(\) => detailItem\.value \? firstText\(detailItem\.value\.id, detailItem\.value\.itemId\) : ''\)/, 'item history id must come from loaded item entity only')
assertPattern('pages/items/[id].vue', publicItemDetail, /const recordItemHistoryOnce = async \(\) => \{[\s\S]*import\.meta\.client[\s\S]*historyStore\.record\('ITEM', itemHistoryId\.value\)/, 'item detail history recording must be client-only inside recordItemHistoryOnce')
assertPattern('pages/items/[id].vue', publicItemDetail, /watch\(itemHistoryId,[\s\S]*recordItemHistoryOnce[\s\S]*immediate: true/, 'item detail history recording must be watch-driven with immediate once guard')

const userIndex = assertFile('pages/user/index.vue')
assertPattern('pages/user/index.vue', userIndex, /v-for="entry in historyStore\.items"/, 'user center history rows must render from historyStore.items')
assertNotPattern('pages/user/index.vue', userIndex, /exception instanceof Error \? exception\.message : '阅读记录/, 'user center must not surface raw history exception messages')

const publicUserProfile = assertFile('pages/users/[id].vue')
assertIncludes('pages/users/[id].vue', publicUserProfile, 'isValidUserId', 'public user page must validate route id before fetching')
assertPattern('pages/users/[id].vue', publicUserProfile, /\/\^\[1-9\]\\d\*\$\/\.test\(userId\.value\)/, 'public user page must only accept positive integer ids')
assertPattern('pages/users/[id].vue', publicUserProfile, /v-for="article in linkablePublishedArticles"[\s\S]*:href="publicArticlePath\(article\.slug\)"/, 'public user article links must render only linkable slug-backed articles')

const userSettings = assertFile('pages/user/settings.vue')
for (const marker of ['#display-preferences', '/user/notifications', '`/users/${authStore.user.id}`']) {
  assertIncludes('pages/user/settings.vue', userSettings, marker, `settings must link real user setting target ${marker}`)
}
assertNotIncludes('pages/user/settings.vue', userSettings, '后续开放', 'settings page must not describe opened user functions as future-only')

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
