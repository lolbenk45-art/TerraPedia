<template>
  <div class="page-wrap town-npc-detail">
    <section class="workspace-shell workspace-shell--unified">
      <div class="workspace-hero workspace-hero--unified detail-hero">
        <div class="workspace-hero__copy">
          <NuxtLink to="/entities/town-npcs" class="back-link">返回城镇 NPC 总览</NuxtLink>
          <p class="eyebrow">TOWN NPC DETAIL</p>
          <h1 class="page-head__title">{{ selectedRow?.nameZh || selectedRow?.name || selectedRow?.internalName || '城镇 NPC 详情' }}</h1>
          <p class="page-head__subtitle">
            这里集中承接 Wiki 肖像、地图图标、对话肖像、完整售卖清单和抓取结果，不再让这些信息挤进总览列表。
          </p>
          <div v-if="selectedRow" class="workspace-summary-grid">
            <article class="summary-mini">
              <span class="summary-mini__label">SHOP ITEMS</span>
              <strong class="summary-mini__value">{{ formatNumber(selectedRow.shopEntryCount || 0) }}</strong>
            </article>
            <article class="summary-mini">
              <span class="summary-mini__label">MATCHED</span>
              <strong class="summary-mini__value">{{ formatNumber(selectedRow.currentShopItems?.length || 0) }}</strong>
            </article>
            <article class="summary-mini">
              <span class="summary-mini__label">UNMATCHED</span>
              <strong class="summary-mini__value">{{ formatNumber(selectedRow.unmatchedShopItems?.length || 0) }}</strong>
            </article>
          </div>
        </div>
        <div class="toolbar-top action-cluster toolbar-top--hero">
          <NuxtLink v-if="selectedRow" :to="`/entities/town-npcs/${selectedRow.id}/edit`" class="btn btn-strong">进入编辑页</NuxtLink>
          <a v-if="selectedRow?.sourcePageUrl" :href="selectedRow.sourcePageUrl" target="_blank" rel="noreferrer" class="btn btn-secondary">打开 Wiki</a>
        </div>
      </div>
    </section>

    <section class="layout">
      <section class="main main--full">
        <div v-if="loading" class="section-card workspace-panel empty-state">加载中...</div>
        <div v-else-if="!selectedRow" class="section-card workspace-panel empty-state">未找到对应的城镇 NPC 记录。</div>
        <template v-else>
          <section class="section-card workspace-panel">
            <div class="overview-shell">
              <article class="identity-panel">
                <div class="identity-panel__portrait">
                  <img v-if="selectedRow.imageUrl" :src="selectedRow.imageUrl" :alt="selectedRow.nameZh || selectedRow.name || selectedRow.internalName || 'NPC'" class="identity-panel__portrait-image" />
                  <div v-else class="identity-panel__portrait-fallback">{{ buildFallback(selectedRow) }}</div>
                </div>

                <div class="identity-panel__copy">
                  <div class="chip-row">
                    <span class="info-chip">{{ selectedRow.gamePeriodLabel || '未设置时期' }}</span>
                    <span class="info-chip info-chip--accent">{{ selectedRow.shopEntryCount || 0 }} 件售卖物</span>
                    <span class="info-chip" :class="{ 'info-chip--warn': !selectedRow.hasBehaviorNotes }">
                      {{ selectedRow.hasBehaviorNotes ? '描述已维护' : '缺少描述' }}
                    </span>
                    <span v-if="selectedRow.wikiDetails?.aiType" class="info-chip info-chip--soft">AI {{ selectedRow.wikiDetails.aiType }}</span>
                  </div>

                  <div class="stat-row">
                    <span v-if="resolveNpcStat(selectedRow, 'damage') != null" class="stat-pill"><b>ATK</b><span>{{ resolveNpcStat(selectedRow, 'damage') }}</span></span>
                    <span v-if="resolveNpcStat(selectedRow, 'lifeMax') != null" class="stat-pill"><b>HP</b><span>{{ resolveNpcStat(selectedRow, 'lifeMax') }}</span></span>
                    <span v-if="resolveNpcStat(selectedRow, 'defense') != null" class="stat-pill"><b>DEF</b><span>{{ resolveNpcStat(selectedRow, 'defense') }}</span></span>
                    <span v-if="resolveKnockBackResist(selectedRow)" class="stat-pill"><b>KB</b><span>{{ resolveKnockBackResist(selectedRow) }}</span></span>
                  </div>

                  <div v-if="buildWikiTagLine(selectedRow)" class="identity-panel__tagline">{{ buildWikiTagLine(selectedRow) }}</div>
                  <p class="identity-panel__summary">{{ selectedRow.behaviorNotes || selectedRow.scrapedFunctionSummary || '暂无功能描述' }}</p>
                </div>
              </article>

              <article class="snapshot-panel">
                <div class="snapshot-panel__head">
                  <h3>抓取快照</h3>
                  <span>#{{ selectedRow.gameId }}</span>
                </div>
                <div class="snapshot-grid">
                  <div class="snapshot-tile">
                    <span>中文名</span>
                    <strong>{{ selectedRow.nameZh || selectedRow.sourcePageTitle || '未同步' }}</strong>
                  </div>
                  <div class="snapshot-tile">
                    <span>英文名</span>
                    <strong>{{ selectedRow.name || selectedRow.internalName }}</strong>
                  </div>
                  <div class="snapshot-tile">
                    <span>抓取页面</span>
                    <strong>{{ selectedRow.sourcePageTitle || '未记录' }}</strong>
                  </div>
                  <div class="snapshot-tile">
                    <span>更新时间</span>
                    <strong>{{ formatTime(selectedRow.updatedAt) }}</strong>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="detail-grid">
            <section class="section-card workspace-panel">
              <div class="section-head">
                <div>
                  <h2 class="section-card__title">Wiki 形象资源</h2>
                  <p class="section-card__subtitle">这部分独立承载立绘、地图图标和对话肖像，避免总览页视觉噪声。</p>
                </div>
              </div>
              <div v-if="wikiAssets.length" class="asset-grid">
                <article v-for="asset in wikiAssets" :key="asset.key" class="asset-card">
                  <img :src="asset.src" :alt="asset.label" class="asset-card__image" />
                  <strong>{{ asset.label }}</strong>
                </article>
              </div>
              <div v-else class="empty-state empty-state--inline">暂无 Wiki 形象资源</div>
            </section>

            <section class="section-card workspace-panel">
              <div class="section-head">
                <div>
                  <h2 class="section-card__title">入住与说明</h2>
                  <p class="section-card__subtitle">保留 Wiki 摘要和入住条件，便于人工校对功能描述与时期。</p>
                </div>
              </div>

              <div class="note-stack">
                <article class="note-card">
                  <span class="note-card__label">功能摘要</span>
                  <p>{{ selectedRow.scrapedFunctionSummary || '暂无 Wiki 功能摘要' }}</p>
                </article>
                <article class="note-card">
                  <span class="note-card__label">入住条件</span>
                  <p>{{ formatMoveInConditions(selectedRow) || '暂无入住条件' }}</p>
                </article>
                <article v-if="selectedRow.unmatchedShopItems?.length" class="note-card">
                  <span class="note-card__label">未匹配物品</span>
                  <p>{{ formatUnmatchedItems(selectedRow) }}</p>
                </article>
              </div>
            </section>
          </section>

          <section class="section-card workspace-panel">
            <div class="section-head">
              <div>
                <h2 class="section-card__title">完整售卖清单</h2>
                <p class="section-card__subtitle">
                  展示当前数据库已关联的售卖物。币种价格优先按本地物品买卖价渲染，Wiki 原价作为次级信息保留。
                </p>
              </div>
            </div>

            <div v-if="selectedRow.currentShopItems?.length" class="shop-grid">
              <article v-for="(item, index) in selectedRow.currentShopItems" :key="`${selectedRow.id}-shop-${index}`" class="shop-card">
                <div class="shop-card__media">
                  <img v-if="item.image" :src="item.image" :alt="item.nameZh || item.name || item.internalName || 'item'" class="shop-card__image" />
                  <div v-else class="shop-card__fallback">{{ buildItemFallback(item) }}</div>
                </div>

                <div class="shop-card__body">
                  <strong>{{ item.nameZh || item.name || item.nameEn || item.internalName }}</strong>
                  <div v-if="buildPriceVisual(item, coinIcons).length" class="price-row">
                    <span v-for="token in buildPriceVisual(item, coinIcons)" :key="`${item.itemId || item.name}-${token.unit}`" class="coin-chip">
                      <img v-if="token.icon" :src="token.icon" :alt="token.label" class="coin-chip__icon" />
                      <span class="coin-chip__value">{{ token.amount }}</span>
                    </span>
                  </div>
                  <span v-else class="price-pill">{{ formatDisplayPrice(item, coinIcons) }}</span>
                  <small v-if="formatSecondaryPrice(item, coinIcons)" class="shop-card__meta">{{ formatSecondaryPrice(item, coinIcons) }}</small>
                  <small v-if="item.notes" class="shop-card__meta">{{ item.notes }}</small>
                </div>
              </article>
            </div>
            <div v-else class="empty-state empty-state--inline">暂无已关联售卖物</div>
          </section>
        </template>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  buildFallback,
  buildItemFallback,
  buildPriceVisual,
  buildWikiTagLine,
  coinIconsFromOverview,
  fetchTownNpcOverview,
  formatDisplayPrice,
  formatMoveInConditions,
  formatNumber,
  formatSecondaryPrice,
  formatTime,
  formatUnmatchedItems,
  resolveKnockBackResist,
  resolveNpcStat,
  rowsFromOverview,
  wikiAssetCards,
  type TownNpcOverview,
  type TownNpcRow,
} from '~/composables/useTownNpcMaintenance'
import { showToast } from '~/composables/useToast'

