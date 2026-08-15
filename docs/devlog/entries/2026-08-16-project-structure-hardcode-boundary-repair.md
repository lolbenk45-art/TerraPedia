# Devlog: project-structure-hardcode-boundary-repair

## Status

`closed`

## Context

- User goal: review the structure/path-constants plan for missed hard-coded script paths and boundary/escape problems, then repair the confirmed production issues.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Base: current branch `c8586c24`; unrelated user-generated Shimmer data/report changes are present and must remain untouched.
- Related docs: `docs/superpowers/plans/2026-08-16-project-structure-professionalization.md`, `docs/superpowers/plans/2026-08-16-project-structure-professionalization-en-US.md`
- Related prior entries: `docs/devlog/current.md`

## Direction / Decisions

- Chosen approach: audit first, then apply narrow test-first fixes for shared path resolution and high-risk absolute/output paths; do not bulk-rewrite all `process.cwd()` usages or perform physical directory moves in this task.
- Reasoning: the repository has many deliberate fixture-local working directories and compatibility paths; production path consumers must be separated from tests before migration.
- Rejected options: mass replacement of every `process.cwd()` call; moving `front-nuxt`, `data-query-app`, or `back` before path contracts pass; recreating or relocating the retired untracked `front/`; changing crawler/database runtime state during the audit.

## Scope

- Frontend: runtime API-origin defaults only when they duplicate project-local defaults; no UI changes.
- Backend: repository/external media path defaults only; no API/schema/database changes.
- Data: no database writes or generated-data regeneration; path-only compatibility changes.
- Docs/process: update plan and record hard-code inventory findings.
- Out of scope: real crawler force/apply, Redis reset, physical directory migration, deletion of historical data/reports.

## Validation

- Commands run: read-only hard-code scans; focused Node suites for project constants, root containment, parser defaults, crawler outputs, source audits, audio metadata, image evidence, wiki sync, armor image indexing, backend refresh paths; frontend/admin config checks; focused Maven audio service test; frontend typecheck.
- Results: the expanded path/source suite passed 128/128, the root/crawler/config suite passed 32/32, the production path-literal guard passed, and the original constants/parser suite passed 52/52; `AdminAudioAssetStreamServiceTest` 9/9 passed; admin typecheck passed; frontend runtime/config checks and typecheck passed. The production path-literal guard reports no developer-specific absolute roots in executable data/tooling scripts. Full public frontend check reached the Chromium-dependent editor runtime check, which failed because the local snap Chromium profile update timed out.
- Task 1 documentation validation: `git diff --check` passed; the fresh handoff Node command passed `51/51`; required structure documents and links exist; all target directories remain absent; the `rg`-backed path sweep reproduced the recorded inventory counts.
- Not run: crawler execution, database writes, full quality gate; no real crawler apply/force action was invoked.

## Result

- Completed: added the project constants source/resolver and containment tests; repaired item-page parser defaults, wiki-sync relative path resolution and child executable selection, armor MinIO default, backend refresh path defaults, public/admin runtime port defaults, and backend audio default portability; added bilingual constants docs and a hard-code inventory.
- Completed in this follow-up: physically deleted the untracked retired `front/` directory, removed its constants entry and dependency fallback, and updated current project maps and the bilingual structure plan.
- Completed in this checkpoint: produced the Task 1 top-level structure inventory and `docs/architecture/project-structure-v2.md`; recorded hidden tool directories, CI, build/runtime caches, compatibility evidence roots, no-delete/no-write boundaries, target-tree naming, and pre-move reference counts. Updated the architecture/audit indexes and root README links. No application, data, or runtime path was moved or written.
- Not completed: the remaining production `process.cwd()` census has not been fully migrated; explicit external path policy remains permissive for legacy/test callers and needs a separate compatibility tightening pass. Display-only redaction strings in the closure HTML renderer remain intentionally host-shaped.

## Residual Risks

- The current worktree contains unrelated generated Shimmer data/report changes; all implementation edits avoided those paths.
- Some `process.cwd()` uses are intentional test fixture setup and must not be classified as production violations.
- Frontend full-gate residual: Chromium snap timeout in `check-user-article-editor-runtime.mjs`; rerun when the local browser runtime is healthy.

## Follow-up

- Continue with a separate allowlist-driven migration of remaining production fetch/audit/backfill/relation `process.cwd()` paths; keep database writes and real crawler operations out of this repair chain.
- Review the Task 1 inventory and v2 baseline, then create a dedicated migration worktree before moving `front-nuxt/`, `data-query-app/`, or `back/`; do not start physical migration in this mixed primary worktree.

## Session Handoff (2026-08-16)

### Observed

- Repository/worktree: `/home/lolben/TerraPedia`.
- Branch: `feat/supplementary-domains-readiness`; `HEAD` is `c8586c24` and the branch matches `origin/feat/supplementary-domains-readiness` (no ahead/behind delta observed).
- The worktree has 60 tracked changed paths and 37 untracked paths. No paths are staged. The untracked set includes user-owned Shimmer generations, authorization evidence, and structure-repair docs/tests; do not clean or reset them.
- The old untracked `front/` directory is absent. `front-nuxt/`, `data-query-app/`, and `back/` remain at their current paths.

### Recorded

- The machine constants source is `scripts/config/project.constants.json`; the executable resolver is `scripts/lib/project-constants.mjs`.
- The executable plan is `docs/superpowers/plans/2026-08-16-project-structure-professionalization.md` with the synchronized English plan at `docs/superpowers/plans/2026-08-16-project-structure-professionalization-en-US.md`.
- The Task 1 checkpoint is complete in this worktree. The next safe action is a reviewable focused checkpoint followed by a dedicated migration worktree; physical app moves remain prohibited here.

### Unknown / not run

- No physical application migration has been committed; no target `apps/`, `services/`, `packages/`, `pipelines/`, `platform/`, or `artifacts/` directory exists.
- Full quality gate, crawler apply, database writes, Redis reset, and real directory migration were not run.

### Handoff command set

```bash
git status --short --branch -uall
git diff --check
node --test scripts/lib/project-constants.test.mjs scripts/lib/project-constants-usage.test.mjs scripts/dev/local-stack.test.mjs scripts/data/sync/sync-standardized-entities-to-db.test.mjs
```

The focused command set passed `51/51` immediately before this handoff update. See git for code-level diff details.

## Commits

- Superseded by the dedicated physical migration entry
  `docs/devlog/entries/2026-08-16-project-structure-professionalization.md`.
- The original repair checkpoint remains uncommitted on its source branch;
  canonical migration changes are staged only in the dedicated worktree.
