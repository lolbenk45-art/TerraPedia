# Eight-Domain Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and Shimmer, prove basic functions, maintained writes, and one real V2-dispatched automatic ingestion attempt per domain in isolated databases, with independent consumer readback and failure recovery evidence.

**Architecture:** Use one dedicated execution worktree and run the eight domains serially from fixed, hash-bound source inputs into manifest-derived `local/maint/relation` schemas. Keep the maintained-chain T1 check separate from an isolated one-shot V2 sweep that must create a real queue attempt, launch the domain automatic runner, write nonzero business rows, and acknowledge the exact source dispatch identity. A run-owned API, Redis, and MinIO are bound only to the isolated run; formal databases and production Redis remain read-only. The plan does not enable unattended scheduling or authorize a formal production write.

**Tech Stack:** Node.js ESM pipelines, Spring Boot catalog API and V2 queue, MySQL/InnoDB run-derived schemas, run-owned Redis, isolated MinIO, `node:test`, Maven, Nuxt checks, JSON evidence under `reports/runtime/eight-domain-production-readiness/`.

---

## 0. Execution Environment, Source Modes, And Cross-Test Matrix

### 0.1 Install the exact code in the specified directory

- [x] Execution root is fixed at `/home/lolben/TerraPedia/.worktrees/eight-domain-production-readiness`; code ref is `exec/eight-domain-production-readiness`, commit `756ae8bf96f58e6a3e6c7edb256c57bdeb65967c`, archive SHA-256 `sha256:5a8498768aac9d503463fa3481d989cdc98355dbe27fd0dc21dd287994a7d68a`. Source and install root are this same worktree; no fallback to the dirty coordinator worktree is allowed.
- [x] Toolchain is fixed: Node `/home/lolben/.nvm/versions/node/v22.23.0/bin/node` v22.23.0 with pnpm 9.0.0, Java 17.0.18, Maven 3.8.7, MySQL CLI 9.2.0, Redis server/CLI 7.0.15, MinIO RELEASE.2025-09-07T16-13-09Z, and mc 2025-08-13. Binary hashes are recorded in the ignored execution manifest.
- [x] Install exact locked dependencies only in this execution worktree. Do not use the coordinator's `node_modules`, Maven target, admin/runtime environment, or cached Redis/MinIO credentials. The sole MySQL credential source is fixed in Section 2.2 and may be read in-memory for a protected one-shot query/provisioner bootstrap. Evidence: `reports/runtime/eight-domain-production-readiness/20261017/install-manifest.json`.

```bash
export PATH="/home/lolben/.nvm/versions/node/v22.23.0/bin:$PATH"
cd /home/lolben/TerraPedia/.worktrees/eight-domain-production-readiness/apps/public-web && pnpm install --frozen-lockfile
cd ../admin-console && pnpm install --frozen-lockfile
cd ../../services/catalog-api && mvn -B -DskipTests package
```

- [ ] Record dependency tree hashes, package-manager lockfile hashes, Maven version, Java version, Node version, and the built catalog JAR hash in `install-manifest.json`. A package install that changes a lockfile or resolves dependencies from an unrecorded external source is a blocked environment result.
- [ ] Run source-only syntax and contract checks from the specified worktree before any database resource is provisioned.

### 0.2 Source mode decision

Every child declares one of these modes in its source manifest:

| Mode | Meaning | What it proves |
| --- | --- | --- |
| `repository-frozen` | Uses an existing repository-tracked/generated source artifact with hash and revision metadata; no network fetch | Parser, maintained import, isolated DB write/readback, and error handling. It does not prove a new upstream fingerprint. |
| `bounded-live-capture` | Performs a bounded real Wiki capture with revision/hash binding | Source fetch plus maintained import; still does not prove production scheduler dispatch unless the scheduler lane is separately run. |
| `hybrid` | Uses repository-frozen full input plus a bounded live probe/representative page | Full-chain time control plus current-source compatibility evidence. |

- [ ] The master source manifest records mode, exact relative paths, SHA-256, revision/fetched-at metadata, input count, and whether network access occurred.
- [ ] A child cannot claim `productionSourceDelta=true` when its mode is `repository-frozen` or `hybrid` without a separately verified changed fingerprint.

### 0.3 Cross-test matrix

Every domain must produce four separate results; one green result cannot substitute for another:

1. **Basic function:** parser/normalizer, stable source identity, schema contract, and representative API route.
2. **Maintained-chain ingestion:** the named maintained importer/sync writes run-derived databases and independent table/API readback passes. This is the T1 lane only.
3. **V2 automatic ingestion:** the isolated V2 sweep creates one non-fixture queue attempt, the real worker launches the registered domain automatic runner, nonzero rows are written, and acknowledgement binds the exact source dispatch identity and attempt identity. A T1 pass cannot set this result.
4. **Error handling:** injected source/progress/identity/DB/API/Redis/object-store/worker failures stop before unsafe mutation or enter a recorded rollback/reconciliation state after mutation.
5. **Release classification:** source mode and current-source status are explicit; unresolved ownership/data/authentication blockers remain blocked.

The cross-test report must include the exact code ref, execution root, source mode, run ID, database/Redis/API/object-store identities, commands, exit codes, and artifact hashes.

### 0.3A Resume and interruption policy

Source-crawl resume and database-import retry are separate contracts:

| Domain | Current source interruption behavior | Required validation behavior |
| --- | --- | --- |
| Items | The detached Item page crawler supports `--resume-from-progress=true`; this plan's import uses frozen data and does not crawl the full corpus | Use a deterministic mock for the 100-page selector, interrupt after 50 records, resume with the same fingerprint, and reject drift. No live 6k-page crawl. |
| NPCs | No keyed resume contract is used by this frozen-source lane | Inject failed terminal progress, then prove a fresh run ID can restart from the immutable standardized input without duplicating rows. |
| Projectiles | No keyed resume contract is used by this frozen-source lane | Same fresh-rerun policy; stable source identity prevents duplicate relation rows. |
| Armor Sets | The attribute/image fetches are bounded source actions; any interruption is terminal and starts a new capture run | Simulate failure with the registered progress action, retain failed evidence, and retry only with a new run ID after source hashes are rechecked. |
| Buffs | The fetcher supports keyed item resume with source-fingerprint validation; its resume state is generated per run, not assumed to exist in the repository | Use a private temp resume path, interrupt before/after completion marking, resume only with the same fingerprint, and reject drift. The primary 388-row run uses frozen data. |
| Audio | Asset-download phase resumes from a manifest and skips only verified existing files; metadata discovery is not a general whole-crawl resume | Test verified-file skip, size/hash mismatch, transient retry, and non-retryable failure with downloads isolated; the primary run disables downloads. |
| Bosses | The fetcher supports keyed resume with fingerprint validation; its resume state is generated per run | Use a private temp state path, interrupt before/after completion marking, resume matching pages, and reject changed seed sets. The primary run uses frozen metadata. |
| Shimmer | No keyed resume contract is used by this frozen-generation lane | Simulate failed progress and rerun the immutable generation under a new run ID; preserve all unresolved rows. |

