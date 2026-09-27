# Automation Scheduler Authorization List

## Status

`active`

## Purpose

This register records the user's standing authorization for the active
`automation-scheduler-continuation` task. It replaces repeated chat
confirmation for actions already listed here. It does not replace the runtime
contracts that require a new, non-reusable packet, fresh preflight, and
readback for each individual action.

## Authorization Source

- Decision owner: user directing this Codex session.
- Decision time: 2026-09-19 CST.
- Standing reference:
  `user://conversation/2026-09-19/automation-scheduler-standing-01`.
- Scope lifetime: until this active scheduler handoff is closed, the user
  explicitly revokes it, or this worktree/target server identity changes.
- Runtime packet actor: `admin`, only because the local MySQL automation Owner
  record is `admin/ACTIVE`; every generated packet must retain the standing
  reference plus a unique phase/action suffix.

## Guardrails

Supplemental A6 authorization recorded 2026-09-26:
`user://conversation/2026-09-26/armor-secondary-projections-approved-01`.
The user answered "是 继续按照计划执行 把整个自动化入库流程跑通" to the exact
two-table scope request. It authorizes implementation and fresh serial governed
publication of existing Armor-member attributes into
`relation.projection_item_armor_attributes`, and existing frozen item-owned
`armor_attribute_cell` effects into
`relation.projection_equipment_effect_attributes`. Preserve unrelated rows and
existing IDs. New IDs require explicit source-identity bindings and collision
checks. No local item writes, new set-effect source, broad rebuild, DDL, H8
expansion or scheduler activation is included. This supersedes the earlier
"not granted" status for this exact amendment, not packet/fence/readback gates.

Supplemental user authorization recorded 2026-09-24:
`user://conversation/automation-canonical-ownership-repair-approved-01`, exact
request "授权了 生成授权信息然后开始执行" followed by "继续任务".
This approves the bounded Armor/Buff/Shimmer ownership repairs identified in
the plan, their required scoped registration/policy contracts, and fresh serial
local canonical execution after technical validation. The previous statement
that these three lanes lack user approval is superseded. It is not an executable
packet and does not waive the guardrails below. Implementation/readback is owned
by `2026-09-24-canonical-ownership-execution.md`.

- Target is only the local stack: MySQL `127.0.0.1:13306`, Redis `6380`,
  backend `18102`, and the current scheduler worktree.
- Every database write uses a registered canonical operation, a fresh
  server/policy/source identity, an immutable packet/result, and a post-write
  readback. No direct SQL DML is an allowed substitute.
- Scheduler work is one registered action at a time, uses natural background
  ticks only, records monitor-visible progress, and restores
  `enabled=false` after every bounded window. `/sweep` is never authorized.
- A failed preflight, identity drift, active attempt/fence, unhealthy source,
  unavailable service, or failed readback is an automatic stop for that
  phase. Record it here and continue only with the smallest safe repair or
  the next independent phase.
- This register permits automatic technical reauthorization packets. It does
  not permit reusing expired packets, stale preflights, stale decisions, or
  consumed decision identities.

## How To Read Status

- `active`: Codex may execute the listed local operation without asking again,
  subject to its fresh preflight and readback gates.
- `waiting`: the operation is safe in principle but its declared prerequisite
  is not currently due or available; no user confirmation is being requested.
- `blocked`: a runtime safety gate stopped the operation automatically. This
  is not a request for user authorization. The next action is the read-only or
  governed repair named in the row; no blind retry is performed.
- `pending`: earlier gates have not been reached yet. It is not an error and
  does not authorize skipping those gates.

Historical stop descriptions below remain evidence, not current next actions.
The 2026-09-22 continuation is owned by
`2026-09-22-automation-ingestion-plan-repair.md`. Its technical safety blocks
do not revoke standing authorization, and standing authorization does not waive
them or permit ad-hoc Redis edits.

## Authorization Progress

