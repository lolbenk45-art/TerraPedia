# Devlog: crawler-automated-ingestion-closure

## Status

`active`

## Context

- User goal: produce a complete Markdown plan for automated-ingestion closure, execute it serially, repair implementation defects as they appear, and present acceptance only after the achievable closure gates are complete.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Base: `0753f281`
- Parent: `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- Plan: `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`
- Design authority: `docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md`

## Direction / Decisions

- Chosen approach: execute the complete chain serially in dependency order: group CODE_READY/T1/T2, deferred NPC CODE_READY/T1/T2, full domain gate, first real L1, then separately authorized L2/scheduler availability.
- Reasoning: Phase 1A alone is a shared landing foundation; claiming closure before canonical consumers, NPC evidence, formal cutover, and a real L1 would not satisfy the original automated-ingestion goal.
- Authorization boundary: source/code tests and disposable T0/T1 may proceed. Formal schema/data writes, real crawler execution, bootstrap, L1/L2 promotion, and scheduler activation each require their own exact packet with System Owner identity and authorization reference.
- Execution model: one serial coordinator; no subagents and no parallel writers.
- User execution direction on 2026-07-28: treat every formal operation as an
  independent lane; keep a failed or incomplete lane fail-closed, continue
  unrelated eligible lanes, and consolidate only the exact identity/external
  decisions that still require the user at final handoff.
- System Owner authorization received on 2026-07-28 for the exact
  `automation-biomes-l0-bootstrap` proposal: actor/owner `admin`, fixed
  `biomes` L0/DISABLED policy caps, operation-specific reason, durable
  reference `devlog://crawler-automated-ingestion-closure/owner-authorization-2026-07-28`,
  one-time decision identity `automation-biomes-l0-bootstrap-20260728-01`, and
  expiry `2026-07-31T20:00:00.000Z`. This decision does not authorize reuse of
  its identity for another operation.
- System Owner authorization received on 2026-07-28 for exact proposal
  `canonical-downstream-batch-01-20260728`. It binds actor `admin`, expiry
  `2026-07-31T20:00:00.000Z`, and six request-specific hashes, reasons,
  references, and one-time identities for schema V56-V58, image sync, boss
  import, projectile backfill, bounded recipe crawler, and bounded 25-target NPC
  crawler. Every lane remains independent and consumes only its own identity.
- Continuation architecture resolution on 2026-07-28: the packet-consuming Node
  runner is the single formal apply path. Seven missing executors now have real
  implementations; the unused backend apply bean remains deliberately
  fail-closed so it cannot create a second transaction/protocol. The eighth,
  `canonical-npc-apply`, stays non-executable because its proposed writes cross
  capability owners and no cross-capability orchestration decision exists.
- Plan audit repair: NPC fixture evidence is capped at `CODE_READY` until a real,
  separately authorized crawler artifact exists; missing import/backfill reports
  remain operation checkpoints rather than code defects; backend registry and
  Task 6-11 file ownership now use exact repository paths.
- Task 2 implementation audit repaired two Important ownership/model defects:
  local group rows retain `(canonical_key, source_layer)` so consumer-specific
  winner selection remains possible, and the two projection-state writers share
  one serialized singleton fence while all source-layer rows remain disjoint.
  Local aliases likewise retain canonical key plus source layer so a valid
  same-group override does not collide with its reference-layer alias.
- Task 6 plan repair found one Important schema gap before implementation: the
  required append-only admin audit record had no physical table. V57 will retain
  four runtime tables and add one admin-only immutable audit table; the plan,
  design, ownership, and DDL contracts now name it explicitly.
- Task 15 plan audit found one Critical authorization gap: V55 can describe an
  L2 policy but cannot durably bind an L2 promotion or scheduler activation to
  an exact decision identity, packet hash, authorization reference, and expiry.
  The repaired plan adds an unapplied append-only V58 activation-decision
  artifact and requires backend eligibility to bind repeated committed L1
  evidence plus the exact current policy version/hash/set to fresh
  `L2_PROMOTION` and `SCHEDULER_ACTIVATION` records. The old V1 wiki scheduler
  remains outside this automation path.
