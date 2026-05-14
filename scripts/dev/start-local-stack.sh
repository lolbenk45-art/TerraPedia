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

if ! $reuse_existing; then
  bash "$SCRIPT_DIR/stop-local-stack.sh"
fi

log_info "Running preflight checks before local stack startup..."
bash "$SCRIPT_DIR/verify-local-stack.sh"
preflight_status="passed"

load_runtime_config
require_command node
require_command mvn
require_command pnpm
require_command setsid
require_runtime_secret_before_manifest TP_ADMIN_PASSWORD
require_runtime_secret_before_manifest TP_ADMIN_TOKEN_SECRET
require_runtime_secret_before_manifest TP_USER_TOKEN_SECRET

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
if [[ -n "$TP_MINIO_CREDENTIALS_FILE" ]]; then
  export TERRAPEDIA_MINIO_CREDENTIALS_FILE="$TP_MINIO_CREDENTIALS_FILE"
fi

spring_profile="$TP_SPRING_PROFILE"
export SPRING_PROFILES_ACTIVE="$spring_profile"
export SPRING_FLYWAY_OUT_OF_ORDER="$TP_SPRING_FLYWAY_OUT_OF_ORDER"
export SPRING_DEVTOOLS_RESTART_ENABLED=false
export SPRING_DEVTOOLS_LIVERELOAD_ENABLED=false
export MANAGEMENT_HEALTH_MAIL_ENABLED=false

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

  local out_path err_path pid
  out_path="$(log_path "redis-$TP_REDIS_PORT")"
  err_path="$out_path.err"
  nohup "$redis_cmd" --port "$TP_REDIS_PORT" --bind "$TP_REDIS_HOST" --protected-mode yes --requirepass "$TP_REDIS_PASSWORD" >"$out_path" 2>"$err_path" &
  pid=$!
  printf '%s\n' "$pid" >"$report_dir/redis-$TP_REDIS_PORT.pid"
  append_process "redis-$TP_REDIS_PORT" "$pid" "$out_path" "$err_path" "redis-server --port $TP_REDIS_PORT --bind $TP_REDIS_HOST --protected-mode yes --requirepass <redacted>" running
  printf 'redis PID=%s log=%s\n' "$pid" "$out_path"

  if ! wait_port "$TP_REDIS_HOST" "$TP_REDIS_PORT" 15; then
    log_error "Redis $TP_REDIS_PORT failed to start. Check $out_path and $err_path"
    exit 1
  fi
}

start_redis_if_needed

if ! tcp_check 127.0.0.1 "$TP_BACKEND_PORT" 800; then
  start_background back "$REPO_ROOT/back" \
    "mvn -DskipTests -Dspring-boot.run.profiles=\"$spring_profile\" spring-boot:run" \
    mvn -DskipTests -Dspring-boot.run.profiles="$spring_profile" "-Dspring-boot.run.jvmArguments=-DAPP_PORT=$TP_BACKEND_PORT -DTERRAPEDIA_MAIL_ENABLED=false -Dmanagement.health.mail.enabled=false" spring-boot:run
  wait_port 127.0.0.1 "$TP_BACKEND_PORT" 90 || {
    log_error "Backend failed to start on $TP_BACKEND_PORT. Check $(log_path back)"
    exit 1
  }
else
  printf 'back already running on %s; status=occupied\n' "$TP_BACKEND_PORT"
fi

if ! tcp_check 127.0.0.1 "$TP_FRONT_PORT" 800; then
  start_background front "$REPO_ROOT/front" \
    "pnpm run dev --host localhost --port $TP_FRONT_PORT" \
    pnpm run dev --host localhost --port "$TP_FRONT_PORT"
  wait_port 127.0.0.1 "$TP_FRONT_PORT" 45 || {
    log_error "Front failed to start on $TP_FRONT_PORT. Check $(log_path front)"
    exit 1
  }
else
  printf 'front already running on %s; status=occupied\n' "$TP_FRONT_PORT"
fi

if ! tcp_check 127.0.0.1 "$TP_ADMIN_PORT" 800; then
  start_background data-query-app "$REPO_ROOT/data-query-app" \
    "pnpm exec nuxt dev --port $TP_ADMIN_PORT --host localhost" \
    pnpm exec nuxt dev --port "$TP_ADMIN_PORT" --host localhost
  wait_port 127.0.0.1 "$TP_ADMIN_PORT" 60 || {
    log_error "data-query-app failed to start on $TP_ADMIN_PORT. Check $(log_path data-query-app)"
    exit 1
  }
else
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

const processLines = fs.existsSync(process.env.TP_PROCESS_FILE)
  ? fs.readFileSync(process.env.TP_PROCESS_FILE, 'utf8').trim().split('\n').filter(Boolean)
  : [];
const processes = processLines.map((line) => JSON.parse(line));

(async () => {
  const redisOpen = await tcpOpen(process.env.TP_REDIS_HOST, process.env.TP_REDIS_PORT);
  const backOpen = await tcpOpen('127.0.0.1', process.env.TP_BACKEND_PORT);
  const frontOpen = await tcpOpen('127.0.0.1', process.env.TP_FRONT_PORT);
  const adminOpen = await tcpOpen('127.0.0.1', process.env.TP_ADMIN_PORT);

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
    },
  };

  fs.writeFileSync(process.env.TP_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
})();
NODE

printf '\nredis(%s): %s\n' "$TP_REDIS_PORT" "$(tcp_check "$TP_REDIS_HOST" "$TP_REDIS_PORT" 500 && printf true || printf false)"
printf 'back(%s): %s\n' "$TP_BACKEND_PORT" "$(tcp_check 127.0.0.1 "$TP_BACKEND_PORT" 500 && printf true || printf false)"
printf 'front(%s): %s\n' "$TP_FRONT_PORT" "$(tcp_check 127.0.0.1 "$TP_FRONT_PORT" 500 && printf true || printf false)"
printf 'data-query-app(%s): %s\n' "$TP_ADMIN_PORT" "$(tcp_check 127.0.0.1 "$TP_ADMIN_PORT" 500 && printf true || printf false)"
printf '\ndatabase: %s\nconfig: %s\nflyway.outOfOrder: %s\nmanifest: %s\nLogs: %s\n' "$TP_DB_NAME" "$TP_CONFIG_PATH" "$TP_SPRING_FLYWAY_OUT_OF_ORDER" "$manifest_path" "$report_dir"