| ID | Authorized scope | Status | Current evidence / next transition |
| --- | --- | --- | --- |
| AUTH-01 | Read-only source, API, MySQL, Redis, report, policy, and preflight inspection for the active chain. | active | Continuous; record only material state changes. |
| AUTH-02 | Start, restart, stop, and health-check this worktree's local stack; recover its local services with canonical scripts. | active | Canonical restart at 2026-09-22 18:41 CST passed. Fresh JVM 616977 readback uses primary durable root, this worktree command root, Redis DB14 and scheduling=true. Backend UP; persisted control remains false, live attempts/claims 0/0, H8/epoch unchanged. |
| AUTH-03 | Code, test, plan, devlog, and authorization-artifact work scoped to this branch. | active | Existing implementation is uncommitted. The deployed V2 command-root repair and the P1 canary-scope/bundle repair have RED-GREEN coverage; the activation bundle pins the request builder, capture, decision runner, API DTO, policy interface, V2 launch paths, and V61 migration. Preserve unrelated tracked and generated changes. No commit/cleanup is authorized implicitly. |
| AUTH-04 | Fresh append-only L2 policy-stable reauthorization for `items`, `npcs`, `projectiles`, `armor_sets`, `buffs`, `audio`, `bosses`, and `shimmer`. | active | Retry-24 decisions 66–73 consumed serially and uniquely read back at unchanged H8. Retain them as persisted decisions, never replay their packets. No renewal is needed while the current decision remains fresh and policy-stable. |
| AUTH-05 | Scheduler policy activation and bounded natural-tick canaries for the eight registered actions, one action at a time. | blocked | Retry-42/decision75 consumed: natural projectiles attempt `attempt-05bc9dc1-ec64-4b5b-aef2-d1b8fb7d068c` completed with gate passed but zero inserts/updates (`1111/1111` skipped); control restored false at `2026-09-22T12:20:05.447Z`. Artifact isolation and recovery passed; this is mechanism/no-op only. Do not reuse decision75. Projectiles fence remains until `2026-09-22 22:16:03`; no next window before fresh source change and fence expiry/readback. |
| AUTH-06 | Source-monitor checks, registered source refresh/crawl, standardization, and monitor-progress updates for the eight scheduler domains. | active | 2026-09-22 source checks 9/9 healthy; natural Retry-41 probe dispatched only projectiles. Child source refresh completed, but import blocked on artifact collision. Maintain exact monitor-visible progress and no concurrent source writer. |
| AUTH-07 | Registered automatic canonical import/apply operations into local terria_v1_local, terria_v1_maint, and terria_v1_relation, one domain/action at a time. | blocked | Projectiles Retry-42 reached apply but was a verified no-op; no D acceptance. Armor/Buff canonical lineage and Shimmer cross-owner auxiliary writes independently block full data-visible acceptance. No widening H8/ownership or manual repair operation is implied. |
| AUTH-08 | Failure compensation/rollback that the registered operation itself requires to preserve its write fence and consistency. | pending | Only restorative compensation within the active operation's declared tables; no discretionary cleanup or broad restore. |
| AUTH-09 | Explicit local V2 state-store epoch reset through the authenticated cutover endpoint. | blocked | User supplied the exact confirmation `RESET_CRAWLER_QUEUE_V2_EPOCH`, so this action is authorized for the local target. The formal preflight did not permit execution: durable marker and Redis both read `mode=V2`, `cutoverId=crawler-v2-20260717T175352Z`, epoch `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`, and identical `firstLiveMutationAt=2026-08-11T19:43:12.005608776Z`; `CrawlerQueueV2CutoverService` rejects a healthy same-state-store reset. No endpoint call, maintenance transition, marker write, Redis write, or queue-history reset occurred. |

## Explicitly Not Authorized

- Production, remote, or non-loopback targets.
- Schema changes, DDL, truncation, broad deletion, manual SQL writes, direct
  Redis writes, direct JSON state edits, forced queue reset, or a manual
  scheduler sweep.
- Unregistered crawler/import commands, arbitrary external downloads, or a
  new domain/action not listed in the active catalog.
