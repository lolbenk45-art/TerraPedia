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
- System Owner authorization received on 2026-07-29 for exact proposal
  `canonical-downstream-batch-02-20260728`. Its five lanes were executed
  independently: NPC crawl and item image sync completed; schema stopped before
  dispatch on manifest drift; recipe apply failed before connection; and boss
  import rolled back. Consumed recipe/NPC/image/boss decision identities cannot
  be reused. The unconsumed schema identity remains bound to the superseded
  request and is not treated as authorization for replacement bytes.
- System Owner authorization received on 2026-07-29 for exact proposal
  `canonical-downstream-batch-03-20260729`. Schema, recipe, and boss were
  executed serially with independent fail-close boundaries. All three one-time
  identities are consumed. Schema completed; recipe stopped after its importer
  stage on a second direct mysql loader; boss rolled back after the backend
  rejected all 21 valid GIF uploads. Neither failed identity is reusable.
- System Owner authorization received on 2026-07-29 for exact proposal
  `canonical-downstream-batch-04-20260729`. Recipe and boss retries were
  executed serially against their exact packets. Both one-time identities are
  consumed and completed; neither can be reused. The boss lane used only the
  isolated worktree backend on `18192` and Redis DB 14, then removed both
  temporary runtime states without affecting the original `18191` backend.
- System Owner authorized `canonical-item-group-bootstrap-20260729-01` on
  2026-07-29 for the then-current exact group request. Packet construction
  rejected that request before identity consumption because commit `ac13f0e0`
  had changed the shared execution-manifest module after request generation.
  The authorization stays bound to the superseded request and is not reused for
  replacement bytes.
- System Owner authorized exact proposal
  `canonical-item-group-bootstrap-retry-02-20260729` on 2026-07-29. It binds
  actor `admin`, request
  `sha256:de0528244a2c53a6a5850b03b7bd3f0917d7826980fdbfe05fa93e8654738ee7`,
  packet `sha256:dddef0127ccb1fe02e05f9045e06a2dec04af4fbd5a0db937bfa8ff6c7bb51f5`,
  and one-time identity `canonical-item-group-bootstrap-20260729-02`. The
  authorization covers only the frozen bootstrap and readback, not fallback
  disablement, service restart, NPC, Biomes, or later automation operations.
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
- Step 3B continuation audit found that seven independent executors alone could
  still allow partial NPC publication to be mistaken for completion. The plan
  now requires a strict seven-phase dependency chain, one shared frozen apply
  input hash, exact upstream result binding, single-owner transactions, private
  per-phase result evidence, and a read-only all-seven completion aggregator.
  A failed phase rolls back only itself; prior committed phases remain evidence,
  but every downstream phase, NPC T1/readiness, source flip, and later
  automation gate stays fail-closed until all seven results match one input.
  The legacy cross-owner `canonical-npc-apply` operation remains non-executable.
- A second Step 3B audit checked the real formal database and found zero current
  `npcs_base_raw` / `npc_crawler_facts_raw` landings and zero maint crawler
  facts. Because `maint_npc_crawler_facts` requires exact landing lineage, the
  seven downstream phases cannot safely start from filesystem evidence alone.
  The repaired chain adds one independently authorized `landing` prerequisite
  that owns only the two NPC logical partitions of
  `local.source_dataset_landings`; the seven single-owner phases remain intact
  and phase 1 now binds that landing result. The final aggregator/readiness must
  verify the prerequisite plus all seven phases for the same input hash.
- System Owner authorized exact landing proposal
  `canonical-npc-landing-apply-20260729-01` on 2026-07-29. It bound actor
  `admin`, request
  `sha256:5d37276a373b3d0e32c52a3ed0db5c6248fff927bb4619b5a7f713de7bc64887`,
  packet `sha256:3befd429bb52eca5eea3f811267925079882187aad5fa5222e5e1c465c8d4a68`,
  the operation-specific reason/reference, and the matching one-time decision
  identity. The formal runner consumed that identity once, then failed before
  the first row write because generic NPC descriptors lacked the governed
  landing artifact role and producer metadata. The transaction rolled back;
  the identity cannot authorize a retry.
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
- Authorization execution: independent request contracts plus a formal packet-consuming
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
- Image/boss retry manifests now require an explicit absolute backend API base
  and freeze it into the executable command; generation without that value
  fails closed. The active runtime value `http://127.0.0.1:18191/api` produces
  image request
  `sha256:4ef44f5810bc8589ed856517f59dd447d9b15f6e8edd1ed43ff244a88970abc0`
  and boss request
  `sha256:f9220e5a56f72da7da9172eb3ef6cc1e9f65aed4f437f3698e28ba910e8c9094`.
  Manifest/authorization validation passes 22/22. Together with schema retry,
  recipe apply, and NPC crawler retry, they form exact proposal
  `canonical-downstream-batch-02-20260728`; no packet exists before that new
  proposal is explicitly authorized.
