export type SiteTheme = 'dark' | 'morning-paper' | 'warm-slate'

export type ThemeOption = {
  value: SiteTheme
  label: string
  shortLabel: string
}

const siteThemes = ['dark', 'morning-paper', 'warm-slate'] as const

const themeOptions: readonly ThemeOption[] = [
  { value: 'dark', label: '深色', shortLabel: '深' },
  { value: 'morning-paper', label: '清晨纸质', shortLabel: '纸' },
  { value: 'warm-slate', label: '暖石板', shortLabel: '石' },
]

const normalizeTheme = (value: unknown): SiteTheme => {
  if (value === 'light') {
    return 'morning-paper'
  }

  return siteThemes.includes(value as SiteTheme) ? value as SiteTheme : 'dark'
}

export const useThemeStore = defineStore('theme', () => {
  let switchingTimer: ReturnType<typeof setTimeout> | undefined
  const storedTheme = useCookie<SiteTheme | 'light'>('terrapedia-theme', {
    default: () => 'dark',
    sameSite: 'lax',
  })

  const theme = computed<SiteTheme>(() => normalizeTheme(storedTheme.value))
  const isLightTheme = computed(() => theme.value !== 'dark')
  const activeThemeOption = computed(() => themeOptions.find((option) => option.value === theme.value) ?? themeOptions[0])
  const isSwitching = ref(false)

  const markThemeSwitching = () => {
    if (switchingTimer) {
      clearTimeout(switchingTimer)
    }

    isSwitching.value = true

    switchingTimer = setTimeout(() => {
      isSwitching.value = false
      switchingTimer = undefined
    }, 780)
  }

  const setTheme = (nextTheme: SiteTheme) => {
    const normalizedTheme = normalizeTheme(nextTheme)

    if (normalizedTheme === theme.value) {
      return
    }

    markThemeSwitching()
    storedTheme.value = normalizedTheme
  }

  const cycleTheme = () => {
    const currentIndex = siteThemes.indexOf(theme.value)
    const nextTheme = siteThemes[(currentIndex + 1) % siteThemes.length] ?? 'dark'

    setTheme(nextTheme)
  }

  useHead(() => ({
    htmlAttrs: {
      'data-theme': theme.value,
    },
  }))

  return {
    theme,
    isLightTheme,
    isSwitching,
    themeOptions,
    activeThemeOption,
    setTheme,
    cycleTheme,
  }
})
