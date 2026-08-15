# Devlog: project-structure-professionalization

## Status

`closed`

## Goal and boundary

Complete the approved TerraPedia structure migration in a dedicated worktree:
move maintained applications, shared runtime, platform scripts, and data
pipelines to canonical names; keep one-way legacy aliases for rollback; and
preserve data, evidence, API behavior, and authorization boundaries.

No database writes, Redis reset, crawler apply/force, external refresh, schema
change, UI redesign, or data/report regeneration was performed.

## Worktree

- branch: `refactor/project-structure-migration`
- worktree: `/home/lolben/TerraPedia/.worktrees/project-structure-migration`
- base: `461914fa`
- primary worktree: `/home/lolben/TerraPedia` (not moved or cleaned)
- compatibility state: legacy paths are single symlinks to canonical targets

## Canonical path map

| Legacy alias | Canonical target |
| --- | --- |
| `front-nuxt/` | `apps/public-web/` |
| `data-query-app/` | `apps/admin-console/` |
| `back/` | `services/catalog-api/` |
| `shared/article-runtime/` | `packages/content-runtime/` |
| `scripts/dev/` | `platform/local/` |
| `scripts/ops/` | `platform/operations/` |
| `scripts/tooling/` | `platform/tooling/` |
| `scripts/data/` | `pipelines/` |

The retired untracked `front/` directory remains absent. `data/`, `reports/`,
Shimmer generations, authorization packets, and relation/canonical evidence
were not moved.

## Implementation decisions

- `scripts/config/project.constants.json` remains the sole machine-readable
  path/name/command source.
- Node, Shell, PowerShell, and Java adapters enforce repository containment;
  API-facing paths remain repository-relative.
- Platform entrypoints resolve their root from script location with
  `TERRAPEDIA_REPO_ROOT` override support; old entrypoints delegate through
  symlink aliases.
- Java `ProjectConstants` provides typed roots and portable audio fallback;
  the audio service accepts an explicit external root before the project
  compatibility fallback.
- A small number of deliberate fixture-local or legacy CLI `process.cwd()`
  consumers remain in the hard-code inventory; they were not mass-rewritten.

## Validation evidence

Passed:

- `node --test scripts/lib/project-constants.test.mjs scripts/lib/project-constants-usage.test.mjs` (9/9)
- `node --test scripts/lib/project-constants-shell.test.mjs platform/local/lib/bash-foundation.test.mjs` (9/9)
- `node --test platform/local/standalone-crawler-monitor.test.mjs platform/tooling/upstream-monitor/check-upstream-updates.test.mjs` (6/6)
- `pnpm run check` in `apps/admin-console/`
- `mvn -q -Dtest=ProjectConstantsTest,AdminAudioAssetStreamServiceTest,DomainAcceptanceServiceImplTest,AdminDomainAcceptanceControllerTest,DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest,CrawlerMonitorServiceImplTest,CrawlerMonitorActionRegistryTest,CrawlerReportArchiverTest,RelationCompatibilityServiceImplTest,AdminArmorSetControllerTest test` (307 tests, 0 failures)
- `git diff --check`
- canonical/legacy symlink uniqueness and path-offset scans

The public `apps/public-web` check reached its existing SEO prerequisite and
stopped because `public/sitemap.xml` is absent and no sitemap-blocked source
report exists. This file was absent before the migration; no sitemap was
generated as a data/UI change.

The crawler regression baseline remains red for pre-existing standardized data
hash drift (`items` and `projectiles`); `npcs` still matches. Actual hashes are
recorded in the structure acceptance report. No data was changed to hide this.

## Rollback

Before merge, abandon or revert this branch. During the compatibility window,
callers can use the legacy symlink entrypoints. Never remove symlinks or delete
canonical directories while the primary worktree contains unrelated user
changes. Any future alias removal requires a fresh reference scan and focused
commit.

## Follow-up

1. Resolve the pre-existing public sitemap prerequisite in the public frontend
   task, not in this structure commit.
2. Decide whether to refresh the `items`/`projectiles` regression baseline in a
   separately authorized data task.
3. Keep the remaining production `process.cwd()` inventory as an allowlisted
   follow-up; migrate only with focused contracts and no broad data rewrite.

## Commit closeout

This entry is closed after staged-scope review and focused validation. The
implementation commit is `be8ffe02`; this follow-up records the durable
closeout state before integration into the feature branch.

## Post-integration follow-up

The integrated branch added the missing machine-readable compatibility alias
`scripts/data -> pipelines` in `scripts/config/project.constants.json`, with a
regression assertion in `scripts/lib/project-constants.test.mjs`. The red-green
check was observed (`1` expected failure, then `9/9` passing); follow-up commit
`32a308ae` is included in the feature branch.

The same follow-up corrected the current `data/wiki-crawler/README.md` source
location from the legacy alias to `pipelines/crawler`; no crawler data or
execution behavior changed.

Review repairs on the integrated branch then completed the canonical-boundary
closeout: `docs/project-governance/00_WORKFLOW.md` and current architecture
references now use canonical roots; `services/catalog-api/scripts/build-back.ps1`
derives its Maven cache, runtime logs, service root, and Maven working directory
from the project constants adapter; crawler boundary docs and skill examples
were synchronized; and duplicate platform ignore rules were removed. The
portable build contract is covered by the Shell/PowerShell suite (`14/14`).
