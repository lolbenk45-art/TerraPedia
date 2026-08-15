#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"
# shellcheck source=lib/run-step.sh
source "$SCRIPT_DIR/lib/run-step.sh"

skip_front=false
skip_admin=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-front|-SkipFront)
      skip_front=true
      ;;
    --skip-admin|-SkipAdmin)
      skip_admin=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash platform/local/quality-gate-ci.sh [--skip-front] [--skip-admin]
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

load_runtime_config

run_step "Data workflow acceptance tests" . node --test \
  platform/local/quality-gate.test.mjs \
  platform/local/local-stack.test.mjs \
  platform/local/slot-allocator.test.mjs \
  platform/local/data-source-snapshot.test.mjs \
  pipelines/lib/wiki-user-agent.test.mjs \
  pipelines/lib/wiki-direct-request-boundary.test.mjs \
  pipelines/lib/flaresolverr-bridge.test.mjs \
  pipelines/lib/wiki-request-gate.test.mjs \
  pipelines/lib/wiki-item-utils.test.mjs \
  pipelines/lib/wiki-image-fetch-server.test.mjs \
  pipelines/lib/python-wiki-gate-bridge-source.test.mjs \
  pipelines/fetch/fetch-wiki-iteminfo.test.mjs \
  pipelines/fetch/fetch-wiki-item-pages.test.mjs \
  pipelines/fetch/snapshot-policy.test.mjs \
  pipelines/maint/gc-snapshots.test.mjs \
  pipelines/crawler/tests/source-layout-warning.test.mjs \
  pipelines/npc-canonical/npc-canonical-readiness.test.mjs \
  pipelines/npc-canonical/npc-canonical-t0-acceptance.test.mjs \
  pipelines/npc-canonical/npc-owner-phase-contract.test.mjs \
  pipelines/workflow/data-source-acceptance-report-manifest.test.mjs \
  pipelines/workflow/data-source-acceptance-freshness-audit.test.mjs \
  pipelines/workflow/data-source-acceptance-refresh-plan.test.mjs \
  pipelines/automation/build-canonical-cutover-authorization.test.mjs \
  pipelines/workflow/domain-acceptance-report-manifest.test.mjs \
  pipelines/workflow/domain-acceptance-freshness-audit.test.mjs \
  pipelines/workflow/domain-acceptance-refresh-plan.test.mjs \
  pipelines/workflow/domain-acceptance-a-grade-gate.test.mjs

run_step "Crawler source layout check (warning-only)" . node \
  pipelines/crawler/source-layout-check.mjs

run_step "Domain acceptance A-grade contract tests" . node --test \
  pipelines/workflow/domain-acceptance-a-grade-gate.test.mjs

run_step "Backend acceptance contract tests" services/catalog-api mvn \
  -Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest,DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest \
  test

if ! $skip_front; then
  run_step "Front Nuxt checks and build" "$TP_FRONT_PROJECT_DIR" pnpm run test
  run_step "User-auth isolated browser smoke" . bash platform/local/run-user-auth-e2e.sh --smoke
else
  printf '\nquality-gate-ci: --skip-front also skips User-auth isolated browser smoke.\n'
fi

if ! $skip_admin; then
  run_step "Admin checks, unit tests, and build" apps/admin-console pnpm run test
fi

printf '\nquality-gate-ci: all requested checks passed.\n'
