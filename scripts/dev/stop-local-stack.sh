#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"
# shellcheck source=lib/process.sh
source "$SCRIPT_DIR/lib/process.sh"

force_ports=false
stop_shared=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --force-ports|-ForcePorts)
      force_ports=true
      ;;
    --stop-shared|-StopShared)
      stop_shared=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/dev/stop-local-stack.sh [--force-ports] [--stop-shared]

Stops only recorded reports/local-start/*.pid processes by default.
Shared Redis is preserved unless --stop-shared is passed (other worktrees may share it).
Use --force-ports only when stale pid files are missing and configured ports are known to belong to this repo run.
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
load_runtime_config

stop_recorded_pid_file() {
  local pid_path="$1"
  local name pid_text
  name="$(basename "$pid_path" .pid)"
  pid_text="$(tr -d '[:space:]' <"$pid_path" 2>/dev/null || true)"

  if [[ "$pid_text" =~ ^[0-9]+$ ]] && (( pid_text > 0 )); then
    stop_process_tree "$pid_text" "$name"
  else
    log_warn "skip name=$name pid file because it does not contain a valid pid"
  fi

  rm -f "$pid_path"
}

if [[ -d "$report_dir" ]]; then
  for pid_path in "$report_dir"/*.pid; do
    [[ -e "$pid_path" ]] || continue
    name="$(basename "$pid_path" .pid)"
    if [[ "$name" == redis-* ]] && ! $stop_shared; then
      log_info "skip shared redis $name (use --stop-shared to stop it)"
      continue
    fi
    stop_recorded_pid_file "$pid_path"
  done
fi

local_stack_labels=(back front data-query-app "redis-$TP_REDIS_PORT")

if $force_ports; then
  log_warn "Force port cleanup requested; checking configured local stack ports after pid cleanup."
  port_targets=(
    "back:$TP_BACKEND_PORT"
    "front:$TP_FRONT_PORT"
    "data-query-app:$TP_ADMIN_PORT"
  )
  if $stop_shared; then
    port_targets=("redis:$TP_REDIS_PORT" "${port_targets[@]}")
  fi
  for label_port in "${port_targets[@]}"; do
    label="${label_port%%:*}"
    port="${label_port##*:}"
    for pid in $(port_pids "$port"); do
      stop_process_tree "$pid" "$label-port-$port"
    done
  done
fi
