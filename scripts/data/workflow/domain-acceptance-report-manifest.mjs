#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, 'domain-acceptance-registry.json');

export function loadDomainAcceptanceRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

export function buildDomainAcceptanceReportManifest({ registry = loadDomainAcceptanceRegistry() } = {}) {
  return registry.domains.flatMap((domain) => {
    const panelSet = registry.panelSets?.[domain.panelSet] ?? [];
    return panelSet.map((panelId) => {
      const definition = registry.panels?.[panelId];
      if (!definition) {
        throw new Error(`Missing domain acceptance panel definition: ${panelId}`);
      }
      return buildManifestEntry(domain, definition, registry.freshness);
    });
  });
}

function buildManifestEntry(domain, definition, freshness) {
  return {
    domainId: domain.domainId,
    domainType: domain.domainType,
    tier: domain.tier,
    domainChainStage: domain.chainStage,
    managementRoute: domain.managementRoute ?? null,
    publicRoute: domain.publicRoute ?? null,
    panelId: definition.panelId,
    chainStage: definition.chainStage,
    maintenanceLane: definition.maintenanceLane,
    maintenanceLaneId: `domain-acceptance:${domain.domainId}:${definition.panelId}`,
    autoMaintenanceAllowed: definition.autoMaintenanceAllowed === true,
    blockingBeforePublic: definition.blockingBeforePublic === true,
    reportPattern: `reports/domain/${domain.domainId}/${definition.fileKey}*.json`,
    generatorCommand: `node scripts/data/audit/domain-readiness-audit.mjs --domain=${domain.domainId} --panel=${definition.generatorPanel}`,
    writesDatabase: definition.writesDatabase === true,
    requiresDatabase: definition.requiresDatabase === true,
    notes: definition.notes,
    ...freshness,
  };
}

function main() {
  process.stdout.write(`${JSON.stringify(buildDomainAcceptanceReportManifest(), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
