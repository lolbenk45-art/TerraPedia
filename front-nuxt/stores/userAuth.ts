import { defineStore } from 'pinia'
import type { UserArticle, UserArticleUpsertPayload, UserProfile } from '~/types/public-api'
import {
  changeUserPassword,
  createUserArticle,
  deleteUserAvatar,
  extractUserApiError,
  fetchCurrentUser,
  fetchUserArticles,
  loginUser,
  logoutUser,
  registerUser,
  resetUserPassword,
  sendRegisterCode,
  sendPasswordResetCode,
  uploadUserAvatar,
  updateUserProfile,
} from '~/composables/useUserApi'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{10,64}$/
const verificationCodePattern = /^\d{4,8}$/

const requireEmail = (email: string) => {
  const value = email.trim()
  if (!emailPattern.test(value)) {
    throw new Error('请输入有效邮箱。')
  }
  return value
}

const requirePassword = (password: string) => {
  if (!passwordPattern.test(password)) {
    throw new Error('密码需为 10-64 位，并同时包含字母和数字。')
  }
  return password
}

const requireVerificationCode = (code: string) => {
  const value = code.trim()
  if (!verificationCodePattern.test(value)) {
    throw new Error('验证码需为 4-8 位数字。')
  }
  return value
}

const trimOptional = (value: string, max: number, label: string) => {
  const normalized = value.trim()
  if (normalized.length > max) {
    throw new Error(`${label}不能超过 ${max} 个字符。`)
  }
  return normalized || null
}

