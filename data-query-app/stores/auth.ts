import { defineStore } from 'pinia'
import { get, post } from '~/composables/useApi'
import { showToast } from '~/composables/useToast'

export interface AuthUser {
  username: string
  displayName: string
  role: string
}

interface LoginPayload {
  username: string
  password: string
}

const TOKEN_COOKIE_KEY = 'tp_admin_token'
const USER_COOKIE_KEY = 'tp_admin_user'
const EXPIRES_AT_COOKIE_KEY = 'tp_admin_expires_at'

const normalizeUser = (raw: any): AuthUser => ({
  username: String(raw?.username ?? ''),
  displayName: String(raw?.displayName ?? raw?.username ?? '管理员'),
  role: String(raw?.role ?? 'ADMIN')
})

export const useAuthStore = defineStore('auth', () => {
  const tokenCookie = useCookie<string | null>(TOKEN_COOKIE_KEY, { sameSite: 'lax' })
  const userCookie = useCookie<AuthUser | null>(USER_COOKIE_KEY, { sameSite: 'lax' })
  const expiresAtCookie = useCookie<number | null>(EXPIRES_AT_COOKIE_KEY, { sameSite: 'lax' })
  const submitting = ref(false)

  const token = computed(() => tokenCookie.value || '')
  const user = computed<AuthUser | null>(() => userCookie.value ? normalizeUser(userCookie.value) : null)
  const expiresAt = computed(() => Number(expiresAtCookie.value ?? 0))
  const isAuthenticated = computed(() => Boolean(token.value) && expiresAt.value > Date.now())
  const displayName = computed(() => user.value?.displayName || '管理员')

  const setSession = (payload: { token: string; user: AuthUser; expiresAt: number }) => {
    tokenCookie.value = payload.token
    userCookie.value = payload.user
    expiresAtCookie.value = payload.expiresAt
  }

  const clearSession = () => {
    tokenCookie.value = null
    userCookie.value = null
    expiresAtCookie.value = null
  }

  const pruneExpiredSession = () => {
    if (token.value && expiresAt.value > 0 && expiresAt.value <= Date.now()) {
      clearSession()
    }
  }

  const login = async (payload: LoginPayload) => {
    submitting.value = true
    try {
      const response: any = await post('/auth/login', {
        username: payload.username.trim(),
        password: payload.password
      })

      const raw = response?.data ?? response
      if (!raw?.token || !raw?.user || !raw?.expiresAt) {
        throw new Error(response?.message || '登录失败')
      }

      setSession({
        token: String(raw.token),
        user: normalizeUser(raw.user),
        expiresAt: Number(raw.expiresAt)
      })

      showToast('登录成功', 'success')
      return true
    } catch (error: any) {
      showToast(error?.data?.message || error?.message || '登录失败', 'error')
      clearSession()
      return false
    } finally {
      submitting.value = false
    }
  }

  const fetchMe = async (silent = true) => {
    pruneExpiredSession()
    if (!token.value) return null

    try {
      const response: any = await get('/auth/me')
      const raw = response?.data ?? response
      const nextUser = normalizeUser(raw)
      userCookie.value = nextUser
      return nextUser
    } catch (error: any) {
      clearSession()
      if (!silent) {
        showToast(error?.data?.message || error?.message || '获取登录信息失败', 'error')
      }
      return null
    }
  }

  const logout = async (redirectTo?: string) => {
    clearSession()
    showToast('已退出登录', 'success')

    if (import.meta.client) {
      const target = redirectTo || '/login'
      await navigateTo(target)
    }
  }

  return {
    token,
    user,
    expiresAt,
    submitting,
    isAuthenticated,
    displayName,
    login,
    logout,
    fetchMe,
    clearSession,
    pruneExpiredSession
  }
})
