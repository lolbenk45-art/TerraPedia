<template>
  <AppModal
    v-model="modalVisible"
    :title="modalTitle"
    width="min(1460px, calc(100vw - 24px))"
    max-height="94dvh"
    body-padding="0"
  >
    <div v-if="row" class="workbench-shell">
      <section class="workbench-hero">
        <div class="npc-badge">
          <div class="npc-badge__portrait">
            <img
              v-if="row.imageUrl"
              :src="row.imageUrl"
              :alt="row.nameZh || row.name || row.internalName || 'Town NPC'"
              class="npc-badge__portrait-image"
            >
            <div v-else class="npc-badge__portrait-fallback">{{ buildFallback(row) }}</div>
          </div>

          <div class="npc-badge__copy">
            <div class="npc-badge__title-row">
              <div class="npc-badge__title-box">
                <h2>{{ row.nameZh || row.name || row.internalName || 'Town NPC' }}</h2>
                <p>{{ row.name || row.internalName || '未同步英文名' }}</p>
              </div>

              <div class="chip-row">
                <span class="chip chip--accent">{{ row.gamePeriodLabel || '未设置时期' }}</span>
                <span class="chip">{{ row.shopEntryCount || 0 }} 件售卖物</span>
                <span class="chip" :class="{ 'chip--warn': !row.hasBehaviorNotes }">
                  {{ row.hasBehaviorNotes ? '描述已维护' : '待补描述' }}
                </span>
                <span v-if="row.matchedSuggestedShopEntryCount" class="chip chip--soft">
                  Wiki 命中 {{ row.matchedSuggestedShopEntryCount }}
                </span>
              </div>
            </div>

            <div class="stat-row">
              <span v-if="resolveNpcStat(row, 'damage') != null" class="stat-pill"><b>ATK</b><span>{{ resolveNpcStat(row, 'damage') }}</span></span>
              <span v-if="resolveNpcStat(row, 'lifeMax') != null" class="stat-pill"><b>HP</b><span>{{ resolveNpcStat(row, 'lifeMax') }}</span></span>
              <span v-if="resolveNpcStat(row, 'defense') != null" class="stat-pill"><b>DEF</b><span>{{ resolveNpcStat(row, 'defense') }}</span></span>
              <span v-if="resolveKnockBackResist(row)" class="stat-pill"><b>KB</b><span>{{ resolveKnockBackResist(row) }}</span></span>
            </div>

            <p class="npc-badge__summary">{{ form.behaviorNotes.trim() || row.scrapedFunctionSummary || '暂无功能描述' }}</p>
          </div>
        </div>

        <div class="hero-side">
          <div class="hero-side__stats">
            <article class="hero-metric">
              <span>数据库关联</span>
              <strong>{{ shopEntryDrafts.length }}</strong>
            </article>
            <article class="hero-metric">
              <span>Wiki 建议</span>
              <strong>{{ suggestedEntries.length }}</strong>
            </article>
            <article class="hero-metric">
              <span>未匹配</span>
              <strong>{{ row.unmatchedShopItems?.length || 0 }}</strong>
            </article>
          </div>

          <div class="hero-side__actions">
            <button type="button" class="mini-action" :class="{ 'mini-action--active': activeMode === 'detail' }" @click="activeMode = 'detail'">
              <LayoutPanelTop :size="15" />
              详情
            </button>
            <button type="button" class="mini-action" :class="{ 'mini-action--active': activeMode === 'edit' }" @click="activeMode = 'edit'">
              <PencilLine :size="15" />
              编辑
            </button>
            <a v-if="row.sourcePageUrl" :href="row.sourcePageUrl" target="_blank" rel="noreferrer" class="mini-action mini-action--ghost">
              <ExternalLink :size="15" />
              Wiki
            </a>
          </div>
        </div>
      </section>

      <div class="workbench-tabs">
        <button type="button" class="tab-trigger" :class="{ 'tab-trigger--active': activeMode === 'detail' }" @click="activeMode = 'detail'">
          详情快照
        </button>
        <button type="button" class="tab-trigger" :class="{ 'tab-trigger--active': activeMode === 'edit' }" @click="activeMode = 'edit'">
          维护工作台
        </button>
      </div>

      <div v-if="loadingDetail" class="state-card">正在加载维护数据...</div>
      <template v-else>
        <section v-if="activeMode === 'detail'" class="detail-layout">
          <article class="panel panel--overview">
            <div class="panel__head">
              <div>
                <h3>维护摘要</h3>
                <p>这里集中展示 Wiki 抓取摘要、入住条件和基础维护状态。</p>
              </div>
            </div>

            <div class="detail-summary-grid">
              <article class="summary-card">
                <span>功能摘要</span>
                <p>{{ row.scrapedFunctionSummary || '暂无 Wiki 功能摘要' }}</p>
              </article>
              <article class="summary-card">
                <span>入住条件</span>
                <p>{{ formatMoveInConditions(row) || '暂无入住条件' }}</p>
              </article>
              <article class="summary-card">
                <span>抓取页面</span>
                <p>{{ row.sourcePageTitle || '暂无页面标题' }}</p>
              </article>
              <article class="summary-card">
                <span>更新时间</span>
                <p>{{ formatTime(row.updatedAt) }}</p>
              </article>
            </div>

            <div v-if="wikiAssets.length" class="asset-grid">
              <article v-for="asset in wikiAssets" :key="asset.key" class="asset-card">
                <div class="asset-card__media">
                  <img :src="asset.src" :alt="asset.label" class="asset-card__image">
                </div>
                <strong>{{ asset.label }}</strong>
              </article>
            </div>

            <div v-if="row.unmatchedShopItems?.length" class="warning-block">
              <strong>Wiki 未匹配物品</strong>
              <p>{{ formatUnmatchedItems(row) }}</p>
            </div>
          </article>

          <article class="panel">
            <div class="panel__head panel__head--split">
              <div>
                <h3>售卖物详情</h3>
                <p>价格优先显示币种图标，Wiki 原始价格作为次要信息保留。</p>
              </div>
              <label class="inline-search">
                <Search :size="15" />
                <input v-model.trim="detailShopSearch" type="text" placeholder="筛选售卖物">
              </label>
            </div>

            <div v-if="filteredDetailShopItems.length" class="detail-shop-grid">
              <article v-for="(item, index) in filteredDetailShopItems" :key="`${row.id}-detail-${index}`" class="detail-shop-card">
                <div class="detail-shop-card__media">
                  <img v-if="item.image" :src="item.image" :alt="item.nameZh || item.name || item.internalName || 'item'" class="detail-shop-card__image">
                  <div v-else class="detail-shop-card__fallback">{{ buildItemFallback(item) }}</div>
                </div>

                <div class="detail-shop-card__body">
                  <strong>{{ item.nameZh || item.name || item.nameEn || item.internalName }}</strong>
                  <div v-if="buildPriceVisual(item, coinIcons).length" class="price-row">
                    <span v-for="token in buildPriceVisual(item, coinIcons)" :key="`${item.itemId || item.name}-${token.unit}`" class="coin-chip">
                      <img v-if="token.icon" :src="token.icon" :alt="token.label" class="coin-chip__icon">
                      <span class="coin-chip__value">{{ token.amount }}</span>
                    </span>
                  </div>
                  <span v-else class="price-pill">{{ formatDisplayPrice(item, coinIcons) }}</span>
                  <small v-if="formatSecondaryPrice(item, coinIcons)" class="muted-line">{{ formatSecondaryPrice(item, coinIcons) }}</small>
                  <small v-if="item.notes" class="muted-line">{{ item.notes }}</small>
                </div>
              </article>
            </div>
            <div v-else class="empty-inline">暂无可展示的售卖物。</div>
          </article>
        </section>

        <section v-else class="editor-layout">
          <div class="editor-main">
            <article class="panel panel--form">
              <div class="panel__head panel__head--split">
                <div>
                  <h3>基础维护</h3>
                  <p>时期、描述和售卖关系都在同一张工作台完成，不再跳独立页面。</p>
                </div>
                <div class="quick-actions">
                  <button v-if="row.suggestedGamePeriodId != null" type="button" class="ghost-action" @click="applySuggestedGamePeriod">应用 Wiki 时期</button>
                  <button v-if="row.suggestedBehaviorNotes" type="button" class="ghost-action" @click="applySuggestedBehavior">应用 Wiki 摘要</button>
                  <button v-if="suggestedEntries.length" type="button" class="ghost-action" @click="addMissingSuggestedEntries">批量补齐建议物品</button>
                </div>
              </div>

              <div class="form-strip">
                <label class="field">
                  <span class="field__label">出现时期</span>
                  <select v-model.number="form.gamePeriodId" class="input">
                    <option :value="0">未设置</option>
                    <option :value="1">前期</option>
                    <option :value="2">困难模式</option>
                  </select>
                </label>

                <label class="field field--wide">
                  <span class="field__label">功能描述</span>
                  <textarea v-model="form.behaviorNotes" class="input textarea" rows="4" />
                </label>
              </div>
            </article>

            <article class="panel panel--entries">
              <div class="panel__head panel__head--split">
                <div>
                  <h3>售卖关联维护</h3>
                  <p>支持查看、搜索、替换、删除、调序、修改价格备注和条件 JSON。</p>
                </div>
                <label class="inline-search">
                  <Search :size="15" />
                  <input v-model.trim="entrySearch" type="text" placeholder="筛选当前关联物品">
                </label>
              </div>

              <div v-if="replaceTargetLabel" class="replace-banner">
                <span>当前处于替换模式：{{ replaceTargetLabel }}</span>
                <button type="button" class="ghost-action" @click="clearReplaceTarget">取消替换</button>
              </div>

              <div v-if="filteredShopEntryDrafts.length" class="entry-list">
                <article v-for="entry in filteredShopEntryDrafts" :key="entry.localKey" class="entry-card">
                  <div class="entry-card__head">
                    <div class="entry-card__item">
                      <div class="entry-card__media">
                        <img v-if="entry.itemImage" :src="entry.itemImage" :alt="entry.itemNameZh || entry.itemName || entry.itemInternalName || 'item'" class="entry-card__image">
                        <div v-else class="entry-card__fallback">{{ buildItemFallback(entry) }}</div>
                      </div>

                      <div class="entry-card__copy">
                        <strong>{{ entry.itemNameZh || entry.itemName || entry.itemInternalName || '未绑定物品' }}</strong>
                        <span>{{ entry.itemName || entry.itemInternalName || `ID ${entry.itemId || '未设置'}` }}</span>
                        <div class="entry-card__meta">
                          <span class="sort-badge">顺序 {{ entry.sortOrder }}</span>
                          <span class="price-pill price-pill--soft">{{ entry.priceText || '价格待补' }}</span>
                        </div>
                      </div>
                    </div>

                    <div class="entry-card__actions">
                      <button type="button" class="icon-btn" :disabled="entry.sortOrder === 1" @click="moveEntry(entry.localKey, -1)">
                        <ArrowUp :size="15" />
                      </button>
                      <button type="button" class="icon-btn" :disabled="entry.sortOrder === shopEntryDrafts.length" @click="moveEntry(entry.localKey, 1)">
                        <ArrowDown :size="15" />
                      </button>
                      <button type="button" class="ghost-action" @click="setReplaceTarget(entry.localKey)">替换物品</button>
                      <button type="button" class="ghost-action ghost-action--danger" @click="removeEntry(entry.localKey)">移除</button>
                    </div>
                  </div>

                  <div class="entry-card__form">
                    <label class="field">
                      <span class="field__label">价格文本</span>
                      <input v-model="entry.priceText" type="text" class="input" placeholder="例如 25 silver">
                    </label>
                    <label class="field field--wide">
                      <span class="field__label">备注</span>
                      <input v-model="entry.notes" type="text" class="input" placeholder="例如 困难模式、血月期间">
                    </label>
                  </div>

                  <label class="field field--full">
                    <span class="field__label">条件 JSON</span>
                    <textarea
                      v-model="entry.conditionsText"
                      class="input textarea textarea--code"
                      rows="5"
                      placeholder='例如 [{"refType":"BIOME","refId":1,"conditionRole":"required","notes":"丛林","sortOrder":1}]'
                    />
                  </label>
                </article>
              </div>
              <div v-else class="empty-inline">当前没有售卖关联，可从右侧建议或物品搜索中新增。</div>
            </article>
          </div>

          <aside class="editor-side">
            <article class="panel">
              <div class="panel__head">
                <div>
                  <h3>手动添加 / 替换</h3>
                  <p>从物品表搜索后直接新增，或替换当前选中的关联项。</p>
                </div>
              </div>

              <label class="search-box">
                <Search :size="15" />
                <input v-model.trim="itemSearch" type="text" class="search-box__input" placeholder="搜索物品中文名、英文名或 internalName">
              </label>

              <div v-if="wikiBindingTarget" class="replace-banner">
                <span>当前在为 Wiki 条目“{{ wikiBindingLabel }}”手动关联本地物品</span>
                <button type="button" class="ghost-action" @click="clearWikiBindingTarget">取消关联</button>
              </div>

              <div v-if="itemSearchLoading" class="empty-inline">正在搜索物品...</div>
              <div v-else-if="itemSearch.trim() && !itemSearchResults.length" class="empty-inline">未找到匹配物品。</div>
              <div v-else class="suggestion-list">
                <article v-for="item in itemSearchResults" :key="item.id" class="suggestion-card">
                  <div class="suggestion-card__media">
                    <img v-if="item.imageUrl || item.image" :src="item.imageUrl || item.image" :alt="item.nameZh || item.name || item.internalName || 'item'" class="suggestion-card__image">
                    <div v-else class="suggestion-card__fallback">{{ buildItemFallback(item) }}</div>
                  </div>
                  <div class="suggestion-card__body">
                    <strong>{{ item.nameZh || item.name || item.internalName }}</strong>
                    <span>{{ item.name || item.internalName }}</span>
                    <div v-if="buildPriceVisual(item, coinIcons).length" class="price-row">
                      <span v-for="token in buildPriceVisual(item, coinIcons)" :key="`${item.id}-${token.unit}`" class="coin-chip coin-chip--soft">
                        <img v-if="token.icon" :src="token.icon" :alt="token.label" class="coin-chip__icon">
                        <span class="coin-chip__value">{{ token.amount }}</span>
                      </span>
                    </div>
                  </div>
                  <button type="button" class="suggestion-card__action" @click="applyManualSelection(item)">
                    {{ replaceTargetKey ? '替换当前关联' : (wikiBindingTarget ? '绑定到 Wiki 条目' : '添加为本地关联') }}
                  </button>
                </article>
              </div>
            </article>

            <article class="panel">
              <div class="panel__head">
                <div>
                  <h3>Wiki 建议售卖物</h3>
                  <p>先使用已命中的 Wiki 建议，再对缺口做手动补齐。</p>
                </div>
              </div>

              <div v-if="suggestedEntries.length" class="suggestion-list">
                <article v-for="entry in suggestedEntries" :key="`suggested-${entry.itemId}-${entry.sortOrder}`" class="suggestion-card">
                  <div class="suggestion-card__media">
                    <img v-if="entry.itemImage" :src="entry.itemImage" :alt="entry.itemNameZh || entry.itemName || entry.itemInternalName || 'item'" class="suggestion-card__image">
                    <div v-else class="suggestion-card__fallback">{{ buildItemFallback(entry) }}</div>
                  </div>
                  <div class="suggestion-card__body">
                    <strong>{{ entry.itemNameZh || entry.itemName || entry.itemInternalName }}</strong>
                    <span>{{ entry.priceText || '价格待补' }}</span>
                    <small v-if="entry.notes">{{ entry.notes }}</small>
                    <div class="binding-meta">
                      <span class="binding-chip binding-chip--soft">物品库命中：{{ entry.itemNameZh || entry.itemName || entry.itemInternalName || '未命中' }}</span>
                      <span v-if="linkedDraftByItemId.get(Number(entry.itemId || 0))" class="binding-chip binding-chip--ok">
                        当前 NPC 已关联：{{ linkedDraftByItemId.get(Number(entry.itemId || 0))?.itemNameZh || linkedDraftByItemId.get(Number(entry.itemId || 0))?.itemName || '已存在' }}
                      </span>
                      <span v-else class="binding-chip binding-chip--warn">当前 NPC 尚未挂上这条本地关系</span>
                    </div>
                  </div>
                  <div class="suggestion-card__actions">
                    <button type="button" class="suggestion-card__action" :disabled="hasLinkedItem(entry.itemId)" @click="addSuggestedEntry(entry)">
                      {{ hasLinkedItem(entry.itemId) ? '已加入当前 NPC' : '加入当前 NPC' }}
                    </button>
                    <button type="button" class="ghost-action" @click="startManualBindForSuggested(entry)">
                      {{ linkedDraftByItemId.get(Number(entry.itemId || 0)) ? '改绑本地物品' : '手动关联本地物品' }}
                    </button>
                  </div>
                </article>
              </div>
              <div v-else class="empty-inline">该 NPC 还没有命中的 Wiki 建议售卖物。</div>
            </article>

            <article class="panel">
              <div class="panel__head">
                <div>
                  <h3>未匹配提醒</h3>
                  <p>这些物品来自 Wiki，但当前未能自动关联到本地物品表。</p>
                </div>
              </div>

              <div v-if="row.unmatchedShopItems?.length" class="suggestion-list">
                <article v-for="(item, index) in row.unmatchedShopItems" :key="`${row.id}-unmatched-${index}`" class="suggestion-card suggestion-card--warning">
                  <div class="suggestion-card__body">
                    <strong>{{ item.nameZh || item.nameEn || item.name || '未命名物品' }}</strong>
                    <span>{{ item.priceText || '价格待补' }}</span>
                    <small v-if="item.availability">{{ item.availability }}</small>
                    <div class="binding-meta">
                      <span class="binding-chip binding-chip--warn">还没命中物品库，需要你手动选本地物品</span>
                    </div>
                  </div>
                  <div class="suggestion-card__actions">
                    <button type="button" class="ghost-action" @click="startManualBindForUnmatched(item)">关联本地物品</button>
                  </div>
                </article>
              </div>
              <div v-else class="empty-inline">当前没有未匹配物品。</div>
            </article>
          </aside>
        </section>
      </template>
    </div>

    <template #footer>
      <button type="button" class="btn btn-secondary" @click="modalVisible = false">关闭</button>
      <button type="button" class="btn btn-strong" :disabled="saving || loadingDetail || !row" @click="saveChanges">
        {{ saving ? '保存中...' : '保存维护结果' }}
      </button>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, ExternalLink, LayoutPanelTop, PencilLine, Search } from 'lucide-vue-next'
