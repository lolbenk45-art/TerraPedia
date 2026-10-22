# Three-domain full recrawl handoff - 2026-10-13

## Status

`closed`

## User acceptance target

- User lowered the completion bar for this delivery: perform one fresh full Wiki recrawl for Armor, Buff, and Shimmer, run the minimum isolated pseudo-ingestion/readback evidence that each lane supports, and deliver the source hashes, counts, progress terminal state, and cleanup evidence. Production changed-only scheduler acceptance, natural ticks, soak, restart, and later update repair are follow-up work.
- `productionSourceDelta=false` is acceptable for this delivery when the remote Wiki revision/content is unchanged. It must be recorded as known upstream no-version-change behavior, not as a recrawl failure.
- No formal `terria_v1_local`, `terria_v1_maint`, or `terria_v1_relation` write is allowed in this handoff. All pseudo-ingestion writes must use run-derived schemas and be cleaned to zero.

## Execution allocation

Execute serially from clean worktrees created from local `main` merge `844c3668`:

| Domain | Suggested worktree | Suggested branch | Redis | Action/progress | MySQL run schema prefix |
|---|---|---|---|---|---|
| Armor | `/home/lolben/TerraPedia/.worktrees/recrawl-armor-20261013` | `ops/recrawl-armor-20261013` | `127.0.0.1:6380/DB20` | `domain-source-armor-sets` / `data/generated/domain-source-armor-sets-progress.latest.json` | `terria_v1_automation_acceptance_arm_<runKey>_{local,maint,relation}` |
| Buff | `/home/lolben/TerraPedia/.worktrees/recrawl-buff-20261013` | `ops/recrawl-buff-20261013` | `127.0.0.1:6380/DB22` | `buff-page-immunity-refresh` / `data/generated/fetch-wiki-buffs-progress.latest.json` | `terria_v1_automation_acceptance_buf_<runKey>_{local,maint,relation}` |
| Shimmer | `/home/lolben/TerraPedia/.worktrees/recrawl-shimmer-20261013` | `ops/recrawl-shimmer-20261013` | `127.0.0.1:6380/DB24` | `domain-source-shimmer` / `data/generated/domain-source-shimmer-progress.latest.json` | `terria_v1_automation_acceptance_shm_<runKey>_{local,maint,relation}` |

- MySQL endpoint: `127.0.0.1:13306`, administrator credentials from the local operator config; do not print or copy the password into reports.
- Formal database names remain `terria_v1_local`, `terria_v1_maint`, and `terria_v1_relation`; they are read-only targets for this handoff.
- No production HTTP runtime is required for source capture or direct isolated adapters. Do not use Armor `18104`/DB14 or Buff `18105`/DB15. If a lane requires a temporary HTTP process, reserve and verify free ports `18120` Armor, `18122` Buff, and `18124` Shimmer; stop the process after its readback.
- Shared raw source paths must be isolated per run with `TERRAPEDIA_SHARED_DATA_ROOT` under `.local/tmp/full-recrawl-20261013/<domain>/<runKey>/shared-data`; do not let three lanes write the shared `/home/lolben/data/terraPedia` root concurrently.

## Mandatory preflight

1. Start/verify MySQL on `127.0.0.1:13306` and Redis on `127.0.0.1:6380`. The latest read-only probe saw neither listener, so execution must stop until `mysqladmin ping` and Redis `PING` pass.
2. Confirm DB20, DB22, and DB24 are empty with `DBSIZE`; never flush a non-empty database. Inspect and stop if a key already exists.
3. Verify no crawler or refresh writer is running and verify each canonical progress file is not `running` from another action.
4. Recreate a clean worktree from local `main` `844c3668`; do not execute from the dirty primary worktree or the dirty historical Armor/Buff/Shimmer worktrees.

## Required contract repair before execution

The requested Redis allocation cannot be passed to the current runners unchanged:

- `pipelines/automation/automation-database-contract.mjs` currently accepts DB1-13 and DB18 only.
- Buff current-source replay and wrapper hardcode DB18.
- The retained Armor isolated T1 helper hardcodes DB13.
- Generic acceptance manifests accept a numeric DB only after the contract check.

