# Automation Ingestion Scheduler Activation And Probe-to-Database Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starting from the verified eight-domain H8 policy set, preserve the 185 private evidence artifacts, obtain a fresh and independently authorized V2 scheduler decision, prove one real source-change-to-database ingestion, and then close the eight-domain monitoring and operational handoff with measurable latency and rollback evidence.

**Architecture:** Historical evidence is an immutable read-only reference layer. A new evidence catalog records every path, byte hash, role, generation-time signal, reuse classification, and forbidden use, but no historical packet, permit, owner input, result, or commit marker is replayed. The live chain is `source probe -> source fingerprint/report -> V2 scheduled sweep -> V2 attempt/reconciler -> domain automatic runner -> transaction-bound L1 bundle/apply -> source acknowledgement -> database/API/readback` and is authorized separately by `preflight -> proposal -> request -> Owner packet -> scheduler activation decision`.

**Tech Stack:** Node.js ESM automation contracts, Spring Boot admin monitor API, MySQL/InnoDB `terria_v1_local` (observed Flyway V61), Redis V2 state on port `6380`, `node:test`, Maven, JSON evidence under `reports/`, and private per-worktree state under `.local/`.

---

## 1. Goal, Closure, And Boundaries

### User-visible outcome

When this plan is complete, a real upstream change in any eligible domain is detected by the scheduler probe, dispatched once through the V2 queue, imported into its owned tables, and independently readable through the existing runtime/API path. The evidence must show where the change was detected, when it was claimed, when the transaction committed, and whether the source acknowledgement happened only after commit.

### Closure definition

The task is closed only when all of the following are true:

1. The 185 retained files have a private catalog with exact count, path, hash, mode, symlink, role, and reuse classification.
2. A fresh preflight is bound to the current server, V2 epoch/namespace, current policy set H8, and the exact eight eligible domains.
3. A new scheduler proposal/request/Owner packet/decision has unique identities and is independently read back; no previous promotion or scheduler identity is reused.
4. Each of the eight domains has a natural scheduled attempt without a manual sweep, and a real nonzero owned-row change independently matches the intended source fields in its consumer API. A probe-only or zero-diff successful attempt proves only mechanism/no-op behavior and cannot close that domain's ingestion acceptance.
5. NPC/Boss shared-table fencing, duplicate suppression, failure handling, rollback, and final enabled/disabled state are independently verified.
6. Latency and residual-risk evidence is recorded in the devlog and a fresh handoff points to the next authorized operation.
7. Sustained operation is separately accepted only after at least two due cycles,
   an expiry/renewal boundary and a controlled process restart, with all eight
   domains covered, no duplicate mutation and fail-closed behavior on renewal
   failure. A bounded canary followed by `enabled=false` is not an unattended service.

### Acceptance stages and current authority (2026-09-22 repair)

- **M — mechanism:** natural tick, truthful terminal progress, transaction/fence
  and cleanup readback. Items Retry-33b and NPC Retry-37b are recorded M/no-op,
  not nonzero ingestion evidence. Revalidate relevant regressions after code changes.
- **D — data-visible:** per-domain before/after stable-key field comparison,
  nonzero actual row diff, committed generation and API equality. No source event
  means `no-natural-change-observed`; do not manufacture one or close D.
- **S — sustained:** renewals and domain sequencing must be implemented and
  validated as above. The current scalar `canaryActionId` only authorizes one
  domain per window; existing standing authority requires cleanup after every
  bounded window. It does not authorize indefinite enablement or a new daemon.
- Execute M/D for safe registered actions now under the standing register. S remains
  an explicit release gate: either a separately approved registered controller
  sequences fresh per-action windows/renewals with cleanup, or a separately reviewed
  multi-action contract replaces the scalar gate. Do not remove expiry or widen a
  packet to simulate S. Before S implementation/runtime, obtain the concrete
  controller and continued-operation scope; existing M/D work need not wait for it.
