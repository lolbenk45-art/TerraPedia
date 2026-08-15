<script setup lang="ts">
import type { PublicNpcShopEntry, PublicNpcShopPriceToken } from '~/types/public-api'
import type { NpcShopBand } from '~/utils/npcShopBands'
import { PUBLIC_COPY_CURRENT_AVAILABLE_SHOP_DATA } from '~/utils/publicCopy'

const props = defineProps<{
  title: string
  total: number
  groups: NpcShopBand[]
  visibleGroups: NpcShopBand[]
  selectedGroup: string
  currentStockOnly: boolean
  entryKey: (entry: PublicNpcShopEntry) => string
  entryImage: (entry: PublicNpcShopEntry) => string
  entryTitle: (entry: PublicNpcShopEntry) => string
  entryIcon: (entry: PublicNpcShopEntry) => string
  itemPath: (entry: PublicNpcShopEntry) => string
  priceTokens: (entry: PublicNpcShopEntry) => PublicNpcShopPriceToken[]
  priceLabel: (entry: PublicNpcShopEntry) => string
}>()

const emit = defineEmits<{
  'update:selectedGroup': [value: string]
}>()

const hasPriceOrCondition = (group: NpcShopBand, entry: PublicNpcShopEntry) => (
  props.priceTokens(entry).length > 0 || Boolean(group.conditionSummary(entry))
)
</script>

<template>
  <div class="npc-shop-bands">
    <div class="card-head">
      <div>
        <h2>{{ title }}</h2>
        <p class="sub">
          <template v-if="currentStockOnly">{{ PUBLIC_COPY_CURRENT_AVAILABLE_SHOP_DATA }} · </template>
          {{ total }} 项出售 · 按现有条件资料分组
        </p>
      </div>
      <span class="badge">{{ total }} 项</span>
    </div>

    <div v-if="groups.length" class="npc-shop-toolbar" aria-label="商店条件筛选">
      <button type="button" :class="{ active: selectedGroup === 'all' }" @click="emit('update:selectedGroup', 'all')">全部 {{ total }}</button>
      <button
        v-for="group in groups"
        :key="group.key"
        type="button"
        :class="{ active: selectedGroup === group.key }"
        @click="emit('update:selectedGroup', group.key)"
      >
        {{ group.title }} {{ group.entries.length }}
      </button>
    </div>

    <div v-if="visibleGroups.length" class="grouped-source-list">
      <section v-for="group in visibleGroups" :key="group.key" class="detail-subgroup npc-shop-band">
        <div class="detail-subgroup-title npc-shop-group-head">
          <i class="npc-shop-group-dot"></i>
          <b>{{ group.title }}</b>
          <span class="npc-shop-group-count">{{ group.entries.length }}</span>
          <span class="npc-shop-group-meta">· {{ group.meta }}</span>
          <span class="npc-shop-group-rule"></span>
        </div>
        <div class="source-table dark-table tp-detail-relation-grid npc-shop-grid">
          <div v-for="entry in group.entries.slice(0, 8)" :key="entryKey(entry)" class="source-row detail-relation-row npc-shop-row">
            <span class="sprite-frame detail-relation-icon">
              <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="entryTitle(entry).slice(0, 1) || '?'" :fallback-icon="entryIcon(entry)" />
            </span>
            <div class="detail-relation-copy">
              <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
              <b v-else>{{ entryTitle(entry) }}</b>
              <span class="npc-shop-meta">
                <span v-if="priceTokens(entry).length" class="npc-shop-price" :aria-label="priceLabel(entry)">
                  <span v-for="token in priceTokens(entry)" :key="`${entryKey(entry)}-${token.unit}`" class="npc-shop-price-token">
                    <span class="npc-shop-price-icon">
                      <CommonPreviewImage :src="token.iconUrl || ''" :alt="token.label || '钱币'" :fallback="token.label || '钱币'" fallback-icon="icon-items" decorative />
                    </span>
                    <span class="npc-shop-price-text">{{ token.amount }}{{ token.label }}</span>
                  </span>
                </span>
                <span v-if="group.conditionSummary(entry)" class="npc-shop-condition">{{ group.conditionSummary(entry) }}</span>
                <span v-if="!hasPriceOrCondition(group, entry)">商店资料</span>
              </span>
            </div>
          </div>
        </div>
        <details v-if="group.entries.length > 8" class="detail-group-remainder">
          <summary>展开其余 {{ group.entries.length - 8 }} 项</summary>
          <div class="source-table dark-table tp-detail-relation-grid npc-shop-grid">
            <div v-for="entry in group.entries.slice(8)" :key="entryKey(entry)" class="source-row detail-relation-row npc-shop-row">
              <span class="sprite-frame detail-relation-icon">
                <CommonPreviewImage :src="entryImage(entry)" :alt="entryTitle(entry)" :fallback="entryTitle(entry).slice(0, 1) || '?'" :fallback-icon="entryIcon(entry)" />
              </span>
              <div class="detail-relation-copy">
                <NuxtLink v-if="itemPath(entry)" :to="itemPath(entry)" class="detail-relation-link"><b>{{ entryTitle(entry) }}</b></NuxtLink>
                <b v-else>{{ entryTitle(entry) }}</b>
                <span class="npc-shop-meta">
                  <span v-if="priceTokens(entry).length" class="npc-shop-price" :aria-label="priceLabel(entry)">
                    <span v-for="token in priceTokens(entry)" :key="`${entryKey(entry)}-${token.unit}`" class="npc-shop-price-token">
                      <span class="npc-shop-price-icon">
                        <CommonPreviewImage :src="token.iconUrl || ''" :alt="token.label || '钱币'" :fallback="token.label || '钱币'" fallback-icon="icon-items" decorative />
                      </span>
                      <span class="npc-shop-price-text">{{ token.amount }}{{ token.label }}</span>
                    </span>
                  </span>
                  <span v-if="group.conditionSummary(entry)" class="npc-shop-condition">{{ group.conditionSummary(entry) }}</span>
                  <span v-if="!hasPriceOrCondition(group, entry)">商店资料</span>
                </span>
              </div>
            </div>
          </div>
        </details>
      </section>
    </div>
    <p v-else class="tp-detail-empty">暂时没有整理到出售物品。</p>
  </div>
</template>
