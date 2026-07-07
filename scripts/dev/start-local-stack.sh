#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"
# shellcheck source=lib/net.sh
source "$SCRIPT_DIR/lib/net.sh"
# shellcheck source=lib/process.sh
source "$SCRIPT_DIR/lib/process.sh"

reuse_existing=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --reuse-existing|-ReuseExisting)
      reuse_existing=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/dev/start-local-stack.sh [--reuse-existing]

Runs preflight checks, then starts or reuses Redis, backend, front, and data-query-app.
EOF
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      exit 2
      ;;
  esac
  shift
done

REPO_ROOT="$(resolve_repo_root "$PWD")"
report_dir="$REPO_ROOT/reports/local-start"
ensure_dir "$report_dir"

run_id="$(date +%Y%m%d-%H%M%S)"
started_at="$(date -Iseconds)"
processes_path="$report_dir/processes-$run_id.jsonl"
: >"$processes_path"

log_path() {
  local name="$1"
  printf '%s/%s-%s.log\n' "$report_dir" "$name" "$run_id"
}

append_process() {
  local name="$1"
  local pid="$2"
  local out_path="$3"
  local err_path="$4"
  local command_text="$5"
  local status="${6:-running}"

  PROC_NAME="$name" PROC_PID="$pid" PROC_LOG="$out_path" PROC_ERR="$err_path" PROC_CMD="$command_text" PROC_STATUS="$status" PROC_FILE="$processes_path" node <<'NODE'
const fs = require('node:fs');
const entry = {
  name: process.env.PROC_NAME,
  pid: Number(process.env.PROC_PID),
  log: process.env.PROC_LOG,
  errorLog: process.env.PROC_ERR,
  command: process.env.PROC_CMD,
  status: process.env.PROC_STATUS,
};
fs.appendFileSync(process.env.PROC_FILE, `${JSON.stringify(entry)}\n`);
NODE
}

run_snapshot_gc_if_due() {
  local marker_path="$report_dir/snapshot-gc.last-run"
  local log_file
  local now_seconds last_seconds age_seconds
  log_file="$(log_path snapshot-gc)"
  now_seconds="$(date +%s)"
  last_seconds=0

  if [[ -f "$marker_path" ]]; then
    last_seconds="$(cat "$marker_path" 2>/dev/null || printf 0)"
    if ! [[ "$last_seconds" =~ ^[0-9]+$ ]]; then
      last_seconds=0
    fi
  fi

  age_seconds=$((now_seconds - last_seconds))
  if [[ "$age_seconds" -lt 604800 ]]; then
    return 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    log_warn "Skipping weekly snapshot GC because node is not available"
    return 0
  fi

  if node "$REPO_ROOT/scripts/data/maint/gc-snapshots.mjs" --keep=7 >"$log_file" 2>&1; then
    printf '%s\n' "$now_seconds" >"$marker_path"
    log_info "Snapshot GC completed; log=$log_file"
  else
    log_warn "Snapshot GC failed; log=$log_file"
  fi
}

start_background() {
  local name="$1"
  local cwd="$2"
  local command_text="$3"
  shift 3

  local out_path err_path pid
  out_path="$(log_path "$name")"
  err_path="$out_path.err"

  (
    cd "$cwd"
    nohup setsid "$@" >"$out_path" 2>"$err_path" &
    pid=$!
    printf '%s\n' "$pid" >"$report_dir/$name.pid"
    append_process "$name" "$pid" "$out_path" "$err_path" "$command_text" running
    printf '%s PID=%s log=%s\n' "$name" "$pid" "$out_path"
  )
}

require_runtime_secret_before_manifest() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    log_error "Missing required runtime setting: $name"
    exit 1
  fi
}