- Git history rewrite, broad cleanup, worktree removal, force push, push,
  merge, or commit without the normal validation/closeout checks.
- Cross-task database writes, user-auth data changes, secrets rotation, or
  changes outside the current active scheduler handoff.

## Update Protocol

For every material phase, update this file and the parent scheduler handoff
with: action/phase ID, exact packet or run identity, whether a write occurred,
readback result, progress/result path, residual risk, and the next authorized
phase. Do not ask the user again for a listed action. Ask only when an action
falls under **Explicitly Not Authorized** or would materially expand this
register's target, data ownership, or destructive scope.

## Current Next Action

### 2026-09-26 A6 approval continuation

- Result: the decision below and its permit are CONSUMED; registered dispatch
  committed514 inserts (224 attributes+290 effects), no updates/deletes.
  Exact DB after-set and public/admin Ninja readback passed at07:06:31Z;
  source snapshot unchanged. Scheduler remains false, attempts/claims0/0,
  healthy reconciler, unchanged H8/epoch. Private `.prepared.json`, `.result.json`
  and `.readback.json` are retained under the prefix below.
- New blocker, not covered by that projection amendment: historical upstream
  slot/class semantics are inconsistent (133 attributes,181 effect slots,
  114 class-specific crit cells). A6.3 proposes source/maint/relation repair and
  exact old-key retirement/new-key publication. Those upstream writes/new landing
  scope require explicit new authorization. No repair or discretionary rollback
  is authorized by successful projection publication; do not replay this batch.
- Fresh bounded operation prepared under label `a6-20260926-01`; decision
  `armor-secondary-a6-20260926-01`. Packet SHA256
  `4f2026d947a27a7fdbcdcbc9a1ecfde83e7eac873c7fff945b2f5cf1ab13d862`,
  proposal SHA256 `54beeabc2d9e9c3244619782d71f10cc1c0c2c9cfd38a5a46c97f0f706fe7073`.
  Private prefix: `reports/authorization/canonical/canonical-armor-secondary-projection.a6-20260926-01`.
  Fresh API/Owner/policy/server/fence/read-only-baseline checks passed, H8 and
  epoch unchanged. Reviewed plan is224 attribute +290 effect inserts, no
  updates/deletes,223/233 members. Technical tests1588/1588. Dispatch/result
  readback is complete as recorded above; never reuse this identity.
- The exact two-table amendment is now approved. Codex continues serially via
  `2026-09-26-armor-secondary-projection-continuation.md`, first freezing
  source/member/maint/local identity and preserving out-of-scope projections,
  then testing a bounded proposal/executor and fresh authorization binding.
  Do not request this scope consent again; fail-closed technical checks remain.
- No new runtime packet or business write is implied by this scope record.
  Scheduler remains disabled; all previously consumed identities remain spent.

### 2026-09-26 14:20 CST source-producer checkpoint

- AUTH-03 repair completed for per-file Armor revision propagation and progress
  lifecycle; focused21/21, related Node1725 pass/0 fail/1 existing skip,
  backend monitor328/328 and admin contract58/58. Fresh API/MySQL reads confirm
  disabled control, unchanged H8/epoch/server, no live work and unchanged
  missing image/secondary projection evidence. Details/logs are in the active
  Armor child. No source probe, live crawler/import, scheduler/Redis/business
  write or packet/permit consumption occurred.
- AUTH-07 remains technically blocked. A6's exact secondary projection scope
  amendment remains proposed, not granted; request that boundary before its
  implementation/apply. This does not revoke existing bounded repair authority
  or require repeated consent for listed actions. Never label this checkpoint
  an execution authorization, and regenerate code-bound artifacts after the
  shared helper change.

### Current instruction: 2026-09-25 (supersedes historical next actions)

