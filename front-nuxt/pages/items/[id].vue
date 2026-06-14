<script setup lang="ts">
import RecipeSummaryCard from '~/components/crafting/RecipeSummaryCard.vue'
import { usePublicItemDetail } from '~/composables/usePublicItemDetail'
import { buildTerrariaPriceTokens, formatTerrariaPriceTokens, localizeTerrariaPriceShorthandText, toPriceNumber, type TerrariaPriceToken } from '~/utils/price'
import type {
  PublicItemArmorAttribute,
  PublicItemBuffEffect,
  PublicItemDetail,
  PublicItemDetailBundle,
  PublicItemEquipmentEffect,
  PublicItemImage,
  PublicItemRecipe,
  PublicItemRecipeIngredient,
  PublicItemRecipeStation,
  PublicItemRecipeTree,
  PublicItemRecipeTreeVariant,
  PublicItemSource,
  PublicItemTreasureBagLoot,
} from '~/types/public-api'

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'item', density: 'readable' })
const authStore = useUserAuthStore()
const favoritesStore = useUserFavoritesStore()
const historyStore = useUserHistoryStore()

const itemId = computed(() => String(route.params.id ?? '').trim())
const { data: detailBundle, pending: detailPending, error: detailError } = await usePublicItemDetail(itemId)
const detailClientReady = ref(false)
const selectedRecipeVariantKey = ref('')
const favoriteError = ref('')
const recordedItemHistoryIds = new Set<string>()
const recipeUsagePreviewLimit = 6
const recipeUsageExpanded = ref(false)

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }

  return ''
}

const firstNumberText = (...values: unknown[]) => {
  const text = firstText(...values)
  return text || ''
}

const firstImageUrl = (...values: unknown[]) => resolvePreviewImageUrl(firstText(...values))
const rawPublicCopyPattern = /{{|}}|<\/?[a-z][\s\S]*?>|https?:\/\/|wiki\.gg|iteminfo|eicons|internal|wiki\s*(?:page|path)|(?:^|[\s_-])shop[\s_/-]*\d+(?:[\s_/-]*\d+)*(?:$|[\s_-])/i
const safeItemDisplayText = (...values: unknown[]) => {
  for (const value of values) {
    const text = firstText(value).replace(/\s+/g, ' ')
    if (text && !rawPublicCopyPattern.test(text)) return text
  }

  return ''
}
const mostlyAsciiPattern = /[A-Za-z][A-Za-z\s,'().|/-]{18,}/
const itemSourcePhraseLabels: Array<[RegExp, string]> = [
  [/\bCrafted by hand\b/gi, '徒手制作'],
  [/\bBy Hand\b/gi, '徒手'],
  [/\bAny Wood\b/gi, '任何木材'],
  [/\bGel\b/gi, '凝胶'],
  [/\bTorch\b/gi, '火把'],
  [/\bRecipe ingredients\b/gi, '配方材料'],
  [/\bUnderground\b/gi, '地下'],
  [/\bFrom Zombies\b/gi, '来自僵尸'],
  [/\bTorch Zombie\b/gi, '火把僵尸'],
  [/\bFrom the King Slime\b/gi, '来自史莱姆王'],
  [/\bFrom King Slime\b/gi, '来自史莱姆王'],
  [/\bFrom Queen Bee\b/gi, '来自蜂王'],
  [/\bFrom Empress of Light\b/gi, '来自光之女皇'],
  [/\bKing Slime\b/gi, '史莱姆王'],
  [/\bQueen Bee\b/gi, '蜂王'],
  [/\bEmpress of Light\b/gi, '光之女皇'],
  [/\bExpert Mode and Master Mode only\b/gi, '仅专家模式和大师模式'],
  [/\bExpert Mode\b/gi, '专家模式'],
  [/\bMaster Mode\b/gi, '大师模式'],
  [/\bDrops\b/gi, '掉落'],
  [/\bMerchant\b/gi, '商人'],
  [/\bSkeleton Merchant\b/gi, '骷髅商人'],
  [/\bForest\b/gi, '森林'],
  [/\bBee Hive\b/gi, '蜂巢'],
  [/\bThe Hallow\b/gi, '神圣之地'],
  [/\bdrop\b/gi, '掉落'],
]
const localizeItemSourceDisplayText = (...values: unknown[]) => {
  const raw = safeItemDisplayText(...values)
  if (!raw) return ''

  let localized = localizeTerrariaPriceShorthandText(raw).replace(/\s+/g, ' ').trim()
  for (const [pattern, replacement] of itemSourcePhraseLabels) {
    localized = localized.replace(pattern, replacement)
  }
  localized = localized.replace(/\s*\|\s*/g, ' · ')

  if (/[A-Za-z]{2,}/.test(localized)) return ''
  return mostlyAsciiPattern.test(localized) ? '' : localized
}
const safeItemSourceNoteText = (...values: unknown[]) => {
  const parts = values
    .map((value) => localizeItemSourceDisplayText(value))
    .filter(Boolean)

  return Array.from(new Set(parts)).join(' · ')
}

const rawBundle = computed<PublicItemDetailBundle>(() => detailBundle.value)
const detailItem = computed<PublicItemDetail | null>(() => rawBundle.value.item)
const detailLoadingState = computed(() => !detailClientReady.value || (detailPending.value && !detailItem.value))
const notFoundState = computed(() => detailClientReady.value && !detailPending.value && !detailItem.value)

const itemName = computed(() => firstText(
  detailItem.value?.displayName,
  detailItem.value?.nameZh,
  detailItem.value?.name,
  detailItem.value?.nameEn,
  `物品 ${itemId.value}`,
))

useSeoMeta({
  title: () => `TerraPedia · ${itemName.value}`,
  description: () => `${itemName.value} 的公开资料详情，包含图片、价格、来源、配方和关联资料。`,
})

const itemEnglishName = computed(() => safeItemDisplayText(detailItem.value?.nameEn))
const itemCategory = computed(() => safeItemDisplayText(
  detailItem.value?.categoryName,
  detailItem.value?.category,
) || '未分类')
const itemPeriodLabel = (...values: unknown[]) => {
  const raw = firstText(...values)
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  const labels: Record<string, string> = {
    pre_hardmode: '困难模式前',
    prehardmode: '困难模式前',
    early: '开荒阶段',
    hardmode: '困难模式',
    post_plantera: '世纪之花后',
    post_moon_lord: '月亮领主后',
  }

  return labels[key] || safeItemDisplayText(raw) || '阶段未标记'
}
const itemRarityLabel = (...values: unknown[]) => {
  const raw = firstText(...values)
  const key = raw.toLowerCase().replace(/[\s-]+/g, '_')
  const labels: Record<string, string> = {
    gray: '灰色',
    white: '白色',
    blue: '蓝色',
    green: '绿色',
    orange: '橙色',
    light_red: '浅红色',
    pink: '粉色',
    light_purple: '浅紫色',
    lime: '黄绿色',
    yellow: '黄色',
    cyan: '青色',
    red: '红色',
    purple: '紫色',
    quest: '任务物品',
    expert: '专家物品',
    master: '大师物品',
  }

  return labels[key] || safeItemDisplayText(raw) || '稀有度未标记'
}
const itemRarity = computed(() => itemRarityLabel(detailItem.value?.rarity, detailItem.value?.rare))
const itemPeriod = computed(() => itemPeriodLabel(detailItem.value?.gamePeriod, detailItem.value?.phase))
const itemDescriptionSourceText = computed(() => safeItemDisplayText(
  detailItem.value?.descriptionZh,
  detailItem.value?.description,
))
const itemDescriptionText = computed(() => itemDescriptionSourceText.value || '该物品的说明正在整理中。')
const itemTooltipText = computed(() => safeItemDisplayText(
  detailItem.value?.tooltipZh,
  detailItem.value?.tooltip,
  detailItem.value?.tooltipEn,
))

const itemImage = computed(() => firstImageUrl(
  detailItem.value?.previewImage,
  detailItem.value?.imageUrl,
  detailItem.value?.iconUrl,
  detailItem.value?.image,
))

const itemFallbackGlyph = computed(() => Array.from(itemName.value)[0] ?? '?')
const itemFavoriteId = computed(() => firstText(detailItem.value?.id, detailItem.value?.itemId, itemId.value))
const itemFavoriteStatus = computed(() => itemFavoriteId.value ? favoritesStore.getStatus('ITEM', itemFavoriteId.value) : null)
const itemHistoryId = computed(() => detailItem.value ? firstText(detailItem.value.id, detailItem.value.itemId) : '')
const itemIsFavorite = computed(() => Boolean(itemFavoriteStatus.value?.favorite))
const sourceLabel = computed(() => rawBundle.value?.source === 'api' ? '详情资料' : '资料整理中')
const imageRoleLabel = (image: PublicItemImage, index?: number) => {
  const role = firstText(image.role, image.type).toLowerCase()
  if (role === 'icon' || role === 'primary') return '主图标'
  if (role === 'inventory') return '背包图标'
  if (role === 'animation') return '动态图'
  if (role === 'wiki') return '资料图片'
  return index == null ? '图片' : `图片 ${index + 1}`
}
const imageDimensionLabel = (width: unknown, height: unknown) => {
  const widthText = firstText(width)
  const heightText = firstText(height)
  return widthText && heightText ? `${widthText} x ${heightText}` : ''
}

const imageEntries = computed(() => {
  const images = rawBundle.value.images.map((image: PublicItemImage, index) => {
    const url = firstImageUrl(image.previewImageUrl, image.previewImage, image.imageUrl, image.url, image.src, image.path)
    const dimension = imageDimensionLabel(image.width, image.height)
    const primary = image.isPrimary === true || image.isPrimary === 1 || image.isPrimary === '1' || image.isPrimary === 'true'

    return {
      id: firstText(image.id, image.imageId, url, index),
      url,
      label: imageRoleLabel(image, index),
      note: safeItemDisplayText(image.description),
      meta: [primary ? '主图' : imageRoleLabel(image), dimension].filter(Boolean).join(' · ') || '图片',
    }
  }).filter((image) => image.url)

  if (images.length > 0 || !itemImage.value) {
    return images
  }

  return [{
    id: 'primary',
    url: itemImage.value,
    label: '主图标',
    note: itemName.value,
    meta: '主图',
  }]
})

const sourceSourceTypeKey = (source: PublicItemSource) => firstText(source.sourceType, source.kind, source.type, source.method).toLowerCase()
const sourceRefTypeKey = (source: PublicItemSource) => firstText(source.sourceRefType).toLowerCase()
const sourceEvidenceKindKey = (source: PublicItemSource) => firstText(source.evidenceKind).toLowerCase()
const sourceFactKeyText = (source: PublicItemSource) => firstText(source.sourceFactKey).toLowerCase()
const isTreasureBagSource = (source: PublicItemSource) => {
  const text = firstText(source.dropSourceKind, source.sourceType, source.sourceRefType, source.evidenceKind, source.sourceRefName).toLowerCase()
  return text.includes('treasure_bag') || /treasure bag \([^)]+\)/i.test(firstText(source.sourceRefName, source.name, source.displayName, source.sourceName, source.title))
}
const isWorldEvidenceSource = (source: PublicItemSource) => {
  const sourceType = sourceSourceTypeKey(source)
  const sourceRefType = sourceRefTypeKey(source)
  const evidenceKind = sourceEvidenceKindKey(source)
  const sourceFactKey = sourceFactKeyText(source)
  return sourceRefType === 'biome_wikitext'
    || sourceRefType === 'biome'
    || sourceRefType === 'world'
    || sourceRefType === 'container'
    || sourceRefType === 'crate'
    || sourceRefType === 'chest'
    || sourceType === 'worldgen'
    || sourceType === 'container'
    || sourceType === 'crate'
    || sourceType === 'chest'
    || evidenceKind === 'biome_resource'
    || evidenceKind === 'item_biome'
    || sourceFactKey.startsWith('biome_resource:')
    || sourceFactKey.startsWith('item_biome:')
}
const sourceGroupKey = (source: PublicItemSource) => {
  const text = firstText(sourceSourceTypeKey(source), sourceRefTypeKey(source), sourceEvidenceKindKey(source))
  if (isTreasureBagSource(source)) return 'drop'
  if (isWorldEvidenceSource(source)) return 'world'
  if (/shop|sell|buy|vendor|merchant/.test(text)) return 'shop'
  if (/craft|recipe|shimmer|transmute|convert/.test(text)) return 'craft'
  if (/drop|loot|enemy|npc|boss/.test(text)) return 'drop'
  if (/biome|fishing|crate|chest|world|environment|event/.test(text)) return 'world'
  return 'other'
}