- Continuation plan audit found three additional Critical defects and two
  Important defects. The old seven-operation request catalog omitted bootstrap,
  seven warning producers, L1 policy promotion, and the second L1 apply;
  bootstrap incorrectly depended on a policy-set hash that does not exist yet;
  crawler requests attempted to bind future output instead of a pre-run manifest;
  no formal runner consumed packets before dispatch; and the NPC action CLI has
  no governed executor while the recipe crawler has no monitor-visible progress
  contract. The plan now defines 17 independent operation IDs, operation-specific
  technical requirements, pre-run crawler manifests, post-crawl frozen apply
  bundles, two L1 applies, and a packet-consuming runner gate. Affected lanes
  remain non-executable until their code/progress/identity inputs are complete.

## Scope

- Frontend: admin item-group and acceptance views required for canonical/backend-owned state.
- Backend: canonical group repositories, transactional admin writer, crawler automation registry, acceptance APIs, and runtime smoke.
- Data: group and NPC landing/maint/relation/local chains, compatibility exporters, readiness evidence, warning closure, T0/T1/T2 gates.
- Docs/process: plan, current facts after they become true, audit records, devlog, and final acceptance.
- Authorization execution: 17 request contracts plus a formal packet-consuming
  runner; direct producer invocation is not accepted as an authorized result.
- Out of scope: unrelated product features, redesigning recipe/shimmer/NPC semantics, destructive cleanup, push, or merge.

## Validation

- Baseline read-only domain generation: 45 panels; 35 pass, 10 warning, 0 blocked; no report written.
- Task 1 fresh baseline: exact pre-cutover group consumer inventory passes 1/1
  with 13 production references; landing schema/import/audit/V56 contract suite
  passes 32/32; domain generation remains 45 panels, 35 pass, 10 warning,
  0 blocked, and 0 written.
- Task 2 RED reproduced 11 expected contract failures after the test syntax was
  corrected. The final schema/ownership/migration-byte suite passes 30/30.
  Two GREEN-run defects were traced to an imprecise singleton-overlap diagnostic
  and a stale local column catalog; their focused regression rerun passes 2/2.
  At that Task 2 checkpoint, V57 was still an unapplied migration artifact.
- Task 3 scope repair: the exact consumer inventory now classifies the pure
  bootstrap parser and landing locator as `bootstrap` readers. They are intended
  one-time inputs, not steady-state pipeline readers; unknown references still
  fail the inventory contract.
- Task 3 RED reproduced five missing parser/locator contracts. Final combined
  bootstrap, consumer-inventory, locator, landing schema/import/audit, and V56
  contract validation passes 46/46. The read-only real-file probe emits four
  governed descriptors: 33 recipe groups, 29 reconciliation groups with two
  exclusions, one source group, one blocked group, and zero admin bootstrap
  groups. Full-file bytes remain lineage only; group payloads are 28,698 bytes
  or less.
- Task 4 RED reproduced the missing canonical sync, maint extraction, relation
  entrypoint, and protected recipe-reader contracts. Focused validation passes
  81/81 with one existing skip; the Task 2-4 dependency suite passes 123/123
  with the same existing skip. A real-file, pure-memory projection reports 35
  maint groups / 163 members / 2 exclusions, 161 resolved and 2 rejected
  relation members, one blocked group, and 34 runtime groups / 161 runtime
  members. Task 6 corrected the persisted implicit-identity contract to 72
  maint aliases and 70 runtime aliases, and versioned the local persisted-field
  snapshot hash; the frozen read-only projection now hashes to
  `3c934d57e747e34ccec74822ca609948b330f61b4f9d7280d8476d3dc48e1c32`.
  Runtime rows and `PUBLISHED` state use one injected local transaction. No
  formal database name or connection appears in the new sync tests.
- Task 5 RED reproduced nine missing shadow/export/source-evidence contracts.
  Focused GREEN passes 15/15; the bootstrap/sync/consumer/landing dependency
  suite passes 55/55. A read-only real-file round trip preserves 35 canonical
  rows (34 active, one blocked), 163 members, two exclusions, and snapshot hash
  `94765e084970db43fdb52523b813b2169791b5dbec4570f408f97ccdd08550a5`.
  The exporter rejects writer credentials and revision-mismatched or missing
  recipe non-group evidence; landing continues to reject `compat_export` before
  opening a connection.
- Task 6 GREEN passes backend 34/34, canonical/pipeline Node 83/83, admin page
  contracts 8/8, and Nuxt typecheck. Canonical consumers no longer read the
  three compatibility JSON files at runtime. The admin writer is same-server
  only, commits maint/relation/local/state/audit in one transaction, records the
  authenticated username, applies the 1 MiB / 160-member / 32-alias caps,
  validates identity collisions while holding the shared projection fence, and
  uses Node-compatible record keys and local snapshot hashes. V57 now includes
  the immutable append-only audit table but remains unapplied. See git for
  code-level diff details.
