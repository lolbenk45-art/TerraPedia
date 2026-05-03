import type { DomainAcceptanceOverview } from '~/types/domainAcceptance'

const overview: DomainAcceptanceOverview = {
  generatedAt: '2026-05-03T12:00:00Z',
  overallStatus: 'warning',
  domainCount: 1,
  panelCount: 1,
  blockingCount: 0,
  warningCount: 1,
  missingCount: 0,
  domains: [
    {
      domainId: 'buffs',
      domainType: 'product',
      tier: 'B',
      chainStage: 'product-readiness',
      managementRoute: '/entities/buffs',
      publicRoute: null,
      backendRefreshStepIds: ['independent-entity-sync'],
      backendRefreshPlanCommand: 'node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync',
      requiresDatabase: false,
      status: 'warning',
      panelCount: 1,
      warningCount: 1,
      panels: [
        {
          id: 'sourceReadiness',
          domainId: 'buffs',
          panelId: 'sourceReadiness',
          chainStage: 'source',
          maintenanceLane: 'domain-acceptance-evidence',
          maintenanceLaneId: 'domain-acceptance:buffs:sourceReadiness',
          backendRefreshStepIds: ['independent-entity-sync'],
          backendRefreshPlanCommand: 'node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=independent-entity-sync',
          autoMaintenanceAllowed: true,
          blockingBeforePublic: false,
          status: 'warning',
          reportPath: 'reports/domain/buffs/source-readiness-2026-05-03.json',
          nextEvidenceCommand: 'node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=source',
          checks: [
            {
              id: 'standardized_buffs_readable',
              status: 'pass',
              reportPath: 'data/standardized/buffs.standardized.json',
            },
          ],
        },
      ],
    },
  ],
}

void overview
