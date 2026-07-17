<script setup lang="ts">
import { usePublicArmorSetDetail } from '~/composables/usePublicArmorSetDetail'
import type { EquipmentEffectAttribute, PublicArmorSetListItem, PublicArmorSetRelatedItem, PublicItemRecipeTree } from '~/types/public-api'
import { createArmorSetBuildGroups } from '~/utils/armorSetBuilds.mjs'
import {
  armorBenefitLineIsAttributeSummary,
  armorEffectFromLine,
  armorEffectLineNumericMatch,
  armorEffectLinesFromLine,
  armorHighlightedTextSegments,
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

const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []
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
  () => `public-armor-set-piece-effects:${armorSetId.value || 'missing'}:${armorPieceEffectRequestKeys.value.join(',')}`,
  () => fetchArmorPieceEquipmentEffects(armorUniqueRelatedItems.value),
  {
    server: false,
    watch: [armorPieceEffectRequestKeys],
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
  () => `public-armor-set-recipes:${armorSetId.value || 'missing'}:${armorRecipeFetchKey.value}`,
  () => fetchArmorSetRecipeSummaries(armorUniqueRecipeItems.value),
  {
    server: false,
    watch: [armorRecipeFetchKey],
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
const armorPrimaryPreview = computed(() => imageGroups.value[0]?.images[0] ?? '')
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
      <div v-if="armorDetailVisualLoading" class="armor-detail-loading-skeleton">
        <section class="support-panel armor-detail-hero armor-detail-loading-hero">
          <div>
            <CommonTpSkeleton type="pill" class="armor-detail-loading-kicker" />
            <CommonTpSkeleton type="line" class="armor-detail-loading-title" />
            <CommonTpSkeleton type="line" class="armor-detail-loading-copy" />
            <CommonTpSkeleton type="line" class="armor-detail-loading-copy short" short />
            <div class="tag-row" aria-hidden="true">
              <CommonTpSkeleton type="pill" />
              <CommonTpSkeleton type="pill" />
              <CommonTpSkeleton type="pill" />
            </div>
          </div>
        </section>

        <div class="armor-analysis-layout armor-detail-loading-modules">
          <section class="support-panel armor-module armor-stat-module" :class="detailLayout.detailModuleClass">
            <div class="armor-module-head">
              <div>
                <CommonTpSkeleton type="line" class="armor-detail-loading-heading" />
                <CommonTpSkeleton type="line" class="armor-detail-loading-subheading" />
              </div>
            </div>
            <div class="armor-build-board armor-build-matrix">
              <article v-for="slot in 3" :key="`armor-detail-loading-stat-${slot}`" class="armor-build-row armor-build-mobile-card-layout armor-detail-loading-stat">
                <div class="armor-build-cell armor-build-title-cell">
                  <CommonTpSkeleton type="line" />
                </div>
                <div class="armor-build-cell armor-build-icons">
                  <span v-for="piece in 3" :key="`armor-detail-loading-stat-${slot}-${piece}`" class="armor-build-piece">
                    <CommonTpSkeleton type="icon" />
                    <CommonTpSkeleton type="line" />
                  </span>
                </div>
                <div class="armor-build-cell armor-build-defense-formula">
                  <CommonTpSkeleton type="line" />
                </div>
                <div class="armor-build-cell armor-build-difference-cell">
                  <CommonTpSkeleton type="line" />
                  <CommonTpSkeleton type="line" />
                  <CommonTpSkeleton type="line" short />
                </div>
              </article>
            </div>
          </section>

          <aside class="armor-side-stack">
            <section class="support-panel armor-module armor-crafting-module" :class="detailLayout.detailModuleClass">
              <div class="armor-module-head">
                <div>
                  <CommonTpSkeleton type="line" class="armor-detail-loading-heading" />
                  <CommonTpSkeleton type="line" class="armor-detail-loading-subheading" />
                </div>
              </div>
              <div class="armor-crafting-summary-list">
                <div v-for="slot in 3" :key="`armor-detail-loading-recipe-${slot}`" class="armor-detail-loading-recipe-row">
                  <CommonTpSkeleton type="icon" />
                  <CommonTpSkeleton type="line" />
                  <CommonTpSkeleton type="line" />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

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
            <!-- detail layout contract legacy marker: v-for="group in armorStatGroups" -->
            <!-- detail layout contract legacy marker: class="armor-stat-card-grid" class="armor-effect-card" class="armor-effect-card-value" -->
            <!-- visual contract marker: armorEffectSections armor-piece-effect-groups armor-effect-card-head.has-stat-art -->
            <!-- armor-build-comparison-first-order: this comparison section is rendered before the full piece catalog. -->
            <div class="armor-build-board armor-structured-build-board armor-build-matrix" role="table" aria-label="套装构筑对比">
              <div class="armor-build-row armor-build-row-head armor-build-mobile-hidden-header" role="row">
                <b>构筑</b>
                <b>部件</b>
                <b>防御</b>
                <b>构筑差异</b>
              </div>
              <section v-if="armorHasVariantBuilds && armorFixedBonusLines.length" class="armor-build-row armor-fixed-bonus-row" role="row">
                <div class="armor-build-cell armor-build-title-cell" role="cell">
                  <strong>全套固定</strong>
                </div>
                <div class="armor-build-cell" role="cell">
                  <span>固定部件 / 套装</span>
                </div>
                <div class="armor-build-cell armor-build-defense-formula" role="cell">
                  <span>公共</span>
                </div>
                <div class="armor-build-cell armor-fixed-bonus-lines" role="cell">
                  <div v-for="group in armorFixedBonusGroups" :key="`fixed-${group.key}`" class="armor-fixed-bonus-group" :class="group.tone">
                    <strong class="armor-fixed-bonus-group-title">{{ group.label }}</strong>
                    <span v-for="entry in group.entries" :key="`fixed-${group.key}-${entry.key}`" class="armor-fixed-bonus-line">
                      <small v-if="entry.value">{{ entry.value }}</small>
                      <b>{{ entry.text }}</b>
                      <em v-if="entry.description">{{ entry.description }}</em>
                    </span>
                  </div>
                </div>
              </section>
              <article v-for="build in armorSetBuildCards" :key="build.key" class="armor-build-row armor-build-mobile-card-layout" role="row">
                <div class="armor-build-cell armor-build-title-cell" role="cell">
                  <strong>{{ build.title }}</strong>
                </div>
                <div class="armor-build-cell armor-build-icons" role="cell">
                  <section v-for="part in build.partGroups" :key="`${build.key}-${part.key}`" class="armor-build-part-group">
                    <div class="armor-build-part-head">
                      <b>{{ part.role }}</b>
                      <small>{{ part.alternatives.length > 1 ? `${part.alternatives.length} 件可互换` : '固定' }}</small>
                    </div>
                    <div class="armor-build-part-alternatives">
                      <div
                        class="armor-build-piece-evidence armor-build-piece-evidence-compact armor-build-piece-evidence-collapsible"
                        :class="{ 'has-alternatives': part.alternatives.length > 1, 'is-expanded': part.expanded }"
                      >
                        <!-- armor-build-piece-group-summary-collapsible: each slot starts as one joined-name row and expands on demand. -->
                        <button
                          type="button"
                          class="armor-build-piece-summary"
                          :aria-describedby="part.tooltip ? part.tooltipId : undefined"
                          :aria-expanded="part.expanded ? 'true' : 'false'"
                          @click="toggleArmorPieceEvidence(`${build.key}-${part.key}`)"
                        >
                          <CommonPreviewImage
                            :src="resolvePreviewImageUrl(part.alternatives[0]?.item.image || '')"
                            :alt="part.summary"
                            :fallback="part.summary.slice(0, 1)"
                            fallback-icon="icon-items"
                            width="42"
                            height="42"
                          />
                          <span class="armor-build-piece-summary-text">
                            <b>{{ part.summary }}</b>
                            <small>{{ part.alternatives.length > 1 ? `${part.alternatives.length} 件可互换` : (part.alternatives[0]?.defense || '固定') }}</small>
                          </span>
                          <span class="armor-build-piece-summary-toggle" aria-hidden="true">
                            {{ part.expanded ? '收起' : '展开' }}
                          </span>
                          <span
                            v-if="part.tooltip"
                            :id="part.tooltipId"
                            class="armor-build-piece-summary-tooltip"
                            role="tooltip"
                          >
                            {{ part.tooltip }}
                          </span>
                        </button>
                        <!-- armor-build-piece-details-expandable: detailed per-piece data is hidden until the summary is expanded. -->
                        <div v-if="part.expanded" class="armor-build-piece-details">
                          <div v-for="piece in part.alternatives" :key="`${build.key}-${part.key}-${piece.key}`" class="armor-build-piece-detail-row">
                            <CommonPreviewImage
                              :src="resolvePreviewImageUrl(piece.item.image || '')"
                              :alt="piece.name"
                              :fallback="piece.name.slice(0, 1)"
                              fallback-icon="icon-items"
                              width="32"
                              height="32"
                            />
                            <span class="armor-build-piece-detail-copy">
                              <strong>{{ piece.name }}</strong>
                              <small v-if="piece.defense">{{ piece.defense }}</small>
                            </span>
                            <em
                              v-for="effect in piece.effects"
                              :key="`${build.key}-${part.key}-${piece.key}-${effect.key}`"
                              class="armor-build-piece-effect"
                              :class="{ 'has-tooltip armor-build-tooltip-visible-affordance armor-build-tooltip-touch-affordance': effect.title }"
                              tabindex="0"
                            >
                              {{ effect.text }}
                              <span v-if="effect.title" class="armor-build-piece-effect-info" aria-hidden="true">i</span>
                              <span v-if="effect.title" class="armor-build-piece-effect-tooltip" role="tooltip">
                                {{ effect.title }}
                              </span>
                            </em>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
                <div class="armor-build-cell armor-build-defense-formula armor-build-defense-emphasis" role="cell">
                  <strong v-if="build.defense.total != null">{{ build.defense.total }}</strong>
                  <small v-if="build.defense.formula">{{ build.defense.formula }}</small>
                  <span v-else>--</span>
                </div>
                <div class="armor-build-cell armor-build-difference-cell" role="cell">
                  <div v-if="build.statGroups.length" class="armor-build-effect-groups">
                    <div v-for="group in build.statGroups" :key="`${build.key}-${group.key}`" class="armor-fixed-bonus-group" :class="group.tone">
                      <strong class="armor-fixed-bonus-group-title">{{ group.label }}</strong>
                      <span v-for="entry in group.entries" :key="`${build.key}-${group.key}-${entry.key}`" class="armor-fixed-bonus-line">
                        <small v-if="entry.value">{{ entry.value }}</small>
                        <b>{{ entry.text }}</b>
                        <em v-if="entry.description">{{ entry.description }}</em>
                      </span>
                    </div>
                  </div>
                  <div v-if="build.totalEntries.length || build.bonusLines.length" class="armor-build-summary-stack">
                    <div v-if="build.totalEntries.length" class="armor-build-total-strip" aria-label="最终汇总">
                      <span class="armor-build-total-label armor-build-summary-title">最终汇总</span>
                      <div class="armor-build-total-entries">
                        <span
                          v-for="entry in build.totalEntries"
                          :key="`${build.key}-total-${entry.key}`"
                          class="armor-build-total-entry"
                          :class="{ 'is-variable': entry.isVariable }"
                        >
                          <mark class="armor-highlight-number">{{ entry.value }}</mark>
                          <b>{{ entry.label }}</b>
                          <em v-if="entry.isVariable">可变合计</em>
                        </span>
                      </div>
                    </div>
                    <div v-if="build.bonusLines.length" class="armor-set-bonus-lines">
                      <strong class="armor-set-bonus-heading">套装效果</strong>
                      <div class="armor-set-bonus-list">
                        <p v-for="line in build.bonusLines" :key="`${build.key}-bonus-${line}`" class="armor-set-bonus-line">
                          <template v-for="segment in armorHighlightedTextSegments(line)" :key="`${build.key}-${line}-${segment.key}`">
                            <mark v-if="segment.highlight" class="armor-highlight-number">{{ segment.text }}</mark>
                            <span v-else>{{ segment.text }}</span>
                          </template>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
            </div>
            <p v-else class="tp-detail-empty">暂无可展示的解析数值。</p>

            <div v-if="armorFallbackBenefitLines.length" class="armor-source-context">
              <span v-for="line in armorFallbackBenefitLines" :key="`benefit-${line}`">{{ line }}</span>
            </div>
          </section>

          <aside class="armor-side-stack">
            <!-- armor-detail-right-fact-panel-not-primary: low-value fact cards are removed from the right rail. -->
            <section class="support-panel armor-module armor-crafting-module" :class="detailLayout.detailModuleClass">
              <div class="armor-module-head">
                <div>
                  <h2>制作配方</h2>
                  <p>相同制作站合并显示；不同制作站保留逐行归属。</p>
                </div>
                <span class="tag paper">{{ armorSetRecipeSummaries.length ? `${armorSetRecipeSummaries.length} 个部件` : '暂无配方' }}</span>
              </div>

              <div v-if="armorSetRecipeSummaries.length" class="armor-crafting-summary-list">
                <table class="armor-crafting-table">
                  <thead class="armor-crafting-table-head">
                    <tr>
                      <th>部件</th>
                      <th>材料</th>
                      <th>制作站</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="recipe in armorVisibleRecipeRows" :key="recipe.key" class="armor-crafting-summary-row">
                      <td class="armor-crafting-piece-cell">
                        <div class="armor-crafting-piece">
                          <CommonPreviewImage
                            :src="recipe.image"
                            :alt="recipe.name"
                            :fallback="recipe.fallback"
                            fallback-icon="icon-items"
                            width="32"
                            height="32"
                          />
                          <span>
                            <b>{{ recipe.name }}</b>
                            <small>{{ recipe.role }} · {{ recipe.recipeCount }} 条</small>
                          </span>
                        </div>
                      </td>

                      <td class="armor-crafting-chip-line" aria-label="材料摘要">
                        <CraftingCompactRecipeMaterials :materials="recipe.materials" />
                      </td>

                      <td
                        v-if="recipe.showStationCell"
                        class="armor-crafting-station-cell is-merged"
                        :rowspan="recipe.stationRowspan"
                      >
                        <template v-if="recipe.stations.length">
                          <span v-for="(station, index) in recipe.stations" :key="`${recipe.key}-station-${station.key}`" class="armor-crafting-station-text">
                            <CommonPreviewImage
                              :src="station.image"
                              :alt="station.name"
                              :fallback="station.fallback"
                              fallback-icon="icon-crafting"
                              width="18"
                              height="18"
                            />
                            <b>{{ station.name }}</b>
                            <em v-if="index < recipe.stations.length - 1">或</em>
                          </span>
                        </template>
                        <span v-else class="armor-crafting-station is-empty">无需制作站</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <details v-if="armorHiddenRecipeSummaries.length" class="armor-crafting-overflow armor-crafting-overflow-collapsed">
                  <summary>展开其余 {{ armorHiddenRecipeSummaries.length }} 个部件配方</summary>
                  <div class="armor-crafting-overflow-list">
                    <table class="armor-crafting-table">
                      <thead class="armor-crafting-table-head">
                        <tr>
                          <th>部件</th>
                          <th>材料</th>
                          <th>制作站</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="recipe in armorHiddenRecipeRows" :key="`hidden-${recipe.key}`" class="armor-crafting-summary-row">
                          <td class="armor-crafting-piece-cell">
                            <div class="armor-crafting-piece">
                              <CommonPreviewImage
                                :src="recipe.image"
                                :alt="recipe.name"
                                :fallback="recipe.fallback"
                                fallback-icon="icon-items"
                                width="32"
                                height="32"
                              />
                              <span>
                                <b>{{ recipe.name }}</b>
                                <small>{{ recipe.role }} · {{ recipe.recipeCount }} 条</small>
                              </span>
                            </div>
                          </td>

                          <td class="armor-crafting-chip-line" aria-label="材料摘要">
                            <CraftingCompactRecipeMaterials :materials="recipe.materials" />
                          </td>

                          <td
                            v-if="recipe.showStationCell"
                            class="armor-crafting-station-cell is-merged"
                            :rowspan="recipe.stationRowspan"
                          >
                            <template v-if="recipe.stations.length">
                              <span v-for="(station, index) in recipe.stations" :key="`${recipe.key}-hidden-station-${station.key}`" class="armor-crafting-station-text">
                                <CommonPreviewImage
                                  :src="station.image"
                                  :alt="station.name"
                                  :fallback="station.fallback"
                                  fallback-icon="icon-crafting"
                                  width="18"
                                  height="18"
                                />
                                <b>{{ station.name }}</b>
                                <em v-if="index < recipe.stations.length - 1">或</em>
                              </span>
                            </template>
                            <span v-else class="armor-crafting-station is-empty">无需制作站</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
              <div v-else class="armor-crafting-empty-state" aria-live="polite">
                <span class="sprite-icon icon-crafting" aria-hidden="true"></span>
                <div>
                  <b>暂无可展示的制作配方</b>
                  <p>{{ armorRecipeUnavailableReason }}</p>
                </div>
              </div>

            </section>

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

<style scoped>
.armor-detail-hero {
  padding: 18px 20px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(var(--theme-panel-rgb), 0.12), rgba(var(--theme-bg-2-rgb), 0.08) 48%, transparent),
    var(--index-grid-x),
    var(--index-grid-y),
    var(--tp-color-surface);
  background-size: auto, 40px 40px, 40px 40px, auto;
}

.armor-hero-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  min-width: 0;
}

.armor-detail-loading-skeleton {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.armor-detail-loading-hero {
  min-height: 176px;
}

.armor-detail-loading-hero > div,
.armor-detail-loading-modules {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.armor-detail-loading-kicker {
  width: min(180px, 58%);
}

.armor-detail-loading-title {
  width: min(360px, 78%);
  height: 30px;
}

.armor-detail-loading-copy {
  width: min(560px, 100%);
}

.armor-detail-loading-copy.short,
.armor-detail-loading-subheading {
  width: min(360px, 72%);
}

.armor-detail-loading-heading {
  width: min(220px, 66%);
}

.armor-detail-loading-stat,
.armor-detail-loading-recipe-row {
  pointer-events: none;
}

.armor-detail-loading-stat .armor-build-piece {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.armor-detail-loading-stat .tp-skeleton-icon {
  width: 38px;
  height: 38px;
}

.armor-detail-loading-recipe-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(92px, 0.42fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
  border-bottom: 1px solid var(--tp-color-border);
}

.armor-detail-loading-recipe-row .tp-skeleton-icon {
  width: 32px;
  height: 32px;
}

.armor-hero-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  color: var(--tp-color-accent);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-hero-eyebrow::before {
  content: "";
  width: 28px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
  flex: 0 0 auto;
}

.armor-detail-hero h1 {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: clamp(26px, 3vw, 38px);
  font-weight: 950;
  line-height: 1.08;
  overflow-wrap: anywhere;
}

.armor-detail-hero p {
  max-width: 900px;
  margin: 0;
  color: var(--tp-color-text);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.armor-hero-tags {
  margin-top: 2px;
}

.armor-hero-tags .tag {
  min-height: 26px;
  border-radius: 7px;
  padding: 4px 8px;
  font-size: 11px;
}

.armor-hero-preview {
  display: grid;
  gap: 7px;
  justify-items: center;
  min-width: 96px;
  padding: 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background: var(--tp-color-surface-raised);
}

.armor-hero-preview :deep(.item-art) {
  width: 76px;
  height: 76px;
  border-radius: 10px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-hero-preview span {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
}

.armor-module-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: start;
  justify-content: space-between;
}

.armor-module-head > div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.armor-module-head h2 {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: 18px;
  line-height: 1.25;
}

.armor-module-head p {
  margin: 0;
  color: var(--tp-color-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.armor-source-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--tp-color-border);
  color: var(--tp-color-text-strong);
  font-size: 13px;
  line-height: 1.7;
}

.armor-source-context span {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 999px;
  background: var(--tp-color-surface-raised);
  overflow-wrap: anywhere;
}

.armor-crafting-summary-list {
  display: grid;
  min-width: 0;
  border: 1px solid var(--tp-color-border);
  border-radius: 7px;
  background: var(--tp-color-surface-raised);
  overflow-x: visible;
  overflow-y: visible;
}

.armor-crafting-table {
  width: 100%;
  min-width: 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.armor-crafting-table th,
.armor-crafting-table td {
  min-width: 0;
  padding: 7px 8px;
  border-top: 1px solid var(--tp-color-border);
  border-left: 1px solid var(--tp-color-border);
  vertical-align: middle;
  text-align: center;
}

.armor-crafting-table th:first-child,
.armor-crafting-table td:first-child {
  border-left: 0;
}

.armor-crafting-table tbody tr:first-child td {
  border-top: 0;
}

.armor-crafting-table th:nth-child(1),
.armor-crafting-table td:nth-child(1) {
  width: 38%;
}

.armor-crafting-table th:nth-child(2),
.armor-crafting-table td:nth-child(2) {
  width: 32%;
}

.armor-crafting-table th:nth-child(3),
.armor-crafting-table td:nth-child(3) {
  width: 30%;
}

.armor-crafting-table-head {
  border-bottom: 1px solid var(--tp-color-border);
  background: color-mix(in srgb, var(--tp-color-accent) 5%, var(--tp-color-surface));
}

.armor-crafting-table-head th {
  min-width: 0;
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 950;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-crafting-summary-row {
  background: var(--tp-color-surface-raised);
}

.armor-crafting-piece-cell {
  text-align: left;
}

.armor-crafting-piece {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0;
  text-align: left;
}

.armor-crafting-piece :deep(.item-art),
.armor-crafting-chip :deep(.item-art),
.armor-crafting-station-text :deep(.item-art) {
  border-radius: 7px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-crafting-piece span {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.armor-crafting-piece b,
.armor-crafting-chip-compact b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: normal;
  word-break: keep-all;
}

.armor-crafting-piece small,
.armor-crafting-chip-compact small {
  color: var(--tp-color-text-muted);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
}

.armor-crafting-chip-line {
  min-width: 0;
  text-align: center;
}

.armor-crafting-material-list {
  display: grid;
  gap: 5px;
  justify-items: center;
  min-width: 0;
}

.armor-crafting-material-row {
  display: grid;
  justify-items: center;
  gap: 3px;
  min-width: 0;
}

.armor-crafting-any-material {
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  padding: 3px 4px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tp-color-positive) 6%, var(--tp-color-surface));
}

.armor-crafting-any-option {
  display: inline-grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 3px;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

.armor-crafting-any-option b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 10px;
  font-weight: 850;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.armor-crafting-any-label {
  display: grid;
  justify-items: center;
  gap: 0;
  min-width: 0;
  padding: 2px 0;
  color: var(--tp-color-text-muted);
  font-size: 9px;
  font-weight: 850;
  line-height: 1.15;
}

.armor-crafting-any-label b,
.armor-crafting-any-label small {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.armor-crafting-chip-compact {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: center;
}

.armor-crafting-chip-art {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  overflow: hidden;
}

.armor-crafting-chip-compact :deep(.item-art) {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 5px;
  --tp-preview-image-size: 18px;
  --tp-preview-fallback-icon-size: 14px;
}

.armor-crafting-chip-compact :deep(.item-art img),
.armor-crafting-station-text :deep(.item-art img) {
  width: 18px;
  height: 18px;
  max-width: 18px;
  max-height: 18px;
}

.armor-crafting-chip-copy {
  display: grid;
  gap: 0;
  min-width: 48px;
  max-width: 76px;
}

.armor-crafting-chip-compact b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
}

.armor-crafting-chip-compact small {
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.armor-crafting-chip-line em {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 850;
}

.armor-crafting-station-cell {
  min-width: 0;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-positive) 4%, transparent), color-mix(in srgb, var(--tp-color-accent) 3%, transparent)),
    var(--tp-color-surface);
}

.armor-crafting-station-cell.is-merged {
  text-align: center;
  vertical-align: middle;
}

.armor-crafting-station-text {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 4px;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
}

.armor-crafting-station-text + .armor-crafting-station-text {
  margin-top: 4px;
}

.armor-crafting-station-text :deep(.item-art) {
  width: 18px;
  height: 18px;
  --tp-preview-image-size: 18px;
  --tp-preview-fallback-icon-size: 14px;
}

.armor-crafting-station-text b {
  min-width: 0;
  color: var(--tp-color-positive);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: normal;
  word-break: keep-all;
}

.armor-crafting-station-text em {
  display: block;
  width: 100%;
  grid-column: 1 / -1;
  color: var(--tp-color-accent);
  font-size: 10px;
  font-style: normal;
  font-weight: 950;
  line-height: 1;
}

.armor-crafting-station.is-empty {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 850;
}

.armor-crafting-overflow {
  display: grid;
  gap: 0;
  min-width: 0;
  border-top: 1px solid var(--tp-color-border);
}

.armor-crafting-overflow summary {
  width: fit-content;
  max-width: 100%;
  margin: 8px 10px;
  padding: 7px 9px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 6px;
  background: color-mix(in srgb, var(--tp-color-accent) 7%, var(--tp-color-surface));
  color: var(--tp-color-accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
  list-style: none;
}

.armor-crafting-overflow summary::-webkit-details-marker {
  display: none;
}

.armor-crafting-overflow-list {
  display: grid;
  gap: 0;
  min-width: 0;
}

.armor-analysis-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.armor-primary-layout {
  display: grid;
  grid-template-columns: minmax(0, 2.35fr) minmax(300px, 1fr);
  gap: 18px;
  align-items: start;
  min-width: 0;
}

.armor-module {
  padding: 18px;
}

.armor-stat-module,
.armor-preview-module,
.armor-crafting-module {
  min-width: 0;
  align-content: start;
}

.armor-side-stack {
  display: grid;
  gap: 14px;
  align-content: start;
  min-width: 0;
  position: sticky;
  top: 14px;
}

.armor-crafting-empty-state {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 5%, transparent), color-mix(in srgb, var(--tp-color-positive) 4%, transparent)),
    var(--tp-color-surface);
}

.armor-crafting-empty-state > span {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background-color: color-mix(in srgb, var(--tp-color-accent) 7%, var(--tp-color-surface-raised));
  opacity: 0.88;
}

.armor-crafting-empty-state div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.armor-crafting-empty-state b {
  color: var(--tp-color-text-strong);
  font-size: 13px;
  line-height: 1.35;
}

.armor-crafting-empty-state p {
  margin: 0;
  color: var(--tp-color-text-muted);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.armor-stat-groups {
  display: grid;
  gap: 18px;
}

.armor-effect-sections {
  display: grid;
  gap: 18px;
}

.armor-effect-section {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background: var(--tp-color-surface);
}

.armor-effect-section-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--tp-color-border);
}

.armor-effect-section-head h3 {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: 16px;
  line-height: 1.35;
}

.armor-effect-section-head span {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.armor-piece-effect-groups {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.armor-piece-effect-group {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background: var(--tp-color-surface-raised);
}

.armor-effect-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background: var(--tp-color-surface-raised);
}

.armor-build-board {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.armor-build-matrix {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-build-row {
  display: grid;
  grid-template-columns: minmax(96px, 0.65fr) minmax(210px, 1.1fr) minmax(92px, 0.44fr) minmax(220px, 1.35fr);
  gap: 10px;
  align-items: stretch;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 3%, transparent), color-mix(in srgb, var(--tp-color-positive) 2%, transparent)),
    var(--tp-color-surface);
}

.armor-build-row-head {
  padding: 6px 10px;
  border-color: var(--tp-color-border);
  background: color-mix(in srgb, var(--tp-color-accent) 4%, var(--tp-color-surface));
}

.armor-build-row-head b {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.25;
}

.armor-fixed-bonus-row {
  border-color: var(--tp-color-border-strong);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 5%, transparent), color-mix(in srgb, var(--tp-color-positive) 3%, transparent)),
    var(--tp-color-surface-raised);
}

.armor-fixed-bonus-row .armor-build-title-cell strong {
  color: var(--tp-color-accent);
}

.armor-build-cell {
  display: flex;
  min-width: 0;
  align-items: center;
}

.armor-build-cell > span {
  color: var(--tp-color-text-muted);
  font-size: 12.5px;
  font-weight: 800;
  line-height: 1.35;
}

.armor-build-title-cell strong {
  color: var(--tp-color-text-strong);
  font-size: 14px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.armor-equipment-section {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.armor-equipment-section h3 {
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--tp-color-border);
  color: var(--tp-color-text-strong);
  font-size: 20px;
  line-height: 1.25;
}

.armor-equipment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  min-width: 0;
}

.armor-equipment-card {
  display: grid;
  gap: 10px;
  align-content: start;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 3%, transparent), color-mix(in srgb, var(--tp-color-positive) 2%, transparent)),
    var(--tp-color-surface);
}

