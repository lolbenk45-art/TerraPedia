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
  childStatusPath?: string | null
  current?: number | null
  total?: number | null
  startedAt?: string | null
  batchOffset?: number | null
  batchLimit?: number | null
  overallCurrent?: number | null
  overallTotal?: number | null
  percent?: number | null
  phase?: string | null
  message?: string | null
  queue?: string | null
  dataStage?: string | null
  nextStep?: string | null
  lastHeartbeatAt?: string | null
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

export interface CrawlerMonitorReportDetail extends CrawlerMonitorReport {
  found?: boolean
  readable?: boolean
  contentType?: string | null
  content?: string | null
  truncated?: boolean
  maxBytes?: number | null
  errorMessage?: string | null
}

export interface CrawlerMonitorArchitectureFile {
  label?: string | null
  path?: string | null
  latestPath?: string | null
  found?: boolean
  readable?: boolean
  count?: number | null
  sizeBytes?: number | null
  updatedAt?: string | null
  errorMessage?: string | null
}

export interface CrawlerMonitorArchitectureLayer {
  id?: string | null
  label?: string | null
  status?: string | null
  fileCount?: number | null
  readableCount?: number | null
  missingCount?: number | null
  errorCount?: number | null
  updatedAt?: string | null
  summary?: string | null
  files?: CrawlerMonitorArchitectureFile[]
}

export interface CrawlerMonitorRegisteredTask {
  id?: string | null
  label?: string | null
  status?: string | null
  priority?: string | null
  lane?: string | null
  queueState?: string | null
  nextStep?: string | null
  dataStage?: string | null
  current?: number | null
  total?: number | null
  overallCurrent?: number | null
  overallTotal?: number | null
  pending?: number | null
  failed?: number | null
  percent?: number | null
  inputPath?: string | null
  outputPath?: string | null
  reportPath?: string | null
  progressPath?: string | null
  progressSource?: string | null
  progressFound?: boolean
  progressReadable?: boolean
  progressUpdatedAt?: string | null
  progressErrorMessage?: string | null
  progressPayload?: CrawlerMonitorPayload | null
  progressHeartbeatAt?: string | null
  progressHeartbeatAgeMs?: number | null
  progressStale?: boolean
  progressStaleReason?: string | null
  progressKind?: string | null
  updatedAt?: string | null
}

export interface CrawlerMonitorImageNormalizationSummary {
  latestImageLineageReport?: string | null
  lastCanonicalSyncAt?: string | null
  npcWrongPrefixCount?: number | null
  projectileWrongPrefixCount?: number | null
  npcWikiOnlyCount?: number | null
  projectileWikiOnlyCount?: number | null
  legacyExemptionCount?: number | null
}

export interface CrawlerMonitorWikiSummary {
  domainCount?: number | null
  changedCount?: number | null
  pendingApprovalCount?: number | null
  runningCount?: number | null
  failedCount?: number | null
}

export interface CrawlerMonitorWikiDomain {
  domain?: string | null
  label?: string | null
  status?: string | null
  sourceKey?: string | null
  locator?: string | null
  lastCheckedAt?: string | null
  currentValue?: string | null
  previousValue?: string | null
  changed?: boolean
  recommendedActionId?: string | null
  progressPath?: string | null
  requiresApproval?: boolean
  autoEligible?: boolean
  dispatchMode?: string | null
  cooldownMinutes?: number | null
  maxConcurrent?: number | null
  failureCircuitBreaker?: string | null
  lastAutoRunAt?: string | null
  pauseReason?: string | null
  message?: string | null
}

export interface CrawlerMonitorWikiDispatch {
  dispatchId?: string | null
  domain?: string | null
  actionId?: string | null
  controlAction?: string | null
  status?: string | null
  commandPreview?: string | null
  progressPath?: string | null
  lockPath?: string | null
  reportPath?: string | null
  requestedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  message?: string | null
}

export interface CrawlerMonitorDispatchResult {
  accepted?: boolean
  dispatchId?: string | null
  domain?: string | null
  actionId?: string | null
  status?: string | null
  progressPath?: string | null
  lockPath?: string | null
  reportPath?: string | null
  blockedByDispatchId?: string | null
  blockedByDomain?: string | null
  blockedByActionId?: string | null
  blockedSince?: string | null
  message?: string | null
}

export interface CrawlerMonitorWikiMonitor {
  generatedAt?: string | null
  dispatchMode?: string | null
  autoDispatchEnabled?: boolean
  summary?: CrawlerMonitorWikiSummary | null
  domains?: CrawlerMonitorWikiDomain[]
  pendingDispatches?: CrawlerMonitorWikiDispatch[]
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
  imageNormalization?: CrawlerMonitorImageNormalizationSummary | null
  wikiMonitor?: CrawlerMonitorWikiMonitor | null
  history?: CrawlerMonitorRun[]
  recentReports?: CrawlerMonitorReport[]
  architectureLayers?: CrawlerMonitorArchitectureLayer[]
  registeredTasks?: CrawlerMonitorRegisteredTask[]
}

export type CrawlerMonitorTestPayload = CrawlerMonitorOverview & Record<string, any>

export interface CrawlerMonitorTestState {
  generatedAt?: string | null
  filePath?: string | null
  path?: string | null
  found?: boolean
  readable?: boolean
  updatedAt?: string | null
  payload?: CrawlerMonitorTestPayload | null
  overview?: CrawlerMonitorOverview | null
  errorMessage?: string | null
}
