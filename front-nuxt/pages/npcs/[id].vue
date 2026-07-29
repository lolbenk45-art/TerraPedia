<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

import type {
  PublicNpcBuffRelation,
  PublicNpcLivingPreference,
  PublicNpcLootEntry,
  PublicNpcMoneyDrop,
  PublicNpcShopEntry,
  PublicNpcShopPriceToken,
  PublicNpcTraceableItemSummary,
} from '~/types/public-api'
import { buildTerrariaPriceTokens, formatTerrariaPriceTokens, localizeTerrariaPriceShorthandText, resolveTerrariaPriceUnitLabel, type TerrariaPriceToken } from '~/utils/price'
import { buildNpcShopBands, filterNpcShopBands, resolveNpcArchiveModules } from '~/utils/npcShopBands'
import { createSafeDisplayText } from '~/utils/publicCopy'
import { moneyCoinClass, normalizeTerrariaMoneyToken } from '~/utils/terrariaMoney'

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'npc', density: 'compact' })
const include = 'loot,shop,buffs'

const routeNpcId = computed(() => String(route.params.id ?? '').trim())
const numericNpcId = computed(() => {
  const value = Number(routeNpcId.value)
  return Number.isInteger(value) && value !== 0 ? value : null
})
const invalidNpcId = computed(() => numericNpcId.value == null)
const { data: aggregateBundle, pending: aggregatePending, error: aggregateError, refresh: refreshNpcAggregate } = await usePublicNpcAggregate(
  () => numericNpcId.value ?? routeNpcId.value,
  include,
)

if (invalidNpcId.value || !aggregateBundle.value?.aggregate?.npc) {
  throw createError({ statusCode: 404, statusMessage: 'NPC not found' })
}

const aggregate = computed(() => invalidNpcId.value ? null : aggregateBundle.value?.aggregate ?? null)
const npc = computed(() => aggregate.value?.npc ?? null)
const loot = computed(() => aggregate.value?.loot ?? [])
const trustedLoot = computed(() => loot.value.filter((entry) => entry.trustedStructured === true && entry.lootSourceMode === 'direct'))
const trustedLootVisibleEntries = computed(() => trustedLoot.value.slice(0, 8))
const trustedLootRemainderEntries = computed(() => trustedLoot.value.slice(8))
const additionalLoot = computed(() => loot.value.filter((entry) => !(entry.trustedStructured === true && entry.lootSourceMode === 'direct')))
const shopEntries = computed(() => aggregate.value?.shopEntries ?? [])
const buffRelations = computed(() => aggregate.value?.buffRelations ?? [])
const loadingState = computed(() => !invalidNpcId.value && aggregatePending.value && !aggregate.value)
const missingState = computed(() => invalidNpcId.value || (!aggregatePending.value && !npc.value))

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }

  return ''
}

const normalizedBuffRelationType = (entry: PublicNpcBuffRelation) => firstText(entry.relationType, entry.relation_type).toLowerCase()
const isInflictingBuffRelation = (entry: PublicNpcBuffRelation) => ['inflicts', 'inflict', 'applies'].includes(normalizedBuffRelationType(entry))
const isImmuneBuffRelation = (entry: PublicNpcBuffRelation) => ['immune', 'immunity'].includes(normalizedBuffRelationType(entry))
const inflictingBuffRelations = computed(() => buffRelations.value.filter(isInflictingBuffRelation))
const immuneBuffRelations = computed(() => buffRelations.value.filter(isImmuneBuffRelation))
const otherBuffRelations = computed(() => buffRelations.value.filter((entry) => !isInflictingBuffRelation(entry) && !isImmuneBuffRelation(entry)))
const buffRelationSections = computed(() => [
  { key: 'inflicts', title: '当前 NPC 会施加', entries: inflictingBuffRelations.value },
  { key: 'immune', title: '当前 NPC 免疫', entries: immuneBuffRelations.value },
  { key: 'other', title: '其他状态效果', entries: otherBuffRelations.value },
].filter((section) => section.entries.length > 0))

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
// 共享安全展示文案(utils/publicCopy):NPC 特有分支 = 渲染前本地化泰拉瑞亚钱币简写。
const safeNpcDisplayText = createSafeDisplayText(localizeTerrariaPriceShorthandText)
const displayName = computed(() => safeNpcDisplayText(npc.value?.nameZh, npc.value?.name) || `NPC ${routeNpcId.value}`)
const secondaryName = computed(() => {
  const zhName = safeNpcDisplayText(npc.value?.nameZh)
  const name = safeNpcDisplayText(npc.value?.name)
  return zhName && name && name !== zhName ? name : ''
})

const npcWikiAssets = computed(() => npc.value?.wikiAssets ?? npc.value?.wiki_assets ?? null)
const dialoguePortraitImage = computed(() => resolvePreviewImageUrl(firstText(
  npcWikiAssets.value?.dialogPortraitImage,
  npcWikiAssets.value?.dialog_portrait_image,
)))
const portraitImage = computed(() => dialoguePortraitImage.value || resolvePreviewImageUrl(firstText(
  npcWikiAssets.value?.spriteImage,
  npcWikiAssets.value?.sprite_image,
  npcWikiAssets.value?.mapIconImage,
  npcWikiAssets.value?.map_icon_image,
  npc.value?.imageUrl,
)))

const toAbsoluteSeoUrl = useAbsoluteSiteUrl()

useSeoMeta({
  title: () => `TerraPedia · ${displayName.value}`,
  description: () => `${displayName.value} 的公开 NPC 资料详情，包含基础数值、生活偏好、掉落、出售物品和状态效果关系。`,
  ogImage: () => toAbsoluteSeoUrl(portraitImage.value),
})

useHead({
  link: [{ rel: 'canonical', href: () => toAbsoluteSeoUrl(route.path) }],
})


