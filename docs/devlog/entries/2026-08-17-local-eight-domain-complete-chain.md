# Local Eight-Domain Complete Chain

## Status

`active`

## Context

- User goal: first run the remaining eight-domain chain locally and finish the
  missing downstream paths, including NPC/Boss loot; provide a Chinese map of
  supplementary-domain responsibilities, Item source providers, relation
  tables, and admission gates before runtime execution.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Related plans: `docs/superpowers/plans/2026-08-17-local-eight-domain-complete-chain.md` (English), `docs/superpowers/plans/2026-08-17-local-eight-domain-complete-chain.zh.md` (中文), `docs/superpowers/plans/2026-08-18-local-data-chain-closure.md` (English), `docs/superpowers/plans/2026-08-18-local-data-chain-closure.zh.md` (中文)
- Related prior entries: `docs/devlog/entries/2026-08-15-dual-path-domain-ingestion-acceptance.md`, `docs/devlog/entries/2026-08-16-shimmer-evidence-reconciliation.md`

## Direction / Decisions

- The local release target is the three-database chain
  `terria_v1_local`/`terria_v1_maint`/`terria_v1_relation`, not production.
- Work is serial by owner scope: base domains first, then non-boss loot, Boss
  loot, images, Projectile source relations, and final API/readiness checks.
- Items and Projectiles must leave dry-run only; loot must remain split into
  disjoint non-boss and Boss partitions.
- Every write requires a fresh frozen bundle, operation-level authorization,
  transaction/readback evidence, and monitor-visible progress. No direct SQL
  repair, no implicit Boss-loot pipeline, and no L2 promotion in this plan.

## Scope

- Data: eight base domains, NPC/Boss loot, Item acquisition/source/drop relations, item image lineage, Projectile item/NPC source relations, relation/projection/local materialization.
- Crawler: bounded source refreshes with canonical `pipelines/**` paths and V2 progress contracts.
- Backend/API: read-only parity and operation/monitor contracts needed to prove the chain.
- Docs/process: this plan, the Chinese relationship map at
  `docs/project-governance/reference/2026-08-17-supplementary-domains-item-source-relation-map.zh.md`, this active devlog entry, dated runtime evidence, and final closeout.
- Out of scope: production databases, unattended L2, article/UI redesign, Redis reset, Windows services, and unrelated historical data cleanup.

## Current Blockers

### 2026-08-18 Closure Plan Handoff

- The remaining work is governed by `docs/superpowers/plans/2026-08-18-local-data-chain-closure.md` and its Chinese counterpart. It is local-only: existing standardized inputs, frozen bundles, and the three local databases are the only source evidence for this run.
- The local acceptance run may pass `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false` to the loopback backend only. The plan adds a loopback guard, records the override in the local-stack manifest, and restores the default after testing; production defaults remain unchanged.
- The latest runtime parity evidence is `31` blockers: `19` API gaps and `12` duplicate/polluted API rows. The latest closure evidence has zero domain blockers and zero open loot audits, but remains blocked on runtime parity and relation-health warning.
- If any lane needs Wiki/Steam/forum data, execution stops before the request and reports the exact missing local artifact to the user for approval.

- The eight base domains no longer have an automatic-apply blocker: each policy
  is `L1/ACTIVE`, the scheduler is `L1/ACTIVE`, and Items/Projectiles now have
  separate ownership-fenced real applies rather than the superseded `DRY_RUN`
  reports.
- Loot closure reports retain open unresolved/ambiguous/polluted/rejected evidence, including the recorded 287 open loot audits.
- Item acquisition/source closure is an explicit acceptance dependency: `maint_item_sources`/`maint_npc_crawler_facts` → `relation.item_source_facts`/`item_source_details`/`item_npc_loot_relations` → `local.item_acquisition_sources`/`npc_loot_entries`, with lineage and parity checks. This is documented in both language plans but has not been executed yet.
- The fresh cross-DB audit preserves `6056` local Item acquisition rows without
  a maint/relation trace. It is a relation/loot closure warning, not a reason
  to re-run either base-domain apply.
- Existing Shimmer automatic verification is idempotent reconciliation of generation 8, not a fresh 8→9 write.
- Recovered (2026-08-17 15:14 CST): the earlier shared-progress conflict is
  closed. Its in-flight NPC batch reached terminal state, a fresh coverage
  audit ran, and subsequent batches own only
  `data/generated/wiki-sync-progress.latest.json`. The periodic source-update
  monitor writes its separate `source-update-monitor-progress.latest.json`.
  No crawler was stopped or restarted, and no loot, relation, image, or
  database apply has occurred during recovery.

## Validation

- Read-only inspection completed: current governance, active devlog, source/progress plans, canonical operation catalog, loot importers/audits, image plans, and Projectile relation plan.
- New plan self-review completed: canonical `pipelines/` paths, owner-scope fences, rollback gates, and no-L2 boundary are explicit.
- Relationship-map validation passed: `node --test pipelines/automation/table-ownership-matrix.test.mjs pipelines/relation/item-source-relation-processor.test.mjs pipelines/relation/sync-relation-to-local-compat-tables.test.mjs` (73/73), plus `git diff --check` and canonical-path/term consistency scans.
- The 15-domain clarification was verified against the crawler action registry,
  auto-dispatch set, 10-domain sample matrix, and 13-domain acceptance registry;
  the focused domain manifest/orchestration tests pass 32/32.
- The initial planning phase made no writes; the eight-domain milestone then
  ran through fresh operation authorization and terminal progress. The final
  cross-DB check was read-only.

## Result

- Completed: local complete-chain implementation plan and task boundaries.
- Completed: explicit Item acquisition/source/drop relation scope in the English and Chinese plans and this devlog.
- Completed: Chinese reference map separating the Boss/Shimmer/Audio
  supplementary domains from Item/NPC/Boss source providers, with the
  maint/relation/local table flow and no-cross-scope admission gates.
- Completed: the same reference map now distinguishes the crawler monitor's
  15 registered domain keys from the 8 auto-dispatch domains, 10-domain sample
  matrix, and 13-domain acceptance registry.
- Completed: the reference map records the automation boundary: 8 source/L1
  lanes may be changed-only dispatched, while relation, loot, support, and
  destructive database apply remain governed/manual.
- Completed: the reference map documents why the remaining 7 domains are not
  unattended apply candidates yet: shared owner partitions, unresolved source
  evidence, multi-table projection, ordering, and destructive compatibility
  sync risk.
- Completed: Task 0 runtime baseline. Local MySQL (`13306`), Redis (`6380`),
  and backend (`18091`) are healthy; no crawler/import writer was active at
  the start. Cross-DB integrity before and after the eight local operations is
  `9 pass / 0 blocking / 1 warning`.
- Completed: all eight local automatic lanes have terminal L1 operation records
  and read back as `L1/ACTIVE`. Items run
  `items_l1_auto_0dfbd093f42b072192297f2a727d9c4d` performed the real local
  `6131`-record apply (`2` updated, `6129` skipped, `0` errors); Projectiles
  run `projectiles_l1_auto_4d46fa934fc03769178dfde4a5b7508e` performed the
  real local `1111`-record apply (`1110` updated, `1` skipped, `0` errors).
  NPCs reconciled `npcs_l1_auto_fcc0f28adaaf4d0490675533d2c6cd00`; Armor Sets
  applied `63` sets and `501` members idempotently; Buffs applied `388` rows
  without inventing the `27` unresolved source-item links; Bosses applied `33`
  groups; Audio reconciled its committed L1 input. Shimmer's prior L1
  reconciliation retains generation `8` with no duplicate write; a separate
  changed-source monitor attempt is currently active in `resolve_langlinks`
  (`4/7`, 819 frozen titles, zero failures) and must be allowed to reach its own
  terminal progress.
- Completed: the scheduler reactivation decision
  `automation-crawler-v2-scheduler-reactivation-20260817-01` restored
  `crawler_v2_scheduler` to `L1/ACTIVE` with policy-set hash
  `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`.
- Completed: repaired local Shimmer reuse. A local source run now obtains the
  exact consumed source hash from the canonical manifest and skips the remote
  pre/post probe; it remains no-acknowledgement and reconciles the matching
  committed run.
- Completed: added a source-update monitor heartbeat which republishes the
  active probe payload every 15 seconds while long bounded requests run.
- Completed: after serialized recovery, NPC coverage batches 7 and 8 each
  reached `25/25` passing terminal audits. The fresh coverage audit now records
  `248/511` already crawled targets and `242` remaining eligible targets.
- Completed: the remaining `242` targets completed in nine further bounded
  batches (`25` each except the final `17`); the terminal coverage audit records
  `511` total targets and `0` eligible targets.
- Blocked: the formal canonical NPC owner path accepts exactly `25` frozen
  evidence pairs, while this coverage sweep has no governed producer for the
  corresponding target manifests. The crawler outputs cannot be promoted by
  manually composing input or by consuming the retired NPC bridge. The fresh
  loot-chain audit therefore remains blocked at `519` source gaps until the
  missing canonical landing/owner-phase preparation is implemented and
  independently validated.
- Not completed: NPC/Boss loot, Item source/acquisition relations and lineage,
  Item image lineage, Projectile source relations, projection/API parity, and
  L2 promotion remain outside the completed eight-domain automation milestone.

## Residual Risks

- Full Item source refresh is a long bounded operation and must use detached progress with a frozen identity list.
- Non-boss loot importer must be proven not to delete outside the frozen owner scope before any apply.
- NPC/projectile image managed-prefix cleanup may remain a separate blocker if source coverage is incomplete.
- Current worktree contains protected Shimmer and authorization artifacts; they must remain un-staged unless explicitly included in a later focused commit.
- The source monitor's old process cannot load the heartbeat repair without a
  stack restart. The completed local L1 operation records remain valid, but a
  future daemon-observation run must restart through the canonical scripts and
  verify heartbeat/retry behavior without direct Redis or SQL mutation.

## Follow-up

- Owner: Codex; continue serialized bounded NPC coverage batches from the
- completed coverage is now a prerequisite rather than active work. Implement
  and validate the canonical frozen-target-manifest producer before any NPC
  crawler fact or loot apply; then rerun the source inventory, loot-chain and
  closure audits before any loot write. Keep Item image and Projectile source
  relations separate. If daemon behavior is in scope, obtain local-stack
  runtime secrets, restart through the canonical Bash scripts, and observe
  heartbeat/retry handling without direct Redis or SQL mutation.

## Validation Evidence

- `node --test pipelines/monitor/source-update-progress-heartbeat.test.mjs pipelines/monitor/check-source-updates.test.mjs pipelines/automation/prepare-supplementary-domain-l1-preview.test.mjs pipelines/automation/run-supplementary-domain-automatic-operation.test.mjs pipelines/automation/run-base-domain-automatic-operation.test.mjs pipelines/automation/capability-manifest.test.mjs` — 59/59 pass.
- `node --test pipelines/audit/cross-db-referential-integrity.test.mjs` — 8/8 pass, including the explicit `TERRAPEDIA_DB_*` local connection override.
- Final focused automation suite — 118/118 pass across the cross-DB audit,
  eight-domain operation contracts, L1 runners/policies, canonical manifests,
  and standardized importer. The manifest fixture now mirrors the maintained
  `pipelines/` root while preserving projection-test isolation.
- `reports/runtime/local-eight-domain-complete-chain/20260817/cross-db-after-eight-auto-final.json` — 9 pass, 0 blocking, 1 Item-source relation warning (`6056`).
- `data/generated/domain-source-{items,npcs,projectiles,armor-sets,buffs,audio,bosses,shimmer}-progress.latest.json` — seven latest files are terminal `completed`; the active Shimmer changed-source attempt is monitor-visible at `resolve_langlinks` and has zero failures at this handoff.
- `data/wiki-crawler/report/npc/batch-summary.latest.json` — latest bounded
  batch completed with `25/25` pass, `0` warning, `0` failure.
- `data/wiki-crawler/report/npc/coverage-audit.latest.json` — fresh post-batch
  audit: `511` targets, `248` already crawled, `242` eligible for later batches.
- Terminal `data/wiki-crawler/report/npc/coverage-audit.latest.json` — `511`
  targets, `511` already crawled, `0` eligible targets.
- `reports/runtime/local-eight-domain-complete-chain/20260817/npc-loot-domain-after-full-coverage.json`
  — audit is intentionally non-zero (`blocked`, `519` source gaps), proving
  crawler completion did not bypass canonical landing/owner-phase requirements.

## Residual Closure Repair And Final Runtime Verification (2026-08-19)

- The exact residual scope authorized by the user was
  `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`.
  The governed operation retired old relation rows `128/129`, updated
  projections `179/83` to accepted Nazar identities, and retired old local rows
  `81872/81873`; accepted relation/local/source rows remain. Result:
  `reports/authorization/canonical/canonical-npc-projection-text-identity-residual-repair.result.json`.
  No external request or direct SQL was used.
- Fresh parity evidence is
  `reports/runtime/local-data-chain-closure/20260819/post-final/npc-loot-runtime-parity-after-residual-repair.json`:
  `418/418` trusted direct loot, `blockingCount=0`, and `1542` rows at each
  relation/projection/local/API stage. The coordinated relation + projection +
  local treatment was required; projection-only retirement would have left
  stale identities and lineage-blind compatibility rows.
- Final closure evidence is
  `reports/runtime/local-data-chain-closure/20260819/post-final/npc-loot-closure-final-after-normal-rate.json`.
  It remains blocked by independent domain evidence (`17` `unclassifiedZero`,
  `releaseBlockingCount=18`, `source_coverage_unavailable`), while runtime
  blockers and open loot audits are zero. Relation health remains warning-only
  with zero blocking checks.
- The fast local stack was stopped and restarted with ordinary protection;
  `reports/local-start/run-manifest.json` records
  `backend.httpRateLimitEnabled=true`. Ordinary smoke recorded HTTP `200` for
  backend Item/category and admin root/proxy endpoints. Managed-image probing
  remains blocked because the configured image origin is unreachable.
- Focused residual preview/repair tests pass `9/9`, combined
  manifest/catalog/capability tests pass `63/63`, and `node --check`, JSON
  parsing, and `git diff --check` pass. The
  entry remains `active`; item-source lineage, image readiness, and domain
  evidence are still independent follow-up blockers. No commit, staging, stash,
  cleanup, or discard was performed.

## Commits

- Plan/devlog documentation commit pending.

