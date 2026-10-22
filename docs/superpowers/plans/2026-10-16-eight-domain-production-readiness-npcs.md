# NPCs Isolated Real-Ingestion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this child plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a full 762-record NPC maintained-chain baseline in run-derived schemas, using the local source only under the user's explicit offline authorization while Wiki is unavailable. This baseline proves isolated ingestion and API behavior; it does not prove current Wiki parity or production readiness.

**Architecture:** The normal hybrid rule still probes `Module:Npcinfo/data` first: an exact Wiki/local revision match selects local data, while a changed Wiki revision requires a private revision-bound capture and validated 762-record crosswalk. A probe failure is never `unchanged`. For this run only, the user's explicit direction after repeated Wiki HTTP 502 maintenance responses authorizes the bound local source as `local-offline-authorized`; evidence must say `wikiUnchanged=false` and retain the failed probe plus local source hashes. Seed only exact read-only Item/category dependencies, run the maintained NPC landing/import/maint/relation/projection chain in fresh T1 schemas, and independently read back public/admin API responses. Flyway seeds migration-owned default category rows, so the NPC category dependency uses a narrow append policy that preserves those rows, rejects ID/code conflicts, and verifies their before/after hashes while seeding the exact five NPC fallback rows. This offline baseline does not establish Wiki freshness, source parity, owner-predicate acceptance, V2, or production readiness. Run serially with no active NPC or Boss writer; formal databases remain read-only.

**Tech Stack:** `fetch-wiki-npcinfo.mjs`, `npc-canonical-t1-acceptance.mjs`, `import-independent-entities-to-db.mjs`, `sync-maint-to-relation.mjs`, NPC readiness/loot audits, MySQL, Redis, Node tests.

## Scope and Gates

- In scope: NPC base facts, NPC maint/relation/projection rows owned by the NPC action, stable source IDs, and consumer API readback.
- Out of scope: formal `npcs` writes, Boss writes, production scheduler, and unproven loot rows. Loot is accepted only if the source contract names an NPC-owned partition and the isolated runner writes it through its maintained importer.
- Display names are never accepted as identity. The child must use stable NPC ID and source-page/revision bindings.
- The known shared-table predicate gap is a blocker: a full-table `npcs` scope or missing structured predicate cannot pass production-readiness.

## Current Authorized Execution

- The registered Wiki metadata probe returned HTTP `502 Bad Gateway` with the Wiki maintenance response twice. Do not send more Wiki requests during this NPC baseline.
- The user explicitly authorized the local-source path for this NPC full-chain test. The private failed-probe artifact must bind the same standardized source hash and Wiki identity; the standardized file, view metadata, and ID map must each match the fixed execution manifest's source hashes before provisioning. The generated source mode is `local-offline-authorized`; `wikiUnchanged` must be `false`.
- This run writes only to fresh run-derived T1 schemas and its allocated Redis DB2, starts the isolated API only through the run-owned lifecycle, and verifies formal NPC row count and full-row hash before/after. It does not attempt the remaining owner, concurrency, V2, or publication gates.
- The captured execution manifest's 2026-10-17 API JAR pin is stale relative to the current worktree build. NPC T1 records a verified current runtime code bundle and the exact rebuilt API JAR hash, then the run-owned API lifecycle pins that JAR for start/readback/stop. The old fixed JAR pin remains a recorded mismatch and is not silently rewritten; V2 keeps its separate code-pin review gate.
- Flyway's run-local category defaults remain intact. Only the five declared NPC fallback rows use `targetPolicy=append-exact`; the seeder rejects duplicate IDs/codes and verifies the migration rows are unchanged before and after.

## Tasks

### Task 1: Freeze source and owner predicate

**Files:** `data/standardized/npcs.standardized.json`, `data/standardized-view/npcs/_meta.json`, `data/generated/npc-standardized-map.json`, `pipelines/npc-canonical/npc-canonical-readiness.mjs`, `pipelines/automation/l2-policy-ceiling-artifact.mjs`, `pipelines/automation/table-ownership-matrix.test.mjs`

