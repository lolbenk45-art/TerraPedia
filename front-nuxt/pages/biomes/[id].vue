<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

import { usePublicBiomeDetail } from '~/composables/usePublicBiomeDetail'
import type { PublicBiomeItemRelation, PublicBiomeItemSource, PublicBiomeNpcRelation, PublicBiomeResource } from '~/types/public-api'

const route = useRoute()

const biomeRouteId = computed(() => String(route.params.id ?? '').trim())

const {
  data: biomeBundle,
  pending: biomePending,
  error: biomeError,
  refresh: refreshBiomeDetail,
} = await usePublicBiomeDetail(biomeRouteId)

if (!biomeBundle.value?.detail) {
  throw createError({ statusCode: 404, statusMessage: 'Biome not found' })
}

const biomeDetail = computed(() => biomeBundle.value?.detail ?? null)
const biomeTile = computed(() => biomeBundle.value?.item ?? null)
const biomeResources = computed(() => biomeBundle.value?.resources ?? [])
const biomeRelations = computed(() => biomeBundle.value?.relations ?? [])
const biomeItemBiomes = computed(() => biomeBundle.value?.itemBiomes ?? [])
const biomeNpcBiomes = computed(() => biomeBundle.value?.npcBiomes ?? [])
const biomeItemSources = computed(() => biomeBundle.value?.itemSources ?? [])
const { clientReady: biomeClientReady, visualLoading: biomeDetailVisualLoading } = useVisualLoading({
  pending: biomePending,
  hasData: () => Boolean(biomeDetail.value),
  minimumMs: 180,
})
const biomeMissing = computed(() => biomeClientReady.value && !biomePending.value && !biomeDetail.value)
const biomeTitle = computed(() => biomeTile.value?.displayName || biomeDetail.value?.nameZh || biomeDetail.value?.nameEn || '群系详情')
const biomeTrailItems = computed(() => [
  { label: '首页', href: '/' },
  { label: '生态索引', href: '/biomes' },
  { label: biomeTitle.value },
])

const toAbsoluteSeoUrl = useAbsoluteSiteUrl()

useSeoMeta({
  title: () => `TerraPedia · ${biomeTitle.value}`,
  description: () => `${biomeTitle.value} 的公开群系资料详情，包含资源、来源和关联生态。`,
  ogImage: () => toAbsoluteSeoUrl(biomeTile.value?.image),
})

useHead({
  link: [{ rel: 'canonical', href: () => toAbsoluteSeoUrl(route.path) }],
})