Before using DB20/22/24, make a small test-covered allocation repair: allow explicit reserved extras `20`, `22`, and `24`; bind Armor to 20, Buff to 22, and Shimmer to 24; update wrapper/runner assertions and tests; preserve rejection of formal/reserved DB14-18 except the explicitly retained historical DB18 lane. Do not silently run with DB13 or DB18 as a fallback because that would invalidate this handoff's resource isolation.

## Full recrawl scope

### Armor

- Full source lane: `Module:ArmorSetBonuses` through `pipelines/fetch/fetch-wiki-armorsetbonuses.mjs`, the full Chinese armor attribute table through the maintained Armor attribute fetcher, and the configured Armor image/source inputs required by the current Armor source contract. A six-page diagnostic recrawl is insufficient.
- Required source evidence: raw bytes, page/revision IDs, source hashes, parsed set/tuple counts, attribute-row count, image/source counts, report, and terminal progress.
- Minimum pseudo-ingestion: run the fresh source-bound Armor isolated T1 path against the three run-derived MySQL schemas and Redis DB20; read back landing/maint/relation/projection counts and hashes; verify temporary schemas/accounts/Redis keys are zero afterward.
- Existing historical `run-armor-t1-isolated` evidence includes one pass but also many candidate-mismatch failures. Do not reuse its run key or stale candidate; bind a new run identity to this fresh recrawl.

### Buff

- Full source lane: `pipelines/fetch/fetch-wiki-buffs.mjs` with `--resume-mode=fresh`, all configured languages, page-immunity collection enabled, and snapshot retention. This means the full 400-record Buff source/page scope; the existing current-source replay for Buff IDs `153` and `70` is bounded evidence and does not satisfy this full run.
- Required source evidence: Template/GetBuffInfo revision/hash, localized source hashes, all page-immunity progress terminal state, parsed count, unresolved/error count, raw/parsed/report paths.
- Minimum pseudo-ingestion: feed the fresh 400-record capture into the existing real-snapshot isolated Buff chain with run-derived schemas and Redis DB22; read back landing `400`, maint/relation/projection counts and dependency summaries; verify cleanup.
- Do not use production Buff `18105/DB15`, formal databases, DB13, DB14, DB16, or DB18 for this delivery.

### Shimmer

- Full source lane: fetch the `微光` page with revision, sections, rendered HTML, all linked title/langlink evidence, then build and verify a fresh content-addressed generation with all six expected scopes: four Shimmer transform tables plus `world_contexts` and `entity_source_snapshots`. The existing 2026-09 generation is historical and cannot be reused as the fresh result.
- Required source evidence: raw/revision/section/html hashes, langlink evidence, generation ID, manifest/data-bundle hashes, scope counts, current-pointer verification, terminal progress, and no unresolved/error rows hidden as success.
- Current canonical generation pipeline requires its frozen input contract and authorized dispatch context. A manual full-recrawl session must either provide a fresh exact read-only source/replay authorization or first add a bounded manual source-generation lane that does not consume production scheduler authority. Do not fabricate a permit or bypass the contract.
- Minimum pseudo-ingestion, if the isolated Shimmer six-scope runner is available after that gate: use MySQL run-derived schemas and Redis DB24, verify six-scope partition/fences, read back all six scopes, and clean all temporary resources. If only the source-generation lane is available, report Shimmer as source-recrawl complete and isolated-import pending rather than claiming the full pseudo-ingestion result.

## Completion artifact set

For each domain, keep a private run root under `.local/tmp/full-recrawl-20261013/<domain>/<runKey>/` containing:

- `source-report.json` and raw/parsed/generation descriptors
- canonical progress JSON with final `status=completed` or `failed`
- source/revision/content SHA-256 values and record counts
- isolated acceptance/readback artifact with `formalDatabaseWrites=false`
- cleanup artifact showing zero temporary schemas, accounts, Redis keys, and child processes
- a short handoff summary that explicitly records `productionSourceDelta=false` when revisions are unchanged

Only after all three domains have fresh source evidence should the parent handoff be marked complete. Production scheduler activation and future update repair remain separate follow-up work.

## Pre-execution blockers (resolved)

- MySQL `13306` and Redis `6380` were started in isolated user-owned state for the recrawl runs and stopped after readback.
- Redis DB20/22/24 were added as explicit domain allocations in the tested contract.
- Shimmer source generation and the six-scope isolated maintained-chain runner completed; unresolved references remain explicit in isolated evidence.
- Dirty historical worktrees were not used for recrawl execution; the clean isolated execution branch contains the maintained-chain runners.