is_truthy() {
  case "${1,,}" in
    true|1|yes|y|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_runtime_path() {
  local input_path="$1"

  RUNTIME_PATH="$input_path" RUNTIME_REPO_ROOT="$REPO_ROOT" RUNTIME_CONFIG_PATH="$TP_CONFIG_PATH" node --input-type=module <<'NODE'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const raw = process.env.RUNTIME_PATH || '';
if (!raw) {
  process.stdout.write('');
  process.exit(0);
}

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

const expanded = expandHome(raw);
if (path.isAbsolute(expanded)) {
  process.stdout.write(path.normalize(expanded));
  process.exit(0);
}

const repoRoot = process.env.RUNTIME_REPO_ROOT || process.cwd();
const configPath = process.env.RUNTIME_CONFIG_PATH || '';
const marker = `${path.sep}scripts${path.sep}dev${path.sep}config${path.sep}`;
const configRoot = configPath.includes(marker) ? configPath.slice(0, configPath.indexOf(marker)) : '';
const candidates = [
  configRoot && path.resolve(configRoot, expanded),
  path.resolve(repoRoot, expanded),
  path.resolve(process.cwd(), expanded),
].filter(Boolean);

const existing = candidates.find((candidate) => fs.existsSync(candidate));
process.stdout.write(existing || candidates[0]);
NODE
}

url_component() {
  local value="$1"
  local component="$2"

  URL_VALUE="$value" URL_COMPONENT="$component" node --input-type=module <<'NODE'
const value = process.env.URL_VALUE || '';
const component = process.env.URL_COMPONENT || '';
const url = new URL(value);

if (component === 'host') {
  process.stdout.write(url.hostname);
} else if (component === 'port') {
  process.stdout.write(url.port || (url.protocol === 'https:' ? '443' : '80'));
} else {
  process.stdout.write('');
}
NODE
}

read_minio_credential() {
  local credentials_path="$1"
  local field="$2"

  MINIO_CREDENTIALS_PATH="$credentials_path" MINIO_CREDENTIAL_FIELD="$field" node --input-type=module <<'NODE'
import fs from 'node:fs';

const path = process.env.MINIO_CREDENTIALS_PATH;
const field = process.env.MINIO_CREDENTIAL_FIELD;
const parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
process.stdout.write(String(parsed[field] || ''));
NODE
}

load_runtime_config
require_command node
require_command mvn
require_command pnpm
require_command setsid
require_runtime_secret_before_manifest TP_ADMIN_PASSWORD
require_runtime_secret_before_manifest TP_ADMIN_TOKEN_SECRET
require_runtime_secret_before_manifest TP_USER_TOKEN_SECRET

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf 0)"
if (( node_major < 22 )); then
  log_error "Node 22+ required (found $(node -v 2>/dev/null || printf none)). Run 'nvm use' (see .nvmrc) and retry."
  exit 1
fi

resolve_local_stack_slot() {
  TP_SLOT_REGISTRY="${TERRAPEDIA_SLOT_REGISTRY:-$HOME/.terrapedia/local-stack-slots.json}"
  local worktree_root
  worktree_root="$(resolve_repo_root "$PWD")"
  TP_SLOT="$(node "$SCRIPT_DIR/lib/slot-allocator.mjs" "$TP_SLOT_REGISTRY" "$worktree_root")"
  if ! [[ "$TP_SLOT" =~ ^[0-9]+$ ]]; then
    log_error "Failed to resolve local stack slot for $worktree_root (got: ${TP_SLOT:-<empty>})"
    exit 1
  fi
  if (( TP_SLOT >= 64 )); then
    log_error "Slot $TP_SLOT exceeds shared Redis database capacity (64). Remove an unused worktree entry from $TP_SLOT_REGISTRY."
    exit 1
  fi
  TP_BACKEND_PORT=$(( TP_BACKEND_PORT + TP_SLOT ))
  TP_FRONT_PORT=$(( TP_FRONT_PORT + TP_SLOT ))
  TP_ADMIN_PORT=$(( TP_ADMIN_PORT + TP_SLOT ))
  TP_REDIS_DATABASE="$TP_SLOT"
  log_info "Local stack slot=$TP_SLOT (backend=$TP_BACKEND_PORT front=$TP_FRONT_PORT admin=$TP_ADMIN_PORT redisDb=$TP_REDIS_DATABASE)"
}

resolve_local_stack_slot

assert_port_owned_by_worktree() {
  local label="$1"
  local port="$2"
  local pid cwd
  for pid in $(port_pids "$port"); do
    cwd="$(process_cwd "$pid")"
    if [[ "$cwd" == "$REPO_ROOT"* ]]; then
      continue
    fi
    log_error "$label port $port is held by pid=$pid (cwd=${cwd:-unknown}) outside this worktree ($REPO_ROOT). Likely a slot collision or stale process. Free it, or fix the slot in $TP_SLOT_REGISTRY."
    exit 1
  done
}

resolved_minio_credentials_file=""
if [[ -n "$TP_MINIO_CREDENTIALS_FILE" ]]; then
  resolved_minio_credentials_file="$(resolve_runtime_path "$TP_MINIO_CREDENTIALS_FILE")"
fi

