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
const loot = computed(() => aggregate.value?.loot ?? [])
const trustedLoot = computed(() => loot.value.filter((entry) => entry.trustedStructured === true && entry.lootSourceMode === 'direct'))
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
const displayName = computed(() => firstText(npc.value?.nameZh, npc.value?.name, npc.value?.internalName, `NPC ${routeNpcId.value}`))
const secondaryName = computed(() => firstText(npc.value?.nameZh) ? firstText(npc.value?.name, npc.value?.internalName) : firstText(npc.value?.internalName))

useSeoMeta({
  title: () => `TerraPedia · ${displayName.value}`,
  description: () => `${displayName.value} 的公开 NPC 资料详情，包含基础数值、掉落、出售物品和状态效果关系。`,
})

const portraitImage = computed(() => resolvePreviewImageUrl(firstText(npc.value?.imageUrl)))
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

const npcStatRows = computed(() => [
  { label: '编号', value: firstText(npc.value?.gameId, npc.value?.id) },
  { label: '生命值', value: firstText(npc.value?.lifeMax) },
  { label: '伤害', value: firstText(npc.value?.damage) },
  { label: '防御', value: firstText(npc.value?.defense) },
  { label: '击退抗性', value: percentLabel(npc.value?.knockBackResist) },
  { label: '类型', value: npcKindLabel.value },
  { label: '资料更新', value: detailUpdatedAt.value },
].filter((row) => row.value))

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

const shopPriceLabel = (entry: PublicNpcShopEntry) => firstText(entry.priceText, entry.buyPriceText, entry.currencyText, '售价待整理')

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

const relationTypeLabel = (value: unknown) => {
  const key = firstText(value).toLowerCase()
  if (key === 'shop') return '出售'
  if (key === 'loot' || key === 'drop') return '掉落'
  if (key === 'source') return '来源'
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
      title: firstText(entry.itemNameZh, entry.itemName, entry.itemInternalName, '关联物品'),
      meta: relationTypeLabel(entry.relationType),
    })),
  })).filter((section) => section.entries.length > 0)
})