- Global task remains active until M+D+S are complete; report each stage separately.

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
export RUN_ID="scheduler-activation-$(date -u +%Y%m%dT%H%M%SZ)-$(node -p 'crypto.randomUUID()')"
# Select from filesystem + decision-ledger + MySQL readback, not this example.
# Scheduler retry and L2 reauthorization retry labels are separate namespaces.
export RETRY_LABEL=NEXT_UNUSED_SCHEDULER_RETRY
export CANARY_ACTION_ID=wiki-projectiles-refresh
# Phase 0 must discover this from the running backend process before any read.
# Do not substitute a remembered or advertised port.
export API_BASE=DISCOVERED_LOOPBACK_API_BASE
# Record the actual base; dirty continuation additionally requires the reviewed
# file inventory and frozen manifest-derived hashes in the Preparation Gate.
export SCHEDULER_CODE_HEAD="$(git rev-parse HEAD)"
```

The coordinator must verify, and record in the phase-0 evidence, these exact starting identities:

| Identity | Required value |
| --- | --- |
| Branch | `feat/automation-scheduler-continuation` |
| Scheduler continuation handoff commit | `34da1b21b6bd18579c5a5f93101c8c068a7233c4` |
| Scheduler code checkpoint | Reviewed base descended from `34da1b21b6bd18579c5a5f93101c8c068a7233c4`, plus the frozen dirty-continuation inventory/hashes below; HEAD alone never proves running code identity. |
| L2 promotion contract base | `edc40b4fe702aa11b9ec03d2d49ff9448d6eeb09` |
| Current policy set | H8 `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0` |
| Eight eligible domains | `items,npcs,projectiles,armor_sets,buffs,audio,bosses,shimmer` |
| Independent global readback | `sha256:34af46aacb92d171c232128712c47641cbb3882a689ae0fd18195302184445e0` |
| Database | MySQL `127.0.0.1:13306`, `terria_v1_local`, server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, Flyway V61 |
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

### Field-level consumer acceptance and blocked lanes

All automatic owned scopes below currently have `databaseRole=local`; do not
infer authority over maint/relation merely because those databases are local.

| Domain | Stable comparison key | Consumer/readback and release gate |
| --- | --- | --- |
| items | `internal_name`, preserved row ID | ItemMapper reads local items; canonical cached image lineage must be checked separately, not inferred from `items.image`. |
| npcs | `source_id`, `internal_name` | PublicNpcService/AdminNpcController read local npcs; published maint/relation lineage must remain consistent before full D acceptance. |
| projectiles | `source_id`, `internal_name` | PublicProjectileService reads local projectiles; compare name/damage/flags and API image separately. Missing incoming `image_url` must not erase an existing managed image. |
| armor_sets | `source_key`, child variant/part keys | BLOCKED for D: public API reads relation.projection_armor_sets; local armor success alone is invisible. Requires governed canonical publication and matching public/admin detail. |
| buffs | `source_id`, relation `(buff_id,sort_order)` | BLOCKED for complete D: base local fields are visible but projection/relation counts and immune/source facts take precedence. Compare base and relation fields separately. |
| audio | `asset_id`, relation entity/source/type tuple | Public/admin Audio controllers read local assets/links; verify active/downloaded status and a usable managed media URL, not just row count. |
| bosses | normalized group `code`, member NPC identity | PublicBossService reads local groups/NPC membership; shared npcs fence and canonical lineage must agree. |
| shimmer | context/provider/page + transform semantic keys | BLOCKED before apply: actual importer also writes world_contexts/entity_source_snapshots, absent from four-table policy. Numeric IDs can change on replacement; compare semantic keys. |

Before each safe canary: obtain candidate read-only row diff, record baseline
stable-key fields from DB and public/admin detail API, and compare after terminal
commit. A pass needs actual nonzero owned row changes and matching intended API
fields. Managed images/media require HTTP availability and no sanitizer loss.
Read relevant cache declarations and prove changed values after their normal
invalidation/TTL; never clear Redis manually. Record observed latency only; unknown
upstream change time remains unknown rather than being replaced by probe time.

Local projection sync overwrites overlapping columns from relation. For a lane
with canonical lineage, close ownership upstream using a registered operation;
do not switch API readers to compatibility tables or widen H8 as a workaround.
Registered repair names are not authorization for a new runtime lane. If an
exact repair lies outside the standing register, prepare its bounded request and
ask for that scope. Continue independent safe lanes meanwhile.

Shimmer immediate safety repair: reject an owned scope missing any real importer
table before mutation; verify with an offline failing regression then passing
tests. A safe rejection is containment, not completed Shimmer ingestion.

#### Bounded canonical-lane follow-up (read-only inventory, not runtime authority)

- Armor: `canonical-armor-set-projection-restoration` is explicitly
  `insert-only-empty-table`; it cannot refresh populated projections or upstream
  facts. A new registered incremental lane must bind frozen input -> landing ->
  maint_armor_sets -> relation_armor_sets/relation_armor_set_items ->
  projection_armor_sets. Decide the Armor-owned equipment-effect subset explicitly
  if those fields are included in D; do not invoke broad relation sync.
- Buff: the existing image patch is a fixed 388-row empty-image repair, and the
  historical NPC relation recovery is a fixed 1270-row empty-table restoration.
  Neither closes incremental source/immunity/image updates. Existing NPC owner
  phases can cover their declared subset only after their own predecessors.
  The automatic Buff source command currently skips page immunity fetching.
  Future scope must name the bounded page sources, landing/maint/relation facts,
  image lineage and projection fields; reuse pure builders, not broad sync CLIs.
- Shimmer: reuse the verified canonical importer, but `world_contexts` is owned
  by `town_npc_maintenance` and `entity_source_snapshots` by `items` in
  `pipelines/automation/table-ownership-matrix.mjs`. A proposed bounded partition
  is context code SHIMMER, seven generation-bound wiki_shimmer_* snapshots and
  wiki_zh/微光 transform subsets. This partition is not implemented: it needs
  cross-owner approval, verified predicates/fences, reconciliation/compensation
  and matching policy registration. Adding two whole-table names is not a fix.
- These ownership/registration extensions require concrete approval beyond
  AUTH-07 before implementation of the expanded contract or runtime writes.
  They need no DDL, direct DML, broad rebuild or new scheduler domain. Sustained
  controller/renewal authorization remains a separate S gate.

#### Execution track: canonical ownership repair (user-directed 2026-09-22)

The user directed that the three blocked corrections be added to this plan and
executed. This track is implementation/test work first; it does not authorize
business-table DML until each lane has a fresh operation packet, exact policy
scope, and terminal readback. The scheduler remains disabled while these code
contracts change.

- **Armor:** add a dedicated incremental projection contract that reads verified
  Armor-owned maint/relation facts and updates populated
  `relation.projection_armor_sets` by stable text/relation/source keys, checking
  variant/part identities inside derived related-item content. It must
  preserve unchanged rows, reject unrelated domains and unmanaged image fields,
  and never call the broad relation synchronizer. Existing empty-table
  restoration remains historical and unchanged.
- **Buff:** add a bounded source contract that refuses a candidate when page
  immunity evidence is absent or the source command explicitly skips it. The
  relation/projection builder may be reused only through a narrow Buff-owned
  scope covering `relation_buffs`, `item_buff_relations`, Buff-owned
  `npc_buff_relations`, `relation_buff_images`, and `projection_buffs`; broad
  clear/schema-preparation execution remains forbidden. Existing fixed-row image
  and empty-table recovery operations remain historical.
- **Shimmer:** add an explicit cross-owner partition contract before any
  automatic apply. It must identify `world_contexts(code=SHIMMER)` and the
  generation-bound `wiki_shimmer_*` snapshots as separate owner capabilities,
  while keeping the four transform scopes under Shimmer. Whole-table scope
  expansion is rejected. The contract must expose owner/fence/reconciliation
  requirements and fail before importer transaction entry when they are absent.
- **Shared gates:** each lane gets RED/GREEN tests, a current operation catalog
  entry only after its exact scope is proven, a manifest/code-bundle update, and
  independent spec/quality review. No lane may change H8, add DDL, perform direct
  SQL/Redis writes, or start a scheduler window. A lane that cannot satisfy the
  ownership contract remains `blocked` with a named follow-up rather than being
  represented as data-visible acceptance.

Current execution checkpoint (2026-09-24): explicit supplemental approval
`user://conversation/automation-canonical-ownership-repair-approved-01` covers
these three bounded repairs, scoped registration and fresh serial execution.
The earlier missing-chat-approval statements are superseded; this is not a
technical packet or a waiver of ownership/freshness/review. The historical
`106/106` result did not establish runtime readiness: caller booleans and
partition mode strings were not authority. Both bypasses now reject before
apply. Buff generic sync also stays read-only until its real executor exists.

Armor integration is a separate `canonical-armor-set-projection-incremental`
operation; do not repurpose restoration. Its only write is updating existing
`relation.projection_armor_sets` rows by `(text_key, relation_record_key,
source_key)` plus preserved primary id. Source-derived variant/part identities
are checked inside related-items content, not nonexistent schema columns.
Coordinator owns `pipelines/relation/run-armor-set-projection-incremental.mjs`,
its test, canonical catalog/manifest/authorization files and their tests.

- [x] Add failing tests for required retry label, exact proposal/result paths,
  denied sibling paths, private immutable evidence and source timezone decoding.
- [x] Implement read-only preparation and a canonical apply wrapper. The wrapper
  requires the exact packet/data bundle, active Owner, unchanged policy hash,
  DB-clock validity, and a transaction-held fence-table lock with no live fence.
  It locks source/target and verifies complete before/after sets through the
  incremental core. No table clearing, DDL or timestamp-only synthetic update.
