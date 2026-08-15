# TerraPedia Project Structure Professionalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TerraPedia 从历史目录命名和隐式路径依赖，渐进迁移为具有明确产品、服务、数据管线、平台工具和协作工具边界的专业单仓库结构，同时保证现有启动、测试、爬虫监控和数据读取链路不因路径变化中断。

**Architecture:** 采用版本化仓库布局清单作为跨 Node、Java、Shell/PowerShell 的路径源，并由各语言薄适配层解析绝对路径。脚本不再基于当前工作目录猜测仓库根目录。物理迁移已在独立工作树完成；所有旧路径在迁移窗口内由单向 symlink 保留，完成引用审计和质量门禁后再移除。

**Tech Stack:** Node.js ESM、Shell/PowerShell、Spring Boot/Java 17、Maven、Nuxt 4、pnpm、JSON layout manifest、现有 TerraPedia quality gate。

---

## Migration Checkpoint（2026-08-16）

### 已完成

- 已建立 `scripts/config/project.constants.json` 与
  `scripts/lib/project-constants.mjs`，并完成仓库根目录、共享数据根和外部根的越界检查。
- 已修复本轮审计确认的 crawler/fetch/audit/backfill/workflow、前后台 runtime、后端音频路径默认值；实现和测试仍在当前工作树，尚未提交。
- 已删除未跟踪的旧 `front/` 目录；公共前端唯一维护路径为 `apps/public-web/`，不得创建 `apps/legacy-web/` 兼容目标。
- 已保留用户已有的 Shimmer 生成数据、授权报告和其他非结构改动；它们不能被迁移、清理或重置。
- 已在独立迁移工作树中完成 `front-nuxt`、`data-query-app`、`back`、共享包、平台脚本和 `scripts/data` → `pipelines` 的物理迁移；所有旧入口均为单向 symlink。
- 已更新 CI、启动/质量门、运行时配置、Nuxt/Maven 元数据、路径敏感测试和脚本命令到 canonical roots。
- 已完成数据/报告/任务上下文/生成产物分类文档；现有数据和报告内容未搬动。

### 迁移启动门槛

物理迁移在独立工作树完成，主工作树中的 Shimmer 数据和授权报告仍保持原状。提交前仍需按边界审阅 staged scope。

### 不得推断的事项

- `pipelines/`、`platform/`、`apps/`、`services/`、`packages/` 和 `artifacts/` 已落地；旧根只作为 symlink。
- 完整 quality gate 尚未在本迁移工作树执行；结构 focused gates 已执行。
- 爬虫 apply/force、数据库写入、Redis reset 和真实外部刷新仍未执行。

---

## Scope and Boundaries

**In scope:**

- 将 `front-nuxt`、`data-query-app`、`back`、`shared/article-runtime` 建立专业名称和目标边界。
- 明确 `.codex`、`.claude`、`.superpowers`、`.worktrees`、`.github` 及构建/运行产物的生命周期。
- 建立统一仓库根目录、应用目录、数据目录、报告目录和脚本目录解析机制。
- 对脚本、后端路径读取、命令展示和测试 fixture 做兼容迁移。
- 建立目录迁移审计、路径偏移检测、旧路径引用扫描和回滚说明。

**Out of scope:**

- 不改变数据库 schema、业务数据、爬虫抓取策略、API 语义或前端视觉。
- 不删除 `data/generated/`、`data/standardized/`、`data/terraPedia/` 等仍在使用的历史兼容层；已按用户决定删除未跟踪的旧 `front/` 目录。
- 不把 `.codex` 或 `.claude` 迁入业务目录；不把 `.superpowers` 本地生成物提交为项目事实。
- 不新增真实 crawler force/apply、数据库写入或 Redis reset 操作。

## Target Naming Map

| Current path | Target path | Formal role | Migration rule |
|---|---|---|---|
| `front-nuxt/` | `apps/public-web/` | Public knowledge-base web app | Keep current path until compatibility checks pass, then move as one unit |
| `data-query-app/` | `apps/admin-console/` | Admin/data-query console | Update package name and stack references before physical move |
| `back/` | `services/catalog-api/` | Catalog/content Spring API | Rename Maven artifact only after command and deployment reference audit |
| `shared/article-runtime/` | `packages/content-runtime/` | Shared article/content runtime | Verify all importers before moving |
| `scripts/data/` | `pipelines/` | Data acquisition-to-import pipeline | Migrate by lifecycle, not by bulk rename |
| `scripts/dev/` | `platform/local/` | Local stack and quality gates | Keep root-compatible shell wrappers |
| `scripts/ops/` | `platform/operations/` | Scheduled/daemon operations | Keep PowerShell wrappers during migration |
| `scripts/tooling/` | `platform/tooling/` | Standalone developer tooling | Move only after executable-path scan |

