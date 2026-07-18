<script setup lang="ts">
import type { CSSProperties } from 'vue'
import UserArticleRichEditor from '~/components/user/UserArticleRichEditor.vue'

interface UserArticleEditorForm {
  title: string
  slug: string
  summary: string
  coverImage: string
  contentHtml: string
}

interface Props {
  form: UserArticleEditorForm
  metaEyebrow: string
  settingsDescription: string
  statusAnchorLabel: string
  statusHeading: string
  editable?: boolean
  busy?: boolean
  loading?: boolean
  restorableDraft?: boolean
  restorableDraftSavedAtLabel?: string
  restoreDisabled?: boolean
  success?: string
  error?: string
  messagesPosition?: 'before' | 'after'
  coverPreviewSrc?: string
  uploadingCover?: boolean
  cropVisible?: boolean
  cropSourceUrl?: string
  cropScale: number
  cropImageStyle: CSSProperties
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  busy: false,
  loading: false,
  restorableDraft: false,
  restorableDraftSavedAtLabel: '',
  restoreDisabled: false,
  success: '',
  error: '',
  messagesPosition: 'before',
  coverPreviewSrc: '',
  uploadingCover: false,
  cropVisible: false,
  cropSourceUrl: '',
})

const emit = defineEmits<{
  (event: 'update:title', value: string): void
  (event: 'update:slug', value: string): void
  (event: 'update:summary', value: string): void
  (event: 'update:coverImage', value: string): void
  (event: 'update:contentHtml', value: string): void
  (event: 'update:cropScale', value: number): void
  (event: 'restore-draft' | 'discard-draft' | 'open-cover-picker' | 'clear-pending-cover-selection' | 'reset-crop-transform' | 'cancel-cover-crop' | 'confirm-cover-crop' | 'reference-panel-open'): void
  (event: 'start-crop-drag' | 'crop-drag-move' | 'end-crop-drag', value: PointerEvent): void
  (event: 'editor-error', value: string): void
}>()

defineSlots<{
  status(): unknown
  'cover-input'(): unknown
  loading?(): unknown
}>()

const titleModel = computed({
  get: () => props.form.title,
  set: (value: string) => emit('update:title', value),
})
const slugModel = computed({
  get: () => props.form.slug,
  set: (value: string) => emit('update:slug', value),
})
const summaryModel = computed({
  get: () => props.form.summary,
  set: (value: string) => emit('update:summary', value),
})
const coverImageModel = computed({
  get: () => props.form.coverImage,
  set: (value: string) => emit('update:coverImage', value),
})
const contentHtmlModel = computed({
  get: () => props.form.contentHtml,
  set: (value: string) => emit('update:contentHtml', value),
})
const cropScaleModel = computed({
  get: () => props.cropScale,
  set: (value: number) => emit('update:cropScale', value),
})
</script>

<template>
  <nav class="article-focus-rail" aria-label="文章编辑区块">
    <a href="/user/articles">我的文章</a>
    <a href="#article-meta">标题摘要</a>
    <a href="#article-body">正文</a>
    <a href="#article-settings">文章设置</a>
    <a href="#article-submit">{{ statusAnchorLabel }}</a>
  </nav>

  <section class="article-writing-surface">
    <slot v-if="loading" name="loading"></slot>
    <div v-if="restorableDraft" class="user-form-status article-draft-restore" role="status">
      <span>检测到未提交的本地草稿{{ restorableDraftSavedAtLabel ? `（自动保存于 ${restorableDraftSavedAtLabel}）` : '' }}，是否恢复到编辑器？</span>
      <span class="article-draft-restore__actions">
        <button class="secondary-button" type="button" :disabled="restoreDisabled" @click="emit('restore-draft')">恢复草稿</button>
        <button class="secondary-button" type="button" @click="emit('discard-draft')">丢弃</button>
      </span>
    </div>
    <template v-if="messagesPosition === 'before'">
      <p v-if="success" class="user-form-status user-form-success">{{ success }}</p>
      <p v-if="error" class="user-form-status user-form-error">{{ error }}</p>
    </template>

    <section id="article-meta" class="article-document-head">
      <span class="eyebrow">{{ metaEyebrow }}</span>
      <label class="article-title-field">
        <span>标题</span>
        <input v-model.trim="titleModel" type="text" maxlength="255" required :disabled="!editable" placeholder="输入文章标题" />
      </label>
      <label class="article-summary-field">
        <span>摘要</span>
        <textarea v-model.trim="summaryModel" maxlength="600" rows="3" :disabled="!editable" placeholder="写一段会显示在文章列表里的摘要"></textarea>
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
        v-model="contentHtmlModel"
        :disabled="!editable"
        reference-panel-target="#user-article-reference-panel-target"
        @reference-panel-open="emit('reference-panel-open')"
        @error="emit('editor-error', $event)"
      />
    </section>

    <section id="article-settings" class="article-settings-workspace">
      <div class="article-settings-panel">
        <div class="article-settings-panel__head">
          <div>
            <span class="eyebrow">Settings</span>
            <h2>文章设置</h2>
          </div>
          <p>{{ settingsDescription }}</p>
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
              <input v-model.trim="slugModel" type="text" maxlength="255" placeholder="melee-progression-note" :disabled="!editable" />
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
                <button class="secondary-button" type="button" :disabled="busy || loading || uploadingCover || !editable" @click="emit('open-cover-picker')">
                  {{ uploadingCover ? '封面处理中...' : '选择封面' }}
                </button>
                <slot name="cover-input"></slot>
              </div>
            </div>
            <label class="editor-field">
              <span>封面地址</span>
              <input v-model.trim="coverImageModel" type="url" maxlength="500" placeholder="https://..." :disabled="!editable" @input="emit('clear-pending-cover-selection')" />
            </label>
            <img v-if="coverPreviewSrc" class="article-cover-preview" :src="coverPreviewSrc" alt="封面预览" />
            <div v-if="cropVisible" class="user-cover-cropper" role="dialog" aria-modal="true" aria-label="裁剪封面">
              <div class="user-cover-cropper__panel">
                <div
                  class="user-cover-cropper__viewport"
                  @pointerdown.prevent="emit('start-crop-drag', $event)"
                  @pointermove.prevent="emit('crop-drag-move', $event)"
                  @pointerup.prevent="emit('end-crop-drag', $event)"
                  @pointercancel.prevent="emit('end-crop-drag', $event)"
                >
                  <img v-if="cropSourceUrl" :src="cropSourceUrl" alt="封面裁剪源图" :style="cropImageStyle" class="user-cover-cropper__image" draggable="false" />
                </div>
                <label class="user-cover-cropper__control">
                  <span>缩放 {{ cropScale.toFixed(2) }}x</span>
                  <input v-model.number="cropScaleModel" type="range" min="1" max="3" step="0.01" />
                </label>
                <div class="article-cover-actions">
                  <button class="secondary-button" type="button" @click="emit('reset-crop-transform')">重置</button>
                  <button class="secondary-button" type="button" @click="emit('cancel-cover-crop')">取消</button>
                  <button class="primary-button" type="button" :disabled="uploadingCover" @click="emit('confirm-cover-crop')">应用裁剪</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
    <template v-if="messagesPosition === 'after'">
      <p v-if="success" class="user-form-status user-form-success">{{ success }}</p>
      <p v-if="error" class="user-form-status user-form-error">{{ error }}</p>
    </template>
  </section>

  <aside id="article-submit" class="article-focus-status">
    <div id="user-article-reference-panel-target" class="article-reference-side-target" aria-live="polite"></div>
    <section class="article-status-card">
      <span class="eyebrow">{{ statusHeading }}</span>
      <div class="material-row" :class="{ done: form.title.trim(), missing: !form.title.trim() }"><b>标题</b><span>{{ form.title.trim() ? '已填写' : '必填' }}</span></div>
      <div class="material-row" :class="{ done: form.contentHtml.trim(), missing: !form.contentHtml.trim() }"><b>正文</b><span>{{ form.contentHtml.trim() ? '已填写' : '必填' }}</span></div>
      <slot name="status"></slot>
    </section>
  </aside>