## Session Handoff: 2026-08-18

### Observed

- Repository/worktree: `/home/lolben/TerraPedia`.
- Branch: `feat/supplementary-domains-readiness`.
- HEAD: `2644d411d2ff48be41b6709dca1bb891cb3d2452` (`docs(devlog): sync shimmer closeout state`).
- Upstream: `origin/feat/supplementary-domains-readiness`; local branch is ahead by `19` commits.
- Worktree has no staged changes. It contains existing tracked modifications across crawler, audit, automation, relation, monitor, authorization, and generated paths, plus `335` untracked paths reported by `git ls-files --others --exclude-standard`. These paths are not to be discarded, stashed, or broadly staged.
- `git diff --check` completed without output/errors during handoff preparation.

### Recorded

- Bilingual residual-closure plan: `docs/superpowers/plans/2026-08-18-local-data-chain-closure.md` and `docs/superpowers/plans/2026-08-18-local-data-chain-closure.zh.md`.
- Current index points to that plan and records the local-only boundary, loopback-only API rate-limit override, and external-request approval gate.
- Latest parsed runtime report: `reports/audit/npc-loot-runtime-parity-2026-08-17.json`, generated `2026-08-17T18:00:21.988Z`, status `blocked`, `418` NPCs, `387` trusted, `19` API gaps, `12` duplicate/polluted, `31` blockers.
- Latest parsed closure report: `reports/audit/npc-loot-closure-smoke-check-2026-08-17.json`, generated `2026-08-17T18:00:09.472Z`, `0` domain blockers, `0` open loot audits, `31` runtime blockers, relation health `warning`.
- The plan and devlog explicitly require stopping before any Wiki/Steam/forum request and reporting the missing local artifact to the user first.

### Unknown / Not Run In This Handoff

- No fresh full parity, closure, database audit, backend test, frontend check, or quality gate was run during handoff preparation; the report values above were read from existing JSON evidence.
- The new fast-local API option, local-stack manifest recording, NPC API deduplication/segmented semantics repair, Item lineage reconciliation, loot apply, image lineage, and Projectile relation work have not been implemented or executed.
- Current live service/process state was not treated as proven by this handoff; the next session must perform the plan's read-only runtime baseline before changing behavior.

### Next Safe Action

1. Read `docs/superpowers/plans/2026-08-18-local-data-chain-closure.md` and `.zh.md`, then execute Task 0 and Task 1 only.
2. Keep the backend/API limiter disabled only for the explicit loopback acceptance run; record the manifest flag and restore the default afterward.
3. Do not start a crawler, external source monitor, import, relation apply, loot apply, image download, SQL mutation, commit, push, reset, stash, or cleanup until the corresponding plan gate and authorization are present.

### Parallel Execution Coordination: 2026-08-18

- Coordinator: Codex (`/home/lolben/TerraPedia`); only the coordinator may edit
  `docs/devlog/current.md`, start/stop the local stack, or merge cross-agent
  findings.
- Task 0 owner: delegated implementation agent; allowed files are
  `pipelines/audit/npc-loot-runtime-parity-audit.mjs`, its focused test,
  `platform/local/start-local-stack.sh`, `platform/local/local-stack.test.mjs`,
  and `platform/local/config/README.md`; no crawler, external request, database
  write, commit, or unrelated file edits. Return changed paths, tests, and
  unresolved concerns.
- Task 1 owner: delegated read-only audit agent after Task 0 review; allowed
  outputs are a date-scoped report root under
  `reports/runtime/local-data-chain-closure/` plus a baseline summary. It may
  run only read-only audits and must stop/report any external-evidence lane;
  it must not edit source code, run crawler/import/apply, write SQL, or commit.
- Dependency/serialization: Task 1 parity execution depends on Task 0's
  loopback flag and local-stack manifest contract. The coordinator owns service
  lifecycle and integrated validation; agents must not start/stop the stack.

### Handoff Validation

- Passed: repository fact commands, branch/HEAD/upstream inspection, report JSON parsing, and `git diff --check`.
- Not run: implementation tests and runtime gates; status remains `active` and the next session must not claim closure until fresh validation is recorded.

## Closure Plan Execution: Task 0 And Task 1 (2026-08-18)

### Task 0 Result

- Added the loopback-only `--fast-local-api` parity option and local-stack
  `backend.httpRateLimitEnabled` manifest field. The API option validates
  `localhost`, `127.0.0.1`, and `[::1]` before forcing interval `0`; remote
  hosts fail closed with the specified error. Existing application defaults
  remain unchanged.
- Focused validation passed: parity Node suite `21/21`, local-stack suite
  `36/36`, combined `57/57`, `bash -n platform/local/start-local-stack.sh`,
  and targeted `git diff --check`.
- The first runtime restart attempt was blocked by the example admin token
  secret being 30 characters. The coordinator retried with process-scoped
  temporary secrets only; no credential file was edited. Flyway reported the
  local schema already at version `58` with no migration necessary.
- Runtime acceptance then passed with manifest run `20260818-035206`:
  `backend.httpRateLimitEnabled=false`; 50 loopback NPC aggregate requests
  returned `200`, with `0` responses at `429`. Evidence:
  `reports/runtime/local-data-chain-closure/20260818/task0-local-stack-runtime.json`.
- After the acceptance run, the coordinator restarted the stack with the
  ordinary default and verified manifest run `20260818-040556` reports
  `backend.httpRateLimitEnabled=true`.

### Task 1 Result

- Fresh read-only reports were generated under
  `reports/runtime/local-data-chain-closure/20260818/`, with relation health
  at `reports/relation/relation-health-20260818.json`.
- The first cross-DB invocation used its historical default port `3306` and
  produced no report; the coordinator retried with the verified local port
  `13306`, after which the report and all dependent lanes were generated. The
  retry and classification are preserved in
  `task1-baseline-summary.json`.
- Cross-DB remains `9 pass / 1 warning / 0 blocking`; NPC source coverage and
  domain-loot chain both pass with zero release blockers. NPC runtime parity
  remains blocked at `418` NPCs (`387` trusted, `19` API gaps, `12`
  duplicate/polluted), and closure remains blocked only by those `31` runtime
  rows plus relation-health warning. Item source closure is explicitly
  read-only (`dbWritesPerformed=false`, `crawlerOrFetchPerformed=false`) with
  `269` dry-run candidates and `276` planned rows awaiting governed apply.
- Classification and lane stop evidence are recorded in
  `reports/runtime/local-data-chain-closure/20260818/baseline-classification.json`
  and the agent handoff summary at
  `reports/runtime/local-data-chain-closure/20260818/task1-baseline-summary.json`.
  External-evidence-blocked lanes are the `113` unextracted group-page
  variants and `432` maint backfill candidates that recommend `crawl_npc_page`;
  no external request was made.

### Validation Evidence

- `bash ./platform/local/verify-local-stack.sh --skip-front` — passed after
  the loopback acceptance restart.
- `node --test pipelines/audit/npc-loot-runtime-parity-audit.test.mjs platform/local/local-stack.test.mjs` — `57/57` passed.
- All seven Task 1 JSON reports parsed successfully; no crawler/import writer
  was observed before the baseline run, and no database write was performed.

### Next Safe Action

- Proceed only to Task 2 API runtime parity repair using existing local
  relation/projection/local evidence. Keep the `432` crawl candidates stopped
  until the user approves external evidence or supplies a new local artifact.

### Task 2 Root-Cause Investigation: 2026-08-18

- Read-only SQL/API comparison confirmed the runtime parity pattern. Local
  `npc_loot_entries` has one `npc_drop` row set per segmented NPC, while
  `getNpcById` resolves body/tail records to the head representative. The
  aggregate controller then queries loot by that representative ID and emits
  the head identity for every segment. This creates the `api_gap` rows for
  body/tail and repeats head rows once per segment.
- The service's aggregate loot query does not merge `lootItemsJson`; the
  canonical source for this repair is the structured `npc_loot_entries` query
  filtered to `drop_source_kind IS NULL OR drop_source_kind = 'npc_drop'`.
  Projection JSON remains metadata on the NPC DTO and must not become a second
  loot row path.
- Representative examples captured from the local stack: `GiantWormBody`
  and `GiantWormTail` returned zero API loot while `GiantWormHead` was returned
  for each target; `BloodEelHead`/`BloodEelBody` showed the same identity
  collapse. No upstream or external evidence is needed for this code repair.

### Closure Plan Execution: Task 2-7 (2026-08-18)

#### Task 2 Result

- Aggregate base lookup now preserves the requested segmented NPC identity;
  structured `npc_loot_entries` remains the only loot source and
  `lootItemsJson` remains DTO metadata. Shop and buff modules continue to use
  the representative NPC ID, while loot uses the requested segment ID.
- TDD evidence: the new segment-module regression test failed before the
  controller fix and passed after it. Focused Spring tests now pass `48/48`
  (`PublicNpcAggregateControllerTest` 10 and `PublicNpcServiceImplImageTest`
  38); the Node parity suite is now `22/22`, including the combined
  segmented/duplicate-head fixture covering structured API and legacy JSON.
- Fresh runtime evidence after restart:
  `reports/runtime/local-data-chain-closure/20260818/npc-loot-runtime-task2-final.json`.
  All `418` NPCs were queried with `--fast-local-api`; `416` are
  `trusted_direct_loot`, `api_gap=0`, and two canonical duplicate blockers
  remain: `Clothier/RedHat` and `DyeTrader/DyeTradersScimitar`. Each duplicate
  is present in both relation and local rows under distinct source keys/IDs;
  the API intentionally exposes both structured rows rather than hiding the
  pollution with a runtime dedupe.
- Real endpoint checks confirmed `GiantWormHead/Body/Tail` retain their own
  `sourceNpcId`; representative shop/buff behavior was checked with
  `SkeletronHand`, `GolemHead`, and `MoonLordHead`.

#### Task 3 Result (Read Only)

- Fresh item-source reports:
  `items-without-active-sources-task3.json`,
  `item-source-evidence-layers-task3.json`, and
  `item-source-closure-task3.json` under the dated runtime root.
- No ordinary source rows are eligible for an unapproved write:
  `269` candidates, `276` planned duplicates, `0` dry-run source rows, and
  `dbWritesPerformed=false`. Remaining local-only classifications include
  one NPC projection gap (`CenxsWings`), nine biome projection rows, and
  seventeen raw candidates not projected. External-evidence lanes remain
  stopped.
- A treatment recheck records the same fail-closed result at
  `reports/runtime/local-data-chain-closure/20260818/item-source-remaining-treatment-task3-recheck.json`:
  `292` focused candidates, `276` planned rows all exact duplicates,
  `toInsert=0`, and `10` projection-required rows (CenxsWings plus nine
  Biome rows). CenxsWings has no current maint/relation source lineage; a
  historical generated town-NPC import is not replayable evidence.

#### Tasks 4-6 Result (Read Only)

- NPC correctness and gap-closure audits both pass with zero release gaps.
- Projectile relation readiness passes using existing local evidence; the
  unresolved `105/105` projectile image backfill metric remains non-blocking.
- Image lineage is not ready for apply: only bosses are contract-ready;
  item/NPC/projectile/armor/biome projections still lack managed image values
  or required lineage tables. No image apply or download was run.
- Image lineage was rechecked with both legacy (`9000`) and canonical (`19000`)
  managed prefixes in the local environment:
  `reports/runtime/local-data-chain-closure/20260818/image-source-lineage-task5-compat-recheck.json`.
  The corrected result is `4/7` entity types ready (NPC `758/758`, Boss `33/33`,
  Projectile `1110/1110`, Armor `88/88`). Remaining blockers are item
  canonical projection authorization evidence, empty Buff projection image
  values, and missing Biome image lineage tables/field. No apply or download ran.

#### Task 7 Result

- Fresh closure report:
  `reports/runtime/local-data-chain-closure/20260818/npc-loot-closure-task7.json`;
  closure is blocked only by the two runtime duplicate rows, with relation
  health `warning`, zero domain blockers, and zero open loot audits.
- Fresh cross-DB report:
  `reports/runtime/local-data-chain-closure/20260818/cross-db-task7.json`;
  `9 pass / 1 warning / 0 blocking`, preserving the `6056` acquisition-lineage
  warning.
- Fast loopback mode was then removed from the running stack. The ordinary
  manifest reports `backend.httpRateLimitEnabled=true`, and a final single
  NPC aggregate smoke returned `200`.

#### Duplicate Governance Audit (2026-08-18)