## Unified Path Contract

The single source of truth for project-wide constants will be:

```text
scripts/config/project.constants.json
```

This is intentionally named `project.constants.json`, not `repository-layout.json`, because it controls more than folders. It will contain:

- `project.id`, `project.displayName`, and `project.schemaVersion`;
- `applications.publicWeb`, `applications.adminConsole`, and `applications.catalogApi`, each with `currentPath`, `targetPath`, `packageName`, `runtimePortKey`, and `status`;
- `roots.apps`, `roots.services`, `roots.packages`, `roots.pipelines`, `roots.platform`, `roots.data`, `roots.docs`, `roots.reports`, and `roots.artifacts`;
- `dataLayers.raw`, `dataLayers.normalized`, `dataLayers.canonical`, `dataLayers.exports`, `dataLayers.legacy`, and `dataLayers.backups`;
- `evidence.durable`, `evidence.runtime`, and required compatibility report roots;
- `crawler.outputs` for raw output, source manifest, canonical monitor progress, child status, resume state, and operation report paths;
- `commands.start`, `commands.stop`, `commands.qualityGate`, and focused check commands;
- `compatibility.aliases`, migration status, and allowed old-path wrappers.

The file will be accompanied by two human-readable references:

```text
docs/architecture/project-constants.zh-CN.md
docs/architecture/project-constants.en-US.md
```

The JSON remains the machine source of truth; the two Markdown files explain every key, ownership rule, and change procedure in Chinese and English. They must not duplicate independent values.

Resolution rules:

1. Resolve repository root from the caller file, not `process.cwd()`.
2. Reuse and extract the existing worktree-aware logic from `scripts/lib/local-runtime-config.mjs`.
3. Resolve all manifest values relative to the resolved repository root.
4. Reject paths that escape the repository root unless explicitly marked external (for example the shared Redis persistence directory).
5. Expose only semantic functions such as `repoPath('data.canonical')`, `appPath('publicWeb')`, `runtimeReportPath(...)`; callers must not concatenate `../../` or duplicate directory literals.
6. Shell and PowerShell wrappers receive `TERRAPEDIA_REPO_ROOT` optionally, otherwise call the canonical resolver.
7. Java loads the same constants file through a `ProjectConstants` adapter and accepts an explicit `terrapedia.repo-root` override for tests and isolated worktrees.

The constants file is the project-wide source. Language adapters are parsers, not independent copies of paths, names, ports, or commands.

The plan keeps three layers separate:

1. `project.constants.json`: stable project paths, names, roots, command entrypoints, and output templates;
2. workflow/action registries: stable `actionId` and domain-specific operation metadata, which reference constants keys instead of embedding filesystem paths;
3. runtime state: generated progress, manifests, resume checkpoints, and reports, which are outputs governed by the first two layers and are never treated as constants.

## Migration Tasks

## Current Repair Slice Boundary

The first repair slice established the constants/resolver contract and representative path fixes. The follow-up migration slice created the target `apps/`, `services/`, `packages/`, `pipelines/`, `platform/`, and reserved `artifacts/` directories in an isolated worktree, moved each boundary once, and left legacy symlinks for rollback. Remaining cwd consumers and baseline gate variance are explicitly recorded as follow-up risks rather than hidden by data regeneration.

### Task 1: Freeze the current structure and produce the migration inventory

**Files:**
- Create: `docs/architecture/project-structure-v2.md`
- Create: `docs/audits/structure/project-structure-inventory-2026-08-16.md`
- Modify: `docs/architecture/README.md`
- Modify: `README.md`
- Modify: `AGENTS.md` only after the target top-level boundary is approved

- [x] Record every top-level directory, owner, consumer, tracked/ignored status, regeneration policy, and migration target.
- [x] Explicitly classify `.codex` (tracked project skills), `.claude` (ignored local settings), `.superpowers` (ignored local artifacts), `.worktrees` (ignored Git state), `.github` (CI), and build/runtime directories.
- [x] Record current compatibility roots that must remain readable during migration, including `reports/relation`, `reports/canonical-migration`, `data/generated`, and `data/terraPedia`.
- [x] Add a target-tree diagram and a no-delete/no-write boundary to the architecture document.
- [x] If `apps/`, `services/`, `packages/`, `pipelines/`, `platform/`, or `artifacts/` become permanent top-level directories, update `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`, and the placement rules in the same boundary commit.
- [x] Run `rg` reference scans for every current path before any move and save counts in the inventory.