- Task 7 RED reproduced the missing action module, 19-row catalog, absent
  backend refresh steps, and missing pre-bootstrap admin visibility. GREEN
  passes the combined Node catalog/progress/backend-plan/admin suite 61/61 and
  backend registry/service/controller tests 28/28. The exact catalog is now 21
  operations; both canonical group operations remain `L0 + DISABLED`, and the
  apply scope contains only source-derived group rows plus the serialized
  projection-state singleton. The action writes running state before work,
  heartbeats, and completed/failed terminal state. A plan repair added the two
  backend refresh plan files required to make registered commands resolvable.
  No capability, schema, or data operation was executed.
- Task 8 corrected the plan from the unrelated domain-acceptance classes to the
  real `DataSourceAcceptanceServiceImpl` overview chain. RED reproduced missing,
  malformed, stale, wrong-role, writer, hash-mismatch, unknown-command-risk, and
  fresh-but-invalid routing gaps. Local review additionally caught missing
  `generatedAt`, duplicate compatibility-export, and refresh-plan filtering
  bypasses before commit. Final focused validation passes Node 45/45, backend
  16/16, and admin 15/15. Canonical readiness remains read-only, requires exact
  T2 cutover identity/count/hash/parity/export evidence, and blocks every
  acceptance surface when absent or invalid. See git for code-level diff details.
- Task 9 final no-formal-write validation passes the complete Node aggregate at
  300 test positions with one existing skip, backend 78/78, admin 37/37, and
  Nuxt typecheck. Disposable T0 run `t0g_ef820e65a3de94ef` passed 36 schema
  evidence checks and three-database rollback/commit/restore counts of `0/1/0`.
- Task 9 disposable T1 run `t1g_bbc162216efc9d01` froze and verified 128
  ownership-allowlisted tables with snapshot hash
  `sha256:5c4d063f273c6fa73bc8f9d12d5d30c6c95d2aa248c53b4953a415b0a040568e`
  and verification hash
  `sha256:4a52b876fb33002e5b0328cb7038e69c758b619a845dbc2b01f235cd7c50de70`.
  Twelve pre-cutover canonical tables were represented explicitly as
  `sourceAvailable=false`; their migrated isolated targets existed and remained
  empty before the canonical transaction.
- T1 canonical evidence passed at 4 landing sources; 35/163/72/2 maint rows;
  35/163/72 relation rows with zero unresolved/ambiguous, two rejected, and one
  blocked group; and 34/161/70 local rows plus one published state. Runtime hash
  `8d3fb0b1f8d995b8c356e1de032f12cf359bf31f438287e6f5f47907f89fe819`,
  compatibility hash
  `54130fe0f9c3ebaffef3b933380172e9ec20e9337d2cae0409d8cd22b40d000d`,
  round trip, rollback, commit, and restore all passed.
- Live repair evidence: the adapter now projects V55 landing samples through
  the exact V56 legacy backfill contract, preserves child stderr across EPIPE,
  selects the isolated local session for temporary tables, and uses explicit
  physical columns plus the canonical runtime snapshot mapper. Every failed
  attempt and the final run cleaned databases, accounts, Redis reservations,
  and private temporary directories to zero. Redis 16380 was temporarily
  started because it was initially stopped, then restored to stopped. See git
  for code-level diff details.
- Task 10 reproduced the exact read-only baseline at 45 panels / 35 pass / 10
  warning / 0 blocked / 0 written. Seven new RED contract groups proved that
  empty-shell and dry-run image-sync, boss import, boss-loot import, projectile,
  recipe, and shimmer artifacts could be mistaken for pass evidence. GREEN now
  requires applied producer-shaped evidence, exact counters, non-empty source
  identities, and recipe table/row semantics; focused validation passes 61/61.
- Task 10's filesystem-only armor repair maps 17 previously unresolved
  `ArmorSetBonus.*` rows through their stable source keys and records 19 exact
  reviewed placeholders by `internalCode + itemIds + reason`, independent of
  database IDs. The regenerated 151-row map contains 132 mapped and 19 reviewed
  placeholder records. Armor source readiness passes, and the read-only overall
  baseline is now 45 panels / 36 pass / 9 warning / 0 blocked / 0 written. No
  threshold, deadline, producer report, database row, or formal operation was
  changed. See git for code-level diff details.
