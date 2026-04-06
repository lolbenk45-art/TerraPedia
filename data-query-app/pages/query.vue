<template>
  <div class="page-wrap query-page">
    <div class="page-head">
      <div>
        <h1 class="page-head__title">数据查询</h1>
        <p class="page-head__subtitle">用于调试与预览结构的只读 SQL 工作台</p>
      </div>
    </div>

    <div class="query-grid">
      <section class="section-card query-side">
        <div class="section-card__header query-side__header">
          <div>
            <h3 class="section-card__title">数据表</h3>
            <p class="query-side__meta">{{ databaseName || 'mock_database' }}</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="loadingTables" @click="loadTables">
            {{ loadingTables ? '刷新中...' : '刷新' }}
          </button>
        </div>

        <div v-if="loadingTables" class="loading-placeholder">加载中...</div>
        <div v-else-if="tables.length" class="table-list">
          <button
            v-for="table in tables"
            :key="table.name"
            type="button"
            class="table-list__item"
            :class="{ 'table-list__item--active': selectedTable === table.name }"
            @click="selectTable(table.name)"
          >
            <span class="table-list__name">{{ table.name }}</span>
            <span class="table-list__count">{{ table.columns.length }} columns</span>
          </button>
        </div>
        <AppEmptyState
          v-else
          icon="🗂️"
          title="暂无表结构"
          description="当前没有可展示的数据表结构。"
          primary-text="重新加载"
          @primary="loadTables"
        />
      </section>

      <section class="query-main">
        <div class="section-card">
          <div class="section-card__header query-editor__header">
            <div>
              <h3 class="section-card__title">SQL 编辑器</h3>
              <p class="query-side__meta">当前仅允许 SELECT / SHOW / DESCRIBE 只读语句</p>
            </div>
            <div class="query-editor__actions">
              <label class="query-editor__timeout">
                <span>超时</span>
                <input v-model.number="timeoutSeconds" type="number" class="input" min="1" max="120" />
              </label>
              <button type="button" class="btn btn-secondary" @click="resetSql">重置</button>
              <button type="button" class="btn btn-primary" :disabled="runningQuery" @click="runQuery">
                {{ runningQuery ? '执行中...' : '执行查询' }}
              </button>
            </div>
          </div>

          <div class="query-editor__presets">
            <button
              v-for="preset in presets"
              :key="preset.label"
              type="button"
              class="query-editor__preset"
              @click="applyPreset(preset.sql)"
            >
              {{ preset.label }}
            </button>
          </div>

          <textarea
            v-model="sql"
            class="input input--textarea query-editor__textarea"
            rows="8"
            spellcheck="false"
            placeholder="SELECT id, name, category_id, created_at FROM items LIMIT 10"
          />

          <p class="query-editor__notice">
            当前页面使用管理端内置 mock API，只用于验证数据查询工作台的交互闭环，不会写入真实数据库。
          </p>
        </div>

        <div class="query-result-grid">
          <section class="section-card">
            <div class="section-card__header">
              <div>
                <h3 class="section-card__title">查询结果</h3>
                <p class="query-result__meta">
                  <span>Rows: {{ result.rowCount }}</span>
                  <span>Time: {{ result.queryTime }} ms</span>
                </p>
              </div>
            </div>

            <div v-if="queryError" class="query-error">
              <strong>执行失败</strong>
              <p>{{ queryError }}</p>
            </div>
            <div v-else-if="runningQuery" class="loading-placeholder">查询执行中...</div>
            <div v-else-if="result.columns.length && result.rows.length" class="data-table-wrap">
              <table class="data-table query-table">
                <thead>
                  <tr>
                    <th v-for="column in result.columns" :key="column">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, index) in result.rows" :key="index">
                    <td v-for="column in result.columns" :key="column">{{ formatCell(row[column]) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AppEmptyState
              v-else
              icon="🧪"
              title="暂无查询结果"
              description="执行一条只读 SQL 后，这里会展示结果表格。"
              primary-text="执行默认查询"
              @primary="runQuery"
            />
          </section>

          <section class="section-card">
            <div class="section-card__header">
              <div>
                <h3 class="section-card__title">表结构预览</h3>
                <p class="query-side__meta">{{ selectedTable || '未选择表' }}</p>
              </div>
            </div>

            <div v-if="structureLoading" class="loading-placeholder">加载中...</div>
            <div v-else-if="selectedColumns.length" class="structure-list">
              <div v-for="column in selectedColumns" :key="column.Field" class="structure-list__item">
                <span class="structure-list__field">{{ column.Field }}</span>
                <span class="structure-list__type">{{ column.Type }}</span>
              </div>
            </div>
            <AppEmptyState
              v-else
              icon="📐"
              title="暂无结构数据"
              description="选择左侧数据表后，这里会显示字段结构。"
            />

            <div v-if="selectedSampleData.length" class="structure-sample">
              <div class="structure-sample__title">示例数据</div>
              <pre class="structure-sample__code">{{ formattedSampleData }}</pre>
            </div>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { showToast } from '~/composables/useToast'

type TableColumn = {
  Field: string
  Type: string
}

type TableDefinition = {
  name: string
  columns: TableColumn[]
}

type QueryResultState = {
  columns: string[]
  rows: Record<string, any>[]
  rowCount: number
  queryTime: number
}

const tables = ref<TableDefinition[]>([])
const databaseName = ref('')
const selectedTable = ref('items')
const loadingTables = ref(false)
const structureLoading = ref(false)
const runningQuery = ref(false)
const queryError = ref('')
const sql = ref('SELECT id, name, category_id, created_at FROM items LIMIT 10')
const timeoutSeconds = ref(30)
const structureColumns = ref<Record<string, TableColumn[]>>({})
const sampleDataByTable = ref<Record<string, Record<string, any>[]>>({})
const result = ref<QueryResultState>({
  columns: [],
  rows: [],
  rowCount: 0,
  queryTime: 0
})

const presets = [
  { label: 'Items Top 10', sql: 'SELECT id, name, category_id, created_at FROM items LIMIT 10' },
  { label: 'Show Tables', sql: 'SHOW TABLES' },
  { label: 'Describe Items', sql: 'DESCRIBE items' }
]

const selectedColumns = computed(() => structureColumns.value[selectedTable.value] ?? [])
const selectedSampleData = computed(() => sampleDataByTable.value[selectedTable.value] ?? [])
const formattedSampleData = computed(() => JSON.stringify(selectedSampleData.value, null, 2))

async function queryLocalApi<T>(path: string, options?: Parameters<typeof $fetch<T>>[1]) {
  return await $fetch<T>(path, options)
}

function applyPreset(nextSql: string) {
  sql.value = nextSql
}

function resetSql() {
  sql.value = 'SELECT id, name, category_id, created_at FROM items LIMIT 10'
  queryError.value = ''
}

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function loadTables() {
  loadingTables.value = true
  try {
    const response: any = await queryLocalApi('/local-query/tables')
    if (response?.success === false) {
      throw new Error(response.message || '获取表结构失败')
    }

    databaseName.value = String(response?.database ?? 'mock_database')
    tables.value = Array.isArray(response?.tables) ? response.tables : []
    structureColumns.value = Object.fromEntries(
      tables.value.map((table) => [table.name, Array.isArray(table.columns) ? table.columns : []])
    )

    if (!structureColumns.value[selectedTable.value] && tables.value.length) {
      const firstTable = tables.value[0]
      if (firstTable?.name) {
        selectedTable.value = firstTable.name
      }
    }
  } catch (error: any) {
    console.error('Failed to load tables:', error)
    showToast(error?.data?.message || error?.message || '获取表结构失败', 'error')
    tables.value = []
    structureColumns.value = {}
  } finally {
    loadingTables.value = false
  }
}

async function loadItemsStructure() {
  structureLoading.value = true
  try {
    const response: any = await queryLocalApi('/local-query/items-structure')
    if (response?.success === false) {
      throw new Error(response.message || '获取 items 表结构失败')
    }

    if (Array.isArray(response?.columns)) {
      structureColumns.value = {
        ...structureColumns.value,
        items: response.columns.map((field: string) => ({
          Field: field,
          Type: field === 'id' || field.endsWith('_id') ? 'int' : 'varchar'
        }))
      }
    }

    if (Array.isArray(response?.sampleData)) {
      sampleDataByTable.value = {
        ...sampleDataByTable.value,
        items: response.sampleData
      }
    }
  } catch (error: any) {
    console.error('Failed to load item structure:', error)
    showToast(error?.data?.message || error?.message || '获取 items 表结构失败', 'error')
  } finally {
    structureLoading.value = false
  }
}

function selectTable(tableName: string) {
  selectedTable.value = tableName
  if (tableName === 'items' && !sampleDataByTable.value.items?.length) {
    loadItemsStructure()
  }
}

async function runQuery() {
  runningQuery.value = true
  queryError.value = ''
  try {
    const response: any = await queryLocalApi('/local-query/query', {
      method: 'POST',
      body: {
        sql: sql.value,
        timeout: timeoutSeconds.value
      }
    })

    if (response?.success === false) {
      throw new Error(response.message || '执行查询失败')
    }

    result.value = {
      columns: Array.isArray(response?.columns) ? response.columns : [],
      rows: Array.isArray(response?.data) ? response.data : [],
      rowCount: Number(response?.rowCount ?? 0),
      queryTime: Number(response?.queryTime ?? 0)
    }
    showToast('查询执行成功', 'success')
  } catch (error: any) {
    console.error('Failed to run query:', error)
    queryError.value = error?.data?.statusMessage || error?.data?.message || error?.message || '执行查询失败'
    result.value = {
      columns: [],
      rows: [],
      rowCount: 0,
      queryTime: 0
    }
    showToast(queryError.value, 'error')
  } finally {
    runningQuery.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadTables(), loadItemsStructure()])
  await runQuery()
})
</script>

