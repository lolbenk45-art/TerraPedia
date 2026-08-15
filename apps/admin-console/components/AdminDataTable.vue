<template>
  <div class="table-scroll admin-data-table-scroll">
    <table class="data-table admin-data-table" :style="tableStyle">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="column.headerClass"
            scope="col"
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
