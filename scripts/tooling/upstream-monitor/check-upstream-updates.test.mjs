import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('CLI accepts armor_sets alias for Module:ArmorSetBonuses', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-upstream-monitor-'));
  const stateFile = path.join(tempDir, 'state.json');
  const outputFile = path.join(tempDir, 'output.json');
  const stubModules = {
    'Module:ArmorSetBonuses': {
      apiUrl: 'https://terraria.wiki.gg/api.php',
      moduleTitle: 'Module:ArmorSetBonuses',
      fetchedAt: '2026-04-27T00:00:00.000Z',
      pageId: 123,
      pageTitle: 'Module:ArmorSetBonuses',
      revisionTimestamp: '2026-04-26T00:00:00.000Z',
      moduleContent: 'return { armor = true }'
    }
  };

  const result = spawnSync(
    process.execPath,
    [
      'scripts/tooling/upstream-monitor/check-upstream-updates.mjs',
      '--modules=armor_sets',
      '--check-official=false',
      '--write-state=false',
      `--state-file=${stateFile}`,
      `--output-file=${outputFile}`,
      '--format=json'
    ],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..', '..'),
      env: {
        ...process.env,
        TERRAPEDIA_UPSTREAM_MONITOR_STUB_MODULES: JSON.stringify(stubModules)
      },
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.modulesChecked, 1);
  assert.equal(summary.action, 'no_action');
  assert.ok(fs.existsSync(outputFile));
});

test('default manifest path follows TERRAPEDIA_SHARED_DATA_ROOT', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-upstream-monitor-root-'));
  const sharedDataRoot = path.join(tempDir, 'shared-data');
  const stateFile = path.join(tempDir, 'state.json');
  const outputFile = path.join(tempDir, 'output.json');
  const manifestPath = path.join(sharedDataRoot, 'standardized', '_manifest.standardized.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      generatedAt: '2026-05-20T00:00:00.000Z',
      datasets: [{ entity: 'items', file: 'data/standardized/items.standardized.json', totalRecords: 1 }]
    }),
    'utf8'
  );

  const stubModules = {
    'Module:Iteminfo/data': {
      apiUrl: 'https://terraria.wiki.gg/api.php',
      moduleTitle: 'Module:Iteminfo/data',
      fetchedAt: '2026-05-20T00:00:00.000Z',
      pageId: 1,
      pageTitle: 'Module:Iteminfo/data',
      revisionTimestamp: '2026-05-20T00:00:00.000Z',
      moduleContent: 'return { item = true }'
    }
  };

  const result = spawnSync(
    process.execPath,
    [
      'scripts/tooling/upstream-monitor/check-upstream-updates.mjs',
      '--modules=iteminfo',
      '--check-official=false',
      '--write-state=false',
      `--state-file=${stateFile}`,
      `--output-file=${outputFile}`,
      '--format=json'
    ],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..', '..'),
      env: {
        ...process.env,
        TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
        TERRAPEDIA_UPSTREAM_MONITOR_STUB_MODULES: JSON.stringify(stubModules)
      },
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  assert.equal(report.baseline.standardizedManifestPath, 'standardized/_manifest.standardized.json');
  assert.equal(report.baseline.currentDatasetGeneratedAt, '2026-05-20T00:00:00.000Z');
});