export APP_PORT="$TP_BACKEND_PORT"
export TERRAPEDIA_DB_NAME="$TP_DB_NAME"
export TERRAPEDIA_DB_HOST="$TP_DB_HOST"
export TERRAPEDIA_DB_PORT="$TP_DB_PORT"
export TERRAPEDIA_DB_URL="$TP_DB_URL"
export TERRAPEDIA_DB_USERNAME="$TP_DB_USERNAME"
export TERRAPEDIA_DB_PASSWORD="$TP_DB_PASSWORD"
export TERRAPEDIA_BACKEND_ORIGIN="http://localhost:$TP_BACKEND_PORT"
export TERRAPEDIA_REDIS_HOST="$TP_REDIS_HOST"
export TERRAPEDIA_REDIS_PORT="$TP_REDIS_PORT"
export TERRAPEDIA_REDIS_DATABASE="$TP_REDIS_DATABASE"
export TERRAPEDIA_REDIS_PASSWORD="$TP_REDIS_PASSWORD"
export TERRAPEDIA_ADMIN_USERNAME="$TP_ADMIN_USERNAME"
export TERRAPEDIA_ADMIN_PASSWORD="$TP_ADMIN_PASSWORD"
export TERRAPEDIA_ADMIN_DISPLAY_NAME="$TP_ADMIN_DISPLAY_NAME"
export TERRAPEDIA_AUTH_TOKEN_SECRET="$TP_ADMIN_TOKEN_SECRET"
export TERRAPEDIA_USER_TOKEN_SECRET="$TP_USER_TOKEN_SECRET"
export TERRAPEDIA_MINIO_ENABLED="$TP_MINIO_ENABLED"
if [[ -n "$resolved_minio_credentials_file" ]]; then
  export TERRAPEDIA_MINIO_CREDENTIALS_FILE="$resolved_minio_credentials_file"
fi
export TERRAPEDIA_MINIO_ENDPOINT="$TP_MINIO_ENDPOINT"
export TERRAPEDIA_MINIO_PUBLIC_ENDPOINT="$TP_MINIO_PUBLIC_ENDPOINT"
export TERRAPEDIA_MINIO_BUCKET="$TP_MINIO_BUCKET"
export TERRAPEDIA_MINIO_OBJECT_PREFIX="$TP_MINIO_OBJECT_PREFIX"
export TERRAPEDIA_IMAGE_ORIGIN="$TP_IMAGE_ORIGIN"
export TERRAPEDIA_LEGACY_IMAGE_ORIGINS="$TP_LEGACY_IMAGE_ORIGINS"
if is_truthy "$TP_FLARESOLVERR_ENABLED"; then
  export TERRAPEDIA_FLARESOLVERR_URL="$TP_FLARESOLVERR_URL"
fi
export TERRAPEDIA_MAIL_ENABLED="$TP_MAIL_ENABLED"
export TERRAPEDIA_MAIL_HOST="$TP_MAIL_HOST"
export TERRAPEDIA_MAIL_PORT="$TP_MAIL_PORT"
export TERRAPEDIA_MAIL_USERNAME="$TP_MAIL_USERNAME"
export TERRAPEDIA_MAIL_PASSWORD="$TP_MAIL_PASSWORD"
export TERRAPEDIA_MAIL_FROM="$TP_MAIL_FROM"
export TERRAPEDIA_MAIL_FROM_NAME="$TP_MAIL_FROM_NAME"
export TERRAPEDIA_MAIL_SUBJECT_PREFIX="$TP_MAIL_SUBJECT_PREFIX"
export TERRAPEDIA_MAIL_SSL_ENABLE="$TP_MAIL_SSL_ENABLE"
export TERRAPEDIA_MAIL_STARTTLS_ENABLE="$TP_MAIL_STARTTLS_ENABLE"

spring_profile="$TP_SPRING_PROFILE"
export SPRING_PROFILES_ACTIVE="$spring_profile"
export SPRING_FLYWAY_OUT_OF_ORDER="$TP_SPRING_FLYWAY_OUT_OF_ORDER"
export SPRING_DEVTOOLS_RESTART_ENABLED=false
export SPRING_DEVTOOLS_LIVERELOAD_ENABLED=false
export MANAGEMENT_HEALTH_MAIL_ENABLED=false

if ! $reuse_existing; then
  bash "$SCRIPT_DIR/stop-local-stack.sh"
fi

log_info "Running preflight checks before local stack startup..."
bash "$SCRIPT_DIR/verify-local-stack.sh"
preflight_status="passed"

run_snapshot_gc_if_due

