import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import { buildDomainAcceptanceAGradeGate } from './domain-acceptance-a-grade-gate.mjs';

const execFileAsync = promisify(execFile);

test('A-grade gate passes when acceptance evidence is fresh and maintenance routes exist', () => {
  const gate = buildDomainAcceptanceAGradeGate({
    generatedAt: '2026-05-03T12:00:00Z',
    manifest: [
      manifestEntry('bosses', 'sourceReadiness', { publicRoute: '/bosses' }),
      manifestEntry('bosses', 'publicReadiness', { publicRoute: '/bosses' }),
    ],
    freshnessAudit: {
      overallStatus: 'pass',
      summary: {
        panelCount: 2,
        domainCount: 1,
      },
      blockingReasons: [],
      warningReasons: [],
      panels: [
        routedPanel('bosses', 'sourceReadiness', {
          chainStage: 'source',
          blockingBeforePublic: false,
        }),
        routedPanel('bosses', 'publicReadiness', {
          chainStage: 'public',
          blockingBeforePublic: true,
          publicRoute: '/bosses',
        }),
      ],
    },
    refreshPlan: {
      overallStatus: 'empty',
      actions: [],
    },
    generation: {
      summary: {
        panelCount: 2,
        passCount: 2,
        warningCount: 0,
        blockedCount: 0,
        missingCount: 0,
      },
    },
  });

  assert.equal(gate.overallStatus, 'pass');
  assert.deepEqual(gate.blockingReasons, []);
  assert.deepEqual(gate.warningReasons, []);
  assert.deepEqual(gate.summary, {
    panelCount: 2,
    domainCount: 1,
    generatedPassCount: 2,
    generatedWarningCount: 0,
    generatedBlockedCount: 0,
    freshCount: 2,
    staleCount: 0,
    missingCount: 0,
    unknownCount: 0,
    maintenanceRoutedCount: 2,
    autoMaintenanceAllowedCount: 2,
    blockingBeforePublicCount: 1,
    publicRouteMissingCount: 0,
    refreshActionCount: 0,
    refreshReadyCount: 0,
    refreshConfirmationCount: 0,
    refreshBlockedCount: 0,
  });
  assert.equal(gate.domains[0].publicGateStatus, 'public_route_configured');
  assert.equal(gate.domains[0].publicExposure, 'public');
});

test('A-grade gate warns for public panels without public route and blocks unsafe maintenance state', () => {
  const gate = buildDomainAcceptanceAGradeGate({
    generatedAt: '2026-05-03T12:00:00Z',
    manifest: [
      manifestEntry('bosses', 'sourceReadiness'),
      manifestEntry('bosses', 'publicReadiness'),
      manifestEntry('buffs', 'imageReadiness'),
    ],
    freshnessAudit: {
      overallStatus: 'warning',
      blockingReasons: [],
      warningReasons: ['bosses/sourceReadiness evidence is stale'],
      panels: [
        routedPanel('bosses', 'sourceReadiness', {
          freshnessStatus: 'stale',
          nextEvidenceCommand: 'node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=source',
        }),
        routedPanel('bosses', 'publicReadiness', {
          chainStage: 'public',
          blockingBeforePublic: true,
          publicRoute: null,
        }),
        routedPanel('buffs', 'imageReadiness', {
          backendRefreshStepIds: [],
        }),
      ],
    },
    refreshPlan: {
      overallStatus: 'blocked',
      blockingReasons: ['bosses/sourceReadiness generator command writes database'],
      actions: [
        {
          domainId: 'bosses',
          panelId: 'sourceReadiness',
          status: 'blocked',
          executeMode: 'manual',
          executionPolicy: 'plan-only',
          backendRefreshStepIds: ['boss-sync'],
        },
      ],
    },
    generation: {
      summary: {
        panelCount: 3,
        passCount: 2,
        warningCount: 1,
        blockedCount: 0,
        missingCount: 0,
      },
    },
  });

  assert.equal(gate.overallStatus, 'blocked');
  assert.deepEqual([...gate.blockingReasons].sort(), [
    'refresh plan is blocked: bosses/sourceReadiness generator command writes database',
    'buffs/imageReadiness has no backend refresh step route',
  ].sort());
  assert.deepEqual([...gate.warningReasons].sort(), [
    'domain acceptance generation has 1 warning panels',
    'bosses/sourceReadiness evidence is stale',
    'bosses/publicReadiness is blocking before public consumption but has no public route',
  ].sort());
  assert.equal(gate.summary.publicRouteMissingCount, 1);
  const bosses = gate.domains.find((domain) => domain.domainId === 'bosses');
  assert.equal(bosses.publicGateStatus, 'public_route_missing');
  assert.equal(bosses.publicGateReason, 'bosses/publicReadiness is blocking before public consumption but has no public route');
});