For database import interruption, no child may blindly continue from an unknown commit point. The runner must classify the outcome as `rolled_back`, `committed_and_readback_verified`, or `commit_outcome_uncertain`; the uncertain state requires independent reconciliation and a new governed run identity before retry. A new source crawl is not required when the frozen source bundle is still hash-valid.

### 0.4 Required failure-injection matrix

Each child or the shared harness must test and record:

- missing or malformed source file;
- network/process interruption at a source record boundary, including a crash before and after keyed completion marking for resume-capable domains;
- deterministic mocked recovery for resume-capable crawlers and failed-terminal/new-run recovery for fresh-only domains; do not make unbounded Wiki requests to prove interruption handling;
- source hash/revision drift after manifest binding;
- missing dependency key, duplicate key, and dependency row-hash drift;
- migration/schema/database-role mismatch before DML;
- Redis reservation conflict or endpoint identity drift;
- failure during first transaction causing rollback and zero target mutation;
- post-commit readback failure causing an explicit ambiguous/compensation state, never a false pass;
- API startup failure, wrong database/Redis binding, and API readback mismatch;
- shared NPC/Boss fence conflict and release/recovery;
- object-store endpoint/prefix conflict, foreign object preservation, and cleanup failure;
- process interruption/restart during the bounded isolated run;
- cleanup failure for schemas, accounts, keys, ports, or secrets.
- commit outcome uncertainty after the database client/process is terminated, followed by independent reconciliation before any retry.

An injected error is a pass only when the artifact records the expected terminal state and independent cleanup/readback. A command that simply throws without proving state is `error-handling-unverified`.

---

## 1. Decision Before Execution

This plan has three separate outcomes:

1. **Basic and maintained-chain readiness:** domain parsers and maintained entrypoints work against the exact frozen or bounded source input in disposable databases.
2. **Isolated V2 automatic-ingestion readiness:** the V2 queue, worker, automatic runner, source acknowledgement, and consumer readback complete against only the run-derived schemas and run-owned Redis endpoint.
3. **Formal production release readiness:** all domain evidence, ownership contracts, current source dependencies, API reads, rollback evidence, and current authorization gates pass for the formal target.

Neither an isolated maintained-chain pass nor an isolated V2 pass authorizes a formal write. A source-readiness report, parser test, dry-run, fixture scheduler tick, direct pseudo-adapter, direct runner invocation without a V2 attempt, or historical `v2/L2/ACTIVE` row is not proof of V2 automatic ingestion.

The current baseline is:

| Domain | Existing evidence | Current blocker before production sign-off |
| --- | --- | --- |
| Items | Historical local L1 and recorded T1 contracts | Fresh maintained full-chain isolated run and consumer readback are not recorded in the current handoff |
| NPCs | Historical local L1/T1 and source readiness | Shared `npcs` ownership predicate and fresh isolated full-chain evidence |
| Projectiles | Historical local apply and T1 contract | Fresh nonzero/full-chain isolated run; strong item/NPC source identity only |
| Armor Sets | Fresh maintained isolated run exists | Canonical ownership admission for `maint_items`, complete attribute/effect source contracts |
| Buffs | Fresh maintained isolated run exists | 13 unresolved source-item identities and remaining source/maint consistency issues |
| Audio | Source/import code and historical L1 evidence | Fresh isolated importer, asset/link readback, and storage/reference checks |
| Bosses | Historical T1 and L2 evidence | Fresh isolated importer and NPC shared-table ownership/readback |
| Shimmer | Fresh maintained isolated run exists | 796 unresolved references were allowed only by the isolated harness; strict formal import remains blocked |

The historical counts in older plans are not reused as current source counts. Every run must bind the exact source manifest and record its own count and hash.

The planned time-bounded source strategy is:

| Domain | Source strategy for this validation | Required interpretation |
| --- | --- | --- |
| Items | `repository-frozen`: `data/standardized/items.standardized.json`, `data/standardized/item_pages.standardized.json`, and their view manifests; exactly 100 equal-rank records selected by the child-plan rule | Full 6,131-page crawl is out of scope. Run the recorded compatibility lane and a separate maintained-import subset from the same 100 identities. |
| NPCs | `repository-frozen`: `data/standardized/npcs.standardized.json`, `data/standardized-view/npcs/_meta.json`, and `data/generated/npc-standardized-map.json` | No `data/wiki-crawler/canonical/npc/*.latest.json` source exists in this worktree; do not reference it. No fresh upstream delta claim. |
| Projectiles | `repository-frozen` `data/standardized/projectiles.standardized.json` and standardized-view metadata with explicit source-relation fields | Real isolated relation/import test; no `aiStyle` inference. |
| Audio | `bounded-live-capture`: four Wiki audio prefixes, at most five API pages per prefix and 150 metadata records total; downloads disabled | The generated audio catalog and BGM display-name files are absent from this execution worktree. Metadata/link ingestion only; no binary-upload claim. |
| Bosses | `hybrid`: frozen `data/generated/wiki-bosses.latest.json` plus `data/generated/npc-standardized-map.json`; current image bytes use the run-owned object store if the importer requires them | The tracked Boss source has 33 records. No fresh Boss page-delta claim; NPC/Boss writes remain serial. |
| Armor Sets | `hybrid`: frozen `data/standardized/armor_sets.standardized.json` and `data/generated/wiki-armor-sets.latest.json`; capture the missing attribute page and at most 64 set images to private run outputs | `wiki-armor-attributes.latest.json` and a frozen set-image catalog are absent. Do not claim those inputs are frozen. Formal ownership blockers remain. |
| Buffs | `repository-frozen`: `data/standardized/buffs.standardized.json` (388 records) plus `data/generated/buff-standardized-map.json` | The claimed 400-record Iteminfo/page-evidence bundle is absent from this worktree. Do not use 400 as the expected count or treat the historical 13 unresolved Item identities as a permanent allowlist. No source-delta claim. |
| Shimmer | `repository-frozen`: generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761`, selected by `data/generated/shimmer/wiki-shimmer-current-generation.json` | Six-scope isolated transaction test; 796 known unresolved references remain an explicit production blocker. |

This table is the execution default. A child may switch to `bounded-live-capture` only with a new source manifest and no silent replacement of the frozen artifact.

## 2. Required Verification Before Any Domain Run

These checks are prerequisites for all eight child plans.

### 2.1 Repository and evidence baseline

- [x] Confirm branch, worktrees, dirty paths, and current devlog. The execution root is `/home/lolben/TerraPedia/.worktrees/eight-domain-production-readiness`; the coordinator worktree has unrelated dirty paths and must not supply code or data.

```bash
git status --short --branch
git worktree list
sed -n '1,220p' docs/devlog/current.md
```

- [ ] Use `reports/runtime/eight-domain-production-readiness/20261017/` as the sole evidence root. Record the exact code commit/archive hash, toolchain, current MySQL identity, installed migration hash, and resource preflight in `baseline.json` before installing dependencies.
- [ ] Re-check the execution worktree is clean except for this reviewed plan/devlog change before installation; never copy `node_modules`, `target`, credentials, or mutable source data from the coordinator worktree.

### 2.2 Fixed isolation resource contract (identities fixed; runtime reservation pending)

The resource identities are fixed by `reports/runtime/eight-domain-production-readiness/20261017/execution-manifest.json`; they are planned allocations, not proof that a process or database is currently available. The 2026-10-17 read-only inventory found shared Redis `6380` and MinIO `19000/19001` stopped and their persistent data roots in use; those shared roots are forbidden. Historical DB20/DB22/DB24 are not candidates. There are no interactive resource choices during execution.

- [x] Formal/source MySQL is fixed to `127.0.0.1:13306`, expected server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`. Formal schemas are SELECT-only sources. Each target schema is generated from the fixed domain run ID with `buildAutomationDatabaseNames({ profile: 't1', runId })`; no schema name may be typed by a caller.
- [x] MySQL credential source is the ignored `/home/lolben/TerraPedia/platform/local/config/local-stack.config.json`. The file is owned by `lolben`; although its file mode is `0644`, `/home/lolben` is `0750` and GID 1000 currently contains only `lolben`. Recheck those facts and the config's database host/port/name before use. Read only its MySQL credential into the child process environment for the exact TCP query/provisioner bootstrap; never print, copy, persist, stage, or put any credential value in a manifest. Ignore that file's Redis, MinIO, mail, and admin credentials.
- [x] Redis is a dedicated loopback instance `/usr/bin/redis-server` v7.0.15 at `127.0.0.1:16380`, databases 1-8 mapped in domain order in the execution manifest, persistence disabled, with private data/config/auth under `.local/tmp/eight-domain-production-readiness/20261017/redis`. Shared Redis `6380`, production DB14/DB15, and historical DB16/DB18 are forbidden.
- [x] MinIO is `/home/lolben/.local/bin/minio` RELEASE.2025-09-07T16-13-09Z at API `127.0.0.1:19100` and console `127.0.0.1:19101`, with a private data root under `.local/tmp/eight-domain-production-readiness/20261017/minio`. Buckets are `tp-e8pr-armor-20261017` and `tp-e8pr-bosses-20261017`; object prefixes are `e8pr/armor_sets/<runId>/` and `e8pr/bosses/<runId>/`. Audio is metadata-link-only and uses no MinIO bucket.
- [x] API is loopback port `18280`, reused only after exact PID/port absence is verified. The same API launch wrapper has separate read-only consumer-readback and explicitly isolated V2-attempt modes.
- [x] Fixed run IDs are `e8pr-items-20261017-v1`, `e8pr-npcs-20261017-v1`, `e8pr-projectiles-20261017-v1`, `e8pr-audio-20261017-v1`, `e8pr-bosses-20261017-v1`, `e8pr-armor_sets-20261017-v1`, `e8pr-buffs-20261017-v1`, and `e8pr-shimmer-20261017-v1`.
- [x] Each `<runKey>` path segment is the exact `runKey` returned by `buildAutomationDatabaseNames({ profile: 't1', runId })`, not the readable `runId`. Expected run keys and the resulting local/maint/relation schema names are recorded in the execution manifest.
- [ ] Before dependency installation, re-probe every fixed port, MySQL UUID, Redis/MinIO binary hash, private data-root emptiness, MySQL formal schema identity, and active crawler/automation writer. Reserve each entry as `planned`, then mark it `ready` only after exact endpoint identity and emptiness are independently read back.
- [ ] If MySQL is unavailable, credentials are unavailable, any port/root is occupied, a binary hash differs, or an active writer conflicts, write a blocked preflight artifact and stop. Do not start or stop shared services, change ports/DBs, reuse credentials, clean foreign state, or prompt the user for a choice.
- [ ] Generate the Redis/object-store allocation manifests from these fixed identities. Tests must reject shared Redis, formal/historical DBs, endpoint drift, occupied resources, foreign data roots/objects, and cleanup outside the exact run owner before provisioning.

