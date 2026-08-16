# Devlog: Shimmer Evidence Reconciliation

## Status

`closed`

## Context

- User goal: continue the Shimmer work by establishing the actual state of the
  protected local generation, authorization evidence, and local database before
  any new operation is considered.
- Branch/worktree: `feat/supplementary-domains-readiness` /
  `/home/lolben/TerraPedia`.
- Parent: follow-up to the closed 2026-08-15 dual-path acceptance entry.
- Contract handoff: the current pointer, frozen source, and automatic L1 bundle
  must identify the same verified generation; a new bundle is not evidence of a
  committed database transaction without its matching terminal record and
  read-only database reconciliation.

## Observed

- The current pointer selects verified generation
  `fd88d152962093f37562bfddea733e9b17dbb74baefc3bc3b83347a8ee8c4c71`.
  Its seven payload descriptors verify, with 279 item transforms, 248 decraft
  rules, 121 entity transforms, 29 NPC transforms, 820 title-resolution rows,
  819 langlink records, and no unresolved titles.
- `automation-shimmer-first-l1.source.json` and its bundle identify the same
  generation, manifest, data bundle, preview hash, and target fingerprint. The
  bundle is an `AUTO_APPLY_ACTIVATED` / `ACTIVATION_GATED_AUTO` preview for run
  `shimmer_l1_20260815164355`, with baseline generation 8 for all four owned
  Shimmer tables.
- The matching canonical result file still names the previous formal run
  `shimmer_l1_20260814_05` and a different bundle hash. A repository search
  found no terminal record for the new run ID or its bundle hash outside the
  new pointer/source/bundle/generation report.
- Historical 2026-08-15 acceptance records a different automatic Shimmer run
  as committed and then acknowledged through two natural changed-only sweeps.
  It does not prove the terminal state of the currently protected new bundle.
- MySQL listens on `127.0.0.1:13306`, but the current Unix account has no
  passwordless read access and no repository-local runtime credential file is
  present. No backend, crawler, or importer writer process is active.

## Scope

- In scope: read-only artifact reconciliation and read-only database inspection
  once an approved local read credential is available.
- Out of scope: crawler execution, generation, preview rebuild, scheduler
  mutation, service restart, database writes, L2, and Boss loot.

## Validation

- `verifyShimmerGeneration` passed for the three protected 2026-08-15
  generation directories, including the current pointer target.
- Pointer and source agree on generation ID, manifest path/hash, and data
  bundle hash; bundle import-plan fields agree with the source.
- `git diff --check` passed. No data or report path was staged or modified by
  this audit.

## Read-only Database Reconciliation (2026-08-16 11:27 CST)

- With user-authorized local read access to `terria_v1_local`, all four owned
  tables match the verified generation counts: `279`, `248`, `121`, and `29`.
- The current bundle run `shimmer_l1_20260815164355` and bundle hash
  `sha256:7150e905...` have zero rows in `crawler_automation_run`,
  `crawler_automation_apply`, and `crawler_automation_apply_bundle`.
- All four mutation generations remain `8`; their last writer and write fence
  identify the distinct historical run `shimmer_l1_auto_ced80850...`, which is
  `COMPLETED` with a `COMMITTED` apply from generation `7` to `8`.
- Classification: the protected current bundle is an **uncommitted preview**,
  not missing terminal evidence for a committed transaction. It must not be
  applied merely because its data matches current table counts.

## Local Automatic L1 Preflight (2026-08-16 11:27 CST)

- User direction: establish the automated-ingestion result from local Shimmer
  data only, without a full Wiki extraction. The eligible runner is
  `run-supplementary-domain-automatic-operation.mjs` with
  `--domain=shimmer --source-mode=local`; it reuses the verified current
  generation and rebuilds the Shimmer proposal read-only. It does not run the
  extraction pipeline or persist a canonical proposal, but it performs two
  lightweight source fingerprint probes required for the automatic run
  identity.
- No active Shimmer run or importer writer was found. The Shimmer policy is
  `L1` / `ACTIVE`, and all four mutation generations remain `8`, so there is
  no baseline drift.
- Automatic execution is correctly fail-closed before preview or transaction:
  the sole scheduler activation expired at `2026-08-16 02:16:11` CST. The
  runtime scheduler configuration remains `enabled=true`, `changed-only`, and
  one minute, but it has zero currently valid activation decisions.

## Blocker

- The user explicitly selected the bounded option: disable the global scheduler,
  renew activation, execute exactly one local-source Shimmer automatic L1, then
  restore `enabled=true`, `changed-only`, and a one-minute interval. No state
  mutation has been made while validating the formal renewal path.
