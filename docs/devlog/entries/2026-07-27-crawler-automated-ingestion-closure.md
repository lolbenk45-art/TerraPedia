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
- User execution direction reaffirmed on 2026-07-30: run the complete remaining
  acceptance chain first, collect the full result set, and only then repair the
  failures in dependency order. A single blocked panel must not turn into an
  open-ended local repair loop or pause unrelated eligible checks.
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
- The user-directed post-NPC complete sweep was rerun before another repair.
  NPC readiness is fresh/private and passes with matching admin/public API
  snapshot hash `b4c33ad...17888`; cross-DB quick is 10/10 pass, full is 9
  pass plus one warning for 4,316 legacy local acquisition rows, and relation
  health is 21 pass / 6 info / 0 blocked / 1 warning for 287 unresolved NPC
  audits. The full gate again passes its data-workflow and 182/182 automation
  contract stages, then exits at domain 42 pass / 2 warning / 1 blocked. The
  non-green panels are exactly item image readiness, boss relation readiness,
  and shimmer blocking readiness.
- The approved item-image source review followed RED -> GREEN. Focused tests
  pass 2/2. The real candidate-only report
  `reports/audit/item-image-source-candidates-2026-07-30.json` hashes to
  `sha256:a19aa3466b0e9636dc2d4e81ecda7cc615e25e559148bae4649c2afaf0ef0b85`
  and records 695 unique exact group matches plus 7 safe non-group matches.
  All 3,310 other group pages remain quarantined; both standardized input
  hashes are byte-identical before/after generation, and no image sync ran.
- Boss-loot adapter/import/manifest/authorization/runner focused validation
  passes 46/46. The deterministic 33-boss/347-drop bundle hashes to
  `sha256:c1e3461d4cf89bdb6515320ffc77e5685b3daf65a0b1b9c71c7cd275ca99fc00`;
  request `sha256:0db6513f08d29666559e506a569792335434f19a0d72887ada5e7c680b26ac7c`
  had no missing technical field and, at that checkpoint, no packet. Local shimmer search covered
  all worktrees, common backups, Windows user mounts, and 200 unreachable Git
  blobs. The sole raw candidate is a July refetch of revision 252716 whose HTML
  length is 642,133 rather than the May summary's 642,050, so it was not used
  to fabricate or mix import shards.

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
- Retry-02 formal execution consumed
  `canonical-npc-facts-maint-apply-retry-02-20260729` once through packet
  `sha256:9b6d29e8b95599557cd933d9cd2ce2226ecdef7da63e851c69fc55c1b13f7131`.
  It rolled back before a maint row or successful result was published because
  strict MySQL rejected ISO-8601 `source_revision_timestamp` input for its
  `DATETIME` column. Readback remains 1 base landing / 25 crawler-fact landings
  / 0 active maint facts / 0 active transactions. The production adapter is
  repaired RED-to-GREEN to normalize the three owned `DATETIME` persistence
  fields (`source_revision_timestamp`, `fetched_at`, `parsed_at`) as UTC;
  80 focused authorization, manifest, ownership, landing, and adapter contracts
  pass. Independent code review found no remaining Critical or Important issue.
  Both consumed phase-1 identities remain non-reusable. Retry-03 now binds the
  committed current-byte manifest and request
  `sha256:d4bbf59809fb918a75396f9f92c473ff1c9a169056587712213bef99a3670427`;
  it is `AWAITING_OWNER` and expires at `2026-07-30T07:53:51.208Z`.
- Completed in Task 13 Step 5: the prior bounded real crawler's frozen 25
  normalized/audit pairs, the committed landing, and all seven independently
  authorized single-owner phases are aggregated by
  `canonical-npc-apply.completion.json` with completion hash
  `sha256:9252a6563b90d71d9868eb63875debbe13af58bdc0b9411f32140390b78ac79a`.
  This plan state was reconciled without rerunning the crawler or any database
  mutation. It is not the separate isolated T1 acceptance required by Task 11.
- Fresh read-only evidence: canonical item-group readiness remains pass with
  all three exports fresh; NPC bridge-retirement scans 3,295 files with zero
  production references. The data-source freshness audit remains blocked only
  by the missing canonical NPC readiness report; ordinary report refresh also
  reproduced the historical missing comparison database and image-audit
  hard-coded-port defects, both kept fail-closed for separate repair.
- The Task 13 Step 6 NPC report generator now independently reconstructs the
  private 1+7 owner completion before it opens `START TRANSACTION READ ONLY`
  on the formal local/maint/relation triplet. Its fresh private report records
  1 base landing, 25 paired crawler landings, 25 maint facts (16 `MATCHED`, 9
  `AMBIGUOUS`), relation `1270/1116/1544`, and local `1270/1116/1890` for
  Buff/shop/loot. It remains `blocked` rather than claiming T1/T2 because no
  isolated T1 rollback/restore/cleanup evidence exists and the absent shared
  backend makes both API probes fail. The acceptance panel is now fresh but
  semantically fail-closed; no crawler, data apply, source flip, L1/L2,
  scheduler, or service restart ran.
- The full quality gate reached (and exited at) the expected final domain
  fail-close: 40 pass / 4 warning / 1 blocked, with zero domain reports written.
  The remaining domain blockers were preserved rather than downgraded.
- The expired first `biomes` L1 request was regenerated from current private
  fingerprint/policy/bundle/manifest bytes. Request
  `sha256:8102876f7568b98a29af4507ec9e9d3a65c94ba9641227560eff73f4ce029a10`
  expired at `2026-07-30T11:40:15.088Z`; at its generation checkpoint it had no
  missing technical field and was `AWAITING_OWNER` for actor, reason,
  authorization reference, and one-time decision identity. It expired unused;
  no packet or L1 apply was created, and it is not current authorization.
- Completed after the complete sweep: the two independently authorized NPC
  base operations committed 723 non-town and 39 town rows. Their read-only
  completion binds both results at
  `sha256:4cafccbb237b3514b2248ff48eb5cf4edb451e2377a3ec4112bca53bd6eaa831`.
  Retry-01 committed its deterministic database change and cleared the
  cross-DB/relation blockers, but its declared result file was left private and
  zero-byte after child exit 0. That failure remains historical evidence. The
  hardened runner rejects an empty declared result, and retry-02 later consumed
  decision `canonical-npc-item-relation-lineage-repair-20260730-02` once under
  packet `sha256:f429552a...5b662`. Its private 1,684-byte result hashes to
  `sha256:09930216...a7fc`, is `COMPLETED`, and binds committed `329 + 329`
  relation rows plus output `sha256:e6debec3...4f84`.
- Completed within the approved no-write boundary: the 702-row item-image
  candidate artifact and its regression tests. This is review evidence only;
  it does not close Task 10 Step 5 or authorize a standardized-data write.
- Completed after exact authorization: boss decision
  `canonical-boss-loot-import-20260730-01` consumed packet
  `sha256:ae0bc6de...dc1f` once. The applied report hashes to
  `sha256:96c23c7a...449`, processes the frozen 33-boss/347-drop bundle, and
  contains no unresolved boss or item.
- Completed read-only image scope measurement: all 6,131 standardized
  identities have local image rows, 2,906 have maint/relation lineage, and
  3,225 are local-only. Exactly 613 existing local titles pass unique parsed
  title, item identity, source-page, and original-URL checks against raw bytes;
  2,612 remain unverified. Of 637 candidate rows in the local-only partition,
  24 select a different raw-backed file than the existing local title.
- Completed item-image Tasks 4-7 and Task 8 Steps 3-6 within the separately
  approved four-layer scope. Decision
  `canonical-item-image-lineage-apply-20260801-02` consumed packet
  `sha256:0f67aa00568fe355760f892654d013c4c325ab1c8842f1bc96b2b94adabf3d2c`
  once and published `COMPLETED` evidence with snapshot `21997`, landing ID
  `18630`, and exact `6131` parity at landing, maint, relation, and local.
  The bundle hash is
  `sha256:2c55c37a0fadaaafcaba3cb1fc4a0323fe6fbf76bc0cb9cf73ded8e6e0072f83`.
  The `-01` local-stage failure remains immutable history; its three earlier
  stages were restored from the independent external dump and field-by-field
  matched the pre-attempt contract before `-02` was authorized.