- Task 11 now separates `npcs_base_raw` from immutable paired
  `npc_crawler_facts_raw`, persists four-state maint facts, and reconstructs
  Buff/shop/loot relation and local inputs only from `MATCHED` facts. The exact
  capability catalog is 23 operations; both NPC operations remain
  `L0 + DISABLED`, and their only write ownership is
  `maint.maint_npc_crawler_facts`. The modified/untracked Node aggregate passes
  375/376 with one existing skip; backend action/acceptance/queue tests pass
  59/59; admin Nuxt typecheck passes; bridge retirement scans 3,023 files with
  zero production references. See git for code-level diff details.
- Task 11 disposable T0 run `npc_7a854dc3e2150815` passed 13 required-table
  probes. Paired base/crawler/normalized/audit evidence is `1/1/1/1`; maint is
  one `MATCHED` fact; relation and local each contain one Buff, shop, and loot
  fixture. Target-row rollback/commit/restore counts are `0/1/0`, the readiness
  contract emits only `CODE_READY`, and independent cleanup confirms zero
  databases, accounts, Redis DB 14 keys, and reservations. A first live attempt
  exposed an invalid nullable-column projection; the regression was reproduced,
  fixed at the T0 SQL column mapping, and its failure cleanup also reached zero.
- Final fresh closeout keeps the modified/untracked Node aggregate at 375/376
  with one existing skip, backend focused tests at 59/59, admin Nuxt typecheck
  green, and quality-gate inclusion contracts at 15/15. The read-only bridge
  scan remains pass at 3,023 files / zero production references. Post-run cleanup
  was independently re-read as zero isolation databases, zero temporary accounts,
  Redis DB 14 size zero, empty reservation, no live-acceptance temp directory,
  and no progress `.tmp` files.
- Historical pre-bootstrap Task 12 evidence generated seven filesystem-only
  `AWAITING_OWNER` requests with ordered
  schema/data byte manifests and atomic output. Packet authorization rejects
  Owner/technical/time drift, duplicate decisions, and packet mutation; focused
  tests pass 7/7. Formal read-only inspection confirms the server identity is
  available but `crawler_automation_policy` then had zero rows, so every request
  lacks `policySetHash`; crawler/L1/L2/scheduler requests also lack their future
  data bundle. No executable packet was generated.
- Task 12 request hashes: schema `sha256:85ce71d6f44f230de14d2677b8e306fadf25a5571e52556c9f7f4d18e9e18cfb`;
  group bootstrap `sha256:0971bd58d2e5c0cbbddcba60ba64dd344a9cdecd3654c03e23d7a48cd763c0e3`;
  NPC crawler `sha256:d29044c41221418fe2d8796b0456b2cdf110d110f3f880ddeab21bef10051b4c`;
  NPC apply `sha256:b7c41c237a617ada271ddb537ec9686055a5ed0b084c5b6c6051ae4c186061d4`;
  first L1 `sha256:ff6ea2be57d472a24f136542cad6a863246d6e4e6a6a5d9728514dd403150c80`;
  L2 `sha256:070441ac54f0f0371e66db11db2db764b5c0bd69ca0ceb090649ed11a82d4323`;
  scheduler `sha256:1196894d7f4aca7cc050adde6b035851c4d9c1bfb7847572cc7081fe891d9fc7`.
  These seven hashes are superseded by the V58 authorization-contract repair;
  none was executable.
- Task 15 replacement request hashes: schema
  `sha256:a95fc92497540d23006da976b27295d9f13814f231aa1d564a8b95455fdf9481`;
  group bootstrap `sha256:4f71b233c24b2167a798d1c25a716aafefde015ce3e5cfb7d6ecfaa98962b732`;
  NPC crawler `sha256:854a103a9a57a3056d9392d9e8e464ac19ea2f613240ccc27f4e0fcdd9251bdf`;
  NPC apply `sha256:5f0d0b3aadb88309ea4b1df84c26e253a1e55458f9bc41812d1632cee78fa4cf`;
  first L1 `sha256:8b3c59bc4f9d767acfc9b398dd9f116fb9a597bf7bd0e4b2e81ce0cb22649890`;
  L2 `sha256:3a57fbbcc2d02973cbfe0d6f0b66334bda6b73c17152df9990a01fab83af74ab`;
  scheduler `sha256:fb13d0f462222a33fae0980a98fac056afe27e1b2a1ff5f8b25013ef31e822a5`.
  All seven are `AWAITING_OWNER`, zero packet files exist, and the earliest
  expiry is `2026-07-28T17:23:23.584Z`. Because the old request retained only a
  hash of its raw server fingerprint, replacements fail closed with fresh
  server fingerprint plus policy/data evidence listed as missing rather than
  fabricating or reusing technical identity.
