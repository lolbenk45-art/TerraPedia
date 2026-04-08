<template>
  <div class="item-detail">
    <section class="detail-hero">
      <div class="detail-hero__media">
        <img v-if="primaryImageUrl" :src="primaryImageUrl" class="item-avatar item-avatar--img" alt="" @error="handleImageError" />
        <span v-else class="item-avatar item-avatar--fallback">IT</span>
      </div>
      <div class="detail-hero__content">
        <div class="detail-pills">
          <span v-if="categoryName" class="tag tag--info">{{ categoryName }}</span>
          <span class="tag" :class="rarityInfo.tagClass">{{ rarityInfo.label }}</span>
          <span v-if="biomeSummary.length" class="tag tag--emerald">{{ biomeSummary.length }} 个群系</span>
        </div>
        <h2 class="item-name">{{ displayName }}</h2>
        <p class="item-subtitle">{{ secondaryName }}</p>
        <div class="detail-stats">
          <article class="detail-stat"><span>ID</span><strong>{{ item.id }}</strong></article>
          <article class="detail-stat"><span>伤害</span><strong>{{ formatNumber(item.damage) }}</strong></article>
          <article class="detail-stat"><span>防御</span><strong>{{ formatNumber(item.defense) }}</strong></article>
          <article class="detail-stat"><span>堆叠</span><strong>{{ getStackLabel(item.isStackable, item.stackSize) }}</strong></article>
        </div>
      </div>
    </section>

    <dl class="item-attributes">
      <dt>分类</dt><dd>{{ categoryName || '未知' }}</dd>
      <dt>稀有度</dt><dd><span class="tag" :class="rarityInfo.tagClass">{{ rarityInfo.label }}</span></dd>
      <dt>状态</dt><dd><span class="tag" :class="'tag--' + getStatusType(item.status)">{{ getStatusLabel(item.status) }}</span></dd>
      <dt>游戏阶段</dt><dd>{{ getGamePeriodLabel(item.gamePeriodId, item.gamePeriod) }}</dd>
      <dt>游戏模式</dt><dd>{{ getGameModelLabel(item.gameModelId) }}</dd>
      <dt>击退</dt><dd>{{ formatNumber(item.knockback) }}</dd>
      <dt>使用时间</dt><dd>{{ formatNumber(item.useTime) }}</dd>
      <dt>宽度</dt><dd>{{ formatNumber(item.width) }}</dd>
      <dt>高度</dt><dd>{{ formatNumber(item.height) }}</dd>
      <dt>购买价格</dt><dd>{{ formatCurrencyWithRaw(item.buy) }}</dd>
      <dt>出售价格</dt><dd>{{ formatCurrencyWithRaw(item.sell) }}</dd>
      <dt>创建时间</dt><dd>{{ formatDate(item.createdAt) }}</dd>
      <dt>更新时间</dt><dd>{{ formatDate(item.updatedAt) }}</dd>
    </dl>

    <section v-if="item.descriptionZh || item.description" class="panel-card"><h3 class="section-title">描述</h3><p class="description-text">{{ item.descriptionZh || item.description }}</p></section>
    <section v-if="item.tooltipZh || item.tooltip" class="panel-card"><h3 class="section-title">提示文本</h3><p class="description-text">{{ item.tooltipZh || item.tooltip }}</p></section>

    <section class="panel-card">
      <div class="section-head"><h3 class="section-title">关联图片</h3><span class="section-meta">{{ loadingRelated ? '加载中...' : `${displayImages.length} 项` }}</span></div>
      <div v-if="displayImages.length" class="image-grid">
        <div v-for="image in displayImages" :key="image.id ?? image.imageUrl" class="image-card">
          <img :src="image.imageUrl" class="image-card__preview" alt="" />
          <div class="image-card__meta"><strong>{{ image.role || 'icon' }}</strong><span>{{ image.sourceFileTitle || image.sourcePage || '未标注来源' }}</span></div>
        </div>
      </div>
      <p v-else class="empty-hint">暂无图片元数据</p>
    </section>

    <section class="panel-card">
      <div class="section-head"><h3 class="section-title">配方</h3><span class="section-meta">{{ recipes.length }} 条</span></div>
      <div v-if="recipes.length" class="recipe-list">
        <article v-for="recipe in recipes" :key="recipe.id ?? recipe.versionScope ?? recipe.sourcePage" class="recipe-card">
          <header class="recipe-card__head"><strong>{{ formatVersionScope(recipe.versionScope) }}</strong><span v-if="recipe.sourcePage">{{ recipe.sourcePage }}</span></header>
          <div class="recipe-card__block">
            <div class="recipe-card__label">原料</div>
            <ul class="plain-list">
              <li v-for="ingredient in recipe.ingredients" :key="ingredient.id ?? ingredient.itemInternalName ?? ingredient.ingredientNameRaw">
                {{ ingredient.itemNameZh || ingredient.itemName || ingredient.ingredientNameRaw || '未知原料' }}
                <span class="muted">{{ formatQuantity(ingredient.quantityText, ingredient.quantityMin, ingredient.quantityMax) }}</span>
              </li>
            </ul>
          </div>
          <div class="recipe-card__block">
            <div class="recipe-card__label">工作台</div>
            <ul class="plain-list">
              <li v-for="station in recipe.stations" :key="station.id ?? station.itemInternalName ?? station.stationNameRaw">
                {{ station.itemNameZh || station.itemName || station.stationNameRaw || '未知工作台' }}
                <span v-if="station.isAlternative" class="muted">可替代</span>
              </li>
            </ul>
          </div>
          <div v-if="recipe.conditions?.length" class="recipe-card__block">
            <div class="recipe-card__label">制作条件</div>
            <ul class="plain-list">
              <li v-for="condition in recipe.conditions" :key="condition.id ?? `${condition.refType}-${condition.refId}`">
                {{ condition.refNameZh || condition.refNameEn || condition.refCode || '未知条件' }}
                <span class="muted">{{ condition.refType }}</span>
                <span v-if="condition.notes" class="muted">· {{ condition.notes }}</span>
              </li>
            </ul>
          </div>
        </article>
      </div>
      <p v-else class="empty-hint">暂无可用配方</p>
    </section>

    <section class="panel-card">
      <div class="section-head"><h3 class="section-title">获取来源</h3><span class="section-meta">{{ displaySources.length }} 条</span></div>
      <div v-if="displaySources.length" class="source-list">
        <article v-for="source in displaySources" :key="source.id ?? `${source.sourceType}-${source.sourceRefNameZh || source.sourceRefName}-${source.sortOrder}`" class="source-card">
          <div class="source-card__head"><span class="tag tag--sky">{{ formatSourceTypeLabel(source.sourceType) }}</span><strong>{{ formatSourceDisplayName(source) || '未命名来源' }}</strong></div>
          <p v-if="source.biomeNameEn || source.biomeNameZh" class="source-card__text">群系：{{ source.biomeNameZh || source.biomeNameEn }}</p>
          <p v-if="source.quantityText || source.quantityMin != null || source.quantityMax != null" class="source-card__text">数量：{{ formatQuantity(source.quantityText, source.quantityMin, source.quantityMax) }}</p>
          <p v-if="source.chanceText || source.chanceValue != null" class="source-card__text">概率：{{ formatChance(source.chanceText, source.chanceValue) }}</p>
          <p v-if="shouldShowLocalizedFreeText(source.conditions)" class="source-card__text">条件：{{ source.conditions }}</p>
          <p v-if="shouldShowLocalizedFreeText(source.notes)" class="source-card__text">备注：{{ source.notes }}</p>
        </article>
      </div>
      <p v-else class="empty-hint">暂无可用来源</p>
    </section>

    <section v-if="biomeSummary.length" class="panel-card">
      <div class="section-head"><h3 class="section-title">群系摘要</h3><span class="section-meta">{{ biomeSummary.length }} 个</span></div>
      <div class="biome-tags"><span v-for="biome in biomeSummary" :key="biome.code" class="tag tag--emerald">{{ biome.label }}</span></div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Item, ItemImageRelation, ItemRecipeRelation, ItemSourceRelation } from '~/stores/items'