- The post-apply lineage report hashes to
  `sha256:49f095abc55ad39f1ebf07002fc89eef1297c85625e89dd2cf391dfee851613a`.
  The four applied layers are clean, but `projection_items.image` remains a
  fifth ungoverned surface with `6129` dead `http://localhost:9000/...` values
  and `2` blank rows with a core image. No item-owned preview/apply operation
  exists for that surface; it must be designed, previewed, owned, and
  separately authorized before it can be changed.
- Not completed: Task 10's Shimmer warning and the new `projection_items`
  follow-up, Task 13 Step 7, Task 14 Steps 3-9, Task 15 Steps 3-5, Task 16,
  and every formal source flip, apply, or activation checkpoint after bootstrap.

## Residual Risks

- Every remaining formal operation still depends on its own exact System Owner
  reason/reference/decision identity; the consumed bootstrap identity cannot be reused.
- NPC landing, seven owner phases, base-maint partitions, isolated T1, and
  read-only API parity are complete. Retry-02 also closes the lineage result
  gap. Retry-01's zero-byte result, both consumed lineage identities, and the
  retired bridge remain immutable and cannot be reused.
- The fresh broad domain rerun remains `43 pass / 1 warning / 1 blocked`, with
  Shimmer still source-generation-gated. The item readiness panel itself passes
  after the four-layer apply, but the independent item lineage report is not
  contract-ready until the ungoverned `projection_items` surface is handled.
  Its existing `6129` dead-port values and `2` blank rows are preserved as a
  fail-closed follow-up; no packet was widened after the fact.
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
- The separate complete sweep passed full backend tests at 1,523 with 10
  skipped. The latest full repository gate intentionally never reaches that
  later stage because domain fail-close exits first.
- The item-image source promotion, managed sync, and four-layer lineage apply
  are now consumed, completed evidence rather than pending source inputs. The
  fifth `projection_items` surface has no item-owned executor and remains a
  separate design/preview/Owner gate. Shimmer generation, both biomes L1
  applies, L2, and scheduler activation remain independently bundle- and
  Owner-gated; these are data/governance boundaries rather than permission to
  bypass a missing evidence surface.
- Landing decision `canonical-npc-landing-apply-20260729-01` is consumed and
  failed before write; it cannot be reused. Only retry request
  `sha256:6395b6031dc5bc4e8c0b08357a855163fe09ad93ec5e90aa367c0a4e5ce8ff19`
  matches the repaired current code bytes.
- The shared backend at `18191` is currently healthy and was used only for
  read-only NPC parity. It belongs to the main worktree; do not mutate its
  lifecycle from this worktree.
- The first biomes L1 policy-promotion identity is unused but bound to its
  superseded request; retry identity `...-02` is consumed and completed. NPC
  landing is complete, but both issued maint identities are consumed after
  rollback; every remaining owner phase still requires its own result-bound
  request and decision identity.
- `FailClosedCrawlerAutomationApplyContextProvider` remains the intentional
  backend default and has no production apply caller. Formal execution is owned
  by the exact packet-consuming Node executor; enabling the backend bean without
  a same-transaction domain importer would be a protocol bypass.

## Review And Repair

- 2026-07-30 NPC isolated-T1 repair review found two Important fail-closed
  defects before any live run: the runner validated the required evidence path
  only after creating and cleaning isolated resources, and readiness did not
  validate the evidence's exact 13-table positive source-count proof. The
  active repair is adding RED coverage for both conditions, then preflight and
  exact snapshot validation before requesting a T1 authorization. Reviewer:
  Codex subagent `npc_t1_spec_review`; no Critical finding; no database,
  crawler, or service command was run. Commit remains blocked pending repair
  and re-review.
- Code-quality review then found two further Important repair conditions before
  a live run: pre-read and post-run owner-phase completion bytes must bind the
  copied snapshot evidence to one generation, and the T0/readiness/T1 import
  cycle must be removed through a leaf shared-contract module. RED coverage is
  active; no authorization request or isolated resource creation is permitted
  until this repair and re-review complete.
- The authorized code-only repair now pre-reads the reconstructed completion
  before temporary or isolated resource creation, binds its input/completion
  hashes to copied-snapshot and verification hashes, and re-reads it after
  cleanup before writing the private evidence. The 13-table contract moved to a
  dependency-free leaf module, removing the T0 -> readiness -> T1 -> T0 cycle.
  Fresh focused Node validation passes 25/25, including the new generation-binding
  regressions; no isolated T1 run, operation request, database write, crawler,
  shared-service action, or commit ran. Fresh read-only re-review by Codex
  subagent `npc_datetime_review` found no actionable Critical or Important
  finding; an isolated-run request is still a separate future authorization.
- The subsequent code-only `canonical-npc-t1-acceptance` request-path review
  found one Critical and two Important fail-closed defects before any request
  can be considered ready: the packet's server fingerprint was not bound to the
  private config endpoint/live server identity, the child could reconstruct a
  newer NPC completion chain after the parent verified a different data bundle,
  and the manifest CLI dropped the T1 config/Redis/run-ID options. The active
  repair adds RED coverage, performs child-side packet/config/data identity
  revalidation before permit consumption or isolated-resource allocation, and
  forwards the three CLI arguments. Reviewer: Codex subagent
  `npc_datetime_review`. No request, packet, T1 run, database/Redis access,
  crawler, service action, commit, or push occurred. Commit remains blocked
  until the repair and a fresh re-review complete.
- Re-review found one remaining Important child-side TOCTOU: `main` read the
  owner-phase completion before the child identity barrier, while that barrier
  revalidated only the bundle and the later isolated run still used the earlier
  completion object. The next repair must reconstruct the completion inside the
  pre-permit identity resolution, validate its bytes against the packet-bound
  bundle, and pass only that returned immutable completion to the isolated
  runner. A regression must prove completion drift before permit consumption
  leaves the permit and isolated resources untouched. Reviewer: Codex subagent
  `npc_datetime_review`; all earlier server/config/CLI findings are otherwise
  resolved. No DB, Redis, crawler, service, request, packet, T1 run, commit, or
  push occurred. Commit remains blocked pending this repair and re-review.
- The final code-only repair reconstructs the owner completion inside child-side
  technical revalidation, matches its input/completion bytes to the same current
  data bundle, and returns that exact object for the isolated runner. A RED/GREEN
  regression proves pre-permit completion drift consumes neither a permit nor an
  isolated resource. The manifest CLI now forwards config/Redis/run-ID arguments;
  the private config's normalized server fingerprint matches the packet and a
  future live UUID observation before permit consumption. Focused Node validation
  passes 57/57, syntax and `git diff --check` pass, and final read-only re-review
  by `npc_datetime_review` has no Critical or Important finding. The substantive
  review block is cleared. No DB, Redis, crawler, service, request, packet,
  isolated T1 run, formal write, commit, or push occurred; Task 11 Step 5 remains
  unchecked and a future request is still `AWAITING_OWNER` until fresh technical
  inputs and Owner identity fields are supplied.
- With the user's explicit permission on 2026-07-30 to read the main-worktree
  private local-stack config and create a worktree-local T1 config, the source
  was inspected without disclosing credentials. It is an ordinary valid-JSON
  file and its database endpoint matches the existing read-only fingerprint.
  A new ordinary `0600` config was created only at
  `scripts/dev/config/local-stack.config.json` in this worktree, retaining the
  required local credentials while adding the exact `npcT1ServerFingerprint`.
  The new private `0600` manifest
  `reports/authorization/canonical/canonical-npc-t1-acceptance.execution-manifest.json`
  freezes that config hash, the normalized server fingerprint, Redis DB 14,
  run ID `npc-t1-20260730-01`, 65 code-bundle entries, and the current NPC data
  bundle; its rebuilt contract confirms `databaseWrites: false` and
  `isolatedResourceWrites: true`.
