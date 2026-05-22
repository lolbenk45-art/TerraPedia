<script setup lang="ts">
import type {
  PublicNpcBuffRelation,
  PublicNpcLootEntry,
  PublicNpcShopCondition,
  PublicNpcShopEntry,
  PublicNpcTraceableItemSummary,
} from '~/types/public-api'

const route = useRoute()
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
const moduleStatus = computed(() => aggregate.value?.moduleStatus ?? {})
const loot = computed(() => aggregate.value?.loot ?? [])
const trustedLoot = computed(() => loot.value.filter((entry) => entry.trustedStructured === true && entry.lootSourceMode === 'direct'))
const fallbackLoot = computed(() => loot.value.filter((entry) => !(entry.trustedStructured === true && entry.lootSourceMode === 'direct')))
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
const displayName = computed(() => firstText(npc.value?.nameZh, npc.value?.name, npc.value?.internalName, `NPC ${routeNpcId.value}`))
const secondaryName = computed(() => firstText(npc.value?.nameZh) ? firstText(npc.value?.name, npc.value?.internalName) : firstText(npc.value?.internalName))
const portraitImage = computed(() => resolvePreviewImageUrl(firstText(npc.value?.imageUrl)))
const portraitFallback = computed(() => firstGlyph(displayName.value || 'NPC'))
const aggregatedAt = computed(() => {
  const value = firstText(aggregate.value?.aggregatedAt)
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
})

const entryTitle = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcBuffRelation) => firstText(
  'buffNameZh' in entry ? entry.buffNameZh : undefined,
  'itemNameZh' in entry ? entry.itemNameZh : undefined,
  'buffName' in entry ? entry.buffName : undefined,
  'itemName' in entry ? entry.itemName : undefined,
  'buffInternalName' in entry ? entry.buffInternalName : undefined,
  'itemInternalName' in entry ? entry.itemInternalName : undefined,
  '资料项',
)

const entryImage = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcBuffRelation) => resolvePreviewImageUrl(firstText(
  entry.imageUrl,
  'itemImage' in entry ? entry.itemImage : undefined,
  'buffImage' in entry ? entry.buffImage : undefined,
))

const quantityLabel = (entry: PublicNpcLootEntry) => {
  if (entry.quantityText) return entry.quantityText
  if (entry.quantityMin != null && entry.quantityMax != null && entry.quantityMin !== entry.quantityMax) return `${entry.quantityMin}-${entry.quantityMax}`
  return firstText(entry.quantityMin, entry.quantityMax)
}

const chanceLabel = (entry: PublicNpcLootEntry | PublicNpcBuffRelation) => {
  if (entry.chanceText) return entry.chanceText
  return entry.chanceValue != null ? `${entry.chanceValue}%` : ''
}

const shopPriceLabel = (entry: PublicNpcShopEntry) => firstText(entry.priceText, entry.buyPriceText, entry.currencyText, '价格未标记')

