<template>
  <div class="profile-wrap">
    <section class="profile-head card">
      <h1>My Account</h1>
      <p class="subtitle">Manage your own account information and security settings.</p>

      <div v-if="authStore.loading" class="loading">Loading profile...</div>
      <template v-else-if="authStore.user">
        <dl>
          <div class="row">
            <dt>ID</dt>
            <dd>{{ authStore.user.id }}</dd>
          </div>
          <div class="row">
            <dt>Email</dt>
            <dd>{{ authStore.user.email }}</dd>
          </div>
          <div class="row">
            <dt>Status</dt>
            <dd>{{ authStore.user.status === 1 ? 'Active' : 'Disabled' }}</dd>
          </div>
        </dl>
      </template>
      <p v-else class="error">Session not found. Please sign in again.</p>
    </section>

    <section v-if="authStore.user" class="card hub">
      <div class="hub__head">
        <h2>Creator Hub</h2>
        <p class="subtitle">Writing, drafting and publishing workflow now lives under your signed-in workspace.</p>
      </div>
      <div class="hub__grid">
        <router-link to="/articles/write" class="hub-card">
          <strong>Article Writer</strong>
          <span>Edit, save and submit drafts for review.</span>
        </router-link>
        <router-link to="/copywriting" class="hub-card">
          <strong>Copywriting Studio</strong>
          <span>Quickly format and refine marketing copy.</span>
        </router-link>
        <router-link to="/articles" class="hub-card">
          <strong>My Articles</strong>
          <span>Check published content and updates.</span>
        </router-link>
        <router-link to="/items" class="hub-card">
          <strong>Explore Items</strong>
          <span>Back to item browsing and lookup.</span>
        </router-link>
      </div>
    </section>

    <section v-if="authStore.user" class="card">
      <h2>Update Profile</h2>
      <form class="form" @submit.prevent="submitProfile">
        <label>
          <span>Display Name</span>
          <input v-model.trim="profileForm.displayName" type="text" maxlength="120" required />
        </label>
        <p v-if="profileMsg" class="msg msg--success">{{ profileMsg }}</p>
        <p v-if="profileError" class="msg msg--error">{{ profileError }}</p>
        <button type="submit" :disabled="authStore.submitting">
          {{ authStore.submitting ? 'Saving...' : 'Save Profile' }}
        </button>
      </form>
    </section>

    <section v-if="authStore.user" class="card">
      <h2>Change Password</h2>
      <form class="form" @submit.prevent="submitPassword">
        <label>
          <span>Current Password</span>
          <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required />
        </label>
        <label>
          <span>New Password</span>
          <input v-model="passwordForm.newPassword" type="password" autocomplete="new-password" required />
        </label>
        <label>
          <span>Confirm New Password</span>
          <input v-model="passwordForm.confirmPassword" type="password" autocomplete="new-password" required />
        </label>
        <p class="hint">Password must be 10+ chars and include letters + numbers.</p>
        <p v-if="passwordMsg" class="msg msg--success">{{ passwordMsg }}</p>
        <p v-if="passwordError" class="msg msg--error">{{ passwordError }}</p>
        <button type="submit" :disabled="authStore.submitting">
          {{ authStore.submitting ? 'Updating...' : 'Update Password' }}
        </button>
      </form>
    </section>

    <section v-if="authStore.user" class="card workspace">
      <h2>Content Workspace</h2>
      <p class="subtitle">Write article drafts from your front-end workspace, or open the copywriting helper.</p>
      <div class="workspace-links">
        <router-link to="/articles/write" class="workspace-link">Open Article Writer</router-link>
        <router-link to="/copywriting" class="workspace-link workspace-link--secondary">Open Copywriting Studio</router-link>
      </div>
    </section>

    <section v-if="authStore.user" class="card tools">
      <h2>Account Tools</h2>
      <p class="subtitle">Quick account-level actions for active sessions.</p>
      <div class="tools__actions">
        <button type="button" class="btn-ghost" @click="handleLogout">Sign out this session</button>
        <router-link to="/" class="workspace-link workspace-link--secondary">Back to Home</router-link>
      </div>
    </section>

    <section v-if="authStore.user" class="card danger">
      <h2>Delete Account</h2>
      <p class="danger-desc">This action will disable and delete your current account. This cannot be undone.</p>
      <form class="form" @submit.prevent="submitDelete">
        <label>
          <span>Current Password</span>
          <input v-model="deleteForm.currentPassword" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="deleteError" class="msg msg--error">{{ deleteError }}</p>
        <div class="danger-actions">
          <button type="button" class="btn-ghost" @click="handleLogout">Sign out</button>
          <button type="submit" class="btn-danger" :disabled="authStore.submitting">
            {{ authStore.submitting ? 'Deleting...' : 'Delete Account' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserAuthStore } from '@/stores/userAuth'

const router = useRouter()
const authStore = useUserAuthStore()

const profileForm = reactive({
  displayName: '',
})
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const deleteForm = reactive({
  currentPassword: '',
})

const profileMsg = ref('')
const profileError = ref('')
const passwordMsg = ref('')
const passwordError = ref('')
const deleteError = ref('')

watch(
  () => authStore.user?.displayName,
  (value) => {
    profileForm.displayName = value || ''
  },
  { immediate: true }
)

const handleLogout = async () => {
  await authStore.logout()
  await router.replace('/')
}

const submitProfile = async () => {
  profileMsg.value = ''
  profileError.value = ''
  try {
    await authStore.updateProfile(profileForm.displayName)
    profileMsg.value = 'Profile updated successfully'
  } catch (exception: any) {
    profileError.value = exception?.response?.data?.message || exception?.message || 'Failed to update profile'
  }
}

const submitPassword = async () => {
  passwordMsg.value = ''
  passwordError.value = ''

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    passwordError.value = 'New passwords do not match'
    return
  }

  try {
    await authStore.changePassword(passwordForm.currentPassword, passwordForm.newPassword)
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
    passwordForm.confirmPassword = ''
    passwordMsg.value = 'Password updated. Please sign in again on other devices.'
  } catch (exception: any) {
    passwordError.value = exception?.response?.data?.message || exception?.message || 'Failed to update password'
  }
}