const npcAssetCards = computed(() => {
  const seen = new Set<string>()
  const cards = [
    {
      key: 'dialogPortrait',
      label: '对话肖像',
      meta: '新版城镇 NPC 对话头像',
      image: resolvePreviewImageUrl(firstText(npcWikiAssets.value?.dialogPortraitImage, npcWikiAssets.value?.dialog_portrait_image)),
      sourceImage: firstText(npcWikiAssets.value?.dialogPortraitImage, npcWikiAssets.value?.dialog_portrait_image),
      fallbackIcon: 'icon-npc',
    },
    {
      key: 'sprite',
      label: 'NPC 立绘',
      meta: '世界内角色外观',
      image: resolvePreviewImageUrl(firstText(npcWikiAssets.value?.spriteImage, npcWikiAssets.value?.sprite_image)),
      sourceImage: firstText(npcWikiAssets.value?.spriteImage, npcWikiAssets.value?.sprite_image),
      fallbackIcon: 'icon-npc',
    },
    {
      key: 'mapIcon',
      label: '地图图标',
      meta: '小地图识别图标',
      image: resolvePreviewImageUrl(firstText(npcWikiAssets.value?.mapIconImage, npcWikiAssets.value?.map_icon_image)),
      sourceImage: firstText(npcWikiAssets.value?.mapIconImage, npcWikiAssets.value?.map_icon_image),
      fallbackIcon: 'icon-npc',
    },
    {
      key: 'base',
      label: '基础图片',
      meta: '数据库原始图像',
      image: resolvePreviewImageUrl(firstText(npc.value?.imageUrl)),
      sourceImage: firstText(npc.value?.imageUrl),
      fallbackIcon: 'icon-npc',
    },
  ]

  return cards.filter((card) => {
    if (!card.image || seen.has(card.image)) return false
    seen.add(card.image)
    return true
  })
})
const portraitFallback = computed(() => firstGlyph(displayName.value || 'NPC'))
const detailUpdatedAt = computed(() => {
  const value = firstText(aggregate.value?.aggregatedAt)
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
})

const npcKindLabel = computed(() => {
  if (npc.value?.isTownNpc) return '城镇角色'
  if (npc.value?.isFriendly) return '友好角色'
  return npc.value?.isBoss ? 'Boss' : '敌对角色'
})

const toNumberOrNull = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const percentLabel = (value: unknown) => {
  const numberValue = toNumberOrNull(value)
  if (numberValue == null) return ''
  return numberValue <= 1 ? `${Math.round(numberValue * 100)}%` : `${numberValue}%`
}

const formatDurationSeconds = (value: unknown) => {
  const seconds = toNumberOrNull(value)
  if (seconds == null || seconds <= 0) return ''
  const label = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1).replace(/\.0$/, '')
  return `${label}秒`
}

const npcStatRows = computed(() => [
  { label: '编号', value: firstText(npc.value?.gameId, npc.value?.id) },
  { label: '生命值', value: firstText(npc.value?.lifeMax) },
  { label: '伤害', value: firstText(npc.value?.damage) },
  { label: '防御', value: firstText(npc.value?.defense) },
  { label: '击退抗性', value: percentLabel(npc.value?.knockBackResist) },
  { label: '类型', value: npcKindLabel.value },
  { label: '资料更新', value: detailUpdatedAt.value },
].filter((row) => row.value))

const npcHeroStatRows = computed(() => npcStatRows.value.filter((row) => (
  ['生命值', '防御', '伤害', '击退抗性'].includes(row.label)
)))

const entryTitle = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcBuffRelation) => safeNpcDisplayText(
  'buffNameZh' in entry ? entry.buffNameZh : undefined,
  'itemNameZh' in entry ? entry.itemNameZh : undefined,
  'buffName' in entry ? entry.buffName : undefined,
  'itemName' in entry ? entry.itemName : undefined,
) || '资料项'

const entryImage = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcBuffRelation) => resolvePreviewImageUrl(firstText(
  entry.imageUrl,
  'image_url' in entry ? entry.image_url : undefined,
  'itemImage' in entry ? entry.itemImage : undefined,
  'item_image' in entry ? entry.item_image : undefined,
  'buffImage' in entry ? entry.buffImage : undefined,
  'buff_image' in entry ? entry.buff_image : undefined,
))
const entryFallbackIcon = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcBuffRelation) => {
  if ('buffId' in entry || 'buff_id' in entry || 'buffImage' in entry || 'buff_image' in entry) return 'icon-buff'
  if ('priceText' in entry || 'price_text' in entry || 'buyPriceText' in entry || 'buy_price_text' in entry) return 'icon-npc'
  return 'icon-items'
}

const quantityLabel = (entry: PublicNpcLootEntry) => {
  const text = safeNpcDisplayText(entry.quantityText)
  if (text) return text
  if (entry.quantityMin != null && entry.quantityMax != null && entry.quantityMin !== entry.quantityMax) return `${entry.quantityMin}-${entry.quantityMax}`
  return firstText(entry.quantityMin, entry.quantityMax)
}

const chanceLabel = (entry: PublicNpcLootEntry | PublicNpcBuffRelation) => {
  const text = safeNpcDisplayText(entry.chanceText)
  if (text) return text
  return entry.chanceValue != null ? `${entry.chanceValue}%` : ''
}
const lootEntryMetaLabel = (entry: PublicNpcLootEntry) => [quantityLabel(entry), chanceLabel(entry), lootConditionLabel(entry)].filter(Boolean).join(' · ') || '掉落资料待补充'
const itemPath = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcTraceableItemSummary) => {
  const id = firstText(entry.itemId, 'item_id' in entry ? entry.item_id : undefined)
  return id ? `/items/${id}` : ''
}

const normalizedPreferenceValue = (value: unknown) => {
  const key = firstText(value).toLowerCase()
  return ['love', 'like', 'dislike', 'hate'].includes(key) ? key : ''
}

