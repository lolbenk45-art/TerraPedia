# TerraPedia Project Structure Cleanup Multi-Agent Plan

Date: 2026-05-14

Branch: `chore/project-structure-cleanup-2026-05-14`

Status: low-risk phases executed; high-risk data/script/report phases deferred

## Goal

Reduce project-structure noise without changing task/business code.

Closure means:

- Root and app directories no longer contain obvious planning, migration, or local-system debris that belongs elsewhere.
- `project-plan/`, `docs/`, `reports/`, `data/`, and `scripts/` have explicit cleanup boundaries.
- Any moved documentation keeps working links or leaves compatibility/index breadcrumbs.
- No runtime code, import pipeline, API behavior, UI behavior, database schema, or generated evidence contract changes without a separate approved plan.

## Source Of Truth

Existing structure rules remain authoritative:

- `README.md`
- `docs/architecture/file-placement-rules.md`
- `docs/architecture/project-structure-redesign-2026-04-27.md`
- `docs/README.md`
- `project-plan/INDEX.md`
- `project-plan/active/README.md`
- `project-plan/archive/README.md`

This plan does not replace those files. It defines a safe execution order for cleanup work.

## Scope

In scope:

- Documentation classification and relocation.
- Local trash cleanup or ignore hardening.
- Index, README, and link updates needed by documentation moves.
- Ignore-rule updates for common local cache and coverage artifacts.
- Read-only audits for high-risk data/script/app paths before any move.

Out of scope:

- Moving `back/src`, `front/src`, `data-query-app` app folders, `scripts/data/workflow`, `scripts/data/audit`, `scripts/data/relation`, or CI workflow command paths.
- Moving tracked generated data under `data/generated`, `data/standardized`, `data/standardized-view`, or `data/terraPedia/raw/wiki`.
- Changing import defaults, database targets, data refresh behavior, API contracts, UI routes, or quality-gate semantics.
- Deleting any tracked historical evidence before it is classified and indexed.

## Multi-Agent Findings

### Documentation And Planning

- `project-plan/` root is noisy and already marked for classification by `project-plan/INDEX.md`.
- `project-plan/plan-/` has historical duplicate filenames but should not be batch-moved without a dedicated review.
- `reports/relation/` mixes long-lived reports and generated JSON evidence; Markdown conclusions may belong in `docs/audits/`, JSON evidence needs separate handling.
- Current priority references in `project-plan/INDEX.md` must not move without index and link updates.

### Data And Automation

- `scripts/dev/*`, `scripts/data/workflow/*`, `scripts/data/audit/*`, `scripts/data/relation/*`, and `.github/workflows/*` are stable execution contracts.
- Generated-looking tracked data is path-dependent. Do not bulk move or delete it during structure cleanup.
- `data/wiki-crawler/` should remain artifact/data owned, while crawler source belongs under `scripts/data/crawler/`.
- The untracked `scripts/dev/config/local-stack.config.example - 副本.json:Zone.Identifier` is local trash and can be removed or ignored after confirmation.

### Application Boundaries

- `front/migration/**` is documentation/process material inside the public frontend app boundary.
- `front/src/components/README_NAVIGATION.md` is a low-risk documentation relocation candidate.
- `back/API_CRUD_DOC.md`, `back/README.md`, and `data-query-app/README.md` are app-root docs; moving them requires link updates.
- SQL files under `back/src/main/resources` need dependency checks before relocation because they may be classpath/runtime resources.

## Execution Plan

## Execution Record

Completed on this branch:

- Phase 0: baseline and guardrails.
- Phase 1 partial: archived completed `project-plan/` root history into `project-plan/archive/2026-03/`, `project-plan/archive/2026-04/`, and `project-plan/archive/v1/`; kept current reference docs and the active relation issue log in root.
- Phase 2 partial: moved frontend migration records from `front/migration/` to `docs/project-management/frontend-migration/`; moved navigation component documentation from `front/src/components/README_NAVIGATION.md` to `docs/architecture/frontend/navigation-components.md`; moved the migration-log helper from `front/scripts/` to `docs/project-management/frontend-migration/tools/`.
- Phase 4 partial: ignored Windows `*:Zone.Identifier` files and common frontend/admin coverage/cache outputs.

Deferred:

- Phase 3 reports/evidence policy. `reports/relation/` was left unchanged.
- Phase 5 data/script structure strategy. No tracked generated data, data pipeline, workflow, audit, relation, or CI paths were moved.
- Backend SQL/resource relocation. These files may be runtime classpath resources and require a separate dependency check.

### Phase 0: Baseline And Guardrails

Owner: main coordinator.

Allowed writes:

- `docs/plans/2026-05-14_project-structure-cleanup-multi-agent-plan.md`
- Optional local-only cleanup of untracked trash if explicitly approved.

Actions:

- Confirm branch is `chore/project-structure-cleanup-2026-05-14`.
- Capture `git status --short --branch`.
- Keep the existing untracked `Zone.Identifier` file out of commits.
- Do not run broad move/delete commands.

Validation:

```bash
git status --short --branch
git diff --name-status
```

### Phase 1: Documentation Classification

Owner: Agent A.

Allowed write set:

- `project-plan/INDEX.md`
- `project-plan/active/**`
- `project-plan/archive/**`
- `docs/audits/structure/**`

Actions:

- Classify root `project-plan/TerraPedia_M*.md` files as active or archive candidates.
- Move only clearly completed dated milestone records into `project-plan/archive/`.
- Keep current priority references in `project-plan/` root unless `INDEX.md` is updated first.
- Do not bulk move `project-plan/plan-/`.
- Add a dated cleanup note under `docs/audits/structure/` if classification decisions need explanation.

