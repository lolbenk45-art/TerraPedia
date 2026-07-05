<template>
  <section class="log-viewer" aria-label="日志查看器">
    <header class="log-viewer__toolbar">
      <div class="log-viewer__levels" role="group" aria-label="日志级别">
        <button
          v-for="level in levels"
          :key="level"
          type="button"
          class="log-viewer__level"
          :class="{ active: selectedLevels.includes(level) }"
          @click="toggleLevel(level)"
        >
          {{ level }}
        </button>
      </div>
      <label class="log-viewer__search">
        <Search :size="15" />
        <input v-model="search" type="search" placeholder="搜索日志" aria-label="搜索日志" />
      </label>
    </header>

    <div v-if="files.length" class="log-viewer__files">
      <button
        v-for="file in files"
        :key="file.path"
        type="button"
        class="log-viewer__file"
        :title="file.path"
        @click="$emit('preview', file.path)"
      >
        <FileText :size="15" />
        <span>{{ file.label || '日志' }}</span>
        <code>{{ file.path }}</code>
      </button>
    </div>

    <ol v-if="filteredLines.length" class="log-viewer__lines">
      <li v-for="line in filteredLines" :key="line.lineNumber" :class="`log-viewer__line--${line.level.toLowerCase()}`">
        <span>{{ line.lineNumber }}</span>
        <strong>{{ line.level }}</strong>
        <code>{{ line.text }}</code>
      </li>
    </ol>
    <div v-else class="log-viewer__empty">
      <TerminalSquare :size="22" />
      <span>{{ content ? '没有匹配的日志行' : '选择日志文件后在右侧预览完整内容' }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileText, Search, TerminalSquare } from 'lucide-vue-next'
import { filterLogLines } from '~/utils/crawlerMonitorTriageWorkbench.mjs'

defineEmits<{
  preview: [path: string]
}>()

const props = defineProps<{
  content?: string
  files?: Array<{ label?: string, path: string }>
}>()

const levels = ['ERROR', 'WARN', 'INFO']
const selectedLevels = ref<Array<string>>(['ERROR', 'WARN', 'INFO'])
const search = ref('')
const files = computed(() => Array.isArray(props.files) ? props.files : [])
const content = computed(() => props.content || '')
const filteredLines = computed(() => filterLogLines({
  content: content.value,
  levels: selectedLevels.value,
  search: search.value,
} as any))

function toggleLevel(level: string) {
  if (selectedLevels.value.includes(level)) {
    selectedLevels.value = selectedLevels.value.filter((item) => item !== level)
    return
  }
  selectedLevels.value = [...selectedLevels.value, level]
}
</script>

<style scoped>
.log-viewer {
  display: grid;
  gap: 12px;
}

.log-viewer__toolbar,
.log-viewer__files,
.log-viewer__file,
.log-viewer__line,
.log-viewer__search {
  display: flex;
  align-items: center;
}

.log-viewer__toolbar {
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.log-viewer__levels {
  display: flex;
  gap: 6px;
}

.log-viewer__level {
  min-height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  color: var(--color-text-secondary);
  padding: 0 10px;
  cursor: pointer;
}

.log-viewer__level.active {
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
}

.log-viewer__search {
  min-height: 36px;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  padding: 0 10px;
}

.log-viewer__search input {
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  min-width: 180px;
}

.log-viewer__files {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.log-viewer__file {
  gap: 8px;
  min-height: 40px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  padding: 8px 10px;
  color: var(--color-text);
  cursor: pointer;
}

.log-viewer__file code {
  margin-left: auto;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
}

.log-viewer__lines {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 360px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-sidebar);
}

.log-viewer__line {
  min-height: 28px;
  gap: 10px;
  padding: 5px 10px;
  color: var(--color-text-sidebar);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.log-viewer__line span {
  width: 38px;
  color: var(--color-text-sidebar-muted);
  font-variant-numeric: tabular-nums;
}

.log-viewer__line strong {
  width: 48px;
  font-size: 11px;
}

.log-viewer__line code {
  white-space: pre-wrap;
  color: inherit;
}

.log-viewer__line--error strong {
  color: color-mix(in srgb, var(--color-danger) 58%, var(--color-text-inverse));
}

.log-viewer__line--warn strong {
  color: color-mix(in srgb, var(--color-warning) 62%, var(--color-text-inverse));
}

.log-viewer__line--info strong {
  color: color-mix(in srgb, var(--color-info) 62%, var(--color-text-inverse));
}

.log-viewer__empty {
  min-height: 96px;
  display: grid;
  place-items: center;
  gap: 8px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  background: var(--color-surface-0);
}
</style>
