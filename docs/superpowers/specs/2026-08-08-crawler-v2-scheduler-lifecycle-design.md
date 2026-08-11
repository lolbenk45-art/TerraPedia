# Crawler V2 Scheduler Lifecycle Design

## Goal

Prove the existing Spring-owned V2 scheduler, lease renewal, and restart
recovery as one isolated lifecycle, then add a governed ADMIN activation
contract so a later formal enable is one explicit authorization and execution
instead of an ungoverned settings-file mutation.

## Confirmed Architecture

The scheduler runtime already exists in the backend:

```text
scheduled V2 automation sweep -> source update detection -> V2 enqueue
V2 reconciler                 -> claim -> launch -> progress ingestion
V2 reconciler                 -> atomic multi-domain lease renewal
ApplicationReady recovery     -> exact manifest/process reconciliation
watchdog                      -> stale/overdue fail-closed convergence
```

`CrawlerQueueV2Reconciler` and `CrawlerQueueV2RecoveryService` own attempt
lifecycle, leases, and restart recovery. `CrawlerMonitorServiceImpl` owns the
changed-only scheduled sweep. Creating another external daemon would duplicate
ownership and introduce double dispatch, so it is forbidden.

The existing `automation-biomes-scheduler-activation` operation is not the V2
scheduler switch. It records a legacy Biome L2 policy decision and cannot
authorize the five-domain V2 changed-only automation setting.

## Phase A: Isolated Scheduler Lifecycle T1

Add a governed `canonical-crawler-v2-scheduler-t1-acceptance` operation and a
dedicated lifecycle harness around the existing fixture stack. The operation
uses:

- one unique `terrapedia:crawler:wiki-monitor:v2:test:<run-id>:` namespace;
- one matching immutable V1-history-only test namespace;
- one explicitly empty Redis logical database not used by the local stack;
- one owned temporary fixture root and isolated backend ports;
- a temporary administrator credential/token that is never persisted in
  evidence;
- only `crawler_queue_v2_fixture` / `crawler-queue-v2-fixture` with local
  progress files and no Wiki request or database mutation.

The fixture runtime may read tracked code and fixture inputs. It must not use
formal V2 Redis keys, formal crawler artifacts, V1 live routing, the old
backend-refresh daemon, or any formal database as a write target.

## Lifecycle Assertions

The acceptance passes only when all of these are observed from the isolated
runtime rather than simulated solely through mocks:

1. Automation begins disabled and a scheduled tick creates no attempt.
2. Enabling fixture automation is bound to the isolated namespace and action
   allowlist.
3. A scheduled tick, not the manual sweep endpoint, detects the fixture change
   and enqueues exactly one V2 attempt.
4. The attempt publishes monitor-visible progress before its loop, advances
   monotonic sequence/heartbeat values, and exposes the same attempt identity
   through overview, Redis, manifest, progress, and logs.
5. At least two lease renewals occur for the exact epoch/queue/attempt/fence and
   covered-domain set; a concurrent sweep cannot create a second attempt.
6. The backend is terminated while the fixture child remains identifiable.
   After restart, startup recovery may adopt it only when PID, start instant,
   fingerprint, manifest identity, epoch, fence, and live Redis attempt all
   match. Missing or mismatched identity must terminate/isolate and converge to
   an explicit non-running state instead of recreating work.
7. The recovered/adopted attempt continues lease renewal and reaches one
   terminal state. No lease, dedupe, ready membership, or live index remains.
8. A forced lease-loss case fails closed, reaps the exact child process, and
   does not claim another ready attempt in the same unhealthy round.
9. Restart never reads V1 as live state and never recreates a missing epoch.
10. Built-in cleanup and an independent readback return fixture backend/child
    processes, Redis keys, temporary credentials, ports, files, and permits to
    zero.

The retained report is
`reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance.json`.
It contains only hashes, counts, timestamps, state identities, transition
summaries, lease-renewal counts, restart outcomes, and cleanup evidence.

## Progress Contract

The fixture action keeps the existing stable action ID and receives an
attempt-scoped `childStatusPath`. It writes `running` before the first wait,
updates `lastHeartbeatAt`, monotonic sequence and current/total during work,
and ends `completed` or `failed`. Scheduler acceptance status itself is written
atomically to an isolated attempt path and mirrored only to its governed final
report after cleanup.

No arbitrary report scan is treated as live progress. The monitor, Redis
attempt, manifest, and child progress path must agree on exact identity.

## Phase B: Governed Formal Activation Contract

Add a distinct operation ID:

`canonical-crawler-v2-scheduler-activation`

It is separate from the Biome L2 policy operation. Its immutable input binds:

- the current V2 scheduler T1 report hash and `cleanupPassed=true`;
- the exact scheduler/reconciler/recovery/config/API code bundle;
- the current durable V2 router marker, epoch, and production Redis namespace;
- current automation setting `enabled=false` and changed-only mode;
- zero live attempts, zero retained sweep claim, healthy reconciler, and no
  crawler/backend-refresh daemon conflict;
- current source/readiness evidence for every eligible domain: items, NPCs,
  projectiles, buffs, and armor sets;
- requested interval, actor, reason, expiry, rollback command, and expected
  post-enable readback.

The operation has `databaseWrites=false` and may mutate only
`reports/crawler-monitor/v2/automation-config.json` through the authenticated
loopback V2 automation API while the backend holds the V2 mutation permit. The
runner must not write the JSON directly, touch Redis, dispatch a manual sweep,
or start an external daemon.

Activation consumes one current-hash ADMIN permit immediately before the PUT.
It rechecks every frozen precondition, enables changed-only automation, reads
back the exact config, and records a result. A failed postcondition invokes the
same API to restore `enabled=false`; failure to prove disablement is an explicit
operator-blocking result, never a success.

Phase B in this batch ends with a technically complete manifest/request/
proposal and no permit consumption. Formal enable, the first real scheduled
sweep, and any resulting Wiki crawler are a later explicit owner checkpoint.

## Failure Boundaries

Fail closed on namespace/root/Redis reuse, non-loopback endpoints, unexpected
database access, real Wiki access, missing progress, identity drift, fewer than
two renewals, double dispatch, ambiguous child survival, V1 mutation, epoch
recreation, cleanup residue, stale code hash, stale T1 evidence, or live
activation precondition drift.

The lifecycle harness may terminate only processes it started and may delete
only marker-owned fixture paths and exact test prefixes. `FLUSHDB`, `FLUSHALL`,
broad process matching, and repository cleanup are forbidden.

## Validation

- TDD for scheduler lifecycle harness guards, progress, renewal evidence,
  restart adoption/rejection, lease-loss convergence, and cleanup.
- Focused backend suites for reconciler, recovery, supervisor, Redis repository,
  application service, monitor service, controller, and configuration.
- Existing V2 fixture smoke plus the new lifecycle T1 under a fresh ADMIN
  decision and isolated runtime.
- Independent zero-resource readback, retained report validation, authorization
  contract tests, and `git diff --check`.

## Residual Risk

An isolated fixture proves scheduler mechanics, not Wiki availability or the
correctness of future source-change decisions. Formal activation can cause real
network crawler work on its next due tick, so it remains disabled until the
separate activation permit is explicitly approved and consumed.