const submitDelete = async () => {
  deleteError.value = ''
  const confirmed = window.confirm('Delete current account permanently?')
  if (!confirmed) {
    return
  }

  try {
    await authStore.deleteAccount(deleteForm.currentPassword)
    await router.replace('/register')
  } catch (exception: any) {
    deleteError.value = exception?.response?.data?.message || exception?.message || 'Failed to delete account'
  }
}

onMounted(async () => {
  if (!authStore.initialized) {
    await authStore.init()
  }
})
</script>

<style scoped>
.profile-wrap {
  max-width: 980px;
  margin: 0 auto;
  min-height: calc(100vh - 64px);
  padding: 24px 20px 40px;
  display: grid;
  gap: 14px;
}

.card {
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-secondary);
  box-shadow: var(--shadow-md);
  padding: 22px;
}

.profile-head {
  background:
    radial-gradient(130% 120% at 0% 0%, color-mix(in srgb, var(--accent-primary) 14%, transparent), transparent 45%),
    var(--bg-secondary);
}

h1,
h2 {
  margin: 0;
}

.subtitle {
  margin-top: 6px;
  color: var(--text-secondary);
}

dl {
  margin: 16px 0 0;
  display: grid;
  gap: 10px;
}

.row {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

dt {
  color: var(--text-secondary);
}

dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-primary);
}

.form {
  margin-top: 14px;
  display: grid;
  gap: 10px;
}

label {
  display: grid;
  gap: 6px;
}

span {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

input {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

button {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.hint {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-muted);
}

.msg {
  margin: 0;
  font-size: 0.9rem;
}

.msg--success {
  color: var(--accent-success);
}

.msg--error,
.error {
  color: var(--accent-error);
}

.danger {
  border-color: color-mix(in srgb, var(--accent-error) 35%, var(--border-color));
}

.workspace {
  background:
    radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 40%),
    var(--bg-secondary);
}

.hub {
  background:
    radial-gradient(120% 120% at 0% 0%, color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 45%),
    var(--bg-secondary);
}

.hub__head {
  margin-bottom: 12px;
}

.hub__grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.hub-card {
  display: grid;
  gap: 6px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  text-decoration: none;
  color: var(--text-primary);
  background: var(--bg-primary);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.hub-card strong {
  font-size: 0.95rem;
}

.hub-card span {
  font-size: 0.84rem;
  color: var(--text-secondary);
}

.hub-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent-primary) 35%, var(--border-color));
}

.workspace-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  color: #fff;
  text-decoration: none;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
}

.workspace-links {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.workspace-link--secondary {
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
}

.workspace-link:hover {
  filter: brightness(1.04);
}

.danger-desc {
  margin-top: 8px;
  color: var(--text-secondary);
}

.tools__actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.danger-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-ghost {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-danger {
  background: #dc2626;
}

.loading {
  margin-top: 14px;
  color: var(--text-secondary);
}
</style>
