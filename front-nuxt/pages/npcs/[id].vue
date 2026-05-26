<script setup lang="ts">
import type {
  PublicNpcBuffRelation,
  PublicNpcLivingPreference,
  PublicNpcLootEntry,
  PublicNpcMoneyDrop,
  PublicNpcMoneyToken,
  PublicNpcShopCondition,
  PublicNpcShopEntry,
  PublicNpcShopPriceToken,
  PublicNpcTraceableItemSummary,
} from '~/types/public-api'
import { buildTerrariaPriceTokens, formatTerrariaPriceTokens, localizeTerrariaPriceShorthandText, resolveTerrariaPriceUnitLabel, type TerrariaPriceToken } from '~/utils/price'

const route = useRoute()
const detailLayout = useDetailLayout({ kind: 'npc', density: 'compact' })
const include = 'loot,shop,buffs'

const routeNpcId = computed(() => String(route.params.id ?? '').trim())
const numericNpcId = computed(() => {
  const value = Number(routeNpcId.value)
  return Number.isInteger(value) && value !== 0 ? value : null
})
const invalidNpcId = computed(() => numericNpcId.value == null)
const { data: aggregateBundle, pending: aggregatePending, error: aggregateError } = await usePublicNpcAggregate(
  () => numericNpcId.value ?? routeNpcId.value,
  include,
)

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

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const rawPublicCopyPattern = /{{|}}|<\/?[a-z][\s\S]*?>|https?:\/\/|wiki\.gg|iteminfo|eicons|internal|wiki\s*(?:page|path)|(?:^|[\s_-])shop[\s_/-]*\d+(?:[\s_/-]*\d+)*(?:$|[\s_-])/i
const safeNpcDisplayText = (...values: unknown[]) => {
  for (const value of values) {
    const text = localizeTerrariaPriceShorthandText(firstText(value)).replace(/\s+/g, ' ')
    if (text && !rawPublicCopyPattern.test(text)) return text
  }

  return ''
}
const displayName = computed(() => safeNpcDisplayText(npc.value?.nameZh, npc.value?.name) || `NPC ${routeNpcId.value}`)
const secondaryName = computed(() => {
  const zhName = safeNpcDisplayText(npc.value?.nameZh)
  const name = safeNpcDisplayText(npc.value?.name)
  return zhName && name && name !== zhName ? name : ''
})

