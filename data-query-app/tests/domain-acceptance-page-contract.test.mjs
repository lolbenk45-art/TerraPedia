import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('domain acceptance page consumes the read-only domain overview API', () => {
  const page = read('data-query-app/pages/operations/domain-acceptance.vue')

  assert.match(page, /definePageMeta\(\{\s*title:\s*'B 档域验收'/)
  assert.match(page, /get<.*DomainAcceptanceOverview/)
  assert.match(page, /\/admin\/domain-acceptance\/overview/)
  assert.match(page, /overallStatus/)
  assert.match(page, /overview\?\.domains/)
})

test('domain acceptance page keeps the admin surface read-only and typed', () => {
  const page = read('data-query-app/pages/operations/domain-acceptance.vue')

  assert.doesNotMatch(page, /\b(post|put|patch|del)\s*\(/)
  assert.doesNotMatch(page, /\(response as any\)/)
  assert.doesNotMatch(page, /catch\s*\(\s*error:\s*any\s*\)/)
  assert.match(page, /DomainAcceptanceOverviewResponse/)
  assert.match(page, /get<DomainAcceptanceOverviewResponse>/)
})

test('domain acceptance page renders domains, panels, evidence status, and next commands', () => {
  const page = read('data-query-app/pages/operations/domain-acceptance.vue')

  for (const token of [
    'domain.domainId',
    'domain.domainType',
    'domain.tier',
    'domain.chainStage',
    'domain.managementRoute',
    'domain.publicRoute',
    'domain.requiresDatabase',
    'domain.panels',
    'panel.panelId',
    'panel.chainStage',
    'panel.maintenanceLane',
    'panel.maintenanceLaneId',
    'panel.autoMaintenanceAllowed',
    'panel.blockingBeforePublic',
    'panel.reportPath',
    'panel.reportPattern',
    'panel.freshnessStatus',
    'panel.nextEvidenceCommand',
    'panel.generatorCommand',
    'panel.checks',
    'rawSummaryRows(panel)',
  ]) {
    assert.match(page, new RegExp(escapeRegExp(token)))
  }

  assert.match(page, /domain-card/)
  assert.match(page, /domain-panel/)
  assert.match(page, /next-evidence-command/)
  assert.doesNotMatch(page, /navigator\.clipboard/)
  assert.doesNotMatch(page, /document\.execCommand/)
})

test('domain acceptance page separates API errors from missing evidence', () => {
  const page = read('data-query-app/pages/operations/domain-acceptance.vue')

  assert.match(page, /v-else-if="loadError && !overview"/)
  assert.match(page, /role="alert"/)
  assert.match(page, /v-else-if="!overview"/)
  assert.match(page, /暂无域验收数据/)
  assert.match(page, /<template v-else>/)
})

test('domain acceptance types preserve dynamic domains and panels', () => {
  const types = read('data-query-app/types/domainAcceptance.ts')

  assert.match(types, /export interface DomainAcceptanceOverview/)
  assert.match(types, /domains\?: DomainAcceptanceDomain\[\]/)
  assert.match(types, /export interface DomainAcceptanceDomain/)
  assert.match(types, /tier\?: string \| null/)
  assert.match(types, /chainStage\?: string \| null/)
  assert.match(types, /managementRoute\?: string \| null/)
  assert.match(types, /publicRoute\?: string \| null/)
  assert.match(types, /requiresDatabase\?: boolean \| null/)
  assert.match(types, /panels\?: DomainAcceptancePanel\[\]/)
  assert.match(types, /export interface DomainAcceptancePanel/)
  assert.match(types, /maintenanceLane\?: string \| null/)
  assert.match(types, /maintenanceLaneId\?: string \| null/)
  assert.match(types, /autoMaintenanceAllowed\?: boolean \| null/)
  assert.match(types, /blockingBeforePublic\?: boolean \| null/)
  assert.match(types, /nextEvidenceCommand\?: string \| null/)
  assert.match(types, /checks\?: DomainAcceptanceCheck\[\]/)
  assert.match(types, /rawSummary\?: Record<string, unknown>/)
})

test('operations navigation includes the domain acceptance route', () => {
  const layout = read('data-query-app/layouts/default.vue')

  assert.match(layout, /path:\s*'\/operations\/domain-acceptance'/)
  assert.match(layout, /name:\s*'B 档域验收'/)
  assert.match(layout, /ShieldCheck/)
})

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