<style scoped>
.query-page {
  animation: queryReveal 0.35s ease backwards;
}

@keyframes queryReveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.query-grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 24px;
}

.query-side {
  align-self: start;
  position: sticky;
  top: 24px;
}

.query-main {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.query-side__header,
.query-editor__header {
  align-items: flex-start;
  gap: 16px;
}

.query-side__meta,
.query-result__meta {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.query-result__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.table-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.table-list__item {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.table-list__item:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
  transform: translateY(-1px);
}

.table-list__item--active {
  border-color: var(--color-primary);
  background: var(--color-primary-muted);
}

.table-list__name {
  display: block;
  font-weight: 700;
  color: var(--color-text);
}

.table-list__count {
  display: block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.query-editor__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.query-editor__timeout {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.query-editor__timeout .input {
  width: 88px;
  min-width: 88px;
}

.query-editor__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.query-editor__preset {
  border: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  border-radius: var(--radius-full);
  padding: 7px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.query-editor__preset:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-dark);
}

.query-editor__textarea {
  min-height: 220px;
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  line-height: 1.6;
}

.query-editor__notice {
  margin: 12px 0 0;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.query-result-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 24px;
}

.query-table {
  min-width: 640px;
}

.query-error {
  border: 1px solid rgba(220, 38, 38, 0.18);
  background: rgba(220, 38, 38, 0.08);
  color: #991b1b;
  border-radius: var(--radius-md);
  padding: 14px 16px;
}

.query-error strong {
  display: block;
  margin-bottom: 4px;
}

.query-error p {
  margin: 0;
  line-height: 1.5;
}

.structure-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.structure-list__item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: 10px 12px;
}

.structure-list__field {
  font-weight: 700;
  color: var(--color-text);
}

.structure-list__type {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  text-align: right;
}

.structure-sample {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border);
}

.structure-sample__title {
  margin-bottom: 10px;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.structure-sample__code {
  margin: 0;
  padding: 14px;
  border-radius: var(--radius-md);
  background: #1c1917;
  color: #f5f5f4;
  font-size: 0.75rem;
  line-height: 1.6;
  overflow: auto;
}

.loading-placeholder {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.btn-sm {
  padding: 7px 12px;
  font-size: 0.8125rem;
}

@media (max-width: 1100px) {
  .query-grid,
  .query-result-grid {
    grid-template-columns: 1fr;
  }

  .query-side {
    position: static;
  }
}

@media (max-width: 768px) {
  .query-editor__actions {
    width: 100%;
  }

  .query-editor__actions > * {
    width: 100%;
  }

  .query-editor__timeout {
    justify-content: space-between;
  }

  .query-editor__timeout .input {
    width: 100px;
  }
}
</style>
