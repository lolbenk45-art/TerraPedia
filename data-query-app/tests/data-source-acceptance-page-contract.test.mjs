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
  assert.doesNotMatch(page, /item\.panel\.checks\.slice\s*\(/)
  assert.doesNotMatch(page, /item\.panel\.sampleReportPaths\.slice\s*\(/)
})

test('data source acceptance page renders raw summary and sample report evidence', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /sampleReportPaths/)
  assert.match(page, /rawSummaryRows/)
  assert.match(page, /rawSummaryValue/)
  assert.match(page, /raw-summary-list/)
})

test('data source acceptance page renders generator command guidance without writes', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /generatorCommand/)
  assert.match(page, /requiresDatabase/)
  assert.match(page, /writesDatabase/)
  assert.match(page, /notes/)
  assert.match(page, /generator-command/)
  assert.doesNotMatch(page, /navigator\.clipboard/)
  assert.doesNotMatch(page, /document\.execCommand/)
})

test('data source acceptance page renders backend freshness and next evidence guidance', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /freshnessStatus/)
  assert.match(page, /freshnessReason/)
  assert.match(page, /staleAfterHours/)
  assert.match(page, /ageHours/)
  assert.match(page, /nextEvidenceCommand/)
  assert.match(page, /freshness-block/)
  assert.match(page, /next-evidence-command/)
  assert.match(page, /item\.panel\.nextEvidenceCommand/)
  assert.doesNotMatch(page, /Date\.now\(/)
  assert.doesNotMatch(page, /ageHours\s*[<>]=?\s*.*staleAfterHours/)
  assert.doesNotMatch(page, /staleAfterHours\s*[<>]=?\s*.*ageHours/)
  assert.doesNotMatch(page, /@click=["'][^"']*nextEvidenceCommand/)
})

test('data source acceptance page renders failure samples from overview only', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /failureSamples/)
  assert.match(page, /sampleSource/)
  assert.match(page, /notGateEvidence/)
  assert.match(page, /panelSamples/)
  assert.doesNotMatch(page, /\/admin\/data-source-acceptance\/panels\/\$\{.*\}\/samples/)
  assert.doesNotMatch(page, /runCommand|applyCommand|crawlerCommand/i)
})

test('data source acceptance page displays manual plan-only execution policy fields', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /executeMode/)
  assert.match(page, /executionPolicy/)
  assert.match(page, /executionMeta\(item\.panel\)/)
  assert.match(page, /execution-policy/)
})

test('data source acceptance page keeps check messages and report paths visible together', () => {
  const page = read('data-query-app/pages/operations/data-source-acceptance.vue')

  assert.match(page, /check\.message/)
  assert.match(page, /check\.reportPath/)
  assert.doesNotMatch(page, /check\.message\s*\|\|\s*check\.reportPath/)
})

test('data source acceptance types preserve panel checks and metrics', () => {
  const types = read('data-query-app/types/dataSourceAcceptance.ts')

  assert.match(types, /export interface DataSourceAcceptanceOverview/)
  assert.match(types, /overallStatus\?: AcceptanceStatus/)
  assert.match(types, /export interface DataSourceAcceptancePanel/)
  assert.match(types, /generatorCommand\?: string \| null/)
  assert.match(types, /requiresDatabase\?: boolean \| null/)
  assert.match(types, /writesDatabase\?: boolean \| null/)
  assert.match(types, /notes\?: string \| null/)
  assert.match(types, /freshnessStatus\?: string \| null/)
  assert.match(types, /freshnessReason\?: string \| null/)
  assert.match(types, /staleAfterHours\?: number \| null/)
  assert.match(types, /ageHours\?: number \| null/)
  assert.match(types, /nextEvidenceCommand\?: string \| null/)
  assert.match(types, /executeMode\?: string \| null/)
  assert.match(types, /executionPolicy\?: string \| null/)
  assert.match(types, /checks\?: DataSourceAcceptanceCheck\[\]/)
  assert.match(types, /metrics\?: Record<string, unknown>/)
  assert.match(types, /export interface DataSourceAcceptanceFailureSample/)
  assert.match(types, /failureSamples\?: DataSourceAcceptanceFailureSample\[\]/)
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
