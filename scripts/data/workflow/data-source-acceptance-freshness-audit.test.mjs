import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  buildDataSourceAcceptanceFreshnessAudit,
  classifyCommandRisk,
} from './data-source-acceptance-freshness-audit.mjs';
import { buildDataSourceAcceptanceReportManifest } from './data-source-acceptance-report-manifest.mjs';

const execFileAsync = promisify(execFile);

test('buildDataSourceAcceptanceFreshnessAudit reports fresh stale missing and external evidence', () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/relation/relation-health-2026-05-03.json', {
    generatedAt: '2026-05-03T00:00:00Z',
    summary: { status: 'pass' },
  });
  writeJson(repoRoot, 'reports/relation/replacement-readiness-2026-05-01.json', {
    generatedAt: '2026-05-01T00:00:00Z',
    summary: { status: 'pass' },
  });

  const manifest = buildDataSourceAcceptanceReportManifest().filter((entry) => (
    ['relationHealth', 'replacementReadiness', 'imageReadiness', 'crawlerMonitor'].includes(entry.panelId)
  ));
  const audit = buildDataSourceAcceptanceFreshnessAudit({
    repoRoot,
    manifest,
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(audit.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(audit.overallStatus, 'warning');
  assert.deepEqual(audit.blockingReasons, []);
  assert.deepEqual(audit.warningReasons, [
    'replacementReadiness evidence is stale',
    'imageReadiness evidence is missing',
    'crawlerMonitor evidence is unknown',
  ]);
  assert.deepEqual(audit.summary, {
    panelCount: 4,
    freshCount: 1,
    staleCount: 1,
    missingCount: 1,
    unknownCount: 1,
    databaseRequiredCount: 3,
    unsafeCommandCount: 0,
  });

  const relationHealth = panelById(audit, 'relationHealth');
  assert.equal(relationHealth.latestReportPath, 'reports/relation/relation-health-2026-05-03.json');
  assert.equal(relationHealth.freshnessStatus, 'fresh');
  assert.equal(relationHealth.ageHours, 12);
  assert.equal(relationHealth.nextEvidenceCommand, null);
  assert.equal(relationHealth.commandRisk, 'safe-read-only');

  const replacementReadiness = panelById(audit, 'replacementReadiness');
  assert.equal(replacementReadiness.freshnessStatus, 'stale');
  assert.equal(replacementReadiness.ageHours, 60);
  assert.equal(replacementReadiness.nextEvidenceCommand, 'node scripts/data/relation/replacement-readiness-audit.mjs');

  const imageReadiness = panelById(audit, 'imageReadiness');
  assert.equal(imageReadiness.freshnessStatus, 'missing');
  assert.equal(imageReadiness.latestReportPath, null);
  assert.equal(imageReadiness.nextEvidenceCommand, 'node scripts/data/audit/image-asset-readiness-audit.mjs --source=db');

  const crawlerMonitor = panelById(audit, 'crawlerMonitor');
  assert.equal(crawlerMonitor.freshnessStatus, 'unknown');
  assert.equal(crawlerMonitor.freshnessReason, 'External monitor evidence is not read by the offline audit.');
  assert.equal(crawlerMonitor.latestReportPath, null);
  assert.equal(crawlerMonitor.commandRisk, 'external-read-only');
});

test('buildDataSourceAcceptanceFreshnessAudit uses file mtime when report generatedAt is missing', () => {
  const repoRoot = createTempRepo();
  const reportPath = path.join(repoRoot, 'reports/relation/relation-health-2026-05-03.json');
  writeJson(repoRoot, 'reports/relation/relation-health-2026-05-03.json', {
    summary: { status: 'pass' },
  });
  fs.utimesSync(reportPath, new Date('2026-05-03T06:00:00Z'), new Date('2026-05-03T06:00:00Z'));

  const manifest = buildDataSourceAcceptanceReportManifest().filter((entry) => entry.panelId === 'relationHealth');
  const audit = buildDataSourceAcceptanceFreshnessAudit({
    repoRoot,
    manifest,
    generatedAt: '2026-05-03T12:00:00Z',
  });
  const relationHealth = panelById(audit, 'relationHealth');

  assert.equal(relationHealth.freshnessStatus, 'fresh');
  assert.equal(relationHealth.freshnessReason, 'Using file modified time because generatedAt is unavailable.');
  assert.equal(relationHealth.ageHours, 6);
});

test('buildDataSourceAcceptanceFreshnessAudit does not mark malformed report JSON fresh by mtime', () => {
  const repoRoot = createTempRepo();
  const reportPath = path.join(repoRoot, 'reports/relation/relation-health-2026-05-03.json');
  writeText(repoRoot, 'reports/relation/relation-health-2026-05-03.json', '{ "generatedAt": ');
  fs.utimesSync(reportPath, new Date('2026-05-03T06:00:00Z'), new Date('2026-05-03T06:00:00Z'));

  const manifest = buildDataSourceAcceptanceReportManifest().filter((entry) => entry.panelId === 'relationHealth');
  const audit = buildDataSourceAcceptanceFreshnessAudit({
    repoRoot,
    manifest,
    generatedAt: '2026-05-03T12:00:00Z',
  });
  const relationHealth = panelById(audit, 'relationHealth');

  assert.equal(audit.overallStatus, 'warning');
  assert.deepEqual(audit.warningReasons, ['relationHealth evidence is unknown']);
  assert.equal(relationHealth.latestReportPath, 'reports/relation/relation-health-2026-05-03.json');
  assert.equal(relationHealth.freshnessStatus, 'unknown');
  assert.equal(relationHealth.freshnessReason, 'Acceptance report JSON is unreadable or invalid.');
  assert.equal(relationHealth.ageHours, null);
  assert.equal(relationHealth.nextEvidenceCommand, 'node scripts/data/relation/relation-health-report.mjs --write-report=true');
});

test('classifyCommandRisk is conservative about mutation commands', () => {
  assert.equal(classifyCommandRisk('node scripts/data/audit/read-report.mjs'), 'safe-read-only');
  assert.equal(classifyCommandRisk('read-only monitor overview: GET /admin/crawler-monitor/overview'), 'external-read-only');
  assert.equal(classifyCommandRisk('node scripts/data/import/import-standardized-to-db.mjs'), 'unsafe');
  assert.equal(classifyCommandRisk('node scripts/data/workflow/run-wiki-sync.mjs --mode=apply'), 'unsafe');
  assert.equal(classifyCommandRisk('rm -rf reports'), 'unsafe');
});

test('buildDataSourceAcceptanceFreshnessAudit blocks when a manifest command is unsafe', () => {
  const audit = buildDataSourceAcceptanceFreshnessAudit({
    repoRoot: createTempRepo(),
    generatedAt: '2026-05-03T12:00:00Z',
    manifest: [
      {
        panelId: 'unsafePanel',
        reportPattern: 'reports/unsafe*.json',
        generatorCommand: 'node scripts/data/import/import-standardized-to-db.mjs',
        writesDatabase: false,
        requiresDatabase: true,
        freshnessSource: 'report-generatedAt-or-mtime',
        staleAfterHours: 24,
      },
    ],
  });

  assert.equal(audit.overallStatus, 'blocked');
  assert.deepEqual(audit.blockingReasons, ['unsafePanel generator command is unsafe']);
  assert.deepEqual(audit.warningReasons, ['unsafePanel evidence is missing']);
});

test('canonical item-group evidence blocks when missing or malformed', () => {
  const repoRoot = createTempRepo();
  const manifest = buildDataSourceAcceptanceReportManifest()
    .filter((entry) => entry.panelId === 'sourceGroupAudit');

  let audit = buildDataSourceAcceptanceFreshnessAudit({
    repoRoot, manifest, generatedAt: '2026-07-27T14:00:00Z',
  });
  assert.equal(audit.overallStatus, 'blocked');

  writeText(repoRoot, 'reports/canonical-migration/canonical-item-group-readiness.json', '{');
  audit = buildDataSourceAcceptanceFreshnessAudit({
    repoRoot, manifest, generatedAt: '2026-07-27T14:00:00Z',
  });
  assert.equal(audit.overallStatus, 'blocked');
  assert.ok(audit.blockingReasons.some((reason) => reason.includes('sourceGroupAudit')));
});

test('canonical item-group evidence blocks stale and semantically invalid reports', () => {
  const manifest = buildDataSourceAcceptanceReportManifest()
    .filter((entry) => entry.panelId === 'sourceGroupAudit');
  const cases = [
    ['stale', validCanonicalReport('2026-07-25T00:00:00Z')],
    ['writer', { ...validCanonicalReport(), writesDatabase: true }],
    ['wrong role', { ...validCanonicalReport(), databaseRole: 't1' }],
    ['hash mismatch', {
      ...validCanonicalReport(),
      api: { snapshotHash: `sha256:${'b'.repeat(64)}` },
    }],
  ];

  for (const [name, report] of cases) {
    const repoRoot = createTempRepo();
    writeJson(repoRoot, 'reports/canonical-migration/canonical-item-group-readiness.json', report);
    const audit = buildDataSourceAcceptanceFreshnessAudit({
      repoRoot, manifest, generatedAt: '2026-07-27T14:00:00Z',
    });
    assert.equal(audit.overallStatus, 'blocked', name);
    const panel = panelById(audit, 'sourceGroupAudit');
    assert.equal(panel.blocking, true, name);
    assert.equal(panel.nextEvidenceCommand, 'node scripts/data/item-groups/item-group-readiness.mjs', name);
  }
});

test('CLI prints legal JSON without executing evidence commands', async () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'reports/relation/relation-health-2026-05-03.json', {
    generatedAt: '2026-05-03T00:00:00Z',
  });

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      'scripts/data/workflow/data-source-acceptance-freshness-audit.mjs',
      `--repo-root=${repoRoot}`,
      '--generated-at=2026-05-03T12:00:00Z',
    ],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(parsed.summary.panelCount, 7);
  assert.equal(panelById(parsed, 'relationHealth').freshnessStatus, 'fresh');
});

