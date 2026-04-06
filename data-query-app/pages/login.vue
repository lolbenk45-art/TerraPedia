<template>
  <div class="login-page">
    <div class="login-page__bg login-page__bg--left" aria-hidden="true" />
    <div class="login-page__bg login-page__bg--right" aria-hidden="true" />

    <section class="login-card">
      <div class="login-card__brand">
        <span class="login-card__logo">📦</span>
        <div>
          <p class="login-card__eyebrow">TerraPedia Admin</p>
          <h1 class="login-card__title">后台登录</h1>
        </div>
      </div>

      <p class="login-card__subtitle">
        登录后可访问仪表盘、物品管理、分类维护和数据查询页面。
      </p>

      <form class="login-form" @submit.prevent="handleLogin">
        <label class="login-form__group">
          <span class="login-form__label">用户名</span>
          <input
            v-model="form.username"
            class="login-form__input"
            type="text"
            autocomplete="username"
            placeholder="请输入管理员用户名"
          />
        </label>

        <label class="login-form__group">
          <span class="login-form__label">密码</span>
          <input
            v-model="form.password"
            class="login-form__input"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
          />
        </label>

        <p v-if="errorMessage" class="login-form__error">{{ errorMessage }}</p>

        <button type="submit" class="login-form__submit" :disabled="authStore.submitting">
          {{ authStore.submitting ? '登录中...' : '登录进入后台' }}
        </button>
      </form>

      <div class="login-card__foot">
        <span>接口通过 JWT 保护管理端读写能力</span>
        <span>默认跳转回登录前页面</span>
      </div>
    </section>

    <AppToast />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})

const authStore = useAuthStore()
const route = useRoute()

const form = reactive({
  username: 'admin',
  password: ''
})

const errorMessage = ref('')

const redirectTarget = computed(() => {
  const raw = route.query.redirect
  return typeof raw === 'string' && raw.startsWith('/') ? raw : '/'
})

const handleLogin = async () => {
  errorMessage.value = ''

  if (!form.username.trim() || !form.password) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  const success = await authStore.login(form)
  if (!success) {
    errorMessage.value = '用户名或密码错误，或登录接口不可用'
    return
  }

  await navigateTo(redirectTarget.value)
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 34%),
    radial-gradient(circle at bottom right, rgba(14, 116, 144, 0.22), transparent 30%),
    linear-gradient(160deg, #f4fbfa 0%, #eef7f6 45%, #f8fbff 100%);
}

.login-page__bg {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  opacity: 0.6;
}

.login-page__bg--left {
  width: 320px;
  height: 320px;
  left: -80px;
  top: -80px;
  background: rgba(20, 184, 166, 0.18);
}

.login-page__bg--right {
  width: 280px;
  height: 280px;
  right: -60px;
  bottom: -40px;
  background: rgba(14, 116, 144, 0.16);
}

.login-card {
  width: min(100%, 440px);
  position: relative;
  z-index: 1;
  border-radius: 28px;
  padding: 32px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(18px);
}

.login-card__brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.login-card__logo {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  font-size: 1.75rem;
  color: white;
  background: linear-gradient(135deg, #0f766e 0%, #0e7490 100%);
  box-shadow: 0 14px 30px rgba(15, 118, 110, 0.24);
}

.login-card__eyebrow {
  margin: 0 0 4px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #0f766e;
}

.login-card__title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  color: #0f172a;
}

.login-card__subtitle {
  margin: 0 0 24px;
  line-height: 1.65;
  color: #475569;
}

.login-form__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.login-form__label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #334155;
}

.login-form__input {
  width: 100%;
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.login-form__input:focus {
  outline: none;
  border-color: #0f766e;
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.12);
}

.login-form__error {
  margin: -4px 0 16px;
  font-size: 0.875rem;
  color: #b91c1c;
}

.login-form__submit {
  width: 100%;
  border: none;
  border-radius: 14px;
  padding: 14px 16px;
  font-size: 0.95rem;
  font-weight: 700;
  color: white;
  cursor: pointer;
  background: linear-gradient(135deg, #0f766e 0%, #0e7490 100%);
  box-shadow: 0 16px 30px rgba(14, 116, 144, 0.22);
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.login-form__submit:hover:not(:disabled) {
  transform: translateY(-1px);
}

.login-form__submit:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.login-card__foot {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.78rem;
  color: #64748b;
}

@media (max-width: 560px) {
  .login-card {
    padding: 24px;
    border-radius: 22px;
  }

  .login-card__foot {
    flex-direction: column;
  }
}
</style>
