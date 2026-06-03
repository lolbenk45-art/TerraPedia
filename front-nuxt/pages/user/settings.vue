<script setup lang="ts">
definePageMeta({ requiresUserAuth: true })

const authStore = useUserAuthStore()
await authStore.init()

const profileForm = reactive({
  displayName: authStore.user?.displayName || '',
})
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
})
const profileError = ref('')
const profileSuccess = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')

watch(
  () => authStore.user?.displayName,
  (value) => {
    profileForm.displayName = value || ''
  },
)

const submitProfile = async () => {
  profileError.value = ''
  profileSuccess.value = ''
  try {
    await authStore.updateProfile(profileForm.displayName)
    profileSuccess.value = '个人资料已保存。'
  } catch (exception: unknown) {
    profileError.value = exception instanceof Error ? exception.message : '资料保存失败。'
  }
}

const submitPassword = async () => {
  passwordError.value = ''
  passwordSuccess.value = ''
  try {
    await authStore.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordSuccess.value = '密码已更新。'
  } catch (exception: unknown) {
    passwordError.value = exception instanceof Error ? exception.message : '密码修改失败。'
  }
}
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/settings · preferences</span>
          <h1>账号设置</h1>
          <p>设置页接入当前用户资料和密码接口；显示偏好、通知和公开身份先保留为前台入口。</p>
        </div>
        <a class="secondary-button" href="/user">返回用户中心</a>
      </div>
    </div>

    <main class="settings-layout">
      <section class="settings-list support-panel">
        <span class="eyebrow">设置分组</span>
        <a class="active" href="/user/settings"><span class="sprite-icon icon-user menu-icon" aria-hidden="true"></span><span><b>个人资料</b><span>昵称、登录邮箱</span></span></a>
        <a href="/user/settings"><span class="sprite-icon icon-items menu-icon" aria-hidden="true"></span><span><b>显示偏好</b><span>列表密度、默认入口</span></span></a>
        <a href="/user/settings"><span class="sprite-icon icon-notification menu-icon" aria-hidden="true"></span><span><b>通知</b><span>投稿状态、资料更新</span></span></a>
        <a href="/user/settings"><span class="sprite-icon icon-codex menu-icon" aria-hidden="true"></span><span><b>公开身份</b><span>贡献展示、署名方式</span></span></a>
      </section>

      <section class="settings-panel support-panel">
        <form class="user-settings-form" @submit.prevent="submitProfile">
          <span class="eyebrow">个人资料</span>
          <label>
            <span>昵称</span>
            <input v-model.trim="profileForm.displayName" type="text" autocomplete="nickname" minlength="2" maxlength="120" required />
          </label>
          <label>
            <span>登录邮箱</span>
            <input :value="authStore.user?.email" type="email" disabled />
          </label>
          <p class="user-field-hint">昵称需为 2-120 个字符，邮箱暂不支持自助修改。</p>
          <p v-if="profileSuccess" class="user-form-status user-form-success">{{ profileSuccess }}</p>
          <p v-if="profileError" class="user-form-status user-form-error">{{ profileError }}</p>
          <button class="primary-button" type="submit" :disabled="authStore.submitting">保存资料</button>
        </form>

        <form class="user-settings-form" @submit.prevent="submitPassword">
          <span class="eyebrow">密码</span>
          <label>
            <span>当前密码</span>
            <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <label>
            <span>新密码</span>
            <input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" minlength="10" maxlength="64" required />
          </label>
          <p class="user-field-hint">新密码需为 10-64 位，并同时包含字母和数字。</p>
          <p v-if="passwordSuccess" class="user-form-status user-form-success">{{ passwordSuccess }}</p>
          <p v-if="passwordError" class="user-form-status user-form-error">{{ passwordError }}</p>
          <button class="secondary-button" type="submit" :disabled="authStore.submitting">修改密码</button>
        </form>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
