import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  buildDomainAcceptanceReportGeneration,
  generateDomainAcceptanceReports,
} from './domain-acceptance-generate-reports.mjs';

const execFileAsync = promisify(execFile);

test('buildDomainAcceptanceReportGeneration creates reports for every manifest panel without executing commands', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);

  const result = buildDomainAcceptanceReportGeneration({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(result.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(result.summary.domainCount, 9);
  assert.equal(result.summary.panelCount, 26);
  assert.equal(result.summary.writtenCount, 0);
  assert.equal(result.summary.plannedCount, 26);
  assert.equal(result.reports.length, 26);
  assert.ok(result.reports.every((report) => report.writePlanned === false));
  assert.equal(
    result.reports.find((report) => report.domainId === 'buffs' && report.panelId === 'sourceReadiness')?.outputPath,
    'reports/domain/buffs/source-readiness-2026-05-03.json',
  );
});

test('generateDomainAcceptanceReports writes only reports/domain outputs when write is enabled', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);

  const result = generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    write: true,
    domains: ['buffs'],
  });

  assert.equal(result.summary.domainCount, 1);
  assert.equal(result.summary.panelCount, 4);
  assert.equal(result.summary.writtenCount, 4);
  for (const report of result.reports) {
    assert.match(report.outputPath, /^reports\/domain\/buffs\//);
    assert.equal(fs.existsSync(path.join(repoRoot, report.outputPath)), true);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(repoRoot, 'reports/domain/buffs/source-readiness-2026-05-03.json'), 'utf8')).status, 'pass');
});

test('generated report evidence does not persist accepted-warning registry metadata', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);

  generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    write: true,
    manifest: [
      {
        domainId: 'buffs',
        panelId: 'sourceReadiness',
        acceptedWarning: {
          panelId: 'sourceReadiness',
          reason: 'Should remain registry-only metadata.',
          approvedBy: 'controller',
          approvedAt: '2026-05-03T00:00:00Z',
          expiresAt: '2026-05-10T00:00:00Z',
          readinessOnly: true,
        },
      },
    ],
  });

  const report = JSON.parse(fs.readFileSync(path.join(repoRoot, 'reports/domain/buffs/source-readiness-2026-05-03.json'), 'utf8'));
  assert.equal(Object.hasOwn(report, 'acceptedWarning'), false);
  assert.equal(Object.hasOwn(report, 'acceptedWarnings'), false);
});

test('CLI defaults to dry-run JSON and only writes reports with --write=true', async () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);

  const dryRun = await execFileAsync(
    process.execPath,
    [
      'scripts/data/workflow/domain-acceptance-generate-reports.mjs',
      `--repo-root=${repoRoot}`,
      '--domains=buffs',
      '--generated-at=2026-05-03T12:00:00Z',
    ],
    { cwd: process.cwd() },
  );

  assert.equal(dryRun.stderr, '');
  assert.equal(JSON.parse(dryRun.stdout).summary.writtenCount, 0);
  assert.equal(fs.existsSync(path.join(repoRoot, 'reports/domain/buffs/source-readiness-2026-05-03.json')), false);

  const writeRun = await execFileAsync(
    process.execPath,
    [
      'scripts/data/workflow/domain-acceptance-generate-reports.mjs',
      `--repo-root=${repoRoot}`,
      '--domains=buffs',
      '--generated-at=2026-05-03T12:00:00Z',
      '--write=true',
    ],
    { cwd: process.cwd() },
  );

  assert.equal(writeRun.stderr, '');
  assert.equal(JSON.parse(writeRun.stdout).summary.writtenCount, 4);
  assert.equal(fs.existsSync(path.join(repoRoot, 'reports/domain/buffs/source-readiness-2026-05-03.json')), true);
});

test('CLI fail-on-blocked exits non-zero when any generated panel is blocked', async () => {
  const repoRoot = createTempRepo();

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        'scripts/data/workflow/domain-acceptance-generate-reports.mjs',
        `--repo-root=${repoRoot}`,
        '--domains=projectiles',
        '--generated-at=2026-05-03T12:00:00Z',
        '--fail-on-blocked=true',
      ],
      { cwd: process.cwd() },
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stdout).summary.blockedCount > 0, true);
      return true;
    },
  );
});

test('CLI fail-on-warning exits non-zero when generated panels still warn', async () => {
  const repoRoot = createTempRepo();
  writeJson(repoRoot, 'data/generated/wiki-bosses.latest.json', {
    overview: { bossCount: 1 },
    records: [
      {
        status: 'ok',
        titleEn: 'Unmapped Boss',
        pageTitleEn: 'Unmapped Boss',
        sourceUrl: 'https://example.test/Unmapped_Boss',
        titleZh: null,
        imageUrl: null,
      },
    ],
  });

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        'scripts/data/workflow/domain-acceptance-generate-reports.mjs',
        `--repo-root=${repoRoot}`,
        '--domains=bosses',
        '--generated-at=2026-05-03T12:00:00Z',
        '--fail-on-warning=true',
      ],
      { cwd: process.cwd() },
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stdout).summary.warningCount > 0, true);
      return true;
    },
  );
});

test('source stays read-only except for explicit reports/domain writes', () => {
  const source = fs.readFileSync('scripts/data/workflow/domain-acceptance-generate-reports.mjs', 'utf8');

  assert.doesNotMatch(source, /\bspawn\b|\bexec\b|execFile|spawnSync/);
  assert.doesNotMatch(source, /\bcreateConnection\b|\bmysql\b/i);
  assert.doesNotMatch(source, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
});

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-domain-generation-'));
}

function writeJson(repoRoot, relativePath, payload) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeBuffSourceEvidence(repoRoot) {
  writeJson(repoRoot, 'data/standardized/buffs.standardized.json', {
    totalRecords: 1,
    records: [{ id: 1, internalName: 'WellFed', englishName: 'Well Fed', type: 'buff' }],
  });
  writeJson(repoRoot, 'data/generated/buff-standardized-map.json', {
    count: 1,
    records: { WellFed: { id: 1 } },
  });
}
