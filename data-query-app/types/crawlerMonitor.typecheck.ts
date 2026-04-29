import type { CrawlerMonitorOverview, CrawlerMonitorTestState } from '~/types/crawlerMonitor'

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
}

void overview

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
