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

test('start exports MinIO endpoint settings from local stack config', () => {
  const runtimeConfig = fs.readFileSync('scripts/dev/lib/runtime-config.sh', 'utf8');
  const source = startSource();
  const exampleConfig = fs.readFileSync('scripts/dev/config/local-stack.config.example.json', 'utf8');

  assert.match(runtimeConfig, /TP_MINIO_ENDPOINT/);
  assert.match(runtimeConfig, /TP_MINIO_PUBLIC_ENDPOINT/);
  assert.match(runtimeConfig, /TP_MINIO_BUCKET/);
  assert.match(runtimeConfig, /TP_MINIO_OBJECT_PREFIX/);
  assert.match(source, /export TERRAPEDIA_MINIO_ENDPOINT="\$TP_MINIO_ENDPOINT"/);
  assert.match(source, /export TERRAPEDIA_MINIO_PUBLIC_ENDPOINT="\$TP_MINIO_PUBLIC_ENDPOINT"/);
  assert.match(source, /export TERRAPEDIA_MINIO_BUCKET="\$TP_MINIO_BUCKET"/);
  assert.match(source, /export TERRAPEDIA_MINIO_OBJECT_PREFIX="\$TP_MINIO_OBJECT_PREFIX"/);
  assert.match(exampleConfig, /"endpoint"/);
  assert.match(exampleConfig, /"publicEndpoint"/);
});

test('start loads local mail settings without hard-disabling backend mail', () => {
  const runtimeConfig = fs.readFileSync('scripts/dev/lib/runtime-config.sh', 'utf8');
  const source = startSource();
  const exampleConfig = fs.readFileSync('scripts/dev/config/local-stack.config.example.json', 'utf8');
  const readme = fs.readFileSync('scripts/dev/config/README.md', 'utf8');

  assert.match(runtimeConfig, /load_root_env_file/);
  assert.match(runtimeConfig, /QQ_SMTP/);
  assert.match(runtimeConfig, /QQ_NUMBER/);
  assert.match(runtimeConfig, /TP_MAIL_ENABLED/);
  assert.match(runtimeConfig, /TP_MAIL_USERNAME/);
  assert.match(runtimeConfig, /TP_MAIL_PASSWORD/);
  assert.match(source, /export TERRAPEDIA_MAIL_ENABLED="\$TP_MAIL_ENABLED"/);
  assert.match(source, /export TERRAPEDIA_MAIL_HOST="\$TP_MAIL_HOST"/);
  assert.match(source, /export TERRAPEDIA_MAIL_PORT="\$TP_MAIL_PORT"/);
  assert.match(source, /export TERRAPEDIA_MAIL_USERNAME="\$TP_MAIL_USERNAME"/);
  assert.match(source, /export TERRAPEDIA_MAIL_PASSWORD="\$TP_MAIL_PASSWORD"/);
  assert.match(source, /export TERRAPEDIA_MAIL_FROM="\$TP_MAIL_FROM"/);
  assert.match(source, /export TERRAPEDIA_MAIL_SSL_ENABLE="\$TP_MAIL_SSL_ENABLE"/);
  assert.match(source, /export TERRAPEDIA_MAIL_STARTTLS_ENABLE="\$TP_MAIL_STARTTLS_ENABLE"/);
  assert.doesNotMatch(source, /-DTERRAPEDIA_MAIL_ENABLED=false/);
  assert.match(source, /-Dmanagement\.health\.mail\.enabled=false/);
  assert.match(exampleConfig, /"mail"/);
  assert.match(exampleConfig, /"username": "your-qq-email@example\.com"/);
  assert.match(readme, /TERRAPEDIA_MAIL_USERNAME/);
  assert.match(readme, /QQ_SMTP/);
});

