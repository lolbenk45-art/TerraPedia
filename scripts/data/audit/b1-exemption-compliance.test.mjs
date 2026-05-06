import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildB1ExemptionComplianceReport } from './b1-exemption-compliance.mjs';

const execFileAsync = promisify(execFile);

test('b1 exemption compliance blocks missing deadlines for relevant support domains', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | recipe material group | canonical recipe group | `node scripts/data/audit/audit-any-item-group-sources.mjs` |',
    '| `data/generated/item-group-overrides.json` | npc_shop/shimmer group explanation | canonical item group override | `node scripts/data/audit/audit-any-item-group-sources.mjs` |',
  ]);

  const report = buildB1ExemptionComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-05-06T00:00:00Z',
  });

  assert.equal(report.domainId, 'support.recipe');
  assert.equal(report.panelId, 'b1ExemptionCompliance');
  assert.equal(report.status, 'blocked');
  assert.equal(report.requiresDatabase, false);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.summary.trackedExemptionCount, 2);
  assert.equal(report.summary.blockedCount, 2);
  assert.match(report.blockingReasons[0], /missing deadline/i);
  assert.equal(report.checks[0].input, 'data/generated/recipe-material-reference.json');
  assert.equal(report.checks[0].deadline, null);
  assert.equal(report.checks[1].input, 'data/generated/recipe-group-overrides.json');
  assert.equal(report.checks[1].deadline, null);
});

test('b1 exemption compliance warns on approaching deadlines and blocks overdue deadlines', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | recipe material group; deadline: 2026-05-09 | canonical recipe group | `node scripts/data/audit/audit-any-item-group-sources.mjs` |',
    '| `data/generated/recipe-group-overrides.json` | recipe group patch; deadline: 2026-05-08 | canonical recipe group override | `node scripts/data/audit/audit-any-item-group-sources.mjs` |',
    '| `data/generated/item-group-overrides.json` | shimmer source; deadline: 2026-05-01 | canonical item group override | `node scripts/data/audit/audit-any-item-group-sources.mjs` |',
  ]);

  const warningReport = buildB1ExemptionComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-05-06T00:00:00Z',
  });
  assert.equal(warningReport.status, 'warning');
  assert.equal(warningReport.summary.warningCount, 2);
  assert.match(warningReport.warningReasons[0], /expires within 7 days/i);

  const blockingReport = buildB1ExemptionComplianceReport({
    repoRoot,
    domainId: 'support.shimmer',
    generatedAt: '2026-05-06T00:00:00Z',
  });
  assert.equal(blockingReport.status, 'blocked');
  assert.equal(blockingReport.summary.blockedCount, 1);
  assert.match(blockingReport.blockingReasons[0], /expired/i);
});

test('b1 exemption compliance passes when a support domain has no registered exemptions', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | recipe material group; deadline: 2026-05-30 | canonical recipe group | `node scripts/data/audit/audit-any-item-group-sources.mjs` |',
  ]);

  const report = buildB1ExemptionComplianceReport({
    repoRoot,
    domainId: 'support.category',
    generatedAt: '2026-05-06T00:00:00Z',
  });

  assert.equal(report.status, 'pass');
  assert.equal(report.summary.trackedExemptionCount, 0);
  assert.match(report.notes[0], /no b1 exemptions registered/i);
});

test('CLI prints b1 exemption compliance JSON for a selected domain', async () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/item-group-overrides.json` | shimmer source; deadline: 2026-05-20 | canonical item group override | `node scripts/data/audit/audit-any-item-group-sources.mjs` |',
  ]);

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      'scripts/data/audit/b1-exemption-compliance.mjs',
      `--repo-root=${repoRoot}`,
      '--domain=support.shimmer',
      '--generated-at=2026-05-06T00:00:00Z',
    ],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.domainId, 'support.shimmer');
  assert.equal(parsed.panelId, 'b1ExemptionCompliance');
});

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-b1-exemption-'));
}

function writeBoundaryDoc(repoRoot, rows) {
  const fullPath = path.join(repoRoot, 'docs/audits/canonical-migration-boundary.md');
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(
    fullPath,
    [
      '# Canonical Migration Boundary',
      '',
      '## 过渡豁免登记',
      '',
      '| 输入 | 当前消费者 | 迁移目标 | 验收命令 |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
      '## Apply 前准入',
      '',
      'placeholder',
      '',
    ].join('\n'),
    'utf8',
  );
}
