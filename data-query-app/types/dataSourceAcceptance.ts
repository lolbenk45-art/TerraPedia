export type AcceptanceStatus = 'pass' | 'warning' | 'blocked' | 'missing'

export interface DataSourceAcceptanceCheck {
  id?: string | null
  status?: string | null
  message?: string | null
  reportPath?: string | null
}

export interface DataSourceAcceptancePanel {
  id?: string | null
  status?: AcceptanceStatus
  found?: boolean
  readable?: boolean
  reportPath?: string | null
  reportPattern?: string | null
  generatedAt?: string | null
  updatedAt?: string | null
  errorMessage?: string | null
  blockingCount?: number | null
  warningCount?: number | null
  metrics?: Record<string, unknown>
  checks?: DataSourceAcceptanceCheck[]
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
