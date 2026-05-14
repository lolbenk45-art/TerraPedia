# Responsibility-Based Project Structure Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not edit runtime or business code in this cleanup.

**Goal:** Continue optimizing the TerraPedia repository structure by responsibility, while preserving all runtime, data, script, and evidence contracts.

**Architecture:** This plan uses a coordinator plus disjoint multi-agent ownership domains. The next pass should freeze ownership rules first, add compatibility indexes second, and defer any path move that touches active app code, data contracts, scripts, CI, or generated evidence.

**Tech Stack:** Markdown documentation, Git, ripgrep, Node test runner, Maven, pnpm, PowerShell validation scripts.

---

## Current Checkpoint

Branch: `chore/project-structure-cleanup-2026-05-14`

Existing cleanup already in the worktree:

- Frontend migration/process docs were moved from `front/migration/**` to `docs/project-management/frontend-migration/**`.
- Frontend navigation component documentation was moved from `front/src/components/README_NAVIGATION.md` to `docs/architecture/frontend/navigation-components.md`.
- Historical `project-plan/` root records were archived under `project-plan/archive/2026-03/`, `project-plan/archive/2026-04/`, and `project-plan/archive/v1/`.
- `.gitignore` was hardened for `*:Zone.Identifier` and local frontend/admin cache or coverage output.
- High-risk runtime, data, report, and script paths were intentionally left in place.

Before continuing, treat this current diff as the first checkpoint. Do not let any worker revert it unless the coordinator explicitly decides the checkpoint is invalid.

## Execution Record

Executed on 2026-05-14 with disjoint multi-agent ownership:

- Phase 1 completed: docs and project-plan indexes now document responsibility boundaries, frontend migration breadcrumbs, frontend navigation breadcrumbs, and `project-plan/plan-/**` as a no-bulk-move historical cluster.
- Phase 2 completed: `docs/architecture/data-evidence-boundaries.md`, `docs/audits/data-evidence-compatibility-matrix.md`, `reports/README.md`, and `reports/relation/README.md` define data/evidence ownership and compatibility policy.
- Phase 3 audited: `back/API_CRUD_DOC.md` is pure API documentation but was not moved because current and historical references span files outside the app-boundary worker write set. Keep it in place until a separate contract-doc migration updates references intentionally.
- Phase 4 completed by coordinator validation after all edits in this pass.
- Phase 5 completed as policy: future real path moves must use separate alias-first plans, one artifact family or responsibility boundary per PR.

No runtime app source, runtime resource, data contract, data file, script implementation, CI workflow, or `reports/relation/*.json` was intentionally moved by this execution pass.

## Responsibility Model

The target repository responsibilities are:

- `back/`: backend app source, backend tests, Maven config, app-owned scripts, classpath resources, and a short backend README.
- `front/`: public frontend app source, static runtime assets, frontend tests, Vite/pnpm configs, app-owned scripts, and a short frontend README.
- `data-query-app/`: admin/query Nuxt app source, server routes, admin tests, Nuxt/pnpm configs, app-owned scripts, `.env.example`, and a short admin README.
- `scripts/dev/`: local developer stack and local validation entrypoints.
- `scripts/ops/`: scheduled task, daemon, heartbeat, and machine lifecycle wrappers.
- `scripts/tooling/`: repository maintenance tooling that is not app runtime and not data pipeline.
- `scripts/lib/`: shared automation helpers.
- `scripts/data/`: data lifecycle automation, keeping `fetch -> normalize/transform -> canonical -> audit -> import/backfill/sync -> workflow -> export` responsibilities explicit.
- `data/`: source, canonical, transitional, generated, export, and legacy data artifacts. Do not reorganize active contracts by appearance alone.
- `reports/`: generated or runtime evidence, with tracked evidence separated from ignored local runtime output by README policy.
- `docs/architecture/`: durable architecture rules and file placement rules.
- `docs/plans/`: task-level executable plans.
- `docs/audits/`: durable audit conclusions, compatibility matrices, data-quality indexes, and closeouts.
- `docs/project-management/`: status, decisions, risks, migration records, and coordination logs.
- `docs/runbooks/`: repeatable operating procedures.
- `docs/research/`: investigations that are not yet accepted as audit conclusions or execution plans.
- `project-plan/`: project-level source of truth, SOP, long-running milestone plans, current overview, and historical project plans.
- `task/`: local process context only. Do not treat it as final source of truth.