const sourceGroupMeta = {
  drop: { title: '掉落来源', meta: '敌怪、首领或事件掉落' },
  shop: { title: '购买与商店', meta: '非玩家角色出售或货币购买' },
  craft: { title: '制作与转换', meta: '配方、微光或转换获得' },
  world: { title: '环境与探索', meta: '群系、宝箱、钓鱼或世界来源' },
  other: { title: '其他来源', meta: '补充来源记录' },
} as const
const sourceFallbackIcon = (key: keyof typeof sourceGroupMeta) => ({
  drop: 'icon-boss',
  shop: 'icon-npc',
  craft: 'icon-crafting',
  world: 'icon-biome',
  other: 'icon-codex',
}[key])

const sourceQuantityLabel = (source: PublicItemSource) => {
  const explicit = safeItemDisplayText(source.quantityText)
  if (explicit) return explicit
  const min = firstText(source.quantityMin)
  const max = firstText(source.quantityMax)
  if (min && max && min !== max) return `${min}-${max}`
  return firstText(source.quantity, source.amount)
}

const percentLabel = (value: unknown) => {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return ''
  return numberValue <= 1 ? `${Math.round(numberValue * 100)}%` : `${numberValue}%`
}
const sourceChanceLabel = (source: PublicItemSource) => {
  const explicit = localizeItemSourceDisplayText(source.chanceText)
  if (explicit) return explicit
  return percentLabel(source.chance ?? source.rate ?? source.chanceValue)
}
const sourceBiomeLabel = (source: PublicItemSource) => safeItemDisplayText(source.biomeNameZh, source.biomeNameEn)
const treasureBagBossNameLabel = (value: string) => localizeItemSourceDisplayText(value) || safeItemDisplayText(value)
const sourceTreasureBagInfo = (source: PublicItemSource) => {
  const sourceRefName = firstText(source.sourceRefName, source.name, source.displayName, source.sourceName, source.title)
  const match = sourceRefName.match(/Treasure Bag \(([^)]+)\)/i)
  if (!match) return null
  const bossName = treasureBagBossNameLabel(match[1] ?? '')
  return {
    bossName,
    sourceName: bossName ? `宝藏袋（${bossName}）` : '宝藏袋',
  }
}
const itemTreasureBagFallbackImage = (source: PublicItemSource) => {
  const info = sourceTreasureBagInfo(source)
  if (!info) return ''

  const sourceItemId = firstText(source.itemId)
  if (sourceItemId && sourceItemId === itemId.value) return itemImage.value
  return ''
}
const sourceTreasureBagName = (source: PublicItemSource) => sourceTreasureBagInfo(source)?.sourceName || ''
const sourceTreasureBagImage = (source: PublicItemSource) => firstImageUrl(source.itemImageUrl, source.item_image_url, itemTreasureBagFallbackImage(source))
const sourceTreasureBagDetail = (source: PublicItemSource) => {
  if (!isTreasureBagSource(source)) return ''
  const info = sourceTreasureBagInfo(source)
  return info?.bossName ? `${info.bossName}的专家/大师模式宝藏袋` : '专家/大师模式宝藏袋'
}
const treasureBagLootSource = computed(() => rawBundle.value.treasureBagLoot.find((source: PublicItemTreasureBagLoot) => (
  safeItemDisplayText(source.sourceNpcNameZh, source.source_npc_name_zh, source.sourceNpcName, source.source_npc_name)
)))
const sourceTreasureBagBossName = (source: PublicItemSource) => {
  const lootSource = treasureBagLootSource.value
  return safeItemDisplayText(
    lootSource?.sourceNpcNameZh,
    lootSource?.source_npc_name_zh,
    lootSource?.sourceNpcName,
    lootSource?.source_npc_name,
  ) || sourceTreasureBagInfo(source)?.bossName || ''
}
const sourceTreasureBagBossImage = (source: PublicItemSource) => {
  if (!isTreasureBagSource(source)) return ''
  const lootSource = treasureBagLootSource.value
  return firstImageUrl(lootSource?.sourceNpcImageUrl, lootSource?.source_npc_image_url)
}
const sourceTreasureBagBossHref = (source: PublicItemSource) => {
  if (!isTreasureBagSource(source)) return ''
  const lootSource = treasureBagLootSource.value
  return safeItemDisplayText(lootSource?.sourceNpcDetailPath, lootSource?.source_npc_detail_path)
}
const sourceTreasureBagBossDetail = (source: PublicItemSource) => {
  const bossName = sourceTreasureBagBossName(source)
  return bossName ? `${bossName}掉落的专家/大师模式宝藏袋` : sourceTreasureBagDetail(source)
}
const sourceEvidenceLabel = (source: PublicItemSource) => {
  const evidenceKind = firstText(source.evidenceKind).toLowerCase()
  if (evidenceKind === 'npc_relation') {
    if (firstText(source.sourceType).toLowerCase() === 'shop' || firstText(source.shopEntryId)) return '商店证据'
    return firstText(source.dropSourceKind) === 'treasure_bag' ? '宝藏袋证据' : '掉落证据'
  }
  if (evidenceKind === 'biome_resource') return '群系资源证据'
  if (evidenceKind === 'item_biome') return '物品群系证据'
  return ''
}
const sourceNoteLabel = (source: PublicItemSource) => {
  if (isTreasureBagSource(source)) return ''

  return safeItemSourceNoteText(
    sourceBiomeLabel(source),
    sourceEvidenceLabel(source),
    source.notes,
  )
}
const sourceDetailHref = (source: PublicItemSource) => {
  if (isTreasureBagSource(source)) return sourceTreasureBagBossHref(source)
  return safeItemDisplayText(source.npcDetailPath, source.biomeDetailPath)
}

