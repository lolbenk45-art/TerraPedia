# Current Devlog

Last updated: 2026-07-12 06:40 CST by Codex

## Open Work

- none

## Current State

- Project documentation governance naming has been normalized and committed locally.
- Current project status, risk register, decision log, project control, and spec impact rules have been synchronized for commit.
- Stale root governance files `03`, `04`, and `07-12` were removed from the current tree; maintained companion docs remain the implementation authority.
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
- The preceding governance stage had no app runtime feature or data changes; this active task adds only the isolated test, E2E-profile, and quality-gate paths described below.
- Playwright baseline dependency and the supplied Chromium cache are installed; scope now expands to standardized functional-test workflow and user-auth reference coverage.
- The standardized testing design and executable plan are present. Independent stack/auth/frontend reviews found that ordinary local data and normal email must never be used for E2E; the repaired plan-safety review is approved and serialized implementation has started.
- Tasks 1–3 are implemented and statically validated. Task 3 provides a fail-closed, fake-command-verified E2E runner with literal loopback, child-process allowlists, owned-resource cleanup, private artifacts, and a future smoke-step gate contract. A host-PID collision in the fake `ps` fixture was repaired by moving synthetic listener PIDs above the Linux PID limit; 34 runner tests and the combined 49 runner/gate tests now pass.
- Task 4 implementation and static validation are complete: three smoke and six regression Playwright cases cover envelopes, cookie metadata, browser navigation, input boundaries, duplicate/wrong/malformed-code handling, and both missing/invalid refresh paths. Its real browser acceptance remains pending the isolated E2E prerequisites.
- Task 5 implementation and static validation are complete: both Bash quality gates invoke the isolated smoke after the public frontend package test, and CI provisions only its own MySQL, Redis, clients, and Chromium with explicit runner variables. Actual gate/CI runtime acceptance remains pending.
- Whole-change review exposed an E2E backend startup defect: `AdminAuthProperties` requires a password but the E2E profile supplied none. A red/green startup-binding test and E2E-only non-production `TERRAPEDIA_E2E_ADMIN_PASSWORD` default repair it without inheriting ordinary local credentials; focused backend validation is now 42 tests.
- Artifact-retention review found that direct Playwright invocation could create
  group-readable durable reports and that the runner could follow an unsafe
  report path. The repaired configuration now accepts only a private,
  canonical runner artifact directory (or one exact private static-check
  directory); the runner validates/safely prepares the durable report tree
  before any data client. Fresh runner/gate and artifact-guard tests pass
  53/53 and 7/7 respectively.
- Real E2E execution remains pending dedicated MySQL credentials, free loopback runner ports, and explicit Chromium executable environment; neither ordinary local data nor real email may be used as a substitute.

## Next Agent Should Start Here

- Do not recreate removed root governance files `03`, `04`, or `07-12`; use Git history only for audit or rollback and add freshly validated current guidance when needed.
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
- Run real browser/CI acceptance only when the dedicated isolated prerequisites are available. Do not start the real runner with ordinary local data, ordinary credentials, or real email.
- For new features, reuse the user-auth structure: feature contract, frontend unit boundaries, backend API contract tests, isolated browser smoke, regression matrix, and gate evidence.

## Current Risks

- Historical documents still mention the old `project-plan/` path as archival context by design.
- Historical devlog entries still mention removed root paths by design; those records are provenance, not live authority.
- Current risk themes are document-level judgments until fresh runtime/backend/frontend/data gates and crawler reliability checks are run.
- Code style is not currently enforced by Prettier, ESLint, or Spotless; Stage 1
  must not claim those gates are active.
- Formatter/linter enforcement remains intentionally deferred to separate
  baseline migrations.
- Existing frontend build emits non-failing environment DBus, sourcemap, and preview-asset warnings; they are unrelated to Task 1 and remain outside this scope.

## Recently Closed

- `docs/devlog/entries/2026-07-11-playwright-baseline.md`
  - branch: `test/playwright-baseline`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/playwright-baseline`
  - status: `closed`
  - commit: commit SHA pending in final response

- `docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md`
  - branch: `docs/remove-stale-governance`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/remove-stale-governance`
  - status: `closed`
  - commit: commit SHA pending in final response
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