### Task 1A: Build the hard-coded path census and allowlist

**Files:**
- Create: `docs/audits/structure/script-path-hardcode-inventory-2026-08-16.md`
- Create: `scripts/lib/project-constants-usage.test.mjs`
- Modify: `docs/architecture/project-constants.zh-CN.md`
- Modify: `docs/architecture/project-constants.en-US.md`

- [x] Scan production code (excluding fixtures, snapshots, generated output, `node_modules`, `.nuxt`, `.output`, and `target`) for `process.cwd()`, `path.resolve`, `path.join`, absolute home paths, old application directory names, data/report/output literals, port defaults, and API origins.
- [x] Classify every finding as `project constant`, `local runtime config`, `external resource override`, `protocol/route`, `test fixture`, or `intentional compatibility alias`.
- [x] Treat the current 194 `scripts/data` `process.cwd()` consumers as an inventory, not an automatic mass-rewrite: runtime entrypoints migrated in the audited slice; deliberate fixture setup remains documented.
- [x] Add an allowlist test that fails when a new production script introduces an unclassified absolute path or output-family literal.
- [x] Record high-priority current findings, including item-page raw defaults under `/home/lolben/data/terraPedia`, `run-wiki-sync.mjs` cwd-based paths, `run-image-sync.mjs` cwd defaults, backend audio root, and duplicated frontend/backend port defaults.

### Task 2: Add the versioned project constants and Node resolver

**Files:**
- Create: `scripts/config/project.constants.json`
- Create: `scripts/lib/project-constants.mjs`
- Create: `scripts/lib/project-constants.test.mjs`
- Modify: `scripts/lib/local-runtime-config.mjs`

- [x] Extract the existing worktree-aware root discovery into a reusable function without changing its current config behavior.
- [x] Implement constants loading with schema validation, root containment checks, semantic path accessors, application identity lookup, command lookup, and compatibility alias lookup.
- [x] Add tests for primary worktree, linked worktree `.git` file, nested caller directory, missing manifest key, path traversal, and explicit `TERRAPEDIA_REPO_ROOT` override.
- [x] Add crawler-specific assertions for default `manifestPath`, `progressPath`, `childStatusPath`, `outputPath`, `reportPath`, and resume-state paths; explicit `--*-path` overrides remain inside the resolved worktree unless the operation explicitly declares an external path.
- [x] Make `local-runtime-config.mjs` consume the resolver for its config paths while preserving the canonical/legacy local-stack config fallback.
- [x] Ensure resolver failures are fail-closed with the resolved root and missing semantic key in the error.

### Task 3: Add Shell/PowerShell adapters and path-offset contracts

**Files:**
- Create: `scripts/lib/project-constants.sh`
- Create: `scripts/lib/project-constants.ps1`
- Create: `scripts/lib/project-constants-shell.test.mjs`
- Modify: `scripts/dev/start-local-stack.sh`
- Modify: `scripts/dev/stop-local-stack.sh`
- Modify: `scripts/dev/quality-gate.sh`
- Modify: `scripts/ops/*.sh`
- Modify: `scripts/ops/*.ps1`

- [x] Make each migrated entrypoint resolve the root from its own script location and import semantic paths from the manifest.
- [x] Preserve all current command-line flags, ports, database names, and authorization boundaries.
- [x] Add a shell contract that runs the resolver from repository root, an app directory, and an unrelated working directory and asserts identical resolved paths.
- [x] Add a PowerShell contract for Windows path separators and linked worktree resolution.
- [x] Replace duplicated literals for `back`, `front-nuxt`, `data-query-app`, `data`, and `reports` in touched scripts; historical commands remain compatibility evidence.

### Task 4: Add the Java/Spring project-constants adapter

**Files:**
- Create: `back/src/main/java/com/terraria/skills/config/ProjectConstants.java`
- Create: `back/src/test/java/com/terraria/skills/config/ProjectConstantsTest.java`
- Modify: `back/src/main/resources/application.yml`
- Modify: backend services that currently construct `reports/...`, `data/...`, or `scripts/...` paths

