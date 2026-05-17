export type SiteTheme = 'dark' | 'light'

export const useThemeStore = defineStore('theme', () => {
  const storedTheme = useCookie<SiteTheme>('terrapedia-theme', {
    default: () => 'dark',
    sameSite: 'lax',
  })

  const theme = computed<SiteTheme>(() => storedTheme.value === 'light' ? 'light' : 'dark')
  const isLight = computed(() => theme.value === 'light')

  const setTheme = (nextTheme: SiteTheme) => {
    storedTheme.value = nextTheme
  }

  const toggleTheme = () => {
    setTheme(isLight.value ? 'dark' : 'light')
  }

  useHead(() => ({
    htmlAttrs: {
      'data-theme': theme.value,
    },
  }))

  return {
    theme,
    isLight,
    setTheme,
    toggleTheme,
  }
})
