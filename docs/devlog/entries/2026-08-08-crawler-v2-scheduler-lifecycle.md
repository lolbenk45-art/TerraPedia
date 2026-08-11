# Crawler V2 Scheduler Lifecycle

## Status

`closed`

## Final Result

The owner-authorized isolated Scheduler T1 run
`npc-t1-crawler-v2-auto-ingestion-20260809-04` passed under decision
`canonical-crawler-v2-scheduler-t1-acceptance-20260809-admin-07`. Its retained
report proves a real scheduled fixture tick, two lease renewals, restart
adopt/reject, lease-loss reap, recorded-response Recipe persistence, and
independent cleanup to zero. Production activation remains disabled and was
not proposed or authorized.

## Context

- User goal: continue the remaining plan with V2 scheduler daemon, lease, and
  restart recovery, leaving formal activation as an ADMIN-controlled final
  action.
- Branch: `design/crawler-auto-ingestion-readiness`.
- Worktree:
  `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`.
- Related prior entry:
  `docs/devlog/entries/2026-08-06-crawler-v2-automation-controls.md`.

## Direction / Decisions

- Use the existing Spring V2 scheduler/reconciler/recovery ownership.
- First run an isolated scheduled lifecycle T1, including lease renewal and
  backend restart recovery.
- Then add a new V2-specific formal activation operation and proposal.
- Reject an external daemon because it duplicates the Spring scheduler.
- Do not reuse the Biome L2 scheduler decision for V2 changed-only automation.

## Scope

- Backend/fixture: isolated scheduler lifecycle acceptance and focused repairs
  only if T1 exposes a real contract gap.
- Automation: T1 operation plus V2 formal activation manifest/request/proposal.
- Data: bounded local-fixture writes to derived acceptance databases plus
  isolated Redis/artifact state; no formal database or Wiki writes.
- Out of scope: consuming the formal activation permit, enabling production
  automation, a real Wiki crawler, V1 live routing, push, merge, and cleanup of
  user data.

## Current State

- V2 scheduled sweep, reconciliation/watchdog, atomic lease renewal, and
  ApplicationReady recovery already exist.
- V2 automation is effectively disabled because no automation config exists;
  the last observed sweep detected five changed eligible sources and dispatched
  none.
- Existing fixture smoke validates V2 cutover/control/reset boundaries but does
  not prove scheduled enable, repeated lease renewal, or backend restart
  recovery as one live lifecycle.
- Design:
  `docs/superpowers/specs/2026-08-08-crawler-v2-scheduler-lifecycle-design.md`.
- Implementation plan:
  `docs/superpowers/plans/2026-08-08-crawler-v2-scheduler-lifecycle-implementation.md`.
- Plan audit: execution-ready; Task 3 is intentionally gap-driven and permits
  only the single Spring owner class exposed by the isolated runtime evidence.
- Fresh pre-authorization review found the committed lifecycle entrypoint is
  still probe-only: it requires `--offline=true`, starts no isolated backend or
  Redis runtime, and marks every runtime assertion deferred. The execution
  manifest therefore cannot yet dispatch a valid live T1. This is an
  implementation gap inside the approved lifecycle plan, not an authorization
  or environment failure.
- First repair checkpoint is complete: the T1 manifest now dispatches
  `--live=true`, passed reports require scheduled-tick, two-renewal, restart,
  lease-loss, and all-zero cleanup evidence, and a phase driver enforces
  ordered execution with unconditional cleanup/readback. The CLI now also
  rejects both offline mode and live execution without a configured system
  driver, so it cannot emit probe evidence through the live manifest.
  Focused Node validation is `47/47`.

## Validation

- The final current-hash report is
  `reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json`
  with SHA-256 `bb3493ea5fb09da518f1d8a6b2db8712a86cf6a9784c17b5241288be5ed5a8d6`.
  It records `947` persisted Recipe rows, `1256` ingredient relationships,
  `1015` station relationships, and `0/0` unresolved item/station rows; the
  pre-cleanup database readback exactly matches those counts.
- The first refreshed run `...-20260809-03` correctly failed closed because
  the new reader used `wiki_zh_recipe_import` instead of the importer-owned
  `RECIPE_SOURCE_PROVIDER` (`wiki_zh`). Its decision
  `canonical-crawler-v2-scheduler-t1-acceptance-20260809-admin-06` was
  consumed once, no report was promoted, and independent cleanup returned all
  derived schemas/accounts, Redis DB14, marker root, port, child processes,
  and permits to zero. The reader now imports the shared provider constant and
  has a regression assertion.
- Final validation: focused Scheduler/Recipe tests `40/40`; manifest plus all
  monitor/recorded-response tests `146/146`; `git diff --check` passed.
- Final independent readback after run `...-04`: acceptance schemas `0`, its
  temporary accounts `0`, Redis DB14 `0`, port 18189 closed, marker root
  absent, no lifecycle/backend/runner process, and no retained dispatch permit.