- Read-only authorization inventory report:
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-governance-audit.json`
  (`sha256:33d6666bda2e293961dd4d98a45d45e8e868eac988057079711f776b71ea1c84`).
  Verdict: `blocked_no_current_exact_authorization`.
- The report binds both source facts and all affected rows: `Clothier/RedHat`
  relation IDs `623/1543`, local IDs `82367/83287`; `DyeTrader/DyeTradersScimitar`
  relation IDs `755/1544`, local IDs `82499/83288`. Each pair has distinct
  source-fact and relation-record keys, so API dedupe or direct deletion would
  conceal lineage rather than repair it.
- Current exact request/owner-input/packet/bundle/preview/readback counts are
  all zero. Historical non-boss and Boss decisions were consumed and own whole
  partitions, not these rows. A new exact owner-scope preview and explicit
  authorization are required before any governed apply/readback can be considered.
- A review-only frozen preview is now recorded at
  `reports/runtime/local-data-chain-closure/20260818/npc-duplicate-owner-scope-preview.json`
  (`sha256:8f042c45183e8a80253396c071326a4b635a058d74372d9bb705213c881f5ccf`).
  It freezes both source lineages, projection context, relation IDs `623/1543/755/1544`,
  and local IDs `82367/83287/82499/83288`, with `applyAllowed=false` and no
  selected canonical row. This is review evidence only; it is not an authorization
  packet and cannot be dispatched.

#### Continuation Verification (2026-08-18)

- Fresh NPC/closure/domain Node suites pass `107/107`.
- The lineage and owner-phase contract suite is `17/18`; the single failure
  is the fail-closed missing artifact
  `reports/authorization/canonical/canonical-npc-apply.input.json`. It was not
  synthesized or bypassed.
- Preview JSON parsing, `git diff --check`, and empty staged diff remain clean.

#### Final Contract Gate (2026-08-18)

- `bash ./platform/local/quality-gate.sh --skip-front --skip-admin` ran the
  local data workflow contract suite. Result: `327` tests, `322` passed, `5`
  failed. All five failures are fail-closed missing-governance artifacts:
  `canonical-item-group-bootstrap.result.json`,
  `canonical-npc-apply.input.json`, and the dependent NPC ownership fixture;
  no production assertion was bypassed and no database write occurred.
- This gate is therefore not a green completion proof. The missing artifacts
  must be recreated only by their governed authorization workflow in a future
  approved task; they were not synthesized during this run.

#### Post-Quarantine Runtime Verification (2026-08-18)

- The authorized exact-row quarantine completed for the two crawler-overlap
  identities. Eight rows were soft-disabled: two source facts, two source
  details, two relation rows (`1543/1544`), and two local rows (`83287/83288`).
  The generated-bundle survivors (`623/755`, local `82367/82499`) remain active.
  Readback is recorded in
  `reports/authorization/canonical/canonical-npc-duplicate-quarantine.result.json`;
  every affected count is `1` and each identity has one active local row.
- Source precedence tests now pass `57/57`: generated
  `npc_item_relations_bundle` rows remain authoritative and crawler overlap is
  superseded evidence. The focused quarantine/parity/closure/domain suites pass
  `203/203` across the executed Node groups; Spring focused tests pass `48/48`.
- A real `sync-maint-to-relation` `scopes=npc, apply=false` dry run was also
  executed against the three local databases through the injected `13306`
  connection config. It completed read-only (`apply=false`); the active relation
  readback still contains no active rows `1543/1544`, so the precedence rule did
  not rematerialize the quarantined crawler overlap. The dry run emitted its
  existing unresolved source inventory only; no relation report or database
  mutation was accepted.
- Fresh loopback parity after the write is green: `418/418` trusted direct loot,
  `0` API gaps, `0` duplicate/polluted rows, and `1542` rows in each relation,
  projection, local, and API stage. Evidence:
  `reports/runtime/local-data-chain-closure/20260818/post-quarantine/npc-loot-runtime-parity.json`.
- Fresh closure smoke is `pass` with zero domain/runtime blockers and zero open
  loot audits. Relation-health remains warning-only (`21 pass / 1 warning / 6
  info / 0 blocking`), while cross-DB remains `9 pass / 1 warning / 0 blocking`.
  Item-source closure is still read-only (`269` candidates, `276` duplicates,
  `0` insertable rows, `17` projection rows); image readiness is not green.
- Fast API mode was temporary. The local stack was restarted with ordinary
  protection and the final manifest reports `httpRateLimitEnabled=true`. Basic
  backend/admin smoke endpoints returned `200`; the managed-image lane was
  stopped after the configured image origin proved unreachable. No crawler,
  external request, additional SQL write, staging, commit, or cleanup occurred.

#### Boundaries And Next Action

- No crawler, Wiki/Steam/forum request, import/apply beyond the authorized exact
  quarantine, image apply, additional direct SQL write, commit, staging, cleanup,
  or discard was performed.
- The duplicate runtime blocker is cleared. The next safe lane is the existing
  item-source/image governance work: obtain explicit evidence/authorization for
  the remaining projection and image gaps, then rerun the final gate. Keep the
  plan active until those independent blockers and the fail-closed quality-gate
  fixtures are resolved; do not reuse historical decisions or request external
  evidence without user approval.

#### Low-Pressure External Evidence Extension (2026-08-18)

- User authorization changed the previous external-request stop rule for this
  task only: bounded Wiki evidence refresh is allowed to close the two known
  NPC evidence gaps. The hard operating condition is no `429`; serial low-rate
  requests, jitter, shared state, and `Retry-After` cooldown handling are
  required before a real run.
- Scope is limited to the `113` group-page variant rows and the `432` open
  maint backfill candidates (`185` NPC item and `247` NPC projectile rows),
  deduplicated by real Wiki page title. It is an evidence-only crawler lane:
  raw/normalized/progress/report writes are permitted, while database writes,
  relation/import apply, direct SQL, image download, ordinary Item-source
  writes, `CenxsWings`, staging, commit, cleanup, and discard remain out of
  scope.
- Before external traffic, add focused request-gate coverage for immediate
  `429` stop and persisted `Retry-After` cooldown, generate a frozen target
  manifest, verify one-page monitor-visible smoke, then use a detached serial
  crawler. On any `429`, stop that batch and report it; do not retry the same
  request in the batch.

#### External Refresh Result (2026-08-18)

- Request-gate tests pass `14/14`; the production gate now stops immediately
  on `429` and persists `Retry-After` cooldown. The frozen target manifest is
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-target-manifest.json`
  (`sha256:f8fde04e5cd413d2b8bc44444219223b32e961e02b1d376fde8c296a60d17c14`).
  Current evidence resolved `113` group-page rows and `368` unique open
  candidate keys into `299` deduplicated Wiki pages.
- A one-page smoke passed, then the detached serial crawler completed `299/299`.
  Shared gate evidence is `0` observed `429`, unchanged throttle count, and no
  cooldown. All `299` normalized/canonical/audit outputs and terminal progress
  are under `reports/runtime/local-data-chain-closure/20260818/external-refresh/`.
- The read-only freeze is
  `reports/runtime/local-data-chain-closure/20260818/external-refresh-evidence-freeze.json`
  (`sha256:b2eb6df8053c34e74a6bb40d2a5d0a1e876faf7192c901011910f751e120e259`).
  Audits are `295 pass / 4 warn / 0 fail`; bridge matching has `0` unmatched
  crawler records but `20` conflict samples; the candidate bundle has `1269`
  records and `357` open candidates (`116` Item, `241` Projectile). This is
  evidence only (`applyAllowed=false`); no DB write or relation/import apply ran.
- A follow-up bridge-only recheck found the `20` conflict samples were caused by
  expanded shared-page members retaining page-wide infobox IDs, not by a
  relation or loot identity collision. `matchNpcBridgeRecords` now prioritizes
  a unique expanded `groupMember` name before page-wide auto-ID matching. The
  recheck output
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/`
  reports
  `306` crawler records, `0` unmatched, and `0` conflict samples; the targeted
  bridge/crawler suite is `41/41`. The original freeze remains unchanged and
  still has `applyAllowed=false`.
- The four parser warnings remain evidence-only warnings by classification:
  `Cattiva` and `Foxparks` are item/minion pages with embedded NPC infoboxes,
  `The Torch God` is a domain-separated event reward page, and `Mimics` is a
  valid multi-infobox group page with scoped loot. No generic parser suppression
  or ordinary NPC relation promotion was made.
  The read-only owner-scope preview
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/npc-relation-owner-scope-preview.json`
  contains `1269` records
  (`841` loot, `428` shop) and `357` open candidates (`116` NPC-item,
  `241` NPC-projectile). Its deterministic owner-scope hash is
  `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`.
  The preview names landing/maint/relation/local targets but keeps
  `applyAllowed=false`; this is the immutable pre-authorization snapshot. The
  later exact-scope packet is recorded below; no database write has occurred.
  The full crawler test glob is `119/122`; the three failures are pre-existing
  baseline/layout issues (`pipelines/scripts/lib/load-standardized-dataset.mjs`
  missing and two stale Item/Projectile Phase-0 hashes), outside this matcher
  change. The focused bridge/crawler suites remain `41/41`.
  A fresh full NPC parity attempt did not reach a terminal report after roughly
  4.5 minutes and was stopped; a single loopback aggregate smoke still returned
  `200`. The prior post-quarantine `418/418` parity report remains the latest
  complete evidence, with full-rerun stability still open.
- Next owner action is a separate governed landing/maint/relation preview with
  conflict resolution and exact authorization. Do not apply this bundle,
  touch `CenxsWings`, download images, or use direct SQL.

#### Authorized Scope Contract (2026-08-18)

- User supplied and authorized scope
  `sha256:268049c1a7e63e49fa3a2f0ee45bcd201af75ee3d00aff56dd6bfba6c48b7de7`.
  A governed operation `canonical-npc-external-relation-scope-apply` now binds
  the exact bundle hash, preview hash, server fingerprint, nine owner targets,
  and the `357` unresolved candidates as quarantine-only.
- Dry-run result:
  `reports/runtime/local-data-chain-closure/20260818/external-refresh/bridge-recheck/npc-relation-owner-scope-dry-run.json`.
  Authorization request, packet, execution manifest, owner input, and server
  fingerprint are under `reports/authorization/canonical/`.
- Contract/manifest tests pass `52/52`; packet current-state verification passes.
  No permit was consumed and no database write occurred. CLI apply remains
  fail-closed until a concrete affected-key MySQL handler is registered and
  readback-verified; full-table relation/local rebuild is forbidden.
- **Affected-key handler continuation (2026-08-19):** coordinator is Codex in
  this entry and is the only owner of implementation, reports, permit
  generation/consumption, database writes, and `docs/devlog/current.md`.
  Two read-only agents are assigned before implementation: one inspects the
  existing operation/manifest seam and one maps the exact nine target-table
  schemas plus existing bounded MySQL patterns. They may not edit files,
  start/stop services, call external sources, write databases, create permits,
  or update devlog. Their findings are returned to the coordinator for a
  serialized TDD implementation and integrated contract review.

#### Affected-Key Handler Review And Current Blocker (2026-08-19)

- The concrete writer now uses one loopback MySQL connection for the three
  formal schemas, keeps the landing -> maint -> relation -> local order, uses
  explicit column allowlists, and projects local rows by exact composite tuple
  without delete/rebuild. Maint lookup columns were corrected to the actual
  `maint_items`/`maint_npcs` schema (`english_name`/`name_zh`; no `name`).
  Writer payloads now also verify operation, scope hash, and write-plan identity
  against the bound plan before any SQL.
- Focused operation tests pass `12/12`; canonical manifest/operation tests pass
  `55/55`; dry-run remains no-write. A fresh manifest/request/packet was
  regenerated after the handler change. Current packet hash is
  `sha256:b69f03f91d3c5de31bbeca0b4e55f9a6427b2c49ae0baf66b8dc32602fd54ef9`
  and current execution-manifest hash is
  `sha256:cb49285959ea1d4d8f3e1a17559009ee7bdd3dbd8b87a56014e4919c22eafa3c`.
  No permit was created or consumed.