Validation:

```bash
rg -n "project-plan/TerraPedia_|project-plan/00_|project-plan/03_|project-plan/04_|project-plan/10_" README.md docs project-plan
git diff --name-status -- project-plan docs/audits/structure
```

### Phase 2: App-Boundary Documentation Cleanup

Owner: Agent B.

Allowed write set:

- `front/migration/**`
- `front/src/components/README_NAVIGATION.md`
- `docs/architecture/**`
- `docs/runbooks/**`
- `docs/project-management/**`
- link references that point to moved docs

Actions:

- Move `front/migration/**` only if references are updated and target ownership is clear.
- Move `front/src/components/README_NAVIGATION.md` to a docs location if it is still useful.
- Leave `front/src` source code, `front/public`, and app configs unchanged.
- Do not move backend SQL resources in this phase.

Validation:

```bash
rg -n "front/migration|README_NAVIGATION|API_CRUD_DOC|phase1_schema_draft|create_categories|schema.sql" README.md docs project-plan back front data-query-app
git diff --name-status -- front docs project-plan
```

### Phase 3: Reports And Evidence Policy

Owner: Agent C.

Allowed write set:

- `docs/audits/**`
- `reports/README.md` if created
- `reports/relation/**` index or README files only
- `docs/audits/data-quality-index.md`

Actions:

- Do not move relation JSON evidence by default.
- Decide whether `reports/relation/*.md` are durable conclusions or generated outputs.
- If durable, move Markdown summaries to `docs/audits/relation/` and update `docs/audits/data-quality-index.md`.
- If generated, leave them under `reports/relation/` and add a README explaining retention.

Validation:

```bash
rg -n "reports/relation|docs/audits/relation|data-quality-index" README.md docs reports project-plan
git diff --name-status -- docs/audits reports
```

### Phase 4: Ignore And Local Artifact Hardening

Owner: Agent D.

Allowed write set:

- `.gitignore`
- `.git/info/exclude` for local-only ignores if not intended for the repo
- documentation references to local artifacts

Actions:

- Add ignore coverage for local cache and coverage outputs if missing:
  - `front/coverage/`
  - `data-query-app/coverage/`
  - `front/.vite/`
  - `data-query-app/.vite/`
  - `front/.turbo/`
  - `data-query-app/.turbo/`
  - `*:Zone.Identifier`
- Prefer `.git/info/exclude` for one-machine-only files.
- Do not ignore tracked evidence accidentally.

Validation:

```bash
git check-ignore -v 'scripts/dev/config/local-stack.config.example - 副本.json:Zone.Identifier' || true
git check-ignore -v front/coverage/example data-query-app/coverage/example front/.vite/example data-query-app/.vite/example || true
git status --short --ignored
```

### Phase 5: Data And Script Structure Strategy

Owner: Agent E.

Allowed write set:

- `docs/architecture/**`
- `docs/audits/structure/**`
- `data/README.md`
- `scripts/data/README.md`

Actions:

- Produce a compatibility matrix before any data move.
- Mark tracked generated data that must remain path-stable.
- Document which paths are canonical, legacy, generated, raw, or runtime evidence.
- Do not move `scripts/data/workflow`, `scripts/data/audit`, `scripts/data/relation`, or CI workflow commands.
- Do not change hard-coded import defaults in this structure branch unless a separate bug-fix plan is approved.

Validation:

```bash
node --test scripts/data/crawler/tests/source-layout-warning.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/dev/quality-gate-ci.ps1
```

If PowerShell is unavailable in the execution environment, record that limitation and run the Node tests that are available.

## Multi-Agent Safety Rules

- Each agent owns a disjoint write set.
- No agent moves code or data owned by another phase.
- If a move requires changing tests, runtime scripts, CI, or import behavior, stop and repair this plan before continuing.
- If a file has both documentation and runtime use, keep it in place and document the ambiguity instead of moving it.
- The coordinator performs final link checks, status checks, and staged-diff review.

## Final Validation

Run after all accepted phases:

```bash
git status --short --branch
git diff --name-status main...HEAD
rg -n "project-plan/|docs/|reports/|front/migration|README_NAVIGATION" README.md docs project-plan front back data-query-app reports
```

Optional full gate if the branch touches CI, scripts, app configs, or resources:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/dev/quality-gate-ci.ps1
```

Expected final state:

- Only documentation, ignore, README, index, or audit files changed.
- No application source, import pipeline, database migration, CI command path, or tracked generated data moved without a repaired plan.
- `git diff --name-status` shows deliberate moves, not broad churn.

## Commit And Merge Readiness

Before commit:

```bash
git status --short --branch
git diff --check
git diff --name-status
```

Commit scope:

- One commit for the plan document.
- Separate commits per cleanup phase if execution proceeds.

Merge decision:

- Keep this branch open until at least Phase 1 and Phase 4 are complete or explicitly deferred.
- Do not merge any phase that changes runtime paths unless the relevant focused tests pass.

## Residual Risks

- Many historical docs use old absolute Windows paths. Fixing all of them may create high documentation churn; prefer targeted cleanup.
- Tracked generated data has real script dependencies. Path cleanup there must be a separate compatibility project.
- Some app-root docs are useful near code. Moving them may reduce discoverability unless README/index breadcrumbs are added.
- Current Codex session may not reflect newly pulled project skills until the session is restarted.
