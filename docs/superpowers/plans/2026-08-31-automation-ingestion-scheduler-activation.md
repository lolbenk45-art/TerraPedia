# Automation Ingestion Scheduler Activation And Probe-to-Database Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starting from the verified eight-domain H8 policy set, preserve the 185 private evidence artifacts, obtain a fresh and independently authorized V2 scheduler decision, prove one real source-change-to-database ingestion, and then close the eight-domain monitoring and operational handoff with measurable latency and rollback evidence.

**Architecture:** Historical evidence is an immutable read-only reference layer. A new evidence catalog records every path, byte hash, role, generation-time signal, reuse classification, and forbidden use, but no historical packet, permit, owner input, result, or commit marker is replayed. The live chain is `source probe -> source fingerprint/report -> V2 scheduled sweep -> V2 attempt/reconciler -> domain automatic runner -> transaction-bound L1 bundle/apply -> source acknowledgement -> database/API/readback` and is authorized separately by `preflight -> proposal -> request -> Owner packet -> scheduler activation decision`.

**Tech Stack:** Node.js ESM automation contracts, Spring Boot admin monitor API, MySQL/InnoDB `terria_v1_local` (Flyway V60), Redis V2 state on port `6380`, `node:test`, Maven, JSON evidence under `reports/`, and private per-worktree state under `.local/`.

---

## 1. Goal, Closure, And Boundaries

### User-visible outcome

When this plan is complete, a real upstream change in any eligible domain is detected by the scheduler probe, dispatched once through the V2 queue, imported into its owned tables, and independently readable through the existing runtime/API path. The evidence must show where the change was detected, when it was claimed, when the transaction committed, and whether the source acknowledgement happened only after commit.

### Closure definition

The task is closed only when all of the following are true:

1. The 185 retained files have a private catalog with exact count, path, hash, mode, symlink, role, and reuse classification.
2. A fresh preflight is bound to the current server, V2 epoch/namespace, current policy set H8, and the exact eight eligible domains.
3. A new scheduler proposal/request/Owner packet/decision has unique identities and is independently read back; no previous promotion or scheduler identity is reused.
4. The scheduler observes at least one natural scheduled tick without a manual sweep. If a real source change occurs, its one-run transaction and downstream readback pass. If no real change occurs during the observation window, the result is explicitly `probe-only`, not a fabricated ingestion pass.
5. NPC/Boss shared-table fencing, duplicate suppression, failure handling, rollback, and final enabled/disabled state are independently verified.
6. Latency and residual-risk evidence is recorded in the devlog and a fresh handoff points to the next authorized operation.

### Chain contract map

| Chain piece | Authoritative surface | Required gate |
| --- | --- | --- |
| Manifest | `data/generated/wiki-source-manifest.latest.json` plus the canonical operation/execution manifests | Source/action and code-bundle paths are explicit and hash-bound |
| Evidence | V2 preflight, source-update report/state, attempt/result/evidence-set/readback artifacts, and the private 185-file catalog | Ordinary files, `0600`, self-hash-consistent, no-overwrite; scheduler-owned retry publication requires the dedicated service-user boundary below |
| Freshness | Preflight endpoint and source probe timestamps | Preflight age at most `15m`; stale or missing source evidence blocks |
| Refresh plan | This document and its phase gates | Every operation remains manual/authorized until the matching phase passes |
| Automated gate | `node:test`, focused Maven tests, authenticated API reads, MySQL read-only checks, Redis health, and final reconciliation | Zero failures/blockers before the next phase |
| Consumers | V2 queue/reconciler, domain runner, MySQL owned tables, backend DTO/API, admin/public projections | Transaction/readback chain agrees with the source and policy identities |

### In scope

- Read-only inventory and classification of the 185 untracked private files in the prior ingestion worktree.
- The repeatable evidence-catalog helper `pipelines/automation/build-automation-evidence-catalog.mjs` and its focused tests.
- Fresh scheduler preflight, proposal, request, independent ADMIN/Owner authorization, activation, natural tick, canary ingestion, eight-domain observation, readback, and rollback.
- Scheduler-owned source probes for Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and Shimmer.
- Private runtime evidence, devlog updates, focused validation, and a commit containing only plan/tooling/devlog changes that are explicitly approved.

### Out of scope and hard prohibitions

- Replaying, editing, renaming in place, or deleting any consumed L2 promotion artifact, historical hash-disposition artifact, packet, permit, owner input, result, or commit marker.
- Treating any of the 185 files as a new business-data payload or as proof of a future source change.
- Direct SQL, direct Redis, direct JSON control writes, manual sweep calls, force-crawl calls, external daemons, reset/recovery, schema migration, or broad crawler expansion.
- Copying evidence from the linked ingestion worktree into the scheduler worktree to bypass `private-repository-path.mjs` trusted-root checks.
- Using a synthetic timestamp, edited manifest, or fixture-only run as production proof of source-change ingestion.
- Keeping the scheduler enabled after an expired decision; continuous operation requires a new reactivation decision with a new preflight.

### Retry-artifact publication trust boundary

The maintained runtime is Node 22, whose standard filesystem API does not expose
an OS-level `linkat(2)`/dirfd publication primitive. The CRITICAL alert retry
artifact therefore uses a Linux no-follow directory walk, private staging file,
and no-overwrite hard-link publication, bounded by an explicit deployment
identity contract: the scheduler/backend process must run as a dedicated service
UID; the repository root and every artifact ancestor must be canonical,
owner-owned by that UID, and not writable by group or other users. The publisher
fails closed when the platform, UID, ownership, mode, or ancestor identity does
not satisfy this contract. Same-UID actors with permission to rename or replace
the already trusted directories are outside the threat model; a deployment that
cannot enforce this boundary must not activate the scheduler.

## 2. Fixed Starting Identities And Runtime Constants

All execution commands must run from:

```bash
export WORKTREE_ROOT=/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation
cd "$WORKTREE_ROOT"
export RUN_ID=scheduler-activation-20260831-01
export RETRY_LABEL=retry-01
# Phase 0 must discover this from the running backend process before any read.
# Do not substitute a remembered or advertised port.
export API_BASE=DISCOVERED_LOOPBACK_API_BASE
# Set this only after the Preparation Gate checkpoint is committed. Replace
# CHECKPOINT_SHA with the exact SHA recorded in the active scheduler handoff;
# it must equal the worktree HEAD during Phase 0.
export SCHEDULER_CODE_HEAD=CHECKPOINT_SHA
```