- A read-only static replay of the frozen 1269-record bundle found a scope
  projection mismatch before SQL: with synthetic complete identity indexes,
  the generic relation processor yields `1090` resolved facts, `654` loot
  relations, and `427` shop relations; `179` facts remain non-resolved,
  dominated by `168` `mode_or_bonus_bucket`, `6` collective-bucket mappings,
  and `5` ambiguous item identities. Evidence:
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-static-replay.json`.
- This is a hard fail-closed blocker, not a MySQL or rate-limit issue. The
  immutable preview authorizes parser evidence counts (`841` loot / `428`
  shop) while the generic processor applies taxonomy and semantic dedupe. Do
  not consume the packet, start an apply, or widen the scope. Next owner action
  is to freeze an explicit accepted/quarantine projection (including the
  known pseudo-source and unresolved rows), regenerate its exact counts/hash,
  and obtain a new scope authorization before any database write.
- At the time of this handler review, local MySQL was unavailable at
  `127.0.0.1:13306`; the canonical stack preflight stopped before starting
  services. This was later cleared by the fresh rebaseline below. No crawler,
  external request, permit consumption, SQL write, staging, commit, cleanup,
  or discard occurred.

#### MySQL Startup Attempt (2026-08-19)

- The repository has no MySQL daemon launcher; `platform/local/start-local-stack.sh`
  only performs a TCP preflight and starts the application stack after MySQL is
  reachable. The canonical `bash ./platform/local/start-local-stack.sh
  --reuse-existing` attempt stopped at `127.0.0.1:13306` as expected.
- A non-interactive attempt to start the existing configured instance failed
  before any filesystem mutation with `sudo: a password is required`. No
  `/run/mysqld` directory was created, no ownership or data-directory change
  was made, and no replacement database was started.

#### Fresh Local Read-Only Rebaseline (2026-08-19)

- MySQL is now reachable on loopback `127.0.0.1:13306`; the canonical stack was
  started with runtime-only random 32+ character auth secrets and
  `TERRAPEDIA_HTTP_RATE_LIMIT_ENABLED=false`. No config file or secret was
  written. Backend health is `UP`, and the manifest records the explicit fast
  local override.
- Fresh read-only closure evidence is green for the NPC lane: source coverage
  `762` active NPCs with `0` release blockers, runtime parity `418/418`
  trusted-direct with `1542` rows at each relation/projection/local/API stage,
  and closure smoke `pass` with `0` domain blockers, `0` runtime blockers, and
  `0` open loot audits. Relation health remains warning-only; cross-DB remains
  `9 pass / 1 warning` with the known `6056` untraced local acquisition rows.
  Evidence is under `reports/runtime/local-data-chain-closure/20260819/`.
- The parity replay used `--fast-local-api --max-rate-limit-retries=0` and
  completed without a 429. No crawler, external request, permit, apply, SQL
  write, or Git operation ran.
- Fresh domain checks pass for projectile relation/image and NPC relation. Item
  image readiness remains blocked because the available image-sync evidence has
  no `items` scope. DB image lineage is ready only for Bosses (`33/33`);
  items, NPCs, projectiles, armor sets, buffs, and biomes retain projection or
  managed-image gaps. See `reports/runtime/local-data-chain-closure/20260819/image-lineage.json`.
- The external relation scope remains blocked before SQL: the original
  authorized preview (`841` loot / `428` shop) replays to `654` / `427` accepted
  relations with `179` quarantined or unresolved facts. The original scope hash
  therefore cannot authorize an apply. Next decision required from the user is
  approval of a newly frozen accepted/quarantine projection and its new scope
  hash; until then no packet/permit may be generated or consumed.

#### Accepted/Quarantine Projection (2026-08-19)

- A real-identity, read-only replay against active `terria_v1_maint` item/NPC
  rows froze
  `reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json`.
  It contains `1071` accepted source facts/details, `655` deduped loot
  relations, `408` deduped shop relations, and `198` quarantine facts
  (`196` item-unresolved, `2` item-ambiguous). Pseudo-source `bonusdrop:*`,
  `Any Pylon`, `Deathweed Planter Box`, and other unresolved identities remain
  quarantine-only.
- The proposal is no-write (`applyAllowed=false`, `databaseWrites=false`) and
  has new scope hash
  `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`.
  It is a proposal, not an authorization packet. User approval is required for
  this exact revised scope before regenerating a packet/permit; the prior
  `sha256:268049...` authorization cannot be reused.

#### Accepted Scope Apply And Post-Apply Residual (2026-08-19)

- The exact revised scope was authorized and applied through the governed
  operation with decision identity `npc-external-relation-scope-20260819-07`.
  Final result:
  `reports/authorization/canonical/canonical-npc-external-relation-scope-apply.result.json`.
  Readback counts are landing `1`, maint sources `1071`, relation facts/details
  `1071/1071`, loot `655`, shop `408`, local loot/shop `655/408`, and crawler
  facts `0`. The `198` unresolved/ambiguous facts stayed quarantine-only.
- The apply used no crawler, external request, direct SQL, image download, or
  boss/CenxsWings lane. The stack was restarted for loopback verification and
  then restored to ordinary `httpRateLimitEnabled=true` with runtime-only
  random secrets.
- Post-apply cross-DB remains `9 pass / 1 warning / 0 blocking`; relation health
  remains warning-only. Runtime parity is blocked by `200` duplicate/polluted
  NPCs. The active relation tables contain the new `terraria.wiki.gg` lineage
  (`1071` facts, `655` loot, `408` shop) plus old active
  `terrapedia.generated` lineage (`2135` facts, `1172` loot, `938` shop), which
  explains the relation-stage duplicate count (`2197`) while projection/local/API
  remain at `1542/1600/1600`. This stale-lineage cleanup was not in the exact
  655/408 authorization and was not performed; local compatibility tables have
  no source lineage for a safe exact cleanup.
- Evidence: `reports/runtime/local-data-chain-closure/20260819/npc-loot-runtime-post-apply.json`,
  `reports/runtime/local-data-chain-closure/20260819/npc-loot-closure-post-apply.json`,
  `reports/runtime/local-data-chain-closure/20260819/cross-db-post-apply.json`,
  and `reports/relation/relation-health-20260819-post-apply.json`. The overall
  closure plan remains active/blocked pending a separately authorized stale
  lineage/local projection repair and the existing item-image/source gaps.

#### Stale-Lineage Read-Only Preview (2026-08-19)

- Coordinator: Codex. The next action is an exact no-write inventory of the
  active `terrapedia.generated` relation lineage and its overlap with the
  accepted `terraria.wiki.gg` bundle. Success requires a deterministic preview
  listing relation record keys, landing predicates, local tuple matches, and
  rows that cannot be safely mapped. Any unsafe local row remains quarantine;
  this preview cannot delete, soft-disable, rematerialize, or create a permit.
- Parallel ownership is read-only and disjoint: `mysql_schema_audit` owns
  schema/identity constraints, `operation_seam_audit` owns current report and
  operation-path evidence, and `writer_review` owns preview/authorization
  contract review. No child edits `docs/devlog/current.md`, the active entry,
  code, generated artifacts, databases, services, crawler state, or external
  resources. Codex consolidates results and owns any devlog/report write.
- The user-authorized `sha256:759c022a34a243ed17c93630727bb07d965b95064ed296740ecdf5d01cc6ca39`
  covers only the already-applied `655` loot and `408` shop rows. It does not
  authorize retirement of old lineage or local compatibility tuples. A new
  preview hash and explicit authorization are mandatory before any such apply.

#### Stale-Lineage Preview Completed (2026-08-19)

- The read-only preview is now generated at
  `reports/runtime/local-data-chain-closure/20260819/npc-stale-lineage-repair-preview.json`.
  The classifier enforces the exact retirable lineage: provider
  `terrapedia.generated`, landing hash
  `07cd3493b61def7dfb576846cab011e1e2c82fd398d5de711697a47444eae8b3`, landing
  source key `generated.npc_item_relations_bundle`, and maint table
  `maint_item_sources`. Its inventory is `2135` facts, `2135` details, `1172`
  loot, and `938` shop rows; other provider/hash combinations remain
  quarantine-only.
- Each row retains `landingSourceId`; all exact old relation rows currently
  carry `12447`. This identifier is diagnostic only because the landing row is
  no longer lineage-safe, so it is excluded from the authorization predicate.
- Proposed exact scope is `513` loot relations, `408` shop relations, `921`
  source facts, and `921` source details. Local compatibility rows are
  preserve-only (`655` loot and `446` shop); `38` duplicate local tuples remain
  quarantined. Quarantine counts are metadata drift `0`, parent-with-other-
  active-relation `84`, source-detail-incomplete `0`, independent-lineage
  `1153`, unmatched-incumbent `1423`, projection-required `7`, unmapped-local-
  tuple `0`, and local-duplicate-tuple `38`.
- Fail-closed flags are `applyAllowed=false`, `databaseWrites=false`, and
  `externalRequests=false`. The deterministic scope hash is
  `sha256:09869c305cb89e5dfd084f5dc01f06d55e7cec9f17a666c1516586e92d87fb5d`;
  the report file SHA-256 is
  `5b8d66ab3ba91bdf06a2bfbae2dcdf7d04bdde89eef82f88e834d40f0330039a`.
- Validation: the focused preview suite is `4/4` passing, `node --check` and
  `git diff --check` pass. No manifest, packet, permit, handler, apply,
  crawler, external request, direct SQL, local tuple cleanup, staging, commit,
  or discard was performed. The prior `sha256:759c...` authorization remains
  limited to the already-applied `655/408` scope; a new exact authorization is
  required before any stale-lineage operation.

#### Post-Retirement Residual Classification (2026-08-19)

- A coordinator-only read-only classification was generated at
  `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-runtime-residual-classification.json`, SHA-256
  `sha256:c87508e2ac789a78b3cde8fb9fab9f8695347667afddab13dae02fb648386038`.
  It reads only the existing post-retirement parity evidence and active local
  relation/projection rows; no database or external writes are enabled.
- The `53` duplicate NPCs expand to `136` duplicate stable-identity groups and
  `272` relation rows. `84` groups pair accepted `terraria.wiki.gg` rows with
  old `terrapedia.generated` rows that were excluded by the prior parent-
  conflict quarantine. `52` groups pair accepted rows with independent
  `wiki_gg` lineage. These are separate quarantine classes and need separate
  exact preview/authorization decisions; neither is safe for tuple deletion.
- The `3` projection gaps are CursedSkull/Nazar, JungleSlime/SlimeStaff, and
  ManEater/Vine. Each accepted relation is present in local/API, while
  `projection_npcs` has a semantically equivalent bare-probability row with a
  different stable text identity. This is a projection text mismatch, not a
  missing drop. There is no currently bound governed NPC projection operation,
  so no rebuild or local sync is allowed.
- The report records `localApiGapCount=0`; JSON parsing and `git diff --check`
  pass. The closure plan remains `active`/blocked on these `56` runtime rows,
  the existing item-source warning, and image/source readiness gaps. Next step
  is a new exact preview for any chosen lineage class, or a separately designed
  governed projection operation; no scope is inferred from the consumed
  `sha256:09869c...7fb5d` retirement authorization.

#### Parent-Conflict Exact Preview (2026-08-19)

- A fresh read-only preview isolates the `84` accepted-versus-old-generated
  parent-conflict loot relations at
  `reports/runtime/local-data-chain-closure/20260819/post-stale-lineage/npc-stale-lineage-parent-conflict-preview.json`.
  Output SHA-256 is
  `sha256:ca964ae6746553e8ae39a1cf6c973ae1649e92313d4e11f03b42dd81cf2d6134`;
  deterministic candidate scope is
  `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001`.
- Current readback is exact: old loot `84/84`, old facts `84/84`, old details
  `84/84`, and accepted survivor relations `84/84` are active. The old facts
  have `361` active child relations in total, so retiring their facts/details
  would be unsafe; the preview targets no local or projection rows and no
  `wiki_gg` variant.
- The preview is fail-closed and no relation-only operation exists yet. A new
  owner-approved relation-only operation must be designed and separately
  authorized before any mutation; the prior
  `sha256:09869c...7fb5d` authorization is not reusable.

#### Parent-Conflict Relation-Only Execution (2026-08-19)

- Scope `sha256:51efc81d854b9ff9bb3bf508e04edc4ac39ac3dab6b3c194d23710fbf697d001` was authorized through `canonical-npc-stale-lineage-parent-conflict-retirement`, which owns only `relation.item_npc_loot_relations.parent_conflict_old_generated`.
- Final decision `canonical-npc-stale-lineage-parent-conflict-retirement-20260819-admin-03`, packet hash `sha256:d7090f5fb13ffd3ab599f7270a1904ec265eb1568f3c9682a3c1a9fcaeff5041`; transaction committed `84` relation rows and read back `activeTargets=0`. Result hash: `sha256:1cde357d50e976f1e5250299cfc2e2959a65ca37cc45ab9b7d114be66ea0af4d`.
- No facts/details/local/projection or `wiki_gg` rows were changed. Two earlier contract mismatches failed closed before SQL and remain audit evidence only.
- Fresh reports under `reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/` show `418` parity NPCs: `377` trusted, `37` duplicate/polluted, `4` projection gaps; stage rows `1600/1542/1600/1600`. Domain retains six count-parity blockers; closure remains blocked; relation health is warning-only with zero blocking checks and zero open loot audits.
- The temporary loopback run used shell-only 48-byte secrets after a 30-character secret caused one startup failure; final ordinary stack manifest records `httpRateLimitEnabled=true`. Focused operation/manifest/catalog tests pass `47/47`, authorized-operation suites pass `35/35`, and no crawler, external request, additional SQL write, staging, commit, cleanup, or discard ran.

#### Projection-Gap Variant Retirement And Rebaseline (2026-08-19)

- User-authorized scope
  `sha256:880fa2d9f9b14b3071400cfeac9af4de9e59757843481dbc0d65714c444ae4c8`
  was consumed by `canonical-npc-projection-gap-wiki-gg-variant-retirement`.
  It soft-disabled exactly four old `wiki_gg` relation rows for
  CursedSkull/Nazar, Hornet/Stinger, JungleSlime/SlimeStaff, and ManEater/Vine.
  Readback is `relationLoot=4`, `activeTargets=0`, and `activeSurvivors=4`.
  Facts/details, projection JSON, local rows, and API data were not changed;
  result is
  `reports/authorization/canonical/canonical-npc-projection-gap-wiki-gg-variant-retirement.result.json`.
- A loopback-only fast-mode parity rerun with rate limiting explicitly disabled
  completed without 429. It reports `418` NPCs, `377` trusted-direct loot,
  `41` duplicate/polluted blockers, and relation/projection/local/API stages
  `1544/1542/1600/1600`:
  `reports/runtime/local-data-chain-closure/20260819/post-final/npc-loot-runtime-parity-rerun-fast.json`.
  The stack was then restarted by `platform/local/start-local-stack.sh` with
  shell-only secrets and ordinary `httpRateLimitEnabled=true`; aggregate smoke
  returned HTTP `200`.
- Residual exact audit: projection contains `59` stale `wiki_gg` and `73`
  stale generated keys pointing to inactive relations. Local/API compatibility
  rows have no source lineage, so no relation-only operation can safely target
  them. Of seven active `wiki_gg` relations, five have one accepted survivor
  but need projection/local reconciliation first; DesertLamiaLight/MoonMask
  lacks a survivor and IceMimic/SnowballCannon has two. The independent variant
  rerun proposes zero rows and quarantines `314` rows with no accepted
  survivor. No new permit, packet, apply, external request, or direct SQL ran.
- Fresh read-only status: cross-DB is `9 pass / 1 warning / 0 blocking` with
  `6056` local acquisition rows without relation/maint trace; relation health
  is `0` blocking / `1` warning. Item-source evidence has `3,730` rows,
  including `1,269` active-source closure rows, `17` raw candidates, one NPC
  projection gap, and nine biome projection rows pending. Image lineage is
  ready only for Bosses; asset readiness is blocked by `2,119` item cache rows
  lacking source/original fallback. Reports are under
  `reports/runtime/local-data-chain-closure/20260819/post-final/`.

#### Local Image Original-URL Provenance Preview (2026-08-19 10:09 CST)

- A read-only provenance preview was generated at
  `reports/runtime/local-data-chain-closure/20260819/post-final/item-image-original-url-provenance-preview.json`
  (SHA-256 `sha256:dc46a755707d2a33df5e26b227b645a6a33091cb84af26ea4e58e1cc7cf09f82`).
  It covers all `2,119` active `maint_item_images` rows whose
  `source_provider=terraria.wiki.gg` and `original_url` is missing, with
  relation/local readback, shared raw item-page evidence, landing lineage
  fields, and managed-cache object checks. The report is explicitly
  `readOnly=true`, `databaseWrites=false`, `externalRequests=false`, and
  `applyAllowed=false`.
- All `2,119/2,119` managed cache objects have a local MinIO object directory
  and `xl.meta`. Local raw item pages parse for `2,119/2,119` targets. Exact
  file-title matching (including extension) yields `2,117` deterministic
  recoveries with a unique raw Wiki URL and present cache object.
- `FallenStar` is quarantined as
  `ambiguous_requires_external_verification`: the recorded `Fallen Star.png`
  conflicts with a local `Fallen Star.gif` candidate. `SeveredHandBanner` is
  `recoverable_from_local_file_title_only`: its group-page raw evidence does
  not expose a matching canonical URL for `32px-First Fractal.png`. No local
  row, source fact, landing payload, or original URL was written, and no
  apply packet was generated.
- `landing_source_id/key/content_hash` are retained as landing-payload
  lineage only; they do not prove a specific image URL. The image readiness
  contract therefore remains open until the two residual records are either
  externally verified under a new approval or intentionally kept quarantined.

#### Scheme A Local-Only Scope Freeze (2026-08-19 12:59 CST)

- The user selected the local-evidence-first strategy. Read-only scope preview
  `reports/runtime/local-data-chain-closure/20260819/post-final/scheme-a-local-image-scope-preview.json`
  freezes `2,117` Item provenance candidates and `388` Buff projection
  candidates under scope
  `sha256:9e32660f26b5c689b47853f01f1a9dc044b81b52f6fa2751c2ce8abfa7a9060f`.
  Every Item candidate has exactly one active maint, relation, and local icon
  row plus exact raw-image evidence; both `FallenStar` and
  `SeveredHandBanner` remain excluded quarantine. Every Buff candidate has one
  active relation cache URL and one active `projection_buffs` row.
- Review of the existing `canonical-item-image-lineage-apply` writer found it
  retires/reinserts the full `6,131` identity set across landing, maint,
  relation, and local layers. It cannot be reused as a narrow `2,117`-row URL
  correction. No input contract, packet, permit, or database update has been
  created. Next work must choose and test either a dedicated provenance patch
  operation or an explicitly authorized fresh full-snapshot replacement; Buff
  projection is an independent one-column operation.

#### Image Provenance/Projection Continuation (2026-08-20)

- User directed continuation of Scheme A. The scoped execution addendum is
  `docs/superpowers/plans/2026-08-20-local-image-provenance-projection-closure.md`
  and `docs/superpowers/plans/2026-08-20-local-image-provenance-projection-closure.zh.md`.
  Codex is the sole coordinator for operation code, registry, reports, and
  shared devlog state. Parallel agents are read-only only and have no shared
  code, database, service lifecycle, report, or devlog write ownership.
- The new plan deliberately separates a `2,117`-row Item provenance patch
  (the same page/revision/original-URL metadata in maint/relation/local; local
  MySQL confirms all relation columns exist) from a `388`-row Buff projection
  patch (`projection_buffs.image` only). Neither is authorized to write yet;
  both require fresh contract/manifest/packet hashes and a subsequent explicit
  owner authorization. `FallenStar` and `SeveredHandBanner` remain excluded.

#### Scheme A Pre-Authorization Materials (2026-08-20)

- The frozen scope refers to an older provenance report byte hash
  `sha256:62952730a4e3646701327902517a17bc1a0cd108e1d1a9c638d677bc750ab0da`,
  while the current report byte hash is
  `sha256:dc46a755707d2a33df5e26b227b645a6a33091cb84af26ea4e58e1cc7cf09f82`.
  The cause is report serialization drift, not evidence drift: a new
  fail-closed reconciliation maps `pageTitle`, `revisionTimestamp`, and the
  unique candidate URL to the frozen source-page, revision, and original-URL
  fields for all `2,117` consumed identities. It reports zero duplicate
  identities, missing identities, non-exact verdicts, invalid evidence, or
  field mismatches at
  `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/item-image-provenance-evidence-reconciliation.json`
  (file SHA-256 `sha256:27fe39be69f2c8380cb95c1dffef9a95895bcb581baa841e041ace037cfc9ce4`).
- The generator also records each raw evidence absolute path and raw-file hash
  in the new Item preview, so the existing transaction re-verifies raw files
  before any DML. The execution manifest ownership now names exactly the nine
  Item provenance columns, rather than a partial aggregate ownership label.
- Read-only preflight against the three local databases generated separate,
  private `0600` artifacts with no overwrite behavior. Item scope is
  `sha256:e19e17341f8baa448b3c845796d76cf99c73df711bd2470c051cc111066a4574`
  (`2,117` maint, `2,117` relation, `2,117` local rows) and its request hash is
  `sha256:05415740af5a7324aa7616850302964b5ee943dfb2ac5a3036b951956f03e853`.
  Buff scope is `sha256:c59f97b26d293ee18052088597f1cda18354741ec53ef984d0c319a9355e0487`
  (`388` projection rows) and its request hash is
  `sha256:1a495ed25ef2a7946e95e7585eb335724bd807c9a7976071d304b067011de653`.
  See the operation-specific preview, input, execution-manifest, and request
  paths under `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/`
  and `reports/authorization/canonical/`.
- Validation: both operation CLIs complete under `--apply=false` with the exact
  scope counts, and the focused Item/Buff/generator/manifest suite passes
  `58/58`; `git diff --check` passes. No authorization packet or permit was
  created or consumed, and no transaction, database write, external request,
  crawler, image transfer, staging, commit, cleanup, or discard was performed.
- Next action is deliberately paused for two independent explicit owner
  authorizations. Item authorization may not be inferred from Buff, and vice
  versa. `FallenStar` and `SeveredHandBanner` remain outside both requests.

#### Image Patch Request Retry (2026-08-20)

- The owner then authorized the two first-generation request hashes. Before a
  packet could be issued, canonical authorization verification stopped
  fail-closed because both requests had `policySetHash=null` and
  `missingTechnicalFields=["policySetHash"]`. No packet, dispatch permit,
  decision-ledger entry, transaction, or database write was created; the user
  authorization was not consumed.
- Root cause: the pre-authorization generator passed no automation policy rows
  to the generic canonical request builder, although these operations use the
  default technical-field contract. A test-first repair makes the generator
  read and canonicalize current `crawler_automation_policy` rows before it
  builds a request. The focused generator suite passes `6/6`.
- Fresh read-only current-state inspection confirms the ten policy rows are
  byte-for-byte equivalent to the preserved eight-domain policy snapshot, with
  hash `sha256:1857df8faf480c658a884c20dfc259afc7b848a38b221b68be264f2e532b0629`.
  The local server fingerprint, including UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`,
  also matches the already-frozen snapshot. No policy change is proposed or
  performed.
