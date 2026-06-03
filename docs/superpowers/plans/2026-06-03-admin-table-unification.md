# Admin Table Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable admin table foundation and migrate the armor attributes admin page onto it without changing backend APIs or data semantics.

**Architecture:** Add a thin `AdminTableShell` for card/state/pagination structure and an `AdminDataTable` for column-driven readonly table markup with slots for special cells. Move stable table visual rules from page-scoped implementations into `assets/css/main.css`, then migrate `armor-attributes.vue` while preserving its current fields, filters, detail drawer, and read-only API contract.

**Tech Stack:** Nuxt 4, Vue 3 SFCs, TypeScript, existing Node contract tests under `data-query-app/tests`, existing `AppPagination`.

---

## Scope

In scope:
- Add `data-query-app/components/AdminTableShell.vue`.
- Add `data-query-app/components/AdminDataTable.vue`.
- Add `data-query-app/types/admin-table.ts`.
- Extend `data-query-app/assets/css/main.css` with reusable admin table and cell styles.
- Update `data-query-app/pages/operations/armor-attributes.vue` to use the new components and `AppPagination`.
- Update or add contract tests for the new components and armor attributes page.

Out of scope:
- No backend API changes.
- No database writes.
- No broad migration of `items.vue`, `entities/[type].vue`, or `audio-assets.vue`.
- Do not modify `data-query-app/pages/operations/audio-assets.vue`, `data-query-app/pages/entities/[type].vue`, or `data-query-app/pages/items.vue`.
- No rewrite of audio playback logic.
- No migration of armor attributes into the CRUD entity route.

## Success Criteria

- Armor attributes page uses `AdminTableShell`, `AdminDataTable`, and `AppPagination`.
- Armor attributes page remains read-only and still calls:
  - `/admin/armor-attributes/summary`
  - `/admin/armor-attributes`
  - `/admin/armor-attributes/${row.itemId}`
- The table keeps the existing visible column order:
  - 装备, 部位, 阶段, 防御, meleeDamage, meleeCritChance, classSpecific, 效果数, 来源修订, 操作
- Special fields stay page-owned through slots:
  - item primary cell
  - enum labels
  - `rawCells` keys
  - disabled detail action
- The detail drawer still shows 基础字段, Raw Cells, and 结构化效果.
- Contract tests prevent returning to page-local hand-written pagination/state/table scaffolding.

## File Responsibilities

- `data-query-app/components/AdminTableShell.vue`
  - Owns admin table card layout, heading, subtitle, meta slot, loading/error/empty states, default table slot, and pagination slot.
  - Does not know rows, columns, API, or business fields.

- `data-query-app/components/AdminDataTable.vue`
  - Owns semantic table markup from column definitions.
  - Accepts `columns`, `rows: unknown[]`, `rowKey`, `minWidth`, optional row class callback.
  - Provides named cell slots as `cell:<column.key>` and a fallback text renderer.
  - Does not fetch data, paginate, filter, or mutate rows.

- `data-query-app/types/admin-table.ts`
  - Owns shared table column and row callback types so pages do not import types from an SFC.

- `data-query-app/assets/css/main.css`
  - Owns stable shared table visuals under the `.admin-table-*` / `.admin-data-table*` namespace.
  - Does not add stronger generic `.cell-primary`, `.status-badge`, `.path-token`, `.table-scroll`, or `.data-table` rules that could affect existing pages.
  - Keeps page-specific min-width and business-specific classes in pages.

- `data-query-app/pages/operations/armor-attributes.vue`
  - Owns filters, API calls, row/detail state, column configuration, special cell slots, and detail drawer content.
  - Reuses common table components and pagination.

- `data-query-app/tests/admin-table-components-contract.test.mjs`
  - Locks component API and reusable class names.

- `data-query-app/tests/admin-armor-attributes-page-contract.test.mjs`
  - Locks the armor attributes migration and read-only behavior.

---

### Task 1: Contract Tests

**Files:**
- Create: `data-query-app/types/admin-table.ts`
- Create: `data-query-app/tests/admin-table-components-contract.test.mjs`
- Modify: `data-query-app/tests/admin-armor-attributes-page-contract.test.mjs`

- [ ] **Step 1: Add failing component contract tests**