import {
  buildFallback,
  buildItemFallback,
  buildPriceVisual,
  fetchItemSuggestions,
  fetchTownNpcEditorDetail,
  formatDisplayPrice,
  formatMoveInConditions,
  formatSecondaryPrice,
  formatTime,
  formatUnmatchedItems,
  resolveKnockBackResist,
  resolveNpcStat,
  saveTownNpcMaintenance,
  wikiAssetCards,
  type RefItem,
  type TownNpcRow,
} from '~/composables/useTownNpcMaintenance'
import { showToast } from '~/composables/useToast'

type WorkbenchMode = 'detail' | 'edit'

type ShopEntryDraft = {
  localKey: string
  id: number | null
  itemId: number | null
  sourceItemId: number | null
  priceText: string
  notes: string
  sortOrder: number
  conditionsText: string
  itemNameZh: string
  itemName: string
  itemInternalName: string
  itemImage: string
  buy: number | null
  sell: number | null
}

type WikiBindingTarget = {
  kind: 'suggested' | 'unmatched'
  nameZh: string
  nameEn: string
  priceText: string
  notes: string
  linkedItemId: number | null
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  row: TownNpcRow | null
  coinIcons?: Record<string, string>
  mode?: WorkbenchMode
}>(), {
  coinIcons: () => ({}),
  mode: 'detail',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [npcId: number]
}>()