const conditionLabel = (condition: PublicNpcShopCondition) => firstText(
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

const shopConditionsLabel = (entry: PublicNpcShopEntry) => {
  if (Array.isArray(entry.conditions)) {
    return entry.conditions.map(conditionLabel).filter(Boolean).join(' / ')
  }

  return firstText(entry.conditions)
}

const buffDurationLabel = (entry: PublicNpcBuffRelation) => firstText(
  entry.durationText,
  entry.durationSeconds != null ? `${entry.durationSeconds}s` : '',
)

const traceableRelationSections = computed(() => {
  const sections = [
    { title: '掉落追踪', entries: (npc.value?.lootItems ?? []) as PublicNpcTraceableItemSummary[] },
    { title: '商店追踪', entries: (npc.value?.shopItems ?? []) as PublicNpcTraceableItemSummary[] },
    { title: '来源追踪', entries: (((npc.value as Record<string, unknown> | null)?.['source' + 'Items'] ?? []) as PublicNpcTraceableItemSummary[]) },
  ]

  return sections.map((section) => ({
    ...section,
    entries: section.entries.slice(0, 6).map((entry, index) => ({
      id: firstText(entry.sourceFactKey, entry.itemId, entry.itemInternalName, `${section.title}-${index}`),
      title: firstText(entry.itemNameZh, entry.itemName, entry.itemInternalName, '关联物品'),
      meta: [entry.relationType, entry.quantityText, entry.chanceText, entry.priceText].map(firstText).filter(Boolean).join(' / '),
      source: [entry.sourceProvider, entry.sourcePage].map(firstText).filter(Boolean).join(' · '),
    })),
  })).filter((section) => section.entries.length > 0)
})
</script>

<template>
  <section class="screen entity-screen active" :aria-busy="loadingState">
    <TerraNav />
    <TerraBreadcrumb />

    <main class="entity-detail-layout">
      <section v-if="loadingState" class="npc-detail-hero">
        <div class="npc-detail-portrait">
          <span class="item-art tp-preview-image is-fallback" data-fallback="N"></span>
        </div>
        <div class="npc-detail-copy">
          <span class="eyebrow">加载 NPC 详情</span>
          <strong class="detail-missing-title">加载 NPC 详情</strong>
          <p>正在通过公开聚合接口读取掉落、商店和 Buff 模块。</p>
        </div>
      </section>

      <section v-else-if="missingState" class="npc-detail-hero">
        <div class="npc-detail-portrait">
          <span class="item-art tp-preview-image is-fallback" data-fallback="N"></span>
        </div>
        <div class="npc-detail-copy">
          <span class="eyebrow">NPC #{{ routeNpcId || '未知' }} · 未找到</span>
          <strong class="detail-missing-title">没有找到这个 NPC</strong>
          <p>{{ invalidNpcId ? '当前公开详情只接受数值 NPC id。' : '公开聚合接口没有返回可渲染的 NPC 资料。' }}</p>
          <div class="tag-row">
            <span class="tag paper">详情缺失</span>
            <span v-if="aggregateError" class="tag moss">接口异常</span>
          </div>
          <a class="primary-button" href="/npcs">返回 NPC 图鉴</a>
        </div>
      </section>

      <template v-else>
        <section class="npc-detail-hero">
          <div class="npc-detail-portrait">
            <CommonPreviewImage :src="portraitImage" :alt="displayName" :fallback="portraitFallback" loading="eager" />
          </div>
          <div class="npc-detail-copy">
            <span class="eyebrow">NPC #{{ npc?.gameId ?? npc?.id }} · {{ secondaryName || 'Public Aggregate' }}</span>
            <h1>{{ displayName }}</h1>
            <p>{{ firstText(npc?.behaviorNotes, `${displayName} 的公开资料来自 NPC 聚合接口，包含掉落、商店和 Buff 关系。`) }}</p>
            <div class="tag-row">
              <span v-if="npc?.isTownNpc" class="tag gold">城镇 NPC</span>
              <span v-if="npc?.isFriendly" class="tag moss">友好</span>
              <span class="tag paper">{{ firstText(npc?.categoryName, '未分类') }}</span>
              <span class="tag paper">{{ aggregateBundle?.source === 'api' ? '实时接口' : '资料状态' }}</span>
            </div>
          </div>
          <aside class="npc-detail-facts">
            <p class="section-label">核心属性</p>
            <dl>
              <dt>Game ID</dt><dd>{{ npc?.gameId ?? '--' }}</dd>
              <dt>Internal</dt><dd>{{ npc?.internalName || '--' }}</dd>
              <dt>聚合时间</dt><dd>{{ aggregatedAt }}</dd>
              <dt>类型</dt><dd>{{ npc?.isTownNpc ? '城镇角色' : npc?.isFriendly ? '友好角色' : '公开 NPC' }}</dd>
            </dl>
          </aside>
        </section>

        <section class="detail-mosaic">
          <article class="detail-module dark-card">
            <div class="module-title">
              <h2>掉落</h2>
              <span class="tag moss">{{ trustedLoot.length }} 条</span>
            </div>
            <div v-if="trustedLoot.length" class="source-table dark-table">
              <div v-for="entry in trustedLoot" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" class="source-row">
                <span class="sprite-frame" style="width:42px;height:42px">
                  <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                </span>
                <div><b>{{ entryTitle(entry) }}</b><span>{{ [quantityLabel(entry), chanceLabel(entry), entry.conditions].filter(Boolean).join(' · ') || '结构化掉落' }}</span></div>
                <strong>掉落</strong>
              </div>
            </div>
            <p v-else>当前聚合接口没有返回可信结构化掉落。</p>
          </article>

          <article class="detail-module dark-card">
            <div class="module-title">
              <h2>商店</h2>
              <span class="tag gold">{{ shopEntries.length }} 项</span>
            </div>
            <div v-if="shopEntries.length" class="source-table dark-table">
              <div v-for="entry in shopEntries" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" class="source-row">
                <span class="sprite-frame" style="width:42px;height:42px">
                  <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                </span>
                <div><b>{{ entryTitle(entry) }}</b><span>{{ [shopPriceLabel(entry), shopConditionsLabel(entry)].filter(Boolean).join(' · ') }}</span></div>
                <strong>商店</strong>
              </div>
            </div>
            <p v-else>当前聚合接口没有返回商店条目。</p>
          </article>

          <article class="detail-module dark-card">
            <div class="module-title">
              <h2>Buff</h2>
              <span class="tag paper">{{ buffRelations.length }} 条</span>
            </div>
            <div v-if="buffRelations.length" class="source-table dark-table">
              <div v-for="entry in buffRelations" :key="String(entry.id ?? entry.buffId ?? entry.buffInternalName)" class="source-row">
                <span class="sprite-frame" style="width:42px;height:42px">
                  <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                </span>
                <div><b>{{ entryTitle(entry) }}</b><span>{{ [entry.relationType, buffDurationLabel(entry), chanceLabel(entry), entry.conditions].filter(Boolean).join(' · ') || 'Buff 关系' }}</span></div>
                <strong>Buff</strong>
              </div>
            </div>
            <p v-else>当前聚合接口没有返回 Buff 关系。</p>
          </article>

          <aside class="evidence-panel dark-card">
            <span class="eyebrow">聚合模块</span>
            <div class="evidence-step"><div><b>Loot</b><span>{{ moduleStatus.loot || 'unknown' }}</span></div></div>
            <div class="evidence-step"><div><b>Shop</b><span>{{ moduleStatus.shop || 'unknown' }}</span></div></div>
            <div class="evidence-step"><div><b>Buffs</b><span>{{ moduleStatus.buffs || 'unknown' }}</span></div></div>
          </aside>
        </section>

        <section v-if="fallbackLoot.length || traceableRelationSections.length" class="detail-mosaic">
          <article v-if="fallbackLoot.length" class="detail-module dark-card">
            <div class="module-title">
              <h2>回退掉落</h2>
              <span class="tag paper">{{ fallbackLoot.length }} 条</span>
            </div>
            <div class="signal-list">
              <div v-for="entry in fallbackLoot.slice(0, 6)" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)">
                <b>{{ entry.lootSourceMode || 'fallback' }}</b><span>{{ entryTitle(entry) }}</span><em>{{ [quantityLabel(entry), chanceLabel(entry)].filter(Boolean).join(' · ') || '非直接可信掉落' }}</em>
              </div>
            </div>
          </article>

          <article v-for="section in traceableRelationSections" :key="section.title" class="detail-module dark-card">
            <div class="module-title">
              <h2>{{ section.title }}</h2>
              <span class="tag paper">{{ section.entries.length }} 条</span>
            </div>
            <div class="signal-list">
              <div v-for="entry in section.entries" :key="entry.id">
                <b>Trace</b><span>{{ entry.title }}</span><em>{{ [entry.meta, entry.source].filter(Boolean).join(' · ') || '公开追踪资料' }}</em>
              </div>
            </div>
          </article>
        </section>
      </template>
    </main>

    <TerraFooter />
  </section>
</template>
