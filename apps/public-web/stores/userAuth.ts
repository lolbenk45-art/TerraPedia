import { defineStore } from 'pinia'
import type { UserArticle, UserArticleUpsertPayload, UserProfile } from '~/types/public-api'
import { validateEmail, validatePassword, validateVerificationCode } from '~/lib/userAuthValidation.mjs'
import {
  changeUserPassword,
  createUserArticle,
  deleteUserArticle as deleteUserArticleRequest,
  deleteUserAvatar,
  extractUserApiError,
  fetchUserArticle as fetchUserArticleRequest,
  fetchCurrentUser,
  fetchUserArticles,
  loginUser,
  logoutUser,
  offlineUserArticle as offlineUserArticleRequest,
  refreshUserSession,
  registerUser,
  resetUserPassword,
  sendRegisterCode,
  sendPasswordResetCode,
  submitUserArticleForReview as submitUserArticleForReviewRequest,
  uploadUserArticleImage as uploadUserArticleImageRequest,
  uploadUserAvatar,
  updateUserArticle as updateUserArticleRequest,
  updateUserProfile,
  withdrawUserArticle as withdrawUserArticleRequest,
} from '~/composables/useUserApi'

const requireEmail = (email: string) => {
  const result = validateEmail(email)
  if (!result.ok) {
    throw new Error('请输入有效邮箱。')
  }
  return result.value
}

const requirePassword = (password: string) => {
  const result = validatePassword(password)
  if (!result.ok) {
    throw new Error('密码需为 10-64 位，并同时包含字母和数字。')
  }
  return result.value
}

const requireVerificationCode = (code: string) => {
  const result = validateVerificationCode(code)
  if (!result.ok) {
    throw new Error('验证码需为 4-8 位数字。')
  }
  return result.value
}

const trimOptional = (value: string, max: number, label: string) => {
  const normalized = value.trim()
  if (normalized.length > max) {
    throw new Error(`${label}不能超过 ${max} 个字符。`)
  }
  return normalized || null
}

const normalizeArticleUpsertPayload = (payload: UserArticleUpsertPayload) => {
  const title = payload.title.trim()
  const contentHtml = payload.contentHtml.trim()
  const slug = payload.slug?.trim() || null
  const summary = payload.summary?.trim() || null
  const coverImage = payload.coverImage?.trim() || null
  if (!title) throw new Error('请输入文章标题。')
  if (title.length > 255) throw new Error('标题不能超过 255 个字符。')
  if (!contentHtml) throw new Error('请输入文章正文。')
  if (slug && slug.length > 255) throw new Error('Slug 不能超过 255 个字符。')
  if (summary && summary.length > 600) throw new Error('摘要不能超过 600 个字符。')
  if (coverImage && coverImage.length > 500) throw new Error('封面地址不能超过 500 个字符。')

  return {
    title,
    slug,
    summary,
    coverImage,
    contentHtml,
  }
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

  const upsertArticleInList = (article: UserArticle) => {
    const index = articles.value.findIndex((item) => item.id === article.id)
    if (index >= 0) {
      articles.value.splice(index, 1, article)
    } else {
      articles.value.unshift(article)
    }
  }

  const removeArticleFromList = (id: number | string) => {
    const numericId = Number(id)
    articles.value = articles.value.filter((article) => article.id !== numericId)
  }

  const clearAuthenticatedState = () => {
    const favoritesStore = useUserFavoritesStore()
    const historyStore = useUserHistoryStore()
    const savedRoutesStore = useUserSavedRoutesStore()
    const notificationsStore = useUserNotificationsStore()
    const preferencesStore = useUserPreferencesStore()
    favoritesStore.clearUserFavoriteState()
    historyStore.clearUserHistoryState()
    savedRoutesStore.clearUserSavedRoutesState()
    notificationsStore.clearUserNotificationsState()
    preferencesStore.clearUserPreferencesState()
    user.value = null
    articles.value = []
    initialized.value = true
  }

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
        try {
          const response = await refreshUserSession()
          user.value = response.user
        } catch {
          user.value = null
        }
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
      clearAuthenticatedState()
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
      clearAuthenticatedState()
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
    const normalized = normalizeArticleUpsertPayload(payload)

    submitting.value = true
    lastError.value = ''
    try {
      const article = await createUserArticle(normalized)
      upsertArticleInList(article)
      return article
    } catch (error) {
      throw new Error(setError(error, '草稿保存失败。'))
    } finally {
      submitting.value = false
    }
  }

  const loadUserArticle = async (id: number | string) => {
    articlesLoading.value = true
    lastError.value = ''
    try {
      const article = await fetchUserArticleRequest(id)
      upsertArticleInList(article)
      return article
    } catch (error) {
      throw new Error(setError(error, '文章加载失败。'))
    } finally {
      articlesLoading.value = false
    }
  }

  const updateExistingUserArticle = async (id: number | string, payload: UserArticleUpsertPayload) => {
    const normalized = normalizeArticleUpsertPayload(payload)

    submitting.value = true
    lastError.value = ''
    try {
      const article = await updateUserArticleRequest(id, normalized)
      upsertArticleInList(article)
      return article
    } catch (error) {
      throw new Error(setError(error, '草稿保存失败。'))
    } finally {
      submitting.value = false
    }
  }

  const submitExistingUserArticleForReview = async (id: number | string) => {
    submitting.value = true
    lastError.value = ''
    try {
      const article = await submitUserArticleForReviewRequest(id)
      upsertArticleInList(article)
      return article
    } catch (error) {
      throw new Error(setError(error, '提交审核失败。'))
    } finally {
      submitting.value = false
    }
  }

  const withdrawExistingUserArticle = async (id: number | string) => {
    submitting.value = true
    lastError.value = ''
    try {
      const article = await withdrawUserArticleRequest(id)
      upsertArticleInList(article)
      return article
    } catch (error) {
      throw new Error(setError(error, '撤回投稿失败。'))
    } finally {
      submitting.value = false
    }
  }

  const offlineExistingUserArticle = async (id: number | string) => {
    submitting.value = true
    lastError.value = ''
    try {
      const article = await offlineUserArticleRequest(id)
      upsertArticleInList(article)
      return article
    } catch (error) {
      throw new Error(setError(error, '下架文章失败。'))
    } finally {
      submitting.value = false
    }
  }

  const deleteExistingUserArticle = async (id: number | string) => {
    submitting.value = true
    lastError.value = ''
    try {
      const article = await deleteUserArticleRequest(id)
      removeArticleFromList(id)
      return article
    } catch (error) {
      throw new Error(setError(error, '删除草稿失败。'))
    } finally {
      submitting.value = false
    }
  }

  const uploadArticleImage = async (file: File) => {
    if (!file || file.size <= 0) {
      throw new Error('请选择文章图片。')
    }
    lastError.value = ''
    try {
      return await uploadUserArticleImageRequest(file)
    } catch (error) {
      throw new Error(setError(error, '文章图片上传失败。'))
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
    fetchUserArticle: loadUserArticle,
    updateUserArticle: updateExistingUserArticle,
    submitUserArticleForReview: submitExistingUserArticleForReview,
    withdrawUserArticle: withdrawExistingUserArticle,
    offlineUserArticle: offlineExistingUserArticle,
    deleteUserArticle: deleteExistingUserArticle,
    uploadUserArticleImage: uploadArticleImage,
  }
})
