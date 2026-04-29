import type { CrawlerMonitorOverview, CrawlerMonitorReportDetail, CrawlerMonitorTestState } from '~/types/crawlerMonitor'

const overview: CrawlerMonitorOverview = {
  generatedAt: '2026-04-27T00:00:00Z',
  repoRoot: 'G:/ClaudeCode/TerraPedia-dev',
  daemon: {
    found: true,
    readable: true,
    path: 'reports/backend-refresh/backend-refresh-daemon.heartbeat.json',
    payload: {
      status: 'running',
      activeChildPid: 1300,
    },
  },
  latestRun: {
    found: true,
    readable: true,
    totalActions: 3,
    completedActions: 2,
    failedActions: 1,
    actions: [
      {
        id: 'wiki-core-refresh',
        runner: 'node',
        status: 'running',
        phase: 'apply',
        message: 'running wiki action 2 of 5',
        queue: 'active shard',
        dataStage: 'wiki API -> generated core JSON',
        nextStep: 'Keep backend-refresh heartbeat current',
        current: 2,
        total: 5,
        startedAt: '2026-04-27T00:00:00Z',
        batchOffset: 100,
        batchLimit: 100,
        overallCurrent: 102,
        overallTotal: 6131,
        percent: 40,
        lastHeartbeatAt: '2026-04-27T00:00:30Z',
        childStatusPath: 'reports/backend-refresh/history/backend-data-refresh.runtime/wiki-core-refresh.child-status.json',
        durationMs: 2400,
      },
    ],
  },
  refreshStale: true,
  refreshLastActivityAt: '2026-04-26T00:00:00Z',
  refreshStaleThresholdMs: 86400000,
  refreshStaleReason: 'backend-refresh monitor has no activity for more than 24 hours',
  history: [],
  recentReports: [
    {
      name: 'TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml',
      path: 'back/target/surefire-reports/TEST-com.terraria.skills.CrawlerMonitorServiceImplTest.xml',
      category: 'test',
      updatedAt: '2026-04-28T02:00:00Z',
      sizeBytes: 2400,
    },
  ],
  architectureLayers: [
    {
      id: 'sync-report',
      label: 'Sync / Report Evidence',
      status: 'success',
      fileCount: 1,
      readableCount: 1,
      missingCount: 0,
      errorCount: 0,
      updatedAt: '2026-04-29T08:00:00Z',
      summary: '1/1 readable',
      files: [
        {
          label: 'Relation health reports',
          path: 'reports/relation/relation-health*.json',
          latestPath: 'reports/relation/relation-health-2026-04-29.json',
          found: true,
          readable: true,
          count: 4,
          sizeBytes: 1024,
          updatedAt: '2026-04-29T08:00:00Z',
        },
      ],
    },
  ],
  registeredTasks: [
    {
      id: 'item-pages-refresh',
      label: 'Item page crawl shard',
      status: 'running',
      priority: 'p0',
      lane: 'fetch',
      queueState: 'fetched 43/100 item page(s); ok=43; failed=0',
      nextStep: 'Monitor the active shard, then retry failures and run transform-standardize.',
      dataStage: 'wiki item pages -> crawler JSON',
      current: 43,
      total: 100,
      overallCurrent: 1943,
      overallTotal: 6131,
      pending: 4188,
      failed: 0,
      percent: 43,
      inputPath: 'wiki item pages',
      outputPath: 'data/generated/wiki-item-pages*.json',
      progressPath: 'data/generated/wiki-sync-progress.latest.json',
      updatedAt: '2026-04-29T06:54:18Z',
    },
  ],
}

void overview

const reportDetail: CrawlerMonitorReportDetail = {
  found: true,
  readable: true,
  name: 'relation-health-smoke.json',
  path: 'reports/relation/relation-health-smoke.json',
  category: 'audit',
  updatedAt: '2026-04-29T08:00:00Z',
  sizeBytes: 128,
  contentType: 'json',
  content: '{\n  "status" : "ok"\n}',
  truncated: false,
  maxBytes: 200000,
}

void reportDetail

const testState: CrawlerMonitorTestState = {
  generatedAt: '2026-04-28T00:00:00Z',
  path: 'reports/backend-refresh/manual-monitor-test.json',
  found: true,
  readable: true,
  payload: {
    scenario: 'running',
    daemonStatus: 'running',
    schedulerStatus: 'sleeping',
    lockFound: false,
    latestRun: {
      totalActions: 2,
      completedActions: 1,
      runningActions: 1,
    },
  },
  overview: {
    refreshStale: false,
    daemon: {
      found: true,
      readable: true,
      path: 'reports/backend-refresh/backend-refresh-daemon.heartbeat.json',
      payload: {
        status: 'idle',
      },
    },
    scheduler: {
      found: true,
      readable: true,
      path: 'reports/backend-refresh/backend-refresh-scheduler-state.json',
      payload: {
        status: 'sleeping',
      },
    },
    lock: {
      found: false,
      readable: false,
      path: 'reports/backend-refresh/backend-refresh.lock',
    },
    latestRun: {
      found: true,
      readable: true,
      totalActions: 2,
      completedActions: 1,
      runningActions: 1,
      actions: [
        {
          id: 'wiki-refresh',
          runner: 'node',
          status: 'running',
          current: 3,
          total: 8,
          startedAt: '2026-04-29T00:00:00Z',
          batchOffset: 0,
          batchLimit: 100,
          overallCurrent: 3,
          overallTotal: 6131,
          percent: 37.5,
          phase: 'apply',
          message: 'running standalone wiki sync action 3 of 8',
          lastHeartbeatAt: '2026-04-29T00:00:30Z',
          childStatusPath: 'data/generated/wiki-sync-progress.latest.json',
          durationMs: 1200,
        },
      ],
    },
  },
}

void testState
