<script setup lang="ts">
import ArmorBuildMatrix from '~/components/detail/ArmorBuildMatrix.vue'
import ArmorRecipeTable from '~/components/detail/ArmorRecipeTable.vue'
import DetailArmorSetSkeleton from '~/components/detail/DetailArmorSetSkeleton.vue'
import { usePublicArmorSetDetail } from '~/composables/usePublicArmorSetDetail'
import type { EquipmentEffectAttribute, PublicArmorSetListItem, PublicArmorSetRelatedItem, PublicItemRecipeTree } from '~/types/public-api'
import { resolveArmorAggregateOrFallback } from '~/utils/armorSetAggregate.mjs'
import { createArmorSetBuildGroups } from '~/utils/armorSetBuilds.mjs'
import {
  armorBenefitLineIsAttributeSummary,
  armorEffectFromLine,
  armorEffectLineNumericMatch,
  armorEffectLinesFromLine,
  armorIdentityAliases,
  armorLineLooksLikeNumericSetAttribute,
  armorLineLooksLikePlainAttribute,
  dedupeEffectLines,
  fallbackStatKey,
  fallbackStatLabel,
  normalizeEffectLine,
  normalizeMatchText,
  statLabels,
} from '~/utils/armorEffectParsing'
import {
  armorPieceName,
  armorPieceRole,
  armorPieceRoleOrder,
  armorUniqueItemKey,
  effectSourceKind,
  effectSummaryLine,
  effectVariantLabel,
  mergeEffectLines,
  statName,
  uniqueArmorItems,
  useArmorSetBuilds,
} from '~/composables/useArmorSetBuilds'
import { buildCompactRecipeMaterial, buildCompactRecipeStation, compactRecipeNodeChildren, compactRecipeNodeStations, compactRecipeRootNodes, type CompactRecipeMaterial, type CompactRecipeStation } from '~/utils/craftingRecipeCompact'

type ArmorPieceEffectRecord = Record<string, EquipmentEffectAttribute[]>
type ArmorSetRecipeSummary = {
  key: string
  itemId: string
  name: string
  role: string
  image: string
  fallback: string
  href: string
  recipeCount: number
  materials: CompactRecipeMaterial[]
  stations: CompactRecipeStation[]
}
type ArmorSetRecipeTableRow = ArmorSetRecipeSummary & {
  stationGroupKey: string
  stationRowspan: number
  showStationCell: boolean
}

const ARMOR_VISIBLE_RECIPE_LIMIT = 8

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'armor-set', density: 'readable' })
const armorClientReady = ref(false)
const expandedArmorPartKeys = ref(new Set<string>())

const armorSetId = computed(() => String(route.params.id ?? '').trim())
const { data: armorDetailResult, pending: armorDetailPending, error: armorDetailError, refresh: refreshArmorDetail } = await usePublicArmorSetDetail(armorSetId)

if (!armorDetailResult.value?.detail) {
  throw createError({ statusCode: 404, statusMessage: 'Armor set not found' })
}

const armorDetail = computed(() => armorDetailResult.value?.detail ?? null)
const armorRaw = computed<PublicArmorSetListItem | null>(() => armorDetailResult.value?.raw ?? null)
const armorDetailVisualLoading = computed(() => !armorDetail.value && (!armorClientReady.value || armorDetailPending.value))
const armorNotFound = computed(() => armorClientReady.value && !armorDetailPending.value && !armorDetail.value)

const armorTitle = computed(() => armorDetail.value?.displayName || `套装 ${armorSetId.value || '详情'}`)
const armorSubtitle = computed(() => armorDetail.value?.englishName || '公开套装资料')
const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []
const armorPrimaryPreview = computed(() => {
  const raw = armorRaw.value
  return asStringArray(raw?.maleImages ?? raw?.male_images)[0]
    ?? asStringArray(raw?.femaleImages ?? raw?.female_images)[0]
    ?? asStringArray(raw?.specialImages ?? raw?.special_images)[0]
    ?? asStringArray(raw?.fallbackImages ?? raw?.fallback_images)[0]
    ?? ''
})

const toAbsoluteSeoUrl = useAbsoluteSiteUrl()

useSeoMeta({
  title: () => `TerraPedia · ${armorTitle.value}`,
  description: () => `${armorTitle.value} 的公开套装详情，包含套装效果、词条解析与图片分组。`,
  ogImage: () => toAbsoluteSeoUrl(armorPrimaryPreview.value),
})