const row = computed(() => props.row)
const coinIcons = computed(() => props.coinIcons || {})

const modalVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const activeMode = ref<WorkbenchMode>('detail')
const loadingDetail = ref(false)
const saving = ref(false)
const detailShopSearch = ref('')
const entrySearch = ref('')
const itemSearch = ref('')
const itemSearchLoading = ref(false)
const itemSearchResults = ref<RefItem[]>([])
const shopEntryDrafts = ref<ShopEntryDraft[]>([])
const replaceTargetKey = ref('')
const wikiBindingTarget = ref<WikiBindingTarget | null>(null)

const form = reactive({
  gamePeriodId: 0,
  behaviorNotes: '',
})

const wikiAssets = computed(() => wikiAssetCards(props.row))
const suggestedEntries = computed(() => Array.isArray(props.row?.suggestedShopEntries) ? props.row!.suggestedShopEntries : [])
const detailShopItems = computed(() => Array.isArray(props.row?.currentShopItems) ? props.row!.currentShopItems : [])

const currentShopByItemId = computed(() => {
  const map = new Map<number, Record<string, any>>()
  for (const item of detailShopItems.value) {
    const itemId = asPositiveNumber(item?.itemId)
    if (itemId) map.set(itemId, item)
  }
  return map
})

const suggestedByItemId = computed(() => {
  const map = new Map<number, Record<string, any>>()
  for (const item of suggestedEntries.value) {
    const itemId = asPositiveNumber(item?.itemId)
    if (itemId) map.set(itemId, item)
  }
  return map
})

