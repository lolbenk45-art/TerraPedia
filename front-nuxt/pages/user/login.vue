<script setup lang="ts">
import { buildUserPostAuthRedirectTarget } from '~/composables/useUserApi'

definePageMeta({ guestOnly: true })

const route = useRoute()
const authStore = useUserAuthStore()

const form = reactive({
  email: '',
  password: '',
})
const error = ref('')

const redirectTarget = computed(() => buildUserPostAuthRedirectTarget(route.query.redirect, '/user'))

const submit = async () => {
  error.value = ''
  try {
    await authStore.login(form.email, form.password)
    await navigateTo(redirectTarget.value)
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '登录失败，请检查邮箱和密码。'
  }
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-auth-layout">
      <section class="user-auth-copy support-panel">
        <span class="eyebrow">账号入口</span>
        <h1>登录 TerraPedia</h1>
        <p>登录后可以继续管理收藏、文章草稿、账号偏好，并回到刚才打开的资料路径。</p>
        <div class="user-auth-proof">
          <div><b>收藏</b><span>快速回到资料</span></div>
          <div><b>投稿</b><span>管理攻略草稿</span></div>
          <div><b>偏好</b><span>保存浏览设置</span></div>
        </div>
      </section>

      <form class="user-form-panel support-panel" @submit.prevent="submit">
        <span class="eyebrow">Account login</span>
        <label>
          <span>邮箱</span>
          <input v-model.trim="form.email" type="email" autocomplete="email" required />
        </label>
        <label>
          <span>密码</span>
          <input v-model="form.password" type="password" autocomplete="current-password" required />
        </label>
        <p class="user-field-hint">使用后端写入的 HttpOnly Cookie 保持登录状态。</p>
        <p v-if="error" class="user-form-status user-form-error" aria-live="polite">{{ error }}</p>
        <button class="primary-button" type="submit" :disabled="authStore.submitting">
          {{ authStore.submitting ? '登录中...' : '登录' }}
        </button>
        <div class="form-footnote">
          <a :href="`/user/register?redirect=${encodeURIComponent(redirectTarget)}`">注册账号</a>
          <a href="/user">返回用户中心</a>
        </div>
      </form>
    </main>

    <TerraFooter />
  </section>
</template>