export const useUserAuthStore = defineStore('user-auth', () => {
  const user = ref<UserProfile | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const initialized = ref(false)
  const initPromise = ref<Promise<void> | null>(null)
  const articles = ref<UserArticle[]>([])
  const articlesLoading = ref(false)
  const articlePagination = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })
  const lastError = ref('')

  const isAuthenticated = computed(() => Boolean(user.value))
  const displayName = computed(() => user.value?.displayName || user.value?.email || '访客用户')

  const setError = (error: unknown, fallback?: string) => {
    lastError.value = extractUserApiError(error, fallback)
    return lastError.value
  }

  const init = async () => {
    if (initialized.value) return
    if (initPromise.value) return await initPromise.value
    initPromise.value = (async () => {
      loading.value = true
      try {
        user.value = await fetchCurrentUser()
      } catch {
        user.value = null
      } finally {
        loading.value = false
        initialized.value = true
        initPromise.value = null
      }
    })()
    await initPromise.value
  }

  const login = async (email: string, password: string) => {
    submitting.value = true
    lastError.value = ''
    try {
      const response = await loginUser({ email: requireEmail(email), password })
      user.value = response.user
      initialized.value = true
      return response.user
    } catch (error) {
      throw new Error(setError(error, '登录失败，请检查邮箱和密码。'))
    } finally {
      submitting.value = false
    }
  }

  const requestRegisterCode = async (email: string) => {
    submitting.value = true
    lastError.value = ''
    try {
      return await sendRegisterCode(requireEmail(email))
    } catch (error) {
      throw new Error(setError(error, '验证码发送失败，请稍后重试。'))
    } finally {
      submitting.value = false
    }
  }

  const requestPasswordResetCode = async (email: string) => {
    submitting.value = true
    lastError.value = ''
    try {
      return await sendPasswordResetCode(requireEmail(email))
    } catch (error) {
      throw new Error(setError(error, '重置验证码发送失败，请稍后重试。'))
    } finally {
      submitting.value = false
    }
  }

  const register = async (payload: { email: string, password: string, verificationCode: string, displayName?: string | null }) => {
    submitting.value = true
    lastError.value = ''
    try {
      const displayNameValue = payload.displayName ? trimOptional(payload.displayName, 120, '昵称') : null
      const response = await registerUser({
        email: requireEmail(payload.email),
        password: requirePassword(payload.password),
        verificationCode: requireVerificationCode(payload.verificationCode),
        displayName: displayNameValue,
      })
      user.value = response.user
      initialized.value = true
      return response.user
    } catch (error) {
      throw new Error(setError(error, '注册失败，请检查表单信息。'))
    } finally {
      submitting.value = false
    }
  }

  const logout = async () => {
    submitting.value = true
    try {
      await logoutUser()
    } catch {
      // Local state is cleared even if the backend session already expired.
    } finally {
      user.value = null
      articles.value = []
      initialized.value = true
      submitting.value = false
    }
  }

  const updateProfile = async (displayNameValue: string) => {
    const normalized = displayNameValue.trim()
    if (normalized.length < 2 || normalized.length > 120) {
      throw new Error('昵称需为 2-120 个字符。')
    }
    submitting.value = true
    lastError.value = ''
    try {
      user.value = await updateUserProfile({ displayName: normalized })
      initialized.value = true
      return user.value
    } catch (error) {
      throw new Error(setError(error, '资料保存失败。'))
    } finally {
      submitting.value = false
    }
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!currentPassword) {
      throw new Error('请输入当前密码。')
    }
    submitting.value = true
    lastError.value = ''
    try {
      await changeUserPassword({ currentPassword, newPassword: requirePassword(newPassword) })
    } catch (error) {
      throw new Error(setError(error, '密码修改失败。'))
    } finally {
      submitting.value = false
    }
  }

  const uploadAvatar = async (file: File) => {
    if (!file || file.size <= 0) {
      throw new Error('请选择头像图片。')
    }
    submitting.value = true
    lastError.value = ''
    try {
      user.value = await uploadUserAvatar(file)
      initialized.value = true
      return user.value
    } catch (error) {
      throw new Error(setError(error, '头像上传失败。'))
    } finally {
      submitting.value = false
    }
  }

  const deleteAvatar = async () => {
    submitting.value = true
    lastError.value = ''
    try {
      user.value = await deleteUserAvatar()
      initialized.value = true
      return user.value
    } catch (error) {
      throw new Error(setError(error, '头像移除失败。'))
    } finally {
      submitting.value = false
    }
  }

  const resetPassword = async (payload: { email: string, verificationCode: string, newPassword: string }) => {
    submitting.value = true
    lastError.value = ''
    try {
      await resetUserPassword({
        email: requireEmail(payload.email),
        verificationCode: requireVerificationCode(payload.verificationCode),
        newPassword: requirePassword(payload.newPassword),
      })
    } catch (error) {
      throw new Error(setError(error, '密码重置失败，请检查验证码和新密码。'))
    } finally {
      submitting.value = false
    }
  }

  const loadUserArticles = async (page = 1, limit = 10, keyword = '') => {
    articlesLoading.value = true
    lastError.value = ''
    try {
      const response = await fetchUserArticles(page, limit, keyword)
      articles.value = response.items
      articlePagination.value = {
        total: Number(response.pagination.total ?? 0),
        page: Number(response.pagination.page ?? page),
        limit: Number(response.pagination.limit ?? response.pagination.size ?? limit),
        totalPages: Number(response.pagination.totalPages ?? 1),
      }
      return response
    } catch (error) {
      throw new Error(setError(error, '文章列表加载失败。'))
    } finally {
      articlesLoading.value = false
    }
  }

  const saveUserArticle = async (payload: UserArticleUpsertPayload) => {
    const title = payload.title.trim()
    const contentHtml = payload.contentHtml.trim()
    if (!title) throw new Error('请输入文章标题。')
    if (title.length > 255) throw new Error('标题不能超过 255 个字符。')
    if (!contentHtml) throw new Error('请输入文章正文。')
    if (payload.slug && payload.slug.length > 255) throw new Error('Slug 不能超过 255 个字符。')
    if (payload.summary && payload.summary.length > 600) throw new Error('摘要不能超过 600 个字符。')
    if (payload.coverImage && payload.coverImage.length > 500) throw new Error('封面地址不能超过 500 个字符。')

    submitting.value = true
    lastError.value = ''
    try {
      return await createUserArticle({ ...payload, title, contentHtml })
    } catch (error) {
      throw new Error(setError(error, '草稿保存失败。'))
    } finally {
      submitting.value = false
    }
  }

  return {
    user,
    loading,
    submitting,
    initialized,
    articles,
    articlesLoading,
    articlePagination,
    lastError,
    isAuthenticated,
    displayName,
    init,
    login,
    requestRegisterCode,
    requestPasswordResetCode,
    register,
    logout,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    changePassword,
    resetPassword,
    fetchUserArticles: loadUserArticles,
    createUserArticle: saveUserArticle,
  }
})