- To preserve the first-generation input, preview, manifest, and request files
  without overwrite or deletion, two no-overwrite `retry-01` requests were
  created over the same narrow operation scope and data bundle with the added
  current policy technical identity. Item request is
  `sha256:d01e85e23d81e0c00b96d3f6215fb634f22103329b47624f0eee335308b70d38`;
  Buff request is
  `sha256:f8d44a6496019f009ba75b30689b322f3ab5f553978f3e56526a8724df925957`.
  Both have `missingTechnicalFields=[]` and remain `AWAITING_OWNER`.
- The previous user authorization is intentionally not transferred because
  authorization is hash-exact. New, independent authorization for each retry
  request is required before a packet/permit can exist. The broad canonical
  authorization test file currently has 12 unrelated baseline failures: stale
  expected operation IDs and retired `scripts/data` path assertions, plus a
  projection test fixture that omits a current dependency. These failures did
  not create artifacts or affect the successful canonical request builds.

#### Image Patch Runner Fingerprint Repair (2026-08-20)

- The user authorized both `retry-01` request hashes. Item packet
  `sha256:5836b03c89dc63d066aa7db67a5d29213eabd3e9830176f652395bc63d7a925c`
  was then signed and dispatched. It stopped before any DML at the child's
  server fingerprint check: the packet stores only a fingerprint hash, while
  the executor expected a `serverUuid` object. The outer runner had validated
  the supplied fingerprint, but had not propagated it into the child.
- The runner's one-time protocol had already consumed decision
  `canonical-item-image-provenance-patch-20260820-admin-01` before child
  execution. The permit was removed by cleanup; no Item result was written.
  Read-only re-preflight proves all `2117` Item rows still match their exact
  before-state. Buff was not signed, dispatched, or changed. This is recorded
  as a consumed no-DML attempt and will not be replayed.
- The repair is test-first: the generic runner now transmits a canonical server
  fingerprint only under authorization, and the child parses it, requires its
  hash to equal the authorized packet fingerprint, then compares the verified
  UUID to MySQL. The code no longer treats a hash as an object. Focused
  context/runner/manifest/Item/Buff/generator suites pass `95/95`; `git diff
  --check` passes.
- Because the runner and executor bytes are in the signed code bundle, new
  no-overwrite `retry-02` manifests and requests are required even though the
  Item/Buff data inputs are unchanged. The current read-only preflight also
  confirms Buff's `388` projection rows remain in before-state. New request
  hashes are Item
  `sha256:b9e8d8cd587fa40a3c27a6417251e7db6a127a48b536a18da145f3b5a6bd3998`
  and Buff
  `sha256:d03bad07d911d4b371f6f60a6d6ee24f9491b03f31ab02cfd15bb7df42af7828`.
  Both are `AWAITING_OWNER`; the prior retry authorization cannot transfer to
  a changed code bundle. No external request, crawler, Image DML, staging,
  commit, cleanup, or discard occurred.

#### Image Provenance Retry-02 Datetime Failure And Retry-03 (2026-08-20)

- The owner authorized both retry-02 request hashes. Item packet
  `sha256:df551b5b7ca055a5e806bc3e3f99f6d6890282bad9274136874076bd6f375d33`
  was signed and dispatched. The first maint update failed before durable DML
  because the raw ISO UTC revision `2026-04-18T19:58:09Z` was bound directly to
  a strict MySQL `DATETIME(0)` column. The transaction rolled back; no Item
  result was written, the dispatch permit was revoked, and decision identity
  `canonical-item-image-provenance-patch-20260820-admin-02` is consumed. Buff
  was not signed, dispatched, or changed.
- Read-only re-preflight after the failure matched the exact before-state for
  all `2,117` maint, `2,117` relation, and `2,117` local Item rows. Live schema
  inspection confirms all three target timestamp columns are `DATETIME(0)` and
  strict mode is active. The root cause is a format mismatch, not source or
  relation drift.
- Test-first repair serializes only ISO UTC timestamps to MySQL
  `YYYY-MM-DD HH:mm:ss`, rejects timezone-less timestamp strings to avoid
  local-time shifts, and compares driver `Date` readbacks by UTC-second
  semantics. Focused runner/manifest/Item/Buff/preparation validation passes
  `97/97`; `git diff --check` passes.
- A no-overwrite retry-03 Item manifest and request now bind the repaired code
  bundle. The request hash is
  `sha256:894fce86721bfa506008aa6432788b20bae9c9fa6495d09ac0b616c5286bb344`
  and the repaired Item executor hash is
  `sha256:2e8e9ad508b76286d6afc1663d9e653512f6e62728166fc4345faf0e01016717`.
  Fresh exact owner authorization is required; retry-02 authorization cannot
  transfer across the changed code bundle. No external request, crawler, Buff
  DML, staging, commit, cleanup, or discard occurred.

#### Image Provenance And Buff Projection Apply Closeout (2026-08-20)

- Fresh retry-03 Item authorization completed with packet
  `sha256:ae55e746d0cea1fa525c76f328921dafb87827593c304c38a597b6a4cf91295d`.
  The governed transaction updated and read back `2,117` maint, `2,117`
  relation, and `2,117` local rows exactly: `6,351` row-layer updates and
  `19,053` provenance field values. The result is
  `reports/authorization/canonical/canonical-item-image-provenance-patch.result.json`;
  decision `canonical-item-image-provenance-patch-20260820-admin-03` is
  consumed and its permit is revoked.
- The previously authorized Buff retry-02 request was then signed as packet
  `sha256:088b6a81f1dde94f66dc3f17c11a97d854aaba9889086f4b8c5066437122961f`.
  Exactly `388` `terria_v1_relation.projection_buffs.image` rows were updated
  and read back. Relation image evidence fields were unchanged. The result is
  `reports/authorization/canonical/canonical-buff-image-projection-patch.result.json`;
  decision `canonical-buff-image-projection-patch-20260820-admin-02` is
  consumed and its permit is revoked.
- Post-apply read-only reports:
  - image readiness remains `blocked`: Item has `2` managed/cache rows without
    source/original fallback, `23` rows without an image, and `5` stale
    verification timestamps; Buff is warning-only with `388` stale verification
    timestamps; NPC has `4` missing images and no unified contract.
  - image lineage has `2/7` entity types ready (Buffs and Bosses). Item still
    lacks managed projection evidence; NPC, Projectile, Armor, and Biome remain
    separate residual contracts.
  - local core compatibility smoke is failed for Items, NPCs, and Bosses.
- Focused image/authorization suites pass `97/97`; `git diff --check` passes.
  Direct API smoke returned `200` for backend Items, backend categories, admin
  root, and admin Items proxy; public front root exceeded a five-second
  timeout. The broader canonical smoke script was stopped after it hung on the
  known unreachable image origin at `localhost:19000`; no service or database
  state was changed. This closes the two authorized narrow operations only;
  the overall image closure plan remains active.

#### Image Runtime Recheck (2026-08-20)

- The local MinIO data directory already contained the managed object set, but
  the ordinary example stack configuration had MinIO disabled. The repository
  start script was run with `--reuse-existing` and loopback-only temporary
  credentials, restoring `localhost:19000` and the legacy `9000` compatibility
  proxy without restarting the existing backend/front/admin processes or
  changing database rows.
- Bounded local smoke is now `5/5`; the direct object API and compatibility
  proxy returned real PNG bytes, and the front root plus `/items` returned
  `200`. The read-only reports are
  `reports/local-start/smoke-20260820-015430.json`,
  `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/post-minio-image-asset-readiness.json`,
  and
  `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/post-minio-image-source-lineage-configured.json`.
- Supplying the actual local MinIO prefixes to the lineage audit changes the
  entity result to `5/7` ready: Buffs, NPCs, Bosses, Projectiles, and Armor
  sets pass. Item is blocked only by
  `invalid_item_image_projection_apply_evidence`; Biome remains blocked by its
  absent maint/relation/projection image contract. Item asset readiness still
  reports `2` managed rows without source/original fallback, `23` missing
  images, `5` stale verification timestamps, and `388` stale Buff timestamps.
  These are data-contract findings, not image-origin reachability failures.
- No crawler, external request, new permit, database write, staging, commit,
  cleanup, or discard occurred. The 2026-08-20 plan remains bounded to the two
  already-authorized operations; full Item projection repair and Biome image
  contract work remain separate future scopes.

#### Fresh Final-Rerun Verification (2026-08-20 02:42 CST)

- A fresh read-only rerun under
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/` confirms
  NPC source coverage `762/762` pass and domain `releaseBlockingCount=0`:
  `304` direct-loot, `114` contract-backed inherited-loot, `289` expected-zero,
  and `17` reviewed no-direct-item-loot rows. The composed closure smoke is
  `pass` with `0` domain blockers, `0` runtime blockers, `0` open loot audits,
  and `418` trusted direct-loot NPCs. Relation health is warning-only
  (`21/1/6/0` pass/warn/info/blocking); cross-DB is `9/1/0` pass/warn/blocking,
  with the single warning being `6,056` local acquisition rows without
  maint/relation trace.
- Item source closure remains read-only and incomplete (`269` duplicate-only
  candidates, `276` planned duplicates, `17` projection rows with `16`
  public-contract coverage, and `23` explicit exemption candidates). Image
  asset readiness remains blocked by `2` managed rows without source/original
  fallback and `23` missing images; Buff has `388` stale verification rows.
  Image lineage is `2/7` ready under default prefixes and `5/7` with the actual
  local MinIO prefixes. Item projection evidence and the Biome image contract
  remain independent blockers.
- The full loopback parity rerun was stopped after more than five minutes with
  no terminal output or report and no write/429. The latest complete fresh
  parity artifact remains `.local/tmp/image-audit/fresh-npc-parity-20260820.json`
  (`418/418`, `1542` rows at each relation/projection/local/API stage). Focused
  parity, image patch, and local-core tests pass `40/40`.
- The quality gate remains intentionally fail-closed rather than being made
  green by fabrication: three item-group publication tests require the absent
  `reports/authorization/canonical/canonical-item-group-bootstrap.result.json`,
  and one NPC owner-phase test requires the absent
  `reports/authorization/canonical/canonical-npc-apply.input.json`. No
  authorization fixture, packet, permit, or database write was synthesized.

#### Biome Icon Read-Only Audit (2026-08-20 03:12 CST)

- The bounded loopback audit reports `47` active biome rows: `40` managed local
  objects and `7` direct Wiki fallback URLs (`forest`, `jungle`, `desert`,
  `crimson`, `corruption`, `hallow`, `spike_caves`); `0` missing and `0` invalid
  URLs. The result is `readOnly=true` and does not change the earlier conclusion:
  the remaining problem is missing maint/relation/projection ownership fields,
  not missing core icon data. Report:
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/biome-icon-readiness.json`.