.armor-equipment-card-title {
  display: grid;
  place-items: center;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid var(--tp-color-border);
  border-radius: 7px;
  background: var(--tp-color-surface-raised);
}

.armor-equipment-card-title h4 {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: 16px;
  line-height: 1.25;
  text-align: center;
  overflow-wrap: anywhere;
}

.armor-equipment-card-image {
  justify-self: center;
}

.armor-equipment-card-image :deep(.item-art) {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  overflow: hidden;
}

.armor-build-icons {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.armor-build-part-group {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.armor-build-part-head {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.armor-build-part-head b {
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
}

.armor-build-part-head small {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.2;
}

.armor-build-part-alternatives {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.armor-build-piece-evidence {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 6px;
  background: var(--tp-color-surface-raised);
}

.armor-build-piece-evidence.has-alternatives {
  border-color: var(--tp-color-border-strong);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 4%, transparent), color-mix(in srgb, var(--tp-color-positive) 2%, transparent)),
    var(--tp-color-surface-raised);
}

.armor-build-piece-summary {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 3px 9px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.armor-build-icons :deep(.item-art) {
  justify-self: center;
  width: 42px;
  height: 42px;
  border-radius: 7px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-build-piece-summary-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.armor-build-piece-summary-text b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-summary-text small,
.armor-build-icons small {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
}

.armor-build-piece-summary-toggle {
  justify-self: end;
  padding: 3px 7px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 999px;
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.1;
}

.armor-build-piece-summary-tooltip {
  position: absolute;
  z-index: 24;
  left: 0;
  bottom: calc(100% + 7px);
  display: none;
  width: max-content;
  max-width: min(360px, 74vw);
  padding: 8px 10px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 6px;
  background: var(--tp-color-surface-strong);
  color: var(--tp-color-text);
  box-shadow: 0 12px 26px rgba(var(--theme-text-rgb), 0.18);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
  white-space: normal;
  pointer-events: none;
}

/* armor-build-piece-summary-tooltip-hover-focus: summary hover/focus reveals concrete values from real piece data. */
.armor-build-piece-summary:hover .armor-build-piece-summary-tooltip,
.armor-build-piece-summary:focus-visible .armor-build-piece-summary-tooltip {
  display: block;
}

.armor-build-piece-details {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding-top: 5px;
  border-top: 1px solid var(--tp-color-border);
}

.armor-build-piece-detail-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  min-width: 0;
}

.armor-build-piece-detail-row :deep(.item-art) {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-build-piece-detail-row :deep(.item-art img) {
  max-width: 32px;
  max-height: 32px;
  object-fit: contain;
}

.armor-build-piece-detail-copy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  align-items: center;
  min-width: 0;
}

.armor-build-piece-detail-row strong {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 11px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-detail-row small {
  justify-self: end;
}

.armor-build-piece-evidence em {
  position: relative;
  grid-column: 2;
  min-width: 0;
  color: var(--tp-color-text-muted);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-build-piece-effect.has-tooltip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  cursor: help;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.armor-build-piece-effect-info {
  display: inline-grid;
  place-items: center;
  width: 13px;
  height: 13px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 999px;
  color: var(--tp-color-accent);
  font-size: 9px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
  flex: 0 0 auto;
}

.armor-build-piece-effect-tooltip {
  position: absolute;
  z-index: 20;
  left: 0;
  bottom: calc(100% + 6px);
  display: none;
  width: max-content;
  max-width: min(320px, 70vw);
  padding: 7px 9px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 6px;
  background: var(--tp-color-surface-strong);
  color: var(--tp-color-text);
  box-shadow: 0 10px 24px rgba(var(--theme-text-rgb), 0.16);
  font-size: 11px;
  font-weight: 750;
  line-height: 1.45;
  white-space: normal;
  pointer-events: none;
}

.armor-build-piece-effect.has-tooltip:hover .armor-build-piece-effect-tooltip,
.armor-build-piece-effect.has-tooltip:focus-visible .armor-build-piece-effect-tooltip {
  display: block;
}

.armor-build-defense-formula {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 7px;
  align-items: center;
  min-width: 0;
}

.armor-build-defense-formula strong {
  color: var(--tp-color-text-strong);
  font-size: 26px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.armor-build-defense-formula small,
.armor-build-defense-formula span {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.armor-build-stat-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
}

.armor-build-stat-lines span {
  color: var(--tp-color-text-strong);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-lines {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px 10px;
  align-content: center;
  align-items: stretch;
}

.armor-build-difference-cell {
  display: grid;
  gap: 8px;
  align-content: start;
  align-items: stretch;
  min-width: 0;
}

.armor-build-effect-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 10px;
  align-content: center;
  align-items: stretch;
}

.armor-build-summary-stack {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.armor-build-total-strip {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--tp-color-positive) 28%, var(--tp-color-border));
  border-radius: 7px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-positive) 7%, transparent), color-mix(in srgb, var(--tp-color-accent) 4%, transparent)),
    var(--tp-color-surface-raised);
}

.armor-build-total-label,
.armor-set-bonus-heading {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  color: var(--tp-color-positive);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
}

.armor-set-bonus-lines {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 0 1px;
}

.armor-set-bonus-list {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.armor-set-bonus-heading {
  color: var(--tp-color-positive);
}

.armor-build-total-entries {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 7px;
  align-items: center;
  min-width: 0;
}

.armor-build-total-entry {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--tp-color-text);
  font-size: 13px;
  font-weight: 850;
  line-height: 1.24;
}

.armor-build-total-entry.is-variable {
  color: var(--tp-color-text-strong);
}

.armor-build-total-entry em {
  color: var(--tp-color-accent);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  line-height: 1.2;
}

.armor-set-bonus-line {
  position: relative;
  margin: 0;
  padding-left: 10px;
  color: var(--tp-color-text);
  font-size: 13px;
  font-weight: 730;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.armor-set-bonus-line::before {
  position: absolute;
  top: 0.72em;
  left: 1px;
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--tp-color-positive);
  content: '';
}

.armor-highlight-number {
  padding: 0 3px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--tp-color-accent) 8%, var(--tp-color-surface));
  color: var(--tp-color-accent);
  font-weight: 930;
}