const materialStatus = computed(() => ({
  loot: trustedLoot.value.length + additionalLoot.value.length ? '已整理' : '暂无资料',
  shop: shopEntries.value.length ? '已整理' : '暂无资料',
  buffs: buffRelations.value.length ? '已整理' : '暂无资料',
}))
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
            <CommonPreviewImage :src="portraitImage" :alt="displayName" :fallback="portraitFallback" loading="eager" />
          </div>
          <div class="npc-detail-copy">
            <span class="eyebrow">NPC #{{ npc?.gameId ?? npc?.id }} · {{ secondaryName || '详情资料' }}</span>
            <h1>{{ displayName }}</h1>
            <p>{{ firstText(npc?.behaviorNotes, `${displayName} 的资料包含基础数值、出售物品、掉落物和状态效果。`) }}</p>
            <div class="tag-row">
              <span v-if="npc?.isTownNpc" class="tag gold">城镇 NPC</span>
              <span v-if="npc?.isFriendly" class="tag moss">友好</span>
              <span class="tag paper">{{ firstText(npc?.categoryName, '未分类') }}</span>
              <span class="tag paper">{{ aggregateBundle?.source === 'api' ? '详情资料' : '资料状态' }}</span>
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

        <section class="detail-mosaic">
          <article class="detail-module dark-card">
            <div class="module-title">
              <h2>基础数值</h2>
              <span class="tag paper">{{ npcKindLabel }}</span>
            </div>
            <div class="signal-list">
              <div v-for="row in npcStatRows" :key="`stat-${row.label}`">
                <b>{{ row.label }}</b><span>{{ row.value }}</span><em>NPC 档案</em>
              </div>
            </div>
          </article>

          <article class="detail-module dark-card">
            <div class="module-title">
              <h2>掉落物</h2>
              <span class="tag moss">{{ trustedLoot.length + additionalLoot.length }} 条</span>
            </div>
            <div v-if="trustedLoot.length" class="source-table dark-table">
              <div v-for="entry in trustedLoot" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" class="source-row detail-relation-row">
                <span class="sprite-frame detail-relation-icon">
                  <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                </span>
                <div class="detail-relation-copy"><b>{{ entryTitle(entry) }}</b><span>{{ [quantityLabel(entry), chanceLabel(entry), entry.conditions].filter(Boolean).join(' · ') || '掉落资料待补充' }}</span></div>
                <strong class="detail-relation-meta">掉落</strong>
              </div>
            </div>
            <p v-else>暂时没有整理到掉落物。</p>
          </article>

          <article class="detail-module dark-card">
            <div class="module-title">
              <h2>出售物品</h2>
              <span class="tag gold">{{ shopEntries.length }} 项</span>
            </div>
            <div v-if="shopEntries.length" class="source-table dark-table">
              <div v-for="entry in shopEntries" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" class="source-row detail-relation-row">
                <span class="sprite-frame detail-relation-icon">
                  <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                </span>
                <div class="detail-relation-copy"><b>{{ entryTitle(entry) }}</b><span>{{ [shopPriceLabel(entry), shopConditionsLabel(entry)].filter(Boolean).join(' · ') }}</span></div>
                <strong class="detail-relation-meta">商店</strong>
              </div>
            </div>
            <p v-else>暂时没有整理到出售物品。</p>
          </article>

          <article class="detail-module dark-card">
            <div class="module-title">
              <h2>状态效果</h2>
              <span class="tag paper">{{ buffRelations.length }} 条</span>
            </div>
            <div v-if="buffRelations.length" class="source-table dark-table">
              <div v-for="entry in buffRelations" :key="String(entry.id ?? entry.buffId ?? entry.buffInternalName)" class="source-row detail-relation-row">
                <span class="sprite-frame detail-relation-icon">
                  <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                </span>
                <div class="detail-relation-copy"><b>{{ entryTitle(entry) }}</b><span>{{ [entry.relationType, buffDurationLabel(entry), chanceLabel(entry), entry.conditions].filter(Boolean).join(' · ') || 'Buff 关系' }}</span></div>
                <strong class="detail-relation-meta">Buff</strong>
              </div>
            </div>
            <p v-else>暂时没有整理到状态效果。</p>
          </article>

          <aside class="evidence-panel dark-card">
            <span class="eyebrow">关联资料</span>
            <div class="evidence-step"><div><b>掉落物</b><span>{{ materialStatus.loot }}</span></div></div>
            <div class="evidence-step"><div><b>出售物品</b><span>{{ materialStatus.shop }}</span></div></div>
            <div class="evidence-step"><div><b>状态效果</b><span>{{ materialStatus.buffs }}</span></div></div>
          </aside>
        </section>

        <section v-if="additionalLoot.length || relatedItemSections.length" class="detail-mosaic">
          <article v-if="additionalLoot.length" class="detail-module dark-card">
            <div class="module-title">
              <h2>其他掉落</h2>
              <span class="tag paper">{{ additionalLoot.length }} 条</span>
            </div>
            <div class="signal-list">
              <div v-for="entry in additionalLoot.slice(0, 6)" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)">
                <b>掉落</b><span>{{ entryTitle(entry) }}</span><em>{{ [quantityLabel(entry), chanceLabel(entry)].filter(Boolean).join(' · ') || '掉落资料待补充' }}</em>
              </div>
            </div>
          </article>

          <article v-for="section in relatedItemSections" :key="section.title" class="detail-module dark-card">
            <div class="module-title">
              <h2>{{ section.title }}</h2>
              <span class="tag paper">{{ section.entries.length }} 条</span>
            </div>
            <div class="signal-list">
              <div v-for="entry in section.entries" :key="entry.id">
                <b>关联</b><span>{{ entry.title }}</span><em>{{ entry.meta || '相关资料' }}</em>
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
  grid-template-columns: 52px minmax(0, 1fr) minmax(72px, auto);
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

@media (max-width: 720px) {
  .detail-relation-row {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .detail-relation-meta {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