- A fresh read-only domain acceptance rerun at 2026-07-28 21:26 CST reports
  39 pass / 6 warning / 0 blocked / 0 written. Exit 1 is expected because
  `--fail-on-warning=true`. Projectile image/relation and recipe source now
  pass; the six remaining panels are `items/imageReadiness`,
  `bosses/sourceReadiness`, `bosses/relationReadiness`,
  `bosses/imageReadiness`, `support.recipe/blockingGate`, and
  `support.shimmer/blockingGate`.
- Offline continuation initially froze the exact canonical group projection as four
  landing sources / 64 landing groups, maint 35 groups / 163 members / 72
  aliases / 2 exclusions, relation 35 / 163 / 72 with 0 unresolved and 2
  rejected exclusions, and local 34 / 161 / 70. The resulting group bootstrap
  request is technically complete at
  `sha256:ed8d2508322ab7392d7af833e342c11c812251c25b29e0ca3626bdf07cfa14e2`;
  its data bundle is
  `sha256:f35af62742c412e5e5ac2d99a9f927cf63b364edb41bc2b24966d9760160eafe`.
  Group/manifest/authorization validation passes 29/29. No apply ran.
  Batch 02 item-image changes later superseded those request/data hashes. The
  current technically complete replacement request is
  `sha256:9461520c1788e5aa84d8eb45e7be3580ecb31a206de737b6505479e343b69096`
  with data bundle
  `sha256:c2360a3eaf26e4d0be8ec8e31d8e310809d0dcb21ed5df00c520fd0b378868f5`;
  it remains a separate Owner checkpoint and is not part of Batch 03.
- Formal readback still shows Owner `admin` ACTIVE and the exact `biomes`
  version 1 policy at L0/DISABLED with unchanged policy and policy-set hashes.
  The L1 promotion input is now frozen and technically complete at request
  `sha256:df50664e72b2ff475c7e839c7e1129a7a77b8ed953353d6b98547f109431282a`;
  policy-decision/manifest/authorization validation passes 27/27. No policy
  mutation ran. Boss-loot remains missing its frozen bundle. The worktree's
  shimmer set contains context, item-transform, and manifest files but lacks
  the raw file plus decraft/entity/NPC importable shards; an older raw file in
  the main worktree was not copied or used to bypass crawler authorization.
- Authorized downstream Batch 02 kept all five lanes independent. Schema packet
  conversion rejected the stale execution-manifest code hash before dispatch,
  so no schema decision was consumed. Recipe apply consumed its decision and
  then failed before DB connection because the importer directly resolved
  `mysql2/promise`. The 25-target NPC crawler completed with terminal 25/25
  progress and exactly 25 normalized-light, canonical, and audit files. Item
  image sync completed 6,131 rows / 2,119 candidates / 1,788 uploaded and
  changed / 4,012 missing source; the tracked item file changed in exactly
  1,788 `imageUrl` fields. Boss import consumed its decision, raised
  `ReferenceError: managedUrlPrefixes is not defined`, and rolled back; formal
  boss groups remain 33.
- RED-to-GREEN repairs now route recipe mysql loading through the repository
  module loader and pass `managedUrlPrefixes` explicitly through boss image
  localization, member reconciliation, and final image selection. Focused
  recipe/boss/mysql/strict validation passes 15/15; dependent authorization,
  manifest, capability, runner, and NPC freeze validation passes 50/50. See git
  for code-level diff details.
- Fresh formal readback reports successful Flyway V56-V58 rows 3/3, one Owner,
  one policy, recipe/ingredient/station counts 11,658 / 19,601 / 15,195, and 33
  boss groups. The three relation item-group tables are still absent.
