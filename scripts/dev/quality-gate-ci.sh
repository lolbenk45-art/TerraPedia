#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
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
Usage: bash scripts/dev/quality-gate-ci.sh [--skip-front] [--skip-admin]
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

run_step "Data workflow acceptance tests" . node --test \
  scripts/dev/quality-gate.test.mjs \
  scripts/dev/local-stack.test.mjs \
  scripts/dev/data-source-snapshot.test.mjs \
  scripts/data/crawler/tests/source-layout-warning.test.mjs \
  scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs \
  scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs \
  scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs \
  scripts/data/workflow/domain-acceptance-report-manifest.test.mjs \
  scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs \
  scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs \
  scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs

run_step "Crawler source layout check (warning-only)" . node \
  scripts/data/crawler/source-layout-check.mjs

run_step "Domain acceptance A-grade contract tests" . node --test \
  scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs

run_step "Backend acceptance contract tests" back mvn \
  -Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest,DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest \
  test

if ! $skip_front; then
  run_step "Front checks, unit tests, and build" front pnpm run test
fi

if ! $skip_admin; then
  run_step "Admin checks, unit tests, and build" data-query-app pnpm run test
fi

printf '\nquality-gate-ci: all requested checks passed.\n'
