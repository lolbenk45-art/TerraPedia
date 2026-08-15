# Project Structure Compatibility Window Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the project-structure compatibility window by proving current consumers use canonical roots, removing the eight legacy symlink entrypoints, and recording the result without changing data or runtime semantics.

**Architecture:** Treat `apps/`, `services/`, `packages/`, `pipelines/`, and `platform/` as the only maintained code boundaries. The JSON project constants manifest records a closed migration state and no legacy command aliases; historical references remain only in archived evidence and are explicitly classified in a durable closure audit.

**Tech Stack:** Git worktree, Node.js ESM path contracts, Bash/PowerShell entrypoints, Nuxt checks, Maven focused tests, Markdown governance/audit records.

---

## Scope and closure definition

In scope:

- Read-only repository-wide reference census with current/history classification.
- Current documentation, runbook, README, manifest, and path-contract updates.
- Removal of these tracked symlinks only: `front-nuxt`, `data-query-app`, `back`, `shared/article-runtime`, `scripts/dev`, `scripts/ops`, `scripts/tooling`, and `scripts/data`.
- Durable closure audit and devlog handoff.

Out of scope:

- Moving or regenerating any `data/`, `reports/`, Shimmer, authorization, build, or runtime artifact.
- Database writes, crawler `apply/force`, Redis reset, external fetches, or API/UI behavior changes.
- Mechanical rewrites of archived plans, historical audits, devlog entries, or design specimens.

The task is closed only when all eight old paths are absent as filesystem entries, every canonical target exists as a real directory, current entrypoint scans contain no old path dependency, the manifest reports `closed`, and focused canonical validation passes.

### Task 1: Capture preflight inventory and old-entrypoint consumers

**Files:**
- Create: `docs/audits/structure/project-structure-compatibility-window-closure-2026-08-16.md`
- Create: this plan and `docs/devlog/entries/2026-08-16-project-structure-compatibility-window-closure.md`

- [x] Record branch/worktree state, the eight symlink targets, canonical directory checks, and the reference-scan command boundaries.
- [x] Run scans over `.github`, canonical code roots, `scripts/lib`, `scripts/config`, root docs, active architecture/design/operations/contracts/governance/project-management/runbooks, and historical/archive/report/design paths without rewriting historical evidence.
- [x] Classify each remaining old-path hit as current consumer, current documentation to repair, or historical/reference evidence.
- [x] Confirm no production source, CI workflow, package import, or executable test requires an old entrypoint; the only runtime hit is the intentional absence-guard test.

### Task 2: Close the manifest and current documentation contract

**Files:**
- Modify: `scripts/config/project.constants.json`
- Modify: `scripts/lib/project-constants.test.mjs`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/project-governance/00_CURRENT_SPEC.md`
- Modify: `docs/architecture/project-structure-v2.md`
- Modify: `docs/architecture/file-placement-rules.md`
- Modify: `scripts/README.md`
- Modify: `apps/public-web/README.md`
- Modify: `apps/admin-console/README.md`
- Modify: `services/catalog-api/README.md`
- Modify: `pipelines/README.md`
- Modify: `platform/local/README.md`
- Modify: `platform/operations/README.md`
- Modify: `platform/tooling/README.md`
- Modify: current runbooks that still present an old path as the default command

- [x] Remove application `legacyPath` fields, `commands.legacy*`, and `compatibility.aliases` from the manifest; set `compatibility.migrationStatus` to `closed` while retaining environment names and canonical roots needed by runtime adapters.
- [x] Update the Node manifest test to assert canonical paths, closed status, and absence of legacy alias fields.
- [x] Change current governance and README wording from “compatibility window/symlink supported” to “compatibility window closed; use canonical path”.
- [x] Replace current runbook command examples with `platform/...`, `pipelines/...`, `apps/...`, and `services/...` paths. Leave historical evidence untouched.
- [x] Add `scripts/lib/project-structure-compatibility-closure.test.mjs` to prove retired-path absence and canonical real directories.

### Task 3: Remove legacy symlink entries

**Files:**
- Delete: `front-nuxt`
- Delete: `data-query-app`
- Delete: `back`
- Delete: `shared/article-runtime`
- Delete: `scripts/dev`
- Delete: `scripts/ops`
- Delete: `scripts/tooling`
- Delete: `scripts/data`

- [x] Confirm each path is a symlink to the expected canonical target immediately before deletion.
- [x] Delete only the symlink entries; no canonical, data, report, or shared adapter directory was removed.
- [x] Confirm the retired entries are absent and `scripts/lib/` remains present.

### Task 4: Canonical validation and audit closeout

**Files:**
- Modify: `docs/audits/structure/project-structure-compatibility-window-closure-2026-08-16.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-16-project-structure-compatibility-window-closure.md`

- [x] Run `git diff --check`, the canonical path/old-path scans, Node path suites, admin check, and backend focused path/acceptance tests from canonical directories.
- [x] Run canonical shell entrypoint parse/contract checks; no database writes, crawler apply/force, Redis reset, or external refresh was invoked.
- [x] Record known unrelated variances (public sitemap prerequisite and isolated-worktree authorization fixture baseline) separately from this closure result.
- [x] Record rollback as a Git revert of this focused commit; no manual recreation of divergent directories is allowed.
- [x] Close the devlog entry under the TerraPedia task-commit workflow with
  `commit SHA pending in final response` immediately before the explicit commit.

## Failure policy

If a current consumer fails after symlink removal, restore the entrypoint only by reverting the focused Git changes in the isolated worktree, classify the consumer, repair its canonical path, and rerun the complete closure validation. Never recreate a second physical copy or silently redirect writes to a legacy root.

## Review checklist

- No current production/CI/test dependency on a legacy entrypoint.
- No tracked symlink remains at the eight retired paths.
- Canonical directories are real directories and remain the only writable code roots.
- Historical references are preserved as evidence and named in the closure audit.
- Shimmer, authorization reports, data layers, and runtime artifacts are unchanged.