const sourceEntries = computed(() => rawBundle.value.sources.map((source: PublicItemSource, index) => ({
  id: firstText(source.sourceFactKey, source.id, source.sourceId, index),
  name: sourceTreasureBagName(source)
    || safeItemDisplayText(source.sourceRefNameZh)
    || localizeItemSourceDisplayText(source.sourceRefName, source.name, source.displayName, source.sourceName, source.title)
    || sourceBiomeLabel(source)
    || `来源 ${index + 1}`,
  groupKey: sourceGroupKey(source),
  detail: sourceTreasureBagBossDetail(source) || localizeItemSourceDisplayText(source.conditions, source.condition, source.description, source.summary) || '来源信息整理中',
  note: sourceNoteLabel(source),
  value: [sourceQuantityLabel(source), sourceChanceLabel(source)].filter(Boolean).join(' · '),
  href: sourceDetailHref(source),
  image: firstImageUrl(
    sourceTreasureBagBossImage(source),
    sourceTreasureBagImage(source),
    source.previewImage,
    source.previewImageUrl,
    source.preview_image,
    source.preview_image_url,
    source.imageUrl,
    source.image_url,
    source.iconUrl,
    source.icon_url,
    source.sourceRefImageUrl,
    source.source_ref_image_url,
    source.npcImageUrl,
    source.npc_image_url,
    source.itemImageUrl,
    source.item_image_url,
    source.image,
  ),
  fallback: Array.from(safeItemDisplayText(source.sourceRefNameZh, source.sourceRefName, source.name, source.displayName, source.sourceName) || '源')[0] ?? '源',
  icon: sourceFallbackIcon(sourceGroupKey(source)),
})))

const treasureBagLootTitle = (source: PublicItemTreasureBagLoot) => safeItemDisplayText(
  source.itemNameZh,
  source.item_name_zh,
  source.itemName,
  source.item_name,
) || '未命名掉落物'
const treasureBagLootImage = (source: PublicItemTreasureBagLoot) => firstImageUrl(
  source.itemImage,
  source.item_image,
  source.imageUrl,
  source.image_url,
)
const treasureBagLootSourceTitle = (source: PublicItemTreasureBagLoot) => safeItemDisplayText(
  source.sourceNpcNameZh,
  source.source_npc_name_zh,
  source.sourceNpcName,
  source.source_npc_name,
) || '来源首领未标注'
const treasureBagLootSourceImage = (source: PublicItemTreasureBagLoot) => firstImageUrl(
  source.sourceNpcImageUrl,
  source.source_npc_image_url,
)
const treasureBagLootQuantityLabel = (source: PublicItemTreasureBagLoot) => {
  const explicit = safeItemDisplayText(source.quantityText, source.quantity_text)
  if (explicit) return explicit
  const min = firstText(source.quantityMin, source.quantity_min)
  const max = firstText(source.quantityMax, source.quantity_max)
  if (min && max && min !== max) return `${min}-${max}`
  return firstText(min, max)
}
const treasureBagLootChanceLabel = (source: PublicItemTreasureBagLoot) => {
  const explicit = localizeItemSourceDisplayText(source.chanceText, source.chance_text)
  if (explicit) return explicit
  return percentLabel(source.chanceValue ?? source.chance_value)
}
const treasureBagLootMeta = (source: PublicItemTreasureBagLoot) => (
  [treasureBagLootQuantityLabel(source), treasureBagLootChanceLabel(source)].filter(Boolean).join(' · ') || '掉落数值整理中'
)
const treasureBagLootDetail = (source: PublicItemTreasureBagLoot) => (
  [safeItemDisplayText(source.dropSourceKindLabel, source.drop_source_kind_label), localizeItemSourceDisplayText(source.conditions), localizeItemSourceDisplayText(source.notes)]
    .filter(Boolean)
    .join(' · ') || '宝藏袋内物品'
)
const treasureBagLootEntries = computed(() => rawBundle.value.treasureBagLoot.map((source: PublicItemTreasureBagLoot, index) => ({
  id: firstText(source.id, source.itemId, source.item_id, index),
  itemId: firstText(source.itemId, source.item_id),
  name: treasureBagLootTitle(source),
  image: treasureBagLootImage(source),
  fallback: Array.from(treasureBagLootTitle(source))[0] ?? '物',
  sourceName: treasureBagLootSourceTitle(source),
  sourceImage: treasureBagLootSourceImage(source),
  sourceFallback: Array.from(treasureBagLootSourceTitle(source))[0] ?? '首',
  sourceHref: safeItemDisplayText(source.sourceNpcDetailPath, source.source_npc_detail_path),
  itemHref: firstText(source.itemId, source.item_id) ? `/items/${firstText(source.itemId, source.item_id)}` : '',
  detail: treasureBagLootDetail(source),
  meta: treasureBagLootMeta(source),
})))

const sourceEntryGroups = computed(() => {
  const buckets = new Map<keyof typeof sourceGroupMeta, typeof sourceEntries.value>()

  for (const source of sourceEntries.value) {
    const key = source.groupKey as keyof typeof sourceGroupMeta
    buckets.set(key, [...(buckets.get(key) ?? []), source])
  }

  return (Object.keys(sourceGroupMeta) as Array<keyof typeof sourceGroupMeta>)
    .map((key) => ({
      key,
      title: sourceGroupMeta[key].title,
      meta: sourceGroupMeta[key].meta,
      entries: buckets.get(key) ?? [],
    }))
    .filter((group) => group.entries.length > 0)
})

const buffRelationLabel = (effect: PublicItemBuffEffect) => {
  const explicit = safeItemDisplayText(effect.relationLabel, effect.relation_label)
  if (explicit) return explicit

  const relationType = firstText(effect.relationType, effect.relation_type).toLowerCase()
  if (relationType === 'buff_source_item') return '来源物品'

  return '关联状态效果'
}

