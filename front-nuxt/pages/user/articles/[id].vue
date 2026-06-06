<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

import type { UserArticle } from '~/types/public-api'
import UserArticleRichEditor from '~/components/user/UserArticleRichEditor.vue'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'

const route = useRoute()
const authStore = useUserAuthStore()
const article = ref<UserArticle | null>(null)
const error = ref('')
const success = ref('')
const initialArticleLoaded = ref(false)
const writingModeEnabled = ref(false)

const form = reactive({
  title: '',
  slug: '',
  summary: '',
  coverImage: '',
  contentHtml: '',
})

const articleId = computed(() => String(route.params.id || ''))
const hasRequiredFields = computed(() => Boolean(form.title.trim() && form.contentHtml.trim()))
const isDraftLike = computed(() => article.value?.reviewStatus === 'DRAFT' || article.value?.reviewStatus === 'REJECTED')
const isPendingReview = computed(() => article.value?.reviewStatus === 'PENDING_REVIEW')
const isPublishedArticle = computed(() => article.value?.status === 'PUBLISHED')
const isOfflineArticle = computed(() => article.value?.status === 'OFFLINE')
const canEditArticle = computed(() => isDraftLike.value || isOfflineArticle.value)
const canSubmitReview = computed(() => isDraftLike.value || isOfflineArticle.value)
const canOfflineArticle = computed(() => isPublishedArticle.value)
const canDeleteArticle = computed(() => isDraftLike.value || isOfflineArticle.value)
const articleLoading = computed(() => authStore.articlesLoading || !initialArticleLoaded.value)
const coverCropper = useUserArticleCoverCropper({
  canEdit: canEditArticle,
  onError: (message) => {
    error.value = message
  },
  onApplied: (message) => {
    success.value = message
  },
})
const {
  coverInputRef,
  pendingCoverFile,
  coverPreviewUrl,
  uploadingCover,
  cropVisible,
  cropSourceUrl,
  cropScale,
  cropImageStyle,
  openCoverPicker,
  handleCoverSelected,
  startCropDrag,
  handleCropDragMove,
  endCropDrag,
  resetCropTransform,
  cancelCoverCrop,
  confirmCoverCrop,
  clearPendingCoverSelection,
} = coverCropper
const coverPreviewSrc = computed(() => coverPreviewUrl.value || resolvePreviewImageUrl(form.coverImage))

const formatReviewStatus = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PENDING_REVIEW: '待审核',
    APPROVED: '已通过',
    REJECTED: '已退回',
  }
  return map[status] || status
}

const formatArticleStatus = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    OFFLINE: '已下架',
  }
  return map[status] || status
}

const syncForm = (nextArticle: UserArticle) => {
  article.value = nextArticle
  form.title = nextArticle.title
  form.slug = nextArticle.slug || ''
  form.summary = nextArticle.summary || ''
  form.coverImage = nextArticle.coverImage || ''
  form.contentHtml = nextArticle.contentHtml || nextArticle.contentMarkdown || ''
  clearPendingCoverSelection()
}

const reportEditorError = (message: string) => {
  error.value = message
}

const persistCurrentDraft = async () => {
  const uploadedCover = pendingCoverFile.value ? await uploadUserArticleImage(pendingCoverFile.value) : null
  const contentHtml = await uploadUserArticleEmbeddedImages(form.contentHtml)
  return await authStore.updateUserArticle(articleId.value, {
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    coverImage: uploadedCover?.url || form.coverImage,
    contentHtml,
  })
}

const loadArticle = async () => {
  error.value = ''
  success.value = ''
  try {
    syncForm(await authStore.fetchUserArticle(articleId.value))
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '文章加载失败。'
  } finally {
    initialArticleLoaded.value = true
  }
}

const saveDraft = async () => {
  if (!canEditArticle.value) return
  error.value = ''
  success.value = ''
  const wasOffline = isOfflineArticle.value
  try {
    syncForm(await persistCurrentDraft())
    success.value = wasOffline ? '文章已保存为草稿，可重新提交审核。' : '草稿已保存。'
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '草稿保存失败。'
  }
}

const submitReview = async () => {
  if (!canSubmitReview.value || !canEditArticle.value) return
  error.value = ''
  success.value = ''
  try {
    syncForm(await persistCurrentDraft())
    syncForm(await authStore.submitUserArticleForReview(articleId.value))
    success.value = '已提交管理员审核。'
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '提交审核失败。'
  }
}

