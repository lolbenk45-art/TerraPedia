import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildDomainAcceptanceReportManifest } from './domain-acceptance-report-manifest.mjs';
import { buildBackendDataRefreshPlan } from './backend-data-refresh-plan.mjs';

const execFileAsync = promisify(execFile);

const EXPECTED_DOMAIN_IDS = [
  'armor_sets',
  'bosses',
  'buffs',
  'items',
  'npcs',
  'projectiles',
  'support.category',
  'support.item_group',
  'support.recipe',
  'support.shimmer',
  'support.town_npc_maintenance',
];

const DANGEROUS_COMMAND_PATTERNS = [
  /--apply=true/i,
  /--mode=apply/i,
  /\bimport\b/i,
  /\bbackfill\b/i,
  /\bapply\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brm\b/i,
  /\bcrawl\b/i,
  /\bload\b/i,
];

test('domain manifest registers every B-tier upgrade target', () => {
  const manifest = buildDomainAcceptanceReportManifest();

  assert.ok(Array.isArray(manifest));
  assert.deepEqual(
    [...new Set(manifest.map((entry) => entry.domainId))].sort(),
    [...EXPECTED_DOMAIN_IDS].sort(),
  );
});

test('domain manifest entries declare safe freshness and evidence metadata', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const backendStepIds = new Set(buildBackendDataRefreshPlan().actions.map((action) => action.id));

  for (const entry of manifest) {
    assert.equal(typeof entry.domainId, 'string');
    assert.equal(typeof entry.panelId, 'string');
    assert.equal(typeof entry.reportPattern, 'string');
    assert.equal(typeof entry.generatorCommand, 'string');
    assert.equal(typeof entry.writesDatabase, 'boolean');
    assert.equal(typeof entry.requiresDatabase, 'boolean');
    assert.equal(entry.tier, 'B');
    assert.match(entry.domainType, /^(product|support)$/);
    assert.equal(typeof entry.domainChainStage, 'string');
    assert.equal(typeof entry.chainStage, 'string');
    assert.equal(typeof entry.maintenanceLane, 'string');
    assert.equal(entry.maintenanceLane, 'domain-acceptance-evidence');
    assert.ok(Array.isArray(entry.backendRefreshStepIds), `${entry.domainId}/${entry.panelId} should declare backend refresh steps`);
    assert.ok(entry.backendRefreshStepIds.length > 0, `${entry.domainId}/${entry.panelId} should route to at least one backend refresh step`);
    assert.ok(
      entry.backendRefreshStepIds.every((stepId) => backendStepIds.has(stepId)),
      `${entry.domainId}/${entry.panelId} should only route to known backend refresh steps`,
    );
    assert.equal(
      entry.backendRefreshPlanCommand,
      `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=${entry.backendRefreshStepIds.join(',')}`,
    );
    assert.ok(
      entry.managementRoute === null || typeof entry.managementRoute === 'string',
      `${entry.domainId}/${entry.panelId} managementRoute should be explicit`,
    );
    assert.ok(
      entry.publicRoute === null || typeof entry.publicRoute === 'string',
      `${entry.domainId}/${entry.panelId} publicRoute should be explicit`,
    );
    assert.match(entry.publicExposure, /^(public|planned-public|admin-only)$/);
    assert.equal(typeof entry.notes, 'string');
    assert.equal(typeof entry.freshnessSource, 'string');
    assert.equal(entry.freshnessSource, 'report-generatedAt-or-mtime');
    assert.equal(entry.staleAfterHours, 24);
    assert.deepEqual(entry.nextEvidenceWhen, ['missing', 'stale', 'unknown', 'unreadable']);
    assert.equal(entry.statusImpact, 'stale-pass-to-warning');
    assert.ok(entry.acceptedWarning === null || typeof entry.acceptedWarning === 'object');
  }
});

test('domain manifest carries valid accepted-warning metadata per panel from registry only', () => {
  const registry = minimalRegistry({
    panelSets: {
      product: ['publicReadiness'],
    },
    panels: {
      publicReadiness: {
        panelId: 'publicReadiness',
        fileKey: 'public-readiness',
        generatorPanel: 'public',
        chainStage: 'public',
        maintenanceLane: 'domain-acceptance-evidence',
        autoMaintenanceAllowed: true,
        blockingBeforePublic: true,
        requiresDatabase: false,
        writesDatabase: false,
        notes: 'Synthetic public panel.',
      },
    },
    domains: [
      {
        domainId: 'synthetic',
        domainType: 'product',
        tier: 'B',
        chainStage: 'product-readiness',
        panelSet: 'product',
        backendRefreshStepIds: ['boss-sync'],
        managementRoute: '/synthetic',
        publicExposure: 'planned-public',
        publicRoute: null,
        acceptedWarnings: [
          {
            panelId: 'publicReadiness',
            reason: 'Stale public evidence accepted for readiness review only.',
            approvedBy: 'controller',
            approvedAt: '2026-05-03T00:00:00Z',
            expiresAt: '2026-05-10T00:00:00Z',
            readinessOnly: true,
          },
        ],
      },
    ],
  });

  const [entry] = buildDomainAcceptanceReportManifest({ registry });

  assert.deepEqual(entry.acceptedWarning, {
    panelId: 'publicReadiness',
    reason: 'Stale public evidence accepted for readiness review only.',
    approvedBy: 'controller',
    approvedAt: '2026-05-03T00:00:00Z',
    expiresAt: '2026-05-10T00:00:00Z',
    readinessOnly: true,
  });
});