The coordinator must verify, and record in the phase-0 evidence, these exact starting identities:

| Identity | Required value |
| --- | --- |
| Branch | `feat/automation-scheduler-continuation` |
| Scheduler continuation handoff commit | `34da1b21b6bd18579c5a5f93101c8c068a7233c4` |
| Scheduler code checkpoint | A clean, reviewed commit descended from `34da1b21b6bd18579c5a5f93101c8c068a7233c4`, recorded in the active devlog after the Preparation Gate below passes. Until that checkpoint exists, Phase 0 is blocked. |
| L2 promotion contract base | `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09` |
| Current policy set | H8 `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0` |
| Eight eligible domains | `items,npcs,projectiles,armor_sets,buffs,audio,bosses,shimmer` |
| Independent global readback | `sha256:34af46aacb92d171c232128712c47641cbb3882a689ae0fd18195302184445e0` |
| Database | MySQL `127.0.0.1:13306`, `terria_v1_local`, server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, Flyway V60 |
| Queue state | Redis `6380`, namespace `terrapedia:crawler:wiki-monitor:v2:` |
| Scheduler cadence | backend tick `60s`; planned `sweepIntervalMinutes=60`; V2 reconciler/watchdog `5s` |
| Freshness windows | preflight `15m`; request/decision authorization lifetime at most `24h` unless a separately reviewed bound is used |

The activation action mapping must remain exactly:

| Domain | Action ID | Owned tables |
| --- | --- | --- |
| Items | `wiki-items-refresh` | `items` |
| NPCs | `wiki-npcs-refresh` | `npcs` |
| Projectiles | `wiki-projectiles-refresh` | `projectiles` |
| Armor Sets | `domain-source-armor-sets` | `armor_sets`, `armor_set_items` |
| Buffs | `buff-page-immunity-refresh` | `buffs`, `buff_source_items` |
| Audio | `wiki-audio-assets-refresh` | `audio_assets`, `audio_asset_links` |
| Bosses | `domain-source-bosses` | `boss_groups`, `npcs` (shared fence) |
| Shimmer | `domain-source-shimmer` | `shimmer_item_transforms`, `shimmer_decraft_rules`, `shimmer_entity_transforms`, `shimmer_npc_transforms` |

### Schedule At A Glance

- Safety implementation Preparation Gate: about `2–6h` engineering and focused validation before any live Scheduler preflight. It closes the automatic-L2 scope, real-diff, reconciliation, and shared-table-fence contracts without live writes.
- Preparation (Phases 0–3): about `2–4h` of operator time, excluding human approval waiting. This includes the 185-file catalog, fresh preflight, proposal, and one new packet.
- First activation observation (Phase 4): about `15–30m` of operator time plus `0–60m` for the next due sweep; the average wait is about `30m` at a 60-minute interval.
- One real changed-domain proof (Phase 5): about `15–30m` after the changed probe is observed; expected end-to-end source-change-to-commit is about `35–45m` in the normal case and `60–70m` in the planning upper bound.
- Eight-domain confidence (Phase 6): `2–4h` active observation, or up to `24h` when waiting for natural upstream changes. No change event means `probe-only`, not a failed or fabricated write.
- Closeout and soak (Phase 7): `1–2h` for readback/rollback, followed by a `24h` soak only if a separate continuation authorization keeps the scheduler enabled. A transient failure or expired authorization can add another `0–60m` cycle.

## 3. Work Products And Ownership

The coordinator owns the scheduler lifecycle, database target, `docs/devlog/current.md`, the parent handoff entry, and final acceptance. The catalog helper is a separate read-only unit and may not touch scheduler state or the database.

Expected files and generated evidence:

| Path | Responsibility | Write rule |
| --- | --- | --- |
| `pipelines/automation/build-automation-evidence-catalog.mjs` | Read-only recursive inventory, hash, metadata extraction, classification, and `0600` output | New helper; no DB/API/network calls |
| `pipelines/automation/build-automation-evidence-catalog.test.mjs` | Count, mode, symlink, hash, collision, and forbidden-reuse tests | Must run without live services |
| `.local/tmp/automation-evidence-catalog-scheduler-activation-20260831-01.json` | Private catalog for the prior linked worktree | Never stage or commit |
| `.local/tmp/automation-scheduler-baseline-scheduler-activation-20260831-01.json` | Phase-0 read-only runtime baseline | `0600`, no overwrite |
| `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.preflight*.json` | Fresh preflight | `0600`, no overwrite; use a new retry identity if a prior path exists |
| `reports/authorization/canonical/automation-crawler-v2-scheduler-activation.retry-01.{input,request,owner-input,packet,result}.json` | New scheduler authorization chain | Unique retry label; never overwrite the tracked historical flat artifacts |
| `reports/runtime/automation-scheduler/scheduler-activation-20260831-01/` | Sweep, attempt, readback, latency, and rollback evidence | Private and content-addressed where the operation contract requires it |
| `reports/backend-refresh/history/` | Monitor-visible child progress records | Generated by the runner only; no hand-written progress |
| `reports/authorization/canonical/automatic/<domain>/<previewRunId>/` | Run-specific supplementary source and bundle artifacts | `0600`, ordinary files, no-overwrite; never reuse the historical flat `automation-*-first-l1` paths |
| `reports/runtime/l1-reconciliation/<domain>/<runId>/` | Automatic source-progress snapshot, source coverage, owned-table readback, attempt state, and reconciliation result | Derived from the frozen source run id; exact paths and `0600`, no-overwrite |
| `docs/devlog/entries/2026-08-31-automation-scheduler-activation-handoff.md` | Parent task state, validation, risks, and handoff | Coordinator only |
| `docs/devlog/current.md` | Short pointer to the active plan and next action | Coordinator only |

Existing tracked files named `canonical-crawler-v2-scheduler-activation.*` and `automation-crawler-v2-scheduler-activation.*` are historical evidence. Before every new write, assert the chosen output path does not exist; a collision is a stop condition, not permission to overwrite.

### Preparation Gate: close automatic-L2 implementation contracts before Phase 0

**Estimated time:** 2–6 hours of engineering and focused validation. This is a source-code/test gate only: it must not call a scheduler endpoint, start a sweep, refresh a source, run a crawler/import, or write a business table.

