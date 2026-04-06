<template>
  <div ref="containerRef" class="virtual-grid-container">
    <!-- 实际滚动区域 -->
    <div 
      class="virtual-grid"
      :style="gridStyle"
    >
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="virtual-grid-item"
        :style="itemStyle"
      >
        <ItemCard
          :item="item"
          :index="item._index"
          @click="$emit('itemClick', item)"
        />
      </div>
    </div>
    
    <!-- 占位符，用于撑开滚动高度 -->
    <div 
      class="virtual-spacer"
      :style="{ height: totalHeight + 'px' }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { Item } from '@/types'
import ItemCard from './ItemCard.vue'

interface Props {
  items: Item[]
  columnCount?: number
  rowHeight?: number
  gap?: number
}

const props = withDefaults(defineProps<Props>(), {
  columnCount: 7,
  rowHeight: 110,
  gap: 8
})

defineEmits<{
  itemClick: [item: Item]
}>()

const containerRef = ref<HTMLElement>()
const scrollTop = ref(0)
const containerHeight = ref(0)

// 添加索引
const itemsWithIndex = computed(() => {
  return props.items.map((item, index) => ({ ...item, _index: index }))
})

// 总行数
const totalRows = computed(() => {
  return Math.ceil(props.items.length / props.columnCount)
})

// 总高度
const totalHeight = computed(() => {
  return totalRows.value * props.rowHeight
})

// 可见区域的起始行
const startRow = computed(() => {
  return Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - 2)
})

// 可见区域的结束行
const endRow = computed(() => {
  const visibleCount = Math.ceil(containerHeight.value / props.rowHeight) + 4
  return Math.min(totalRows.value, startRow.value + visibleCount)
})

// 可见的物品
const visibleItems = computed(() => {
  const startIndex = startRow.value * props.columnCount
  const endIndex = Math.min(
    props.items.length,
    (endRow.value + 1) * props.columnCount
  )
  return itemsWithIndex.value.slice(startIndex, endIndex)
})

// 网格样式
const gridStyle = computed<CSSProperties>(() => {
  const offsetY = startRow.value * props.rowHeight
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${props.columnCount}, 1fr)`,
    gap: `${props.gap}px`,
    position: 'absolute',
    top: `${offsetY}px`,
    left: '0',
    right: '0',
    padding: `0 ${props.gap}px`
  }
})

// 物品样式
const itemStyle = computed(() => ({
  height: `${props.rowHeight - props.gap}px`
}))

// 处理滚动
const handleScroll = () => {
  if (containerRef.value) {
    scrollTop.value = containerRef.value.scrollTop
  }
}

// 处理窗口大小变化
const handleResize = () => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
  }
}

onMounted(() => {
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
    containerRef.value.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleResize)
  }
})

onUnmounted(() => {
  if (containerRef.value) {
    containerRef.value.removeEventListener('scroll', handleScroll)
  }
  window.removeEventListener('resize', handleResize)
})

// 监听物品变化，重置滚动位置
watch(() => props.items.length, () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = 0
    scrollTop.value = 0
  }
})
</script>

<style scoped>
.virtual-grid-container {
  position: relative;
  height: calc(100vh - 300px);
  overflow-y: auto;
  overflow-x: hidden;
}

.virtual-grid {
  will-change: transform;
}

.virtual-spacer {
  width: 100%;
}

/* 自定义滚动条 */
.virtual-grid-container::-webkit-scrollbar {
  width: 6px;
}

.virtual-grid-container::-webkit-scrollbar-track {
  background: transparent;
}

.virtual-grid-container::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.virtual-grid-container::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>
