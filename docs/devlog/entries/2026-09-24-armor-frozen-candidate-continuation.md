# Armor Frozen Candidate Continuation

## Status

`active`

## Context

- Owner/coordinator: Codex. Branch `feat/automation-scheduler-continuation`;
  worktree `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`;
  HEAD `0f871e94`, no upstream, no staged changes. Existing dirty work is retained.
- Parent: `2026-09-24-canonical-ownership-execution.md`. Earlier review chronology
  stays there; this child is the compact continuation after repeated review rounds.
- Plan: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md`,
  A2-A6. Standing authorization: `2026-09-19-automation-scheduler-authorization-list.md`
  and `user://conversation/automation-canonical-ownership-repair-approved-01`.
- Goal remains real source-to-landing-to-maint-to-relation-to-projection/API
  automatic ingestion. Pure candidates, tests and no-op publication are not that
  acceptance. No repeated user consent is needed for the existing bounded scope.

## Implemented Contract

- A1 locator retains actual source time/revision. A2.1
  `buildArmorCanonicalMaintCandidate` validates two materialized source_evidence
  landing rows and exact maint baselines; preserves IDs/keys, does not invent new
  IDs, keeps unmatched rows and flags source/image removals.
- New `buildArmorCanonicalRelationCandidate({ maintInput, maintItems, currentRows })`
  rebuilds A2.1 rather than trusting caller candidate/hash authority. It derives
  only source-present rows through the real Armor processor. Existing parent,
  part and image IDs/keys persist; image identity excludes sortOrder. Parent keys
  remain consistent and slot replacement requires removal review, never deletion.
- All exact snapshots/results are detached, frozen and hash-bound. Output remains
  `executable:false`; inserted relation IDs and unresolved maint dependencies are
  explicit. It is not a pre-insert landing planner, runtime media authority,
  registered executor or full A2.2 projection candidate.
- Real item dependency schema governs validation: no fabricated record_key or
  slot columns; raw_json owns slots; required landing lineage cannot be erased.
  Module generation text is nullable VARCHAR64, not an ISO DATETIME. Actual UTC
  trace timestamps must be calendar-valid before inserts, updates or no-ops.
  A2.1 now rejects the same upstream calendar overflow without changing its
  full source-hash binding or second-precision SQL normalization.
- See git for code-level diff details.

## Review And Frozen Files

- Implementer: `armor_relation_candidate`; only the four files below. Coordinator
  alone owns docs/runtime. Reviewers are read-only; no overlapping writers.
- Spec reviewer `armor_relation_spec_review`: approved all four frozen files,
  153/153 focused tests and34 additional independent assertions. Original five
  spec findings, two quality findings and the upstream A2.1 defect are resolved.
- Quality reviewer `armor_relation_quality_review`: approved the same four
  frozen files,153/153 plus47 independent assertions; no remaining Critical,
  Important or Minor findings in this scope. Both quality findings and the
  upstream calendar defect are resolved. Approval covers pure builders only.
- SHA256 values (without the prefix):
  - `pipelines/maint/armor-canonical-maint-candidate.mjs`:
    `35b70daf2d6eee88d11af3c484b3e8613d89a76dd9303b2f10e0368390afb45b`
  - `pipelines/maint/armor-canonical-maint-candidate.test.mjs`:
    `d32aa90c2e77fd04251c03266a1122e6aa82e74989ce88ce5c2f6466866ea216`
  - `pipelines/relation/armor-canonical-relation-candidate.mjs`:
    `1b70edeed0c07d0e6ba7be14f784862febe59c13db727d1622155c203f9a7d3f`
  - `pipelines/relation/armor-canonical-relation-candidate.test.mjs`:
    `2bac329361e15ba0e8422b0a1dc9a66811481107281a21d439c3659e2a783273`

## Validation

- Node22 `.local/tools/node-v22.23.0/bin/node`: focused relation99 + maint35 +
  processor19 =153/153. Regressions were observed RED before their fixes.
- Related automation/Armor/Buff/landing/maint/secondary/projection integrated
  tests:1509 passed,0 failed,1 pre-existing Shimmer maint skip,1510 total.
  Log `.local/logs/canonical-a22-calendar-final-fULPUJ.log`.
- Syntax, direct untracked-file whitespace, devlog links/status and
  `git diff --check` pass. No broad Maven/frontend/full quality gate, live
  changed-data/API acceptance or sustained-operation test ran.
- API `2026-09-24T03:21:10.864835488Z`: HTTP200, scheduler disabled, live attempts0,
  claims0, reconciler healthy, all eight domain readiness statuses blocked.
  H8 `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`;
  epoch `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`, Redis DB14.
- MySQL02:53Z: original UUID/admin ACTIVE, fresh decisions0, active fences0,
  attempts0 and reservations0. JVM17565 scheduling=false. No restart was needed.
  These are observations, not reusable execution authority.

## Remaining Gates / Next Action

Latest2026-09-26 continuation: child
`2026-09-26-armor-secondary-projection-continuation.md` published224 attributes
and290 existing item effects via one governed decision
`armor-secondary-a6-20260926-01` (consumed). Exact DB/public/admin readback passed,
source unchanged; scheduler disabled/0/0, H8/epoch unchanged. Tests1588/1588.
Runtime review then found133 historical attribute slot conflicts,181 effect
slot conflicts and114 class-specific crit cells marked all. Child is blocked
on new A6.3 source/maint/relation repair authority; this parent remains active.
No automatic end-to-end acceptance, source refresh, scheduler/Redis write or
discretionary rollback. See child for packet/result/readback prefix and next
scope request; do not replay the514-row publication.

### Phase 0 runtime binding repair: 2026-09-25

