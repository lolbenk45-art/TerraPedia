<template>
  <div class="page-wrap users-page">
    <div class="page-head">
      <div>
        <h1 class="page-head__title">用户管理</h1>
        <p class="page-head__subtitle">查看用户、启用或停用账号、重置密码并创建新用户。</p>
      </div>
    </div>

    <section class="section-card">
      <form class="toolbar" @submit.prevent="handleSearch">
        <input v-model.trim="keyword" class="input" type="text" placeholder="按邮箱搜索" />
        <select v-model="statusFilter" class="input">
          <option value="">全部状态</option>
          <option value="1">已启用</option>
          <option value="0">已停用</option>
        </select>
        <button type="submit" class="btn btn-secondary">搜索</button>
        <button type="button" class="btn btn-secondary" @click="handleReset">重置</button>
        <button type="button" class="btn btn-primary" @click="openCreateDialog">新增用户</button>
      </form>
    </section>

    <section class="section-card">
      <div v-if="loading" class="empty-text">加载中...</div>
      <template v-else>
        <div v-if="users.length" class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>邮箱</th>
                <th>显示名</th>
                <th>状态</th>
                <th>上次登录</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in users" :key="row.id">
                <td>#{{ row.id }}</td>
                <td>{{ row.email }}</td>
                <td>{{ row.displayName || '--' }}</td>
                <td>
                  <span class="status" :class="row.status === 1 ? 'status--enabled' : 'status--disabled'">
                    {{ row.status === 1 ? '已启用' : '已停用' }}
                  </span>
                </td>
                <td>{{ formatDateTime(row.lastLoginAt) }}</td>
                <td>{{ formatDateTime(row.createdAt) }}</td>
                <td>
                  <div class="row-actions">
                    <button type="button" class="btn-link" @click="toggleStatus(row)">
                      {{ row.status === 1 ? '停用' : '启用' }}
                    </button>
                    <button type="button" class="btn-link" @click="handleResetPassword(row)">重置密码</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-text">暂无用户</p>
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

    <AppModal v-model="createDialogVisible" title="新增用户" width="420px">
      <form class="form-stack" @submit.prevent="handleCreateUser">
        <input v-model.trim="createForm.email" class="input" type="email" placeholder="邮箱" autocomplete="off" />
        <input v-model.trim="createForm.displayName" class="input" type="text" placeholder="显示名（可选）" autocomplete="off" />
        <input
          v-model="createForm.password"
          class="input"
          type="password"
          placeholder="密码（10-64 位，需包含字母和数字）"
          autocomplete="new-password"
        />
        <select v-model.number="createForm.status" class="input">
          <option :value="1">已启用</option>
          <option :value="0">已停用</option>
        </select>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="createDialogVisible = false">取消</button>
        <button type="button" class="btn btn-primary" :disabled="creatingUser" @click="handleCreateUser">
          {{ creatingUser ? '创建中...' : '创建' }}
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
  const nextPassword = window.prompt(`请输入 ${row.email} 的新密码（10-64 位，需包含字母和数字）`)
  if (!nextPassword) return
  await usersStore.resetPassword(row.id, nextPassword)
}

const handleCreateUser = async () => {
  if (!createForm.email) {
    showToast('请输入邮箱', 'warning')
    return
  }
  if (!createForm.password) {
    showToast('请输入密码', 'warning')
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
    showToast(error?.data?.message || error?.message || '创建用户失败', 'error')
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
.toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(180px, 240px) repeat(3, max-content);
  gap: 14px 12px;
  align-items: center;
}
.form-stack { display:flex; flex-direction:column; gap:12px; }
.toolbar .input { min-width:0; }
.toolbar .btn { min-width:96px; }
.table-wrap { overflow-x:auto; border-radius:calc(var(--radius-lg) - 2px); border:1px solid var(--color-border); }
.data-table { width:100%; min-width:900px; border-collapse:collapse; background:color-mix(in srgb, var(--color-bg-secondary) 94%, transparent); font-size:.9375rem; }
.data-table th,.data-table td { padding:14px 16px; border-bottom:1px solid color-mix(in srgb, var(--color-border) 88%, transparent); text-align:left; vertical-align:top; }
.data-table th { background:color-mix(in srgb, var(--color-bg-tertiary) 94%, transparent); color:var(--color-text-secondary); font-weight:700; white-space:nowrap; }
.data-table tbody tr:hover { background:color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-secondary)); }
.data-table td:last-child { min-width:210px; }
.status { display:inline-flex; align-items:center; justify-content:center; min-height:28px; padding:4px 10px; border-radius:999px; font-size:.75rem; font-weight:700; line-height:1.2; }
.status--enabled { background:#d1fae5; color:#065f46; }
.status--disabled { background:#fee2e2; color:#991b1b; }
.row-actions { display:flex; gap:8px 10px; flex-wrap:nowrap; align-items:flex-start; }
.empty-text { padding:40px; text-align:center; color:var(--color-text-secondary); }
.pagination-wrap { margin-top:20px; padding-top:20px; border-top:1px solid var(--color-border); }
@media (max-width:1120px) {
  .toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar .btn { width:100%; }
}
@media (max-width:768px) {
  .toolbar { grid-template-columns:1fr; align-items:stretch; }
  .input { width:100%; }
}
</style>
