<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

import type { UserArticle } from '~/types/public-api'
import UserArticleEditorLayout from '~/components/user/UserArticleEditorLayout.vue'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'
import { formatDisplayDateTime } from '~/lib/displayDateTime.mjs'
import { formatArticleStatus, formatReviewStatus } from '~/lib/userArticleStatus'

const route = useRoute()
const authStore = useUserAuthStore()
const article = ref<UserArticle | null>(null)
const error = ref('')
const success = ref('')
const initialArticleLoaded = ref(false)
const writingModeEnabled = ref(false)
const compactHeadRef = ref<HTMLElement | null>(null)
const referencePanelTop = ref(152)

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

const {
  restorableDraft,
  restorableDraftSavedAtLabel,
  detectRestorableArticleDraft: detectRestorableArticleDraftInternal,
  restoreArticleDraft,
  discardArticleDraft,
  clearDraft: clearStoredArticleDraft,
  resetBaseline: resetArticleDraftBaseline,
  markSaved: markArticleDraftSaved,
} = useArticleDraftGuard({
  storageKey: () => `terrapedia:article-draft:${articleId.value}`,
  form,
  onRestore: clearPendingCoverSelection,
})

// The edit page only surfaces a restorable draft while the article stays
// editable ("本地副本与服务端一致时自动清除" lives inside the guard).
const detectRestorableArticleDraft = () => detectRestorableArticleDraftInternal({ canEdit: canEditArticle.value })

const syncForm = (nextArticle: UserArticle) => {
  article.value = nextArticle
  form.title = nextArticle.title
  form.slug = nextArticle.slug || ''
  form.summary = nextArticle.summary || ''
  form.coverImage = nextArticle.coverImage || ''
  form.contentHtml = nextArticle.contentHtml || nextArticle.contentMarkdown || ''
  clearPendingCoverSelection()
  // The form now mirrors the server copy, so the leave guards start clean.
  resetArticleDraftBaseline()
}

const reportEditorError = (message: string) => {
  error.value = message
}

const persistCurrentDraft = async () => {
  const uploadedCover = pendingCoverFile.value ? await uploadUserArticleImage(pendingCoverFile.value) : null
  const contentHtml = await uploadUserArticleEmbeddedImages(form.contentHtml)
  const updatedArticle = await authStore.updateUserArticle(articleId.value, {
    title: form.title,
    slug: form.slug,
    summary: form.summary,
    coverImage: uploadedCover?.url || form.coverImage,
    contentHtml,
  })
  // The server now owns this content; drop the local safety copy.
  clearStoredArticleDraft()
  return updatedArticle
}

const loadArticle = async () => {
  error.value = ''
  success.value = ''
  try {
    syncForm(await authStore.fetchUserArticle(articleId.value))
    detectRestorableArticleDraft()
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
    // Back to an editable draft: a stored local draft may be restorable again.
    detectRestorableArticleDraft()
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
    // Offline articles are editable again: surface any stored local draft.
    detectRestorableArticleDraft()
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
    // The article is gone; its local safety copy has nothing to restore into.
    markArticleDraftSaved()
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

    <div ref="compactHeadRef" class="article-compact-head" :class="{ 'article-compact-head--writing': writingModeEnabled }">
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

    <main class="tp-page-shell user-article-editor-page">
      <form id="edit-user-article-form" class="article-focus-shell" :class="{ 'article-focus-shell--writing': writingModeEnabled }" :style="referencePanelShellStyle" @submit.prevent="saveDraft">
        <UserArticleEditorLayout
          :form="form"
          meta-eyebrow="文章内容"
          settings-description="设置公开列表素材。已提交审核后会锁定编辑。"
          status-anchor-label="审核状态"
          status-heading="审核状态"
          :editable="canEditArticle"
          :busy="authStore.submitting"
          :loading="articleLoading"
          :restorable-draft="Boolean(restorableDraft)"
          :restorable-draft-saved-at-label="restorableDraftSavedAtLabel"
          :restore-disabled="!canEditArticle"
          :success="success"
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
          <template #loading>
            <section class="article-editor-loading" aria-live="polite" aria-label="文章编辑页加载中">
              <CommonTpSkeleton type="pill" />
              <CommonTpSkeleton type="line" />
              <CommonTpSkeleton type="line" short />
              <CommonTpSkeleton type="line" />
            </section>
          </template>
          <template #cover-input>
            <input ref="coverInputRef" class="article-hidden-file" type="file" accept="image/*" @change="handleCoverSelected" />
          </template>
          <template #status>
            <div class="material-row"><b>发布状态</b><span>{{ article ? formatArticleStatus(article.status) : '加载中' }}</span></div>
            <div class="material-row"><b>审核状态</b><span>{{ article ? formatReviewStatus(article.reviewStatus) : '加载中' }}</span></div>
            <div v-if="article?.submittedAt" class="material-row"><b>提交时间</b><span>{{ formatDisplayDateTime(article.submittedAt) }}</span></div>
            <div v-if="article?.reviewedAt" class="material-row"><b>审核时间</b><span>{{ formatDisplayDateTime(article.reviewedAt) }}</span></div>
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
          </template>
        </UserArticleEditorLayout>
      </form>
    </main>

    <TerraFooter />
  </section>
</template>
