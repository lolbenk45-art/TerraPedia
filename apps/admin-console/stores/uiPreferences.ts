import { defineStore } from 'pinia'

export const useUiPreferencesStore = defineStore('uiPreferences', () => {
  const collapsedSectionLabels = ref<string[]>([])
  const desktopSidebarCollapsed = ref(false)

  const isSectionCollapsed = (label: string) => collapsedSectionLabels.value.includes(label)

  const initializeSections = (allLabels: string[], activeLabel: string | null) => {
    collapsedSectionLabels.value = allLabels.filter((label) => label !== activeLabel)
  }

  const toggleSection = (label: string) => {
    collapsedSectionLabels.value = isSectionCollapsed(label)
      ? collapsedSectionLabels.value.filter((entry) => entry !== label)
      : [...collapsedSectionLabels.value, label]
  }

  const setDesktopCollapsed = (value: boolean) => {
    desktopSidebarCollapsed.value = value
  }

  return {
    collapsedSectionLabels,
    desktopSidebarCollapsed,
    isSectionCollapsed,
    initializeSections,
    toggleSection,
    setDesktopCollapsed,
  }
}, {
  persist: {
    pick: ['desktopSidebarCollapsed'],
  },
})