definePageMeta({ title: '城镇 NPC 详情', navSection: '/entities/town-npcs', headerVariant: 'compact' })

const route = useRoute()
const loading = ref(false)
const overview = ref<TownNpcOverview | null>(null)

const npcId = computed(() => Number(route.params.id || 0))
const selectedRow = computed<TownNpcRow | null>(() => rowsFromOverview(overview.value).find(row => Number(row.id) === npcId.value) || null)
const coinIcons = computed(() => coinIconsFromOverview(overview.value))
const wikiAssets = computed(() => wikiAssetCards(selectedRow.value))

watch(npcId, () => {
  loadPage()
}, { immediate: true })

async function loadPage() {
  loading.value = true
  try {
    overview.value = await fetchTownNpcOverview()
  } catch (error: any) {
    showToast(error?.data?.message || error?.message || '加载城镇 NPC 详情失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.main--full { width: 100%; }
.detail-hero { align-items: flex-start; }

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

.overview-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 18px;
}

.identity-panel,
.snapshot-panel {
  padding: 20px;
  border-radius: 26px;
  border: 1px solid rgba(203, 213, 225, 0.78);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 252, 0.96));
}

.identity-panel {
  display: grid;
  grid-template-columns: 116px minmax(0, 1fr);
  gap: 18px;
}