- [x] Load `scripts/config/project.constants.json` from `terrapedia.repo-root`, an explicit environment override, or the current repository root fallback.
- [x] Expose typed roots for reports, canonical data, generated compatibility data, scripts, and application directories.
- [x] Keep API response paths repository-relative; never expose absolute host paths.
- [x] Update only runtime path consumers identified by the inventory, including domain acceptance, crawler artifact, relation compatibility, audio asset, and data-source services.
- [x] Add tests using temporary repositories containing both current and target alias layouts.
- [x] Run the focused backend path/acceptance test classes after the directory move.

### Task 5: Introduce professional application names without moving directories

**Files:**
- Modify: `front-nuxt/package.json`
- Modify: `data-query-app/package.json`
- Modify: `back/pom.xml`
- Modify: `front-nuxt/README.md`
- Modify: `data-query-app/README.md`
- Modify: `back/README.md`
- Modify: `README.md`

- [x] Rename package/service display identities to `terrapedia-public-web`, `terrapedia-admin-console`, and `terrapedia-catalog-api` while preserving compatibility symlink paths.
- [x] Add a current-to-target naming table and compatibility period to each app README.
- [x] Update CI and local stack labels only where they are display metadata, not path values.
- [x] Verify Nuxt checks, Maven compilation, and local stack startup use current paths.

### Task 5A: Migrate crawler output paths to the project constants contract

**Files:**
- Modify: `scripts/data/workflow/run-wiki-sync.mjs`
- Modify: `scripts/data/workflow/run-backend-data-refresh.mjs`
- Modify: `scripts/data/workflow/backend-refresh-runtime-state.mjs`
- Modify: `scripts/data/fetch/*.mjs` that create raw, progress, manifest, resume, or report files
- Test: `scripts/data/workflow/run-wiki-sync.test.mjs`
- Test: `scripts/data/workflow/run-backend-data-refresh.test.mjs`
- Test: `scripts/data/workflow/backend-refresh-runtime-state.test.mjs`

- [x] Replace audited crawler defaults currently derived from `process.cwd()` or duplicated literals with semantic constants such as `crawler.sourceManifest`, `crawler.monitorProgress`, `crawler.rawRoot`, `crawler.resumeRoot`, and `crawler.operationReports`.
- [x] Preserve the existing monitor-visible canonical progress paths and mirror custom progress paths to the canonical path where required by the crawler progress contract.
- [x] Keep `--manifest-path`, `--progress-path`, `--output`, `--report-path`, and resume overrides functional, while rejecting traversal and accidental writes outside the resolved worktree.
- [x] Ensure audited crawlers write progress before network requests, update `lastHeartbeatAt`, and atomically write terminal state.
- [x] Add tests for default paths, isolated overrides, arbitrary working directories, linked worktrees, mirror behavior, and outside-root rejection.
- [x] Run the narrow crawler tests and relevant backend monitor contracts; no real apply/force or database write was run.

### Task 5B: Unify non-crawler script outputs and runtime defaults

**Files:**
- Modify: `scripts/data/lib/project-root.mjs`
- Modify: `scripts/dev/lib/runtime-config.sh`
- Modify: `scripts/lib/local-runtime-config.mjs`
- Modify: `scripts/data/fetch/*.mjs`, `scripts/data/parse/*.mjs`, `scripts/data/audit/*.mjs`, `scripts/data/backfill/*.mjs`, `scripts/data/relation/*.mjs`, and `scripts/data/import/*.mjs` identified by Task 1A
- Modify: `front-nuxt/utils/runtimeConfig.mjs`
- Modify: `front-nuxt/nuxt.config.ts`
- Modify: `data-query-app/nuxt.config.ts`
- Modify: `back/src/main/resources/application.yml`

- [x] Replace audited production `process.cwd()` path construction with the shared resolver while preserving explicit `--repo-root`, `WORKTREE_ROOT`, and `TERRAPEDIA_PROJECT_ROOT` overrides; remaining deliberate consumers stay in the hard-code inventory.
- [x] Move audited stable output families (standardized data, generated compatibility data, reports, backups, audit artifacts, and temporary runtime artifacts) to semantic constants; domain-specific filenames remain in action registries.
- [x] Keep environment-specific values out of project constants: explicit CLI/env override, local stack config, then project default remains the precedence.
- [x] Remove duplicated default backend origins and ports from frontend helpers and Nuxt configs by reading the resolver; test-specific ports remain fixtures.
- [x] Replace the backend audio absolute home path with an environment/configurable external root whose fallback is derived from project constants.
- [x] Add focused tests for representative fetch, parse, audit, backfill, relation, import, frontend config, and backend path consumers; the residual cwd inventory remains a follow-up audit.

### Task 6: Migrate platform scripts with compatibility wrappers