#### Item Image Gap Classification (2026-08-20 04:32 CST)

- A read-only local classification now accounts for all `23` Item rows
  reported without a managed cache or Wiki fallback. The durable report is
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.json`
  (SHA-256
  `sha256:cb532e7802364923768a7374db139940e91031f1d1844a62a79124d50fd5b576`).
- `15` rows are classified as `legacy_unowned_image_contract`: they have
  active local rows and legacy maint/relation identity rows sourced from
  `Module:Iteminfo/data`, but no active maint/relation/local image row, no
  current standardized Item identity, and a null Item projection image. They
  remain quarantined; the Module landing record is not treated as an image
  URL contract.
- `8` rows are `accepted_local_only_recipe` identities. The exact
  `ZH_RECIPE_*` set is already listed by the local-core compatibility report;
  these rows stay local-only and receive no image backfill.
- `FallenStar` and `SeveredHandBanner` are tracked separately as provenance
  quarantine (`ambiguous_requires_external_verification` and
  `recoverable_from_local_file_title_only`). They remain outside the
  authorized `2,117` Item provenance patch and no URL is guessed.
- Clarification after local Wiki cross-check: `23` means no active image row
  for the exact local identity. It does not mean 23 Wiki pages are image-less.
  Local evidence finds `BossMaskOgre` for the Ogre Mask image, `ManaCloak`
  and projectile `ManaCloakStar` images, projectile `FirstFractal`, and
  canonical component images behind five synthetic recipe rows. The remaining
  exact legacy identities have no safe local Item image evidence; the three
  jellyfish bait rows have enemy images only, which are not safe substitutes.
- Validation: report JSON parse passed, counts are `15 + 8 + 2`, and
  `git diff --check` passed. No external request, crawler, image download,
  database write, apply, staging, commit, cleanup, or discard occurred. The
  parent entry remains `active`; Item projection evidence, the Biome image
  contract, and the two provenance quarantine rows remain open follow-up.
- A same-origin static HTML viewer was added beside the report for local review:
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.html`.
  It runs on the read-only server at `127.0.0.1:8787`, supports search and
  category filters, and does not issue external requests or mutate state.

#### Item Image Table Detail Viewer (2026-08-20 09:45 CST)

- The viewer now consumes a fresh read-only seven-table snapshot at
  `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-table-details.json`
  (SHA-256
  `sha256:bd7a3c4d554d01cfcb94b1caee7df76a8b8970d521bb320c2255f95a54029efd`).
  It retains field-level rows for local `items`/`item_images`, maint
  `maint_items`/`maint_item_images`, relation `relation_items`/
  `relation_item_images`, and relation `projection_items`, including keys,
  source/landing lineage, file titles, original/cached URLs, projection image,
  state, and timestamps. Large raw payload columns are intentionally omitted
  from the display and listed in the snapshot metadata.
- The actual snapshot counts are `25 / 7 / 17 / 2 / 17 / 2 / 17` for those
  seven tables. `FallenStar` exposes both active local image rows and
  `SeveredHandBanner` exposes all five active local image rows, including the
  conflicting/contaminated file titles. Synthetic recipe rows visibly show
  their absent maint/relation/projection rows instead of a generic missing
  label.
- The snapshot producer and contract tests are
  `pipelines/audit/item-image-gap-detail-snapshot.mjs` and
  `pipelines/audit/item-image-gap-detail-snapshot.test.mjs`. Tests pass `2/2`;
  JSON parsing, embedded script syntax, HTTP `200`, and `git diff --check` pass.
  Chromium screenshot/DOM rendering was attempted twice but the host snap
  launcher timed out while updating system profiles before page startup; this
  is an environment validation gap, not a page result. No external request,
  crawler, image download, database write, apply, staging, commit, cleanup, or
  discard occurred.
- The HTML was intentionally simplified after review: the default view is now
  one searchable table with `classification`, `id`, `name`, `name_zh`,
  `internal_name`, per-layer row counts, projection-image presence, and a short
  image filename/cache summary. The detailed snapshot remains linked as an
  optional evidence artifact rather than being rendered in every row.

#### Session Handoff: 2026-08-20 22:08 CST

##### Status

`active`

##### Repository State

- Repository/worktree: `/home/lolben/TerraPedia`
- Branch: `feat/supplementary-domains-readiness`
- `HEAD`: `2644d411d2ff48be41b6709dca1bb891cb3d2452`
- Upstream: `origin/feat/supplementary-domains-readiness`; ahead `19`, behind `0`
- Worktree: `78` tracked paths modified, `315` untracked paths, `0` staged paths
- The prior handoff summary's `57` tracked / `335` untracked counts are stale; the
  current Git status above is authoritative. No existing path was reverted,
  cleaned, discarded, staged, committed, or pushed.

##### Task Contract

- User goal: transfer the active TerraPedia local data/image-chain work with a
  verified, reproducible continuation point.
- Success criteria: preserve the active devlog and exact residual image scope;
  identify the next safe action without authorizing new writes or external work.
- In scope: handoff facts, completed image-operation evidence, residual blockers,
  validation state, and the next read-only planning step.
- Out of scope: crawler or Wiki/Steam/forum requests, image downloads, database
  writes, direct SQL, new permits/authorization, backup cleanup, staging,
  commit, push, reset, stash, or worktree cleanup.
- Governing docs: `AGENTS.md`,
  `docs/project-governance/00_CURRENT_SPEC.md`,
  `docs/project-governance/00_WORKFLOW.md`, and `docs/devlog/current.md`.
- Active plan: `docs/superpowers/plans/2026-08-20-local-image-provenance-projection-closure.md`
  and its `.zh.md` companion.

##### Observed

- The two previously authorized narrow operations are complete. Item provenance
  read back `2,117` maint + `2,117` relation + `2,117` local row updates; Buff
  projection read back `388` `projection_buffs.image` values.
- Current reports classify all `23` Item image gaps: `15`
  `legacy_unowned_image_contract` and `8` accepted local-only `ZH_RECIPE_*`
  identities. `FallenStar` and `SeveredHandBanner` remain separate provenance
  quarantine and are excluded from the authorized scope.
- Local MinIO/object/API smoke is recorded; configured local prefixes make image
  lineage `5/7` ready. Item projection evidence is invalid/missing and Biome has
  no maint/relation/projection image contract. Residual Item/NPC asset and stale
  verification warnings remain.
- Existing reports and focused image/authorization suites are the evidence of
  completed operations; no fresh runtime gate was run during this handoff.

##### Recorded Evidence

- `reports/authorization/canonical/canonical-item-image-provenance-patch.result.json`
- `reports/authorization/canonical/canonical-buff-image-projection-patch.result.json`
- `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-classification.json`
- `reports/runtime/local-data-chain-closure/20260820/final-rerun/item-image-gap-table-details.json`
- `reports/runtime/local-data-chain-closure/20260820/final-rerun/biome-icon-readiness.json`
- `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/`

##### Unknown / Not Run

- No new remaining-image repair plan has been created yet; the next session must
  create bilingual plans before implementation work.
- Item projection repair, Biome image-contract work, and any quarantine decision
  have no current owner authorization or permit.
- No new API parity, full quality gate, database audit, or browser screenshot was
  run during this handoff.

##### Validation

- `git diff --check`: passed.
- `git status --short --branch -uall`: recorded the branch and dirty-state facts
  above.
- Staged diff: empty.
- Implementation/runtime validation during this handoff: not run.

##### Next Safe Action

- Owner: next Codex session.
- Smallest safe step: read this handoff, `docs/devlog/current.md`, and the two
  2026-08-20 image plans, then create the bilingual remaining-image repair plans
  with a read-only freeze for Item projection, NPC/Projectile/Armor prefixes,
  Biome contract gaps, and the two provenance quarantine rows.
- Stop condition: any step requiring a new packet, permit, external request,
  crawler, image transfer, or database mutation stops for explicit owner scope
  authorization and a fresh scope hash.

##### Transfer Notes

- Do not replay consumed Item/Buff permits or reuse their request hashes.
- Default image policy remains PC-only Item static PNG; Projectile/tile assets are
  allowed only under an explicit display exception. Never guess URLs or copy
  images across entity identities.
- Database backup-table cleanup remains cancelled for this task.

#### Remaining-Image Repair Plan And Read-Only Freeze (2026-08-20 22:24 CST)

##### Status

`active`

##### Recorded

- Created the bilingual execution plans:
  `docs/superpowers/plans/2026-08-20-remaining-image-repair.md` and
  `docs/superpowers/plans/2026-08-20-remaining-image-repair.zh.md`.
- Created the report-only freeze:
  `reports/runtime/local-data-chain-closure/20260820/remaining-image-repair/read-only-freeze.json`.
  Its canonical scope hash is
  `sha256:53d499d81b0003bd377f06047357247d5f233bdebaaf3ddefda4af19bd1e00ae`;
  the freeze file SHA-256 is
  `sha256:e2aff9a4f90f53eb588619ea6b007016e8b4b8f90a3d9b7e9724c472f40b2fad`.
- The freeze binds Item projection `6131/6146`, NPC `758/762`, Projectile
  `1110/1111`, Armor `88/88`, Biome `47` (`40` managed and `7` fallback), the
  23 Item classifications, and both provenance quarantine identities. It is
  evidence only: `readOnly=true`, `databaseWrites=false`,
  `externalRequests=false`, and no permit/packet/apply was created.

##### Freshness And Blocker

- Loopback MySQL and application ports were not reachable during this turn, so
  the freeze uses the latest existing read-only reports and exact byte hashes.
  A live `START TRANSACTION READ ONLY` refresh is mandatory before any proposal,
  authorization, schema migration, external request, or database write.
- `FallenStar`, `SeveredHandBanner`, 15 legacy-unowned Item rows, and eight
  `ZH_RECIPE_*` rows remain excluded from every future image scope. Item
  projection evidence, NPC/Projectile/Armor managed-prefix coverage, and the
  Biome ownership contract remain independent follow-up lanes.

##### Validation

- `git diff --check`: passed after plan/freeze creation.
- Freeze JSON parse: passed; all referenced evidence hashes were recomputed and
  matched. No database, network, crawler, image transfer, staging, commit,
  cleanup, or discard was run.

##### Next Safe Action

- Refresh the freeze from live loopback read-only audits when MySQL is available,
  compute a new scope hash if any key/count/prefix changes, then generate
  independent read-only proposals. Stop before any new packet, permit, external
  request, schema apply, image transfer, SQL write, or commit until the owner
  grants a fresh exact scope.

#### Remaining-Image Issue Inventory Execution (2026-08-21 03:12 CST)

##### Status

`active`

##### Result

- The fresh database-backed freeze is blocked: `127.0.0.1:13306` MySQL,
  `18091` backend, `9000/19000` MinIO, and `6380` Redis were all closed.
  No stack start, crawler, external request, image transfer, permit, packet,
  SQL, or database write was attempted.
- A blocked connectivity record is saved at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/blocked-fresh-db-freeze.json`.
- A local-evidence issue inventory is saved at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/issue-inventory.json`.
  It identifies all 23 Item image gaps (15 legacy-unowned, 8 accepted local-only
  recipe rows), both provenance quarantine identities, the 4 NPC no-image rows
  as three `None*` sentinels plus internal `DD2AttackerTest`, and the one
  Projectile `None` sentinel. It also records 2 Item managed rows missing
  source/original fallback, 0 broken cached URLs, 5 stale Item verifications,
  388 stale Buff verifications, and the Biome ownership-contract blocker.
- The inventory scope hash is
  `sha256:4762c000adfc39865410edc687869bc41780a5c26b8e4db62f990eeebc3907d0`.
  It is a local-evidence classification hash, not a current DB write scope.

##### Validation

- JSON parse and all eight referenced evidence SHA-256 checks passed.
- Focused snapshot contract tests are to be run after this record; the fresh
  DB audit suite was not run because the target endpoint was unavailable.
- The parent entry remains `active`; no repair proposal or authorization packet
  was created.

##### Next Safe Action

- Restore the authorized loopback MySQL/stack endpoint, rerun the SELECT-only
  asset/lineage/Biome/local-core audits, compare identity keys and before-row
  hashes against this inventory, and compute a new scope hash before any
  proposal or write.

#### Fresh Remaining-Image Read-Only Rebaseline (2026-08-21 04:03 CST)

##### Status

`active`

##### Result

- The loopback MySQL instance was started from the existing WSL system data
  directory through the WSL root entrypoint; the repository local stack then
  passed preflight with MySQL `13306`, Redis `6380`, backend `18091`, public
  web `5177`, and admin `3004` listening. No Flyway migration was needed and
  no data-refresh scheduler was enabled.
