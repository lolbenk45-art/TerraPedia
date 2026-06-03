<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

useSeoMeta({
  title: '新建文章 · TerraPedia',
  description: '创建 TerraPedia 用户文章草稿并提交审核。',
})

const authStore = useUserAuthStore()

const form = reactive({
  title: '',
  slug: '',
  summary: '',
  coverImage: '',
  contentHtml: '',
})
const error = ref('')
const submitMode = ref<'draft' | 'review'>('draft')

const buildPayload = () => ({
  title: form.title.trim(),
  slug: form.slug.trim() || undefined,
  summary: form.summary.trim() || undefined,
  coverImage: form.coverImage.trim() || undefined,
  contentHtml: form.contentHtml.trim(),
})

const submitArticle = async () => {
  error.value = ''
  try {
    const created = await authStore.createUserArticle(buildPayload())
    if (submitMode.value === 'review') {
      await authStore.submitUserArticleReview(created.id)
    }
    await navigateTo('/user/articles')
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '文章保存失败。'
  }
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-shell">
      <section class="user-panel">
        <span class="eyebrow">New article</span>
        <h1>新建文章</h1>
        <p class="user-muted">先保存为草稿，确认内容完整后提交审核。正文使用 HTML 文本输入。</p>
      </section>

      <form class="user-panel user-form" @submit.prevent="submitArticle">
        <label class="user-field">
          <span>标题</span>
          <input v-model.trim="form.title" class="user-input" name="title" type="text" required />
        </label>
        <label class="user-field">
          <span>Slug</span>
          <input v-model.trim="form.slug" class="user-input" name="slug" type="text" inputmode="url" />
        </label>
        <label class="user-field">
          <span>摘要</span>
          <input v-model.trim="form.summary" class="user-input" name="summary" type="text" />
        </label>
        <label class="user-field">
          <span>封面图片</span>
          <input v-model.trim="form.coverImage" class="user-input" name="coverImage" type="url" />
        </label>
        <label class="user-field">
          <span>正文 HTML</span>
          <textarea v-model="form.contentHtml" class="user-textarea" name="contentHtml" required />
        </label>

        <p v-if="error" class="user-feedback user-feedback--error" aria-live="polite">{{ error }}</p>

        <div class="user-button-row">
          <button class="user-secondary-button" type="submit" :disabled="authStore.submitting" @click="submitMode = 'draft'">保存草稿</button>
          <button class="user-primary-button" type="submit" :disabled="authStore.submitting" @click="submitMode = 'review'">保存并提交审核</button>
          <a class="user-secondary-button" href="/user/articles">返回列表</a>
        </div>
      </form>
    </main>

    <TerraFooter />
  </section>
</template>