import { useCategoriesStore } from '~/stores/categories'
import { useItemsStore } from '~/stores/items'
import { formatCurrencyWithRaw } from '~/utils/currency'
import { getRarityPresentation } from '~/utils/rarity'

const props = defineProps<{ item: Item }>()
const itemsStore = useItemsStore()
const categoriesStore = useCategoriesStore()
const imageVisible = ref(true)
const loadingRelated = ref(false)
const itemImages = ref<ItemImageRelation[]>([])
const recipes = ref<ItemRecipeRelation[]>([])
const sources = ref<ItemSourceRelation[]>([])

const item = computed<Item>(() => ({ ...props.item, imageUrl: props.item.imageUrl ?? '' }))
const displayName = computed(() => item.value.nameZh?.trim() || item.value.name)
const secondaryName = computed(() => item.value.nameZh?.trim() ? formatText(item.value.name) : formatText(item.value.internalName))
const displayImages = computed(() => itemImages.value.length > 0 ? itemImages.value.filter((entry) => entry.imageUrl) : (item.value.imageUrl ? [{ imageUrl: item.value.imageUrl, role: 'legacy', sourcePage: 'items.image' } as ItemImageRelation] : []))
const primaryImageUrl = computed(() => imageVisible.value ? (displayImages.value.find((entry) => entry.isPrimary)?.imageUrl || displayImages.value[0]?.imageUrl || '') : '')
const rarityInfo = computed(() => getRarityPresentation(item.value))
const categoryName = computed(() => {
  const id = item.value.categoryId
  if (typeof id === 'number') {
    const path = categoriesStore.getCategoryPathById(id)
    if (path) return path
  }
  return item.value.categoryName ?? ''
})
const biomeSummary = computed(() => {
  const map = new Map<string, { code: string; label: string }>()
  for (const source of sources.value) {
    const code = source.biomeCode || ''
    const label = source.biomeNameZh || source.biomeNameEn || source.biomeCode || ''
    if (code && label && !map.has(code)) map.set(code, { code, label })
  }
  return [...map.values()]
})
const displaySources = computed(() => {
  const deduped = new Map<string, ItemSourceRelation>()

  for (const source of sources.value) {
    const normalizedName = normalizeSourceRefName(source.sourceRefNameZh || source.sourceRefName)
    const key = [
      source.sourceType || '',
      source.sourceRefType || '',
      normalizedName,
      source.biomeCode || '',
      source.quantityText || `${source.quantityMin ?? ''}-${source.quantityMax ?? ''}`,
      source.chanceText || (source.chanceValue != null ? String(source.chanceValue) : ''),
      normalizeSourceRefName(source.conditions),
    ].join('|')

    if (!deduped.has(key)) {
      deduped.set(key, source)
    }
  }

  return [...deduped.values()]
})

