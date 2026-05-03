import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('data source acceptance page consumes the read-only overview API', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /definePageMeta\(\{\s*title:\s*'数据源验收'/)
  assert.match(page, /get<.*DataSourceAcceptanceOverview/)
  assert.match(page, /\/admin\/data-source-acceptance\/overview/)
  assert.match(page, /overallStatus/)
  assert.deepEqual(readPanelItemKeys(page), [
    'relationHealth',
    'replacementReadiness',
    'sourceDatasetLanding',
    'sourceGroupAudit',
    'imageReadiness',
    'crawlerMonitor',
    'entitySourceCoverage',
  ])
})

test('data source acceptance page keeps the admin surface read-only and typed', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.doesNotMatch(page, /\b(post|put|patch|del)\s*\(/)
  assert.doesNotMatch(page, /\(response as any\)/)
  assert.doesNotMatch(page, /catch\s*\(\s*error:\s*any\s*\)/)
  assert.doesNotMatch(page, /ShieldAlert/)
  assert.match(page, /DataSourceAcceptanceOverviewResponse/)
  assert.match(page, /get<DataSourceAcceptanceOverviewResponse>/)
})

test('data source acceptance page exposes blocking and warning reasons', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /blockingReasons/)
  assert.match(page, /warningReasons/)
  assert.match(page, /acceptance-reasons/)
  assert.match(page, /statusTone/)
  assert.match(page, /reportPath/)
})

test('data source acceptance page separates API errors from missing evidence', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /v-else-if="loadError && !overview"/)
  assert.match(page, /role="alert"/)
  assert.match(page, /v-else-if="!overview"/)
  assert.match(page, /暂无验收数据/)
  assert.match(page, /<template v-else>/)
})

test('data source acceptance page separates loading from missing evidence', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /hasLoaded/)
  assert.match(page, /isInitialLoading/)
  assert.match(page, /加载中/)
  assert.match(page, /loading-panel/)
})

test('data source acceptance page does not truncate evidence rows', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /v-for="check in item\.panel\.checks"/)
  assert.match(page, /v-for="path in item\.panel\.sampleReportPaths"/)
  assert.match(page, /rawSummaryRows\(item\.panel\)/)
  assert.doesNotMatch(page, /\.slice\s*\(/)
})

test('data source acceptance page renders raw summary and sample report evidence', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /sampleReportPaths/)
  assert.match(page, /rawSummaryRows/)
  assert.match(page, /rawSummaryValue/)
  assert.match(page, /raw-summary-list/)
})

test('data source acceptance types preserve panel checks and metrics', () => {
  const types = read('data-query-app/types/dataSourceAcceptance.ts')

  assert.match(types, /export interface DataSourceAcceptanceOverview/)
  assert.match(types, /overallStatus\?: AcceptanceStatus/)
  assert.match(types, /export interface DataSourceAcceptancePanel/)
  assert.match(types, /checks\?: DataSourceAcceptanceCheck\[\]/)
  assert.match(types, /metrics\?: Record<string, unknown>/)
})

test('operations navigation includes the data source acceptance route', () => {
  const layout = read('data-query-app/layouts/default.vue')

  assert.match(layout, /ShieldCheck/)
  assert.match(layout, /path:\s*'\/operations\/data-source-acceptance'/)
  assert.match(layout, /name:\s*'数据源验收'/)
})

function readPanelItemKeys(page) {
  const match = page.match(/const panelItems = computed\(\(\) => \[([\s\S]*?)\]\)/)
  assert.ok(match, 'panelItems computed array should be present')
  return [...match[1].matchAll(/key:\s*'([^']+)'/g)].map((item) => item[1])
}
