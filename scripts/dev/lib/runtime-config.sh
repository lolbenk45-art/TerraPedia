#!/usr/bin/env bash

set -euo pipefail

if ! declare -F resolve_repo_root >/dev/null 2>&1; then
  # shellcheck source=common.sh
  source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fi

load_runtime_config() {
  local root config_path
  root="$(resolve_repo_root "$PWD")"
  config_path="${TERRAPEDIA_LOCAL_STACK_CONFIG:-$(resolve_local_stack_config_path "$root")}"
  if [[ ! -f "$config_path" ]]; then
    config_path="$root/scripts/dev/config/local-stack.config.example.json"
  fi

  local exports
  exports="$(TP_REPO_ROOT="$root" TP_CONFIG_PATH="$config_path" node --input-type=module <<'NODE'
import fs from 'node:fs';

const root = process.env.TP_REPO_ROOT;
const configPath = process.env.TP_CONFIG_PATH;
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

function get(path, fallback) {
  let current = config;
  for (const segment of path) {
    if (current == null || typeof current !== 'object' || !(segment in current)) return fallback;
    current = current[segment];
  }
  return current ?? fallback;
}

function env(name, value) {
  const raw = process.env[name] ?? value ?? '';
  return String(raw);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const dbHost = env('TERRAPEDIA_DB_HOST', get(['database', 'host'], '127.0.0.1'));
const dbPort = env('TERRAPEDIA_DB_PORT', get(['database', 'port'], 3306));
const dbName = env('TERRAPEDIA_DB_NAME', get(['database', 'name'], 'terria_v1_local'));

const values = {
  TP_REPO_ROOT: root,
  TP_CONFIG_PATH: configPath,
  TP_DB_NAME: dbName,
  TP_DB_HOST: dbHost,
  TP_DB_PORT: dbPort,
  TP_DB_USERNAME: env('TERRAPEDIA_DB_USERNAME', get(['database', 'username'], 'root')),
  TP_DB_PASSWORD: env('TERRAPEDIA_DB_PASSWORD', get(['database', 'password'], 'root')),
  TP_DB_URL: env('TERRAPEDIA_DB_URL', get(['database', 'url'], `jdbc:mysql://${dbHost}:${dbPort}/${dbName}?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true`)),
  TP_REDIS_HOST: env('TERRAPEDIA_REDIS_HOST', get(['redis', 'host'], '127.0.0.1')),
  TP_REDIS_PORT: env('TERRAPEDIA_REDIS_PORT', get(['redis', 'port'], 6380)),
  TP_REDIS_DATABASE: env('TERRAPEDIA_REDIS_DATABASE', get(['redis', 'database'], 0)),
  TP_REDIS_PASSWORD: env('TERRAPEDIA_REDIS_PASSWORD', get(['redis', 'password'], 'root')),
  TP_REDIS_SERVER_EXE: env('TERRAPEDIA_REDIS_SERVER_EXE', get(['redis', 'serverExe'], '')),
  TP_BACKEND_PORT: env('APP_PORT', get(['backend', 'port'], 18088)),
  TP_FRONT_PROJECT_DIR: env('TERRAPEDIA_FRONT_PROJECT_DIR', get(['front', 'projectDir'], 'front-nuxt')),
  TP_FRONT_PORT: env('TERRAPEDIA_FRONT_PORT', get(['front', 'port'], 5174)),
  TP_ADMIN_PORT: env('TERRAPEDIA_ADMIN_PORT', get(['admin', 'port'], 3001)),
  TP_ADMIN_USERNAME: env('TERRAPEDIA_ADMIN_USERNAME', get(['auth', 'admin', 'username'], 'admin')),
  TP_ADMIN_PASSWORD: env('TERRAPEDIA_ADMIN_PASSWORD', get(['auth', 'admin', 'password'], '')),
  TP_ADMIN_DISPLAY_NAME: env('TERRAPEDIA_ADMIN_DISPLAY_NAME', get(['auth', 'admin', 'displayName'], 'Admin')),
  TP_ADMIN_TOKEN_SECRET: env('TERRAPEDIA_AUTH_TOKEN_SECRET', get(['auth', 'admin', 'tokenSecret'], '')),
  TP_USER_TOKEN_SECRET: env('TERRAPEDIA_USER_TOKEN_SECRET', get(['auth', 'user', 'tokenSecret'], '')),
  TP_MINIO_ENABLED: env('TERRAPEDIA_MINIO_ENABLED', get(['minio', 'enabled'], false)),
  TP_MINIO_CREDENTIALS_FILE: env('TERRAPEDIA_MINIO_CREDENTIALS_FILE', get(['minio', 'credentialsFile'], '')),
  TP_MINIO_ENDPOINT: env('TERRAPEDIA_MINIO_ENDPOINT', get(['minio', 'endpoint'], '')),
  TP_MINIO_PUBLIC_ENDPOINT: env('TERRAPEDIA_MINIO_PUBLIC_ENDPOINT', get(['minio', 'publicEndpoint'], '')),
  TP_MINIO_BUCKET: env('TERRAPEDIA_MINIO_BUCKET', get(['minio', 'bucket'], 'terrapedia-images')),
  TP_MINIO_OBJECT_PREFIX: env('TERRAPEDIA_MINIO_OBJECT_PREFIX', get(['minio', 'objectPrefix'], 'items')),
  TP_MINIO_DATA_DIR: env('TERRAPEDIA_MINIO_DATA_DIR', get(['minio', 'dataDir'], `${process.env.HOME || root}/.local/share/terrapedia/minio/data`)),
  TP_MINIO_CONSOLE_PORT: env('TERRAPEDIA_MINIO_CONSOLE_PORT', get(['minio', 'consolePort'], 19001)),
  TP_FLARESOLVERR_ENABLED: env('TERRAPEDIA_FLARESOLVERR_ENABLED', get(['flaresolverr', 'enabled'], false)),
  TP_FLARESOLVERR_URL: env('TERRAPEDIA_FLARESOLVERR_URL', get(['flaresolverr', 'url'], 'http://127.0.0.1:8191/v1')),
  TP_FLARESOLVERR_CONTAINER_NAME: env('TERRAPEDIA_FLARESOLVERR_CONTAINER_NAME', get(['flaresolverr', 'containerName'], 'terrapedia-flaresolverr')),
  TP_FLARESOLVERR_IMAGE: env('TERRAPEDIA_FLARESOLVERR_IMAGE', get(['flaresolverr', 'image'], 'ghcr.io/flaresolverr/flaresolverr')),
  TP_SPRING_PROFILE: env('SPRING_PROFILES_ACTIVE', get(['backend', 'springProfile'], 'legacy')),
  TP_SPRING_FLYWAY_OUT_OF_ORDER: env('SPRING_FLYWAY_OUT_OF_ORDER', get(['backend', 'flywayOutOfOrder'], true)),
};

for (const [key, value] of Object.entries(values)) {
  console.log(`export ${key}=${shellQuote(value)}`);
}
NODE
)"

  eval "$exports"
}

