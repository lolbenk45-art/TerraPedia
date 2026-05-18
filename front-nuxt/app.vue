<script setup lang="ts">
const themeStore = useThemeStore()

watch(
  () => themeStore.isSwitching,
  (isSwitching) => {
    const root = document.documentElement
    if (!isSwitching) {
      root.classList.remove('theme-switching')
      return
    }

    root.classList.remove('theme-switching')
    void root.offsetWidth
    root.classList.add('theme-switching')
  },
  { flush: 'post' },
)
</script>

<template>
  <NuxtPage />
</template>
