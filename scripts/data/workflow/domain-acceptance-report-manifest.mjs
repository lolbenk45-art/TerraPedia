#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBackendDataRefreshPlan } from './backend-data-refresh-plan.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, 'domain-acceptance-registry.json');
const PUBLIC_EXPOSURE_VALUES = new Set(['public', 'planned-public', 'admin-only']);

export function loadDomainAcceptanceRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

export function buildDomainAcceptanceReportManifest({ registry = loadDomainAcceptanceRegistry() } = {}) {
  const validatedRegistry = validateDomainAcceptanceRegistry(registry);
  return registry.domains.flatMap((domain) => {
    const panelSet = validatedRegistry.panelSets[domain.panelSet];
    return panelSet.map((panelId) => {
      const definition = validatedRegistry.panels[panelId];
      return buildManifestEntry(domain, definition, validatedRegistry.freshness);
    });
  });
}

export function validateDomainAcceptanceRegistry(registry) {
  if (!registry || typeof registry !== 'object') {
    throw new Error('Domain acceptance registry must be an object.');
  }
  if (!registry.freshness || typeof registry.freshness !== 'object') {
    throw new Error('Domain acceptance registry is missing freshness policy.');
  }
  if (!registry.panelSets || typeof registry.panelSets !== 'object') {
    throw new Error('Domain acceptance registry is missing panel sets.');
  }
  if (!registry.panels || typeof registry.panels !== 'object') {
    throw new Error('Domain acceptance registry is missing panels.');
  }
  if (!Array.isArray(registry.domains) || registry.domains.length === 0) {
    throw new Error('Domain acceptance registry has no domains.');
  }

  const knownBackendStepIds = new Set(buildBackendDataRefreshPlan().actions.map((action) => action.id));
  const domainIds = new Set();
  for (const definition of Object.values(registry.panels)) {
    validatePanelDefinition(definition);
  }
  for (const domain of registry.domains) {
    assertRequiredString(domain?.domainId, 'domainId');
    if (domainIds.has(domain.domainId)) {
      throw new Error(`Duplicate domain acceptance domainId: ${domain.domainId}`);
    }
    domainIds.add(domain.domainId);
    assertRequiredString(domain.domainType, `${domain.domainId}.domainType`);
    assertRequiredString(domain.tier, `${domain.domainId}.tier`);
    assertRequiredString(domain.chainStage, `${domain.domainId}.chainStage`);
    assertRequiredString(domain.panelSet, `${domain.domainId}.panelSet`);
    assertRequiredString(domain.managementRoute, `${domain.domainId}.managementRoute`);
    assertRequiredString(domain.publicExposure, `${domain.domainId}.publicExposure`);
    if (!Object.hasOwn(domain, 'publicRoute')) {
      throw new Error(`Domain acceptance domain must explicitly declare publicRoute: ${domain.domainId}`);
    }
    validatePublicExposure(domain);
    const panelSet = registry.panelSets[domain.panelSet];
    if (!Array.isArray(panelSet) || panelSet.length === 0) {
      throw new Error(`Unknown domain acceptance panel set: ${domain.panelSet}`);
    }
    if (!Array.isArray(domain.backendRefreshStepIds) || domain.backendRefreshStepIds.length === 0) {
      throw new Error(`Domain acceptance domain must declare backendRefreshStepIds: ${domain.domainId}`);
    }
    for (const stepId of domain.backendRefreshStepIds) {
      assertRequiredString(stepId, `${domain.domainId}.backendRefreshStepIds`);
      if (!knownBackendStepIds.has(stepId)) {
        throw new Error(`Unknown backend refresh step for ${domain.domainId}: ${stepId}`);
      }
    }
    for (const panelId of panelSet) {
      const definition = registry.panels?.[panelId];
      if (!definition) {
        throw new Error(`Missing domain acceptance panel definition: ${panelId}`);
      }
    }
  }

  return registry;
}

function validatePublicExposure(domain) {
  if (!PUBLIC_EXPOSURE_VALUES.has(domain.publicExposure)) {
    throw new Error(`Unknown publicExposure for ${domain.domainId}: ${domain.publicExposure}`);
  }
  const hasPublicRoute = typeof domain.publicRoute === 'string' && domain.publicRoute.trim() !== '';
  if (domain.domainType === 'support' && domain.publicExposure !== 'admin-only') {
    throw new Error(`Support domain must be admin-only: ${domain.domainId}`);
  }
  if (domain.publicExposure === 'public' && !hasPublicRoute) {
    throw new Error(`Public domain must declare publicRoute: ${domain.domainId}`);
  }
  if (domain.publicExposure === 'planned-public' && hasPublicRoute) {
    throw new Error(`Planned-public domain must not declare publicRoute before promotion: ${domain.domainId}`);
  }
  if (domain.publicExposure === 'admin-only' && hasPublicRoute) {
    throw new Error(`Admin-only domain must not declare publicRoute: ${domain.domainId}`);
  }
  if (domain.domainType === 'product' && domain.publicExposure === 'admin-only') {
    throw new Error(`Product domain must be public or planned-public: ${domain.domainId}`);
  }
}

function validatePanelDefinition(definition) {
  assertRequiredString(definition?.panelId, 'panel.panelId');
  assertRequiredString(definition.fileKey, `${definition.panelId}.fileKey`);
  assertRequiredString(definition.generatorPanel, `${definition.panelId}.generatorPanel`);
  assertRequiredString(definition.chainStage, `${definition.panelId}.chainStage`);
  assertRequiredString(definition.maintenanceLane, `${definition.panelId}.maintenanceLane`);
  assertRequiredString(definition.notes, `${definition.panelId}.notes`);
  for (const field of ['autoMaintenanceAllowed', 'blockingBeforePublic', 'requiresDatabase', 'writesDatabase']) {
    if (typeof definition[field] !== 'boolean') {
      throw new Error(`Domain acceptance panel ${definition.panelId} must declare boolean ${field}.`);
    }
  }
}

function buildManifestEntry(domain, definition, freshness) {
  const backendRefreshStepIds = [...domain.backendRefreshStepIds];
  return {
    domainId: domain.domainId,
    domainType: domain.domainType,
    tier: domain.tier,
    domainChainStage: domain.chainStage,
    managementRoute: domain.managementRoute ?? null,
    publicExposure: domain.publicExposure,
    publicRoute: domain.publicRoute ?? null,
    panelId: definition.panelId,
    chainStage: definition.chainStage,
    maintenanceLane: definition.maintenanceLane,
    maintenanceLaneId: `domain-acceptance:${domain.domainId}:${definition.panelId}`,
    backendRefreshStepIds,
    backendRefreshPlanCommand: `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=${backendRefreshStepIds.join(',')}`,
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

function assertRequiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Domain acceptance registry missing required string: ${fieldName}`);
  }
}

function main() {
  process.stdout.write(`${JSON.stringify(buildDomainAcceptanceReportManifest(), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