- The supported policy writer requires an `AUTHORIZED` packet whose
  `operationId` is `automation-crawler-v2-scheduler-activation`. That operation
  is absent from `CANONICAL_CUTOVER_OPERATION_IDS`; no matching input or packet
  exists under `reports/authorization/canonical/`. The public canonical
  authorization builder therefore fails closed with `unsupported operationId`.
- The historical `canonical-crawler-v2-scheduler-activation` request is a
  different, expired proposal-only API enablement approval. It cannot authorize
  the policy writer or create the activation decision read by the automatic
  Shimmer runner. Direct SQL and hand-written packet substitution are forbidden.
- The current runtime scheduler was left unchanged at `enabled=true`,
  `changed-only`, one minute. No scheduler API call, policy-decision write,
  automatic preview, import, full Wiki extraction, or database write occurred.

## Execution-Gate Validation (2026-08-16 12:00 CST)

- `buildCanonicalAuthorizationRequestForOperation` for
  `automation-crawler-v2-scheduler-activation` failed with the expected
  `unsupported operationId`; the exact ID is not in the governed catalogue.
- `run-automation-policy-decision.test.mjs` and
  `authorized-operation-context.test.mjs` passed. The combined authorization
  suite has 11 unrelated baseline failures caused by the completed repository
  path migration: tests still expect retired `scripts/data/...` paths or omit
  newly required `pipelines/relation/...` fixture files. No repair was attempted
  because it is outside the Shimmer operation scope.
- `git diff --check` remains clean. The protected Shimmer generation, frozen
  source/bundle, and existing runtime configuration are unchanged.

## Next Safe Action

1. Preserve the current generation and bundle as local evidence; do not apply
   or delete them.
2. Obtain explicit scope to implement and review the missing formal activation
   bridge: governed operation-catalog registration, frozen activation input,
   private request/packet construction, and focused failure/identity tests.
3. Only after that bridge is reviewed and a fresh packet is valid may the
user-authorized bounded scheduler-disable, renewal, one local Shimmer run,
verification, and scheduler restoration sequence begin.

## Formal Activation Bridge (2026-08-16 12:30 CST)

- The missing governed operation is now registered as
  `automation-crawler-v2-scheduler-activation`; its executor remains the
  existing transaction-bound `run-automation-policy-decision.mjs`.
- Added `capture-crawler-v2-scheduler-activation-input.mjs`, a read-only local
  MySQL snapshotter that freezes the active scheduler policy, full policy-set
  hash, and server fingerprint into three private no-overwrite artifacts.
  See git for code-level diff details.
- Focused verification passed: 22 authorization/policy tests, 2 formal
  execution-manifest tests, and 1 governed-operation catalogue test. Broad
  migrated-path authorization-suite failures remain unrelated baseline work.

## Runtime Root Blocker (2026-08-16 12:30 CST)

- The authenticated scheduler-disable guard stopped before any `PUT`: the API
  did not report the recorded primary-worktree configuration.
- Root cause is reproducible: PID `1102833`, which serves `18191`, has CWD
  `/home/lolben/TerraPedia/back (deleted)` and no configured repository-root
  override. The maintained primary-worktree configuration exists at
  `reports/crawler-monitor/v2/automation-config.json`, but the backend reads no
  configuration and returns the fallback `enabled=false`, `changed-only`,
  60-minute state.
- No scheduler API mutation, policy-decision packet, activation-decision row,
  Shimmer preview, Shimmer import, full Wiki extraction, or database write was
  made in this attempted execution. The protected Shimmer artifacts remain
  untouched.

## Next Safe Action (Updated)

1. Recover valid existing local admin and user token secrets, or obtain
   explicit authorization to rotate both local secrets. The restart has been
   authorized, but changing authentication secrets has not.
2. Restart the backend from the maintained `services/catalog-api/` path,
   re-authenticate, and require the exact primary-worktree scheduler state
   (`enabled=true`, `changed-only`, one minute), then repeat the bounded
   disabled-scheduler preflight.
3. Only after that preflight passes, create one fresh formal activation and run
   exactly one `shimmer --source-mode=local` automatic L1, verify its terminal
   evidence, and restore the scheduler.

## Authorized Backend Restart Attempt (2026-08-16 19:32 CST)

- User authorized a local backend restart. The old PID `1102833` had already
  exited, and `18191` was free. Its last run manifest referenced the retired
  `scripts/dev/config/local-stack.config.json`, with old service ports and no
  surviving configuration file.
- A controlled replacement was launched from `services/catalog-api/` under the
  maintained worktree's runtime configuration. It exited before serving a port:
  `terraria.auth.admin.token-secret must be at least 32 characters (got 30)`.
  The user token secret is independently 29 characters and is guarded by the
  same 32-character requirement.
