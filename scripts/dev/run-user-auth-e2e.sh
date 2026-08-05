#!/usr/bin/env bash

set +x
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/dev/run-user-auth-e2e.sh --smoke|--regression

Runs the isolated user-auth browser suite only after TERRAPEDIA_E2E_ENABLED=1.
EOF
}

die() {
  printf 'run-user-auth-e2e: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"
}

require_loopback_host() {
  case "$1" in
    127.0.0.1)
      ;;
    *)
      die "$2 must be a loopback host"
      ;;
  esac
}

require_port() {
  local value="$1"
  local label="$2"
  local numeric_value

  [[ "$value" =~ ^[0-9]+$ ]] || die "$label must be a numeric TCP port"
  numeric_value=$((10#$value))
  (( numeric_value >= 1 && numeric_value <= 65535 )) || die "$label must be between 1 and 65535"
}

require_unset_value() {
  local variable_name="$1"
  [[ -z "${!variable_name:-}" ]] || die "$variable_name must not be inherited by the isolated E2E runner"
}

require_mysql_option_value() {
  local value="$1"
  local label="$2"

  [[ "$value" != *[[:cntrl:]]* ]] || die "$label must not contain control characters"
}

mode=''
if [[ "$#" -ne 1 ]]; then
  usage >&2
  exit 2
fi

case "$1" in
  --smoke)
    mode='smoke'
    ;;
  --regression)
    mode='regression'
    ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

[[ "${TERRAPEDIA_E2E_ENABLED:-}" == '1' ]] || die 'set TERRAPEDIA_E2E_ENABLED=1 to permit isolated E2E execution'

for inherited_variable in $(compgen -e); do
  case "$inherited_variable" in
    TERRAPEDIA_E2E_TEST_*)
      die 'test-only E2E environment variables are forbidden'
      ;;
  esac
done

for forbidden_variable in \
  TERRAPEDIA_DB_URL \
  TERRAPEDIA_LOCAL_STACK_CONFIG \
  SPRING_DATASOURCE_URL \
  SPRING_DATASOURCE_USERNAME \
  SPRING_DATASOURCE_PASSWORD \
  TERRAPEDIA_E2E_DB_URL \
  TERRAPEDIA_E2E_DB_NAME \
  TERRAPEDIA_E2E_RUN_ID \
  TERRAPEDIA_E2E_RUN_SECRET; do
  require_unset_value "$forbidden_variable"
done

mysql_host="${TERRAPEDIA_E2E_MYSQL_HOST:-127.0.0.1}"
mysql_port="${TERRAPEDIA_E2E_MYSQL_PORT:-13306}"
redis_host="${TERRAPEDIA_E2E_REDIS_HOST:-127.0.0.1}"
redis_port="${TERRAPEDIA_E2E_REDIS_PORT:-6380}"
redis_database="${TERRAPEDIA_E2E_REDIS_DATABASE:-15}"
backend_port="${TERRAPEDIA_E2E_BACKEND_PORT:-}"
frontend_port="${TERRAPEDIA_E2E_FRONTEND_PORT:-}"
chromium_executable="${TERRAPEDIA_E2E_CHROMIUM_EXECUTABLE:-}"
mysql_username="${TERRAPEDIA_E2E_MYSQL_USERNAME:-}"
mysql_password="${TERRAPEDIA_E2E_MYSQL_PASSWORD:-}"
redis_password="${TERRAPEDIA_E2E_REDIS_PASSWORD:-}"