12:36 CST current-model review supersedes the earlier code-review next step:
the three pure Armor landing/intent/recovery contracts were repaired and
serially self-reviewed without a reviewer model or subagent. Fresh related
Node22 regression is1563 passed/0 failed/0 skipped; exact hashes/commands are in
the active Armor child. This changes neither ownership nor runtime authority.
No full-chain executor was registered, and no packet, permit, decision,
scheduler/control mutation, source probe, crawler/import, Redis write or
business DML occurred in this review phase. Health-only readback at12:36 is UP;
the last authenticated preflight at04:13:41Z remains disabled,0/0 live work,
healthy reconciler, unchanged H8/epoch, eight blocked domains. It must be
refreshed before future execution. Continue landing/maint ID-independent graph,
exact insert receipts, locked rederivation and the A3/A4 transaction/recovery
executor; retain existing bounds and all consumed-identity prohibitions.

17:05 CST continuation: the ID-independent landing/maint intent and explicit
relation derivation mode now have pure TDD coverage (`420/420` related tests).
This is preparation evidence only. No registration, packet, permit, scheduler
mutation, source probe, crawler/import, Redis write or business DML occurred.
The next authorized technical phase remains locked rederivation, native
collation/range fences, one-transaction execution, journal persistence and
terminal readback; refresh Phase 0 before any runtime action.

11:03 CST continuation: the primary durable repo-root/command-root startup binding
was repaired after a read-only `STATE_STORE_RESET` diagnosis; authenticated API
overview/preflight now return HTTP200 with control disabled, zero live work and
healthy reconciler at unchanged H8/epoch. The current-model typed Armor review
also repaired the projection database-role/reference seam; focused Armor tests
are235/235. A2.2 remains pure/non-executable, and all domain readiness is still
blocked. Continue A3/A4 full-chain landing/maint/relation/projection executor
work and generated-ID recovery binding; do not widen H8 or reuse legacy landing
pruning. No new decision, packet, permit, source probe or business DML occurred.
Current compact child: `2026-09-24-armor-frozen-candidate-continuation.md`;
ownership execution remains its active parent.

13:35 CST continuation: a read-only Armor locked-rederivation adapter is now
implemented and wired as the default governed runner adapter. It binds complete
transaction snapshots, runtime managed-image policy, and the rebuilt full-chain
hash before any DML; focused adapter/runner/catalog/manifest validation is
`79/79`. A real local snapshot read is recorded in the Armor child, but the
current source rows remain legacy/unrevisioned/un-cached and the two secondary
projection tables remain empty. No intent, packet, permit, scheduler mutation,
source probe, Redis write or business-table DML occurred. Continue only after a
fresh valid source/image/dependency evidence bundle and then generate a new
operation-specific packet; do not treat the adapter or this readback as runtime
authorization.

- Supplemental scope authorization generated at
  `reports/authorization/canonical/ownership-repair-20260924-01.scope.json`;
  human approval exists, but this record explicitly is not an execution packet.
- Canonical disabled startup and fresh API/MySQL readback pass: control false,
  scheduling=false, no active attempts/claims/fences, Owner/H8/epoch unchanged.
  Earlier persisted decision packets are expired or consumed.
- Armor incremental operation is registered in code; fresh read-only preview
  has63 existing rows and0 changes. Buff candidate and Shimmer containment
  regressions pass. Full automation plus four relation suites1189/1189.
- Current-model self-review is recorded for the typed intent seam; no live apply,
  executable packet, policy decision, scheduler enablement, source probe or
  business DML occurred in this phase.
- Continue via `2026-09-24-canonical-ownership-execution.md`; remaining full-chain
  and owner-partition implementation is technical work already authorized.
  Do not ask again for scope consent or treat tests/no-op as final acceptance.

### 2026-09-25 continuation readback and A4 contract checkpoint

- Read-only Phase 0 confirmed the canonical dual-root runtime is healthy with
  scheduler disabled: authenticated overview/preflight HTTP 200, live attempts/
  claims `0/0`, reconciler healthy, unchanged H8 and V2 epoch. No control,
  Redis, queue, reset, packet, permit, crawler/import, or business-table write
  occurred.