- [x] Verify wrapper and catalog contracts plus independent spec/quality review.
- [ ] Freeze code, generate fresh proposal/request/packet and serially execute
  only after technical gates pass; a zero-row result remains no-op evidence.

Historical initial checkpoint2026-09-24: wrapper13/13 and full automation plus
four focused relation suites1189/1189 pass. Scope authorization information and
read-only Armor proposal were generated (paths/hashes in the active Sep24
devlog); proposal changed-row count0. Independent review remains pending
because collaboration tools return unsupported. No executable packet, permit
consumption or business DML occurred; registration does not mean release.

The source relation SQL datetime and projection SQL datetime currently use
different historical representations: the source instant must use explicit CST
decoding while projection readback preserves its existing UTC serialization.
Fresh native-decoded preview is0 changes; dateStrings=true alone fabricates63
eight-hour deltas. Regression coverage must catch that before packet generation.

Execution order is Armor and Buff contract tests/implementation, then Shimmer
cross-owner contract and review, then integrated automation tests. Runtime
canary continuation is a separate phase after these changes and requires a new
fresh source/preflight/packet chain; Retry-42/decision75 remain consumed.

#### September 24 review repair and complete-chain continuation

September 25 current-model review checkpoint (user-directed): perform spec and
quality checks serially with the current model; do not dispatch a review model
or subagent, and do not label self-review as independent approval. This replaces
reviewer dispatch for the remaining code-review stages, not independent
ADMIN/Owner authorization or runtime readback. Earlier independent code reviews
remain historical evidence for their frozen scope. Before the
A3/A4 executor consumes the new pure contracts, regression-test and repair
landing insert-ID/current-marker validation and cross-list consistency, plus
recovery history chronology, immutable timestamp binding and persisted terminal
evidence validation. A recomputed JSON hash alone does not prove these semantic
contracts. Keep candidates non-executable and the catalog unchanged until the
actual locked transaction and terminal readback exist. The temporary full-chain
draft from this checkpoint was removed after self-review; it is not a registered
executor or completion evidence.

Checkpoint result at 12:36 CST: landing insert/marker/list guards and recovery
chronology/terminal-evidence guards are repaired. Typed intent additionally binds
each projection ID reference to its own `relation_record_key`, requires exact
generated-ID declarations (duplicates cannot mask omissions), rejects allocated
IDs on new relation rows, and freezes the verified ID map. Current-model serial
spec/quality re-review found no further issue within these three repaired pure
contracts; Node22 related regression is 1563 passed, 0 failed, 0 skipped. This
does not close A2-A6: landing/maint ID-independent derivation, original-baseline
locked rederivation, native-collation locks/fences, the cross-database executor,
journal persistence and DB/API acceptance remain required. The journal's new
landing identity is `local.source_dataset_landings`; historical maint landing
lineage must not be relabelled as local. See the active Armor child for exact
reviewed hashes and commands.

Collaboration is available again; the earlier unsupported-tool checkpoint is
historical. Independent review found two Armor release blockers: contradictory
part/item ID-name joins and connection teardown masking commit uncertainty.
Resolve with RED/GREEN and re-review before any packet. Buff review requires
mandatory page ID aliases, source-derived scalar binding, secondary owner/fact/
logical-identity checks and inactive-image preservation. Runtime managed-prefix
policy must be resolved by the future executor, not trusted from candidate data.

The end-to-end chain audit found a separate Important gap: the automatic Armor
runner invokes only the module fetcher and imports compatibility local tables.
It does not invoke canonical landing, maint, relation or projection publication.
The incremental projection operation cannot substitute for that upstream work.
The image fetcher is another required source leg, not part of the current module
command. Implement these ordered tasks under the existing bounded scope:

- [x] A1: Fix `source-dataset-locator.mjs` Armor descriptor to retain the real
  producer's `sourcePageTitle`, `sourceRevisionTimestamp` and `fetchedAt`. Test
  the producer-shaped payload and absent metadata; never invent a source time.
- [ ] A2: Build a frozen Armor input/candidate using canonical Module definitions,
  explicit managed image evidence and stable part/item identities. Reuse the
  locator, `extractMaintEntitiesFromLandingRow`, `buildArmorSetRelations` and
  `buildProjectionPayload` as libraries only. Current module/maint has 63 rows;
  never substitute the unrelated legacy 88-row `wiki-armor-sets.latest.json`.
  Do not hard-code 63 as an eternal upstream count: bind exact current source
  identities and declare additions/removals in the candidate.
  First implement A2.1: a pure landing-to-maint candidate builder using verified
  `source_evidence` landing snapshots and complete current maint baselines. Keep
  existing `id` and `record_key` by stable text/image identity despite changed
  content hashes (the generic extractors generate content-derived keys). Do not
  allocate DB IDs for inserts or hide a removed row behind a broad rebuild.
  A2.2 then binds derived relation/projection and item/image dependency snapshots.
  A2.1 re-review checkpoint10:53 CST:30/30 focused tests;1405 integrated
  passes,0 failures,1 existing Shimmer maint skip. Independent spec/quality approved;
  no runtime writes. Actual image producer's null revision/cache must be resolved
  by governed image evidence; candidate validation does not manufacture it.
  September26 source-producer repair slice: first add RED/GREEN tests for the
  real image-info request, requiring `iiprop=...|timestamp` and propagation of
  each file's returned revision into the image row and landing/maint extractor.
  Keep the multi-file payload's aggregate revision null: no single upstream
  revision exists for the collection; neither fetch time nor max(file revision)
  is a substitute. Missing revisions/cache remain missing and block canonical
  execution. Verify default/custom/env progress, pre-network publication and
  failed terminal state using isolated offline CLI tests before any live fetch.
  Do not start an unregistered image task or fill secondary projections here.
  Checkpoint14:20 CST: producer revision/progress repair passed21/21 focused,
  1725 related Node passes (one existing Shimmer skip),328 backend monitor and
  58 UI contract tests. This is offline evidence, not a fresh source bundle.
  Before freezing A2, test the real producer's `part` image role against both
  candidate layers and preserve its identity under the bounded Armor image
  ownership; never silently discard or relabel rows to pass validation. The
  governed managed-image packet must pin this exact Armor raw payload, source
  revisions and output evidence; the existing image-sync CLI scope flag and
  item-only registered input paths are insufficient.
  A2.2 first freezes a pure relation candidate: preserve existing relation IDs
  and record keys by logical identity, including images independent of sortOrder;
  reject ambiguous item/source joins, retain unmatched rows and flag removal.
  New rows must not invent database IDs. Bind item/image/effect snapshots and
  projection derivation after this reviewed relation contract; no CLI/apply or
  automatic-policy registration is added by candidate work.
  A2.2 relation-slice checkpoint11:34 CST:99 relation/35 maint focused tests pass;
  five spec findings plus producer-text/calendar findings fixed. Four-file spec
  and quality re-reviews passed. Integrated Node22:1509 pass/0 fail/1 existing
  skip. Projection/dependency binding remains
  open; this slice alone does not complete A2.2 or permit runtime execution.
  Generated-ID boundary: A2.1 validates materialized landing IDs, while new
  landing/maint/relation IDs do not exist at preview time. Never guess
  AUTO_INCREMENT, insert before permit to obtain IDs, or freeze the generic
  `buildProjectionPayload` hash-ID fallback as final identity. Before A3/A4,
  define a typed logical-reference graph that freezes all non-generated fields
  and exact source/baseline/dependency bytes; only declared ID-reference slots
  may be materialized from transaction insert results. Locked rederivation and
  complete readback must match that graph after substituting those exact IDs.
  Missing, duplicate, cross-owner or unexpected ID bindings must roll back.
  Reference slots are maint/relation `landing_source_id` to the exact landing
  insert, relation `source_maint_id` to the exact maint row, and new projection
  `id` to the exact relation-set insert. Existing IDs stay concrete. Do not
  implement equality by discarding all IDs or accepting arbitrary nulls.
  Read-only integration audit September24 additionally requires generated primary
  key declarations for every inserted landing/maint/relation row (including
  relation children), separate from the reference slots above. Part lineage
  remains bound to the existing maint_items dependency. Receipt identity is
  database/table/stable logical key, with exact affectedRows=1 and positive safe
  insertId; uniqueness is per table, not global. Preserve original baselines
  during materialization; inserting new rows into the baseline changes intent.
  Existing numeric extractors/trace must not coerce typed references. Introduce
  an explicit ID-independent derivation path while retaining strict v1 APIs;
  producer changes invalidate dependent frozen reviews. Freeze a second-precision
  writeTimestamp before permit for new system timestamps; preserve existing
  timestamps explicitly. current_slot derives exactly from is_current. No
  broad ID/timestamp stripping is allowed in equality.
  September25 continuation adds a pure `armor-canonical-landing-maint-intent/v1`
  graph and an explicit ID-independent relation builder mode. Unresolved landing
  IDs are references to exact landing logical identities; maint rows validate
  source identity/content-hash binding; generated IDs and receipts are declared
  per table. These remain non-executable and must be rederived under the future
  transaction's locked baselines before any insert.