**Purpose:** Phase 5's runtime claim is unsafe unless the automatic runners prove their exact L2 policy scope, real change ceiling, reconciliation mode, and NPC/Boss shared-table fence before a Scheduler decision can be requested.

**Required code paths:**

- `pipelines/automation/prepare-supplementary-domain-l1-preview.mjs`
- `pipelines/automation/run-base-domain-automatic-operation.mjs`
- `pipelines/automation/run-supplementary-domain-automatic-operation.mjs`
- `pipelines/automation/run-supplementary-domain-l1-operation.mjs`
- `pipelines/automation/supplementary-domain-l1-contract.mjs`
- `pipelines/automation/l2-automatic-ceiling.mjs`
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`

**Acceptance criteria:**

- [ ] An automatic operation loads `ownedTables` from its current persisted `v2/L2/ACTIVE` policy and passes that exact ordered scope through context, bundle, generation/readback, and reconciliation. A static domain table list may validate physical membership but may not replace policy scope.
- [ ] Every `ACTIVATION_GATED_AUTO` bundle carries `policyJson.ownedTables`; its bundle scope equals the current policy scope exactly. Missing, broadened, narrowed, reordered, or non-domain tables fail closed before any write path.
- [ ] The automatic ceiling receives a real, producer-derived `l2Diff` from the candidate import plan. Missing or malformed diff evidence blocks the operation; no fabricated zero-diff/default payload is allowed.
- [ ] A row-changing SQL intent never substitutes statement count or a fabricated `affectedRows` value for a real row diff. Multi-row `INSERT`/`UPDATE`/`DELETE` is rejected unless a registered structured producer supplies trustworthy row-level evidence; an unsupported producer blocks before the automatic ceiling can pass.
- [ ] A shared `npcs` scope carries the declared `fieldGroup` and a verifiable `logicalPredicateHash`. The generation/fence layer uses that exact contract and refuses to infer a predicate from a hash. NPC or Boss work with an unverifiable fence remains fail-closed.
- [ ] Reconciliation accepts a valid automatic L2 bundle only when its execution mode, current policy identity, run-specific source progress, owned-table readback, attempt state, and full reconciliation evidence agree. It must not reject the bundle merely because it is not an L1 manual operation.
- [ ] V1 changed-only automation verifies the same Scheduler ADMIN eligibility before its source probe. V2 verifies it before probing and again inside the mutation closure immediately before every enqueue or retry control; an expired, missing, or revoked decision records `scheduler_activation_required`, persists the durable alert path, and dispatches no live work.
- [ ] Standard dispatch cleanup failure is a durable admission fence: startup orphan convergence, stale-lock admission, expired `starting` recovery, and dead queued-item reconciliation re-read and verify the current lock inside the cleanup publication/deletion monitor before deleting it. A missing queue-item `dispatchId` resolves the failure marker from the matched lock payload; a cleanup-failure writer re-reads the latest dispatch under that monitor and never overwrites a successor. The real watcher plus overview/reconciliation path proves failed cleanup retains the lock and prevents queued launch, while queue drain occurs only after lifecycle-monitor release.
- [ ] Every Scheduler-owned V2 automatic enqueue carries an immutable `SourceDispatchIdentity`: `sourceFingerprint`, `sourceRunIdentity`, and `sourceContentIdentity`. The scheduler canonicalizes each current eligible one-source action fingerprint to `sha256:<lowercase-content-hash>`; an unsupported/multi-source/non-content-hash action stops with an identity alert rather than dispatching. `sourceRunIdentity` is the exact validated probe `checkedAt`, and `sourceContentIdentity` is the exact validated probe-state SHA-256.
- [ ] The exact three-field source identity is persisted in the Redis V2 attempt, immutable attempt manifest, and immutable operation plan; the supervisor verifies all copies before launch and passes all three values to the child environment. Scheduler-owned attempt state with a missing, malformed, or mismatched identity terminalizes before child launch, runner work, database work, or source acknowledgement.
- [ ] V2 automatic recovery/deduplication is keyed by the immutable canonical source fingerprint held by attempts, not `automation-last-sweep.json`. A retry retains all three original identity values; an identical active/completed fingerprint dedupes or retries only that chain; a different fingerprint receives a distinct V2 attempt even while old sweep output exists. Legacy/missing scheduler-attempt identity fails closed rather than becoming a fresh attempt.
- [ ] Base and Supplementary child runners require the three environment values for Scheduler-owned invocation, canonicalize their freshly frozen source content to the same fingerprint, and reject a source drift before artifact publication, database transaction, or acknowledgement. The configured source-monitor state is read only through a repository-confined ordinary file, with no-follow descriptor access and same-object identity checks before and after the read; leaf/ancestor symlinks and replacement races fail closed. Their automatic bundle, persisted run/evidence manifest, source-coverage, owned-table-readback, attempt-state, reconciliation evidence, and final readback carry the identical source identity.
- [ ] Base and Supplementary automatic runners retain the start time only for run identity, then after source/preview completion re-read the exact activation identity and derive execution time from a fresh clock (at least `max(startTime, sourceCheckedAt, currentTime)`) immediately before mutation. An activation that expires or changes during source work fails before the executor begins; delayed/expiry regressions cover both runners.
- [ ] Every live source acknowledgement, including a committed-run reconciliation or DRY_RUN path, performs the same fresh exact activation identity and `max(startTime, sourceCheckedAt, currentTime)` validity check immediately before acknowledgement. If it is expired, revoked, or changed after a committed apply, the source remains unacknowledged for a later authorized recovery; acknowledgement performs no write.
- [ ] All automatic source/bundle/catalog publications are path-confined, ordinary-file, `0600`, no-overwrite operations. They reject symlinked or unsafe ancestors and collision/replace races before publication; a consumed supplementary preview bundle is never rewritten by its automatic runner.
- [ ] `three-database-commit-protocol` executes `preCommitVerifyWork` after recording intent but before its first staged mutation. A failed verification commits no stage and follows the existing failed/no-compensation result path.
- [ ] Every three-database executor consumes only an opaque capability minted
  through the protocol's module-private registry. The protocol itself creates
  the `mysql2` pools from constrained canonical connection configuration and
  acquires the borrowed handles; no public executor or acquisition API accepts
  caller-provided pools, `PromisePool`/`PromisePoolConnection` wrappers,
  streams, or factory hooks. Class identity and public backing fields alone
  are not provenance. The protocol takes one immutable data-only snapshot of
  the allowed manifest and connection-config fields before validation, pool
  construction, or identity checks; accessor-backed, mutable, or post-snapshot
  target changes cannot alter the acquired target or later readback contract.
  The capability retains module-private per-role
  connection identity, requires a release-capable borrowed handle, is one-shot
  and released on every completion/invalid path, detects a changed physical
  `threadId` before any query, and derives the callback connection map from
  that capability rather than trusting caller wrappers. Runtime readback must
  match each applicable role's server UUID, port, database name, and physical
  connection ID; same-server work performs that full SQL identity readback
  both before and immediately after `beginTransaction()` before intent, while
  cross-server roles use distinct pools and physical connections.
- [ ] Every intent, final, failure, and recovery transition performs its exact-one state write and `FOR UPDATE` identity readback inside one active coordinator transaction. A failed `beginTransaction()` issues no rollback; an uncertain coordinator `COMMIT`, `COMPENSATED`, or `COMPENSATION_FAILED` terminal outcome is exposed as `requiresReadbackReconciliation=true` for durable alert/reconciliation handling.
- [ ] Every failed recovery/status transaction start or commit preserves the
  original normalized post-commit/compensation error as the top-level carrier
  (including frozen or primitive causes), records the transaction failure as
  suppressed evidence, and forces `requiresReadbackReconciliation=true`; a
  recovery metadata failure must never replace a committed-business error with
  a clean or less-informative failure.
- [ ] Focused tests are added first and observed failing for each new rejection/acceptance case, then pass. Source-dispatch coverage includes enqueue/Redis serialization, attempt manifest and operation-plan immutability, supervisor environment and pre-launch rejection, retry preservation, same-fingerprint dedupe/new-fingerprint dispatch, Base/Supplementary frozen-source drift rejection, bundle/run/reconciliation/readback identity equality, and acknowledgement-time activation expiry/revocation. At minimum run the four automatic runner suites, the supplementary contract/reconciliation suites, the V2 application/supervisor/repository tests, and `l2-automatic-ceiling.test.mjs`; broaden to all automation tests before opening Phase 0.
- [ ] The source-health monitor focused Maven suite covers retry-outbox semantic corruption, ancestor/path replacement, atomic publication, and directory-sync failure; it must be green before opening Phase 0.
- [ ] The resulting code is committed as one focused scheduler-safety checkpoint, the active devlog records its SHA and validation, and the worktree is clean. That commit becomes `SCHEDULER_CODE_HEAD`; no uncommitted implementation is eligible for Phase 0.
- [ ] CRITICAL retry-artifact publication enforces the dedicated service-user boundary: current UID matches the repository/artifact owner, all trusted ancestors are canonical ordinary directories with no group/other write bits, and unsafe ownership/mode/platform cases fail before payload publication. The plan records same-UID directory replacement as out of scope and requires a deployment that can enforce the boundary.
- [ ] Source-health retry outbox reads and writes are serialized through one lock, reject malformed status or missing/blank `dedupeKey` entries, reject symlinked/non-canonical ancestors before lock/read/write, atomically replace only on the same validated parent, and surface directory `fsync` failure as a durable-write failure. A damaged outbox blocks healthy scheduler dispatch.
- [ ] Source-monitor initial runtime publication is inside the guarded failure boundary. A first-write failure returns a source-probe terminal `failed` result, attempts the durable CRITICAL alert path, and records terminal runtime state when the path becomes writable; it must not launch a probe or surface only an unclassified exception.

**Failure stop:** Any missing policy scope, absent real diff producer, unverified predicate, reconciliation-mode mismatch, or failing focused test blocks Phase 0/2/3. Repair the contract and tests first; do not compensate by enabling the Scheduler, weakening a check, or using synthetic diff evidence.

## 4. Phase Plan

### Phase 0: Lock scope and capture a read-only baseline

**Estimated time:** 30–45 minutes.

**Inputs:** this plan, the scheduler handoff entry, the H8/global readback identities above, current code, and the live local stack if available.

**Allowed actions:** Git reads, health reads, authenticated monitor reads, MySQL read-only queries, Redis `PING`, and creation of one private baseline JSON. Starting an already-stopped local stack is allowed only through `bash ./platform/local/start-local-stack.sh`; it is not permission to mutate scheduler state.

**Commands:**

```bash
git status --short --branch
test "$(git rev-parse HEAD)" = "$SCHEDULER_CODE_HEAD"
git merge-base --is-ancestor 34da1b21b6bd18579c5a5f93101c8c068a7233c4 "$SCHEDULER_CODE_HEAD"
node --check pipelines/monitor/check-source-updates.mjs
node --check pipelines/automation/run-base-domain-automatic-operation.mjs
node --check pipelines/automation/run-supplementary-domain-automatic-operation.mjs
```

Read, using the authenticated loopback API configured for the running backend:

```text
GET "$API_BASE/api/actuator/health"
GET "$API_BASE/api/admin/crawler-monitor/v2/automation"
GET "$API_BASE/api/admin/crawler-monitor/v2/automation/preflight"
GET "$API_BASE/api/admin/crawler-monitor/overview"
```

The exact API base must be discovered from the running process. At the latest
plan audit it was `http://127.0.0.1:18102`; this is an observation, not a
default. An unreachable advertised or remembered port is not silently
substituted. Read MySQL server UUID, Flyway version, current policy rows,
current activation decisions, live attempts, reservations, fences, and
scheduler sweep claims with `START TRANSACTION READ ONLY` and `ROLLBACK`.
Query Redis only for the V2 namespace and health.

