# Mixed-Agent Structure Acceptance 2026-08-16

## Scope

This audit covers the mixed Codex/Claude entry contracts, portable skill source
and generated runtime views, deployable-boundary documentation, local artifact
placement, historical summary archival, and the compatibility-alias reference
scan. It authorizes no data, crawler, database, Redis, local-stack, or external
refresh operation; the user separately authorized this worktree's symlink
closeout and focused commit. Push and merge remain out of scope.

## Task 6 Evidence

- `platform/tooling/root-artifact-contract.test.mjs`: 7/7.
- `node platform/tooling/check-root-artifact-contract.mjs`: no unallowlisted
  root `tmp/`, root `logs/`, `reports/tmp/`, or root summary references.
- `apps/public-web/scripts/audit-shoot.mjs` defaults to
  `.local/tmp/audit-shots`; existing `tmp/home-hero-hi-fi/` historical
  specimens remain unchanged.
- `PLAN_FIXES_SUMMARY.md` and `REFACTORING_SUMMARY.md` were moved byte-for-byte
  to `docs/project-governance/archive/`; no ignored local files were deleted.
- `.local/` is ignored and documented as per-worktree local state; reproducible
  reports remain under `reports/runtime/<operation>/`.

## Task 7 Evidence

- Full tracked-path scan classified the eight compatibility symlinks as
  compatibility; after the user-authorized closeout, all eight are removed.
- Current runbook, design, contract, and portable-skill references found by the
  scan were repaired to `apps/`, `services/`, `pipelines/`, and `platform/`
  paths; generated Codex/Claude views were regenerated from the repaired source.
- Historical, fixture, and compatibility references remain explicitly
  classified in the local-artifact inventory and this audit.
- The first post-removal scan found a stale compatibility manifest and the
  user-auth E2E runner's `$repo_root/back` backend path. The closure contract
  test failed on the stale migration status, then passed after both consumers
  were repaired. The final current-source scan is clean; remaining old-path
  strings are limited to retired-entrypoint explanations, historical design,
  audit evidence, and intentional negative-test assertions.

## Validation

| Command | Result |
| --- | --- |
| `git diff --check` | pass |
| `node platform/tooling/sync-agent-skills.mjs --check` | 79 source files in sync |
| `node --test platform/tooling/agent-entry-contract.test.mjs platform/tooling/root-artifact-contract.test.mjs platform/tooling/sync-agent-skills.test.mjs platform/tooling/skill-portability.test.mjs platform/tooling/legacy-alias-closure.test.mjs` | 20/20 pass |
| `node scripts/lib/project-constants-usage.test.mjs` | 1/1 pass |
| `node --test platform/local/acceptance-test.test.mjs platform/local/quality-gate-automation-live-contract.test.mjs` | 6/6 pass |
| `cd apps/admin-console && pnpm run check` | pass after frozen-lockfile install |
| `mvn -Dtest=ProjectConstantsTest,LegacyLocalStackConfigEnvironmentPostProcessorTest,LogbackConfigurationTest,WebConfigTest,CorsConfigTest,LegacyLocalBackendPortCleanerTest test` | 17/17 pass |
| retired-path absence and canonical-directory contract | pass; 8 retired paths absent, canonical roots are real directories |
| `bash ./platform/local/quality-gate.sh --skip-front --skip-admin` | 321/326 pass; 5 blocked by missing authorization fixtures |

The five quality-gate failures are pre-existing environment evidence gaps:
missing `reports/authorization/canonical/canonical-item-group-bootstrap.result.json`
and `canonical-npc-apply.input.json`, plus the dependent NPC owner-phase contract
failure. The protected primary-worktree authorization reports were not copied,
modified, or staged to make this gate pass.

## Runtime Safety

- No database, crawler, Redis, local-stack, apply, force, refresh, or cleanup
  command was run.
- `data/generated/shimmer/**` and `reports/authorization/**` remain outside
  this worktree's changes and are not staged.
- The branch remains uncommitted pending the final focused staging review.
- Post-gate attribution check: the worktree resolves its own `data/generated`
  and `reports/authorization` directories rather than the primary worktree;
  protected primary files and generation directories have pre-gate timestamps,
  and the quality-gate source/test contract keeps the acceptance run dry-run
  only. No causal write from this task was found.