- The repaired NPC crawl is now frozen into 25 exact normalized/audit pairs
  (`payloadBytes=268479`), including five redirected targets resolved only by
  stable standardized IDs. Its request has data bundle
  `sha256:2aaceace90f0673eec4657bb0cee5acbb08ee6c82673d0fdbf0024dc3bccac94`
  but remains technically incomplete only at `executionManifestHash` because
  `canonical-npc-apply` still has no ownership-valid executor.
- Fresh schema, recipe, and boss requests have zero technical gaps and form
  proposal `canonical-downstream-batch-03-20260729`, expiring
  `2026-07-31T21:40:00.000Z`: schema
  `sha256:b53190046a74d0d5383a97fabaa81378089d578b8406c88a9d3c45737b34a87e`,
  recipe `sha256:d4f6b0a31d298e7dedc108c2c4c02b33600a5ce82c9785655edd62fd611eefa4`,
  and boss `sha256:40090985c899f8827a555245ea79b9322842ca216eb2f8f86ed8c13a50d07af5`.
  Proposal/request/owner inputs match, all technical fields are complete, and
  all three proposed decision identities are unused. No packet was created.
- The post-image read-only domain rerun is 39 pass / 5 warning / 1 blocked.
  `items/imageReadiness` now truthfully blocks on 4,012 missing sources and 331
  candidate uploads without a managed URL. Boss source/relation/image, recipe
  blocking, and shimmer blocking remain warnings. No threshold was weakened and
  no report was fabricated.
- Batch 03 schema completed with local Flyway already at V58 and zero new local
  migrations. The governed role-schema executor verified maint and created the
  missing relation schema; `relation_item_groups`,
  `relation_item_group_members`, and `relation_item_group_aliases` now exist
  with their expected indexes and zero business rows. The schema result is
  complete, the decision ledger contains its identity exactly once, and the
  post-run transaction count is zero.
- Batch 03 recipe consumed `canonical-recipe-apply-20260729-02`. Its importer
  completed the frozen 3,663-row input stage, after which
  `backfill-recipe-zh-display-names.mjs` failed to resolve `mysql2/promise`.
  Formal totals remained 11,658 recipes / 19,601 ingredients / 15,195 stations
  with zero active transactions; the import report exists but consolidation
  and pipeline summary reports do not. A read-only post-repair smoke proves
  124 group ingredient updates and a 45-activate / 3,429-deactivate provider
  consolidation remain pending.
- Batch 03 boss consumed `canonical-boss-import-20260729-03` and rolled back
  with 21 failed boss images, zero unresolved bosses, and zero missing member
  images. Frozen input inspection and backend logs localize the exact boundary:
  29 candidates are 21 GIF plus 8 PNG, the wiki GIF source is reachable, and
  `MinioObjectStorageServiceImpl` rejected every GIF through the avatar-only
  JPEG/PNG/WebP validator. Boss groups remain 33 and no result report was
  written because strict failure precedes report persistence.
- RED-to-GREEN repairs now route both remaining recipe database stages through
  the repository mysql loader and validate real GIF87a/GIF89a entity uploads
  without changing avatar policy; spoofed GIF and SVG uploads remain rejected.
  Boss manifests now bind the backend upload controller/service/validator
  contract rather than only the Node importer. Node recipe tests pass 10/10,
  manifest/authorization tests pass 23/23, and MinIO service tests pass 9/9.
- Replacement recipe and boss requests have zero technical gaps and form
  proposal `canonical-downstream-batch-04-20260729`, expiring
  `2026-08-01T00:37:00.000Z`: recipe
  `sha256:679684a1184c9b4b6d11f6f0eb1de2803846c4d8df8eac9629513aac53fe71d9`
  and boss
  `sha256:59292fc0a919b56dff26f8d1ee840477a88aeccbbd82576b95e868b5877c5bc8`.
  The boss request targets an isolated worktree backend at `18192`; no packet
  exists and neither operation has been retried.
- The fresh post-Batch-03 read-only domain result is 39 pass / 4 warning / 2
  blocked. Relation schema readiness is restored. Items image readiness and
  recipe blocking gate are blocked; boss source/relation/image and shimmer
  blocking remain warnings. No report was written and no gate was weakened.
