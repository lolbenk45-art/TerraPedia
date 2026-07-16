export type CrawlerMonitorPayload = Record<string, any>
export type CrawlerMonitorResumeMode = 'resume' | string

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
  resumeMode?: CrawlerMonitorResumeMode | null
  resumeStatePath?: string | null
  restartBehavior?: string | null
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
  resumeSupported?: boolean
  resumeMode?: CrawlerMonitorResumeMode | null
  resumeStatePath?: string | null
  restartBehavior?: string | null
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
  autoDispatchReason?: string | null
  dispatchMode?: string | null
  cooldownMinutes?: number | null
  maxConcurrent?: number | null
  failureCircuitBreaker?: string | null
  resumeSupported?: boolean
  resumeMode?: CrawlerMonitorResumeMode | null
  resumeStatePath?: string | null
  restartBehavior?: string | null
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
  resumeMode?: CrawlerMonitorResumeMode | null
  resumeStatePath?: string | null
  restartBehavior?: string | null
  lockPath?: string | null
  reportPath?: string | null
  requestedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  message?: string | null
}

export type CrawlerMonitorWikiQueueLane = 'standard' | 'domain_smoke'
export type CrawlerMonitorWikiQueueStatus = 'queued' | 'blocked_cooldown' | 'starting' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled'

export interface CrawlerMonitorWikiQueueItem {
  queueId?: string | null
  dispatchId?: string | null
  lane?: CrawlerMonitorWikiQueueLane | null
  domain?: string | null
  coveredDomains?: string[]
  actionId?: string | null
  status?: CrawlerMonitorWikiQueueStatus | string | null
  requestedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  pid?: number | null
  processStartedAt?: string | null
  requestedBy?: string | null
  blockedByDispatchId?: string | null
  blockedByDomain?: string | null
  blockedByActionId?: string | null
  blockedSince?: string | null
  cooldownUntil?: string | null
  progressPath?: string | null
  resumeMode?: CrawlerMonitorResumeMode | null
  resumeStatePath?: string | null
  restartBehavior?: string | null
  reportPath?: string | null
  lockPath?: string | null
  outputPath?: string | null
  logPath?: string | null
  message?: string | null
  position?: number | null
  lanePosition?: number | null
}

export interface CrawlerMonitorDispatchPlan {
  actionId?: string | null
  domain?: string | null
  priority?: string | number | null
  reason?: string | null
  status?: string | null
  commandPreview?: string | null
  progressPath?: string | null
  resumeSupported?: boolean
  resumeMode?: CrawlerMonitorResumeMode | null
  resumeStatePath?: string | null
  restartBehavior?: string | null
  reportPath?: string | null
  message?: string | null
}

export interface CrawlerMonitorStaleHeartbeat {
  actionId?: string | null
  domain?: string | null
  path?: string | null
  lastHeartbeatAt?: string | null
  staleSince?: string | null
  staleMs?: number | null
  reason?: string | null
  message?: string | null
}

export interface CrawlerMonitorDispatchResult {
  accepted?: boolean
  queueId?: string | null
  queued?: boolean | null
  queuePosition?: number | null
  dispatchId?: string | null
  domain?: string | null
  coveredDomains?: string[]
  actionId?: string | null
  status?: string | null
  requestedAt?: string | null
  progressPath?: string | null
  resumeMode?: CrawlerMonitorResumeMode | null
  resumeStatePath?: string | null
  restartBehavior?: string | null
  lockPath?: string | null
  reportPath?: string | null
  outputPath?: string | null
  blockedByDispatchId?: string | null
  blockedByDomain?: string | null
  blockedByActionId?: string | null
  blockedSince?: string | null
  queueMessage?: string | null
  cooldownUntil?: string | null
  message?: string | null
}

export interface CrawlerMonitorAutoDispatchSettings {
  enabled?: boolean
  mode?: string | null
  sweepIntervalMinutes?: number | null
}

export interface CrawlerMonitorWikiLastSweep {
  checkedAt?: string | null
  status?: string | null
  detected?: CrawlerMonitorPayload[]
  dispatched?: CrawlerMonitorPayload[]
  skipped?: CrawlerMonitorPayload[]
}

export interface CrawlerMonitorWikiMonitor {
  generatedAt?: string | null
  dispatchMode?: string | null
  autoDispatchEnabled?: boolean
  autoDispatchSettings?: CrawlerMonitorAutoDispatchSettings | null
  lastSweep?: CrawlerMonitorWikiLastSweep | null
  summary?: CrawlerMonitorWikiSummary | null
  domains?: CrawlerMonitorWikiDomain[]
  pendingDispatches?: CrawlerMonitorWikiDispatch[]
  dispatchPlan?: CrawlerMonitorDispatchPlan[]
  dispatchQueue?: CrawlerMonitorWikiQueueItem[]
}

