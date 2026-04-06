<template>
  <button
    type="button"
    class="theme-btn"
    :aria-label="buttonLabel"
    :title="buttonLabel"
    @click="toggleTheme"
  >
    <Transition name="dropdown-fade" mode="out-in">
      <SunMedium v-if="isDark" key="light" class="theme-btn__icon" :size="18" />
      <MoonStar v-else key="dark" class="theme-btn__icon" :size="18" />
    </Transition>
  </button>
</template>

<script setup lang="ts">
import { MoonStar, SunMedium } from 'lucide-vue-next'

const STORAGE_KEY = 'terrapedia-admin-theme'

const isDark = ref(false)
let mediaQuery: MediaQueryList | null = null

const buttonLabel = computed(() => (isDark.value ? '切换到浅色模式' : '切换到深色模式'))

function applyTheme(nextIsDark: boolean, persist = true) {
  isDark.value = nextIsDark

  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', nextIsDark)
  }

  if (persist && typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, nextIsDark ? 'dark' : 'light')
  }
}

function handleMediaChange(event: MediaQueryListEvent) {
  if (typeof window !== 'undefined' && !window.localStorage.getItem(STORAGE_KEY)) {
    applyTheme(event.matches, false)
  }
}

function toggleTheme() {
  applyTheme(!isDark.value)
}

onMounted(() => {
  if (typeof window === 'undefined') return

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const storedTheme = window.localStorage.getItem(STORAGE_KEY)

  if (storedTheme === 'dark' || storedTheme === 'light') {
    applyTheme(storedTheme === 'dark', false)
  } else {
    applyTheme(mediaQuery.matches, false)
  }

  mediaQuery.addEventListener('change', handleMediaChange)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', handleMediaChange)
})
</script>

<style scoped>
.theme-btn {
  width: 44px;
  height: 44px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 92%, transparent), var(--color-bg-tertiary));
  color: var(--color-text);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard),
    color var(--transition-fast) var(--ease-standard);
}

.theme-btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 26%, var(--color-border));
  color: var(--color-primary);
  box-shadow: var(--shadow-md);
}

.theme-btn__icon {
  pointer-events: none;
}
</style>
