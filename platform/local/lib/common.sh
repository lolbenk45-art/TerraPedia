#!/usr/bin/env bash

set -euo pipefail

_TP_COMMON_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

resolve_repo_root() {
  local dir fallback
  dir="${1:-$PWD}"
  fallback="$(cd -- "$_TP_COMMON_DIR/../../.." && pwd -P)"

  while [[ "$dir" != "/" ]]; do
    if [[ -d "$dir/.git" || -f "$dir/.git" ]] && [[ -f "$dir/scripts/config/project.constants.json" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done

  if [[ -d "$fallback/.git" || -f "$fallback/.git" ]] && [[ -f "$fallback/scripts/config/project.constants.json" ]]; then
    printf '%s\n' "$fallback"
    return 0
  fi

  printf 'Unable to resolve TerraPedia repo root from %s\n' "${1:-$PWD}" >&2
  return 1
}

repo_root() {
  resolve_repo_root "$PWD"
}

log_info() {
  printf '==> %s\n' "$*"
}

log_warn() {
  printf 'WARN: %s\n' "$*" >&2
}

log_error() {
  printf 'ERROR: %s\n' "$*" >&2
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    log_error "Required command not found: $name"
    return 127
  fi
}

ensure_dir() {
  mkdir -p "$1"
}

redact_secret() {
  local value="${1:-}"
  if [[ -z "$value" ]]; then
    printf '\n'
  else
    printf '<redacted>\n'
  fi
}