useHead({
  link: [{ rel: 'canonical', href: () => toAbsoluteSeoUrl(route.path) }],
})

const statVisuals: Record<string, { label: string, tone: string }> = {
  damage_bonus: { label: '伤害加成', tone: 'is-offense' },
  crit_chance: { label: '暴击率', tone: 'is-offense' },
  move_speed: { label: '移动速度', tone: 'is-mobility' },
  melee_speed: { label: '近战速度', tone: 'is-mobility' },
  summon_damage: { label: '召唤伤害', tone: 'is-summon' },
  minion_capacity: { label: '仆从容量', tone: 'is-summon' },
  sentry_capacity: { label: '哨兵容量', tone: 'is-summon' },
  ammo_conservation: { label: '弹药节省', tone: 'is-offense' },
  knockback: { label: '击退', tone: 'is-offense' },
  defense: { label: '防御', tone: 'is-defense' },
  mana_max: { label: '魔力上限', tone: 'is-resource' },
  mana_cost: { label: '魔力消耗', tone: 'is-resource' },
  mining_speed: { label: '挖矿速度', tone: 'is-mobility' },
  special_effect: { label: '特殊效果', tone: 'is-special' },
}

const statVisualMeta = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  return statVisuals[key] ?? { label: statName(effect), tone: effectToneClass(effect) }
}

const effectToneClass = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/damage|crit|melee|summon|ammo/.test(key)) return 'is-offense'
  if (/move|speed|dash|acceleration/.test(key)) return 'is-mobility'
  if (/defense|immunity/.test(key)) return 'is-defense'
  return 'is-special'
}

const statGroupLabels: Record<string, string> = {
  offense: '攻击数值',
  defense: '防御数值',
  mobility: '移动与速度',
  resource: '资源与消耗',
  summon: '召唤与仆从',
  special: '特殊效果',
}

const statGroupOrder = ['offense', 'defense', 'mobility', 'resource', 'summon', 'special']

const effectStatGroup = (effect: EquipmentEffectAttribute) => {
  const key = String(effect.statKey ?? '')
  if (/summon|minion|sentry/.test(key)) return 'summon'
  if (/damage|crit|melee|ammo|knockback/.test(key)) return 'offense'
  if (/defense|immunity|regen|life/.test(key)) return 'defense'
  if (/move|speed|dash|acceleration|flight/.test(key)) return 'mobility'
  if (/mana|cost|resource/.test(key)) return 'resource'
  return 'special'
}

const effectScopeLabel = (effect: EquipmentEffectAttribute) => {
  const classScope = String(effect.classScope ?? '').trim()
  const applyScope = String(effect.applyScope ?? '').trim()
  return [
    classScope && classScope !== 'all' ? classScope : '全职业',
    applyScope || '套装效果',
  ].join(' / ')
}

const effectSourceLabel = (effect: EquipmentEffectAttribute) => (
  effectSourceKind(effect) === 'piece' ? '单件效果' : '套装效果'
)

const armorSourceEffectLabel = (effect: EquipmentEffectAttribute) => {
  const applyScope = String(effect.applyScope ?? '').trim()
  const variantLabel = effectVariantLabel(effect)
  if (variantLabel) return variantLabel
  if (applyScope === 'set_bonus') return '套装奖励'
  if (effectSourceKind(effect) === 'piece') return '单件效果'
  return '基础来源'
}

const toggleArmorPieceEvidence = (key: string) => {
  const next = new Set(expandedArmorPartKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedArmorPartKeys.value = next
}

const armorRecipeItemId = (item: PublicArmorSetRelatedItem) => String(item.itemId ?? item.sourceId ?? '').trim()

const armorFirstGlyph = (value: string) => Array.from(String(value ?? '').trim())[0] ?? '?'

const armorBenefitLines = computed(() => {
  const benefit = String(armorRaw.value?.benefitZh ?? armorRaw.value?.benefitEn ?? '').trim()
  if (!benefit) return []
  return benefit.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20)
})