const preferenceLabel = (value: unknown) => {
  const preference = normalizedPreferenceValue(value)
  if (preference === 'love') return '最喜欢'
  if (preference === 'like') return '喜欢'
  if (preference === 'dislike') return '不喜欢'
  if (preference === 'hate') return '讨厌'
  return '偏好'
}

const preferenceTargetTypeLabel = (value: unknown) => {
  const type = firstText(value).toLowerCase()
  if (type === 'biome') return '生物群系'
  if (type === 'npc') return '邻近 NPC'
  return '偏好对象'
}

const preferenceTargetPath = (row: PublicNpcLivingPreference) => {
  const id = firstText(row.targetId ?? row.target_id)
  const type = firstText(row.targetType ?? row.target_type).toLowerCase()
  if (type === 'npc' && id) return `/npcs/${id}`
  return ''
}

const preferenceMissingLinkLabel = (row: PublicNpcLivingPreference) => {
  const type = firstText(row.targetType ?? row.target_type).toLowerCase()
  return !preferenceTargetPath(row) && type !== 'biome' ? '未关联资料' : ''
}

const preferenceTargetRawName = (row: PublicNpcLivingPreference) => safeNpcDisplayText(
  row.targetNameZh ?? row.target_name_zh,
  row.targetName ?? row.target_name,
)

const preferenceTargetTitle = (row: PublicNpcLivingPreference) => preferenceTargetRawName(row) || '未命名偏好对象'

const preferenceTargetImage = (row: PublicNpcLivingPreference) => resolvePreviewImageUrl(firstText(
  row.targetImageUrl,
  row.target_image_url,
))

const preferenceFallbackIcon = (row: PublicNpcLivingPreference) => {
  const type = firstText(row.targetType ?? row.target_type).toLowerCase()
  return type === 'biome' ? 'icon-biome' : 'icon-npc'
}

const hasPreferenceSignal = (row: PublicNpcLivingPreference) => Boolean(
  preferenceTargetRawName(row)
  || normalizedPreferenceValue(row.preference)
  || firstText(row.targetType ?? row.target_type)
  || firstText(row.targetId ?? row.target_id)
  || preferenceTargetImage(row),
)

const livingPreferenceRows = computed(() => {
  const rows = npc.value?.livingPreferences ?? npc.value?.living_preferences ?? []

  return Array.isArray(rows)
    ? rows.filter((row) => hasPreferenceSignal(row))
    : []
})

const preferenceOrder = ['love', 'like', 'dislike', 'hate', ''] as const
const preferenceGroups = computed(() => preferenceOrder
  .map((preference) => ({
    key: preference || 'unknown',
    label: preferenceLabel(preference),
    rows: livingPreferenceRows.value.filter((row) => normalizedPreferenceValue(row.preference) === preference),
  }))
  .filter((group) => group.rows.length > 0))

const npcBehaviorSummary = computed(() => safeNpcDisplayText(
  npc.value?.behaviorNotes,
  `${displayName.value} 的资料包含基础数值、出售物品、掉落物和状态效果。`,
))

const shopPriceTokens = (entry: PublicNpcShopEntry): TerrariaPriceToken[] => {
  const rawTokens = entry.priceTokens ?? entry.price_tokens
  if (Array.isArray(rawTokens) && rawTokens.length) {
    return rawTokens
      .map((token: PublicNpcShopPriceToken) => ({
        unit: firstText(token.unit),
        amount: Number(token.amount),
        label: resolveTerrariaPriceUnitLabel(token.unit),
        iconUrl: firstText(token.iconUrl, token.icon_url),
      }))
      .filter(token => token.unit && Number.isFinite(token.amount) && token.amount >= 0 && token.label)
  }

  return buildTerrariaPriceTokens(entry.buyPrice ?? entry.buy_price ?? entry.sellPrice ?? entry.sell_price)
}
const shopPriceLabel = (entry: PublicNpcShopEntry) => formatTerrariaPriceTokens(shopPriceTokens(entry))
const lootConditionLabel = (entry: PublicNpcLootEntry) => safeNpcDisplayText(entry.conditions, entry.notes)
const buffConditionLabel = (entry: PublicNpcBuffRelation) => safeNpcDisplayText(entry.conditions, entry.notes)
// 共享钱币 token 规整(utils/terrariaMoney);coin-mark 视觉在 detail-layout.css。
const npcMoneyCoinClass = moneyCoinClass
const npcMoneyDropTokens = (drop: PublicNpcMoneyDrop): TerrariaPriceToken[] => {
  return Array.isArray(drop.tokens)
    ? drop.tokens.map(normalizeTerrariaMoneyToken).filter((token): token is TerrariaPriceToken => Boolean(token))
    : []
}
const npcMoneyDropModeLabel = (value: unknown) => {
  const key = firstText(value).toLowerCase()
  if (key === 'normal') return '普通掉落'
  if (key === 'expert') return '专家掉落'
  if (key === 'master') return '大师掉落'
  return '钱币掉落'
}
const npcMoneyModeMeta = (value: unknown) => {
  const key = firstText(value).toLowerCase()
  if (key === 'normal') return '普通模式'
  if (key === 'expert') return '专家模式'
  if (key === 'master') return '大师模式'
  return '模式'
}
const npcMoneyDrops = computed(() => (Array.isArray(npc.value?.moneyDrops) ? npc.value?.moneyDrops : [])
  .map((drop, index) => {
    const tokens = npcMoneyDropTokens(drop)
    const mode = firstText(drop.mode) || 'normal'
    const label = safeNpcDisplayText(drop.label) || npcMoneyDropModeLabel(mode)
    return {
      key: `${mode}-${index}-${formatTerrariaPriceTokens(tokens)}`,
      mode,
      label,
      tokens,
    }
  })
  .filter((drop) => drop.tokens.length > 0))

