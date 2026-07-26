import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildSourceContractComplianceReport } from './canonical-source-contract-registry.mjs';

const DESIGN = 'docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md';

function createTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-contract-'));
  fs.mkdirSync(path.join(root, 'docs', 'audits'), { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(DESIGN)), { recursive: true });
  fs.writeFileSync(path.join(root, DESIGN), '# design\n', 'utf8');
  return root;
}

function writeBoundaryDoc(repoRoot, rows) {
  const body = [
    '# Canonical Migration Boundary',
    '',
    '## 来源合同登记',
    '',
    '| 输入 | mode | 证据 | deadline |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '## Apply 前准入',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repoRoot, 'docs', 'audits', 'canonical-migration-boundary.md'), body, 'utf8');
}

function writeReport(repoRoot, relativePath, payload) {
  const full = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(payload, null, 2), 'utf8');
}

test('b1 mode passes before its deadline and blocks after it', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1` | recipe material group | 2026-08-31 |',
  ]);

  const ok = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(ok.status, 'pass');
  assert.equal(ok.panelId, 'b1ExemptionCompliance');
  assert.equal(ok.requiresDatabase, false);
  assert.equal(ok.writesDatabase, false);

  const expired = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-09-30T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(expired.status, 'blocked');
  assert.match(expired.blockingReasons[0], /expired on 2026-08-31/);
});

test('b1_migrating requires design reference, declared state, and a bounded deadline', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/recipe-material-reference.json\` | \`b1_migrating\` | \`DESIGN_APPROVED\`; design: \`${DESIGN}\` | 2026-10-31 |`,
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].mode, 'b1_migrating');
  assert.equal(report.checks[0].declaredState, 'DESIGN_APPROVED');
});

test('b1_migrating blocks a missing design reference', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1_migrating` | `DESIGN_APPROVED` | 2026-10-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /design reference/i);
});

test('b1_migrating blocks a design reference that does not exist on disk', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1_migrating` | `DESIGN_APPROVED`; design: `docs/superpowers/specs/nope.md` | 2026-10-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /design reference .* not found/i);
});

test('b1_migrating blocks an unrecognized declared state', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/recipe-material-reference.json\` | \`b1_migrating\` | \`ALMOST_DONE\`; design: \`${DESIGN}\` | 2026-10-31 |`,
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /declared state/i);
});

test('b1_migrating blocks a deadline beyond the bounded window', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/recipe-material-reference.json\` | \`b1_migrating\` | \`DESIGN_APPROVED\`; design: \`${DESIGN}\` | 2028-01-01 |`,
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /bounded window/i);
});

test('retired requires a passing absence report', () => {
  const repoRoot = createTempRepo();
  const reportPath = 'reports/canonical-migration/npc-bridge-retirement.json';
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json\` | \`retired\` | report: \`${reportPath}\` | — |`,
  ]);
  writeReport(repoRoot, reportPath, {
    status: 'pass',
    writesDatabase: false,
    referenceCount: 0,
    references: [],
  });

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json'],
  });
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].mode, 'retired');
});

test('retired blocks when the absence report still finds references', () => {
  const repoRoot = createTempRepo();
  const reportPath = 'reports/canonical-migration/npc-bridge-retirement.json';
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json\` | \`retired\` | report: \`${reportPath}\` | — |`,
  ]);
  writeReport(repoRoot, reportPath, {
    status: 'blocked',
    writesDatabase: false,
    referenceCount: 1,
    references: ['scripts/data/landing/source-dataset-locator.mjs:170'],
  });

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /still referenced/i);
});

test('retired blocks when the absence report is missing', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json` | `retired` | report: `reports/canonical-migration/npc-bridge-retirement.json` | — |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.town_npc_maintenance',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /report .* not found/i);
});

test('an unknown mode blocks rather than defaulting to pass', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `probably_fine` | whatever | 2026-10-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /unknown mode/i);
});

test('a registered input missing from the table blocks', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, []);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.recipe',
    generatedAt: '2026-07-26T00:00:00Z',
    inputs: ['data/generated/recipe-material-reference.json'],
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /missing from/i);
});

test('a domain unknown to the matcher blocks instead of passing vacuously', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1` | recipe material group | 2026-08-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.not_registered_anywhere',
    generatedAt: '2026-07-26T00:00:00Z',
  });
  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /not registered/i);
});

test('a domain declared with no B1 inputs passes with a note rather than blocking', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1` | recipe material group | 2026-08-31 |',
  ]);

  // support.category carries the panel but has never had a B1 input. Declaring it empty is
  // different from it being silently absent, and only the latter may block.
  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.category',
    generatedAt: '2026-07-26T00:00:00Z',
  });
  assert.equal(report.status, 'pass');
  assert.equal(report.summary.trackedContractCount, 0);
  assert.match(report.notes[0], /no source contracts registered/i);
});

test('the default matcher resolves a domain to its registered contracts without an explicit inputs list', () => {
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    '| `data/generated/recipe-material-reference.json` | `b1` | x | 2026-08-31 |',
    '| `data/generated/recipe-group-overrides.json` | `b1` | x | 2026-08-31 |',
    '| `data/generated/item-group-overrides.json` | `b1` | x | 2026-08-31 |',
  ]);

  const report = buildSourceContractComplianceReport({
    repoRoot,
    domainId: 'support.item_group',
    generatedAt: '2026-07-26T00:00:00Z',
  });
  assert.equal(report.summary.trackedContractCount, 3);
  assert.equal(report.status, 'pass');
});

test('domain readiness delegates the b1ExemptionCompliance panel to the contract registry', async () => {
  const { buildDomainReadinessReport } = await import('./domain-readiness-audit.mjs');
  const repoRoot = createTempRepo();
  writeBoundaryDoc(repoRoot, [
    `| \`data/generated/item-group-overrides.json\` | \`b1_migrating\` | \`DESIGN_APPROVED\`; design: \`${DESIGN}\` | 2026-10-31 |`,
  ]);

  const report = buildDomainReadinessReport({
    repoRoot,
    domainId: 'support.shimmer',
    panel: 'b1ExemptionCompliance',
    generatedAt: '2026-07-26T00:00:00Z',
  });

  assert.equal(report.panelId, 'b1ExemptionCompliance');
  assert.equal(report.status, 'pass');
  assert.equal(report.summary.trackedContractCount, 1);
  assert.equal(report.reportPath, null);
});