const filteredDetailShopItems = computed(() => {
  const keyword = normalizeKeyword(detailShopSearch.value)
  if (!keyword) return detailShopItems.value
  return detailShopItems.value.filter(item => {
    return [
      item?.nameZh,
      item?.name,
      item?.nameEn,
      item?.internalName,
      item?.priceText,
    ].some(value => String(value || '').toLowerCase().includes(keyword))
  })
})

const filteredShopEntryDrafts = computed(() => {
  const keyword = normalizeKeyword(entrySearch.value)
  if (!keyword) return shopEntryDrafts.value
  return shopEntryDrafts.value.filter(entry => {
    return [
      entry.itemNameZh,
      entry.itemName,
      entry.itemInternalName,
      entry.priceText,
      entry.notes,
    ].some(value => String(value || '').toLowerCase().includes(keyword))
  })
})

const linkedDraftByItemId = computed(() => {
  const map = new Map<number, ShopEntryDraft>()
  for (const entry of shopEntryDrafts.value) {
    if (entry.itemId) map.set(entry.itemId, entry)
  }
  return map
})

const replaceTargetLabel = computed(() => {
  if (!replaceTargetKey.value) return ''
  const target = shopEntryDrafts.value.find(entry => entry.localKey === replaceTargetKey.value)
  return target ? (target.itemNameZh || target.itemName || target.itemInternalName || '未命名关联') : ''
})

