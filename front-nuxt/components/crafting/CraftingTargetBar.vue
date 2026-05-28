<script setup lang="ts">
import type { CraftingEntityView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  target: CraftingEntityView | null
  pending?: boolean
  source?: string
  maxDepth: number
  isDefault?: boolean
  query: string
  suggestions: Array<{ id: string | number; displayName: string; image: string; fallback: string; category: string }>
  searchPending?: boolean
  searchUnavailable?: boolean
}>()

defineEmits<{
  'update:query': [value: string]
  select: [itemId: string | number]
  clear: []
  refreshItems: []
}>()
</script>

<template>
  <section class="crafting-target-bar tp-panel" data-crafting-role="target-bar">
    <div class="crafting-target-art" data-crafting-role="target-art">
      <CommonPreviewImage
        v-if="target"
        :src="target.image"
        :alt="target.title"
        :fallback="target.fallback"
        :fallback-icon="target.fallbackIcon"
        width="128"
        height="128"
      />
      <span v-else class="sprite-icon icon-crafting" aria-hidden="true"></span>
    </div>

    <div class="crafting-target-main" data-crafting-role="target-main">
      <span class="eyebrow">路线档案</span>
      <strong class="target-title">{{ target?.title || '制作路线' }}</strong>
      <p>{{ isDefault ? '默认示例，可搜索其它目标物品。' : '当前显示公开配方模型。' }}</p>
      <div class="tp-token-list">
        <span class="tp-token">公开配方模型</span>
        <span class="tp-token">{{ pending ? '请求中' : source === 'api' ? '已载入' : '未载入' }}</span>
        <span class="tp-token">深度 {{ maxDepth }}</span>
      </div>
    </div>

    <aside class="crafting-target-facts" data-crafting-role="target-facts">
      <span class="recipe-section-label">检索与状态</span>
      <dl class="crafting-target-fact-list">
        <dt>目标编号</dt>
        <dd>{{ target?.itemId || '675' }}</dd>
        <dt>数据状态</dt>
        <dd>{{ pending ? '请求中' : source === 'api' ? '已载入' : '未载入' }}</dd>
        <dt>展开深度</dt>
        <dd>{{ maxDepth }}</dd>
      </dl>

      <form class="crafting-target-search" role="search" @submit.prevent>
        <label for="crafting-item-search">搜索物品</label>
        <div class="crafting-target-input-row">
          <input
            id="crafting-item-search"
            :value="query"
            type="search"
            placeholder="输入物品名称或 ID"
            @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
          />
          <button v-if="target" class="small-button" type="button" @click="$emit('clear')">清除</button>
        </div>
        <div v-if="query || searchPending || searchUnavailable" class="crafting-suggestions">
          <button
            v-for="item in suggestions"
            :key="item.id"
            class="crafting-suggestion"
            type="button"
            @click="$emit('select', item.id)"
          >
            <CommonPreviewImage :src="item.image" :alt="item.displayName" :fallback="item.fallback" fallback-icon="icon-items" width="34" height="34" />
            <b>{{ item.displayName }}</b>
            <span>{{ item.category }}</span>
          </button>
          <div v-if="!suggestions.length" class="crafting-muted">
            {{ searchUnavailable ? '物品建议暂未载入。' : '没有匹配物品。' }}
            <button v-if="searchUnavailable" class="small-button active" type="button" @click="$emit('refreshItems')">重新加载</button>
          </div>
        </div>
      </form>
    </aside>
  </section>
</template>