require_loopback_host "$mysql_host" 'TERRAPEDIA_E2E_MYSQL_HOST'
require_loopback_host "$redis_host" 'TERRAPEDIA_E2E_REDIS_HOST'
require_port "$mysql_port" 'TERRAPEDIA_E2E_MYSQL_PORT'
require_port "$redis_port" 'TERRAPEDIA_E2E_REDIS_PORT'
[[ "$redis_database" == '15' ]] || die 'TERRAPEDIA_E2E_REDIS_DATABASE must be exactly 15'
[[ -n "$backend_port" ]] || die 'TERRAPEDIA_E2E_BACKEND_PORT is required'
[[ -n "$frontend_port" ]] || die 'TERRAPEDIA_E2E_FRONTEND_PORT is required'
require_port "$backend_port" 'TERRAPEDIA_E2E_BACKEND_PORT'
require_port "$frontend_port" 'TERRAPEDIA_E2E_FRONTEND_PORT'
[[ "$backend_port" != "$frontend_port" ]] || die 'backend and frontend ports must differ'
[[ -n "$mysql_username" && -n "$mysql_password" ]] || die 'TERRAPEDIA_E2E_MYSQL_USERNAME and TERRAPEDIA_E2E_MYSQL_PASSWORD are required'
require_mysql_option_value "$mysql_username" 'TERRAPEDIA_E2E_MYSQL_USERNAME'
require_mysql_option_value "$mysql_password" 'TERRAPEDIA_E2E_MYSQL_PASSWORD'
[[ -n "$chromium_executable" && -x "$chromium_executable" ]] || die 'TERRAPEDIA_E2E_CHROMIUM_EXECUTABLE must name an executable Chromium binary'

for command_name in env flock mysql redis-cli curl mvn pnpm node setsid ss ps; do
  require_command "$command_name"
done

runner_path="${PATH:-}"
[[ -n "$runner_path" ]] || die 'PATH is required to run the isolated E2E runner'
isolated_environment=(
  "PATH=$runner_path"
  'HOME=/tmp'
  'TMPDIR=/tmp'
  'LANG=C'
  'LC_ALL=C'
)

run_id="$(env -i "${isolated_environment[@]}" node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')"
[[ "$run_id" =~ ^[a-f0-9]{32}$ ]] || die 'generated E2E run ID is unsafe'
database_name="terria_v1_e2e_${run_id}"
[[ "$database_name" == "terria_v1_e2e_${run_id}" && "$database_name" =~ ^terria_v1_e2e_[a-f0-9]{32}$ ]] \
  || die 'derived E2E database name is unsafe'
readonly run_id database_name

script_dir="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -P "$script_dir/../.." && pwd -P)"
report_dir="$repo_root/reports/e2e/$run_id"
lock_path='/tmp/terrapedia-user-auth-e2e.lock'
mysql_defaults=''
private_run_dir=''
backend_log=''
frontend_log=''
suite_log=''
cleanup_log=''
lock_held=false
db_created=false
redis_flushed=false
backend_pid=''
backend_group=''
frontend_pid=''
frontend_group=''
suite_succeeded=false
report_ready=false
readonly ready_attempts=60
readonly current_uid="$(/usr/bin/id -u)"

mysql_client() {
  env -i "${isolated_environment[@]}" mysql --defaults-extra-file="$mysql_defaults" --protocol=TCP --host "$mysql_host" --port "$mysql_port" "$@"
}

redis_client() {
  if [[ -n "$redis_password" ]]; then
    env -i "${isolated_environment[@]}" "REDISCLI_AUTH=$redis_password" redis-cli --raw -h "$redis_host" -p "$redis_port" -n "$redis_database" "$@"
  else
    env -i "${isolated_environment[@]}" redis-cli --raw -h "$redis_host" -p "$redis_port" -n "$redis_database" "$@"
  fi
}

curl_client() {
  env -i "${isolated_environment[@]}" curl "$@"
}

port_is_owned_by_group() {
  local port="$1"
  local group="$2"
  local listeners
  local listener_pid
  local process_group
  local found_listener=false

  listeners="$(ss -H -ltnp "sport = :$port" 2>/dev/null)" || return 2
  while [[ "$listeners" =~ pid=([0-9]+) ]]; do
    listener_pid="${BASH_REMATCH[1]}"
    found_listener=true
    process_group="$(ps -o pgid= -p "$listener_pid" 2>/dev/null | tr -d '[:space:]' || true)"
    [[ "$process_group" == "$group" ]] || return 1
    listeners="${listeners#*"pid=$listener_pid"}"
  done

  [[ "$found_listener" == true ]]
}