- Source monitor used the correct continuation-worktree Node22 binary. After
  repairing only the exact group-writable evidence directories to `0755`, the
  immutable report is
  `/home/lolben/TerraPedia/data/terraPedia/reports/fetch/source-update-check-2026-09-25T03-27-31.031Z.json`:
  `9/9` probes, `0` errors, `9` changed, full refetch required. Five
  supplementary source keys are missing ingestion-manifest entries and remain
  blocked; this does not authorize an importer or policy widening.
- The pure A4 Armor recovery journal is now implemented but unregistered and
  non-executable. It binds packet hash, run/decision/server identity, intent
  hash, exact verified ID map and concrete-after hash before COMMIT; legal
  uncertainty/reconciliation transitions are hash-bound. New files and test
  hashes are recorded in the active Armor child. Focused Armor validation is
  `262/262`; this is contract evidence only, not runtime acceptance.
- The pure A3 `armor-source-evidence-transition/v1` planner/test is also added:
  only Armor landing partitions, immutable source-evidence inserts, exact
  current-marker demotions, no deletes, and conservative collation collision
  rejection. Its combined landing/journal test slice is `13/13`; it grants no
  SQL write authority and still requires the registered owner/fence executor.
- Fresh authenticated preflight at `2026-09-25T04:05:20.726867989Z` read back
  HTTP 200 with disabled control, `0/0` live work, healthy reconciler and
  unchanged H8/epoch; all eight domains remain blocked. Integrated pure Armor
  A3/A4 validation is `267/267`, with no packet, permit, scheduler, crawler,
  import, Redis or business-table write.
- Next authorized phase remains A3/A4 implementation: landing/maint generated-ID
  plan and receipts, SQL ownership/fence transaction executor consuming this
  journal, and terminal DB/API readback. Keep scheduler disabled and do not
  reuse Retry-39/41/42 or decisions 65/74/75/66-73.

### Current instruction: 2026-09-22

- Continue from `2026-09-22-automation-ingestion-plan-repair.md`, not the
  historical Retry-33 text below. Retry-39/decision65 and Retry-41/decision74
  are consumed. Finish attempt-artifact isolation and two-stage review before
  selecting a new unused scheduler retry; next natural due time is at least
  2026-09-22T11:49:30Z. Keep disabled while repairing/waiting.
- Fresh source check at `2026-09-22T10:34:46.897Z` finished 9/9 healthy, 5 changed,
  terminal progress 9/9 at `10:36:53.904Z`. Report is in primary root
  `reports/authorization/canonical/source-monitor-20260922-retry-41/`.
  No crawler/import, scheduler PUT or business-table DML was involved.
- New historical dispositions for items/projectiles/shimmer verify original
  retained source/bundle bytes; fresh canonical approval identities were consumed
  only in the file ledger, not replayed. Exact paths are recorded in private
  `.local/tmp/20260922-retry24-dispositions.json` in this worktree.
- Hold armor/Buff full ingestion pending canonical projection ownership; hold
  Shimmer before apply because two actual importer tables are outside policy.
  The new scope guard is containment, not permission to broaden H8. Retry-42
  completed as no-op; continue projectiles only after a real source row change,
  fence expiry/readback and fresh gates.
- Sustained unattended/all-domain operation is not proved or authorized by the
  bounded-canary register. No expiry bypass, indefinite enablement or new daemon.

### Historical Retry-33 continuation

Retry-33b is consumed and immutable. Its source monitor, 32-panel acceptance,
fresh preflight, proposal/request/capture, packet, and policy decision all read
back consistently. The natural canary completed one registered items action;
the governed attempt report is
`reports/crawler-monitor/v2/2026-09-19/attempt-369ec078-9b65-42a1-948a-019da07fcc61/report.json`
with `status=completed`, `exitCode=0`, automatic gate passed, and zero row
mutations. Control is restored to `enabled=false`; no further scheduler window
is authorized until a new fresh preflight and unique decision are generated.
Do not call `/sweep`, reset Redis, edit queue JSON, or reuse Retry-33b.