const armorBenefitFallbackEffects = computed<EquipmentEffectAttribute[]>(() => armorBenefitLines.value
  .flatMap((line) => {
    const attributeLines = armorEffectLinesFromLine(line)
    if (attributeLines.length) {
      return attributeLines.map((attributeLine) => ({
        ...armorEffectFromLine(attributeLine),
        classScope: 'all',
        applyScope: 'set_bonus',
      }))
    }
    return [{
      statKey: fallbackStatKey(line),
      statLabelZh: fallbackStatLabel(line),
      valueDecimal: null,
      unit: 'flat',
      classScope: 'all',
      applyScope: 'set_bonus',
      rawText: line,
      parseStatus: 'unparsed',
    } as EquipmentEffectAttribute]
  })
  .filter((effect) => effect.rawText))

const armorParsedEffects = computed(() => (armorDetail.value?.parsedEffects ?? []).slice(0, 12))
const hasStructuredArmorEffects = computed(() => Boolean(armorDetail.value?.effects?.length))
const armorShownEffects = computed(() => {
  if (hasStructuredArmorEffects.value) return (armorDetail.value?.effects ?? []).slice(0, 40)
  return armorBenefitFallbackEffects.value
})

const armorStatGroups = computed(() => {
  const effects = armorShownEffects.value
  const grouped = new Map<string, EquipmentEffectAttribute[]>()
  for (const effect of effects) {
    const groupKey = effectStatGroup(effect)
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), effect])
  }

  return statGroupOrder
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      label: statGroupLabels[key] ?? key,
      effects: grouped.get(key) ?? [],
    }))
})

const groupEffectsByStat = (effects: EquipmentEffectAttribute[]) => {
  const grouped = new Map<string, EquipmentEffectAttribute[]>()
  for (const effect of effects) {
    const groupKey = effectStatGroup(effect)
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), effect])
  }

  return statGroupOrder
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      label: statGroupLabels[key] ?? key,
      effects: grouped.get(key) ?? [],
    }))
}

const armorEffectSections = computed(() => {
  const setEffects = armorShownEffects.value.filter((effect) => effectSourceKind(effect) === 'set')

  if (!setEffects.length) return []

  return [{
    key: 'set',
    label: '套装效果',
    description: '穿齐套装后触发的整体加成。',
    effects: setEffects,
    groups: groupEffectsByStat(setEffects),
  }]
})

const asRelatedItems = (value: unknown): PublicArmorSetRelatedItem[] => Array.isArray(value)
  ? value.filter((entry): entry is PublicArmorSetRelatedItem => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  : []
const asEquipmentEffects = (value: unknown): EquipmentEffectAttribute[] => Array.isArray(value)
  ? value.filter((entry): entry is EquipmentEffectAttribute => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
  : []
const armorRelatedItems = computed(() => asRelatedItems(armorRaw.value?.relatedItems ?? armorRaw.value?.related_items))

const armorItemEffectFetchKey = (item: PublicArmorSetRelatedItem) => String(
  item.itemId ?? item.sourceId ?? item.internalName ?? '',
).trim()

const armorUniqueRecipeItems = computed(() => {
  // armor-crafting-deduped-by-unique-item: recipe summaries are fetched once per unique armor piece, not once per build.
  const seen = new Set<string>()
  const result: PublicArmorSetRelatedItem[] = []
  for (const item of armorRelatedItems.value) {
    const itemId = armorRecipeItemId(item)
    if (!itemId || seen.has(itemId)) continue
    seen.add(itemId)
    result.push(item)
  }
  return result.sort((left, right) => armorPieceRoleOrder(armorPieceRole(left)) - armorPieceRoleOrder(armorPieceRole(right)) || armorPieceName(left).localeCompare(armorPieceName(right), 'zh-Hans-CN'))
})

const armorRecipeFetchKey = computed(() => armorUniqueRecipeItems.value.map(armorRecipeItemId).join(','))

const armorPieceEffectGroups = computed(() => {
  const groups = new Map<string, { item: PublicArmorSetRelatedItem | null, effects: EquipmentEffectAttribute[] }>()
  const unmatchedKey = 'unmatched-piece-effects'

  for (const effect of armorShownEffects.value.filter((entry) => effectSourceKind(entry) === 'piece')) {
    const item = statLinkedItem(effect)
    const key = item
      ? String(item.itemId ?? item.sourceId ?? item.internalName ?? armorPieceName(item)).trim()
      : unmatchedKey
    const safeKey = key || unmatchedKey
    const current = groups.get(safeKey) ?? { item, effects: [] }
    current.effects.push(effect)
    groups.set(safeKey, current)
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      item: group.item,
      title: group.item ? armorPieceName(group.item) : '未匹配部件',
      subtitle: group.item ? armorPieceRole(group.item) : '需要补充来源物品',
      effects: group.effects,
    }))
    .sort((left, right) => {
      const leftOrder = left.item ? armorPieceRoleOrder(armorPieceRole(left.item)) : 99
      const rightOrder = right.item ? armorPieceRoleOrder(armorPieceRole(right.item)) : 99
      return leftOrder - rightOrder || left.title.localeCompare(right.title, 'zh-Hans-CN')
    })
})

