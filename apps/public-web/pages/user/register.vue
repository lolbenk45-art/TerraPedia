<script setup lang="ts">
import { buildUserPostAuthRedirectTarget } from '~/composables/useUserApi'

definePageMeta({ guestOnly: true, publicScreenClass: 'entity-screen' })

const route = useRoute()
const authStore = useUserAuthStore()

const form = reactive({
  displayName: '',
  email: '',
  password: '',
  verificationCode: '',
})
const error = ref('')
const status = ref('')
const debugCode = ref('')
const showDebugVerificationCode = import.meta.dev

const redirectTarget = computed(() => buildUserPostAuthRedirectTarget(route.query.redirect, '/user'))

const requestCode = async () => {
  error.value = ''
  status.value = ''
  debugCode.value = ''
  try {
    const response = await authStore.requestRegisterCode(form.email)
    status.value = `验证码已发送，有效期 ${Math.max(1, Math.round(Number(response.expiresInSeconds ?? 600) / 60))} 分钟。`
    debugCode.value = response.debugVerificationCode || ''
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '验证码发送失败。'
  }
}

const submit = async () => {
  error.value = ''
  status.value = ''
  try {
    await authStore.register({
      email: form.email,
      password: form.password,
      verificationCode: form.verificationCode,
      displayName: form.displayName,
    })
    await navigateTo(redirectTarget.value)
  } catch (exception: unknown) {
    error.value = exception instanceof Error ? exception.message : '注册失败，请检查表单信息。'
  }
}
</script>

<template>
    <TerraBreadcrumb />

    <main class="user-auth-layout">
      <section class="user-auth-copy support-panel">
        <span class="eyebrow">创建账号</span>
        <h1>注册成为资料共建者</h1>
        <p>注册后可以保存阅读路径，发布和管理自己的专题文章。</p>
        <div class="user-auth-proof">
          <div><b>路线</b><span>保存阅读进度</span></div>
          <div><b>纠错</b><span>提交资料反馈</span></div>
          <div><b>文章</b><span>参与专题共建</span></div>
        </div>
      </section>

      <form class="user-form-panel support-panel" @submit.prevent="submit">
        <span class="eyebrow">Account register</span>
        <label>
          <span>昵称</span>
          <input v-model.trim="form.displayName" type="text" autocomplete="nickname" maxlength="120" />
        </label>
        <label>
          <span>邮箱</span>
          <input v-model.trim="form.email" type="email" autocomplete="email" required />
        </label>
        <UserPasswordInput
          v-model="form.password"
          input-id="register-password"
          label="密码"
          autocomplete="new-password"
          minlength="10"
          maxlength="64"
          required
        />
        <p class="user-field-hint">密码需为 10-64 位，并同时包含字母和数字。</p>
        <label>
          <span>验证码</span>
          <input v-model.trim="form.verificationCode" type="text" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="one-time-code" required />
        </label>
        <button class="secondary-button" type="button" :disabled="authStore.submitting || !form.email" @click="requestCode">
          {{ authStore.submitting ? '处理中...' : '发送验证码' }}
        </button>
        <p v-if="status" class="user-form-status user-form-success" aria-live="polite">{{ status }}</p>
        <p v-if="showDebugVerificationCode && debugCode" class="user-field-hint">开发验证码：{{ debugCode }}</p>
        <p v-if="error" class="user-form-status user-form-error" aria-live="polite">{{ error }}</p>
        <button class="primary-button" type="submit" :disabled="authStore.submitting">
          {{ authStore.submitting ? '注册中...' : '注册' }}
        </button>
        <div class="form-footnote">
          <a :href="`/user/login?redirect=${encodeURIComponent(redirectTarget)}`">已有账号</a>
          <a href="/user">返回用户中心</a>
        </div>
      </form>
    </main>
</template>
