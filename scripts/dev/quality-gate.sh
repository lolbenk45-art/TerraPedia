#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/run-step.sh
source "$SCRIPT_DIR/lib/run-step.sh"

skip_back=false
skip_front=false
skip_admin=false
full_data_audit=false

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-back|-SkipBack)
      skip_back=true
      ;;
    --skip-front|-SkipFront)
      skip_front=true
      ;;
    --skip-admin|-SkipAdmin)
      skip_admin=true
      ;;
    --full-data-audit|-FullDataAudit)
      full_data_audit=true
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/dev/quality-gate.sh [--skip-back] [--skip-front] [--skip-admin] [--full-data-audit]
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
  scripts/data/lib/wiki-user-agent.test.mjs \
  scripts/data/lib/wiki-direct-request-boundary.test.mjs \
  scripts/data/lib/wiki-request-gate.test.mjs \
  scripts/data/lib/wiki-item-utils.test.mjs \
  scripts/data/lib/wiki-image-fetch-server.test.mjs \
  scripts/data/lib/python-wiki-gate-bridge-source.test.mjs \
  scripts/data/crawler/tests/source-layout-warning.test.mjs \
  scripts/data/audit/domain-readiness-audit.test.mjs \
  scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs \
  scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs \
  scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs \
  scripts/data/workflow/domain-acceptance-report-manifest.test.mjs \
  scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs \
  scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs \
  scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs \
  scripts/data/workflow/domain-acceptance-generate-reports.test.mjs

run_step "Crawler source layout check (warning-only)" . node \
  scripts/data/crawler/source-layout-check.mjs

run_step "Domain acceptance full dry-run" . node \
  scripts/data/workflow/domain-acceptance-generate-reports.mjs \
  --fail-on-blocked=true \
  --fail-on-warning=true

run_step "Domain acceptance A-grade gate" . node \
  scripts/data/workflow/domain-acceptance-a-grade-gate.mjs \
  --fail-on-blocked=true

cross_db_mode="$(if $full_data_audit; then printf 'full'; else printf 'quick'; fi)"
run_step "Cross-db referential integrity audit ($cross_db_mode)" . node \
  scripts/data/audit/cross-db-referential-integrity.mjs \
  "--mode=$cross_db_mode"

if ! $skip_back; then
  run_step "Backend domain acceptance tests" back mvn \
    -Dtest=DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest \
    test
  run_step "Backend tests" back mvn test
fi

if ! $skip_front; then
  run_step "Front checks, unit tests, and build" front pnpm run test
fi

if ! $skip_admin; then
  run_step "Admin checks, unit tests, and build" data-query-app pnpm run test
fi

printf '\nquality-gate: all requested checks passed.\n'
