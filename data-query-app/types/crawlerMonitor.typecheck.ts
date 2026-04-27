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
  history: [],
}

void overview