- The current-byte private request
  `reports/authorization/canonical/canonical-npc-t1-acceptance.request.json`
  is ordinary `0600`, reproducible, and `AWAITING_OWNER` with no missing
  technical fields. Its request hash is
  `sha256:4c8c760c78e8feeaa93c3028d11b08bfd390eb39a0d99a986ad5c2183752d1f5`
  and it expires at `2026-07-30T18:57:17.884Z`. Owner fields supplied before
  this hash existed were deliberately not consumed. A later packet requires an
  explicit confirmation of this exact request hash before it can use those
  fields. No packet, T1 run, database or Redis connection, crawler, formal
  write, shared-service action, commit, or push occurred.
- The user explicitly confirmed that exact request hash using the previously
  supplied Owner fields. The resulting private ordinary `0600` packet
  `reports/authorization/canonical/canonical-npc-t1-acceptance.packet.json`
  has packet hash
  `sha256:2ac59552d8b9346c92623c072596063f71a2b6ff12ff721491f4d9b9f27aacd3`
  and status `AUTHORIZED`. Independent current-byte verification confirms its
  config/data/manifest/server identity and all four Owner fields. Packet
  generation does not consume the decision identity; the canonical ledger has
  no T1 decision record because only an authorized runner dispatch may consume
  it. The confirmation covered packet generation only: no runner, T1
  acceptance, database or Redis connection, crawler, formal write,
  shared-service action, commit, or push occurred.
- The user then explicitly authorized that exact packet's formal runner
  dispatch. The runner consumed decision
  `canonical-npc-t1-acceptance-20260730-01` once with a bound dispatch permit,
  completed isolated run `npc-t1-20260730-01` (`npc_1470808033dd26d7`), and
  wrote private `0600` evidence at
  `reports/canonical-migration/canonical-npc-t1-acceptance.json`. Evidence
  content hash is
  `sha256:bc68195d00ab5edc8632ddb1406a1befaf00daac3a4e2cad77c42643626d99ca`;
  it binds input `sha256:69f61c3b3bfa21c636be10a26711972454bacf4305a41707ec4ac241eb781d6e`,
  completion `sha256:02aaab79b51a8f1e7886cd8cd5d96fba0b5f0bf042529c97eecf163623a56d6a`,
  13-table snapshot/verification hashes, and `0/1/0` rollback/commit/restore
  probes. The result is `passed` with cleanup proof. Independent post-run
  readback found zero isolated databases, temporary accounts, Redis DB 14 keys,
  and active transactions. Formal source databases were read-only; no crawler,
  formal data write, shared-service action, commit, or push occurred. Task 11
  Step 5 is now complete. Task 13 Step 6 and later readiness/cutover gates
  remain separate and unexecuted.
- Task 13 Step 6 then refreshed the canonical NPC readiness report through its
  read-only generator. The private `0600` report
  `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`
  hashes to
  `sha256:a3a530a910306f2984b34d964f7570b5c447003648cc04b5a1193fa94e7f80bc`
  and now reaches `T1_VERIFIED` with all T1, landing, maint, relation, local,
  runtime, and bridge checks passing. Only the four admin/public API parity
  checks are blocked, with both probes reporting `fetch failed` because the
  shared backend remains absent. The canonical group and bridge-retirement
  reports remain passing, so Step 6 is complete as report generation; Step 7
  source-contract flips stay fail-closed until API evidence and the wider gate
  pass. No backend was started, and no crawler, data apply, source flip, L1/L2,
  scheduler, commit, or push occurred.
- Task 10 item-image diagnosis established that the real applied report is
  present, not missing. Its current `items` module records `total=6131`,
  `candidates=2119`, `uploaded=1788`, and `missingSource=4012`. The 4,012
  source-less standardized records are a real upstream-data gap; no report or
  threshold was fabricated. A separate producer defect was reproduced
  RED-to-GREEN: the shared managed-URL helper rejected relative
  `/terrapedia-images/items/...` URLs emitted by image sync, making subsequent
  runs non-idempotent, and readiness incorrectly required every candidate to be
  re-uploaded rather than allowing `uploaded + alreadyManaged`. Focused tests
  and the full two-file suite pass 68/68, and `git diff --check` passes. The
  live evidence remains blocked with `missingSource=4012` and 331 uncompleted
  legacy-endpoint candidates. No image-sync retry, crawler, database write,
  service action, packet, commit, or push occurred.
- The local raw cache has all 6,131 item pages. A read-only parse found the
  source-less population comprises 4,005 deliberately quarantined group pages
  and 7 non-group pages with safe images; 695 group pages contain exactly one
  filename that matches the item identity. The remaining 3,310 group pages need
  stronger provenance or explicit review. Existing group-page quarantine is a
  safety boundary, so no inferred mapping, standard-data mutation, image-sync
  retry, crawler, or authorization packet was created. A future source-mapping
  design must make the 702 exact candidates separately reviewable before any
  formal data operation.
- The user-directed complete sweep then ran every remaining eligible check
  before another repair. Full-gate contracts pass data workflow `318/318` and
  automation `182/182`; the domain stage remains correctly non-zero at `42
  pass / 2 warning / 1 blocked`. Backend full tests pass 1,523 with 10 skipped,
  public checks/build and 39/39 unit tests pass, and admin checks/build and
  405/405 unit tests pass. The A-grade gate has all 45 panels fresh and remains
  blocked only because generation contains the same one blocker and two
  warnings. No evidence command or database write was performed by those
  gates.
- Independent database diagnostics complete the result matrix. Cross-DB quick
  is `9 pass / 1 blocked`; full is `7 pass / 2 blocked / 1 warning`. The exact
  roots are 762 active `maint_npcs` rows without the current base landing, 329
  `item_source_facts` rows without matching maint lineage, and 4,316 legacy
  local acquisition rows without a relation/maint trace. Relation health is
  `19 pass / 6 info / 2 blocked / 1 warning`; both blockers are the same 329
  lineage rows, while 287 unresolved NPC relation audits remain warning-only.
- The current readiness generator was rerun from current bytes and produced a
  private `0600` report at
  `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`,
  content hash
  `sha256:541d4b01437ffb9d9b0abe01e8435edb21e9fbd767463ec820d681f4edba7149`.
  It remains at level `T1_VERIFIED` but is `blocked`: the missing non-town base
  result prevents reconstruction of the two-result base completion, so the
  hardened generator correctly refuses the formal snapshot and emits 28
  derivative blocked checks plus three collection errors. This does not erase
  the separate runtime result: using explicit base
  `http://127.0.0.1:18191/api` and a five-minute in-memory admin read token,
  admin/public GET parity both passed for sample `-65` against local snapshot
  `sha256:b4c33ad939c56fd7857a0908d8bb415a190861e45e71d237c9dca2cad0c17888`.
  The token was neither printed nor persisted and no login endpoint was used.
- The shared `18191` process is healthy but comes from `/home/lolben/TerraPedia`,
  whose active source and compiled output do not contain
  `AdminCrawlerAutomationController`; monitor, data-source, and domain overview
  GETs return 200, while automation overview/profile correctly reproduce 404
  for that older build. No shared process was restarted. A separate formal
  `START TRANSACTION READ ONLY` snapshot proves V55/V58 applied, active System
  Owner, `biomes` policy v1 at `L1/ACTIVE` with no circuit, zero biomes runs or
  successful L1 applies, and zero L2/scheduler activation decisions. The first
  L1 bundle/request is technically present but still lacks all four Owner
  fields; second L1, L2, and scheduler inputs remain unavailable by dependency.
- Three new private current-byte requests were generated without Owner inputs:
  `canonical-npc-base-maint-nontown-apply`
  `sha256:500a46351cae3a14f068020092e4ecdf858645e4ae0b0c515e0950db077e7ad3`,
  `canonical-npc-base-maint-town-apply`
  `sha256:f1a7ac53c7def950bd16d55b9bae0c5476b0224848931ca5cc9c2256954ee353`,
  and `canonical-npc-item-relation-lineage-repair`
  `sha256:fb0de241c74f8e605ae469df8f16130867678079fc87760c6d19b9366a3c4a83`.
  Each is ordinary `0600`, `AWAITING_OWNER`, technically complete, expires
  `2026-07-30T23:05:25.000Z`, and has no packet or result. The focused
  authorization, manifest, base executor, owner-phase, and readiness suite
  passes 71/71. Independent cleanup confirms zero isolation databases,
  temporary accounts, Redis DB 14 keys/reservation, external transactions,
  temporary services, snapshot directories, or progress `.tmp` files.