const withdrawArticle = async () => {
  error.value = ''
  success.value = ''
  try {
    syncForm(await authStore.withdrawUserArticle(articleId.value))
    success.value = '投稿已撤回为草稿。'
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '撤回投稿失败。'
  }
}

const offlineArticle = async () => {
  if (!window.confirm('确定下架这篇已发布文章吗？下架后公开页将不可访问，可继续编辑后重新提交审核。')) return
  error.value = ''
  success.value = ''
  try {
    syncForm(await authStore.offlineUserArticle(articleId.value))
    success.value = '文章已下架，可继续编辑。'
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '下架文章失败。'
  }
}

const deleteArticle = async () => {
  if (!window.confirm('确定删除这篇文章吗？删除后将返回我的文章列表。')) return
  error.value = ''
  success.value = ''
  try {
    await authStore.deleteUserArticle(articleId.value)
    await navigateTo('/user/articles')
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '删除草稿失败。'
  }
}

onMounted(() => {
  void loadArticle()
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="article-compact-head" :class="{ 'article-compact-head--writing': writingModeEnabled }">
      <div class="article-compact-head__title">
        <span class="article-compact-head__dot"></span>
        <div>
          <span>{{ `/user/articles/${articleId} · editor` }}</span>
          <h1>{{ article?.title || '编辑文章' }}</h1>
        </div>
      </div>
      <div class="article-compact-head__actions">
        <button class="secondary-button article-writing-toggle" type="button" @click="writingModeEnabled = !writingModeEnabled">
          {{ writingModeEnabled ? '退出写作模式' : '进入写作模式' }}
        </button>
        <a class="secondary-button" href="/user/articles">返回我的文章</a>
        <button
          v-if="canSubmitReview"
          class="secondary-button article-review-action"
          type="button"
          :disabled="authStore.submitting || articleLoading || !hasRequiredFields || !canEditArticle"
          @click="submitReview"
        >
          提交管理员审核
        </button>
        <button class="primary-button" type="submit" form="edit-user-article-form" :disabled="authStore.submitting || articleLoading || !hasRequiredFields || !canEditArticle">
          {{ authStore.submitting ? '保存中...' : '保存草稿' }}
        </button>
      </div>
    </div>

    <form id="edit-user-article-form" class="article-focus-shell" :class="{ 'article-focus-shell--writing': writingModeEnabled }" @submit.prevent="saveDraft">
      <nav class="article-focus-rail" aria-label="文章编辑区块">
        <a href="/user/articles">我的文章</a>
        <a href="#article-meta">标题摘要</a>
        <a href="#article-body">正文</a>
        <a href="#article-settings">文章设置</a>
        <a href="#article-submit">审核状态</a>
      </nav>

      <section class="article-writing-surface">
        <p v-if="articleLoading" class="user-form-status">文章加载中...</p>
        <p v-if="success" class="user-form-status user-form-success">{{ success }}</p>
        <p v-if="error" class="user-form-status user-form-error">{{ error }}</p>

        <section id="article-meta" class="article-document-head">
          <span class="eyebrow">文章内容</span>
          <label class="article-title-field">
            <span>标题</span>
            <input v-model.trim="form.title" type="text" maxlength="255" required :disabled="!canEditArticle" placeholder="输入文章标题" />
          </label>
          <label class="article-summary-field">
            <span>摘要</span>
            <textarea v-model.trim="form.summary" maxlength="600" rows="3" :disabled="!canEditArticle" placeholder="写一段会显示在文章列表里的摘要"></textarea>
          </label>
        </section>

        <section id="article-body" class="article-body-workspace">
          <div class="article-section-head">
            <div>
              <span class="eyebrow">Content</span>
              <h2>正文</h2>
            </div>
          </div>
          <UserArticleRichEditor
            v-model="form.contentHtml"
            :disabled="!canEditArticle"
            reference-panel-target="#user-article-reference-panel-target"
            @reference-panel-open="writingModeEnabled = true"
            @error="reportEditorError"
          />
        </section>

        <section id="article-settings" class="article-settings-workspace">
          <div class="article-settings-panel">
            <div class="article-settings-panel__head">
              <div>
                <span class="eyebrow">Settings</span>
                <h2>文章设置</h2>
              </div>
              <p>设置公开列表素材。已提交审核后会锁定编辑。</p>
            </div>
            <div class="article-settings-grid">
              <section class="article-setting-block">
                <div class="article-section-head">
                  <div>
                    <span class="eyebrow">Permalink</span>
                    <h3>访问路径</h3>
                  </div>
                </div>
                <label class="editor-field article-slug-field">
                  <span>Slug</span>
                  <input v-model.trim="form.slug" type="text" maxlength="255" placeholder="melee-progression-note" :disabled="!canEditArticle" />
                  <small>公开链接地址的一部分，留空会根据标题自动生成。</small>
                </label>
              </section>
              <section class="article-setting-block article-cover-workspace">
                <div class="article-section-head">
                  <div>
                    <span class="eyebrow">Cover</span>
                    <h3>封面</h3>
                  </div>
                  <div class="article-cover-actions">
                    <button class="secondary-button" type="button" :disabled="authStore.submitting || articleLoading || uploadingCover || !canEditArticle" @click="openCoverPicker">
                      {{ uploadingCover ? '封面处理中...' : '选择封面' }}
                    </button>
                    <input ref="coverInputRef" class="article-hidden-file" type="file" accept="image/*" @change="handleCoverSelected" />
                  </div>
                </div>
                <label class="editor-field">
                  <span>封面地址</span>
                  <input v-model.trim="form.coverImage" type="url" maxlength="500" placeholder="https://..." :disabled="!canEditArticle" @input="clearPendingCoverSelection" />
                </label>
                <img v-if="coverPreviewSrc" class="article-cover-preview" :src="coverPreviewSrc" alt="封面预览" />
                <div v-if="cropVisible" class="user-cover-cropper" role="dialog" aria-modal="true" aria-label="裁剪封面">
                  <div class="user-cover-cropper__panel">
                    <div
                      class="user-cover-cropper__viewport"
                      @pointerdown.prevent="startCropDrag"
                      @pointermove.prevent="handleCropDragMove"
                      @pointerup.prevent="endCropDrag"
                      @pointercancel.prevent="endCropDrag"
                    >
                      <img v-if="cropSourceUrl" :src="cropSourceUrl" alt="封面裁剪源图" :style="cropImageStyle" class="user-cover-cropper__image" draggable="false" />
                    </div>
                    <label class="user-cover-cropper__control">
                      <span>缩放 {{ cropScale.toFixed(2) }}x</span>
                      <input v-model.number="cropScale" type="range" min="1" max="3" step="0.01" />
                    </label>
                    <div class="article-cover-actions">
                      <button class="secondary-button" type="button" @click="resetCropTransform">重置</button>
                      <button class="secondary-button" type="button" @click="cancelCoverCrop">取消</button>
                      <button class="primary-button" type="button" :disabled="uploadingCover" @click="confirmCoverCrop">应用裁剪</button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      </section>

      <aside id="article-submit" class="article-focus-status">
        <div id="user-article-reference-panel-target" class="article-reference-side-target" aria-live="polite"></div>
        <section class="article-status-card">
          <span class="eyebrow">审核状态</span>
          <div class="material-row" :class="{ done: form.title.trim(), missing: !form.title.trim() }"><b>标题</b><span>{{ form.title.trim() ? '已填写' : '必填' }}</span></div>
          <div class="material-row" :class="{ done: form.contentHtml.trim(), missing: !form.contentHtml.trim() }"><b>正文</b><span>{{ form.contentHtml.trim() ? '已填写' : '必填' }}</span></div>
          <div class="material-row"><b>发布状态</b><span>{{ article ? formatArticleStatus(article.status) : '加载中' }}</span></div>
          <div class="material-row"><b>审核状态</b><span>{{ article ? formatReviewStatus(article.reviewStatus) : '加载中' }}</span></div>
          <div v-if="article?.submittedAt" class="material-row"><b>提交时间</b><span>{{ article.submittedAt }}</span></div>
          <div v-if="article?.reviewedAt" class="material-row"><b>审核时间</b><span>{{ article.reviewedAt }}</span></div>
          <div v-if="article?.reviewComment" class="material-row missing"><b>审核意见</b><span>{{ article.reviewComment }}</span></div>
          <div v-if="article?.status === 'PUBLISHED' && article.slug" class="material-row done">
            <b>公开页</b><a :href="`/articles/${article.slug}`">查看公开页</a>
          </div>

          <button class="primary-button" type="submit" :disabled="authStore.submitting || articleLoading || !hasRequiredFields || !canEditArticle">
            {{ authStore.submitting ? '保存中...' : '保存草稿' }}
          </button>
          <button
            v-if="canSubmitReview"
            class="secondary-button"
            type="button"
            :disabled="authStore.submitting || articleLoading || !hasRequiredFields"
            @click="submitReview"
          >
            提交管理员审核
          </button>
          <button
            v-if="isPendingReview"
            class="secondary-button"
            type="button"
            :disabled="authStore.submitting || articleLoading"
            @click="withdrawArticle"
          >
            撤回投稿
          </button>
          <button
            v-if="canOfflineArticle"
            class="secondary-button"
            type="button"
            :disabled="authStore.submitting || articleLoading"
            @click="offlineArticle"
          >
            下架文章
          </button>
          <button
            v-if="canDeleteArticle"
            class="secondary-button"
            type="button"
            :disabled="authStore.submitting || articleLoading"
            @click="deleteArticle"
          >
            删除文章
          </button>
        </section>
      </aside>
    </form>

    <TerraFooter />
  </section>
</template>

<style scoped>
.article-compact-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: min(1500px, calc(100% - 32px));
  min-height: 68px;
  margin: 0 auto 16px;
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  box-shadow: var(--shadow);
}

.article-compact-head__title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.article-compact-head__dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--accent-gold);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-gold) 14%, transparent);
}