**Files:**
- Create: `platform/local/README.md`
- Create: `platform/operations/README.md`
- Create: `platform/tooling/README.md`
- Move later: `scripts/dev/`, `scripts/ops/`, `scripts/tooling/`
- Create compatibility wrappers under `scripts/dev/`, `scripts/ops/`, and `scripts/tooling/`

- [x] First copy entrypoint behavior to target locations and make old paths delegate to target scripts.
- [x] Keep Bash as the source of truth and PowerShell as compatibility wrappers.
- [x] Validate start, stop, smoke, quality gate, crawler cutover, and scheduled-operation command contracts through both old and new paths.
- [x] Do not run real crawler apply/force or database writes as part of this migration.

### Task 7: Migrate shared package and application directories

**Files:**
- Move: `front-nuxt/` → `apps/public-web/`
- Move: `data-query-app/` → `apps/admin-console/`
- Move: `back/` → `services/catalog-api/`
- Move: `shared/article-runtime/` → `packages/content-runtime/`
- Modify: `.github/workflows/*.yml`, root scripts, package configs, Maven configs, docs, and test fixtures found by the inventory

- [x] Move one boundary per focused migration worktree checkpoint, preserving compatibility symlinks for one migration window.
- [x] Run `rg` scans to prove no production or CI consumer still points to an unintended old path.
- [x] Run public frontend, admin, backend focused, and path contract checks; the public gate's pre-existing sitemap prerequisite is recorded as a residual variance.
- [x] Remove the untracked retired `front/` directory after confirming it has no tracked or active consumers.

### Task 8: Reclassify data, reports, task context, and generated artifacts

**Files:**
- Modify: `data/README.md`
- Modify: `data/canonical/README.md`
- Modify: `data/legacy/README.md`
- Modify: `reports/README.md`
- Modify: `.gitignore`
- Create: `artifacts/README.md`
- Create: `docs/audits/structure/project-structure-migration-acceptance-2026-08-16.md`

- [x] Classify `data/generated`, `data/standardized`, `data/standardized-view`, `data/terraPedia`, and `data/reports` by source-of-truth role before moving any file.
- [x] Keep `artifacts/runtime` reserved for proven rebuildable output; durable evidence remains under `docs/audits`.
- [x] Preserve canonical migration, authorization, crawler-monitor, and relation evidence required by current contracts.
- [x] Keep `task/` ignored and promote final conclusions to docs/devlog rather than leaving them only in task context.
- [x] Add and run generated-artifact/path ownership checks; no tracked build/cache runtime-only files were introduced.

### Task 9: Final validation, rollback evidence, and closeout

**Files:**
- Modify: `docs/devlog/current.md`
- Create: `docs/devlog/entries/2026-08-16-project-structure-professionalization.md`
- Modify: `docs/project-governance/00_CURRENT_SPEC.md` only if maintained boundaries or default commands changed

- [x] Run `git diff --check` and the repository layout/path-offset contracts.
- [x] Run public/admin checks from canonical app paths and focused Maven tests for changed backend path consumers; the public sitemap prerequisite remains a pre-existing gate variance.
- [x] Run compatible local quality-gate contracts after focused checks; the full runtime gate remains blocked by existing data baseline drift and the public sitemap prerequisite.
- [x] Record old/new path maps, validation output, residual aliases, and rollback commands.
- [x] Stage only structure migration files and verify `git status --short` and `git diff --cached --stat` before commit.

## Path-Offset Failure Policy

The migration is not accepted if any of these occur:

- A script works only when launched from the repository root.
- A linked worktree resolves paths into the primary worktree unexpectedly.
- A backend service emits an absolute local path or reads a path outside the configured repository root.
- A compatibility alias points to both old and new locations with divergent writes.
- A report/data path is silently recreated in the old location.

When a failure is found: stop the affected move, add a focused resolver/fixture test, repair the adapter or manifest, rerun the path contract, then continue. Do not compensate with ad-hoc `../../` changes.

## Plan Self-Review

- Goal coverage: directory naming, hidden tool directories, script path stability, cross-language constants, compatibility aliases, data/report boundaries, and rollback are covered by Tasks 1–9.
- Placeholder scan: no implementation step depends on an unspecified path or a future decision; historical data classification is explicitly preceded by inventory and source-reference scans.
- Source-of-truth: `scripts/config/project.constants.json` owns project paths, names, commands, and compatibility aliases; current canonical data and runtime queue authorities remain unchanged.
- Safety: no database writes, crawler apply/force, Redis reset, or destructive deletion is included.
