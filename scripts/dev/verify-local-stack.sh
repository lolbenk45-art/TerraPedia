#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"
# shellcheck source=lib/run-step.sh
source "$SCRIPT_DIR/lib/run-step.sh"
# shellcheck source=lib/net.sh
source "$SCRIPT_DIR/lib/net.sh"

skip_back=false
skip_front=false
skip_admin=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-db|--skip-back|-SkipBack)
      skip_back=true
      ;;
    --skip-front|-SkipFront)
      skip_front=true
      ;;
    --skip-admin|-SkipAdmin)
      skip_admin=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/dev/verify-local-stack.sh [--skip-back|--skip-db] [--skip-front] [--skip-admin]

Runs local preflight checks only. It does not start or stop services.
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

assert_worktree_root_matches_repo_root() {
  local worktree_root="${WORKTREE_ROOT:-}"
  if [[ -z "$worktree_root" ]]; then
    return 0
  fi

  local resolved
  resolved="$(cd "$worktree_root" && pwd)"
  if [[ "$resolved" != "$REPO_ROOT" ]]; then
    log_error "WORKTREE_ROOT mismatch: worktree root $resolved does not match repo root $REPO_ROOT. Update WORKTREE_ROOT or run verify-local-stack from the intended worktree."
    return 1
  fi
}

mapper_xml_well_formed_check() {
  local mapper_dir="$REPO_ROOT/back/src/main/resources/mapper"

  printf '\n==> MyBatis mapper XML preflight\n'
  node --input-type=module - "$mapper_dir" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const mapperDir = process.argv[2];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    if (entry.isFile() && entry.name.endsWith('.xml')) files.push(full);
  }
}

walk(mapperDir);
if (files.length === 0) {
  throw new Error(`No mapper XML files found under ${mapperDir}`);
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes('<mapper') || !text.includes('</mapper>')) {
    throw new Error(`Invalid mapper XML shape: ${file}`);
  }
}

console.log(`checked: ${files.length} mapper XML files`);
NODE
}

assert_worktree_root_matches_repo_root
load_runtime_config

if ! $skip_back; then
  printf '\n==> Database TCP preflight\n'
  printf 'target: %s:%s/%s\n' "$TP_DB_HOST" "$TP_DB_PORT" "$TP_DB_NAME"
  if ! tcp_check "$TP_DB_HOST" "$TP_DB_PORT" 1000; then
    log_error "Database TCP preflight failed: $TP_DB_HOST:$TP_DB_PORT is not reachable. Start MySQL or update $TP_CONFIG_PATH / TERRAPEDIA_DB_HOST / TERRAPEDIA_DB_PORT."
    exit 1
  fi
  mapper_xml_well_formed_check
  run_step "Backend compile" back mvn -DskipTests compile
fi

if ! $skip_front; then
  run_step "Front Nuxt typecheck" "$TP_FRONT_PROJECT_DIR" pnpm run check
fi

if ! $skip_admin; then
  run_step "Admin typecheck" data-query-app pnpm run check
fi

printf '\nverify-local-stack: all requested checks passed.\n'
