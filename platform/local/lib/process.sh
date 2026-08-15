#!/usr/bin/env bash

set -euo pipefail

if ! declare -F resolve_repo_root >/dev/null 2>&1; then
  # shellcheck source=common.sh
  source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fi

pid_dir() {
  local root
  root="$(resolve_repo_root "$PWD")"
  printf '%s\n' "$root/reports/local-start"
}

pid_file_for() {
  local name="$1"
  printf '%s/%s.pid\n' "$(pid_dir)" "$name"
}

write_pid_file() {
  local name="$1"
  local pid="$2"
  ensure_dir "$(pid_dir)"
  printf '%s\n' "$pid" >"$(pid_file_for "$name")"
}

read_pid_file() {
  local name="$1"
  local path
  path="$(pid_file_for "$name")"
  [[ -f "$path" ]] || return 1
  tr -d '[:space:]' <"$path"
}

process_cmdline() {
  local pid="$1"
  if [[ -r "/proc/$pid/cmdline" ]]; then
    tr '\0' ' ' <"/proc/$pid/cmdline"
  else
    ps -p "$pid" -o args= 2>/dev/null || true
  fi
}

process_cwd() {
  local pid="$1"
  readlink "/proc/$pid/cwd" 2>/dev/null || true
}

is_local_stack_process() {
  local pid="$1"
  local root cmd cwd
  root="$(resolve_repo_root "$PWD")"
  cmd="$(process_cmdline "$pid")"
  cwd="$(process_cwd "$pid")"

  if [[ "$cwd" == "$root"* || "$cmd" == *"$root"* ]]; then
    return 0
  fi

  if [[ "$cmd" == *"redis-server"* && -n "${TP_REDIS_PORT:-}" && "$cmd" == *"${TP_REDIS_PORT}"* ]]; then
    return 0
  fi

  return 1
}

child_pids() {
  local pid="$1"
  pgrep -P "$pid" 2>/dev/null || true
}

process_tree_pids() {
  local pid="$1"
  local child
  for child in $(child_pids "$pid"); do
    process_tree_pids "$child"
  done
  printf '%s\n' "$pid"
}

stop_process_tree() {
  local pid="$1"
  local name="${2:-process-$pid}"

  if ! is_local_stack_process "$pid"; then
    log_warn "skip name=$name pid=$pid because local stack process ownership is not verified"
    return 0
  fi

  local id
  for id in $(process_tree_pids "$pid" | awk '!seen[$0]++'); do
    if kill -0 "$id" 2>/dev/null; then
      kill "$id" 2>/dev/null || true
      printf 'stopped name=%s pid=%s\n' "$name" "$id"
    fi
  done
}

port_pids() {
  local port="$1"
  ss -ltnp "sport = :$port" 2>/dev/null \
    | sed -nE 's/.*pid=([0-9]+).*/\1/p' \
    | sort -u
}