```bash
node --test pipelines/automation/automation-database-contract.test.mjs \
  pipelines/automation/run-live-automation-acceptance.test.mjs \
  pipelines/automation/canonical-operation-execution-manifest.test.mjs \
  pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs
```

### 2.3 Formal-target non-write and isolated V2 guard

- [ ] Every isolated child consumes only its reviewed manifest entry. Before opening a connection it rejects `terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`, historical `terria_v1_v55_rehearsal`, any MySQL target other than the fixed server UUID plus that run's derived schema triple, any Redis target other than its assigned `16380/DB1-8`, and any API port other than the run-owned `18280` process.
- [ ] Formal schemas are available only through a read-only snapshot account for dependency seeding. The run-derived schemas are the only write targets.
- [ ] The current Base and Supplementary automatic runners hard-reject `TERRAPEDIA_DB_NAME` values other than `terria_v1_local`. Add an explicit `eight-domain-isolated-acceptance` execution mode that accepts only the signed/current run manifest, exact derived schema triple, fixed MySQL UUID, exact Redis allocation, and `source-mode=local|bounded-live`. Keep the default production mode's `terria_v1_local` guard unchanged.
- [ ] Exercise the V2 attempt through a run-owned API's authenticated `/api/admin/crawler-monitor/v2/automation/sweep` endpoint. The test API may dispatch only the single domain/run named by its isolated authorization envelope. It must set `SPRING_TASK_SCHEDULING_ENABLED=false`, keep the production API/Redis unreachable, and stop immediately after the attempt reaches terminal state; a fixture queue or direct runner call is not a V2 pass.
- [ ] The isolated authorization envelope and any scheduler activation rows are synthetic test records stored only in the run-derived schema, bound to the code hash, source hash, domain allowlist, and run ID. They must be rejected by production-mode code and cannot create a production permit, decision, packet, or Owner authorization.
- [ ] For the V2 pass, require exactly one non-fixture queue attempt per domain, worker launch of the registered production automatic entrypoint in isolated local-source mode, nonzero domain-owned writes, independent readback, and V2 queue terminal acknowledgement bound to the same `(epoch, queueId, attemptId)` and source dispatch identity. Do not acknowledge or mutate the shared Wiki source manifest. Fixture mode, missing attempt identity, a direct manual importer, or a T1-only result cannot set `v2AutomaticIngestionStatus=passed`.
- [ ] Run domains serially in this one execution worktree and one coordinator session. NPC and Boss share the `npcs` ownership boundary; API port, MinIO, and dependency seeding are also serial resources. Do not split the eight runs across concurrent sessions.
- [ ] Consumer-readback API mode must use a distinct `apiReadonly` MySQL account with `SELECT, SHOW VIEW` only on the three run-derived schemas. Isolated V2 mode must use the separate `apiV2Test` account scoped to the same run schemas/control tables. Neither mode may use the formal snapshot account or provisioner account.
- [ ] Add a negative test that a formal database name, symbolic-link evidence path, changed source hash, mismatched run identity, or sibling attempt artifact fails before the first business DML.
- [ ] Consumer-readback mode uses `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true` and a SELECT-only `apiReadonly` account. Isolated V2-attempt mode may set `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=false` only when the explicit isolation flag, valid manifest, one-domain authorization envelope, run-derived schemas, and private Redis identity all match; use a separate `apiV2Test` account with grants only on that run's schemas/control tables. Both modes keep `SPRING_TASK_SCHEDULING_ENABLED=false`, keep cutover disabled, use an allowlisted environment, and never inherit ordinary local-stack settings.
- [ ] The run-owned backend uses a unique loopback port recorded in the run artifact, exposes only the required health/public/admin routes, and is stopped only after API readback and post-stop process/port checks pass.