</template>

<style scoped>
:global(.article-compact-head) {
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

:global(.article-compact-head__title) {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

:global(.article-compact-head__dot) {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--accent-gold);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-gold) 14%, transparent);
}

:global(.article-compact-head__title > div) {
  min-width: 0;
}

:global(.article-compact-head__title span:not(.article-compact-head__dot)) {
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

:global(.article-compact-head h1) {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--text-strong);
  font-size: 20px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.article-compact-head__actions) {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

:global(.article-compact-head--writing) {
  position: sticky;
  top: 10px;
  z-index: 60;
}

:global(.article-writing-toggle) {
  border-color: color-mix(in srgb, var(--accent-gold) 36%, var(--index-line));
}

:global(.article-focus-shell) {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr) 300px;
  gap: 16px;
  width: min(1500px, calc(100% - 32px));
  margin: 0 auto 42px;
  align-items: start;
}

:global(.article-focus-shell--writing) {
  grid-template-columns: minmax(0, 980px) 320px;
  justify-content: center;
  --article-reference-panel-top: clamp(152px, 18dvh, 188px);
  --user-article-toolbar-top: var(--article-reference-panel-top);
}

:global(.article-focus-shell--writing .article-focus-rail) {
  display: none;
}

:global(.article-focus-shell--writing .article-writing-surface) {
  background: color-mix(in srgb, var(--panel) 96%, transparent);
}

:global(.article-focus-shell--writing .article-settings-workspace) {
  opacity: .72;
}

:global(.article-focus-shell--writing .article-focus-status) {
  position: fixed;
  --user-article-reference-panel-max-height: calc(100dvh - var(--article-reference-panel-top) - 16px);
  top: var(--article-reference-panel-top);
  right: max(12px, calc((100vw - 1500px) / 2 + 16px));
  z-index: 35;
  width: min(320px, calc(100vw - 24px));
  max-height: var(--user-article-reference-panel-max-height);
}

:global(.article-focus-shell--writing .article-status-card) {
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

:slotted(.article-editor-loading) {
  display: grid;
  gap: 12px;
  min-height: 148px;
  align-content: center;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--index-line) 70%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 70%, transparent);
  pointer-events: none;
}

.article-draft-restore {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.article-draft-restore__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
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

.article-status-card :deep(.primary-button),
.article-status-card :deep(.secondary-button) {
  width: 100%;
}

.article-cover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

:slotted(.article-hidden-file) {
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
  :global(.article-focus-shell) {
    grid-template-columns: 1fr;
  }

  .article-focus-rail,
  .article-focus-status {
    position: static;
  }

  :global(.article-focus-shell--writing .article-focus-status) {
    position: fixed;
    --user-article-reference-panel-max-height: calc(100dvh - var(--article-reference-panel-top) - 16px);
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
  :global(.article-compact-head) {
    align-items: stretch;
    flex-direction: column;
    width: min(100% - 20px, 1500px);
    min-height: 0;
  }

  :global(.article-compact-head h1) {
    font-size: 18px;
  }

  :global(.article-compact-head__actions) {
    justify-content: stretch;
  }

  :global(.article-compact-head__actions .primary-button),
  :global(.article-compact-head__actions .secondary-button) {
    flex: 1 1 150px;
  }

  :global(.article-focus-shell) {
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