**Outputs:** `.local/tmp/automation-scheduler-baseline-scheduler-activation-20260831-01.json` with timestamps, API base, Git identity, database identity, Redis identity, policy rows/hash, control state, counts, reconciler health, and query method; no credentials.

**Acceptance criteria:**

- [ ] Scheduler worktree is clean and at the exact branch plus recorded `SCHEDULER_CODE_HEAD` above; no private evidence was copied into it.
- [ ] MySQL UUID/database/Flyway, Redis namespace, and API health match the fixed runtime boundary; health is HTTP `200` and Redis is `PONG`.
- [ ] All eight policies are `v2/L2/ACTIVE` and the computed live policy-set hash equals H8; the eligible set is exactly the eight rows above with no duplicate domain/action IDs.
- [ ] Control is `enabled=false`, `mode=changed-only`, with an integer interval of at least `1`; live attempts, sweep claims, reservations, and active fences are `0`; reconciler is healthy with zero overdue/failure counts.
- [ ] There is no current unexpired `SCHEDULER_ACTIVATION` decision for `crawler_v2_scheduler`.
- [ ] The baseline file is `0600`, ordinary (not a symlink), self-hashing, and not staged.

**Failure stop:** any hash/port/server/epoch/namespace/policy mismatch, active writer/attempt/fence, current scheduler decision, unavailable authenticated ADMIN read, or dirty scheduler worktree. Repair the environment or start a new evidence root; do not continue with a stale baseline.