watch(() => item.value.id, async (id) => {
  if (!id) return
  loadingRelated.value = true
  imageVisible.value = true
  try {
    const [images, recipeList, sourceList] = await Promise.all([
      itemsStore.fetchItemImages(id),
      itemsStore.fetchItemRecipes(id),
      itemsStore.fetchItemSources(id),
    ])
    itemImages.value = images
    recipes.value = recipeList
    sources.value = sourceList
  } finally {
    loadingRelated.value = false
  }
}, { immediate: true })

function handleImageError() { imageVisible.value = false }
function getStatusType(status?: number | null) { if (status === 1) return 'success'; if (status === 0) return 'danger'; return 'info' }
function getStatusLabel(status?: number | null) { if (status === 1) return '启用'; if (status === 0) return '禁用'; return '未知' }
function getGamePeriodLabel(gamePeriodId?: number | null, gamePeriod?: string | null) { const map: Record<number, string> = { 0: '未设置', 1: '前期', 2: '困难模式' }; const id = gamePeriodId ?? 0; return gamePeriod?.trim() || map[id] || `阶段 ${id}` }
function getGameModelLabel(gameModelId?: number | null) { const map: Record<number, string> = { 0: '普通模式', 1: '专家模式', 2: '大师模式' }; const id = gameModelId ?? 0; return map[id] ?? `模式 ${id}` }
function getStackLabel(isStackable?: boolean | null, stackSize?: number | null) { if (isStackable === false) return '不可堆叠'; if (stackSize != null) return String(stackSize); if (isStackable === true) return '可堆叠'; return '--' }
function formatDate(date?: string | number | null) { if (!date) return '--'; return new Date(date).toLocaleString('zh-CN') }
function formatText(value?: string | null) { return value && value.trim() ? value : '--' }
function formatNumber(value?: number | null) { return value == null ? '--' : String(value) }
function formatQuantity(text?: string | null, min?: number | null, max?: number | null) { if (text && text.trim()) return text; if (min != null && max != null && min !== max) return `${min}-${max}`; if (min != null) return String(min); if (max != null) return String(max); return '1' }
function formatChance(text?: string | null, value?: number | null) { if (text && text.trim()) return text; if (typeof value === 'number') return `${(value * 100).toFixed(2)}%`; return '--' }
function formatVersionScope(value?: string | null) {
  const text = value?.trim() ?? ''
  if (!text) return '主版本配方'
  const labels = ['Desktop version', 'Console version', 'Mobile version', 'Old-gen console version', 'Nintendo 3DS version'].filter((label) => text.includes(label))
  return labels.length > 0 ? `${labels.join(' / ')} only` : text
}
function formatSourceTypeLabel(value?: string | null) {
  const key = (value ?? '').trim().toLowerCase()
  const labels: Record<string, string> = {
    drop: '掉落',
    shop: '商店',
    worldgen: '世界生成',
    mining: '采集',
  }
  return labels[key] || '来源'
}
function normalizeSourceRefName(value?: string | null) {
  const text = value?.trim() ?? ''
  if (!text) return ''
  return text.replace(/^(.+?) \1(?=\s|\(|$)/, '$1').replace(/\s+for$/i, '').trim()
}
function formatSourceDisplayName(source: ItemSourceRelation) {
  return normalizeSourceRefName(source.sourceRefNameZh || source.sourceRefName)
}
function shouldShowLocalizedFreeText(value?: string | null) {
  const text = value?.trim() ?? ''
  if (!text) return false
  return /[\u3400-\u9fff]/.test(text)
}
</script>
<style scoped>
.item-detail { display: grid; gap: 18px; }
.detail-hero {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 16%, transparent), transparent 40%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-secondary) 94%, transparent), var(--color-bg-secondary));
}
.detail-hero__media { display: grid; place-items: center; }
.item-avatar {
  width: 104px; height: 104px; border-radius: 24px; border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-tertiary) 88%, transparent); display: grid; place-items: center;
}
.item-avatar--img { object-fit: contain; padding: 14px; }
.item-avatar--fallback { font-size: 1.4rem; font-weight: 700; color: var(--color-text-muted); }
.detail-hero__content { display: grid; gap: 12px; }
.detail-pills,.biome-tags { display: flex; gap: 8px; flex-wrap: wrap; }
.item-name { margin: 0; font-size: 1.45rem; color: var(--color-text); }
.item-subtitle { margin: 0; color: var(--color-text-secondary); }
.detail-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.detail-stat { padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent); display: grid; gap: 4px; }
.detail-stat span { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--color-text-muted); }
.detail-stat strong { color: var(--color-text); }
.item-attributes { display: grid; grid-template-columns: 160px 1fr; gap: 12px 18px; margin: 0; padding: 18px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent); }
.item-attributes dt { font-weight: 700; color: var(--color-text-secondary); }
.item-attributes dd { margin: 0; color: var(--color-text); }
.panel-card { padding: 18px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-bg-secondary) 92%, transparent); box-shadow: var(--shadow-sm); display: grid; gap: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-title { margin: 0; color: var(--color-text); font-size: 1rem; }
.section-meta,.muted,.empty-hint,.description-text,.source-card__text { color: var(--color-text-secondary); line-height: 1.6; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 12px; }
.image-card,.recipe-card,.source-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 14px; background: color-mix(in srgb, var(--color-bg) 80%, var(--color-bg-secondary)); }
.image-card__preview { width: 100%; aspect-ratio: 1; object-fit: contain; border-radius: 12px; background: color-mix(in srgb, var(--color-bg-tertiary) 88%, transparent); margin-bottom: 10px; }
.image-card__meta,.recipe-card__head,.source-card__head { display: grid; gap: 4px; }
.recipe-list,.source-list { display: grid; gap: 12px; }
.recipe-card__block { display: grid; gap: 6px; margin-top: 10px; }
.recipe-card__label { font-size: 13px; font-weight: 700; color: var(--color-text-secondary); }
.plain-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; color: var(--color-text); }
.tag { display: inline-flex; align-items: center; justify-content: center; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.tag--info { background: #e0f2fe; color: #0369a1; }
.tag--success,.tag--emerald { background: #dcfce7; color: #15803d; }
.tag--warning,.tag--amber { background: #fef3c7; color: #b45309; }
.tag--danger,.tag--red { background: #fee2e2; color: #b91c1c; }
.tag--slate { background: #e2e8f0; color: #475569; }
.tag--sky { background: #e0f2fe; color: #0369a1; }
.tag--violet { background: #ede9fe; color: #6d28d9; }
.tag--fuchsia { background: #fae8ff; color: #a21caf; }
.tag--rose { background: #ffe4e6; color: #be123c; }
.tag--orange { background: #ffedd5; color: #c2410c; }
.tag--cyan { background: #cffafe; color: #0e7490; }
@media (max-width: 900px) { .detail-hero,.detail-stats { grid-template-columns: 1fr; } .item-attributes { grid-template-columns: 1fr; } .section-head { align-items: flex-start; flex-direction: column; } }
</style>

