<template>
  <div class="page-wrap town-npc-edit">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified edit-hero">
        <div class="workspace-hero__copy">
          <NuxtLink :to="detailPath" class="back-link">返回详情页</NuxtLink>
          <p class="eyebrow">TOWN NPC EDITOR</p>
          <h1 class="page-head__title">{{ pageTitle }}</h1>
          <p class="page-head__subtitle">
            独立维护时期、功能描述和 shop 关联。编辑页只保留维护必需信息，避免列表页和详情页承担编辑负担。
          </p>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <NuxtLink :to="detailPath" class="btn btn-secondary">返回详情</NuxtLink>
          <button type="button" class="btn btn-strong" :disabled="saving || loading" @click="saveRow">
            {{ saving ? '保存中...' : '保存并返回' }}
          </button>
        </div>
      </div>
    </section>

    <section class="layout">
      <section class="main main--full">
        <div v-if="loading" class="section-card workspace-panel empty-state">加载中...</div>
        <div v-else-if="!editorDetail" class="section-card workspace-panel empty-state">未找到可编辑的城镇 NPC 记录。</div>
        <div v-else class="editor-shell">
          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">维护表单</h2>
                <p class="section-card__subtitle">保存时会写回时期、功能描述与 <code>npc_shop_entries</code> 关联。</p>
              </div>
            </div>

            <div class="form-grid">
              <label class="field">
                <div class="field__topline">
                  <span class="field__label">出现时期</span>
                  <button v-if="selectedRow?.suggestedGamePeriodId != null" type="button" class="field__action" @click="applySuggestedGamePeriod">使用 Wiki 建议</button>
                </div>
                <select v-model.number="form.gamePeriodId" class="input">
                  <option :value="0">未设置</option>
                  <option :value="1">前期</option>
                  <option :value="2">困难模式</option>
                </select>
              </label>

              <label class="field field--full">
                <div class="field__topline">
                  <span class="field__label">功能描述</span>
                  <button v-if="selectedRow?.suggestedBehaviorNotes" type="button" class="field__action" @click="applySuggestedBehavior">使用 Wiki 摘要</button>
                </div>
                <textarea v-model="form.behaviorNotes" class="input textarea" rows="10" />
              </label>

              <label class="field field--full">
                <div class="field__topline">
                  <span class="field__label">Shop Entries JSON</span>
                  <div class="field__action-group">
                    <button type="button" class="field__action" @click="applySuggestedShopEntries">导入抓取骨架</button>
                    <button type="button" class="field__action" @click="formatShopEntries">格式化 JSON</button>
                  </div>
                </div>
                <textarea v-model="form.shopEntriesText" class="input textarea textarea--code" rows="18" />
              </label>
            </div>
          </section>

          <aside class="editor-aside">
            <section class="section-card workspace-panel">
              <div class="section-head">
                <div>
                  <h2 class="section-card__title">当前关联售卖物</h2>
                  <p class="section-card__subtitle">{{ formatNumber(selectedRow?.currentShopItems?.length || 0) }} 件物品已在库中关联。</p>
                </div>
              </div>

              <div v-if="selectedRow?.currentShopItems?.length" class="shop-preview-list">
                <article v-for="(item, index) in selectedRow.currentShopItems" :key="`${selectedRow.id}-bound-${index}`" class="shop-preview-item">
                  <div class="shop-preview-item__media">
                    <img v-if="item.image" :src="item.image" :alt="item.nameZh || item.name || item.internalName || 'item'" class="shop-preview-item__image" />
                    <div v-else class="shop-preview-item__fallback">{{ buildItemFallback(item) }}</div>
                  </div>
                  <div class="shop-preview-item__body">
                    <strong>{{ item.nameZh || item.name || item.nameEn || item.internalName }}</strong>
                    <div v-if="buildPriceVisual(item, coinIcons).length" class="price-row">
                      <span v-for="token in buildPriceVisual(item, coinIcons)" :key="`${item.itemId || item.name}-${token.unit}`" class="coin-chip coin-chip--soft">
                        <img v-if="token.icon" :src="token.icon" :alt="token.label" class="coin-chip__icon" />
                        <span class="coin-chip__value">{{ token.amount }}</span>
                      </span>
                    </div>
                    <span v-else class="price-pill price-pill--soft">{{ formatDisplayPrice(item, coinIcons) }}</span>
                  </div>
                </article>
              </div>
              <div v-else class="empty-state empty-state--inline">暂无已关联售卖物</div>
            </section>

            <section class="section-card workspace-panel">
              <div class="section-head">
                <div>
                  <h2 class="section-card__title">编辑参考</h2>
                  <p class="section-card__subtitle">这里保留维护时真正需要的 Wiki 线索，不再夹带大图资源。</p>
                </div>
              </div>

              <div class="note-stack">
                <article class="note-card">
                  <span class="note-card__label">功能摘要</span>
                  <p>{{ selectedRow?.scrapedFunctionSummary || '暂无 Wiki 摘要' }}</p>
                </article>
                <article class="note-card">
                  <span class="note-card__label">入住条件</span>
                  <p>{{ formatMoveInConditions(selectedRow) || '暂无入住条件' }}</p>
                </article>
                <article v-if="selectedRow?.unmatchedShopItems?.length" class="note-card">
                  <span class="note-card__label">未匹配物品</span>
                  <p>{{ formatUnmatchedItems(selectedRow) }}</p>
                </article>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  buildItemFallback,
  buildPriceVisual,
  coinIconsFromOverview,
  fetchTownNpcEditorDetail,
  fetchTownNpcOverview,
  formatDisplayPrice,
  formatMoveInConditions,
  formatNumber,
  formatUnmatchedItems,
  rowsFromOverview,
  saveTownNpcMaintenance,
  type TownNpcEditorDetail,
  type TownNpcOverview,
  type TownNpcRow,
} from '~/composables/useTownNpcMaintenance'
import { showToast } from '~/composables/useToast'

