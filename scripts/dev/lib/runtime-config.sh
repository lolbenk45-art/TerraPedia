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
  load_root_env_file "$root" "$config_path"

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

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function originPort(value) {
  try {
    const url = new URL(value);
    return url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch {
    return '';
  }
}

function isLegacyImageOrigin(value) {
  try {
    const url = new URL(value);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return port === '9000' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isConsoleImageOrigin(value) {
  return originPort(value) === '19001';
}

function tcpOpen(endpoint, timeoutMs = 300) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      resolve(false);
      return;
    }
    import('node:net').then(({ default: net }) => {
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
      socket.connect(Number(url.port || (url.protocol === 'https:' ? 443 : 80)), url.hostname);
    }).catch(() => resolve(false));
  });
}

async function firstReachable(candidates) {
  for (const candidate of candidates) {
    if (await tcpOpen(candidate)) return candidate;
  }
  return '';
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

const dbHost = env('TERRAPEDIA_DB_HOST', get(['database', 'host'], '127.0.0.1'));
const dbPort = env('TERRAPEDIA_DB_PORT', get(['database', 'port'], 3306));
const dbName = env('TERRAPEDIA_DB_NAME', get(['database', 'name'], 'terria_v1_local'));
const mailUsername = env('TERRAPEDIA_MAIL_USERNAME', get(['mail', 'username'], ''));
const minioEndpoint = trimTrailingSlash(env('TERRAPEDIA_MINIO_ENDPOINT', get(['minio', 'endpoint'], 'http://127.0.0.1:19000')));
const minioPublicEndpoint = trimTrailingSlash(env('TERRAPEDIA_MINIO_PUBLIC_ENDPOINT', get(['minio', 'publicEndpoint'], 'http://localhost:19000')));
const explicitImageOrigin = trimTrailingSlash(env('TERRAPEDIA_IMAGE_ORIGIN', ''));
let imageOrigin = explicitImageOrigin || minioPublicEndpoint || minioEndpoint || 'http://localhost:19000';
if (!explicitImageOrigin && (isLegacyImageOrigin(imageOrigin) || isConsoleImageOrigin(imageOrigin))) {
  imageOrigin = await firstReachable(['http://localhost:19000', 'http://127.0.0.1:19000']) || 'http://localhost:19000';
}
if (isConsoleImageOrigin(imageOrigin)) {
  imageOrigin = isConsoleImageOrigin(minioEndpoint) ? 'http://localhost:19000' : (minioEndpoint || 'http://localhost:19000');
}

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
  TP_MINIO_ENDPOINT: minioEndpoint,
  TP_MINIO_PUBLIC_ENDPOINT: minioPublicEndpoint,
  TP_IMAGE_ORIGIN: imageOrigin,
  TP_LEGACY_IMAGE_ORIGINS: env('TERRAPEDIA_LEGACY_IMAGE_ORIGINS', 'http://localhost:9000,http://127.0.0.1:9000'),
  TP_IMAGE_COMPAT_PROXY_ENABLED: env('TERRAPEDIA_IMAGE_COMPAT_PROXY_ENABLED', true),
  TP_MINIO_BUCKET: env('TERRAPEDIA_MINIO_BUCKET', get(['minio', 'bucket'], 'terrapedia-images')),
  TP_MINIO_OBJECT_PREFIX: env('TERRAPEDIA_MINIO_OBJECT_PREFIX', get(['minio', 'objectPrefix'], 'items')),
  TP_MINIO_DATA_DIR: env('TERRAPEDIA_MINIO_DATA_DIR', get(['minio', 'dataDir'], `${process.env.HOME || root}/.local/share/terrapedia/minio/data`)),
  TP_MINIO_CONSOLE_PORT: env('TERRAPEDIA_MINIO_CONSOLE_PORT', get(['minio', 'consolePort'], 19001)),
  TP_FLARESOLVERR_ENABLED: env('TERRAPEDIA_FLARESOLVERR_ENABLED', get(['flaresolverr', 'enabled'], false)),
  TP_FLARESOLVERR_URL: env('TERRAPEDIA_FLARESOLVERR_URL', get(['flaresolverr', 'url'], 'http://127.0.0.1:8191/v1')),
  TP_FLARESOLVERR_CONTAINER_NAME: env('TERRAPEDIA_FLARESOLVERR_CONTAINER_NAME', get(['flaresolverr', 'containerName'], 'terrapedia-flaresolverr')),
  TP_FLARESOLVERR_IMAGE: env('TERRAPEDIA_FLARESOLVERR_IMAGE', get(['flaresolverr', 'image'], 'ghcr.io/flaresolverr/flaresolverr')),
  TP_MAIL_ENABLED: env('TERRAPEDIA_MAIL_ENABLED', get(['mail', 'enabled'], true)),
  TP_MAIL_HOST: env('TERRAPEDIA_MAIL_HOST', get(['mail', 'host'], 'smtp.qq.com')),
  TP_MAIL_PORT: env('TERRAPEDIA_MAIL_PORT', get(['mail', 'port'], 465)),
  TP_MAIL_USERNAME: mailUsername,
  TP_MAIL_PASSWORD: env('TERRAPEDIA_MAIL_PASSWORD', get(['mail', 'password'], '')),
  TP_MAIL_FROM: env('TERRAPEDIA_MAIL_FROM', get(['mail', 'from'], mailUsername)),
  TP_MAIL_FROM_NAME: env('TERRAPEDIA_MAIL_FROM_NAME', get(['mail', 'fromName'], 'TerraPedia')),
  TP_MAIL_SUBJECT_PREFIX: env('TERRAPEDIA_MAIL_SUBJECT_PREFIX', get(['mail', 'subjectPrefix'], '[TerraPedia]')),
  TP_MAIL_SSL_ENABLE: env('TERRAPEDIA_MAIL_SSL_ENABLE', get(['mail', 'sslEnable'], true)),
  TP_MAIL_STARTTLS_ENABLE: env('TERRAPEDIA_MAIL_STARTTLS_ENABLE', get(['mail', 'starttlsEnable'], false)),
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

load_root_env_file() {
  local root="$1"
  local config_path="$2"
  local env_path="${TERRAPEDIA_ENV_FILE:-}"

  if [[ -z "$env_path" ]]; then
    if [[ -f "$root/.env" ]]; then
      env_path="$root/.env"
    else
      local config_root
      config_root="$(cd "$(dirname "$config_path")/../../.." && pwd -P)"
      if [[ -f "$config_root/.env" ]]; then
        env_path="$config_root/.env"
      fi
    fi
  fi

  if [[ -z "$env_path" || ! -f "$env_path" ]]; then
    return 0
  fi

  local exports
  exports="$(TP_ENV_PATH="$env_path" node --input-type=module <<'NODE'
import fs from 'node:fs';

const envPath = process.env.TP_ENV_PATH;
const source = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

for (const rawLine of source.split(/\r?\n/)) {
  const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  const [, key, rawValue] = match;
  if (process.env[key] !== undefined) continue;

  let value = rawValue.trim();
  const quoted = value.match(/^(['"])(.*)\1$/s);
  if (quoted) {
    value = quoted[2];
  }
  console.log(`export ${key}=${shellQuote(value)}`);
}
NODE
)"

  eval "$exports"
  if [[ -z "${TERRAPEDIA_MAIL_PASSWORD:-}" && -n "${QQ_SMTP:-}" ]]; then
    export TERRAPEDIA_MAIL_PASSWORD="$QQ_SMTP"
  fi
  if [[ -z "${TERRAPEDIA_MAIL_USERNAME:-}" ]]; then
    if [[ -n "${QQ_EMAIL:-}" ]]; then
      export TERRAPEDIA_MAIL_USERNAME="$QQ_EMAIL"
    elif [[ "${QQ_NUMBER:-}" =~ ^[0-9]+$ ]]; then
      export TERRAPEDIA_MAIL_USERNAME="$QQ_NUMBER@qq.com"
    elif [[ "${QQ:-}" =~ ^[0-9]+$ ]]; then
      export TERRAPEDIA_MAIL_USERNAME="$QQ@qq.com"
    fi
  fi
  if [[ -z "${TERRAPEDIA_MAIL_FROM:-}" && -n "${TERRAPEDIA_MAIL_USERNAME:-}" ]]; then
    export TERRAPEDIA_MAIL_FROM="$TERRAPEDIA_MAIL_USERNAME"
  fi
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
