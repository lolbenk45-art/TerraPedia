#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"

backend_base_url=""
admin_base_url=""
skip_auth=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --backend-base-url)
      backend_base_url="$2"
      shift
      ;;
    --backend-base-url=*)
      backend_base_url="${1#*=}"
      ;;
    --admin-base-url)
      admin_base_url="$2"
      shift
      ;;
    --admin-base-url=*)
      admin_base_url="${1#*=}"
      ;;
    --skip-auth|-SkipAuth)
      skip_auth=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/dev/smoke-local-stack.sh [--backend-base-url URL] [--admin-base-url URL] [--skip-auth]
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
ensure_dir "$report_dir"
load_runtime_config

timestamp="$(date +%Y%m%d-%H%M%S)"
report_path="$report_dir/smoke-$timestamp.json"
results_path="$report_dir/smoke-$timestamp.jsonl"
: >"$results_path"

if [[ -z "$backend_base_url" ]]; then
  backend_base_url="http://127.0.0.1:$TP_BACKEND_PORT"
fi
if [[ -z "$admin_base_url" ]]; then
  admin_base_url="http://localhost:$TP_ADMIN_PORT"
fi

join_url() {
  local base="${1%/}"
  local path="$2"
  printf '%s%s\n' "$base" "$path"
}

smoke_request() {
  local name="$1"
  local method="$2"
  local url="$3"
  local headers_json="${4:-{}}"

  SMOKE_NAME="$name" SMOKE_METHOD="$method" SMOKE_URL="$url" SMOKE_HEADERS_JSON="$headers_json" SMOKE_RESULTS_PATH="$results_path" node <<'NODE'
const fs = require('node:fs');

(async () => {
  const headers = JSON.parse(process.env.SMOKE_HEADERS_JSON || '{}');
  const entry = {
    name: process.env.SMOKE_NAME,
    method: process.env.SMOKE_METHOD,
    url: process.env.SMOKE_URL,
    ok: false,
    status: null,
    preview: null,
  };

  try {
    const response = await fetch(process.env.SMOKE_URL, {
      method: process.env.SMOKE_METHOD,
      headers,
    });
    const text = await response.text();
    entry.status = response.status;
    entry.ok = response.status >= 200 && response.status < 300;
    entry.preview = text.slice(0, 300);
  } catch (error) {
    entry.preview = error.message;
  }

  fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
})();
NODE
}

smoke_login() {
  local url="$1"

  SMOKE_URL="$url" SMOKE_USER="$TP_ADMIN_USERNAME" SMOKE_PASS="$TP_ADMIN_PASSWORD" SMOKE_RESULTS_PATH="$results_path" METHOD=POST node <<'NODE'
const fs = require('node:fs');

(async () => {
  const entry = {
    name: 'auth.login',
    method: process.env.METHOD,
    url: process.env.SMOKE_URL,
    ok: false,
    status: null,
    preview: '<redacted>',
  };
  let bearer = '';

  try {
    const response = await fetch(process.env.SMOKE_URL, {
      method: process.env.METHOD,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: process.env.SMOKE_USER, password: process.env.SMOKE_PASS }),
    });
    entry.status = response.status;
    entry.ok = response.status >= 200 && response.status < 300;
    const text = await response.text();
    if (entry.ok) {
      const parsed = JSON.parse(text);
      bearer = parsed.data?.token ?? parsed.data?.accessToken ?? parsed.token ?? '';
    }
  } catch {
    entry.preview = '<redacted>';
  }

  fs.appendFileSync(process.env.SMOKE_RESULTS_PATH, `${JSON.stringify(entry)}\n`);
  if (bearer) process.stdout.write(bearer);
})();
NODE
}

smoke_request backend.items GET "$(join_url "$backend_base_url" '/api/items?page=1&limit=1')"
smoke_request backend.categories GET "$(join_url "$backend_base_url" '/api/categories')"
smoke_request admin.root GET "$(join_url "$admin_base_url" '/')"
smoke_request admin.proxy.items GET "$(join_url "$admin_base_url" '/api/items?page=1&limit=1')"

if ! $skip_auth && [[ -n "$TP_ADMIN_USERNAME" && -n "$TP_ADMIN_PASSWORD" ]]; then
  bearer_token="$(SMOKE_AUTH_LOGIN=1 smoke_login "$(join_url "$backend_base_url" '/api/auth/login')")"
  if [[ -n "$bearer_token" ]]; then
    auth_headers="$(AUTH_VALUE="Bearer $bearer_token" node <<'NODE'
console.log(JSON.stringify({ authorization: process.env.AUTH_VALUE }));
NODE
)"
    smoke_request auth.me GET "$(join_url "$backend_base_url" '/api/auth/me')" "$auth_headers"
    smoke_request admin.acceptance.dataSource GET "$(join_url "$backend_base_url" '/api/admin/data-source-acceptance/overview')" "$auth_headers"
    smoke_request admin.acceptance.domain GET "$(join_url "$backend_base_url" '/api/admin/domain-acceptance/overview')" "$auth_headers"
  fi
fi

SMOKE_TIMESTAMP="$timestamp" SMOKE_BACKEND_BASE_URL="$backend_base_url" SMOKE_ADMIN_BASE_URL="$admin_base_url" SMOKE_RESULTS_PATH="$results_path" SMOKE_REPORT_PATH="$report_path" node <<'NODE'
const fs = require('node:fs');
const lines = fs.existsSync(process.env.SMOKE_RESULTS_PATH)
  ? fs.readFileSync(process.env.SMOKE_RESULTS_PATH, 'utf8').trim().split('\n').filter(Boolean)
  : [];
const results = lines.map((line) => JSON.parse(line));
const summary = {
  timestamp: process.env.SMOKE_TIMESTAMP,
  backendBaseUrl: process.env.SMOKE_BACKEND_BASE_URL,
  adminBaseUrl: process.env.SMOKE_ADMIN_BASE_URL,
  total: results.length,
  passed: results.filter((entry) => entry.ok).length,
  failed: results.filter((entry) => !entry.ok).length,
  results,
};

fs.writeFileSync(process.env.SMOKE_REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`smoke report: ${process.env.SMOKE_REPORT_PATH}`);
console.log(`passed=${summary.passed} failed=${summary.failed}`);
process.exit(summary.failed > 0 ? 1 : 0);
NODE
