# Current Devlog

Last updated: 2026-07-10 18:30 CST by main agent

## Active Branch

- `docs/remove-stale-governance`

## Active Focus

- Remove eight stale root governance documents while preserving current
  authority routing and historical audit evidence.

## Open Work

- `docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md`
  - owner: main agent
  - status: `active`
  - branch: `docs/remove-stale-governance`
  - worktree:
    `/home/lolben/.config/superpowers/worktrees/TerraPedia/remove-stale-governance`
  - parent/child: parent task; no child entries
  - dependencies or blocked-by: written-spec approval before implementation
  - contract handoff: not applicable; documentation-governance-only task

## Current State

- Project documentation governance naming has been normalized and committed locally.
- Current project status, risk register, decision log, project control, and spec impact rules have been synchronized for commit.
- Old root governance documents now carry status banners and current-authority routing.
- Current governance companion docs now cover maintained tech stack, code style,
  architecture, API contracts, and validation/release boundaries.
- Current code-style governance now includes a human-readable authority, root
  EditorConfig baseline, focused consistency test, and synchronized routing.
- Stage 1 validation passed: focused test 3/3, routing scan, diff check, exact
  14-path scope, and Agent C cross-review.
- Current API contract documentation is available as a companion governance
  doc with concrete response and test evidence formats.
- API contract integration review approved the nine-file merge scope and the
  three current-state conflict resolutions with no remaining findings.
- No app runtime feature code or data changed.

## Next Agent Should Start Here

- Continue from
  `docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md`; do not
  delete files until the written design is approved and an implementation plan
  is audited.
- Preserve stale/historical governance document bodies unless a current routing/source-of-truth reference needs repair.
- Keep latest project state in `00_CURRENT_SPEC.md`, `PROJECT_CONTROL.md`, project-management records, and devlog rather than old root planning bodies.
- Keep `CURRENT_TECH_STACK.md`, `CURRENT_CODE_STYLE.md`,
  `CURRENT_ARCHITECTURE.md`, `CURRENT_API_CONTRACTS.md`, and
  `CURRENT_VALIDATION_AND_RELEASE.md` aligned with package scripts, runtime
  config, API route/response/auth changes, data chain, and gate behavior changes.
- Use `CURRENT_CODE_STYLE.md` and root `.editorconfig` for new or modified code.
- Introduce formatter and semantic-linter baselines in separate frontend/backend
  tasks before adding read-only checks to the full gate.
- For future API work, start from `docs/project-governance/current/CURRENT_API_CONTRACTS.md` and update the matching devlog entry for that task.
- For future API tests, record compact returned-data evidence in devlog and put full machine-readable payloads under `reports/api-smoke/` when useful.

## Current Risks

- Historical documents still mention the old `project-plan/` path as archival context by design.
- Root governance files `03`, `04`, and `07-12` contain old planning-era assumptions and should not be used as current execution authority without revalidation.
- Current risk themes are document-level judgments until fresh runtime/backend/frontend/data gates and crawler reliability checks are run.
- Code style is not currently enforced by Prettier, ESLint, or Spotless; Stage 1
  must not claim those gates are active.
- Formatter/linter enforcement remains intentionally deferred to separate
  baseline migrations.

## Recently Closed

- `docs/devlog/entries/2026-07-10-code-style-governance.md`
  - branch: `docs/current-code-style`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/current-code-style`
  - status: `closed`
  - commit: `2912dc0`
- `docs/devlog/entries/2026-07-09-api-response-test-format.md`
  - branch: `docs/current-api-contracts`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `7e88521`
- `docs/devlog/entries/2026-07-09-current-api-contracts.md`
  - branch: `docs/current-api-contracts`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `e85be2a`
- `docs/devlog/entries/2026-07-09-current-governance-specs.md`
  - branch: `docs/current-governance-specs`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `b0d4e4e`
- `docs/devlog/entries/2026-07-09-old-governance-doc-refresh.md`
  - branch: `docs/old-governance-doc-refresh`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `0cea2d6`
- `docs/devlog/entries/2026-07-09-project-status-risk-sync.md`
  - branch: `docs/project-status-risk-sync`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `389b205`
- `docs/devlog/entries/2026-07-09-project-governance-rename.md`
  - branch: `main`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `40dc59b`
- `docs/devlog/entries/2026-07-09-governance-progress-control.md`
  - branch: `main`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `0e3155c`
- `docs/devlog/entries/2026-07-08-devlog-traceability.md`
  - branch: `feat/devlog-traceability`
  - worktree: `/home/lolben/TerraPedia`
  - status: `closed`
  - commit: `3c642b2`
