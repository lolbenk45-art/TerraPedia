# Eight-Domain Production Readiness Plan

## Status

`active`

- Owner: Codex coordinator.
- Branch: `exec/eight-domain-production-readiness`.
- Worktree: `/home/lolben/TerraPedia/.worktrees/eight-domain-production-readiness`.
- Parent plan: `docs/superpowers/plans/2026-10-16-eight-domain-production-readiness.md`.
- Child plans: the eight `2026-10-16-eight-domain-production-readiness-*.md` files beside the parent plan.

## Goal

Prove basic functionality, maintained-chain writes, and one real V2-dispatched automatic ingestion attempt for Items, NPCs, Projectiles, Armor Sets, Buffs, Audio, Bosses, and Shimmer in isolated databases, with error recovery and independent API readback before any formal production release. This planning continuation performs no dependency installation, crawler/importer run, service lifecycle change, scheduler call, or database mutation.

## Evidence Reviewed

- `docs/devlog/current.md` and the 2026-10-13 three-domain full-recrawl handoff.
- `docs/project-governance/00_CURRENT_SPEC.md` and `docs/project-governance/00_WORKFLOW.md`.
- Existing isolated real-ingestion plan and maintained T1/Importer entrypoints.
- Current allocation state: fixed resource identities, eight run IDs, source paths/hashes, and derived MySQL schema names are recorded in the ignored execution manifest. Historical DB20/DB22/DB24 artifacts are reference only; production Redis DB14/DB15 and historical DB16/DB18 are forbidden.

## Plan Result

- Created one master plan and eight domain child plans.
- Defined the required evidence contract: source revision/hash, run-derived schemas, isolated Redis, maintained importer/sync, table/API readback, rollback, cleanup, and `formalDatabaseWrites=false`.
- Recorded hard blockers rather than waivers: NPC/Boss shared-table ownership, Armor `maint_items` and source contracts, Buff unresolved identities and source/maint drift, and Shimmer unresolved references.
- Repaired plan defects found during review: child plans consume a reviewed allocation manifest instead of selecting Redis/schema IDs; missing Armor/Buff/Shimmer runners are explicit creation tasks; Shimmer paths use the actual transform/contract modules; and isolated API lifecycle, schema/Redis binding, route readback, stop, and cleanup are explicit.
- Follow-up review tightened dependency and runtime boundaries: bounded T1 snapshots cannot stand in for exact dependency closure; a tested key-list dependency seeder is required; API/Flyway migration uses the provisioner before read-only API startup; scheduler/crawler writes are disabled in the isolated API; artifacts separate isolated-ingestion and production-readiness status; and the master source task aggregates child captures instead of refetching them.
- Final review found and repaired the API account/grant gap: the formal snapshot account remains formal SELECT-only, the provisioner remains the migration/write account, and a distinct run-owned `apiReadonly` account with SELECT-only grants on the three isolated schemas is required, including login/rate-limit Redis key ownership and cleanup. The plan also requires exact child dependency manifests and migration SQL/schema fingerprints rather than bounded sample or assumed Flyway-history evidence.
- The latest review also requires explicit API-only Redis key cleanup, run-owned admin login through `/api/auth/login`, separate MySQL/API account inventory, `SPRING_TASK_SCHEDULING_ENABLED=false`, exact JAR/migration/config hashes, and distinct isolated-ingestion versus production-readiness statuses. All eight child plans now declare their exact dependency manifest and common seeder call before business DML.
- One final harness gap was closed in the plan: production-readiness T1 runs must pass their exact dependency manifest into `runLiveAutomationAcceptance`/the MySQL adapter and disable the generic bounded sample copy; historical T1 contracts may retain the old bounded mode only when explicitly declared.
- The latest review added the object-storage boundary: Armor/Boss image lanes need a run-owned MinIO bucket/prefix or verified read-only cache mode with object-list hashes and cleanup; Audio must declare metadata-link-only versus isolated-binary mode. The artifact now records object-store mode/identity when applicable.
- The final pass added the run-owned API MySQL account/grants, exact T1 dependency-manifest mode (generic bounded samples disabled), isolated API scheduler/crawler write guards, and object-store lifecycle task/tests. No runtime command was run during review.
- Final review also split object-store allocation into its own manifest, clarified distinct admin/user token secrets and API read grants, and removed all remaining ambiguity between formal dependency reads, isolated seeding, and API access.
- The execution-standard review found three missing requirements and added them: exact-code installation in a clean specified worktree, a cross-domain basic/isolated/error/release test matrix, and an explicit frozen-local-source strategy. Item now has a fast local compatibility lane plus a separate maintained subset lane; it no longer requires a full 6k-page recrawl for this validation. Other domains use their existing generated/standardized/revision-bound artifacts by default, with bounded live capture optional rather than silently required.
- Resume review confirmed capability is mixed: keyed source resume exists for Buff and Boss, asset-level resume exists for Audio, detached Item crawling can resume when the live lane is selected, while base NPC/Projectile, Armor Sets, and Shimmer use failed-progress plus fresh rerun. The plan now distinguishes source resume from transaction retry and requires explicit `commit_outcome_uncertain` reconciliation.
- Preserved production release and unattended-operation gates as a separate follow-up; this plan does not enable the scheduler or write formal databases.