const buffDurationLabel = (effect: PublicItemBuffEffect) => {
  const explicit = safeItemDisplayText(effect.durationText, effect.duration_text)
  if (explicit) return explicit

  const durationTicks = Number(effect.durationTicks ?? effect.duration_ticks)
  if (!Number.isFinite(durationTicks) || durationTicks <= 0) return ''

  const seconds = durationTicks / 60
  const secondsText = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(/\.0$/, '')
  return `${secondsText} 秒（${durationTicks} ticks）`
}

const buffChanceLabel = (effect: PublicItemBuffEffect) => {
  const explicit = safeItemDisplayText(effect.chanceText, effect.chance_text)
  if (explicit) return explicit

  return percentLabel(effect.chanceValue ?? effect.chance_value)
}

const buffEffectEntries = computed(() => rawBundle.value.buffEffects.map((effect: PublicItemBuffEffect, index) => {
  const name = safeItemDisplayText(
    effect.buffNameZh,
    effect.buff_name_zh,
    effect.buffNameEn,
    effect.buff_name_en,
  )
  const buffFallback = firstText(effect.buffId, effect.buff_id, index + 1)
  const meta = [
    buffDurationLabel(effect),
    buffChanceLabel(effect),
    safeItemDisplayText(effect.conditions),
  ].filter(Boolean)

  return {
    id: firstText(effect.id, effect.buffSourceId, effect.buff_source_id, effect.buffId, effect.buff_id, index),
    name: name || '状态效果',
    relation: buffRelationLabel(effect),
    meta: meta.length ? meta.join(' · ') : '效果来源已确认',
    notes: safeItemDisplayText(effect.notes),
    image: firstImageUrl(effect.imageUrl, effect.image_url),
    fallback: Array.from(name || buffFallback || '状')[0] ?? '状',
  }
}))

const slotGroupLabel = (slotGroup: unknown) => {
  const key = firstText(slotGroup).toLowerCase()
  const labels: Record<string, string> = {
    head: '头部',
    body: '胸甲',
    legs: '腿部',
  }

  return labels[key] || safeItemDisplayText(slotGroup) || '装备部位'
}

const classScopeLabel = (classScope: unknown) => {
  const key = firstText(classScope).toLowerCase()
  const labels: Record<string, string> = {
    all: '全职业',
    melee: '近战',
    ranged: '远程',
    magic: '魔法',
    summon: '召唤',
    sentry: '哨兵',
    movement: '移动',
    defense: '防御',
  }

  return labels[key] || safeItemDisplayText(classScope) || '装备'
}

const equipmentEffectValueLabel = (effect: PublicItemEquipmentEffect) => {
  const raw = safeItemDisplayText(effect.rawText, effect.raw_text)
  if (raw) return raw

  const value = Number(effect.valueDecimal ?? effect.value_decimal)
  if (!Number.isFinite(value)) return ''

  const unit = firstText(effect.unit).toLowerCase()
  const numberText = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')

  if (unit === 'percent') return `${numberText}%`
  return numberText
}

const equipmentEffectLabel = (effect: PublicItemEquipmentEffect) => {
  const explicit = safeItemDisplayText(effect.statLabelZh, effect.stat_label_zh)
  if (explicit) return explicit

  const key = firstText(effect.statKey, effect.stat_key).toLowerCase()
  const labels: Record<string, string> = {
    damage_bonus: '伤害',
    crit_chance: '暴击率',
    melee_speed: '近战速度',
    move_speed: '移动速度',
    defense: '防御',
    mana_cost: '魔力消耗',
    minion_capacity: '仆从上限',
  }

  return labels[key] || '装备加成'
}

const armorAttributeEntries = computed(() => rawBundle.value.armorAttributes.map((row: PublicItemArmorAttribute, index) => ({
  id: firstText(row.id, row.itemId, row.item_id, index),
  name: safeItemDisplayText(row.itemNameZh, row.item_name_zh, row.itemPageTitle, row.item_page_title) || itemName.value,
  slot: slotGroupLabel(row.slotGroup ?? row.slot_group),
  defense: firstNumberText(row.defenseValue, row.defense_value),
})))

const equipmentEffectEntries = computed(() => rawBundle.value.equipmentEffects
  .filter((effect: PublicItemEquipmentEffect) => firstText(effect.parseStatus, effect.parse_status, 'parsed') === 'parsed')
  .map((effect: PublicItemEquipmentEffect, index) => ({
    id: firstText(effect.id, effect.effectIndex, effect.effect_index, index),
    label: equipmentEffectLabel(effect),
    scope: classScopeLabel(effect.classScope ?? effect.class_scope),
    value: equipmentEffectValueLabel(effect),
    raw: safeItemDisplayText(effect.rawText, effect.raw_text),
  }))
  .filter((effect) => effect.value || effect.raw))

const itemEquipmentAttributeCount = computed(() => armorAttributeEntries.value.length + equipmentEffectEntries.value.length)

const recipeTreeVariants = computed(() => {
  const tree: PublicItemRecipeTree | null = rawBundle.value.recipeTree
  const variants = Array.isArray(tree?.variants) ? tree.variants : []

  return variants.filter((variant) => Array.isArray(variant?.roots) && variant.roots.length > 0)
})

const recipeVariantRank = (variant: PublicItemRecipeTreeVariant, index: number) => {
  const text = firstText(variant.variantKey, variant.variantLabel, variant.versionScope).toLowerCase()

  if (text.includes('desktop') || text.includes('mobile') || text.includes('console')) return index
  if (text.includes('base') || text.includes('通用')) return 100 + index
  return 200 + index
}

const recipeVariantDisplayLabel = (variant: PublicItemRecipeTreeVariant, index?: number) => {
  const explicit = safeItemDisplayText(variant.variantLabel)
  if (explicit) return explicit

  const scope = firstText(variant.versionScope).toLowerCase()
  if (scope.includes('desktop') || scope.includes('pc')) return '桌面版配方'
  if (scope.includes('mobile')) return '移动版配方'
  if (scope.includes('console')) return '主机版配方'
  if (scope.includes('base') || scope.includes('default') || scope.includes('通用')) return '默认配方'

  return index == null ? '默认配方' : `配方 ${index + 1}`
}

const defaultRecipeVariantKey = computed(() => recipeTreeVariants.value
  .map((variant, index) => ({ variant, index }))
  .sort((left, right) => recipeVariantRank(left.variant, left.index) - recipeVariantRank(right.variant, right.index))[0]?.variant.variantKey ?? '')

const activeRecipeVariant = computed(() => {
  const variants = recipeTreeVariants.value
  if (!variants.length) return null

  return variants.find((variant) => firstText(variant.variantKey) === selectedRecipeVariantKey.value)
    ?? variants.find((variant) => firstText(variant.variantKey) === defaultRecipeVariantKey.value)
    ?? variants[0]
})

watch(
  defaultRecipeVariantKey,
  (key) => {
    if (!selectedRecipeVariantKey.value && key) {
      selectedRecipeVariantKey.value = key
    }
  },
  { immediate: true },
)

const activeRecipeRoots = computed(() => activeRecipeVariant.value?.roots ?? [])

const recipeTreeSummary = computed(() => {
  const tree: PublicItemRecipeTree | null = rawBundle.value.recipeTree
  if (!tree || !activeRecipeVariant.value) return null

  const directMaterials = activeRecipeRoots.value.flatMap((root) => root.children ?? [])
  const textStations = firstText(tree.station, tree.craftingStation, tree.stationName)

  return {
    title: firstText(tree.item?.nameZh, tree.item?.name, tree.name, tree.displayName, tree.resultName, itemName.value),
    variant: recipeVariantDisplayLabel(activeRecipeVariant.value, recipeTreeVariants.value.indexOf(activeRecipeVariant.value)),
    recipeCount: activeRecipeRoots.value.length,
    count: directMaterials.length,
    materialCount: directMaterials.length,
    station: textStations || '制作站未标记',
    note: safeItemDisplayText(tree.note, tree.summary, tree.description),
  }
})

const recipeQuantityLabel = (...values: unknown[]) => {
  const text = firstText(...values)
  return text ? `x${text.replace(/^x/i, '')}` : 'x1'
}

