import type { DataSourceAcceptanceOverview } from '~/types/dataSourceAcceptance'

const overview: DataSourceAcceptanceOverview = {
  generatedAt: '2026-05-03T00:00:00Z',
  overallStatus: 'warning',
  blockingCount: 0,
  warningCount: 1,
  missingCount: 0,
  warningReasons: ['crawlerMonitor: warningCount=1'],
  relationHealth: {
    id: 'relationHealth',
    status: 'pass',
    found: true,
    readable: true,
    reportPath: 'reports/relation/relation-health-2026-05-03.json',
    checks: [
      {
        id: 'relation_health',
        status: 'pass',
        reportPath: 'reports/relation/relation-health-2026-05-03.json',
      },
    ],
  },
  crawlerMonitor: {
    id: 'crawlerMonitor',
    status: 'warning',
    metrics: {
      refreshStale: true,
    },
  },
}

void overview
