<script setup lang="ts">
import type { CraftingEntityView } from '~/composables/useCraftingRecipeModel'

defineProps<{
  target: CraftingEntityView | null
  pending?: boolean
  source?: string
  maxDepth: number
  isDefault?: boolean
}>()

defineEmits<{
  clear: []
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
      <span class="recipe-section-label">目标状态</span>
      <dl class="crafting-target-fact-list">
        <dt>目标编号</dt>
        <dd>{{ target?.itemId || '675' }}</dd>
        <dt>数据状态</dt>
        <dd>{{ pending ? '请求中' : source === 'api' ? '已载入' : '未载入' }}</dd>
        <dt>展开深度</dt>
        <dd>{{ maxDepth }}</dd>
      </dl>
      <button v-if="target" class="small-button" type="button" @click="$emit('clear')">回到默认</button>
    </aside>
  </section>
</template>
