import type {
  CraftingEntityView,
  CraftingMaterialView,
  CraftingRecipeModel,
  CraftingRecipeOptionView,
  CraftingRecipeVariantView,
  CraftingStationView,
} from '~/composables/useCraftingRecipeModel'

export type ItemRecipeHierarchyStageKey = 'L3' | 'L2' | 'L1' | 'OUT'

export type ItemRecipeHierarchyEntry = CraftingEntityView & {
  id: string
  alternatives: CraftingEntityView[]
  isAlternativeGroup: boolean
  isOutput: boolean
}

export type ItemRecipeHierarchyStage = {
  key: ItemRecipeHierarchyStageKey
  title: string
  meta: string
  entries: ItemRecipeHierarchyEntry[]
  stations: CraftingStationView[]
}

export type ItemRecipeHierarchy = {
  hasData: boolean
  variants: CraftingRecipeVariantView[]
  activeVariant: CraftingRecipeVariantView | null
  activeRecipe: CraftingRecipeOptionView | null
  stages: ItemRecipeHierarchyStage[]
  procurement: ItemRecipeHierarchyEntry[]
}

const stageDefinitions: Array<Pick<ItemRecipeHierarchyStage, 'key' | 'title' | 'meta'>> = [
  { key: 'L3', title: '基础材料', meta: '采集或探索获得' },
  { key: 'L2', title: '中间产物', meta: '继续合成所需' },
  { key: 'L1', title: '核心部件', meta: '用于目标制作' },
  { key: 'OUT', title: '成品', meta: '当前目标' },
]

const toEntry = (
  entity: CraftingEntityView | CraftingMaterialView,
  id: string,
  options: {
    isOutput?: boolean
    alternatives?: CraftingEntityView[]
    isAlternativeGroup?: boolean
    subtitle?: string
  } = {},
): ItemRecipeHierarchyEntry => ({
  ...entity,
  id,
  subtitle: options.subtitle ?? entity.subtitle,
  alternatives: options.alternatives ?? [],
  isAlternativeGroup: options.isAlternativeGroup ?? false,
  isOutput: options.isOutput ?? false,
})

const appendStations = (stage: ItemRecipeHierarchyStage, stations: CraftingStationView[]) => {
  for (const station of stations) {
    if (!stage.stations.some((entry) => entry.key === station.key)) {
      stage.stations.push(station)
    }
  }
}

const createStages = (): ItemRecipeHierarchyStage[] => stageDefinitions.map((definition) => ({
  ...definition,
  entries: [],
  stations: [],
}))

type FrontierOccurrence = {
  material: CraftingMaterialView
  entry: ItemRecipeHierarchyEntry
  parentStations: CraftingStationView[]
}

type FrontierProjection = {
  entries: ItemRecipeHierarchyEntry[]
  occurrences: FrontierOccurrence[]
}

