import { defineStore } from 'pinia'
import type { UserPreferences, UserPreferencesPayload } from '~/types/public-api'
import {
  extractUserApiError,
  fetchUserPreferences,
  updateUserPreferences,
} from '~/composables/useUserApi'

const defaultPreferences: UserPreferences = {
  themePreference: 'dark',
  detailDensity: 'readable',
  defaultFavoritesFilter: 'all',
}

export const useUserPreferencesStore = defineStore('user-preferences', () => {
  const preferences = ref<UserPreferences>({ ...defaultPreferences })
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref('')

  const setError = (exception: unknown, fallback: string) => {
    error.value = extractUserApiError(exception, fallback)
    return error.value
  }

  const applyPreferences = (nextPreferences: UserPreferences) => {
    preferences.value = nextPreferences
    const themeStore = useThemeStore()
    themeStore.setTheme(nextPreferences.themePreference)
  }

  const clearUserPreferencesState = () => {
    preferences.value = { ...defaultPreferences }
    loading.value = false
    mutating.value = false
    error.value = ''
  }

  const load = async () => {
    loading.value = true
    error.value = ''
    try {
      const response = await fetchUserPreferences()
      applyPreferences(response)
      return response
    } catch (exception) {
      throw new Error(setError(exception, '显示偏好加载失败。'))
    } finally {
      loading.value = false
    }
  }

  const save = async (payload: UserPreferencesPayload) => {
    mutating.value = true
    error.value = ''
    try {
      const response = await updateUserPreferences(payload)
      applyPreferences(response)
      return response
    } catch (exception) {
      throw new Error(setError(exception, '显示偏好保存失败。'))
    } finally {
      mutating.value = false
    }
  }

  return {
    preferences,
    loading,
    mutating,
    error,
    clearUserPreferencesState,
    load,
    save,
  }
})
