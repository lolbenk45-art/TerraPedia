<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

const authStore = useUserAuthStore()
const form = reactive({
  title: '',
  slug: '',
  summary: '',
  coverImage: '',
  contentHtml: '',
})
const error = ref('')

const hasRequiredFields = computed(() => Boolean(form.title.trim() && form.contentHtml.trim()))

const submit = async () => {
  error.value = ''
  try {
    await authStore.createUserArticle({
      title: form.title,
      slug: form.slug,
      summary: form.summary,
      coverImage: form.coverImage,
      contentHtml: form.contentHtml,
    })
    await navigateTo('/user/articles')
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '草稿保存失败。'
  }
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/articles/new · editor</span>
          <h1>新建文章</h1>
          <p>创建当前账号下的文章草稿。保存后进入我的文章列表，再由后续审核流程处理。</p>
        </div>
        <a class="secondary-button" href="/user/articles">返回我的文章</a>
      </div>
    </div>

    <form class="editor-layout" @submit.prevent="submit">
      <section class="editor-main support-panel">
        <span class="eyebrow">文章草稿</span>
        <label class="editor-field">
          <span>标题</span>
          <input v-model.trim="form.title" type="text" maxlength="255" required />
        </label>
        <label class="editor-field summary">
          <span>摘要</span>
          <textarea v-model.trim="form.summary" maxlength="600" rows="3"></textarea>
        </label>
        <label class="editor-field">
          <span>Slug</span>
          <input v-model.trim="form.slug" type="text" maxlength="255" placeholder="melee-progression-note" />
        </label>
        <label class="editor-field">
          <span>封面地址</span>
          <input v-model.trim="form.coverImage" type="url" maxlength="500" placeholder="https://..." />
        </label>
        <label class="editor-body-placeholder">
          <b>正文</b>
          <textarea v-model="form.contentHtml" rows="12" required placeholder="输入 HTML 或后端兼容的正文内容"></textarea>
        </label>
        <p v-if="error" class="user-form-status user-form-error">{{ error }}</p>
      </section>

      <aside class="editor-side support-panel">
        <span class="eyebrow">发布检查</span>
        <div class="material-row" :class="{ done: form.title.trim(), missing: !form.title.trim() }"><b>标题</b><span>{{ form.title.trim() ? '已填写' : '必填' }}</span></div>
        <div class="material-row" :class="{ done: form.contentHtml.trim(), missing: !form.contentHtml.trim() }"><b>正文</b><span>{{ form.contentHtml.trim() ? '已填写' : '必填' }}</span></div>
        <div class="material-row" :class="{ done: form.summary.trim(), missing: !form.summary.trim() }"><b>摘要</b><span>{{ form.summary.trim() ? '已填写' : '可选' }}</span></div>
        <div class="material-row"><b>状态</b><span>保存为草稿</span></div>
        <button class="primary-button" type="submit" :disabled="authStore.submitting || !hasRequiredFields">
          {{ authStore.submitting ? '保存中...' : '保存草稿' }}
        </button>
      </aside>
    </form>

    <TerraFooter />
  </section>
</template>
