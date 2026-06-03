<script setup lang="ts">
import { buildUserRedirectTarget } from '~/composables/useUserApi'

definePageMeta({ guestOnly: true })

useSeoMeta({
  title: '登录 · TerraPedia',
  description: '登录 TerraPedia 用户中心，继续管理账号和投稿草稿。',
})

const route = useRoute()
const authStore = useUserAuthStore()

const form = reactive({
  email: '',
  password: '',
})
const error = ref('')

const redirectTarget = computed(() => buildUserRedirectTarget(route.query.redirect, '/user'))
const redirectQuery = computed(() => {
  const target = buildUserRedirectTarget(route.query.redirect, '')
  return target ? `?redirect=${encodeURIComponent(target)}` : ''
})

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

    <main class="user-shell">
      <section class="user-grid">
        <div class="user-panel">
          <span class="eyebrow">User login</span>
          <h1>登录 TerraPedia</h1>
          <p class="user-muted">登录后可以管理账号资料、维护自己的文章草稿，并进入投稿审核流程。</p>
          <div class="user-action-grid">
            <a class="user-action-card" href="/items"><b>物品图鉴</b><span>继续查询装备和材料</span></a>
            <a class="user-action-card" href="/articles"><b>资料手札</b><span>浏览公开文章</span></a>
          </div>
        </div>

        <form class="user-panel user-form" @submit.prevent="submit">
          <h2>账号登录</h2>
          <label class="user-field">
            <span>邮箱</span>
            <input v-model.trim="form.email" class="user-input" type="email" autocomplete="email" required />
          </label>
          <label class="user-field">
            <span>密码</span>
            <input v-model="form.password" class="user-input" type="password" autocomplete="current-password" required />
          </label>

          <p v-if="error" class="user-feedback user-feedback--error" aria-live="polite">{{ error }}</p>

          <button class="user-primary-button" type="submit" :disabled="authStore.submitting">
            {{ authStore.submitting ? '登录中...' : '登录' }}
          </button>

          <div class="form-footnote">
            <a :href="`/user/register${redirectQuery}`">注册账号</a>
            <a :href="`/user/forgot-password${redirectQuery}`">找回密码</a>
          </div>
        </form>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