### Phase 1: Inventory and classify the 185 retained evidence files

**Estimated time:** 45–90 minutes once the catalog helper exists; one-time helper implementation and tests add 1–2 hours.

**Source root:** `/home/lolben/TerraPedia/.worktrees/automation-ingestion-continuation`. It is a separate linked worktree and remains the source of truth for these private files. Do not copy them into the scheduler worktree.

The source inventory must contain exactly:

| Class | Count | Meaning |
| --- | ---: | --- |
| Eight-domain L2 automation evidence | 131 | Consumed promotion evidence; historical identity only |
| Historical source-hash disposition evidence | 45 | Approved explanation of legacy semantic-JSON/current-byte drift; historical exception only |
| Audit reports | 4 | Baseline read-only audit context |
| Relation reports | 4 | Baseline read-only relation context |
| `v2-preflight-readback.json` | 1 | Historical preflight baseline; not fresh authorization |
| **Total** | **185** | Must remain unchanged |

**Implementation steps:**

- [ ] Create the read-only catalog helper at `pipelines/automation/build-automation-evidence-catalog.mjs`. It must accept an explicit source root and a confined private output path, refuse symlink roots/files/ancestors, reject output collisions without overwrite, hash file bytes with SHA-256, record byte length/mode, parse `generatedAt`/`checkedAt`/`createdAt`/`authorizedAt` when present, and mark filesystem mtime as non-authoritative when no content timestamp exists.
- [ ] Emit one entry per file with `sourceRoot`, repository-relative path, absolute source path for local audit only, SHA-256, bytes, mode, symlink status, domain, role, generation-time field/source, `classification`, `consumed`, `historicalException`, `reusableFor`, and `forbiddenUses`. For live source evidence, retain the exact probe `sourceHash` separately from the catalog's file-byte hash.
- [ ] Classify L2 packet/request/owner-input/result/commit-marker/execution-manifest artifacts as `consumed`; classify the 45 disposition artifacts as `historical-exception`; classify audit/relation/preflight artifacts as `baseline`. Preserve any finer role in the entry instead of collapsing it.
- [ ] Add `build-automation-evidence-catalog.test.mjs` coverage for exact counts, missing files, symlink/unsafe-ancestor rejection, collision/no-overwrite publication, non-`0600` rejection, byte-hash drift, duplicate basenames with distinct full paths, absent content timestamps, and forbidden replay flags.
- [ ] Write the catalog under `.local/tmp/automation-evidence-catalog-scheduler-activation-20260831-01.json` with mode `0600`; re-read and hash every source file after writing the catalog.

**Outputs:** the private catalog and a short catalog summary appended to the handoff entry. No source file, Git index, database row, Redis key, or scheduler setting may change.

**Acceptance criteria:**

- [ ] Catalog entry count is exactly `185`, with category counts `131/45/4/4/1` and no `other` entries.
- [ ] Every entry points to an existing ordinary file under the declared source root; every source file is `0600`, non-symlink, and its recorded SHA-256 matches a second read.
- [ ] Every entry has a domain or `global`, a role, a generation-time value or explicit `unavailable` status, a classification, a `consumed`/`historicalException` flag, at least one `reusableFor` value, and a non-empty `forbiddenUses` list.
- [ ] The catalog itself is `0600`, self-hashable, ignored by Git, and contains no password/token/permit secret.
- [ ] A targeted scan proves no catalog command calls an HTTP endpoint, writes MySQL/Redis, or invokes a crawler/import runner.
- [ ] Re-running against unchanged source files produces the same entry hashes and count. Any path/hash drift fails closed.

**Failure stop:** count mismatch, missing/changed/symlinked/private-mode violation, inability to distinguish a same-named file by full path, or any attempted source copy. Preserve the original 185 files and open a catalog repair step.

### Phase 2: Run contract tests and create a fresh scheduler preflight

**Estimated time:** 30–60 minutes, including stack/API startup if needed.

**Read-only contract tests:**

```bash
node --test \
  pipelines/automation/crawler-v2-scheduler-activation-preflight.test.mjs \
  pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs \
  pipelines/automation/build-canonical-scheduler-activation-request.test.mjs \
  pipelines/automation/capture-crawler-v2-scheduler-activation-input.test.mjs \
  pipelines/automation/canonical-operation-execution-manifest.test.mjs
```

The exact T1 input is the tracked, passed and cleaned report:

```text
reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json
```

Create a new preflight only through the existing read-only collector. Use a new retry-labelled output if the historical fixed path already exists; never overwrite an old preflight:

```bash
node pipelines/automation/crawler-v2-scheduler-activation-preflight.mjs \
  --api-base="$API_BASE/api" \
  --t1-report=reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json \
  --output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-01.preflight.json
```

The collector must derive its code bundle from the operation manifest and must read the authenticated preflight endpoint only. It may not call `PUT`, `POST`, sweep, claim, enqueue, a source fetch, or an external daemon.

**Outputs:** fresh preflight JSON, its `preflightHash`, the observed policy rows/hash, the V2 epoch/namespace, domain readiness reports/hashes, and a test log. The output must be private and no-overwrite.

**Acceptance criteria:**