const wikiBindingLabel = computed(() => {
  const target = wikiBindingTarget.value
  if (!target) return ''
  return target.nameZh || target.nameEn || '未命名 Wiki 条目'
})

const modalTitle = computed(() => {
  const base = props.row?.nameZh || props.row?.name || props.row?.internalName || 'Town NPC'
  return `${base} 维护工作台`
})

let draftSeed = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => [props.modelValue, props.row?.id, props.mode] as const,
  ([visible, npcId, mode]) => {
    if (!visible || !npcId) return
    activeMode.value = mode || 'detail'
    void loadDetail(Number(npcId))
  },
  { immediate: true },
)

watch(
  () => itemSearch.value,
  (value) => {
    if (searchTimer) clearTimeout(searchTimer)
    if (!value.trim()) {
      itemSearchResults.value = []
      itemSearchLoading.value = false
      return
    }
    searchTimer = setTimeout(() => {
      void runItemSearch(value)
    }, 220)
  },
)

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

async function loadDetail(npcId: number) {
  loadingDetail.value = true
  try {
    const detail = await fetchTownNpcEditorDetail(npcId)
    form.gamePeriodId = Number(detail?.gamePeriodId || props.row?.gamePeriodId || 0)
    form.behaviorNotes = String(detail?.behaviorNotes || props.row?.behaviorNotes || '')
    shopEntryDrafts.value = normalizeShopEntries(Array.isArray(detail?.shopEntries) ? detail!.shopEntries : [])
    replaceTargetKey.value = ''
    wikiBindingTarget.value = null
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '加载 Town NPC 维护数据失败', 'error')
  } finally {
    loadingDetail.value = false
  }
}

function normalizeShopEntries(entries: Array<Record<string, any>>): ShopEntryDraft[] {
  return entries.map((entry, index) => {
    const itemId = asPositiveNumber(entry.itemId)
    const current = itemId ? currentShopByItemId.value.get(itemId) : null
    const suggested = itemId ? suggestedByItemId.value.get(itemId) : null
    return {
      localKey: nextDraftKey(),
      id: asPositiveNumber(entry.id),
      itemId,
      sourceItemId: asPositiveNumber(entry.sourceItemId),
      priceText: String(entry.priceText || current?.priceText || suggested?.priceText || ''),
      notes: String(entry.notes || current?.notes || suggested?.notes || ''),
      sortOrder: Number(entry.sortOrder || index + 1),
      conditionsText: JSON.stringify(Array.isArray(entry.conditions) ? entry.conditions : [], null, 2),
      itemNameZh: String(entry.itemNameZh || current?.nameZh || suggested?.itemNameZh || ''),
      itemName: String(entry.itemName || current?.name || suggested?.itemName || ''),
      itemInternalName: String(entry.itemInternalName || current?.internalName || suggested?.itemInternalName || ''),
      itemImage: String(entry.itemImage || current?.image || suggested?.itemImage || ''),
      buy: asNullableNumber(current?.buyPrice),
      sell: asNullableNumber(current?.sellPrice),
    }
  })
}

function normalizeSuggestionEntry(entry: Record<string, any>, sortOrder = shopEntryDrafts.value.length + 1): ShopEntryDraft {
  const itemId = asPositiveNumber(entry.itemId)
  const current = itemId ? currentShopByItemId.value.get(itemId) : null
  return {
    localKey: nextDraftKey(),
    id: null,
    itemId,
    sourceItemId: asPositiveNumber(entry.sourceItemId),
    priceText: String(entry.priceText || ''),
    notes: String(entry.notes || ''),
    sortOrder,
    conditionsText: '[]',
    itemNameZh: String(entry.itemNameZh || current?.nameZh || ''),
    itemName: String(entry.itemName || current?.name || ''),
    itemInternalName: String(entry.itemInternalName || current?.internalName || ''),
    itemImage: String(entry.itemImage || current?.image || ''),
    buy: asNullableNumber(current?.buyPrice),
    sell: asNullableNumber(current?.sellPrice),
  }
}

function normalizeManualItem(item: RefItem, sortOrder = shopEntryDrafts.value.length + 1): ShopEntryDraft {
  return {
    localKey: nextDraftKey(),
    id: null,
    itemId: asPositiveNumber(item.id),
    sourceItemId: null,
    priceText: '',
    notes: '',
    sortOrder,
    conditionsText: '[]',
    itemNameZh: String(item.nameZh || ''),
    itemName: String(item.name || item.nameEn || ''),
    itemInternalName: String(item.internalName || ''),
    itemImage: String(item.imageUrl || item.image || ''),
    buy: asNullableNumber(item.buy),
    sell: asNullableNumber(item.sell),
  }
}

function hasLinkedItem(itemId: unknown) {
  const normalized = asPositiveNumber(itemId)
  if (!normalized) return false
  return shopEntryDrafts.value.some(entry => entry.itemId === normalized)
}

function resolveLinkedDraft(itemId: unknown) {
  const normalized = asPositiveNumber(itemId)
  if (!normalized) return null
  return linkedDraftByItemId.value.get(normalized) || null
}

function addSuggestedEntry(entry: Record<string, any>) {
  const itemId = asPositiveNumber(entry.itemId)
  if (!itemId) {
    showToast('该 Wiki 建议未命中本地物品，无法直接加入', 'warning')
    return
  }
  if (hasLinkedItem(itemId)) {
    showToast('该物品已经在当前关联中', 'warning')
    return
  }
  shopEntryDrafts.value.push(normalizeSuggestionEntry(entry))
  syncSortOrders()
}