.armor-fixed-bonus-group {
  display: grid;
  gap: 3px;
  min-width: 0;
  align-content: start;
}

.armor-fixed-bonus-group-title {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  margin-bottom: 2px;
  padding: 2px 7px;
  border: 1px solid var(--tp-color-border);
  border-radius: 999px;
  background: var(--tp-color-surface-raised);
  color: var(--tp-color-text-muted);
  font-size: 10px;
  font-weight: 900;
  line-height: 1.25;
}

.armor-fixed-bonus-group.is-attribute .armor-fixed-bonus-group-title {
  color: var(--tp-color-accent);
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-group-title {
  color: var(--tp-color-positive);
}

.armor-fixed-bonus-line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 5px 8px;
  align-items: start;
  min-width: 0;
  padding: 5px 0;
  border-bottom: 1px solid var(--tp-color-border);
}

.armor-fixed-bonus-line small {
  display: inline-grid;
  place-items: center;
  min-width: 36px;
  min-height: 20px;
  padding: 0 6px;
  border: 1px solid var(--tp-color-border-strong);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tp-color-accent) 7%, var(--tp-color-surface));
  color: var(--tp-color-accent);
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.armor-fixed-bonus-line b {
  min-width: 0;
  color: var(--tp-color-text-strong);
  font-size: 12px;
  font-weight: 760;
  line-height: 1.42;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-line em {
  grid-column: 2;
  min-width: 0;
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-line {
  grid-template-columns: minmax(0, 1fr);
}

.armor-fixed-bonus-group.is-description .armor-fixed-bonus-line b {
  color: var(--tp-color-text);
  font-weight: 720;
}

.armor-equipment-card-panel {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--tp-color-border);
  border-radius: 7px;
  background: var(--tp-color-surface);
}

.armor-equipment-card-panel b {
  justify-self: stretch;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--tp-color-border);
  color: var(--tp-color-text-strong);
  font-size: 13px;
  text-align: center;
}