### 2.4 Source and chain contract

Each child must provide all of the following before maintained import or V2 dispatch:

- [ ] A source manifest with the selected source mode, exact repository paths or Wiki page/module identities, SHA-256 values, record counts, source revisions/timestamps, and the run ID. Bounded crawls must use their registered `actionId`, monitor-visible progress path, heartbeat, terminal status, private output/report paths, and one active writer per progress/output family.
- [ ] Frozen input manifest bound to the run ID and code bundle hash.
- [ ] Maintained importer/sync call path. Direct SQL, direct JSON mutation, `recrawl_*` tables, or direct pseudo-adapters are diagnostic only and cannot pass the gate.
- [ ] V2 automatic runner call path with attempt identity, source dispatch identity, runner code bundle hash, worker exit status, V2 queue acknowledgement status, and terminal reconciliation evidence. Isolated local-source runs do not mutate the Wiki source manifest.
- [ ] Before/after counts and stable-key row hashes for every owned table.
- [ ] Relation/projection/local consumer readback and representative API DTO readback from the isolated runtime.
- [ ] Transaction rollback probe, commit probe, and post-commit independent readback.
- [ ] Cleanup proof for schemas, temporary accounts, Redis keys, child processes, ports, and private evidence permissions.

### 2.5 Cross-domain dependencies

- [ ] Dependencies copied from formal schemas must be read-only and listed in the child manifest. A dependency row is not counted as a child-domain write.
- [ ] Do not treat `runLiveAutomationAcceptance`'s default `maxRowsPerTable=2` or the adapter's bounded snapshot as complete dependency coverage. For this plan, modify the acceptance harness to accept an explicit child dependency manifest and use an exact-key snapshot/seed path; the generic bounded snapshot remains available only for historical T1 contracts that explicitly declare it.
- [ ] Independently verify dependency IDs and hashes before apply and after API startup. The artifact distinguishes `dependencySeedRows` from domain-owned importer writes; seeded rows never count toward domain write/readiness totals.
- [ ] Reject unknown, truncated, or broader-than-declared dependencies. If a closure is too large for the bounded snapshot helper, implement a tested key-list export instead of raising a global row limit or copying whole formal tables.
- [ ] NPC and Boss runs serialize ownership of `npcs`; no concurrent run may write the shared table.
- [ ] Items and Projectiles may use NPC rows for read-only relation resolution but may not infer identity from display names or `aiStyle`.
- [ ] Armor and Buff source-item dependencies must prove stable Item IDs; unresolved identities remain explicit and block production readiness.
- [ ] Shimmer `world_contexts` and `entity_source_snapshots` ownership must be part of the isolated scope, not silently seeded as pre-existing business rows.

### 2.6A Object-storage boundary

- [ ] Any child whose maintained importer uploads or resolves managed images must consume an object-storage entry from `object-store-allocation-manifest.json`: endpoint, bucket, object prefix, access identity, data root, owner PID, and cleanup method.
- [ ] Armor and Boss image lanes must use a run-owned disposable MinIO bucket/prefix or an explicitly read-only source-cache mode; the formal bucket, production endpoint, and production object prefix are forbidden.
- [ ] Record object-store before/after object-list hashes and remove only run-owned objects/buckets after API readback. A production object URL or unmanaged cache hit cannot count as isolated image evidence.
- [ ] Audio must declare whether its run is metadata/link-only or uses object storage; a link-only run must not claim binary asset upload acceptance.

### 2.6 Consumer and release verification

- [ ] For each domain, read the relevant backend DTO/API through the run-owned isolated backend configured only with the run-derived schemas. For V2 acceptance, call exactly one authenticated `/api/admin/crawler-monitor/v2/automation/sweep` on the isolated API and read back its real attempt, worker result, acknowledgement, and domain API response.
- [ ] Run focused domain tests, backend tests for changed DTO/mapper paths, `apps/public-web` checks where public output is read, and `apps/admin-console` checks where admin output is read.
- [ ] Run the full local quality gate after all eight isolated runs. Any skipped gate must be recorded with the exact reason and cannot be called a release pass.
- [ ] Validate rollback by restoring the pre-run fingerprint and verifying no unrelated tables changed.
- [ ] Validate restart and recovery of the isolated runner, not production scheduler soak. Production unattended operation remains a separate release gate.

The API readback route set is explicit and must be recorded in each child artifact:

| Domain | Required public/admin route samples |
| --- | --- |
| Items | `/api/public/items/{id}`, `/api/items/{id}`, and `/api/public/items/{id}/sources` |
| NPCs | `/api/public/npcs/{id}/aggregate` and `/api/admin/npcs/{id}` |
| Projectiles | `/api/public/projectiles` and `/api/admin/projectiles/{id}` |
| Audio | `/api/public/audio/{id}` and `/api/admin/audio-assets/{id}/stream` only when the child declares and verifies an isolated binary asset policy |
| Bosses | `/api/public/bosses/{id}` and `/api/admin/bosses/{id}` |
| Armor Sets | `/api/public/armor-sets/{id}` and `/api/admin/armor-sets/{id}` |
| Buffs | `/api/public/buffs/{id}` and `/api/admin/buffs/{id}` |
| Shimmer | `/api/public/shimmer/context`, `/api/public/shimmer/overview`, and `/api/public/shimmer/datasets/{dataset}` |

The run-owned API launcher must verify the route prefix, database identity, Redis identity, and response body hash. A route that cannot safely run against a run-derived schema is recorded as an API-contract blocker; SQL-only evidence cannot substitute for it.

## 3. Common Evidence Contract

Every child writes one immutable artifact at:

```text
reports/runtime/eight-domain-production-readiness/20261017/<domain>/<runKey>/isolated-real-ingestion.json
```

The artifact must contain:

```json
{
  "domainId": "items",
  "runId": "...",
  "source": {"mode": "repository-frozen|bounded-live-capture|hybrid", "provider": "terraria.wiki.gg", "paths": [], "revision": "...", "rawSha256": "sha256:...", "bundleSha256": "sha256:...", "recordCount": 0},
  "isolatedTarget": {"mysql": {"host": "127.0.0.1", "port": 13306, "serverUuid": "b4ae6728-4f72-11f1-bcc9-00155d37eadf", "databases": {"local": "...", "maint": "...", "relation": "..."}}, "redis": {"host": "127.0.0.1", "port": 16380, "logicalDb": 0, "serverIdentity": "...", "allocationManifestHash": "sha256:..."}, "api": {"host": "127.0.0.1", "port": 18280, "jarSha256": "sha256:...", "configHash": "sha256:...", "stoppedAfterReadback": true}, "objectStore": {"mode": "none|metadata-link-only|isolated-binary", "allocationManifestHash": "sha256:...", "endpoint": "http://127.0.0.1:19100", "bucket": "...", "objectPrefix": "...", "beforeHash": "sha256:...", "afterHash": "sha256:..."}},
  "accounts": {"provisioner": "...", "formalReadonly": "...", "apiReadonly": "...", "cleanupVerified": true},
  "formalDatabaseWrites": false,
  "maintainedEntrypoints": ["..."],
  "dependencySeeds": {"manifestSha256": "sha256:...", "rowsByTable": {}, "readbackVerified": true},
  "before": {"tables": {}, "api": {}},
  "write": {"transactionCommitted": true, "rollbackProbePassed": true, "readbackVerified": true, "domainOwnedRowsWritten": 0},
  "automaticAttempt": {"fixtureMode": false, "artifactRoot": "reports/runtime/eight-domain-production-readiness/20261017/items/<runKey>/automatic/", "sweepBodySha256": "sha256:...", "stateStoreEpoch": "...", "queueId": "...", "attemptId": "...", "sourceDispatchIdentity": {}, "runnerCodeBundleSha256": "sha256:...", "workerExitCode": 0, "terminalStatus": "COMPLETED", "v2QueueAcknowledged": true, "wikiSourceManifestAcknowledged": false},
  "after": {"tables": {}, "api": {}},
  "unresolved": [],
  "cleanup": {"schemas": 0, "accounts": 0, "redisKeys": 0, "apiOwnedRedisKeys": 0, "childProcesses": 0, "apiProcesses": 0, "apiPorts": 0, "ephemeralSecrets": 0, "passed": true},
  "basicFunctionStatus": "passed|blocked",
  "maintainedChainStatus": "passed|blocked|unverified",
  "v2AutomaticIngestionStatus": "passed|blocked|unverified",
  "localSourceCompatibilityStatus": "not-applicable|passed|blocked",
  "errorHandlingStatus": "passed|blocked|unverified",
  "productionReadinessStatus": "blocked"
}
```

Use separate statuses: `maintainedChainStatus` describes the T1 maintained importer/sync lane; `v2AutomaticIngestionStatus` describes the real V2 attempt/worker/ack lane; `productionReadinessStatus` describes unresolved source, ownership, current authorization, and consumer blockers. V2 may pass only with a non-fixture attempt, source/attempt identity agreement, nonzero domain-owned writes, independent SQL and API readback, successful acknowledgement, and verified cleanup. Either isolated lane is blocked when formal schemas were written, dependencies were incomplete, data was silently dropped, the API used another DB binding, or cleanup is unknown.

## 4. Execution Order

Run serially in this order to reduce shared-table and dependency ambiguity:

1. Items
2. NPCs
3. Projectiles
4. Audio
5. Bosses
6. Armor Sets
7. Buffs
8. Shimmer

The order is operational, not a permission to write formal databases. Run all eight domains serially in this execution worktree and one coordinator session. A source/identity/target/cleanup conflict stops the full run without prompting; a domain code/data failure blocks that domain and the aggregate until the repair passes focused tests and is rerun under a new run identity. A source interruption resumes only where the child contract explicitly supports resume; no unknown database commit is retried before independent reconciliation.

## 5. Master Tasks

### Task 0: Freeze and preflight the fixed resource allocation

**Files:**
- Create: `reports/runtime/eight-domain-production-readiness/20261017/redis-resource-inventory.json`
- Create: `reports/runtime/eight-domain-production-readiness/20261017/redis-allocation-manifest.json`
- Create: `reports/runtime/eight-domain-production-readiness/20261017/object-store-allocation-manifest.json`
- Create: `reports/runtime/eight-domain-production-readiness/20261017/source-manifest.json`
- Modify: `pipelines/automation/automation-database-contract.mjs`
- Test: `pipelines/automation/automation-database-contract.test.mjs`
- Test: `pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs`

- [x] Fix the MySQL server UUID/port, run IDs, schema-derivation contract, Redis binary/port/DB map, MinIO binary/ports/buckets/prefixes, API port, private roots, and fail-closed policy in the execution manifest.
- [x] Revalidate current MySQL UUID/formal schema set, credential availability, ports, binary hashes, private-root emptiness, and active writers before installing dependencies. Evidence: `reports/runtime/eight-domain-production-readiness/20261017/preflight.json`; only statuses from a fresh preflight may become `ready`.
- [x] Create eight `planned` Redis allocation entries from the fixed DB1-8 map, two exact MinIO entries, and one serial API port lease. Evidence: `redis-allocation-manifest.json` and `object-store-allocation-manifest.json`; entries remain `planned` until the corresponding process is live and empty.
- [ ] Keep secrets out of manifests. Generate private mode-`0600` Redis/MinIO/API credentials at runtime; use only the protected MySQL credential source fixed in Section 2.2. Credential lookup failure or permission drift stops automatically without prompting.
- [x] Add RED/GREEN tests for the fixed allocations, formal/historical database and Redis rejection, occupied port/root, binary/identity drift, no-fallback behavior, owner-bound cleanup, and failure before schema creation. Allocation/database contract `18/18`, acceptance `16/16`, scheduler lifecycle `33/33`.
- [x] Static allocation contract tests pass before any schema/account creation, Redis/MinIO/API start, source capture, or import. No business write has occurred.

### Task 1: Build and validate the isolated allocation harness

**Files:**
- Modify: `pipelines/automation/automation-database-contract.mjs`
- Modify: `pipelines/automation/run-live-automation-acceptance.mjs`
- Test: `pipelines/automation/automation-database-contract.test.mjs`
- Test: `pipelines/automation/run-live-automation-acceptance.test.mjs`
- Create: `pipelines/automation/eight-domain-isolated-allocation.mjs`
- Test: `pipelines/automation/eight-domain-isolated-allocation.test.mjs`

- [ ] Consume the reviewed allocation manifest from Task 0 and reject every unlisted endpoint/DB.
- [ ] Add formal-schema and formal-port rejection before provisioning or business DML.
- [ ] Add run-derived artifact path, account, schema, and Redis-key confinement checks.
- [ ] Run the allocation and acceptance contract tests listed in Section 2.2.

### Task 1A: Build and validate isolated catalog API lifecycle

**Files:**
- Create: `platform/local/run-eight-domain-isolated-api.mjs`
- Test: `platform/local/run-eight-domain-isolated-api.test.mjs`
- Modify: `pipelines/automation/mysql-automation-acceptance-adapter.mjs`
- Modify: `pipelines/automation/provision-automation-databases.mjs`
- Modify: `pipelines/automation/drop-automation-databases.mjs`
- Test: `pipelines/automation/mysql-automation-acceptance-adapter.test.mjs`
- Read/verify: `services/catalog-api/src/main/java/com/terraria/skills/config/SchedulingConfiguration.java`
- Read/verify: `pipelines/automation/mysql-automation-acceptance-adapter.mjs`
- Read/verify: `services/catalog-api/src/main/resources/application.yml`
- Read/verify: `pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs`