.identity-panel__portrait {
  width: 116px;
  height: 116px;
  border-radius: 30px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(191, 219, 254, 0.48);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(249, 115, 22, 0.08));
}

.identity-panel__portrait-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 12px;
}

.identity-panel__portrait-fallback,
.shop-card__fallback {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.9);
  color: #0f766e;
  font-weight: 800;
}

.identity-panel__copy {
  display: grid;
  gap: 12px;
  align-content: start;
}

.chip-row,
.stat-row,
.price-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.info-chip,
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(206, 214, 224, 0.88);
  background: rgba(255, 255, 255, 0.94);
  color: #294053;
  font-size: 12px;
  white-space: nowrap;
}

.info-chip--accent {
  border-color: rgba(13, 148, 136, 0.28);
  background: rgba(236, 253, 245, 0.94);
  color: #0f766e;
}

.info-chip--warn {
  border-color: rgba(245, 158, 11, 0.34);
  background: rgba(255, 251, 235, 0.96);
  color: #b45309;
}

.info-chip--soft { background: rgba(241, 245, 249, 0.98); }

.stat-pill b,
.stat-pill span {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.stat-pill b { color: #172230; }
.stat-pill span { color: #0f172a; }

.identity-panel__tagline {
  color: #5c6f84;
  font-size: 13px;
}

.identity-panel__summary {
  margin: 0;
  color: #233447;
  line-height: 1.72;
  font-size: 14px;
}

.snapshot-panel {
  display: grid;
  gap: 16px;
  align-content: start;
}

.snapshot-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.snapshot-panel__head h3 {
  margin: 0;
  color: #162334;
  font-size: 16px;
}

.snapshot-panel__head span {
  color: #617287;
  font-size: 13px;
  font-weight: 700;
}

.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.snapshot-tile {
  display: grid;
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(212, 220, 230, 0.72);
  background: rgba(255, 255, 255, 0.88);
}

.snapshot-tile span {
  color: #607086;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.snapshot-tile strong {
  color: #162334;
  font-size: 14px;
  line-height: 1.5;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 18px;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.asset-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(206, 214, 224, 0.78);
  background: rgba(255, 255, 255, 0.94);
}

.asset-card__image {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 14px;
  background: rgba(240, 244, 248, 0.8);
  padding: 12px;
}

.asset-card strong {
  color: #1f3145;
  font-size: 13px;
  text-align: center;
}

.note-stack {
  display: grid;
  gap: 12px;
}

.note-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(212, 220, 230, 0.72);
  background: rgba(255, 255, 255, 0.9);
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

.shop-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.shop-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(203, 213, 225, 0.74);
  background: rgba(255, 255, 255, 0.96);
}

.shop-card__media {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(212, 220, 230, 0.72);
}

.shop-card__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 8px;
}

.shop-card__body {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.shop-card__body strong {
  color: #172230;
  font-size: 14px;
  line-height: 1.4;
}

.shop-card__meta {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
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

@media (max-width: 1260px) {
  .overview-shell,
  .detail-grid,
  .shop-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .identity-panel {
    grid-template-columns: 1fr;
  }

  .identity-panel__portrait {
    width: 88px;
    height: 88px;
  }

  .snapshot-grid,
  .asset-grid {
    grid-template-columns: 1fr;
  }
}
</style>