const recipeUsageIngredientTitle = (ingredient: PublicItemRecipeIngredient) => safeItemDisplayText(
  ingredient.itemNameZh,
  ingredient.itemName,
  ingredient.ingredientNameRaw,
) || '材料'

const recipeUsageIngredientQuantity = (ingredient: PublicItemRecipeIngredient) => {
  if (firstText(ingredient.quantityText)) return recipeQuantityLabel(ingredient.quantityText)
  if (firstText(ingredient.quantityMin) && firstText(ingredient.quantityMax) && firstText(ingredient.quantityMin) !== firstText(ingredient.quantityMax)) {
    return `x${firstText(ingredient.quantityMin)}-${firstText(ingredient.quantityMax)}`
  }
  return recipeQuantityLabel(ingredient.quantityMin, ingredient.quantityMax)
}

const recipeUsageStationTitle = (station: PublicItemRecipeStation) => safeItemDisplayText(
  station.itemNameZh,
  station.itemName,
  station.stationNameRaw,
) || '制作站'

const recipeUsageEntries = computed(() => rawBundle.value.recipeUsages.map((recipe: PublicItemRecipe, index) => {
  const resultName = safeItemDisplayText(
    recipe.resultItemNameZh,
    recipe.resultItemName,
  ) || `配方产物 ${index + 1}`
  const resultItemId = firstText(recipe.resultItemId)
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  const stations = Array.isArray(recipe.stations) ? recipe.stations : []
  const ingredientSummary = ingredients
    .slice(0, 4)
    .map((ingredient) => `${recipeUsageIngredientTitle(ingredient)} ${recipeUsageIngredientQuantity(ingredient)}`)
    .join(' + ')
  const stationSummary = stations.map(recipeUsageStationTitle).filter(Boolean).slice(0, 3).join(' / ')
  const resultQuantity = Number(recipe.resultQuantity)

  return {
    id: firstText(recipe.id, `${resultName}-${index}`),
    name: resultName,
    href: resultItemId ? `/items/${resultItemId}` : '',
    image: firstImageUrl(recipe.resultItemImage),
    fallback: firstText(Array.from(resultName)[0], '配'),
    detail: ingredientSummary || '材料记录待补充',
    station: stationSummary || '制作站未标记',
    meta: Number.isFinite(resultQuantity) && resultQuantity > 1 ? `产出 x${resultQuantity}` : '产物',
  }
}))

const visibleRecipeUsageEntries = computed(() => (
  recipeUsageExpanded.value
    ? recipeUsageEntries.value
    : recipeUsageEntries.value.slice(0, recipeUsagePreviewLimit)
))
const hiddenRecipeUsageCount = computed(() => Math.max(0, recipeUsageEntries.value.length - recipeUsagePreviewLimit))
const hasRecipeUsageOverflow = computed(() => hiddenRecipeUsageCount.value > 0)

const buyPriceValue = computed(() => toPriceNumber(detailItem.value?.buyPrice ?? detailItem.value?.buy))
const sellPriceValue = computed(() => toPriceNumber(detailItem.value?.sellPrice ?? detailItem.value?.sell))
const buyPriceTokens = computed(() => buyPriceValue.value != null && buyPriceValue.value > 0 ? buildTerrariaPriceTokens(buyPriceValue.value) : [])
const sellPriceTokens = computed(() => sellPriceValue.value != null && sellPriceValue.value > 0 ? buildTerrariaPriceTokens(sellPriceValue.value) : [])
const itemPriceLabel = (tokens: TerrariaPriceToken[]) => formatTerrariaPriceTokens(tokens)
const itemPriceTokenKey = (unit: unknown) => {
  const key = firstText(unit).toLowerCase()
  if (key === 'platinum' || key === 'pc' || key === 'platinum coin') return 'platinum'
  if (key === 'gold' || key === 'gc' || key === 'gold coin') return 'gold'
  if (key === 'silver' || key === 'sc' || key === 'silver coin') return 'silver'
  if (key === 'copper' || key === 'cc' || key === 'copper coin') return 'copper'
  return 'unknown'
}
const itemCoinImageByUnit = {
  copper: { itemId: 71, image: '/terrapedia-images/items/wiki/item-images/37/3759072ffe0c9c4c994a6f702e0bd5a704cfd35f-copper-coin-gif.gif', label: '铜币' },
  silver: { itemId: 72, image: '/terrapedia-images/items/wiki/item-images/21/21b43bed59f5fc3fdd3060145f84e5d62883bdc9-silver-coin-gif.gif', label: '银币' },
  gold: { itemId: 73, image: '/terrapedia-images/items/wiki/item-images/34/34fdf6f986715e8c9fd0c1381d27c81cfc2e7fe6-gold-coin-gif.gif', label: '金币' },
  platinum: { itemId: 74, image: '/terrapedia-images/items/wiki/item-images/6e/6e8289618c2cf75478458d12c683f9a2a321b6d0-platinum-coin-gif.gif', label: '铂金币' },
} as const
const itemPriceTokenImage = (unit: unknown) => {
  const key = itemPriceTokenKey(unit)
  if (key === 'unknown') return null
  const coin = itemCoinImageByUnit[key]
  return { ...coin, image: resolvePreviewImageUrl(coin.image) }
}
const itemHasPrice = computed(() => (
  (buyPriceValue.value != null && buyPriceValue.value > 0)
  || (sellPriceValue.value != null && sellPriceValue.value > 0)
))

const statRows = computed(() => [
  { label: '伤害', value: firstNumberText(detailItem.value?.damage, detailItem.value?.baseDamage) },
  { label: '防御', value: firstNumberText(armorAttributeEntries.value[0]?.defense, detailItem.value?.defense) },
  { label: '击退', value: firstNumberText(detailItem.value?.knockback, detailItem.value?.knockBack) },
  { label: '使用时间', value: firstNumberText(detailItem.value?.useTime, detailItem.value?.useAnimation) },
  { label: '最大堆叠', value: firstNumberText(detailItem.value?.stackSize, detailItem.value?.maxStack) },
  { label: '尺寸', value: imageDimensionLabel(detailItem.value?.width, detailItem.value?.height) },
  { label: '买入', value: itemPriceLabel(buyPriceTokens.value), priceTokens: buyPriceTokens.value },
  { label: '售出', value: itemPriceLabel(sellPriceTokens.value), priceTokens: sellPriceTokens.value },
  { label: '稀有度', value: itemRarity.value },
].filter((row) => row.value))

const itemCoverageRows = computed(() => [
  { label: '基础资料', value: detailItem.value ? sourceLabel.value : '暂无记录' },
  { label: '描述', value: itemDescriptionSourceText.value ? '可查看' : '暂无说明' },
  { label: '游戏内提示', value: itemTooltipText.value ? '可查看' : '暂无提示' },
  { label: '价格', value: itemHasPrice.value ? '可查看' : '暂无价格' },
  { label: '来源', value: sourceEntries.value.length ? `${sourceEntries.value.length} 条来源记录` : '暂无来源' },
  { label: '状态效果', value: buffEffectEntries.value.length ? `${buffEffectEntries.value.length} 条状态效果` : '暂无状态效果' },
  { label: '装备属性', value: itemEquipmentAttributeCount.value ? `${itemEquipmentAttributeCount.value} 条装备属性` : '暂无装备属性' },
  { label: '制作', value: recipeTreeSummary.value ? '可查看制作此物品路线' : '暂无制作此物品资料' },
  { label: '用途', value: recipeUsageEntries.value.length ? `${recipeUsageEntries.value.length} 条可用于制作` : '暂无制作用途' },
  { label: '图片', value: imageEntries.value.length ? `${imageEntries.value.length} 张图片` : '暂无图片' },
])

const loadItemFavoriteStatus = async () => {
  if (!itemFavoriteId.value) return
  favoriteError.value = ''
  try {
    await authStore.init()
    if (authStore.isAuthenticated) {
      await favoritesStore.loadStatuses('ITEM', [itemFavoriteId.value])
    }
  } catch {
    favoriteError.value = '收藏状态暂时无法同步。'
  }
}