- Read-only chain audit completed; no formal crawler, scheduler, Redis, or
  database write executed.
- Implementation contract/manifest tests pass (`41/41`), fixture and lifecycle
  Node tests pass (`5/5`), and the offline fixture probe publishes terminal
  progress and exact identity.
- Focused Spring scheduler/reconciler/recovery/supervisor/Redis/controller
  suite passes (`471/471`).
- Isolated E2E resources were provisioned and fully cleaned: derived schema,
  Redis port 16381/DB 15, backend port 18189, temporary root and credentials.
  Backend startup and cutover/reset reached V2, but the scheduled sweep found
  no fixture rule because `WIKI_MONITOR_RULES` has only formal Wiki domains.
- A second isolated run exposed formal-domain leakage when fixture scheduling
  was enabled. The run was rejected and its backend, Redis namespace/port,
  schema and root were cleaned to zero; no evidence was promoted.
- Fixture scheduling now injects only `crawler-queue-v2-fixture` and excludes
  every formal changed-domain rule. The regression test includes a changed
  Items source and `CrawlerMonitorServiceImplTest` passes `197/197`.
- Offline report:
  `reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance.json`
  is intentionally `status=probe-passed`, `scheduledTickObserved=false`, and
  `runtimeAssertionsDeferred=true`.
- Formal activation proposal generation is correctly rejected until a passed
  runtime T1 report exists; no activation proposal or permit was retained.
- `git diff --check` pending implementation checkpoint.

## Residual Risks

- Formal activation can create real crawler work and remains a separate owner
  checkpoint after isolated acceptance.
- Runtime T1 is closed by `...-20260809-04`; a different formal activation
  operation would require separate production-facing authorization.
- The system driver binding those phases to a real isolated backend, Redis
  process, derived database, and authenticated loopback API is still pending;
  an ADMIN packet exists for the blocked attempt, but no dispatch permit has
  been generated or consumed.
- Scope correction: the lifecycle probe itself is not automatic-ingestion
  evidence because `crawler-queue-v2-fixture` writes only progress. The next
  implementation must bind the scheduled action to an offline fixture import
  executor and verify derived local/maint/relation database counts before the
  scheduler assertions can be accepted.
- Recorded-response ingestion checkpoint implemented: the canonical T1 input
  now binds `data/generated/wiki-zh-recipe-pages.latest.json`; a bounded
  adapter materializes at most five downloaded records with HTTP-shaped
  request/response metadata and no network access; the Recipe executor passes
  that materialized response into the existing offline Recipe T1 pipeline.
  The remaining integration step is binding this executor to the scheduled V2
  action and proving real derived-database readback under fresh authorization.
- Remaining recorded domains are now source-bound at the executor-contract
  layer: Boss, Projectile, Buff, Biome, and NPC each use an approved downloaded
  JSON source, the same bounded/no-network materialization contract, and a
  domain runner handoff. Live runner integration and derived-database readback
  remain pending and are not represented as passed evidence.
- Fresh ADMIN authorization was generated for isolated run
  `npc-t1-crawler-v2-auto-ingestion-20260808-02`: execution manifest
  `canonical-crawler-v2-scheduler-t1-acceptance-20260808-02.execution-manifest.json`,
  request `...-20260808-04.request.json`, and authorized packet
  `...-20260808-04.packet.json` (decision
  `canonical-crawler-v2-scheduler-t1-acceptance-20260808-admin-04`). The packet
  binds the current server fingerprint, policy set, data bundle, and code
  bundle; no permit was created or consumed.
- Live launch was attempted with `--live=true` and correctly failed closed with
  `live system driver is not configured`. No backend, Redis, database, or
  scheduler process was started. The next step is to bind a proven isolated
  runtime driver and rerun from a fresh run ID and authorization.
- Plan defect recorded: authorization was generated before the runtime driver
  readiness gate. The plan now adds Task 3A as a hard prerequisite; future
  packets/permits are created only after the real driver passes its isolated
  phase and cleanup checks.
- The implementation plan now has an explicit preparation contract and a
  single ADMIN checkpoint. All runtime, fixture, database, Redis, test, hash,
  and cleanup prerequisites must be complete before the next request is shown;
  after approval the agent proceeds without additional environment questions.
- Scheduler fixture action now has an explicit opt-in recorded Recipe mode.
  `crawler-queue-v2-fixture.mjs` validates isolated DB/marker/MySQL
  environment inputs and invokes `runRecordedRecipeAutoIngestion` before
  terminal completion; default fixture behavior remains progress-only. Focused
  fixture and Recipe tests pass (`6/6`), and the manifest/lifecycle subset
  remains green (`52/52`). The real runtime driver and backend process
  orchestration are still the remaining live-preparation implementation.
- The lifecycle CLI now requires an explicit `--driver-module` exporting
  `createSystemDriver`; it can no longer run a live command without a concrete
  driver implementation. Loader and lifecycle unit validation passes (`9/9`).
