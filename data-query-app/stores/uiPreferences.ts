import { defineStore } from 'pinia'

export const useUiPreferencesStore = defineStore('uiPreferences', () => {
  const collapsedSectionLabels = ref<string[]>([])
  const desktopSidebarCollapsed = ref(false)
  const sectionDefaultsApplied = ref(false)

  const isSectionCollapsed = (label: string) => collapsedSectionLabels.value.includes(label)

  const toggleSection = (label: string) => {
    collapsedSectionLabels.value = isSectionCollapsed(label)
      ? collapsedSectionLabels.value.filter((entry) => entry !== label)
      : [...collapsedSectionLabels.value, label]
  }

  const expandSection = (label: string) => {
    if (!isSectionCollapsed(label)) return
    collapsedSectionLabels.value = collapsedSectionLabels.value.filter((entry) => entry !== label)
  }

  const applySectionDefaults = (defaultLabels: string[]) => {
    if (sectionDefaultsApplied.value) return
    collapsedSectionLabels.value = [...defaultLabels]
    sectionDefaultsApplied.value = true
  }

  const setDesktopCollapsed = (value: boolean) => {
    desktopSidebarCollapsed.value = value
  }

  return {
    collapsedSectionLabels,
    desktopSidebarCollapsed,
    sectionDefaultsApplied,
    isSectionCollapsed,
    toggleSection,
    expandSection,
    applySectionDefaults,
    setDesktopCollapsed,
  }
}, {
  persist: {
    paths: ['collapsedSectionLabels', 'desktopSidebarCollapsed', 'sectionDefaultsApplied'],
  },
})