- [ ] All focused tests pass with zero failures; the manifest-derived code bundle path set is exact and its file hashes match the current worktree.
- [ ] Preflight is no more than `15m` old at the next phase and has `databaseWrites=false`, `networkAccess=false`, and `isolatedResourceWrites=false`.
- [ ] Control is disabled/changed-only; live attempts and sweep claims are zero; reconciler is healthy with no overdue/failure work; V2 epoch/namespace/contract version are present.
- [ ] Exactly eight domain readiness rows are `eligible`, with action IDs and source hashes matching the fixed mapping; no force/fixture action is included in the activation set.
- [ ] The eight eligible domain policy rows are H2-or-later `L2/ACTIVE`; the scheduler policy row `crawler_v2_scheduler` remains the separately checked `L1/ACTIVE` control policy; together the current rows compute exactly H8. The preflight policy hash is not copied from the old tracked artifact.
- [ ] T1 report is `passed`, `scheduledTickObserved=true`, `cleanupPassed=true`, and its byte hash matches the preflight binding.
- [ ] Fresh preflight output is `0600`, an ordinary file, self-consistent with `preflightHash`, and does not overwrite any existing artifact.

**Failure stop:** stale or blocked readiness, H8 drift, changed server/epoch/namespace, active work, code-bundle drift, old output-path collision, or any mutation/network observed. Do not build a proposal from a failed or historical preflight.

### Phase 3: Build a new packet and obtain independent ADMIN/Owner authorization

**Estimated time:** 20–45 minutes of operator work plus human approval latency.

**Identity rule:** The prior L2 promotion approvals and any historical scheduler activation artifacts are not authorization for this phase. Use `retry-01` (or the next unused retry label) consistently across proposal/request/owner-input/packet/result and a new `decisionIdentity` absent from both the canonical ledger and the database.

**Commands:**

```bash
node pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs \
  --preflight=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-01.preflight.json \
  --t1-report=reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json \
  --output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-01.proposal.json

node pipelines/automation/build-canonical-scheduler-activation-request.mjs \
  --proposal=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-01.proposal.json \
  --output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-01.request.json

node pipelines/automation/canonical-operation-execution-manifest.mjs \
  --operation-id=automation-crawler-v2-scheduler-activation \
  --result-label=retry-01 \
  --output=reports/authorization/canonical/automation-crawler-v2-scheduler-activation.retry-01.execution-manifest.json
```

The request must be presented to the Owner before creating the packet. The Owner input must supply `actor`, `reason`, `authorizationReference`, `decisionIdentity`, `authorizedAt`, and a bounded future `expiresAt`; it must contain no credential or permit secret. Build the packet through `build-canonical-cutover-authorization.mjs` with the exact request hash, current policy rows, current server fingerprint, canonical execution manifest, and `used-decisions.json`. The packet must remain unique and private.

Consume the new packet once through the canonical policy-decision/authorized-operation path described by that execution manifest. The resulting command must use the matching retry-labelled input/result paths and `--apply=true`. The policy operation is `automation-crawler-v2-scheduler-activation` with `decisionKind=SCHEDULER_ACTIVATION` and `domainId=crawler_v2_scheduler`; it must not be inserted with SQL.

**Acceptance criteria:**

- [ ] Proposal is `proposalOnly=true`, `authorizationStatus=AWAITING_OWNER`, no-write, loopback-`PUT` only, and binds the fresh preflight hash, T1 hash, code-bundle hashes, H8 policy set, and exactly eight eligible domains.
- [ ] Request hash and embedded proposal hash verify; request expiry is future and bounded; all output paths are under `reports/authorization/canonical/`, private, ordinary, and new.
- [ ] Owner approval is an explicit independent ADMIN authorization for one scheduler activation window, not an inference from the eight L2 promotion decisions.
- [ ] New `decisionIdentity` is absent from `used-decisions.json` and from the database before consumption; the packet hash verifies against the request and current technical inputs.
- [ ] Exactly one new policy decision result is emitted with `status=completed`, `decisionKind=SCHEDULER_ACTIVATION`, current H8 policy hash, actor/reason/reference, expiry, and the new decision/packet identity.
- [ ] Independent post-consumption readback finds the same decision once, with no duplicate identity, and confirms no domain L1 history was fabricated by scheduler authorization.

**Failure stop:** missing Owner fields, expired/stale request, reused identity, policy/server/code hash drift, existing output, packet/request mismatch, or any decision count other than one. A consumed failed identity is never retried; create a new retry identity only after a new preflight.

### Phase 4: Fresh pre-enable check, activate through ADMIN API, and observe a natural tick

**Estimated time:** 15–30 minutes of operator work plus `0–60m` wait for the first due sweep (average about `30m`).

Immediately before the control mutation, run the read-only preflight endpoint again and compare every safety axis with the packet-bound preflight: H8, server UUID/database, V2 epoch/namespace, disabled/changed-only control, zero attempts/claims/fences, healthy reconciler, and all eight eligible domains. This closes the authorization-to-enable TOCTOU window.

Enable only through the authenticated loopback endpoint:

```http
PUT "$API_BASE/api/admin/crawler-monitor/v2/automation"
Content-Type: application/json

{"enabled":true,"mode":"changed-only","sweepIntervalMinutes":60}
```

Do not call `POST /v2/automation/sweep`, test-domain smoke, force refresh, or a child daemon. Let `scheduledV2AutomationSweep` run on its normal `60s` backend tick and due interval. The V2 reconciler/watchdog remains on its `5s` schedule.

**Acceptance criteria:**

- [ ] Pre-enable readback is fresh and matches the packet on every safety axis; any drift aborts before `PUT` and requires a new request/packet.
- [ ] `PUT` returns HTTP `200` through an authenticated ADMIN session, and a subsequent `GET /v2/automation` reads `enabled=true`, `mode=changed-only`, `sweepIntervalMinutes=60`.
- [ ] One `lastSweep.checkedAt` is later than the enable time and proves a natural scheduled sweep; command logs prove no manual sweep endpoint, force action, external daemon, or direct Redis/JSON control write.
- [ ] If no source is changed, the sweep records all eight source observations and `automation_disabled` is absent; unchanged domains are skipped without attempts. If a source is changed, exactly one action enters Phase 5.
- [ ] Scheduler decision remains unexpired and bound to the same H8/policy/server identity; zero duplicate current decisions exist.

**Failure stop/rollback branch:** On any enable error, stale decision, unexpected attempt, unhealthy reconciler, or malformed sweep, issue the authorized API-only rollback body `{"enabled":false,"mode":"changed-only"}`, then verify disabled state, zero live work, and healthy reconciler. Do not delete or rewrite the failed decision; record a new follow-up identity.

### Phase 5: Prove one real source-change-to-database canary

**Estimated time:** 15–30 minutes after a real `changed=true` probe, plus source-wait time. A normal source event should commit in 1–5 minutes for base domains and 3–10 minutes for Audio/Bosses/Shimmer after claim.