- Final continuation hygiene reran all 47 changed/untracked MJS syntax checks,
  the 121-test item-image/parser/image-sync/domain/boss/manifest/authorization/
  runner suite, `git diff --check`, and the targeted count/hash/decision scan;
  all passed. Fresh readback found zero isolated databases, temporary accounts,
  active transactions, Redis DB 14 keys or reservation, task processes,
  progress `.tmp` files, and temporary worktree listeners. Only the shared
  backend `18191` and shared Redis `16380` remain listening. Thirteen scoped
  `/tmp/terrapedia-item-relations-*` and
  `/tmp/terrapedia-outside-armor-snapshot-*` diagnostics were removed; no
  other temporary file or shared service lifecycle was touched. The entry
  remains `active` because the plan's source and exact-authorization gates are
  unchanged.
- On the user's instruction to continue the 17 open steps, a fresh read-only
  chain audit found exactly two formal requests that are technically current:
  boss-loot request
  `sha256:0db6513f08d29666559e506a569792335434f19a0d72887ada5e7c680b26ac7c`
  and NPC item-relation lineage retry-02
  `sha256:3687be9779838927984ef191fa8e23f0d554523154f75b7f9286156c877ffbc1`.
  In-memory current-identity authorization validation passed for both, and the
  proposed decision identities `canonical-boss-loot-import-20260730-01` and
  `canonical-npc-item-relation-lineage-repair-20260730-02` were unused at that
  proposal checkpoint. Private
  `0600` proposal `canonical-remaining-batch-01-20260730` hashes to
  `sha256:76f932210a8619be36b04fb24024ca1d6c8daa718dd2f9f75a45205549e193da`
  and was `AWAITING_OWNER`; no mutation ran during proposal generation. Both
  identities were subsequently authorized, consumed exactly once, and completed
  under packets `sha256:ae0bc6de...dc1f` and `sha256:f429552a...5b662`.
  They are now immutable history, not available checkpoints. Item-image and
  shimmer remain source blocked; source flip, both L1 applies, L2/scheduler,
  and closeout remain downstream dependency gates rather than independent
  executable lanes.
- The final 2026-07-30 evidence refresh preserves that boundary. A read-only
  domain rerun exits 1 at `43 pass / 1 warning / 1 blocked` with zero reports
  written; item image readiness is the only blocker and shimmer is the only
  warning. Current cross-DB reports are quick `10 pass` and full `8 pass / 2
  warning` (one relation-loot row without local output and 4,316 legacy local
  acquisition rows); relation health is `21 pass / 6 info / 0 blocked / 1
  warning` for 287 unresolved NPC audits.
- The private `0600` NPC readiness report was atomically regenerated at
  `2026-07-30T12:57:16.894Z` and hashes to
  `sha256:56c07558d9a851d324ff445c0315cc528deb7e2f0c733a00f99a9b227ffca47f`.
  It is fresh, `T1_VERIFIED`, and passes all 65 native checks. Admin and public
  GET probes for sample `-65` both bind local snapshot
  `sha256:58545f6cd8d2f40f30ca5f6d74ee5654f1c41deece8e217849ad9dbeacafdb37`.
  The Data Source Acceptance freshness audit still blocks this panel because
  its contract requires `T2_CUTOVER_VERIFIED`; no T2 identity or source flip
  was inferred from passing T1/API evidence.
- Post-refresh residual readback reports zero isolated automation databases,
  temporary automation accounts, external active transactions, Redis DB 13/14
  keys or reservations, task processes, progress `.tmp` files, scoped task
  diagnostics, and temporary worktree listeners. Shared backend `18191` remains
  healthy under `/home/lolben/TerraPedia/back` at PID `165048`; shared Redis
  `16380` remains PID `113522`. Neither lifecycle was changed. The 19:28 `/tmp`
  directories are full-gate test fixtures outside the scoped runtime-residual
  patterns and were left untouched.
- The approved item-image closure implementation began with strict RED ->
  GREEN. The new structural member-evidence tests first failed on the absent
  module and parser field, then passed 10/10 after the bounded same-block
  extractor and group-page integration were added. Exact table-row, neighboring
  row rejection, list-item, ambiguity, decorative-image rejection, and the real
  Adamantite group fixture are covered; group images, sell value, and description
  remain quarantined. See git for code-level diff details. The entry remains
  `active` for candidate schema v2, authorization checkpoints, Shimmer, and
  final integration.
- Item-image closure Task 2 also followed RED -> GREEN. Candidate schema v2 and
  promotion fail-close tests pass 10/10, including an explicit formal-database
  READ ONLY snapshot contract. The fresh v2 candidate report hashes to
  `sha256:e57e7e1147c746d4d4b90ef15fd2aad6b71c441a776430372429ffe94a12effb`:
  2,119 existing sources, 3,135 raw-verified candidates, 142 ambiguous, and 735
  unresolved. Its comparison-only counters are 3,129 local agreements, 6 local
  conflicts, 787 existing-lineage rows, and 3,225 local-only rows. Standardized
  and item-page hashes remain `sha256:4e06da09...2520` and
  `sha256:1ea907eb...ed8`. Promotion review
  `sha256:2c7be8bc3707a90c520fbd3277c85c60cebe0639d8957dd662ff8057a4623d85`
  exits 1 with no bundle because ambiguity/unresolved remain nonzero. No network,
  standardized write, MinIO write, database write, or service lifecycle action
  occurred. See git for code-level diff details.
- Item-image closure Task 3 now owns the bounded monitor-visible Wiki verifier.
  It registers monitor action 24 and canonical operation 29, writes running
  progress before authorization/network access, consumes the packet-bound
  permit before its first request, and uses a dedicated single-attempt request
  profile so one frozen identity causes at most one actual HTTP attempt. Fresh
  focused validation passes Node 51/51 and Maven 11/11; the targeted MJS syntax
  and diff checks pass. See git for code-level diff details.
- The private verifier input is `0600`, 1,130,916 bytes, and freezes 877 rows at
  batch/request bounds `8/877`; its raw SHA-256 is
  `sha256:9ee3daf4bd1657f03f746ebf9186cbe4ea6be629991141d4e4fc20384cb2dd6b`.
  The 27-file execution manifest hashes to
  `sha256:68550ea60bacb3749dd220fd6da60f4cff76867a5f80e42a685e3f9bc73a0437`.
  With the current server fingerprint and policy rows, both manifest and request
  rebuild byte-for-byte. Request
  `sha256:1b180787790b11b8f9f7440561f141290667e1b870c3fd67e2a0aa0ddf4eb164`
  remains `AWAITING_OWNER` and lacks only actor, reason, authorization reference,
  and decision identity. No packet, result, verifier progress, or crawler
  process exists.
- The final 2026-07-31 NPC/runtime refresh remains fail-closed and residue-free.
  Private readiness
  `sha256:6d1596d388c5659945d35c27ec7dff8ccd27bc4e1f5eb6607f1869b6879ede45`
  is `T1_VERIFIED`, passes 65/65, and binds sample `-65` admin/public parity to
  local snapshot `sha256:58545f6c...db37`. The fresh age-zero acceptance audit
  still blocks on required `T2_CUTOVER_VERIFIED`. Read-only probes show server
  UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, `biomes` v1 `L1/ACTIVE`, zero
  committed L1 applies, isolated databases, temporary accounts, active
  transactions, Redis DB 13/14 keys/reservations, verifier artifacts, crawler
  processes, progress `.tmp`/`.part` files, or scoped `/tmp` diagnostics.
  Shared backend `18191` is healthy at PID `561518` under
  `/home/lolben/TerraPedia/back`; shared Redis `16380` is PID `551685`. No
  lifecycle action ran.