definePageMeta({ title: '编辑城镇 NPC', navSection: '/entities/town-npcs', headerVariant: 'compact' })

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const overview = ref<TownNpcOverview | null>(null)
const editorDetail = ref<TownNpcEditorDetail | null>(null)

const form = reactive({
  gamePeriodId: 0,
  behaviorNotes: '',
  shopEntriesText: '[]',
})

const npcId = computed(() => Number(route.params.id || 0))
const detailPath = computed(() => `/entities/town-npcs/${npcId.value}`)
const selectedRow = computed<TownNpcRow | null>(() => rowsFromOverview(overview.value).find(row => Number(row.id) === npcId.value) || null)
const pageTitle = computed(() => selectedRow.value?.nameZh || selectedRow.value?.name || selectedRow.value?.internalName || editorDetail.value?.nameZh || '编辑城镇 NPC')
const coinIcons = computed(() => coinIconsFromOverview(overview.value))

watch(npcId, () => {
  loadPage()
}, { immediate: true })

async function loadPage() {
  loading.value = true
  try {
    const [overviewResult, detailResult] = await Promise.all([
      fetchTownNpcOverview(),
      fetchTownNpcEditorDetail(npcId.value),
    ])
    overview.value = overviewResult
    editorDetail.value = detailResult
    form.gamePeriodId = Number(detailResult?.gamePeriodId || 0)
    form.behaviorNotes = String(detailResult?.behaviorNotes || '')
    form.shopEntriesText = JSON.stringify(Array.isArray(detailResult?.shopEntries) ? detailResult.shopEntries : [], null, 2)
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '加载城镇 NPC 编辑页失败', 'error')
  } finally {
    loading.value = false
  }
}

function applySuggestedGamePeriod() {
  if (selectedRow.value?.suggestedGamePeriodId == null) return
  form.gamePeriodId = Number(selectedRow.value.suggestedGamePeriodId)
}