const firstGlyph = (value: string) => Array.from(value.trim())[0] ?? '?'
const displayText = (...values: unknown[]) => values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
const biomeFallbackIcon = 'icon-biome'
const biomeResourceFallbackIcon = 'icon-items'
const normalizeType = (value: unknown) => displayText(value).toLocaleLowerCase('zh-CN')
const biomeSourceTypeLabels: Record<string, string> = {
  drop: '掉落',
  resource: '资源',
  feature: '生态资源',
  fishing: '钓鱼',
  for_sale: '出售',
  shop: '出售',
  worldgen: '世界生成',
  mining: '挖掘',
  treasure_bag: '宝藏袋',
  crate: '宝匣',
  container: '宝箱',
}
const biomeRelationTypeLabels: Record<string, string> = {
  appears_in: '出现于',
  drop: '掉落',
  resource: '资源',
  contains: '包含',
  related: '相关',
}
const biomeSpawnContextLabels: Record<string, string> = {
  during_the_day: '白天',
  day: '白天',
  night: '夜晚',
  during_the_night: '夜晚',
  underground: '地下',
  surface: '地表',
}
const biomeDropResources = computed(() => biomeResources.value.filter((resource) => normalizeType(resource.resourceType) === 'drop'))
const biomeGeneralResources = computed(() => biomeResources.value.filter((resource) => normalizeType(resource.resourceType) !== 'drop'))
const biomeSourceRefTypeLabels: Record<string, string> = {
  biome_wikitext: '文字来源记录',
  npc: 'NPC',
  boss: 'Boss',
  npc_group: 'NPC 族群',
  boss_group: 'Boss 族群',
  treasure_bag: '宝藏袋',
  world: '环境与世界',
  container: '宝箱',
  crate: '宝匣',
}
const biomeSourceGroupDefinitions = [
  {
    key: 'boss',
    title: 'Boss 掉落',
    description: '由 Boss 来源记录直接指向的物品。',
    match: (source: PublicBiomeItemSource) => normalizeType(source.sourceType) === 'drop' && normalizeType(source.sourceRefType) === 'boss',
  },
  {
    key: 'npc',
    title: 'NPC 掉落',
    description: '由单个 NPC 来源记录指向的物品。',
    match: (source: PublicBiomeItemSource) => normalizeType(source.sourceType) === 'drop' && normalizeType(source.sourceRefType) === 'npc',
  },
  {
    key: 'npc-group',
    title: 'NPC 族群',
    description: '由同类敌怪或族群来源记录指向的物品。',
    match: (source: PublicBiomeItemSource) => normalizeType(source.sourceType) === 'drop' && normalizeType(source.sourceRefType) === 'npc_group',
  },
  {
    key: 'treasure-bag',
    title: '宝藏袋',
    description: '由宝藏袋来源记录指向的物品。',
    match: (source: PublicBiomeItemSource) => ['treasure_bag', 'boss_group'].includes(normalizeType(source.sourceRefType)) || normalizeType(source.sourceType) === 'treasure_bag',
  },
  {
    key: 'world',
    title: '环境与世界',
    description: '来自世界生成、环境掉落、挖掘或采集的来源记录。',
    match: (source: PublicBiomeItemSource) => normalizeType(source.sourceRefType) === 'world' || ['worldgen', 'mining'].includes(normalizeType(source.sourceType)),
  },
  {
    key: 'container',
    title: '宝箱与宝匣',
    description: '来自宝箱、容器或宝匣的来源记录。',
    match: (source: PublicBiomeItemSource) => ['container', 'crate'].includes(normalizeType(source.sourceRefType)) || ['container', 'crate'].includes(normalizeType(source.sourceType)),
  },
  {
    key: 'gathering',
    title: '钓鱼与资源',
    description: '来自钓鱼、资源或采集类来源记录。',
    match: (source: PublicBiomeItemSource) => ['fishing', 'resource'].includes(normalizeType(source.sourceType)),
  },
  {
    key: 'wikitext',
    title: '文字来源记录',
    description: '来源短语已保留，但尚未全部归并到具体实体。',
    match: (source: PublicBiomeItemSource) => normalizeType(source.sourceRefType) === 'biome_wikitext',
  },
  {
    key: 'other',
    title: '其他来源',
    description: '出售或其他来源记录。',
    match: () => true,
  },
]
const biomeSourceGroups = computed(() => {
  const remaining = [...biomeItemSources.value]
  return biomeSourceGroupDefinitions
    .map((definition) => {
      const records = remaining.filter(definition.match)
      records.forEach((record) => {
        const index = remaining.indexOf(record)
        if (index >= 0) remaining.splice(index, 1)
      })
      return { ...definition, records }
    })
    .filter((group) => group.records.length)
})
const biomeDropSourceCount = computed(() => biomeSourceGroups.value.reduce((total, group) => total + group.records.length, 0))
const typedImage = (value: { itemImage?: string | null; item_image?: string | null; npcImageUrl?: string | null; npc_image_url?: string | null; imageUrl?: string | null; image_url?: string | null; iconUrl?: string | null; icon_url?: string | null; image?: string | null; previewImage?: string | null; previewImageUrl?: string | null; preview_image?: string | null; preview_image_url?: string | null }) => (
  resolvePreviewImageUrl(displayText(value.previewImage, value.previewImageUrl, value.preview_image, value.preview_image_url, value.itemImage, value.item_image, value.npcImageUrl, value.npc_image_url, value.imageUrl, value.image_url, value.iconUrl, value.icon_url, value.image))
)
const resourceImage = (value: PublicBiomeResource) => typedImage(value)
const itemRelationImage = (value: PublicBiomeItemRelation | PublicBiomeItemSource) => typedImage(value)
const npcRelationImage = (value: PublicBiomeNpcRelation) => typedImage(value)
const resourceTitle = (resource: PublicBiomeResource) => (
  displayText(resource.resourceNameRaw, resource.itemName, '未命名资源')
)
const itemRelationTitle = (item: PublicBiomeItemRelation | PublicBiomeItemSource) => (
  displayText(item.itemNameZh, item.itemName, '未命名物品')
)
const npcRelationTitle = (npc: PublicBiomeNpcRelation) => (
  displayText(npc.npcNameZh, npc.npcName, '未命名 NPC')
)
const typeLabel = (value: unknown, labels: Record<string, string>, fallback = '未标注') => {
  const normalized = normalizeType(value)
  if (!normalized) return fallback
  return labels[normalized] || displayText(value, fallback)
}
const sourceTypeLabel = (value: unknown) => typeLabel(value, biomeSourceTypeLabels)
const sourceRefTypeLabel = (value: unknown) => typeLabel(value, biomeSourceRefTypeLabels, '来源')
const relationTypeLabel = (value: unknown) => typeLabel(value, biomeRelationTypeLabels)
const spawnContextLabel = (value: unknown) => {
  const normalized = normalizeType(value).replace(/\s+/g, '_')
  if (!normalized) return '出现条件未标注'
  return biomeSpawnContextLabels[normalized] || displayText(value, '出现条件未标注')
}
const itemPath = (itemId: unknown) => displayText(itemId) ? `/items/${displayText(itemId)}` : '/items'
const npcPath = (npcId: unknown) => displayText(npcId) ? `/npcs/${displayText(npcId)}` : '/npcs'
const sourceDetailText = (source: PublicBiomeItemSource) => {
  const sourceName = displayText(source.sourceRefName, sourceRefTypeLabel(source.sourceRefType))
  const amount = displayText(source.chanceText, source.quantityText, source.conditions, source.notes)
  return amount ? `${sourceName} · ${amount}` : sourceName
}
</script>

