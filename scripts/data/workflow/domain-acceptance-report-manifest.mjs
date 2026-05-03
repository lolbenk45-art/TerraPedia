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

const PRODUCT_DOMAIN_IDS = [
  'bosses',
  'buffs',
  'projectiles',
  'armor_sets',
];

const SUPPORT_DOMAIN_IDS = [
  'support.recipe',
  'support.shimmer',
  'support.category',
  'support.item_group',
  'support.town_npc_maintenance',
];

const PRODUCT_PANEL_DEFINITIONS = [
  {
    panelId: 'sourceReadiness',
    fileKey: 'source-readiness',
    generatorPanel: 'source',
    notes: 'Checks source evidence coverage for the domain without refreshing upstream data.',
  },
  {
    panelId: 'relationReadiness',
    fileKey: 'relation-readiness',
    generatorPanel: 'relation',
    notes: 'Checks relation and projection evidence for the domain without writing database records.',
  },
  {
    panelId: 'imageReadiness',
    fileKey: 'image-readiness',
    generatorPanel: 'image',
    notes: 'Checks image source, cache, and fallback evidence for the domain.',
  },
  {
    panelId: 'publicReadiness',
    fileKey: 'public-readiness',
    generatorPanel: 'public',
    notes: 'Checks whether the domain is ready for public API or public UI consumption.',
  },
];

const SUPPORT_PANEL_DEFINITIONS = [
  {
    panelId: 'sourceReadiness',
    fileKey: 'source-readiness',
    generatorPanel: 'source',
    notes: 'Checks source evidence coverage for the support domain.',
  },
  {
    panelId: 'blockingGate',
    fileKey: 'blocking-gate',
    generatorPanel: 'blocking',
    notes: 'Checks duplicate, blocked, drift, or unresolved support-domain conditions.',
  },
];

export function buildDomainAcceptanceReportManifest() {
  return [
    ...PRODUCT_DOMAIN_IDS.flatMap((domainId) => (
      PRODUCT_PANEL_DEFINITIONS.map((definition) => buildManifestEntry(domainId, definition))
    )),
    ...SUPPORT_DOMAIN_IDS.flatMap((domainId) => (
      SUPPORT_PANEL_DEFINITIONS.map((definition) => buildManifestEntry(domainId, definition))
    )),
  ];
}

function buildManifestEntry(domainId, definition) {
  return {
    domainId,
    panelId: definition.panelId,
    reportPattern: `reports/domain/${domainId}/${definition.fileKey}*.json`,
    generatorCommand: `node scripts/data/audit/domain-readiness-audit.mjs --domain=${domainId} --panel=${definition.generatorPanel}`,
    writesDatabase: false,
    requiresDatabase: false,
    notes: definition.notes,
    ...REPORT_FRESHNESS_POLICY,
  };
}

function main() {
  process.stdout.write(`${JSON.stringify(buildDomainAcceptanceReportManifest(), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

