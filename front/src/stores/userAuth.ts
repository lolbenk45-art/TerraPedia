import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { UserProfile } from '@/types'
import {
  changeUserPassword,
  deleteOwnAccount,
  fetchCurrentUser,
  loginUser,
  logoutUser,
  resetUserPassword,
  registerUser,
  sendPasswordResetCode,
  sendRegisterCode,
  updateUserProfile,
} from '@/api/userAuth'

export const useUserAuthStore = defineStore('user-auth', () => {
  const user = ref<UserProfile | null>(null)
  const loading = ref(false)
  const submitting = ref(false)
  const initialized = ref(false)
  const initPromise = ref<Promise<void> | null>(null)

  const isAuthenticated = computed(() => Boolean(user.value))
  const displayName = computed(() => user.value?.displayName || user.value?.email || 'Guest')

  const init = async () => {
    if (initialized.value) return
    if (initPromise.value) {
      await initPromise.value
      return
    }

    initPromise.value = (async () => {
      loading.value = true
      try {
        user.value = await fetchCurrentUser()
      } catch (error) {
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
    return sendRegisterCode(email)
  }

  const requestPasswordResetCode = async (email: string) => {
    return sendPasswordResetCode(email)
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
    }
  }

  const updateProfile = async (displayName: string) => {
    submitting.value = true
    try {
      const profile = await updateUserProfile({ displayName })
      user.value = profile
      initialized.value = true
      return profile
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

  return {
    user,
    loading,
    submitting,
    initialized,
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
  }
})
