<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

import UserArticleRichEditor from '~/components/user/UserArticleRichEditor.vue'
import { resolvePreviewImageUrl } from '~/composables/usePreviewImage'

const authStore = useUserAuthStore()
const coverInputRef = ref<HTMLInputElement | null>(null)
const pendingCoverFile = ref<File | null>(null)
const coverPreviewUrl = ref('')
const form = reactive({
  title: '',
  slug: '',
  summary: '',
  coverImage: '',
  contentHtml: '',
})
const error = ref('')
const uploadingCover = ref(false)

const hasRequiredFields = computed(() => Boolean(form.title.trim() && form.contentHtml.trim()))
const coverPreviewSrc = computed(() => coverPreviewUrl.value || resolvePreviewImageUrl(form.coverImage))

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
  if (!validateCoverImage(file)) {
    input.value = ''
    return
  }
  uploadingCover.value = true
  try {
    pendingCoverFile.value = file
    coverPreviewUrl.value = await readCoverImageAsDataUrl(file)
  } catch (exception: unknown) {
    pendingCoverFile.value = null
    coverPreviewUrl.value = ''
    error.value = exception instanceof Error ? exception.message : '封面读取失败。'
  } finally {
    uploadingCover.value = false
    input.value = ''
  }
}

const submit = async () => {
  error.value = ''
  try {
    const uploadedCover = pendingCoverFile.value ? await uploadUserArticleImage(pendingCoverFile.value) : null
    const contentHtml = await uploadUserArticleEmbeddedImages(form.contentHtml)
    const article = await authStore.createUserArticle({
      title: form.title,
      slug: form.slug,
      summary: form.summary,
      coverImage: uploadedCover?.url || form.coverImage,
      contentHtml,
    })
    await navigateTo(`/user/articles/${article.id}`)
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
          <input v-model.trim="form.coverImage" type="url" maxlength="500" placeholder="https://..." @input="pendingCoverFile = null; coverPreviewUrl = ''" />
        </label>
        <div class="article-cover-actions">
          <button class="secondary-button" type="button" :disabled="authStore.submitting || uploadingCover" @click="openCoverPicker">
            {{ uploadingCover ? '封面读取中...' : '选择封面图片' }}
          </button>
          <input ref="coverInputRef" class="article-hidden-file" type="file" accept="image/*" @change="handleCoverSelected" />
        </div>
        <img v-if="coverPreviewSrc" class="article-cover-preview" :src="coverPreviewSrc" alt="封面预览" />
        <div class="editor-body-placeholder">
          <b>正文</b>
          <UserArticleRichEditor v-model="form.contentHtml" @error="reportEditorError" />
        </div>
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