test('local stack front service starts the Nuxt frontend from front-nuxt on the configured port', () => {
  const source = startSource();
  const stop = stopSource();
  const runtimeConfig = fs.readFileSync('scripts/dev/lib/runtime-config.sh', 'utf8');
  const exampleConfig = fs.readFileSync('scripts/dev/config/local-stack.config.example.json', 'utf8');
  const verify = fs.readFileSync('scripts/dev/verify-local-stack.sh', 'utf8');
  const qualityGate = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const qualityGateCi = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');
  const probeStart = fs.readFileSync('scripts/dev/verify/probe-front-start.js', 'utf8');
  const probeLink = fs.readFileSync('scripts/dev/verify/probe-front-link.js', 'utf8');

  assert.match(exampleConfig, /"projectDir": "front-nuxt"/);
  assert.match(runtimeConfig, /TP_FRONT_PROJECT_DIR/);
  assert.match(runtimeConfig, /get\(\['front', 'projectDir'\], 'front-nuxt'\)/);
  assert.match(source, /start_background front "\$REPO_ROOT\/\$TP_FRONT_PROJECT_DIR"/);
  assert.match(source, /pnpm exec nuxt dev --host 0\.0\.0\.0 --port "\$TP_FRONT_PORT"/);
  assert.match(verify, /run_step "Front Nuxt typecheck" "\$TP_FRONT_PROJECT_DIR" pnpm run check/);
  assert.match(qualityGate, /run_step "Front Nuxt checks and build" "\$TP_FRONT_PROJECT_DIR" pnpm run test/);
  assert.match(qualityGateCi, /run_step "Front Nuxt checks and build" "\$TP_FRONT_PROJECT_DIR" pnpm run test/);
  assert.match(probeStart, /frontProjectDir = process\.env\.TP_FRONT_PROJECT_DIR \|\| 'front-nuxt'/);
  assert.match(probeStart, /path\.join\(repoRoot, frontProjectDir\)/);
  assert.match(probeStart, /'exec', 'nuxt', 'dev'/);
  assert.match(probeStart, /process\.env\.TP_FRONT_PORT \|\| '5174'/);
  assert.match(probeLink, /frontProjectDir = process\.env\.TP_FRONT_PROJECT_DIR \|\| 'front-nuxt'/);
  assert.match(probeLink, /path\.join\(repoRoot, frontProjectDir\)/);
  assert.match(probeLink, /'exec', 'nuxt', 'dev'/);
  assert.match(probeLink, /process\.env\.TP_FRONT_PORT \|\| '5174'/);
  assert.match(stop, /front:\$TP_FRONT_PORT/);
  assert.doesNotMatch(source, /"\$REPO_ROOT\/front"/);
  assert.doesNotMatch(source, /pnpm exec nuxt dev --host localhost --port "\$TP_FRONT_PORT"/);
  assert.doesNotMatch(verify, /run_step "Front typecheck" front pnpm run check/);
  assert.doesNotMatch(qualityGate, /run_step "Front checks, unit tests, and build" front pnpm run test/);
  assert.doesNotMatch(qualityGateCi, /run_step "Front checks, unit tests, and build" front pnpm run test/);
  assert.doesNotMatch(probeStart, /path\.join\(repoRoot, 'front'\)/);
  assert.doesNotMatch(probeLink, /path\.join\(repoRoot, 'front'\)/);
}
);

test('local stack Nuxt dev servers bind to all interfaces for Windows browser access through WSL IP', () => {
  const source = startSource();

  assert.match(source, /pnpm exec nuxt dev --host 0\.0\.0\.0 --port "\$TP_FRONT_PORT"/);
  assert.match(source, /pnpm exec nuxt dev --port "\$TP_ADMIN_PORT" --host 0\.0\.0\.0/);
  assert.doesNotMatch(source, /--host localhost/);
});

test('runtime config resolves local stack config from linked worktree primary root', () => {
  const runtimeConfig = fs.readFileSync('scripts/dev/lib/runtime-config.sh', 'utf8');

  assert.match(runtimeConfig, /resolve_primary_worktree_root/);
  assert.match(runtimeConfig, /\.git\/worktrees/);
  assert.match(runtimeConfig, /local-stack\.config\.json/);
  assert.match(runtimeConfig, /primary_root/);
});