### Retry-33/33b repair, decision, and natural canary readback: 2026-09-20

- Fresh source monitor report is under `reports/authorization/canonical/source-monitor-retry-33-rerun/` with `9/9` healthy and `9` changed. The generator date-key repair in `pipelines/audit/domain-readiness-audit.mjs` preserves the input ISO calendar date for timezone-bearing timestamps, preventing UTC rollover from masking current `reports/domain/*-2026-09-20.json` evidence. Narrow JS validation is `83/83`; only this generator file remains in the code diff.
- Current registry acceptance is `32/32 pass` at `2026-09-20T03:55:10+08:00`; fresh preflight artifact is `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.retry-33.preflight.json` with hash `sha256:801f8fad63a9b8172f9a4d741602c1ede258f83e6e2427cadf4e9d1f44266d73`.
- Retry-33b packet is `reports/authorization/canonical/automation-crawler-v2-scheduler-activation.retry-33b.packet.json`, packet hash `sha256:93be1e21e00f1cc03b56d4251d3e7074e843a07d90ff959825ff3521bc37c4d6`; MySQL activation decision `id=60` is unique and action-bound to `wiki-items-refresh`.
- Authenticated loopback PUT enabled `changed-only` with the single items canary. The natural sweep completed at `2026-09-19T21:06:41.253Z`, dispatching only `wiki-items-refresh`; all other registered actions were `canary_scope_excluded`. The attempt was monitor-visible at 100% and completed with exit code `0`. The automatic gate passed with `candidateRowCount=baselineRowCount=6159`, `inserts=0`, `updates=0`, `relationshipDeletes=0`, `softDisables=0`, `hardDeletes=0`; import summary was `input=6131`, `skipped=6131`, `created=0`, `updated=0`.
- Final API readback is `enabled=false`, `liveAttempts=0`, `sweepClaims=0`, reconciler `healthy`, epoch unchanged; Redis authenticated `PING=PONG`. No direct SQL/Redis/JSON write, manual `/sweep`, non-canary action, or business-table DML was performed.
- Retry-34b/35b npcs follow-up: Retry-34b decision `id=61` packet `sha256:a10340e040c232917a4dbe6f93eb0566bab548c61f527d06519489ea13ca2354` was action-bound to `wiki-npcs-refresh`, but its natural sweep completed after cleanup and recorded `automation_disabled`; no dispatch occurred. Retry-35b decision `id=62` packet `sha256:992dce29fb0ddfcf521466144fb7917589a31f7f28f3b1c6d238ba89ef83dc7b` was fresh and unique, but the bounded window saw no new `lastSweep`, claim, or attempt. Both are consumed probe-only evidence; a later retry must use fresh source/preflight/request/packet/decision identities.
- Retry-36b npcs follow-up: fresh preflight hash `sha256:b3946cbd9de85e0c79ad3f49d8e35a00aa841fa5de99ecbc4603ea27850434f5`, decision `id=63`, and packet `sha256:a558b126fe2fa1a78a8465ad822cbcd08d057e2f7228582b3aa57c6b9957aa63` were all valid and unique. The bounded natural window saw no new sweep, claim, or attempt; cleanup restored `enabled=false` with `0/0` live work and healthy reconciler. Retry-36b is consumed probe-only. Further scheduler action is paused pending cadence diagnosis; no manual sweep is authorized.
- Retry-37b npcs completion: fresh preflight hash `sha256:3bee216fa2b5b1d809252223f838987c0bc3e654db4fb224b4e893bbd0f507ee`, decision `id=64`, and packet `sha256:ab6d3cdd01045c20e907870c87b6b94cc8c0ce8ffae0538f5d1673e1dd027a15` were read back uniquely. Natural sweep completed at `2026-09-20T00:43:48.601806882Z`, dispatching only npcs. Governed report `reports/crawler-monitor/v2/2026-09-20/attempt-6ab9ced3-de0a-42f0-8ff6-c40a476b6736/report.json` is `completed`, exit code `0`, automatic gate passed, baseline `740` and candidate `740`, with `inserts=updates=deletes=0`; import summary was `input=762`, `skipped=762`, `created=0`, `updated=0`. Final control is disabled with `0/0` live work and healthy reconciler.
- Cadence diagnosis after npcs: `CrawlerMonitorServiceImpl.scheduledV2AutomationSweep` is registered with a 60-second fixed delay, but `isV2AutomationSweepDue` additionally requires `lastSweep.checkedAt + sweepIntervalMinutes`. With the npcs sweep at `2026-09-20T00:43:48.601806882Z` and interval `60`, the next projectiles window is not due until approximately `2026-09-20T01:43:48Z` (`09:43:48 CST`). Scheduler remains disabled while waiting; no manual `/sweep` or stale decision reuse is permitted.