test('domain manifest routes B-tier domains to backend refresh steps', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const stepsByDomain = new Map(manifest.map((entry) => [entry.domainId, entry.backendRefreshStepIds]));

  assert.deepEqual(stepsByDomain.get('items'), ['wiki-core-refresh', 'item-pages-refresh', 'recipe-reference-sync', 'item-detail-sync']);
  assert.deepEqual(stepsByDomain.get('npcs'), ['wiki-core-refresh', 'town-npc-sync']);
  assert.deepEqual(stepsByDomain.get('bosses'), ['wiki-core-refresh', 'boss-sync']);
  assert.deepEqual(stepsByDomain.get('buffs'), ['independent-entity-sync']);
  assert.deepEqual(stepsByDomain.get('projectiles'), ['independent-entity-sync']);
  assert.deepEqual(stepsByDomain.get('armor_sets'), ['independent-entity-sync']);
  assert.deepEqual(stepsByDomain.get('support.recipe'), ['recipe-reference-sync']);
  assert.deepEqual(stepsByDomain.get('support.shimmer'), ['shimmer-sync']);
  assert.deepEqual(stepsByDomain.get('support.category'), ['support-sync']);
  assert.deepEqual(stepsByDomain.get('support.item_group'), ['support-sync']);
  assert.deepEqual(stepsByDomain.get('support.town_npc_maintenance'), ['town-npc-sync']);
});

test('domain registry fails closed for malformed maintenance definitions', () => {
  const registry = minimalRegistry({
    domains: [
      {
        domainId: 'synthetic',
        domainType: 'support',
        tier: 'B',
        chainStage: 'support-readiness',
        panelSet: 'missing-set',
        backendRefreshStepIds: ['support-sync'],
        managementRoute: '/synthetic',
        publicExposure: 'admin-only',
        publicRoute: null,
      },
    ],
  });

  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Unknown domain acceptance panel set: missing-set/,
  );

  registry.domains[0].panelSet = 'support';
  registry.domains.push({ ...registry.domains[0] });
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Duplicate domain acceptance domainId: synthetic/,
  );

  registry.domains.pop();
  registry.domains[0].backendRefreshStepIds = ['missing-sync'];
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Unknown backend refresh step for synthetic: missing-sync/,
  );

  registry.domains[0].backendRefreshStepIds = ['support-sync'];
  registry.panels.unusedBrokenPanel = {
    panelId: 'unusedBrokenPanel',
    generatorPanel: 'source',
    chainStage: 'source',
    maintenanceLane: 'domain-acceptance-evidence',
    autoMaintenanceAllowed: true,
    blockingBeforePublic: false,
    requiresDatabase: false,
    writesDatabase: false,
    notes: 'Broken unused panel.',
  };
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Domain acceptance registry missing required string: unusedBrokenPanel\.fileKey/,
  );
});

test('domain registry fails closed for malformed public exposure definitions', () => {
  const registry = minimalRegistry({
    domains: [
      {
        domainId: 'synthetic',
        domainType: 'support',
        tier: 'B',
        chainStage: 'support-readiness',
        panelSet: 'support',
        backendRefreshStepIds: ['support-sync'],
        managementRoute: '/synthetic',
        publicRoute: null,
      },
    ],
  });

  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Domain acceptance registry missing required string: synthetic\.publicExposure/,
  );

  registry.domains[0].publicExposure = 'future-public';
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Unknown publicExposure for synthetic: future-public/,
  );

  registry.domains[0].publicExposure = 'planned-public';
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Support domain must be admin-only: synthetic/,
  );

  registry.domains[0].domainType = 'product';
  registry.domains[0].publicExposure = 'public';
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Public domain must declare publicRoute: synthetic/,
  );

  registry.domains[0].publicExposure = 'planned-public';
  registry.domains[0].publicRoute = '/synthetic';
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Planned-public domain must not declare publicRoute before promotion: synthetic/,
  );

  registry.domains[0].domainType = 'support';
  registry.domains[0].publicExposure = 'admin-only';
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Admin-only domain must not declare publicRoute: synthetic/,
  );
});

