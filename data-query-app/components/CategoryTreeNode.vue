<template>
  <div :id="`category-node-${node.id}`" class="tree-node" :class="{ 'tree-node--highlight': highlightedId === node.id }">
    <div class="tree-node__row">
      <div class="tree-node__content">
        <button
          v-if="hasChildren"
          type="button"
          class="tree-node__toggle"
          @click.stop="expanded = !expanded"
        >
          {{ expanded ? '−' : '+' }}
        </button>
        <span v-else class="tree-node__toggle tree-node__toggle--ghost"></span>
        <span class="tree-node__icon" aria-hidden="true">{{ hasChildren ? '📁' : '📄' }}</span>
        <div class="tree-node__meta">
          <div class="tree-node__headline">
            <span class="tree-node__label">{{ node.name }}</span>
            <span class="tag" :class="levelTagClass">{{ levelLabel }}</span>
            <span v-if="node.code" class="tree-node__code">{{ node.code }}</span>
            <span v-if="childCount" class="tree-node__count">{{ childCount }} 子项</span>
          </div>
          <p v-if="node.description" class="tree-node__description">{{ node.description }}</p>
        </div>
      </div>
      <div class="tree-node__actions">
        <button type="button" class="btn-link" @click.stop="$emit('add-child', node)">新增子类</button>
        <button type="button" class="btn-link" @click.stop="$emit('edit', node)">编辑</button>
        <button type="button" class="btn-link btn-link--danger" @click.stop="$emit('delete', node)">删除</button>
      </div>
    </div>
    <div v-if="hasChildren && expanded" class="tree-node__children">
      <CategoryTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :highlighted-id="highlightedId"
        :expand-signal="expandSignal"
        :collapse-signal="collapseSignal"
        @add-child="$emit('add-child', $event)"
        @edit="$emit('edit', $event)"
        @delete="$emit('delete', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Category } from '~/stores/categories'

const props = defineProps<{
  node: Category
  highlightedId?: number | null
  expandSignal?: number
  collapseSignal?: number
}>()

defineEmits<{
  'add-child': [node: Category]
  edit: [node: Category]
  delete: [node: Category]
}>()

const hasChildren = computed(() => Array.isArray(props.node.children) && props.node.children.length > 0)
const childCount = computed(() => Array.isArray(props.node.children) ? props.node.children.length : 0)
const expanded = ref((props.node.level ?? 1) <= 1)

watch(() => props.expandSignal, () => {
  if (hasChildren.value) expanded.value = true
})

watch(() => props.collapseSignal, () => {
  if (hasChildren.value) expanded.value = false
})

const levelLabel = computed(() => {
  const l = props.node.level
  if (l === 1) return '一级'
  if (l === 2) return '二级'
  return '三级+'
})

const levelTagClass = computed(() => {
  const l = props.node.level
  if (l === 1) return 'tag--primary'
  if (l === 2) return 'tag--success'
  return 'tag--info'
})
</script>

<style scoped>
.tree-node {
  margin-left: 0;
  border-radius: var(--radius-md);
  transition: background-color .18s ease, box-shadow .18s ease;
}

.tree-node--highlight {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 26%, transparent);
}

.tree-node__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
}

.tree-node__row:hover {
  background: var(--color-bg-tertiary);
}

.tree-node__row:hover .tree-node__actions {
  opacity: 1;
}

.tree-node__content {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.tree-node__toggle {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 2px;
}

.tree-node__toggle--ghost {
  opacity: 0;
  pointer-events: none;
}

.tree-node__icon {
  font-size: 1.125rem;
  flex-shrink: 0;
  margin-top: 1px;
}

.tree-node__meta {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.tree-node__headline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tree-node__label {
  font-weight: 600;
  color: var(--color-text);
}

.tree-node__code {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-family: Consolas, 'SFMono-Regular', monospace;
}

.tree-node__count {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.tree-node__description {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  line-height: 1.55;
}

.tree-node__actions {
  display: flex;
  gap: 8px;
  opacity: 0.7;
  transition: opacity 0.2s;
  flex-wrap: wrap;
}

.tree-node__children {
  margin-left: 24px;
  border-left: 1px solid var(--color-border);
  padding-left: 12px;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.6875rem;
  font-weight: 600;
}

.tag--primary {
  background: var(--color-primary-muted);
  color: var(--color-primary);
}

.tag--success {
  background: #d1fae5;
  color: #065f46;
}

.tag--info {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  font-size: 0.8125rem;
}

.btn-link:hover {
  text-decoration: underline;
}

.btn-link--danger {
  color: var(--color-danger, #dc2626);
}
</style>
