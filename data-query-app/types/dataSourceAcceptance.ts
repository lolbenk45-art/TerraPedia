export type AcceptanceStatus = 'pass' | 'warning' | 'blocked' | 'missing'

export interface DataSourceAcceptanceCheck {
  id?: string | null
  status?: string | null
  message?: string | null
  reportPath?: string | null
}

export interface DataSourceAcceptanceFailureSample {
  entityType?: string | null
  entityId?: string | null
  sourceId?: string | null
  status?: string | null
  reason?: string | null
  evidencePath?: string | null
  recommendedAction?: string | null
  freshnessStatus?: string | null
  reportPath?: string | null
  sampleSource?: string | null
  notGateEvidence?: boolean | null
}

export interface DataSourceAcceptancePanel {
  id?: string | null
  status?: AcceptanceStatus
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
  executeMode?: string | null
  executionPolicy?: string | null
  generatedAt?: string | null
  updatedAt?: string | null
  errorMessage?: string | null
  blockingCount?: number | null
  warningCount?: number | null
  metrics?: Record<string, unknown>
  checks?: DataSourceAcceptanceCheck[]
  failureSamples?: DataSourceAcceptanceFailureSample[]
  sampleReportPaths?: string[]
  rawSummary?: Record<string, unknown>
}

export interface DataSourceAcceptanceOverview {
  generatedAt?: string | null
  overallStatus?: AcceptanceStatus
  blockingCount?: number | null
  warningCount?: number | null
  missingCount?: number | null
  blockingReasons?: string[]
  warningReasons?: string[]
  relationHealth?: DataSourceAcceptancePanel | null
  replacementReadiness?: DataSourceAcceptancePanel | null
  sourceDatasetLanding?: DataSourceAcceptancePanel | null
  sourceGroupAudit?: DataSourceAcceptancePanel | null
  imageReadiness?: DataSourceAcceptancePanel | null
  crawlerMonitor?: DataSourceAcceptancePanel | null
  entitySourceCoverage?: DataSourceAcceptancePanel | null
}
