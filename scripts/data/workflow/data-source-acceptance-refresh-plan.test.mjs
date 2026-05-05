import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  buildDataSourceAcceptanceRefreshPlan,
} from './data-source-acceptance-refresh-plan.mjs';

const execFileAsync = promisify(execFile);

test('buildDataSourceAcceptanceRefreshPlan converts stale missing and unknown evidence into manual actions', () => {
  const plan = buildDataSourceAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    includeExternal: true,
    audit: {
      generatedAt: '2026-05-03T12:00:00Z',
      overallStatus: 'warning',
      panels: [
        {
          panelId: 'relationHealth',
          freshnessStatus: 'fresh',
          nextEvidenceCommand: null,
          commandRisk: 'safe-read-only',
          requiresDatabase: false,
          writesDatabase: false,
        },
        {
          panelId: 'replacementReadiness',
          freshnessStatus: 'stale',
          freshnessReason: 'Evidence is older than 24 hours.',
          nextEvidenceCommand: 'node scripts/data/relation/replacement-readiness-audit.mjs',
          commandRisk: 'safe-read-only',
          requiresDatabase: true,
          writesDatabase: false,
        },
        {
          panelId: 'sourceGroupAudit',
          freshnessStatus: 'stale',
          freshnessReason: 'Evidence is older than 24 hours.',
          nextEvidenceCommand: 'node scripts/data/audit/audit-any-item-group-sources.mjs',
          commandRisk: 'safe-read-only',
          requiresDatabase: false,
          writesDatabase: false,
        },
        {
          panelId: 'imageReadiness',
          freshnessStatus: 'missing',
          freshnessReason: 'No matching acceptance report evidence found.',
          nextEvidenceCommand: 'node scripts/data/audit/image-asset-readiness-audit.mjs --source=db',
          commandRisk: 'safe-read-only',
          requiresDatabase: true,
          writesDatabase: false,
        },
        {
          panelId: 'crawlerMonitor',
          freshnessStatus: 'unknown',
          freshnessReason: 'External monitor evidence is not read by the offline audit.',
          nextEvidenceCommand: 'read-only monitor overview: GET /admin/crawler-monitor/overview',
          commandRisk: 'external-read-only',
          requiresDatabase: false,
          writesDatabase: false,
        },
      ],
    },
  });

  assert.equal(plan.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(plan.overallStatus, 'needs_confirmation');
  assert.deepEqual(plan.summary, {
    actionCount: 4,
    readyCount: 1,
    confirmationCount: 3,
    blockedCount: 0,
    safeReadOnlyCount: 3,
    externalReadOnlyCount: 1,
    unsafeActionCount: 0,
    databaseRequiredCount: 2,
    manualOnlyCount: 4,
    planOnlyCount: 4,
  });
  assert.deepEqual(plan.blockingReasons, []);
  assert.deepEqual(plan.confirmationReasons, [
    'replacementReadiness requires local database confirmation',
    'imageReadiness requires local database confirmation',
    'crawlerMonitor evidence is unknown',
  ]);
  assert.deepEqual(plan.actions.map((action) => action.panelId), [
    'replacementReadiness',
    'sourceGroupAudit',
    'imageReadiness',
    'crawlerMonitor',
  ]);
  assert.ok(plan.actions.every((action) => action.executeMode === 'manual'));
  assert.ok(plan.actions.every((action) => action.executionPolicy === 'plan-only'));
  assert.ok(plan.actions.every((action) => action.writesDatabase === false));
  assert.deepEqual(plan.actions.map((action) => action.status), [
    'needs_confirmation',
    'ready',
    'needs_confirmation',
    'needs_confirmation',
  ]);
  assert.equal(plan.actions[0].command, 'node scripts/data/relation/replacement-readiness-audit.mjs');
  assert.equal(plan.actions[0].reason, 'Evidence is older than 24 hours.');
});

test('buildDataSourceAcceptanceRefreshPlan skips external monitor actions by default', () => {
  const plan = buildDataSourceAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    audit: {
      panels: [
        {
          panelId: 'crawlerMonitor',
          freshnessStatus: 'unknown',
          nextEvidenceCommand: 'read-only monitor overview: GET /admin/crawler-monitor/overview',
          commandRisk: 'external-read-only',
          requiresDatabase: false,
          writesDatabase: false,
        },
      ],
    },
  });

  assert.equal(plan.overallStatus, 'empty');
  assert.deepEqual(plan.actions, []);
});

test('buildDataSourceAcceptanceRefreshPlan blocks unsafe commands and never marks them executable', () => {
  const plan = buildDataSourceAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    audit: {
      panels: [
        {
          panelId: 'unsafePanel',
          freshnessStatus: 'missing',
          nextEvidenceCommand: 'node scripts/data/import/import-standardized-to-db.mjs',
          commandRisk: 'unsafe',
          requiresDatabase: true,
          writesDatabase: false,
        },
      ],
    },
  });

  assert.equal(plan.overallStatus, 'blocked');
  assert.deepEqual(plan.blockingReasons, ['unsafePanel generator command is unsafe']);
  assert.equal(plan.actions[0].executeMode, 'manual');
  assert.equal(plan.actions[0].executionPolicy, 'plan-only');
  assert.equal(plan.actions[0].commandRisk, 'unsafe');
  assert.equal(plan.actions[0].status, 'blocked');
});