function addMissingSuggestedEntries() {
  let added = 0
  for (const entry of suggestedEntries.value) {
    const itemId = asPositiveNumber(entry.itemId)
    if (!itemId || hasLinkedItem(itemId)) continue
    shopEntryDrafts.value.push(normalizeSuggestionEntry(entry))
    added += 1
  }
  if (!added) {
    showToast('当前没有可新增的 Wiki 建议售卖物', 'warning')
    return
  }
  syncSortOrders()
  showToast(`已加入 ${added} 条 Wiki 建议售卖物`, 'success')
}

function applySuggestedGamePeriod() {
  if (props.row?.suggestedGamePeriodId == null) return
  form.gamePeriodId = Number(props.row.suggestedGamePeriodId)
}

function applySuggestedBehavior() {
  if (!props.row?.suggestedBehaviorNotes) return
  form.behaviorNotes = props.row.suggestedBehaviorNotes
}

function setReplaceTarget(localKey: string) {
  replaceTargetKey.value = localKey
  wikiBindingTarget.value = null
}

function clearReplaceTarget() {
  replaceTargetKey.value = ''
}

function clearWikiBindingTarget() {
  wikiBindingTarget.value = null
}

function startManualBindForSuggested(entry: Record<string, any>) {
  const linkedDraft = resolveLinkedDraft(entry.itemId)
  if (linkedDraft) {
    replaceTargetKey.value = linkedDraft.localKey
  } else {
    replaceTargetKey.value = ''
  }

  wikiBindingTarget.value = {
    kind: 'suggested',
    nameZh: String(entry.sourceNameZh || entry.itemNameZh || ''),
    nameEn: String(entry.sourceNameEn || entry.itemName || entry.itemInternalName || ''),
    priceText: String(entry.priceText || ''),
    notes: String(entry.notes || ''),
    linkedItemId: asPositiveNumber(entry.itemId),
  }
  itemSearch.value = String(entry.sourceNameZh || entry.sourceNameEn || entry.itemNameZh || entry.itemName || '')
}

function startManualBindForUnmatched(item: Record<string, any>) {
  replaceTargetKey.value = ''
  wikiBindingTarget.value = {
    kind: 'unmatched',
    nameZh: String(item.nameZh || ''),
    nameEn: String(item.nameEn || item.name || ''),
    priceText: String(item.priceText || ''),
    notes: String(item.availability || ''),
    linkedItemId: null,
  }
  itemSearch.value = String(item.nameZh || item.nameEn || item.name || '')
}

function applyWikiBindingSelection(item: RefItem) {
  if (!wikiBindingTarget.value) return false
  const next = normalizeManualItem(item)
  next.priceText = wikiBindingTarget.value.priceText || next.priceText
  next.notes = wikiBindingTarget.value.notes || next.notes

  if (replaceTargetKey.value) {
    replaceEntry(replaceTargetKey.value, next)
    replaceTargetKey.value = ''
    wikiBindingTarget.value = null
    return true
  }

  if (next.itemId && hasLinkedItem(next.itemId)) {
    showToast('该本地物品已经在当前 NPC 关联中', 'warning')
    return true
  }

  shopEntryDrafts.value.push(next)
  syncSortOrders()
  wikiBindingTarget.value = null
  return true
}

function applyManualSelection(item: RefItem) {
  if (wikiBindingTarget.value && applyWikiBindingSelection(item)) {
    return
  }

  const next = normalizeManualItem(item)
  if (replaceTargetKey.value) {
    replaceEntry(replaceTargetKey.value, next)
    replaceTargetKey.value = ''
    return
  }
  if (next.itemId && hasLinkedItem(next.itemId)) {
    showToast('该物品已经在当前关联中', 'warning')
    return
  }
  shopEntryDrafts.value.push(next)
  syncSortOrders()
}

function replaceEntry(localKey: string, next: ShopEntryDraft) {
  const index = shopEntryDrafts.value.findIndex(entry => entry.localKey === localKey)
  if (index < 0) return

  if (next.itemId) {
    const duplicate = shopEntryDrafts.value.find(entry => entry.localKey !== localKey && entry.itemId === next.itemId)
    if (duplicate) {
      showToast('目标物品已存在，请直接调整已有条目', 'warning')
      return
    }
  }

  const current = shopEntryDrafts.value[index]
  if (!current) return
  shopEntryDrafts.value[index] = {
    ...current,
    itemId: next.itemId,
    sourceItemId: next.sourceItemId,
    itemNameZh: next.itemNameZh,
    itemName: next.itemName,
    itemInternalName: next.itemInternalName,
    itemImage: next.itemImage,
    buy: next.buy,
    sell: next.sell,
  }
}

function moveEntry(localKey: string, direction: -1 | 1) {
  const index = shopEntryDrafts.value.findIndex(entry => entry.localKey === localKey)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= shopEntryDrafts.value.length) return
  const clone = [...shopEntryDrafts.value]
  const [entry] = clone.splice(index, 1)
  if (!entry) return
  clone.splice(targetIndex, 0, entry)
  shopEntryDrafts.value = clone
  syncSortOrders()
}

function removeEntry(localKey: string) {
  shopEntryDrafts.value = shopEntryDrafts.value.filter(entry => entry.localKey !== localKey)
  if (replaceTargetKey.value === localKey) {
    replaceTargetKey.value = ''
  }
  syncSortOrders()
}

function syncSortOrders() {
  shopEntryDrafts.value = shopEntryDrafts.value.map((entry, index) => ({
    ...entry,
    sortOrder: index + 1,
  }))
}

