import { defineStore } from 'pinia'
import type { UserArticle, UserArticleUpsertPayload, UserProfile } from '~/types/public-api'
import {
  changeUserPassword,
  createUserArticle,
  deleteOwnAccount,
  fetchCurrentUser,
  fetchUserArticles,
  loginUser,
  logoutUser,
  registerUser,
  resetUserPassword,
  sendPasswordResetCode,
  sendRegisterCode,
  submitUserArticleReview,
  updateUserProfile,
} from '~/composables/useUserApi'

export const useUserAuthStore = defineStore('user-auth', () => {
  const user = ref<UserProfile | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const initialized = ref(false)
  const initPromise = ref<Promise<void> | null>(null)
  const articles = ref<UserArticle[]>([])
  const articlesLoading = ref(false)
  const articlePagination = ref({ total: 0, page: 1, limit: 10, totalPages: 1 })

  const isAuthenticated = computed(() => Boolean(user.value))
  const displayName = computed(() => user.value?.displayName || user.value?.email || '访客')

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
    try {
      const response = await loginUser({ email, password })
      user.value = response.user
      initialized.value = true
      return response.user
    } finally {
      submitting.value = false
    }
  }

  const requestRegisterCode = async (email: string) => {
    submitting.value = true
    try {
      return await sendRegisterCode(email)
    } finally {
      submitting.value = false
    }
  }

  const requestPasswordResetCode = async (email: string) => {
    submitting.value = true
    try {
      return await sendPasswordResetCode(email)
    } finally {
      submitting.value = false
    }
  }

  const register = async (payload: { email: string; password: string; verificationCode: string; displayName?: string }) => {
    submitting.value = true
    try {
      const response = await registerUser(payload)
      user.value = response.user
      initialized.value = true
      return response.user
    } finally {
      submitting.value = false
    }
  }

  const logout = async () => {
    try {
      await logoutUser()
    } finally {
      user.value = null
      initialized.value = true
      articles.value = []
    }
  }

  const updateProfile = async (displayName: string) => {
    submitting.value = true
    try {
      user.value = await updateUserProfile({ displayName })
      initialized.value = true
      return user.value
    } finally {
      submitting.value = false
    }
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    submitting.value = true
    try {
      await changeUserPassword({ currentPassword, newPassword })
    } finally {
      submitting.value = false
    }
  }

  const resetPassword = async (payload: { email: string; verificationCode: string; newPassword: string }) => {
    submitting.value = true
    try {
      await resetUserPassword(payload)
    } finally {
      submitting.value = false
    }
  }

  const deleteAccount = async (currentPassword: string) => {
    submitting.value = true
    try {
      await deleteOwnAccount({ currentPassword })
    } finally {
      user.value = null
      initialized.value = true
      submitting.value = false
    }
  }

  const loadUserArticles = async (page = 1, limit = 10, keyword = '') => {
    articlesLoading.value = true
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
    } finally {
      articlesLoading.value = false
    }
  }

  const saveUserArticle = async (payload: UserArticleUpsertPayload) => {
    submitting.value = true
    try {
      return await createUserArticle(payload)
    } finally {
      submitting.value = false
    }
  }

  const submitArticleReview = async (id: number) => {
    submitting.value = true
    try {
      return await submitUserArticleReview(id)
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
    isAuthenticated,
    displayName,
    init,
    login,
    requestRegisterCode,
    requestPasswordResetCode,
    register,
    logout,
    updateProfile,
    changePassword,
    resetPassword,
    deleteAccount,
    fetchUserArticles: loadUserArticles,
    createUserArticle: saveUserArticle,
    submitUserArticleReview: submitArticleReview,
  }
})