.article-compact-head__title > div {
  min-width: 0;
}

.article-compact-head__title span:not(.article-compact-head__dot) {
  display: block;
  overflow: hidden;
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.article-compact-head h1 {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--text-strong);
  font-size: 20px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-compact-head__actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.article-compact-head--writing {
  position: sticky;
  top: 10px;
  z-index: 12;
}

.article-writing-toggle {
  border-color: color-mix(in srgb, var(--accent-gold) 36%, var(--index-line));
}

.article-focus-shell {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr) 300px;
  gap: 16px;
  width: min(1500px, calc(100% - 32px));
  margin: 0 auto 42px;
  align-items: start;
}

.article-focus-shell--writing {
  grid-template-columns: minmax(0, 980px) 320px;
  justify-content: center;
  --user-article-toolbar-top: 88px;
}

.article-focus-shell--writing .article-focus-rail {
  display: none;
}

.article-focus-shell--writing .article-writing-surface {
  background: color-mix(in srgb, var(--panel) 96%, transparent);
}

.article-focus-shell--writing .article-settings-workspace {
  opacity: .72;
}

.article-focus-shell--writing .article-focus-status {
  position: fixed;
  --article-reference-panel-top: clamp(104px, 13dvh, 132px);
  --user-article-reference-panel-max-height: calc(100dvh - var(--article-reference-panel-top) - 16px);
  top: var(--article-reference-panel-top);
  right: max(12px, calc((100vw - 1500px) / 2 + 16px));
  z-index: 35;
  width: min(320px, calc(100vw - 24px));
  max-height: var(--user-article-reference-panel-max-height);
}