- Batch 04 recipe consumed `canonical-recipe-apply-20260729-03` exactly once and
  completed all three reports. The frozen 3,663-recipe import left formal totals
  at 11,658 recipes / 19,601 ingredients / 15,195 stations, backfilled 124 group
  ingredients and 239 station display names, and consolidated providers at 45
  activated / 3,429 deactivated. Active recipes changed from 7,159 to 3,775;
  formal readback reports zero group/crafting/ingredient/station gaps and zero
  active transactions.
- Batch 04 boss consumed `canonical-boss-import-20260729-04` exactly once and
  completed strict import against the isolated current-worktree backend. It
  updated all 33 groups, retained 51 NPC member assignments, localized all 29
  candidates (21 GIF / 8 PNG), and reported zero unresolved bosses, pending or
  failed images, missing member mappings, and remaining wiki image URLs. The
  database readback shows 33 groups, 51 assigned NPC rows, complete source-page
  coverage, and zero active transactions. The temporary `18192` process group
  exited, Redis DB 14 remained empty, no runner/importer process remains, and
  the original `18191` backend remained on PID 654976.
- The fresh post-Batch-04 read-only domain result is 40 pass / 4 warning / 1
  blocked. Recipe blocking is reduced to warning and boss source readiness is
  pass. Boss relation/image, recipe, and shimmer remain warnings; item image
  coverage remains the only blocked panel. No report was written and no gate
  threshold was weakened. Plan progress remains 62/86 because these results do
  not complete Task 10 Step 5's all-producer requirement.
- Fresh post-execution focused validation passes 42/42 Node recipe, boss,
  manifest, authorization, and formal-runner contracts. Backend validation
  passes 10/10 across `MinioObjectStorageServiceImplTest` and
  `FileStorageControllerTest`. `git diff --check` passes for the Batch 04
  devlog update.
- Group bootstrap preflight confirmed every governed landing, maint, relation,
  and local source-owned table plus projection state at zero, with zero active
  transactions and no concurrent canonical writer. Packet construction failed
  closed on the stale hash before dispatch; no packet/result/progress artifact,
  ledger entry, or database mutation was created. A current-byte manifest and
  request were regenerated without database access. Proposal
  `canonical-item-group-bootstrap-retry-02-20260729` binds request
  `sha256:de0528244a2c53a6a5850b03b7bd3f0917d7826980fdbfe05fa93e8654738ee7`,
  unchanged data bundle
  `sha256:c2360a3eaf26e4d0be8ec8e31d8e310809d0dcb21ed5df00c520fd0b378868f5`,
  and execution manifest
  `sha256:9c03990880eecc552f2df801c160fb87cdc801773dab6883199ff289cffa9fe6`.
  Authorization/manifest/runner contracts pass 29/29.
- The authorized retry consumed `canonical-item-group-bootstrap-20260729-02`
  exactly once and completed the frozen three-database transaction. Independent
  readback proves 4 current landing sources; maint groups/members/aliases/
  exclusions `35/163/72/2`; relation groups/members/aliases `35/163/72`; local
  groups/members/aliases `34/161/70`; and one `PUBLISHED` projection state with
  snapshot `8d3fb0b1f8d995b8c356e1de032f12cf359bf31f438287e6f5f47907f89fe819`.
  The result exactly matches frozen counts plus runtime and compatibility hashes,
  progress reached completed 3/3, and post-run active transactions are zero.
  Focused group action, sync, T1, readiness, shadow, and runner tests pass 35/35.
  A read-only domain rerun remains 40 pass / 4 warning / 1 blocked because
  final compatibility exports/readiness and source-contract flips belong to
  later steps.
- Task 13 Step 4 completed under authorization
  `canonical-item-group-cutover-step-04-20260729`. The tracked cutover verifier
  runs formal DB reads inside `START TRANSACTION READ ONLY`, signs a short-lived
  local admin token without calling the write-bearing login endpoint, scans the
  exact production JSON inventory, and sends only three GET requests. Evidence
  `reports/canonical-migration/item-group-cutover-verification.json` is `passed`
  at SHA-256 `0c642da1f5619432118c9e4ffcb9466df957fa960002b99038f7dbf6ba7995fa`:
  all three shadows are `PASS`, runtime/API snapshot is `8d3fb0b1...fe819`,
  direct readers are zero, fallback is false, APIs return 34 item groups and 33
  recipe groups, and recipe-tree exposes `Any Iron Bar`. Standard slot 13 used
  backend `18201`, front `15187`, admin `13014`, and Redis DB 13; it started and
  stopped through the maintained scripts. Post-stop DB13 is empty, the three
  ports are closed, item-group admin audit remains zero, other active
  transactions are zero, and main backend `18191` remains UP on PID 654976.
  Fresh focused validation passes Node 30/30 and backend 34/34; standard
  preflight also passed backend compile plus both frontend checks. See git for
  code-level diff details.