test('buildDataSourceAcceptanceRefreshPlan blocks database-writing commands even when they look safe', () => {
  const plan = buildDataSourceAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    audit: {
      panels: [
        {
          panelId: 'dbWriterPanel',
          freshnessStatus: 'missing',
          nextEvidenceCommand: 'node scripts/data/audit/image-asset-readiness-audit.mjs --source=db',
          commandRisk: 'safe-read-only',
          requiresDatabase: true,
          writesDatabase: true,
        },
      ],
    },
  });

  assert.equal(plan.overallStatus, 'blocked');
  assert.deepEqual(plan.blockingReasons, ['dbWriterPanel generator command writes database']);
  assert.equal(plan.actions[0].status, 'blocked');
});

test('buildDataSourceAcceptanceRefreshPlan requires confirmation for unknown command risk', () => {
  const plan = buildDataSourceAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    audit: {
      panels: [
        {
          panelId: 'unknownRiskPanel',
          freshnessStatus: 'stale',
          nextEvidenceCommand: 'node scripts/data/audit/audit-any-item-group-sources.mjs',
          commandRisk: 'unknown',
          requiresDatabase: false,
          writesDatabase: false,
        },
      ],
    },
  });

  assert.equal(plan.overallStatus, 'needs_confirmation');
  assert.equal(plan.actions[0].status, 'needs_confirmation');
  assert.equal(plan.actions[0].commandRisk, 'unknown');
  assert.deepEqual(plan.confirmationReasons, ['unknownRiskPanel command risk is unknown']);
});

test('buildDataSourceAcceptanceRefreshPlan blocks stale evidence without a refresh command', () => {
  const plan = buildDataSourceAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    audit: {
      panels: [
        {
          panelId: 'missingCommandPanel',
          freshnessStatus: 'stale',
          nextEvidenceCommand: null,
          commandRisk: 'safe-read-only',
          requiresDatabase: false,
          writesDatabase: false,
        },
      ],
    },
  });

  assert.equal(plan.overallStatus, 'blocked');
  assert.deepEqual(plan.blockingReasons, ['missingCommandPanel evidence command is missing']);
  assert.equal(plan.summary.blockedCount, 1);
  assert.equal(plan.actions[0].executeMode, 'manual');
  assert.equal(plan.actions[0].executionPolicy, 'plan-only');
  assert.equal(plan.actions[0].status, 'blocked');
});

test('refresh plan source does not write files or execute commands', () => {
  const refreshPlanSource = fs.readFileSync(
    'scripts/data/workflow/data-source-acceptance-refresh-plan.mjs',
    'utf8',
  );

  assert.match(refreshPlanSource, /buildDataSourceAcceptanceFreshnessAudit/);
  assert.doesNotMatch(refreshPlanSource, /\bspawn\b|\bexec\b|execFile|spawnSync/);
  assert.doesNotMatch(refreshPlanSource, /\bwriteFile\b|\bwriteFileSync\b/);
});

test('CLI reads an audit JSON file and prints a refresh plan without executing action commands', async () => {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'terrapedia-refresh-plan-'));
  const auditFilePath = path.join(tempDir, 'audit.json');
  const audit = {
    generatedAt: '2026-05-03T11:59:00Z',
    panels: [
      {
        panelId: 'sourceGroupAudit',
        freshnessStatus: 'stale',
        nextEvidenceCommand: 'node scripts/data/audit/audit-any-item-group-sources.mjs',
        commandRisk: 'safe-read-only',
        requiresDatabase: false,
        writesDatabase: false,
      },
    ],
  };
  await fsPromises.writeFile(auditFilePath, `${JSON.stringify(audit)}\n`, 'utf8');

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        'scripts/data/workflow/data-source-acceptance-refresh-plan.mjs',
        '--generated-at=2026-05-03T12:00:00Z',
        `--audit=${auditFilePath}`,
      ],
      { cwd: process.cwd() },
    );

    assert.equal(stderr, '');
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.generatedAt, '2026-05-03T12:00:00Z');
    assert.equal(parsed.auditGeneratedAt, '2026-05-03T11:59:00Z');
    assert.ok(Array.isArray(parsed.actions));
    assert.ok(parsed.actions.every((action) => action.executeMode === 'manual'));
    assert.ok(parsed.actions.every((action) => action.executionPolicy === 'plan-only'));
    assert.deepEqual(parsed.actions.map((action) => action.panelId), ['sourceGroupAudit']);
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
});