- [ ] A3: Implement a registered, bounded upstream executor owning only the
  Armor landing partitions (`armor_sets_raw` and `armor_set_images_raw`),
  `maint_armor_sets`, `maint_armor_set_images`, Armor relation rows and final
  `projection_armor_sets`. Read item/equipment-effect dependencies without
  claiming ownership. Define stable upserts, preserve unmatched rows and IDs,
  and block removed/rekeyed source entities until an explicit deletion contract
  exists. Never execute broad landing/maint/relation sync CLIs as a shortcut.
  Add disjoint Armor `landing_dataset` partitions and exclude them from `other`;
  test actual SQL predicates/fences against other owners. Persist immutable
  `source_evidence` history: Armor currently defaults to `legacy_compat`, whose
  generic importer can DELETE retired history. That pruning path is forbidden.
  Fresh September24 DB has two current legacy_compat Armor rows and one retired
  image row, with no source_evidence row. The current unique key excludes
  artifact_role. Freeze the exact previous-current demotion (is_current=0,
  current_slot=NULL) in the before/after intent, preserving ID, payload/history
  and timestamps, before inserting source_evidence in the same transaction.
  Dataset-wide ownership is required for this marker-only migration; never
  delete or rewrite a historical payload. The table uses utf8mb4_0900_ai_ci:
  binary predicate matching alone cannot prevent native unique-key collisions.
  Preflight/lock the native collation equivalence range and fail on byte-different
  equivalent tuples; lock empty insertion gaps and fail rather than replan on
  concurrent unique conflicts. Landing resolver v2 metadata is a prerequisite,
  not proof that SQL predicates or runtime fence intersection are enforced.
  The pure `armor-source-evidence-transition/v1` planner in
  `pipelines/landing/armor-source-evidence-transition.mjs` is the required
  pre-SQL boundary: it accepts only the two Armor landing partitions, emits
  insert-only source evidence plus exact `is_current=0,current_slot=NULL`
  demotions, rejects caller-allocated new IDs and conservative collation
  collisions, and exposes no delete operation. The future executor must consume
  its frozen hash under a transaction-held ownership fence and rederive it from
  locked rows before writing.
  **2026-09-25 implementation checkpoint:** an unregistered transaction core
  now provides the required lock/write ordering and TDD mechanism coverage in
  `pipelines/relation/armor-canonical-transaction-executor.mjs`. It is not an
  A3 completion: relation ID-independent composition, durable journal
  persistence, packet binding and catalog registration remain required.
- [ ] A4: Bind frozen source bytes/revisions, all before/after sets, managed URL
  policy, exact cross-database table/partition scopes, current Owner/policy/
  server identity and one-use permit. Use one transaction on the same MySQL
  instance with enforced ownership fences and locked reread/readback. Add failure
  tests at each layer, unrelated-row preservation, no-op, retry, commit-uncertainty
  and source drift tests. No DDL, H8 widening or direct DML execution.
  Bind the frozen intent hash, verified generated-ID map and concrete after-hash
  into result/reconciliation evidence; ambiguous commit recovery recovers the
  original map and never reinserts to allocate replacements. If existing packet
  verification requires a concrete pre-permit after-hash, version and review the
  operation-specific intent contract instead of relaxing shared verification.
  Test two different allocator sequences for the same logical intent, new
  landing with existing identities, swapped/extra/foreign ID maps, insertion
  failures at each layer, and rejection of unmaterialized projection fallback.
  Shared packets already hash operation-specific input artifacts: retain their
  verifier unchanged and register a separate versioned full-chain intent. Use
  the operation-specific `armor-canonical-recovery-journal/v1` contract in
  `pipelines/relation/armor-canonical-recovery-journal.mjs` to bind packet/
  intent, exact verified ID map and concrete after-hash before COMMIT; its
  legal history and commit-uncertainty transitions must be persisted through
  the executor, and absent/conflicting recovery evidence fails closed. Generic
  reconciliation normalization drops unknown fields, so materialization proof
  must live in this hashed operation-specific artifact with its own terminal
  verifier, not unbound extra JSON fields. The pure contract is not an
  executable packet or operation registration until the landing/maint/relation/
  projection executor consumes it and terminal readback is implemented.
  **2026-09-25 implementation checkpoint:** full-chain mode now rejects partial
  intent or a missing fence commit marker, rederives after native `FOR UPDATE`
  partition/target locks, records exact generated-ID receipts, and marks commit
  acknowledgement loss as reconciliation-required without a blind rollback.
  It remains unregistered and has no live journal, packet or API adapter; A4
  stays open until those bindings and terminal readback are implemented.
  A private journal-store boundary is now available at
  `pipelines/relation/armor-canonical-recovery-journal-store.mjs`; it is
  repository-confined and atomic, but remains an adapter-only contract until
  the executor supplies real PREPARED/materialized/commit-unknown/terminal
  journal values; the executor also requires rollback-confirmed evidence after
  every pre-commit failure so a stale PREPARED file cannot masquerade as an
  ambiguous commit.
  **2026-09-26 locked-rederivation checkpoint:**
  `pipelines/relation/armor-canonical-locked-rederivation.mjs` now reads every
  required Armor baseline/dependency table inside the transaction using explicit
  row locks, rebuilds the landing/maint/relation/projection graph with the
  runtime image policy, and rejects any full-chain hash drift before the first
  DML. The runner uses it by default and the operation bundle pins its static
  imports. This clears only the adapter/mechanism subgate; a fresh valid source
  evidence bundle, packet/permit and terminal DB/API equality readback remain
  required. The current DB still has legacy Armor landings, missing image
  revisions/cache and empty secondary projections, so no intent or packet is
  generated from the snapshot.