- Fresh `START TRANSACTION READ ONLY` audits completed for image lineage,
  image asset readiness, Biome icon readiness, and local-core compatibility.
  The new freeze is
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/034800/fresh-db-freeze.json`
  with scope hash
  `sha256:a86cfd103710a9933472ebade26c3e832584dc4dcf1526312351aff76ae92bb8`.
- The fresh DB confirms `23` Item rows without an active image/fallback row,
  `2` managed Item rows without source/original fallback, `4` NPC rows without
  image, `1` Projectile row without image, and `47` Biome rows (`40` managed,
  `7` Wiki fallback, `0` invalid/missing). The two provenance rows are exactly
  `FallenStar` (`75`) and `SeveredHandBanner` (`3398`); they remain quarantined.
- Fresh sentinel identities are NPC `None2` (`76`), `None3` (`146`),
  `DD2AttackerTest` (`547`), `None` (`768`), and Projectile `None` (`6697`).
  They are not displayable asset gaps. No broken cached URL was found.
- Read-only API probes returned `200` for Item detail, NPC aggregate, Biome
  detail/list, and Projectile list. The standard local smoke finished `5/5`;
  a representative managed Item image returned real `200` PNG bytes through
  the origin, admin, and public paths. MinIO and the `9000 -> 19000` compatibility
  proxy were started only for this read-only byte check and must not be treated
  as a data-write authorization.

##### Validation

- Fresh reports: image lineage, asset readiness, Biome icon readiness, and
  local-core compatibility report were generated under the `034800` run root.
- API smoke: Item, NPC, Biome, and Projectile probes all returned `200`;
  `reports/local-start/smoke-20260821-040341.json` reports `passed=5` and
  `failed=0` with real managed image bytes.
- No crawler, external request, image download/upload, permit, packet, SQL
  mutation, staging, commit, cleanup, or discard was performed.
- No projection proposal was generated: the existing Item proposal builder
  requires the private local-stack config plus a prior exact lineage apply
  bundle and Owner authorization artifacts. This fresh report-only freeze does
  not synthesize or reuse those artifacts.

##### Next Safe Action

- Use only the new freeze scope hash for independent read-only proposal
  generation. Keep Item projection, NPC/Projectile/Armor projection contract,
  Biome ownership, and the two provenance quarantine decisions separate; stop
  before any apply or new authorization.

#### Full Managed-Prefix Rebaseline (2026-08-21 09:51 CST)

##### Status

`active`

##### Result

- The previous post-apply NPC/Projectile not-ready report used an incomplete
  environment policy containing only Item prefixes. A fresh read-only rerun with
  all configured `items`, `npcs`, `projectiles`, `buffs`, and `bosses` prefixes
  corrected the verdict without any database mutation.
- Current image lineage is `6/7` ready: Items, NPCs, Projectiles, Buffs, Bosses,
  and Armor are ready. NPC projection is `758/758` managed; Projectile
  projection is `1110/1110` managed. Biome is the only remaining lineage
  blocker, with missing maint/relation image tables and projection image field.
- The NPC read-only comparison found `758` relation rows and no changed rows;
  no NPC authorization or apply was created. The same policy correction means
  no Projectile authorization is needed either.

##### Validation

- Fresh lineage and asset readiness reports are under
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/095109-full-policy/`.
- Image lineage summary: `readyEntityTypes=6`, `notReadyEntityTypes=1`.
- Asset readiness still reports a separate Item blocking condition for `2119`
  managed/cache rows without original/source fallback evidence, plus the known
  `23` quarantined Item gaps and NPC sentinel warnings. This is not silently
  converted into a projection repair.

##### Next Safe Action

- Keep NPC and Projectile lanes closed with no new permit. Resolve only the
  Biome ownership/schema contract as a separate design/migration decision, or
  leave it explicitly blocked; do not alter current Biome tables in this image
  repair task.

#### Biome Ownership Contract Audit (2026-08-21 09:54 CST)

##### Status

`active`

##### Result

- Fresh SELECT-only schema/data evidence is under
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/095414-biome-contract/`.
- The active Biome set is `47` rows: `40` managed icons and `7` Wiki fallback
  icons. The only image-bearing table present is
  `terria_v1_local.biomes`; the planned maint/relation/projection ownership
  surfaces are absent.
- The exact contract remains fail-closed:
  `terria_v1_maint.maint_biome_images -> terria_v1_relation.relation_biome_images
  -> terria_v1_relation.projection_biomes.icon_url -> terria_v1_local.biomes.icon_url`.
  Scope hash: `sha256:d38fa96c28cbbbb5882ef1f8a7aaf854848b007cac025b04f72cce55368cf1f2`.

##### Validation

- Schema presence query returned only `terria_v1_local.biomes`.
- Biome row snapshot and contract JSON parsed successfully.
- No migration, table creation, crawler, external request, image transfer,
  permit, or database write was performed.

##### Next Safe Action

- The image repair chain is complete for all currently owned image contracts
  (`6/7`). Biome requires a separately approved schema/ownership design and
  migration packet before any new table or projection field may be created.

#### Complete Image-Chain Closure (2026-08-21 10:20 CST)

##### Status

`active`

##### Result

- The Biome schema/ownership lane was executed through a new canonical
  operation, `canonical-biome-image-contract-apply`, bound to the exact 47-row
  local snapshot (`scopeHash sha256:8457bb01b188885f1896d0b1fe7965d725a818adf60b98c98ba02b964bd12092`).
- Decision `canonical-biome-image-contract-apply-20260821-admin-01` was
  authorized and consumed. The operation created and populated
  `terria_v1_maint.maint_biome_images`,
  `terria_v1_relation.relation_biome_images`, and
  `terria_v1_relation.projection_biomes`, then read back `47/47/47` rows.
  Existing local icon URLs were preserved as evidence; no Wiki fetch or image
  upload occurred.
- The image lineage auditor now recognizes the Biome ownership chain and allows
  the seven documented Wiki fallback icons. All seven entity types report ready.

##### Validation

- Final lineage report:
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/102025-closure-final/image-source-lineage.json`
  reports `readyEntityTypes=7`, `notReadyEntityTypes=0`.
- Biome readiness remains `47` total, `40` managed, `7` Wiki fallback, `0`
  invalid, `0` missing.
- Focused Spring image tests and read-only/schema contract tests passed.
- Asset readiness remains blocked separately by `2119` cached Item rows without
  original/source fallback evidence, with 23 quarantined Item gaps and known
  stale verification warnings. The local-core smoke remains non-green on
  unrelated non-image projection-field gaps.

##### Next Safe Action

- Treat image lineage as closed (`7/7`) while keeping asset provenance freshness
  and local-core field parity as separate follow-up work. No further image
  authorization is required in this lane.

#### Post-Repair Read-Only Rebaseline (2026-08-21 09:13 CST)

##### Status

`active`

##### Result

- Fresh SELECT-only audits completed against loopback MySQL `127.0.0.1:13306`.
  Reports are under
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/091317/`.
- Current Item counts are `6159` core rows, `6136` with images, `23` missing
  image rows; relation has `6131` structured image rows and projection has
  `6131` image rows, but `0` are currently proven managed.
- The new post-repair classification records the two completed identities,
  `FallenStar` (`75`) and `SeveredHandBanner` (`3398`), as resolved and removes
  them from the active provenance/projection quarantine. The `15`
  `legacy_unowned_image_contract` rows and `8` `ZH_RECIPE_*` rows remain
  quarantined and are not candidates for image synthesis.
- Proposal generation is blocked by missing historical lineage artifacts:
  `canonical-item-image-lineage-apply.input.json`, `.result.json`,
  `.snapshot.json`, and `.packet.json` are not present in the repository. The
  builder correctly refuses to synthesize or reuse them, so no Item projection
  proposal or new authorization artifact was created.

##### Validation

- `image-source-lineage-report.mjs --source=db`: completed; Items, NPCs,
  Projectiles, Armor, and Biomes remain not ready for the reasons recorded in
  the report; Buffs and Bosses remain ready.
- `image-asset-readiness-audit.mjs --source=db`: completed with the expected
  Item `23`-row warning and NPC sentinel warnings; no broken cached URLs.
- `audit-biome-icon-readiness.mjs`: completed; schema ownership blockers remain
  explicit and no database mutation was attempted.
- `item-image-gap-detail-snapshot.mjs`: completed for the post-repair
  classification with `25` historical identities represented (`23` missing plus
  `2` resolved exclusions); the snapshot is read-only.
- No crawler, external request, image transfer, packet, permit, SQL mutation,
  staging, commit, cleanup, or decision replay was performed.

##### Next Safe Action

- Preserve the `091317` evidence and create a new exact lineage owner handoff
  only if the owner authorizes restoration of the missing
  `canonical-item-image-lineage-apply` evidence. A projection proposal must not
  be generated until those artifacts are freshly produced or explicitly
  re-authorized; any changed key/count/prefix requires a new scope hash.

#### Item Lineage And Projection Apply (2026-08-21 09:44 CST)

##### Status

`active`

##### Result

- Recreated the ignored local runtime fingerprint config from the live loopback
  server identity and generated a fresh lineage contract for the existing
  `reports/audit/item-image-lineage-2026-08-01.bundle.json` bundle (`6131`
  identities). The first attempt was rejected because its input bundle path was
  outside the attempt root; it was not authorized or applied. A new attempt was
  generated with decision
  `canonical-item-image-lineage-apply-20260821-admin-02`, then applied through
  the canonical runner. Result: `COMPLETED`, landing/maint/relation/local all
  `6131`, snapshot row count `43855`; local non-owned `detail` roles preserved.
- A separate read-only Item projection proposal froze `6131` existing
  `projection_items` rows and calculated `332` changes from active managed
  `relation_item_images.cached_url` values. Proposal key-set hash is
  `sha256:45631dd4d1de9095f523101e0ebc283233f8e847d87484930e1937c31b4d2359`.
  The exact image-only update completed under decision
  `canonical-item-image-projection-apply-20260821-admin-01`; result and permit
  consumption are recorded under the attempt root
  `reports/authorization/canonical/item-image-projection-apply/b37bc053dceeb7c6be41a70deaaa9936c653df4e4624bd88c3fcd0cfc6f3cc5e/`.
- No INSERT/DELETE, source-table write, local reverse-copy, crawler, external
  request, image transfer, or old decision replay occurred.

##### Validation

- Fresh lineage report with `--attempt-root` at
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/094612-post-item-projection-evidence/`
  reports `items`, `buffs`, `bosses`, and `armor_sets` ready (`4/7`); Item
  projection is `6131/6131` managed, with no blank rows where core images exist.
- The post-apply default lineage report was intentionally not treated as final
  because it lacked the exact attempt-root evidence binding; the rerun used the
  explicit attempt root and passed.
- Asset readiness remains blocked separately by `2119` managed Item rows with
  no original/source fallback evidence, plus the known `23` quarantined missing
  Item rows and stale verification warnings. No original URL backfill was mixed
  into the projection lane.
- Local-core compatibility smoke remains non-green on unrelated non-image Item,
  NPC, and Boss projection fields; these are recorded as separate follow-up
  work, not folded into image repair.

##### Next Safe Action

- Generate a fresh independent NPC projection proposal for the `758` relation
  image identities, keeping four sentinel/no-image rows quarantined; then do the
  same for Projectile (`1110` identities, one sentinel). Armor is now lineage
  ready from its existing managed arrays; Biome remains a schema/ownership
  contract blocker and must not receive a database migration in this lane.

#### Fresh Image Closeout Verification (2026-08-21 12:33 CST)

##### Status

`active`

##### Result

- Fresh read-only evidence under
  `reports/runtime/local-data-chain-closure/20260821/remaining-image-repair/122523-closure-verified/`
  reports all seven image lineage contracts ready. Biome maint, relation, and
  projection layers each read back 47 active rows; the core set remains 40
  managed icons plus seven Wiki fallback URLs, with no invalid or missing URL.
- Biome image DDL now belongs to the canonical maint/relation/projection schema
  modules. `canonical-biome-image-contract-apply` no longer executes DDL before
  its row transaction, and the canonical schema migration executes and verifies
  `maint_biome_images`, `relation_biome_images`, and `projection_biomes`.
  See git for code-level diff details.
- The stack restarted from the existing ignored complete config and is live on
  backend `18091`, public `5177`, and admin `3004`. Read-only Item, NPC, and
  Biome endpoints returned 200. Item sample coverage was 20/20 and the NPC
  sample image was present. The API exposes 40/47 Biome icons because its
  response sanitizer intentionally suppresses the seven non-mirrored Wiki
  fallbacks; a GET does not perform an external fetch or image upload.
- Identity quarantine is exact: 15 legacy-unowned Item identities, eight
  `ZH_RECIPE_*` compatibility identities, NPC `None2` (76), `None3` (146),
  `DD2AttackerTest` (547), `None` (768), and Projectile `None` (6697). The two
  prior Item provenance quarantines are resolved and excluded from new scopes.

##### Validation

- Focused Node/schema/authorization suite: 136 tests passed, zero failures.
- Focused backend Item/NPC/Biome/image-sanitizer suite: 69 tests passed, zero
  failures.
- `git diff --check` passed. The exact Item projection evidence hash is current;
  lineage is `readyEntityTypes=7`, `notReadyEntityTypes=0`.
- Local-core compatibility remains non-green only on unrelated fields:
  Item `knockback/sell`, NPC `life_max/knock_back_resist/scale`, and Boss
  `name_zh`. Independent stack verification reaches the known public sitemap
  baseline failure after backend compile succeeds.

##### Residual Risks / Follow-up

- Asset readiness remains blocked separately by 2,119 Item managed/cache rows
  without original/source fallback evidence. Five Item and 388 Buff verification
  timestamps are stale. These require new exact provenance/freshness scopes and
  must not be mixed into the closed projection lane.
- Mirroring the seven Biome Wiki fallbacks is a separate external-request and
  image-transfer task. Until then, lineage is ready but public Biome image
  coverage is 40/47. No response-sanitizer bypass is permitted.

#### Fresh 13306 Read-Only Rebaseline (2026-08-22 02:18 CST)

##### Status

`active`

##### Result

- Fresh evidence is under
  `reports/runtime/local-data-chain-closure/20260822/remaining-image-repair/021851-db/`.
  Against the maintained MySQL port `127.0.0.1:13306`, Item projection is
  `5800/6131` managed under the active policy, NPC is `0/758`, Projectile is
  `0/1110`, and Armor is `0/88`. Biome has `47/47` owned rows but only `7`
  managed object paths; the seven Wiki fallback rows remain evidence-only.
- Asset readiness remains warning-only: Item has `23` missing rows and `5`
  stale verification timestamps; Buff has `388` stale timestamps; NPC has `4`
  sentinel rows without an image. The failed first lineage connection to the
  default `3306` port is invalid connectivity evidence and is not used.
- No crawler, external request, image transfer, authorization replay, packet,
  permit, SQL mutation, staging, commit, or cleanup was performed.

##### Validation

