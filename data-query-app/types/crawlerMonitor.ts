export type CrawlerMonitorPayload = Record<string, any>

export interface CrawlerMonitorFile {
  found?: boolean
  readable?: boolean
  path?: string | null
  updatedAt?: string | null
  errorMessage?: string | null
  payload?: CrawlerMonitorPayload | null
}

export interface CrawlerMonitorAction {
  id?: string | null
  runner?: string | null
  args?: string[]
  status?: string | null
  timeoutMs?: number | null
  durationMs?: number | null
  timedOut?: boolean
  heartbeatPath?: string | null
  snapshotPath?: string | null
  updatedAt?: string | null
}

export interface CrawlerMonitorRun {
  found?: boolean
  readable?: boolean
  path?: string | null
  summaryPath?: string | null
  generatedAt?: string | null
  outputPath?: string | null
  lastActionId?: string | null
  totalActions?: number | null
  completedActions?: number | null
  failedActions?: number | null
  runningActions?: number | null
  pendingActions?: number | null
  timedOutActions?: number | null
  totalDurationMs?: number | null
  errorMessage?: string | null
  actions?: CrawlerMonitorAction[]
}

export interface CrawlerMonitorReport {
  name?: string | null
  path?: string | null
  category?: string | null
  updatedAt?: string | null
  sizeBytes?: number | null
}

export interface CrawlerMonitorOverview {
  generatedAt?: string | null
  repoRoot?: string | null
  daemon?: CrawlerMonitorFile | null
  scheduler?: CrawlerMonitorFile | null
  lock?: CrawlerMonitorFile | null
  latestRun?: CrawlerMonitorRun | null
  refreshStale?: boolean
  refreshLastActivityAt?: string | null
  refreshStaleThresholdMs?: number | null
  refreshStaleReason?: string | null
  history?: CrawlerMonitorRun[]
  recentReports?: CrawlerMonitorReport[]
}
