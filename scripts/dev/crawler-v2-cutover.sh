#!/usr/bin/env bash
# One-shot crawler queue V2 cutover for the current worktree.
#
# The durable V2 marker (reports/crawler-monitor/v2/cutover-state.json) is
# gitignored, so every fresh worktree/clone silently routes to the retired V1
# engine. This script performs the runbook sequence end to end:
#   preflight -> restart backend with the temporary cutover switch ->
#   authenticated POST /cutover -> verify durable marker + stable overview ->
#   restart backend without the switch -> verify routing stays V2.
#
# Runbook: docs/runbooks/crawler-monitor-queue-v2-cutover.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"

REPO_ROOT="$(resolve_repo_root "$PWD")"
cd "$REPO_ROOT"
load_runtime_config

require_command curl
require_command python3

state_path="$REPO_ROOT/reports/crawler-monitor/v2/cutover-state.json"
pid_path="$REPO_ROOT/reports/local-start/back.pid"
backend_url="http://127.0.0.1:$TP_BACKEND_PORT"

api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-s -X "$method" "$backend_url/api$path" -H "Authorization: Bearer $bearer_token" -H 'Content-Type: application/json')
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}"
}

json_field() {
  python3 -c "
import json, sys
data = json.load(sys.stdin)
for key in sys.argv[1].split('.'):
    data = (data or {}).get(key)
print('' if data is None else data)
" "$1"
}

restart_backend() {
  if [[ -f "$pid_path" ]]; then
    local back_pid
    back_pid="$(cat "$pid_path")"
    if kill -0 "$back_pid" 2>/dev/null; then
      log_info "Stopping backend PID $back_pid"
      # shellcheck disable=SC2046
      kill -TERM "$back_pid" $(pgrep -P "$back_pid" || true) 2>/dev/null || true
      for _ in $(seq 1 30); do
        kill -0 "$back_pid" 2>/dev/null || break
        sleep 1
      done
      kill -0 "$back_pid" 2>/dev/null && { log_error "Backend PID $back_pid did not stop"; exit 1; }
    fi
  fi
  bash "$SCRIPT_DIR/start-local-stack.sh" --reuse-existing >/dev/null
  log_info "Backend restarted on port $TP_BACKEND_PORT"
}

login() {
  bearer_token="$(curl -s -X POST "$backend_url/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$TP_ADMIN_USERNAME\",\"password\":\"$TP_ADMIN_PASSWORD\"}" \
    | json_field 'data.token')"
  [[ -n "$bearer_token" ]] || { log_error "Admin login failed"; exit 1; }
}

# --- Preflight ---------------------------------------------------------------

if [[ -f "$state_path" ]]; then
  existing_mode="$(json_field 'mode' < "$state_path")"
  if [[ "$existing_mode" == "V2" ]]; then
    log_info "Durable marker already V2 (cutoverId=$(json_field 'cutoverId' < "$state_path")); nothing to do."
    exit 0
  fi
  log_error "Durable marker exists with mode=$existing_mode; resolve it manually per the runbook before rerunning."
  exit 1
fi

if pgrep -f "fetch-wiki|backend-data-refresh" >/dev/null 2>&1; then
  log_error "Live crawler processes detected; wait for them to finish or stop them before cutover."
  exit 1
fi

git_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
cutover_id="crawler-v2-$(date -u +%Y%m%dT%H%M%SZ)"
log_info "Cutover ID: $cutover_id (gitSha=$git_sha)"

# --- Cutover with temporary switch --------------------------------------------

export TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true
restart_backend
login

response="$(api POST /admin/crawler-monitor/cutover \
  "{\"cutoverId\":\"$cutover_id\",\"confirmation\":\"CUTOVER_CRAWLER_QUEUE_V2\",\"gitSha\":\"$git_sha\"}")"
engine_mode="$(printf '%s' "$response" | json_field 'data.engineMode')"
if [[ "$engine_mode" != "v2" ]]; then
  log_error "Cutover failed: $response"
  exit 1
fi
epoch="$(printf '%s' "$response" | json_field 'data.stateStoreEpoch')"
log_info "Cutover succeeded: epoch=$epoch"

marker_mode="$(json_field 'mode' < "$state_path")"
[[ "$marker_mode" == "V2" ]] || { log_error "Durable marker not V2 after cutover"; exit 1; }

first="$(api GET /admin/crawler-monitor/overview | json_field 'data.stateStoreEpoch')"
sleep 2
second="$(api GET /admin/crawler-monitor/overview | json_field 'data.stateStoreEpoch')"
if [[ "$first" != "$epoch" || "$second" != "$epoch" ]]; then
  log_error "Overview epoch unstable after cutover: read1=$first read2=$second expected=$epoch"
  exit 1
fi
log_info "Two overview reads stable on epoch $epoch"

# --- Restart without the switch ------------------------------------------------

unset TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED
restart_backend
login

routed_epoch="$(api GET /admin/crawler-monitor/overview | json_field 'data.stateStoreEpoch')"
[[ "$routed_epoch" == "$epoch" ]] || { log_error "Routing lost V2 after restart without switch (epoch=$routed_epoch)"; exit 1; }

log_info "V2 cutover complete and durable. cutoverId=$cutover_id epoch=$epoch"
