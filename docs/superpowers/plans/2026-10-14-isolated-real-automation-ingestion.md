# Isolated Real Automation Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run each full Armor, Buff, and Shimmer recrawl through its maintained automation ingestion chain against run-derived MySQL schemas and Redis DB20/22/24, read back the business tables, and remove every temporary resource without writing formal databases.

**Architecture:** Keep formal database and production scheduler boundaries unchanged. Add only isolated execution wrappers or narrowly parameterized acceptance entrypoints that reuse the existing domain importer/sync functions, provision run-derived schemas from the existing snapshot/migration adapter, bind the exact fresh source bundle, verify downstream counts/hashes, then use the existing cleanup contract. A domain is successful only when the real chain writes its maintained landing/maint/relation/projection tables; custom `recrawl_*` or direct pseudo adapters remain diagnostic failures, not acceptance evidence.

**Tech Stack:** Node.js ESM, MySQL 8/9 loopback on `13306`, Redis `6380`, existing TerraPedia `pipelines/automation`, domain importers, and JSON evidence under `.local/tmp/`.

---

### Task 1: Real Buff full-capture isolated runner

**Files:**
- Modify: `pipelines/buff/buff-canonical-t1-acceptance.mjs`
- Test: `pipelines/buff/buff-canonical-t1-acceptance.test.mjs`
- Create: `pipelines/buff/run-full-recrawl-canonical-isolated.mjs`
- Test: `pipelines/buff/run-full-recrawl-canonical-isolated.test.mjs`

- [x] Add a full-capture input mode that validates 400 unique Buff identities and passes the records through the existing `importBuffs`, `runMaintSync`, and `runSync` calls.
- [x] Keep the current two-record fixture/source-replay contracts unchanged and require an explicit `fullCapture` option for the 400-record path.
- [x] Wrap the existing `runLiveAutomationAcceptance` T1 provisioner with Redis DB22, the fresh full capture, run-derived schemas, exact readback, and cleanup evidence.
- [x] Run focused tests, then execute the wrapper against the 2026-10-13 capture. Record the real full-chain counts and 13 unresolved source-item dependencies; no custom `recrawl_*` tables were used.

### Task 2: Isolated Armor maintained-chain runner

**Files:**
- Create: `pipelines/relation/run-armor-full-recrawl-canonical-isolated.mjs`
- Test: `pipelines/relation/run-armor-full-recrawl-canonical-isolated.test.mjs`
- Modify: `pipelines/relation/run-armor-canonical-ingestion.mjs` only if an isolated database target can be parameterized without weakening the formal target guard.

- [x] Provision run-derived local/maint/relation schemas using the existing T1 migration and readonly snapshot boundary.
- [x] Feed the fresh Armor set/image source bundle into maintained landing, maint, and relation/projection processors; seed the 243 positive set-item dependency closure from readonly snapshot rows.
- [x] Keep the separate authorization-gated Armor canonical operation untouched; the isolated test exercises the maintained importer/sync business path without consuming a formal policy packet.
- [x] Verify set, item, image, relation, and projection counts/row hashes and clean DB20, schemas, accounts, and child processes.

### Task 3: Isolated Shimmer maintained-chain runner

**Files:**
- Create: `pipelines/import/run-shimmer-full-recrawl-canonical-isolated.mjs`
- Test: `pipelines/import/run-shimmer-full-recrawl-canonical-isolated.test.mjs`
- Modify: `pipelines/import/import-wiki-shimmer-to-db.mjs` only to accept an explicitly isolated target and a manual isolated authorization mode that cannot target formal schemas.

- [x] Bind the fresh content-addressed generation and exact six-scope bundle to run-derived schemas and Redis DB24.
- [x] Reuse the Shimmer importer transaction and six-scope readback; preserve unresolved records as explicit partial rows and report their count.
- [x] Ensure the isolated mode rejects formal database names and does not consume canonical production permits or decision ledger entries.
- [x] Verify all six scope counts/hashes across the maintained local importer target and clean all temporary resources.

### Task 4: Evidence and handoff reconciliation

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-10-13-three-domain-full-recrawl-handoff.md`
- Create: `.local/tmp/full-recrawl-20261014/<domain>/<runKey>/isolated-real-ingestion.json`

- [ ] Record separate `source`, `realIsolatedIngestion`, `formalDatabaseWrites`, and `cleanup` fields for each domain.
- [x] Mark each domain complete only after its maintained importer/sync entrypoint wrote actual business tables and independent readback passed; record unresolved source dependencies explicitly.
- [x] Run `git diff --check`, focused importer/live tests, and read-only artifact consistency checks. Production natural probe dispatch remains a separate future Wiki-update event.