The canary domain is the first naturally changed eligible domain in sorted domain order. Do not alter the source manifest to manufacture `changed=true`. If no real change occurs during the agreed observation window, record `probe-only` and keep the plan active for a later naturally changed event.

Trace the complete chain using immutable paths and timestamps:

1. `pipelines/monitor/check-source-updates.mjs` emits the source report/state and progress heartbeat for all nine managed sources (five base plus three supplementary plus the existing biome source; official feeds remain observational unless explicitly configured).
2. The scheduler records the changed source key/fingerprint and dispatches its registered action once.
3. Redis V2 creates/claims the attempt; the reconciler renews leases and publishes monitor-visible progress.
4. The correct runner executes: `run-base-domain-automatic-operation.mjs` for Items/NPCs/Projectiles/Armor Sets/Buffs or `run-supplementary-domain-automatic-operation.mjs` for Audio/Bosses/Shimmer.
5. The runner freezes the source, binds current H8, writes the L1 bundle, applies only the owned table set in one transaction, and emits result/evidence/readback.
6. Live source acknowledgement occurs only after a committed apply; a failed or unstable source remains unacknowledged and is retried only through the V2 recovery contract.

Every probe and child runner must satisfy the crawler progress contract: write a complete `actionId`/`status`/`generatedAt`/`lastHeartbeatAt`/`childStatusPath`/`phase`/`message`/`current`/`total` payload before its first network request or long loop, update the heartbeat during work, and finish with `completed` or `failed`. The explicit progress path is the backend `childStatusPath`/`TERRAPEDIA_CRAWLER_PROGRESS_PATH`; arbitrary report files do not count as monitor progress.

**Acceptance criteria:**

- [ ] The source report has one exact changed source key, canonical `sourceFingerprint`, `sourceRunIdentity`, `sourceContentIdentity`, report byte hash, and a probe timestamp; the source did not come from the 185 historical catalog.
- [ ] Exactly one V2 attempt/run is bound to that immutable three-field source identity and action; Redis, attempt manifest/operation plan, child environment, automatic bundle, reconciliation evidence, persisted run evidence, and readback agree. No duplicate dispatch, stale attempt, or V1 queue record owns the work.
- [ ] Attempt progress reaches a truthful terminal state, with bounded deadline/lease evidence and no orphaned child process; the result, evidence set, apply row, bundle, and run IDs agree.
- [ ] The source probe and child runner tests prove default and explicit progress paths, required payload fields, pre-network progress publication, heartbeat updates, atomic writes, and terminal `completed`/`failed` state.
- [ ] The transaction commits with the packet-bound policy set H8, current domain policy `L2/ACTIVE`, exact owned tables, and generation/readback evidence. No non-owned table changes are observed.
- [ ] Supplementary automatic preview artifacts use a fresh run-specific canonical directory, are private ordinary files, and refuse an existing path before source work; historical flat L1 evidence is never overwritten.
- [ ] Every automatic base or supplementary bundle carries the exact run-scoped reconciliation paths; Base freezes its completed source progress before outer DB-apply heartbeats, and the adapter reads that explicit terminal artifact before producing full reconciliation evidence.
- [ ] Full reconciliation evidence covers source coverage, owned-table readback, attempt state, and reconciliation output; current API/admin/public reads expose the committed data where that domain has a runtime projection.
- [ ] A live source manifest `sourceAcknowledgement` is written only after `COMMITTED`; for `--source-mode=local`, the result explicitly says `sourceAcknowledged=false`.
- [ ] A pre-commit failure rolls back the active transaction and upserts one `CRITICAL` durable alert; a post-commit verification failure runs the guarded compensation path, records `COMPENSATED` or `COMPENSATION_FAILED`, and exposes the result through the same alert ledger.
- [ ] Latency timestamps are recorded as `sourceChangedAt`, `sweepCheckedAt`, `attemptClaimedAt`, `runnerStartedAt`, and `committedAt`, with `source-to-sweep`, `sweep-to-claim`, `claim-to-commit`, and total durations.

**Failure stop:** source error/instability, policy-set drift, a non-owned table mutation, duplicate dispatch, lease loss without reaping, non-terminal result, failed reconciliation, or acknowledgement before commit. Roll back the scheduler through the API and preserve all failure evidence.

### Phase 6: Validate all eight domains and the shared-table fence

**Estimated time:** 2–4 hours of active observation; allow up to 24 hours for natural source events. The plan does not claim eight database writes when the upstream has not changed eight sources.

Keep the exact eight-domain authorization set. For each scheduled sweep, record all eight probe outcomes, changed/unchanged status, action ID, source hash, skip reason, attempt ID, and result. A changed domain follows Phase 5's chain; an unchanged domain must not create an attempt.

The scheduler/reconciler must enforce this table ownership matrix:

- NPCs and Bosses may both be eligible, but their writes to `npcs` must never overlap. One active write fence owns the table at a time; the other attempt remains queued/retry-wait with an explicit reason.
- Armor Sets, Buffs, Audio, and Shimmer may run independently only when their owned-table sets do not conflict with another live attempt.
- Items and Projectiles may not inherit NPC/Boss data through a display-name match or a generic relation fallback.

**Acceptance criteria:**

- [ ] At least one fresh source-probe result exists for every one of the eight domains in the observation root; no probe error is silently treated as unchanged.
- [ ] For every naturally changed source observed, there is at most one attempt for that source fingerprint, and every unchanged source has zero new attempts.
- [ ] NPC/Boss concurrent-dispatch evidence shows no overlapping `npcs` write fence, no duplicate active owner, and a truthful queue reason for any serialized work.
- [ ] Every completed run's table readback is a subset of its declared owned tables; shared-table writes are attributed to the owning domain/action and are transactionally reconciled.
- [ ] A policy, epoch, namespace, server, code-bundle, or source-hash drift blocks new dispatch and creates a diagnostic record; it never reuses the old packet.
- [ ] Automatic retry/recovery follows the existing V2 decision contract: resumable domains use `resume` only when the action capability says so, non-resumable work pauses, and the retry limit records `automatic_retry_limit_reached`.
- [ ] Source-probe, activation-gate, dispatch, attempt, sweep, and retry-limit failures are upserted by stable `dedupeKey` in `crawler_automation_alert`; repeated scheduler ticks do not create duplicate rows.
- [ ] If fewer than eight real source changes occurred, the report labels the missing writes `no-natural-change-observed` and remains open for a future event instead of passing by fixture substitution.

