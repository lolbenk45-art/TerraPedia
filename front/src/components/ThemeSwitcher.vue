<template>
  <div class="relative">
    <button
      @click="isOpen = !isOpen"
      class="theme-switcher__button"
      :title="currentThemeLabel"
    >
      <svg v-if="theme === 'light'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
      <svg v-else-if="theme === 'dark'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
      <svg v-else-if="theme === 'ocean'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <svg v-else-if="theme === 'forest'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
      <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform scale-95 opacity-0"
      enter-to-class="transform scale-100 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform scale-100 opacity-100"
      leave-to-class="transform scale-95 opacity-0"
    >
      <div
        v-if="isOpen"
        v-click-outside="() => isOpen = false"
        class="theme-switcher__menu panel-soft"
      >
        <div class="theme-switcher__label">主题</div>
        <button
          v-for="t in themes"
          :key="t.value"
          @click="setTheme(t.value)"
          class="theme-switcher__option"
          :class="{ 'theme-switcher__option--active': theme === t.value }"
        >
          <component :is="t.icon" class="w-4 h-4" />
          {{ t.label }}
          <svg v-if="theme === t.value" class="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useAppStore } from '@/stores'
import type { Theme } from '@/types'

const store = useAppStore()
const isOpen = ref(false)

const theme = computed(() => store.theme)

const themes = [
  {
    value: 'light' as Theme,
    label: '明亮',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' }),
    ]),
  },
  {
    value: 'dark' as Theme,
    label: '暗黑',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' }),
    ]),
  },
  {
    value: 'ocean' as Theme,
    label: '海洋',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M13 10V3L4 14h7v7l9-11h-7z' }),
    ]),
  },
  {
    value: 'forest' as Theme,
    label: '森林',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' }),
    ]),
  },
  {
    value: 'sunset' as Theme,
    label: '日落',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' }),
    ]),
  },
]

const currentThemeLabel = computed(() => {
  return themes.find(t => t.value === theme.value)?.label || '主题'
})

const setTheme = (newTheme: Theme) => {
  store.setTheme(newTheme)
  isOpen.value = false
}

type ClickOutsideElement = HTMLElement & {
  _clickOutside?: (event: Event) => void
}

const vClickOutside = {
  mounted(el: HTMLElement, binding: { value: () => void }) {
    const target = el as ClickOutsideElement
    target._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value()
      }
    }
    document.addEventListener('click', target._clickOutside, true)
  },
  unmounted(el: HTMLElement) {
    const target = el as ClickOutsideElement
    if (target._clickOutside) {
      document.removeEventListener('click', target._clickOutside, true)
    }
  },
}
</script>

<style scoped>
.theme-switcher__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 84%, white 16%);
  color: var(--text-primary);
  transition: background-color 180ms ease, border-color 180ms ease, transform 180ms ease;
}

.theme-switcher__button:hover {
  background: color-mix(in srgb, var(--bg-tertiary) 82%, white 18%);
  transform: translateY(-1px);
}

.theme-switcher__menu {
  position: absolute;
  right: 0;
  margin-top: 0.65rem;
  width: 12rem;
  padding: 0.35rem;
  border-radius: 1rem;
  z-index: 50;
}

.theme-switcher__label {
  padding: 0.55rem 0.75rem 0.35rem;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.theme-switcher__option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.72rem 0.75rem;
  border: none;
  border-radius: 0.85rem;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  transition: background-color 180ms ease, color 180ms ease;
}

.theme-switcher__option:hover {
  background: color-mix(in srgb, var(--bg-secondary) 82%, white 18%);
}

.theme-switcher__option--active {
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  color: var(--accent-primary);
}
</style>