- Batch 05 readiness preparation completed four independent, non-formal lanes.
  The full repository gate started from the beginning: data workflow passed
  295/295 and automation contracts passed 177/177, then the read-only domain
  gate exited 1 at 40 pass / 4 warning / 1 blocked. The independent post-export
  domain rerun reproduced the same five non-pass panels with zero reports
  written: item image blocked; boss relation/image, recipe blocking, and shimmer
  blocking warning.
- The first canonical compatibility publication uses export run
  `ig_export_20260729_01`. It stages all outputs before publishing each path by
  atomic rename from a durable canonical snapshot and refuses `compat_export`
  feedback as bootstrap input. A second same-run publication reproduced content
  hashes
  `b21af144...602d`, `64b4663f...33e2`, and `fca3c569...8d1c`. Recipe non-group
  domain evidence is semantically identical before/after publication at
  `87a4c392...10ef`; only export metadata, canonical groups, deterministic
  ordering, and formatting changed. The fresh readiness report passes with
  runtime hash `8d3fb0b1...fe819` and separate compatibility hash
  `54130fe0...00d`; data-source freshness marks `sourceGroupAudit` fresh and
  non-blocking. Report hashes are compatibility export `7089a63c...650f0` and
  readiness `1d5f8234...34aa`. A pre-commit review found that staging all four
  files before per-file rename cannot provide a cross-directory atomic
  transaction. Readiness generation now re-reads all three live export paths
  and verifies their run key, compatibility snapshot, content hash, and payload
  identity before publishing evidence; a partial rename therefore fails closed.
- NPC ownership preparation now maps the frozen 25 normalized/audit pairs into
  seven single-capability phases. The read-only report is `T1_PREPARED` at
  `dbd184b8...2575`, with 9 Buff, 239 shop, and 175 loot facts (172 boss / 3
  non-boss). Every physical ownership key resolves to exactly one current write
  owner. `formalApplyReady` remains false until the landing prerequisite and
  seven owner phases have independent exact authorization packets and formal
  results; no database connection, crawler, or formal apply ran. See git for
  code-level diff details.
- Step 3B implementation now registers the landing prerequisite plus all seven
  owner-phase operations, binds each manifest to exact table/partition ownership
  and every predecessor result, executes one transaction per operation, performs
  transaction-local write/readback count verification, publishes private atomic
  results, and requires the landing-plus-seven completion artifact for NPC T1/T2
  readiness. The operation catalog contains 25 stable IDs: 24 have governed
  manifests and only the retired `canonical-npc-apply` umbrella remains null.
  The first generated landing request was technically complete with 53 exact
  data entries at request hash
  `sha256:5d37276a373b3d0e32c52a3ed0db5c6248fff927bb4619b5a7f713de7bc64887`;
  the seven downstream requests intentionally have no `dataBundleSha256` until
  their exact predecessor result files exist.
  Focused dependency validation passed 86/86 after the readback regression was
  reproduced RED and repaired GREEN. See git for code-level diff details.
- Fresh full-gate validation passed data workflow 304/304 and automation
  contracts 177/177, then stopped at the expected read-only domain result of 40
  pass / 4 warning / 1 blocked / 0 written. Exit 1 is the preserved project
  fail-close, not a failure in the Step 3B contract suite. Fresh formal-database
  readback remains zero NPC base landings, zero crawler-fact landings, zero
  active maint crawler facts, and zero active transactions. Main backend
  `/api/actuator/health` remains `UP` on PID 654976.
- Inline self-review by Codex covered the complete Step 3B code, tests, gates,
  manifests, plan, and devlog diff; no subagent was used per user direction. Two
  Important findings were resolved: the production adapter now performs a real
  transaction-local readback instead of echoing planned counts, and preparation
  no longer reports already-registered executors as missing. RED/GREEN evidence
  and the fresh focused/full validation above satisfy re-review; no Critical or
  Important finding remains open for this commit scope.
