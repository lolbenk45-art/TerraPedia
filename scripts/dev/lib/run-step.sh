#!/usr/bin/env bash

set -euo pipefail

if ! declare -F resolve_repo_root >/dev/null 2>&1; then
  # shellcheck source=common.sh
  source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fi

run_step() {
  if [[ "$#" -lt 3 ]]; then
    log_error "run_step requires: label cwd command [args...]"
    return 2
  fi

  local label="$1"
  local cwd="$2"
  shift 2

  local root
  root="$(resolve_repo_root "$PWD")"
  if [[ "$cwd" != /* ]]; then
    cwd="$root/$cwd"
  fi

  printf '\n==> %s\n' "$label"
  printf 'cwd: %s\n' "$cwd"
  printf 'cmd:'
  printf ' %q' "$@"
  printf '\n'

  (
    cd "$cwd"
    "$@"
  )
}
