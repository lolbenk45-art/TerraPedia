import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const startSource = () => fs.readFileSync('scripts/dev/start-local-stack.ps1', 'utf8');
const stopSource = () => fs.readFileSync('scripts/dev/stop-local-stack.ps1', 'utf8');
const smokeSource = () => fs.readFileSync('scripts/dev/smoke-local-stack.ps1', 'utf8');

test('stop defaults to recorded pid files and gates port cleanup behind ForcePorts', () => {
  const source = stopSource();

  assert.match(source, /param\s*\([\s\S]*\[switch\]\$ForcePorts[\s\S]*\)/i);
  assert.match(source, /Get-ChildItem[\s\S]*-Filter\s+'?\*\.pid'?[\s\S]*Stop-RecordedProcessFile/i);
  assert.match(source, /if\s*\(\s*\$ForcePorts\s*\)\s*\{[\s\S]*Get-PortPids[\s\S]*Stop-ProcessTree[\s\S]*\}/i);
  assert.doesNotMatch(source, /function\s+Get-RecordedRuntimePorts/i);
  assert.doesNotMatch(source, /\$ports\s*=\s*@\([\s\S]*3000[\s\S]*6380[\s\S]*\)/i);
});

test('stop verifies process ownership before stopping any process tree', () => {
  const source = stopSource();

  assert.match(source, /function\s+Test-LocalStackProcessOwnership/i);
  assert.match(source, /Write-Warning\s+["'][\s\S]*skip[\s\S]*ownership/i);
  assert.match(source, /function\s+Stop-ProcessTree[\s\S]*Test-LocalStackProcessOwnership[\s\S]*Stop-Process/i);
  assert.match(source, /reports\\local-start|reports\/local-start/i);
  assert.match(source, /back|front|data-query-app/i);
  assert.match(source, /redis[\s\S]*\$redisPort/i);
  assert.match(source, /\$Name\s+-eq\s+"redis-\$redisPort"/i);
});

test('start uses configured spring profile and run-scoped logs instead of deleting old logs', () => {
  const source = startSource();

  assert.match(source, /\$runId\s*=/i);
  assert.match(source, /Resolve-LogPath[\s\S]*\$runId/i);
  assert.match(source, /spring-boot\.run\.profiles=\$springProfile/i);
  assert.doesNotMatch(source, /spring-boot\.run\.profiles=legacy/i);
  assert.doesNotMatch(source, /Remove-Item\s+\$BaseLogPath/i);
  assert.doesNotMatch(source, /Remove-Item\s+\$errPath/i);
});

test('start writes a sanitized run manifest with preflight and health details', () => {
  const source = startSource();

  assert.match(source, /run-manifest\.json/i);
  for (const field of [
    'runId',
    'startedAt',
    'repoRoot',
    'branch',
    'commit',
    'configPath',
    'ports',
    'springProfile',
    'processes',
    'preflight',
    'health',
  ]) {
    assert.match(source, new RegExp(`${field}\\s*=`, 'i'), `manifest should include ${field}`);
  }

  const manifestRegion = source.slice(source.search(/run-manifest\.json/i));
  assert.doesNotMatch(manifestRegion, /password|tokenSecret|secret/i);
  assert.match(source, /status\s*=\s*'occupied'/i);
  assert.match(source, /running/i);
});

test('smoke script is read-only and writes timestamped smoke report', () => {
  const source = smokeSource();

  assert.match(source, /smoke-\$timestamp\.json/i);
  assert.match(source, /Invoke-WebRequest[\s\S]*-Method\s+Get/i);
  assert.match(source, /\/api\/items\?page=1&limit=1/i);
  assert.match(source, /\/api\/categories/i);
  assert.match(source, /\/api\/auth\/login/i);
  assert.match(source, /\/api\/auth\/me/i);
  assert.match(source, /acceptance/i);
  assert.doesNotMatch(source, /wiki-images\/sync/i);
  assert.doesNotMatch(source, /\/api\/[^'"`\s]*(refresh|evidence|write|sync|apply|import|backfill|load|crawler)/i);
  assert.doesNotMatch(source, /Start-Process/i);
  assert.doesNotMatch(source, /spring-boot:run/i);
  assert.doesNotMatch(source, /pnpm[\s\S]*(dev|start)/i);
  assert.doesNotMatch(source, /\b(crawler|import|backfill|load|apply|refresh|evidence)\b/i);
  assert.doesNotMatch(source, /storage[\s\S]{0,80}sync/i);
  assert.doesNotMatch(source, /Invoke-WebRequest[\s\S]*-Method\s+(Put|Patch|Delete)/i);
  assert.doesNotMatch(source, /Invoke-SmokeRequest(?:(?!function\s+Invoke-SmokeLogin)[\s\S])*-Method\s+Post/i);
  assert.equal((source.match(/-Method\s+Post/gi) ?? []).length, 1, 'auth login should be the only POST smoke request');
});

test('smoke script does not persist login tokens in reports', () => {
  const source = smokeSource();

  assert.match(source, /redacted/i);
  assert.doesNotMatch(source, /preview\s*=\s*\(\[string\]\$response\.Content\)/i);
  assert.doesNotMatch(source, /preview\s*=\s*\$login/i);
});

test('local stack boundary tests are included in local and ci gates', () => {
  const localGate = fs.readFileSync('scripts/dev/quality-gate.ps1', 'utf8');
  const ciGate = fs.readFileSync('scripts/dev/quality-gate-ci.ps1', 'utf8');

  assert.match(localGate, /scripts\/dev\/local-stack\.test\.mjs/);
  assert.match(ciGate, /scripts\/dev\/local-stack\.test\.mjs/);
});

test('verify-local-stack checks optional WORKTREE_ROOT against resolved repo root', () => {
  const source = fs.readFileSync('scripts/dev/verify-local-stack.ps1', 'utf8');

  assert.match(source, /WORKTREE_ROOT/i);
  assert.match(source, /GetEnvironmentVariable\('WORKTREE_ROOT'\)/i);
  assert.match(source, /worktree root/i);
  assert.match(source, /repo root/i);
});
