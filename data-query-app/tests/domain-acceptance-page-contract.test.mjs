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
  assert.match(page, /refreshPlanSummary/)
  assert.match(page, /actionQueue/)
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
    'domain.publicExposure',
    'domain.publicRoute',
    'domain.publicGateStatus',
    'domain.publicGateReason',
    'domain?.acceptedWarnings',
    'domain.backendRefreshStepIds',
    'domain.backendRefreshPlanCommand',
    'domain.requiresDatabase',
    'domain.panels',
    'overview?.refreshPlanSummary',
    'overview?.actionQueue',
    'action.domainId',
    'action.panelId',
    'action.status',
    'action.executeMode',
    'action.executionPolicy',
    'action.autoMaintenanceEligible',
    'action.manualConfirmation',
    'action.blockingBeforePublic',
    'action.command',
    'action.reason',
    'action.backendRefreshStepIds',
    'action.backendRefreshPlanCommand',
    'panel.panelId',
    'panel.chainStage',
    'panel.maintenanceLane',
    'panel.maintenanceLaneId',
    'panel.backendRefreshStepIds',
    'panel.backendRefreshPlanCommand',
    'panel.autoMaintenanceAllowed',
    'panel.blockingBeforePublic',
    'panel.reportPath',
    'panel.reportPattern',
    'panel.freshnessStatus',
    'panel.nextEvidenceCommand',
    'panel.generatorCommand',
    'panel.acceptedWarning',
    'acceptedWarningForPanel(panel, domain)',
    'acceptedWarningRows(acceptedWarningForPanel(panel, domain))',
    'panel.checks',
    'rawSummaryRows(panel)',
    'publicExposureLabel(domain.publicExposure)',
    'publicGateLabel(domain.publicGateStatus)',
  ]) {
    assert.match(page, new RegExp(escapeRegExp(token)))
  }

  assert.match(page, /domain-card/)
  assert.match(page, /domain-panel/)
  assert.match(page, /accepted-warning-block/)
  assert.match(page, /readinessOnly/)
  assert.match(page, /route-ready/)
  assert.match(page, /next-evidence-command/)
  assert.match(page, /action-queue/)
  assert.match(page, /refresh-plan-summary/)
  assert.doesNotMatch(page, /navigator\.clipboard/)
  assert.doesNotMatch(page, /document\.execCommand/)
  assert.doesNotMatch(page, /@click=["'][^"']*action\.command/)
  assert.doesNotMatch(page, /@click=["'][^"']*backendRefreshPlanCommand/)
  assert.doesNotMatch(page, /@click=["'][^"']*publicGate/)
  assert.doesNotMatch(page, /publicGateStatus\s*=\s*['"]public_route_configured['"]/)
})

test('domain acceptance page labels refresh action statuses explicitly', () => {
  const page = read('data-query-app/pages/operations/domain-acceptance.vue')

  assert.match(page, /ready/)
  assert.match(page, /needs_confirmation/)
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
  assert.match(types, /refreshPlanSummary\?: DomainAcceptanceRefreshPlanSummary \| null/)
  assert.match(types, /actionQueue\?: DomainAcceptanceRefreshAction\[\]/)
  assert.match(types, /export interface DomainAcceptanceRefreshPlanSummary/)
  assert.match(types, /overallStatus\?: string \| null/)
  assert.match(types, /manualOnlyCount\?: number \| null/)
  assert.match(types, /export interface DomainAcceptanceRefreshAction/)
  assert.match(types, /executeMode\?: string \| null/)
  assert.match(types, /executionPolicy\?: string \| null/)
  assert.match(types, /autoMaintenanceEligible\?: boolean \| null/)
  assert.match(types, /manualConfirmation\?: boolean \| null/)
  assert.match(types, /blockingBeforePublic\?: boolean \| null/)
  assert.match(types, /backendRefreshPlanCommand\?: string \| null/)
  assert.match(types, /domains\?: DomainAcceptanceDomain\[\]/)
  assert.match(types, /export interface DomainAcceptanceDomain/)
  assert.match(types, /acceptedWarnings\?: DomainAcceptanceAcceptedWarning\[\]/)
  assert.match(types, /tier\?: string \| null/)
  assert.match(types, /chainStage\?: string \| null/)
  assert.match(types, /managementRoute\?: string \| null/)
  assert.match(types, /publicExposure\?: .*string.*\| null/)
  assert.match(types, /publicRoute\?: string \| null/)
  assert.match(types, /export type DomainAcceptancePublicGateStatus/)
  assert.match(types, /publicGateStatus\?: DomainAcceptancePublicGateStatus \| null/)
  assert.match(types, /publicGateReason\?: string \| null/)
  assert.match(types, /backendRefreshStepIds\?: string\[\]/)
  assert.match(types, /backendRefreshPlanCommand\?: string \| null/)
  assert.match(types, /requiresDatabase\?: boolean \| null/)
  assert.match(types, /panels\?: DomainAcceptancePanel\[\]/)
  assert.match(types, /export interface DomainAcceptancePanel/)
  assert.match(types, /maintenanceLane\?: string \| null/)
  assert.match(types, /maintenanceLaneId\?: string \| null/)
  assert.match(types, /backendRefreshStepIds\?: string\[\]/)
  assert.match(types, /backendRefreshPlanCommand\?: string \| null/)
  assert.match(types, /autoMaintenanceAllowed\?: boolean \| null/)
  assert.match(types, /blockingBeforePublic\?: boolean \| null/)
  assert.match(types, /nextEvidenceCommand\?: string \| null/)
  assert.match(types, /acceptedWarning\?: DomainAcceptanceAcceptedWarning \| null/)
  assert.match(types, /checks\?: DomainAcceptanceCheck\[\]/)
  assert.match(types, /rawSummary\?: Record<string, unknown>/)
  assert.match(types, /export interface DomainAcceptanceAcceptedWarning/)
  assert.match(types, /export interface DomainAcceptanceAcceptedWarning \{[\s\S]*panelId\?: string \| null[\s\S]*reason\?: string \| null[\s\S]*approvedBy\?: string \| null[\s\S]*approvedAt\?: string \| null[\s\S]*expiresAt\?: string \| null[\s\S]*readinessOnly\?: boolean \| null/)
  assert.match(types, /readinessOnly\?: boolean \| null/)
  assert.match(types, /active\?: boolean \| null/)
  assert.match(types, /applies\?: boolean \| null/)
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