- Initial authenticated probe returned `STATE_STORE_RESET` because the JVM had
  been started with the worktree as `terrapedia.crawler.queue-v2.repo-root`,
  while the durable `reports/crawler-monitor/v2/cutover-state.json` marker is
  owned by the primary repository root. Redis DB14 was read-only verified to
  contain the matching V2 engine, epoch, cutover ID, and first-mutation marker;
  no state reset was justified.
- The worktree services were stopped and restarted with the canonical script,
  `SPRING_TASK_SCHEDULING_ENABLED=false`, primary repo-root
  `/home/lolben/TerraPedia`, and command-root
  `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
  Fresh `/api/actuator/health`, authenticated overview, and authenticated
  preflight are HTTP 200; control remains disabled, live attempts/claims are
  `0/0`, reconciler is healthy, and H8/epoch are unchanged. No reset endpoint,
  Redis write, scheduler write, source probe, crawler/import, or business-table
  DML occurred.
- This cleared the environment binding blocker only. It does not make any
  domain readiness or full-chain executor available.

### Current-model typed intent review and repair: 2026-09-25

- Self-review found two contract defects before any packet: projection rows were
  labelled `local` even though `projection-schema.mjs` owns them in the
  `relation` database, and the intent validator allowed duplicate/unsupported
  reference slots plus projection primary-key allocation without an exact
  relation-parent reference. The candidate/intent tests reproduced these cases
  RED before the repair.
- The typed intent now binds projection inserts to the schema-owned `relation`
  role, permits only declared Armor graph references, rejects duplicate slots,
  requires projection `id` to reference the exact relation-set insert, checks
  the embedded candidate hash, and validates generated declaration kind/value.
  Existing relation/maint identities and generated timestamp rules remain
  unchanged; no generic hash ID or local projection write is accepted.
- Focused RED/GREEN verification: 235/235 Armor maint/relation/projection/
  intent tests pass under Node 22. No database, Redis, packet, permit, source
  probe, crawler/import, or business-table write occurred.

### September 24 continuation execution tracker

- User renewed the request to run the whole automatic ingestion flow. Success
  still requires source-driven changes and terminal DB/API equality, not pure
  candidates or no-op runs. Existing standing authority and exclusions apply.
- Resume11:46 CST: exact branch/HEAD and1571 dirty paths (1509 untracked),
  zero staged match the handoff. No upstream; all prior work preserved.
  Backend `/api/actuator/health` is UP; JVM17565 scheduling=false. Fresh MySQL
 11:46:07 reads original UUID/admin ACTIVE, no fresh decisions/fences/attempts/
  reservations. Follow-up isolated login/control as HTTP200; the slow endpoint
  was preflight, not authentication. With the historical observer's longer
  bounded timeout, preflight03:49:06Z completed in12.337s: HTTP200/control false,
  attempts/claims0/0, reconciler healthy, unchanged H8/epoch, eight domains
  blocked. Earlier short read timeouts were insufficient; no service repair or
  restart was needed. This observation is not future execution authority.
- [x] A2.2 projection/dependency composition and typed intent seam — pure,
  non-executable contract self-reviewed and focused-tested. Runtime executor
  remains open.
- [ ] Typed generated-ID intent/materialization and recovery binding.
- [ ] A3/A4 exact partitions, registered executor and transaction tests.
- [ ] A5 governed image evidence, composite source identity and policy transition.
- [ ] A6 fresh serial changed-data execution and consumer equality.
- [ ] Parent B1/S1 and remaining eight-domain acceptance/release gates.
- Coordinator/root owns docs, runtime diagnosis/readbacks and shared contracts.
  Implementation agent `armor_projection_candidate` owns only new
  `pipelines/relation/armor-canonical-projection-candidate.mjs` and its test.
  No modifications to the four reviewed producer files, generic projection,
  catalog, policy, runtime, credentials or artifacts. Spec then quality
  reviewers are read-only. No agent may commit or write shared devlog.
  Producer contract is the four hashes above; new consumer must acknowledge
  them and return status, tests/RED evidence, exact file hashes and limitations.
  Coordinator integrates focused/integration tests before release; any producer
  change invalidates dependent review and requires explicit serialized ownership.
- Independent preparation while projection is built: root owns only
  `pipelines/automation/table-ownership-matrix.mjs` and its test for the A3
  landing partition prerequisite (no executor or policy activation). This is
  disjoint from projection inputs/code. `armor_intent_audit` is read-only and
  maps the typed-ID integration/transaction/recovery boundary; it must not edit
  candidate producers or dependencies. Both results require separate review;
  partition metadata alone never closes A3 or authorizes a write.
- A3 partition prerequisite RED: three new tests failed for missing Armor
  partitions, stale resolver acceptance and overlap certification. GREEN:
  matrix/fence/NPC preparation33/33 pass. Broader NPC contract run47/48 passed;
  its one failure is missing pre-existing `data/wiki-crawler/normalized-light/npc`
  fixture data, not a predicate assertion; no dataset was copied or fetched.
  Landing resolver is version2 (other groups remain1), so changed `other`
  semantics cannot reuse old predicate authority. Armor datasets belong only
  to their explicit partitions for both legacy/source-evidence rows. Actual
  runtime SQL predicates/fences and legacy-history preservation remain A3 gates.
  `armor_partition_spec_review` reviews only the two matrix files, read-only;
  subsequent quality review must follow spec approval.
- Partition spec reviewer approved after one Important dual-alias correction:
  explicitly present null/undefined aliases are contradictory, not absent.
  Root observed RED then GREEN33/33; independent spec33/33 plus582 assertions
  pass. All162 unrelated matrix entries and snapshot table set unchanged.
  `armor_partition_quality_review` now owns read-only quality review of the same
  two files. Frozen source `19dada99f8bc8a5e31af064f92073c07c037368b41129c67f28c54ab2375f3af`;
  test `c1f397c44daeaa47c55171ca656879919ba57bcfa40fa631dd3b05aa682c6103`.
  Full automation before the alias edge correction passed1087/1087, log
  `.local/logs/armor-partition-automation-dXN2FH.log`; final integration pending.
- Typed-ID source audit completed read-only; root confirmed numeric coercions
  in Armor extraction/trace and real landing unique/current-slot/timestamp
  schema. Plan now needs exact legacy-current-marker demotion, per-table ID
  receipts and frozen system timestamps; shared packet verifier need not loosen.
- Fresh read-only DB also found three Armor legacy landing rows (two current),
  no source_evidence rows, `projection_equipment_effect_attributes` total0,
  `projection_item_armor_attributes` total0. Relation effects are320 active
  parsed `owner_kind=item/source_kind=armor_attribute_cell`, with no armor_set
  effects. The public API's secondary dependency gap cannot be closed by
  writing only projection_armor_sets. These dependencies remain read-only in
  current A3/A6 scope; do not infer permission to populate them.
- Partition quality reviewer independently approved the same frozen hashes:
 33/33 focused plus960 assertions; no findings. Root final automation plus
  NPC preparation1091/1091 passes, log `.local/logs/armor-partition-final-WRCefA.log`.
- Projection implementer froze the two new files for `armor_projection_spec_review`
  (read-only, then separate quality review). Reported74/74 focused and300/300
  integrated, pending root verification. Source hash
  `6682c276f049ae5998d2d554fac5a5e581d492b38c0e8b361950e22ff89b99b5`;
  test `04e32d054be7626e38830f35c78a12e3591e434735cd3ad8d8c6fe1078a1e8d9`.
  Upstream four reviewed hashes remain unchanged. This candidate includes
  explicit missing/stale/source-unverified dependency blockers and still cannot
  execute. Current work will not expand the read-only dependency write scope.
- Projection spec review found an Important blocker and returned the two-file
  slice to the same implementer: when relation equipment effects/armor attribute
  rows and their projections are empty, local fallback can leave acceptance as
  `dependencies-satisfied`; inactive/deleted item-owner effects are also silent.
  The current candidate only audits active armor_set effects, while the public
  piece-effects reader consumes item owners. Required fix is RED/GREEN tests and
  explicit `item-effect-evidence-unresolved` plus attribute-projection missing/
  fallback-only blockers, while preserving source-proven zero-effect validity.
  No spec approval or quality review is valid until re-reviewed; no runtime
  writes or scope expansion are allowed.
- Root integrated projection/producer/processor/parser/projection regression
  rerun300/300 passed, `.local/logs/armor-projection-integrated-xltmTf.log`.
  The dependency gap is source-backed, not just empty-array inference: fresh
 04:06:21Z exact relation/member/local item join selects armor8 Ninja/member256
  NinjaHood/effect6 crit_chance3.0000, maint attribute34/landing12448. Public
  detail includes member256 but pieceEffects[256] is empty; JVM log has0 piece-
  module degraded warnings. Empty source-proven cases remain legal, and correct
  primary items.defense remains legitimate. A2/A3/A4 typed-ID plan amendments
  passed independent source-audit re-review; no executable contract implemented.
  Additional projection publication scope is proposed only, not authorized;
  structured set bonuses separately lack a defined revision-bound text source.

1. Compose A2.2 frozen projection and item/image/
   effect dependency candidates using the reviewed relation builder. Do not trust
   caller candidate metadata. Preserve unmatched rows and existing identities.
2. Implement the independently reviewed generated-ID plan contract: pre-permit
   typed logical references, then exact insert IDs/locked rederivation/equality
   and original-map recovery. Never freeze the generic projection hash-ID fallback
   or guess AUTO_INCREMENT; never discard all IDs from authorization hashes.
3. A3/A4: immutable source_evidence landing partitions excluding the `other`
   owner, actual cross-DB fences, registered full-chain transaction/packet and
   failure/reconciliation tests. No generic legacy-history DELETE or DDL.
4. Governed image evidence is still missing: fresh DB has175/175 active maint
   images without revision and1 without cache. Do not invent either. Current
   H8 owns only local compatibility Armor tables; automatic hookup needs the
   reviewed explicit policy transition and composite module/image identity.
5. A6 must verify actual public/admin consumers, including their read-only item,
   image, defense and equipment-effect dependencies. Buff full executor, Shimmer
   six-scope partitions and separately scoped sustained operation remain parent
   work; none is closed by this candidate batch.

## Safety And Commits

- No scheduler control/source probe/crawler/import/business-table DML, direct
  Redis/control-file writes, executable packet or permit consumption this batch.
- Never reuse Retry39/decision65, Retry41/decision74, Retry42/decision75 or L2
  decisions66-73. Keep the private authorization scope and26MB preview private.
- No reset, cleanup, staging, commit or push. This child and parent stay active;
  no user restart/refresh is required for the offline code changes.

## 2026-09-25 continuation: source probe and recovery binding

- Phase 0 re-probe: MySQL `127.0.0.1:13306`, Redis `6380`, MinIO `19000`,
  backend `18102`, public `5188` and admin `3015` were reachable. The canonical
  JVM is bound to durable repo-root `/home/lolben/TerraPedia` and continuation
  command-root, with `SPRING_TASK_SCHEDULING_ENABLED=false`. Authenticated
  overview/preflight returned HTTP 200; live attempts/claims are `0/0`, the
  reconciler is healthy, and H8/epoch are unchanged.
- Read-only source monitor was rerun with the correct Node 22 binary after the
  first attempt fail-closed on group-writable evidence directories. The exact
  `reports` and `reports/fetch` directories were repaired to `0755`; no source
  or business data was deleted or rewritten. Final monitor result is `9/9`
  probes, `0` probe errors, `9` changed, `requiresFullRefetch=true`, report
  `/home/lolben/TerraPedia/data/terraPedia/reports/fetch/source-update-check-2026-09-25T03-27-31.031Z.json`.
  Five supplementary records are `missing_ingestion_manifest`; this is a
  readiness blocker, not permission to run their importers. One source-monitor
  writer remained active at a time; the stale duplicate process was terminated.
- A4 recovery binding was added as two new unregistered pure files:
  `pipelines/relation/armor-canonical-recovery-journal.mjs` and its test.
  The contract hashes the immutable `PREPARED` journal over packet hash, run /
  decision identity, server UUID, intent hash, exact verified ID map and
  concrete-after hash; it validates legal state history, rechecks all bindings
  before COMMIT, and supports fail-closed commit uncertainty/reconciliation.
  It does not yet publish an executable packet or own a DB transaction.
- TDD evidence: the new journal test first failed with `ERR_MODULE_NOT_FOUND`
  before implementation; after the implementation and a follow-up history/
  concrete-after repair, the focused Armor set (maint/relation/projection/
  intent/recovery/processor) is `262/262` under Node 22. `git diff --check`
  passes for the new files. Source hash `152da896df1a3240ca1f76bf5cbf59d5fc011edaa740df3da2c0d9e7ce90bc3c`
  and test hash `4509551265368baccba39f512565ecaee868ed64baf39d36d7c9200abd6dbc75`.
- This clears only the pure recovery-binding subgate. A3/A4 still require
  landing/maint generated-ID plans, SQL owner/fence enforcement, a registered
  full-chain executor that consumes this journal before COMMIT, and terminal
  DB/API readback. No scheduler control write, packet/permit, crawler/import,
  Redis write, or business-table DML occurred.

### A3 source-evidence landing transition contract

- Added `pipelines/landing/armor-source-evidence-transition.mjs` and its test as
  the next pure A3 boundary. It accepts only `armor_sets_raw` and
  `armor_set_images_raw` with `artifact_role=source_evidence`, preserves all
  unmatched history, emits no deletes, rejects caller-allocated new IDs and
  bootstrap metadata, and plans exact legacy/source current-marker demotion
  before inserting immutable evidence. Byte-different tuples that are
  conservatively equivalent under the landing table's case/normalization
  collation fail closed instead of retrying a unique-key collision.
- TDD first produced the expected `ERR_MODULE_NOT_FOUND`; after implementation
  and marker/collision validation repairs, the landing transition and recovery
  journal tests pass `13/13`. This remains non-executable; SQL range locks,
  owner fences, generated landing/maint receipts and the full chain executor
  are still required.
- Integrated Node22 focused validation after both new pure contracts is
  `267/267` (`.local/logs/armor-a3-a4-integrated-20260925.log`); syntax and
  `git diff --check` pass. Fresh authenticated preflight at
  `2026-09-25T04:05:20.726867989Z` is HTTP 200 with disabled control, `0/0`
  live work, healthy reconciler, unchanged H8/epoch, and all eight domains
  still `blocked`. This is a clean safety readback, not execution acceptance.

### Current-model review continuation (2026-09-25)

- User requires current-model review, not a review model/subagent. Coordinator
  owns both serial review passes and implementation; no new delegation.
- Fresh API preflight `2026-09-25T04:13:41.507415343Z`: HTTP200,
  disabled/changed-only/60 minutes, live attempts/claims0/0, healthy reconciler,
  unchanged H8/epoch, eight blocked domains. No restart was needed. Read-only
  DB counts confirm maint Armor63/images175, relation63/470/175, projection63,
  and both secondary projection tables empty. These are not D acceptance.
- Self-review rejected and removed only this turn's two temporary
  `armor-canonical-full-chain` draft files: they did not implement the claimed
  transaction/registration. Prior work is preserved. No catalog change, packet,
  permit, scheduler mutation or business DML occurred.
- Review hypotheses to reproduce before implementation: landing validation can
  accept a rehashed insert carrying an ID/non-current marker or inconsistent
  lists; journal advancement can return invalid chronological history and its
  read validator does not enforce terminal evidence semantics. Scope is the two
  pure contracts/tests, plan and devlog only; full executor remains pending.
- Security note: an API login response was accidentally printed with its
  temporary bearer token in tool output. No password was printed. Subsequent
  probes suppress authentication response content. Token/key rotation is not
  authorized by this register and was not attempted; do not copy the token to
  durable evidence.
- Git: branch/HEAD unchanged (`0f871e94`), no upstream/staged changes,1581
  dirty/untracked paths before this repair. Older1381-path handoff is historical;
  existing continuation changes and private artifacts remain preserved.

### Current-model review result and re-verification (2026-09-25 12:36 CST)

- Reviewer/resolver: current-model Codex, serial spec then quality self-review;
  no review-model or subagent dispatch. This is not independent approval and
  does not replace independent runtime authorization/readback. The plan now
  reflects the user's review-mode instruction for remaining code-review stages.
- Landing transition repair rejects allocated insert IDs/generated slots,
  nonnumeric or inconsistent current markers, invalid/duplicate baseline IDs,
  demotions without replacements and overlap between result lists. Conservative
  accent equivalence is an early screen only; native MySQL collation locks
  remain required. Unmatched history and mixed valid transitions remain valid.
- Recovery journal construction and advancement now validate their own output;
  preparation time cannot change or precede the frozen write time, history
  cannot run backward, and commit binding includes writeTimestamp. Rehashed
  terminal journals still require valid outcome/after-hash evidence. Known
  outcomes cannot be reversed without the explicit compensation path. ID maps
  reject foreign tables and duplicate allocated IDs within a table.
- Typed intent binds projection references to their own relation_record_key,
  compares complete generated-ID declarations rather than membership alone,
  rejects caller-allocated IDs on relation inserts, and deep-freezes the verified
  ID map. This contract still covers relation/projection inserts only; it does
  not yet implement the planned landing/maint ID-independent graph.
- RED evidence before the repairs: 24 newly added rejection cases failed;
  GREEN includes those regressions and a mixed valid landing-transition case.
  Re-review of the three source files and their tests found no further issue
  within this repair scope. A3/A4 runtime approval remains open. See git for
  code-level diff details.
- Latest fresh execution of the regression command below (same model)
  exited 0: 1563 passed, 0 failed, 0 skipped. Log:
  `.local/logs/armor-current-model-rereview-20260925-KrU21g.log`.
  Earlier same-turn log `.local/logs/armor-current-model-audit-20260925.log`
  has the same result. Neither log is live ingestion evidence.

```bash
.local/tools/node-v22.23.0/bin/node --test --test-reporter=tap \
  pipelines/automation/*.test.mjs \
  pipelines/landing/armor-source-evidence-transition.test.mjs \
  pipelines/landing/source-dataset-locator.test.mjs \
  pipelines/maint/armor-canonical-maint-candidate.test.mjs \
  pipelines/relation/armor-*.test.mjs \
  pipelines/relation/run-armor-set-projection-incremental.test.mjs \
  pipelines/relation/projection-sync.test.mjs \
  pipelines/relation/sync-buffs-to-relation.test.mjs
```

- Frozen source/test SHA256 pairs (without prefix):
  - Landing transition:
    `4aaa4b549d1b3d4478efa609800812497f04a1f1156a57802509e7d48e71b7cd` /
    `9202e654c95faa4124b48145745641958abe4d47be42dc34c258031bd27353b7`.
  - Typed intent:
    `77f790ba51d9969d3b07f06546006828adab3e7ac6d8645ee2c62bab77de65f9` /
    `99a71c521309b59ea1233b30f969be996593875af1c9fb93e478a2f84a5f0f27`.
  - Recovery journal:
    `33f5d6cebc9b07c61e0da9f271f5783702d4e860545986da125e94a560364367` /
    `08b83dafb729c05f10abb7e0fe1d80d082603dc48857b887be4b809b0c8b4a8d`.
- Health-only readback at 12:36 CST is UP; authenticated Phase 0 remains the
  timestamped 04:13:41Z observation above, not a fresh executable permit.
  Catalog inspection confirms only Armor restoration/incremental operations,
  no registered full-chain `canonical-armor-ingestion` executor. No restart,
  source probe, packet/permit, scheduler mutation, Redis write or business DML
  was performed during this review phase. No Maven/frontend/full local gate ran.
- Final review checks pass: six source/test syntax checks, direct whitespace/
  conflict scans of all eleven touched code/test/document paths, three active
  entry statuses, current timestamp/links and the five latest-result pointers.
  `git diff --check` passes; `git diff --cached --stat` is empty. Final
  `git status --short --branch -uall` shows1581 paths (1517 untracked),0 staged;
  HEAD/branch/upstream remain unchanged. No commit/push/cleanup occurred.
- Landing ownership clarification: the planned new landing and journal IDs use
  `local.source_dataset_landings`. Both databases have historical landing
  tables; existing maint-image lineage includes maint landing6515. Never
  substitute the local table for that historical maint lineage or vice versa.
- Next smallest implementation: the explicit landing/maint ID-independent
  derivation and typed graph under unchanged original baselines, then exact
  receipts/locked rederivation. Actual SQL fences/collation locks, durable
  journal recovery and terminal readback precede registration or packets.
  Missing image revision/cache evidence, secondary projection ownership,
  automatic composite source/policy transition, Buff/Shimmer executors and
  real changed-row/API/natural-tick/sustained acceptance remain open.

### A3 ID-independent landing/maint/relation continuation (2026-09-25 17:05 CST)

- TDD RED reproduced the maint boundary failure: a source-evidence landing
  insert without an AUTO_INCREMENT ID was rejected before derivation. The
  repaired `buildArmorCanonicalMaintCandidate` accepts this only through the
  explicit `allowUnmaterializedLandingIds=true` option; it preserves undefined
  `landing_source_id` and emits exact unresolved landing identities. Default
  v1 behavior still requires materialized landing IDs.
- Added the non-executable `armor-canonical-landing-maint-intent/v1` pure
  contract. It binds the source transition, landing/maint baselines,
  generated-ID declarations, typed `landing_source_id` references, per-table
  receipt uniqueness, exact affected rows/readback IDs and frozen write
  timestamps. It revalidates source transition and baseline semantics after
  outer hashes are recomputed. It does not write SQL or register an operation.
- Added explicit `buildArmorCanonicalRelationIdIndependentCandidate`. The
  existing relation v1 builder remains unchanged; only the explicit mode
  accepts unresolved landing IDs and retains source maint record keys for later
  typed materialization. No allocator order or synthetic ID is introduced.
- TDD evidence: landing/maint intent RED first failed with the missing module;
  semantic rehash and foreign landing-ID regressions also failed before guards.
  GREEN integrated slice is `420 passed, 0 failed, 0 skipped` under Node22;
  the final broader command is `1572 passed, 0 failed, 0 skipped`:
  `.local/logs/armor-current-model-full-20260925-final.log`.
- Current-model review remains serial and non-independent. The new pure graph
  is still a preparation contract; it is not a registered executor, native
  collation/range-lock proof, cross-database transaction, durable recovery
  journal writer, terminal DB/API readback or automatic scheduler hookup.
  Candidate rederivation under locked source/baseline rows remains an executor
  gate before any packet or business write.
- Final verification after the scope guard: the broader Node22 command is
  `1572 passed, 0 failed, 0 skipped`; five modified source/test files pass
  `node --check`; `git diff --check` passes; generated skill views report
  parity for 79 source files. Git remains at HEAD `0f871e94`, branch
  `feat/automation-scheduler-continuation`, no upstream, zero staged paths,
  1584 dirty paths (1519 untracked, 65 tracked modified).

### A3/A4 transaction-core continuation (2026-09-25 17:56 CST)

- TDD RED first confirmed the missing transaction executor module. Added the
  unregistered `pipelines/relation/armor-canonical-transaction-executor.mjs`
  and its focused test. The core requires full-chain relation intent and a
  fence commit marker unless the explicit test-only `allowPartial` path is
  used; production registration cannot use that bypass.
- The transaction sequence is bounded and same-server compatible: set
  `REPEATABLE READ`, begin one transaction, lock Owner/server/fence state, lock
  both Armor landing partitions plus every candidate target/gap with native
  SQL predicates, rederive under those locks, then demote current markers,
  insert landing/maint/relation/projection rows in dependency order, and check
  exact `affectedRows`, `insertId` and readback IDs. Projection IDs are only
  populated from their exact relation insert receipt. Generated `current_slot`
  is left to MySQL and is never written directly.
- Commit acknowledgement failure marks `requiresReadbackReconciliation` and
  invokes the journal `commitUnknown` adapter without issuing a blind rollback.
  Journal callbacks are required for prepared/materialized/rollback-confirmed/
  commit-unknown/committed states, but no durable adapter, packet verifier, relation ID-independent
  composition, catalog registration or live DML is wired yet.
- TDD GREEN: the executor suite is `6/6`; the combined landing/maint/recovery/
  executor slice is `47/47`; the fresh related Node22 regression is `1581/1581`
  (`.local/logs/armor-current-model-final-20260925.log`); syntax and
  `git diff --check` pass. These are
  mechanism tests only. Scheduler remains disabled and no source probe,
  crawler/import, Redis write, permit/packet consumption or business-table DML
  occurred.
- Remaining A3/A4 blockers are now concrete: compose unresolved landing IDs
  with a locked relation/projection intent, persist the operation-specific
  recovery journal on disk before COMMIT, bind a real authorization packet and
  native server/policy readback, then register the executor and prove terminal
  DB/API equality. Do not mark A3/A4 complete from this core alone.

### Fresh Phase 0 readback (2026-09-25 18:18 CST)

- Backend `http://127.0.0.1:18102` health is `UP`. Authenticated read-only
  preflight observed at `2026-09-25T10:18:34.175973262Z` returned HTTP 200 with
  scheduling disabled, `changed-only`, 60-minute interval, live attempts/claims
  `0/0`, healthy reconciler, unchanged H8
  `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`
  and V2 epoch `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`. All eight domains
  remain `blocked`; the response also exposes only historical last-sweep data.
- This is a fresh safety readback, not an execution permit. No scheduler
  control/sweep, source probe, crawler/import, Redis write, permit consumption,
  or business-table DML occurred.

### Durable journal-store boundary (2026-09-25 18:26 CST)

- Added the unregistered `armor-canonical-recovery-journal-store` adapter and
  test. It confines the journal to the repository, rejects symlink/duplicate
  targets, writes private `0600` JSON through an fsync-plus-rename temporary
  file, validates the operation-specific journal by default, and advances only
  from the exact persisted hash while retaining the complete prior history.
- TDD GREEN is `3/3` for the isolated store suite. Tests use an explicit
  validation bypass only because their compact fixtures are not full journal
  hashes; production defaults to the existing journal validator. The adapter
  is not yet connected to the transaction core's callback lifecycle, so A4
  durable PREPARED/materialized/commit-unknown/terminal evidence remains open.

### Durable PREPARED adapter repair (2026-09-26)

- Current-model self-review found that the recovery adapter only marked
  `prepared()` in memory and did not create the journal file until after DML
  receipts existed. That left pre-commit failures without durable PREPARED
  evidence, contrary to the A4 contract.
- The recovery journal now distinguishes `materializationStatus=PENDING` from
  `VERIFIED`. `prepared()` persists a packet/intent/server-bound PREPARED
  journal with no guessed IDs or concrete-after hash; `materialized()` updates
  that exact persisted hash with real receipts and verified IDs before commit.
  Pending pre-commit rollback remains legal; COMMIT_UNKNOWN and COMMITTED still
  require verified materialization.
- Added regression coverage proving the file exists before materializer
  invocation and that materialization failure can be followed by durable
  `ROLLBACK_CONFIRMED`. No packet, registration, scheduler/control write,
  source probe, crawler/import, Redis write, or business-table DML occurred.
- Validation: adapter `3/3`; journal/store/executor combined `27/27`; syntax
  and `git diff --check` pass. Full related Node22 regression remains the next
  validation gate.

### Executor journal integration and typed upstream boundary (2026-09-26)

- Added an executor/filesystem-journal integration test. It proves the
  transaction calls the real adapter, persists `PREPARED` before inserts, binds
  the exact allocator receipts, and reaches terminal `COMMITTED` evidence with
  the same journal file. Focused Armor validation is now `349/349`.
- Typed intent validation now has an explicit `upstreamReferenceDeclarations`
  list for same-transaction `maint.*` references, and materialization accepts
  only declared external maint receipts. This is a narrow contract seam for
  the pending full-chain composition; arbitrary cross-database references are
  still rejected.
- A full relation/maint/projection composition, native collation/gap locks,
  operation registration, packet binding and terminal API readback remain open.
  No scheduler mutation, source probe, crawler/import, Redis write or business
  table DML occurred.

### Full-chain composition and native landing lock continuation (2026-09-26 11:57 CST)

- TDD RED first failed with the missing `armor-canonical-full-chain-intent.mjs`
  module. GREEN added the non-executable
  `armor-canonical-full-chain-intent/v1` composer and tests. It validates the
  landing/maint intent against the ID-independent relation/projection candidate,
  emits exact relation/projection insert plans from candidate rows, and binds
  the dependency graph `landing -> maint -> relation -> projection` without
  allocating IDs or trusting caller metadata. The resulting recovery intent
  hashes both child intents and the dependency graph; rehashed graph drift is
  rejected.
- Typed upstream declarations now allow only exact `maint.*` or
  `local.source_dataset_landings|...` identities. Relation materialization
  accepts only those declared external receipts, while arbitrary cross-database
  references remain rejected. A receipt test proves local landing and maint IDs
  are injected only from their declared receipts.
- The projection candidate now exposes an explicit
  `buildArmorCanonicalProjectionIdIndependentCandidate()` path. Existing v1
  behavior is unchanged; the new path requires explicit unresolved landing-ID
  mode and carries unresolved maint lineage into the full-chain composer.
- The transaction executor now builds a native MySQL
  `utf8mb4_0900_ai_ci` equality/range `FOR UPDATE` query for each incoming
  Armor landing identity before locked rederivation and rejects a row whose
  raw tuple differs while being collation-equivalent. Focused tests assert the
  query shape, fail-closed collision behavior, and executor ordering.
- The executor integration test now consumes the composed relation intent with
  real landing and maint plans and reaches terminal committed evidence using a
  bounded fake connection. It is mechanism evidence only; it is not a live DB
  write or runtime registration.
- Fresh related Node22 regression after the continuation: `1595 passed, 0
  failed, 0 skipped`, log `.local/logs/armor-full-chain-current-model-20260926.log`.
  The focused composition/intent/projection/transaction slice is included in
  that total. Syntax checks and `git diff --check` pass.
- Fresh authenticated read-only Phase 0 at
  `2026-09-26T03:56:01.973852700Z` returned HTTP 200; control is disabled,
  mode is `changed-only`, interval is 60 minutes, live attempts/claims are
  `0/0`, reconciler is healthy, H8 and V2 epoch are unchanged, and all eight
  domains are `blocked`. Historical last-sweep fields were read only and were
  not replayed.
- No scheduler control write, source probe, crawler/import, Redis write,
  packet/permit consumption, catalog registration, or business-table DML was
  performed. Retry-39/41/42, decisions 65/74/75, and L2 decisions 66–73 were
  not reused.

### Remaining A3/A4 gates

- Operation-specific packet/server/policy binding, governed catalog registration,
  locked rederivation against real DB snapshots, terminal DB/API equality, and
  fresh changed-row authorization remain open. Armor image revision/cache and
  secondary projection evidence blockers remain unchanged. Scheduler stays
  disabled until those gates are independently satisfied.

### Locked snapshot rederivation adapter (2026-09-26 continuation)

- Added the read-only `pipelines/relation/armor-canonical-locked-rederivation.mjs`
  adapter and its test. It reads the complete Armor-owned landing/maint/relation/
  projection baselines plus maint-item, image, effect, local-item and secondary
  projection dependencies from the transaction connection using explicit
  `FOR UPDATE`/`FOR SHARE` locks, then rebuilds the source-evidence transition,
  maint candidate, landing/maint intent, ID-independent projection candidate and
  full-chain intent. It returns only when the rederived full-chain hash equals the
  packet-bound intent hash; policy drift or any graph mismatch fails closed.
- The runner now uses this adapter by default when the governed packet is valid;
  a caller-supplied adapter remains an explicit test seam. The operation code
  bundle's static-import expansion therefore pins the adapter and all of its
  pure builders automatically. No packet, permit, scheduler mutation, source
  probe, Redis write or business-table DML occurred.
- TDD RED was observed as `ERR_MODULE_NOT_FOUND`; GREEN focused validation is
  `2/2` adapter tests plus the runner/catalog/manifest slice `79/79`. The fresh
  related Node22 regression is `1603 passed, 0 failed, 0 skipped`, log
  `.local/logs/armor-locked-rederivation-current-model-20260926.log`, and
  `git diff --check` passes. A real
  read-only transaction snapshot against the local stack returned landing `3`,
  maint items `6146`, maint Armor `63/175`, relation Armor `63/470/175`,
  projection Armor `63`, dependency effects `320`, empty secondary projections,
  local items `6159` and item images `25470`. Existing source evidence remains
  invalid for execution (legacy compatibility rows, missing revisions/cache), so
  no full-chain intent was generated.

### Image revision producer continuation (2026-09-26 14:08 CST)

- Resumed the same branch/worktree at `0f871e94`, no upstream or staged paths.
  Current inventory is 1599 paths (65 modified, 1534 untracked); the older 1584
  count in current.md predates the added full-chain/runner/adapter artifacts.
  Preserve all existing paths; no Git cleanup or commit is part of this slice.
- Fresh authenticated read-only preflight at `2026-09-26T06:08:31.552278964Z`
  confirms disabled/changed-only/60min, live attempts/claims 0/0, healthy
  reconciler, unchanged H8/epoch and eight blocked readiness domains. Backend
  PID592633 owns18102 with the recorded dual roots and scheduling=false; health
  is UP. No restart, scheduler/control or business write was needed.
- Root cause: `fetchWikiImageInfo()` does not request or return the upstream
  image-info timestamp, and `buildArmorSetImageRows()` hardcodes null revision.
  Repair scope is the shared helper, Armor image producer and their offline
  tests. Preserve per-file revisions through landing/maint; the multi-file
  collection has no honest single revision and stays null at payload level.
- Crawler progress review additionally requires a failed terminal write and
  canonical mirror for explicit progress paths before a live fetch. This slice
  uses temporary-root offline fixtures only, not source refresh or managed-image
  publication. Cache evidence, secondary projection scope and full runtime
  equality remain separate gates. Plan amended before implementation.

### Image revision repair validation and next boundary (2026-09-26 14:20 CST)

- Implemented only `pipelines/lib/wiki-item-utils.mjs`, the Armor image fetcher
  and their tests. Image-info requests include `timestamp`; return field
  `revisionTimestamp` feeds each Armor `sourceRevisionTimestamp`. Missing
  values remain null, and the collection revision remains null because it is
  not a single revisioned resource. No managed URL is fabricated.
- The CLI publishes progress before reading input/network, mirrors custom and
  environment progress paths to the canonical monitor file, and writes a fresh
  failed terminal payload while preserving the original failure. Offline CLI
  tests use temporary WORKTREE_ROOT/shared roots and stub only HTTP; the real
  request gate, JSON writers, locator and maint extractor run.
- TDD RED:6 expected failures (request missing timestamp, dropped row revision,
  dropped CLI revision, two absent progress mirrors, absent failure progress).
  GREEN:21/21 focused. The integration fixture was corrected to await the real
  async maint extractor and use its `{ rows }` return shape; production extractor
  behavior was unchanged. Logs: `.local/logs/armor-image-revision-{red,green}-20260926.log`.
- Expanded Node22 regression command: prior Armor/automation regression plus
  `pipelines/lib/wiki-item-utils.test.mjs`, `pipelines/fetch/fetch-wiki-armor*.test.mjs`,
  `pipelines/maint/sync-landing-to-maint.test.mjs`,
  `pipelines/relation/run-armor-canonical-ingestion.test.mjs`, and the
  `run-wiki-sync`/`run-image-sync` tests. Result1725 passed,0 failed,1 existing
  `shimmer_raw` extractor skip; log
  `.local/logs/armor-image-revision-regression-20260926.log`.
- `mvn -Dtest=CrawlerMonitorServiceImplTest,AdminCrawlerMonitorControllerTest test`
  from services/catalog-api passed328/328; admin crawler-monitor page contract
  passed58/58. Logs: `.local/logs/armor-image-monitor-{maven,ui}-20260926.log`.
  Both modified production files pass Node22 syntax checks; `git diff --check`
  passes. No full-stack quality gate or live crawler was run.
- Current-model serial spec/quality review: repaired slice meets its tests and
  preserves existing fields, rate limiting and cache boundary. No new model or
  subagent review was dispatched. This is self-review, not independent runtime
  approval. No spec fact changes; ordinary bugfix/next-gate details stay here.
- Read-only MySQL transaction at06:15:55Z verifies the same server UUID:
  Armor landings are still one module/two image `legacy_compat` rows; maint
  images175 with175 missing revisions and1 missing cache; both secondary
  projection counts0. Public Armor8 HTTP200 has empty effects and
  pieceEffects256/257/258. Source-producer repair did not repair existing data.
- Remaining source-contract finding: the raw producer can emit `imageRole=part`,
  while both bounded maint/relation candidates currently permit only
  male/female/demo/other. Reconcile this identity in the approved Armor image
  slice before freezing a valid candidate; do not silently drop or relabel rows.
  Existing canonical-image-sync also pins item inputs, not this Armor raw file;
  CLI scope support alone is not a frozen Armor authorization bundle.
- A6's proposed secondary projection amendment is still not granted. Request
  existing Armor-member keys -> projection_item_armor_attributes and exact
  item-owned armor_attribute_cell effects -> projection_equipment_effect_attributes,
  preserving unrelated rows/IDs, with governed insert bindings, fresh packet
  and terminal DB/API equality. No local items, new set-effect source, DDL or
  H8/scheduler widening is included. Stop before implementing/applying this
  expanded ownership until the user confirms it.
- Catalog reconciliation: current code already registers canonical-armor-ingestion
  and its runner/manifest tests pass. Historical “unregistered” statements above
  apply to earlier checkpoints only. The shared source-helper change invalidates
  any previously captured unconsumed code bundle; capture a fresh chain after
  source/dependency gates, never reuse Retry39/41/42 or consumed decisions.
- Source/test SHA256 (without prefix): wiki-item-utils
  `d6d27d3edac134b88cb0be2d18e299b9a004a6633907f6f20a973d180492b9f5` /
  `098c12b64b07ec631ba1fd7ec758205ec595cfb3b09c1554418dc74d83113b6e`;
  Armor image fetcher
  `d1947cd95cd385ddeca8228c971157514d8e87fbe3f41f8407dabc7021b8d746` /
  `91a63b99d9b482907a270b5c6931038d4ad5d7f8aa7f48f7a6eb41b3f7acecb7`.
  See git for code-level diff details. Entry remains active. No scheduler,
  source probe, real crawler/import, Redis, permit consumption, business DML,
  stage/commit/push or service restart occurred.