start_redis_if_needed() {
  if tcp_check "$TP_REDIS_HOST" "$TP_REDIS_PORT" 800; then
    printf 'redis already running on %s; status=occupied\n' "$TP_REDIS_PORT"
    return 0
  fi

  local redis_cmd
  if [[ -n "$TP_REDIS_SERVER_EXE" && -x "$TP_REDIS_SERVER_EXE" ]]; then
    redis_cmd="$TP_REDIS_SERVER_EXE"
  else
    redis_cmd="$(command -v redis-server || true)"
  fi

  if [[ -z "$redis_cmd" ]]; then
    log_error "Redis $TP_REDIS_PORT is not reachable and redis-server was not found in WSL PATH. Install redis-server or start Redis manually."
    exit 1
  fi

  local redis_data_dir
  redis_data_dir="$report_dir/redis-$TP_REDIS_PORT"
  ensure_dir "$redis_data_dir"

  start_background "redis-$TP_REDIS_PORT" "$REPO_ROOT" \
    "redis-server --port $TP_REDIS_PORT --bind $TP_REDIS_HOST --protected-mode yes --requirepass <redacted> --databases 64 --dir $redis_data_dir --dbfilename dump-$TP_REDIS_PORT.rdb --appendonly yes --appendfilename appendonly-$TP_REDIS_PORT.aof" \
    "$redis_cmd" --port "$TP_REDIS_PORT" --bind "$TP_REDIS_HOST" --protected-mode yes --requirepass "$TP_REDIS_PASSWORD" --databases 64 --dir "$redis_data_dir" --dbfilename "dump-$TP_REDIS_PORT.rdb" --appendonly yes --appendfilename "appendonly-$TP_REDIS_PORT.aof"

  if ! wait_port "$TP_REDIS_HOST" "$TP_REDIS_PORT" 15; then
    log_error "Redis $TP_REDIS_PORT failed to start. Check $(log_path "redis-$TP_REDIS_PORT")"
    exit 1
  fi
}

start_redis_if_needed

start_minio_if_needed() {
  if ! is_truthy "$TP_MINIO_ENABLED"; then
    return 0
  fi

  require_command node

  local minio_cmd
  minio_cmd="$(command -v minio || true)"
  if [[ -z "$minio_cmd" && -x "$HOME/.local/bin/minio" ]]; then
    minio_cmd="$HOME/.local/bin/minio"
  fi
  if [[ -z "$minio_cmd" ]]; then
    log_error "MinIO is enabled but minio was not found in PATH or $HOME/.local/bin/minio"
    exit 1
  fi
  if [[ -z "$TP_MINIO_ENDPOINT" || -z "$TP_MINIO_PUBLIC_ENDPOINT" ]]; then
    log_error "MinIO is enabled but endpoint or publicEndpoint is missing"
    exit 1
  fi
  if [[ -z "$resolved_minio_credentials_file" || ! -f "$resolved_minio_credentials_file" ]]; then
    log_error "MinIO is enabled but credentials file was not found: ${resolved_minio_credentials_file:-<empty>}"
    exit 1
  fi

  local access_key root_password data_dir endpoint_host endpoint_port public_host public_port
  access_key="$(read_minio_credential "$resolved_minio_credentials_file" accessKey)"
  root_password="$(read_minio_credential "$resolved_minio_credentials_file" secretKey)"
  if [[ -z "$access_key" || -z "$root_password" ]]; then
    log_error "MinIO credentials file must contain accessKey and secretKey"
    exit 1
  fi

  data_dir="$(resolve_runtime_path "$TP_MINIO_DATA_DIR")"
  ensure_dir "$data_dir"

  endpoint_host="$(url_component "$TP_MINIO_ENDPOINT" host)"
  endpoint_port="$(url_component "$TP_MINIO_ENDPOINT" port)"
  public_host="$(url_component "$TP_MINIO_PUBLIC_ENDPOINT" host)"
  public_port="$(url_component "$TP_MINIO_PUBLIC_ENDPOINT" port)"

  if ! tcp_check "$endpoint_host" "$endpoint_port" 800; then
    start_background "minio-$endpoint_port" "$REPO_ROOT" \
      "minio server $data_dir --address $endpoint_host:$endpoint_port --console-address 127.0.0.1:$TP_MINIO_CONSOLE_PORT" \
      env MINIO_ROOT_USER="$access_key" MINIO_ROOT_PASSWORD="$root_password" "$minio_cmd" server "$data_dir" --address "$endpoint_host:$endpoint_port" --console-address "127.0.0.1:$TP_MINIO_CONSOLE_PORT"
    wait_port "$endpoint_host" "$endpoint_port" 25 || {
      log_error "MinIO failed to start on $endpoint_host:$endpoint_port. Check $(log_path "minio-$endpoint_port")"
      exit 1
    }
  else
    printf 'minio already running on %s:%s; status=occupied\n' "$endpoint_host" "$endpoint_port"
  fi

  if ! tcp_check "$public_host" "$public_port" 800; then
    if [[ "$public_port" == "$endpoint_port" ]]; then
      log_error "MinIO public endpoint $TP_MINIO_PUBLIC_ENDPOINT is not reachable and uses the same port as endpoint $TP_MINIO_ENDPOINT"
      exit 1
    fi

    start_background "minio-public-$public_port" "$REPO_ROOT" \
      "node scripts/dev/lib/tcp-proxy.mjs $public_host:$public_port -> $endpoint_host:$endpoint_port" \
      env TP_PROXY_PUBLIC_HOST="$public_host" TP_PROXY_PUBLIC_PORT="$public_port" TP_PROXY_TARGET_HOST="$endpoint_host" TP_PROXY_TARGET_PORT="$endpoint_port" node "$SCRIPT_DIR/lib/tcp-proxy.mjs"
    wait_port "$public_host" "$public_port" 15 || {
      log_error "MinIO public endpoint proxy failed to start on $public_host:$public_port. Check $(log_path "minio-public-$public_port")"
      exit 1
    }
  else
    printf 'minio public endpoint already running on %s:%s; status=occupied\n' "$public_host" "$public_port"
  fi
}