const recipeOptions = (material: CraftingMaterialView) => {
  if (material.cycleDetected || material.isReference) return []

  const options = material.childRecipes.length
    ? material.childRecipes
    : material.childRecipe
      ? [material.childRecipe]
      : []
  const seen = new Set<string>()

  return options.filter((recipe, index) => {
    const key = recipe.key || `${recipe.recipeId}:${index}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const entityKey = (entity: CraftingEntityView) => String(entity.itemId || entity.key || entity.title).trim()
const entryKey = (entry: ItemRecipeHierarchyEntry) => `${entityKey(entry)}:${entry.quantity}`
const occurrenceKey = (occurrence: FrontierOccurrence) => entryKey(occurrence.entry)

const appendEntry = (entries: ItemRecipeHierarchyEntry[], entry: ItemRecipeHierarchyEntry) => {
  if (!entries.some((candidate) => entryKey(candidate) === entryKey(entry))) {
    entries.push(entry)
  }
}

const appendOccurrence = (occurrences: FrontierOccurrence[], occurrence: FrontierOccurrence) => {
  const existing = occurrences.find((candidate) => occurrenceKey(candidate) === occurrenceKey(occurrence))
  if (!existing) {
    occurrences.push({ ...occurrence, parentStations: [...occurrence.parentStations] })
    return
  }

  for (const station of occurrence.parentStations) {
    if (!existing.parentStations.some((candidate) => candidate.key === station.key)) {
      existing.parentStations.push(station)
    }
  }
}

const compactMaterialSummary = (recipe: CraftingRecipeOptionView) => recipe.materials
  .slice(0, 4)
  .map((material) => {
    const quantity = recipe.materials.length < 3 && material.quantity && material.quantity !== 'x1'
      ? ` ${material.quantity.replace(/^x/i, '×')}`
      : ''
    return `${material.title}${quantity}`
  })
  .join(' / ')

const projectedMaterialEntity = (material: CraftingMaterialView): CraftingEntityView => ({
  key: material.key,
  itemId: material.itemId,
  title: material.title,
  subtitle: recipeOptions(material).map(compactMaterialSummary).find(Boolean) ?? '',
  quantity: material.quantity,
  image: material.image,
  fallback: material.fallback,
  fallbackIcon: material.fallbackIcon,
  href: material.href,
})

const projectedMemberEntity = (member: CraftingEntityView): CraftingEntityView => ({
  ...member,
  subtitle: '',
})

const materialEntry = (material: CraftingMaterialView, id: string) => toEntry(
  projectedMaterialEntity(material),
  id,
  {
    alternatives: material.members.map(projectedMemberEntity),
    isAlternativeGroup: material.isAnyGroup,
  },
)

const entryEntity = (entry: ItemRecipeHierarchyEntry): CraftingEntityView => ({
  key: entry.key,
  itemId: entry.itemId,
  title: entry.title,
  subtitle: entry.subtitle,
  quantity: entry.quantity,
  image: entry.image,
  fallback: entry.fallback,
  fallbackIcon: entry.fallbackIcon,
  href: entry.href,
})

const mergeFrontierProjection = (target: FrontierProjection, source: FrontierProjection) => {
  source.entries.forEach((entry) => appendEntry(target.entries, entry))
  source.occurrences.forEach((occurrence) => appendOccurrence(target.occurrences, occurrence))
}

const mergeRecipeOptionFrontiers = (
  owner: CraftingMaterialView,
  options: FrontierProjection[],
  path: string,
): FrontierProjection => {
  const projection: FrontierProjection = { entries: [], occurrences: [] }
  options.forEach((option) => option.occurrences.forEach((occurrence) => appendOccurrence(projection.occurrences, occurrence)))

  if (options.length < 2) {
    options.forEach((option) => option.entries.forEach((entry) => appendEntry(projection.entries, entry)))
    return projection
  }

  const optionKeys = options.map((option) => new Set(option.entries.map(entryKey)))
  const commonKeys = new Set(
    options[0]?.entries
      .map(entryKey)
      .filter((key) => optionKeys.every((keys) => keys.has(key))) ?? [],
  )
  const uniqueEntries = options.map((option) => option.entries.filter((entry) => !commonKeys.has(entryKey(entry))))
  const hasOneToOneFork = uniqueEntries.every((entries) => entries.length === 1)

  if (!hasOneToOneFork) {
    options.forEach((option) => option.entries.forEach((entry) => appendEntry(projection.entries, entry)))
    return projection
  }

  const alternatives = uniqueEntries.map(([entry]) => entryEntity(entry!))
  const fork = toEntry(projectedMaterialEntity(owner), `L2:${path}:fork`, {
    alternatives,
    isAlternativeGroup: true,
    subtitle: `${options.length} 条可选制作路线`,
  })
  let forkInserted = false

  for (const entry of options[0]?.entries ?? []) {
    if (commonKeys.has(entryKey(entry))) {
      appendEntry(projection.entries, entry)
    } else if (!forkInserted) {
      projection.entries.push(fork)
      forkInserted = true
    }
  }

  if (!forkInserted) projection.entries.unshift(fork)
  return projection
}

const collectFrontiersFromRecipe = (
  recipe: CraftingRecipeOptionView,
  path: string,
): FrontierProjection => {
  const projection: FrontierProjection = { entries: [], occurrences: [] }
  const parentStations = [...recipe.stations, ...recipe.conditions]

  recipe.materials.forEach((material, index) => {
    const materialPath = `${path}.${index}.${material.key}`
    const childOptions = recipeOptions(material)
    if (!childOptions.length) return

    const childProjections = childOptions.map((childRecipe, optionIndex) => collectFrontiersFromRecipe(
      childRecipe,
      `${materialPath}.option-${optionIndex}.${childRecipe.key}`,
    ))
    const hasCraftableDescendant = childProjections.some((child) => child.entries.length > 0)

    if (!hasCraftableDescendant) {
      const entry = materialEntry(material, `L2:${materialPath}`)
      appendEntry(projection.entries, entry)
      appendOccurrence(projection.occurrences, { material, entry, parentStations })
      return
    }

    mergeFrontierProjection(
      projection,
      mergeRecipeOptionFrontiers(material, childProjections, materialPath),
    )
  })

  return projection
}

const collectLeafEntries = (
  recipe: CraftingRecipeOptionView,
  path: string,
  prefix: string,
  entries: ItemRecipeHierarchyEntry[],
) => {
  recipe.materials.forEach((material, index) => {
    const materialPath = `${path}.${index}.${material.key}`
    const childOptions = recipeOptions(material)

    if (!childOptions.length) {
      appendEntry(entries, materialEntry(material, `${prefix}:${materialPath}`))
      return
    }

    childOptions.forEach((childRecipe, optionIndex) => collectLeafEntries(
      childRecipe,
      `${materialPath}.option-${optionIndex}.${childRecipe.key}`,
      prefix,
      entries,
    ))
  })
}

/**
 * Adapts the normalized crafting view model for the item archive's dense
 * L3 → L2 → L1 → output presentation. Raw API recipe nodes stay owned by
 * useCraftingRecipeModel, so variant order, fallbacks, quantities and cycle
 * handling remain identical to the rest of the public crafting surface.
 */
export const buildItemRecipeHierarchy = (
  model: CraftingRecipeModel | null | undefined,
): ItemRecipeHierarchy => {
  const stages = createStages()
  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]))
  const procurement: ItemRecipeHierarchyEntry[] = []
  const activeRecipe = model?.activeRecipe ?? null

  if (!activeRecipe) {
    return {
      hasData: false,
      variants: model?.variants ?? [],
      activeVariant: model?.activeVariant ?? null,
      activeRecipe: null,
      stages,
      procurement,
    }
  }

  const l3Stage = stageByKey.get('L3')!
  const l2Stage = stageByKey.get('L2')!
  const l1Stage = stageByKey.get('L1')!
  appendStations(l1Stage, [...activeRecipe.stations, ...activeRecipe.conditions])

  activeRecipe.materials.forEach((material, index) => {
    const materialPath = `${activeRecipe.key}.${index}.${material.key}`
    appendEntry(l1Stage.entries, materialEntry(material, `L1:${materialPath}`))

    const childOptions = recipeOptions(material)
    if (!childOptions.length) return

    const childProjections = childOptions.map((childRecipe, optionIndex) => collectFrontiersFromRecipe(
      childRecipe,
      `${materialPath}.option-${optionIndex}.${childRecipe.key}`,
    ))
    const frontier = mergeRecipeOptionFrontiers(material, childProjections, materialPath)

    if (!frontier.entries.length) {
      childOptions.forEach((childRecipe, optionIndex) => {
        collectLeafEntries(
          childRecipe,
          `${materialPath}.option-${optionIndex}.${childRecipe.key}`,
          'L3',
          l3Stage.entries,
        )
        appendStations(l3Stage, [...childRecipe.stations, ...childRecipe.conditions])
      })
      return
    }

    frontier.entries.forEach((entry) => appendEntry(l2Stage.entries, entry))
    frontier.occurrences.forEach((occurrence) => {
      appendStations(l2Stage, occurrence.parentStations)
      recipeOptions(occurrence.material).forEach((childRecipe, optionIndex) => {
        collectLeafEntries(
          childRecipe,
          `${occurrence.entry.id}.option-${optionIndex}.${childRecipe.key}`,
          'L3',
          l3Stage.entries,
        )
        appendStations(l3Stage, [...childRecipe.stations, ...childRecipe.conditions])
      })
    })
  })

  collectLeafEntries(activeRecipe, activeRecipe.key, 'PROC', procurement)
  const outputStage = stageByKey.get('OUT')
  outputStage?.entries.push(toEntry(activeRecipe.output, `OUT:${activeRecipe.key}`, {
    isOutput: true,
    subtitle: activeRecipe.summary,
  }))

  return {
    hasData: true,
    variants: model?.variants ?? [],
    activeVariant: model?.activeVariant ?? null,
    activeRecipe,
    stages,
    procurement,
  }
}