- The first authorized landing execution reproduced the missing governance
  metadata failure before mutation. Formal readback immediately afterward was
  base landing 0, crawler landing 0, active maint fact 0, other active
  transactions 0; decision identity
  `canonical-npc-landing-apply-20260729-01` is durably consumed. A real-input
  regression test failed RED with the same `artifactRole: unknown role`, then
  passed GREEN after the owner executor added exact `source_evidence`, producer,
  full-file, and frozen-input run identity without weakening the landing
  importer. The current focused dependency suite passes 93/93. The replacement
  retry request is technically complete at
  `sha256:6395b6031dc5bc4e8c0b08357a855163fe09ad93ec5e90aa367c0a4e5ce8ff19`.
- Retry-preparation revalidation passed 98/98 targeted landing, NPC ownership,
  manifest, authorization, and formal-runner contracts. A fresh formal read-only
  query still reports 0 NPC base landings, 0 NPC crawler-fact landings, 0 active
  maint crawler facts, and 0 active transactions. The retry artifact remains
  `AWAITING_OWNER`, binds 53 exact data entries, and expires at
  `2026-07-30T05:53:26.000Z`. The shared backend health endpoint at `18191` now
  refuses connections and no Java listener exists; this isolated worktree did
  not restart it, so shared-stack health is a validation availability gap rather
  than evidence of a landing-side mutation.
- Authorized Wave 1 then constructed landing packet
  `sha256:9f8bee4fde0374deae2d666b76460beba895dafce7fff2eb4dd9f9441e51922d`
  and consumed `canonical-npc-landing-apply-20260729-02` exactly once through
  the packet runner. The transaction committed 1 current `npcs_base_raw` and
  25 current `npc_crawler_facts_raw` rows; all 26 read back as
  `source_evidence` from `canonical-npc-landing-bundle`, one frozen-input run
  key, non-empty full-file identities, zero active maint facts, and zero active
  transactions. Result output hash is
  `sha256:ec850fa40e2247091369c0211fbf8d32b277e60b63aa9e602761ee1f8e937b4d`.
  The same Wave 1 biomes request stopped during packet construction before any
  identity consumption or database write because its stored code bundle bound
  an older `build-canonical-cutover-authorization.mjs` hash. The repaired
  current-byte biomes retry request is
  `sha256:70be837132b37c1b3f1c22c9728e83de110ccf42a95ffef329bb3e92bce4a47b`;
  the now-complete NPC phase-1 request is
  `sha256:120f0eb65cfb77ebd4133999a8d8e828ba1b1fd99ae9c27dd033140f64cd7f57`.
- Batch 05 pre-commit validation reproduced the partial-publication readiness
  gap as RED at 3/4, then passed publisher/readiness GREEN at 7/7 and the full
  focused chain at 64/64. The complete local gate again passed data workflow
  295/295 and automation contracts 177/177 before the expected read-only domain
  fail-close at 40 pass / 4 warning / 1 blocked / 0 written. `git diff --check`
  passes, no progress/output `.tmp` file remains, and the original backend is
  still UP on PID 654976. Recipe non-group semantic evidence remains byte-order
  independent at `87a4c392...10ef` before and after publication.

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
- Completed in formal Batch 02: repaired bounded NPC crawler evidence and the
  partial item image localization described above. Schema, recipe, and boss
  remain fail-closed at their recorded pre-dispatch/pre-connection/rollback
  boundaries.
- Completed in formal Batch 03: the exact schema operation consumed its
  one-time identity, preserved Flyway V58, and created/verified all missing
  relation role tables and indexes. Recipe and boss consumed their independent
  identities and stopped at the recorded partial-import and rollback boundaries.
- Completed in formal Batch 04: the exact recipe and boss retry identities were
  consumed once and both completed. Recipe now has its import, consolidation,
  and summary evidence; boss strict import localized all 29 governed images
  through the isolated backend and left no unresolved image/import rows.
- Completed in Task 13 Step 3: the authorized frozen canonical group bootstrap
  consumed `canonical-item-group-bootstrap-20260729-02` once, committed all
  expected landing/maint/relation/local rows in one transaction, published the
  exact frozen runtime snapshot, and left zero active transactions.