- [ ] A5: Wire the reviewed source command/bundle/manifest and automatic runner to
  that registered executor. Module and bounded image work must have explicit
  revision/freshness binding and monitor-visible progress before network/loops,
  heartbeats and terminal state. Reuse managed images only if frozen evidence
  proves freshness; missing image evidence blocks instead of erasing images.
  Acknowledgement follows the complete canonical commit and consumer readback.
  This is BLOCKED under current H8, which owns only local `armor_sets` and
  `armor_set_items`. Before automatic hookup, specify and independently review
  the exact policy/bundle/structured-diff/generation migration and obtain its
  bounded activation packet; do not silently widen H8. A2-A4 manual canonical
  implementation can proceed without that automatic-policy transition.
  Current Armor probe/dedup identity hashes module content only. Until a reviewed
  composite module+page/image probe identity exists, images remain a separately
  scoped frozen prerequisite and image-only freshness is explicitly outside
  automatic acceptance. Full A5 closure must implement composite dispatch,
  deduplication and acknowledgement tests, not just attach images to an old hash.
- [ ] A6: Current-model serial spec then quality review per the September25
  instruction (self-review, not independent approval); full related automation tests;
  fresh read-only source-to-candidate diff; exact new request/packet; serial apply
  only when an actual source-driven delta exists and all runtime gates pass.
  Verify public/admin Armor field equality and managed image availability. A
  no-op is mechanism evidence, never data-visible acceptance.
  Consumer readback must include actual secondary readers, not only
  `projection_armor_sets`: public defense prefers local `items` before
  `projection_item_armor_attributes`, images can fall back to local `item_images`,
  and effects read `projection_equipment_effect_attributes` by owner ID.
  Capture these dependencies read-only and test a changed/new entity response;
  missing expected effects, stale/foreign effects and fallback-only apparent success block
  acceptance. Their read dependency does not grant Armor write ownership.
  September24 fresh DB/API smoke confirms a real release blocker:
  projection_item_armor_attributes and projection_equipment_effect_attributes
  each have0 rows; relation equipment effects contain320 active parsed item
  armor_attribute_cell rows and no armor_set effect rows. Public
  /api/public/armor-sets/1?include=piece-effects returns HTTP200 but empty effects
  and empty pieceEffects arrays. An exact member/effect/local-item ID and name
  join identifies armor8 ArmorSetBonus.Ninja/member256 NinjaHood, with relation
  effect6 crit_chance=3.0000, maint attribute34/landing12448; its public detail
  includes that member but pieceEffects[256] is empty. No piece-module degraded
  warning is present in this JVM log. Source-proven zero-effect members remain
  valid: do not require every array to be nonempty. Correct defense from the
  intended primary local items reader is not itself a defect. Filling these read-only dependencies, or adding
  a new authoritative set-effect source path, requires an explicitly bounded
  scope amendment before implementation/apply. Do not treat the existing main
  Armor rows/list count63 or available fallback defenses as end-to-end success.
  Bounded amendment approved2026-09-26 by
  `user://conversation/2026-09-26/armor-secondary-projections-approved-01`:
  existing Armor-member relation
  keys -> projection_item_armor_attributes, and existing frozen effect keys with
  owner_kind=item/source_kind=armor_attribute_cell plus exact member ID/name
  joins -> projection_equipment_effect_attributes. Preserve other rows/IDs; new
  projection IDs require their own declared insert bindings, never generic
  index+1 assignment. No local item writes or new set-effect source is implied.
  Execute as a separate bounded secondary-projection repair from frozen current
  relation/maint/member evidence; do not turn it into a broad projection rebuild
  or claim fresh source-change/automatic acceptance from this repair. Use the
  continuation entry for the test-first implementation and runtime checkpoints.
  A6.1 implementation files: `pipelines/relation/armor-secondary-projection.mjs`
  and `.test.mjs`; export the existing pure attribute/effect builders from
  `sync-maint-to-relation.mjs` without invoking its CLI. Build/validate API is
  `buildArmorSecondaryProjectionProposal({ sourceRows, beforeRows, serverUuid,
  generatedAt })` and `validateArmorSecondaryProjectionProposal(proposal)`.
  Re-extract referenced maint landing payloads, rederive the existing relation
  facts, verify exact member/variant and maint/local ID-name joins, then call
  buildProjectionPayload for fields only. Discard its ordinal IDs; use preserved
  IDs for updates and explicit relation row-ID bindings for inserts. Preserve
  unrelated rows and reject ambiguous names, stale/unaccepted facts, duplicate
  identities, foreign consumed projections, inactive rows and ID collisions.
  RED/GREEN command: Node22 --test pipelines/relation/armor-secondary-projection.test.mjs.
  A6.2 adds a dedicated locked snapshot/executor plus runner with exact ownership
  predicates, full before/after equality and durable commit-uncertainty evidence;
  only then add catalog/manifest bindings and fresh packet/API execution gates.
  The request builder must include the exact private proposal bytes from that
  manifest (not an empty static data bundle). Verify missing manifest/file and
  non-private artifact rejection, full runner/permit/evidence integration,
  update/no-op receipts and post-commit uncertainty before freezing a packet.
  Fresh DB scope inventory2026-09-26:233 distinct members,223 with existing
  source attributes (224 rows) and290 corresponding effects. Members
  411,954,955,5524,5588,5589,5590,5591,5592,5593 lack relation attributes.
  Freeze an explicit selectedMemberIds list for the223-member repair batch;
  retain the excluded IDs in proposal/result coverage and never claim complete
  A6 acceptance. Without an explicit list the candidate still requires all
  members. Missing evidence for a selected member always blocks. No new
  relation facts, equivalent-item guesses or unapproved upstream writes follow
  from this reduced projection-only batch.
  A6.2 live checkpoint2026-09-26: one governed decision
  `armor-secondary-a6-20260926-01` committed224 attributes+290 effects;
  full DB after-set and public/admin Ninja sample fields match. Decision/permit
  consumed; never replay. Coverage remains223/233, not automatic acceptance.
  **A6.3 new blocking semantic repair (requires new bounded authorization):**
  readback exposed133 attribute slot mismatches,181 effect slot mismatches and
  114 class-specific crit cells labeled all in existing upstream records.
  Projection-only equality does not close source correctness. Before another
  publication, add cross-source member-slot/class-key guards and RED/GREEN
  regressions. Repair through reviewed source acquisition/parsing -> fresh
  immutable evidence -> maint_armor_attribute_rows -> relation_armor_attribute_rows
  and relation_equipment_effect_attributes -> the two approved projections.
  The current A6 amendment does not authorize those upstream writes or a new
  armor_attributes_raw landing partition. Preserve historical maint landing
  12448, declare any new landing namespace, and obtain explicit authority for
  exact wrong-effect retirement/new identities (classScope participates in the
  effect record key). No direct DML, arbitrary deletion, equivalent-item guesses,
  local item writes, DDL, H8 expansion or scheduler activation. Freeze affected
  rows, IDs, before/after and recovery behavior in a new operation packet; verify
  source lineage plus semantic class/slot equality in DB/admin/public readback.
  UI sourceLine compensation is not a substitute for correct typed source facts.
  Structured set bonuses need a separately established authoritative revision-
  bound text source and module textKey/variant mapping before write scope is
  proposed; symbolic benefitExpression and legacy88 are not that authority.
  September27 current checkpoint supersedes the preceding proposed-authority
  wording: standing authorization and the semantic-repair implementation are
  recorded in `2026-09-26-armor-secondary-projection-continuation.md`.
  The consumed `.a63-20260927-22` projection decision has recorded223 active
  attribute members and290 active effects with DB/public/admin Ninja parity.
  Ten missing-source members remain excluded; neither full A6 nor automatic
  ingestion is accepted. Continue source images through the registered bounded
  cache operation, then freeze and audit the complete A2–A6 candidate.
  September28 checkpoint: image `.32/.33` operations are already consumed;
  do not repeat them. Candidate producer/consumer and retired-key rederivation
  regressions are repaired (214 focused tests). Before another publication,
  resolve MiningHelmet/item88's two active attribute sources (sentrySlots1/2,
  same landing18668); both proposal paths now reject this ambiguity. The `.22`
  DB after-set and Ninja API parity still hold. See the active image devlog and
  `docs/audits/2026-09-28-armor-validator-readback.json` for current evidence.