test('domain registry fails closed for malformed accepted-warning definitions', () => {
  const domain = {
    domainId: 'synthetic',
    domainType: 'product',
    tier: 'B',
    chainStage: 'product-readiness',
    panelSet: 'product',
    backendRefreshStepIds: ['boss-sync'],
    managementRoute: '/synthetic',
    publicExposure: 'planned-public',
    publicRoute: null,
    acceptedWarnings: [
      {
        panelId: 'publicReadiness',
        reason: 'Accepted for readiness review only.',
        approvedBy: 'controller',
        approvedAt: '2026-05-03T00:00:00Z',
        expiresAt: '2026-05-10T00:00:00Z',
        readinessOnly: true,
      },
    ],
  };
  const registry = minimalRegistry({
    panelSets: {
      product: ['publicReadiness'],
    },
    panels: {
      publicReadiness: {
        panelId: 'publicReadiness',
        fileKey: 'public-readiness',
        generatorPanel: 'public',
        chainStage: 'public',
        maintenanceLane: 'domain-acceptance-evidence',
        autoMaintenanceAllowed: true,
        blockingBeforePublic: true,
        requiresDatabase: false,
        writesDatabase: false,
        notes: 'Synthetic public panel.',
      },
    },
    domains: [domain],
  });

  delete domain.acceptedWarnings[0].approvedBy;
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Domain acceptance acceptedWarning missing required string: synthetic\.acceptedWarnings\[0\]\.approvedBy/,
  );

  domain.acceptedWarnings[0].approvedBy = 'controller';
  domain.acceptedWarnings[0].readinessOnly = false;
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Domain acceptance acceptedWarning must declare readinessOnly=true: synthetic\.acceptedWarnings\[0\]\.readinessOnly/,
  );

  domain.acceptedWarnings[0].readinessOnly = true;
  domain.acceptedWarnings[0].panelId = 'missingPanel';
  assert.throws(
    () => buildDomainAcceptanceReportManifest({ registry }),
    /Unknown domain acceptance acceptedWarning panelId for synthetic: missingPanel/,
  );
});

test('domain manifest is expanded from the registry single source of truth', () => {
  const registryPath = path.resolve('scripts/data/workflow/domain-acceptance-registry.json');
  assert.equal(fs.existsSync(registryPath), true, 'domain acceptance registry should exist');

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.equal(registry.version, 1);
  assert.deepEqual(
    [...new Set(registry.domains.map((domain) => domain.domainId))].sort(),
    [...EXPECTED_DOMAIN_IDS].sort(),
  );

  const manifest = buildDomainAcceptanceReportManifest();
  for (const domain of registry.domains) {
    const entries = manifest.filter((entry) => entry.domainId === domain.domainId);
    const panelSet = registry.panelSets[domain.panelSet];
    assert.ok(panelSet, `${domain.domainId} should reference a registered panelSet`);
    assert.equal(entries.length, panelSet.length);
    assert.ok(entries.every((entry) => entry.domainType === domain.domainType));
    assert.ok(entries.every((entry) => entry.domainChainStage === domain.chainStage));
    assert.ok(entries.every((entry) => entry.managementRoute === domain.managementRoute));
    assert.ok(entries.every((entry) => entry.publicExposure === domain.publicExposure));
  }
});

test('domain manifest generator commands are read-only and mutation-free', () => {
  const manifest = buildDomainAcceptanceReportManifest();

  for (const entry of manifest) {
    assert.equal(entry.writesDatabase, false, `${entry.domainId}/${entry.panelId} must be read-only`);
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      assert.doesNotMatch(
        entry.generatorCommand,
        pattern,
        `${entry.domainId}/${entry.panelId} command must not match ${pattern}`,
      );
    }
  }
});

test('domain manifest generator command targets exist in the repository', () => {
  const manifest = buildDomainAcceptanceReportManifest();

  for (const entry of manifest) {
    const scriptPath = extractNodeScriptPath(entry.generatorCommand);
    assert.ok(scriptPath, `${entry.domainId}/${entry.panelId} should call a node script`);
    assert.ok(
      fs.existsSync(path.resolve(scriptPath)),
      `${entry.domainId}/${entry.panelId} generator target should exist: ${scriptPath}`,
    );
  }
});

test('product domains get source relation image and public readiness panels', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const productDomains = ['items', 'npcs', 'bosses', 'buffs', 'projectiles', 'armor_sets'];

  for (const domainId of productDomains) {
    const panelIds = manifest
      .filter((entry) => entry.domainId === domainId)
      .map((entry) => entry.panelId)
      .sort();

    assert.ok(panelIds.includes('imageReadiness'));
    assert.ok(panelIds.includes('publicReadiness'));
    assert.ok(panelIds.includes('relationReadiness'));
    assert.ok(panelIds.includes('sourceReadiness'));
    assert.ok(panelIds.includes('unresolvedAuditTrend'));
  }
});

