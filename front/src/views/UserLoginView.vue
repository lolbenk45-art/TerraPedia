<template>
  <AuthLayout
    kicker="Protected Login"
    title="Sign in to your TerraPedia workspace"
    description="Rate-limited authentication, safer recovery, and account self-management now share one consistent entry point."
    :highlights="[
      'Login attempts are throttled to reduce brute-force abuse.',
      'Recovery and registration now follow the same visual language.',
      'Primary actions are clearer, calmer, and easier to scan.',
    ]"
  >
    <div class="page-hero">
      <h2 class="section-title">Welcome back</h2>
      <p class="section-copy">Sign in to continue writing, curating, and exploring item knowledge.</p>
    </div>

    <form class="form-grid" @submit.prevent="submit">
      <label class="field-label">
        <span>Email</span>
        <input v-model.trim="form.email" class="input-control" type="email" required autocomplete="email" />
      </label>

      <label class="field-label">
        <span>Password</span>
        <input v-model="form.password" class="input-control" type="password" required autocomplete="current-password" />
      </label>

      <p v-if="error" class="feedback-line feedback-line--error">{{ error }}</p>

      <button type="submit" class="button button--primary" :disabled="authStore.submitting">
        {{ authStore.submitting ? 'Signing in...' : 'Sign in' }}
      </button>

      <p class="inline-link-row">
        <router-link :to="`/forgot-password${redirectQuery}`">Forgot password?</router-link>
      </p>
    </form>

    <p class="inline-link-row auth-footnote">
      No account?
      <router-link :to="`/register${redirectQuery}`">Create one</router-link>
    </p>
  </AuthLayout>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthLayout from '@/components/AuthLayout.vue'
import { useUserAuthStore } from '@/stores/userAuth'

const route = useRoute()
const router = useRouter()
const authStore = useUserAuthStore()

const form = reactive({
  email: '',
  password: '',
})
const error = ref('')

const redirectTarget = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') ? value : '/'
})

const redirectQuery = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' ? `?redirect=${encodeURIComponent(value)}` : ''
})

const submit = async () => {
  error.value = ''
  try {
    await authStore.login(form.email, form.password)
    await router.replace(redirectTarget.value)
  } catch (exception: any) {
    error.value = exception?.response?.data?.message || exception?.message || 'Login failed'
  }
}
</script>

<style scoped>
.auth-footnote {
  margin-top: 1rem;
}
</style>