.article-focus-shell--writing .article-status-card {
  display: none;
}

.article-focus-rail {
  position: sticky;
  top: 96px;
  display: grid;
  gap: 8px;
}

.article-focus-rail a {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 14px;
  color: var(--text-muted);
  text-decoration: none;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
}

.article-focus-rail a:hover,
.article-focus-rail a:focus-visible {
  color: var(--text-strong);
  border-color: var(--index-line-strong);
  background: var(--index-surface-strong);
}

.article-writing-surface,
.article-status-card {
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  box-shadow: var(--shadow);
}

.article-writing-surface {
  display: grid;
  gap: 18px;
  padding: 24px;
}

.article-document-head {
  display: grid;
  gap: 14px;
}

.article-title-field,
.article-summary-field {
  display: grid;
  gap: 8px;
}

.article-title-field span,
.article-summary-field span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.article-title-field input {
  min-height: 58px;
  border: 0;
  border-bottom: 1px solid var(--index-line);
  border-radius: 0;
  padding: 0;
  color: var(--text-strong);
  background: transparent;
  font-size: 34px;
  font-weight: 900;
  line-height: 1.15;
}

.article-summary-field textarea {
  min-height: 86px;
  resize: vertical;
}

.article-slug-field {
  max-width: 620px;
}

.article-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.article-section-head h2,
.article-section-head h3 {
  margin: 4px 0 0;
  color: var(--text-strong);
  font-size: 20px;
}