const toggleItemFavorite = async () => {
  if (!itemFavoriteId.value) return
  favoriteError.value = ''
  try {
    await favoritesStore.toggleItemFavorite(itemFavoriteId.value)
  } catch (exception: unknown) {
    favoriteError.value = exception instanceof Error ? exception.message : '收藏操作失败。'
  }
}

const recordItemHistoryOnce = async () => {
  if (!import.meta.client || !itemHistoryId.value) return
  const id = String(itemHistoryId.value)
  if (recordedItemHistoryIds.has(id)) return
  recordedItemHistoryIds.add(id)
  try {
    await historyStore.record('ITEM', itemHistoryId.value)
  } catch {
    // Reading history must not block public item rendering.
  }
}

watch(itemFavoriteId, () => {
  void loadItemFavoriteStatus()
})

watch(itemHistoryId, () => {
  void recordItemHistoryOnce()
}, { immediate: true })

onMounted(() => {
  detailClientReady.value = true
  void loadItemFavoriteStatus()
  void recordItemHistoryOnce()
})
</script>

<template>
  <section class="screen detail-screen active" :aria-busy="detailLoadingState">
    <TerraNav />
    <TerraBreadcrumb />

    <DetailItemDetailSkeleton v-if="detailLoadingState" />

    <div v-else-if="notFoundState" :class="['detail-layout', detailLayout.detailShellClass]">
      <section class="detail-hero dark-card">
        <div class="detail-main">
          <span class="eyebrow">物品 #{{ itemId || '未知' }} · 未找到</span>
          <strong class="detail-missing-title">没有找到这个物品</strong>
          <p>暂时没有可显示的物品资料。可以返回物品图鉴重新选择，或稍后再试。</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="detailError" class="tag moss">载入异常</span>
          </div>
          <a class="primary-button" href="/items">返回物品图鉴</a>
        </div>
      </section>
    </div>

    <div v-else :class="['detail-layout', detailLayout.detailShellClass]">
      <section class="detail-hero dark-card">
        <div class="detail-icon-stage">
          <CommonPreviewImage
            class="item-detail-primary-preview"
            :src="itemImage"
            :alt="itemName"
            :fallback="itemFallbackGlyph"
            fallback-icon="icon-items"
            loading="eager"
          />
        </div>
        <div class="detail-main">
          <span class="eyebrow">物品 #{{ itemId }} · {{ itemEnglishName || sourceLabel }}</span>
          <h1>{{ itemName }}</h1>
          <p>{{ itemDescriptionText }}</p>
          <p v-if="itemTooltipText" class="item-tooltip-copy">{{ itemTooltipText }}</p>
          <div class="tag-row">
            <span class="tag gold">{{ itemCategory }}</span>
            <span class="tag moss">{{ itemPeriod }}</span>
            <span class="tag paper">{{ itemRarity }}</span>
            <span v-if="detailPending" class="tag paper">同步中</span>
          </div>
          <div class="item-favorite-actions">
            <button
              class="item-favorite-button"
              :class="{ active: itemIsFavorite }"
              type="button"
              :disabled="favoritesStore.mutating || !itemFavoriteId"
              :aria-pressed="itemIsFavorite"
              @click="toggleItemFavorite"
            >
              <span class="sprite-icon icon-favorites compact" aria-hidden="true"></span>
              <span>{{ itemIsFavorite ? '已收藏' : '收藏物品' }}</span>
            </button>
            <span v-if="favoriteError" class="item-favorite-error">{{ favoriteError }}</span>
          </div>
        </div>
        <aside class="detail-side">
          <p class="section-label">核心属性</p>
          <dl>
            <template v-for="row in statRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>
                <span v-if="row.priceTokens?.length" class="item-price-token-row" :aria-label="row.value">
                  <span v-for="token in row.priceTokens" :key="`${row.label}-${token.unit}`" class="item-price-token">
                    <span class="item-price-token-icon" :data-coin-item-id="itemPriceTokenImage(token.unit)?.itemId">
                      <CommonPreviewImage
                        :src="itemPriceTokenImage(token.unit)?.image"
                        :alt="itemPriceTokenImage(token.unit)?.label || token.label"
                        :fallback="itemPriceTokenImage(token.unit)?.label || token.label"
                        fallback-icon="icon-items"
                        decorative
                      />
                    </span>
                    <span class="item-price-token-copy">{{ token.amount }}{{ token.label }}</span>
                  </span>
                </span>
                <span v-else>{{ row.value }}</span>
              </dd>
            </template>
          </dl>
        </aside>
      </section>

      <div :class="['detail-grid', detailLayout.detailGridClass, detailLayout.detailDensityClass]">
        <div class="module-stack">
          <section :class="['detail-module dark-card item-recipe-summary-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <div>
                <h2>制作此物品</h2>
                <span>{{ recipeTreeSummary ? `${recipeTreeSummary.variant} · ${recipeTreeSummary.count} 个直接材料` : '当前物品暂无制作路线' }}</span>
              </div>
              <span class="tag gold">{{ recipeTreeSummary ? `${recipeTreeSummary.recipeCount} 个配方` : '暂无配方' }}</span>
            </div>
            <div v-if="recipeTreeSummary && recipeTreeVariants.length > 1" class="recipe-variant-tabs" aria-label="配方版本">
              <button
                v-for="(variant, index) in recipeTreeVariants"
                :key="firstText(variant.variantKey, variant.variantLabel)"
                class="recipe-variant-tab"
                :class="{ active: activeRecipeVariant === variant }"
                type="button"
                @click="selectedRecipeVariantKey = firstText(variant.variantKey)"
              >
                {{ recipeVariantDisplayLabel(variant, index) }}
              </button>
            </div>
            <RecipeSummaryCard v-if="recipeTreeSummary" :roots="activeRecipeRoots" compact title-id="item-recipe-summary-title" />
            <p v-else class="tp-detail-empty">还没有可展示的配方、材料或制作站记录。</p>
            <p v-if="recipeTreeSummary?.note">{{ recipeTreeSummary.note }}</p>
            <a v-if="recipeTreeSummary" class="primary-button item-recipe-summary-link" :href="`/crafting?itemId=${itemId}&maxDepth=3`">查看完整制作树</a>
          </section>

          <section :class="['detail-module dark-card item-recipe-usage-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <div>
                <h2>可用于制作</h2>
                <span>{{ recipeUsageEntries.length ? `${recipeUsageEntries.length} 个产物使用此物品` : '当前物品暂无制作用途' }}</span>
              </div>
              <span class="tag moss">{{ recipeUsageEntries.length ? `${recipeUsageEntries.length} 条` : '暂无用途' }}</span>
            </div>
            <div v-if="recipeUsageEntries.length" class="recipe-usage-summary">
              <span>{{ recipeUsageExpanded ? '已显示全部用途' : `先显示 ${visibleRecipeUsageEntries.length} 条重点用途` }}</span>
              <button
                v-if="hasRecipeUsageOverflow"
                class="recipe-usage-toggle"
                type="button"
                :aria-expanded="recipeUsageExpanded ? 'true' : 'false'"
                @click="recipeUsageExpanded = !recipeUsageExpanded"
              >
                {{ recipeUsageExpanded ? '收起' : `展开其余 ${hiddenRecipeUsageCount} 条` }}
              </button>
            </div>
            <div v-if="recipeUsageEntries.length" class="recipe-usage-grid tp-detail-relation-grid">
              <div
                v-for="usage in visibleRecipeUsageEntries"
                :key="String(usage.id)"
                :class="['recipe-usage-row detail-relation-row', detailLayout.detailRelationRowClass]"
              >
                <span class="sprite-frame detail-relation-icon">
                  <CommonPreviewImage
                    :src="usage.image"
                    :alt="usage.name"
                    :fallback="usage.fallback"
                    fallback-icon="icon-crafting"
                  />
                </span>
                <div class="detail-relation-copy">
                  <NuxtLink v-if="usage.href" class="item-source-link" :to="usage.href">{{ usage.name }}</NuxtLink>
                  <b v-else>{{ usage.name }}</b>
                  <span>{{ usage.detail }}</span>
                  <small>{{ usage.station }}</small>
                </div>
                <strong class="detail-relation-meta">{{ usage.meta }}</strong>
              </div>
            </div>
            <p v-else class="tp-detail-empty">还没有可展示的上级合成或制作用途。</p>
          </section>

          <section :class="['detail-module dark-card item-equipment-attribute-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>装备属性</h2>
              <span class="tag gold">{{ itemEquipmentAttributeCount }} 条</span>
            </div>
            <div v-if="armorAttributeEntries.length" class="armor-attribute-summary">
              <div v-for="row in armorAttributeEntries" :key="String(row.id)" class="armor-attribute-row">
                <span>{{ row.slot }}</span>
                <b>{{ row.defense || '0' }}</b>
                <small>{{ row.name }}</small>
              </div>
            </div>
            <div v-if="equipmentEffectEntries.length" class="equipment-effect-grid">
              <div v-for="effect in equipmentEffectEntries" :key="String(effect.id)" class="equipment-effect-chip">
                <span>{{ effect.scope }}</span>
                <b>{{ effect.value }}</b>
                <small>{{ effect.label }}</small>
              </div>
            </div>
            <p v-if="!itemEquipmentAttributeCount" class="tp-detail-empty">暂无装备属性。</p>
          </section>

          <section :class="['detail-module dark-card item-source-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>来源分组</h2>
              <span class="tag moss">{{ sourceEntries.length }} 条</span>
            </div>
            <div v-if="sourceEntryGroups.length" class="grouped-source-list">
              <section v-for="group in sourceEntryGroups" :key="group.key" class="detail-subgroup item-source-group">
                <div class="detail-subgroup-title">
                  <b>{{ group.title }}</b>
                  <span>{{ group.entries.length }} 条 · {{ group.meta }}</span>
                </div>
                <div class="source-table tp-detail-relation-grid">
                  <div v-for="source in group.entries" :key="String(source.id)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                    <span class="sprite-frame detail-relation-icon">
                      <CommonPreviewImage
                        :src="source.image"
                        :alt="source.name"
                        :fallback="source.fallback"
                        :fallback-icon="source.icon"
                      />
                    </span>
                    <div class="detail-relation-copy">
                      <NuxtLink v-if="source.href" class="item-source-link" :to="source.href">{{ source.name }}</NuxtLink>
                      <b v-else>{{ source.name }}</b>
                      <span>{{ source.detail }}</span>
                      <small v-if="source.note">{{ source.note }}</small>
                    </div>
                    <strong class="detail-relation-meta">{{ source.value || group.title }}</strong>
                  </div>
                </div>
              </section>
            </div>
            <p v-else class="tp-detail-empty">还没有可展示的掉落、购买、制作或探索来源记录。</p>
          </section>

          <section v-if="treasureBagLootEntries.length" :class="['detail-module dark-card treasure-bag-loot-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <div>
                <h2>宝藏袋内物品</h2>
                <span>打开该宝藏袋可能获得的具体物品</span>
              </div>
              <span class="tag gold">{{ treasureBagLootEntries.length }} 件</span>
            </div>
            <div class="treasure-bag-loot-grid tp-detail-relation-grid">
              <div
                v-for="loot in treasureBagLootEntries"
                :key="String(loot.id)"
                :class="['treasure-bag-loot-row detail-relation-row', detailLayout.detailRelationRowClass]"
              >
                <span class="sprite-frame detail-relation-icon">
                  <CommonPreviewImage
                    :src="loot.image"
                    :alt="loot.name"
                    :fallback="loot.fallback"
                    fallback-icon="icon-items"
                  />
                </span>
                <div class="detail-relation-copy">
                  <NuxtLink v-if="loot.itemHref" class="item-source-link" :to="loot.itemHref">{{ loot.name }}</NuxtLink>
                  <b v-else>{{ loot.name }}</b>
                  <span>{{ loot.detail }}</span>
                  <small>
                    <span class="treasure-bag-source-chip">
                      <span class="treasure-bag-source-icon">
                        <CommonPreviewImage
                          :src="loot.sourceImage"
                          :alt="loot.sourceName"
                          :fallback="loot.sourceFallback"
                          fallback-icon="icon-boss"
                        />
                      </span>
                      <NuxtLink v-if="loot.sourceHref" class="item-source-link" :to="loot.sourceHref">{{ loot.sourceName }}</NuxtLink>
                      <b v-else>{{ loot.sourceName }}</b>
                      <span>掉落此宝藏袋</span>
                    </span>
                  </small>
                </div>
                <strong class="detail-relation-meta">{{ loot.meta }}</strong>
              </div>
            </div>
          </section>

          <section :class="['detail-module dark-card item-buff-effect-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>状态效果</h2>
              <span class="tag moss">{{ buffEffectEntries.length }} 条</span>
            </div>
            <div v-if="buffEffectEntries.length" class="tp-detail-relation-grid">
              <div v-for="effect in buffEffectEntries" :key="String(effect.id)" :class="['detail-relation-row item-buff-effect-row', detailLayout.detailRelationRowClass]">
                <span class="sprite-frame detail-relation-icon">
                  <CommonPreviewImage
                    :src="effect.image"
                    :alt="effect.name"
                    :fallback="effect.fallback"
                    fallback-icon="icon-buff"
                  />
                </span>
                <div class="detail-relation-copy">
                  <b>{{ effect.name }}</b>
                  <span>{{ effect.relation }}</span>
                  <small v-if="effect.notes">{{ effect.notes }}</small>
                </div>
                <strong class="detail-relation-meta">{{ effect.meta }}</strong>
              </div>
            </div>
            <p v-else class="tp-detail-empty">暂无状态效果。</p>
          </section>

          <section v-if="imageEntries.length" :class="['detail-module dark-card', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>图片画廊</h2>
              <span class="tag gold">{{ imageEntries.length }} 张</span>
            </div>
            <div class="item-image-gallery">
              <figure v-for="image in imageEntries" :key="String(image.id)" class="item-image-tile">
                <span class="sprite-frame item-image-preview">
                  <CommonPreviewImage
                    :src="image.url"
                    :alt="image.label"
                    :fallback="itemFallbackGlyph"
                    fallback-icon="icon-items"
                  />
                </span>
                <figcaption>
                  <b>{{ image.label }}</b>
                  <span>{{ image.meta }}</span>
                  <small v-if="image.note">{{ image.note }}</small>
                </figcaption>
              </figure>
            </div>
          </section>
        </div>

        <aside :class="['evidence-panel dark-card item-coverage-panel', detailLayout.detailModuleClass]">
          <span class="eyebrow">资料概览</span>
          <div v-for="row in itemCoverageRows" :key="row.label" class="evidence-step">
            <div><b>{{ row.label }}</b><span>{{ row.value }}</span></div>
          </div>
        </aside>
      </div>
    </div>

    <TerraFooter />
  </section>