async function runItemSearch(keyword: string) {
  itemSearchLoading.value = true
  try {
    itemSearchResults.value = await fetchItemSuggestions(keyword, 10)
  } catch (error: any) {
    itemSearchResults.value = []
    showToast(error?.data?.message || error?.message || '搜索物品失败', 'error')
  } finally {
    itemSearchLoading.value = false
  }
}

async function saveChanges() {
  if (!props.row?.id) return

  const payloadEntries = []
  for (const [index, entry] of shopEntryDrafts.value.entries()) {
    let conditions: Array<Record<string, any>> = []
    try {
      const parsed = entry.conditionsText.trim() ? JSON.parse(entry.conditionsText) : []
      if (!Array.isArray(parsed)) {
        showToast(`第 ${index + 1} 条售卖关联的条件必须是 JSON 数组`, 'warning')
        return
      }
      conditions = parsed
    } catch {
      showToast(`第 ${index + 1} 条售卖关联的条件 JSON 不合法`, 'warning')
      return
    }

    if (!entry.itemId && !entry.sourceItemId) {
      showToast(`第 ${index + 1} 条售卖关联还没有绑定物品`, 'warning')
      return
    }

    payloadEntries.push({
      itemId: entry.itemId,
      sourceItemId: entry.sourceItemId,
      priceText: entry.priceText.trim() || null,
      notes: entry.notes.trim() || null,
      sortOrder: index + 1,
      conditions,
    })
  }

  saving.value = true
  try {
    await saveTownNpcMaintenance(Number(props.row.id), {
      gamePeriodId: form.gamePeriodId,
      behaviorNotes: form.behaviorNotes.trim() || null,
      shopEntries: payloadEntries,
    })
    showToast('Town NPC 维护结果已保存', 'success')
    await loadDetail(Number(props.row.id))
    emit('saved', Number(props.row.id))
    activeMode.value = 'detail'
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '保存 Town NPC 维护结果失败', 'error')
  } finally {
    saving.value = false
  }
}

function nextDraftKey() {
  draftSeed += 1
  return `shop-entry-${draftSeed}`
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase()
}

function asPositiveNumber(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function asNullableNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
</script>

<style scoped>
.workbench-shell {
  display: grid;
  gap: 18px;
  padding: 18px;
  background:
    radial-gradient(circle at top right, rgba(15, 118, 110, 0.08), transparent 24%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.98));
}

.workbench-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 16px;
  align-items: stretch;
}

.npc-badge,
.panel,
.hero-side {
  border: 1px solid rgba(203, 213, 225, 0.78);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.npc-badge {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
}

.npc-badge__portrait {
  width: 112px;
  height: 112px;
  border-radius: 30px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(20, 184, 166, 0.14), rgba(245, 158, 11, 0.12));
  border: 1px solid rgba(153, 246, 228, 0.4);
}

.npc-badge__portrait-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 10px;
}

.npc-badge__portrait-fallback,
.detail-shop-card__fallback,
.entry-card__fallback,
.suggestion-card__fallback {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  color: #0f766e;
  font-weight: 800;
}

.npc-badge__copy,
.npc-badge__title-box,
.hero-side,
.panel,
.summary-card,
.detail-shop-card__body,
.entry-card__copy,
.suggestion-card__body {
  display: grid;
  gap: 10px;
}

.npc-badge__title-row,
.panel__head--split,
.replace-banner,
.entry-card__head,
.entry-card__item,
.suggestion-card {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.npc-badge__title-row,
.panel__head--split,
.replace-banner,
.entry-card__head,
.suggestion-card {
  justify-content: space-between;
  align-items: flex-start;
}

.npc-badge__title-box h2,
.panel__head h3 {
  margin: 0;
  color: #162334;
}

.npc-badge__title-box h2 {
  font-size: 26px;
  line-height: 1.1;
}

.npc-badge__title-box p,
.panel__head p,
.muted-line,
.summary-card p,
.warning-block p {
  margin: 0;
  color: #64748b;
  line-height: 1.6;
}

.npc-badge__summary {
  margin: 0;
  color: #223246;
  font-size: 14px;
  line-height: 1.7;
}

.chip-row,
.stat-row,
.price-row,
.quick-actions,
.hero-side__actions,
.entry-card__actions,
.entry-card__meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip,
.stat-pill,
.sort-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(203, 213, 225, 0.78);
  background: rgba(248, 250, 252, 0.96);
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.chip--accent {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.24);
  background: rgba(240, 253, 250, 0.98);
}

.chip--soft {
  color: #1d4ed8;
  border-color: rgba(96, 165, 250, 0.26);
  background: rgba(239, 246, 255, 0.98);
}

.chip--warn {
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(255, 251, 235, 0.98);
}

.stat-pill b,
.stat-pill span {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.hero-side {
  padding: 18px;
  align-content: space-between;
}

.hero-side__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hero-metric {
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.94));
  border: 1px solid rgba(226, 232, 240, 0.84);
  display: grid;
  gap: 6px;
}

.hero-metric span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.hero-metric strong {
  color: #0f172a;
  font-size: 22px;
  font-variant-numeric: tabular-nums;
}

.mini-action,
.ghost-action,
.suggestion-card__action,
.icon-btn,
.tab-trigger {
  border: 1px solid rgba(203, 213, 225, 0.86);
  background: rgba(255, 255, 255, 0.96);
  color: #334155;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.mini-action:hover,
.ghost-action:hover,
.suggestion-card__action:hover,
.icon-btn:hover,
.tab-trigger:hover {
  transform: translateY(-1px);
  border-color: rgba(13, 148, 136, 0.3);
  color: #0f766e;
}

.mini-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 14px;
  text-decoration: none;
  font-weight: 700;
}

.mini-action--active {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.28);
  background: rgba(240, 253, 250, 0.96);
}