<template>
    <TerraBreadcrumb :items="biomeTrailItems" />

    <main class="support-layout detail-support-layout" :aria-busy="biomeDetailVisualLoading">
      <section class="biome-detail-hero support-panel biome-detail-environment-hero">
        <CommonPreviewImage
          v-if="!biomeDetailVisualLoading && biomeTile"
          class="biome-detail-environment-bg"
          :src="biomeTile.image"
          :alt="biomeTitle"
          :fallback="biomeTile.fallback || firstGlyph(biomeTitle)"
          :fallback-icon="biomeFallbackIcon"
          :source-image="biomeTile.sourceImage || ''"
          decorative
          :auto-center-visible="false"
          width="1280"
          height="420"
        />
        <div class="biome-detail-environment-copy">
          <span class="eyebrow">
            <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="pill" />
            <template v-else>生态 · {{ biomeTile?.englishName || biomeTile?.code || biomeRouteId }}</template>
          </span>
          <h1>
            <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="line" />
            <template v-else>{{ biomeTitle }}</template>
          </h1>
          <p>
            <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="line" />
            <template v-else>{{ biomeTile?.description || '暂无公开说明。' }}</template>
          </p>
          <div v-if="biomeDetailVisualLoading" class="tag-row biome-detail-loading-tags">
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
            <span class="tag paper"><CommonTpSkeleton type="pill" /></span>
          </div>
          <div v-else-if="biomeMissing" class="tag-row biome-detail-missing-tags">
            <span class="tag paper">详情缺失</span>
            <span v-if="biomeError" class="tag moss">请求异常</span>
          </div>
          <div v-else class="tag-row">
            <span class="tag gold">{{ biomeTile?.groupLabel || '未分组' }}</span>
            <span class="tag moss">{{ biomeTile?.layerType || '层级未标注' }}</span>
            <span class="tag paper">{{ biomeTile?.biomeType || '类型未标注' }}</span>
          </div>
        </div>
        <div class="biome-scan biome-detail-environment-scan">
          <CommonTpSkeleton v-if="biomeDetailVisualLoading" type="icon" />
          <CommonPreviewImage
            v-else
            :src="biomeTile?.image || ''"
            :alt="biomeTitle"
            :fallback="biomeTile?.fallback || firstGlyph(biomeTitle)"
            :fallback-icon="biomeFallbackIcon"
            :source-image="biomeTile?.sourceImage || ''"
            :auto-center-visible="false"
            width="320"
            height="180"
          />
        </div>
      </section>

      <section v-if="biomeDetailVisualLoading" class="category-detail-grid">
        <article v-for="slot in 4" :key="`biome-detail-loading-${slot}`" class="support-panel category-branch">
          <b><CommonTpSkeleton type="line" /></b>
          <span><CommonTpSkeleton type="line" /><CommonTpSkeleton type="line" short /></span>
        </article>
      </section>

      <section v-else-if="biomeMissing" class="search-suggestion-band support-panel">
        <div>
          <b>{{ biomeError ? '群系详情加载失败' : '群系详情暂未载入' }}</b>
          <span>{{ biomeError ? '加载群系资料时出现异常，可以重试或稍后再来。' : '当前 ID 没有返回公开资料，页面不会展示无关内容。' }}</span>
        </div>
        <button class="small-button active" type="button" @click="refreshBiomeDetail()">重新加载</button>
      </section>

      <template v-else>
        <section class="category-detail-grid">
          <article class="support-panel category-branch active">
            <b>资源</b>
            <span>{{ biomeGeneralResources.length }} 项生态资源可供查看。</span>
            <a href="/items">打开物品图鉴</a>
          </article>
          <article class="support-panel category-branch">
            <b>掉落</b>
            <span>{{ biomeItemBiomes.length + biomeDropResources.length + biomeDropSourceCount }} 条掉落与来源线索。</span>
            <a href="/items">查看相关物品</a>
          </article>
          <article class="support-panel category-branch">
            <b>NPC 出现</b>
            <span>{{ biomeNpcBiomes.length }} 条 NPC 出现记录。</span>
            <a href="/npcs">打开 NPC 图鉴</a>
          </article>
          <article class="support-panel category-branch">
            <b>来源记录</b>
            <span>{{ biomeItemSources.length }} 条来源记录。</span>
            <a href="/search-tool">搜索资料</a>
          </article>
        </section>

        <section class="biome-detail-section support-panel">
          <details class="biome-detail-fold" open>
            <summary class="biome-detail-section-head">
              <span class="eyebrow">资源</span>
              <h2>生态资源（{{ biomeGeneralResources.length }}）</h2>
            </summary>
            <div class="biome-detail-scroll-panel">
              <div class="biome-detail-link-grid">
                <a v-for="resource in biomeGeneralResources" :key="displayText(resource.id, resource.itemId, resource.resourceNameRaw, 'resource')" class="detail-relation-link" :href="itemPath(resource.itemId)">
                  <CommonPreviewImage
                    :src="resourceImage(resource)"
                    :alt="resourceTitle(resource)"
                    :fallback="firstGlyph(resourceTitle(resource))"
                    :fallback-icon="biomeResourceFallbackIcon"
                    width="40"
                    height="40"
                  />
                  <b>{{ resourceTitle(resource) }}</b>
                  <span>{{ sourceTypeLabel(resource.resourceType) }} · {{ displayText(resource.notes, '暂无说明') }}</span>
                </a>
              </div>
              <div v-if="!biomeGeneralResources.length" class="biome-detail-empty-state">
                <b>暂无资源</b>
                <span>当前没有可展示的资源记录。</span>
              </div>
            </div>
          </details>
        </section>

        <section class="biome-detail-section support-panel">
          <details class="biome-detail-fold" open>
            <summary class="biome-detail-section-head">
              <span class="eyebrow">掉落</span>
              <h2>掉落与来源</h2>
            </summary>
            <div class="biome-detail-scroll-panel">
              <div v-if="biomeItemBiomes.length || biomeDropResources.length" class="biome-detail-link-grid">
                <a v-for="drop in biomeItemBiomes" :key="displayText(drop.id, drop.itemId, drop.itemNameZh, drop.itemName, 'item-drop')" class="detail-relation-link" :href="itemPath(drop.itemId)">
                  <CommonPreviewImage
                    :src="itemRelationImage(drop)"
                    :alt="itemRelationTitle(drop)"
                    :fallback="firstGlyph(itemRelationTitle(drop))"
                    :fallback-icon="biomeResourceFallbackIcon"
                    width="40"
                    height="40"
                  />
                  <b>{{ itemRelationTitle(drop) }}</b>
                  <span>{{ relationTypeLabel(drop.relationType) }} · {{ displayText(drop.notes, '暂无说明') }}</span>
                </a>
                <a v-for="resource in biomeDropResources" :key="displayText(resource.id, resource.itemId, resource.resourceNameRaw, 'resource-drop')" class="detail-relation-link" :href="itemPath(resource.itemId)">
                  <CommonPreviewImage
                    :src="resourceImage(resource)"
                    :alt="resourceTitle(resource)"
                    :fallback="firstGlyph(resourceTitle(resource))"
                    :fallback-icon="biomeResourceFallbackIcon"
                    width="40"
                    height="40"
                  />
                  <b>{{ resourceTitle(resource) }}</b>
                  <span>{{ sourceTypeLabel(resource.resourceType) }} · {{ displayText(resource.notes, '暂无说明') }}</span>
                </a>
              </div>
              <div v-if="biomeSourceGroups.length" class="biome-source-groups">
                <details
                  v-for="(group, groupIndex) in biomeSourceGroups"
                  :key="group.key"
                  class="biome-source-group"
                  :open="groupIndex === 0"
                >
                  <summary class="biome-source-group-head">
                    <b>{{ group.title }}</b>
                    <span>{{ group.description }} {{ group.records.length }} 条。</span>
                  </summary>
                  <div class="biome-detail-link-grid">
                    <a v-for="source in group.records" :key="displayText(source.id, source.itemId, source.sourceRefName, group.key, 'item-source')" class="detail-relation-link" :href="itemPath(source.itemId)">
                      <CommonPreviewImage
                        :src="itemRelationImage(source)"
                        :alt="itemRelationTitle(source)"
                        :fallback="firstGlyph(itemRelationTitle(source))"
                        :fallback-icon="biomeResourceFallbackIcon"
                        width="40"
                        height="40"
                      />
                      <b>{{ itemRelationTitle(source) }}</b>
                      <span>{{ sourceTypeLabel(source.sourceType) }} · {{ sourceDetailText(source) }}</span>
                    </a>
                  </div>
                </details>
              </div>
              <div v-if="!biomeItemBiomes.length && !biomeDropResources.length && !biomeSourceGroups.length" class="biome-detail-empty-state">
                <b>暂无掉落来源数据。</b>
                <span>当前没有可展示的掉落或来源记录。</span>
              </div>
            </div>
          </details>
        </section>

        <section class="biome-detail-section support-panel">
          <details class="biome-detail-fold">
            <summary class="biome-detail-section-head">
              <span class="eyebrow">NPC 出现</span>
              <h2>出现记录（{{ biomeNpcBiomes.length }}）</h2>
            </summary>
            <div class="biome-detail-scroll-panel">
              <div class="biome-detail-link-grid">
                <a v-for="npc in biomeNpcBiomes" :key="displayText(npc.id, npc.npcId, npc.npcNameZh, npc.npcName, 'npc-biome')" class="detail-relation-link" :href="npcPath(npc.npcId)">
                  <CommonPreviewImage
                    :src="npcRelationImage(npc)"
                    :alt="npcRelationTitle(npc)"
                    :fallback="firstGlyph(npcRelationTitle(npc))"
                    fallback-icon="icon-npc"
                    width="40"
                    height="40"
                  />
                  <b>{{ npcRelationTitle(npc) }}</b>
                  <span>{{ relationTypeLabel(npc.relationType) }} · {{ spawnContextLabel(npc.spawnContext) }}</span>
                </a>
              </div>
              <div v-if="!biomeNpcBiomes.length" class="biome-detail-empty-state">
                <b>暂无 NPC 出现数据。</b>
                <span>当前没有可展示的 NPC 出现记录。</span>
              </div>
            </div>
          </details>
        </section>

        <section class="biome-detail-section biome-taxonomy-section">
          <div class="biome-detail-section-head">
            <span class="eyebrow">群系关系</span>
            <h2>关联生态</h2>
          </div>
          <div class="taxonomy-band biome-taxonomy-band">
            <article v-for="relation in biomeRelations" :key="displayText(relation.id, relation.relatedBiomeId, relation.relatedBiomeCode, 'relation')" class="support-panel">
              <span class="eyebrow">群系关系 · {{ relationTypeLabel(relation.relationType) }}</span>
              <h2>{{ displayText(relation.relatedBiomeNameZh, relation.relatedBiomeNameEn, relation.relatedBiomeCode, '未命名关联') }}</h2>
              <p>{{ displayText(relation.notes, relation.relatedBiomeCode, '暂无说明') }}</p>
            </article>
            <article v-if="!biomeRelations.length" class="support-panel">
              <span class="eyebrow">群系关系</span>
              <h2>暂无关联</h2>
              <p>当前没有可展示的关联群系。</p>
            </article>
          </div>
        </section>
      </template>
    </main>
</template>

<style scoped>
.biome-source-group > summary.biome-source-group-head {
  cursor: pointer;
  list-style: disclosure-closed;
}
.biome-source-group[open] > summary.biome-source-group-head {
  list-style: disclosure-open;
}

.detail-relation-link {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  gap: 5px 12px;
  min-height: 58px;
  padding: 8px 0;
}

.detail-relation-link .item-art {
  grid-row: 1 / 3;
  width: 40px;
  height: 40px;
  overflow: hidden;
}

.detail-relation-link b,
.detail-relation-link span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-relation-link b {
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
}

.detail-relation-link span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.biome-detail-section {
  display: grid;
  gap: 14px;
}

.biome-detail-section-head {
  display: grid;
  gap: 4px;
}

.biome-detail-section-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  line-height: 1.25;
}

.biome-detail-link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px 18px;
}

.biome-source-groups {
  display: grid;
  gap: 16px;
}

.biome-source-group {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.biome-source-group-head {
  display: grid;
  gap: 3px;
}

.biome-source-group-head b {
  color: var(--text);
  font-size: 14px;
  line-height: 1.3;
}

.biome-source-group-head span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.biome-detail-empty-state {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.biome-detail-empty-state b {
  color: var(--text);
}
</style>
