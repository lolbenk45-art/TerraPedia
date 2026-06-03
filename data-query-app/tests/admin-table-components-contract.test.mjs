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
  const css = read('assets/css/main.css')

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
  assert.match(shell, /\$slots\.pagination && !loading && !error && !empty/)
  assert.match(shell, /role="status"/)
  assert.match(css, /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.admin-table-shell__header\s*\{[\s\S]*flex-direction:\s*column/)
  assert.match(css, /\.admin-table-shell__meta\s*\{[\s\S]*flex-wrap:\s*wrap[\s\S]*white-space:\s*normal/)
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

test('app pagination supports disabling all interactions during page loads', () => {
  const pagination = read('components/AppPagination.vue')
  const armorPage = read('pages/operations/armor-attributes.vue')

  assert.match(pagination, /disabled\?:\s*boolean/)
  assert.match(pagination, /disabled:\s*false/)
  assert.match(pagination, /:disabled="disabled \|\| currentPage <= 1"/)
  assert.match(pagination, /:disabled="disabled \|\| token\.type === 'ellipsis'"/)
  assert.match(pagination, /:disabled="disabled \|\| currentPage >= normalizedTotalPages"/)
  assert.match(pagination, /:disabled="disabled"/)
  assert.match(pagination, /if \(props\.disabled \|\| !normalizedTotalPages\.value\) return/)
  assert.match(pagination, /if \(props\.disabled\) return/)
  assert.match(armorPage, /<AppPagination[\s\S]*:disabled="loading"/)
})