const shopEntryKey = (entry: PublicNpcShopEntry) => String(entry.id ?? entry.itemId ?? entry.itemInternalName)
const shopEntryGroups = computed(() => buildNpcShopBands(shopEntries.value, safeNpcDisplayText))
const selectedShopGroup = ref('all')
const visibleShopEntryGroups = computed(() => filterNpcShopBands(shopEntryGroups.value, selectedShopGroup.value))

const buffDurationLabel = (entry: PublicNpcBuffRelation) => safeNpcDisplayText(
  entry.durationText,
  formatDurationSeconds(entry.durationSeconds),
  formatBuffTickDuration(entry.durationTicks ?? entry.duration_ticks),
)
const formatBuffTickDuration = (value: unknown) => {
  const ticks = toNumberOrNull(value)
  if (ticks == null || ticks <= 0) return ''
  return ticks < 60 ? `${Math.trunc(ticks)}帧` : formatDurationSeconds(ticks / 60)
}

const relationTypeLabel = (value: unknown) => {
  const key = firstText(value).toLowerCase()
  if (key === 'shop') return '出售'
  if (key === 'loot' || key === 'drop') return '掉落'
  if (key === 'source') return '来源'
  if (key === 'buff' || key === 'debuff' || key === 'status') return '状态效果'
  if (key === 'applies' || key === 'inflict' || key === 'inflicts') return '施加'
  if (key === 'immune' || key === 'immunity') return '免疫'
  return ''
}
const buffRelationMeaningLabel = (entry: PublicNpcBuffRelation) => {
  const key = normalizedBuffRelationType(entry)
  if (key === 'immune' || key === 'immunity') return '免疫'
  if (key === 'applies' || key === 'inflict' || key === 'inflicts') return '会施加'
  return relationTypeLabel(entry.relationType) || '状态效果关系'
}
const buffRelationCardKey = (sectionKey: string, entry: PublicNpcBuffRelation, index: number) => [
  sectionKey,
  firstText(entry.id, entry.buffId, entry.buff_id, entryTitle(entry), index),
].join('-')

const relatedItemSections = computed(() => {
  const sections = [
    { title: '掉落相关', entries: (npc.value?.lootItems ?? []) as PublicNpcTraceableItemSummary[] },
    { title: '出售相关', entries: (npc.value?.shopItems ?? []) as PublicNpcTraceableItemSummary[] },
    { title: '来源相关', entries: ((npc.value?.sourceItems ?? []) as PublicNpcTraceableItemSummary[]) },
  ]

  return sections.map((section) => ({
    ...section,
    entries: section.entries.slice(0, 6).map((entry, index) => ({
      id: firstText(entry.sourceFactKey, entry.itemId, entry.itemInternalName, `${section.title}-${index}`),
      title: safeNpcDisplayText(entry.itemNameZh, entry.itemName) || '关联物品',
      meta: relationTypeLabel(entry.relationType),
      href: itemPath(entry),
    })),
  })).filter((section) => section.entries.length > 0)
})

const materialStatus = computed(() => ({
  loot: trustedLoot.value.length + additionalLoot.value.length ? '已整理' : '暂无资料',
  shop: shopEntries.value.length ? '已整理' : '暂无资料',
  buffs: buffRelations.value.length ? '已整理' : '暂无资料',
}))
const npcSourceTag = computed(() => aggregateBundle.value?.source === 'api' ? '详情资料' : '资料整理中')
const npcArchiveModules = computed(() => resolveNpcArchiveModules({
  isTownNpc: Boolean(npc.value?.isTownNpc),
  name: displayName.value,
  shopCount: shopEntries.value.length,
  lootCount: trustedLoot.value.length + additionalLoot.value.length,
}))
</script>

