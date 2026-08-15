#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/runtime-config.sh
source "$SCRIPT_DIR/lib/runtime-config.sh"
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
Usage: bash platform/local/quality-gate.sh [--skip-back] [--skip-front] [--skip-admin] [--full-data-audit]
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
  platform/local/quality-gate-automation-live-contract.test.mjs \
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
  pipelines/item-groups/item-group-compatibility-publish.test.mjs \
  pipelines/item-groups/item-group-readiness.test.mjs \
  pipelines/npc-canonical/npc-canonical-readiness.test.mjs \
  pipelines/npc-canonical/npc-canonical-t0-acceptance.test.mjs \
  pipelines/npc-canonical/npc-apply-ownership-preparation.test.mjs \
  pipelines/npc-canonical/npc-owner-phase-contract.test.mjs \
  pipelines/audit/domain-readiness-audit.test.mjs \
  pipelines/audit/canonical-source-contract-registry.test.mjs \
  pipelines/audit/build-npc-bridge-retirement-report.test.mjs \
  pipelines/audit/npc-buff-relation-precheck.test.mjs \
  pipelines/workflow/data-source-acceptance-report-manifest.test.mjs \
  pipelines/workflow/data-source-acceptance-freshness-audit.test.mjs \
  pipelines/workflow/data-source-acceptance-refresh-plan.test.mjs \
  pipelines/workflow/domain-acceptance-report-manifest.test.mjs \
  pipelines/workflow/domain-acceptance-freshness-audit.test.mjs \
  pipelines/workflow/domain-acceptance-refresh-plan.test.mjs \
  pipelines/workflow/domain-acceptance-a-grade-gate.test.mjs \
  pipelines/workflow/domain-acceptance-generate-reports.test.mjs

run_step "Crawler automation contract tests" . node --test \
  pipelines/automation/automation-database-contract.test.mjs \
  pipelines/automation/automation-test-profile.test.mjs \
  pipelines/automation/table-ownership-matrix.test.mjs \
  pipelines/automation/frozen-apply-bundle.test.mjs \
  pipelines/automation/policy-set-hash.test.mjs \
  pipelines/automation/build-canonical-cutover-authorization.test.mjs \
  pipelines/automation/crawler-automation-migration-contract.test.mjs \
  pipelines/automation/mutation-generation.test.mjs \
  pipelines/automation/table-ownership-fence.test.mjs \
  pipelines/automation/three-database-commit-protocol.test.mjs \
  pipelines/automation/capability-manifest.test.mjs \
  pipelines/automation/capability-owned-table-contract.test.mjs \
  pipelines/automation/bootstrap-automation-policy.test.mjs \
  pipelines/automation/run-automation-acceptance.test.mjs \
  pipelines/automation/mysql-automation-acceptance-adapter.test.mjs \
  pipelines/automation/run-live-automation-acceptance.test.mjs \
  apps/admin-console/pages/operations/crawler-automation.contract.test.mjs

run_step "Crawler source layout check (warning-only)" . node \
  pipelines/crawler/source-layout-check.mjs

run_step "Domain acceptance full dry-run" . node \
  pipelines/workflow/domain-acceptance-generate-reports.mjs \
  --fail-on-blocked=true \
  --fail-on-warning=true

run_step "Domain acceptance A-grade gate" . node \
  pipelines/workflow/domain-acceptance-a-grade-gate.mjs \
  --fail-on-blocked=true

cross_db_mode="$(if $full_data_audit; then printf 'full'; else printf 'quick'; fi)"
run_step "Cross-db referential integrity audit ($cross_db_mode)" . node \
  pipelines/audit/cross-db-referential-integrity.mjs \
  "--mode=$cross_db_mode"

if ! $skip_back; then
  run_step "Backend domain acceptance tests" services/catalog-api mvn \
    -Dtest=DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest \
    test
  run_step "Backend tests" services/catalog-api mvn test
fi

if ! $skip_front; then
  run_step "Front Nuxt checks and build" "$TP_FRONT_PROJECT_DIR" pnpm run test
  run_step "User-auth isolated browser smoke" . bash platform/local/run-user-auth-e2e.sh --smoke
else
  printf '\nquality-gate: --skip-front also skips User-auth isolated browser smoke.\n'
fi

if ! $skip_admin; then
  run_step "Admin checks, unit tests, and build" apps/admin-console pnpm run test
fi

printf '\nquality-gate: all requested checks passed.\n'