### Retry-39 projectiles terminal failure and importer repair: 2026-09-20 to 2026-09-21

- Fresh Retry-39 source monitor completed `9/9 healthy`. The current registry
  acceptance had `31/32` passing panels; the sole blocked panel was unrelated
  `items` image readiness, while all five `projectiles` panels passed. The
  fresh projectiles preflight hash was
  `sha256:92cb98c7c070365118e0875b0b9c9c35183f4c3b30b472db3c7fe9fe12747dbf`.
- The governed projectiles policy decision is immutable MySQL `id=65`, identity
  `automation-crawler-v2-scheduler-activation-20260920-standing-projectiles-16`,
  action `wiki-projectiles-refresh`, and packet hash
  `sha256:7fe1e04ea85cebca2303d92ee1f6ade56ce203d6ca8dc0a94dc881b824452bf2`.
  It is consumed and must not be reused.
- One natural sweep at `2026-09-20T02:30:34.665488001Z` dispatched only
  `wiki-projectiles-refresh`, attempt
  `attempt-5edc8956-1a2f-4a01-bbef-fc4652b9e3ee`; non-canary changed actions
  were `canary_scope_excluded`. The terminal monitor-visible progress and
  manifest are under
  `reports/crawler-monitor/v2/2026-09-20/attempt-5edc8956-1a2f-4a01-bbef-fc4652b9e3ee/`.
  The child fetched the source then terminated `PROCESS_EXIT_NONZERO` before
  import: `Unknown column 'source_id' in 'field list'`.
- Readback before services stopped confirmed control restored
  `enabled=false`, zero live attempts/claims, a healthy reconciler, and no
  projectiles business mutation (`1111` rows, unchanged maximum
  `updated_at=2026-08-17 08:21:29`). No manual `/sweep`, direct Redis/JSON
  write, or non-canary action occurred.
- Root cause and repair: shared `loadItemsLookup()` selected unused
  `items.source_id`, absent from the canonical local items schema. A new
  regression first failed on that exact SQL error; the minimal repair selects
  only `id, internal_name, name`. Focused validation is
  `node --test pipelines/import/import-independent-entities-to-db.test.mjs`
  with `9/9` pass. No retry was started after the repair.
- Current stop: on 2026-09-21 the MySQL system instance is unavailable on
  `127.0.0.1:13306`; canonical startup stopped in its read-only preflight, so
  Redis/backend are also unavailable. After the user restores MySQL, start
  the canonical stack with scheduling disabled, perform a fresh preflight and
  unique Retry-40-or-later authorization chain, and only then wait for one
  natural projectiles tick. Do not reuse Retry-39 or call `/sweep`.

### Retry-40 runtime recovery and L2 reauthorization repair: 2026-09-21

- The local stack is restored with scheduler disabled and the durable V2 root
  corrected to `/home/lolben/TerraPedia`; command root remains this worktree.
  API preflight is HTTP 200 with the original epoch, zero live work, and a
  healthy reconciler. Fresh source monitor is `9/9` healthy; projectiles
  readiness passes and the scheduler preflight is `8/8 eligible`.