- [x] Consume the NPC allocation manifest entry and verify its endpoint/DB/API port are empty and no Boss child or `npcs` writer is active.
- [x] Bind local `data/standardized/npcs.standardized.json` (762 records), `data/standardized-view/npcs/_meta.json`, and `data/generated/npc-standardized-map.json` by SHA-256 and source timestamp. Bind the prior `wiki.module.npcinfo` manifest record separately; its page/revision/content identity must be present and comparable.
- [x] The failed probe artifact freezes the required `wiki.module.npcinfo` source identity/content hash. The maintained runner reconstructs its source binding only from that private artifact and does not re-read the shared mutable Wiki manifest after the decision is frozen.
- [x] Run registered read-only action `domain-source-npcs` through `pipelines/npc-canonical/npc-hybrid-source-probe.mjs`, progress path `data/generated/domain-source-npcs-progress.latest.json`, and a bounded request timeout. Record the remote page ID, revision ID/timestamp, request status, and response hash in the private NPC source decision artifact; do not mutate formal DBs or the canonical source manifest during this decision.
- [x] Select exactly one source mode: `local-unchanged` only when the remote revision identity matches the bound local manifest and the local 762-record source validates; `wiki-changed` only after a private revision-bound module capture parses and validates; `probe_unavailable` and `source_ambiguous` stop before provisioning/DML by default. A separate explicit user-directed offline baseline may select `local-offline-authorized`; it binds the exact failed Wiki probe and local files, and must record `wikiUnchanged=false`.
- [ ] Produce a structured owner predicate naming database role, columns, stable numeric NPC ID predicate, and excluded rows. This remains an owner/production-readiness gate beyond the isolated baseline.
- [x] Reject duplicate stable IDs and display-name-only identity. The local 762-record binding enforces unique numeric IDs and exact identity-map closure; the broader owner predicate remains unproven.
- [x] Create the NPC dependency manifest for exact Item/category/source rows and call the common exact-key dependency seeder before the first business DML. The five NPC category fallback rows append only after ID/code conflict checks and preserve migration-seeded rows by hash.

```bash
node --test pipelines/npc-canonical/npc-canonical-t1-acceptance.test.mjs \
  pipelines/automation/table-ownership-matrix.test.mjs \
  pipelines/automation/l2-policy-ceiling-artifact.test.mjs
```

### Task 2: Run the maintained NPC chain in isolation

**Files:** `pipelines/npc-canonical/npc-hybrid-source-probe.mjs` and its test; `pipelines/npc-canonical/npc-hybrid-source-selection.mjs` and its test; `pipelines/npc-canonical/npc-canonical-t1-acceptance.mjs`, `pipelines/import/import-independent-entities-to-db.mjs`, `pipelines/relation/sync-maint-to-relation.mjs`

- [x] Create `pipelines/npc-canonical/run-full-recrawl-canonical-isolated.mjs` and its test using the shared three-schema provisioner and manifest entry.
- [x] Pass a verified source decision into the runner; default execution rejects `probe_unavailable`, `source_ambiguous`, remote/local identity drift, and live sources outside the private run root. The offline mode requires explicit authorization and rejects any local file/source identity drift from the failed probe before schema provisioning.
- [x] Under explicit offline authorization, import the complete validated local 762-record source and retain the unavailable Wiki probe identity. Evidence records `sourceMode=local-offline-authorized` and `wikiUnchanged=false`; local-unchanged and wiki-changed remain separate future cases.
- [x] Seed only exact read-only Item/category dependencies; write all 762 NPC landing/local/maint/relation/projection rows through the maintained entrypoints and independently verify stable IDs and hashes.
- [x] Confirm no NPC/Boss writer is active before provisioning. A formal cross-domain `npcs` ownership fence and simulated concurrent Boss admission remain deferred owner/concurrency gates; this run is isolated to fresh schemas and does not write formal tables.
- Transaction rollback and concurrent Boss-admission failure injection remain deferred validation gates, outside this authorized baseline run.

### Task 3: Read back API and cleanup

- [x] Verify the local table starts empty and read back the exact 762 stable IDs in local, maint, relation, and projection rows; capture each result hash and compare the formal NPC full-row hash before and after.
- [x] Read the public NPC aggregate, admin NPC list, and admin detail through the run-owned API; verify the representative database ID, stable source ID, and internal name; stop the API and verify its exact process/port cleanup.
- V2 attempt/source acknowledgement, transaction rollback, and cross-domain owner admission are deferred. They remain required for later V2/production acceptance and are not implied by this baseline.
- [x] Verify run-derived schemas, temporary accounts, manifest endpoint/DB, Redis DB2, isolated API process/port, and child processes are zero after cleanup.
- [x] Write `reports/runtime/eight-domain-production-readiness/20261017/npcs/e8p_e6e949c02488c2b0/local-offline-maintained-1792588891001-1918110.json` with `sourceMode=local-offline-authorized`, `wikiUnchanged=false`, and full maintained-chain/API/cleanup evidence.

### Task 4: Validate and close the child

- [x] Run the NPC offline runner, hybrid source, maintained importer/sync, exact dependency, isolated API lifecycle tests, `node --check`, and `git diff --check`.
- [x] Mark only the isolated offline baseline passed after all 762 identities, all chain layers, independent API readback, formal hash stability, and cleanup pass. Overall NPC production readiness remains blocked while Wiki freshness and the structured owner predicate are unproven.
- V2 and production readiness remain blocked until a later authorized run proves exact source/attempt acknowledgement, owner scope, and V2 readback. Other domain work remains open in the parent plan.