</template>

<style scoped>
.detail-relation-row {
  grid-template-columns: 44px minmax(0, 1fr) auto;
  padding: 10px;
}

.detail-relation-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
}

.detail-relation-copy {
  min-width: 0;
}

.detail-relation-copy b,
.detail-relation-copy span,
.detail-relation-meta {
  overflow-wrap: anywhere;
}

.item-source-link {
  display: inline-block;
  color: var(--text-strong);
  font-weight: 700;
  text-decoration: none;
}

.item-source-link:hover {
  text-decoration: underline;
}

.detail-relation-copy span {
  display: block;
  line-height: 1.5;
}

.detail-relation-meta {
  align-self: center;
  border: 1px solid var(--index-line);
  border-radius: 999px;
  padding: 4px 8px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.detail-relation-copy small,
.item-image-tile small {
  display: block;
  margin-top: 4px;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.item-tooltip-copy {
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 14px;
}

.item-recipe-summary-module {
  display: grid;
  gap: 14px;
}

.item-recipe-summary-link {
  width: fit-content;
}

.item-favorite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-top: 14px;
}

.item-favorite-button {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-width: 116px;
  min-height: 38px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 36%, var(--index-line));
  border-radius: 999px;
  background: var(--index-surface);
  color: var(--text-strong);
  font: inherit;
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.item-favorite-button.active {
  background: color-mix(in srgb, var(--accent-gold) 18%, var(--index-surface));
}

.item-favorite-button:disabled {
  opacity: 0.62;
  cursor: wait;
}

.item-favorite-error {
  color: var(--danger);
  font-size: 12px;
  font-weight: 800;
}

.item-price-token-row {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px 7px;
  align-items: center;
  min-width: 0;
  vertical-align: middle;
}

.item-price-token {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--gold) 22%, var(--index-line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--gold) 7%, transparent);
  padding: 2px 7px 2px 3px;
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.1;
  white-space: nowrap;
}

