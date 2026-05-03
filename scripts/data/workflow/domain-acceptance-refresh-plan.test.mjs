import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildDomainAcceptanceRefreshPlan } from './domain-acceptance-refresh-plan.mjs';

const execFileAsync = promisify(execFile);

test('domain refresh plan converts stale missing and unknown evidence into manual actions', () => {
  const plan = buildDomainAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    audit: {
      generatedAt: '2026-05-03T11:59:00Z',
      panels: [
        {
          domainId: 'bosses',
          panelId: 'sourceReadiness',
          freshnessStatus: 'fresh',
          nextEvidenceCommand: null,
          commandRisk: 'safe-read-only',
          requiresDatabase: false,
          writesDatabase: false,
        },
        {
          domainId: 'bosses',
          panelId: 'relationReadiness',
          freshnessStatus: 'stale',
          freshnessReason: 'Evidence is older than 24 hours.',
          nextEvidenceCommand: 'node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=relation',
          commandRisk: 'safe-read-only',
          requiresDatabase: true,
          writesDatabase: false,
        },
        {
          domainId: 'bosses',
          panelId: 'publicReadiness',
          freshnessStatus: 'missing',
          freshnessReason: 'No matching domain acceptance report evidence found.',
          nextEvidenceCommand: 'node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=public',
          commandRisk: 'safe-read-only',
          requiresDatabase: false,
          writesDatabase: false,
        },
        {
          domainId: 'buffs',
          panelId: 'imageReadiness',
          freshnessStatus: 'unknown',
          freshnessReason: 'Domain acceptance report JSON is unreadable or invalid.',
          nextEvidenceCommand: 'node scripts/data/audit/domain-readiness-audit.mjs --domain=buffs --panel=image',
          commandRisk: 'safe-read-only',
          requiresDatabase: true,
          writesDatabase: false,
        },
      ],
    },
  });

  assert.equal(plan.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(plan.auditGeneratedAt, '2026-05-03T11:59:00Z');
  assert.equal(plan.overallStatus, 'needs_confirmation');
  assert.deepEqual(plan.summary, {
    actionCount: 3,
    readyCount: 1,
    confirmationCount: 2,
    blockedCount: 0,
    safeReadOnlyCount: 3,
    unsafeActionCount: 0,
    databaseRequiredCount: 2,
    manualOnlyCount: 3,
    affectedDomainCount: 2,
  });
  assert.deepEqual(plan.actions.map((action) => `${action.domainId}/${action.panelId}`), [
    'bosses/relationReadiness',
    'bosses/publicReadiness',
    'buffs/imageReadiness',
  ]);
  assert.ok(plan.actions.every((action) => action.executeMode === 'manual'));
  assert.deepEqual(plan.actions.map((action) => action.status), [
    'needs_confirmation',
    'ready',
    'needs_confirmation',
  ]);
});

test('domain refresh plan blocks unsafe commands and database writers', () => {
  const plan = buildDomainAcceptanceRefreshPlan({
    generatedAt: '2026-05-03T12:00:00Z',
    audit: {
      panels: [
        {
          domainId: 'buffs',
          panelId: 'sourceReadiness',
          freshnessStatus: 'missing',
          nextEvidenceCommand: 'node scripts/data/import/import-buffs-to-db.mjs',
          commandRisk: 'unsafe',
          requiresDatabase: true,
          writesDatabase: false,
        },
        {
          domainId: 'armor_sets',
          panelId: 'imageReadiness',
          freshnessStatus: 'missing',
          nextEvidenceCommand: 'node scripts/data/audit/domain-readiness-audit.mjs --domain=armor_sets --panel=image',
          commandRisk: 'safe-read-only',
          requiresDatabase: true,
          writesDatabase: true,
        },
      ],
    },
  });

  assert.equal(plan.overallStatus, 'blocked');
  assert.deepEqual(plan.blockingReasons, [
    'buffs/sourceReadiness generator command is unsafe',
    'armor_sets/imageReadiness generator command writes database',
  ]);
  assert.deepEqual(plan.actions.map((action) => action.status), ['blocked', 'blocked']);
  assert.ok(plan.actions.every((action) => action.executeMode === 'manual'));
});

test('domain refresh plan source does not write files or execute commands', () => {
  const source = fs.readFileSync('scripts/data/workflow/domain-acceptance-refresh-plan.mjs', 'utf8');

  assert.match(source, /buildDomainAcceptanceFreshnessAudit/);
  assert.doesNotMatch(source, /\bspawn\b|\bexec\b|execFile|spawnSync/);
  assert.doesNotMatch(source, /\bwriteFile\b|\bwriteFileSync\b/);
});

test('CLI reads an audit file and prints manual-only domain actions', async () => {
  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'terrapedia-domain-refresh-plan-'));
  const auditFilePath = path.join(tempDir, 'audit.json');
  const audit = {
    generatedAt: '2026-05-03T11:59:00Z',
    panels: [
      {
        domainId: 'projectiles',
        panelId: 'sourceReadiness',
        freshnessStatus: 'stale',
        nextEvidenceCommand: 'node scripts/data/audit/domain-readiness-audit.mjs --domain=projectiles --panel=source',
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
        'scripts/data/workflow/domain-acceptance-refresh-plan.mjs',
        '--generated-at=2026-05-03T12:00:00Z',
        `--audit=${auditFilePath}`,
      ],
      { cwd: process.cwd() },
    );

    assert.equal(stderr, '');
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.generatedAt, '2026-05-03T12:00:00Z');
    assert.deepEqual(parsed.actions.map((action) => `${action.domainId}/${action.panelId}`), [
      'projectiles/sourceReadiness',
    ]);
    assert.ok(parsed.actions.every((action) => action.executeMode === 'manual'));
  } finally {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  }
});