const armorSetRewardLines = computed(() => mergeEffectLines(armorShownEffects.value.filter((effect) => effectSourceKind(effect) === 'set')))
const armorSetEffectLines = computed(() => armorBenefitLines.value.filter((line) => /套装|奖励|效果|bonus/i.test(line)))
const armorFallbackBenefitLines = computed(() => {
  if (hasStructuredArmorEffects.value) return []
  const effectLines = new Set(mergeEffectLines(armorBenefitFallbackEffects.value).map(normalizeEffectLine))
  return armorBenefitLines.value.filter((line) => !effectLines.has(normalizeEffectLine(line)))
})

const armorHeroSummary = computed(() => {
  const effectLines = mergeEffectLines(armorShownEffects.value).slice(0, 3)
  if (effectLines.length) return effectLines.join(' · ')
  return armorFallbackBenefitLines.value[0] || '该套装的数值资料正在整理中。'
})

const armorSourceEffectGroups = computed(() => {
  const entries = armorShownEffects.value
    .map((effect, index) => ({
      key: `${index}-${normalizeEffectLine(effectSummaryLine(effect))}`,
      label: armorSourceEffectLabel(effect),
      line: effectSummaryLine(effect),
      effect,
    }))
    .filter((entry) => entry.line)

  const grouped = new Map<string, typeof entries>()
  for (const entry of entries) {
    grouped.set(entry.label, [...(grouped.get(entry.label) ?? []), entry])
  }

  return [...grouped.entries()].map(([label, groupEntries]) => ({
    key: normalizeEffectLine(label) || label,
    label,
    entries: groupEntries,
  }))
})

const armorUniqueRelatedItems = computed(() => uniqueArmorItems(armorRelatedItems.value))

const armorHasAggregatedPieceEffects = computed(() => Object.prototype.hasOwnProperty.call(
  armorRaw.value ?? {},
  'pieceEffects',
))
const armorPieceEffectSourceMode = computed(() => armorHasAggregatedPieceEffects.value ? 'aggregate' : 'legacy')

const aggregateArmorPieceEquipmentEffects = (items: PublicArmorSetRelatedItem[]) => {
  const aggregate = armorRaw.value?.pieceEffects ?? {}
  const result: ArmorPieceEffectRecord = {}
  for (const item of items) {
    const itemId = armorItemEffectFetchKey(item)
    if (!itemId) continue
    result[armorUniqueItemKey(item)] = asEquipmentEffects(aggregate[itemId] ?? [])
  }
  return result
}

const armorPieceEffectRequestKeys = computed(() => dedupeEffectLines(
  armorUniqueRelatedItems.value
    .map(armorItemEffectFetchKey)
    .filter(Boolean),
))

const fetchArmorPieceEquipmentEffects = async (items: PublicArmorSetRelatedItem[]) => {
  const entries = await Promise.all(items.map(async (item) => {
    const normalizedItemId = armorItemEffectFetchKey(item)
    if (!normalizedItemId) return null

    try {
      const response = await usePublicApiFetch<EquipmentEffectAttribute[]>(
        `/public/items/${normalizedItemId}/equipment-effects`,
      )
      return {
        key: armorUniqueItemKey(item),
        effects: asEquipmentEffects(unwrapApiResponse(response)),
      }
    } catch {
      return {
        key: armorUniqueItemKey(item),
        effects: [],
      }
    }
  }))

  const result: ArmorPieceEffectRecord = {}
  for (const entry of entries) {
    if (!entry) continue
    result[entry.key] = entry.effects
  }
  return result
}

const { data: armorPieceEquipmentEffectsByKey } = await useAsyncData(
  () => `public-armor-set-piece-effects:${armorSetId.value || 'missing'}:${armorPieceEffectSourceMode.value}:${armorPieceEffectRequestKeys.value.join(',')}`,
  () => resolveArmorAggregateOrFallback({
    raw: armorRaw.value,
    field: 'pieceEffects',
    aggregate: () => aggregateArmorPieceEquipmentEffects(armorUniqueRelatedItems.value),
    fallback: () => fetchArmorPieceEquipmentEffects(armorUniqueRelatedItems.value),
  }),
  {
    server: false,
    watch: [armorPieceEffectRequestKeys, armorPieceEffectSourceMode],
    default: (): ArmorPieceEffectRecord => ({}),
  },
)