- Task 15 RED reproduced missing V58 migration bytes, old V56-V57 packet IDs,
  absent durable activation records, and absent backend eligibility APIs. GREEN
  passes the migration/authorization suite 11/11 and policy/service tests 37/37.
  The required backend regression including controller and the unchanged V1
  monitor passes 237/237. One initial monitor run observed a stale-heartbeat
  timing assertion (`timed_out` versus `failed`); the exact test then passed 1/1
  and the full rerun passed without a code change. Database freshness
  is evaluated by MySQL `CURRENT_TIMESTAMP`, avoiding JVM/database timezone
  drift. At that code-only Task 15 checkpoint, V58 was still unapplied. See git
  for code-level diff details.
- Continuation authorization repair generates all 17 independent
  `AWAITING_OWNER` requests with a fresh exact server fingerprint and no packets.
  The operation contract now has operation-specific required fields, excludes
  the impossible pre-bootstrap policy-set dependency, binds pre-run crawler
  manifests instead of future output bytes, and rechecks every declared code
  hash plus the command entrypoint. The formal runner revalidates all current
  identity, atomically consumes a durable one-time decision, rejects
  credential-shaped command arguments, dispatches without a shell, and keeps a
  failed lane isolated while later eligible lanes continue. Its fail-closed CLI
  probe rejected an `AWAITING_OWNER` request with exit 1 before creating a
  ledger or starting a crawler. Authorization tests pass 15/15.
- Recipe crawler progress now writes running state before work, mirrors an
  explicit child path to the canonical monitor path, heartbeats, and writes
  completed/failed terminal state. The current exact recipe execution manifest
  binds two seed pages, depth 1, serial execution, output/report/progress paths,
  and five code files; its request lacks only `policySetHash` plus the four Owner
  fields. The NPC CLI's missing atomic fanout writer is restored, and the
  governed preview now requires an existing targets file and a limit of 1-500.
  Focused recipe/NPC/crawler tests pass 18/18. Producer preflight also reproduced
  stale direct `mysql2` resolution in the boss and shimmer importers; both now
  use the repository loader, their tests pass 6/6, and the real module resolves
  from `data-query-app/node_modules`. No network or database operation ran. See
  git for code-level diff details.
- An initial broad backend run found four stale V2 queue assertions caused by the
  two newly registered domains; they were repaired and the integrated 59-test
  backend suite passes. A fresh broad rerun executes 1,510 tests with six failures,
  all outside this task in legacy port cleanup (2), audio streaming (1), and item
  image SQL contracts (3); they are not treated as automated-ingestion regressions.
- Authorization continuation now supplies a formal bootstrap CLI that consumes
  one frozen input, accepts credentials only from environment variables, applies
  inside the existing transaction, writes a private atomic result, and always
  closes its connection. The 17-operation catalog now freezes exact data input
  paths, rejects incomplete input families as a whole, binds every manifest to
  its operation ID and governed entrypoint, and rejects any command, bounds,
  path, write-boundary, or exact code-list drift.
- Nine operations with existing real entrypoints now have reproducible exact
  manifest generation. Eight remaining operations explicitly retain `no governed
  executor` rather than accepting a placeholder command: schema V56-V58, group
  apply, NPC apply, L1 policy promotion, two L1 applies, L2 promotion, and
  scheduler activation. The offline NPC target builder froze 25 uncrawled
  targets at `8/8/4/5` town/boss/friendly/enemy without network access.
- Fresh focused validation passes 48/48 across bootstrap, authorization, runner,
  manifest, NPC-target, crawler coverage, and NPC governed-action tests. A
  read-only formal `information_schema` probe found only
  `local.source_dataset_landings` and `maint.source_dataset_landings` among the
  15 queried V56-V58/group/NPC canonical tables; no formal schema mutation ran.
  The 17 regenerated pre-bootstrap request hashes have sorted request-set hash
  `sha256:a4b443da60dbcc1c23fca6191eb183655a46fea9a82f8481a205bbd8d93ee9be`;
  individual request hashes remain in the ignored request artifacts and no
  packet exists.
  See git for code-level diff details.
