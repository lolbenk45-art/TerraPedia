import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = [
  'platform/local/lib/common.sh',
  'platform/local/lib/runtime-config.sh',
  'platform/local/lib/run-step.sh',
  'platform/local/lib/net.sh',
  'platform/local/lib/process.sh',
  'platform/local/snapshot-data-source.sh',
  'platform/local/restore-data-source.sh',
];

test('bash foundation libraries exist and avoid Windows-only commands', () => {
  for (const file of files) {
    assert.ok(fs.existsSync(file), `${file} should exist`);
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /^#!/, `${file} should have a shebang`);
    assert.doesNotMatch(source, /powershell(?:\.exe)?|pwsh|mvn\.cmd|pnpm\.cmd|node\.exe|Get-NetTCPConnection|Start-Process|Stop-Process|schtasks\.exe/i);
    assert.doesNotMatch(source, /[A-Za-z]:\\/);
  }
});

test('bash foundation libraries pass shell syntax checks', () => {
  for (const file of files) {
    execFileSync('bash', ['-n', file], { stdio: 'pipe' });
  }
});

test('common library resolves repo root from nested directories', () => {
  const output = execFileSync(
    'bash',
    ['-lc', 'source platform/local/lib/common.sh; cd platform/local/lib; resolve_repo_root'],
    { cwd: process.cwd(), encoding: 'utf8' }
  ).trim();

  assert.equal(output, process.cwd());
});

test('runtime config exports shell-safe local stack settings', () => {
  const output = execFileSync(
    'bash',
    ['-lc', 'source platform/local/lib/common.sh; source platform/local/lib/runtime-config.sh; load_runtime_config; printf "%s\\n" "$TP_BACKEND_PORT" "$TP_FRONT_PORT" "$TP_ADMIN_PORT" "$TP_REDIS_PORT"'],
    { cwd: process.cwd(), encoding: 'utf8' }
  ).trim().split('\n');

  assert.deepEqual(output, ['18088', '5174', '3001', '6380']);
});

test('run_step executes in requested directory and propagates status', () => {
  const ok = execFileSync(
    'bash',
    ['-lc', 'source platform/local/lib/common.sh; source platform/local/lib/run-step.sh; run_step "pwd check" platform/local pwd'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
  assert.match(ok, /platform\/local/);

  assert.throws(() => {
    execFileSync(
      'bash',
      ['-lc', 'source platform/local/lib/common.sh; source platform/local/lib/run-step.sh; run_step "fail check" . bash -lc "exit 7"'],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
  }, /Command failed/);
});
