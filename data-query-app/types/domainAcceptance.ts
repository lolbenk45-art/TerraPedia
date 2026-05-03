export type DomainAcceptanceStatus = 'pass' | 'warning' | 'blocked' | 'missing'

export interface DomainAcceptanceCheck {
  id?: string | null
  status?: string | null
  message?: string | null
  reportPath?: string | null
}

export interface DomainAcceptanceRefreshPlanSummary {
  overallStatus?: string | null
  actionCount?: number | null
  readyCount?: number | null
  confirmationCount?: number | null
  blockedCount?: number | null
  safeReadOnlyCount?: number | null
  unsafeActionCount?: number | null
  databaseRequiredCount?: number | null
  manualOnlyCount?: number | null
  affectedDomainCount?: number | null
  autoMaintenanceEligibleCount?: number | null
  manualConfirmationCount?: number | null
  blockingBeforePublicCount?: number | null
  planOnlyCount?: number | null
  maintenanceRoutedCount?: number | null
}

export interface DomainAcceptanceRefreshAction {
  domainId?: string | null
  panelId?: string | null
  freshnessStatus?: string | null
  reason?: string | null
  command?: string | null
  commandRisk?: string | null
  requiresDatabase?: boolean | null
  writesDatabase?: boolean | null
  maintenanceLane?: string | null
  maintenanceLaneId?: string | null
  backendRefreshStepIds?: string[]
  backendRefreshPlanCommand?: string | null
  executionPolicy?: string | null
  autoMaintenanceEligible?: boolean | null
  manualConfirmation?: boolean | null
  blockingBeforePublic?: boolean | null
  blockingBeforePublicReason?: string | null
  status?: string | null
  confirmationReason?: string | null
  blockedReason?: string | null
  executeMode?: string | null
}

export interface DomainAcceptancePanel {
  id?: string | null
  domainId?: string | null
  panelId?: string | null
  chainStage?: string | null
  maintenanceLane?: string | null
  maintenanceLaneId?: string | null
  backendRefreshStepIds?: string[]
  backendRefreshPlanCommand?: string | null
  autoMaintenanceAllowed?: boolean | null
  blockingBeforePublic?: boolean | null
  status?: DomainAcceptanceStatus
  found?: boolean
  readable?: boolean
  reportPath?: string | null
  reportPattern?: string | null
  generatorCommand?: string | null
  writesDatabase?: boolean | null
  requiresDatabase?: boolean | null
  notes?: string | null
  freshnessStatus?: string | null
  freshnessReason?: string | null
  staleAfterHours?: number | null
  ageHours?: number | null
  nextEvidenceCommand?: string | null
  generatedAt?: string | null
  updatedAt?: string | null
  errorMessage?: string | null
  blockingCount?: number | null
  warningCount?: number | null
  metrics?: Record<string, unknown>
  checks?: DomainAcceptanceCheck[]
  sampleReportPaths?: string[]
  rawSummary?: Record<string, unknown>
}

export interface DomainAcceptanceDomain {
  domainId?: string | null
  domainType?: string | null
  tier?: string | null
  chainStage?: string | null
  managementRoute?: string | null
  publicRoute?: string | null
  backendRefreshStepIds?: string[]
  backendRefreshPlanCommand?: string | null
  requiresDatabase?: boolean | null
  status?: DomainAcceptanceStatus
  panelCount?: number | null
  blockingCount?: number | null
  warningCount?: number | null
  missingCount?: number | null
  panels?: DomainAcceptancePanel[]
}

export interface DomainAcceptanceOverview {
  generatedAt?: string | null
  overallStatus?: DomainAcceptanceStatus
  domainCount?: number | null
  panelCount?: number | null
  blockingCount?: number | null
  warningCount?: number | null
  missingCount?: number | null
  blockingReasons?: string[]
  warningReasons?: string[]
  summary?: Record<string, unknown>
  refreshPlanSummary?: DomainAcceptanceRefreshPlanSummary | null
  actionQueue?: DomainAcceptanceRefreshAction[]
  domains?: DomainAcceptanceDomain[]
}
