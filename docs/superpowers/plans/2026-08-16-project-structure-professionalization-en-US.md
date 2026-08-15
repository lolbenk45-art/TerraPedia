# TerraPedia Project Structure Professionalization Plan (English)

> This is the English counterpart of `2026-08-16-project-structure-professionalization.md` (Chinese). Both documents describe the same scope and acceptance gates.

## Goal

Move TerraPedia from historical directory names and implicit path assumptions to a professional monorepo boundary model without breaking local startup, CI, crawler monitoring, backend evidence reads, or data tooling.

## Target boundaries

```text
apps/public-web          <- front-nuxt
apps/admin-console       <- data-query-app
services/catalog-api     <- back
packages/content-runtime <- shared/article-runtime
pipelines/               <- scripts/data
platform/local/          <- scripts/dev
platform/operations/     <- scripts/ops
platform/tooling/        <- scripts/tooling
data/                    <- raw/normalized/canonical/exports/legacy/backups
docs/                    <- governance/architecture/plans/audits/runbooks/devlog
artifacts/              <- reproducible runtime output and generated artifacts
```

Physical moves are deferred until logical naming, path resolution, and compatibility tests pass.

## Single project constants source

The canonical, machine-readable project constants file is:

```text
scripts/config/project.constants.json
```

It owns project identity, application names and aliases, current and target paths, data layers, evidence roots, crawler raw/manifest/progress/resume/report paths, command entrypoints, runtime port keys, migration status, and compatibility wrappers. Node, Shell, PowerShell, and Java adapters parse this file; they must not maintain independent path maps.

Human-readable documentation will be maintained in:

```text
docs/architecture/project-constants.zh-CN.md
docs/architecture/project-constants.en-US.md
```

The JSON is authoritative; the Markdown files explain ownership and change rules and must not become a second source of values.

The design separates three layers: (1) `project.constants.json` for stable project paths, names, roots, commands, and output templates; (2) workflow/action registries for stable `actionId` and domain metadata that reference constants keys; and (3) runtime state such as progress, manifests, resume checkpoints, and reports, which are generated outputs and never constants. The untracked retired `front/` directory has been removed and has no compatibility target.

## Handoff Checkpoint (2026-08-16)

### Completed prerequisites

- `scripts/config/project.constants.json` and `scripts/lib/project-constants.mjs` now provide the project-root, shared-data-root, and external-root containment contract.
- The confirmed crawler/fetch/audit/backfill/workflow, frontend/admin runtime, and backend audio path-default repairs are present in the current worktree and are not committed yet.
- The untracked retired `front/` directory has been removed. `front-nuxt/` is the only maintained public frontend path; there is no `apps/legacy-web/` compatibility target.
- Existing user-owned Shimmer generated data, authorization reports, and other unrelated changes remain in place and must not be cleaned, reset, or moved.

### Migration start gate

The primary worktree contains mixed uncommitted changes from the path repair, backend/frontend runtime work, Shimmer data, and authorization evidence. Do not physically move `front-nuxt/`, `data-query-app/`, or `back/` in this worktree until those changes have been explicitly separated into reviewable checkpoints.

The next session should follow this smallest safe sequence:

1. Re-read this handoff and run `git status --short --branch -uall`; classify user-owned data/reports separately from structure-repair files.
2. Complete Task 1's structure inventory and create `docs/architecture/project-structure-v2.md`, covering `.codex`, `.claude`, `.superpowers`, `.worktrees`, `.github`, build caches, and runtime artifacts. This step is read-only/documentation work and performs no code moves. **Completed in the current checkpoint; see the inventory and v2 baseline documents.**
3. After a reviewable focused checkpoint exists, create a dedicated migration worktree or branch. Move one application boundary at a time and update CI, startup scripts, tests, constants, and rollback wrappers together.
4. Candidate order: `front-nuxt/` -> `apps/public-web/`, then `data-query-app/` -> `apps/admin-console/`, and finally evaluate `back/` -> `services/catalog-api/`. Each move requires reference scans and path-offset tests first.

### Unknowns that must not be guessed