- No backend listener was established, and no scheduler API mutation, policy
  packet, activation row, Shimmer preview/import, full Wiki extraction, or
  intended Shimmer database write occurred. The failed attempt's ignored log is
  `.local/logs/catalog-api-20260816-193147.log`; its ignored PID record is
  stale and intentionally left as evidence until local authentication recovery
  is authorized.

## Standard Stack Start Attempt (2026-08-16 20:21 CST)

- At user direction, `bash platform/local/start-local-stack.sh` was run from
  the primary worktree instead of using a hand-assembled backend command. It
  handled all recorded stale PID files conservatively, then stopped at its
  first required gate: MySQL TCP `127.0.0.1:13306` is unreachable.
- Read-only environment checks found no MySQL/MariaDB process, no registered
  WSL `mysql`, `mariadb`, or `mysqld` service, and no Docker runtime. The
  standard stack script deliberately does not provision MySQL.
- No local stack process was started by this attempt. The next action requires
  an operator to restore the existing local MySQL instance, not a new database
  or a direct application-data command. After it is reachable, the previously
  recorded token-secret validation remains the next startup gate.

## Environment Recovery Recheck (2026-08-16 20:46 CST)

- A fresh read-only capability check confirms the blocker is unchanged: no
  `mysqld`, `mariadbd`, or local-stack service is running, and
  `127.0.0.1:13306` is not listening.
- The existing data directory is owned by `mysql:mysql`; `sudo -n` requires an
  unavailable password, `runuser` rejects this non-root session, and `su mysql`
  cannot authenticate. No permission change, data-directory change, database
  command, or replacement database was attempted.
- Continue only after the operator starts the existing configured instance on
  `127.0.0.1:13306`. Then rerun the canonical startup script; the recorded
  32-character admin/user token-secret validation remains the next gate.
- The canonical command was rerun at this checkpoint and exited `1` at the
  same database TCP preflight; it did not start a service or issue a write.
- The shell history contains the prior successful operator recovery sequence
  for this same configured instance: create `/run/mysqld` with `mysql:mysql`
  ownership, then run `/usr/sbin/mysqld --defaults-file=/etc/mysql/my.cnf
  --daemonize` as `mysql`. It was only read, not executed in this session.

## Authorized Runtime Closure (2026-08-16 21:42 CST)

- The existing WSL MySQL instance was restored on `127.0.0.1:13306`; the
  canonical stack was started twice through `platform/local/start-local-stack.sh`
  with the valid local admin/user secrets supplied in the prior handoff. The
  maintained backend required the explicit
  `TERRAPEDIA_CRAWLER_QUEUE_V2_REPO_ROOT=/home/lolben/TerraPedia` override:
  without it the V2 router searched under `services/catalog-api/` and returned
  `STATE_STORE_RESET` despite matching Redis markers.
- Redis V2 state was read from `6380/DB3` under the fixed production prefix;
  durable cutover ID, epoch, first-mutation timestamp, and namespace all match.
  Authenticated automation/preflight then returned 200 with
  `enabled=true`, `changed-only`, one minute, `liveAttempts=0`,
  `sweepClaims=0`, and a healthy reconciler.
- The formal activation bridge produced private no-overwrite input, policy-row,
  server-fingerprint, execution-manifest, request, owner-input, and packet
  artifacts. The existing policy writer inserted exactly one
  `SCHEDULER_ACTIVATION` decision: decision identity
  `automation-crawler-v2-scheduler-activation-20260816-01`, row id `4`,
  policy-set hash `sha256:b4eb34d84c604e15677cc5075599fc7d91a1af571bdf6351e7a4dba234ba6468`.
- The global scheduler was disabled through the authenticated API, then one
  `run-supplementary-domain-automatic-operation.mjs --domain=shimmer
  --source-mode=local` was executed with monitor progress at
  `reports/backend-refresh/history/shimmer-local-automatic-l1-20260816-01/`.
  Both runner and preview progress reached terminal `completed`.
- The operation resolved the protected local source to the already committed
  run `shimmer_l1_auto_ced80850ba13fc759bca53f54ca9cafb` and returned
  `reconciledCommittedRun=true`; it performed no duplicate table mutation.
  Read-back proves the terminal run/apply/evidence rows, apply mode
  `AUTO_APPLY_L2` (the historical automatic-mode enum), generation `7 -> 8`,
  and four owned-table counts `279/248/121/29`. All four write fences point to
  that run and committed generation `8`.