- `image-source-lineage-report.mjs --source=db`,
  `image-asset-readiness-audit.mjs --source=db`, and
  `audit-biome-icon-readiness.mjs` completed with explicit `TERRAPEDIA_DB_*`
  values targeting `13306`.
- Current lineage summary is `readyEntityTypes=3`, `notReadyEntityTypes=4`.
- `local-core-compat-smoke-check.mjs --throw-on-failure=false` remains
  non-green on the existing unrelated projection-field parity gaps.
- Focused image audit suites passed `44/44`; `git diff --check` passed. Read-only
  API smoke returned `200` for `/api/public/biomes`, `/api/public/items/1`, and
  the maintained NPC list route `/api/npcs?page=1&limit=1`. The guessed
  `/api/public/npcs/1` path is not supported and its `404` is not a data finding.
- A read-only projection drift inventory was frozen at
  `reports/runtime/local-data-chain-closure/20260822/remaining-image-repair/021851-db/projection-drift-inventory.json`.
  Row-set hashes are Item `7279f74e...`, NPC `452a2888...`, Projectile
  `7d6e8e4b...`, and Armor `0`-prefix legacy arrays (full hashes are in the
  report). These hashes are inputs only; any proposal or apply must regenerate
  them after authorization and reject drift.

##### Next Safe Action

- Treat the `021851-db` reports as the current read-only baseline. Build
  separate, freshly scoped proposals for Item/NPC/Projectile projection
  normalization only after identity-level before snapshots and new owner
  authorization. Do not reuse prior projection decisions or the historical
  `7/7` report.
- Keep the `23` Item gaps, four NPC sentinels, one Projectile sentinel, and
  five Item / `388` Buff stale-verification rows as explicit quarantine or
  warning categories; do not synthesize images or refresh timestamps in the
  projection lane.
- The existing `sync-maint-to-relation.mjs --apply=false` proposal completed
  read-only and produced `reports/relation/relation-audit-2026-08-22.json` with
  source image counts Item `6131`, NPC `758`, Projectile `1110`, Buff `388`,
  and Armor `183`. Its apply path clears and rebuilds broad relation/projection
  tables, so it is not an acceptable image-only repair operation. No apply was
  attempted; a dedicated canonical image projection operation is required for
  the NPC/Projectile/Armor lanes.
- Final read-only reruns after the proposal probe remain unchanged at
  `readyEntityTypes=3`, `notReadyEntityTypes=4`; asset readiness remains
  warning-only with Item `23` missing, Item stale `5`, Buff stale `388`, and
  NPC missing `4`. The final reports are `final-lineage-rerun.json` and
  `final-readiness-rerun.json` in the same `021851-db` directory.
- A fresh local legacy-origin repair completed under scope
  `sha256:50b83b418aaa625fba536d096dc0202ff197b788ec78e77f5ba50689566a50a2`.
  It changed only the MinIO origin from `9000` to `19000` while preserving
  object paths and bytes: NPC relation/projection `758/758`, Projectile
  `1110/1110`, Armor relation `183`, and Armor projection arrays
  `male/female/special = 88/87/4`. The sentinel identities remained
  quarantined (`NPC 4`, `Projectile 1`). Result evidence is
  `domain-image-origin-repair.result.json`.
- Post-repair lineage now reports `readyEntityTypes=6` and
  `notReadyEntityTypes=1`; the only lineage blocker is Item projection
  evidence/prefix drift. API smoke for Item, Biome, and NPC list returned 200.
  Asset readiness remains warning-only for Item `23` missing plus stale `5`,
  Buff stale `388`, and NPC sentinel `4`.
- Added and tested the bounded domain image projection contract at
  `pipelines/relation/domain-image-projection-contract.mjs`. Its read-only
  proposal against the live database is
  `domain-image-projection-proposal.json`: NPC changed `0` rows with `4`
  quarantined sentinels, Projectile changed `0` rows with `1` quarantined
  sentinel. The zero-change result is expected because current relation URLs
  are legacy `localhost:9000` paths outside the active managed-prefix policy;
  no projection DML is authorized until those object/source paths are migrated
  under a separate image-transfer scope.
- Item legacy-origin repair then completed under scope
  `sha256:282505ce4ca6b2d8348b4bfe71ea28848e87a8ba5d3c7408acf51d3bcb6f5d2a`:
  relation and projection each updated `331` old-origin rows; the two resolved
  provenance identities remained excluded. Item lineage now has `6131/6131`
  managed projection rows, with only fresh canonical evidence binding left.

#### Resume Handoff Reconciliation (2026-08-22 03:22 CST)

##### Observed

- Branch, worktree, HEAD, upstream relation, and staged state match the prior
  handoff: `feat/supplementary-domains-readiness`, `/home/lolben/TerraPedia`,
  `2644d411d2ff48be41b6709dca1bb891cb3d2452`, ahead `19`, no staged paths.
- The worktree reports `626` untracked paths rather than the prior summary's
  roughly `315/335`. Read-only classification is `reports=322`, `data=243`,
  `pipelines=46`, `docs=14`, `services=1`; these are existing generated or
  evidence paths. No active Item-table writer was observed.

##### Disposition

- Classified as a stale handoff count, not a scope conflict. No cleanup,
  discard, staging, commit, or reset was performed. The Item image evidence
  refresh remains limited to `projection_items.image`, with no Wiki crawl,
  MinIO transfer, freshness update, or quarantine change.

##### Next Safe Action

- Continue with the plan's test-first implementation of
  `item-image-origin-repair-evidence-adapter.mjs`; then generate a fresh
  `13306` read-only freeze and new decision-derived evidence root. Stop on any
  key/count/hash/target drift and leave the entry `active`.

#### Prepared Session Handoff (2026-08-22 03:33 CST)

##### Observed

- Repository: `/home/lolben/TerraPedia`; branch:
  `feat/supplementary-domains-readiness`; HEAD:
  `2644d411d2ff48be41b6709dca1bb891cb3d2452`; upstream relation: ahead `19`,
  behind `0`.
- Worktree: `95` tracked modified paths, `628` untracked paths, `0` staged;
  no cleanup, discard, reset, stash, commit, or push was performed. The
  untracked count includes the pre-existing generated/evidence population plus
  the new adapter/test files; the earlier `626` count was recorded before
  those task files were added.
- Local listeners are present on MySQL `13306`, backend `18091`, public web
  `5177`, admin `3004`, MinIO `19000`, and Redis `6380`.
- The adapter implementation and test are untracked at
  `pipelines/relation/item-image-origin-repair-evidence-adapter.mjs` and
  `pipelines/relation/item-image-origin-repair-evidence-adapter.test.mjs`.
  Tests pass `2/2`; the combined focused Item image suite passes `48/48`.
- `git diff --check` passes. No database write, external request, image
  transfer, freshness update, authorization replay, or permit consumption
  occurred in this handoff.
- A read-only lineage rerun using the historical projection attempt root is
  `reports/runtime/local-data-chain-closure/20260822/pre-resume-lineage.json`.
  It reports `6/7` and classifies the old evidence as
  `item_image_projection_after_rows_drifted`; this confirms that historical
  projection evidence must not be reused after the completed origin repair.

##### Recorded

- The execution-ready scope remains
  `docs/superpowers/plans/2026-08-22-item-image-evidence-refresh.md`: only
  `terria_v1_relation.projection_items.image`, exact eligible Item identities,
  zero-change apply evidence, and final lineage validation. Wiki crawling,
  MinIO transfer, source/relation DML, freshness timestamps, quarantines,
  NPC/Projectile/Armor/Biome/Buff/Boss work, commit, and cleanup remain out of
  scope.
- Completed origin-repair evidence remains bound to
  `reports/runtime/local-data-chain-closure/20260822/remaining-image-repair/021851-db/item-image-origin-repair.result.json`
  with scope `sha256:282505ce4ca6b2d8348b4bfe71ea28848e87a8ba5d3c7408acf51d3bcb6f5d2a`.
- Adapter tests prove rejection of changed identity, relation record key,
  projection-before hash, missing quarantine identity, and unmanaged URL.

##### Unknown / Not Run

- The adapter has not been wired into
  `pipelines/relation/build-item-image-projection-proposal.mjs` or the generic
  contract path. No new `6131`-row freeze or scope hash exists yet.
- No new decision-derived attempt root, execution manifest, request, owner
  input, packet, dispatch permit, canonical result, or final `7/7` lineage
  report exists for this refresh.
- The current database key set and zero-change count must be re-read from one
  fresh read-only transaction before any authorization sequence; the historical
  `05af95...` projection attempt is invalidated by after-row drift.

##### Next Safe Action

1. Read the active plan and integrate the adapter output as the sole
   origin-repair-bound input to the Item proposal runner, preserving generic
   callers and adding the required focused tests.
2. Re-freeze `127.0.0.1:13306` and assert exactly `6131` eligible keys,
   managed relation/projection values, excluded `FallenStar` and
   `SeveredHandBanner`, and `changedRowCount=0`. Generate a new scope hash and
   attempt root; never overwrite an existing attempt.
3. Generate the fresh manifest/request/owner-input/packet/permit with a new
   decision identity, then run the canonical zero-change apply. Stop and record
   failed evidence on any drift; do not widen scope or ask for an interactive
   decision.
4. Run final lineage/readiness/API/focused-test validation and update this
   entry plus `docs/devlog/current.md`; leave status `active` until the final
   evidence proves `7/7`.

##### Validation

- `node --test pipelines/relation/item-image-origin-repair-evidence-adapter.test.mjs`
  — `2/2` pass.
- The combined focused command covering the Item image proposal, contract, DB,
  apply, lineage audit, and adapter tests — `48/48` pass.
- `git diff --check` — pass.

##### Fresh Freeze And Adapter Integration (2026-08-22)

- The proposal runner now accepts the explicit `origin-repair-bound` evidence
  adapter path without reading historical Item lineage packets. The projection
  contract and lineage auditor validate the origin-repair result hash, scope,
  quarantine identities, relation/projection before hashes, and the explicit
  no-external-request/no-freshness-update flags. Generic historical lineage
  callers remain supported. See git for code-level diff details.
- Fresh read-only evidence was attempted against MySQL `127.0.0.1:13306` and
  recorded at
  `reports/runtime/local-data-chain-closure/20260822/item-image-evidence-refresh/035920-freeze/blocked-fresh-db-freeze.json`.
  The transaction was rolled back without DML. It found `6131` active relation
  primary-icon identities, while exact quarantine exclusion leaves `6129`;
  this conflicts with the plan's mandatory `6131` eligible count and blocks
  proposal/authorization generation.
- No proposal, execution manifest, request, packet, permit, apply, external
  request, image transfer, freshness update, or database write occurred. The
  historical projection attempt remains invalid and was not reused.

##### Validation (2026-08-22)

- Focused Item proposal/contract/adapter/lineage command — `37/37` pass.
- `git diff --check` — pass.

##### Next Safe Action (2026-08-22)

- Keep this entry `active`. The plan is repaired to use the accepted `6129`
  identity scope while retaining the two exact quarantine rows outside the
  proposal. Create a new freeze and decision-derived attempt root from that
  repaired boundary; do not reuse the blocked root or widen the proposal.

##### Final Item Image Evidence Refresh (2026-08-22 04:52 CST)

- The repaired plan completed its fresh read-only freeze at
  `reports/runtime/local-data-chain-closure/20260822/item-image-evidence-refresh/042958-6129-freeze/`.
  The freeze scope hash is
  `sha256:47ad9b0927707f490aee886bfadf462e3634f551114f3a262559eb0fadb2c423`;
  relation total is `6131`, accepted target is `6129`, and the exact two
  quarantined identities remain outside the proposal.
- The new decision-derived attempt is
  `reports/authorization/canonical/item-image-projection-apply/8e31d3c6d2e178b1985c05b43efa18a408a84afd98ed2ec6a7fd176eca891026/`.
  Proposal-read decision is
  `canonical-item-image-projection-proposal-read-20260822-admin-13`; apply
  decision is `canonical-item-image-projection-apply-20260822-admin-13`.
  `result.json` SHA-256 is
  `sha256:04d24526f29e73741e0e66cc8221262788aec288f090acb40bad21ae527bc2cf`.
- Canonical apply completed with `targetRowCount=6129`,
  `changedRowCount=0`, `dmlAttempted=false`, and `6129` rows read back before
  commit. The apply is bound to the completed origin-only repair result and
  records `externalRequests=false` and `freshnessUpdates=false`.
- A fresh lineage run bound to this exact attempt reports
  `readyEntityTypes=7` and `notReadyEntityTypes=0`; Item is
  `contractReady=true`. Fresh readiness is warning-only: Item missing `23`,
  Item stale `5`, Buff stale `388`, NPC missing `4`, with zero blocking
  reasons. The maintained Item, NPC list, and Biome API smoke requests all
  returned HTTP `200`.
- Focused Item/image validation now passes `66/66`, including the new
  origin-bound authorization bundle and apply-lineage regression tests.
  The full authorization file has three pre-existing unrelated failures
  (retired-path and operation-catalog expectations); those are not part of
  this Item closure and remain explicitly unmodified.
- The original `6131` mandatory-count contradiction is historical evidence at
  `035920-freeze/blocked-fresh-db-freeze.json`. The plan was repaired to model
  relation total `6131` separately from accepted scope `6129` before the
  successful authorization sequence. No prior failed permit or stale
  projection attempt was reused.

##### Remaining Data-Chain Execution (2026-08-22 08:05)

- The formal remaining-chain run is recorded at
  `reports/runtime/local-data-chain-closure/20260822/remaining-chain/072812-remaining-chain/`.
- Task 0 read-only evidence completed. NPC source treatment quarantines `17`
  unclassified-zero rows and `113` group-page variant rows. Item source dry-run
  found `1500` eligible candidates, `1606` planned rows, `1295` duplicates,
  `311` potential inserts, and `522` blocked candidates; no source apply was
  authorized or executed.
- Admin checks/tests and public checks pass after deterministic contract repairs.
  The final quality gate is `323/328` with five missing historical
  authorization-fixture failures, preserved as variance evidence.
- The remaining DB-backed lanes are blocked because loopback MySQL
  `127.0.0.1:13306` is unavailable and cannot be started without elevated
  service authority in this session. No NPC/Boss loot apply, Item source apply,
  Projectile mutation, DB readback, or runtime parity claim is valid. Keep this
  parent entry `active` and begin the next run with a new DB freeze after MySQL
  restoration; do not reuse this run's counts for authorization.
