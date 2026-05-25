export type DetailLayoutKind = 'item' | 'npc' | 'boss'
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
  const density = options.density ?? 'readable'

  return {
    detailShellClass: ['tp-detail-shell', `tp-detail-kind-${options.kind}`, densityClassByValue[density]].join(' '),
    detailGridClass: 'tp-detail-grid',
    detailModuleClass: 'tp-detail-module',
    detailRelationRowClass: 'tp-detail-relation-row',
    detailDensityClass: densityClassByValue[density],
  }
}