.article-section-head h3 {
  font-size: 17px;
}

.article-cover-workspace,
.article-body-workspace,
.article-settings-workspace {
  display: grid;
  gap: 14px;
  padding-top: 18px;
  border-top: 1px solid var(--index-line);
  scroll-margin-top: 96px;
}

.article-settings-workspace {
  color: var(--text-muted);
}

.article-settings-panel {
  display: grid;
  gap: 16px;
  border: 1px solid color-mix(in srgb, var(--index-line) 70%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 70%, transparent);
}

.article-settings-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 16px 0;
}

.article-settings-panel__head h2,
.article-settings-panel__head p {
  margin: 0;
}

.article-settings-panel__head h2 {
  color: var(--text-strong);
  font-size: 20px;
}

.article-settings-panel__head p {
  max-width: 420px;
  color: var(--text-faint);
  font-size: 13px;
  line-height: 1.55;
}

.article-settings-grid {
  display: grid;
  grid-template-columns: minmax(220px, .8fr) minmax(0, 1.2fr);
  gap: 16px;
  padding: 0 16px 16px;
}

.article-setting-block {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--index-line) 62%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel) 72%, transparent);
}

.article-settings-grid .article-cover-workspace {
  padding-top: 14px;
  border-top: 0;
}

.article-focus-status {
  position: sticky;
  top: 96px;
  display: grid;
  gap: 14px;
}

.article-reference-side-target {
  display: grid;
  min-width: 0;
}

.article-status-card {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.article-status-card .primary-button,
.article-status-card .secondary-button {
  width: 100%;
}

.article-cover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.article-hidden-file {
  display: none;
}

.article-cover-preview {
  display: block;
  width: min(100%, 520px);
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 22%, var(--index-line));
  border-radius: 14px;
  background: color-mix(in srgb, var(--index-surface) 88%, var(--panel));
}

.user-cover-cropper {
  display: grid;
  gap: 12px;
  width: min(100%, 620px);
}

.user-cover-cropper__panel {
  display: grid;
  gap: 14px;
}

.user-cover-cropper__viewport {
  width: 100%;
  max-width: 560px;
  aspect-ratio: 16 / 9;
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  background: color-mix(in srgb, var(--index-bg) 88%, var(--panel));
  touch-action: none;
  cursor: grab;
}

.user-cover-cropper__viewport:active {
  cursor: grabbing;
}

.user-cover-cropper__image {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  pointer-events: none;
  user-select: none;
}

.user-cover-cropper__control {
  display: grid;
  gap: 8px;
  color: var(--muted-text);
  font-size: 13px;
}

.user-cover-cropper__control input {
  width: 100%;
}

@media (max-width: 1180px) {
  .article-focus-shell {
    grid-template-columns: 1fr;
  }

  .article-focus-rail,
  .article-focus-status {
    position: static;
  }

  .article-focus-shell--writing .article-focus-status {
    position: fixed;
    --article-reference-panel-top: 96px;
    --user-article-reference-panel-max-height: calc(100dvh - 112px);
    top: var(--article-reference-panel-top);
    right: 12px;
    width: min(320px, calc(100vw - 24px));
    max-height: var(--user-article-reference-panel-max-height);
  }

  .article-focus-rail {
    display: flex;
    flex-wrap: wrap;
  }
}

@media (max-width: 720px) {
  .article-compact-head {
    align-items: stretch;
    flex-direction: column;
    width: min(100% - 20px, 1500px);
    min-height: 0;
  }

  .article-compact-head h1 {
    font-size: 18px;
  }

  .article-compact-head__actions {
    justify-content: stretch;
  }

  .article-compact-head__actions .primary-button,
  .article-compact-head__actions .secondary-button {
    flex: 1 1 150px;
  }

  .article-focus-shell {
    width: min(100% - 20px, 1500px);
  }

  .article-writing-surface {
    padding: 16px;
  }

  .article-section-head {
    align-items: stretch;
    flex-direction: column;
  }

  .article-settings-panel__head {
    align-items: stretch;
    flex-direction: column;
  }

  .article-settings-grid {
    grid-template-columns: 1fr;
  }

  .article-title-field input {
    min-height: 48px;
    font-size: 26px;
  }
}
</style>
