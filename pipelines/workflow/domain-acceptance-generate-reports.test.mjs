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
  writeBoundaryDoc(repoRoot);

  const result = buildDomainAcceptanceReportGeneration({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
  });

  assert.equal(result.generatedAt, '2026-05-03T12:00:00Z');
  assert.equal(result.summary.domainCount, 13);
  assert.equal(result.summary.panelCount, 47);
  assert.equal(result.summary.writtenCount, 0);
  assert.equal(result.summary.plannedCount, 47);
  assert.equal(result.reports.length, 47);
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
  assert.equal(result.summary.panelCount, 5);
  assert.equal(result.summary.writtenCount, 5);
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
      'pipelines/workflow/domain-acceptance-generate-reports.mjs',
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
      'pipelines/workflow/domain-acceptance-generate-reports.mjs',
      `--repo-root=${repoRoot}`,
      '--domains=buffs',
      '--generated-at=2026-05-03T12:00:00Z',
      '--write=true',
    ],
    { cwd: process.cwd() },
  );

  assert.equal(writeRun.stderr, '');
  assert.equal(JSON.parse(writeRun.stdout).summary.writtenCount, 5);
  assert.equal(fs.existsSync(path.join(repoRoot, 'reports/domain/buffs/source-readiness-2026-05-03.json')), true);
});

test('CLI fail-on-blocked exits non-zero when any generated panel is blocked', async () => {
  const repoRoot = createTempRepo();

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        'pipelines/workflow/domain-acceptance-generate-reports.mjs',
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
        'pipelines/workflow/domain-acceptance-generate-reports.mjs',
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
  const source = fs.readFileSync('pipelines/workflow/domain-acceptance-generate-reports.mjs', 'utf8');

  assert.doesNotMatch(source, /\bspawn\b|\bexec\b|execFile|spawnSync/);
  assert.doesNotMatch(source, /\bcreateConnection\b|\bmysql\b/i);
  assert.doesNotMatch(source, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
});

test('immutable output root rejects a second write and preserves the first bytes', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);
  const outputRoot = 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/run-01/domain';

  const first = generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    domains: ['buffs'],
    outputRoot,
    write: true,
  });
  const firstPath = path.join(repoRoot, first.reports[0].outputPath);
  const firstBytes = fs.readFileSync(firstPath);

  assert.throws(() => generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    domains: ['buffs'],
    outputRoot,
    write: true,
  }), /exists|overwrite|immutable/i);
  assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
});

test('immutable output root accepts a trailing slash without widening confinement', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);
  const outputRoot = 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/run-trailing/domain/';
  const result = generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    domains: ['buffs'],
    outputRoot,
    write: true,
  });
  assert.equal(result.summary.writtenCount, 5);
  assert.ok(result.reports.every((report) => report.outputPath.includes('/run-trailing/domain/')));
});

test('bulk report generation preflights all paths before writing any file', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);
  const outputRoot = 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/run-02/domain';
  const manifest = [
    { domainId: 'buffs', panelId: 'sourceReadiness' },
    { domainId: 'buffs', panelId: 'sourceReadiness' },
  ];

  assert.throws(() => generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    manifest,
    outputRoot,
    write: true,
  }), /duplicate|collision|exists|overwrite/i);
  assert.equal(fs.existsSync(path.join(repoRoot, outputRoot, 'buffs/source-readiness-2026-05-03.json')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, outputRoot)), false);
});

test('bulk report generation rejects a broken target symlink before writing any sibling', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);
  const outputRoot = 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/run-broken-target/domain';
  const manifest = [
    { domainId: 'buffs', panelId: 'sourceReadiness' },
    { domainId: 'buffs', panelId: 'relationReadiness' },
  ];
  const brokenTarget = path.join(repoRoot, outputRoot, 'missing-target.json');
  const secondPath = path.join(repoRoot, outputRoot, 'buffs/relation-readiness-2026-05-03.json');
  fs.mkdirSync(path.dirname(secondPath), { recursive: true });
  fs.symlinkSync(brokenTarget, secondPath, 'file');

  assert.throws(() => generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    manifest,
    outputRoot,
    write: true,
  }), /exists|overwrite|symbolic|symlink|collision|immutable/i);
  assert.equal(
    fs.existsSync(path.join(repoRoot, outputRoot, 'buffs/source-readiness-2026-05-03.json')),
    false,
  );
  assert.equal(fs.lstatSync(secondPath).isSymbolicLink(), true);
});

test('runtime output roots are confined and reject symlink ancestors', () => {
  const repoRoot = createTempRepo();
  writeBuffSourceEvidence(repoRoot);

  assert.throws(() => generateDomainAcceptanceReports({
    repoRoot,
    generatedAt: '2026-05-03T12:00:00Z',
    domains: ['buffs'],
    outputRoot: 'reports/runtime/other/run/domain',
    write: true,
  }), /output root|runtime|confined|invalid/i);

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-output-outside-'));
  const symlinkRoot = path.join(repoRoot, 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/symlink');
  fs.mkdirSync(path.dirname(symlinkRoot), { recursive: true });
  fs.symlinkSync(outside, symlinkRoot, 'dir');
  try {
    assert.throws(() => generateDomainAcceptanceReports({
      repoRoot,
      generatedAt: '2026-05-03T12:00:00Z',
      domains: ['buffs'],
      outputRoot: 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/symlink/domain',
      write: false,
    }), /symbolic|symlink|ancestor|confined/i);
    assert.throws(() => generateDomainAcceptanceReports({
      repoRoot,
      generatedAt: '2026-05-03T12:00:00Z',
      domains: ['buffs'],
      outputRoot: 'reports/runtime/local-data-chain-closure/20260826/l2-readiness/symlink/domain',
      write: true,
    }), /symbolic|symlink|ancestor|confined/i);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
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

function writeText(repoRoot, relativePath, text) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text, 'utf8');
}

function writeBoundaryDoc(repoRoot) {
  writeText(repoRoot, 'docs/audits/canonical-migration-boundary.md', [
    '# Canonical Boundary',
    '',
    '## 来源合同登记',
    '| 输入 | mode | 证据 | deadline |',
    '| --- | --- | --- | --- |',
    '| `data/generated/recipe-material-reference.json` | `b1` | support.recipe | 2026-06-01 |',
    '| `data/generated/item-group-overrides.json` | `b1` | support.shimmer | 2026-06-01 |',
    '| `data/generated/recipe-group-overrides.json` | `b1` | support.item_group | 2026-06-01 |',
    '| `data/standardized/npcs.standardized.json` | `b1` | support.town_npc_maintenance | 2026-06-01 |',
    '',
    '## Apply 前准入',
  ].join('\n'));
}