resolve_local_stack_config_path() {
  local root="$1"
  local primary_root
  primary_root="$(resolve_primary_worktree_root "$root")"
  if [[ -n "$primary_root" && -f "$primary_root/scripts/dev/config/local-stack.config.json" ]]; then
    printf '%s\n' "$primary_root/scripts/dev/config/local-stack.config.json"
    return 0
  fi
  printf '%s\n' "$root/scripts/dev/config/local-stack.config.json"
}

resolve_primary_worktree_root() {
  local root="$1"
  local git_file git_dir common_git_dir primary_root
  git_file="$root/.git"
  if [[ ! -f "$git_file" ]]; then
    return 0
  fi
  git_dir="$(sed -n 's/^gitdir:[[:space:]]*//Ip' "$git_file" | head -n 1)"
  if [[ -z "$git_dir" ]]; then
    return 0
  fi
  if [[ "$git_dir" != /* ]]; then
    git_dir="$root/$git_dir"
  fi
  case "$git_dir" in
    */.git/worktrees/*)
      common_git_dir="${git_dir%%/.git/worktrees/*}/.git"
      primary_root="$(dirname "$common_git_dir")"
      if [[ -d "$primary_root/.git" ]]; then
        printf '%s\n' "$primary_root"
      fi
      ;;
    *)
      return 0
      ;;
  esac
}

require_runtime_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    log_error "Missing required runtime setting: $name"
    return 1
  fi
}