Create `data-query-app/tests/admin-table-components-contract.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

test('admin table shell owns reusable card states and pagination slot', () => {
  const shell = read('components/AdminTableShell.vue')

  assert.match(shell, /defineProps<\{[\s\S]*title:\s*string/)
  assert.match(shell, /subtitle\?:\s*string/)
  assert.match(shell, /loading\?:\s*boolean/)
  assert.match(shell, /error\?:\s*string/)
  assert.match(shell, /empty\?:\s*boolean/)
  assert.match(shell, /emptyTitle\?:\s*string/)
  assert.match(shell, /emptyDescription\?:\s*string/)
  assert.match(shell, /<section class="section-card table-card admin-table-shell"/)
  assert.match(shell, /<slot name="meta"/)
  assert.match(shell, /<slot name="pagination"/)
  assert.match(shell, /admin-table-state/)
  assert.match(shell, /admin-table-state--error/)
  assert.match(shell, /AppEmptyState/)
})

test('admin data table is column driven and exposes cell slots without forcing page casts', () => {
  const table = read('components/AdminDataTable.vue')
  const types = read('types/admin-table.ts')

  assert.match(types, /export interface AdminTableColumn/)
  assert.match(types, /key:\s*string/)
  assert.match(types, /label:\s*string/)
  assert.match(types, /class\?:\s*string/)
  assert.match(types, /headerClass\?:\s*string/)
  assert.match(types, /export type AdminTableRowKey/)
  assert.match(table, /import type \{ AdminTableColumn, AdminTableRowClass, AdminTableRowKey \}/)
  assert.match(table, /defineProps<\{[\s\S]*columns:\s*AdminTableColumn\[\]/)
  assert.match(table, /rows:\s*unknown\[\]/)
  assert.match(table, /rowKey:\s*AdminTableRowKey/)
  assert.match(table, /minWidth\?:\s*string/)
  assert.match(table, /<table class="data-table admin-data-table"/)
  assert.match(table, /v-for="column in columns"/)
  assert.match(table, /:name="`cell:\$\{column\.key\}`"/)
  assert.match(table, /formatCellValue/)
  assert.doesNotMatch(table, /Record<string,\s*unknown>\[\]/)
})

test('admin table CSS is namespaced to avoid changing existing pages', () => {
  const css = read('assets/css/main.css')

  assert.match(css, /\.admin-data-table-scroll\s*\{[\s\S]*overflow-x:\s*auto/)
  assert.match(css, /\.admin-data-table\s*\{[\s\S]*border-collapse:\s*collapse/)
  assert.match(css, /\.admin-data-table th,\s*\n\.admin-data-table td\s*\{[\s\S]*vertical-align:\s*middle/)
  assert.match(css, /\.admin-table-primary\s*\{[\s\S]*display:\s*grid/)
  assert.match(css, /\.admin-table-badges\s*\{[\s\S]*flex-wrap:\s*wrap/)
  assert.match(css, /\.admin-table-badge--accent/)
  assert.match(css, /\.admin-table-token\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(css, /\.cell-primary\s*\{[\s\S]*display:\s*grid/)
  assert.doesNotMatch(css, /\.status-badge--success\s*\{[\s\S]*color:\s*var\(--color-primary\)/)
})
```

- [ ] **Step 2: Update armor attributes contract to require the shared table path**

In `data-query-app/tests/admin-armor-attributes-page-contract.test.mjs`, extend `armor attributes admin page renders concrete fields instead of prose-only data` with:

```js
  assert.match(page, /<AdminTableShell/)
  assert.match(page, /<AdminDataTable/)
  assert.match(page, /<AppPagination/)
  assert.match(page, /armorAttributeColumns/)
  assert.match(page, /name="cell:item"/)
  assert.match(page, /name="cell:meleeDamage"/)
  assert.match(page, /rawCell\(armorRow\(row\), 'meleeDamage'\)/)
  assert.match(page, /rawCell\(armorRow\(row\), 'meleeCritChance'\)/)
  assert.match(page, /rawCell\(armorRow\(row\), 'classSpecific'\)/)
  assert.match(page, /name="cell:actions"/)
  assert.match(page, /:disabled="!armorRow\(row\)\.itemId"/)
  assert.match(page, /@change="goPage"/)
  assert.match(page, /role="dialog"/)
  assert.match(page, /aria-modal="true"/)
  assert.match(page, /aria-labelledby="armor-attribute-detail-title"/)
  assert.doesNotMatch(page, /<table class="data-table armor-attribute-table">/)
  assert.doesNotMatch(page, /class="pagination-row"/)
```

Keep these existing checks because detail content must remain:

```js
  assert.match(page, /raw-cell-grid/)
  assert.match(page, /effect-table/)
  assert.match(page, /detail-drawer/)
```

- [ ] **Step 3: Run tests and confirm RED**

Run:

```bash
cd data-query-app && pnpm run test:unit
```

Expected: FAIL because `AdminTableShell.vue`, `AdminDataTable.vue`, and migration markers do not exist yet.

---

### Task 2: Shared Components and CSS

**Files:**
- Create: `data-query-app/types/admin-table.ts`
- Create: `data-query-app/components/AdminTableShell.vue`
- Create: `data-query-app/components/AdminDataTable.vue`
- Modify: `data-query-app/assets/css/main.css`

- [ ] **Step 1: Implement shared table types**

Create `data-query-app/types/admin-table.ts`:

```ts
export interface AdminTableColumn {
  key: string
  label: string
  class?: string
  headerClass?: string
}

export type AdminTableRowKey = string | ((row: unknown, index: number) => string | number)
export type AdminTableRowClass = (row: unknown, index: number) => string | string[] | Record<string, boolean> | undefined
```

- [ ] **Step 2: Implement `AdminTableShell.vue`**

Create `data-query-app/components/AdminTableShell.vue`:

```vue
<template>
  <section class="section-card table-card admin-table-shell">
    <div class="section-card__header admin-table-shell__header">
      <div>
        <h2 class="section-card__title">{{ title }}</h2>
        <p v-if="subtitle" class="section-card__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.meta" class="table-meta">
        <slot name="meta" />
      </div>
    </div>

    <div v-if="error" class="admin-table-state admin-table-state--error" role="alert">{{ error }}</div>
    <div v-else-if="loading" class="admin-table-state" aria-live="polite">{{ loadingText }}</div>
    <AppEmptyState
      v-else-if="empty"
      :title="emptyTitle"
      :description="emptyDescription"
    />
    <slot v-else />

    <div v-if="$slots.pagination && !loading && !error && !empty" class="admin-table-shell__pagination">
      <slot name="pagination" />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  subtitle?: string
  loading?: boolean
  loadingText?: string
  error?: string
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  subtitle: '',
  loading: false,
  loadingText: '加载中...',
  error: '',
  empty: false,
  emptyTitle: '暂无数据',
  emptyDescription: '调整筛选条件后再试。'
})
</script>
```

- [ ] **Step 3: Implement `AdminDataTable.vue`**

Create `data-query-app/components/AdminDataTable.vue`:

```vue
<template>
  <div class="table-scroll admin-data-table-scroll">
    <table class="data-table admin-data-table" :style="tableStyle">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="column.headerClass"
            :scope="'col'"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIndex) in rows"
          :key="resolveRowKey(row, rowIndex)"
          :class="rowClass ? rowClass(row, rowIndex) : undefined"
        >
          <td
            v-for="column in columns"
            :key="column.key"
            :class="column.class"
          >
            <slot
              :name="`cell:${column.key}`"
              :row="row"
              :column="column"
              :value="getCellValue(row, column.key)"
              :index="rowIndex"
            >
              {{ formatCellValue(getCellValue(row, column.key)) }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { AdminTableColumn, AdminTableRowClass, AdminTableRowKey } from '~/types/admin-table'

const props = defineProps<{
  columns: AdminTableColumn[]
  rows: unknown[]
  rowKey: AdminTableRowKey
  minWidth?: string
  rowClass?: AdminTableRowClass
}>()

const tableStyle = computed<CSSProperties>(() => (
  props.minWidth ? { minWidth: props.minWidth } : {}
))

function asRecord(row: unknown) {
  return row && typeof row === 'object' ? row as Record<string, unknown> : {}
}

function resolveRowKey(row: unknown, index: number) {
  if (typeof props.rowKey === 'function') return props.rowKey(row, index)
  const value = asRecord(row)[props.rowKey]
  return typeof value === 'string' || typeof value === 'number' ? value : index
}

function getCellValue(row: unknown, key: string) {
  return key.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part]
    }
    return undefined
  }, row)
}

function formatCellValue(value: unknown) {
  if (value == null || value === '') return '--'
  if (typeof value === 'number') return value.toLocaleString('zh-CN')
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}
</script>
```

- [ ] **Step 4: Extend namespaced admin table CSS**

Append namespaced admin table rules in `data-query-app/assets/css/main.css`. Do not replace or strengthen the existing generic `.table-scroll`, `.data-table`, `.cell-primary`, `.status-badge`, or `.path-token` rules.