<template>
    <TerraBreadcrumb />

  <main :class="['entity-detail-layout', detailLayout.detailShellClass]" :aria-busy="loadingState">
      <section v-if="loadingState" class="npc-detail-hero">
        <div class="npc-detail-portrait">
          <span class="item-art tp-preview-image is-fallback" data-fallback="N"></span>
        </div>
        <div class="npc-detail-copy">
          <span class="eyebrow">加载 NPC 详情</span>
          <component :is="'h1'" class="detail-missing-title">加载 NPC 详情</component>
          <p>正在读取数值、掉落、商店和状态效果资料。</p>
        </div>
      </section>

      <section v-else-if="missingState" class="npc-detail-hero">
        <div class="npc-detail-portrait">
          <span class="item-art tp-preview-image is-fallback" data-fallback="N"></span>
        </div>
        <div class="npc-detail-copy">
          <span class="eyebrow">NPC #{{ routeNpcId || '未知' }} · {{ aggregateError ? '加载失败' : '未找到' }}</span>
          <component :is="'h1'" class="detail-missing-title">{{ aggregateError ? 'NPC 资料加载失败' : '没有找到这个 NPC' }}</component>
          <p>{{ aggregateError ? '加载 NPC 资料时出现异常，可以重试或稍后再来。' : invalidNpcId ? '请从 NPC 图鉴进入对应详情页。' : '暂时没有可显示的 NPC 资料。' }}</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="aggregateError" class="tag moss">载入异常</span>
          </div>
          <button v-if="aggregateError" class="primary-button" type="button" @click="refreshNpcAggregate()">重试加载</button>
          <a class="primary-button" href="/npcs">返回 NPC 图鉴</a>
        </div>
      </section>

      <template v-else>
        <div class="npc-archive-layout">
        <section class="npc-detail-hero tp-archive-hero npc-archive-hero npc-archive-page">
          <div class="npc-hero-portrait">
            <div class="npc-detail-portrait">
              <CommonPreviewImage :src="portraitImage" :alt="displayName" :fallback="portraitFallback" fallback-icon="icon-npc" loading="eager" />
            </div>
            <div v-if="npcAssetCards.length" class="npc-hero-assets" aria-label="角色资料图像">
              <span v-for="asset in npcAssetCards" :key="asset.key">
                <CommonPreviewImage
                  :src="asset.image"
                  :source-image="asset.sourceImage"
                  :alt="`${displayName} ${asset.label}`"
                  :fallback="portraitFallback"
                  :fallback-icon="asset.fallbackIcon"
                  decorative
                />
                <small>{{ asset.label }}</small>
              </span>
            </div>
          </div>
          <div class="npc-detail-copy">
            <span class="eyebrow">NPC #{{ npc?.gameId ?? npc?.id }} · {{ secondaryName || '详情资料' }}</span>
            <h1>{{ displayName }}</h1>
            <div class="tag-row">
              <span v-if="npc?.isTownNpc" class="tag gold">城镇 NPC</span>
              <span v-if="npc?.isFriendly" class="tag moss">友好</span>
              <span class="tag paper">{{ safeNpcDisplayText(npc?.categoryName) || '未分类' }}</span>
              <span class="tag paper">{{ trustedLoot.length + additionalLoot.length }} 条掉落</span>
              <span class="tag paper">{{ shopEntries.length }} 项出售</span>
              <span class="tag paper">{{ npcSourceTag }}</span>
            </div>
            <div class="npc-hero-context">
              <b>{{ npcArchiveModules.includes('arrival') ? '到访说明' : '角色说明' }}</b>
              <p>{{ npcBehaviorSummary }}</p>
            </div>
          </div>
          <aside class="npc-detail-facts">
            <p class="section-label">基础数值</p>
            <dl>
              <div v-for="row in npcHeroStatRows" :key="row.label">
                <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section :class="['detail-grid npc-detail-grid', detailLayout.detailGridClass, detailLayout.detailDensityClass, 'npc-archive-content']">
          <div class="module-stack">
            <article v-if="npcArchiveModules.includes('residence')" :class="['detail-module dark-card npc-residence-module', detailLayout.detailModuleClass]">
              <div class="module-title">
                <div>
                  <h2>入住与偏好</h2>
                  <span>该角色属于城镇 NPC；生活偏好按现有资料显示。</span>
                </div>
                <span class="tag gold">城镇角色</span>
              </div>
              <div v-if="preferenceGroups.length" class="npc-capability-summary">
                <span v-for="group in preferenceGroups" :key="group.key"><b>{{ group.label }}</b> {{ group.rows.length }} 项</span>
              </div>
              <p v-else class="tp-detail-empty">当前资料已确认城镇身份，生活偏好仍在补充。</p>
            </article>

            <article v-if="npcArchiveModules.includes('arrival')" :class="['detail-module dark-card npc-arrival-module', detailLayout.detailModuleClass]">
              <div class="module-title">
                <div>
                  <h2>到访与离开</h2>
                  <span>旅商会临时到访；当前资料只提供可用商店记录。</span>
                </div>
                <span class="tag paper">临时商人</span>
              </div>
              <div class="npc-capability-summary">
                <span><b>可用商店资料</b> {{ shopEntries.length }} 项</span>
                <span><b>出现 / 离开条件</b> 当前未提供</span>
              </div>
            </article>

            <article v-if="npcArchiveModules.includes('loot')" :class="['detail-module dark-card npc-loot-module', detailLayout.detailModuleClass]">
              <div class="module-title">
                <h2>掉落物</h2>
                <span class="tag moss">{{ trustedLoot.length + additionalLoot.length }} 条</span>
              </div>
              <div v-if="npcMoneyDrops.length" class="npc-money-drops" aria-label="钱币掉落">
                <div class="npc-money-drops-heading">
                  <b>钱币掉落</b>
                  <span>模式掉落</span>
                </div>
                <div class="npc-money-drop-grid">
                  <div v-for="drop in npcMoneyDrops" :key="drop.key" class="npc-money-drop-row">
                    <span class="npc-money-mode-badge">
                      <b>{{ drop.label }}</b>
                      <em>{{ npcMoneyModeMeta(drop.mode) }}</em>
                    </span>
                    <div class="npc-money-token-row" :aria-label="formatTerrariaPriceTokens(drop.tokens)">
                      <span v-for="token in drop.tokens" :key="`${drop.key}-${token.unit}`" class="npc-money-token">
                        <CommonPreviewImage
                          v-if="token.iconUrl"
                          class="npc-money-token-icon"
                          :src="token.iconUrl"
                          :alt="resolveTerrariaPriceUnitLabel(token.unit)"
                          :fallback="firstGlyph(resolveTerrariaPriceUnitLabel(token.unit))"
                          fallback-icon="icon-items"
                          width="32"
                          height="32"
                          decorative
                        />
                        <span v-else :class="['npc-money-coin-mark', `is-${npcMoneyCoinClass(token.unit)}`]" aria-hidden="true"></span>
                        <span class="npc-money-token-copy">{{ token.amount }}{{ resolveTerrariaPriceUnitLabel(token.unit) }}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="trustedLoot.length" class="source-table dark-table tp-detail-relation-grid">
                <DetailRelationRow
                  v-for="entry in trustedLootVisibleEntries"
                  :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)"
                  :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]"
                  :image="entryImage(entry)"
                  :title="entryTitle(entry)"
                  :fallback-icon="entryFallbackIcon(entry)"
                  :href="itemPath(entry)"
                  :meta="lootEntryMetaLabel(entry)"
                  badge="掉落"
                />
              </div>
              <details v-if="trustedLootRemainderEntries.length" class="detail-group-remainder">
                <summary>展开其余 {{ trustedLootRemainderEntries.length }} 条</summary>
                <div class="source-table dark-table tp-detail-relation-grid">
                  <DetailRelationRow
                    v-for="entry in trustedLootRemainderEntries"
                    :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)"
                    :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]"
                    :image="entryImage(entry)"
                    :title="entryTitle(entry)"
                    :fallback-icon="entryFallbackIcon(entry)"
                    :href="itemPath(entry)"
                    :meta="lootEntryMetaLabel(entry)"
                    badge="掉落"
                  />
                </div>
              </details>
              <div v-if="additionalLoot.length" class="detail-subgroup npc-additional-loot">
                <div class="detail-subgroup-title">
                  <b>其他掉落记录</b>
                  <span>{{ additionalLoot.length }} 条 · 需结合来源记录查看</span>
                </div>
                <div class="source-table dark-table tp-detail-relation-grid">
                  <DetailRelationRow
                    v-for="entry in additionalLoot.slice(0, 6)"
                    :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)"
                    :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]"
                    :image="entryImage(entry)"
                    :title="entryTitle(entry)"
                    :fallback-icon="entryFallbackIcon(entry)"
                    :href="itemPath(entry)"
                    :meta="lootEntryMetaLabel(entry)"
                    badge="补充"
                  />
                </div>
              </div>
              <p v-if="!trustedLoot.length && !additionalLoot.length" class="tp-detail-empty">暂时没有整理到掉落物。</p>
            </article>

          <article v-if="npcArchiveModules.includes('shop')" :class="['detail-module dark-card npc-shop-module', detailLayout.detailModuleClass]">
            <DetailNpcShopBands
              :total="shopEntries.length"
              :groups="shopEntryGroups"
              :visible-groups="visibleShopEntryGroups"
              :selected-group="selectedShopGroup"
              :current-stock-only="npcArchiveModules.includes('arrival')"
              :entry-key="shopEntryKey"
              :entry-image="entryImage"
              :entry-title="entryTitle"
              :entry-icon="entryFallbackIcon"
              :item-path="itemPath"
              :price-tokens="shopPriceTokens"
              :price-label="shopPriceLabel"
              @update:selected-group="selectedShopGroup = $event"
            />
          </article>

          <article :class="['detail-module dark-card npc-buff-module', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>状态效果</h2>
              <span class="tag paper">{{ buffRelations.length }} 条</span>
            </div>
            <div v-if="buffRelationSections.length" class="npc-buff-section-stack">
              <section v-for="section in buffRelationSections" :key="section.key" class="detail-subgroup npc-buff-section">
                <div class="detail-subgroup-title">
                  <b>{{ section.title }}</b>
                  <span>{{ section.entries.length }} 条</span>
                </div>
                <div class="npc-buff-card-grid">
                  <article v-for="(entry, index) in section.entries" :key="buffRelationCardKey(section.key, entry, index)" class="npc-buff-card">
                    <span class="npc-buff-media">
                      <CommonPreviewImage
                        :src="entryImage(entry)"
                        :alt="entryTitle(entry)"
                        :fallback="firstGlyph(entryTitle(entry))"
                        :fallback-icon="entryFallbackIcon(entry)"
                      />
                    </span>
                    <span class="npc-buff-copy">
                      <span class="npc-buff-title-line">
                        <b>{{ entryTitle(entry) }}</b>
                        <em class="npc-buff-relation-badge">{{ buffRelationMeaningLabel(entry) }}</em>
                      </span>
                      <span class="npc-buff-meta">{{ [buffDurationLabel(entry), chanceLabel(entry), buffConditionLabel(entry)].filter(Boolean).join(' · ') || '效果关系已确认' }}</span>
                    </span>
                  </article>
                </div>
              </section>
            </div>
            <p v-else class="tp-detail-empty">暂时没有整理到状态效果。</p>
          </article>
          </div>

          <aside :class="['evidence-panel dark-card tp-archive-rail npc-archive-rail', detailLayout.detailModuleClass]">
            <span class="eyebrow">关联资料</span>
            <div class="evidence-step"><div><b>掉落物</b><span>{{ materialStatus.loot }}</span></div></div>
            <div class="evidence-step"><div><b>出售物品</b><span>{{ materialStatus.shop }}</span></div></div>
            <div class="evidence-step"><div><b>状态效果</b><span>{{ materialStatus.buffs }}</span></div></div>
          </aside>
        </section>

        <section v-if="preferenceGroups.length" class="npc-related-grid npc-preference-section">
          <article :class="['detail-module dark-card', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>生活偏好</h2>
              <span class="tag paper">{{ livingPreferenceRows.length }} 条</span>
            </div>
            <div class="preference-group-grid">
              <section v-for="group in preferenceGroups" :key="group.key" class="preference-group-card">
                <div class="preference-group-head">
                  <b>{{ group.label }}</b>
                  <span>{{ group.rows.length }} 项</span>
                </div>
                <div class="preference-card-list">
                  <component
                    :is="preferenceTargetPath(row) ? 'NuxtLink' : 'div'"
                    v-for="row in group.rows"
                    :key="String(row.targetType ?? row.target_type ?? row.targetId ?? row.target_id ?? row.targetName ?? row.target_name)"
                    :to="preferenceTargetPath(row) || undefined"
                    class="preference-target-card"
                  >
                    <span class="preference-target-media">
                      <CommonPreviewImage
                        :src="preferenceTargetImage(row)"
                        :alt="preferenceTargetTitle(row)"
                        :fallback="firstGlyph(preferenceTargetTitle(row))"
                        :fallback-icon="preferenceFallbackIcon(row)"
                      />
                    </span>
                    <span class="preference-target-copy">
                      <b>{{ preferenceTargetTitle(row) }}</b>
                      <span>{{ preferenceTargetTypeLabel(row.targetType ?? row.target_type) }}</span>
                      <em v-if="preferenceMissingLinkLabel(row)">{{ preferenceMissingLinkLabel(row) }}</em>
                    </span>
                  </component>
                </div>
              </section>
            </div>
          </article>
        </section>

        <section v-if="relatedItemSections.length" class="npc-related-grid">
          <article v-for="section in relatedItemSections" :key="section.title" :class="['detail-module dark-card', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>{{ section.title }}</h2>
              <span class="tag paper">{{ section.entries.length }} 条</span>
            </div>
            <div class="signal-list">
              <div v-for="entry in section.entries" :key="entry.id">
                <b>关联</b>
                <NuxtLink v-if="entry.href" :to="entry.href">{{ entry.title }}</NuxtLink>
                <span v-else>{{ entry.title }}</span>
                <em>{{ entry.meta || '相关资料' }}</em>
              </div>
            </div>
          </article>
        </section>
        </div>
      </template>
    </main>