useSeoMeta({
  title: () => `TerraPedia · ${displayName.value}`,
  description: () => `${displayName.value} 的公开 NPC 资料详情，包含基础数值、生活偏好、掉落、出售物品和状态效果关系。`,
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
const npcMoneyCoinClass = (unit: unknown) => {
  const key = firstText(unit).toLowerCase()
  if (key === 'platinum' || key === 'pc' || key === 'platinum coin') return 'platinum'
  if (key === 'gold' || key === 'gc' || key === 'gold coin') return 'gold'
  if (key === 'silver' || key === 'sc' || key === 'silver coin') return 'silver'
  if (key === 'copper' || key === 'cc' || key === 'copper coin') return 'copper'
  return 'unknown'
}
const normalizeNpcMoneyToken = (token: PublicNpcMoneyToken): TerrariaPriceToken | null => {
  const amount = Number(token.amount)
  const unitLabel = resolveTerrariaPriceUnitLabel(token.unit)
  if (!Number.isFinite(amount) || amount <= 0 || !unitLabel) return null

  return {
    unit: firstText(token.unit),
    amount: Math.trunc(amount),
    label: unitLabel,
    iconUrl: resolvePreviewImageUrl(firstText(token.iconUrl, token.icon_url)),
  }
}
const npcMoneyDropTokens = (drop: PublicNpcMoneyDrop): TerrariaPriceToken[] => {
  return Array.isArray(drop.tokens)
    ? drop.tokens.map(normalizeNpcMoneyToken).filter((token): token is TerrariaPriceToken => Boolean(token))
    : []
}
const npcMoneyDrops = computed(() => (Array.isArray(npc.value?.moneyDrops) ? npc.value?.moneyDrops : [])
  .map((drop, index) => {
    const tokens = npcMoneyDropTokens(drop)
    return {
      key: `normal-${index}-${formatTerrariaPriceTokens(tokens)}`,
      tokens,
    }
  })
  .filter((drop) => drop.tokens.length > 0))

const conditionLabel = (condition: PublicNpcShopCondition) => safeNpcDisplayText(
  condition.label,
  condition.contextNameZh,
  condition.contextNameEn,
  condition.gamePeriodNameZh,
  condition.gamePeriodNameEn,
  condition.refNpcNameZh,
  condition.refNpcName,
  condition.refItemNameZh,
  condition.refItemName,
  condition.biomeNameZh,
  condition.biomeNameEn,
  condition.notes,
)
const conditionHasResolvedLabel = (condition: PublicNpcShopCondition) => Boolean(conditionLabel(condition))

const shopConditionsLabel = (entry: PublicNpcShopEntry) => {
  if (Array.isArray(entry.conditions)) {
    const labels = entry.conditions.map(conditionLabel).filter(Boolean)
    const safeNotes = safeNpcDisplayText(entry.notes)
    return labels.join(' / ') || safeNotes || (entry.conditions.length > 0 || safeNotes ? '特殊条件' : '')
  }

  return safeNpcDisplayText(entry.conditions, entry.notes)
}

const shopConditionSummary = (entry: PublicNpcShopEntry) => {
  if (!Array.isArray(entry.conditions)) return shopConditionsLabel(entry)
  const labels = entry.conditions.map(conditionLabel).filter(Boolean)
  if (labels.length === 0) {
    const safeNotes = safeNpcDisplayText(entry.notes)
    return safeNotes || (entry.conditions.length > 0 || safeNotes ? '特殊条件' : '')
  }
  if (labels.length <= 2) return labels.join(' / ')
  return `${labels.slice(0, 2).join(' / ')} / 另有 ${labels.length - 2} 个条件`
}

const shopGroupKey = (entry: PublicNpcShopEntry) => {
  if (!Array.isArray(entry.conditions)) {
    return shopConditionsLabel(entry) ? 'other' : 'always'
  }
  if (entry.conditions.length === 0) return safeNpcDisplayText(entry.notes) ? 'other' : 'always'
  const conditions = entry.conditions
  if (conditions.some((condition) => safeNpcDisplayText(condition.gamePeriodNameZh, condition.gamePeriodNameEn))) return 'period'
  if (conditions.some((condition) => safeNpcDisplayText(condition.biomeNameZh, condition.biomeNameEn))) return 'biome'
  if (conditions.some((condition) => safeNpcDisplayText(condition.refNpcNameZh, condition.refNpcName, condition.refItemNameZh, condition.refItemName))) return 'unlock'
  if (!conditions.some(conditionHasResolvedLabel)) return 'other'
  return shopConditionSummary(entry) ? 'other' : 'always'
}

const shopGroupMeta = {
  always: { title: '常驻出售', meta: '无额外条件' },
  period: { title: '阶段出售', meta: '随进度解锁' },
  biome: { title: '地点出售', meta: '与环境或地点相关' },
  unlock: { title: '解锁出售', meta: '需要 NPC、物品或事件前置' },
  other: { title: '其他条件', meta: '包含特殊条件' },
} as const

const shopEntryGroups = computed(() => {
  const buckets = new Map<keyof typeof shopGroupMeta, PublicNpcShopEntry[]>()

  for (const entry of shopEntries.value) {
    const key = shopGroupKey(entry) as keyof typeof shopGroupMeta
    buckets.set(key, [...(buckets.get(key) ?? []), entry])
  }

  return (Object.keys(shopGroupMeta) as Array<keyof typeof shopGroupMeta>)
    .map((key) => ({
      key,
      title: shopGroupMeta[key].title,
      meta: shopGroupMeta[key].meta,
      entries: buckets.get(key) ?? [],
    }))
    .filter((group) => group.entries.length > 0)
})

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

const relatedItemSections = computed(() => {
  const sections = [
    { title: '掉落相关', entries: (npc.value?.lootItems ?? []) as PublicNpcTraceableItemSummary[] },
    { title: '出售相关', entries: (npc.value?.shopItems ?? []) as PublicNpcTraceableItemSummary[] },
    { title: '来源相关', entries: (((npc.value as Record<string, unknown> | null)?.['source' + 'Items'] ?? []) as PublicNpcTraceableItemSummary[]) },
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
</script>

<template>
  <section class="screen entity-screen active" :aria-busy="loadingState">
    <TerraNav />
    <TerraBreadcrumb />

    <main :class="['entity-detail-layout', detailLayout.detailShellClass]">
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
          <span class="eyebrow">NPC #{{ routeNpcId || '未知' }} · 未找到</span>
          <component :is="'h1'" class="detail-missing-title">没有找到这个 NPC</component>
          <p>{{ invalidNpcId ? '请从 NPC 图鉴进入对应详情页。' : '暂时没有可显示的 NPC 资料。' }}</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="aggregateError" class="tag moss">载入异常</span>
          </div>
          <a class="primary-button" href="/npcs">返回 NPC 图鉴</a>
        </div>
      </section>

      <template v-else>
        <section class="npc-detail-hero">
          <div class="npc-detail-portrait">
            <CommonPreviewImage :src="portraitImage" :alt="displayName" :fallback="portraitFallback" fallback-icon="icon-npc" loading="eager" />
          </div>
          <div class="npc-detail-copy">
            <span class="eyebrow">NPC #{{ npc?.gameId ?? npc?.id }} · {{ secondaryName || '详情资料' }}</span>
            <h1>{{ displayName }}</h1>
            <p>{{ npcBehaviorSummary }}</p>
            <div class="tag-row">
              <span v-if="npc?.isTownNpc" class="tag gold">城镇 NPC</span>
              <span v-if="npc?.isFriendly" class="tag moss">友好</span>
              <span class="tag paper">{{ safeNpcDisplayText(npc?.categoryName) || '未分类' }}</span>
              <span class="tag paper">{{ trustedLoot.length + additionalLoot.length }} 条掉落</span>
              <span class="tag paper">{{ shopEntries.length }} 项出售</span>
              <span class="tag paper">{{ npcSourceTag }}</span>
            </div>
          </div>
          <aside class="npc-detail-facts">
            <p class="section-label">基础数值</p>
            <dl>
              <template v-for="row in npcStatRows" :key="row.label">
                <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
              </template>
            </dl>
          </aside>
        </section>

        <section v-if="npcAssetCards.length" class="npc-media-section">
          <div class="module-title">
            <h2>资料图像</h2>
            <span class="tag paper">{{ npcAssetCards.length }} 张</span>
          </div>
          <div class="npc-media-band">
            <article v-for="asset in npcAssetCards" :key="asset.key" class="npc-media-card">
              <span class="npc-media-frame">
                <CommonPreviewImage
                  :src="asset.image"
                  :source-image="asset.sourceImage"
                  :alt="`${displayName} ${asset.label}`"
                  :fallback="portraitFallback"
                  :fallback-icon="asset.fallbackIcon"
                />
              </span>
              <span class="npc-media-copy">
                <b>{{ asset.label }}</b>
                <em>{{ asset.meta }}</em>
              </span>
            </article>
          </div>
        </section>

        <section :class="['detail-grid npc-detail-grid', detailLayout.detailGridClass, detailLayout.detailDensityClass]">
          <div class="module-stack">
            <article :class="['detail-module dark-card', detailLayout.detailModuleClass]">
              <div class="module-title">
                <h2>掉落物</h2>
                <span class="tag moss">{{ trustedLoot.length + additionalLoot.length }} 条</span>
              </div>
              <div v-if="npcMoneyDrops.length" class="npc-money-drops" aria-label="钱币掉落">
                <div class="npc-money-drops-heading">
                  <b>钱币掉落</b>
                  <span>普通敌怪</span>
                </div>
                <div class="npc-money-drop-grid">
                  <div v-for="drop in npcMoneyDrops" :key="drop.key" class="npc-money-drop-row">
                    <b>普通掉落</b>
                    <div class="npc-money-token-row" :aria-label="formatTerrariaPriceTokens(drop.tokens)">
                      <span v-for="token in drop.tokens" :key="`${drop.key}-${token.unit}`" class="npc-money-token">
                        <CommonPreviewImage
                          v-if="token.iconUrl"
                          class="npc-money-token-icon"
                          :src="token.iconUrl"
                          :alt="resolveTerrariaPriceUnitLabel(token.unit)"
                          :fallback="firstGlyph(resolveTerrariaPriceUnitLabel(token.unit))"
                          fallback-icon="icon-items"
                          width="28"
                          height="28"
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
                <div v-for="entry in trustedLootVisibleEntries" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                  <span class="sprite-frame detail-relation-icon">
                    <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" :fallback-icon="entryFallbackIcon(entry)" />
                  </span>
                  <div class="detail-relation-copy">
                    <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                    <b v-else>{{ entryTitle(entry) }}</b>
                    <span>{{ [quantityLabel(entry), chanceLabel(entry), lootConditionLabel(entry)].filter(Boolean).join(' · ') || '掉落资料待补充' }}</span>
                  </div>
                  <strong class="detail-relation-meta">掉落</strong>
                </div>
              </div>
              <details v-if="trustedLootRemainderEntries.length" class="detail-group-remainder">
                <summary>展开其余 {{ trustedLootRemainderEntries.length }} 条</summary>
                <div class="source-table dark-table tp-detail-relation-grid">
                  <div v-for="entry in trustedLootRemainderEntries" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                    <span class="sprite-frame detail-relation-icon">
                      <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" :fallback-icon="entryFallbackIcon(entry)" />
                    </span>
                    <div class="detail-relation-copy">
                      <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                      <b v-else>{{ entryTitle(entry) }}</b>
                      <span>{{ [quantityLabel(entry), chanceLabel(entry), lootConditionLabel(entry)].filter(Boolean).join(' · ') || '掉落资料待补充' }}</span>
                    </div>
                    <strong class="detail-relation-meta">掉落</strong>
                  </div>
                </div>
              </details>
              <div v-if="additionalLoot.length" class="detail-subgroup npc-additional-loot">
                <div class="detail-subgroup-title">
                  <b>其他掉落记录</b>
                  <span>{{ additionalLoot.length }} 条 · 需结合来源记录查看</span>
                </div>
                <div class="source-table dark-table tp-detail-relation-grid">
                  <div v-for="entry in additionalLoot.slice(0, 6)" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                    <span class="sprite-frame detail-relation-icon">
                      <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" :fallback-icon="entryFallbackIcon(entry)" />
                    </span>
                    <div class="detail-relation-copy">
                      <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                      <b v-else>{{ entryTitle(entry) }}</b>
                      <span>{{ [quantityLabel(entry), chanceLabel(entry), lootConditionLabel(entry)].filter(Boolean).join(' · ') || '掉落资料待补充' }}</span>
                    </div>
                    <strong class="detail-relation-meta">补充</strong>
                  </div>
                </div>
              </div>
              <p v-if="!trustedLoot.length && !additionalLoot.length" class="tp-detail-empty">暂时没有整理到掉落物。</p>
            </article>

          <article :class="['detail-module dark-card', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>出售物品</h2>
              <span class="tag gold">{{ shopEntries.length }} 项</span>
            </div>
            <div v-if="shopEntryGroups.length" class="grouped-source-list">
              <section v-for="group in shopEntryGroups" :key="group.key" class="detail-subgroup">
                <div class="detail-subgroup-title">
                  <b>{{ group.title }}</b>
                  <span>{{ group.entries.length }} 项 · {{ group.meta }}</span>
                </div>
                <div class="source-table dark-table tp-detail-relation-grid npc-shop-grid">
                  <div v-for="entry in group.entries.slice(0, 8)" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row npc-shop-row', detailLayout.detailRelationRowClass]">
                    <span class="sprite-frame detail-relation-icon">
                      <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" :fallback-icon="entryFallbackIcon(entry)" />
                    </span>
                    <div class="detail-relation-copy">
                      <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                      <b v-else>{{ entryTitle(entry) }}</b>
                      <span class="npc-shop-meta">
                        <span v-if="shopPriceTokens(entry).length" class="npc-shop-price" :aria-label="shopPriceLabel(entry)">
                          <span v-for="token in shopPriceTokens(entry)" :key="`${entry.id ?? entry.itemId}-${token.unit}`" class="npc-shop-price-token">
                            <span class="npc-shop-price-icon">
                              <CommonPreviewImage :src="token.iconUrl" :alt="token.label" :fallback="token.label" fallback-icon="icon-items" decorative />
                            </span>
                            <span class="npc-shop-price-text">{{ token.amount }}{{ token.label }}</span>
                          </span>
                        </span>
                        <span v-if="shopConditionSummary(entry)" class="npc-shop-condition">{{ shopConditionSummary(entry) }}</span>
                        <span v-if="!shopPriceTokens(entry).length && !shopConditionSummary(entry)">商店资料</span>
                      </span>
                    </div>
                  </div>
                </div>
                <details v-if="group.entries.length > 8" class="detail-group-remainder">
                  <summary>展开其余 {{ group.entries.length - 8 }} 项</summary>
                  <div class="source-table dark-table tp-detail-relation-grid npc-shop-grid">
                    <div v-for="entry in group.entries.slice(8)" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row npc-shop-row', detailLayout.detailRelationRowClass]">
                      <span class="sprite-frame detail-relation-icon">
                        <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" :fallback-icon="entryFallbackIcon(entry)" />
                      </span>
                      <div class="detail-relation-copy">
                        <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                        <b v-else>{{ entryTitle(entry) }}</b>
                        <span class="npc-shop-meta">
                          <span v-if="shopPriceTokens(entry).length" class="npc-shop-price" :aria-label="shopPriceLabel(entry)">
                            <span v-for="token in shopPriceTokens(entry)" :key="`${entry.id ?? entry.itemId}-${token.unit}`" class="npc-shop-price-token">
                              <span class="npc-shop-price-icon">
                                <CommonPreviewImage :src="token.iconUrl" :alt="token.label" :fallback="token.label" fallback-icon="icon-items" decorative />
                              </span>
                              <span class="npc-shop-price-text">{{ token.amount }}{{ token.label }}</span>
                            </span>
                          </span>
                          <span v-if="shopConditionSummary(entry)" class="npc-shop-condition">{{ shopConditionSummary(entry) }}</span>
                          <span v-if="!shopPriceTokens(entry).length && !shopConditionSummary(entry)">商店资料</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </details>
              </section>
            </div>
            <p v-else class="tp-detail-empty">暂时没有整理到出售物品。</p>
          </article>

          <article :class="['detail-module dark-card', detailLayout.detailModuleClass]">
            <div class="module-title">
              <h2>状态效果</h2>
              <span class="tag paper">{{ buffRelations.length }} 条</span>
            </div>
            <div v-if="buffRelations.length" class="npc-buff-card-grid">
              <article v-for="entry in buffRelations" :key="String(entry.id ?? entry.buffId ?? entry.buffInternalName)" class="npc-buff-card">
                <span class="npc-buff-media">
                  <CommonPreviewImage
                    :src="entryImage(entry)"
                    :alt="entryTitle(entry)"
                    :fallback="firstGlyph(entryTitle(entry))"
                    :fallback-icon="entryFallbackIcon(entry)"
                  />
                </span>
                <span class="npc-buff-copy">
                  <b>{{ entryTitle(entry) }}</b>
                  <span class="npc-buff-meta">{{ [relationTypeLabel(entry.relationType), buffDurationLabel(entry), chanceLabel(entry), buffConditionLabel(entry)].filter(Boolean).join(' · ') || '状态效果资料' }}</span>
                </span>
              </article>
            </div>
            <p v-else class="tp-detail-empty">暂时没有整理到状态效果。</p>
          </article>
          </div>

          <aside :class="['evidence-panel dark-card', detailLayout.detailModuleClass]">
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
      </template>
    </main>

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
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 10px;
  align-items: center;
  margin: 0 0 8px;
  border: 1px solid color-mix(in srgb, var(--gold) 18%, var(--index-line));
  border-radius: 8px;
  background: color-mix(in srgb, var(--gold) 3%, var(--index-surface));
  padding: 5px 7px;
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
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 6px;
  min-width: 0;
}

.npc-money-drop-row {
  display: inline-grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  min-width: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gold) 5%, transparent);
  padding: 2px 5px;
}

.npc-money-drop-row > b {
  min-width: 0;
  color: var(--text-subtle);
  font-size: 10px;
  font-weight: 900;
  overflow-wrap: anywhere;
  white-space: nowrap;
}

.npc-money-token-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px 6px;
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
  width: 24px;
  height: 24px;
}

.npc-money-coin-mark {
  --coin-core: #d6b15a;
  --coin-rim: #8b5f17;
  --coin-shine: rgba(255, 255, 255, 0.72);
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border: 2px solid var(--coin-rim);
  border-radius: 999px;
  background:
    radial-gradient(circle at 32% 28%, var(--coin-shine) 0 12%, transparent 13%),
    radial-gradient(circle at 50% 52%, var(--coin-core) 0 48%, var(--coin-rim) 49% 68%, transparent 69%);
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--coin-core) 45%, transparent),
    0 1px 3px rgba(0, 0, 0, 0.18);
}

