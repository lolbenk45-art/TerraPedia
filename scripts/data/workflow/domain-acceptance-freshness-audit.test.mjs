import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { buildDomainAcceptanceReportManifest } from './domain-acceptance-report-manifest.mjs';
import {
  buildDomainAcceptanceFreshnessAudit,
  classifyDomainAcceptanceCommandRisk,
} from './domain-acceptance-freshness-audit.mjs';

const execFileAsync = promisify(execFile);

test('domain freshness audit reports fresh stale missing and unknown evidence', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/domain/bosses/source-readiness-2026-05-03.json', {
    generatedAt: '2026-05-03T00:00:00Z',
  });
  writeJson(repoRoot, 'reports/domain/bosses/relation-readiness-2026-05-01.json', {
    generatedAt: '2026-05-01T00:00:00Z',
  });
  writeText(repoRoot, 'reports/domain/bosses/image-readiness-2026-05-03.json', '{ "generatedAt": ');

  const manifest = buildDomainAcceptanceReportManifest().filter((entry) => (
    entry.domainId === 'bosses' && [
      'sourceReadiness',
      'relationReadiness',
      'imageReadiness',
      'publicReadiness',
    ].includes(entry.panelId)
  ));
  const audit = buildDomainAcceptanceFreshnessAudit({
    repoRoot,
    manifest,
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(audit.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(audit.overallStatus, 'warning');
  assert.deepEqual(audit.summary, {
    panelCount: 4,
    domainCount: 1,
    freshCount: 1,
    staleCount: 1,
    missingCount: 1,
    unknownCount: 1,
    databaseRequiredCount: 0,
    unsafeCommandCount: 0,
    autoMaintenanceAllowedCount: 4,
    blockingBeforePublicCount: 1,
  });
  assert.deepEqual(audit.warningReasons, [
    'bosses/relationReadiness evidence is stale',
    'bosses/imageReadiness evidence is unknown',
    'bosses/publicReadiness evidence is missing',
  ]);

  assert.equal(panelById(audit, 'bosses', 'sourceReadiness').freshnessStatus, 'fresh');
  assert.equal(panelById(audit, 'bosses', 'sourceReadiness').maintenanceLane, 'domain-acceptance-evidence');
  assert.equal(panelById(audit, 'bosses', 'sourceReadiness').maintenanceLaneId, 'domain-acceptance:bosses:sourceReadiness');
  assert.equal(panelById(audit, 'bosses', 'sourceReadiness').autoMaintenanceAllowed, true);
  assert.equal(panelById(audit, 'bosses', 'publicReadiness').blockingBeforePublic, true);
  assert.equal(panelById(audit, 'bosses', 'relationReadiness').freshnessStatus, 'stale');
  assert.equal(panelById(audit, 'bosses', 'imageReadiness').freshnessReason, 'Domain acceptance report JSON is unreadable or invalid.');
  assert.equal(panelById(audit, 'bosses', 'publicReadiness').latestReportPath, null);
});

test('domain freshness audit filters by domain id', () => {
  const audit = buildDomainAcceptanceFreshnessAudit({
    repoRoot: createTempRepo(),
    domainIds: ['buffs', 'projectiles'],
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.deepEqual([...new Set(audit.panels.map((entry) => entry.domainId))].sort(), ['buffs', 'projectiles']);
  assert.equal(audit.summary.panelCount, 8);
  assert.equal(audit.summary.domainCount, 2);
});

test('domain command risk classification blocks mutation commands', () => {
  assert.equal(classifyDomainAcceptanceCommandRisk('node scripts/data/audit/domain-readiness-audit.mjs'), 'safe-read-only');
  assert.equal(classifyDomainAcceptanceCommandRisk('node scripts/data/import/import-buffs-to-db.mjs'), 'unsafe');
  assert.equal(classifyDomainAcceptanceCommandRisk('node scripts/data/backfill/backfill-projectile-zh-and-images.mjs'), 'unsafe');
  assert.equal(classifyDomainAcceptanceCommandRisk('node scripts/data/fetch/run-item-page-crawl-batches.mjs'), 'unsafe');
  assert.equal(classifyDomainAcceptanceCommandRisk('node scripts/data/workflow/run-wiki-sync.mjs --mode=apply'), 'unsafe');
});

test('domain freshness audit blocks unsafe manifest commands', () => {
  const audit = buildDomainAcceptanceFreshnessAudit({
    repoRoot: createTempRepo(),
    generatedAt: '2026-05-03T12:00:00Z',
    manifest: [
      {
        domainId: 'unsafe',
        panelId: 'sourceReadiness',
        reportPattern: 'reports/domain/unsafe/source*.json',
        generatorCommand: 'node scripts/data/import/import-buffs-to-db.mjs',
        writesDatabase: false,
        requiresDatabase: false,
        freshnessSource: 'report-generatedAt-or-mtime',
        staleAfterHours: 24,
      },
    ],
  });

  assert.equal(audit.overallStatus, 'blocked');
  assert.deepEqual(audit.blockingReasons, ['unsafe/sourceReadiness generator command is unsafe']);
});

test('CLI prints filtered domain freshness JSON without executing evidence commands', async () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/domain/buffs/source-readiness-2026-05-03.json', {
    generatedAt: '2026-05-03T00:00:00Z',
  });

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      'scripts/data/workflow/domain-acceptance-freshness-audit.mjs',
      `--repo-root=${repoRoot}`,
      '--generated-at=2026-05-03T12:00:00Z',
      '--domains=buffs',
    ],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.summary.panelCount, 4);
  assert.deepEqual([...new Set(parsed.panels.map((entry) => entry.domainId))], ['buffs']);
  assert.equal(panelById(parsed, 'buffs', 'sourceReadiness').freshnessStatus, 'fresh');
});

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-domain-acceptance-'));
}

function writeJson(repoRoot, relativePath, payload) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(repoRoot, relativePath, text) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text, 'utf8');
}

function panelById(audit, domainId, panelId) {
  const panel = audit.panels.find((entry) => entry.domainId === domainId && entry.panelId === panelId);
  assert.ok(panel, `${domainId}/${panelId} panel should be present`);
  return panel;
}