- [ ] B1: Finish Buff registered full-chain execution with frozen landing/maint
  entity identity, complete secondary NPC/item evidence and projection derivation,
  source page immunity and runtime-config-bound managed images. Current candidate
  remains explicitly non-executable and cannot mint a packet.
- [ ] S1: Implement Shimmer's real six-scope partition bundle/fences and review it;
  keep the four-table-only path blocked. Sustained unattended operation retains
  its separately scoped release gate in section 1.

Current coordinator owns implementation, shared contracts, docs, runtime and
serial current-model review; no new reviewer/model/subagent dispatch. Earlier
isolated implementer/reviewer assignments above are historical. Any new gap
returns to this sequence and its tests; it never authorizes an ad-hoc write.

The Shimmer positive partition path is not yet constructible: the existing
supplementary bundle builder accepts only the four transform tables. Keep this
lane blocked until a reviewed bundle/policy contract can express the two
cross-owner scopes and their fences. Armor catalog integration and Buff fresh
page-evidence binding are also pre-packet gates, not runtime acceptance.

Evidence entrypoints: `pipelines/relation/armor-set-projection-restoration.mjs`,
`pipelines/relation/buff-image-projection-patch.mjs`,
`pipelines/relation/npc-buff-relation-recovery.mjs`,
`pipelines/npc-canonical/npc-owner-phase-apply.mjs`,
`pipelines/automation/run-governed-l1-operation.mjs`,
`pipelines/automation/canonical-shimmer-import-input-contract.mjs` and
`pipelines/import/import-wiki-shimmer-to-db.mjs`.

### Retry-41 repair: separate logical deduplication from execution artifacts

Observed: a fresh projectiles attempt reused the failed Retry-39 content-derived
directory and correctly stopped before apply. Keep logical `buildAutomaticRunId`
and database `run_id` content-derived; adding randomness to the DB run would
defeat committed-content deduplication. Never delete or overwrite old artifacts.

- Read/validate the supervisor's immutable `(stateStoreEpoch,queueId,attemptId)`
  tuple for scheduler launches; incomplete identity fails before source work.
  Bind it as `importPlan.automaticAttemptIdentity` in the already-hashed bundle.
- Derive an execution namespace from the validated source-dispatch identity and
  attempt tuple. Base and supplementary source/bundle/result/progress snapshots
  and reconciliation evidence use that namespace; no mutable fence/state version
  contributes to artifact identity. Manual legacy paths remain unchanged.
- Canonical CLI/result/reconciliation validators derive the same namespace from
  the bound tuple, never trust a caller-provided directory. Reject mismatched
  attempt progress or sibling execution evidence before mutation/acknowledgement.
- Keep exact committed-run SQL and source-dispatch identity checks. For recovery,
  read verified persisted committed artifact identities rather than looking for
  them under a new attempt directory. A mismatch remains fail-closed; never import
  again merely because a fresh directory is empty.
- RED/GREEN tests must cover retained failed artifacts, same-source/new-probe,
  same-source-triple/new-attempt, same-attempt collision, committed dedupe,
  missing/malformed tuple, namespace tampering and cross-attempt reconciliation.
- Re-review spec and quality, rerun full automation tests and generate a fresh
  scheduler packet. Retry-41/decision74 remain consumed; next natural due time
  is at least `2026-09-22T11:49:30Z` plus the poll/probe allowance. Keep disabled
  during repair/wait; no manual sweep or cadence reset.

