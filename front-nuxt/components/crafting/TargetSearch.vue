<script setup lang="ts">
defineProps<{
  query: string
  targetTitle?: string
  suggestions: Array<{ id: string | number; displayName: string; image: string; fallback: string; category: string }>
  searchPending?: boolean
  searchUnavailable?: boolean
  compact?: boolean
}>()

defineEmits<{
  'update:query': [value: string]
  select: [itemId: string | number]
  clear: []
  refreshItems: []
}>()
</script>

<template>
  <form
    class="crafting-target-search"
    :class="{ 'is-compact': compact }"
    role="search"
    data-crafting-role="target-search"
    @submit.prevent
  >
    <label for="crafting-item-search">快速搜索目标物品</label>
    <div class="crafting-target-input-row">
      <input
        id="crafting-item-search"
        :value="query"
        type="search"
        :placeholder="targetTitle ? `搜索并切换：${targetTitle}` : '输入物品名称或 ID'"
        autocomplete="off"
        @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
      />
      <button v-if="query" class="small-button" type="button" @click="$emit('clear')">清空</button>
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
</template>
