# Current Devlog

Last updated: 2026-07-13 07:06 CST by Codex

## Open Work

- `docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md`
  - owner: Codex
  - status: active
  - branch: `fix/crawler-queue-v2-runtime`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-queue-v2-runtime`
  - parent/child: none
  - dependencies or blocked-by: local stack is running for user acceptance; fixture-stack execution, live cutover, and the first irreversible V2 mutation retain their explicit authorization gates
  - contract handoff: Tasks 1-5 are committed through `af762c2`; idle/queue visibility is committed at `591101e` and `2ecc179`; Task 6 exact worker progress identity is committed at `06c8df2`; Task 7 fenced process supervision is committed at `7df042b`; Task 8 bounded convergence/recovery is committed at `04b684a`; Task 9 durable routing, pure overview, and watcher fencing are committed at `024acdc`; Task 10 HTTP/log/SSE contract is reviewed and ready for a focused checkpoint

## Current State

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
- The focused idle/queue compatibility checkpoint now maps evidence-free
  `unknown` to healthy idle, displays `空闲正常`, adds an exact active-queue KPI
  with queue filtering/navigation, and keeps attention, queue, history, and log
  access visible at the same time. Unknown with unclassified runtime evidence
  remains explicit.
- Fresh acceptance evidence from the running stack: overview HTTP `200`, API
  healthy/unknown counts `9/0`, rendered idle-normal/unknown counts `14/0`, one
  existing paused Boss queue row shown by the queue KPI/filter, and queue/log
  tabs visible. No crawler, database write, or Redis clear was performed.
- Focused validation for this checkpoint passes: backend reducer 21/21, admin
  typecheck, and admin unit tests 251/251.
- Task 3 is implemented with a Redis-only, fail-closed repository boundary,
  fixed V2 namespace, and one atomic enqueue/dedupe Lua mutation. The final
  compatibility selection passed 18/18 tests with no failures or skips.
- Task 4 is implemented with atomic multi-domain claim, monotonic fencing,
  all-or-nothing lease renewal, state-version/progress CAS, terminal ownership
  release, retry creation, reconciler health, and ordered Stream events.
- Fresh Task 4 validation passed 30/30 tests, including three isolated real
  Redis cases under a unique prefix; no shared Redis, crawler, or database was
  touched.
- Task 5 is implemented with one immutable attempt directory/manifest identity,
  explicit available/empty/missing/expired/forbidden log states, UTF-8-safe
  incremental reads, audited terminal-only cleanup, and a synchronized unified
  minimum retention rule of the newest 100 terminal attempts or seven days.
- Fresh Task 5 compatibility validation passed 42/42 tests and final read-only
  review found no remaining Critical, Important, or Moderate finding.
- Task 6 is implemented with complete V2 identity on worker progress,
  monotonic child-observed sequencing, wrapper-owned canonical progress,
  isolated `child-progress.json`, stale-child cleanup, and fail-closed malformed
  or contract-invalid child evidence. Fresh Task 6 validation passed 65/65
  tests, focused syntax checks, and `git diff --check`; final review found no
  remaining Critical, Important, or Moderate finding.
- Task 7 is committed at `7df042b`. It supervises an exact suspended process
  group, persists write-once PID/start identity, admits only monotonic exact
  progress, performs authority-safe pause/resume/cancel, and confirms the whole
  group exits before ownership release. Fresh coordinator validation passes
  126/126 plus `mvn test-compile`, `git diff --check`, and a clean residual
  process scan; final specification and code-quality reviews report no material
  finding.
- Task 8 is committed at `04b684a`. It wires the V2 reconciler and
  recovery service into Spring, makes every non-terminal state converge within
  a deadline, exposes watchdog/store failures instead of reporting false
  health, isolates unconfirmed historical processes in the current epoch, and
  fail-closes reset responses whose reset ID, epoch, or irreversible timestamp
  does not match the submitted command. Fresh focused validation passes
  156/156 with final specification and code-quality approvals.
- Task 9 is committed at `024acdc`: the durable
  router serializes every V1/V2 mutation with maintenance/reset marker writes,
  V2 overview reads have no live-queue side effects, old/legacy evidence stays
  history-only, and asynchronous exit watchers independently acquire the same
  permit before touching terminal evidence. The fresh focused backend gate
  passes 329/329 plus `mvn test-compile` and `git diff --check`.
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

- Commit the reviewed Task 9 checkpoint, then continue Task 10 of the committed
  V2 hard-cutover plan: structured 409/503 errors, attempt-keyed logs, and
  authenticated SSE. Preserve Task 8 maintenance/recovery and Task 9 durable
  mutation-permit boundaries.
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

- The local stack is running for acceptance, but the existing paused Boss queue
  item is visibility evidence only; no crawler was started and no V2 runtime
  convergence behavior has been exercised.
- Current queue history and log retention are misaligned: queue history keeps
  substantially more attempts than the crawler-monitor log pruner, so a stored
  V1 logPath is not evidence that a readable log still exists. Task 5 defines
  the V2 replacement, but it is not yet wired into the supervisor or API.
- The approved default deadlines pass fake-clock state-machine validation but
  still require repository/reconciler integration and isolated runtime evidence
  before they can be treated as proven operational behavior.
- The durable reservation/router permit/maintenance mutation gate now has
  focused offline evidence, but the isolated Redis reset-Lua integration suite
  and the later fixture acceptance matrix remain required before readiness or
  live-cutover claims.
- Task 9 routes the V2 application source after a durable cutover marker, but
  no cutover marker or first irreversible V2 mutation has been created; the
  currently running local environment remains on its existing V1 live path.
- Task 8 includes isolated Redis/Lua reset integration coverage, but it remains
  unexecuted because no explicitly authorized `TERRAPEDIA_TEST_REDIS_*`
  namespace is configured; do not treat the offline unit checks as a live Redis
  reset proof.
- Historical documents still mention the old `project-plan/` path as archival context by design.
- Historical devlog entries still mention removed root paths by design; those records are provenance, not live authority.
- Current risk themes are document-level judgments until fresh runtime/backend/frontend/data gates and crawler reliability checks are run.
- Code style is not currently enforced by Prettier, ESLint, or Spotless; Stage 1
  must not claim those gates are active.
- Formatter/linter enforcement remains intentionally deferred to separate
  baseline migrations.
- Existing frontend build emits non-failing environment DBus, sourcemap, and preview-asset warnings; they are unrelated to Task 1 and remain outside this scope.

## Recently Closed

- `docs/devlog/entries/2026-07-11-crawler-monitor-queue-state-root-cause.md`
  - branch: `fix/crawler-monitor-queue-state`
  - worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-monitor-queue-state`
  - status: `closed`
  - commit: `7f8906c`

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
