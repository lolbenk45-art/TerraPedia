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
const avatarError = ref('')
const avatarSuccess = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)

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

const uploadAvatar = async (event: Event) => {
  avatarError.value = ''
  avatarSuccess.value = ''
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    avatarError.value = '头像仅支持 JPEG、PNG 或 WebP。'
    input.value = ''
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    avatarError.value = '头像文件不能超过 2 MB。'
    input.value = ''
    return
  }

  try {
    await authStore.uploadAvatar(file)
    avatarSuccess.value = '头像已更新。'
  } catch (exception: unknown) {
    avatarError.value = exception instanceof Error ? exception.message : '头像上传失败。'
  } finally {
    input.value = ''
  }
}

const deleteAvatar = async () => {
  avatarError.value = ''
  avatarSuccess.value = ''
  try {
    await authStore.deleteAvatar()
    avatarSuccess.value = '头像已移除。'
  } catch (exception: unknown) {
    avatarError.value = exception instanceof Error ? exception.message : '头像移除失败。'
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
        <section class="user-settings-form avatar-settings-block" aria-labelledby="avatar-settings-title">
          <span class="eyebrow">头像</span>
          <div class="avatar-settings-row">
            <div class="settings-avatar-preview">
              <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" :alt="`${authStore.displayName} 的头像`" />
              <span v-else class="sprite-icon icon-user" aria-hidden="true"></span>
            </div>
            <div>
              <h2 id="avatar-settings-title">个人头像</h2>
              <p class="user-field-hint">支持 JPEG、PNG、WebP，建议使用 2 MB 以内的正方形图片。</p>
              <div class="avatar-action-row">
                <button class="primary-button" type="button" :disabled="authStore.submitting" @click="avatarInput?.click()">
                  {{ authStore.user?.avatarUrl ? '替换头像' : '上传头像' }}
                </button>
                <button class="secondary-button" type="button" :disabled="authStore.submitting || !authStore.user?.avatarUrl" @click="deleteAvatar">
                  移除头像
                </button>
              </div>
              <input ref="avatarInput" class="visually-hidden-file" type="file" accept="image/jpeg,image/png,image/webp" @change="uploadAvatar" />
              <p v-if="avatarSuccess" class="user-form-status user-form-success">{{ avatarSuccess }}</p>
              <p v-if="avatarError" class="user-form-status user-form-error">{{ avatarError }}</p>
            </div>
          </div>
        </section>

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

<style scoped>
.avatar-settings-block {
  display: grid;
  gap: 12px;
}

.avatar-settings-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.settings-avatar-preview {
  display: grid;
  place-items: center;
  width: 92px;
  height: 92px;
  overflow: hidden;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
}

.settings-avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.settings-avatar-preview .sprite-icon {
  width: 44px;
  height: 44px;
}

.avatar-settings-row h2 {
  margin: 0 0 6px;
  color: var(--text-strong);
  font-size: 18px;
}

.avatar-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.visually-hidden-file {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 640px) {
  .avatar-settings-row {
    grid-template-columns: 1fr;
  }
}
</style>