Baseline historical OPEN CRITICAL alerts by ID/dedupe key (87 recorded in the
prior review; re-read current count). Require zero new unresolved canary alerts
and inspect relevant historical alerts; do not acknowledge/delete history just
to manufacture a zero count.

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
| `.local/tmp/automation-evidence-catalog-${RUN_ID}.json` | Private catalog for the prior linked worktree | Never stage or commit |
| `.local/tmp/automation-scheduler-baseline-${RUN_ID}.json` | Phase-0 read-only runtime baseline | `0600`, no overwrite |
| `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.preflight*.json` | Fresh preflight | `0600`, no overwrite; use a new retry identity if a prior path exists |
| `reports/authorization/canonical/automation-crawler-v2-scheduler-activation.${RETRY_LABEL}.{input,request,owner-input,packet,result}.json` | New scheduler authorization chain | Unique retry label; never overwrite the tracked historical flat artifacts |
| `reports/runtime/automation-scheduler/${RUN_ID}/` | Sweep, attempt, readback, latency, and rollback evidence | Private and content-addressed where the operation contract requires it |
| `reports/backend-refresh/history/` | Monitor-visible child progress records | Generated by the runner only; no hand-written progress |
| `reports/authorization/canonical/automatic/<domain>/<executionArtifactId>/` | Attempt-specific automatic source and bundle artifacts | Scheduler execution identity derives from logical run ID, source triple and immutable attempt tuple; legacy no-dispatch paths remain unchanged; `0600`, ordinary files, no-overwrite |
| `reports/runtime/l1-reconciliation/<domain>/<executionArtifactId>/` | Automatic source-progress snapshot, source coverage, owned-table readback, attempt state, and reconciliation result | Same derived execution identity as the bundle, independently recomputed by consumers; exact paths and `0600`, no-overwrite |
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
- [ ] Record actual HEAD, full dirty-path inventory and exact reviewed implementation
  file hashes, focused test results, and the manifest-derived transitive code bundle.
  The user-approved continuation preserves the existing dirty worktree: a clean
  commit is not a runtime prerequisite. No unrelated/private evidence is staged.
  Freeze implementation from capture through terminal readback; any change to a
  pinned file invalidates unconsumed artifacts and requires a fresh capture chain.
  Restart Java after relevant code changes; verify process roots and build identity.
  A later focused commit still requires normal review/closeout, not blanket staging.
- [ ] CRITICAL retry-artifact publication enforces the dedicated service-user boundary: current UID matches the repository/artifact owner, all trusted ancestors are canonical ordinary directories with no group/other write bits, and unsafe ownership/mode/platform cases fail before payload publication. The plan records same-UID directory replacement as out of scope and requires a deployment that can enforce the boundary.
- [ ] Source-health retry outbox reads and writes are serialized through one lock, reject malformed status or missing/blank `dedupeKey` entries, reject symlinked/non-canonical ancestors before lock/read/write, atomically replace only on the same validated parent, and surface directory `fsync` failure as a durable-write failure. A damaged outbox blocks healthy scheduler dispatch.
- [ ] Source-monitor initial runtime publication is inside the guarded failure boundary. A first-write failure returns a source-probe terminal `failed` result, attempts the durable CRITICAL alert path, and records terminal runtime state when the path becomes writable; it must not launch a probe or surface only an unclassified exception.

**Failure stop:** Any missing policy scope, absent real diff producer, unverified predicate, reconciliation-mode mismatch, or failing focused test blocks Phase 0/2/3. Repair the contract and tests first; do not compensate by enabling the Scheduler, weakening a check, or using synthetic diff evidence.

## 4. Phase Plan

### Phase 0: Lock scope and capture a read-only baseline

**Estimated time:** 30–45 minutes.

**Inputs:** this plan, the scheduler handoff entry, the H8/global readback identities above, current code, and the live local stack if available.

**Allowed actions:** Git reads, health reads, authenticated monitor reads, MySQL read-only queries, Redis `PING`, and creation of one private baseline JSON. Starting an already-stopped local stack is allowed only through `bash ./platform/local/start-local-stack.sh`; it is not permission to mutate scheduler state.

Probe services first. If startup is needed, use the observed dual-root binding:

```bash
SPRING_TASK_SCHEDULING_ENABLED=false \
TERRAPEDIA_MINIO_CREDENTIALS_FILE=/home/lolben/TerraPedia/.local/tmp/minio-local-credentials.json \
TERRAPEDIA_CRAWLER_QUEUE_V2_REPO_ROOT=/home/lolben/TerraPedia \
TERRAPEDIA_CRAWLER_QUEUE_V2_COMMAND_ROOT="$WORKTREE_ROOT" \
bash ./platform/local/start-local-stack.sh
```

Never print credentials. Durable source/queue reports live under the primary
repo root; executed code lives under this worktree. Startup can perform normal
lifecycle maintenance and authentication may write audit records; neither is
described as an entirely write-free operation. Do not start a second service owner.

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

**Outputs:** `.local/tmp/automation-scheduler-baseline-${RUN_ID}.json` with timestamps, API base, Git identity, database identity, Redis identity, policy rows/hash, control state, counts, reconciler health, and query method; no credentials.

**Acceptance criteria:**

- [ ] Scheduler worktree is at the exact branch/HEAD with the reviewed frozen
  dirty-continuation inventory above; no private evidence was copied into it.
- [ ] MySQL UUID/database/Flyway, Redis namespace, and API health match the fixed runtime boundary; health is HTTP `200` and Redis is `PONG`.
- [ ] All eight policies are `v2/L2/ACTIVE` and the computed live policy-set hash equals H8; the eligible set is exactly the eight rows above with no duplicate domain/action IDs.
- [ ] Control is `enabled=false`, `mode=changed-only`, with an integer interval of at least `1`; live attempts, sweep claims, reservations, and active fences are `0`; reconciler is healthy with zero overdue/failure counts.
- [ ] Read the latest `SCHEDULER_ACTIVATION` decision for `crawler_v2_scheduler`
  using `authorized_at DESC, id DESC`, matching the backend mapper. A retained
  consumed decision may remain unexpired; record it, but never reuse it. The
  control must remain disabled and all prior work terminal before a fresh
  append-only decision can supersede it. An unexplained or concurrently owned
  activation decision blocks continuation.
- [ ] The baseline file is `0600`, ordinary (not a symlink), self-hashing, and not staged.

**Failure stop:** any hash/port/server/epoch/namespace/policy mismatch, active writer/attempt/fence, unexplained or concurrently owned scheduler decision, unavailable authenticated ADMIN read, or unexplained implementation drift. Repair the environment or start a new evidence root; do not continue with a stale baseline.

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
- [ ] Write the catalog under `.local/tmp/automation-evidence-catalog-${RUN_ID}.json` with mode `0600`; re-read and hash every source file after writing the catalog.

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
  --canary-action-id="$CANARY_ACTION_ID" \
  --t1-report=reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json \
  --output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.${RETRY_LABEL}.preflight.json
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

**Identity rule:** The prior L2 promotion approvals and any historical scheduler activation artifacts are not authorization for this phase. Use the verified next unused `RETRY_LABEL` consistently across proposal/request/owner-input/packet/result and a new `decisionIdentity` absent from both the canonical ledger and the database.

**Commands:**

