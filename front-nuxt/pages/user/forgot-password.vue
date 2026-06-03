<script setup lang="ts">
import { buildUserRedirectTarget } from '~/composables/useUserApi'

definePageMeta({ guestOnly: true })

useSeoMeta({
  title: '找回密码 · TerraPedia',
  description: '通过邮箱验证码重置 TerraPedia 用户账号密码。',
})

const route = useRoute()
const authStore = useUserAuthStore()

const form = reactive({
  email: '',
  verificationCode: '',
  newPassword: '',
  confirmPassword: '',
})
const info = ref('')
const error = ref('')
const cooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | undefined

const redirectQuery = computed(() => {
  const target = buildUserRedirectTarget(route.query.redirect, '')
  return target ? `?redirect=${encodeURIComponent(target)}` : ''
})
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmailValid = computed(() => emailPattern.test(form.email.trim()))
const canSendCode = computed(() => cooldown.value <= 0 && !authStore.submitting && isEmailValid.value)

const startCooldown = (seconds: number) => {
  cooldown.value = Math.max(0, seconds)
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = undefined
  }
  if (cooldown.value <= 0) return
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = undefined
    }
  }, 1000)
}

const sendCode = async () => {
  info.value = ''
  error.value = ''
  const email = form.email.trim()
  if (!emailPattern.test(email)) {
    error.value = '请填写有效邮箱。'
    return
  }
  try {
    const result = await authStore.requestPasswordResetCode(email)
    startCooldown(result.cooldownSeconds || 60)
    if (result.debugVerificationCode) {
      form.verificationCode = result.debugVerificationCode
      info.value = `本地调试验证码已自动填入，约 ${Math.max(1, Math.floor(result.expiresInSeconds / 60))} 分钟内有效。`
    } else {
      info.value = `验证码已发送，约 ${Math.max(1, Math.floor(result.expiresInSeconds / 60))} 分钟内有效。`
    }
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '验证码发送失败。'
  }
}

const submit = async () => {
  info.value = ''
  error.value = ''
  if (form.newPassword !== form.confirmPassword) {
    error.value = '两次输入的密码不一致。'
    return
  }
  if (!form.verificationCode.trim()) {
    error.value = '请填写验证码。'
    return
  }
  try {
    await authStore.resetPassword({
      email: form.email,
      verificationCode: form.verificationCode,
      newPassword: form.newPassword,
    })
    await navigateTo('/user/login')
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '密码重置失败。'
  }
}

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-shell">
      <section class="user-grid">
        <div class="user-panel">
          <span class="eyebrow">Password recovery</span>
          <h1>找回密码</h1>
          <p class="user-muted">通过邮箱验证码设置新密码。成功后请使用新密码重新登录。</p>
          <div class="user-action-grid">
            <a class="user-action-card" :href="`/user/login${redirectQuery}`"><b>返回登录</b><span>使用新密码进入</span></a>
            <a class="user-action-card" href="/user/register"><b>注册账号</b><span>创建新的用户账号</span></a>
          </div>
        </div>

        <form class="user-panel user-form" @submit.prevent="submit">
          <h2>重置密码</h2>
          <label class="user-field">
            <span>邮箱</span>
            <input v-model.trim="form.email" class="user-input" type="email" autocomplete="email" required />
          </label>
          <label class="user-field">
            <span>验证码</span>
            <div class="user-split-field">
              <input v-model.trim="form.verificationCode" class="user-input" type="text" inputmode="numeric" maxlength="8" required />
              <button class="user-secondary-button" type="button" :disabled="!canSendCode" @click="sendCode">
                {{ cooldown > 0 ? `${cooldown}s` : '发送验证码' }}
              </button>
            </div>
          </label>
          <label class="user-field">
            <span>新密码</span>
            <input v-model="form.newPassword" class="user-input" type="password" autocomplete="new-password" required />
          </label>
          <label class="user-field">
            <span>确认新密码</span>
            <input v-model="form.confirmPassword" class="user-input" type="password" autocomplete="new-password" required />
          </label>

          <p v-if="info" class="user-feedback user-feedback--success" aria-live="polite">{{ info }}</p>
          <p v-if="error" class="user-feedback user-feedback--error" aria-live="polite">{{ error }}</p>

          <button class="user-primary-button" type="submit" :disabled="authStore.submitting">
            {{ authStore.submitting ? '提交中...' : '重置密码' }}
          </button>
        </form>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