## Execution result - 2026-10-13

- Runtime was restored in isolated local state: Redis `127.0.0.1:6380` with DB20/22/24 empty before and after execution; MySQL `127.0.0.1:13306` used a temporary restore datadir from the verified full-backup SHA-256. The temporary MySQL instance and all crawler children were stopped after readback.
- Allocation contract repair was applied in the execution branches and focused contract tests passed (`28/28`). DB20, DB22, and DB24 are explicitly reserved for Armor, Buff, and Shimmer; DB14-17, DB19, DB21, DB23, and DB25 remain rejected.
- Armor fresh source evidence is complete under `.local/tmp/full-recrawl-20261013/armor/arm_20261013a/`: Module:ArmorSetBonuses revision `964993` parsed `64` records; Chinese armor page revision `2026-04-04T07:46:03Z` parsed `88` sets; armor attribute page revision `258080` parsed `237` rows; image/source fetch parsed `431` images with zero warnings. The live parser needed two source-wording compatibility cases (`伤害+暴击`, `仆从上限/哨兵上限`), covered by focused tests (`16/16`). Armor monitor progress files end in `completed`. The initial Armor isolated artifact proved DB20 binding, read-only snapshot verification, rollback/commit/restore probes, and cleanup, but did not contain row-count readback; that limitation is corrected by the 2026-10-14 source-evidence materialization artifact below, with `formalDatabaseWrites=false`.
- Buff fresh source evidence is complete under `.local/tmp/full-recrawl-20261013/buffs/buf_20261013_full/`: `Template:GetBuffInfo` revision timestamp `2026-08-22T05:46:54Z`, `400/400` records, `313` buffs, `87` debuffs, all `400` page-immunity facts, `en` and `zh` localization hashes, and raw page descriptors `311/311` with zero errors. `--resume-mode=fresh` was used. Minimal isolated pseudo-ingestion on Redis DB22 read back landing/maint/relation/projection `400/400/400/400`; cleanup is zero and `formalDatabaseWrites=false`.
- Shimmer raw source and generation evidence is complete under `.local/tmp/full-recrawl-20261014/shimmer/shm_20261014_full/`: page `微光`, page ID `26209`, revision `252716`, `10` sections, HTML length `631057`, `823/823` langlinks resolved, and fresh generation `51608db4260fbd3949f188e7bd06e9f68ca20d545eb3aa64b3413b4dd7f9affd` with manifest/data-bundle hashes recorded. The generated counts are context `1`, item transforms `283`, decraft rules `248`, entity transforms `121`, NPC transforms `29`, plus explicit `world_contexts` and `entity_source_snapshots` scope descriptors. Manual admin-authorized isolated pseudo-ingestion passed on DB24 across all six scopes; unresolved titles remain explicit as `partial` rows (`796`). Canonical formal import was not executed.
- Durable evidence artifacts: Armor `source-report.json`, the original snapshot/probe `isolated-pseudo-ingestion.json`, and the amended `isolated-pseudo-ingestion-v2.json` plus `row-readback.json`; Buff `source-report.json`; Shimmer `source-report.json` and `generation-contract/generation-evidence.json`. The handoff remains `active` only for the separately gated Shimmer authorized six-scope import and later production acceptance work.

## Armor execution continuation - 2026-10-13 22:14 CST