function applySuggestedBehavior() {
  if (!selectedRow.value?.suggestedBehaviorNotes) return
  form.behaviorNotes = selectedRow.value.suggestedBehaviorNotes
}

function applySuggestedShopEntries() {
  const entries = Array.isArray(selectedRow.value?.suggestedShopEntries) ? selectedRow.value.suggestedShopEntries : []
  form.shopEntriesText = JSON.stringify(entries.map((row: any, index: number) => ({
    itemId: row.itemId ?? null,
    priceText: row.priceText ?? null,
    notes: row.notes ?? null,
    sortOrder: row.sortOrder ?? index + 1,
  })), null, 2)
}

function formatShopEntries() {
  try {
    form.shopEntriesText = JSON.stringify(JSON.parse(form.shopEntriesText || '[]'), null, 2)
  } catch {
    showToast('当前 JSON 不合法，无法格式化', 'error')
  }
}

async function saveRow() {
  let shopEntries: Array<Record<string, any>>
  try {
    const parsed = JSON.parse(form.shopEntriesText || '[]')
    if (!Array.isArray(parsed)) {
      showToast('Shop Entries JSON 必须是数组', 'warning')
      return
    }
    shopEntries = parsed
  } catch {
    showToast('Shop Entries JSON 不是合法 JSON', 'warning')
    return
  }

  saving.value = true
  try {
    await saveTownNpcMaintenance(npcId.value, {
      gamePeriodId: form.gamePeriodId,
      behaviorNotes: form.behaviorNotes.trim(),
      shopEntries,
    })
    showToast('城镇 NPC 维护字段已保存', 'success')
    await navigateTo(detailPath.value)
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '保存城镇 NPC 失败', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.main--full { width: 100%; }
.edit-hero { align-items: flex-start; }

.back-link {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-bottom: 10px;
  color: #0f766e;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.empty-state {
  color: #64748b;
  text-align: center;
  padding: 48px 24px;
}

.empty-state--inline { padding: 12px 0; }

.editor-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
  gap: 18px;
}

.form-grid,
.editor-aside,
.note-stack,
.shop-preview-list {
  display: grid;
  gap: 16px;
}

.textarea--code {
  min-height: 320px;
  font-family: Consolas, 'SFMono-Regular', 'Liberation Mono', monospace;
  line-height: 1.65;
  background: rgba(246, 248, 251, 0.92);
}

.shop-preview-item,
.note-card {
  padding: 16px;
  border-radius: 20px;
  border: 1px solid rgba(212, 220, 230, 0.72);
  background: rgba(255, 255, 255, 0.92);
}

.shop-preview-item {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.shop-preview-item__media {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(212, 220, 230, 0.72);
}

.shop-preview-item__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 8px;
}

.shop-preview-item__fallback {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.92);
  color: #0f766e;
  font-weight: 800;
}

.shop-preview-item__body {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.shop-preview-item__body strong {
  color: #172230;
  font-size: 14px;
  line-height: 1.35;
}

.note-card {
  display: grid;
  gap: 8px;
}

.note-card__label {
  color: #607086;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.note-card p {
  margin: 0;
  color: #233447;
  line-height: 1.7;
  font-size: 14px;
}

.price-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.coin-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px 4px 7px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.98), rgba(255, 255, 255, 0.98));
  border: 1px solid rgba(245, 158, 11, 0.25);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.coin-chip--soft {
  border-color: rgba(20, 184, 166, 0.22);
  background: linear-gradient(135deg, rgba(240, 253, 250, 0.98), rgba(255, 255, 255, 0.98));
}

.coin-chip__icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex: 0 0 16px;
}

.coin-chip__value {
  color: #7c2d12;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.coin-chip--soft .coin-chip__value { color: #0f766e; }

.price-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.price-pill--soft { background: linear-gradient(135deg, #0f766e, #14b8a6); }

@media (max-width: 1180px) {
  .editor-shell {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .shop-preview-item {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .shop-preview-item__media {
    width: 56px;
    height: 56px;
  }
}
</style>