- Plan audit: 2 Critical and 4 Important defects found and repaired before execution;
  post-repair audit reports 0 Critical and 0 Important defects. `git diff --check`,
  closure-level/source-chain/authorization consistency scans, and the no-placeholder
  scan pass for the planning scope.
- Phase 1A evidence inherited from parent: six-file no-database suite 41/41 and V56 parser contract; V56 remains unexecuted.
- Not run at kickoff: formal schema/data mutation, crawler, bootstrap, L1/L2, scheduler, restart, push, or merge.
- Task 12A focused Node aggregate passes 88/88 across authorization, manifest,
  capability ownership, schema, group, biomes, policy decision, NPC target/input,
  and crawler coverage contracts. Backend focused validation passes 227/227,
  including the Java Flyway CLI environment/version contract. No formal database
  connection, crawler, bootstrap, apply, activation, or scheduler was run.
- Manifest review found and repaired unbound transitive imports. All 16
  executable manifests now freeze every repository-local static import reachable
  from their explicit safety-critical code seeds; current-hash validation rejects
  dependency drift.
- NPC target generation reproduced one invalid source candidate (`???` with an
  empty entity identity). A RED regression now filters unstable identities before
  quota selection and still selects exactly 25 balanced targets. Frozen apply
  input generation then stopped on missing real `angler` normalized evidence, as
  required; no crawler was started to manufacture it.
- The exact authorized bootstrap packet
  `sha256:0ee4b49076ed5773bbe88bdfefb7fa277c3990fb942aff6ccb5235781e6ae682`
  was consumed once by the formal Node runner. Database readback proves one
  ACTIVE Owner (`admin`), one `biomes` L0/DISABLED policy, and policy version 1
  with policy hash
  `sha256:f87211cd6487637be3579a77e6ff25dff6304697fa3d01da671115b98481522e`.
  The persisted policy-set hash is
  `sha256:fddd9c42ad0f2c22c4d611f63fb06fbe2444e4aea97029d0c11396e66d0b0e3c`.
  Focused bootstrap/authorization/runner/manifest validation passes 43/43.
  Six downstream operations are now technically complete but still require
  their own exact Owner fields: schema V56-V58, image sync, boss import,
  projectile backfill, recipe crawler, and NPC crawler.
- The post-bootstrap full quality gate was started from the beginning. Data
  workflow acceptance passes 287/287 and crawler automation contracts pass
  177/177. The gate then stops, as designed, at the domain acceptance dry-run:
  36 pass / 9 warning / 0 blocked. The nine warnings are the exact missing
  image, boss, projectile, recipe, and shimmer producer evidence already mapped
  in Task 10; no implementation regression or threshold defect was found.
- Authorized downstream Batch 01 consumed all six independent decision
  identities. Projectile backfill completed at 1,111 total / 1,006 Chinese
  matches / 1,110 managed images with zero changed rows; recipe crawl completed
  41 pages / 40 recipe pages / 61 tables / 3,663 rows; and the bounded NPC
  crawler reported 25/25 completed with monitor-visible terminal progress.
  Image sync and boss import both failed before mutation because their exact
  manifests used stale backend port 18188 while the active runtime manifest
  exposes `http://127.0.0.1:18191/api`.
- The schema packet applied and registered local Flyway V56-V58 with checksums
  `-585051534`, `-1166263000`, and `535001711`. Local has all six queried
  V57/V58 tables; maint has all eight V56 landing columns plus all five
  canonical role tables. Post-role verification then failed because MySQL 9
  returned uppercase `COLUMN_NAME` / `TABLE_NAME` labels while the wrapper read
  only lowercase properties. The relation database therefore has five of the
  eight required role tables and is missing the three canonical item-group
  tables. A RED-to-GREEN metadata-label regression repair passes 3/3; the
  consumed schema identity cannot be reused for the relation retry.
- Recipe apply input is now frozen from the real 3,663-row crawler output. Its
  regenerated request hash is
  `sha256:523c61a376d9990148422afd6b3286c7180ad7927605ba2fe6d50b7d058177bd`,
  data-bundle hash is
  `sha256:50f44d231b5654ba352245ee104dc63f86eda0a0c73f9a989e48489ae96c26d2`,
  and no technical fields are missing.