- On 2026-08-01 continuation, the Task 3 plan audit resolved an inventory
  ambiguity before implementation: the content-addressed generation has eight
  physical files (raw, context, five transformed/evidence payloads, and the
  manifest); the manifest describes the seven non-recursive payload files and
  binds frozen langlink evidence by descriptor/hash rather than creating a
  ninth file. The prepared RED test was run and failed only because
  `shimmer-generation-contract.mjs` is absent. No crawler, network, database,
  MinIO, production pointer, or service-lifecycle action ran.
- Shimmer Task 3 is now implemented in
  `scripts/data/transform/shimmer-generation-contract.mjs`. It uses a
  generation-ID/data-bundle descriptor, seven non-recursive payload hashes,
  staging-directory disk verification, regular-file/path checks, and an atomic
  current-pointer swap only after final verification. The focused RED-to-GREEN
  contract suite passes 4/4; the Task 1-3 offline parser/fetch/transform suite
  passes 31/31; `node --check` and `git diff --check` pass. Tests wrote only
  cleaned temporary directories. No real crawler, database, MinIO, source
  pointer, or service lifecycle action ran. The branch remains `active` for
  Task 4 and later authorization-gated work.
- Shimmer Task 4 is implemented but remains uncommitted. The rewritten full
  extraction pipeline is the sole `domain-source-shimmer` progress owner: it
  writes `running` before authorization or raw requests, heartbeats through the
  delayed langlink phase, fails terminally on every child/preflight error, and
  completes only after the content-addressed pointer and manifest re-verify
  from disk. Its direct CLI fails closed with visible isolated progress before
  any network access when the packet/permit is absent. The fixed input contract
  binds the action, `Shimmer` page, zh API endpoint, canonical progress path,
  standardized items/NPC bytes, and `3 + 128 = 131` request cap; the child
  validates all of them and consumes the packet-bound permit before its first
  raw request. `canonical-shimmer-generation` is registered with the same
  input/entrypoint/progress bounds and full code bundle, while the monitor and
  backend refresh plan now invoke extraction only, never a database apply.
  Fresh offline validation passes pipeline `10/10`, associated Node contracts
  `82/82`, and focused monitor Maven tests `198/198`. One first Maven attempt
  saw an unrelated `CrawlerReportArchiver` walk race on an atomically removed
  queue `.tmp`; the immediate full rerun passed without a code change. No
  crawler, packet, database/MinIO write, real source pointer, shared lifecycle,
  or commit ran. Next serialized work is Task 5 RED coverage for verified
  manifest-only preview/import; live generation remains Task 7 Owner-gated.
- Shimmer Task 5 is active with Codex as the sole writer. Its read-only quality
  reviewer is limited to the uncommitted manifest-only importer and sync-pipeline
  diff plus tests; it cannot edit code, devlog, authorization artifacts, or
  runtime state. The coordinator is resolving findings serially and will record
  fresh offline validation before any review or commit state advances. No live
  generation, import, permit consumption, database/MinIO write, or lifecycle
  action is authorized by this code-only checkpoint.
- Task 5 read-only quality review returned `COMMIT BLOCKED`: before permit
  consumption, the importer must fail closed unless authorization binds the
  frozen preview/target; it must revalidate every payload after generation
  verification; and it must repair the canonical CLI alias, snapshot
  payload/timestamp descriptor, and truthful post-commit result handling.
  Codex owns the serial RED/GREEN repair. Task 6's static private input contract,
  catalog, execution-manifest, and readiness changes remain explicitly out of
  scope. No live operation ran.
- At 2026-08-03 20:14 CST, the refreshed Task 5 read-only review kept
  `COMMIT BLOCKED` on a newly demonstrated MySQL `DATETIME` representation
  mismatch: mysql2 local `Date` parsing can shift snapshot/readback hashes
  relative to the UTC-normalized preview. The coordinator owns integrated
  closure. Serialized repair ownership: `/root/shimmer_task5_implementer`
  may edit only the importer and its test to force string-preserving DATETIME
  reads; `/root/shimmer_task5_pipeline_repair` may edit only the sync pipeline
  and its test to accept explicit preview `apply=false`. Both are forbidden
  from devlog, Task 6 catalog/input-contract files, and runtime actions. The
  remaining injected apply-result status guard stays a coordinator follow-up;
  no live operation, packet, permit, database/MinIO write, lifecycle action,
  staging, or commit is authorized.
- At 2026-08-03 20:39 CST, the final Task 5 spec review kept `COMMIT BLOCKED`.
  It demonstrated that the verified context payload can preserve an arbitrary
  `world_contexts` code outside the Shimmer-owned scope, and that preview
  evidence exposes aggregate hashes instead of the frozen logical key sets and
  inspectable snapshot descriptors required by the Task 5 contract. Both are
  accepted serial RED/GREEN repairs owned by `/root/shimmer_task5_implementer`
  in the importer and its test only. The reviewer additionally reported that
  DB-derived preview/target matching occurs after opening a read-only
  connection; that timing concern remains under coordinator arbitration because
  the binding shape, generation, bundle, and provider scope already fail before
  connection, while an actual target fingerprint cannot exist without the
  read-only target snapshot. It must be resolved and re-reviewed before Task 5
  can leave `active`. The sync helper's unusual truthy spelling acceptance and
  payload symlink/length test gaps are minor follow-up coverage candidates.
  No live generation/import, packet, permit, database/MinIO write, lifecycle,
  staging, or commit ran.
- Coordinator arbitration at 2026-08-03 20:47 CST rejects the review's
  connection-order finding as a Task 5 defect. The frozen target fingerprint
  (`@@server_uuid`) and provider-owned before scope are necessarily read from
  the target database; requiring their exact comparison before a read-only
  connection would require a separate signed preview artifact, which is Task
  6's explicitly excluded input-contract work. Current code validates bundle,
  binding shape, generation, manifest, bundle, and provider scope before
  connection, then validates all seven binding fields before permit consumption
  or transaction. The accepted repair must add a regression proving a wrong
  preview/target binding reaches only the read-only preview stage, with zero
  permit consumption, apply callback, or transaction start. This disposition
  requires fresh spec and quality re-review after the accepted repairs.
- At 2026-08-03 21:17 CST, final Task 5 code-quality review found an Important
  stale-preview race. The importer builds the authorized provider-owned
  `before` scope outside its transaction, then deletes/replaces that scope and
  verifies only the expected `after` descriptor. A concurrent change between
  preview and DML can consequently be overwritten under an approval for older
  bytes. `/root/shimmer_task5_implementer` is re-assigned serial ownership of
  the importer and its test only: establish transaction-local provider-scope
  locking/readback, compare it to the frozen `before` preview before DML, and
  prove stale preview fails without DML or permit consumption. Task 5 remains
  `active` and `COMMIT BLOCKED` until fresh spec and quality re-review. No live
  generation/import, packet, permit, database/MinIO write, lifecycle, staging,
  or commit ran.
- At 2026-08-03 21:39 CST, fresh Task 5 quality re-review found two additional
  Important scope-alignment defects. `upsertSnapshot` locates an existing row
  without `source_page`, although preview and locked scope use provider plus
  page, so a same-key other-page snapshot can be updated outside the approved
  scope. Table replacement also hard-deletes soft-deleted provider/page rows
  even though preview and lock descriptors include only `deleted = 0` rows.
  `/root/shimmer_task5_implementer` retains serialized importer/test-only
  ownership: add `source_page` to snapshot lookup and prove out-of-scope
  collision preservation; align replacement DML with the active-row preview
  and prove soft-deleted row preservation. Task 5 remains `active` and
  `COMMIT BLOCKED` until RED/GREEN and fresh spec/quality review. No live
  generation/import, packet, permit, database/MinIO write, lifecycle, staging,
  or commit ran.
- At 2026-08-03 22:47 CST, the coordinator completed a fresh read-only Task 5
  quality pass after the serialized importer/test scope repairs and found no
  new Critical, Important, or Minor defects. The final scoped offline
  validation passes `46/46` Node tests, three importer/pipeline syntax checks,
  and `git diff --check`. Task 5 remains `active` and `COMMIT BLOCKED` solely
  because Task 4 is still uncommitted; no live generation/import, packet,
  permit, database/MinIO write, lifecycle action, staging, or commit ran.
