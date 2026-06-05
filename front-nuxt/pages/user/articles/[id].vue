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
const coverInputRef = ref<HTMLInputElement | null>(null)
const pendingCoverFile = ref<File | null>(null)
const coverPreviewUrl = ref('')
const uploadingCover = ref(false)

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
const canOfflineArticle = computed(() => isPublishedArticle.value)
const canDeleteArticle = computed(() => isDraftLike.value || isOfflineArticle.value)
const articleLoading = computed(() => authStore.articlesLoading || !initialArticleLoaded.value)
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
  pendingCoverFile.value = null
  coverPreviewUrl.value = ''
}

const reportEditorError = (message: string) => {
  error.value = message
}

const validateCoverImage = (file: File) => {
  if (!file.type.startsWith('image/')) {
    error.value = '请选择图片文件。'
    return false
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = '封面图片不能超过 5MB。'
    return false
  }
  return true
}

const openCoverPicker = () => {
  if (!canEditArticle.value) return
  coverInputRef.value?.click()
}

const readCoverImageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('封面读取失败。'))
  reader.readAsDataURL(file)
})

const handleCoverSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = ''
  success.value = ''
  if (!validateCoverImage(file)) {
    input.value = ''
    return
  }
  uploadingCover.value = true
  try {
    pendingCoverFile.value = file
    coverPreviewUrl.value = await readCoverImageAsDataUrl(file)
    success.value = '封面已选择，保存草稿后上传生效。'
  } catch (exception: unknown) {
    pendingCoverFile.value = null
    coverPreviewUrl.value = ''
    error.value = exception instanceof Error ? exception.message : '封面读取失败。'
  } finally {
    uploadingCover.value = false
    input.value = ''
  }
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
    const uploadedCover = pendingCoverFile.value ? await uploadUserArticleImage(pendingCoverFile.value) : null
    const contentHtml = await uploadUserArticleEmbeddedImages(form.contentHtml)
    syncForm(await authStore.updateUserArticle(articleId.value, {
      title: form.title,
      slug: form.slug,
      summary: form.summary,
      coverImage: uploadedCover?.url || form.coverImage,
      contentHtml,
    }))
    success.value = wasOffline ? '文章已保存为草稿，可重新提交审核。' : '草稿已保存。'
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '草稿保存失败。'
  }
}

const submitReview = async () => {
  error.value = ''
  success.value = ''
  try {
    syncForm(await authStore.submitUserArticleForReview(articleId.value))
    success.value = '已提交审核。'
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

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/articles/{{ articleId }} · editor</span>
          <h1>{{ article?.title || '编辑文章' }}</h1>
          <p>管理当前账号下的文章。已发布文章需要先下架，再编辑内容并重新提交审核。</p>
        </div>
        <a class="secondary-button" href="/user/articles">返回我的文章</a>
      </div>
    </div>

    <form class="editor-layout" @submit.prevent="saveDraft">
      <section class="editor-main support-panel">
        <span class="eyebrow">文章内容</span>
        <p v-if="articleLoading" class="user-form-status">文章加载中...</p>
        <p v-if="success" class="user-form-status user-form-success">{{ success }}</p>
        <p v-if="error" class="user-form-status user-form-error">{{ error }}</p>

        <label class="editor-field">
          <span>标题</span>
          <input v-model.trim="form.title" type="text" maxlength="255" required :disabled="!canEditArticle" />
        </label>
        <label class="editor-field summary">
          <span>摘要</span>
          <textarea v-model.trim="form.summary" maxlength="600" rows="3" :disabled="!canEditArticle"></textarea>
        </label>
        <label class="editor-field">
          <span>Slug</span>
          <input v-model.trim="form.slug" type="text" maxlength="255" placeholder="melee-progression-note" :disabled="!canEditArticle" />
        </label>
        <label class="editor-field">
          <span>封面地址</span>
          <input v-model.trim="form.coverImage" type="url" maxlength="500" placeholder="https://..." :disabled="!canEditArticle" @input="pendingCoverFile = null; coverPreviewUrl = ''" />
        </label>
        <div class="article-cover-actions">
          <button class="secondary-button" type="button" :disabled="authStore.submitting || articleLoading || uploadingCover || !canEditArticle" @click="openCoverPicker">
            {{ uploadingCover ? '封面读取中...' : '选择封面图片' }}
          </button>
          <input ref="coverInputRef" class="article-hidden-file" type="file" accept="image/*" @change="handleCoverSelected" />
        </div>
        <img v-if="coverPreviewSrc" class="article-cover-preview" :src="coverPreviewSrc" alt="封面预览" />
        <div class="editor-body-placeholder">
          <b>正文</b>
          <UserArticleRichEditor v-model="form.contentHtml" :disabled="!canEditArticle" @error="reportEditorError" />
        </div>
      </section>

      <aside class="editor-side support-panel">
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
          v-if="isDraftLike"
          class="secondary-button"
          type="button"
          :disabled="authStore.submitting || articleLoading || !hasRequiredFields"
          @click="submitReview"
        >
          提交审核
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
      </aside>
    </form>

    <TerraFooter />
  </section>
</template>

<style scoped>
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
  background: color-mix(in srgb, var(--index-surface) 88%, #101827);
}
</style>