port_is_listening() {
  local port="$1"
  local listeners

  listeners="$(ss -H -ltn "sport = :$port" 2>/dev/null)" || return 2
  [[ -n "$listeners" ]]
}

port_is_unbound() {
  local port="$1"
  local listener_status=0

  port_is_listening "$port" || listener_status=$?
  if [[ "$listener_status" -eq 0 ]]; then
    die "runner port $port is already occupied"
  fi
  [[ "$listener_status" -eq 1 ]] || die "cannot verify whether runner port $port is unbound"
}

wait_for_owned_listener() {
  local name="$1"
  local port="$2"
  local group="$3"
  local attempt

  [[ -n "$group" ]] || die "$name process group was not recorded"
  for attempt in $(seq 1 "$ready_attempts"); do
    if port_is_owned_by_group "$port" "$group"; then
      return 0
    fi
    sleep 1
  done
  die "$name listener on port $port is not owned by the recorded process group"
}

start_owned_group() {
  local name="$1"
  local working_directory="$2"
  local pid_variable="$3"
  local group_variable="$4"
  local log_path="$private_run_dir/$name.log"
  local pid
  local group
  shift 4

  (
    cd "$working_directory"
    exec env -i "${e2e_environment[@]}" setsid "$@"
  ) >"$log_path" 2>&1 &
  pid="$!"
  group="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]' || true)"
  printf -v "$pid_variable" '%s' "$pid"
  printf -v "$group_variable" '%s' "$group"
  [[ -n "$group" && "$group" == "$pid" ]] || die "$name process group cannot be verified"
}

group_has_processes() {
  local process_group="$1"
  local process_table
  local process_id
  local current_group

  process_table="$(ps -eo pid=,pgid= 2>/dev/null)" || return 2
  while read -r process_id current_group; do
    [[ "$current_group" == "$process_group" ]] && return 0
  done <<<"$process_table"
  return 1
}

group_and_listener_are_gone() {
  local process_group="$1"
  local port="$2"
  local group_status
  local listener_status=0

  group_status=0
  group_has_processes "$process_group" || group_status=$?
  [[ "$group_status" -eq 1 ]] || return 1
  port_is_listening "$port" || listener_status=$?
  [[ "$listener_status" -eq 1 ]]
}

stop_owned_group() {
  local name="$1"
  local process_id="$2"
  local process_group="$3"
  local port="$4"
  local group_status
  local group_is_alive
  local attempt

  [[ -n "$name" && -n "$process_id" && -n "$process_group" && "$process_id" == "$process_group" ]] || return 1
  group_status=0
  group_has_processes "$process_group" || group_status=$?
  if [[ "$group_status" -eq 0 ]]; then
    group_is_alive=true
  elif [[ "$group_status" -eq 1 ]]; then
    group_is_alive=false
  else
    return 1
  fi

  if [[ "$group_is_alive" == false ]]; then
    local listener_status=0

    port_is_listening "$port" || listener_status=$?
    [[ "$listener_status" -eq 1 ]] && return 0
    return 1
  fi
  port_is_owned_by_group "$port" "$process_group" || return 1

  kill -TERM -- "-$process_group" 2>/dev/null || return 1
  for attempt in $(seq 1 10); do
    group_and_listener_are_gone "$process_group" "$port" && return 0
    sleep 1
  done
  kill -KILL -- "-$process_group" 2>/dev/null || return 1
  for attempt in $(seq 1 5); do
    group_and_listener_are_gone "$process_group" "$port" && return 0
    sleep 1
  done
  return 1
}

validate_database_identity() {
  local expected_database="terria_v1_e2e_${run_id}"

  [[ "$database_name" == "$expected_database" && "$database_name" =~ ^terria_v1_e2e_[a-f0-9]{32}$ ]] || return 1
}