- No structure-migration commit exists, and no `apps/`, `services/`, `packages/`, `pipelines/`, `platform/`, or `artifacts/` target directory has been created.
- Whether old-path wrappers remain during the physical migration window is undecided; each boundary requires a consumer scan and rollback design.
- The full quality gate, crawler apply, database writes, Redis reset, and physical directory migration have not been run.

## Execution stages

The first repair slice is deliberately narrower than the eventual physical migration: it establishes the constants/resolver contract, repairs confirmed production path and boundary defects, and validates representative crawler, parser, frontend, and backend consumers. It does not create the target `apps/`, `services/`, `packages/`, `pipelines/`, `platform/`, or `artifacts/` directories yet. Physical moves require a clean inventory, compatibility wrappers, and one focused commit per boundary.

1. **Inventory and freeze** — classify all top-level directories, including `.codex`, `.claude`, `.superpowers`, `.worktrees`, `.github`, build caches, logs, reports, and task context. Record tracked state, consumers, regeneration policy, and migration target.
2. **Hard-coded path census** — scan production code for `process.cwd()`, absolute home paths, old app names, output literals, port defaults, and API origins. Classify each as a project constant, runtime configuration, external override, protocol, fixture, or intentional compatibility alias. Treat the current 194 `scripts/data` cwd consumers as an inventory; migrate runtime entrypoints, not deliberate fixture setup.
3. **Constants and resolver** — add `project.constants.json`; extract the existing worktree-aware root discovery from `scripts/lib/local-runtime-config.mjs`; add tests for primary worktrees, linked worktrees, arbitrary working directories, missing keys, traversal attempts, and root overrides.
4. **Shell/PowerShell adapters** — make local and operations entrypoints resolve paths from their own script location and semantic constants. Test execution from the repository root, an app directory, and an unrelated directory.
5. **Java adapter** — add `ProjectConstants` to load the same file using `terrapedia.repo-root`; keep API paths repository-relative and update only audited runtime path consumers.
6. **Logical renaming** — rename package/service display identities to `terrapedia-public-web`, `terrapedia-admin-console`, and `terrapedia-catalog-api` while physical directories remain unchanged.
7. **Crawler output contract** — migrate `run-wiki-sync.mjs`, backend-refresh runners, and fetch scripts from `process.cwd()`/duplicated literals to semantic crawler constants for raw output, source manifest, canonical monitor progress, child status, resume state, and operation reports. Preserve explicit path overrides, root containment, atomic progress writes, heartbeat fields, and canonical progress mirroring.
8. **Non-crawler output/runtime defaults** — migrate audited fetch/parse/audit/backfill/relation/import outputs, frontend runtime origins, local-stack defaults, and backend external roots. Keep environment-specific ports, credentials, MinIO paths, and shared-data roots under CLI/env/local-stack configuration with project constants only supplying stable relative fallbacks.
9. **Compatibility migration** — copy platform scripts to target locations, retain old-path wrappers, then move one application/shared boundary per focused commit.
10. **Data/report classification** — classify `data/generated`, `data/standardized`, `data/standardized-view`, `data/terraPedia`, `data/reports`, and `reports/*` before moving or deleting anything. Preserve canonical, authorization, crawler-monitor, and relation evidence required by current contracts.
11. **Closeout** — run path-offset contracts, hard-code allowlist checks, narrow crawler tests, frontend checks, focused Maven tests, compatibility entrypoints, and finally the full quality gate. Record aliases, rollback commands, residual risks, and commit scope in the devlog.

## Safety boundaries

- No schema changes, database writes, crawler force/apply actions, Redis reset, API behavior changes, or UI redesign.
- No bulk deletion of legacy data or reports.
- A move is rejected if a command works only from the repository root, a linked worktree resolves into the wrong worktree, an API leaks an absolute path, or old and new aliases can diverge through writes.

## Acceptance definition

The restructuring is complete only when a new contributor can identify each boundary from its name, all entrypoints resolve the same paths from any working directory, the constants file is the only project-wide path/name/command source, and old compatibility wrappers can be removed with an auditable reference scan.