- At 2026-08-03 23:03 CST, Task 4 was checkpointed as `818a69bc`
  (`feat(crawler): publish coherent shimmer generations`) after fresh 76/76
  focused Node contracts, 198/198 monitor Maven tests, and syntax/whitespace
  checks. This clears only the Task 4 sequencing hold: Task 5 remains `active`
  pending its own fresh staged-scope review and focused checkpoint. No live
  generation/import, packet, permit, database/MinIO write, or lifecycle action
  ran.
- At 2026-08-03 23:12 CST, Task 5 was checkpointed as `ff34c906`
  (`fix(data): bind shimmer import to one manifest`) after fresh 46/46 scoped
  Node tests, three syntax checks, and whitespace/legacy-input scans. Task 6
  plan review found that the execution manifest cannot pass its private input
  contract to the Task 5 importer without an explicit importer contract-reader
  path. The repaired Task 6 scope adds that reader and updates domain readiness
  to verify the content-addressed generation pointer and completed exact import
  result. No real contract/request/result, generation/import, packet, permit,
  database/MinIO write, or lifecycle action ran.
- At 2026-08-04 01:03 CST, an independent Task 6 review found three Important
  fail-closed gaps: `ambiguous` title identities could reach import and still
  satisfy readiness, exported `applyVerifiedShimmerImport` retained a
  manifest-only programmatic bypass, and Task 7 required a preview before the
  contract that its own preview entrypoint already required. The reviewer also
  found result verification accepted a matching operation ID without proving a
  completed applied run and pointer confinement needed a realpath check.
  Disposition: accepted. Task 6 is `active` and `COMMIT BLOCKED` until each
  repair receives fresh spec and code-quality re-review. The repaired plan adds
  a dependency-injected, read-only proposal builder followed by an atomic
  no-overwrite private contract materializer; neither constructs a request,
  consumes a permit, or writes database rows. A transient overlapping agent
  touched the same source/test scope and was halted immediately
  (`integration-conflict`); Codex is the sole writer and will run integrated
  validation before review. Targeted RED reproduced the importer, readiness,
  and runner gaps; no live generation/import, packet, permit, database/MinIO
  write, or lifecycle action ran. See git for code-level diff details.
- At 2026-08-04 01:57 CST, the independent Task 6 quality review found one
  Critical private-artifact confinement gap: contract, proposal, canonical
  result, and readiness code checked only the final file while an ancestor
  directory could be a symlink outside the worktree. Disposition: accepted.
  Task 6 remains `active` and `COMMIT BLOCKED`; Codex is the sole writer for
  serial RED/GREEN repairs covering private contract/proposal read-write,
  runner result verification, and readiness acceptance. No generation/import,
  packet, permit, database/MinIO write, or lifecycle action ran.
- At 2026-08-04 03:00 CST, Task 6 cleared final independent security
  re-review with no remaining Critical or Important findings. The repair now
  rejects symbolic-link ancestors/endpoints for private contracts, proposals,
  canonical results, generation pointers, manifests, and readiness evidence.
  The direct importer checks its canonical result path before authorization,
  connection, or permit use. The runner checks declared output ancestry and
  canonical result endpoints before decision consumption/spawn, safely creates
  only missing ordinary parent directories, and keeps the lowercase
  `completed` plus `apply=true` result contract specific to
  `canonical-shimmer-import` so existing canonical NPC `COMPLETED` result
  schemas remain valid. The final read-only focused Task 6 suite passed
  `184/184`; no generation/import, packet, permit, database/MinIO write, or
  lifecycle action ran. Task 6 is code-complete for its focused checkpoint;
  this parent entry remains `active` because Task 7 still requires exact Owner
  authorization before any source or database operation. See git for
  code-level diff details.

## Follow-up

- System Owner: both NPC base operations and lineage retry-02 are complete and
  must not be repeated. Preserve retry-01's zero-byte result as historical
  evidence and keep both lineage decision identities consumed.
- Source/System Owner: boss loot is complete under decision
  `canonical-boss-loot-import-20260730-01`; preserve its packet/report and do
  not reuse the identity. Shimmer still lacks coherent raw plus five-shard
  evidence. The item-image four-layer scope is complete under
  `canonical-item-image-lineage-apply-20260801-02`, but the ungoverned
  `projection_items` surface needs a separate preview, owned scope, and Owner
  decision. Do not widen the consumed packet, infer a projection mapping, or
  execute a direct apply. No placeholder report, reverse DB copy, or image-sync
  retry may be substituted.
- System Owner: Batch 04, group Step 4, and the approved four-layer item-image
  scope need no further authorization. The projection follow-up, Task 10's
  remaining Shimmer evidence, both L1 applies, L2, and scheduler activation
  remain separate packets or decisions. NPC apply and isolated T1 are complete
  historical evidence.
- Group bootstrap/cutover needs no further authorization. Task 13 Step 6 is
  fresh and passing, but Step 7 still requires a green complete domain gate and
  an explicit three-contract flip; it is not implied by Step 4. The independent biomes L1
  policy-promotion request remains a later checkpoint and must not be folded
  into group cutover. Item image and
  shimmer lanes first require complete source/producer inputs rather than a
  conversational authorization alone.

## 2026-08-05 Shimmer Generation Authorization Request

- A fresh fixed input contract was prepared at
  `reports/authorization/canonical/canonical-shimmer-generation.input.json`.
  It binds the current standardized item/NPC bytes, the official `Shimmer`
  page and zh API, the canonical progress path, and the exact `3 + 128 = 131`
  request cap. No network or database action ran.
- A new `ADMIN` request is ready at
  `reports/authorization/canonical/canonical-shimmer-generation.request-20260805-admin-01.json`.
  Request hash:
  `sha256:f3525c304da6f5286f9d4024893488a3a3533cf28bdf419bd59b3d5bc538813d`.
  Owner input:
  `reports/authorization/canonical/canonical-shimmer-generation.owner-input-20260805-admin-01.json`.
  Decision identity: `canonical-shimmer-generation-20260805-admin-01`.
- This request authorizes only the bounded network generation and
  content-addressed pointer publication. A separate `canonical-shimmer-import`
  proposal/read and independent database apply authorization remain required
  after generation succeeds.
- The first generation completed under ADMIN-02 but its context shard lacked
  the importer-required `SHIMMER` world-context identity, so the read-only
  import proposal failed closed before database reads. The published
  generation remains immutable and the packet is consumed. The builder repair
  is covered by `18/18` focused pipeline/transform tests. A fresh ADMIN-03
  request is now prepared after a new execution manifest; it must be used for
  a new generation before any import proposal is retried.
- ADMIN-03 completed successfully with generation
  `0865f0e5d61cafdda485defba03aed0ca8181b780301a8ead783d7b9907e5634`, data
  bundle `sha256:37b713e4f932bb5d59c0d9d2683a475eceb931c1c588844fa8558c0cef3dac36`,
  and verified manifest `sha256:94165baf4b1d0c433ca86a7c816f36c1d6504588d2fe86182f9d3451c7c73828`.
  The read-only import proposal then failed closed before DB access because
  `Gold Worm` was ambiguous between item and NPC identities and `202` other
  title-resolution records were unresolved. The import lane remains blocked;
  no database write, proposal input, packet, or apply permit was created.

## 2026-08-05 Shimmer Import Completion

- ADMIN-05 generation completed with generation ID
  `2e231b3862a938a1ac3cd7f4266327e0a5867c8e4c1ae9f7db6ded98520276d4`, data
  bundle `sha256:cc52ba7e3be47c55b652d242d3d7b58990a32faff71652436ac8bfd84969e892`,
  and manifest `sha256:cd954f7701c5152a4664ace530ca91ad3af9bee601b94f945b246138fa6992e9`.
  Title resolution is `item=533`, `item_group=203`, `npc=83`, `none=1`, with
  zero unresolved or ambiguous identities.
- The read-only proposal froze preview
  `sha256:19dc56f3e63bd3fcc8425bf462ddf25eb1d64afb6d28ddef006a0cb225dadbed`
  and target fingerprint
  `sha256:48d56246ed920bed2616226262ef7dd1603c198ba5f3e1d189fefc3f554f7448`.
  Independent ADMIN-02 import packet
  `sha256:2399f8cee1548704403c02753f69fff011e4bd4e84d7b0ac856b4ce9289cbdb0`
  completed with `status=completed` and `apply=true`.