start_minio_if_needed

TP_IMAGE_ORIGIN_DATA_ROOT_STATUS="unchecked"
TP_IMAGE_ORIGIN_DATA_ROOT_EXPECTED=""
TP_IMAGE_ORIGIN_DATA_ROOT_ACTUAL=""

verify_image_origin_data_root() {
  local image_host image_port expected_data_dir pid cmd actual_data_dir
  if [[ -z "$TP_IMAGE_ORIGIN" ]]; then
    TP_IMAGE_ORIGIN_DATA_ROOT_STATUS="unreachable"
    return 0
  fi

  image_host="$(url_component "$TP_IMAGE_ORIGIN" host)"
  image_port="$(url_component "$TP_IMAGE_ORIGIN" port)"
  if ! tcp_check "$image_host" "$image_port" 800; then
    TP_IMAGE_ORIGIN_DATA_ROOT_STATUS="unreachable"
    return 0
  fi

  expected_data_dir="$(resolve_runtime_path "$TP_MINIO_DATA_DIR")"
  TP_IMAGE_ORIGIN_DATA_ROOT_EXPECTED="$expected_data_dir"
  for pid in $(port_pids "$image_port"); do
    cmd="$(process_cmdline "$pid")"
    inspect_minio_image_origin_cmdline "$cmd" "$image_port" "$expected_data_dir" && return 0
  done

  while IFS= read -r cmd; do
    inspect_minio_image_origin_cmdline "$cmd" "$image_port" "$expected_data_dir" && return 0
  done < <(pgrep -af "minio server" 2>/dev/null || true)

  TP_IMAGE_ORIGIN_DATA_ROOT_STATUS="unknown"
}

inspect_minio_image_origin_cmdline() {
  local cmd="$1"
  local image_port="$2"
  local expected_data_dir="$3"
  local actual_data_dir
  [[ "$cmd" == *"minio server"* ]] || return 1
  [[ "$cmd" == *":$image_port"* ]] || return 1
  actual_data_dir="$(MINIO_CMDLINE="$cmd" node --input-type=module <<'NODE'
import path from 'node:path';

const parts = String(process.env.MINIO_CMDLINE || '').split(/\s+/).filter(Boolean);
const serverIndex = parts.indexOf('server');
const dataDir = serverIndex >= 0 ? parts[serverIndex + 1] : '';
process.stdout.write(dataDir ? path.normalize(dataDir) : '');
NODE
)"
  TP_IMAGE_ORIGIN_DATA_ROOT_ACTUAL="$actual_data_dir"
  if [[ -n "$actual_data_dir" && "$actual_data_dir" != "$expected_data_dir" ]]; then
    TP_IMAGE_ORIGIN_DATA_ROOT_STATUS="wrong_data_root"
    log_warn "MinIO image origin is running from a different dataDir: origin=$TP_IMAGE_ORIGIN actual=$actual_data_dir expected=$expected_data_dir. Images may return object_missing until MinIO is restarted with the configured dataDir."
    return 0
  fi
  if [[ -n "$actual_data_dir" ]]; then
    TP_IMAGE_ORIGIN_DATA_ROOT_STATUS="matched"
    return 0
  fi
  return 1
}

verify_image_origin_data_root
export TP_IMAGE_ORIGIN_DATA_ROOT_STATUS
export TP_IMAGE_ORIGIN_DATA_ROOT_EXPECTED
export TP_IMAGE_ORIGIN_DATA_ROOT_ACTUAL

TP_IMAGE_COMPAT_STATUS="disabled"

