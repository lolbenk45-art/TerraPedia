<template>
  <div class="page-wrap users-page">
    <div class="page-head">
      <div>
        <h1 class="page-head__title">User Management</h1>
        <p class="page-head__subtitle">View users, enable/disable accounts, reset passwords, and create new users.</p>
      </div>
    </div>

    <section class="section-card">
      <form class="toolbar" @submit.prevent="handleSearch">
        <input v-model.trim="keyword" class="input" type="text" placeholder="Search by email" />
        <select v-model="statusFilter" class="input">
          <option value="">All Status</option>
          <option value="1">Enabled</option>
          <option value="0">Disabled</option>
        </select>
        <button type="submit" class="btn btn-primary">Search</button>
        <button type="button" class="btn btn-secondary" @click="handleReset">Reset</button>
        <button type="button" class="btn btn-primary" @click="openCreateDialog">Add User</button>
      </form>
    </section>

    <section class="section-card">
      <div v-if="loading" class="empty-text">Loading...</div>
      <template v-else>
        <div v-if="users.length" class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Display Name</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in users" :key="row.id">
                <td>#{{ row.id }}</td>
                <td>{{ row.email }}</td>
                <td>{{ row.displayName || '--' }}</td>
                <td>
                  <span class="status" :class="row.status === 1 ? 'status--enabled' : 'status--disabled'">
                    {{ row.status === 1 ? 'Enabled' : 'Disabled' }}
                  </span>
                </td>
                <td>{{ formatDateTime(row.lastLoginAt) }}</td>
                <td>{{ formatDateTime(row.createdAt) }}</td>
                <td>
                  <button type="button" class="btn-link" @click="toggleStatus(row)">
                    {{ row.status === 1 ? 'Disable' : 'Enable' }}
                  </button>
                  <button type="button" class="btn-link" @click="handleResetPassword(row)">Reset Password</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-text">No users found</p>
      </template>

      <div v-if="pagination.totalPages > 1" class="pagination-wrap">
        <AppPagination
          :page="pagination.page"
          :total="pagination.total"
          :total-pages="pagination.totalPages"
          @change="handlePageChange"
        />
      </div>
    </section>

    <AppModal v-model="createDialogVisible" title="Add User" width="420px">
      <form class="form-stack" @submit.prevent="handleCreateUser">
        <input v-model.trim="createForm.email" class="input" type="email" placeholder="Email" autocomplete="off" />
        <input v-model.trim="createForm.displayName" class="input" type="text" placeholder="Display Name (optional)" autocomplete="off" />
        <input
          v-model="createForm.password"
          class="input"
          type="password"
          placeholder="Password (10-64 chars, letters+numbers)"
          autocomplete="new-password"
        />
        <select v-model.number="createForm.status" class="input">
          <option :value="1">Enabled</option>
          <option :value="0">Disabled</option>
        </select>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="createDialogVisible = false">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="creatingUser" @click="handleCreateUser">
          {{ creatingUser ? 'Creating...' : 'Create' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { showToast } from '~/composables/useToast'
import type { AdminUser } from '~/stores/users'

const usersStore = useUsersStore()
const { users, loading, pagination, keyword, status } = storeToRefs(usersStore)

const createDialogVisible = ref(false)
const creatingUser = ref(false)
const createForm = reactive({
  email: '',
  displayName: '',
  password: '',
  status: 1 as 0 | 1,
})

const statusFilter = computed<string>({
  get: () => (status.value == null ? '' : String(status.value)),
  set: (value) => {
    if (value === '') {
      status.value = null
      return
    }
    status.value = Number(value)
  },
})

const handleSearch = async () => {
  await usersStore.fetchUsers(1, pagination.value.size)
}

const handleReset = async () => {
  keyword.value = ''
  status.value = null
  await usersStore.fetchUsers(1, pagination.value.size)
}

const handlePageChange = async (page: number) => {
  await usersStore.fetchUsers(page, pagination.value.size)
}

const resetCreateForm = () => {
  createForm.email = ''
  createForm.displayName = ''
  createForm.password = ''
  createForm.status = 1
}

const openCreateDialog = () => {
  resetCreateForm()
  createDialogVisible.value = true
}

const toggleStatus = async (row: AdminUser) => {
  const nextStatus = row.status === 1 ? 0 : 1
  await usersStore.updateStatus(row.id, nextStatus)
}

const handleResetPassword = async (row: AdminUser) => {
  const nextPassword = window.prompt(`Enter a new password for ${row.email} (10-64 chars, letters+numbers)`)
  if (!nextPassword) return
  const result = await usersStore.resetPassword(row.id, nextPassword)
  if (result.temporaryPassword) {
    showToast(`Password reset: ${result.temporaryPassword}`, 'success')
  }
}

const handleCreateUser = async () => {
  if (!createForm.email) {
    showToast('Email is required', 'warning')
    return
  }
  if (!createForm.password) {
    showToast('Password is required', 'warning')
    return
  }

  creatingUser.value = true
  try {
    await usersStore.createUser({
      email: createForm.email,
      displayName: createForm.displayName || undefined,
      password: createForm.password,
      status: createForm.status,
    })
    createDialogVisible.value = false
    await usersStore.fetchUsers(1, pagination.value.size)
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || 'Failed to create user', 'error')
  } finally {
    creatingUser.value = false
  }
}

const formatDateTime = (value?: string) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

onMounted(async () => {
  await usersStore.fetchUsers()
})
</script>

<style scoped>
.users-page { animation: pageReveal .35s ease backwards; }
@keyframes pageReveal { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.toolbar { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
.form-stack { display:flex; flex-direction:column; gap:12px; }
.input { min-width:180px; padding:8px 12px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-bg); color:var(--color-text); }
.btn { padding:8px 16px; border:none; border-radius:var(--radius-md); font-size:.875rem; font-weight:500; cursor:pointer; }
.btn-primary { background:var(--color-primary); color:#fff; }
.btn-secondary { background:var(--color-bg-tertiary); color:var(--color-text); border:1px solid var(--color-border); }
.table-wrap { overflow-x:auto; }
.data-table { width:100%; min-width:900px; border-collapse:collapse; font-size:.9375rem; }
.data-table th,.data-table td { padding:12px 16px; border-bottom:1px solid var(--color-border); text-align:left; }
.data-table th { background:var(--color-bg-tertiary); color:var(--color-text-secondary); font-weight:600; }
.status { display:inline-block; padding:4px 10px; border-radius:999px; font-size:.75rem; font-weight:700; }
.status--enabled { background:#d1fae5; color:#065f46; }
.status--disabled { background:#fee2e2; color:#991b1b; }
.btn-link { border:none; background:none; color:var(--color-primary); cursor:pointer; margin-right:10px; }
.empty-text { padding:40px; text-align:center; color:var(--color-text-secondary); }
.pagination-wrap { margin-top:20px; padding-top:20px; border-top:1px solid var(--color-border); }
@media (max-width:768px) { .toolbar { flex-direction:column; align-items:stretch; } .input { width:100%; } }
</style>