test('refresh plan consumes the freshness audit instead of duplicating report scanning', () => {
  const refreshPlanSource = fs.readFileSync(
    'scripts/data/workflow/data-source-acceptance-refresh-plan.mjs',
    'utf8',
  );

  assert.match(refreshPlanSource, /buildDataSourceAcceptanceFreshnessAudit/);
  assert.doesNotMatch(refreshPlanSource, /readdirSync/);
  assert.doesNotMatch(refreshPlanSource, /\bspawn\b|\bexec\b|execFile|spawnSync/);
});

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-acceptance-audit-'));
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

function panelById(audit, panelId) {
  const panel = audit.panels.find((entry) => entry.panelId === panelId);
  assert.ok(panel, `${panelId} panel should be present`);
  return panel;
}

function validCanonicalReport(generatedAt = '2026-07-27T13:00:00Z') {
  const hash = `sha256:${'a'.repeat(64)}`;
  return {
    schemaVersion: 1,
    reportKind: 'canonical_item_group_readiness',
    generatedAt,
    writesDatabase: false,
    databaseRole: 't2-readonly',
    cutoverIdentity: { state: 'T2_CUTOVER_VERIFIED', operationId: 'canonical-item-groups' },
    counts: {
      landing: { sourceCount: 4, groupCount: 64 },
      maint: { groupCount: 35, memberCount: 163, aliasCount: 72, exclusionCount: 2 },
      relation: { groupCount: 35, memberCount: 163, aliasCount: 72, unresolvedCount: 0, ambiguousCount: 0, rejectedCount: 2 },
      local: { groupCount: 34, memberCount: 161, aliasCount: 70 },
    },
    hashes: { landing: hash, maint: hash, relation: hash, local: hash },
    shadows: {
      adminItemGroups: { parity: true, snapshotHash: hash },
      adminRecipeGroups: { parity: true, snapshotHash: hash },
      recipeTree: { parity: true, snapshotHash: hash },
    },
    consumerContract: { directJsonReaders: 0, fallbackEnabled: false },
    api: { snapshotHash: hash },
    exports: [
      { artifact: 'recipe-material-reference.json', fresh: true, snapshotHash: hash },
      { artifact: 'recipe-group-overrides.json', fresh: true, snapshotHash: hash },
      { artifact: 'item-group-overrides.json', fresh: true, snapshotHash: hash },
    ],
    summary: { status: 'pass', blockingCount: 0, warningCount: 0 },
  };
}
