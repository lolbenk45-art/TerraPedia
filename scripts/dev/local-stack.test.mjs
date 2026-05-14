import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const startSource = () => fs.readFileSync('scripts/dev/start-local-stack.sh', 'utf8');
const stopSource = () => fs.readFileSync('scripts/dev/stop-local-stack.sh', 'utf8');
const smokeSource = () => fs.readFileSync('scripts/dev/smoke-local-stack.sh', 'utf8');
const legacyApplicationSource = () => fs.readFileSync('back/src/main/resources/application-legacy.yml', 'utf8');

test('stop defaults to recorded pid files and gates port cleanup behind ForcePorts', () => {
  const source = stopSource();

  assert.match(source, /force_ports=false/i);
  assert.match(source, /for pid_path in "\$report_dir"\/\*\.pid/i);
  assert.match(source, /if \$force_ports; then[\s\S]*port_pids[\s\S]*stop_process_tree/i);
  assert.doesNotMatch(source, /function\s+Get-RecordedRuntimePorts/i);
  assert.doesNotMatch(source, /3000/);
});

test('stop verifies process ownership before stopping any process tree', () => {
  const source = stopSource();

  const processLib = fs.readFileSync('scripts/dev/lib/process.sh', 'utf8');

  assert.match(processLib, /is_local_stack_process/i);
  assert.match(processLib, /skip[\s\S]*ownership is not verified/i);
  assert.match(processLib, /stop_process_tree[\s\S]*is_local_stack_process[\s\S]*kill/i);
  assert.match(source, /reports\\local-start|reports\/local-start/i);
  assert.match(source, /back|front|data-query-app/i);
  assert.match(source, /redis[\s\S]*TP_REDIS_PORT/i);
  assert.match(processLib, /redis-server/i);
});

test('start uses configured spring profile and run-scoped logs instead of deleting old logs', () => {
  const source = startSource();

  assert.match(source, /run_id=/i);
  assert.match(source, /log_path\(\)[\s\S]*\$run_id/i);
  assert.match(source, /spring-boot\.run\.profiles="\$spring_profile"/i);
  assert.match(source, /require_command setsid/i);
  assert.match(source, /nohup setsid "\$@"/i);
  assert.doesNotMatch(source, /spring-boot\.run\.profiles=legacy/i);
  assert.doesNotMatch(source, /Remove-Item\s+\$BaseLogPath/i);
  assert.doesNotMatch(source, /Remove-Item\s+\$errPath/i);
});

test('legacy backend profile keeps local stack database url overrideable', () => {
  const source = legacyApplicationSource();

  assert.match(source, /url:\s*\$\{TERRAPEDIA_DB_URL:/);
  assert.doesNotMatch(source, /url:\s*jdbc:mysql:\/\/localhost:3306\/terria_v1_local/);
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
    assert.match(source, new RegExp(`"${field}"`, 'i'), `manifest should include ${field}`);
  }

  const manifestRegion = source.slice(source.search(/run-manifest\.json/i));
  assert.doesNotMatch(manifestRegion, /password|tokenSecret|secret/i);
  assert.match(source, /"status": "occupied"/i);
  assert.match(source, /running/i);
});

test('smoke script is read-only and writes timestamped smoke report', () => {
  const source = smokeSource();

  assert.match(source, /smoke-\$timestamp\.json/i);
  assert.match(source, /smoke_request[\s\S]*GET/i);
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
  assert.doesNotMatch(source, /smoke_request[\s\S]*(PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(source, /smoke_request[\s\S]*POST(?![\s\S]*\/api\/auth\/login)/i);
  assert.equal((source.match(/\bPOST\b/gi) ?? []).length, 1, 'auth login should be the only POST smoke request');
});

test('smoke script does not persist login tokens in reports', () => {
  const source = smokeSource();

  assert.match(source, /redacted/i);
  assert.doesNotMatch(source, /preview\s*=\s*\(\[string\]\$response\.Content\)/i);
  assert.doesNotMatch(source, /preview\s*=\s*\$login/i);
});

test('smoke script builds auth headers from an environment token only', () => {
  const source = smokeSource();

  assert.match(source, /SMOKE_AUTH_BEARER_TOKEN=/);
  assert.match(source, /process\.env\.SMOKE_AUTH_BEARER_TOKEN/);
  assert.match(source, /headers_json='\{\}'/);
  assert.doesNotMatch(source, /\$\{4:-\{\}\}/);
  assert.doesNotMatch(source, /AUTH_VALUE="Bearer \$bearer_token"/);
  assert.doesNotMatch(source, /AUTH_BEARER_TOKEN="\$bearer_token" node/);
});

test('local stack boundary tests are included in local and ci gates', () => {
  const localGate = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciGate = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  assert.match(localGate, /scripts\/dev\/local-stack\.test\.mjs/);
  assert.match(ciGate, /scripts\/dev\/local-stack\.test\.mjs/);
});

test('verify-local-stack checks optional WORKTREE_ROOT against resolved repo root', () => {
  const source = fs.readFileSync('scripts/dev/verify-local-stack.sh', 'utf8');

  assert.match(source, /WORKTREE_ROOT/i);
  assert.match(source, /\$\{WORKTREE_ROOT:-\}/i);
  assert.match(source, /worktree root/i);
  assert.match(source, /repo root/i);
});

test('verify-local-stack mapper preflight executes inline Node script instead of mapper directory as module', () => {
  const source = fs.readFileSync('scripts/dev/verify-local-stack.sh', 'utf8');

  assert.match(source, /node --input-type=module - "\$mapper_dir" <<'NODE'/);
  assert.match(source, /const mapperDir = process\.argv\[2\]/);
});