const {
  statLinkedItem,
  armorFixedBonusLines,
  armorFixedBonusGroups,
  armorHasVariantBuilds,
  armorSetBuildCards,
} = useArmorSetBuilds({
  armorShownEffects,
  armorRelatedItems,
  armorBenefitLines,
  armorPieceEquipmentEffectsByKey,
  expandedArmorPartKeys,
  armorTitle,
})

const armorBuildRecipeSummary = (item: PublicArmorSetRelatedItem, tree: PublicItemRecipeTree | null | undefined): ArmorSetRecipeSummary | null => {
  const itemId = armorRecipeItemId(item)
  if (!itemId) return null
  const roots = compactRecipeRootNodes(tree)
  const root = roots[0]
  if (!root) return null
  const name = armorPieceName(item)
  const materials = compactRecipeNodeChildren(root).slice(0, 6).map((node, index) => buildCompactRecipeMaterial(node, index))
  const stationSeen = new Set<string>()
  const stations = compactRecipeNodeStations(root).map((station, index) => buildCompactRecipeStation(station, index)).filter((station) => {
    const key = normalizeEffectLine(`${station.name}-${station.meta}`)
    if (!key || stationSeen.has(key)) return false
    stationSeen.add(key)
    return true
  }).slice(0, 4)
  return {
    key: itemId,
    itemId,
    name,
    role: armorPieceRole(item),
    image: resolvePreviewImageUrl(item.image || ''),
    fallback: armorFirstGlyph(name),
    href: `/crafting?itemId=${itemId}&maxDepth=3`,
    recipeCount: roots.length,
    materials,
    stations,
  }
}

const armorHasAggregatedRecipes = computed(() => Object.prototype.hasOwnProperty.call(
  armorRaw.value ?? {},
  'pieceRecipes',
))
const armorRecipeSourceMode = computed(() => armorHasAggregatedRecipes.value ? 'aggregate' : 'legacy')

const aggregateArmorSetRecipeSummaries = (items: PublicArmorSetRelatedItem[]) => {
  const aggregate = armorRaw.value?.pieceRecipes ?? {}
  return items.map((item) => {
    const itemId = armorRecipeItemId(item)
    if (!itemId) return null
    const tree = aggregate[itemId]
    return armorBuildRecipeSummary(item, tree)
  }).filter((entry): entry is ArmorSetRecipeSummary => Boolean(entry))
}

const fetchArmorSetRecipeSummaries = async (items: PublicArmorSetRelatedItem[]) => {
  const entries = await Promise.all(items.map(async (item) => {
    const itemId = armorRecipeItemId(item)
    if (!itemId) return null
    try {
      const response = await usePublicApiFetch<PublicItemRecipeTree>(`/public/items/${itemId}/recipe-tree`, {
        query: { maxDepth: 1 },
      })
      return armorBuildRecipeSummary(item, unwrapApiResponse(response))
    } catch {
      return null
    }
  }))
  return entries.filter((entry): entry is ArmorSetRecipeSummary => Boolean(entry))
}

const { data: armorSetRecipeSummaries, pending: armorSetRecipePending } = await useAsyncData(
  () => `public-armor-set-recipes:${armorSetId.value || 'missing'}:${armorRecipeSourceMode.value}:${armorRecipeFetchKey.value}`,
  () => resolveArmorAggregateOrFallback({
    raw: armorRaw.value,
    field: 'pieceRecipes',
    aggregate: () => aggregateArmorSetRecipeSummaries(armorUniqueRecipeItems.value),
    fallback: () => fetchArmorSetRecipeSummaries(armorUniqueRecipeItems.value),
  }),
  {
    server: false,
    watch: [armorRecipeFetchKey, armorRecipeSourceMode],
    default: (): ArmorSetRecipeSummary[] => [],
  },
)

