<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

useSeoMeta({
  title: '账号设置 · TerraPedia',
  description: '管理 TerraPedia 用户显示名称、密码和账号状态。',
})

const authStore = useUserAuthStore()

const profileForm = reactive({ displayName: authStore.user?.displayName || '' })
const passwordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const deleteForm = reactive({ currentPassword: '' })

const profileMessage = ref('')
const profileError = ref('')
const passwordMessage = ref('')
const passwordError = ref('')
const accountError = ref('')

watch(
  () => authStore.user?.displayName,
  (value) => {
    profileForm.displayName = value || ''
  },
)

const saveProfile = async () => {
  profileMessage.value = ''
  profileError.value = ''
  try {
    await authStore.updateProfile(profileForm.displayName.trim())
    profileMessage.value = '资料已更新。'
  } catch (exception: unknown) {
    profileError.value = exception instanceof Error ? exception.message : '资料更新失败。'
  }
}

const savePassword = async () => {
  passwordMessage.value = ''
  passwordError.value = ''
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordError.value = '两次输入的新密码不一致。'
    return
  }
  try {
    await authStore.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordMessage.value = '密码已更新。'
  } catch (exception: unknown) {
    passwordError.value = exception instanceof Error ? exception.message : '密码更新失败。'
  }
}

const logout = async () => {
  await authStore.logout()
  await navigateTo('/')
}

const deleteAccount = async () => {
  accountError.value = ''
  if (!window.confirm('确认删除当前账号？此操作不可恢复。')) return
  try {
    await authStore.deleteAccount(deleteForm.currentPassword)
    await navigateTo('/')
  } catch (exception: unknown) {
    accountError.value = exception instanceof Error ? exception.message : '账号删除失败。'
  }
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="user-shell">
      <section class="user-panel">
        <span class="eyebrow">Account settings</span>
        <h1>账号设置</h1>
        <p class="user-muted">{{ authStore.user?.email }}</p>
      </section>

      <section class="user-grid">
        <div class="user-panel">
          <h2>个人资料</h2>
          <form class="user-form" @submit.prevent="saveProfile">
            <label class="user-field">
              <span>显示名称</span>
              <input v-model.trim="profileForm.displayName" class="user-input" type="text" autocomplete="name" maxlength="120" />
            </label>
            <p v-if="profileMessage" class="user-feedback user-feedback--success" aria-live="polite">{{ profileMessage }}</p>
            <p v-if="profileError" class="user-feedback user-feedback--error" aria-live="polite">{{ profileError }}</p>
            <button class="user-primary-button" type="submit" :disabled="authStore.submitting">保存资料</button>
          </form>
        </div>

        <aside class="user-panel">
          <h2>会话</h2>
          <p class="user-muted">退出后可以随时通过邮箱和密码重新登录。</p>
          <button class="user-secondary-button" type="button" @click="logout">退出登录</button>
        </aside>
      </section>

      <section class="user-grid">
        <form class="user-panel user-form" @submit.prevent="savePassword">
          <h2>修改密码</h2>
          <label class="user-field">
            <span>当前密码</span>
            <input v-model="passwordForm.currentPassword" class="user-input" type="password" autocomplete="current-password" required />
          </label>
          <label class="user-field">
            <span>新密码</span>
            <input v-model="passwordForm.newPassword" class="user-input" type="password" autocomplete="new-password" required />
          </label>
          <label class="user-field">
            <span>确认新密码</span>
            <input v-model="passwordForm.confirmPassword" class="user-input" type="password" autocomplete="new-password" required />
          </label>
          <p v-if="passwordMessage" class="user-feedback user-feedback--success" aria-live="polite">{{ passwordMessage }}</p>
          <p v-if="passwordError" class="user-feedback user-feedback--error" aria-live="polite">{{ passwordError }}</p>
          <button class="user-primary-button" type="submit" :disabled="authStore.submitting">更新密码</button>
        </form>

        <form class="user-panel user-form user-danger-zone" @submit.prevent="deleteAccount">
          <h2>删除账号</h2>
          <p class="user-muted">删除账号会移除当前登录身份。请谨慎操作。</p>
          <label class="user-field">
            <span>当前密码</span>
            <input v-model="deleteForm.currentPassword" class="user-input" type="password" autocomplete="current-password" required />
          </label>
          <p v-if="accountError" class="user-feedback user-feedback--error" aria-live="polite">{{ accountError }}</p>
          <button class="user-danger-button" type="submit" :disabled="authStore.submitting">删除账号</button>
        </form>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