## Validation

- Read-only entrypoint and evidence inspection completed before plan creation.
- New plan files pass targeted whitespace, placeholder, link, and structure scans.
- Follow-up plan review passes fixed-resource, missing-path, API-binding, dependency-closure, status-separation, and child-runner creation scans.
- Final read-only review passes account/grant, API write-path, dependency-seeder, migration-fingerprint, Redis-key-cleanup, and child dependency declaration scans.
- `git diff --check` still reports pre-existing trailing whitespace in unrelated `docs/superpowers/plans/2026-06-08-front-typography-theme-spacing.md`; the new plan and devlog files have no whitespace errors.

## Next Action

Complete the fixed-resource/source/V2 plan audit and static contract tests first. Then revalidate the fixed resources without prompting, implement the isolated runner/API bindings, and execute the eight child plans serially in this worktree. Stop automatically on any mismatch; create a new run identity only after a scoped repair and fresh preflight.

## Execution Baseline Inventory - 2026-10-17 01:44 CST

- Execution branch/worktree: `exec/eight-domain-production-readiness` at commit `3aa7f055a86afc69509dad8e50886c34d3701d54`; worktree clean before inventory. The parent worktree's unrelated dirty files were not copied.
- MySQL is reachable read-only at `127.0.0.1:13306`, server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, with formal databases `terria_v1_local`, `terria_v1_maint`, `terria_v1_relation`, and historical `terria_v1_v55_rehearsal`. No `terria_v1_automation_*` schemas were present.
- Redis `127.0.0.1:6380` was unreachable; its persistent directory exists and contains AOF/RDB files. No Redis allocation was approved and no Redis command mutated state.
- MinIO `127.0.0.1:19000/19001` was unreachable; its data directory contains only the existing `.minio.sys/format.json`. No object-store allocation or write was performed.
- No catalog API, frontend, admin, Redis, or MinIO listener was active. Only the shared MySQL daemon was listening on `13306`.
- Toolchain observed: Node `26.1.0` default shell with Node `22.23.0` available through nvm, pnpm `9.0.0`, Java `17.0.18`, Maven `3.8.7`, MySQL CLI `9.2.0`, Redis CLI `7.0.15`. No dependency installation was performed.
- Baseline artifact: `reports/runtime/eight-domain-production-readiness/20261017/execution-manifest.json`.
- Blocked before execution: Redis/object-store allocation, Node 22 shell selection, isolated account/resource creation, and bringing the reviewed plan into this branch are now resolved only for the plan/baseline; runtime resources remain intentionally unallocated.

## Plan Audit Continuation - 2026-10-17

