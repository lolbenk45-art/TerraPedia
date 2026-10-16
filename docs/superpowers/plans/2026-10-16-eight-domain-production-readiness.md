# Eight-Domain Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish, for Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and Shimmer, fresh evidence that the maintained source-to-database-to-consumer chain can perform real writes in isolated databases before any formal production release is considered.

**Architecture:** Each domain runs from a revision-bound real source capture into a run-derived `local/maint/relation` database set and the reviewed `redis-allocation-manifest.json` entry for that run. The execution must call the maintained importer/sync entrypoints, start a run-owned catalog API bound to the same three schemas when consumer routes are tested, independently read back business tables and API/projection consumers, and prove cleanup. The plan produces production-readiness evidence; it does not enable the production scheduler or write the formal `terria_v1_*` databases.

**Tech Stack:** Node.js ESM pipelines, Spring Boot catalog API, MySQL/InnoDB run-derived schemas, Redis V2 isolated logical databases or a run-owned loopback Redis instance, `node:test`, Maven, Nuxt checks, JSON evidence under `reports/runtime/eight-domain-production-readiness/`.

---

## 0. Execution Environment, Source Modes, And Cross-Test Matrix

### 0.1 Install the exact code in the specified directory

- [ ] The execution manifest must provide `executionRoot`, `codeRef`, `codeSha256`, `sourceRoot`, and `evidenceRoot`. A missing or non-absolute `executionRoot` blocks the run; the plan never silently falls back to the current dirty worktree.
- [ ] The coordinator creates or verifies an empty dedicated worktree at `executionRoot` from the exact `codeRef`, then verifies `git rev-parse HEAD` equals the manifest ref/hash. A non-empty directory, dirty checkout, detached commit mismatch, or source root outside the worktree stops before dependency installation.
- [ ] Install the exact toolchain in that directory and record versions: Node 22.x, pnpm 9.x, Java 17, Maven 3.8+, MySQL client, Redis CLI, and (only for image lanes) MinIO client/server. Do not use the coordinator's `node_modules`, Maven target, environment file, or cached credentials.