```css
.admin-data-table-scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: calc(var(--radius-lg) - 2px);
  background: var(--color-bg-secondary);
}

.admin-data-table {
  width: 100%;
  line-height: 1.45;
  border-collapse: collapse;
}

.admin-data-table th,
.admin-data-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: middle;
}

.admin-data-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--color-text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0;
  white-space: nowrap;
  background: color-mix(in srgb, var(--color-bg-tertiary) 88%, transparent);
}

.admin-data-table tbody tr:hover {
  background: color-mix(in srgb, var(--color-primary) 5%, transparent);
}

.admin-data-table tbody tr:last-child td {
  border-bottom: 0;
}

.admin-table-shell {
  overflow: hidden;
}

.admin-table-shell__pagination {
  padding-top: 16px;
}

.admin-table-state {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  padding: 16px;
}

.admin-table-state--error {
  color: var(--color-danger);
}

.admin-table-primary {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.admin-table-primary strong,
.admin-table-primary span,
.admin-table-primary small,
.admin-table-primary code {
  min-width: 0;
  overflow-wrap: anywhere;
}

.admin-table-primary span,
.admin-table-primary small {
  color: var(--color-text-secondary);
}

.admin-table-token {
  display: inline-block;
  max-width: 100%;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
  white-space: normal;
}

.admin-table-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.admin-table-badge {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-secondary) 88%, transparent);
  color: var(--color-text-secondary);
  padding: 4px 8px;
  font-size: 0.76rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.admin-table-badge--accent {
  border-color: color-mix(in srgb, var(--color-primary) 24%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-secondary));
  color: var(--color-primary);
}

.admin-table-badge--warning {
  border-color: color-mix(in srgb, var(--color-warning) 28%, var(--color-border));
  background: color-mix(in srgb, var(--color-warning) 12%, var(--color-bg-secondary));
  color: var(--color-warning);
}

.admin-table-badge--danger {
  border-color: color-mix(in srgb, var(--color-danger) 28%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg-secondary));
  color: var(--color-danger);
}

.admin-table-number,
.admin-table-time {
  white-space: nowrap;
}
```

- [ ] **Step 5: Run component contract tests**

Run:

```bash
cd data-query-app && node --test tests/admin-table-components-contract.test.mjs
```

Expected: PASS for component/CSS contracts.

---

### Task 3: Armor Attributes Migration

**Files:**
- Modify: `data-query-app/pages/operations/armor-attributes.vue`

- [ ] **Step 1: Define column configuration**

Add near script state:

```ts
const armorAttributeColumns = [
  { key: 'item', label: '装备' },
  { key: 'slotGroup', label: '部位' },
  { key: 'sectionCode', label: '阶段' },
  { key: 'defenseValue', label: '防御', class: 'admin-table-number' },
  { key: 'meleeDamage', label: 'meleeDamage' },
  { key: 'meleeCritChance', label: 'meleeCritChance' },
  { key: 'classSpecific', label: 'classSpecific' },
  { key: 'effectCount', label: '效果数', class: 'admin-table-number' },
  { key: 'sourceRevision', label: '来源修订' },
  { key: 'actions', label: '操作' },
]
```

- [ ] **Step 2: Replace the hand-written main table and states**

Replace the current main table card with:

```vue
    <AdminTableShell
      title="单件装备字段"
      subtitle="默认不带关键词过滤，直接读取第一页盔甲属性投影。"
      :loading="loading"
      :error="loadError"
      :empty="!rows.length"
      empty-title="暂无盔甲属性数据"
      empty-description="调整关键词、部位、阶段或字段筛选后再试。"
    >
      <template #meta>
        <span>{{ formatNumber(rows.length) }} / {{ formatNumber(pagination.total) }} 条</span>
        <span>第 {{ pagination.page }} 页</span>
      </template>

      <AdminDataTable
        :columns="armorAttributeColumns"
        :rows="rows as unknown as Record<string, unknown>[]"
        row-key="id"
        min-width="1120px"
      >
        <template #cell:item="{ row }">
          <div class="admin-table-primary">
            <strong>{{ armorRow(row).itemNameZh || armorRow(row).itemPageTitle || '--' }}</strong>
            <span>{{ armorRow(row).itemInternalName || armorRow(row).itemHref || '--' }}</span>
          </div>
        </template>

        <template #cell:slotGroup="{ row }">
          <span class="admin-table-badge">{{ slotLabel(armorRow(row).slotGroup) }}</span>
        </template>

        <template #cell:sectionCode="{ row }">
          <span class="admin-table-badge">{{ sectionLabel(armorRow(row).sectionCode) }}</span>
        </template>

        <template #cell:defenseValue="{ row }">
          {{ valueOrDash(armorRow(row).defenseValue) }}
        </template>

        <template #cell:meleeDamage="{ row }">
          {{ rawCell(armorRow(row), 'meleeDamage') }}
        </template>

        <template #cell:meleeCritChance="{ row }">
          {{ rawCell(armorRow(row), 'meleeCritChance') }}
        </template>

        <template #cell:classSpecific="{ row }">
          {{ rawCell(armorRow(row), 'classSpecific') }}
        </template>

        <template #cell:sourceRevision="{ row }">
          <div class="admin-table-primary">
            <span>{{ armorRow(row).sourcePage || '--' }}</span>
            <code class="admin-table-token">{{ armorRow(row).sourceRevisionTimestamp || '--' }}</code>
          </div>
        </template>

        <template #cell:actions="{ row }">
          <div class="row-actions">
            <button type="button" class="btn-link" :disabled="!armorRow(row).itemId" @click="openDetail(armorRow(row))">详情</button>
          </div>
        </template>
      </AdminDataTable>

      <template #pagination>
        <AppPagination
          :page="pagination.page"
          :total="pagination.total"
          :total-pages="pagination.totalPages || 1"
          @change="goPage"
        />
      </template>
    </AdminTableShell>
```