- Current execution branch/worktree/HEAD at review start: `exec/eight-domain-production-readiness`, `/home/lolben/TerraPedia/.worktrees/eight-domain-production-readiness`, `756ae8bf96f58e6a3e6c7edb256c57bdeb65967c`. The coordinator root worktree has unrelated dirty paths; they were not changed or copied.
- Resource contract is fixed but not live-reserved: MySQL source/readback identity `127.0.0.1:13306` / UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`; Redis `127.0.0.1:16380`, DB1-8; MinIO `127.0.0.1:19100/19101`; isolated API `127.0.0.1:18280`. Exact run IDs, derived schema names, source hashes, buckets, and stop/no-fallback rules are in `reports/runtime/eight-domain-production-readiness/20261017/execution-manifest.json`. Fresh occupancy/hash/credential preflight is still required before install or service start.
- Source inventory corrected the plan: Items uses the 6,131 local standardized rows and a deterministic 100-ID sample; NPCs uses 762 standardized rows and the existing identity map; Projectiles uses 1,111 standardized rows; Buffs uses 388 standardized rows, not a nonexistent 400-row Iteminfo/page bundle; Bosses uses 33 frozen records and the NPC identity map; Shimmer uses the pinned generation `379faae98a1996d3132781c4ba373f05ad3bed75f2eeb7c62072e860fc8b3761`; Audio has no frozen catalog and will use a 150-record/5-page-per-prefix metadata-only capture; Armor's attribute/image outputs are missing and will use one bounded attribute page plus at most 64 exact image inputs.
- Critical automation finding: `run-base-domain-automatic-operation`, `run-supplementary-domain-automatic-operation`, and the supplementary L1 adapter all reject any database other than `terria_v1_local`. The previous plan proved only a T1 maintained import path. Task 1E now requires an explicit manifest-bound isolated profile and one authenticated non-fixture V2 sweep per domain; fixture or direct-runner success cannot set V2 automatic status.
- V2 source-probe finding: the normal API `/sweep` spawns `check-source-updates.mjs` for the full source set and writes the canonical source state. Isolated mode now requires a run-local source snapshot derived from the exact input manifest and passes its private ordinary-file path into the child worker; production mode keeps the current live probe. The sandbox records an initial import with `productionSourceDelta=false` and cannot reuse a fixture attempt.
- V2 worker command finding: `CrawlerMonitorActionRegistry` defaults Base/Supplementary attempts to live source mode and the Armor runner always fetches/acknowledges its source manifest. Task 1E now requires isolated commands to use `source-mode=local` and per-run private manifests, redirect automatic artifacts under the run's `reports/runtime` root, disable Wiki-manifest mutation, and count only the V2 queue's post-commit terminal acknowledgement. Production command definitions remain live.
- API plan audit: the catalog API has no Actuator dependency, so health proof uses PID/port ownership plus public `/api/public/home/focus-item` and authenticated admin overview. `SchedulingConfiguration` honors `spring.task.scheduling.enabled=false`. The canonical Flyway CLI is fixed to formal `terria_v1_local`; isolated T1 schema preparation must use the already-tested `mysql-automation-acceptance-adapter` builders and record the exact SQL/build inputs.
- Resume/error contract: no full Item crawl. A deterministic mock interrupts the 100-record Item test after record 50 and resumes only with an unchanged source fingerprint. Buff/Boss keyed resume and Audio verified-file resume are tested with private fixtures; fresh-only domains prove failed terminal progress plus a new run ID. Database commit uncertainty requires independent reconciliation before retry.
- Runtime status at this checkpoint: no dependency installation, service start/stop, source fetch, MySQL schema/account creation, Redis/MinIO mutation, V2 sweep, or business-table write was performed. The root worktree changes remain untouched.
- Next action: finish targeted plan consistency checks, validate the execution manifest JSON and source hashes, run documentation validation, then commit this plan/devlog-only checkpoint. Execution begins only after the written Task 0/1E static tests and fresh resource preflight pass; mismatches stop automatically without user prompts.

## Execution Progress - 2026-10-17

- Dependencies installed only in the execution worktree: public-web/admin-console `pnpm install --frozen-lockfile`, catalog API `mvn -B -DskipTests package`; lockfiles/POM unchanged. Install manifest: `reports/runtime/eight-domain-production-readiness/20261017/install-manifest.json`; backend JAR SHA-256 `sha256:5a982ba0af7c66c5106df28d9ec236765c8a97df26406c11f928c5cabc4dc741`.
- Read-only MySQL preflight passed with server UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, port `13306`, four expected formal/historical schemas, and zero automation schemas. Candidate ports `16380`, `19100`, `19101`, and `18280` were free; no crawler writer was active; Redis/MinIO/API were not started.
- Implemented the fixed allocation contract in `pipelines/automation/eight-domain-isolated-allocation.mjs` with tests in `pipelines/automation/eight-domain-isolated-allocation.test.mjs`. It derives the eight run-key/schema triples, fixed Redis DB1-8, Armor/Boss MinIO buckets, exact API port, and rejects formal/historical/shared resources, endpoint/binary/root drift, active writers, and fallback policies.
- Bound `runLiveAutomationAcceptance` to the isolated allocation before private-directory creation, resource announcement, or MySQL adapter creation. A stale/missing live preflight, wrong run/schema/Redis/API/object-store identity, or artifact-root drift stops before mutation. Existing production-mode behavior remains unchanged.
- Verification: acceptance `16/16`, allocation/database contract `18/18`, scheduler lifecycle `33/33`, `node --check`, and `git diff --check` pass. No MySQL schema/account mutation, Redis/MinIO write, service start/stop, crawler, importer, or V2 sweep occurred.
- Remaining next gate: implement the run-owned API lifecycle, exact dependency seeder, object-store lifecycle, failure-injection harness, and isolated V2 worker/source-mode binding. Repeat the live resource preflight immediately before any service start; fixed allocation entries remain `planned`, not `ready`.