- Completed in Task 13 Step 4: formal read-only DB/API shadow verification
  reached group `T2_CUTOVER_VERIFIED`, disabled JSON fallback, preserved the
  compatibility artifacts as non-runtime inputs, and proved the standard
  isolated lifecycle without affecting the main stack.
- Completed in Batch 05 for the group slice: one-way compatibility publication,
  feedback-loop rejection, idempotent same-run content hashes, distinct runtime/
  compatibility identities, and fresh passing canonical group readiness.
- Completed in Batch 05 for NPC preparation: the cross-capability write set is
  decomposed into seven exact single-owner phases and real frozen evidence is
  `T1_PREPARED`; formal execution remains intentionally unavailable.
- Completed in Task 12A Step 3B: one `landing` prerequisite and seven strict
  owner phases now have packet-consuming executors, current-byte manifests,
  exact predecessor/result binding, transaction-local write/readback checks,
  private result evidence, and an all-eight completion gate. The legacy umbrella
  remains non-executable, and partial completion cannot unlock downstream gates.
- First formal landing attempt stopped safely before mutation on missing
  governed descriptor metadata. Its identity is consumed; the defect is fixed
  with real frozen-input RED/GREEN coverage and requires retry authorization.
- Completed in code-only repair after Batch 03: both remaining recipe stages
  use the repository mysql loader; managed entity uploads accept validated GIF
  while avatar restrictions remain unchanged; the boss manifest binds the
  backend upload contract. Batch 04 proved both repairs through their authorized
  formal paths.
- Completed in code-only repair: NPC paired audit identity and redirected
  standardized-ID evidence binding, with no data rewrite or second crawler run.
- Completed in code-only repair: image/boss manifests freeze the active backend
  API base instead of resolving a stale task-worktree port at execution time.
- Wave 2 formal execution: biomes policy-promotion retry decision
  `automation-biomes-l1-policy-promotion-20260729-02` consumed packet
  `sha256:c9104874389c553617ff24c7a7c5be9ac0d0fd2b9a19c7d0d1a7208a7b43ca5c`
  and completed v1 `L0/DISABLED` -> `L1/ACTIVE`; formal readback confirms the
  ACTIVE Owner, exact policy hash, one policy version, and zero external active
  transactions. The independent NPC maint phase-1 identity consumed once but
  rolled back before rows were written on a `scope`/`table_name` SQL-column
  mismatch. A RED-to-GREEN production-adapter regression now strips only those
  row-contract metadata fields; focused Node suites pass 67 with one existing
  skip. New retry request
  `sha256:86a2650dce0c145e430414ff830dd7e1ddbf49516b9e4e1fbe5a81260f8add52`
  is `AWAITING_OWNER`; the landing remains 1 base / 25 crawler facts and maint
  remains 0.
- Not completed: the landing-plus-seven NPC formal authorizations/executions and
  real T1/apply, Task 10's four
  warning panels plus the blocked item-image panel, Task 11 isolated NPC T1,
  Task 12 Owner authorization for the remaining independent operations, Task 13
  Steps 5-7, Task 14 Steps 3-9, Task 15 Steps 3-5, Task 16, and every
  formal apply or activation checkpoint after bootstrap.

## Residual Risks

- Every remaining formal operation still depends on its own exact System Owner
  reason/reference/decision identity; the consumed bootstrap identity cannot be reused.
- Deferred NPC facts now have real paired crawler evidence, a committed landing,
  and ownership-valid executors. Formal progress is blocked on the repaired
  phase-1 retry request, then on seven requests regenerated from committed
  predecessor results; no phase may fall back to the retired bridge.
- The first NPC crawler output is not reusable as apply evidence because its
  audit files predate the paired-identity repair. Batch 02 repaired that evidence
  and produced a complete frozen data bundle, but apply/T1 still require an
  ownership-valid executor and separate exact authorization.
- Four warning panels and one blocked panel depend on remaining relation,
  image/source, recipe, and shimmer evidence. Empty-shell and
  dry-run artifacts now fail closed; armor and projectile are no longer warnings.
  The fresh post-Batch-04 read-only domain rerun reports exactly 40 pass / 4
  warning / 1 blocked.