```bash
cd "$EXECUTION_ROOT"
corepack enable
corepack pnpm --version
cd apps/public-web && corepack pnpm install --frozen-lockfile
cd ../admin-console && corepack pnpm install --frozen-lockfile
cd ../../services/catalog-api && mvn -DskipTests dependency:go-offline
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

1. **Basic function:** parser/normalizer, source identity, schema contract, and representative API route.
2. **Isolated real ingestion:** maintained importer/sync writes run-derived databases, independent table hashes and API readback pass, and cleanup is zero.
3. **Error handling:** injected source/hash/identity/DB/API/Redis/object-store failures stop before unsafe mutation or compensate and reconcile after mutation.
4. **Release classification:** `repository-frozen`, `bounded-live-capture`, or production source-delta status; unresolved ownership/data blockers remain explicit.

The cross-test report must include the exact code ref, execution root, source mode, run ID, database/Redis/API/object-store identities, commands, exit codes, and artifact hashes.

### 0.3A Resume and interruption policy

Source-crawl resume and database-import retry are separate contracts:

| Domain | Current source interruption behavior | Required validation behavior |
| --- | --- | --- |
| Items | The detached Item page crawler has `--resume-from-progress=true`; the planned repository-frozen fast lane skips crawling entirely | Test the existing local-source lane plus one optional live resume contract; never call the recorded local path proof of live crawl resume |
| NPCs | Current monitor rule does not declare keyed resume for the base NPC refresh | Simulate interruption, prove failed terminal progress, then rerun the frozen source from fresh input with a new run identity |
| Projectiles | Current monitor rule does not declare keyed resume for the base Projectile refresh | Same fresh-rerun policy; explicit source identity prevents duplicate relation rows |
| Armor Sets | Armor-set source rule is fresh-only; its tests record `resumeOutcome=not_supported` | Simulate interruption, retain failed evidence, rerun from immutable source with a new run identity |
| Buffs | Keyed resume exists with `data/generated/resume/buff-page-immunity-refresh.resume.json` and fingerprint validation | Inject a crash before/after completion marking, resume only when the source fingerprint matches, and reject drift |
| Audio | Asset-download phase resumes from a manifest and skips only verified existing files; source discovery is not a general whole-crawl resume | Test verified-file skip, size/hash mismatch, transient retry, and non-retryable failure |
| Bosses | Keyed resume exists with `data/generated/resume/domain-source-bosses.resume.json` and fingerprint validation | Inject a crash before/after completion marking, resume matching pages, and reject changed seed sets |
| Shimmer | Current source rule has progress but no keyed resume contract | Simulate interruption, retain failed progress, and rerun the immutable generation/source from fresh input |

For database import interruption, no child may blindly continue from an unknown commit point. The runner must classify the outcome as `rolled_back`, `committed_and_readback_verified`, or `commit_outcome_uncertain`; the uncertain state requires independent reconciliation and a new governed run identity before retry. A new source crawl is not required when the frozen source bundle is still hash-valid.

### 0.4 Required failure-injection matrix

Each child or the shared harness must test and record:

- missing or malformed source file;
- network/process interruption at a source record boundary, including a crash before and after keyed completion marking for resume-capable domains;
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

This plan has two separate outcomes:

1. **Isolated real-ingestion readiness:** a domain writes its real maintained chain into disposable databases and is independently read back.
2. **Formal production release readiness:** all domain evidence, ownership contracts, source dependencies, API reads, rollback evidence, and current authorization gates pass for the formal target.

An isolated pass does not authorize a formal write. A source-readiness report, parser test, dry-run, fixture scheduler tick, direct pseudo-adapter, or historical `v2/L2/ACTIVE` row is not an isolated real-ingestion pass.

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
| Items | `repository-frozen` from `data/standardized/items.standardized.json` plus `data/standardized-view/items/` and `data/standardized-view/item_pages/`; deterministic selected sample for the fast lane | Fast local-source validation; full 6k-page recrawl is explicitly out of this validation. Maintained-chain subset must be tested separately from the recorded compatibility path. |
| NPCs | `repository-frozen` standardized NPC data plus tracked canonical NPC snapshots; bounded live probe only if a current revision check is needed | Real isolated chain for the frozen source; no fresh upstream delta claim. |
| Projectiles | `repository-frozen` `data/standardized/projectiles.standardized.json` and standardized-view metadata with explicit source-relation fields | Real isolated relation/import test; no `aiStyle` inference. |
| Audio | `repository-frozen` generated audio catalog and BGM display-name artifacts; live fetch only for a bounded representative check | Metadata/link chain can be tested without a full audio crawl; binary upload mode is separate. |
| Bosses | `repository-frozen` `data/generated/wiki-bosses.latest.json` plus tracked NPC identity map | Isolated Boss/NPC ownership test; no new Boss source delta claim. |
| Armor Sets | `repository-frozen` generated Armor set/attribute/image evidence with hashes; live capture only for missing revision evidence | Maintained set/image chain and source ownership test; formal ownership blockers remain. |
| Buffs | `repository-frozen` full local Buff/Iteminfo/page-evidence artifacts already captured; bounded live replay only if current-source compatibility is needed | Full 400-record isolated chain without waiting for a new Wiki revision; no production source-delta claim. |
| Shimmer | `repository-frozen` content-addressed generation, manifest, and raw source artifacts | Six-scope isolated transaction test; unresolved references remain a production blocker. |

This table is the execution default. A child may switch to `bounded-live-capture` only with a new source manifest and no silent replacement of the frozen artifact.

## 2. Required Verification Before Any Domain Run

These checks are prerequisites for all eight child plans.

### 2.1 Repository and evidence baseline

- [ ] Confirm branch, worktrees, dirty paths, and current devlog before touching an execution worktree.

```bash
git status --short --branch
git worktree list
sed -n '1,220p' docs/devlog/current.md
```

- [ ] Create the evidence root `reports/runtime/eight-domain-production-readiness/20261016/` only from a clean dedicated execution worktree. Do not copy private artifacts from another worktree to bypass trusted-root checks.
- [ ] Record the current commit, Node version, Maven version, MySQL server UUID/host/port, Redis server identity, and migration level in `baseline.json`.

### 2.2 Isolation resource decision (blocking; no allocations are pre-approved)

The current repository contracts disagree: `assertAutomationRedisLogicalDb` accepts DB1-13 or DB18, while the V2 scheduler system driver accepts DB1-16. Historical isolated Armor/Buff/Shimmer artifacts used DB20/DB22/DB24 through execution-worktree-specific contracts, but those allocations are not supported by the shared contract in this branch. Do not infer that a logical DB exists, is empty, or is available from a historical run.

- [ ] Read-only inventory the actual Redis endpoint(s), `CONFIG GET databases`, server identity, listening ports, persistence directories, current process owners, and `DBSIZE` for every candidate DB. Do not issue writes, `FLUSHDB`, startup, shutdown, or cleanup during this inventory.
- [ ] Record the inventory in `reports/runtime/eight-domain-production-readiness/20261016/redis-resource-inventory.json`, including check time and command outputs summarized without credentials.
- [ ] Select one resource model only after the inventory: (A) extend the shared isolated-DB allowlist with a reviewed, explicit allocation manifest supported by the actual Redis configuration, or (B) use a run-owned disposable loopback Redis instance with a unique port. A run-owned instance may use DB0 only after the shared contract accepts DB0 conditionally on a cryptographically bound run-owned endpoint/process identity; otherwise it must use a contract-allowed DB. The plan does not preselect DB numbers or a port.
- [ ] Produce `redis-allocation-manifest.json` with exactly eight sequential-run entries, each binding domain, host, port, logical DB, Redis server identity, owner/lifecycle, preflight emptiness evidence, and cleanup method. Entries may reuse one run-owned endpoint only after the prior owner has stopped, its exact keys are zero, and a new allocation epoch is recorded; no two active tasks may own the same endpoint/DB.
- [ ] Add contract tests proving all eight manifest entries are accepted and unlisted, reserved, historical, occupied, out-of-range, or endpoint-drifted resources fail before provisioning. Preserve explicit protection of production DB14/DB15 and historical DB16/DB18.
- [ ] Keep all eight child tasks blocked until the allocation decision, manifest, and tests are reviewed. If neither resource model can be proven, stop and request an environment design decision; do not invent DB numbers.

```bash
node --test pipelines/automation/automation-database-contract.test.mjs \
  pipelines/automation/run-live-automation-acceptance.test.mjs \
  pipelines/automation/canonical-operation-execution-manifest.test.mjs \
  pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs
