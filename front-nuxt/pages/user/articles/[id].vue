<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

import type { UserArticle } from '~/types/public-api'

const route = useRoute()
const authStore = useUserAuthStore()
const article = ref<UserArticle | null>(null)
const error = ref('')
const success = ref('')
const initialArticleLoaded = ref(false)

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
  try {
    syncForm(await authStore.updateUserArticle(articleId.value, {
      title: form.title,
      slug: form.slug,
      summary: form.summary,
      coverImage: form.coverImage,
      contentHtml: form.contentHtml,
    }))
    success.value = isOfflineArticle.value ? '文章已保存为草稿，可重新提交审核。' : '草稿已保存。'
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
          <input v-model.trim="form.coverImage" type="url" maxlength="500" placeholder="https://..." :disabled="!canEditArticle" />
        </label>
        <label class="editor-body-placeholder">
          <b>正文</b>
          <textarea v-model="form.contentHtml" rows="14" required placeholder="输入 HTML 或后端兼容的正文内容" :disabled="!canEditArticle"></textarea>
        </label>
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