- [ ] Accept only a reviewed allocation manifest entry, run-derived three-database names, a unique loopback port, and an explicit run directory; reject formal schemas, production ports, inherited `TERRAPEDIA_DB_URL`, and missing maint/relation bindings before starting Java.
- [ ] Before API startup, create the three schemas through the shared acceptance adapter and run its supported isolated schema builders: `buildMaintSchemaSql()`, `buildRelationSchemaStatements()`, `buildProjectionSchemaStatements()`, and the exact ordered `db/migration/V*.sql` files rewritten only from formal `terria_v1_maint` references to the run's derived maint schema. Record ordered SQL/build input paths and hashes and post-migration schema fingerprints. Do not call `CanonicalFlywayMigrationCli`; it is intentionally fixed to formal `terria_v1_local`. API startup must set `SPRING_FLYWAY_ENABLED=false` after controlled schema setup is verified.
- [ ] Generate private mode-`0600` environment files for each API mode. Both bind `TERRAPEDIA_DB_URL`, `TERRAPEDIA_DB_MAINT`, `TERRAPEDIA_DB_RELATION`, `APP_PORT`, and Redis identity from the exact manifest; set `spring.task.scheduling.enabled=false`, `SPRING_FLYWAY_ENABLED=false`, `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=false`, and `TERRAPEDIA_MAIL_ENABLED=false`. Consumer-readback uses `apiReadonly` and `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true`; isolated V2 mode uses `apiV2Test` and sets read-only false only after its isolation flag/manifest/envelope validate. When object storage is enabled, write a private MinIO credentials JSON with the application schema `{ "url", "accessKey", "secretKey" }` and bind its endpoint, bucket, object prefix, and path. Generate distinct run-only auth/user token secrets and admin credentials; record only redacted config hashes.
- [ ] Reject a formal-schema migration target, a missing migration manifest/hash, or a migration result that changes any schema outside the three run schemas; treat it as an immediate stop. Do not assume a Flyway history row exists when migrations are applied through the shared acceptance adapter.
- [ ] Generate a run-owned admin credential/token secret for admin route readback; never reuse the ordinary local-stack admin token or a production secret. Record only a hash and expiry in the artifact.
- [ ] Create and verify separate `apiReadonly` and `apiV2Test` accounts before API startup. `apiReadonly` is SELECT-only; `apiV2Test` receives only the exact run-schema/control-table grants needed for the one isolated attempt. Record account identities, then drop both and read back their absence during cleanup.
- [ ] Bind all temporary MySQL accounts to the loopback/required host identity or, if the existing adapter retains a wildcard host grant, prove MySQL is loopback-only before provisioning and record that limitation as a blocker for any non-loopback environment.
- [ ] Build/package the current catalog API source revision, record the exact JAR SHA-256, then start only that artifact with the run-owned environment. Set `SPRING_FLYWAY_ENABLED=false` only after controlled isolated schema setup passes. The project has no Actuator dependency; readiness is proved by exact PID/port ownership plus HTTP `GET /api/public/home/focus-item` and authenticated `GET /api/admin/crawler-monitor/overview`. Expose started state, JAR hash, schema-builder/migration input hashes, database/Redis fingerprints, port, PID, response statuses, and body hashes.
- [ ] Provide a bounded `readback` command that accepts only route names declared by the child plan and records HTTP status/body hash. In consumer-readback mode it must fail if scheduler/automation is writable; in isolated V2 mode it must fail unless the explicit manifest/envelope is valid and scheduler timers remain disabled.
- [ ] Authenticate admin route samples only through `/api/auth/login` using the run-owned admin username/password, record the token only in a mode-`0600` ephemeral file, and remove it before cleanup. Public routes must also be read without an admin token where applicable.
- [ ] Provide a `stop`/`cleanup` path that verifies the exact PID and port, stops only the run-owned process, removes the private environment file, and proves the port/process are absent. Cleanup failure blocks the child artifact.
- [ ] Add tests for formal database rejection, inherited-config rejection, wrong schema binding, wrong Redis endpoint, port collision, API health failure, PID mismatch, V2 attempt limit, fixture-mode rejection, and successful stop/readback.
- [ ] Run API readback inside the child acceptance executor while run-derived schemas/accounts still exist; stop the run-owned API and verify its PID/port before the executor returns and the shared T1 harness drops schemas/accounts.
- [ ] Capture Redis keys created by the API login/rate-limit/readback path, prove they belong to the run allocation, delete only those exact keys before releasing the Redis reservation, and fail cleanup if any foreign key is present.
- [ ] Add API `consumer-readback` mode (scheduler disabled, automation read-only) and `isolated-v2-attempt` mode (one allowed domain/run, synthetic authorization confined to run schemas, scheduler timer disabled, authenticated one-shot sweep only). Require distinct allowlisted environments and reject ambiguous mode selection.
- [ ] In isolated V2 mode, pass `TERRAPEDIA_EIGHT_DOMAIN_SOURCE_PROBE_MODE=frozen-run-manifest` and a private run-local source-state path. Do not spawn the default all-domain `check-source-updates.mjs` network probe from this mode. Production mode must keep the current online source check unchanged.
- [ ] In V2 mode, validate the current manifest and exact run schema/Redis binding before dispatch. Dispatch at most one non-fixture attempt for the allowlisted domain, then return the terminal attempt identity for independent API/Redis readback.

```bash
node --test platform/local/run-eight-domain-isolated-api.test.mjs
```

### Task 1B: Build and validate exact dependency seeding

**Files:**
- Create: `pipelines/automation/eight-domain-dependency-seeder.mjs`
- Test: `pipelines/automation/eight-domain-dependency-seeder.test.mjs`
- Modify: `pipelines/automation/run-live-automation-acceptance.mjs`
- Modify: `pipelines/automation/mysql-automation-acceptance-adapter.mjs`
- Modify: `pipelines/automation/provision-automation-databases.mjs`
- Test: `pipelines/automation/run-live-automation-acceptance.test.mjs`
- Test: `pipelines/automation/mysql-automation-acceptance-adapter.test.mjs`
- Modify only the child runners to declare their domain-specific dependency manifests.

- [ ] Accept a child-owned dependency manifest containing source database/table, stable key columns, exact key values, required columns, row hashes, and target schema/table; reject whole-table, display-name-only, missing-key, duplicate-key, and truncated manifests.
- [ ] Read the exact dependency rows through the readonly formal account, verify the declared hashes, and write only the corresponding rows into the run-derived target through the provisioner account before the maintained importer starts.
- [ ] When a child uses `runLiveAutomationAcceptance` T1, pass its dependency manifest into provisioning so the generic bounded sample copy is disabled for that run; verify the target starts with only schema/seed rows declared by the child manifest.
- [ ] Emit `dependencySeedRows`, source/target table hashes, and `readbackVerified` evidence; never count seeded rows as domain-owned importer writes.
- [ ] Add tests for missing keys, extra keys, row-hash drift, formal target writes, cross-domain table access, and successful exact-key seeding.
- [ ] Require every child runner to call this seeder before its first business DML and bind its dependency manifest hash into `isolated-real-ingestion.json`.

```bash
node --test pipelines/automation/eight-domain-dependency-seeder.test.mjs
```

### Task 1C: Build and validate isolated object-storage lifecycle

**Files:**
- Create: `platform/local/run-eight-domain-isolated-object-store.mjs`
- Test: `platform/local/run-eight-domain-isolated-object-store.test.mjs`
- Create: `reports/runtime/eight-domain-production-readiness/20261017/object-store-allocation-manifest.json`
- Read/verify: `services/catalog-api/src/main/resources/application.yml`
- Read/verify: `platform/local/start-local-stack.sh`