## Global No-Go Boundaries

Do not move, edit, or normalize these paths during this plan unless a later plan explicitly changes scope:

- `back/src/**`
- `front/src/**`, except non-runtime Markdown already classified as documentation.
- `front/public/**`
- `data-query-app/{pages,components,server,stores,types,utils,assets,composables,middleware,layouts}/**`
- `back/src/main/resources/**`
- `scripts/data/**` implementation files
- `.github/workflows/**`
- App configs, lockfiles, and build configs: `pom.xml`, `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `nuxt.config.ts`, `tsconfig*.json`, Tailwind/PostCSS configs.
- `data/generated/**`
- `data/standardized/**`
- `data/standardized-view/**`
- `data/terraPedia/**`
- `data/wiki-crawler/**` outputs
- `reports/relation/*.json`
- `project-plan/plan-/**`

Any worker that finds a need to cross a no-go boundary must stop and return a plan repair instead of editing.

## Multi-Agent Ownership

### Agent 0: Coordinator And Guardrails

**Owns:**

- `docs/plans/2026-05-14_responsibility-based-structure-optimization-plan.md`
- Final status, final validation, and conflict resolution.

**Allowed writes:**

- This plan file.
- Follow-up coordination notes under `docs/plans/**` if needed.

**Steps:**

- [ ] Run `git status --short --branch`.
- [ ] Run `git diff --name-status`.
- [ ] Confirm every changed path belongs to the current structure-cleanup scope.
- [ ] Assign workers only disjoint write sets.
- [ ] Block direct moves of runtime, data, scripts, CI, generated evidence, and `project-plan/plan-/**`.
- [ ] After each worker returns, run the relevant validation commands from this plan.
- [ ] Before final handoff, run all final validation gates listed below.

**Validation:**

```bash
git status --short --branch
git diff --name-status
git diff --check
```

### Agent A: Docs And Project-Plan Boundary

**Owns:**

- `docs/README.md`
- `docs/architecture/README.md`
- `docs/project-management/README.md`
- `docs/plans/README.md`
- `docs/audits/README.md`
- `docs/runbooks/README.md`
- `project-plan/INDEX.md`
- `project-plan/active/README.md`
- `project-plan/archive/README.md`

**Allowed writes:**

- README and index files listed above.
- No content moves in the next pass unless the coordinator approves a specific path.

**Steps:**

- [ ] Make directory ownership explicit in all docs and project-plan indexes.
- [ ] Keep `project-plan/` as project-level source of truth, not task execution storage.
- [ ] Keep `docs/plans/` as task-level executable plan storage.
- [ ] Mark `project-plan/plan-/**` as legacy historical cluster with no bulk move.
- [ ] Mark historical archive content as preserved history whose internal old paths are not bulk rewritten.
- [ ] Add breadcrumbs from `docs/README.md` to the moved frontend migration and frontend navigation docs.

**Validation:**

```bash
find docs -maxdepth 3 -type f | sort
find project-plan -maxdepth 2 -type f | sort
rg -n "docs/plans/|docs/audits/|docs/project-management/|project-plan/active|project-plan/archive|project-plan/plan-" docs project-plan README.md
git diff --name-status -- docs project-plan README.md
```

### Agent B: Application Boundary Owner

**Owns:**

- App-root documentation classification for `back/`, `front/`, and `data-query-app/`.
- Optional documentation targets under `docs/architecture/**`, `docs/contracts/**`, or `docs/project-management/**`.

**Allowed writes:**

- App-root Markdown only if it is documentation.
- Docs indexes needed for moved app documentation.
- Candidate move after reference check: `back/API_CRUD_DOC.md` to `docs/contracts/backend-crud-api.md` or `docs/architecture/backend/api-crud.md`.

**No-go writes:**

- No backend Java, resources, SQL, Maven, API, DTO, mapper, service, controller, or test edits.
- No frontend runtime source, public assets, package/config files, routes, stores, API clients, PWA, or tests.
- No admin Nuxt pages, components, server routes, stores, types, utils, assets, middleware, layouts, package/config files, or tests.

**Steps:**

- [ ] Confirm the previous frontend documentation moves are not reverted.
- [ ] Classify `back/API_CRUD_DOC.md` by references and content.
- [ ] If `back/API_CRUD_DOC.md` is moved, update every reference in the same patch.
- [ ] Keep `back/README.md`, `front/README.md`, and `data-query-app/README.md` only as short app-owned onboarding documents.
- [ ] Leave backend SQL and resource files in `back/src/main/resources/**`.
- [ ] Leave app-owned scripts in app roots unless a separate repo-wide script consolidation plan is approved.

**Validation:**

```bash
rg -n "front/migration|README_NAVIGATION|API_CRUD_DOC|back/API_CRUD_DOC|data-query-app/README|back/README|front/README" README.md docs project-plan back front data-query-app
git diff --name-status -- back front data-query-app docs README.md project-plan
```

Run app gates only if app-root documentation references are changed:

```bash
cd back && mvn test
cd front && pnpm run check
cd front && pnpm run test:unit
cd data-query-app && pnpm run check
cd data-query-app && pnpm run test:unit
```

### Agent C: Automation And Script Boundary Owner

**Owns:**

- `scripts/README.md`
- `scripts/data/README.md`
- `scripts/dev/config/README.md`
- Optional new `scripts/ops/README.md`
- Optional new `scripts/lib/README.md`
- Optional new `scripts/tooling/README.md`

**Allowed writes:**

- README and index files only.
- No script relocation in this pass.

**Stable entrypoints to preserve:**

- `scripts/dev/start-local-stack.ps1`
- `scripts/dev/stop-local-stack.ps1`
- `scripts/dev/verify-local-stack.ps1`
- `scripts/dev/smoke-local-stack.ps1`
- `scripts/dev/quality-gate.ps1`
- `scripts/dev/quality-gate-ci.ps1`
- `scripts/data/workflow/run-wiki-sync.mjs`
- `scripts/data/workflow/run-backend-data-refresh.mjs`
- `scripts/data/workflow/run-backend-data-refresh-daemon.mjs`
- `scripts/data/crawler/source-layout-check.mjs`
- `scripts/lib/local-runtime-config.mjs`
- `scripts/ops/*.ps1`

**Steps:**

- [ ] Add or refine README responsibility maps for `scripts/dev/`, `scripts/ops/`, `scripts/tooling/`, `scripts/lib/`, and `scripts/data/`.
- [ ] Mark stable entrypoints as path-sensitive.
- [ ] Document that `.github/workflows/**` should call stable scripts instead of embedding pipeline logic.
- [ ] Document that `scripts/data/workflow/**`, `scripts/data/audit/**`, crawler source/tests, and ops wrappers are not move candidates in this pass.
- [ ] Do not edit command behavior, script defaults, CI workflow YAML, or test lists.

**Validation:**

```bash
rg -n "quality-gate-ci|quality-gate.ps1|run-wiki-sync|run-backend-data-refresh|source-layout-check|local-runtime-config|scripts/data/workflow|scripts/ops" scripts docs README.md .github/workflows
git diff --name-status -- scripts docs README.md .github/workflows
node --test scripts/dev/quality-gate.test.mjs scripts/dev/local-stack.test.mjs
node --test scripts/data/crawler/tests/source-layout-warning.test.mjs
```

### Agent D: Data And Evidence Boundary Owner

**Owns:**

- `docs/architecture/data-evidence-boundaries.md`
- `docs/audits/data-evidence-compatibility-matrix.md`
- `reports/README.md`
- Optional `reports/relation/README.md`
- Existing data/evidence indexes if they need link-only updates.

**Allowed writes:**

- Documentation and README policy only.
- No data moves.
- No `.gitignore` changes unless the coordinator approves a separate tracking-policy patch.

**High-risk artifacts to preserve in place:**

- `data/standardized/*.standardized.json`
- `data/standardized/_manifest.standardized.json`
- `data/standardized-view/**`
- `data/generated/recipe-material-reference.json`
- `data/generated/recipe-group-overrides.json`
- `data/generated/item-group-overrides.json`
- `data/generated/wiki-bosses.latest.json`
- `data/generated/wiki-town-npc-maintenance.latest.json`
- `data/generated/shimmer/**`
- `data/generated/wiki-crawler-npc-bridge/**`
- `data/wiki-crawler/**`
- `data/legacy/**`
- `reports/relation/**`

**Steps:**

- [ ] Create `docs/architecture/data-evidence-boundaries.md` with ownership definitions for `data/**` and `reports/**`.
- [ ] Create `docs/audits/data-evidence-compatibility-matrix.md` with rows for each high-risk artifact family listed above.
- [ ] Create `reports/README.md` explaining tracked evidence versus ignored local runtime reports.
- [ ] Create `reports/relation/README.md` only if relation evidence needs local policy clarification.
- [ ] Mark `data/generated/**` as semantically mixed and compatibility-critical.
- [ ] Mark `data/standardized/**` and `data/standardized-view/**` as active transitional contracts.
- [ ] Mark `reports/canonical/candidates/**` as evidence, not source of truth until promoted to `data/canonical/{domain}`.
- [ ] Do not infer unused status from a single search. Use `needs-followup` when ownership is unknown.

**Required compatibility matrix columns:**

- Path or glob.
- Current role.
- Source-of-truth status.
- Writer.
- Consumers.
- Git policy.
- Move readiness.
- Compatibility requirement.
- Validation command.

**Validation:**

```bash
rg -n "data/generated|data/standardized|data/standardized-view|reports/relation|data/wiki-crawler|data/legacy|reports/canonical/candidates" docs data reports scripts back front data-query-app README.md project-plan
git diff --name-status -- docs data reports README.md project-plan
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs
```

### Agent E: Link Repair And Validation Owner

**Owns:**

- Reference checks across `README.md`, `docs/**`, `project-plan/**`, `back/**`, `front/**`, `data-query-app/**`, `scripts/**`, and `reports/**`.
- Validation summary for the coordinator.

**Allowed writes:**

- Link-only documentation fixes approved by the coordinator.
- No runtime, data, or script implementation edits.

**Steps:**

- [ ] Search for stale references to moved frontend migration docs and `README_NAVIGATION`.
- [ ] Search for stale references to any app documentation moved by Agent B.
- [ ] Search for `reports/relation` and confirm JSON paths were not moved.
- [ ] Search for high-risk data paths and confirm each is represented in the compatibility matrix.
- [ ] Run final whitespace and no-go path checks.
- [ ] Return a validation summary with pass/fail commands and blockers.

**Validation:**

```bash
rg -n "front/migration|README_NAVIGATION|API_CRUD_DOC|back/API_CRUD_DOC|reports/relation|project-plan/plan-" README.md docs project-plan reports back front data-query-app scripts
git diff --check
git diff --name-only HEAD | rg "^(back/src|front/src/.*\.(ts|vue|js|css|scss)|front/public|data-query-app/(pages|components|server|stores|composables|utils|types|assets|middleware|layouts)|scripts/data/.*\.(mjs|js|ts|py|ps1)|\.github/workflows|data/generated|data/standardized|data/standardized-view|data/terraPedia|data/wiki-crawler|reports/relation/.*\.json)" || true
```

## Execution Order

### Phase 0: Stabilize Current Checkpoint

- [x] Coordinator runs `git status --short --branch`.
- [x] Coordinator runs `git diff --name-status`.
- [x] Coordinator runs `git diff --check`.
- [x] Coordinator confirms existing changes are structure-cleanup only, except the local stack config-template deletion risk that was repaired by restoring `scripts/dev/config/local-stack.config.example.json`.
- [x] Coordinator keeps the current dirty structure-cleanup checkpoint uncommitted and treats it as protected pre-existing work.

### Phase 1: Freeze Responsibility Rules

- [x] Agent A updates docs and project-plan indexes.
- [x] Agent C updates scripts README/index policy.
- [x] Agent D creates data/evidence boundary documentation.
- [x] No path moves are allowed in this phase.

### Phase 2: Build Compatibility And Evidence Policy

- [x] Agent D creates the data/evidence compatibility matrix.
- [x] Agent D creates `reports/README.md` and optional `reports/relation/README.md`.
- [x] Agent E verifies every high-risk artifact family has a matrix row.
- [x] No data, report JSON, script, or CI path moves are allowed in this phase.

### Phase 3: App Documentation Boundary

- [x] Agent B audits app-root docs.
- [x] Agent B keeps `back/API_CRUD_DOC.md` in place because references are broad and migration needs a separate contract-doc plan.
- [x] Agent E has no approved app-doc move links to repair in this pass.
- [x] Runtime app paths remain untouched.

### Phase 4: Final Validation And Plan Repair

- [x] Coordinator runs final validation gates.
- [x] If any validation fails because the plan missed a dependency, repair the plan first and re-audit affected boundaries.
- [x] If validation passes, prepare a focused commit or handoff summary.

### Phase 5: Deferred Future Path Moves

- [x] Open separate plans for any real path migration.
- [x] Use one artifact family or one responsibility boundary per PR.
- [x] Use alias-first migration for active data/script contracts.
- [x] Keep old paths until direct consumers are proven migrated.
- [x] Do not bulk-move `project-plan/plan-/**`, `reports/relation/*.json`, `data/generated/**`, `data/standardized/**`, or `scripts/data/workflow/**`.

## Final Validation Gate

Run these before claiming the next structure optimization is complete:

```bash
git status --short --branch
git diff --name-status
git diff --check
rg -n "front/migration|README_NAVIGATION|API_CRUD_DOC|back/API_CRUD_DOC|reports/relation|project-plan/plan-" README.md docs project-plan reports back front data-query-app scripts
git diff --name-only HEAD | rg "^(back/src|front/src/.*\.(ts|vue|js|css|scss)|front/public|data-query-app/(pages|components|server|stores|composables|utils|types|assets|middleware|layouts)|scripts/data/.*\.(mjs|js|ts|py|ps1)|\.github/workflows|data/generated|data/standardized|data/standardized-view|data/terraPedia|data/wiki-crawler|reports/relation/.*\.json)" || true
node --test scripts/data/crawler/tests/source-layout-warning.test.mjs
```

Run these only if the matching surface was touched:

```bash
node --test scripts/dev/quality-gate.test.mjs scripts/dev/local-stack.test.mjs
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs scripts/data/workflow/domain-acceptance-refresh-plan.test.mjs
cd back && mvn test
cd front && pnpm run check
cd front && pnpm run test:unit
cd data-query-app && pnpm run check
cd data-query-app && pnpm run test:unit
```

If PowerShell is available and runtime/script surfaces changed, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/dev/quality-gate.ps1
```

## Acceptance Criteria

- The plan and indexes make it clear where new files belong by responsibility.
- No runtime source, runtime resource, data contract, script implementation, CI workflow, or relation JSON evidence is moved in the next pass.
- `docs/README.md`, docs subdirectory indexes, and `project-plan/INDEX.md` agree on ownership boundaries.
- `reports/` has a policy that distinguishes tracked evidence from ignored local runtime output.
- `data/**` high-risk families have a compatibility matrix row before any future movement.
- Every approved documentation move has updated references or an explicit breadcrumb.
- `git diff --check` passes.
- The no-go path check returns no unexpected runtime/data/script path changes.

## Plan Audit

**Verdict:** Execution-ready for a documentation-first, responsibility-based cleanup pass.

**Goal lock:** The closure target is repository structure clarity by responsibility, not feature behavior or data refresh.

**Boundary lock:** Runtime app code, generated data, active transitional contracts, data workflow scripts, CI, and relation JSON evidence are explicitly out of scope.

**Evidence lock:** Validation includes status, diff, stale-reference search, no-go path checks, crawler source layout test, and optional surface-specific gates.

**Multi-agent safety:** Agents have disjoint write sets. Any overlap must be coordinated by Agent 0 before edits.

**Residual risk:** `data/generated/**` and `data/standardized/**` are still active mixed contracts. They must stay path-stable until compatibility aliases and consumer migrations are planned separately.