test('A-grade gate treats planned-public and admin-only exposure as explicit non-routed states', () => {
  const gate = buildDomainAcceptanceAGradeGate({
    generatedAt: '2026-05-03T12:00:00Z',
    manifest: [
      manifestEntry('bosses', 'publicReadiness', { publicExposure: 'planned-public' }),
      manifestEntry('support.recipe', 'blockingGate', {
        domainType: 'support',
        publicExposure: 'admin-only',
      }),
    ],
    freshnessAudit: {
      overallStatus: 'pass',
      blockingReasons: [],
      warningReasons: [],
      panels: [
        routedPanel('bosses', 'publicReadiness', {
          chainStage: 'public',
          blockingBeforePublic: true,
          publicExposure: 'planned-public',
          publicRoute: null,
        }),
        routedPanel('support.recipe', 'blockingGate', {
          domainType: 'support',
          chainStage: 'blocking',
          blockingBeforePublic: true,
          publicExposure: 'admin-only',
          publicRoute: null,
        }),
      ],
    },
    refreshPlan: {
      overallStatus: 'empty',
      actions: [],
    },
    generation: {
      summary: {
        panelCount: 2,
        passCount: 2,
        warningCount: 0,
        blockedCount: 0,
        missingCount: 0,
      },
    },
  });

  assert.equal(gate.overallStatus, 'pass');
  assert.equal(gate.summary.publicRouteMissingCount, 0);
  assert.deepEqual(gate.warningReasons, []);
  assert.equal(gate.domains.find((domain) => domain.domainId === 'bosses').publicGateStatus, 'planned_public_no_route');
  assert.equal(gate.domains.find((domain) => domain.domainId === 'support.recipe').publicGateStatus, 'admin_only');
});

test('CLI prints A-grade gate JSON without executing commands', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['scripts/data/workflow/domain-acceptance-a-grade-gate.mjs', '--generated-at=2026-05-03T12:00:00Z'],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  const gate = JSON.parse(stdout);
  assert.equal(gate.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(gate.summary.panelCount, 26);
  assert.equal(typeof gate.overallStatus, 'string');
});

test('A-grade gate source stays read-only', () => {
  const source = fs.readFileSync('scripts/data/workflow/domain-acceptance-a-grade-gate.mjs', 'utf8');

  assert.doesNotMatch(source, /\bspawn\b|\bexec\b|execFile|spawnSync/);
  assert.doesNotMatch(source, /\bwriteFile\b|\bwriteFileSync\b/);
  assert.doesNotMatch(source, /--mode=apply|--apply=true/);
});

function routedPanel(domainId, panelId, overrides = {}) {
  return {
    domainId,
    panelId,
    freshnessStatus: 'fresh',
    commandRisk: 'safe-read-only',
    requiresDatabase: false,
    writesDatabase: false,
    domainType: 'product',
    tier: 'B',
    chainStage: 'source',
    maintenanceLane: 'domain-acceptance-evidence',
    maintenanceLaneId: `domain-acceptance:${domainId}:${panelId}`,
    autoMaintenanceAllowed: true,
    blockingBeforePublic: false,
    managementRoute: `/entities/${domainId}`,
    publicExposure: 'public',
    publicRoute: null,
    backendRefreshStepIds: ['boss-sync'],
    backendRefreshPlanCommand: 'node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=boss-sync',
    ...overrides,
  };
}

function manifestEntry(domainId, panelId, overrides = {}) {
  const backendRefreshStepIds = overrides.backendRefreshStepIds ?? ['boss-sync'];
  return {
    domainId,
    panelId,
    domainType: 'product',
    tier: 'B',
    domainChainStage: 'product-readiness',
    managementRoute: `/entities/${domainId}`,
    publicExposure: 'public',
    publicRoute: null,
    backendRefreshStepIds,
    backendRefreshPlanCommand: `node scripts/data/workflow/run-backend-data-refresh.mjs --mode=plan --steps=${backendRefreshStepIds.join(',')}`,
    writesDatabase: false,
    ...overrides,
  };
}