```

### 2.3 Formal-target non-write guard

- [ ] Every child runner consumes only its manifest entry, rejects `terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`, production Redis DB14/DB15, and production API ports before opening a write connection.
- [ ] Formal schemas are available only through a read-only snapshot account for dependency seeding. The run-derived schemas are the only write targets.
- [ ] The isolated API must use a distinct run-owned `apiReadonly` MySQL account with `SELECT, SHOW VIEW` only on the three run-derived schemas. It must never use the formal snapshot account (formal schemas only) or the provisioner account (DDL/DML authority).
- [ ] Add a negative test that a formal database name, symbolic-link evidence path, changed source hash, mismatched run identity, or sibling attempt artifact fails before the first business DML.
- [ ] Consumer API verification uses a run-owned backend process bound to the same run-derived schemas. The process receives `APP_PORT`, `TERRAPEDIA_DB_URL`, `TERRAPEDIA_DB_MAINT`, `TERRAPEDIA_DB_RELATION`, `TERRAPEDIA_DB_USERNAME`, `TERRAPEDIA_DB_PASSWORD`, `TERRAPEDIA_REDIS_HOST`, `TERRAPEDIA_REDIS_PORT`, `TERRAPEDIA_REDIS_DATABASE`, `SPRING_TASK_SCHEDULING_ENABLED=false`, and its run-owned admin/token secrets through an allowlisted isolated environment; it never inherits the ordinary local-stack configuration.
- [ ] The run-owned backend uses a unique loopback port recorded in the run artifact, exposes only the required health/public/admin routes, and is stopped only after API readback and post-stop process/port checks pass.

### 2.4 Source and chain contract

Each child must provide all of the following before apply:

- [ ] Real source capture with provider, page/module identity, revision ID or immutable source timestamp, raw bytes hash, parsed bundle hash, and terminal progress.
- [ ] Frozen input manifest bound to the run ID and code bundle hash.
- [ ] Maintained importer/sync call path. Direct SQL, direct JSON mutation, `recrawl_*` tables, or direct pseudo-adapters are diagnostic only and cannot pass the gate.
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

- [ ] For each domain, read the relevant backend DTO/API through the run-owned isolated backend configured only with the run-derived schemas. A direct SQL read alone is insufficient.
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
reports/runtime/eight-domain-production-readiness/20261016/<domain>/<runKey>/isolated-real-ingestion.json
```

The artifact must contain:

```json
{
  "domainId": "items",
  "runId": "...",
  "source": {"provider": "terraria.wiki.gg", "revision": "...", "rawSha256": "sha256:...", "bundleSha256": "sha256:..."},
  "isolatedTarget": {"mysql": {"host": "127.0.0.1", "port": 0, "serverUuid": "...", "databases": {"local": "...", "maint": "...", "relation": "..."}}, "redis": {"host": "...", "port": 0, "logicalDb": 0, "serverIdentity": "...", "allocationManifestHash": "sha256:..."}, "api": {"host": "127.0.0.1", "port": 0, "jarSha256": "sha256:...", "configHash": "sha256:...", "stoppedAfterReadback": true}, "objectStore": {"mode": "none|metadata-link-only|isolated-binary|read-only", "allocationManifestHash": "sha256:...", "endpoint": "...", "bucket": "...", "objectPrefix": "...", "beforeHash": "sha256:...", "afterHash": "sha256:..."}},
  "accounts": {"provisioner": "...", "formalReadonly": "...", "apiReadonly": "...", "cleanupVerified": true},
  "formalDatabaseWrites": false,
  "maintainedEntrypoints": ["..."],
  "dependencySeeds": {"manifestSha256": "sha256:...", "rowsByTable": {}, "readbackVerified": true},
  "before": {"tables": {}, "api": {}},
  "write": {"transactionCommitted": true, "rollbackProbePassed": true, "readbackVerified": true},
  "after": {"tables": {}, "api": {}},
  "unresolved": [],
  "cleanup": {"schemas": 0, "accounts": 0, "redisKeys": 0, "apiOwnedRedisKeys": 0, "childProcesses": 0, "apiProcesses": 0, "apiPorts": 0, "ephemeralSecrets": 0, "passed": true},
  "isolatedIngestionStatus": "passed",
  "localSourceCompatibilityStatus": "not-applicable|passed|blocked",
  "errorHandlingStatus": "passed|blocked|unverified",
  "productionReadinessStatus": "blocked"
}
```

Use separate statuses: `isolatedIngestionStatus` describes whether the maintained chain genuinely wrote and read back in the disposable target; `productionReadinessStatus` describes unresolved source, ownership, and consumer blockers. An isolated pass is forbidden when formal schemas were written, the maintained chain was bypassed, dependency seeds were incomplete, unresolved data was silently dropped, API verification used a different DB binding, or cleanup is unknown.

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

The order is operational, not a permission to write formal databases. A failed child stops only its child lane, but the master plan cannot advance to production sign-off until the failure is repaired and re-run with a new run identity.

## 5. Master Tasks

### Task 0: Decide and prove isolated Redis resource ownership

**Files:**
- Create: `reports/runtime/eight-domain-production-readiness/20261016/redis-resource-inventory.json`
- Create: `reports/runtime/eight-domain-production-readiness/20261016/redis-allocation-manifest.json`
- Modify: `pipelines/automation/automation-database-contract.mjs` only if the chosen model needs shared-contract changes
- Modify: `pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs` only if its isolated test boundary must align
- Test: `pipelines/automation/automation-database-contract.test.mjs`
- Test: `pipelines/monitor/crawler-queue-v2-scheduler-lifecycle.test.mjs`

- [ ] Complete the read-only inventory in Section 2.2 and record the live configuration and process ownership.
- [ ] Choose either the allowlisted logical-DB model or the run-owned disposable Redis model; record why the other option does not fit the observed environment.
- [ ] Define exactly eight sequential-run allocations from verified available resources. Record domain, endpoint, DB, owner, preflight evidence, and cleanup procedure; no candidate IDs from this plan are authoritative.
- [ ] Add RED/GREEN contract tests for the selected allocation model, including production/historical DB rejection, occupied resource rejection, endpoint drift, exact owner cleanup, and failure before provisioning.
- [ ] Verify the shared acceptance adapter, each domain wrapper, and the scheduler fixture driver use the same allocation decision or document their distinct validated contract.
- [ ] Do not start MySQL schemas, create temporary accounts, launch Redis, or run a source capture until this task is reviewed and the allocation manifest passes.

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
- Read/verify: `services/catalog-api/src/main/resources/application.yml`
- Read/verify: `pipelines/monitor/crawler-queue-v2-scheduler-system-driver.mjs`

