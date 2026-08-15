<script setup lang="ts">
definePageMeta({ requiresUserAuth: true, publicScreenClass: 'entity-screen' })

import UserArticleEditorLayout from '~/components/user/UserArticleEditorLayout.vue'
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
const compactHeadRef = ref<HTMLElement | null>(null)
const referencePanelTop = ref(152)

const hasRequiredFields = computed(() => Boolean(form.title.trim() && form.contentHtml.trim()))
const referencePanelShellStyle = computed(() => (
  writingModeEnabled.value
    ? { '--article-reference-panel-top': `${referencePanelTop.value}px` }
    : undefined
))

let referencePanelResizeObserver: ResizeObserver | null = null
let referencePanelOffsetFrame = 0

const syncReferencePanelOffset = () => {
  referencePanelOffsetFrame = 0
  const compactHead = compactHeadRef.value
  if (!compactHead) return
  referencePanelTop.value = Math.max(96, Math.ceil(compactHead.getBoundingClientRect().bottom + 12))
}

const scheduleReferencePanelOffset = () => {
  if (referencePanelOffsetFrame) return
  referencePanelOffsetFrame = window.requestAnimationFrame(syncReferencePanelOffset)
}

watch(writingModeEnabled, async (enabled) => {
  if (!enabled) return
  await nextTick()
  scheduleReferencePanelOffset()
})

onMounted(() => {
  window.addEventListener('resize', scheduleReferencePanelOffset)
  window.addEventListener('scroll', scheduleReferencePanelOffset, { passive: true })
  if ('ResizeObserver' in window) {
    referencePanelResizeObserver = new ResizeObserver(scheduleReferencePanelOffset)
    if (compactHeadRef.value) referencePanelResizeObserver.observe(compactHeadRef.value)
  }
  scheduleReferencePanelOffset()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleReferencePanelOffset)
  window.removeEventListener('scroll', scheduleReferencePanelOffset)
  if (referencePanelOffsetFrame) {
    window.cancelAnimationFrame(referencePanelOffsetFrame)
    referencePanelOffsetFrame = 0
  }
  referencePanelResizeObserver?.disconnect()
})

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

const {
  restorableDraft,
  restorableDraftSavedAtLabel,
  detectRestorableArticleDraft,
  restoreArticleDraft,
  discardArticleDraft,
  markSaved: markArticleDraftSaved,
} = useArticleDraftGuard({
  storageKey: 'terrapedia:article-draft:new',
  form,
  onRestore: clearPendingCoverSelection,
})

onMounted(() => {
  detectRestorableArticleDraft()
})

const createArticleDraft = async () => {
  const uploadedCover = pendingCoverFile.value ? await uploadUserArticleImage(pendingCoverFile.value) : null
  const contentHtml = await uploadUserArticleEmbeddedImages(form.contentHtml)
  const article = await authStore.createUserArticle({
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    coverImage: uploadedCover?.url || form.coverImage,
    contentHtml,
  })
  // The server now owns this content: drop the local safety copy and let the
  // leave guards treat the editor as clean before navigation.
  markArticleDraftSaved()
  return article
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
    <TerraBreadcrumb />

    <div ref="compactHeadRef" class="article-compact-head" :class="{ 'article-compact-head--writing': writingModeEnabled }">
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

    <main class="tp-page-shell user-article-editor-page">
      <form id="new-user-article-form" class="article-focus-shell" :class="{ 'article-focus-shell--writing': writingModeEnabled }" :style="referencePanelShellStyle" @submit.prevent="submit">
        <UserArticleEditorLayout
          :form="form"
          meta-eyebrow="文章草稿"
          settings-description="设置公开列表素材，正文写完后再补也可以。"
          status-anchor-label="发布检查"
          status-heading="发布检查"
          :writing-mode="writingModeEnabled"
          messages-position="after"
          :busy="authStore.submitting"
          :restorable-draft="Boolean(restorableDraft)"
          :restorable-draft-saved-at-label="restorableDraftSavedAtLabel"
          :error="error"
          :cover-preview-src="coverPreviewSrc"
          :uploading-cover="uploadingCover"
          :crop-visible="cropVisible"
          :crop-source-url="cropSourceUrl"
          :crop-scale="cropScale"
          :crop-image-style="cropImageStyle"
          @update:title="form.title = $event"
          @update:slug="form.slug = $event"
          @update:summary="form.summary = $event"
          @update:cover-image="form.coverImage = $event"
          @update:content-html="form.contentHtml = $event"
          @update:crop-scale="cropScale = $event"
          @restore-draft="restoreArticleDraft"
          @discard-draft="discardArticleDraft"
          @open-cover-picker="openCoverPicker"
          @clear-pending-cover-selection="clearPendingCoverSelection"
          @reset-crop-transform="resetCropTransform"
          @cancel-cover-crop="cancelCoverCrop"
          @confirm-cover-crop="confirmCoverCrop"
          @start-crop-drag="startCropDrag"
          @crop-drag-move="handleCropDragMove"
          @end-crop-drag="endCropDrag"
          @reference-panel-open="writingModeEnabled = true"
          @editor-error="reportEditorError"
        >
          <template #cover-input>
            <input ref="coverInputRef" class="article-hidden-file" type="file" accept="image/*" @change="handleCoverSelected" />
          </template>
          <template #status>
            <div class="material-row" :class="{ done: form.summary.trim(), missing: !form.summary.trim() }"><b>摘要</b><span>{{ form.summary.trim() ? '已填写' : '可选' }}</span></div>
            <div class="material-row"><b>状态</b><span>保存为草稿</span></div>
            <button class="secondary-button article-review-action" type="button" :disabled="authStore.submitting || !hasRequiredFields" @click="submitForAdminReview">
              保存并提交管理员审核
            </button>
            <button class="primary-button" type="submit" :disabled="authStore.submitting || !hasRequiredFields">
              {{ authStore.submitting ? '保存中...' : '保存草稿' }}
            </button>
          </template>
        </UserArticleEditorLayout>
      </form>
    </main>
</template>

<style scoped src="../../../assets/css/domains/user-article-editor-page.css"></style>
