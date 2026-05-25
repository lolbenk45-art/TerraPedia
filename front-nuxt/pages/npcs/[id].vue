<script setup lang="ts">
import type {
  PublicNpcBuffRelation,
  PublicNpcLootEntry,
  PublicNpcShopCondition,
  PublicNpcShopEntry,
  PublicNpcTraceableItemSummary,
} from '~/types/public-api'

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
    const text = firstText(value).replace(/\s+/g, ' ')
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

const entryTitle = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcBuffRelation) => safeNpcDisplayText(
  'buffNameZh' in entry ? entry.buffNameZh : undefined,
  'itemNameZh' in entry ? entry.itemNameZh : undefined,
  'buffName' in entry ? entry.buffName : undefined,
  'itemName' in entry ? entry.itemName : undefined,
) || '资料项'

const entryImage = (entry: PublicNpcLootEntry | PublicNpcShopEntry | PublicNpcBuffRelation) => resolvePreviewImageUrl(firstText(
  entry.imageUrl,
  'itemImage' in entry ? entry.itemImage : undefined,
  'buffImage' in entry ? entry.buffImage : undefined,
))

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

const npcBehaviorSummary = computed(() => safeNpcDisplayText(
  npc.value?.behaviorNotes,
  `${displayName.value} 的资料包含基础数值、出售物品、掉落物和状态效果。`,
))

const shopPriceLabel = (entry: PublicNpcShopEntry) => safeNpcDisplayText(entry.buyPriceText, entry.currencyText, entry.priceText)
const lootConditionLabel = (entry: PublicNpcLootEntry) => safeNpcDisplayText(entry.conditions, entry.notes)
const buffConditionLabel = (entry: PublicNpcBuffRelation) => safeNpcDisplayText(entry.conditions, entry.notes, entry.sourceText)

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

const shopConditionsLabel = (entry: PublicNpcShopEntry) => {
  if (Array.isArray(entry.conditions)) {
    return entry.conditions.map(conditionLabel).filter(Boolean).join(' / ')
  }

  return safeNpcDisplayText(entry.conditions, entry.notes)
}

const shopConditionSummary = (entry: PublicNpcShopEntry) => {
  if (!Array.isArray(entry.conditions)) return shopConditionsLabel(entry)
  const labels = entry.conditions.map(conditionLabel).filter(Boolean)
  if (labels.length <= 2) return labels.join(' / ')
  return `${labels.slice(0, 2).join(' / ')} / 另有 ${labels.length - 2} 个条件`
}

const shopGroupKey = (entry: PublicNpcShopEntry) => {
  if (!Array.isArray(entry.conditions)) {
    return shopConditionsLabel(entry) ? 'other' : 'always'
  }
  if (entry.conditions.length === 0) return 'always'
  const conditions = entry.conditions
  if (conditions.some((condition) => firstText(condition.gamePeriodNameZh, condition.gamePeriodNameEn))) return 'period'
  if (conditions.some((condition) => firstText(condition.biomeNameZh, condition.biomeNameEn))) return 'biome'
  if (conditions.some((condition) => firstText(condition.refNpcNameZh, condition.refNpcName, condition.refItemNameZh, condition.refItemName))) return 'unlock'
  return conditions.map(conditionLabel).filter(Boolean).length ? 'other' : 'always'
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
  entry.durationSeconds != null ? `${entry.durationSeconds}s` : '',
)

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
            <CommonPreviewImage :src="portraitImage" :alt="displayName" :fallback="portraitFallback" loading="eager" />
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

        <section :class="['detail-grid npc-detail-grid', detailLayout.detailGridClass, detailLayout.detailDensityClass]">
          <div class="module-stack">
            <article :class="['detail-module dark-card', detailLayout.detailModuleClass]">
              <div class="module-title">
                <h2>掉落物</h2>
                <span class="tag moss">{{ trustedLoot.length + additionalLoot.length }} 条</span>
              </div>
              <div v-if="trustedLoot.length" class="source-table dark-table tp-detail-relation-grid">
                <div v-for="entry in trustedLootVisibleEntries" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                  <span class="sprite-frame detail-relation-icon">
                    <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
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
                      <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
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
                      <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
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
                <div class="source-table dark-table tp-detail-relation-grid">
                  <div v-for="entry in group.entries.slice(0, 8)" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                    <span class="sprite-frame detail-relation-icon">
                      <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                    </span>
                    <div class="detail-relation-copy">
                      <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                      <b v-else>{{ entryTitle(entry) }}</b>
                      <span>{{ [shopPriceLabel(entry), shopConditionSummary(entry)].filter(Boolean).join(' · ') || '商店资料' }}</span>
                    </div>
                    <strong class="detail-relation-meta">商店</strong>
                  </div>
                </div>
                <details v-if="group.entries.length > 8" class="detail-group-remainder">
                  <summary>展开其余 {{ group.entries.length - 8 }} 项</summary>
                  <div class="source-table dark-table tp-detail-relation-grid">
                    <div v-for="entry in group.entries.slice(8)" :key="String(entry.id ?? entry.itemId ?? entry.itemInternalName)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                      <span class="sprite-frame detail-relation-icon">
                        <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                      </span>
                      <div class="detail-relation-copy">
                        <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                        <b v-else>{{ entryTitle(entry) }}</b>
                        <span>{{ [shopPriceLabel(entry), shopConditionsLabel(entry)].filter(Boolean).join(' · ') || '商店资料' }}</span>
                      </div>
                      <strong class="detail-relation-meta">商店</strong>
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
            <div v-if="buffRelations.length" class="source-table dark-table">
              <div v-for="entry in buffRelations" :key="String(entry.id ?? entry.buffId ?? entry.buffInternalName)" :class="['source-row detail-relation-row', detailLayout.detailRelationRowClass]">
                <span class="sprite-frame detail-relation-icon">
                  <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="firstGlyph(entryTitle(entry))" />
                </span>
                <div class="detail-relation-copy"><b>{{ entryTitle(entry) }}</b><span>{{ [relationTypeLabel(entry.relationType), buffDurationLabel(entry), chanceLabel(entry), buffConditionLabel(entry)].filter(Boolean).join(' · ') || '状态效果资料' }}</span></div>
                <strong class="detail-relation-meta">Buff</strong>
              </div>
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

.npc-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--tp-detail-page-gap, 22px);
  min-width: 0;
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
}
</style>