start_image_compat_proxy_if_needed() {
  if ! is_truthy "$TP_IMAGE_COMPAT_PROXY_ENABLED"; then
    TP_IMAGE_COMPAT_STATUS="disabled"
    return 0
  fi
  if [[ -z "$TP_IMAGE_ORIGIN" ]]; then
    TP_IMAGE_COMPAT_STATUS="unreachable"
    log_warn "Image compatibility proxy disabled because TP_IMAGE_ORIGIN is empty"
    return 0
  fi

  local image_host image_port
  image_host="$(url_component "$TP_IMAGE_ORIGIN" host)"
  image_port="$(url_component "$TP_IMAGE_ORIGIN" port)"
  if [[ "$image_port" == "19001" ]]; then
    # 19001 is the MinIO console port, never a managed image object API origin.
    TP_IMAGE_COMPAT_STATUS="unreachable"
    log_warn "Image origin $TP_IMAGE_ORIGIN points at MinIO console port 19001; compatibility proxy will not start"
    return 0
  fi
  if ! tcp_check "$image_host" "$image_port" 800; then
    TP_IMAGE_COMPAT_STATUS="unreachable"
    log_warn "Image origin $TP_IMAGE_ORIGIN is not reachable; legacy localhost:9000 compatibility proxy will not start"
    return 0
  fi

  if tcp_check 127.0.0.1 9000 500; then
    TP_IMAGE_COMPAT_STATUS="unverified"
    printf 'legacy image origin localhost:9000 already open; status=unverified; smoke must verify real image bytes\n'
    return 0
  fi

  start_background "image-compat-9000" "$REPO_ROOT" \
    "node scripts/dev/lib/tcp-proxy.mjs 127.0.0.1:9000 -> $image_host:$image_port" \
    env TP_PROXY_PUBLIC_HOST="127.0.0.1" TP_PROXY_PUBLIC_PORT="9000" TP_PROXY_TARGET_HOST="$image_host" TP_PROXY_TARGET_PORT="$image_port" node "$SCRIPT_DIR/lib/tcp-proxy.mjs"
  if wait_port 127.0.0.1 9000 10; then
    TP_IMAGE_COMPAT_STATUS="active"
    return 0
  fi

  TP_IMAGE_COMPAT_STATUS="unreachable"
  log_warn "Legacy image compatibility proxy failed to start on localhost:9000"
}

start_image_compat_proxy_if_needed
export TP_IMAGE_COMPAT_STATUS

start_flaresolverr_if_needed() {
  if ! is_truthy "$TP_FLARESOLVERR_ENABLED"; then
    return 0
  fi

  require_command docker

  local host port container_name image
  host="$(url_component "$TP_FLARESOLVERR_URL" host)"
  port="$(url_component "$TP_FLARESOLVERR_URL" port)"
  container_name="${TP_FLARESOLVERR_CONTAINER_NAME:-terrapedia-flaresolverr}"
  image="${TP_FLARESOLVERR_IMAGE:-ghcr.io/flaresolverr/flaresolverr}"

  if tcp_check "$host" "$port" 800; then
    printf 'flaresolverr already running on %s:%s; status=occupied\n' "$host" "$port"
    return 0
  fi

  if docker ps --format '{{.Names}}' | grep -Fxq "$container_name"; then
    printf 'flaresolverr container %s already running; waiting for %s:%s\n' "$container_name" "$host" "$port"
  elif docker ps -a --format '{{.Names}}' | grep -Fxq "$container_name"; then
    docker start "$container_name" >/dev/null
  else
    docker run -d --name "$container_name" -p "$host:$port:8191" "$image" >/dev/null
  fi

  if ! wait_port "$host" "$port" 45; then
    log_error "FlareSolverr failed to start on $host:$port. Check docker logs $container_name"
    exit 1
  fi
}

start_flaresolverr_if_needed

if ! tcp_check 127.0.0.1 "$TP_BACKEND_PORT" 800; then
  start_background back "$REPO_ROOT/back" \
    "mvn -DskipTests -Dspring-boot.run.profiles=\"$spring_profile\" spring-boot:run" \
    mvn -DskipTests -Dspring-boot.run.profiles="$spring_profile" "-Dspring-boot.run.jvmArguments=-DAPP_PORT=$TP_BACKEND_PORT -Dmanagement.health.mail.enabled=false" spring-boot:run
  wait_port 127.0.0.1 "$TP_BACKEND_PORT" 90 || {
    log_error "Backend failed to start on $TP_BACKEND_PORT. Check $(log_path back)"
    exit 1
  }
else
  assert_port_owned_by_worktree back "$TP_BACKEND_PORT"
  printf 'back already running on %s; status=occupied\n' "$TP_BACKEND_PORT"
fi

if ! tcp_check 127.0.0.1 "$TP_FRONT_PORT" 800; then
  start_background front "$REPO_ROOT/$TP_FRONT_PROJECT_DIR" \
    "pnpm exec nuxt dev --host 0.0.0.0 --port $TP_FRONT_PORT" \
    pnpm exec nuxt dev --host 0.0.0.0 --port "$TP_FRONT_PORT"
  wait_port 127.0.0.1 "$TP_FRONT_PORT" 45 || {
    log_error "Front failed to start on $TP_FRONT_PORT. Check $(log_path front)"
    exit 1
  }