- A fresh Armor run `arm_20261013b` supersedes the earlier diagnostic run for this execution. It captured `Module:ArmorSetBonuses` revision `964993` (`64` parsed records), the Chinese armor page revision `2026-04-04T07:46:03Z` (`88` parsed sets), and `Guide:盔甲属性表` revision `258080` (`237` parsed rows). The image lane fetched all `64` stable Armor identities and produced `431` image/source rows with `431` image revision timestamps and `0` warnings.
- Raw, parsed, HTML, wikitext, and image evidence hashes plus source counts are recorded in `.local/tmp/full-recrawl-20261013/armor/arm_20261013b/source-report.json`; source-report SHA-256 is `sha256:4d6d2ed5e42d4ade63ddb48e330e52970af440f43dee2ea971e7402b4484f48c`. The image input is the maintained 64-record Armor identity file with its SHA recorded in the report. All four Armor monitor progress files end in `status=completed`; the image lane is `64/64`, `431` images, and `0` warnings. `productionSourceDelta=false` is recorded as fresh retrieval with unchanged upstream revision/content identity.
- The allocation repair binds Armor explicitly to Redis DB20. The isolated T1 run derived `terria_v1_automation_acceptance_arm_ff4c120a01e8cf54_{local,maint,relation}`, verified the read-only snapshot, and completed rollback/commit/restore probes with `0/0/0`, `1/1/1`, and `0/0/0` counts respectively. The original `.local/tmp/full-recrawl-20261013/armor/arm_20261013b/isolated-pseudo-ingestion.json` remains snapshot/probe-only evidence. A follow-up source-evidence materialization run wrote `armor_source_evidence` into a new run-derived local/maint/relation schema set and independently read back `820` rows in each schema: `module_bonus=64`, `armor_set=88`, `armor_attribute=237`, `armor_image=431`; all three readback hashes are `sha256:e52d4a40c50b506613b34d66aa9515bb7a9e4258baf3489832a555a262017818`. Evidence: `.local/tmp/full-recrawl-20261014/armor/arm_20261014c/row-readback.json` and `isolated-pseudo-ingestion-v2.json`.
- This follow-up proves isolated source-evidence materialization/readback only. It does not claim that formal or production landing/maint/relation/projection business tables each contain `820` rows.
- The first row-readback attempt failed in its harness while comparing equivalent source-count objects with different key order after it had already read back `local=820`; it cleaned all resources. The retry used sorted-key comparison and passed all three independent readbacks.

## Armor business-table pseudo-ingestion continuation - 2026-10-14

- The user authorized an isolated Armor business-chain pseudo-ingestion. The run used `arm_6954199258655fe7` and only run-derived schemas on Redis DB20; standardized Items supplied a temporary dependency closure of `243` positive Armor item IDs. Fresh image evidence used `315` retained completed cache receipts plus `12` fresh Shroomite uploads; the image-cache evidence is recorded in `.local/tmp/full-recrawl-20261014/armor/arm_20261014c/image-cache-evidence.json`.
- The canonical Armor operation was attempted against the isolated candidate and failed closed at the existing ownership contract: relation part rows carry `source_maint_table=maint_items`, outside the current `canonical-armor-ingestion` Armor-owned maint scope. The candidate also records missing fresh Armor attribute/item-effect evidence and unresolved generated/dependency blockers. No formal authorization or production write was created or bypassed.
- A separate explicitly labeled `direct-pseudo-adapter` then materialized the candidate's actual business rows in the run-derived schemas and independently read them back: landing `2`, maint Armor sets `64`, maint Armor images `431`, relation Armor sets `64`, relation set items `494`, relation set images `431`, projection Armor sets `64`. Readback hashes are stored per table in `.local/tmp/full-recrawl-20261014/armor/arm_20261014d/business-pseudo-ingestion-v2.json`; `formalDatabaseWrites=false` and cleanup completed with run-derived schemas/accounts/DB20 keys at zero. MySQL/Redis listeners were retained because a concurrent Shimmer session owned the shared services; the temporary MinIO process and the Armor bootstrap account were cleaned.
- This closes the requested isolated business-table pseudo-ingestion evidence, while canonical operation acceptance remains blocked and formal production ingestion remains unclaimed.
- Independent postflight confirms temporary schema count `0`, temporary account count `0`, Redis DB20/22/24 `DBSIZE=0`, and no Armor fetch/acceptance child processes. The temporary MySQL `13306` and Redis `6380` listeners were stopped after readback. No formal schema or production Armor DB14/18104 write occurred.

## Shimmer continuation - 2026-10-14

