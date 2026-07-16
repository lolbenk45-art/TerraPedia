# Devlog: Crawler Monitor Registered Idle Domains

## Status

`closed`

## Context

- User goal: Restore the twelve registered crawler domains in the V2 monitor
  overview when they have no live attempt.
- Branch: `fix/crawler-queue-v2-runtime`
- Worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-queue-v2-runtime`
- Related prior entry:
  `docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md`.

## Direction / Decisions

- The action registry is the fixed production domain baseline.
- A same-epoch live V2 attempt overrides its covered domain's idle projection.
- An idle projected domain has no attempt identity or runtime reason. A healthy
  V2 state store exposes only the dedicated `start` action; maintenance keeps
  the same rows visible without mutation actions.
- Manual domain start uses a dedicated endpoint. The backend resolves the
  action from the fixed registry instead of trusting a frontend `actionId`.
- Idle overview display now falls back to the latest real terminal attempt in
  the current epoch. Live attempts retain priority, while control eligibility
  remains separate and continues to use backend `allowedActions`.
- User acceptance has reopened the product-semantics boundary. The 12 registry
  rows remain valid runtime actions, but they are not one homogeneous class of
  crawler operation: they include revision-gated sync, direct crawl, local
  processing/database audit, database apply, and dry-run backfill.
- No further UI/API behavior change should be inferred from the current generic
  labels. User decisions are being collected in
  `docs/superpowers/specs/2026-07-15-crawler-monitor-operation-semantics-questionnaire.md`
  before a replacement design or implementation plan is written.

## Scope

- Backend: V2 overview projection and focused regression coverage.
- Frontend: render the new idle V2 status as `空闲正常`.
- Docs/process: this entry and the current devlog index.
- Out of scope: automatically starting crawler work or modifying crawler data.

## Validation

- Requirements re-baseline documentation check: the operation-semantics
  questionnaire contains one decision row for each `Q1` through `Q32`, a
  complete 12-domain current-behavior matrix, a separate 12-domain final-policy
  table, and an exact copyable answer template. Targeted terminology scans and
  `git diff --check` pass; no code, crawler, Redis, or database action was run.
- Idle terminal projection RED -> GREEN: focused state and page contract tests
  pass 64/64.
- Admin regression selection passes 122/122; `pnpm run check` and
  `git diff --check` pass.
- Existing Boss evidence remains `completed`, `33/33`, phase `write`, with the
  original attempt/queue identities and generated output path. No crawl,
  Redis write, or database write was performed.
- Admin-visible queue/attempt identities now use a compact prefix plus final
  five-character label (for example `queue-…53728` and `attempt-…bf9a9`). Full
  identities remain unchanged for tooltips, log loading, and control requests;
  focused UI/model tests pass 126/126 and admin typecheck passes.
- Failed/timed-out terminal attempts promote the backend-authorized `retry`
  control as `重新排队`, or `接着爬` when a validated checkpoint exists. Live
  heartbeat-expired attempts retain only backend-authorized stop/pause actions
  until they become terminal.
- Domain tiles, operation strips, status dots, and pills now distinguish
  starting/running, queued/retry-wait, paused, and cancel/error lifecycle groups.
  Tile children constrain width and wrap long content instead of overflowing.

- The new backend regression failed before implementation because overview
  returned no domain rows, then passed after the registry baseline projection.
- Backend focused selection passed 27/27:
  `CrawlerQueueV2ApplicationServiceTest` and
  `CrawlerMonitorActionRegistryTest`.
- Frontend status regression passed 7/7 and `pnpm run check` passed.
- `git diff --check` passed.
- Local stack restart passed: backend health was `UP`, public frontend returned
  `200`, and the admin frontend started at port `13005`.
- Authenticated overview returned `200`; its durable router is currently in
  maintenance with `STATE_STORE_RESET`, so it correctly returns no actionable
  live queue or domain rows. No cutover, epoch reset, crawler, Redis/database
  write, or service-state mutation was performed to change that condition.
- The screenshot exposed a maintenance-only projection bypass: while live V2
  reads had the registered idle baseline, `maintenanceSnapshot()` still
  returned an empty domain list. The focused regression failed `0 != 12`, then
  passed after maintenance began using the same read-only registry baseline.
- Fresh authenticated API evidence after the backend restart: maintenance
  health remains `STATE_STORE_RESET`, live queue count remains `0`, and all 12
  registered domains return as idle rows without attempt identity or actions.
- Read-only review found that the admin triage model does not yet classify V2
  `idle` rows as normal idle; implementation remains active until this is
  repaired and re-reviewed.
- The repaired triage classification/filtering/style scope was re-reviewed with
  no Critical, High, or Moderate findings.
- The authorized state-store recovery initially reproduced
  `STATE_STORE_INCONSISTENT`: the reset Lua contract accepted a missing epoch
  but rejected an entirely missing V2 namespace. A RED Lua-contract regression
  proved the gap; the reset now permits a missing engine while continuing to
  reject `v1` and invalid existing engine values.
- State-store recovery completed with reset id
  `acceptance-reset-20260714T082721Z`, creating empty epoch
  `epoch-8e4f7049-6788-48cd-90b2-9d9ce09e6645`. No crawler attempt was created.
- Backend focused tests passed 61/61 for controller, application projection,
  and registry behavior. Redis/reset focused tests passed 59/59.
- Admin typecheck passed and focused monitor tests passed 97/97.
- Fresh authenticated runtime evidence reports V2 queue health `healthy`, 12
  registered domain rows, 12 rows with `start`, zero live attempts, and zero
  attempt identities. The dedicated endpoint safely rejects an unknown domain
  with HTTP 400 without creating work.
- Manual acceptance exposed a frontend routing defect: idle V2 `start` was
  checked after the generic V2 attempt-control branch, so the drawer tried to
  build a control payload without queue identity and threw
  `V2 control requires queueId, attemptId, and stateVersion`. A RED page
  contract locked the ordering; `start` now routes to the dedicated domain
  endpoint before attempt controls. Admin typecheck and 97/97 focused tests
  pass, and fresh runtime evidence confirms the failed click created no attempt.
- Boss acceptance completed attempt
  `attempt-2a5259b9-d872-407e-9098-605096fbf9a9` with 33/33 records, but its
  crawler-data tab remained empty. Root cause: terminal V2 history projected
  Redis status and log only; the real output/report paths lived in the
  attempt-scoped progress snapshot and were dropped from the overview. The
  progress and attempt DTOs now retain those paths, terminal history merges the
  matching attempt artifacts, and the admin safely normalizes worktree-absolute
  `data/generated`/`reports` paths before preview. Backend projection tests pass
  23/23; admin typecheck and 91/91 focused tests pass. Fresh API evidence returns
  `data/generated/wiki-bosses.latest.json` for the existing completed attempt,
  so no re-crawl is required.
- Terminal V2 action projection, registered resume command rendering, retry
  identity, and startup process adoption now pass the final focused backend
  selection: 187/187 tests across state machine, application service,
  recovery, reconciler, supervisor, registry, and process launcher.
- The final admin selection passes 120/120 and `pnpm run check` passes. A pure
  latest-terminal-per-domain selector now prevents an older failed attempt
  from overriding a newer completed or cancelled attempt, while current-epoch
  retry/cleanup controls remain available.
- Final read-only review found old-epoch action leakage, pre-dispatch epoch
  validation gaps, drawer-level stale retry controls, and unstable ordering
  without valid timestamps. Four RED regressions reproduced them. The backend
  now keeps old-epoch attempts readable but non-actionable and rejects their
  control/cleanup before side effects; the domain summary and history drawer
  share deterministic latest-terminal ordering. The repaired focused gates
  above include those regressions.
- Re-review then found that a direct authenticated request could still retry an
  older same-epoch failure after a newer completion. The latest-terminal rule
  is now enforced in the backend before retry creation and reflected in API
  `allowedActions`; cross-queue RED -> GREEN tests cover both overview and
  direct control. The drawer chooses its latest actionable row from the
  current action-bearing epoch only.
- Recovered processes explicitly report whether an exit code is available.
  When an adopted running or paused process exits without one, the attempt
  converges to `failed` with `PROCESS_EXIT_CODE_UNAVAILABLE` and releases its
  covered domains instead of remaining live behind a watcher error.
- Isolated Boss, Buff, and Town NPC checkpoint suites pass 29/29. They use
  temporary fixtures only and prove retry after crash, completed-key skipping,
  fingerprint rejection, and safe `auto` fallback without real network, Redis,
  database, or shared progress writes.
- The local stack was restarted through the canonical Bash scripts. Backend
  health returns `200`/`UP`, front returns `200`, and unauthenticated admin
  monitor access returns the expected login redirect. Ports remain backend
  `18192`, front `15178`, and admin `13005`.
- `git diff --check` passes. User-generated
  `data/generated/wiki-bosses.latest.json` and `data/generated/resume/` remain
  preserved outside this follow-up's implementation edits.
- Runtime convergence repair offline gates now pass: the focused backend
  selection is 275/275 plus `mvn test-compile`; crawler progress contract tests
  are 28/28; admin API-shaped projection tests are 127/127; admin full unit
  tests are 301/301 and the Nuxt typecheck/build completes successfully.
- The repaired admin projection accepts real direct-crawler outputs under
  `data/terraPedia/raw/*.json`, so Armor Sets terminal `outputPath` appears as
  crawler data without production fixture rows.
- The broad backend suite remains red outside V2 scope: 1368 tests ran with six
  failures and one error in legacy port cleanup, audio streaming, item SQL, and
  recipe-import Mockito coverage. All V2 focused tests are green; these
  unrelated baseline failures were not modified.
- This offline repair run started no crawler and performed no Redis/database
  mutation. Existing Boss, Town NPC, Armor Sets, and resume evidence remains
  preserved as pre-existing user acceptance data.
- Canonical local-stack restart passed. Backend health is `UP`, public frontend
  returns `200`, and admin monitor access returns the expected login redirect.
  The authenticated read-only V2 overview reports the durable epoch
  `epoch-8e4f7049-6788-48cd-90b2-9d9ce09e6645`, healthy queue and reconciler,
  all 12 registered domains with `start`, and zero non-terminal attempts.
- Final read-only re-review reports no Critical, Important, or Moderate
  findings. Its focused evidence passes backend shared-preview 12/12, V2
  history/cleanup 52/52, admin projection 55/55, and `git diff --check`.
  The reviewer did not rerun the isolated Redis integration under its read-only
  boundary; the coordinator's earlier isolated `paused -> failed` integration
  remains the runtime evidence for lease release.
- The latest-code canonical restart completed at 2026-07-15 00:19 CST. Backend
  health is `UP`, front returns `200`, admin returns the expected `302` login
  redirect, all three ports listen, and no crawler writer is active.
- Authenticated read-only runtime evidence confirms the same durable epoch,
  healthy queue/reconciler, 12 registered and 12 startable domains, and zero
  live attempts. The real Armor shared raw preview returns `found=true`,
  `readable=true`, category `crawler`, and the 32,048-byte module JSON; no
  domain start, retry, Redis reset, or database write was invoked.
- Operator-authorized real Armor acceptance created attempts ending `...7f929`
  and `...0507f`. Both reached `completed`, phase `write`, progress `1/1`, and
  available logs without heartbeat timeout. The first run exposed that the
  generic progress builder dropped caller-supplied output/report paths. A RED
  armorsetbonuses regression reproduced the missing field; the builder now
  retains `outputPath`, `reportPath`, and `nextStep`. The second attempt returns
  the real shared Armor raw path and report path in Redis/API terminal history,
  and both previews are readable through their safe display paths.
- Operator-authorized real NPC acceptance created attempt `...ec2bf`. It
  supplied a non-null attempt-scoped report before launch, PID and process
  start identity, a non-empty 1,419-byte log, accepted heartbeat with progress
  sequence 8, and no `ATTEMPT_START_FAILED`. The action completed `apply 1/1`
  with exit code 0 before the coordinator could submit the planned precise
  cancel, so no cancel mutation was sent. This run intentionally updated the
  NPC wiki-sync project data path; no separate database import/backfill command
  was invoked.
- The NPC run exposed a second preview gap: API history returned its real
  attempt `report.json`, but the report endpoint rejected all V2 artifacts.
  RED -> GREEN coverage now permits only
  `reports/crawler-monitor/v2/YYYY-MM-DD/attempt-*/report.json`; run logs,
  progress, manifests, traversal, arbitrary paths, and symlinks in any path
  component remain forbidden. The real NPC report now returns HTTP 200 with
  `found=true` and `readable=true`, while its progress path returns 403.
- Fresh post-smoke gates pass: crawler progress 28/28; backend convergence and
  monitor selection 368/368; admin projection 120/120 plus typecheck; final
  report-preview security selection 16/16; canonical startup checks; and
  `git diff --check`. Final review reports no Critical, Important, or Moderate
  finding. The final running overview is healthy with 12 registered/startable
  domains, zero live attempts, and no crawler writer.

## Result

- Completed: overview now emits every registered production domain as an idle
  normal row when no same-epoch live attempt covers it; live attempt rows still
  take precedence. Healthy V2 idle rows expose `开始爬` through a dedicated
  registered-domain endpoint, while maintenance rows remain non-actionable.
- Completed: real Armor and NPC attempts now prove the repaired short-process
  and backend-refresh launch paths against Redis, attempt evidence, API, report
  preview, and the admin projection contract.

## Residual Risks

- Completion review found four Important blockers and each now has RED -> GREEN
  coverage: absolute shared Armor raw paths normalize for admin preview;
  terminal overview projects only Redis-committed artifacts; cleanup deletes
  attempt-owned evidence without deleting external report/output references;
  and Lua matches Java's `paused -> failed` transition. The repaired closure
  gate passes 289/289 plus test compilation, admin projection passes 127/127
  plus typecheck, and an isolated real-Redis transition releases ownership.
  The shared raw preview now resolves only `data/terraPedia/**` through the
  primary worktree/shared-data root while preserving extension, traversal,
  symlink, and arbitrary absolute-path rejection. Final re-review found no
  Critical, Important, or Moderate findings.
- Runtime acceptance originally found two commit-blocking convergence defects:
  null backend-refresh report artifacts left NPC claims without a process, and
  short Armor Sets processes could finish before Redis accepted terminal
  progress. Both code paths now have focused RED -> GREEN coverage: post-claim
  start failures terminalize as `ATTEMPT_START_FAILED`, and exact-identity
  short-process progress merges atomically into the terminal attempt.
- The old timed-out NPC/Armor attempts remain immutable history. New current-
  epoch Armor and NPC completions coexist with them and are the latest terminal
  rows used by the idle projection.
- The execution-ready repair is documented at
  `docs/superpowers/plans/2026-07-14-crawler-queue-v2-runtime-convergence-repair.md`.
  No Redis/database write, crawler execution, epoch reset, or evidence mutation
  was performed during the audit or plan creation.
- Armor/NPC runtime acceptance is complete. The remaining ten domains were
  validated through the offline launch matrix only; a live 12-domain matrix is
  intentionally deferred because it would fetch external sources and may
  write additional project/database state.
- A separate real failed-attempt retry was not manufactured. Retry/resume is
  covered by exact backend, UI, isolated Redis, and checkpoint tests; creating
  another artificial failure is not required for this convergence closeout.
- Nine registered domains do not have data-level checkpoints. Their retry is a
  fresh crawl by design; only Boss, Buff, and Town NPC maintenance expose
  `接着爬` backed by checkpoint validation.

## Follow-up

- The operation-semantics child follow-up closed its pre-merge findings with
  fresh frontend, crawler/workflow, backend, and review evidence. Real
  force-crawl and database apply remain manual-only and require explicit
  operation-level authorization.
- A 2026-07-17 read-only admin re-review adds three unresolved projection
  findings owned by the operation-semantics child: idle rows expose terminal
  recovery actions without the terminal attempt identity; history omits plan,
  result-kind/resume-outcome, and report/progress evidence; and several monitor
  surfaces still render full long IDs. Keep this parent entry active until the
  child records GREEN evidence and a clean re-review. See git for code-level
  diff details.

## Optional: Cross-Review

- Reviewer: Codex read-only reviewer.
- Scope: registered idle-domain projection, V2 idle consumer rendering, and
  focused regressions.
- Findings: initial triage idle-classification gap; terminal action/epoch
  leakage; unstable terminal ordering; recovered-process exit-code gap; stale
  same-epoch direct retry gap; shared Armor preview resolution; terminal
  artifact authority; cleanup ownership; paused-to-failed Lua parity; dropped
  terminal progress paths; V2 attempt report preview denial; attempt-directory
  symlink isolation.
- Disposition: all findings fixed with RED -> GREEN regressions and re-reviewed.
- Re-review required: no.
- Resolved by: Codex.
- Final reviewer verdict: no Critical, Important, or Moderate findings.
- Remaining risks: the remaining ten domains are offline-matrix validated only;
  no live 12-domain crawl was authorized or needed for this closeout.

## Commits

- Commit SHA pending in final response.