```bash
node pipelines/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs \
  --preflight=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.${RETRY_LABEL}.preflight.json \
  --t1-report=reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json \
  --output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.${RETRY_LABEL}.proposal.json

node pipelines/automation/build-canonical-scheduler-activation-request.mjs \
  --proposal=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.${RETRY_LABEL}.proposal.json \
  --output=reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.${RETRY_LABEL}.request.json

node pipelines/automation/canonical-operation-execution-manifest.mjs \
  --operation-id=automation-crawler-v2-scheduler-activation \
  --result-label="$RETRY_LABEL" \
  --output=reports/authorization/canonical/automation-crawler-v2-scheduler-activation.${RETRY_LABEL}.execution-manifest.json
```

The standing authorization register permits fresh technical packets for its exact
local registered scopes without another chat approval. Re-read `admin/ACTIVE`,
retain its standing reference and a unique phase/action suffix. Owner input must
supply `actor`, `reason`, `authorizationReference`, `decisionIdentity`,
`authorizedAt`, and a bounded future `expiresAt`; never invent expanded authority.
Build the packet through `build-canonical-cutover-authorization.mjs` with the exact
request hash, policy rows, server fingerprint, execution manifest and
`used-decisions.json`. The packet must remain unique and private.

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

Before generating fresh Phase 2/3 artifacts, verify persisted control is false,
then restart with the same canonical command/roots and
`SPRING_TASK_SCHEDULING_ENABLED=true`. Re-read disabled control and all Phase 0
safety axes after restart. JVM scheduling disabled cannot produce a natural tick.
Do not consume a decision and then discover that its freshness budget was spent
waiting for a restart or the next cadence.

Read `lastSweep.checkedAt` and compute due time plus the 60-second poll allowance.
Wait while disabled until due, then refresh source/readiness and authorization.
Use a bounded observer (default 30 minutes after enable, or the lower remaining
authorization deadline) that compares a parsed baseline timestamp, observes source
probe progress and the exact action/attempt, and always restores false in cleanup.
A 1–4 minute watcher is not sufficient evidence. On timeout disable, preserve
attempt ownership and observe terminal convergence; do not force-clear leases or
claim that disabling cancels a running child. Signal/error cleanup must read back
false. If cleanup cannot be verified, block further operations and report it.

Enable only through the authenticated loopback endpoint:

```http
PUT "$API_BASE/api/admin/crawler-monitor/v2/automation"
Content-Type: application/json

{"enabled":true,"mode":"changed-only","sweepIntervalMinutes":60,"canaryActionId":"<exact CANARY_ACTION_ID bound to this packet>"}
```

Do not call `POST /v2/automation/sweep`, test-domain smoke, force refresh, or a child daemon. Let `scheduledV2AutomationSweep` run on its normal `60s` backend tick and due interval. The V2 reconciler/watchdog remains on its `5s` schedule.

**Acceptance criteria:**

- [ ] Pre-enable readback is fresh and matches the packet on every safety axis; any drift aborts before `PUT` and requires a new request/packet.
- [ ] `PUT` returns HTTP `200` through an authenticated ADMIN session, and a subsequent `GET /v2/automation` reads `enabled=true`, `mode=changed-only`, `sweepIntervalMinutes=60`.
- [ ] One `lastSweep.checkedAt` is later than the enable time and proves a natural scheduled sweep; command logs prove no manual sweep endpoint, force action, external daemon, or direct Redis/JSON control write.
- [ ] If no source is changed, the sweep records all eight source observations and `automation_disabled` is absent; unchanged domains are skipped without attempts. If a source is changed, exactly one action enters Phase 5.
- [ ] The effective latest scheduler decision remains unexpired and bound to the
  same H8/policy/server/action identity. Its decision identity occurs exactly
  once; earlier append-only rows remain history even if their expiry is later
  than the readback time. Independently verify the newly authorized row is the
  effective latest row before enabling.

**Failure stop/rollback branch:** On any enable error, stale decision, unexpected attempt, unhealthy reconciler, or malformed sweep, issue the authorized API-only rollback body `{"enabled":false,"mode":"changed-only"}`, then verify disabled state, zero live work, and healthy reconciler. Do not delete or rewrite the failed decision; record a new follow-up identity.

### Phase 5: Prove one real source-change-to-database canary

**Estimated time:** 15–30 minutes after a real `changed=true` probe, plus source-wait time. A normal source event should commit in 1–5 minutes for base domains and 3–10 minutes for Audio/Bosses/Shimmer after claim.

The canary domain is the exact action in the current packet (next continuation:
projectiles), never an opportunistic different changed domain. Do not alter the
source manifest to manufacture `changed=true`. If no real row change occurs,
record `probe-only` or `completed-no-op` and keep data-visible acceptance open.

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
- [ ] Isolated contract/integration tests prove NPC/Boss concurrent admission
  cannot overlap the `npcs` fence. Live windows remain serial and verify zero
  prior writer/fence before each action; do not broaden runtime authority to
  obtain a concurrency demonstration.
- [ ] Every completed run's table readback is a subset of its declared owned tables; shared-table writes are attributed to the owning domain/action and are transactionally reconciled.
- [ ] A policy, epoch, namespace, server, code-bundle, or source-hash drift blocks new dispatch and creates a diagnostic record; it never reuses the old packet.
- [ ] Automatic retry/recovery follows the existing V2 decision contract: resumable domains use `resume` only when the action capability says so, non-resumable work pauses, and the retry limit records `automatic_retry_limit_reached`.
- [ ] Source-probe, activation-gate, dispatch, attempt, sweep, and retry-limit failures are upserted by stable `dedupeKey` in `crawler_automation_alert`; repeated scheduler ticks do not create duplicate rows.
- [ ] If fewer than eight real source changes occurred, the report labels the missing writes `no-natural-change-observed` and remains open for a future event instead of passing by fixture substitution.

**Failure stop:** shared-table overlap, cross-domain mutation, silent probe error, duplicate run, retry-limit bypass, or any attempt to expand the authorized set. Disable the scheduler if the fence cannot be proven.

### Phase 7: Post-readback, latency report, rollback, and long-running handoff

**Estimated time:** 60–120 minutes for closeout plus a 24-hour soak when continuous enablement is approved.

At the end of the initial authorization window, choose one explicit terminal state:

- **Continue (separate release gate, not currently authorized):** a reviewed
  sustained-operation controller must obey disabled-only preflight, immutable new
  decisions, exact action scope, expiry and per-window cleanup. Renewal therefore
  disables/drains first, performs fresh preflight/reauthorization/readback, then
  opens the next bounded action window. Prove two cycles, an expiry boundary,
  controlled restart and fail-closed renewal before claiming S. Never extend an
  old decision or retain unbounded enablement under the existing register.
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

**Audit verdict (2026-09-22):** conditionally executable for independent bounded
M/D canaries after fresh gates and reviewed code freeze; not approved for full
eight-domain closure or sustained S release. Armor/Buff lineage and Shimmer
write footprint are material defects with the concrete gates above. Preserve
earlier artifact/identity/transaction protections and the standing authorization
boundaries. Source/API or safety failures return to the affected gate, not to
an unconditional next retry.
