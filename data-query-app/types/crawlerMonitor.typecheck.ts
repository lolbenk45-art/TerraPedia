import type { CrawlerMonitorOverview } from '~/types/crawlerMonitor'

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
        status: 'completed',
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