.armor-equipment-card-panel p {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.armor-equipment-card-panel strong {
  color: var(--tp-color-text-muted);
  font-weight: 900;
}

.armor-stat-group {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.armor-stat-group h3,
.armor-stat-group h4 {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: 15px;
  line-height: 1.35;
}

.armor-stat-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}

.armor-effect-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 4%, transparent), color-mix(in srgb, var(--tp-color-positive) 3%, transparent)),
    var(--tp-color-surface-raised);
}

.armor-effect-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.armor-effect-card-head.has-stat-art {
  grid-template-columns: 42px minmax(0, 1fr) auto;
}

.armor-stat-art {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background:
    radial-gradient(circle at 35% 28%, rgba(var(--theme-panel-rgb), 0.18), transparent 34%),
    var(--tp-color-surface-raised);
  color: var(--tp-color-text-strong);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tp-color-border) 55%, transparent);
}

.armor-stat-art :deep(.item-art) {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  box-shadow: 0 3px 10px rgba(var(--theme-text-rgb), 0.14);
  overflow: hidden;
}

.armor-stat-art.is-offense {
  background:
    radial-gradient(circle at 34% 28%, rgba(var(--theme-panel-rgb), 0.2), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 12%, transparent), color-mix(in srgb, var(--tp-color-positive) 5%, transparent));
}

