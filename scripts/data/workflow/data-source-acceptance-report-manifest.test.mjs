import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildDataSourceAcceptanceReportManifest } from './data-source-acceptance-report-manifest.mjs';

const execFileAsync = promisify(execFile);

const EXPECTED_PANEL_IDS = [
  'relationHealth',
  'replacementReadiness',
  'sourceDatasetLanding',
  'sourceGroupAudit',
  'imageReadiness',
  'crawlerMonitor',
  'entitySourceCoverage',
];

const DANGEROUS_COMMAND_PATTERNS = [
  /--apply=true/i,
  /\bimport\b/i,
  /\bbackfill\b/i,
  /\bapply\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brm\b/i,
  /\bcrawl\b/i,
  /\bload\b/i,
];

test('buildDataSourceAcceptanceReportManifest covers all acceptance overview panels', () => {
  const manifest = buildDataSourceAcceptanceReportManifest();

  assert.ok(Array.isArray(manifest));
  assert.deepEqual(
    manifest.map((entry) => entry.panelId).sort(),
    [...EXPECTED_PANEL_IDS].sort(),
  );
  for (const entry of manifest) {
    assert.equal(typeof entry.panelId, 'string');
    assert.equal(typeof entry.reportPattern, 'string');
    assert.equal(typeof entry.generatorCommand, 'string');
    assert.equal(typeof entry.writesDatabase, 'boolean');
    assert.equal(typeof entry.requiresDatabase, 'boolean');
    assert.equal(typeof entry.notes, 'string');
  }
});

test('manifest keeps every generator read-only and free of dangerous operations', () => {
  const manifest = buildDataSourceAcceptanceReportManifest();

  for (const entry of manifest) {
    assert.equal(entry.writesDatabase, false, `${entry.panelId} must be read-only`);
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      assert.doesNotMatch(entry.generatorCommand, pattern, `${entry.panelId} command must not match ${pattern}`);
    }
  }
});

test('CLI prints legal JSON and does not execute subcommands', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['scripts/data/workflow/data-source-acceptance-report-manifest.mjs'],
    { cwd: process.cwd() },
  );

  assert.equal(stderr, '');
  const parsed = JSON.parse(stdout);
  assert.deepEqual(parsed, buildDataSourceAcceptanceReportManifest());
});