- Readiness now accepts the explicit `none` title kind. Focused validation,
  syntax checks, and diff checks are clean; the fresh domain evaluation is
  `45 pass / 0 warning / 0 blocked`.

## 2026-08-05 Full Gate And First-L1 Authorization

- The isolated auth runner contract passes `41/41`. The runner now starts the
  marker-owned schema from Flyway V1, probes `POST /api/user-auth/refresh`,
  dispatches the maintained auth scripts, and propagates the isolated Redis DB.
  The browser fixtures wait through hydration, use the accessible password
  label, suppress debug-code exposure, and click the logout button without a
  competing NuxtLink navigation. See git for code-level diff details.
- Isolated smoke run `f90f039b9fc7945175ceddc1437144bf` passed all three
  login/register/logout cases and cleanup. Public frontend checks/build and
  `39/39` unit tests pass. The fresh full `scripts/dev/quality-gate.sh` run exits
  zero with `quality-gate: all requested checks passed.`; backend Maven reports
  `1523` tests, zero failures/errors, and 10 skipped.
- A new read-only biomes first-L1 preview was generated as
  `reports/authorization/canonical/automation-biomes-first-l1.bundle.json`, run
  `biomes_l1_20260805_preview01`, bundle hash
  `sha256:9f557d18970f259d3c1eb50995c4fa46f19b9ccc0f5e9fc79afa6cdcee442293`.
  The independent ADMIN request is
  `automation-biomes-first-l1-20260805-admin-01`, request hash
  `sha256:e64e4087a8efa4a464814032214f7dc7a255c5e3bb00e8abd9c3d414cc024fd9`,
  with execution manifest hash
  `sha256:ae4998b1484cd1411765ae1f680bafba2d4bd260b4d95fd1d3e5c189339cf416`.
  Its Owner input is private `0600` and the request remains `AWAITING_OWNER`.
  No packet, permit, first-L1 apply, second L1, L2, scheduler, crawler/network,
  MinIO, source flip, or unrelated database write ran.
- Owner confirmed ADMIN-01 and packet
  `sha256:6033e394e2431391064860a9754b06f75a7792ea18d4d0e7f1cce32aa4e41d9b`
  was signed. The one-time decision was consumed, then the child failed before
  transaction entry with `Cannot access 'bundle' before initialization`.
  Independent readback proves zero matching run/apply rows, zero active fences
  or transactions, unchanged four-table counts `48/14/1170/1519`, and no result
  or residual permit. ADMIN-01 is consumed historical evidence and cannot be
  retried.
- Root cause was a preview-only `const bundle` declaration shadowing the apply
  branch's outer `bundle` throughout the `try` block. A new valid-authorization
  CLI regression first reproduced the exact TDZ, then passed after renaming the
  preview binding; the complete biomes suite passes `9/9`. See git for
  code-level diff details.
- The regenerated manifest binds the repaired code at execution manifest hash
  `sha256:ee3c3fcff3d6320a281c0604a95a11153aa5589d275c9df892ee54f1494795d2`.
  Fresh private ADMIN-02 request
  `automation-biomes-first-l1-20260805-admin-02` is `AWAITING_OWNER` at request
  hash `sha256:ade166e7f4c1dc29e3c93300679b24d40427b0284c6d9db6f8dd943a3028e820`.
  No replacement packet or second dispatch exists; a new exact Owner
  confirmation is required.
- ADMIN-02 was then confirmed and packet
  `sha256:d9947d2e1ae35c64e5f04288633643f8dffc42c6d28fa702752a96975cb4a3ab`
  was consumed. The transaction rolled back on `Data too long for column
  'reason' at row 1`; independent readback proves zero run/apply rows, zero
  active transactions/fences, unchanged counts `48/14/1170/1519`, and no
  result. The reason field was shortened to 238 bytes without changing scope.
  Fresh ADMIN-03 request
  `automation-biomes-first-l1-20260805-admin-03` is `AWAITING_OWNER` at
  `sha256:ef33142900fe9987bddeac9a944df391164b97d3e80126c93dc9edff75b76d86`.
  No replacement packet or third dispatch exists; a new exact Owner
  confirmation is required.
- ADMIN-03 was then consumed and rolled back at mutation-fence commit-marker
  update: MySQL rejected the `sha256:`-prefixed 71-byte bundle hash for schema
  column `commit_marker VARCHAR(64)`. Readback again proves zero run/apply rows,
  zero active transactions/fences, unchanged counts `48/14/1170/1519`, and no
  result. The repair stores only the 64-hex suffix in that column while keeping
  full hashes in governance evidence; focused tests pass `61/61`. Fresh ADMIN-04
  request `automation-biomes-first-l1-20260805-admin-04` is `AWAITING_OWNER` at
  request hash
  `sha256:f4909f620d79a60babbd1dcec8ba870ff88bca33ea29b8c59ce0c6e9650b75a4`.
  No replacement packet or fourth dispatch exists; a new exact Owner
  confirmation is required.
- ADMIN-04 was confirmed and consumed once under packet
  `sha256:be6623667a77d6ed5b06294768028894da8ab17d0f2da4acb682ecbb59d48451`.
  Run `biomes_l1_20260805_preview01` completed and its apply committed with
  protocol `SINGLE_TXN`. Readback proves one successful L1, four generation-1
  mutation scopes and fences, table counts `48/14/1187/1519`, no active
  attempt, no circuit, and unchanged policy `biomes v1 L1/ACTIVE`. The result
  reports biomes `47` updated, biome relations `14` updated, biome resources
  `17` created plus `7` updated, and item biomes `364` updated. Post-apply
  cross-DB quick passes `10/10`; the full domain acceptance dry-run passes
  `45/45` with zero warnings or blockers.
- The later independent second-L1 preview is frozen as
  `reports/authorization/canonical/automation-biomes-second-l1.bundle.json`,
  run `biomes_l1_20260805_preview02`, bundle hash
  `sha256:bee53e2e004dd83e2db8a71377f639dfda9b6f067ea84cb8156ae6426bce57b4`.
  Its baseline binds generation 1 for all four owned scopes and counts
  `48/14/1187/1519`. The private current-code execution manifest hashes to
  `sha256:651a0269d941b4a4745e45af35a77a56ce4fc682150033b04ebcf5f298fcb113`.
  ADMIN request `automation-biomes-second-l1-20260805-admin-01` is
  `AWAITING_OWNER` at request hash
  `sha256:b9d37ce763521640dc6772f737930ee3e0dcfc74b48cd718c97d9389347e12d3`;
  its Owner input is private `0600`. No packet, permit, second L1, L2,
  scheduler, crawler/network, MinIO, source flip, or unrelated write ran.
  Relevant fresh validation passes `36/36` biomes plus authorization tests,
  `2/2` formal cutover/activation manifest tests, artifact assertions, and
  `git diff --check`. The broader manifest file currently has two unrelated
  fixture failures: its catalog-count assertion still expects 35 while the
  worktree catalog has 36 operations, and its all-operation import traversal
  omits the required base-entity-restoration attempt root. These belong to the
  still-uncommitted base-entity operation lane and do not invalidate this
  operation-specific manifest or request.
- ADMIN-01 was confirmed and consumed under packet
  `sha256:c7814c99ed825129e26ba048d17630a230ef3d0a573f9f549f5e089f29beead7`.
  The runner reached the transaction lock and failed before business DML with
  `active write fence exists for biomes`. Readback proves `0/0` preview02
  run/apply rows, one successful L1, all four generations still 1, no active
  attempt, no result, and no retained permit. The prior committed first-L1
  fences had `committed_generation=1` but future `expires_at`; the lock query
  omitted committed generation and therefore misclassified completed fences
  as active.
- The repair adds a RED/GREEN committed-fence classifier and reads the
  transaction-locked `committed_generation`. A prior fence is reusable only
  when its committed generation exactly equals the current mutation
  generation; uncommitted unexpired fences still block and mismatched committed
  generations fail as drift. Focused biomes validation passes `11/11`. See git
  for code-level diff details.