const armorVisibleRecipeSummaries = computed(() => armorSetRecipeSummaries.value.slice(0, ARMOR_VISIBLE_RECIPE_LIMIT))
const armorHiddenRecipeSummaries = computed(() => armorSetRecipeSummaries.value.slice(ARMOR_VISIBLE_RECIPE_LIMIT))
const armorRecipeUnavailableReason = computed(() => {
  // armorSetRecipeSummaries 走 server: false，SSR/水合初始一律按读取中文案，避免 hydration mismatch。
  if (armorSetRecipePending.value || !armorClientReady.value) return '正在读取制作配方。'
  if (!armorUniqueRecipeItems.value.length) return '这个套装没有可用于查询配方的部件编号。'
  return '当前资料没有可展示的制作配方，可能是掉落、购买、奖励或装饰性外观来源。'
})

const armorRecipeStationGroupKey = (recipe: ArmorSetRecipeSummary) => {
  const stationKey = recipe.stations
    .map((station) => normalizeEffectLine(`${station.name}-${station.meta}`))
    .filter(Boolean)
    .join('|')
  return stationKey || 'no-station'
}

const armorRecipeTableRows = (recipes: ArmorSetRecipeSummary[]): ArmorSetRecipeTableRow[] => {
  return recipes.map((recipe, index) => {
    const stationGroupKey = armorRecipeStationGroupKey(recipe)
    const previousRecipe = recipes[index - 1]
    const previousStationGroupKey = previousRecipe ? armorRecipeStationGroupKey(previousRecipe) : ''
    let stationRowspan = 1
    if (previousStationGroupKey !== stationGroupKey) {
      for (let nextIndex = index + 1; nextIndex < recipes.length; nextIndex += 1) {
        const nextRecipe = recipes[nextIndex]
        if (!nextRecipe || armorRecipeStationGroupKey(nextRecipe) !== stationGroupKey) break
        stationRowspan += 1
      }
    }
    return {
      ...recipe,
      stationGroupKey,
      stationRowspan,
      showStationCell: previousStationGroupKey !== stationGroupKey,
    }
  })
}

const armorVisibleRecipeRows = computed(() => armorRecipeTableRows(armorVisibleRecipeSummaries.value))
const armorHiddenRecipeRows = computed(() => armorRecipeTableRows(armorHiddenRecipeSummaries.value))

const imageGroups = computed(() => ([
  { key: 'male', label: '男', icon: 'icon-armor', images: asStringArray(armorRaw.value?.maleImages ?? armorRaw.value?.male_images) },
  { key: 'female', label: '女', icon: 'icon-armor', images: asStringArray(armorRaw.value?.femaleImages ?? armorRaw.value?.female_images) },
  { key: 'special', label: '特殊', icon: 'icon-armor', images: asStringArray(armorRaw.value?.specialImages ?? armorRaw.value?.special_images) },
  { key: 'fallback', label: '部件图', icon: 'icon-items', images: asStringArray(armorRaw.value?.fallbackImages ?? armorRaw.value?.fallback_images) },
]).filter((group) => group.images.length))
const armorPreviewImageTotal = computed(() => imageGroups.value.reduce((total, group) => total + group.images.length, 0))
const armorPreviewCompactClass = computed(() => armorPreviewImageTotal.value <= 2 ? 'armor-preview-module--compact' : '')
const armorPrimaryPreviewIcon = computed(() => imageGroups.value[0]?.icon ?? 'icon-armor')

const factCards = computed(() => ([
  { label: '部件数', value: armorDetail.value?.uniqueItemCount == null ? '未标记' : String(armorDetail.value.uniqueItemCount), meta: '可用部件数量' },
  { label: '套装组', value: armorDetail.value?.setCount == null ? '未标记' : String(armorDetail.value.setCount), meta: '套装部件组数' },
  { label: '解析数', value: String(armorParsedEffects.value.length), meta: '已解析效果词条' },
]))

