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
      <template v-for="file in files" :key="file.path">
        <button
          v-if="file.previewable"
          type="button"
          :class="['log-viewer__file', `log-viewer__file--${file.statusTone || 'neutral'}`]"
          :title="file.path"
          @click="$emit('preview', file.path)"
        >
          <FileText :size="15" />
          <span>{{ file.title || file.label || '运行日志' }}</span>
          <small>{{ file.statusLabel || '可读取' }}</small>
          <small v-if="file.timeLabel" class="log-viewer__file-time">{{ file.timeLabel }}</small>
          <code>{{ file.path }}</code>
        </button>
        <div v-else :class="['log-viewer__file', 'log-viewer__file--readonly', `log-viewer__file--${file.statusTone || 'neutral'}`]" :title="file.path">
          <FileText :size="15" />
          <span>{{ file.title || file.label || '运行日志' }}</span>
          <small>{{ file.statusLabel || '路径记录' }}</small>
          <small v-if="file.timeLabel" class="log-viewer__file-time">{{ file.timeLabel }}</small>
          <code>{{ file.path }}</code>
        </div>
      </template>
    </div>

    <div v-if="loading" class="log-viewer__empty">
      <TerminalSquare :size="22" />
      <span>加载日志内容中…</span>
    </div>
    <ol v-else-if="filteredLines.length" class="log-viewer__lines">
      <li
        v-for="line in filteredLines"
        :key="line.lineNumber"
        :class="['log-viewer__line', `log-viewer__line--${line.level.toLowerCase()}`]"
      >
        <span class="log-viewer__no">{{ line.lineNumber }}</span>
        <strong>{{ line.level }}</strong>
        <code>{{ line.text }}</code>
      </li>
    </ol>
    <div v-else class="log-viewer__empty">
      <TerminalSquare :size="22" />
      <span>{{ emptyMessage }}</span>
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
  files?: Array<{ label?: string, title?: string, statusLabel?: string, statusTone?: string, timeLabel?: string, previewable?: boolean, path: string }>
  loading?: boolean
}>()

const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'OTHER']
const selectedLevels = ref<Array<string>>(['ERROR', 'WARN', 'INFO', 'DEBUG', 'OTHER'])
const search = ref('')
const files = computed(() => Array.isArray(props.files) ? props.files : [])
const content = computed(() => props.content || '')
const emptyMessage = computed(() => {
  if (content.value) return '没有匹配的日志行'
  if (!files.value.length) return '暂无可读取日志文件'
  return '点击上方日志文件，在此内联查看内容'
})
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
  width: 100%;
  min-width: 0;
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
  min-width: 0;
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
  width: 100%;
  min-width: 0;
}

.log-viewer__file {
  gap: 8px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 40px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-surface-1);
  padding: 8px 10px;
  color: var(--color-text);
  cursor: pointer;
}

.log-viewer__file--readonly {
  cursor: default;
  color: var(--color-text-secondary);
}

.log-viewer__file span,
.log-viewer__file small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-viewer__file span {
  flex: 0 1 auto;
  font-weight: 700;
}

.log-viewer__file small {
  flex: 0 0 auto;
  max-width: 112px;
  border-radius: var(--radius-full);
  background: var(--color-primary-muted);
  color: var(--color-primary-dark);
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
}

.log-viewer__file-time {
  max-width: 160px;
  font-variant-numeric: tabular-nums;
}

.log-viewer__file--neutral small {
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.log-viewer__file--success small {
  background: var(--color-success-muted);
  color: var(--color-success);
}

.log-viewer__file--warning small {
  background: var(--color-warning-muted);
  color: var(--color-warning);
}

.log-viewer__file--danger small {
  background: var(--color-danger-muted);
  color: var(--color-danger);
}

.log-viewer__file code {
  margin-left: auto;
  min-width: 0;
  max-width: 60%;
  flex: 1 1 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
}

.log-viewer__lines {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  padding: 6px 0;
  list-style: none;
  max-height: min(60vh, 520px);
  overflow: auto;
  border: 1px solid #2b3a36;
  border-radius: var(--radius-md);
  /* 柔和的深青灰控制台底色，比纯黑更耐看 */
  background: #1b2320;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Consolas, monospace;
}

.log-viewer__line {
  align-items: flex-start;
  min-height: 24px;
  gap: 10px;
  padding: 3px 12px;
  color: #eef5f1;
  font-size: 12px;
  line-height: 1.65;
}

.log-viewer__no {
  flex: 0 0 auto;
  width: 40px;
  text-align: right;
  color: #9db0a9;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.log-viewer__line strong {
  flex: 0 0 auto;
  width: 46px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #b8c8c1;
}

.log-viewer__line code {
  min-width: 0;
  flex: 1 1 auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #edf5f1;
}

/* 级别配色：柔和不刺眼，仅错误行加极淡底色引导视线 */
.log-viewer__line--error {
  background: rgba(220, 38, 38, 0.1);
}

.log-viewer__line--error strong {
  color: #f0968c;
}

.log-viewer__line--warn strong {
  color: #e2b06a;
}

.log-viewer__line--info strong {
  color: #6bb2a6;
}

.log-viewer__line--debug strong {
  color: #91a4bc;
}

.log-viewer__line--debug code {
  color: #dbe7ef;
}

.log-viewer__line--other strong {
  color: #d7e1dc;
}

.log-viewer__line--other code {
  color: #f3faf6;
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