- Scheduler state was restored through the authenticated API and rechecked:
  `enabled=true`, `changed-only`, one minute, zero live attempts, and healthy
  reconciler. No full Wiki extraction, L2 promotion, Boss loot, direct SQL
  mutation, or commit/push/merge was performed.

## Runtime Verdict

- The automated local-ingestion chain is **operational and idempotent** for the
  protected Shimmer source: activation is consumed through the governed writer,
  the local runner reaches terminal progress, and an already committed identical
  source is reconciled without a second write.
- This run does not claim a fresh generation `8 -> 9` transaction because the
  current local source is unchanged and the runner correctly recognized the
  existing committed identity. A fresh write would require a genuinely changed
  local source, which is outside this bounded verification.
- The user has now requested a focused commit and local merge. The maintained
  activation bridge code, tests, plan, and devlog are the commit scope; private
  Shimmer generations, authorization reports, and runtime locks remain local
  evidence and are intentionally excluded from the commit.

## Final Verification (2026-08-16 21:51 CST)

- Focused authorization/runtime tests passed: the capture, policy-decision, and
  authorized-context files passed `18/18`; the selected canonical authorization
  tests passed `12/12`; the formal cutover/activation execution-manifest tests
  passed `2/2`.
- A combined invocation of the migrated authorization files still reports
  `66` passing and `19` failing baseline tests. The failures are confined to
  unrelated retired `scripts/data/...` expectations and missing non-Shimmer
  `pipelines/relation/...` fixtures/entrypoints; no repair was attempted in
  this Shimmer scope.
- Authenticated read-only API verification at backend `18091` reports
  `enabled=true`, `mode=changed-only`, `sweepIntervalMinutes=1`, a present
  scheduler configuration, and the latest sweep `completed` with all eight
  domains `changed=false` and `dispatched=[]`. Queue and reconciler health are
  both `healthy`, with zero overdue attempts and zero stream lag.
- Read-only MySQL verification against `terria_v1_local` reports Shimmer table
  counts `279/248/121/29`, all four write fences at committed generation `8`
  pointing to `shimmer_l1_auto_ced80850ba13fc759bca53f54ca9cafb`, and the
  historical run/apply as `COMPLETED/COMMITTED`, mode `AUTO_APPLY_L2`,
  generation `7 -> 8`. The candidate current preview run has zero rows in the
  run, apply, and apply-bundle tables.
- Progress evidence remains at
  `reports/backend-refresh/history/shimmer-local-automatic-l1-20260816-01/`;
  both `child-status.json` and `child-status.preview.json` are terminal
  `completed`. No crawler extraction, new source acknowledgement, L2
  promotion, Boss-loot write, direct SQL mutation, commit, push, merge, or
  cleanup was performed.

## Extended Test Verification (2026-08-16 22:21 CST)

- The expanded supplementary automation suite passed `83/83`. It covers all
  eight scheduler domains, Shimmer local/current-generation preview rules,
  automatic-run idempotent reconciliation, acknowledgement ordering, apply
  rollback, generation fences, activation identity, and the no-Boss-loot
  boundary.
- The source-probe, progress-contract, and schedule-config group passed
  `71/73`; the two failures are scheduler lifecycle fixtures that still point
  at the retired local-stack configuration path. They do not execute Shimmer
  source or database logic and remain outside this scope.
- The backend focused Maven command passed `398` tests with zero failures and
  zero errors, covering automation policy/service, activation preflight,
  monitor controllers and registry, V2 router/recovery/acceptance/reconciler,
  and `CrawlerMonitorServiceImpl`.

## Review Disposition

- The pre-merge review found that snapshot output confinement used only a
  lexical prefix and could follow an ancestor symlink outside the repository.
  The writer now uses `assertRepositoryPathConfinement` with parent creation,
  and the regression suite covers an escaping canonical-directory symlink.
- The review's missing-policy gap is covered by a dedicated test. The CLI now
  wraps its MySQL reads in `START TRANSACTION READ ONLY` with rollback on both
  success and failure. No Important review finding remains open.

## Commit Closeout

- Result: the governed scheduler activation bridge and its focused tests are
  ready for integration; the local Shimmer automatic run is verified as an
  idempotent reconciliation, not a fresh `8 -> 9` publish.
- Validation: focused Node automation `83/83`, backend Maven `398/398`,
  `git diff --check`; the two scheduler lifecycle fixture failures and the
  broader migrated-path authorization baseline remain documented residual
  risks.
- Follow-up: repair the retired-path scheduler fixtures and broader
  authorization-suite migration separately; rerun only for a genuinely changed
  Shimmer source or a new operation-level authorization.
- Commit: `commit SHA pending in final response`.
