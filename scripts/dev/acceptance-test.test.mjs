import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const read = (file) => fs.readFileSync(file, 'utf8');

test('acceptance has Node implementation and thin shell wrappers', () => {
  const nodeSource = read('scripts/dev/acceptance-test.mjs');
  const bashSource = read('scripts/dev/acceptance-test.sh');
  const psSource = read('scripts/dev/acceptance-test.ps1');

  assert.match(nodeSource, /function TestAcceptanceBlocked|function testAcceptanceBlocked/);
  assert.match(nodeSource, /schemaViolations/);
  assert.match(nodeSource, /missingLandingInputs/);
  assert.match(nodeSource, /coverageRate/);
  assert.match(nodeSource, /hashMatchRate/);
  assert.match(nodeSource, /failOnWarning/);
  assert.doesNotMatch(nodeSource, /powershell\.exe|ConvertFrom-Json|Set-Content|Write-Host/);

  assert.match(bashSource, /node "\$SCRIPT_DIR\/acceptance-test\.mjs"/);
  assert.doesNotMatch(bashSource, /scripts\/data\/audit\/b1-exemption-compliance|ConvertFrom-Json|powershell\.exe/);

  assert.match(psSource, /acceptance-test\.mjs/);
  assert.match(psSource, /node(?:\.exe)?/i);
  assert.doesNotMatch(psSource, /scripts\/data\/audit\/b1-exemption-compliance|function Invoke-AcceptanceStep|ConvertFrom-Json/);
});

test('benchmark has Node fetch implementation and thin wrappers', () => {
  const nodeSource = read('scripts/dev/benchmark-read-api.mjs');
  const bashSource = read('scripts/dev/benchmark-read-api.sh');
  const psSource = read('scripts/dev/benchmark-read-api.ps1');

  assert.match(nodeSource, /fetch\(/);
  assert.match(nodeSource, /performance\.now\(/);
  assert.match(nodeSource, /api-read-perf-\$\{reportTimestamp\}\.json/);
  assert.match(nodeSource, /api-read-perf-\$\{reportTimestamp\}\.md/);
  assert.doesNotMatch(nodeSource, /System\.Net\.Http|powershell\.exe|ConvertFrom-Json/);

  assert.match(bashSource, /node "\$SCRIPT_DIR\/benchmark-read-api\.mjs"/);
  assert.doesNotMatch(bashSource, /System\.Net\.Http|Get-NetTCPConnection|powershell\.exe/);

  assert.match(psSource, /benchmark-read-api\.mjs/);
  assert.match(psSource, /node(?:\.exe)?/i);
  assert.doesNotMatch(psSource, /System\.Net\.Http|function Invoke-BenchmarkEndpoint|ConvertFrom-Json/);
});

test('acceptance dry run can explicitly skip DB phase and writes parseable UTF-8 summary', () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'terrapedia-acceptance-'));
  const result = spawnSync(process.execPath, [
    'scripts/dev/acceptance-test.mjs',
    '--skip-db',
    '--skip-no-db',
    '--allow-db-skip',
    `--output-dir=${outputDir}`,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Results: 0 passed, 0 failed, 0 skipped/);

  const summaryPath = result.stdout.match(/Summary written to: (.+\.json)/)?.[1]?.trim();
  assert.ok(summaryPath, result.stdout);
  const bytes = fs.readFileSync(summaryPath);
  assert.notEqual(bytes[0], 0xef);
  const parsed = JSON.parse(bytes.toString('utf8'));
  assert.equal(parsed.totalSteps, 0);
  assert.equal(parsed.failed, 0);
  assert.equal(parsed.skipped, 0);
});

test('DB-required checks fail unless skip is explicit', () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'terrapedia-acceptance-db-'));
  const result = spawnSync(process.execPath, [
    'scripts/dev/acceptance-test.mjs',
    '--skip-no-db',
    '--db-host=127.0.0.1',
    '--db-port=1',
    `--output-dir=${outputDir}`,
  ], {
    encoding: 'utf8',
    env: { ...process.env, TERRAPEDIA_DB_HOST: '127.0.0.1', TERRAPEDIA_DB_PORT: '1' },
  });

  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /DB not available \(use --allow-db-skip to permit skipping\)/);
});

test('benchmark report generation writes JSON and Markdown for a stub API', () => {
  const fixture = execFileSync(process.execPath, [
    'scripts/dev/benchmark-read-api.mjs',
    '--print-fixture-report',
  ], { encoding: 'utf8' });

  const payload = JSON.parse(fixture);
  assert.equal(payload.summary.totalEndpoints, 17);
  assert.ok(Array.isArray(payload.results));
  assert.ok(payload.results.every((entry) => Number.isFinite(entry.stats.avgMs)));
});