- Real NPC apply-input freezing remains fail-closed. The crawler audit fanout
  contains only `status` / `reasons`, not the entity, revision, and normalized
  hash identity required by the apply contract. Five redirected targets also
  wrote canonical page IDs (`goblin-tinkerer`, `mechanic`, `wizard`,
  `gem-bunnies`, and `gem-squirrels`) instead of their frozen target IDs. The
  batch summary's 25/25 result is crawler completion evidence, not valid apply
  evidence; no NPC apply input or request was generated from it.
- NPC contract repair is now code-complete in a separate RED-to-GREEN
  checkpoint: CLI audit fanout binds entity/page/revision/normalized hash and
  audit time; redirected target evidence can be selected only by a unique
  stable standardized infobox ID; and maint matching consumes those infobox IDs
  for group pages. The focused crawler/NPC suite passes 95/95. Existing Batch
  01 crawler bytes remain invalid under the repaired contract and were not
  rewritten. A new bounded crawler request is generated at
  `sha256:4d7862e35e08db52c7ce1e6dc3f953e026b83ca6bae2a746fbb888d8c52870ba`;
  it is `AWAITING_OWNER` in the Batch 02 proposal.

## Result

- Completed: closure scope, authorization boundary, source-chain decomposition, and executable master plan drafted.
- Completed: Task 1 freezes the exact three-file production consumer inventory
  without suppressing the known runtime and pipeline readers.
- Completed: Task 2 defines four maint, three relation, and four layer-preserving
  local group tables plus disjoint source/admin ownership and a shared serialized
  projection-state fence. See git for code-level diff details.
- Completed: Task 3 parses the frozen three-file bootstrap without DB/network/
  filesystem writes, reconciles the exact 27 redundant rows and two exclusions,
  preserves blocked/source classifications, and emits group-only landing payloads.
  See git for code-level diff details.
- Completed: Task 4 builds deterministic maint, relation, and layer-preserving
  local projections with source rotation, exclusion and identity gates, stable
  record keys/hashes, per-consumer winner selection, and atomic local publish.
  See git for code-level diff details.
- Completed: Task 5 bounds shadow normalization to duplicate collapse and
  null-to-value member-name enrichment, and provides deterministic one-way
  compatibility export/reparse with exact blocked, exclusion, source metadata,
  and snapshot-hash fidelity. See git for code-level diff details.
- Completed: Task 6 cuts backend, recipe expansion, pipeline group readers, and
  the admin page to canonical repositories with fail-closed read/write state,
  authenticated audit identity, bounded synchronous writes, and cross-language
  snapshot identity. See git for code-level diff details.
- Completed: Task 7 registers the canonical group preview/apply pair across the
  21-operation fixture, backend registry, backend refresh plan, acceptance
  runner, and admin visibility with monitor-owned progress. See git for
  code-level diff details.
- Completed: Task 8 replaces the legacy source-group audit evidence with a
  fail-closed canonical item-group readiness v1 contract across offline
  freshness, manual refresh planning, backend overview, admin labeling, and the
  local quality gate. See git for code-level diff details.
- Completed: Task 9 proves group `CODE_READY` and `T1_VERIFIED` through exact
  schema, frozen snapshot, canonical transaction, compatibility round trip,
  restore, and zero-leak evidence. See git for code-level diff details.
- Completed in Task 10: warning/producer CODE_READY contracts and the only
  authorized filesystem repair; armor source readiness is pass.
- Completed in Task 11: NPC source split, paired evidence limits, maint fact
  ownership, Buff/shop/loot reconstruction, 23-operation registration,
  fail-closed acceptance surfaces, and fixture-level T0 `CODE_READY`.
- Completed in Task 12 within the read-only boundary: 17 independent
  authorization requests, fail-closed request-to-packet conversion, exact code
  manifest verification, durable one-time decision use, and a packet-consuming
  no-shell runner.
- Completed in Task 12/14 formal execution: the separately authorized
  `automation-biomes-l0-bootstrap` request was converted to a private exact
  packet, consumed once, applied transactionally, and verified by database
  readback. Formal automation governance now contains exactly one Owner, one
  current policy, and one immutable policy version.
- Completed in Task 12/12A continuation: exact per-operation data path
  resolution, recursive manifest operation/entrypoint/argument/code binding, a
  formal Flyway schema path, a governed group apply, biomes preview/L1 apply,
  L1/L2/scheduler decision executors, 16 reproducible governed manifests, 17
  refreshed `AWAITING_OWNER` requests, and a valid bounded 25-target NPC crawler
  input.
