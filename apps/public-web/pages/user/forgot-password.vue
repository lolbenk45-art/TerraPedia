<script setup lang="ts">
definePageMeta({ guestOnly: true, publicScreenClass: 'entity-screen' })

const authStore = useUserAuthStore()

const form = reactive({
  email: '',
  verificationCode: '',
  newPassword: '',
})
const error = ref('')
const status = ref('')
const debugCode = ref('')
const resetComplete = ref(false)
const showDebugVerificationCode = import.meta.dev

const requestCode = async () => {
  error.value = ''
  status.value = ''
  debugCode.value = ''
  resetComplete.value = false
  try {
    const response = await authStore.requestPasswordResetCode(form.email)
    status.value = `验证码已发送，有效期 ${Math.max(1, Math.round(Number(response.expiresInSeconds ?? 600) / 60))} 分钟。`
    debugCode.value = response.debugVerificationCode || ''
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '重置验证码发送失败。'
  }
}

const submit = async () => {
  error.value = ''
  status.value = ''
  resetComplete.value = false
  try {
    await authStore.resetPassword({
      email: form.email,
      verificationCode: form.verificationCode,
      newPassword: form.newPassword,
    })
    form.verificationCode = ''
    form.newPassword = ''
    debugCode.value = ''
    resetComplete.value = true
    status.value = '密码已重置，可以返回登录。'
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '密码重置失败，请检查验证码和新密码。'
  }
}
</script>

<template>
    <TerraBreadcrumb />

    <main class="user-auth-layout">
      <section class="user-auth-copy support-panel">
        <span class="eyebrow">找回密码</span>
        <h1>重置 TerraPedia 密码</h1>
        <p>通过邮箱验证码设置新密码。重置成功后，用新密码回到登录页继续访问用户中心。</p>
        <div class="user-auth-proof">
          <div><b>邮箱</b><span>接收验证码</span></div>
          <div><b>验证码</b><span>4-8 位数字</span></div>
          <div><b>新密码</b><span>字母和数字</span></div>
        </div>
      </section>

      <form class="user-form-panel support-panel" @submit.prevent="submit">
        <span class="eyebrow">Password reset</span>
        <label>
          <span>邮箱</span>
          <input v-model.trim="form.email" type="email" autocomplete="email" required />
        </label>
        <button class="secondary-button" type="button" :disabled="authStore.submitting || !form.email" @click="requestCode">
          {{ authStore.submitting ? '处理中...' : '发送验证码' }}
        </button>
        <label>
          <span>验证码</span>
          <input v-model.trim="form.verificationCode" type="text" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="one-time-code" required />
        </label>
        <UserPasswordInput
          v-model="form.newPassword"
          input-id="forgot-new-password"
          label="新密码"
          autocomplete="new-password"
          minlength="10"
          maxlength="64"
          required
        />
        <p class="user-field-hint">新密码需为 10-64 位，并同时包含字母和数字。</p>
        <p v-if="status" class="user-form-status user-form-success" aria-live="polite">{{ status }}</p>
        <p v-if="showDebugVerificationCode && debugCode" class="user-field-hint">开发验证码：{{ debugCode }}</p>
        <p v-if="error" class="user-form-status user-form-error" aria-live="polite">{{ error }}</p>
        <button class="primary-button" type="submit" :disabled="authStore.submitting || resetComplete">
          {{ authStore.submitting ? '重置中...' : '重置密码' }}
        </button>
        <div class="form-footnote">
          <a href="/user/login">返回登录</a>
          <a href="/user/register">注册账号</a>
        </div>
      </form>
    </main>
</template>