</template>

<style scoped>
.detail-relation-row {
  grid-template-columns: 44px minmax(0, 1fr) auto;
  padding: 10px;
}

.npc-capability-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.npc-capability-summary span {
  min-height: 36px;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
  padding: 8px 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.npc-capability-summary b {
  color: var(--text-strong);
}

.npc-archive-page.npc-detail-hero {
  grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) minmax(280px, 340px);
  min-height: 0;
  padding: 22px;
}

.npc-archive-layout {
  display: flex;
  flex-direction: column;
}

.npc-archive-layout .npc-detail-hero {
  order: 1;
}

.npc-archive-layout .npc-archive-content {
  order: 2;
}

.npc-archive-layout .npc-media-section {
  order: 3;
}

.npc-archive-layout .npc-preference-section {
  order: 4;
}

.npc-archive-layout .npc-related-grid:not(.npc-preference-section) {
  order: 5;
}

.npc-hero-portrait {
  display: grid;
  gap: 8px;
  align-content: start;
}

.npc-archive-page .npc-detail-portrait {
  min-height: 184px;
}

.npc-hero-assets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.npc-hero-assets > span {
  display: grid;
  gap: 3px;
  min-width: 0;
  border: 1px solid var(--index-line);
  border-radius: 6px;
  background: var(--index-surface);
  padding: 4px;
}

