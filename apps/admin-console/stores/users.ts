import { defineStore } from 'pinia'
import { get, patch, post } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export interface AdminUser {
  id: number
  email: string
  displayName: string
  status: number
  lastLoginAt?: string
  createdAt?: string
}

export interface AdminUserCreatePayload {
  email: string
  password: string
  displayName?: string
  status?: 0 | 1
}

type PaginationState = {
  total: number
  page: number
  size: number
  totalPages: number
}

const defaultPagination = (): PaginationState => ({
  total: 0,
  page: 1,
  size: 20,
  totalPages: 1,
})

const normalizeUsers = (raw: any): AdminUser[] => {
  const list = raw?.data ?? raw?.list ?? raw ?? []
  if (!Array.isArray(list)) return []
  return list.map((item: any) => ({
    id: Number(item?.id ?? 0),
    email: String(item?.email ?? ''),
    displayName: String(item?.displayName ?? item?.email ?? ''),
    status: Number(item?.status ?? 0),
    lastLoginAt: item?.lastLoginAt ?? undefined,
    createdAt: item?.createdAt ?? undefined,
  })).filter(item => item.id > 0)
}

const normalizeSingleUser = (raw: any): AdminUser | null => {
  const list = normalizeUsers({ data: [raw] })
  return list[0] ?? null
}

export const useUsersStore = defineStore('users', () => {
  const users = ref<AdminUser[]>([])
  const loading = ref(false)
  const pagination = ref<PaginationState>(defaultPagination())
  const keyword = ref('')
  const status = ref<number | null>(null)

  const fetchUsers = async (page = pagination.value.page, size = pagination.value.size) => {
    loading.value = true
    try {
      const response: any = await get('/admin/users', {
        page,
        limit: size,
        email: keyword.value || undefined,
        status: status.value ?? undefined,
      })
      users.value = normalizeUsers(response)
      const rawPagination = response?.pagination
      const total = Number(rawPagination?.total ?? users.value.length)
      const current = Number(rawPagination?.page ?? page)
      const limit = Number(rawPagination?.limit ?? size)
      pagination.value = {
        total,
        page: current,
        size: limit,
        totalPages: Math.max(1, Math.ceil(total / Math.max(limit, 1))),
      }
    } catch (error: any) {
      users.value = []
      pagination.value = defaultPagination()
      showToast(error?.data?.message || error?.message || '用户加载失败', 'error')
    } finally {
      loading.value = false
    }
  }

  const updateStatus = async (id: number, nextStatus: 0 | 1) => {
    await patch(`/admin/users/${id}/status`, { status: nextStatus })
    const target = users.value.find(user => user.id === id)
    if (target) target.status = nextStatus
    showToast('用户状态已更新', 'success')
  }

  const resetPassword = async (id: number, newPassword: string) => {
    const response: any = await post(`/admin/users/${id}/reset-password`, { newPassword })
    const data = response?.data ?? response
    showToast('密码已重置', 'success')
    return {
      userId: Number(data?.userId ?? id),
      email: String(data?.email ?? ''),
    }
  }

  const createUser = async (payload: AdminUserCreatePayload) => {
    const response: any = await post('/admin/users', {
      email: payload.email.trim(),
      password: payload.password,
      displayName: payload.displayName?.trim() || undefined,
      status: payload.status ?? 1,
    })
    const created = normalizeSingleUser(response?.data ?? response)
    if (!created) {
      throw new Error('创建用户失败')
    }
    showToast('用户已创建', 'success')
    return created
  }

  return {
    users,
    loading,
    pagination,
    keyword,
    status,
    fetchUsers,
    createUser,
    updateStatus,
    resetPassword,
  }
})