- Because ADMIN-01 is consumed and code bytes changed, it cannot be retried.
  Fresh private ADMIN-02 request
  `automation-biomes-second-l1-20260805-admin-02` is `AWAITING_OWNER` at
  `sha256:8207aaf41a535e5705db9f2cc075c6a37d2e8c0e5642b8bb9229ab734340c255`,
  with execution manifest hash
  `sha256:e1767f0d5d9ea39bf1fe789a84b8f143b6eec981549ef218130206ac13aab948`.
  Its immutable data bundle remains
  `sha256:14326359fd576c8e0040c4d31d3c873d81ec63bbf6ff229e0ca0c4d57407375e`;
  Owner input is private `0600`. No ADMIN-02 packet or replacement dispatch
  exists, and no L2/scheduler/crawler/network/MinIO/source-flip action ran.
- ADMIN-02 was confirmed and consumed once under packet
  `sha256:4d380e089d4989c42a776af158faf39d2467991eeeab0014f68ade3abda4d316`.
  Run `biomes_l1_20260805_preview02` and its apply are
  `COMPLETED/COMMITTED` with `SINGLE_TXN`, independently bound to bundle
  `sha256:bee53e2e004dd83e2db8a71377f639dfda9b6f067ea84cb8156ae6426bce57b4`.
  Readback proves two successful L1 applies, four generation-2 mutation scopes
  and fences, counts `48/14/1204/1519`, no active attempt, no retained permit,
  no circuit, and policy still `biomes v1 L1/ACTIVE`. The result reports
  `47/14/24/364` frozen inputs with no errors. Post-apply cross-DB quick passes
  `10/10`; domain acceptance passes `45/45` with zero warnings or blockers.
- L2 promotion is now dependency-eligible. Its private input binds current
  policy set `sha256:fddd9c42ad0f2c22c4d611f63fb06fbe2444e4aea97029d0c11396e66d0b0e3c`,
  policy v1/hash, and minimum successful L1 count 2. Private ADMIN request
  `automation-biomes-l2-promotion-20260805-admin-01` is `AWAITING_OWNER` at
  request hash
  `sha256:e5934af2ac8569e95e957719e5476805f7b9a8aefda89d0ee0be801d1dbf6f57`,
  execution manifest hash
  `sha256:335fec5c48994cbbcdb523e036aa03ae88a091b83f99753afad47c0977db4f14`,
  and data bundle
  `sha256:eb871877a255378acf96b027b7b309d3c3ad2a0e09e72f9d09c76865bb5f6e2c`.
  No L2 packet/apply or scheduler activation exists.
- L2 promotion was confirmed and consumed once under packet
  `sha256:0bd56e9035bc9b98c6ea5bd6afeba894e33c969f738a1e6b9048ff441777efbf`.
  Its result is `completed`, reports two successful L1 applies, and promotes
  only `biomes` policy v1 from `L1/ACTIVE` to `L2/ACTIVE`. Independent readback
  finds one append-only `L2_PROMOTION` decision with actor `admin`, exact
  decision identity/packet hash, zero scheduler decisions, no circuit, and no
  retained permit. Cross-DB quick remains `10/10`; domain acceptance remains
  `45/45` with zero warnings or blockers.
- Scheduler activation was confirmed and consumed once under decision
  `automation-biomes-scheduler-activation-20260805-admin-01`, request hash
  `sha256:98f8937be176af44b30dd4d8477c7f815629d176169af9922f22ad1882eee958`,
  and packet
  `sha256:81c2e4ee6b51304ed4bfb3e8e08a1ef70df070726c251b5974da4fdf07713aa8`.
  Its result is `completed`, binds policy v1/hash/set and two successful L1
  applies, and records only the append-only `SCHEDULER_ACTIVATION` eligibility
  decision. Independent readback finds exactly one `L2_PROMOTION` and one
  `SCHEDULER_ACTIVATION` decision, policy `biomes v1 L2/ACTIVE`, no circuit,
  zero active attempts/reservations, and no retained permit. All four biome
  mutation generations remain 2, so activation did not modify owned business
  tables. Fresh focused backend verification passes `224/224`; cross-DB quick
  remains `10/10` and domain acceptance remains `45/45` with zero warnings or
  blockers. No scheduler daemon, crawler/network action, MinIO write, source
  flip, or unrelated lifecycle action was started.
- Task 16 durable-fact alignment is complete in
  `docs/audits/canonical-migration-boundary.md` and
  `docs/audits/generated-data-consumer-map.md`. The delta records V56-V58,
  both capability counts, completed item-image/Shimmer evidence, two L1 applies,
  L2/scheduler decision identities, fresh hashes, and the bounded eligibility
  boundary. Ownership-lane review and focused checkpointing are complete, so
  Task 16 Steps 3-4 are complete. A fresh full `scripts/dev/quality-gate.sh`
  run with explicit local E2E MySQL/Redis credentials exits zero, including
  data workflow, domain/cross-DB gates, backend tests, public frontend checks,
  isolated auth browser smoke and cleanup, and admin checks/build. Focused
  post-commit contracts pass `72/72`; E2E temporary database and Redis DB 15
  counts are zero, and ports 18122/13022 are unbound. Scheduler daemon
  deployment remains explicitly out of scope.
- The Owner selected the separate NPC T2/source-contract cutover design in
  `docs/superpowers/specs/2026-08-06-npc-t2-source-contract-cutover-design.md`
  and its executable plan. Task 1 is committed at `e1727ac1`: the verifier
  reconstructs owner/base/T1/database/API/bridge evidence and publishes formal
  T2 readiness only after a private no-overwrite terminal result exists. Task 2
  now registers operation 37 as
  `canonical-npc-t2-cutover-verification`, binds its four immutable NPC inputs,
  complete static code closure, exact formal database/API identity, no-write
  command, and decision-derived attempt packet/permit/result paths. Focused
  verification passes `104/104`, four syntax checks, and `git diff --check`.
  No request, packet, decision consumption, T2 runtime, source flip, DB write,
  crawler, scheduler daemon, or service lifecycle action ran. See git for
  code-level diff details.
- Task 2 is committed at `65c0b0d2`. Read-only preflight confirmed the formal
  server UUID and database triplet, fresh NPC landing/runtime evidence, matching
  admin/public API snapshot evidence through isolated backend `18201`, zero
  active attempts/reservations, and no retained permit or prior T2 attempt.
  Fresh private `0600` request
  `canonical-npc-t2-cutover-verification-20260806-admin-01` is
  `AWAITING_OWNER` at
  `sha256:a61ea58d38b24e3dd1c9772cce0a369fdd47802bcc18e4eaf61ad6bbb7a35f74`;
  execution manifest hash is
  `sha256:b0636493a7df3d87fcd99080c47f0d60e3d11119bd175de22f212ee13682afbc`.
  The attempt contains only manifest, request, and owner input; no packet,
  permit, result, decision consumption, T2 publication, source flip, or DB
  write exists. Exact Owner confirmation is the next gate.

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
- `cce1aafe` `feat(data): extract member item image evidence`
- `dbf433fc` `feat(data): bind item image source promotion`
- `0b689213` `fix(backend): harden managed images and crawler process checks`
- `6f9ef484` `test(auth): stabilize isolated user auth e2e`
- `92548a25` `feat(npc): complete canonical t1 readiness chain`
- `b88b26ef` `fix(data): restore canonical item image lineage`
- `4f3f7875` `data(shimmer): publish validated canonical generation`
- `fa9d456e` `feat(automation): govern biomes promotion and scheduler`
- `c48a99b5` `data(crawler): harden boss loot bundle ingestion`
- `06a0b861` `data(shimmer): archive historical generation evidence`
- `0d953f0e` `data(reports): archive ingestion audit snapshots`
- `fb113247` `docs(data): define npc t2 source cutover`
- `b44b413b` `docs(data): plan npc t2 source cutover`
- `e1727ac1` `feat(npc): verify canonical t2 cutover`
- `65c0b0d2` `feat(automation): govern npc t2 verification`
