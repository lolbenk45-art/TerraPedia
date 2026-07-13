# Crawler Monitor Queue V2 Cutover

V2 Redis attempt state is the sole live crawler-monitor queue authority. V1
records are immutable cutover history and must never be restored as live work.

## Preconditions

- Use the fixed normal namespace `terrapedia:crawler:wiki-monitor:v2:`.
- Read `reports/crawler-monitor/v2/cutover-state.json`; do not proceed if it
  has an unconfirmed reservation, a mismatched epoch, or unexplained maintenance state.
- Record any V1 process by exact PID and start time. Do not use domain/action
  matching to decide a process is safe.
- Use an authenticated administrator request. Do not print or persist a bearer token.

## Controlled Cutover

Temporarily start the backend with
`TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true`, then call:

```http
POST /api/admin/crawler-monitor/cutover
{
  "cutoverId": "crawler-v2-<UTC-id>",
  "confirmation": "CUTOVER_CRAWLER_QUEUE_V2",
  "gitSha": "<validated-commit>"
}
```

Success creates an empty V2 epoch and immutable V1 snapshot; it does not copy
V1 queue entries. `LEGACY_PROCESS_UNCONFIRMED` means leave routing in maintenance
and inspect the recorded exact process evidence. Never force V2 mode by editing
Redis or the durable marker.

Before the first V2 mutation, verify two overview reads leave the live count,
history, epoch, ready order, and Stream cursor unchanged. Rollback is allowed
only while both durable timestamps and Redis `meta:first-live-mutation-at` are
absent. Use confirmation `ROLLBACK_CRAWLER_QUEUE_V2` only in that window.

## First Mutation And Routine Operation

The first mutation follows this order: durable `mutationReservationAt`, atomic
Redis write with `meta:first-live-mutation-at`, then durable confirmation. Any
ambiguous result is maintenance-read-only with
`FIRST_MUTATION_OUTCOME_UNCERTAIN`; it is never permission to fall back to V1.

For a no-network validation only, temporarily enable
`TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_ENABLED=true` and dispatch exactly
`crawler_queue_v2_fixture` / `crawler-queue-v2-fixture`. Verify the returned
`queueId`, `attemptId`, and `stateVersion`, V2 overview/SSE agreement,
monotonic progress, and attempt-scoped log growth. After the first confirmed
mutation, rollback must return `409/CUTOVER_ROLLBACK_FORBIDDEN`.

Controls require exact `queueId`, `attemptId`, and `expectedStateVersion`.
Cancellation must visibly pass `cancel_requested` before a confirmed process
exit produces `cancelled`; retain manifest, progress, and log evidence.

## State-Store Reset

When the durable V2 marker and Redis epoch disagree, keep maintenance mode and
temporarily enable `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=true` only to
submit this authenticated forward repair:

```http
POST /api/admin/crawler-monitor/cutover/recover-state-store-reset
{
  "cutoverId": "<existing-cutover-id>",
  "resetId": "crawler-v2-forward-repair-<UTC-id>",
  "confirmation": "RESET_CRAWLER_QUEUE_V2_EPOCH"
}
```

`resetId` is idempotent. The reset creates an empty new epoch, restores only
durable irreversible metadata, turns old manifests into interrupted history,
and quarantines unconfirmed ownership. It never imports V1 or old-epoch work.
Disable the temporary switch after verification; do not restart without operator authorization.

## Runtime Checks And Failure Handling

- Overview is a pure read of V2 epoch, live attempts, history, health, and cursor.
- Events use authenticated SSE; the client falls back to a three-second overview poll.
- Attempt logs are addressed only by `attemptId`; never accept a client path.
- Redis/read corruption returns structured typed errors and never uses V1 live state.
- After restart, the durable marker must retain V2 routing and reconciler health.

## Forbidden Actions

- `FLUSHDB`, `FLUSHALL`, or clearing a shared Redis database.
- V1 live fallback, V1 queue restore, or manual V2 marker/epoch editing.
- Arbitrary log paths, fuzzy PID/domain matching, or unapproved real crawlers.
- Database writes as part of fixture or queue acceptance.
