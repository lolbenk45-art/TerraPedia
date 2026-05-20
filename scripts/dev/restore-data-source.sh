#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"

usage() {
  cat <<'USAGE' >&2
Usage: scripts/dev/restore-data-source.sh <snapshot-dir> [options]

Restores standardized data from standardized.tar.gz and imports db-dump.sql.

Options:
  --data-root=<path>       Data root to restore into, defaults to <repo>/data
  --db-host=<host>         MySQL host
  --db-port=<port>         MySQL port
  --db-socket=<path>       MySQL socket path; when set, host/port are not passed
  --db-name=<name>         MySQL database
  --db-user=<user>         MySQL user
  --db-password=<password> MySQL password
USAGE
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    return 0
  fi
  if [[ $# -lt 1 || "${1:-}" == --* ]]; then
    usage
    return 2
  fi

  local snapshot_dir="$1"
  shift

  local root
  root="$(resolve_repo_root "$PWD")"
  load_runtime_config

  local data_root="$root/data"
  local db_host="$TP_DB_HOST"
  local db_port="$TP_DB_PORT"
  local db_socket=""
  local db_name="$TP_DB_NAME"
  local db_user="$TP_DB_USERNAME"
  local db_password="$TP_DB_PASSWORD"

  local arg
  for arg in "$@"; do
    case "$arg" in
      --data-root=*) data_root="${arg#*=}" ;;
      --db-host=*) db_host="${arg#*=}" ;;
      --db-port=*) db_port="${arg#*=}" ;;
      --db-socket=*) db_socket="${arg#*=}" ;;
      --db-name=*) db_name="${arg#*=}" ;;
      --db-user=*) db_user="${arg#*=}" ;;
      --db-password=*) db_password="${arg#*=}" ;;
      *)
        log_error "Unknown option: $arg"
        usage
        return 2
        ;;
    esac
  done

  snapshot_dir="$(resolve_path "$root" "$snapshot_dir")"
  data_root="$(resolve_path "$root" "$data_root")"

  require_command tar
  require_command mysql

  local archive="$snapshot_dir/standardized.tar.gz"
  local dump="$snapshot_dir/db-dump.sql"
  if [[ ! -f "$archive" ]]; then
    log_error "Missing snapshot archive: $archive"
    return 1
  fi
  if [[ ! -f "$dump" ]]; then
    log_error "Missing snapshot database dump: $dump"
    return 1
  fi

  mkdir -p "$data_root"
  rm -rf "$data_root/standardized" "$data_root/standardized-view"

  local db_connection_args=()
  if [[ -n "$db_socket" ]]; then
    db_connection_args+=("--socket=$db_socket")
  else
    db_connection_args+=("--host=$db_host" "--port=$db_port")
  fi
  db_connection_args+=("--user=$db_user")

  log_info "Restoring standardized data into $data_root"
  tar -xzf "$archive" -C "$data_root"

  log_info "Importing database dump into $db_name"
  MYSQL_PWD="$db_password" mysql \
    "${db_connection_args[@]}" \
    "$db_name" \
    < "$dump"
}

resolve_path() {
  local root="$1"
  local value="$2"
  if [[ "$value" == /* ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$root/$value"
  fi
}

main "$@"
