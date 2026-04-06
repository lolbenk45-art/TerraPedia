<template>
  <AuthLayout
    kicker="Secure Sign Up"
    title="Create a TerraPedia account"
    description="Registration now follows the same crafted structure as the rest of the public app: fewer ad-hoc panels, stronger hierarchy, and clearer action states."
    :highlights="[
      'Verification codes are required before account creation.',
      'Requests are rate-limited to reduce abuse.',
      'Profile updates and password changes use the same secure account path.',
    ]"
  >
    <div class="page-hero">
      <h2 class="section-title">Register</h2>
      <p class="section-copy">Use your email and verification code to create an account.</p>
    </div>

    <form class="form-grid" @submit.prevent="submit">
      <label class="field-label">
        <span>Display Name</span>
        <input v-model.trim="form.displayName" class="input-control" type="text" maxlength="120" autocomplete="name" />
      </label>

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
        <span>Password</span>
        <input v-model="form.password" class="input-control" type="password" required autocomplete="new-password" />
      </label>

      <label class="field-label">
        <span>Confirm Password</span>
        <input v-model="form.confirmPassword" class="input-control" type="password" required autocomplete="new-password" />
      </label>

      <p class="feedback-line feedback-line--hint">Password must be 10+ chars and include letters + numbers.</p>
      <p v-if="info" class="feedback-line feedback-line--info">{{ info }}</p>
      <p v-if="error" class="feedback-line feedback-line--error">{{ error }}</p>

      <button type="submit" class="button button--primary" :disabled="authStore.submitting">
        {{ authStore.submitting ? 'Creating...' : 'Create Account' }}
      </button>
    </form>

    <p class="inline-link-row auth-footnote">
      Already registered?
      <router-link :to="`/login${redirectQuery}`">Sign in</router-link>
    </p>
  </AuthLayout>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '@/components/AuthLayout.vue'
import { useUserAuthStore } from '@/stores/userAuth'

const route = useRoute()
const router = useRouter()
const authStore = useUserAuthStore()

const form = reactive({
  displayName: '',
  email: '',
  verificationCode: '',
  password: '',
  confirmPassword: '',
})
const error = ref('')
const info = ref('')
const cooldown = ref(0)
let cooldownTimer: number | null = null

const redirectTarget = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') ? value : '/'
})

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
    const result = await authStore.requestRegisterCode(normalizedEmail)
    startCooldown(result.cooldownSeconds || 60)
    if (result.debugVerificationCode) {
      form.verificationCode = result.debugVerificationCode
      info.value = `Local dev mode: code ${result.debugVerificationCode} has been auto-filled. It expires in ${Math.max(1, Math.floor(result.expiresInSeconds / 60))} minute(s).`
    } else {
      info.value = `Verification code sent. It expires in ${Math.max(1, Math.floor(result.expiresInSeconds / 60))} minute(s).`
    }
  } catch (exception: any) {
    error.value = exception?.response?.data?.message || exception?.message || 'Failed to send verification code'
  }
}

const submit = async () => {
  error.value = ''
  info.value = ''

  if (form.password !== form.confirmPassword) {
    error.value = 'Passwords do not match'
    return
  }
  if (!form.verificationCode.trim()) {
    error.value = 'Verification code is required'
    return
  }

  try {
    await authStore.register({
      email: form.email,
      password: form.password,
      verificationCode: form.verificationCode,
      displayName: form.displayName || undefined,
    })
    await router.replace(redirectTarget.value)
  } catch (exception: any) {
    error.value = exception?.response?.data?.message || exception?.message || 'Register failed'
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