- [ ] Accept only the object-store entries declared for Armor and Bosses; reject the formal bucket, production endpoint, inherited credentials, and an object prefix outside the run identity. Audio is metadata-link-only and must not start MinIO or upload binaries.
- [ ] Start or bind a run-owned MinIO endpoint only when the child declares `isolated-binary`; otherwise expose a read-only metadata/source-cache mode and record that binary upload was not tested.
- [ ] Record endpoint, bucket, prefix, access identity hash, process/data-root identity, before/after object-list hashes, allocation-manifest hash, and cleanup status without persisting secrets.
- [ ] Remove only the run-owned prefix/bucket, stop only the run-owned process, and prove endpoint/process/data-root cleanup before the child artifact can pass.
- [ ] Add tests for formal bucket rejection, prefix traversal, endpoint drift, credential mismatch, foreign object preservation, and exact cleanup.

```bash
node --test platform/local/run-eight-domain-isolated-object-store.test.mjs
```

### Task 1D: Build the cross-domain failure-injection harness

**Files:**
- Create: `pipelines/automation/eight-domain-failure-injection.mjs`
- Test: `pipelines/automation/eight-domain-failure-injection.test.mjs`
- Modify: each child runner to expose deterministic dependency injection points.

- [ ] Provide named injections for source hash drift, missing dependency, Redis reservation conflict, migration failure, V2 worker exit before DML, first-DML failure, commit-outcome uncertainty, post-commit readback failure, acknowledgement failure, API wrong-binding/start failure, NPC/Boss fence conflict, object-store conflict, process interruption, and cleanup failure.
- [ ] Require every injection to emit a terminal artifact with `expectedFailure`, observed state, rollback/compensation state, cleanup state, and whether any business mutation survived.
- [ ] Reject a test that only asserts a thrown error; the harness must independently read database counts/hashes, Redis keys, API process/port, accounts, and object-store state after the failure.
- [ ] Run the shared failure matrix once against the Item local-source fast lane and once against one full maintained-chain representative; each other child must run domain-specific identity/fence/object-store injections named in its plan.

```bash
node --test pipelines/automation/eight-domain-failure-injection.test.mjs
```

### Task 1E: Bind production V2 automatic runners to an explicit isolated profile

**Files:**
- Create: `pipelines/automation/eight-domain-v2-isolated-acceptance.mjs`
- Test: `pipelines/automation/eight-domain-v2-isolated-acceptance.test.mjs`
- Modify: `pipelines/automation/run-base-domain-automatic-operation.mjs`
- Test: `pipelines/automation/run-base-domain-automatic-operation.test.mjs`
- Modify: `pipelines/automation/run-supplementary-domain-automatic-operation.mjs`
- Test: `pipelines/automation/run-supplementary-domain-automatic-operation.test.mjs`
- Modify: `pipelines/automation/run-supplementary-domain-l1-operation.mjs`
- Test: `pipelines/automation/run-supplementary-domain-l1-operation.test.mjs`
- Modify: `pipelines/automation/run-armor-automatic-operation.mjs`
- Test: `pipelines/automation/run-armor-automatic-operation.test.mjs`
- Modify: `pipelines/automation/automatic-execution-artifacts.mjs`
- Test: `pipelines/automation/automatic-execution-artifacts.test.mjs`
- Modify: `pipelines/automation/prepare-supplementary-domain-l1-preview.mjs`
- Test: `pipelines/automation/prepare-supplementary-domain-l1-preview.test.mjs`
- Modify/Test: `pipelines/automation/run-live-automation-acceptance.mjs` only where it consumes the reviewed allocation/source manifest
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Test: `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Test: `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `services/catalog-api/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`
- Test: `services/catalog-api/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`

- [ ] Trace and record one registered automatic runner per domain from the pinned code bundle; reject a domain without an exact source-to-runner mapping.
- [ ] Keep production defaults pinned to `terria_v1_local`. Permit run-derived schemas only when `TERRAPEDIA_EIGHT_DOMAIN_ISOLATED_ACCEPTANCE=true` and a hash-valid private manifest binds code commit, domain/run ID, schema triple, MySQL UUID, Redis `16380/DB1-8`, and isolated authorization envelope. Explicitly reject the formal databases and `terria_v1_v55_rehearsal`.
- [ ] In isolated mode, have `CrawlerMonitorActionRegistry` pass `--source-mode=local` and a per-run private `--manifest-path` to Base/Supplementary runners. Modify `run-armor-automatic-operation.mjs` to accept the same isolated local-source profile, skip its live `fetch-wiki-armorsetbonuses` subprocess, and bind the exact captured set/attribute/image bundle. Production worker commands retain their current live-source behavior.
- [ ] Bind each automatic runner to `.local/tmp/eight-domain-production-readiness/20261017/source-manifests/<domain>.json`; no isolated run may read or write `data/generated/wiki-source-manifest.latest.json`. In isolated mode, skip Wiki source-manifest acknowledgement and record `wikiSourceManifestAcknowledged=false`; only the V2 queue's post-commit terminal acknowledgement can be true.
- [ ] Bind every automatic source/bundle/preview/reconciliation/test-authorization artifact to `reports/runtime/eight-domain-production-readiness/20261017/<domain>/<runKey>/automatic/`. Reject writes to `reports/authorization/canonical/automatic`, canonical proposal/packet/permit paths, sibling run roots, and paths outside the exact execution worktree.
- [ ] Revalidate target identity before preview, before DML, before COMMIT, and before V2 queue acknowledgement. Reject formal schemas, `TERRAPEDIA_DB_NAME` drift, wrong endpoint/DB, missing run identity, fixture mode, attempts outside the one-domain allowlist, and any write to the default Wiki source manifest.
- [ ] Keep synthetic test authorization and activation rows only in the run-derived schema. Prove production mode cannot accept these rows as a production decision, permit, packet, or H8 authorization.
- [ ] In isolated V2 mode only, build a private source-monitor state with exactly these eight source keys: `wiki.module.iteminfo`, `wiki.module.npcinfo`, `wiki.module.projectileinfo`, `wiki.module.armorsetbonuses`, `wiki.page.template_getbuffinfo`, `wiki.audio_assets.catalog`, `wiki.bosses.catalog`, and `wiki.shimmer.page_and_langlinks`. Use one shared `checkedAt`, healthy `status=ok` entries, and valid content identities. Compute each `currentValue` using the registered automatic runner's source-fingerprint function over its bound source manifest; set `changed=true` only for the current domain when its run-derived schema has no acknowledgement. Treat this as sandbox initial import, keep `productionSourceDelta=false`, and never rewrite the production source state.
- [ ] Bind the exact private source-state path through the API and `CrawlerAttemptSupervisor` into `TERRAPEDIA_CRAWLER_SOURCE_STATE_PATH`; reject symlinks, state outside the execution root, missing/duplicate/extra domain keys, timestamp or hash drift, and default-path fallback. Test that Java and Node compute the same source-content identity. The existing production source-check subprocess remains enabled outside isolated mode.
- [ ] In isolated V2 mode, do not spawn `check-source-updates.mjs` or fall back to it on source-state failure. A missing or invalid run-local source state blocks the sweep before queue mutation; the production online source check remains unchanged.
- [ ] Route exactly one authenticated sweep through the isolated API. Independently verify V2 epoch/namespace, queue ID, attempt ID, source dispatch triple, worker command/code hash and arguments (`source-mode=local`, run-local manifest), terminal state, V2 queue acknowledgement, nonzero owned-table rows, API response hashes, and exact cleanup.
- [ ] If the current V2 service cannot dispatch the actual registered runner from the isolated source state and schema binding, record `v2AutomaticIngestionStatus=blocked`; do not substitute fixture mode or a direct runner invocation.
- [ ] Add negative tests proving production mode remains restricted to the formal target, isolated mode rejects every wrong manifest/target, and T1 or fixture-only runs never report V2 automatic success.
- [ ] Run all V2 runner and API contract tests before provisioning any isolated schema or starting the API.