test('product domains remain planned-public while P3 public route rollout is closed', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const firstEntryByDomain = new Map();

  for (const entry of manifest) {
    if (!firstEntryByDomain.has(entry.domainId)) {
      firstEntryByDomain.set(entry.domainId, entry);
    }
  }

  for (const domainId of ['items', 'npcs', 'bosses', 'buffs', 'projectiles', 'armor_sets']) {
    assert.equal(firstEntryByDomain.get(domainId).publicExposure, 'planned-public');
    assert.equal(firstEntryByDomain.get(domainId).publicRoute, null);
  }
});

test('support domains start with source readiness and blocking-gate panels', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const supportDomains = EXPECTED_DOMAIN_IDS.filter((domainId) => domainId.startsWith('support.'));

  for (const domainId of supportDomains) {
    const panelIds = manifest
      .filter((entry) => entry.domainId === domainId)
      .map((entry) => entry.panelId)
      .sort();

    assert.deepEqual(panelIds, ['b1ExemptionCompliance', 'blockingGate', 'sourceReadiness']);
  }
});

test('b1 exemption compliance panel uses its dedicated read-only audit command', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const shimmerPanel = manifest.find((entry) => (
    entry.domainId === 'support.shimmer' && entry.panelId === 'b1ExemptionCompliance'
  ));

  assert.ok(shimmerPanel);
  assert.equal(
    shimmerPanel.generatorCommand,
    'node scripts/data/audit/b1-exemption-compliance.mjs --domain=support.shimmer',
  );
  assert.equal(shimmerPanel.blockingBeforePublic, true);
  assert.equal(shimmerPanel.writesDatabase, false);
});

test('unresolved audit trend panel uses dedicated read-only candidate generation command', () => {
  const manifest = buildDomainAcceptanceReportManifest();
  const bossesPanel = manifest.find((entry) => (
    entry.domainId === 'bosses' && entry.panelId === 'unresolvedAuditTrend'
  ));

  assert.ok(bossesPanel);
  assert.equal(
    bossesPanel.generatorCommand,
    'node scripts/data/relation/generate-reresolve-candidates.mjs',
  );
  assert.equal(bossesPanel.chainStage, 'relation');
  assert.equal(bossesPanel.writesDatabase, false);
  assert.equal(bossesPanel.requiresDatabase, false);
});

test('CLI prints legal JSON and does not execute evidence commands', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['scripts/data/workflow/domain-acceptance-report-manifest.mjs'],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), buildDomainAcceptanceReportManifest());
});

test('backend domain acceptance service mirrors manifest contract exactly', () => {
  const source = fs.readFileSync(
    'back/src/main/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImpl.java',
    'utf8',
  );
  assert.match(source, /domain-acceptance-registry\.json/);
  assert.doesNotMatch(source, /PRODUCT_DOMAIN_IDS/);
  assert.doesNotMatch(source, /SUPPORT_DOMAIN_IDS/);
  assert.doesNotMatch(source, /PRODUCT_PANEL_DEFINITIONS/);
  assert.doesNotMatch(source, /SUPPORT_PANEL_DEFINITIONS/);
});

function extractNodeScriptPath(command) {
  const match = String(command).match(/^node\s+([^\s]+\.mjs)\b/);
  return match?.[1] ?? null;
}

function minimalRegistry(overrides = {}) {
  return {
    version: 1,
    freshness: {
      freshnessSource: 'report-generatedAt-or-mtime',
      staleAfterHours: 24,
      nextEvidenceWhen: ['missing', 'stale', 'unknown', 'unreadable'],
      statusImpact: 'stale-pass-to-warning',
    },
    panelSets: {
      support: ['sourceReadiness'],
      product: ['publicReadiness'],
    },
    panels: {
      sourceReadiness: {
        panelId: 'sourceReadiness',
        fileKey: 'source-readiness',
        generatorPanel: 'source',
        chainStage: 'source',
        maintenanceLane: 'domain-acceptance-evidence',
        autoMaintenanceAllowed: true,
        blockingBeforePublic: false,
        requiresDatabase: false,
        writesDatabase: false,
        notes: 'Synthetic source panel.',
      },
      publicReadiness: {
        panelId: 'publicReadiness',
        fileKey: 'public-readiness',
        generatorPanel: 'public',
        chainStage: 'public',
        maintenanceLane: 'domain-acceptance-evidence',
        autoMaintenanceAllowed: true,
        blockingBeforePublic: true,
        requiresDatabase: false,
        writesDatabase: false,
        notes: 'Synthetic public panel.',
      },
    },
    domains: [],
    ...overrides,
  };
}