.item-price-token-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  overflow: hidden;
}

.item-price-token-icon :deep(.item-art) {
  width: 24px;
  height: 24px;
}

.item-price-token-copy {
  min-width: 0;
  overflow-wrap: anywhere;
}

.item-source-module,
.treasure-bag-loot-module,
.item-buff-effect-module,
.item-equipment-attribute-module,
.item-recipe-usage-module,
.grouped-source-list,
.item-source-group {
  display: grid;
  gap: 12px;
}

.recipe-usage-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 172px), 1fr));
  gap: 10px;
}

.recipe-usage-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid color-mix(in srgb, var(--accent-moss) 20%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-moss) 6%, transparent);
  padding: 7px 9px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
}

.recipe-usage-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  border: 1px solid color-mix(in srgb, var(--accent-moss) 34%, var(--index-line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-moss) 12%, var(--index-surface));
  padding: 0 12px;
  color: var(--text-strong);
  font: inherit;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}

.recipe-usage-toggle:hover {
  background: color-mix(in srgb, var(--accent-moss) 18%, var(--index-surface));
}

.recipe-usage-row {
  position: relative;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: start;
  min-height: 98px;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--accent-gold) 34%, var(--index-line));
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent-gold) 16%, transparent), transparent 42%),
    linear-gradient(135deg, color-mix(in srgb, var(--accent-moss) 12%, transparent), transparent 62%),
    color-mix(in srgb, var(--index-card) 82%, white 2%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 8px 18px rgba(0,0,0,0.22);
  padding: 10px;
  padding-top: 12px;
  padding-left: 12px;
  overflow: hidden;
}

.recipe-usage-row::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  width: 100%;
  height: 3px;
  border-radius: 8px 8px 0 0;
  background: color-mix(in srgb, var(--accent-moss) 70%, var(--accent-gold));
}

.recipe-usage-row::after {
  content: "";
  position: absolute;
  inset: 10px auto auto 10px;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-gold) 13%, var(--index-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-gold) 22%, transparent);
  pointer-events: none;
}

.recipe-usage-row .detail-relation-icon {
  position: relative;
  z-index: 1;
  width: 34px;
  height: 34px;
  border: 0;
  background: transparent;
}

.recipe-usage-row .detail-relation-icon :deep(.item-art) {
  width: 30px;
  height: 30px;
}

.recipe-usage-row .detail-relation-copy :where(b, a, span, small),
.recipe-usage-row .detail-relation-meta {
  overflow-wrap: break-word;
  word-break: normal;
}

.recipe-usage-row .detail-relation-meta {
  position: absolute;
  right: 8px;
  bottom: 8px;
  grid-column: auto;
  justify-self: auto;
  max-width: 100%;
  border-color: color-mix(in srgb, var(--accent-gold) 42%, var(--index-line));
  background: color-mix(in srgb, var(--accent-gold) 18%, var(--index-surface));
  padding: 3px 7px;
  color: var(--text-strong);
  font-size: 10px;
  line-height: 1.1;
  white-space: nowrap;
  text-align: left;
}

.recipe-usage-row .detail-relation-copy {
  display: grid;
  gap: 2px;
  padding-bottom: 22px;
}

.recipe-usage-row .detail-relation-copy :where(b, a) {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--text-strong);
  font-size: 13px;
  line-height: 1.18;
}

.recipe-usage-row .detail-relation-copy span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: color-mix(in srgb, var(--text-muted) 88%, var(--accent-gold));
  font-size: 11px;
  line-height: 1.28;
}

.recipe-usage-row .detail-relation-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-faint);
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.item-source-module .source-table {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  gap: 12px;
}

.item-source-module .detail-relation-row {
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: start;
  padding: 12px;
}

.item-source-module .detail-relation-icon {
  margin-top: 2px;
}

.item-source-module .detail-relation-copy {
  display: grid;
  gap: 4px;
}

.item-source-module .detail-relation-copy :where(b, a, span, small) {
  overflow-wrap: break-word;
  word-break: normal;
}

.item-source-module .detail-relation-copy span {
  font-size: 13px;
  line-height: 1.55;
}

.item-source-module .detail-relation-meta {
  grid-column: 2;
  justify-self: start;
  max-width: 100%;
  white-space: normal;
  text-align: left;
  overflow-wrap: break-word;
  word-break: normal;
}

.treasure-bag-loot-module {
  display: grid;
  gap: 12px;
}

.treasure-bag-loot-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  gap: 12px;
}

.treasure-bag-loot-row {
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: start;
  padding: 12px;
}

.treasure-bag-loot-row .detail-relation-meta {
  grid-column: 2;
  justify-self: start;
  max-width: 100%;
  white-space: normal;
  text-align: left;
}

.treasure-bag-source-chip {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--index-line) 76%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-gold) 7%, transparent);
  padding: 4px 8px 4px 4px;
  color: var(--text-muted);
}

.treasure-bag-source-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  overflow: hidden;
}

.treasure-bag-source-icon :deep(.item-art) {
  width: 24px;
  height: 24px;
}

.item-coverage-panel {
  gap: 8px;
  border-radius: 14px;
  padding: 18px;
}

.item-coverage-panel > .eyebrow {
  display: flex;
  min-height: 32px;
  margin: 0 0 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--index-line) 72%, transparent);
  padding-bottom: 10px;
  color: var(--text-strong);
  font-size: 12px;
  line-height: 1;
}

.item-coverage-panel > .eyebrow::before {
  width: 22px;
  height: 3px;
}

.item-coverage-panel .evidence-step {
  min-height: 44px;
  border-color: color-mix(in srgb, var(--index-line) 76%, transparent);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(214, 177, 90, 0.055), transparent 44%),
    rgba(244, 234, 208, 0.022);
  padding: 10px 12px;
}

.item-coverage-panel .evidence-step > div {
  grid-template-columns: minmax(92px, 0.72fr) minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.item-coverage-panel .evidence-step b {
  color: var(--text-strong);
  font-size: 14px;
  line-height: 1.25;
}

.item-coverage-panel .evidence-step span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.armor-attribute-summary,
.equipment-effect-grid {
  display: grid;
  gap: 10px;
}

.armor-attribute-row,
.equipment-effect-chip {
  display: grid;
  grid-template-columns: minmax(72px, 0.8fr) auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
  padding: 10px 12px;
}

.armor-attribute-row span,
.equipment-effect-chip span {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 800;
}

.armor-attribute-row b,
.equipment-effect-chip b {
  color: var(--text-strong);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.armor-attribute-row small,
.equipment-effect-chip small {
  min-width: 0;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.item-buff-effect-row {
  min-height: 66px;
}

.detail-subgroup-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: end;
  min-width: 0;
}

.detail-subgroup-title b,
.detail-subgroup-title span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-subgroup-title b {
  color: var(--text-strong);
  font-size: 14px;
}

.detail-subgroup-title span {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 800;
}

.item-image-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.item-image-tile {
  display: grid;
  gap: 10px;
  min-width: 0;
  margin: 0;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
  padding: 14px;
}

.item-image-preview {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  overflow: hidden;
}

.item-image-tile b,
.item-image-tile span {
  display: block;
  overflow-wrap: anywhere;
}

.item-image-tile b {
  color: var(--text-strong);
  font-size: 13px;
}

.item-image-tile span {
  color: var(--text-subtle);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 720px) {
  .detail-relation-row {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .detail-subgroup-title {
    display: grid;
    gap: 4px;
  }

  .detail-relation-meta {
    grid-column: 2;
    justify-self: start;
  }

  .armor-attribute-row,
  .equipment-effect-chip {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .armor-attribute-row small,
  .equipment-effect-chip small {
    grid-column: 1 / -1;
  }
}
</style>