.npc-hero-assets :deep(.item-art) {
  display: grid;
  place-items: center;
  width: 100%;
  height: 34px;
  --tp-preview-image-size: 90%;
}

.npc-hero-assets small {
  overflow: hidden;
  color: var(--text-faint);
  font-size: 8px;
  font-weight: 800;
  line-height: 1.15;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.npc-archive-page .npc-detail-copy {
  align-content: start;
}

.npc-archive-page .npc-detail-copy h1 {
  margin: 4px 0 0;
  font-family: var(--font-display);
  font-size: 40px;
  line-height: 1.15;
}

.npc-hero-context {
  display: grid;
  gap: 4px;
  border: 1px dashed var(--index-line);
  border-radius: 8px;
  padding: 10px 12px;
}

.npc-hero-context b {
  color: var(--text-muted);
  font-size: 11px;
}

.npc-hero-context p {
  margin: 0;
  color: var(--text-subtle);
  font-size: 12px;
  line-height: 1.6;
}

.npc-archive-page .npc-detail-facts {
  padding: 16px;
}

.npc-archive-page .npc-detail-facts dl {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.npc-archive-page .npc-detail-facts dl > div {
  display: grid;
  gap: 4px;
  min-height: 64px;
  border: 1px solid var(--index-line);
  margin: 0;
  padding: 8px;
}

.npc-archive-page .npc-detail-facts dt {
  color: var(--text-muted);
  font-size: 12px;
}

.npc-archive-page .npc-detail-facts dd {
  margin: 0;
  color: var(--text-strong);
  font-size: 17px;
}

@media (max-width: 640px) {
  .npc-archive-page.npc-detail-hero {
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 12px;
    padding: 16px;
  }

  .npc-archive-page .npc-detail-portrait {
    width: 132px;
    min-height: 142px;
    height: 142px;
    margin: 0;
  }

  .npc-hero-portrait {
    width: 132px;
  }

  .npc-hero-assets {
    gap: 3px;
  }

  .npc-hero-assets > span {
    padding: 2px;
  }

  .npc-hero-assets :deep(.item-art) {
    height: 24px;
  }

  .npc-hero-assets small {
    font-size: 7px;
  }

  .npc-archive-page .npc-detail-copy h1 {
    font-size: 32px;
  }

  .npc-archive-page .npc-detail-facts {
    grid-column: 1 / -1;
    padding: 12px;
  }

  .npc-archive-page .npc-detail-facts dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 掉落行内部结构与样式已随 DetailRelationRow 组件内聚;
   以下选择器继续服务本页内联商店行(同类名),行为与拆分前一致。 */
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

.detail-relation-copy span {
  display: block;
  line-height: 1.5;
}

.npc-shop-grid {
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  gap: 7px;
}

.npc-shop-row {
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 8px;
  min-height: 66px;
  padding: 6px 7px;
  align-items: center;
}

.npc-shop-row .detail-relation-icon {
  width: 32px;
  height: 32px;
}

.npc-shop-row .detail-relation-icon .item-art {
  width: 32px;
  height: 32px;
}

.npc-shop-row .detail-relation-copy {
  display: grid;
  gap: 2px;
}

.npc-shop-row .detail-relation-copy b {
  line-height: 1.1;
}

.npc-shop-row .detail-relation-copy .npc-shop-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 5px;
  min-width: 0;
  line-height: 1.1;
}

.npc-shop-row .detail-relation-copy .npc-shop-price {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  min-width: 0;
  line-height: 1.1;
}

.npc-shop-row .detail-relation-copy .npc-shop-price-token {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  border: 1px solid rgba(222, 187, 95, 0.24);
  border-radius: 999px;
  padding: 1px 5px 1px 2px;
  color: var(--text-strong);
  font-size: 10.5px;
  font-weight: 900;
  line-height: 1.1;
  background: rgba(222, 187, 95, 0.1);
}

.npc-shop-row .detail-relation-copy .npc-shop-price-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  overflow: hidden;
}

.npc-shop-row .detail-relation-copy .npc-shop-price-icon .item-art {
  width: 24px;
  height: 24px;
}

.npc-shop-row .detail-relation-copy .npc-shop-price-text {
  display: inline;
  line-height: 1.1;
}

.npc-shop-row .detail-relation-copy .npc-shop-condition {
  color: var(--text-subtle);
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.1;
}

.npc-money-drops {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
  margin: 0 0 8px;
  border: 1px solid color-mix(in srgb, var(--gold) 18%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--gold) 3%, var(--index-surface));
  padding: 7px;
}