**Failure stop:** shared-table overlap, cross-domain mutation, silent probe error, duplicate run, retry-limit bypass, or any attempt to expand the authorized set. Disable the scheduler if the fence cannot be proven.

### Phase 7: Post-readback, latency report, rollback, and long-running handoff

**Estimated time:** 60–120 minutes for closeout plus a 24-hour soak when continuous enablement is approved.

At the end of the initial authorization window, choose one explicit terminal state:

- **Continue:** retain `enabled=true` only while the current scheduler decision is unexpired, all post-readbacks are healthy, and the Owner has separately authorized continued operation. Before expiry, create a fresh `automation-crawler-v2-scheduler-reactivation` request/decision with a new preflight; never extend the old decision in place.
- **Rollback:** call the authenticated loopback `PUT` with `{"enabled":false,"mode":"changed-only"}` and verify convergence. A rollback is a control-state change, not deletion of history.

Run an independent readback after the final choice:

- API: scheduler settings, last sweep, overview, live queue, reconciler health, and attempt logs.
- MySQL: current policy rows/H8, decision identity/packet hash/expiry, run/apply/evidence rows, owned-table generations, and zero active attempts/reservations/fences.
- Redis: V2 namespace health, no stale claims, and no retained lease after terminal runs.
- Runtime: domain API/admin/public projection checks for every changed domain, plus cross-DB and relation-health checks where the domain contract requires them.
- Files: result/bundle/progress/readback hashes, `0600` mode, ordinary-file and path-confinement checks, and no catalog/source artifact drift.

**Acceptance criteria:**

- [ ] Final state is unambiguous: either enabled with a current decision and healthy zero/known bounded work, or disabled with API readback confirming rollback; no expired-enabled state is accepted.
- [ ] A post-readback hash binds the final decision, H8/policy rows, activation packet, source reports, run/apply/results, and latency summary; all counts and identities agree.
- [ ] All changed-domain results are terminal and reconciled; live attempts/reservations/fences/claims are zero unless a specifically recorded bounded run is still active.
- [ ] The admin overview returns OPEN durable scheduler alerts, maps severity to notification level, and the notification store suppresses a second toast for an already persisted event after browser restart.
- [ ] The latency summary reports observed values and the planning envelope: sweep wait `0–60m` (average about `30m`), source probe `2–3m`, queue claim normally under `5s`, base commit `1–5m`, supplementary commit `3–10m`, normal end-to-end about `35–45m`, planning upper bound about `60–70m`.
- [ ] Any source/API/DB/auth/hash failure is marked fail-closed and includes its next retry trigger; an extra scheduler cycle may add up to `60m`.
- [ ] `docs/devlog/current.md` points to the active/closed handoff and the next action; the parent entry records exact evidence paths, validation output, residual risks, and whether the scheduler is intentionally left enabled or rolled back.
- [ ] Final docs/process validation passes: `git diff --check`, targeted consistency scans, `git status --short`, and explicit staged-stat review. No unrelated report, private evidence, or generated runtime artifact is staged.

**Failure stop:** any final readback mismatch, lingering lease/fence, expired decision while enabled, missing latency timestamps, or unrecorded failure path. Keep the entry `active` or `blocked` and do not claim closure.

## 5. Execution Continuity And Repair Rules

If any phase discovers a contract or runtime gap:

1. Stop at that phase's acceptance gate and preserve the failing evidence.
2. Classify the gap as safety-critical (mutation risk), important (closure cannot be proven), or minor (documentation/observability only).
3. For safety-critical or important gaps, patch this plan and the relevant tests/contracts, run the TerraPedia plan-auditor checklist again, and create a new no-overwrite evidence root. Do not continue with a stale packet or partial readback.
4. For a transient source/API failure, keep the scheduler disabled or roll it back, record the failure, and retry only with a new fresh preflight when the dependency is healthy.
5. For a real source change that arrives after the observation window, keep the plan open and resume at Phase 5 with the still-current decision only if it remains unexpired and all safety axes match; otherwise request a new decision.
6. Never repair by editing a hash, reusing a consumed identity, copying a linked-worktree file, or substituting a fixture for production evidence.

## 6. Plan Audit Checklist

### Goal lock

- The closure target is a measurable source-change-to-database result plus an explicit final scheduler state.
- Historical evidence retention is separate from new payload creation.

### Source-chain lock

- Source probes, state/report hashes, V2 sweep, queue/reconciler, domain runners, transaction-bound tables, source acknowledgement, API/UI readback, and latency evidence are named.
- H8, server UUID, V2 epoch/namespace, and shared NPC/Boss table ownership are explicit.

### Boundary and evidence lock

- No old packet/permit/decision is replayed; no direct SQL/Redis/control JSON/manual sweep is allowed.
- Every phase has inputs, outputs, acceptance criteria, and failure stop conditions.
- Private evidence is `0600`, no-overwrite, ordinary-file, and path-confined.

### Runtime closure lock

- Natural scheduled tick is required; no synthetic source change is accepted.
- At least one real changed event is required for a database-ingestion claim; otherwise the result is honestly `probe-only`.
- Final verification includes rollback or current unexpired enablement, zero leaked queue resources, and independent DB/API/readback.

### Commit and handoff lock

- Only the plan/helper tests/devlog changes belong in the planning commit; runtime/private evidence stays untracked.
- Before any commit, run `git status --short` and `git diff --cached --stat`, then record validation and residual risk in the parent entry.

**Audit verdict:** execution-ready as a gated plan. The 2026-08-31 repair review closed the important artifact-boundary gap by requiring run-specific private automatic preview paths, no-overwrite before source work, explicit completed progress binding, and default run-scoped reconciliation paths. The 2026-09-01 review additionally records the Node 22 retry-publication trust boundary: dedicated service UID, canonical owner-owned ancestors, owner-only writable directories, and same-UID replacement explicitly outside the threat model. The 2026-09-03 repair review adds post-preview fresh-time/activation revalidation for both automatic runners and guarded initial source-monitor runtime publication. The plan still intentionally stops before scheduler mutation until the Preparation Gate, Phase 0/2 freshness, and a distinct ADMIN/Owner authorization all pass.