.mini-action--ghost {
  color: #1d4ed8;
}

.workbench-tabs {
  display: inline-flex;
  width: fit-content;
  padding: 5px;
  gap: 6px;
  border-radius: 18px;
  background: rgba(226, 232, 240, 0.72);
}

.tab-trigger {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 14px;
  font-weight: 700;
}

.tab-trigger--active {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.28);
  background: rgba(255, 255, 255, 0.98);
}

.state-card,
.empty-inline {
  padding: 18px;
  border-radius: 18px;
  color: #64748b;
  text-align: center;
  background: rgba(255, 255, 255, 0.92);
  border: 1px dashed rgba(148, 163, 184, 0.4);
}

.detail-layout,
.editor-layout {
  display: grid;
  gap: 18px;
}

.detail-layout {
  grid-template-columns: minmax(340px, 0.78fr) minmax(0, 1.22fr);
}

.editor-layout {
  grid-template-columns: minmax(0, 1.28fr) minmax(340px, 0.72fr);
  align-items: start;
}

.editor-main,
.editor-side,
.detail-summary-grid,
.asset-grid,
.detail-shop-grid,
.entry-list,
.suggestion-list,
.binding-meta,
.suggestion-card__actions {
  display: grid;
  gap: 14px;
}

.panel {
  padding: 18px;
}

.panel__head {
  margin-bottom: 14px;
}

.detail-summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.summary-card,
.detail-shop-card,
.entry-card,
.suggestion-card,
.warning-block {
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(248, 250, 252, 0.86);
}

.binding-meta {
  gap: 8px;
}

.binding-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(203, 213, 225, 0.82);
  background: rgba(248, 250, 252, 0.96);
  color: #475569;
  font-size: 12px;
  font-weight: 700;
}

.binding-chip--soft {
  color: #1d4ed8;
  border-color: rgba(96, 165, 250, 0.26);
  background: rgba(239, 246, 255, 0.98);
}

.binding-chip--ok {
  color: #0f766e;
  border-color: rgba(20, 184, 166, 0.24);
  background: rgba(240, 253, 250, 0.98);
}

.binding-chip--warn {
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(255, 251, 235, 0.98);
}

.summary-card span,
.field__label {
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.asset-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.asset-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  background: rgba(248, 250, 252, 0.86);
}

.asset-card__media {
  aspect-ratio: 1 / 1;
  border-radius: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
}

.asset-card__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 10px;
}

.inline-search,
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  background: rgba(255, 255, 255, 0.98);
  color: #64748b;
}

.inline-search input,
.search-box__input {
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  color: #0f172a;
}

.detail-shop-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-shop-card,
.entry-card__item {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.detail-shop-card__media,
.entry-card__media,
.suggestion-card__media {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(226, 232, 240, 0.92);
}

.detail-shop-card__image,
.entry-card__image,
.suggestion-card__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 8px;
}

.coin-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px 4px 7px;
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(255, 255, 255, 0.98));
}

.coin-chip--soft {
  border-color: rgba(20, 184, 166, 0.22);
  background: linear-gradient(135deg, rgba(240, 253, 250, 0.98), rgba(255, 255, 255, 0.98));
}

.coin-chip__icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.coin-chip__value {
  color: #7c2d12;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.coin-chip--soft .coin-chip__value {
  color: #0f766e;
}

.price-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, #b45309, #f59e0b);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.price-pill--soft {
  background: linear-gradient(135deg, #0f766e, #14b8a6);
}

.form-strip,
.entry-card__form {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
}

.field--wide,
.field--full {
  grid-column: 1 / -1;
}

.input {
  min-height: 42px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: rgba(255, 255, 255, 0.98);
  color: #0f172a;
  outline: none;
}

.textarea {
  min-height: 112px;
  resize: vertical;
  line-height: 1.6;
}

.textarea--code {
  min-height: 132px;
  font-family: Consolas, 'SFMono-Regular', 'Liberation Mono', monospace;
}

.replace-banner {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(239, 246, 255, 0.92);
  border: 1px solid rgba(147, 197, 253, 0.42);
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.entry-card__item {
  min-width: 0;
  flex: 1 1 320px;
}

.suggestion-card__actions {
  min-width: 180px;
}

.suggestion-card--warning {
  border-color: rgba(245, 158, 11, 0.26);
  background: rgba(255, 251, 235, 0.45);
}

.entry-card__copy strong,
.suggestion-card__body strong,
.detail-shop-card__body strong {
  color: #0f172a;
  font-size: 14px;
  line-height: 1.35;
}

.entry-card__copy span,
.suggestion-card__body span,
.suggestion-card__body small {
  color: #64748b;
  font-size: 13px;
}

.ghost-action,
.suggestion-card__action {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  font-weight: 700;
}

.ghost-action--danger {
  color: #b91c1c;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.suggestion-card__action:disabled,
.icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none;
}

.warning-list {
  margin: 0;
  padding-left: 18px;
  color: #475569;
  display: grid;
  gap: 8px;
}

@media (max-width: 1240px) {
  .detail-layout,
  .editor-layout,
  .workbench-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .detail-summary-grid,
  .asset-grid,
  .detail-shop-grid,
  .form-strip,
  .entry-card__form {
    grid-template-columns: 1fr;
  }

  .npc-badge {
    grid-template-columns: 1fr;
  }

  .npc-badge__portrait {
    width: 88px;
    height: 88px;
  }
}

@media (max-width: 640px) {
  .workbench-shell {
    padding: 12px;
  }

  .hero-side__stats {
    grid-template-columns: 1fr;
  }

  .detail-shop-card,
  .entry-card__item {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .detail-shop-card__media,
  .entry-card__media,
  .suggestion-card__media {
    width: 56px;
    height: 56px;
  }
}
</style>