onMounted(() => {
  armorClientReady.value = true
})
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout" :class="detailLayout.detailShellClass" :aria-busy="armorDetailVisualLoading">
      <DetailArmorSetSkeleton v-if="armorDetailVisualLoading" :detail-module-class="detailLayout.detailModuleClass" />

      <section v-else-if="armorNotFound" class="support-panel armor-detail-hero">
        <div>
          <span class="eyebrow">套装资料</span>
          <component :is="'h1'" class="detail-missing-title">{{ armorDetailError ? '套装资料加载失败' : '没有找到这个套装' }}</component>
          <p>{{ armorDetailError ? '加载套装资料时出现异常，可以重试或稍后再来。' : '当前详情资料还没有可渲染内容。' }}</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="armorDetailError" class="tag moss">加载异常</span>
          </div>
          <button v-if="armorDetailError" class="primary-button" type="button" @click="refreshArmorDetail()">重试加载</button>
          <a class="primary-button" href="/armor-sets">返回套装路线</a>
        </div>
      </section>

      <section v-else class="support-panel armor-detail-hero">
        <div class="armor-hero-shell">
          <div class="armor-hero-main">
            <span class="armor-hero-eyebrow">数值总览 · {{ armorSubtitle }}</span>
            <h1>{{ armorTitle }}</h1>
            <p>{{ armorHeroSummary }}</p>
            <div class="tag-row armor-hero-tags">
              <span class="tag gold">{{ armorDetail?.primaryPart || 'set' }}</span>
              <span class="tag moss">{{ armorDetail?.uniqueItemCount ?? 0 }} 个部件</span>
              <span class="tag paper">{{ armorShownEffects.length }} 条数值</span>
            </div>
          </div>
          <div v-if="armorPrimaryPreview" class="armor-hero-preview" aria-label="套装预览">
            <CommonPreviewImage
              :src="resolvePreviewImageUrl(armorPrimaryPreview)"
              :alt="`${armorTitle} 预览`"
              :fallback="armorDetail?.fallback || armorTitle.slice(0, 1)"
              :fallback-icon="armorPrimaryPreviewIcon"
              width="76"
              height="76"
            />
            <span>展示预览</span>
          </div>
        </div>
      </section>

      <div class="armor-analysis-layout">
        <div class="armor-primary-layout">
          <section class="support-panel armor-module armor-stat-module" :class="detailLayout.detailModuleClass">
            <div class="armor-module-head">
              <div>
                <h2>数值总览</h2>
                <p>先区分套装效果与单件效果，再按属性分组展示。</p>
              </div>
              <a class="small-button" href="/armor-sets">返回列表</a>
            </div>

            <div v-if="armorStatGroups.length" class="armor-effect-sections">
            <ArmorBuildMatrix
              :armor-set-build-cards="armorSetBuildCards"
              :armor-has-variant-builds="armorHasVariantBuilds"
              :armor-fixed-bonus-lines="armorFixedBonusLines"
              :armor-fixed-bonus-groups="armorFixedBonusGroups"
              @toggle-piece="toggleArmorPieceEvidence"
            />
            </div>
            <p v-else class="tp-detail-empty">暂无可展示的解析数值。</p>

            <div v-if="armorFallbackBenefitLines.length" class="armor-source-context">
              <span v-for="line in armorFallbackBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
            </div>
          </section>

          <aside class="armor-side-stack">
            <!-- armor-detail-right-fact-panel-not-primary: low-value fact cards are removed from the right rail. -->
            <ArmorRecipeTable
              :visible-recipe-rows="armorVisibleRecipeRows"
              :hidden-recipe-rows="armorHiddenRecipeRows"
              :recipe-total="armorSetRecipeSummaries.length"
              :empty-reason="armorRecipeUnavailableReason"
              :detail-module-class="detailLayout.detailModuleClass"
            />

            <!-- armor-preview-under-crafting: display images stay in the same right rail below the recipe module. -->
            <section v-if="imageGroups.length" class="support-panel armor-module armor-preview-module" :class="[detailLayout.detailModuleClass, armorPreviewCompactClass]">
              <div class="armor-module-head">
                <div>
                  <h2>展示图</h2>
                  <p>套装外观与部件图片。</p>
                </div>
              </div>

              <div class="armor-preview-strip">
                <section v-for="group in imageGroups" :key="group.key" class="armor-preview-group">
                  <div class="armor-preview-group-head">
                    <b>{{ group.label }}</b>
                    <span class="tag paper">{{ group.images.length }} 张</span>
                  </div>
                  <div class="armor-preview-images">
                    <CommonPreviewImage
                      v-for="image in group.images.slice(0, 12)"
                      :key="`${group.key}-${image}`"
                      :src="resolvePreviewImageUrl(image)"
                      :alt="`${armorTitle} ${group.label}`"
                      :fallback="armorDetail?.fallback || '?'"
                      :fallback-icon="group.icon"
                      width="92"
                      height="92"
                      class="armor-preview-tile"
                    />
                  </div>
                </section>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped src="../../assets/css/domains/armor-set-detail-page.css"></style>
