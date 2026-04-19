<template>
  <div class="theme-switcher">
    <button
      class="theme-switcher__button"
      :title="currentThemeLabel"
      :aria-expanded="isOpen"
      aria-haspopup="menu"
      aria-label="Theme switcher"
      @click="isOpen = !isOpen"
    >
      <svg v-if="theme === 'light'" class="theme-switcher__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
      <svg v-else-if="theme === 'dark'" class="theme-switcher__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
      <svg v-else-if="theme === 'ocean'" class="theme-switcher__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <svg v-else-if="theme === 'forest'" class="theme-switcher__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
      <svg v-else class="theme-switcher__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        v-click-outside="() => (isOpen = false)"
        class="theme-switcher__menu panel-soft"
        role="menu"
      >
        <div class="theme-switcher__label">Atlas Palette</div>
        <button
          v-for="t in themes"
          :key="t.value"
          class="theme-switcher__option"
          :class="{ 'theme-switcher__option--active': theme === t.value }"
          role="menuitemradio"
          :aria-checked="theme === t.value"
          @click="setTheme(t.value)"
        >
          <span class="theme-switcher__swatch" :class="`theme-switcher__swatch--${t.value}`" aria-hidden="true" />
          <component :is="t.icon" class="theme-switcher__option-icon" />
          {{ t.label }}
          <svg v-if="theme === t.value" class="theme-switcher__check" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    label: 'Light',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' }),
    ]),
  },
  {
    value: 'dark' as Theme,
    label: 'Dark',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' }),
    ]),
  },
  {
    value: 'ocean' as Theme,
    label: 'Ocean',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M13 10V3L4 14h7v7l9-11h-7z' }),
    ]),
  },
  {
    value: 'forest' as Theme,
    label: 'Forest',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' }),
    ]),
  },
  {
    value: 'sunset' as Theme,
    label: 'Sunset',
    icon: () => h('svg', { class: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
      h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' }),
    ]),
  },
]

const currentThemeLabel = computed(() => {
  return themes.find((t) => t.value === theme.value)?.label || 'Theme'
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
.theme-switcher {
  position: relative;
}

.theme-switcher__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 52%, transparent);
  border-radius: 999px;
  background:
    radial-gradient(circle at 22% 18%, rgb(255 255 255 / 0.36), transparent 52%),
    color-mix(in srgb, var(--bg-secondary) 88%, white 12%);
  color: var(--text-primary);
  box-shadow: 0 6px 14px color-mix(in srgb, var(--accent-primary) 8%, transparent);
  transition: background-color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.theme-switcher__button:hover {
  background: color-mix(in srgb, var(--bg-tertiary) 82%, white 18%);
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent-primary) 26%, transparent);
  box-shadow: 0 10px 18px color-mix(in srgb, var(--accent-primary) 12%, transparent);
}

.theme-switcher__icon {
  width: 1.2rem;
  height: 1.2rem;
}

.theme-switcher__menu {
  position: absolute;
  right: 0;
  margin-top: 0.65rem;
  width: 13.25rem;
  padding: 0.45rem;
  border-radius: 1.15rem;
  border: 1px solid color-mix(in srgb, var(--border-strong) 46%, transparent);
  z-index: 50;
}

.theme-switcher__label {
  padding: 0.55rem 0.75rem 0.5rem;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.theme-switcher__option {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.7rem 0.75rem;
  border: none;
  border-radius: 0.85rem;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  transition: background-color 180ms ease, color 180ms ease, transform 180ms ease;
}

.theme-switcher__option:hover {
  background: color-mix(in srgb, var(--bg-secondary) 82%, white 18%);
  transform: translateX(1px);
}

.theme-switcher__option--active {
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  color: color-mix(in srgb, var(--accent-primary) 86%, #2b432f);
}

.theme-switcher__option-icon {
  width: 1rem;
  height: 1rem;
}

.theme-switcher__check {
  width: 1rem;
  height: 1rem;
  margin-left: auto;
}

.theme-switcher__swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 0.42);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
}

.theme-switcher__swatch--light {
  background: linear-gradient(135deg, #f4f1e6, #8fae72);
}

.theme-switcher__swatch--dark {
  background: linear-gradient(135deg, #111712, #9ac26b);
}

.theme-switcher__swatch--ocean {
  background: linear-gradient(135deg, #e0f2fe, #0284c7);
}

.theme-switcher__swatch--forest {
  background: linear-gradient(135deg, #dcfce7, #16a34a);
}

.theme-switcher__swatch--sunset {
  background: linear-gradient(135deg, #ffedd5, #ea580c);
}
</style>