- Group compatibility readiness is now fresh and passing, but its three source
  contracts cannot flip while the complete repository gate is non-green. The
  readiness contract keeps runtime and compatibility identities distinct.
- The frozen compatibility snapshot retains two non-secret absolute
  `evidenceReference` values for recipe-group exclusions. They are covered by
  compatibility hash `54130fe0...00d`; rewriting them in Batch 05 would falsify
  the already-consumed bootstrap identity. Normalize them only through a future
  separately authorized snapshot/bootstrap rotation.
- Local V56/V57/V58 plus maint and relation role schemas and the frozen group
  bootstrap are applied. Runtime JSON fallback is disabled and Step 4 is
  verified; the three compatibility files remain bounded non-runtime inputs
  until fresh exports/readiness and explicit source-contract flips pass.
- Group bootstrap identity `canonical-item-group-bootstrap-20260729-01` was not
  consumed, but its authorization is bound to a superseded request and must not
  be reused. Retry identity `canonical-item-group-bootstrap-20260729-02` is
  consumed and also cannot be reused.
- Batches 03 and 04 are fully accounted for and all of their dispatched
  identities are consumed. No conversational continuation or prior proposal
  authorizes another retry.
- Batch 02 is fully accounted for; four of its decision identities are consumed
  and the schema identity was never consumed but is bound to superseded bytes.
  None authorizes Batch 03.
- Full backend `mvn test` is not green because six observed failures remain in
  unrelated pre-existing test areas; the task-owned focused backend suite is
  green after repairing its four queue contract failures.
- Twenty-four formal operations have governed executors. Only
  `canonical-npc-apply` lacks a manifest, by design, because its write set crosses
  capability owners. Its landing request is the only immediately complete NPC
  formal request; each later owner-phase request intentionally lacks its data
  bundle until the exact predecessor result exists. Recipe apply now has complete
  technical input. Boss-loot, shimmer, and biomes apply lanes still lack producer
  or preview-bundle inputs. Group bootstrap is applied; biomes policy promotion
  is now `L1/ACTIVE`, but both L1 applies remain independently bundle- and
  Owner-gated.
  These are data/governance blockers rather than missing entrypoint code.
- Landing decision `canonical-npc-landing-apply-20260729-01` is consumed and
  failed before write; it cannot be reused. Only retry request
  `sha256:6395b6031dc5bc4e8c0b08357a855163fe09ad93ec5e90aa367c0a4e5ce8ff19`
  matches the repaired current code bytes.
- The shared backend process is currently absent at `18191`; do not infer a
  landing regression from that shared-stack availability gap, and do not restart
  it from this worktree without a separately scoped stack-operation request.
- The first biomes L1 policy-promotion identity is unused but bound to its
  superseded request; retry identity `...-02` is consumed and completed. NPC
  landing is complete, but the first maint identity is consumed after rollback;
  every remaining owner phase still requires its own result-bound request and
  decision identity.
- `FailClosedCrawlerAutomationApplyContextProvider` remains the intentional
  backend default and has no production apply caller. Formal execution is owned
  by the exact packet-consuming Node executor; enabling the backend bean without
  a same-transaction domain importer would be a protocol bypass.

## Follow-up

- System Owner: Batch 04 and group Step 4 need no further authorization. The item image source
  repair and any retry require a separate future request. Task 10 Steps 5-6,
  NPC apply/T1, both L1 applies, L2, and scheduler activation remain
  separate packets or decisions.
- Group bootstrap/cutover needs no further authorization. Task 13 Steps 6-7
  still require fresh canonical group readiness and an explicit three-contract
  flip; they are not implied by Step 4. The independent biomes L1
  policy-promotion request remains a later checkpoint and must not be folded
  into group cutover. Item image and
  shimmer lanes first require complete source/producer inputs rather than a
  conversational authorization alone.
- System Owner: authorize only the repaired exact NPC phase-1 retry request
  `sha256:86a2650dce0c145e430414ff830dd7e1ddbf49516b9e4e1fbe5a81260f8add52`.
  After phase 1 commits, regenerate and authorize each later NPC owner phase
  serially; every request must bind all exact predecessor result bytes. The legacy
  `canonical-npc-apply` remains `executor: null` throughout and cannot
  substitute for these packets.

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