.npc-money-coin-mark::after {
  content: "";
  width: 40%;
  height: 40%;
  border: 1px solid color-mix(in srgb, var(--coin-rim) 76%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--coin-core) 74%, transparent);
}

.npc-money-coin-mark.is-platinum {
  --coin-core: #e7eef2;
  --coin-rim: #8c9ba4;
  --coin-shine: rgba(255, 255, 255, 0.9);
}

.npc-money-coin-mark.is-gold {
  --coin-core: #f0c85c;
  --coin-rim: #9a681c;
}

.npc-money-coin-mark.is-silver {
  --coin-core: #c9d2dc;
  --coin-rim: #6f7f8c;
  --coin-shine: rgba(255, 255, 255, 0.84);
}

.npc-money-coin-mark.is-copper {
  --coin-core: #c77b45;
  --coin-rim: #7d3f22;
}

.npc-money-token-copy {
  min-width: 0;
  overflow-wrap: anywhere;
}

.npc-buff-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
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

.npc-buff-copy b {
  min-width: 0;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.15;
  overflow-wrap: anywhere;
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
  background: rgba(13, 22, 16, 0.62);
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
  background: rgba(13, 22, 16, 0.78);
}

.npc-media-frame {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border: 1px solid rgba(222, 187, 95, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
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
