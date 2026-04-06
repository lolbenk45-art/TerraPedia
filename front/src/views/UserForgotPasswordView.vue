<template>
  <AuthLayout
    kicker="Email Recovery"
    title="Reset your password safely"
    description="Password recovery now uses the same deliberate form structure and calmer visual hierarchy as registration and login."
    :highlights="[
      'Codes expire automatically and are tied to cooldown windows.',
      'Recovery attempts are rate-limited to reduce abuse.',
      'Existing sessions are revoked after a successful reset.',
    ]"
  >
    <div class="page-hero">
      <h2 class="section-title">Forgot Password</h2>
      <p class="section-copy">Request a verification code and set a new password.</p>
    </div>

    <form class="form-grid" @submit.prevent="submit">
      <label class="field-label">
        <span>Email</span>
        <input v-model.trim="form.email" class="input-control" type="email" required autocomplete="email" />
      </label>

      <label class="field-label">
        <span>Verification Code</span>
        <div class="split-code-field">
          <input
            v-model.trim="form.verificationCode"
            class="input-control"
            type="text"
            inputmode="numeric"
            maxlength="8"
            required
            placeholder="Enter code"
          />
          <button type="button" class="button button--secondary code-button" :disabled="!canSendCode" @click="sendCode">
            {{ cooldown > 0 ? `${cooldown}s` : 'Send Code' }}
          </button>
        </div>
      </label>

      <label class="field-label">
        <span>New Password</span>
        <input v-model="form.newPassword" class="input-control" type="password" required autocomplete="new-password" />
      </label>

      <label class="field-label">
        <span>Confirm New Password</span>
        <input v-model="form.confirmPassword" class="input-control" type="password" required autocomplete="new-password" />
      </label>

      <p class="feedback-line feedback-line--hint">Password must be 10+ chars and include letters + numbers.</p>
      <p v-if="info" class="feedback-line feedback-line--info">{{ info }}</p>
      <p v-if="error" class="feedback-line feedback-line--error">{{ error }}</p>

      <button type="submit" class="button button--primary" :disabled="authStore.submitting">
        {{ authStore.submitting ? 'Submitting...' : 'Reset Password' }}
      </button>
    </form>

    <p class="inline-link-row auth-footnote">
      Back to sign in:
      <router-link :to="`/login${redirectQuery}`">Login</router-link>
    </p>
  </AuthLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import AuthLayout from '@/components/AuthLayout.vue'
import { useUserAuthStore } from '@/stores/userAuth'

const route = useRoute()
const authStore = useUserAuthStore()

const form = reactive({
  email: '',
  verificationCode: '',
  newPassword: '',
  confirmPassword: '',
})
const error = ref('')
const info = ref('')
const cooldown = ref(0)
let cooldownTimer: number | null = null

const redirectQuery = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' ? `?redirect=${encodeURIComponent(value)}` : ''
})

const canSendCode = computed(() => {
  return cooldown.value <= 0 && !authStore.submitting && form.email.trim().length > 0
})

const startCooldown = (seconds: number) => {
  cooldown.value = Math.max(0, seconds)
  if (cooldownTimer) {
    window.clearInterval(cooldownTimer)
    cooldownTimer = null
  }

  if (cooldown.value <= 0) {
    return
  }

  cooldownTimer = window.setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && cooldownTimer) {
      window.clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

const sendCode = async () => {
  error.value = ''
  info.value = ''
  const normalizedEmail = form.email.trim()
  if (!normalizedEmail) {
    error.value = 'Please input email first'
    return
  }

  try {
    const result = await authStore.requestPasswordResetCode(normalizedEmail)
    startCooldown(result.cooldownSeconds || 60)
    if (result.debugVerificationCode) {
      form.verificationCode = result.debugVerificationCode
      info.value = `Local dev mode: code ${result.debugVerificationCode} has been auto-filled. It expires in ${Math.max(1, Math.floor(result.expiresInSeconds / 60))} minute(s).`
    } else {
      info.value = `Verification code sent. It expires in ${Math.max(1, Math.floor(result.expiresInSeconds / 60))} minute(s).`
    }
  } catch (exception: any) {
    const message = exception?.response?.data?.message || exception?.message || 'Failed to send verification code'
    if (typeof message === 'string' && message.includes('Email is not registered')) {
      error.value = 'This email is not registered yet. Please register first.'
      return
    }
    error.value = message
  }
}

const submit = async () => {
  error.value = ''
  info.value = ''

  if (form.newPassword !== form.confirmPassword) {
    error.value = 'Passwords do not match'
    return
  }
  if (!form.verificationCode.trim()) {
    error.value = 'Verification code is required'
    return
  }

  try {
    await authStore.resetPassword({
      email: form.email,
      verificationCode: form.verificationCode,
      newPassword: form.newPassword,
    })
    form.verificationCode = ''
    form.newPassword = ''
    form.confirmPassword = ''
    info.value = 'Password reset succeeded. Please go to login with your new password.'
  } catch (exception: any) {
    const message = exception?.response?.data?.message || exception?.message || 'Failed to reset password'
    if (typeof message === 'string' && message.includes('Email is not registered')) {
      error.value = 'This email is not registered yet. Please register first.'
      return
    }
    error.value = message
  }
}

onUnmounted(() => {
  if (cooldownTimer) {
    window.clearInterval(cooldownTimer)
  }
})
</script>

<style scoped>
.auth-footnote {
  margin-top: 1rem;
}

.code-button {
  min-width: 7.5rem;
}
</style>