.npc-money-drops-heading {
  display: flex;
  gap: 5px;
  align-items: center;
  min-width: 0;
}

.npc-money-drops-heading b {
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}

.npc-money-drops-heading span {
  color: var(--text-subtle);
  font-size: 10px;
  font-weight: 900;
  white-space: nowrap;
}

.npc-money-drop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(176px, 1fr));
  gap: 6px;
  min-width: 0;
}

.npc-money-drop-row {
  display: grid;
  grid-template-columns: minmax(58px, auto) minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--gold) 18%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--gold) 6%, rgba(0, 0, 0, 0.18));
  padding: 5px 7px;
}

.npc-money-mode-badge {
  display: grid;
  gap: 1px;
  min-width: 0;
  border-radius: 7px;
  background: color-mix(in srgb, var(--gold) 14%, transparent);
  padding: 4px 6px;
}

.npc-money-mode-badge b {
  color: var(--text-subtle);
  font-size: 11px;
  font-weight: 900;
  overflow-wrap: anywhere;
  white-space: nowrap;
}

.npc-money-mode-badge em {
  color: var(--text-muted);
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
}

.npc-money-token-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 3px 7px;
  min-width: 0;
}

.npc-money-token {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  min-width: 0;
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.1;
  white-space: nowrap;
}

.npc-money-token-icon,
.npc-money-token :deep(.npc-money-token-icon),
.npc-money-token :deep(.item-art) {
  width: 32px;
  height: 32px;
}

/* .npc-money-coin-mark 视觉已上移到 assets/css/detail-layout.css(WP-5 共享钱币标记) */

.npc-money-token-copy {
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .npc-money-drops {
    grid-template-columns: 1fr;
  }

  .npc-money-drop-grid {
    grid-template-columns: 1fr;
  }
}

.npc-buff-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.npc-buff-section-stack,
.npc-buff-section {
  display: grid;
  gap: 10px;
}

.npc-buff-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 62px;
  border: 1px solid color-mix(in srgb, var(--index-line) 86%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--index-surface) 90%, transparent);
  padding: 7px;
}

.npc-buff-media {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
}

.npc-buff-media :deep(.item-art) {
  width: 48px;
  height: 48px;
}

.npc-buff-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.npc-buff-title-line {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  min-width: 0;
}

.npc-buff-copy b {
  min-width: 0;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.npc-buff-relation-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  border: 1px solid color-mix(in srgb, var(--gold) 22%, var(--index-line));
  border-radius: 999px;
  background: color-mix(in srgb, var(--gold) 9%, transparent);
  color: var(--gold);
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
  padding: 2px 7px;
  white-space: nowrap;
}

.npc-buff-meta {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  color: var(--text-subtle);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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

.detail-relation-link,
.signal-list a {
  color: var(--text-strong);
  font-weight: 900;
  text-decoration: none;
}

.detail-relation-link:hover,
.signal-list a:hover {
  color: var(--gold);
}

.npc-media-section {
  display: grid;
  gap: 12px;
  margin: var(--tp-detail-page-gap, 22px) 0;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  padding: 14px;
  background: var(--index-surface);
}

.npc-media-band {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  min-width: 0;
}

.npc-media-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  padding: 10px;
  background: var(--index-surface-strong);
}

.npc-media-frame {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border: 1px solid var(--index-line-strong);
  border-radius: 8px;
  background: var(--index-surface);
  overflow: hidden;
}

.npc-media-frame .item-art {
  width: 100%;
  height: 100%;
}

.npc-media-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.npc-media-copy b,
.npc-media-copy em {
  min-width: 0;
  overflow-wrap: anywhere;
}

.npc-media-copy b {
  color: var(--text-strong);
  font-size: 14px;
}

.npc-media-copy em {
  color: var(--text-subtle);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.npc-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--tp-detail-page-gap, 22px);
  min-width: 0;
}

.npc-preference-section {
  grid-template-columns: 1fr;
}

.preference-group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.preference-group-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.035);
}

.preference-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.preference-group-head b {
  color: var(--text-strong);
  font-size: 14px;
}

.preference-group-head span {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 900;
}

.preference-card-list {
  display: grid;
  gap: 8px;
}

.preference-target-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 58px;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px;
  color: inherit;
  text-decoration: none;
  background: rgba(0, 0, 0, 0.16);
}

.preference-target-card:hover {
  border-color: rgba(222, 187, 95, 0.38);
  background: rgba(222, 187, 95, 0.08);
}

.preference-target-media {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
}

.preference-target-media .item-art {
  width: 48px;
  height: 48px;
}

.preference-target-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.preference-target-copy b,
.preference-target-copy span,
.preference-target-copy em {
  min-width: 0;
  overflow-wrap: anywhere;
}

.preference-target-copy b {
  color: var(--text-strong);
  font-size: 13px;
}

.preference-target-copy span,
.preference-target-copy em {
  color: var(--text-subtle);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.grouped-source-list,
.detail-subgroup {
  display: grid;
  gap: 12px;
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

.detail-group-remainder {
  display: grid;
  gap: 10px;
}

.detail-group-remainder summary {
  width: fit-content;
  cursor: pointer;
  color: var(--gold);
  font-size: 12px;
  font-weight: 900;
}

@media (max-width: 720px) {
  .npc-media-band,
  .preference-group-grid {
    grid-template-columns: 1fr;
  }

  .detail-relation-row {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .npc-shop-grid {
    grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
    gap: 7px;
  }

  .npc-shop-row {
    grid-template-columns: 32px minmax(0, 1fr);
  }

  .detail-subgroup-title {
    display: grid;
    gap: 4px;
  }

  .detail-relation-meta {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
