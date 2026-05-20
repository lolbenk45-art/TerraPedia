#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"

SNAPSHOT_CLEANUP_DIR=""
SNAPSHOT_COMPLETE=false

cleanup_incomplete_snapshot() {
  if [[ "$SNAPSHOT_COMPLETE" != true && -n "$SNAPSHOT_CLEANUP_DIR" && -d "$SNAPSHOT_CLEANUP_DIR" ]]; then
    rm -rf "$SNAPSHOT_CLEANUP_DIR"
  fi
}

trap cleanup_incomplete_snapshot EXIT

usage() {
  cat <<'USAGE' >&2
Usage: scripts/dev/snapshot-data-source.sh <tag> [options]

Creates data/_snapshots/<tag>-<timestamp>/ with:
  standardized.tar.gz
  db-dump.sql
  minio-objects.txt
  manifest.json

Options:
  --data-root=<path>       Data root to archive, defaults to <repo>/data
  --snapshot-root=<path>   Snapshot root, defaults to <data-root>/_snapshots
  --timestamp=<value>      Stable timestamp for tests/manual naming
  --db-host=<host>         MySQL host
  --db-port=<port>         MySQL port
  --db-socket=<path>       MySQL socket path; when set, host/port are not passed
  --db-name=<name>         MySQL database
  --db-user=<user>         MySQL user
  --db-password=<password> MySQL password
  --tables=a,b,c           Tables to dump, defaults to items,item_category_rel,item_images
  --minio-alias=<alias>    mc alias, defaults to minio
  --minio-bucket=<bucket>  MinIO bucket, defaults to terrapedia-images
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

  local tag="$1"
  shift
  if [[ ! "$tag" =~ ^[A-Za-z0-9._-]+$ ]]; then
    log_error "Snapshot tag may only contain letters, numbers, dot, underscore, and dash: $tag"
    return 2
  fi

  local root
  root="$(resolve_repo_root "$PWD")"
  load_runtime_config

  local data_root="$root/data"
  local snapshot_root=""
  local timestamp=""
  local db_host="$TP_DB_HOST"
  local db_port="$TP_DB_PORT"
  local db_socket=""
  local db_name="$TP_DB_NAME"
  local db_user="$TP_DB_USERNAME"
  local db_password="$TP_DB_PASSWORD"
  local tables_csv="items,item_category_rel,item_images"
  local minio_alias="minio"
  local minio_bucket="${TP_MINIO_BUCKET:-terrapedia-images}"

  local arg
  for arg in "$@"; do
    case "$arg" in
      --data-root=*) data_root="${arg#*=}" ;;
      --snapshot-root=*) snapshot_root="${arg#*=}" ;;
      --timestamp=*) timestamp="${arg#*=}" ;;
      --db-host=*) db_host="${arg#*=}" ;;
      --db-port=*) db_port="${arg#*=}" ;;
      --db-socket=*) db_socket="${arg#*=}" ;;
      --db-name=*) db_name="${arg#*=}" ;;
      --db-user=*) db_user="${arg#*=}" ;;
      --db-password=*) db_password="${arg#*=}" ;;
      --tables=*) tables_csv="${arg#*=}" ;;
      --minio-alias=*) minio_alias="${arg#*=}" ;;
      --minio-bucket=*) minio_bucket="${arg#*=}" ;;
      *)
        log_error "Unknown option: $arg"
        usage
        return 2
        ;;
    esac
  done

  data_root="$(resolve_path "$root" "$data_root")"
  if [[ -z "$snapshot_root" ]]; then
    snapshot_root="$data_root/_snapshots"
  else
    snapshot_root="$(resolve_path "$root" "$snapshot_root")"
  fi
  timestamp="${timestamp:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"

  require_command tar
  require_command mysqldump
  require_command mc

  if [[ ! -d "$data_root/standardized" ]]; then
    log_error "Missing standardized data directory: $data_root/standardized"
    return 1
  fi
  if [[ ! -d "$data_root/standardized-view" ]]; then
    log_error "Missing standardized view directory: $data_root/standardized-view"
    return 1
  fi

  local snapshot_dir="$snapshot_root/$tag-$timestamp"
  if [[ -e "$snapshot_dir" ]]; then
    log_error "Snapshot directory already exists: $snapshot_dir"
    return 1
  fi
  SNAPSHOT_CLEANUP_DIR="$snapshot_dir"
  mkdir -p "$snapshot_dir"

  IFS=',' read -r -a tables <<< "$tables_csv"
  local db_connection_args=()
  if [[ -n "$db_socket" ]]; then
    db_connection_args+=("--socket=$db_socket")
  else
    db_connection_args+=("--host=$db_host" "--port=$db_port")
  fi
  db_connection_args+=("--user=$db_user")

  log_info "Archiving standardized data into $snapshot_dir"
  tar -czf "$snapshot_dir/standardized.tar.gz" -C "$data_root" standardized standardized-view

  log_info "Dumping database tables from $db_name"
  MYSQL_PWD="$db_password" mysqldump \
    "${db_connection_args[@]}" \
    --single-transaction \
    --skip-lock-tables \
    "$db_name" \
    "${tables[@]}" \
    > "$snapshot_dir/db-dump.sql"

  log_info "Recording MinIO object inventory for $minio_alias/$minio_bucket"
  mc ls "$minio_alias/$minio_bucket" --summarize --recursive > "$snapshot_dir/minio-objects.txt"

  write_manifest "$snapshot_dir/manifest.json" "$tag" "$timestamp" "$data_root" "$db_name" "$minio_alias" "$minio_bucket" "${tables[@]}"
  SNAPSHOT_COMPLETE=true
  printf '%s\n' "$snapshot_dir"
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

write_manifest() {
  local output="$1"
  local tag="$2"
  local timestamp="$3"
  local data_root="$4"
  local database="$5"
  local minio_alias="$6"
  local minio_bucket="$7"
  shift 7

  node --input-type=module - "$output" "$tag" "$timestamp" "$data_root" "$database" "$minio_alias" "$minio_bucket" "$@" <<'NODE'
import fs from 'node:fs';

const [output, tag, timestamp, dataRoot, database, minioAlias, minioBucket, ...tables] = process.argv.slice(2);
const manifest = {
  generatedAt: new Date().toISOString(),
  tag,
  timestamp,
  dataRoot,
  database,
  tables,
  minio: {
    alias: minioAlias,
    bucket: minioBucket
  },
  files: {
    standardizedArchive: 'standardized.tar.gz',
    databaseDump: 'db-dump.sql',
    minioInventory: 'minio-objects.txt'
  }
};
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
NODE
}

main "$@"