- The clean Shimmer worktree `/home/lolben/TerraPedia/.worktrees/recrawl-shimmer-20261013` was advanced from `844c3668` to include allocation contract commit `a4beb6ed` (DB24 binding); its tracked source tree remains clean, with run-generated generation and authorization files retained as untracked outputs.
- Fresh run root `.local/tmp/full-recrawl-20261014/shimmer/shm_20261014_full/` completed `domain-source-shimmer` progress `3/3` with page `微光`, page ID `26209`, revision `252716`, `10` sections, HTML length `631057`, and `823/823` resolved langlinks. Raw SHA-256 is `sha256:5af43d1bed4a7fbe4319aa7d402305e2f0d8e38945f96f970de12a853f61c194`; langlink SHA-256 is `sha256:612436bcd614f88473d0ec419f3cc14768c33ec74ede5cb43cf19d44da585a5a`.
- Fresh content-addressed generation `51608db4260fbd3949f188e7bd06e9f68ca20d545eb3aa64b3413b4dd7f9affd` verified with manifest SHA-256 `sha256:1f64a8ad9d45a9d57a5d92b071a004b08aef1c295c1a642e0ae7ca1e15f6777f` and data-bundle SHA-256 `sha256:43d34f39316fe07fe96ab3f0f66be19e0b7ac5e1ed4d851b85f7f58f6e7909cd`. Scope descriptors are context `1`, item `283`, decraft `248`, entity `121`, NPC `29`, `world_contexts=1`, and `entity_source_snapshots=1`; unresolved title evidence remains explicit at `796`.
- Redis DB24 was verified empty before and after the pseudo-ingestion. The run-derived schemas read back `world_contexts=1`, `entity_source_snapshots=7`, `shimmer_item_transforms=283`, `shimmer_decraft_rules=248`, `shimmer_entity_transforms=121`, and `shimmer_npc_transforms=29` in local/maint/relation with identical per-scope hashes; cleanup is zero. Evidence: `.local/tmp/full-recrawl-20261014/shimmer/shm_20261014_full/isolated-pseudo-ingestion.json`. `canonicalPolicyPacket=false`, `formalDatabaseWrites=false`, and canonical formal import remains separate.
- Final verification recalculated the isolated artifact SHA-256 as `sha256:1cc07f39395dfba1d3b02fcf9d66db108d0020bd1e7e15734a2e9c8391b70d32`, confirmed source progress `completed` at `3/3` with `failedCount=0`, and confirmed all six scope counts and row hashes match across local/maint/relation. The Shimmer-owned temporary MySQL process on `13306` was then stopped and the port is closed. Redis `6380` was left running because its process worktree belongs to the concurrent Armor chain; no Redis flush or stop was performed by Shimmer.
- Fresh focused validation passed `30/30`: `shimmer-structured-parser`, `shimmer-generation-builder`, `shimmer-generation-contract`, and `automation-database-contract`. The broader Shimmer importer suite ran `54` tests with `46` passing and `8` environment-blocked failures because `mysql2/promise` is not installed in this clean worktree; no new source or pseudo-ingestion failure was observed. Full importer validation remains a follow-up dependency task.

## Real Buff maintained-chain continuation - 2026-10-14

- A fresh legacy isolated runner was added in the execution worktree at `pipelines/buff/run-full-recrawl-canonical-isolated-legacy.mjs`. It binds DB22, provisions the run-derived T1 schemas through `runLiveAutomationAcceptance`, and invokes the existing `runBuffCanonicalT1Acceptance` importer/sync chain. The eight-domain T1 runner now owns the unsuffixed path.
- Artifact: `.local/tmp/full-recrawl-20261014/buffs/buf_full_canonical_20261014/isolated-real-ingestion.json`, SHA-256 `sha256:e08894ef8f69edc4807f5ade1e399e20bc5ef4a792dc933e5fb5965695925392`. The maintained chain created `400` Buff rows, read back `400` relation Buffs, `400` projections, and `400` consumer rows; actual child readback was `411` item-Buff relations and `486` inflicting-NPC relations. `13` source-item identities remain unresolved and are listed in the artifact.
- The isolated run ended with `formalDatabaseWrites=false`, `databaseWritesToFormalRuntime=false`, Redis DB22 empty, all three run-derived schemas/accounts removed, and no child processes. Formal schemas were used read-only as the dependency snapshot source.
- This closes the real maintained-chain isolated test for Buff. Armor and Shimmer have separate real maintained-chain continuations below. The isolated ingestion test scope is now complete for all three domains; production automation remains a future source-probe event.

## Real Shimmer maintained-chain continuation - 2026-10-14