- Expired L2 reauthorization captures initially failed before any artifact or
  DB write because their predecessor query selected the current L2 version.
  The query now requires `rp.policy_version < currentPolicyVersion`; focused
  capture/reauthorization validation passed. The historical dispositions for
  items/projectiles/shimmer also needed fresh candidate-scoped packet renewal;
  new approved disposition records were generated with no policy or business
  write.
- Retry-23 reauthorization packets were generated but then invalidated before
  decision execution because the new historical preparation helper changed a
  pinned code-bundle hash. The runner rejected the first decision before DB
  insert. No Retry-23 L2 decision exists or may be used. Generate a complete
  fresh Retry-24 chain for all eight domains, then execute one decision at a
  time with MySQL readback.

### Retry-31 policy decision and bounded natural window: 2026-09-20 01:07-01:28 CST

- The exact Retry-31 packet was executed through the governed policy-decision
  runner. Its private result is `reports/authorization/canonical/automation-crawler-v2-scheduler-activation.retry-31.result.json` with `status=completed`, `authoritative=true`, decision kind `SCHEDULER_ACTIVATION`, identity `automation-crawler-v2-scheduler-activation-20260920-standing-items-09`, H8 unchanged, and packet hash `sha256:bc9234d95562e45571135e87803418cecfb74ea5a20be83a264efea8fdb80ed4`.
- MySQL readback confirms one immutable row (`id=58`) with the exact identity, packet hash, actor `admin`, `authorization_action_id=wiki-items-refresh`, and duplicate identity count `1`.
- Fresh pre-enable API readback was HTTP `200`: control disabled, changed-only, interval `60`, canary `wiki-items-refresh`; preflight `8/8 eligible`, zero live attempts/claims, healthy reconciler, unchanged epoch and H8.
- A natural-only watcher enabled the exact canary at `2026-09-19T17:24:27.904Z` and observed 48 polls over four minutes. The last sweep remained the historical `2026-09-19T15:49:43.507Z`; no fresh sweep, attempt, source monitor, crawler/import, Redis queue mutation, or business-table DML occurred. Exit cleanup restored disabled control. Final MySQL counts are zero live attempts, zero active reservations, and zero active fences.
- Residual issue: the effective scheduled poll did not fire during this short bounded window despite the JVM being alive. The next safe action is read-only cadence diagnosis and a new fresh preflight; Retry-31 cannot be reused for another activation window.

### Session handoff reconciliation: 2026-09-22 17:37 CST

- Read-only Git facts in the intended worktree: `HEAD=0f871e94dc8b48f8883c77b1e0557593a271609b`, branch `feat/automation-scheduler-continuation`, no upstream, no staged changes, and `1381` dirty/untracked paths. The dirty set includes active scheduler code/tests, both devlog files, task plans, and generated authorization/domain/audit reports. These paths are preserved as user work and are not reset, cleaned, staged, committed, or pushed by this handoff.
- The standing authorization in this register remains active only for fresh local registered operations with per-phase gates and immediate readback. `/sweep`, direct SQL/Redis/JSON writes, epoch reset, stale packet/decision reuse, remote targets, and Git history mutations remain out of scope.
- Runtime reachability is unknown in this turn. The operator reports MySQL was started, but this session did not independently probe MySQL `127.0.0.1:13306`, Redis `6380`, backend `18102`, MinIO `19000`, public `5188`, or admin `3015`. On resume, probe first; if required, run the canonical local-stack start with `SPRING_TASK_SCHEDULING_ENABLED=false`, then perform fresh Phase 0 readback.
- Retry-39 projectiles remains consumed after failing before import on the obsolete `items.source_id` select. The repair is present in the dirty worktree and the recorded focused importer validation is `9/9`; do not reuse Retry-39 or decision `id=65`. The next legal runtime chain is fresh Retry-40-or-later L2 captures/packets/decisions, serialized with MySQL readback, followed by a fresh projectiles natural-tick canary.
- This handoff reconciliation performed no scheduler control write, source probe, crawler/import, Redis write, epoch reset, or business-table DML.