test('start records MinIO public endpoint health when MinIO is enabled', () => {
  const source = startSource();

  assert.match(source, /TP_MINIO_PUBLIC_ENDPOINT/i);
  assert.match(source, /minioPublicEndpoint/i);
  assert.match(source, /minioPublicOpen/i);
  assert.match(source, /minioPublic: \{ endpoint:/i);
});

test('start can run FlareSolverr through local stack config', () => {
  const runtimeConfig = fs.readFileSync('scripts/dev/lib/runtime-config.sh', 'utf8');
  const source = startSource();
  const exampleConfig = fs.readFileSync('scripts/dev/config/local-stack.config.example.json', 'utf8');

  assert.match(runtimeConfig, /TP_FLARESOLVERR_ENABLED/);
  assert.match(runtimeConfig, /TP_FLARESOLVERR_URL/);
  assert.match(source, /start_flaresolverr_if_needed/);
  assert.match(source, /docker run -d --name "\$container_name"/);
  assert.match(source, /ghcr\.io\/flaresolverr\/flaresolverr/);
  assert.match(source, /export TERRAPEDIA_FLARESOLVERR_URL="\$TP_FLARESOLVERR_URL"/);
  assert.match(source, /flaresolverrOpen/i);
  assert.match(exampleConfig, /"flaresolverr"/);
  assert.match(exampleConfig, /"url": "http:\/\/127\.0\.0\.1:8191\/v1"/);
});

test('start runs snapshot GC at most weekly through a marker file', () => {
  const source = startSource();

  assert.match(source, /run_snapshot_gc_if_due/);
  assert.match(source, /snapshot-gc\.last-run/);
  assert.match(source, /gc-snapshots\.mjs/);
  assert.match(source, /604800/);
  assert.match(source, /load_runtime_config[\s\S]*require_command node[\s\S]*run_snapshot_gc_if_due[\s\S]*start_redis_if_needed/);
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

test('smoke script checks MinIO public endpoint when MinIO is enabled', () => {
  const source = smokeSource();

  assert.match(source, /TP_MINIO_ENABLED/i);
  assert.match(source, /minio\.publicEndpoint/i);
  assert.match(source, /SMOKE_MINIO_ENABLED/i);
  assert.match(source, /SMOKE_MINIO_PUBLIC_ENDPOINT/i);
});

test('smoke script verifies admin article images through the admin proxy', () => {
  const source = smokeSource();

  assert.match(source, /smoke_admin_article_images/i);
  assert.match(source, /admin\.articles\.imageProxy/i);
  assert.match(source, /\/api\/admin\/articles\?page=1&limit=10/i);
  assert.match(source, /\/api\/admin\/articles\/\$\{article\.id\}/i);
  assert.match(source, /content-type/i);
  assert.match(source, /\^image\\\//i);
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

test('data source snapshot tests are included in local and ci gates', () => {
  const localGate = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciGate = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  assert.match(localGate, /scripts\/dev\/data-source-snapshot\.test\.mjs/);
  assert.match(ciGate, /scripts\/dev\/data-source-snapshot\.test\.mjs/);
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

test('slot allocator tests are included in local and ci gates', () => {
  const localGate = fs.readFileSync('scripts/dev/quality-gate.sh', 'utf8');
  const ciGate = fs.readFileSync('scripts/dev/quality-gate-ci.sh', 'utf8');

  assert.match(localGate, /scripts\/dev\/slot-allocator\.test\.mjs/);
  assert.match(ciGate, /scripts\/dev\/slot-allocator\.test\.mjs/);
});

test('start requires Node 22 via preflight and repo pins it with .nvmrc', () => {
  const source = startSource();
  const nvmrc = fs.readFileSync('.nvmrc', 'utf8').trim();

  assert.equal(nvmrc, '22');
  assert.match(source, /process\.versions\.node/i);
  assert.match(source, /Node 22\+ required/i);
});

test('start resolves a per-worktree slot and offsets app ports plus redis db', () => {
  const source = startSource();

  assert.match(source, /local-stack-slots\.json/);
  assert.match(source, /slot-allocator\.mjs/);
  assert.match(source, /TP_BACKEND_PORT=\$\(\( TP_BACKEND_PORT \+ TP_SLOT \)\)/);
  assert.match(source, /TP_FRONT_PORT=\$\(\( TP_FRONT_PORT \+ TP_SLOT \)\)/);
  assert.match(source, /TP_ADMIN_PORT=\$\(\( TP_ADMIN_PORT \+ TP_SLOT \)\)/);
  assert.match(source, /TP_REDIS_DATABASE="\$TP_SLOT"/);
  assert.match(source, /TP_SLOT >= 64/);
});

test('start launches shared redis through start_background with setsid and extra databases', () => {
  const source = startSource();

  assert.match(source, /start_background "redis-\$TP_REDIS_PORT" "\$REPO_ROOT"/);
  assert.match(source, /--databases 64/);
  assert.match(source, /--requirepass <redacted> --databases 64/);
  assert.doesNotMatch(source, /nohup "\$redis_cmd" --port/);
});

test('start refuses to reuse an app port owned by another worktree', () => {
  const source = startSource();

  assert.match(source, /assert_port_owned_by_worktree/);
  assert.match(source, /outside this worktree/i);
  // 三个应用服务的 else 复用分支都先校验归属
  assert.match(source, /assert_port_owned_by_worktree back "\$TP_BACKEND_PORT"/);
  assert.match(source, /assert_port_owned_by_worktree front "\$TP_FRONT_PORT"/);
  assert.match(source, /assert_port_owned_by_worktree data-query-app "\$TP_ADMIN_PORT"/);
});

test('stop preserves shared redis unless --stop-shared is passed', () => {
  const source = stopSource();

  assert.match(source, /stop_shared=false/);
  assert.match(source, /--stop-shared/);
  assert.match(source, /redis-\*[\s\S]*stop_shared/i);
  assert.match(source, /use --stop-shared/i);
});
