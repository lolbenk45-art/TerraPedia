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

## Current blockers

- MySQL `13306` and Redis `6380` were not listening during the latest probe.
- Redis DB20/22/24 are a user-required allocation but are rejected by current code until the allocation contract is repaired.
- Shimmer's canonical generation path requires a fresh exact authorized context; the raw fetch path alone does not prove six-scope pseudo-ingestion.
- Existing primary and domain worktrees are dirty; use clean `main`-based execution worktrees.

## Buff execution result - 2026-10-13

- Owner: Codex; branch `ops/recrawl-buff-20261013`; worktree `/home/lolben/TerraPedia/.worktrees/recrawl-buff-20261013`.
- Fresh source command completed with `--resume-mode=fresh`, `--langs=en,zh`, page immunity enabled, snapshot retention, run-local raw/progress/resume paths. Main progress is `completed`, `400/400`, `failedCount=0`, `resumeOutcome=fresh`, and `buffPageImmunityFactCount=400`. Source report records `313` buff / `87` debuff, `198` source-item-bearing records, Template:GetBuffInfo page `55467`, revision timestamp `2026-08-22T05:46:54Z`, module SHA-256 `sha256:a512db8c...d5aa57`.
- Run root: `.local/tmp/full-recrawl-20261013/buffs/buf_20261013_full/`. The primary parsed capture contains all 400 identities and localized `en`/`zh` payloads. Supplementary revision-bound raw page capture completed `311/311` unique page titles with `311/311` revision IDs and `311/311` raw SHA-256 descriptors; its progress is `completed` with `errorCount=0`.
- Allocation contract repair is test-covered in `pipelines/automation/automation-database-contract.mjs`: explicit reserved full-recrawl Redis DBs are Armor `20`, Buff `22`, Shimmer `24`; DB14-17 and DB19 remain rejected, while historical DB18 remains accepted. Contract tests pass `10/10`.
- Full-capture isolated pseudo-ingestion is `pipelines/buff/run-full-recrawl-pseudo-acceptance.mjs`. It is bound to Redis `127.0.0.1:6380/DB22`, requires exactly 400 records, writes only run-derived schemas `terria_v1_automation_acceptance_buf_7f2258be8f7bc44e_{local,maint,relation}`, reads back landing/maint/relation/projection `400/400/400/400`, and records `formalDatabaseWrites=false`. Cleanup readback is `remainingSchemas=0`, `remainingAccounts=0`, `remainingRedisKeys=0`, `childProcesses=0`; independent DB20/22/24 DBSIZE is `0/0/0`.
- Evidence artifact: `.local/tmp/full-recrawl-20261013/buffs/buf_20261013_full/source-report.json`; pseudo artifact `.local/tmp/full-recrawl-20261013/buffs/buf_20261013_full/isolated-pseudo-ingestion.json`. `productionSourceDelta=false` is recorded because revision identity remained unchanged. No production runtime, formal schema, scheduler, permit, or canonical Buff DB write was used.
- Validation: `node --test pipelines/automation/automation-database-contract.test.mjs` (`10/10`), `node --check pipelines/automation/automation-database-contract.mjs`, `node --check pipelines/buff/run-full-recrawl-pseudo-acceptance.mjs`, `node --check pipelines/fetch/capture-buff-page-raw-evidence.mjs`, and `git diff --check` pass. The raw evidence capture helper is new and should receive a focused contract test before merge/commit if retained beyond this handoff.
- Final artifact hashes: `source-report.json` SHA-256 `sha256:011966ef7110c3a277fd5cb37a8bc2afffa2f680612f71672f3b7d21906b1f6e`; `isolated-pseudo-ingestion.json` SHA-256 `sha256:714caa77734dab74d86df8756c3136419ca1e9627faeb7789cf5e85c68a87cfc`; main progress SHA-256 `sha256:21cbc7ba2775154680c1de764722ad0c3c35bf9b9dff0e69986231fc451ad4bf`; page-evidence progress SHA-256 `sha256:bdaa84c9effd336626982a56b8967731a7f7e33afd1a5029c92cb2c596d8fe46`. Template revision is `1023278` at `2026-08-22T05:46:54Z`; no production source version delta was observed.
- Runtime closeout: user-started MySQL/Redis session was stopped after independent zero readback; ports `13306` and `6380` are closed, and no Buff fetch/raw-evidence/acceptance child process remains.

## User stop decision — 2026-11-11

- 用户明确停止全部现有任务；本条因 intentionally stopped 关闭，不代表功能完成或验收通过。
- 保留上文历史问题、验证记录与未完成项；旧的执行、授权和 next-action 指令均不自动恢复。
- 本次未重新验证业务功能；复工须重新确认目标、运行态与授权，并创建新的 active entry。
- 分支交接：`docs/handoffs/2026-11-11-workspace-stop.md`。Stop reason: user-requested cancellation and recoverable branch snapshot.