- A fresh legacy isolated runner was added at `pipelines/import/run-shimmer-full-recrawl-canonical-isolated-legacy.mjs`. It provisions run-derived T1 schemas through the shared acceptance adapter, binds the verified generation `51608db4260fbd3949f188e7bd06e9f68ca20d545eb3aa64b3413b4dd7f9affd`, and calls the maintained `applyBundleChanges` transaction on the isolated local schema with Redis DB24. The eight-domain T1 runner now owns the unsuffixed path.
- Artifact: `.local/tmp/full-recrawl-20261014/shimmer/shm_full_canonical_20261014/isolated-real-ingestion.json`. Readback counts are `world_contexts=1`, `entity_source_snapshots=7`, `shimmer_item_transforms=283`, `shimmer_decraft_rules=248`, `shimmer_entity_transforms=121`, and `shimmer_npc_transforms=29`; cleanup passed and formal databases were never written.
- The isolated harness explicitly allows the generation's `796` unresolved references so the maintained transaction can be tested end to end; the default canonical importer remains strict and continues to reject unresolved references. No production permit, decision ledger entry, or formal import was consumed.
- Focused validation after the runner and isolated unresolved mode is `64/64` across Shimmer importer and live acceptance tests. Armor remains the only domain in this handoff without a maintained real-chain isolated result.

## Real Armor maintained-chain continuation - 2026-10-14

- A fresh isolated runner was added at `pipelines/relation/run-armor-full-recrawl-canonical-isolated.mjs`. It provisions T1 run-derived schemas and DB20, reads formal local/maint Items through the temporary readonly account, seeds the isolated dependency closure, then calls maintained `runMaintSync` and `runSync` for the fresh Armor-set and image landing payloads.
- Artifact: `.local/tmp/full-recrawl-20261014/armor/arm_full_canonical_20261014/isolated-real-ingestion.json`, SHA-256 `sha256:a6335a6c8447d0373ef3115eeb1120c059795efc2d52a7cea4b581aaf35eed01`. Readback counts are maint Armor sets `64`, maint Armor images `433` (including the two representative rows copied by the T1 snapshot), relation Armor sets `64`, relation set items `494`, relation images `431`, and projection Armor sets `64`; each table has an independent row hash.
- The isolated operation ended `status=passed`, `formalDatabaseWrites=false`, `cleanupPassed=true`, with run-derived schemas/accounts removed and DB20 empty. No Armor formal authorization packet or policy permit was consumed; this proves the maintained business import/sync chain in isolation, not production/canonical policy acceptance.
- The full-recrawl isolated maintained-chain test scope is now complete for Armor, Buff, and Shimmer. Production scheduler activation or natural probe dispatch remains separate and waits for a future real Wiki fingerprint update; it was not triggered by these manual isolated tests.

## Closeout - 2026-10-15

- Result: Armor, Buff, and Shimmer each completed a fresh full source recrawl and a real maintained-chain isolated ingestion/readback using run-derived DB20/DB22/DB24 resources. No formal database write, production scheduler dispatch, permit consumption, or production runtime mutation occurred.
- Acceptance decision: `isolated automated-ingestion acceptance=passed` for this handoff. Each fresh capture was written through its maintained full-chain path into run-derived isolated schemas and independently read back; the isolation DBs support the full write/readback scope for this run. Because Wiki source revisions are expected to advance with game releases, unchanged source fingerprints before a game update are expected and do not fail this manual isolated acceptance. This does not claim that a production changed-only scheduler tick or unattended production write was exercised.
- Validation: final isolated-chain commits are integrated into local `main` (`a8fd9af0`, `ef71d26c`, `697cd70f`, `539fb5c5`, plus Armor parser fix `d0b3adab`). Focused Buff validation passed `17/17`; Armor, Shimmer, and allocation validations are recorded above and in the execution artifacts. The merged main worktree is clean.
- Residual risks: Armor canonical ownership admission remains blocked for the documented `maint_items` scope and missing source contracts; Buff retains `13` unresolved source-item identities; Shimmer retains `796` unresolved references under the isolated-only allow-unresolved harness. These are not promoted to formal data.
- Follow-up: production source-fingerprint change, authorization/preflight, natural tick, soak, restart, and update-repair work remain separate. No follow-up is required to deliver this handoff.
- Main integration commit: `80ef96d8`; preceding closeout commits are `e01d352a` and `30dbbb30`.