.armor-stat-art.is-mobility {
  background:
    radial-gradient(circle at 34% 28%, rgba(var(--theme-panel-rgb), 0.18), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-positive) 10%, transparent), color-mix(in srgb, var(--tp-color-accent) 4%, transparent));
}

.armor-stat-art.is-defense {
  background:
    radial-gradient(circle at 34% 28%, rgba(var(--theme-panel-rgb), 0.18), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-positive) 9%, transparent), color-mix(in srgb, var(--tp-color-accent) 5%, transparent));
}

.armor-stat-art.is-resource {
  background:
    radial-gradient(circle at 34% 28%, rgba(var(--theme-panel-rgb), 0.18), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 9%, transparent), color-mix(in srgb, var(--tp-color-positive) 6%, transparent));
}

.armor-stat-art.is-summon,
.armor-stat-art.is-special {
  background:
    radial-gradient(circle at 34% 28%, rgba(var(--theme-panel-rgb), 0.18), transparent 34%),
    linear-gradient(135deg, color-mix(in srgb, var(--tp-color-accent) 10%, transparent), color-mix(in srgb, var(--tp-color-positive) 5%, transparent));
}

.armor-stat-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.armor-stat-name {
  display: inline-flex;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-stat-title small {
  color: var(--tp-color-text-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.armor-effect-card-value {
  color: var(--tp-color-text-strong);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.armor-effect-card p {
  margin: 0;
  color: var(--tp-color-text-strong);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.armor-effect-scope {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-pieces-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, 220px);
  gap: 14px;
  align-items: start;
}

.armor-fact-panel {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.armor-fact-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 10px;
  align-items: baseline;
  padding: 10px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background: var(--tp-color-surface-raised);
}

.armor-fact-row span,
.armor-fact-row small {
  min-width: 0;
  color: var(--tp-color-text-muted);
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-fact-row strong {
  color: var(--tp-color-text-strong);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  line-height: 1;
}

.armor-fact-row small {
  grid-column: 1 / -1;
}

.armor-piece-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.armor-piece-card {
  display: grid;
  gap: 14px;
  align-content: start;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--tp-color-border);
  border-radius: 8px;
  background: var(--tp-color-surface);
}

.armor-piece-card-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  min-width: 0;
}

.armor-piece-card-head b {
  color: var(--tp-color-text-strong);
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.armor-piece-card-head span {
  color: var(--tp-color-text-muted);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
}

.armor-piece-options {
  display: grid;
  gap: 9px;
}

.armor-piece-option {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
  padding: 8px 0;
  border-top: 1px solid var(--tp-color-border);
}

.armor-piece-option :deep(.item-art) {
  justify-self: center;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  --tp-preview-visible-shift-x: 0px !important;
  --tp-preview-visible-shift-y: 0px !important;
}

.armor-piece-option:first-child {
  padding-top: 0;
  border-top: 0;
}

.armor-piece-option span {
  color: var(--tp-color-text-strong);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.armor-preview-strip {
  display: grid;
  align-content: start;
  gap: 14px;
}

.armor-preview-group {
  display: grid;
  gap: 10px;
  min-width: 0;
  align-content: start;
}

.armor-preview-group-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  align-items: center;
  justify-content: space-between;
}

.armor-preview-group-head b {
  color: var(--tp-color-text-strong);
  font-size: 13px;
  line-height: 1.4;
}

.armor-preview-images {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(156px, 156px));
  justify-content: start;
  gap: 16px;
}

.armor-preview-module--compact .armor-preview-strip {
  grid-template-columns: repeat(auto-fit, minmax(128px, max-content));
  gap: 16px;
}

.armor-preview-module--compact {
  width: fit-content;
  max-width: 100%;
  justify-self: start;
}

.armor-side-stack .armor-preview-module--compact {
  width: 100%;
  justify-self: stretch;
}

.armor-preview-module--compact .armor-preview-images {
  grid-template-columns: repeat(auto-fit, minmax(118px, 118px));
}

.armor-preview-tile :deep(.item-art) {
  width: 156px;
  height: 156px;
  border-radius: 14px;
  overflow: hidden;
  --tp-preview-image-size: 156px;
  --tp-preview-fallback-icon-size: 58px;
}

.armor-preview-tile :deep(.item-art img) {
  width: auto;
  height: auto;
  max-width: 156px;
  max-height: 156px;
  object-fit: contain;
}

.armor-preview-module--compact .armor-preview-tile :deep(.item-art) {
  width: 118px;
  height: 118px;
  border-radius: 12px;
  --tp-preview-image-size: 118px;
  --tp-preview-fallback-icon-size: 46px;
}

.armor-preview-module--compact .armor-preview-tile :deep(.item-art img) {
  max-width: 118px;
  max-height: 118px;
}

@media (max-width: 980px) {
  .armor-primary-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .armor-side-stack {
    position: static;
  }

  .armor-analysis-layout {
    grid-template-columns: 1fr;
  }
  .armor-pieces-layout {
    grid-template-columns: 1fr;
  }

  .armor-build-row {
    grid-template-columns: minmax(0, 0.74fr) minmax(0, 1.26fr);
  }

  .armor-build-row-head {
    display: none;
  }
}

@media (max-width: 520px) {
  .armor-detail-hero {
    padding: 14px;
  }

  .armor-hero-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .armor-hero-preview {
    grid-template-columns: 52px minmax(0, 1fr);
    justify-items: start;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 8px;
  }

  .armor-hero-preview :deep(.item-art) {
    width: 52px;
    height: 52px;
    border-radius: 8px;
  }

  .armor-detail-hero h1 {
    font-size: 24px;
  }

  .armor-detail-hero p {
    font-size: 14px;
    line-height: 1.55;
  }

  .armor-crafting-summary-list {
    overflow-x: auto;
  }

  .armor-crafting-table {
    min-width: 420px;
  }

  .armor-crafting-table th,
  .armor-crafting-table td {
    padding: 7px 6px;
  }

  .armor-crafting-piece {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .armor-crafting-piece :deep(.item-art) {
    width: 22px;
    height: 22px;
  }

  .armor-build-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
  }

  .armor-build-title-cell {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--tp-color-border);
  }

  .armor-build-title-cell strong {
    font-size: 15px;
  }

  .armor-build-defense-formula {
    order: 1;
    align-items: baseline;
  }

  .armor-build-difference-cell {
    order: 2;
  }

  .armor-build-icons {
    order: 3;
  }

  .armor-build-total-strip {
    padding: 10px;
  }

  .armor-build-total-entry {
    font-size: 12.5px;
  }

  .armor-build-part-alternatives {
    grid-template-columns: 1fr;
  }

  .armor-build-piece-evidence {
    grid-template-columns: 1fr;
    padding: 6px 7px;
  }

  .armor-build-piece-evidence .armor-build-piece-effect {
    display: none;
  }

  .armor-build-piece-evidence:focus-within .armor-build-piece-effect,
  .armor-build-piece-evidence:hover .armor-build-piece-effect,
  .armor-build-piece-evidence.is-expanded .armor-build-piece-effect {
    display: inline-flex;
  }

  .armor-build-icons :deep(.item-art) {
    width: 34px;
    height: 34px;
  }

  .armor-effect-card-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .armor-effect-card-head.has-stat-art {
    grid-template-columns: 38px minmax(0, 1fr);
  }

  .armor-stat-art {
    width: 38px;
    height: 38px;
  }

  .armor-effect-card-value {
    grid-column: 1 / -1;
    justify-self: start;
    font-size: 20px;
  }
}

@media (hover: none), (pointer: coarse) {
  .armor-build-piece-effect.has-tooltip {
    display: grid;
    gap: 3px;
    text-decoration: none;
  }

  .armor-build-piece-effect-info {
    display: none;
  }

  .armor-build-piece-effect-tooltip {
    position: static;
    display: block;
    width: auto;
    max-width: 100%;
    padding: 4px 6px;
    border-color: var(--tp-color-border-strong);
    background: color-mix(in srgb, var(--tp-color-accent) 8%, transparent);
    box-shadow: none;
    color: var(--tp-color-text);
    font-size: 10px;
    line-height: 1.35;
  }

  .armor-build-piece-evidence .armor-build-piece-effect.has-tooltip {
    display: none;
  }

  .armor-build-piece-evidence:focus-within .armor-build-piece-effect.has-tooltip,
  .armor-build-piece-evidence:hover .armor-build-piece-effect.has-tooltip,
  .armor-build-piece-evidence.is-expanded .armor-build-piece-effect.has-tooltip {
    display: grid;
  }
}
</style>
