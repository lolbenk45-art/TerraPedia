export type DetailLayoutKind = 'item' | 'npc' | 'boss' | 'armor-set'
export type DetailLayoutDensity = 'compact' | 'readable'

type DetailLayoutOptions = {
  kind: DetailLayoutKind
  density?: DetailLayoutDensity
}

const densityClassByValue: Record<DetailLayoutDensity, string> = {
  compact: 'tp-detail-density-compact',
  readable: 'tp-detail-density-readable',
}

export function useDetailLayout(options: DetailLayoutOptions) {
  const preferencesStore = useUserPreferencesStore()
  const density = computed<DetailLayoutDensity>(() => preferencesStore.preferences.detailDensity ?? options.density ?? 'readable')
  const detailDensityClass = computed(() => densityClassByValue[density.value])

  return reactive({
    detailShellClass: computed(() => ['tp-detail-shell', `tp-detail-kind-${options.kind}`, detailDensityClass.value].join(' ')),
    detailGridClass: 'tp-detail-grid',
    detailModuleClass: 'tp-detail-module',
    detailRelationRowClass: 'tp-detail-relation-row',
    detailDensityClass,
  })
}