else
  assert_port_owned_by_worktree front "$TP_FRONT_PORT"
  printf 'front already running on %s; status=occupied\n' "$TP_FRONT_PORT"
fi

if ! tcp_check 127.0.0.1 "$TP_ADMIN_PORT" 800; then
  start_background data-query-app "$REPO_ROOT/data-query-app" \
    "pnpm exec nuxt dev --port $TP_ADMIN_PORT --host 0.0.0.0" \
    pnpm exec nuxt dev --port "$TP_ADMIN_PORT" --host 0.0.0.0
  wait_port 127.0.0.1 "$TP_ADMIN_PORT" 60 || {
    log_error "data-query-app failed to start on $TP_ADMIN_PORT. Check $(log_path data-query-app)"
    exit 1
  }
else
  assert_port_owned_by_worktree data-query-app "$TP_ADMIN_PORT"
  printf 'data-query-app already running on %s; status=occupied\n' "$TP_ADMIN_PORT"
fi

manifest_path="$report_dir/run-manifest.json"
branch="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || true)"
commit="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"

TP_RUN_ID="$run_id" \
TP_STARTED_AT="$started_at" \
TP_BRANCH="$branch" \
TP_COMMIT="$commit" \
TP_PROCESS_FILE="$processes_path" \
TP_PREFLIGHT_STATUS="$preflight_status" \
TP_MANIFEST_PATH="$manifest_path" \
node <<'NODE'
const fs = require('node:fs');
const net = require('node:net');

function tcpOpen(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(Number(port), host);
  });
}

function portState(port, open) {
  return open ? { "port": Number(port), "status": "occupied" } : { "port": Number(port), "status": "free" };
}

function truthy(value) {
  return ['true', '1', 'yes', 'y', 'on'].includes(String(value || '').toLowerCase());
}

async function tcpEndpointOpen(endpoint) {
  try {
    const url = new URL(endpoint);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return await tcpOpen(url.hostname, port);
  } catch {
    return false;
  }
}

const processLines = fs.existsSync(process.env.TP_PROCESS_FILE)
  ? fs.readFileSync(process.env.TP_PROCESS_FILE, 'utf8').trim().split('\n').filter(Boolean)
  : [];
const processes = processLines.map((line) => JSON.parse(line));