- [ ] Accept only a reviewed allocation manifest entry, run-derived three-database names, a unique loopback port, and an explicit run directory; reject formal schemas, production ports, inherited `TERRAPEDIA_DB_URL`, and missing maint/relation bindings before starting Java.
- [ ] Before API startup, apply/verify the required migration SQL set against only the three run-derived schemas using the run provisioner account; record the ordered migration file list/hash and post-migration schema fingerprints. The API process itself uses the distinct `apiReadonly` account and must set `SPRING_FLYWAY_ENABLED=false` after the migration check so startup cannot require DDL privileges.
- [ ] Generate a private mode-`0600` environment file that binds `TERRAPEDIA_DB_URL` to the run-derived local schema and sets `TERRAPEDIA_DB_MAINT`/`TERRAPEDIA_DB_RELATION` to the matching schemas. Use only the `apiReadonly` MySQL account for API reads. Bind `APP_PORT` and Redis host/port/logical DB from the allocation manifest, set `SPRING_TASK_SCHEDULING_ENABLED=false`, `TERRAPEDIA_CRAWLER_AUTOMATION_READ_ONLY=true`, `TERRAPEDIA_CRAWLER_QUEUE_V2_CUTOVER_ALLOWED=false`, `MANAGEMENT_HEALTH_MAIL_ENABLED=false`, and when object storage is enabled bind `TERRAPEDIA_MINIO_ENABLED`, `TERRAPEDIA_MINIO_ENDPOINT`, `TERRAPEDIA_MINIO_PUBLIC_ENDPOINT`, `TERRAPEDIA_MINIO_BUCKET`, `TERRAPEDIA_MINIO_OBJECT_PREFIX`, and run-only credentials from the object-store entry. Generate distinct run-only `TERRAPEDIA_AUTH_TOKEN_SECRET` and `TERRAPEDIA_USER_TOKEN_SECRET` values, plus the admin username/password, and record only a hash of the redacted configuration.
- [ ] Reject a formal-schema migration target, a missing migration manifest/hash, or a migration result that changes any schema outside the three run schemas; treat it as an immediate stop. Do not assume a Flyway history row exists when migrations are applied through the shared acceptance adapter.
- [ ] Generate a run-owned admin credential/token secret for admin route readback; never reuse the ordinary local-stack admin token or a production secret. Record only a hash and expiry in the artifact.
- [ ] Create and verify the `apiReadonly` account and exact grants before API startup; include it in the manifest/account inventory and drop/read back its absence during cleanup.
- [ ] Bind all temporary MySQL accounts to the loopback/required host identity or, if the existing adapter retains a wildcard host grant, prove MySQL is loopback-only before provisioning and record that limitation as a blocker for any non-loopback environment.
- [ ] Build/package the current catalog API source revision, record the exact JAR SHA-256, then start only that artifact with the run-owned environment. Set `SPRING_FLYWAY_ENABLED=false` only after the schema provisioner has applied required migrations to all three run-derived schemas; poll `/api/actuator/health` and expose `started`, JAR hash, migration hash, database fingerprint, Redis fingerprint, port, and PID.
- [ ] Provide a bounded `readback` command that accepts only route names declared by the child plan, records HTTP status/body hash, and fails when the API reports the formal database identity, the wrong Redis endpoint, scheduler enabled, or crawler automation not read-only.
- [ ] Authenticate admin route samples only through `/api/auth/login` using the run-owned admin username/password, record the token only in a mode-`0600` ephemeral file, and remove it before cleanup. Public routes must also be read without an admin token where applicable.
- [ ] Provide a `stop`/`cleanup` path that verifies the exact PID and port, stops only the run-owned process, removes the private environment file, and proves the port/process are absent. Cleanup failure blocks the child artifact.
- [ ] Add tests for formal database rejection, inherited-config rejection, wrong schema binding, wrong Redis endpoint, port collision, API health failure, PID mismatch, and successful stop/readback.
- [ ] Run API readback inside the child acceptance executor while run-derived schemas/accounts still exist; stop the run-owned API and verify its PID/port before the executor returns and the shared T1 harness drops schemas/accounts.
- [ ] Capture Redis keys created by the API login/rate-limit/readback path, prove they belong to the run allocation, delete only those exact keys before releasing the Redis reservation, and fail cleanup if any foreign key is present.

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
- Create: `reports/runtime/eight-domain-production-readiness/20261016/object-store-allocation-manifest.json`
- Read/verify: `services/catalog-api/src/main/resources/application.yml`
- Read/verify: `platform/local/start-local-stack.sh`

- [ ] Accept only the object-store entry declared for Armor/Boss/Audio, reject the formal bucket, production endpoint, inherited credentials, and an object prefix outside the run identity.
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

