<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

import UserArticleRichEditor from '~/components/user/UserArticleRichEditor.vue'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'

const authStore = useUserAuthStore()
const form = reactive({
  title: '',
  slug: '',
  summary: '',
  coverImage: '',
  contentHtml: '',
})
const error = ref('')
const writingModeEnabled = ref(false)

const hasRequiredFields = computed(() => Boolean(form.title.trim() && form.contentHtml.trim()))

const reportEditorError = (message: string) => {
  error.value = message
}

const coverCropper = useUserArticleCoverCropper({
  onError: (message) => {
    error.value = message
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

const createArticleDraft = async () => {
  const uploadedCover = pendingCoverFile.value ? await uploadUserArticleImage(pendingCoverFile.value) : null
  const contentHtml = await uploadUserArticleEmbeddedImages(form.contentHtml)
  return await authStore.createUserArticle({
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    coverImage: uploadedCover?.url || form.coverImage,
    contentHtml,
  })
}

const submit = async () => {
  error.value = ''
  try {
    const article = await createArticleDraft()
    await navigateTo(`/user/articles/${article.id}`)
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '草稿保存失败。'
  }
}

const submitForAdminReview = async () => {
  error.value = ''
  try {
    const article = await createArticleDraft()
    await authStore.submitUserArticleForReview(article.id)
    await navigateTo(`/user/articles/${article.id}`)
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '提交审核失败。'
  }
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="article-compact-head" :class="{ 'article-compact-head--writing': writingModeEnabled }">
      <div class="article-compact-head__title">
        <span class="article-compact-head__dot"></span>
        <div>
          <span>/user/articles/new · editor</span>
          <h1>新建文章</h1>
        </div>
      </div>
      <div class="article-compact-head__actions">
        <button class="secondary-button article-writing-toggle" type="button" @click="writingModeEnabled = !writingModeEnabled">
          {{ writingModeEnabled ? '退出写作模式' : '进入写作模式' }}
        </button>
        <a class="secondary-button" href="/user/articles">返回我的文章</a>
        <button class="secondary-button article-review-action" type="button" :disabled="authStore.submitting || !hasRequiredFields" @click="submitForAdminReview">
          保存并提交管理员审核
        </button>
        <button class="primary-button" type="submit" form="new-user-article-form" :disabled="authStore.submitting || !hasRequiredFields">
          {{ authStore.submitting ? '保存中...' : '保存草稿' }}
        </button>
      </div>
    </div>

    <form id="new-user-article-form" class="article-focus-shell" :class="{ 'article-focus-shell--writing': writingModeEnabled }" @submit.prevent="submit">
      <nav class="article-focus-rail" aria-label="文章编辑区块">
        <a href="/user/articles">我的文章</a>
        <a href="#article-meta">标题摘要</a>
        <a href="#article-body">正文</a>
        <a href="#article-settings">文章设置</a>
        <a href="#article-submit">发布检查</a>
      </nav>

      <section class="article-writing-surface">
        <section id="article-meta" class="article-document-head">
          <span class="eyebrow">文章草稿</span>
          <label class="article-title-field">
            <span>标题</span>
            <input v-model.trim="form.title" type="text" maxlength="255" required placeholder="输入文章标题" />
          </label>
          <label class="article-summary-field">
            <span>摘要</span>
            <textarea v-model.trim="form.summary" maxlength="600" rows="3" placeholder="写一段会显示在文章列表里的摘要"></textarea>
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
              <p>设置公开列表素材，正文写完后再补也可以。</p>
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
                  <input v-model.trim="form.slug" type="text" maxlength="255" placeholder="melee-progression-note" />
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
                    <button class="secondary-button" type="button" :disabled="authStore.submitting || uploadingCover" @click="openCoverPicker">
                      {{ uploadingCover ? '封面处理中...' : '选择封面' }}
                    </button>
                    <input ref="coverInputRef" class="article-hidden-file" type="file" accept="image/*" @change="handleCoverSelected" />
                  </div>
                </div>
                <label class="editor-field">
                  <span>封面地址</span>
                  <input v-model.trim="form.coverImage" type="url" maxlength="500" placeholder="https://..." @input="clearPendingCoverSelection" />
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
        <p v-if="error" class="user-form-status user-form-error">{{ error }}</p>
      </section>

      <aside id="article-submit" class="article-focus-status">
        <div id="user-article-reference-panel-target" class="article-reference-side-target" aria-live="polite"></div>
        <section class="article-status-card">
          <span class="eyebrow">发布检查</span>
          <div class="material-row" :class="{ done: form.title.trim(), missing: !form.title.trim() }"><b>标题</b><span>{{ form.title.trim() ? '已填写' : '必填' }}</span></div>
          <div class="material-row" :class="{ done: form.contentHtml.trim(), missing: !form.contentHtml.trim() }"><b>正文</b><span>{{ form.contentHtml.trim() ? '已填写' : '必填' }}</span></div>
          <div class="material-row" :class="{ done: form.summary.trim(), missing: !form.summary.trim() }"><b>摘要</b><span>{{ form.summary.trim() ? '已填写' : '可选' }}</span></div>
          <div class="material-row"><b>状态</b><span>保存为草稿</span></div>
          <button class="secondary-button article-review-action" type="button" :disabled="authStore.submitting || !hasRequiredFields" @click="submitForAdminReview">
            保存并提交管理员审核
          </button>
          <button class="primary-button" type="submit" :disabled="authStore.submitting || !hasRequiredFields">
            {{ authStore.submitting ? '保存中...' : '保存草稿' }}
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
