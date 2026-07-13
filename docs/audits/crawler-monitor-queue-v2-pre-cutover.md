# Crawler Monitor Queue V2 Pre-cutover Readiness

Date: 2026-07-13 CST
Branch: `fix/crawler-queue-v2-runtime`
Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-queue-v2-runtime`
Base: `5738633fe417af83d6ced8d5d07206424be9cd82`
Readiness checkpoint: `e7b5d2f` plus the pending V1 watcher-fence repair

## Scope and authority

The approved design is
`docs/superpowers/specs/2026-07-11-crawler-monitor-queue-v2-hard-cutover-design.md`;
the executable plan is
`docs/superpowers/plans/2026-07-11-crawler-monitor-queue-v2-hard-cutover.md`.

V2 production state uses the fixed namespace
`terrapedia:crawler:wiki-monitor:v2:`. The authorized smoke used only an
explicit `terrapedia:crawler:wiki-monitor:v2:test:<run>:` prefix, an explicit
test legacy prefix, Redis DB 4, and a fixture root outside normal crawler
artifacts. Its cleanup deletes only those exact prefixes and root; it never
uses `FLUSHDB` or `FLUSHALL`.

## Evidence that passed

- Isolated authenticated fixture smoke: 14/14 checks. It proved V1 fixture
  remnants are immutable history, empty V2 cutover, exact fixture identity,
  authenticated SSE, attempt-keyed incremental logs, active dedupe, ordered
  cancellation, three-second fallback, explicit missing-epoch maintenance,
  idempotent reset, old-epoch isolation, and exact-prefix cleanup.
- Task 14 V2 backend selection, rerun after the watcher repair: 493/493,
  zero failures/errors/skips. It includes V2 repository, state machine,
  artifacts, supervisor, reconciler/recovery, router, application, event
  bridge, cutover, acceptance, controller, legacy snapshot, action registry,
  and monitor service tests.
- Worker and fixture contracts: 68/68. These prove full V2 progress identity,
  monotonic sequence, initial/final progress, and no-network fixture behavior.
- Admin application: unit tests 284/284; `pnpm run check` and `pnpm run build`
  succeeded. The build emitted existing sourcemap/test-module externalization
  warnings but exited successfully.
- Invariant scans found no browser `EventSource` or token-query SSE path, no
  non-terminal V2 artifact cleanup, and 69 expected V2 identity/control/three
  second fallback markers. The only `dispatch-queue` matches are the immutable
  V1 snapshot reader; the only `domain/action` match rejects non-exact V2
  admission. Neither is a V1 live fallback.
- Overview purity, stale epoch/fence/version/progress rejection, non-terminal
  deadline convergence, normal/forced/unconfirmed cancellation, immutable V1
  history, and attempt-scoped history/logs are covered by the focused tests and
  isolated fixture smoke above.

## Watcher race repair

V1 terminal watchers now leave state untouched when their own wait is
interrupted and retain the cancellation fence until watcher teardown. This
prevents an interrupted watcher from overwriting a requested cancel/failure as
`timed_out` and then draining the legacy queue. The focused monitor-service
selection contains regressions for interrupted smoke watcher, smoke cancellation
fence lifetime, and standard failure-fence lifetime.

## Broad-gate limitations

`cd back && mvn test` was run fresh: 1333 tests, 6 failures, 1 error, 7 skips.
The failing areas are `LegacyLocalBackendPortCleanerTest` (2),
`AdminAudioAssetControllerTest` (1), `ItemMapperPreferredImageSqlTest` (3),
and `AdminWikiZhRecipeImportControllerTest` (one unnecessary-stubbing error).
None of their production/test paths differ from this branch's merge base, so
they are recorded as unrelated baseline blockers rather than absorbed into the
crawler change.

`bash scripts/dev/quality-gate.sh` stopped in its first data/script stage:
`scripts/dev/local-stack.test.mjs` expects `$TP_FRONT_PROJECT_DIR`, while
`quality-gate.sh` still hardcodes `front-nuxt`. It did not proceed to backend,
frontend, or E2E gates. This is also outside the crawler scope and remains a
release-quality blocker for the owning workflow.

`git diff --check` passed.

## Remaining live gates

1. With the user-authorized normal (non-fixture) Redis namespace, perform the
   explicit V1-to-V2 maintenance cutover and prove the empty V2 rollback
   boundary.
2. Perform the separately authorized first irreversible V2 mutation only with
   `crawler_queue_v2_fixture/crawler-queue-v2-fixture`, then prove cancellation,
   V1 inactivity, disabled-fixture restart recovery, and durable V2 routing.

No real crawler, database mutation, shared-Redis clear, or unapproved fixture
namespace operation is authorized by this audit.