```bash
node --test pipelines/automation/eight-domain-v2-isolated-acceptance.test.mjs \
  pipelines/automation/run-base-domain-automatic-operation.test.mjs \
  pipelines/automation/run-supplementary-domain-automatic-operation.test.mjs \
  pipelines/automation/run-supplementary-domain-l1-operation.test.mjs \
  pipelines/automation/run-armor-automatic-operation.test.mjs
```

```bash
cd services/catalog-api && mvn -Dtest=CrawlerMonitorServiceImplTest,CrawlerMonitorActionRegistryTest,CrawlerAttemptSupervisorTest test
```

### Task 2: Freeze and bind the eight source inputs

**Files:**
- Modify only the source/progress files named by the relevant child plan.
- Create: `reports/runtime/eight-domain-production-readiness/20261017/source-manifest.json` and bind it to all eight run IDs, source hashes, allocation-manifest hashes, and V2 runner mappings.

- [ ] Record repository-frozen file/tree hashes and derived sample identities for Items, NPCs, Projectiles, Buffs, Bosses, and Shimmer without rewriting those tracked files.
- [ ] Capture only the declared bounded Audio metadata sample and missing Armor attribute/image inputs; use registered monitor-visible action IDs and private output/report paths.
- [ ] Verify revision/hash, progress terminal state, expected record counts, and empty/non-empty semantics before DML; source errors cannot become unchanged or empty success.
- [ ] A frozen or unchanged source can prove isolated execution only. It cannot set `productionSourceDelta=true` or be reported as a fresh production change.

### Task 3: Execute the eight child plans

- [ ] Complete each child plan in Section 7 serially, running its maintained-chain lane and one isolated V2 automatic attempt from the reviewed manifest; no child may choose or hard-code a resource allocation.
- [ ] Store the artifact, test output summary, and cleanup readback under the master evidence root.
- [ ] Reject a child pass if it uses a pseudo-adapter, unresolved allowlist not named in the child contract, or formal target resource.

### Task 4: Cross-domain reconciliation

**Files:**
- Create: `pipelines/automation/eight-domain-production-readiness-report.mjs`
- Test: `pipelines/automation/eight-domain-production-readiness-report.test.mjs`

- [ ] Load exactly eight child artifacts and fail on missing, malformed, stale, or duplicate run identities.
- [ ] Recompute the domain set, source hashes, owned-table declarations, cleanup status, and formal-write flags.
- [ ] Run cross-DB referential integrity, relation health, domain acceptance freshness, and API parity checks against the isolated readbacks.
- [ ] Produce `reports/runtime/eight-domain-production-readiness/20261017/aggregate.json` with basic-function, maintained-chain, V2 automatic, error-handling, and production-readiness statuses plus explicit blocker reasons.
- [ ] Report maintained-chain and V2 automatic counts separately; never summarize T1 or fixture success as automatic ingestion or as an overall production pass.
- [ ] Require each child artifact to contain `api.stoppedAfterReadback=true`, JAR/config/dependency-manifest hashes, and independent post-stop port/process checks.

```bash
node --test pipelines/workflow/domain-acceptance-report-manifest.test.mjs \
  pipelines/workflow/domain-acceptance-freshness-audit.test.mjs \
  pipelines/workflow/data-source-acceptance-report-manifest.test.mjs \
  pipelines/workflow/data-source-acceptance-freshness-audit.test.mjs
```

### Task 5: Formal production-readiness packet without production mutation

**Files:**
- Create: `reports/authorization/canonical/eight-domain-production-readiness-20261017.proposal.json`

- [ ] Bind the aggregate report to the current server fingerprint, V2 epoch/namespace, policy H8, code bundle, source manifests, and all eight child artifacts.
- [ ] Record Armor ownership blockers, Buff unresolved identities, Shimmer unresolved references, and any remaining five-domain gaps as explicit blockers rather than waivers.
- [ ] Keep production scheduler control unchanged and do not create a production permit, decision, formal import, or `/sweep` call against production. The isolated one-shot V2 sweep is allowed only under Task 1E's run-bound API mode.
- [ ] A production release task may be opened only after the aggregate report has eight passing basic-function, maintained-chain, V2 automatic, and error-handling child artifacts and all formal target preconditions are freshly read.

The formal release task must not reuse the isolated API environment file, Redis allocation, MySQL accounts, or child run IDs; it needs a fresh formal-target preflight and new authorization identities.

### Task 6: Final validation and closeout

- [ ] Run `bash ./platform/local/quality-gate.sh` with no unjustified skip flags.
- [ ] Run `git diff --check`, `git status --short`, and inspect the staged scope if this plan is committed.
- [ ] Update `docs/devlog/current.md` with the aggregate verdict and residual blockers.
- [ ] Keep this plan active if any domain is blocked; close only when the isolated eight-domain acceptance is complete and the production packet explicitly records the next authorization boundary.
- [ ] Keep `exec/eight-domain-production-readiness` and its worktree open through the eight runs; do not merge, push, or remove it until all eight artifacts and the aggregate review are complete. This planning checkpoint does not authorize merge or production release.

## 6. Production Release Gate After This Plan

This plan does not perform the formal release. A separate release task must still verify:

- fresh preflight against the actual formal target;
- fresh eight-domain authorization and non-expired packet identities;
- formal write fence and ownership predicates, especially NPC/Boss shared `npcs`;
- one controlled production canary per authorized domain with independent readback;
- source acknowledgement only after commit;
- rollback and failure compensation;
- final scheduler disabled/enabled state according to the approved release mode.

Unattended multi-cycle soak, expiry/renewal, and restart are intentionally outside this plan and remain a separate release gate.

## 7. Child Plans

- [ ] [Items](2026-10-16-eight-domain-production-readiness-items.md)
- [ ] [NPCs](2026-10-16-eight-domain-production-readiness-npcs.md)
- [ ] [Projectiles](2026-10-16-eight-domain-production-readiness-projectiles.md)
- [ ] [Audio](2026-10-16-eight-domain-production-readiness-audio.md)
- [ ] [Bosses](2026-10-16-eight-domain-production-readiness-bosses.md)
- [ ] [Armor Sets](2026-10-16-eight-domain-production-readiness-armor-sets.md)
- [ ] [Buffs](2026-10-16-eight-domain-production-readiness-buffs.md)
- [ ] [Shimmer](2026-10-16-eight-domain-production-readiness-shimmer.md)

## 8. Stop Conditions

Stop the current child before business DML when source identity, target identity, ownership, dependency identity, progress terminal state, or artifact path changes. Stop the entire master plan when formal schemas, production Redis, or an unrelated table is written, when a shared `npcs` fence overlaps, when cleanup is unknown, or when an unresolved row is silently discarded.