- Completed in Task 15 within the code-only boundary: append-only V58 activation
  decision contract, repeated committed-L1 and exact current-policy gating,
  transaction-time L2 revalidation, and scheduler fail-closed visibility.
- Completed in formal Batch 01: projectile backfill and the bounded recipe/NPC
  crawler operations. Local V56-V58 and the maint role schema are applied; the
  schema operation still needs an independently authorized relation-role retry.
- Completed in code-only repair: NPC paired audit identity and redirected
  standardized-ID evidence binding, with no data rewrite or second crawler run.
- Not completed: NPC ownership-valid apply orchestration, Task 10's nine
  operation-dependent warning panels, Task 11 isolated NPC T1, Task 12 Owner
  authorization for the remaining independent operations, Task 13, Task 14
  Steps 1 and 3-9, Task 15 Steps 3-5, Task 16, and every formal apply or
  activation checkpoint after bootstrap.

## Residual Risks

- Every remaining formal operation still depends on its own exact System Owner
  reason/reference/decision identity; the consumed bootstrap identity cannot be reused.
- Deferred NPC facts require real crawler evidence; absence remains blocking rather than falling back to the retired bridge.
- The first NPC crawler output is not reusable as apply evidence because its
  audit files predate the paired-identity repair; a fresh authorized crawl is
  required before isolated NPC T1.
- Nine warning panels depend on real crawler/import/backfill/image evidence and
  cannot pass before their independently authorized operations. Empty-shell and
  dry-run artifacts now fail closed; armor is no longer a warning. The fresh
  post-bootstrap full gate reproduces exactly 36 pass / 9 warning / 0 blocked.
- Local V56/V57/V58 and the maint role schema are applied, but the relation
  canonical item-group role tables are still absent and no schema result JSON
  exists. The group bootstrap remains unapplied; isolated T1 evidence does not
  authorize T2.
- The regenerated downstream request files expire at `2026-07-31T20:00:00.000Z`; expired requests
  must be regenerated from current bytes and fingerprints rather than reused.
- Full backend `mvn test` is not green because six observed failures remain in
  unrelated pre-existing test areas; the task-owned focused backend suite is
  green after repairing its four queue contract failures.
- Sixteen formal operations have governed executors. Only
  `canonical-npc-apply` lacks a manifest, by design, because its write set crosses
  capability owners. Recipe apply now has complete technical input. Boss-loot,
  shimmer, NPC apply, group bootstrap, and biomes policy/apply lanes still lack
  producer, ownership, or policy inputs; these are independent data/governance
  blockers rather than missing entrypoint code.
- `FailClosedCrawlerAutomationApplyContextProvider` remains the intentional
  backend default and has no production apply caller. Formal execution is owned
  by the exact packet-consuming Node executor; enabling the backend bean without
  a same-transaction domain importer would be a protocol bypass.

## Follow-up

- System Owner: provide new operation-specific reasons/references/decision
  identities for the relation-role schema retry, image sync and boss import
  retries bound to runtime port 18191, and the technically complete recipe
  apply request. Task 10 Steps 5-6, NPC crawler-contract repair/T1, T2, both L1
  applies, L2, and scheduler activation remain separate packets.
- Capability owners: decide whether NPC canonical apply is split into separately
  owned maint/relation/local operation IDs or approved as an explicit
  cross-capability orchestration contract. Until then, `canonical-npc-apply`
  remains `executor: null` even after crawler evidence exists.

## Commits

- `7c43c439` `docs(plan): define automated ingestion closure`
- `4d279ad6` `test(data): lock canonical group consumers`
- `88e8392c` `feat(data): define canonical item group schemas`
- `988b1bbf` `feat(data): reconcile item group bootstrap`
- `c8d4fc31` `feat(data): project canonical item groups`
- `bf96cca6` `feat(data): export canonical item group compatibility`
- `f8769ac8` `feat(item-groups): use canonical repositories`
- `ef4d4af4` `feat(automation): register canonical item group actions`
- `7c5095bd` `feat(audit): gate canonical item group readiness`
- `56009156` `test(data): verify canonical item groups in T1`
- `83de1e3a` `fix(data): enforce readiness producer evidence`
- `340095fd` `feat(npc): add canonical crawler fact pipeline`
- `8c28a549` `feat(authorization): bind canonical cutover requests`
- `53fb31f9` `feat(automation): gate canonical npc readiness`