- The system driver now has a marker-owned structured phase logger with
  recursive secret redaction and private `0600` JSONL output. Logger and
  lifecycle validation passes (`11/11`). Resource startup and cleanup phases
  are the next implementation checkpoint.
- The driver now creates private child-process logs and can terminate only
  children it created and marked as owned. Lifecycle validation passes
  (`15/15`); backend/Redis process orchestration will use this ownership guard.
- `createSystemDriver` now has a concrete marker-owned preparation path: it
  derives the isolated three-database/account identity, provisions through the
  existing T1 adapter, starts the Spring jar as an owned loopback-bound child,
  performs authenticated automation API enable/cutover checks, snapshots and
  restores scheduler files, and performs exact resource cleanup. The default
  observer reads the isolated Redis stream for renewals, restarts only its
  owned backend, and reads terminal progress; lease-loss remains an explicit
  dedicated observer because terminating the primary scheduled attempt would
  invalidate terminal-progress evidence. Missing or synthetic evidence fails
  closed; runtime hooks remain available for test isolation.
  The scheduler/fixture/recorded-response/domain suite passes (`68/68`), and
  `node --check` plus `git diff --check` pass.
- The complete `scripts/data/monitor/*.test.mjs` lane is green (`57/57`).
  Read-only listener inspection found only the existing local MySQL/Redis
  endpoints; no live scheduler run, permit, or Wiki request was performed.
- Lifecycle ordering now waits for the primary scheduled attempt to reach
  terminal progress before starting the second scheduled lease-loss case. The
  isolated fixture supports marker-runtime heartbeat/interval overrides; the
  lease-loss phase deletes only the exact fixture domain lease key and waits
  for V2 failure convergence. Combined manifest and monitor validation is
  `96/96` after this change.
- Task 3A dry run reached real provisioning and Spring startup with run
  `scheduler-dry-20260808-01`, then failed closed at backend login because the
  current jar applies `V9__add_article_review_workflow.sql` to a derived local
  schema that already contains `review_status` (`Duplicate column name`). Exact
  compensation removed the three derived schemas, two temporary accounts,
  Redis DB14 reservation, and marker root; independent readback returned zero.
  Driver cleanup was hardened to attempt every owned resource after any single
  cleanup failure.
- Town NPC generated data and `data/generated/resume/` are unrelated user
  artifacts and must remain untouched and unstaged.
- Dry run `scheduler-dry-20260808-02` started the isolated backend and
  authenticated successfully, but queried V2 automation before a V2 cutover
  existed in isolated Redis. The loopback cutover moved into `prepare` after
  authentication, before disabled-tick observation; automatic cleanup and
  independent readback returned zero.
- Dry run `scheduler-dry-20260808-03` then reached loopback cutover and
  received HTTP 409 with the response body discarded by the driver. Exact
  manual compensation stopped only its owned backend, dropped its three
  derived schemas and two temporary accounts, removed only known DB14 keys,
  restored the backed-up durable cutover file, and removed the marker root.
  Independent readback found no listener, owned schemas/accounts, DB14 keys,
  or marker root. The next change is a narrow safe error-payload diagnostic;
  root cause remains open until the returned reason is traced.
- Coordinator: Codex owns `docs/devlog/current.md`, this entry, the runtime
  driver, lifecycle test, and any serialized cleanup/run. Read-only source
  trace subtask `cutover_trace` may inspect only the cutover service and its
  immediate dependencies; it may not edit files, start services, or access
  Redis/MySQL. Its output is a reason-code path and isolation recommendation.
- The 409 root cause was confirmed as missing marker-root legacy snapshot
  inputs. The driver now seeds only empty marker-owned mirror/latest fixture
  files, uses a run-derived cutover ID and git marker, emits only safe API
  error fields, and applies a bounded loopback API timeout. Driver tests cover
  those boundaries.
- Fresh runs exposed a separate stale-artifact risk: the old backend JAR
  predated the fixture-only routing commit and launched one owned Buff child.
  The run was rejected, the exact child/key were stopped/removed, and the
  driver now rejects a JAR older than the fixture routing source. The JAR was
  rebuilt from this branch before later dry runs.
- Run `scheduler-dry-20260808-08` completed isolated V2 cutover and scheduled
  fixture dispatch without a formal Wiki child, then the recorded Recipe child
  exited nonzero after three heartbeats. The lease observer now waits for two
  concrete stream renewals instead of sampling once, but cannot pass while the
  child fails. Automatic cleanup/readback returned DB14, processes, derived
  schemas/accounts, and marker root to zero. Next owner action: retain child
  stderr outside the marker root and repair the concrete recorded Recipe
  pipeline failure before another run.

## Follow-up

- The active formal-enablement preparation entry owns the read-only preflight
  and proposal hardening. Keep proposal generation, production scheduler
  enablement, formal permit creation/consumption, and Wiki network access out
  of scope until a separate owner request authorizes that operation.

## Commits

- Commit SHA pending in final response.
