#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

const REPORT_FRESHNESS_POLICY = {
  freshnessSource: 'report-generatedAt-or-mtime',
  staleAfterHours: 24,
  nextEvidenceWhen: ['missing', 'stale', 'unknown', 'unreadable'],
  statusImpact: 'stale-pass-to-warning',
};

const CRAWLER_MONITOR_FRESHNESS_POLICY = {
  freshnessSource: 'crawler-monitor',
  staleAfterHours: 'crawler-refresh-threshold',
  nextEvidenceWhen: ['missing', 'stale', 'unknown', 'unreadable'],
  statusImpact: 'stale-pass-to-warning',
};

const MANIFEST = [
  {
    panelId: 'relationHealth',
    reportPattern: 'reports/relation/relation-health*.json',
    generatorCommand: 'node scripts/data/relation/relation-health-report.mjs --write-report=true',
    writesDatabase: false,
    requiresDatabase: true,
    notes: 'Feeds relationHealth from the latest relation health report.',
    ...REPORT_FRESHNESS_POLICY,
  },
  {
    panelId: 'replacementReadiness',
    reportPattern: 'reports/relation/replacement-readiness*.json',
    generatorCommand: 'node scripts/data/relation/replacement-readiness-audit.mjs',
    writesDatabase: false,
    requiresDatabase: true,
    notes: 'Feeds replacementReadiness from the latest read-only replacement readiness audit report.',
    ...REPORT_FRESHNESS_POLICY,
  },
  {
    panelId: 'sourceDatasetLanding',
    reportPattern: 'reports/source-dataset-landing-audit*.json',
    generatorCommand: 'node scripts/data/landing/audit-source-dataset-landings.mjs',
    writesDatabase: false,
    requiresDatabase: true,
    notes: 'Feeds sourceDatasetLanding from the latest landing dataset audit report.',
    ...REPORT_FRESHNESS_POLICY,
  },
  {
    panelId: 'sourceGroupAudit',
    reportPattern: 'reports/item-groups/any-item-group-source-audit*.json',
    generatorCommand: 'node scripts/data/audit/audit-any-item-group-sources.mjs',
    writesDatabase: false,
    requiresDatabase: false,
    notes: 'Feeds sourceGroupAudit from the latest source-backed item group audit report.',
    ...REPORT_FRESHNESS_POLICY,
  },
  {
    panelId: 'imageReadiness',
    reportPattern: 'reports/audit/image-asset-readiness*.json',
    generatorCommand: 'node scripts/data/audit/image-asset-readiness-audit.mjs --source=db',
    writesDatabase: false,
    requiresDatabase: true,
    notes: 'Feeds imageReadiness from the latest image asset readiness audit report.',
    ...REPORT_FRESHNESS_POLICY,
  },
  {
    panelId: 'crawlerMonitor',
    reportPattern: 'GET /admin/crawler-monitor/overview',
    generatorCommand: 'read-only monitor overview: GET /admin/crawler-monitor/overview',
    writesDatabase: false,
    requiresDatabase: false,
    notes: 'Feeds crawlerMonitor through the existing read-only crawler monitor overview, without running crawler, data load, or mutation flows.',
    ...CRAWLER_MONITOR_FRESHNESS_POLICY,
  },
  {
    panelId: 'entitySourceCoverage',
    reportPattern: 'reports/relation/entity-coverage-baseline*.json',
    generatorCommand: 'node scripts/data/relation/entity-coverage-baseline.mjs',
    writesDatabase: false,
    requiresDatabase: true,
    notes: 'Feeds entitySourceCoverage from the latest entity source coverage baseline report.',
    ...REPORT_FRESHNESS_POLICY,
  },
];

export function buildDataSourceAcceptanceReportManifest() {
  return MANIFEST.map((entry) => ({ ...entry }));
}

function main() {
  process.stdout.write(`${JSON.stringify(buildDataSourceAcceptanceReportManifest(), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