export interface CrawlerQueueV2Health {
  status: 'healthy' | 'degraded' | 'unavailable' | 'maintenance'
  snapshotGeneratedAt?: string | null
  lastReconciledAt?: string | null
  overdueAttemptCount?: number | null
  oldestOverdueDurationMs?: number | null
  streamLagMs?: number | null
  reasonCode?: string | null
  messageZh?: string | null
  suggestedAction?: string | null
}

export interface CrawlerQueueV2LogMetadata {
  attemptId: string
  path?: string | null
  availability: 'available' | 'empty' | 'missing' | 'expired' | 'forbidden'
  previewable: boolean
  sizeBytes?: number | null
  lastWriteAt?: string | null
  retentionExpiresAt?: string | null
  reasonCode?: string | null
}

export interface CrawlerQueueV2Plan {
  operationId: string
  actionId: string
  labelZh: string
  mode: 'check' | 'force' | 'fresh' | 'preview' | 'apply' | string
  networkAccess: boolean
  sourceLocator?: string | null
  fileWriteSummary?: string | null
  databaseAccess: 'none' | 'read' | 'write' | string
  estimatedRequests?: number | null
  estimatedRecords?: number | null
  pauseSupported: boolean
  resumeSupported: boolean
  resumeStatePath?: string | null
  confirmationLevel: 'summary' | 'destructive' | string
  capturedAt?: string | null
}

export interface CrawlerQueueV2Result {
  plannedCount?: number | null
  actualCount?: number | null
  skippedCount?: number | null
  failedCount?: number | null
  estimatedRequests?: number | null
  estimatedRecords?: number | null
  resultKind?: 'no_change' | 'fetched' | 'generated' | 'preview_completed' | 'database_applied' | 'cancelled' | 'failed' | string | null
  resumeOutcome?: 'fresh' | 'resumed' | 'checkpoint_invalid_fresh' | 'not_supported' | string | null
}

export interface CrawlerQueueV2Operation {
  domain?: string
  operationId: string
  actionId: string
  labelZh: string
  category: 'check_sync' | 'direct_crawl' | 'data_process' | 'backfill' | string
  mode: 'check' | 'force' | 'fresh' | 'preview' | 'apply' | string
  descriptionZh?: string | null
  networkAccess: boolean
  sourceLocator?: string | null
  fileWriteSummary?: string | null
  databaseAccess: 'none' | 'read' | 'write' | string
  estimatedRequests?: number | null
  estimatedRecords?: number | null
  shortTask: boolean
  pauseSupported: boolean
  resumeSupported: boolean
  resumeStatePath?: string | null
  confirmationLevel: 'summary' | 'destructive' | string
  defaultOperation: boolean
}

export interface CrawlerQueueV2Attempt {
  queueId: string
  attemptId: string
  stateStoreEpoch: string
  fenceToken?: number | null
  stateVersion: number
  status: string
  lane?: string | null
  domain: string
  coveredDomains: string[]
  actionId: string
  phase?: string | null
  current?: number | null
  total?: number | null
  requestedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  lastHeartbeatAt?: string | null
  deadlineAt?: string | null
  reasonCode?: string | null
  messageZh?: string | null
  suggestedAction?: string | null
  resumeSupported?: boolean
  allowedActions: string[]
  progressPath?: string | null
  outputPath?: string | null
  reportPath?: string | null
  log?: CrawlerQueueV2LogMetadata | null
  plan?: CrawlerQueueV2Plan | null
  result?: CrawlerQueueV2Result | null
}

export interface CrawlerQueueV2DomainState {
  domain: string
  currentAttemptId?: string | null
  stateVersion?: number | null
  status?: string | null
  phase?: string | null
  current?: number | null
  total?: number | null
  lastHeartbeatAt?: string | null
  deadlineAt?: string | null
  reasonCode?: string | null
  messageZh?: string | null
  suggestedAction?: string | null
  allowedActions: string[]
  operations?: CrawlerQueueV2Operation[]
}

export interface CrawlerQueueV2LegacyAttempt {
  source: string
  live: false
  queueId: string
  attemptId: string
  domain: string
  actionId: string
  status: string
  requestedAt?: string | null
  completedAt?: string | null
  reasonCode?: string | null
  messageZh?: string | null
  allowedActions: []
  log?: CrawlerQueueV2LogMetadata | null
}

export interface CrawlerMonitorOverview {
  queueContractVersion?: number | null
  stateStoreEpoch?: string | null
  streamCursor?: string | null
  queueHealth?: CrawlerQueueV2Health | null
  reconcilerHealth?: CrawlerQueueV2Health | null
  liveQueue?: CrawlerQueueV2Attempt[]
  domainStates?: CrawlerQueueV2DomainState[]
  attemptHistory?: CrawlerQueueV2Attempt[]
  legacyHistory?: CrawlerQueueV2LegacyAttempt[]
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
  staleHeartbeats?: CrawlerMonitorStaleHeartbeat[]
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