(async () => {
  const redisOpen = await tcpOpen(process.env.TP_REDIS_HOST, process.env.TP_REDIS_PORT);
  const backOpen = await tcpOpen('127.0.0.1', process.env.TP_BACKEND_PORT);
  const frontOpen = await tcpOpen('127.0.0.1', process.env.TP_FRONT_PORT);
  const adminOpen = await tcpOpen('127.0.0.1', process.env.TP_ADMIN_PORT);
  const minioPublicEndpoint = process.env.TP_MINIO_PUBLIC_ENDPOINT || '';
  const minioEnabled = truthy(process.env.TP_MINIO_ENABLED);
  const minioPublicOpen = minioEnabled && minioPublicEndpoint
    ? await tcpEndpointOpen(minioPublicEndpoint)
    : false;
  const imageOrigin = process.env.TP_IMAGE_ORIGIN || '';
  const imageOriginOpen = imageOrigin ? await tcpEndpointOpen(imageOrigin) : false;
  const imageOriginPort = (() => {
    try {
      const url = new URL(imageOrigin);
      return url.port || (url.protocol === 'https:' ? '443' : '80');
    } catch {
      return '';
    }
  })();
  if (imageOriginPort === '19001') {
    console.error('image origin points at MinIO console port 19001; use object API port 19000 instead');
  }
  const legacyOrigins = String(process.env.TP_LEGACY_IMAGE_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const flaresolverrEnabled = truthy(process.env.TP_FLARESOLVERR_ENABLED);
  const flaresolverrUrl = process.env.TP_FLARESOLVERR_URL || '';
  const flaresolverrOpen = flaresolverrEnabled && flaresolverrUrl
    ? await tcpEndpointOpen(flaresolverrUrl)
    : false;

  const manifest = {
    "runId": process.env.TP_RUN_ID,
    "startedAt": process.env.TP_STARTED_AT,
    "repoRoot": process.env.TP_REPO_ROOT,
    "branch": process.env.TP_BRANCH,
    "commit": process.env.TP_COMMIT,
    "configPath": process.env.TP_CONFIG_PATH,
    "ports": {
      redis: portState(process.env.TP_REDIS_PORT, redisOpen),
      backend: portState(process.env.TP_BACKEND_PORT, backOpen),
      front: portState(process.env.TP_FRONT_PORT, frontOpen),
      admin: portState(process.env.TP_ADMIN_PORT, adminOpen),
      minioPublic: minioEnabled ? { endpoint: minioPublicEndpoint, status: minioPublicOpen ? 'occupied' : 'free' } : { status: 'disabled' },
          imageOrigin: {
            endpoint: imageOrigin,
            status: imageOriginOpen ? 'occupied' : 'free',
            dataRootStatus: process.env.TP_IMAGE_ORIGIN_DATA_ROOT_STATUS || 'unchecked',
          },
      flaresolverr: flaresolverrEnabled ? { endpoint: flaresolverrUrl, status: flaresolverrOpen ? 'occupied' : 'free' } : { status: 'disabled' },
    },
    "springProfile": process.env.SPRING_PROFILES_ACTIVE,
    "processes": processes,
    "preflight": {
      script: 'scripts/dev/verify-local-stack.sh',
      status: process.env.TP_PREFLIGHT_STATUS,
    },
    "health": {
      redis: { port: Number(process.env.TP_REDIS_PORT), tcp: redisOpen, status: redisOpen ? 'occupied' : 'unreachable' },
      back: { port: Number(process.env.TP_BACKEND_PORT), tcp: backOpen, status: backOpen ? 'occupied' : 'unreachable' },
      front: { port: Number(process.env.TP_FRONT_PORT), tcp: frontOpen, status: frontOpen ? 'occupied' : 'unreachable' },
      dataQueryApp: { port: Number(process.env.TP_ADMIN_PORT), tcp: adminOpen, status: adminOpen ? 'occupied' : 'unreachable' },
          imageOrigin: {
            endpoint: imageOrigin,
            tcp: imageOriginOpen,
            status: imageOriginOpen && imageOriginPort !== '19001' ? 'occupied' : 'unreachable',
            dataRootStatus: process.env.TP_IMAGE_ORIGIN_DATA_ROOT_STATUS || 'unchecked',
            expectedDataDir: process.env.TP_IMAGE_ORIGIN_DATA_ROOT_EXPECTED || '',
            actualDataDir: process.env.TP_IMAGE_ORIGIN_DATA_ROOT_ACTUAL || '',
          },
      imageCompat: { legacyOrigins, status: process.env.TP_IMAGE_COMPAT_STATUS || 'disabled' },
      minioPublic: { endpoint: minioPublicEndpoint, tcp: minioPublicOpen, status: minioEnabled ? (minioPublicOpen ? 'occupied' : 'unreachable') : 'disabled' },
      flaresolverr: { endpoint: flaresolverrUrl, tcp: flaresolverrOpen, status: flaresolverrEnabled ? (flaresolverrOpen ? 'occupied' : 'unreachable') : 'disabled' },
    },
  };

  fs.writeFileSync(process.env.TP_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
})();
NODE

printf '\nredis(%s): %s\n' "$TP_REDIS_PORT" "$(tcp_check "$TP_REDIS_HOST" "$TP_REDIS_PORT" 500 && printf true || printf false)"
printf 'back(%s): %s\n' "$TP_BACKEND_PORT" "$(tcp_check 127.0.0.1 "$TP_BACKEND_PORT" 500 && printf true || printf false)"
printf 'front(%s): %s\n' "$TP_FRONT_PORT" "$(tcp_check 127.0.0.1 "$TP_FRONT_PORT" 500 && printf true || printf false)"
printf 'data-query-app(%s): %s\n' "$TP_ADMIN_PORT" "$(tcp_check 127.0.0.1 "$TP_ADMIN_PORT" 500 && printf true || printf false)"
if is_truthy "$TP_MINIO_ENABLED"; then
  minio_public_host="$(url_component "$TP_MINIO_PUBLIC_ENDPOINT" host)"
  minio_public_port="$(url_component "$TP_MINIO_PUBLIC_ENDPOINT" port)"
  printf 'minio-public(%s): %s\n' "$TP_MINIO_PUBLIC_ENDPOINT" "$(tcp_check "$minio_public_host" "$minio_public_port" 500 && printf true || printf false)"
fi
if is_truthy "$TP_FLARESOLVERR_ENABLED"; then
  flaresolverr_host="$(url_component "$TP_FLARESOLVERR_URL" host)"
  flaresolverr_port="$(url_component "$TP_FLARESOLVERR_URL" port)"
  printf 'flaresolverr(%s): %s\n' "$TP_FLARESOLVERR_URL" "$(tcp_check "$flaresolverr_host" "$flaresolverr_port" 500 && printf true || printf false)"
fi
printf '\ndatabase: %s\nconfig: %s\nflyway.outOfOrder: %s\nmanifest: %s\nLogs: %s\n' "$TP_DB_NAME" "$TP_CONFIG_PATH" "$TP_SPRING_FLYWAY_OUT_OF_ORDER" "$manifest_path" "$report_dir"