- [ ] Provide named injections for source hash drift, missing dependency, Redis reservation conflict, migration failure, first-DML failure, post-commit readback failure, API wrong-binding/start failure, NPC/Boss fence conflict, object-store conflict, process interruption, and cleanup failure.
- [ ] Require every injection to emit a terminal artifact with `expectedFailure`, observed state, rollback/compensation state, cleanup state, and whether any business mutation survived.
- [ ] Reject a test that only asserts a thrown error; the harness must independently read database counts/hashes, Redis keys, API process/port, accounts, and object-store state after the failure.
- [ ] Run the shared failure matrix once against the Item local-source fast lane and once against one full maintained-chain representative; each other child must run domain-specific identity/fence/object-store injections named in its plan.

```bash
node --test pipelines/automation/eight-domain-failure-injection.test.mjs
```

### Task 2: Refresh the eight real source bundles

**Files:**
- Modify only the source/progress files named by the relevant child plan.
- Create: `reports/runtime/eight-domain-production-readiness/20261016/source-manifest.json` and bind it to the eight child run IDs and the allocation-manifest hash.

- [ ] Each child Task 1 performs its one real source capture with a new run identity and emits a source submanifest; this master task only aggregates those submanifests and must not trigger a second fetch.
- [ ] Verify each source revision/hash, progress terminal, and non-empty/empty semantics; source errors cannot be converted into unchanged or empty success.
- [ ] If a source is unchanged, retain its fresh capture as isolated evidence; do not fabricate a production change event.

### Task 3: Execute the eight child plans

- [ ] Complete each child plan in Section 7 serially, loading its Redis and API allocation from the reviewed manifest; no child may contain a hard-coded resource allocation.
- [ ] Store the artifact, test output summary, and cleanup readback under the master evidence root.
- [ ] Reject a child pass if it uses a pseudo-adapter, unresolved allowlist not named in the child contract, or formal target resource.

### Task 4: Cross-domain reconciliation

**Files:**
- Create: `pipelines/automation/eight-domain-production-readiness-report.mjs`
- Test: `pipelines/automation/eight-domain-production-readiness-report.test.mjs`

- [ ] Load exactly eight child artifacts and fail on missing, malformed, stale, or duplicate run identities.
- [ ] Recompute the domain set, source hashes, owned-table declarations, cleanup status, and formal-write flags.
- [ ] Run cross-DB referential integrity, relation health, domain acceptance freshness, and API parity checks against the isolated readbacks.
- [ ] Produce `reports/runtime/eight-domain-production-readiness/20261016/aggregate.json` with `passedDomains`, `blockedDomains`, and explicit blocker reasons.
- [ ] Produce separate `isolatedIngestionStatus` and `productionReadinessStatus` counts; never summarize an isolated pass with unresolved production blockers as an overall production pass.
- [ ] Require each child artifact to contain `api.stoppedAfterReadback=true`, JAR/config/dependency-manifest hashes, and independent post-stop port/process checks.

```bash
node --test pipelines/workflow/domain-acceptance-report-manifest.test.mjs \
  pipelines/workflow/domain-acceptance-freshness-audit.test.mjs \
  pipelines/workflow/data-source-acceptance-report-manifest.test.mjs \
  pipelines/workflow/data-source-acceptance-freshness-audit.test.mjs
```

### Task 5: Formal production-readiness packet without production mutation

**Files:**
- Create: `reports/authorization/canonical/eight-domain-production-readiness-20261016.proposal.json`
- Create: `docs/devlog/entries/2026-10-16-eight-domain-production-readiness.md`

- [ ] Bind the aggregate report to the current server fingerprint, V2 epoch/namespace, policy H8, code bundle, source manifests, and all eight child artifacts.
- [ ] Record Armor ownership blockers, Buff unresolved identities, Shimmer unresolved references, and any remaining five-domain gaps as explicit blockers rather than waivers.
- [ ] Keep scheduler control disabled and do not create a production permit, decision, formal import, or `/sweep` call in this task.
- [ ] A production release task may be opened only after the aggregate report has eight passing child artifacts and all formal target preconditions are freshly read.

The formal release task must not reuse the isolated API environment file, Redis allocation, MySQL accounts, or child run IDs; it needs a fresh formal-target preflight and new authorization identities.

### Task 6: Final validation and closeout

- [ ] Run `bash ./platform/local/quality-gate.sh` with no unjustified skip flags.
- [ ] Run `git diff --check`, `git status --short`, and inspect the staged scope if this plan is committed.
- [ ] Update `docs/devlog/current.md` with the aggregate verdict and residual blockers.
- [ ] Keep this plan active if any domain is blocked; close only when the isolated eight-domain acceptance is complete and the production packet explicitly records the next authorization boundary.

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