read_report_metadata() {
  local path="$1"
  local report_owner
  local report_mode

  report_owner="$(/usr/bin/stat -c '%u' -- "$path")" || return 1
  report_mode="$(/usr/bin/stat -c '%a' -- "$path")" || return 1
  [[ "$report_owner" =~ ^[0-9]+$ && "$report_mode" =~ ^[0-7]+$ ]] || return 1
  printf '%s %s\n' "$report_owner" "$report_mode"
}

prepare_generic_report_parent_directory() {
  local path="$1"
  local metadata
  local owner
  local mode

  [[ ! -L "$path" ]] || return 1
  if [[ -e "$path" ]]; then
    [[ -d "$path" ]] || return 1
    metadata="$(read_report_metadata "$path")" || return 1
    read -r owner mode <<<"$metadata"
    [[ "$owner" == "$current_uid" ]] || return 1
    chmod 700 -- "$path" || return 1
  else
    mkdir -m 700 -- "$path" || return 1
  fi
  [[ ! -L "$path" && -d "$path" ]] || return 1
  metadata="$(read_report_metadata "$path")" || return 1
  read -r owner mode <<<"$metadata"
  [[ "$owner" == "$current_uid" && "$mode" == '700' ]]
}

validate_private_report_entry() {
  local path="$1"
  local metadata
  local owner
  local mode
  local child

  [[ ! -L "$path" ]] || return 1
  metadata="$(read_report_metadata "$path")" || return 1
  read -r owner mode <<<"$metadata"
  [[ "$owner" == "$current_uid" ]] || return 1
  if [[ -d "$path" ]]; then
    [[ "$mode" == '700' ]] || return 1
    for child in "$path"/* "$path"/.[!.]* "$path"/..?*; do
      [[ -e "$child" || -L "$child" ]] || continue
      validate_private_report_entry "$child" || return 1
    done
    return 0
  fi
  [[ -f "$path" && "$mode" == '600' ]]
}

prepare_exact_report_directory() {
  local path="$1"
  local metadata
  local owner
  local mode

  [[ ! -L "$path" ]] || return 1
  if [[ -e "$path" ]]; then
    [[ -d "$path" ]] || return 1
    metadata="$(read_report_metadata "$path")" || return 1
    read -r owner mode <<<"$metadata"
    [[ "$owner" == "$current_uid" && "$mode" == '700' ]] || return 1
    validate_private_report_entry "$path" || return 1
  else
    mkdir -m 700 -- "$path" || return 1
  fi
  [[ ! -L "$path" && -d "$path" ]] || return 1
  metadata="$(read_report_metadata "$path")" || return 1
  read -r owner mode <<<"$metadata"
  [[ "$owner" == "$current_uid" && "$mode" == '700' ]] || return 1
  validate_private_report_entry "$path"
}

prepare_report() {
  prepare_generic_report_parent_directory "$repo_root/reports" || return 1
  prepare_generic_report_parent_directory "$repo_root/reports/e2e" || return 1
  prepare_exact_report_directory "$report_dir" || return 1
  prepare_exact_report_directory "$report_dir/artifacts" || return 1
  validate_private_report_entry "$report_dir" || return 1
  report_ready=true
}

report_tree_is_safe() {
  [[ "$report_ready" == true ]] && validate_private_report_entry "$report_dir"
}

write_summary() {
  local outcome="$1"
  local exit_status="$2"
  local cleanup_status="$3"

  report_tree_is_safe || return 1
  cat >"$report_dir/summary.json" <<EOF || return 1
{
  "mode": "$mode",
  "runId": "$run_id",
  "database": "$database_name",
  "redisDatabase": 15,
  "outcome": "$outcome",
  "exitStatus": $exit_status,
  "cleanupStatus": "$cleanup_status"
}
EOF
  chmod 600 "$report_dir/summary.json" || return 1
  report_tree_is_safe
}

cleanup() {
  local original_status=$?
  local cleanup_failed=false
  local marker_result=''
  local final_status
  local cleanup_status
  local outcome
  local processes_stopped=true

  trap - EXIT INT TERM

  if [[ -n "$frontend_pid" || -n "$frontend_group" ]]; then
    if ! stop_owned_group 'frontend' "$frontend_pid" "$frontend_group" "$frontend_port"; then
      cleanup_failed=true
      processes_stopped=false
    fi
  fi
  if [[ -n "$backend_pid" || -n "$backend_group" ]]; then
    if ! stop_owned_group 'backend' "$backend_pid" "$backend_group" "$backend_port"; then
      cleanup_failed=true
      processes_stopped=false
    fi
  fi

  if [[ "$processes_stopped" == true && "$redis_flushed" == true ]]; then
    if ! redis_client FLUSHDB; then
      cleanup_failed=true
    fi
  fi

  if [[ "$processes_stopped" == true && "$db_created" == true ]]; then
    if validate_database_identity \
      && marker_result="$(mysql_client "$database_name" -N -e "SELECT 1 FROM __terrapedia_e2e_ownership WHERE run_id = '$run_id' AND owner = 'terrapedia-user-auth-e2e' LIMIT 1")" \
      && [[ "$marker_result" == '1' ]] \
      && validate_database_identity; then
      if ! mysql_client -e "DROP DATABASE \`$database_name\`"; then
        cleanup_failed=true
      fi
    else
      cleanup_failed=true
    fi
  fi

  if [[ -n "$mysql_defaults" && -f "$mysql_defaults" ]]; then
    if ! rm -f "$mysql_defaults"; then
      cleanup_failed=true
    fi
  fi

  if [[ -n "$private_run_dir" && -d "$private_run_dir" ]]; then
    if ! rm -rf -- "$private_run_dir"; then
      cleanup_failed=true
    fi
  fi

  final_status="$original_status"
  if [[ "$report_ready" != true ]]; then
    cleanup_failed=true
  fi
  if [[ "$cleanup_failed" == true ]]; then
    final_status=1
  fi
  cleanup_status='passed'
  [[ "$cleanup_failed" == false ]] || cleanup_status='failed'
  outcome='failed'
  if [[ "$suite_succeeded" == true && "$original_status" -eq 0 && "$final_status" -eq 0 ]]; then
    outcome='passed'
  fi
  if [[ "$report_ready" == true ]]; then
    if ! write_summary "$outcome" "$final_status" "$cleanup_status"; then
      final_status=1
    fi
  fi

  if [[ "$lock_held" == true ]]; then
    flock -u 9 || final_status=1
    exec 9>&-
    lock_held=false
  fi

  exit "$final_status"
}

exec 9>"$lock_path"
if ! flock -n 9; then
  exec 9>&-
  die 'another isolated user-auth E2E run is already active'
fi
lock_held=true
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

umask 077
prepare_report || die 'cannot safely prepare the durable E2E report directory'
private_run_dir="$(mktemp -d '/tmp/terrapedia-user-auth-e2e.XXXXXX')"
chmod 700 "$private_run_dir"
mkdir -p "$private_run_dir/home" "$private_run_dir/tmp"
chmod 700 "$private_run_dir/home" "$private_run_dir/tmp"
isolated_environment=(
  "PATH=$runner_path"
  "HOME=$private_run_dir/home"
  "TMPDIR=$private_run_dir/tmp"
  'LANG=C'
  'LC_ALL=C'
)
backend_log="$private_run_dir/backend.log"
frontend_log="$private_run_dir/frontend.log"
suite_log="$private_run_dir/suite.log"
cleanup_log="$private_run_dir/cleanup.log"
mysql_defaults="$(mktemp "$private_run_dir/mysql.XXXXXX")"
chmod 600 "$mysql_defaults"
{
  printf '[client]\n'
  printf 'user=%s\n' "$mysql_username"
  printf 'password=%s\n' "$mysql_password"
} >"$mysql_defaults"

run_secret="$(env -i "${isolated_environment[@]}" node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
[[ "$run_secret" =~ ^[a-f0-9]{64}$ ]] || die 'generated E2E run secret is unsafe'

mysql_client -e "CREATE DATABASE \`$database_name\`"
mysql_client "$database_name" -e "CREATE TABLE IF NOT EXISTS __terrapedia_e2e_ownership (run_id VARCHAR(64) NOT NULL PRIMARY KEY, owner VARCHAR(64) NOT NULL); INSERT INTO __terrapedia_e2e_ownership (run_id, owner) VALUES ('$run_id', 'terrapedia-user-auth-e2e')"
db_created=true

redis_client FLUSHDB
redis_flushed=true

backend_origin="http://127.0.0.1:$backend_port"
frontend_origin="http://127.0.0.1:$frontend_port"
e2e_artifact_dir="$report_dir/artifacts"
e2e_environment=(
  "${isolated_environment[@]}"
  'SPRING_PROFILES_ACTIVE=e2e'
  'SPRING_FLYWAY_BASELINE_VERSION=0'
  'TERRAPEDIA_E2E_ENABLED=true'
  "TERRAPEDIA_E2E_DB_URL=jdbc:mysql://$mysql_host:$mysql_port/$database_name"
  "TERRAPEDIA_E2E_DB_USERNAME=$mysql_username"
  "TERRAPEDIA_E2E_DB_PASSWORD=$mysql_password"
  "TERRAPEDIA_E2E_REDIS_HOST=$redis_host"
  "TERRAPEDIA_E2E_REDIS_PORT=$redis_port"
  "TERRAPEDIA_E2E_REDIS_DATABASE=$redis_database"
  "TERRAPEDIA_E2E_REDIS_PASSWORD=$redis_password"
  "TERRAPEDIA_E2E_RUN_ID=$run_id"
  "TERRAPEDIA_E2E_RUN_SECRET=$run_secret"
  "SERVER_PORT=$backend_port"
  "TERRAPEDIA_BACKEND_ORIGIN=$backend_origin"
  "E2E_BASE_URL=$frontend_origin"
  "E2E_BACKEND_BASE_URL=$backend_origin"
  "E2E_RUN_ID=$run_id"
  "E2E_RUN_SECRET=$run_secret"
  "E2E_ARTIFACT_DIR=$e2e_artifact_dir"
  "E2E_CHROMIUM_EXECUTABLE=$chromium_executable"
)

port_is_unbound "$backend_port"
start_owned_group 'backend' "$repo_root/back" backend_pid backend_group mvn -q spring-boot:run
wait_for_owned_listener 'backend' "$backend_port" "$backend_group"

for attempt in $(seq 1 60); do
  status_code="$(curl_client --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 2 --request POST "$backend_origin/api/user-auth/refresh" 2>>"$backend_log" || true)"
  [[ "$status_code" == '401' ]] && break
  sleep 1
done
[[ "$status_code" == '401' ]] || die 'backend did not return 401 from the refresh endpoint'

port_is_unbound "$frontend_port"
start_owned_group 'frontend' "$repo_root/front-nuxt" frontend_pid frontend_group pnpm exec nuxt dev --host 127.0.0.1 --port "$frontend_port"
wait_for_owned_listener 'frontend' "$frontend_port" "$frontend_group"

for attempt in $(seq 1 60); do
  status_code="$(curl_client --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 2 "$frontend_origin/" 2>>"$frontend_log" || true)"
  [[ "$status_code" == '200' ]] && break
  sleep 1
done
[[ "$status_code" == '200' ]] || die 'frontend root did not become ready'

env -i "${e2e_environment[@]}" pnpm --dir "$repo_root/front-nuxt" run "test:e2e:auth:$mode" >"$suite_log" 2>&1
suite_succeeded=true