- [ ] **Step 3: Add row cast helper**

Add:

```ts
function armorRow(row: Record<string, unknown>) {
  return row as unknown as ArmorAttributeRow
}
```

- [ ] **Step 4: Keep detail table on global table visuals**

Keep the detail effect table markup, but make sure it remains:

```vue
<table class="data-table effect-table">
```

This keeps the existing contract and reuses the new global `.data-table` visual baseline.

- [ ] **Step 5: Remove obsolete scoped styles**

Remove scoped styles that are replaced by global/shared components:
- `.table-card`
- `.table-meta`
- `.table-scroll`
- `.armor-attribute-table`
- `.armor-attribute-table td strong`
- `.armor-attribute-table td small`
- `.armor-attribute-table td span`
- `.armor-attribute-table td small`
- `.state-panel`
- `.state-panel--error`
- `.pagination-row`

Keep page-specific styles:
- `.armor-attributes-admin`
- `.filter-panel`
- `.filter-grid`
- `.field`
- `.field__label`
- `.input`
- `.filter-actions`
- `.btn-link`
- `.detail-drawer`
- `.detail-drawer__panel`
- `.detail-drawer__head`
- `.detail-section`
- `.fact-grid`
- `.raw-cell-grid`
- responsive filter/detail rules
- `.effect-table { min-width: 1080px; }`

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd data-query-app && node --test tests/admin-table-components-contract.test.mjs tests/admin-armor-attributes-page-contract.test.mjs
```

Expected: PASS.

---

### Task 4: Validation and Review

**Files:**
- Review all changed files.

- [ ] **Step 1: Run admin unit contracts**

Run:

```bash
cd data-query-app && node --test tests/admin-table-components-contract.test.mjs tests/admin-armor-attributes-page-contract.test.mjs tests/audio-assets-page-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run all admin unit contracts**

Run:

```bash
cd data-query-app && pnpm run test:unit
```

Expected: PASS.

- [ ] **Step 3: Run admin typecheck**

Run:

```bash
cd data-query-app && pnpm run check
```

Expected: PASS.

- [ ] **Step 4: Runtime smoke armor attributes**

Run or reuse the local admin stack, then open `/operations/armor-attributes`.

Verify:
- The table card uses the new shared shell.
- Column order is unchanged.
- `AppPagination` renders below the table and changes pages through `goPage`.
- Detail still opens only for rows with `itemId`.
- The detail drawer keeps `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="armor-attribute-detail-title"`.
- Loading, empty, and error states do not show stale pagination.

- [ ] **Step 5: Inspect git scope**

Run:

```bash
git status --short
git diff -- data-query-app/types/admin-table.ts data-query-app/components/AdminTableShell.vue data-query-app/components/AdminDataTable.vue data-query-app/assets/css/main.css data-query-app/pages/operations/armor-attributes.vue data-query-app/tests/admin-table-components-contract.test.mjs data-query-app/tests/admin-armor-attributes-page-contract.test.mjs
git diff --exit-code -- data-query-app/pages/operations/audio-assets.vue data-query-app/pages/entities/[type].vue data-query-app/pages/items.vue
```

Expected: only planned files are modified, and protected pages are unchanged.

- [ ] **Step 6: Final multi-agent review**

Dispatch one reviewer for UI/component architecture and one reviewer for regression/test coverage. Fix any concrete issues, then rerun the focused validation commands.
