# Current Devlog

Last updated: 2026-07-12 18:48 CST by Codex

## Open Work

- `docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md`
  - owner: Codex
  - status: active
  - branch: `fix/crawler-queue-v2-runtime`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-queue-v2-runtime`
  - parent/child: none
  - dependencies or blocked-by: live stack is stopped; fixture-stack execution, live cutover, and the first irreversible V2 mutation retain their explicit authorization gates
  - contract handoff: Tasks 1-2 are committed at `723f2d0` and `755713f`; continue with Task 3 V2 namespace and atomic enqueue/dedupe repository

## Current State

- Page-head density implementation is closed for commit on
  `review/page-head-inner-density`: the user-selected C desktop treatment,
  mobile item/NPC command headers, contracts, browser acceptance, and public
  frontend gate are recorded. Commit SHA is pending in the final response.

- Crawler monitor queue/status root-cause analysis and the first two V2
  foundation tasks are complete; runtime implementation continues on the
  isolated follow-up branch `fix/crawler-queue-v2-runtime`.
- The offline root-cause verdict is complete: the implementation still has
  multiple writable queue/runtime/status sources without a shared generation
  or fencing token, and the planned Redis domain lease was never implemented.
- The user confirmed all four visible failures recur, so cancellation,
  restart recovery, queue advancement, and cross-panel consistency form one
  acceptance contract.
- The required operator contract is continuous state visibility, explicit
  health/ownership errors, and bounded automatic convergence for every
  non-terminal state.
- The primary acceptance case is now legacy/current queue conflict: legacy
  records must remain available as history but must never block, dedupe, own, or
  determine progress for the live queue.
- The user reviewed and approved the written V2 hard-cutover design at
  `docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md`
  and implementation planning is now active.
- The design gives each attempt queueId, attemptId, fenceToken, stateVersion,
  and stateStoreEpoch; makes overview pure read; assigns convergence to a
  background reconciler; and requires a deadline for every non-terminal state.
- The implementation plan is complete with 15 RED -> GREEN tasks spanning the
  V2 model, Redis/Lua fencing, exact process ownership, bounded reconciliation,
  pure overview, authenticated SSE, attempt logs, hard cutover, isolated smoke,
  readiness audit, and live cutover gates.
- Task 1 is implemented: all 12 approved V1 actions now come from one immutable
  registry shared with the future V2 path; commands, progress paths, resume
  settings, dispatch behavior, and control behavior remain unchanged.
- Task 1 validation passed 184/184 focused backend tests. One full-suite run
  hit a temporary-directory cleanup race after all assertions passed; the exact
  case and the complete suite both passed on fresh reruns.
- Task 2 is implemented: the V2 contract now defines 13 lifecycle states, 24
  structured reason codes, immutable queue/attempt/event records, configuration
  defaults, the approved transition matrix, allowed actions, and a deadline for
  every non-terminal state. No V2 repository or runtime mutation is active yet.
- Task 2 and the existing crawler-monitor compatibility selection pass 188/188
  focused backend tests after an exact 1/1 rerun closed a pre-existing atomic
  temporary-file traversal race. The broad backend suite still has unrelated
  failures that reproduce on `main`; they are not being folded into this task.
- Plan audit closed two additional fail-closed gaps: the first real V2 mutation
  now uses a durable reservation before Redis plus exact confirmation after it,
  and missing/conflicting Redis epochs require an explicit idempotent reset that
  creates an empty new epoch instead of restoring manifests as live work.
- Old-epoch dedupe, lease, and quarantine evidence is identity-scoped and cannot
  block a new epoch; durable maintenance also gates reconciler and startup
  recovery writes even if Redis still reports V2.
- Plan self-review passes: 15 tasks, 298 balanced plan fences, 24 balanced design
  fences, 4 parsed design JSON examples, 16 design coverage rows, 7 concrete
  combined acceptance test bodies, exact path declarations, constructor arity,
  placeholder/obsolete-name scans, and `git diff --check`.
- Written-spec self-review passed placeholder, JSON example, code-fence,
  reference, structured devlog, pending-SHA, and diff checks. No business code
  or runtime state changed.
- Queue logs are part of the same acceptance contract. Current history merging
  collapses attempts by domain/action, log availability is not returned with
  queue rows, and retained log files do not consistently carry queue identity.
- Historical evidence confirms the mismatch: 154 queue rows reference a log,
  only 21 files remain, 6 are empty, and none of the 15 non-empty files contain
  their queueId. The domain detail history can therefore select an older run's
  status/log while a newer attempt exists.
- Current focused backend and admin tests pass, so the investigation is tracing
  uncovered cross-source and restart behavior rather than reacting to a failing
  unit test.
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
- The standardized user-auth functional-testing baseline is committed and
  locally merged into `main`; this branch now includes its isolated E2E
  profile, Playwright contract, private artifact handling, and quality-gate
  wiring without sharing an active worktree.
- Fresh post-merge validation passed: backend focused tests 42/42, frontend
  full check/build and unit tests 11/11, runner/gate isolation tests 53/53,
  script syntax checks, and `git diff --check`.
- Real E2E execution remains pending dedicated MySQL credentials, free loopback runner ports, and explicit Chromium executable environment; neither ordinary local data nor real email may be used as a substitute.

## Next Agent Should Start Here

- Continue inline from Task 3 of the committed V2 hard-cutover plan using
  test-first implementation and the plan's task-level validation checkpoints.
- On implementation start, follow the plan task by task and preserve its
  authorization gates: fixture-stack execution, live cutover, and first
  irreversible V2 mutation each require their stated confirmation.
- Keep crawler execution, data writes, Redis clearing, and service lifecycle
  changes out of the analysis phase.
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

- The local stack is stopped and the latest retained crawler runtime evidence is
  dated 2026-07-08, so live behavior is not yet freshly reproduced.
- Current queue history and log retention are misaligned: queue history keeps
  substantially more attempts than the crawler-monitor log pruner, so a stored
  logPath is not evidence that a readable log still exists.
- The approved default deadlines pass fake-clock state-machine validation but
  still require repository/reconciler integration and isolated runtime evidence
  before they can be treated as proven operational behavior.
- The reservation, durable router lock, explicit epoch reset, old-epoch
  isolation, and maintenance mutation gate are plan contracts only until their
  focused and isolated-prefix tests pass during implementation.
- Historical documents still mention the old `project-plan/` path as archival context by design.
- Historical devlog entries still mention removed root paths by design; those records are provenance, not live authority.
- Current risk themes are document-level judgments until fresh runtime/backend/frontend/data gates and crawler reliability checks are run.
- Code style is not currently enforced by Prettier, ESLint, or Spotless; Stage 1
  must not claim those gates are active.
- Formatter/linter enforcement remains intentionally deferred to separate
  baseline migrations.
- Existing frontend build emits non-failing environment DBus, sourcemap, and preview-asset warnings; they are unrelated to Task 1 and remain outside this scope.

## Recently Closed

- `docs/devlog/entries/2026-07-12-page-head-density.md`
  - branch: `review/page-head-inner-density`
  - status: `closed`
  - commit: pending in final response

- `docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md`
  - branch: `fix/crawler-monitor-queue-state`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-monitor-queue-state`
  - status: `closed`
  - commit: branch closeout commit pending in final response

- `docs/devlog/entries/2026-07-11-playwright-baseline.md`
  - branch: `test/playwright-baseline`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/playwright-baseline`
  - status: `closed`
  - commit: `1257d76`

- `docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md`
  - branch: `docs/remove-stale-governance`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/remove-stale-governance`
  - status: `closed`
  - commit: `99cd26d`
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
