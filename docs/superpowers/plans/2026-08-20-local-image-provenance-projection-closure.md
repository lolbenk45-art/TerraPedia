# Local Image Provenance And Buff Projection Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore locally proven Item image provenance for exactly 2,117 records and populate exactly 388 existing Buff projection image values without replacing cached assets or rebuilding image layers.

**Architecture:** Two independent governed operations consume the frozen local-only scope preview at `reports/runtime/local-data-chain-closure/20260819/post-final/scheme-a-local-image-scope-preview.json`. The Item operation makes only optimistic, row-scoped updates to `source_page`, `source_revision_timestamp`, and `original_url` in maint, relation, and local; local MySQL confirms all three relation columns exist. The Buff operation makes only optimistic, row-scoped updates to `terria_v1_relation.projection_buffs.image` from the already-linked Buff relation cached URL. Both operations bind a fresh input contract, authorization packet, one-time permit, transaction, readback result, and dated report before any database write.

**Tech Stack:** Node.js ESM, `node:test`, MySQL 8 via `mysql2`, existing canonical-operation authorization and execution-manifest helpers, three local TerraPedia databases.

---

## Scope And Boundaries

- In scope: `2,117` exact Item candidates from raw local Wiki evidence; `388` existing Buff projection rows; source provenance fields; Buff projection `image`; readback and image readiness reports.
- Quarantine: `FallenStar` and `SeveredHandBanner`. They never enter a contract, permit, query key list, or update statement.
- Preserved exactly: Item cached URL, source file title, role, dimensions, content type, landing lineage, record keys, local identity, all image objects, all non-Item/non-Buff image domains, and the existing three-column relation schema (no schema expansion).
- Out of scope: downloader/crawler/external requests, direct SQL console repair, full `canonical-item-image-lineage-apply`, relation/local rebuild, Item projection managed-URL repair, NPC/Projectile/Armor/Biome changes, permit creation, and database mutation before explicit owner authorization for a newly generated packet.

### Task 1: Freeze Operation Contracts And Registry

**Files:**
- Create: `pipelines/relation/item-image-provenance-patch.mjs`
- Create: `pipelines/relation/item-image-provenance-patch.test.mjs`
- Create: `pipelines/relation/buff-image-projection-patch.mjs`
- Create: `pipelines/relation/buff-image-projection-patch.test.mjs`
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`
- Test: matching catalog and execution-manifest suites

- [ ] **Step 1: Write failing Item-contract tests.** The test fixture has two exact candidates and two quarantine candidates. Require the Item operation to reject a scope count other than 2,117 in the real contract, a stale preview hash, any quarantined identity, a changed cached URL/source file title/landing lineage, a missing raw evidence hash, and a write target outside the three provenance columns.
- [ ] **Step 2: Run the focused Item test and observe failure because the module does not exist.**

  Run: `node --test pipelines/relation/item-image-provenance-patch.test.mjs`

  Expected: fail with module-not-found or missing exported contract validator.

- [ ] **Step 3: Implement the minimal Item contract parser and immutable mutation plan.** It must recompute the scope hash from the frozen preview, require `apply=true`, `databaseWrites=true`, `externalRequests=false`, and derive exactly one maint ID, relation ID, and local image ID for each Item. Its write targets must be the same three provenance columns in each layer. It must expose only the before/after provenance fields, retain immutable fields for stale-row checks, and reject any duplicate or quarantined identity.
- [ ] **Step 4: Write failing Buff-contract tests.** Require one existing relation-image row and one existing projection row per identity; reject a non-null pre-existing projection image, a cached URL change, a relation/source mismatch, a count other than 388, and a write target other than `relation.projection_buffs.image`.
- [ ] **Step 5: Run the focused Buff test and observe failure because the module does not exist.**

  Run: `node --test pipelines/relation/buff-image-projection-patch.test.mjs`

  Expected: fail with module-not-found or missing exported contract validator.

- [ ] **Step 6: Implement the minimal Buff contract parser and immutable mutation plan.** The only after-value is the existing relation cached URL. The plan must contain no source/maint/landing/local mutation target.
- [ ] **Step 7: Register both operation IDs with the canonical catalog and execution-manifest code bundles.** The entry points must be the new scripts, data paths must bind the fresh input and frozen preview, and the manifest must reject an altered command, code hash, or data path.
- [ ] **Step 8: Run the four focused contract/registration suites.**

  Run: `node --test pipelines/relation/item-image-provenance-patch.test.mjs pipelines/relation/buff-image-projection-patch.test.mjs pipelines/automation/canonical-operation-catalog.test.mjs pipelines/automation/canonical-operation-execution-manifest.test.mjs`

  Expected: all pass.

### Task 2: Add Transactional, Fail-Closed Executors

**Files:**
- Modify: `pipelines/relation/item-image-provenance-patch.mjs`
- Modify: `pipelines/relation/item-image-provenance-patch.test.mjs`
- Modify: `pipelines/relation/buff-image-projection-patch.mjs`
- Modify: `pipelines/relation/buff-image-projection-patch.test.mjs`

- [ ] **Step 1: Write failing Item executor tests.** Use a fake MySQL connection to prove that a stale maint/relation/local row aborts before any update, every update constrains immutable before-fields and affects exactly one row, only `source_page`, `source_revision_timestamp`, and `original_url` are assigned, all three layers are read back before commit, and an error rolls back.
- [ ] **Step 2: Run the Item executor test and observe the expected failure.**

  Run: `node --test pipelines/relation/item-image-provenance-patch.test.mjs`

  Expected: fail because no executor performs the constrained transaction.

- [ ] **Step 3: Implement the Item executor.** Before opening MySQL, require a current authorized packet and unconsumed one-time permit. In one transaction, lock the exact scoped rows, validate raw evidence file hashes and all before-fields, issue the same constrained three-column update in maint, relation, and local, read back the exact after-fields and preserved fields, then commit. Write a private result only after commit. Do not create a landing, add schema columns, delete or insert a row, or mutate a cached URL.
- [ ] **Step 4: Write failing Buff executor tests.** Prove the executor locks the exact relation-image and projection rows, accepts only a null projection image, updates only `projection_buffs.image`, aborts on source/projection drift, verifies all 388 values on readback, and rolls back on an affected-row mismatch.
- [ ] **Step 5: Run the Buff executor test and observe the expected failure.**

  Run: `node --test pipelines/relation/buff-image-projection-patch.test.mjs`

  Expected: fail because no executor performs the constrained transaction.

- [ ] **Step 6: Implement the Buff executor.** It must use the same authorization/permit guard and a one-table update transaction. It reads the corresponding relation image only as evidence; it must not update it.
- [ ] **Step 7: Run both focused executor suites.**

  Run: `node --test pipelines/relation/item-image-provenance-patch.test.mjs pipelines/relation/buff-image-projection-patch.test.mjs`

  Expected: all pass, including stale-row and rollback cases.

### Task 3: Generate Fresh No-Write Authorization Materials

**Files:**
- Create: dated reports under `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/`
- Create: private operation inputs under `reports/authorization/canonical/`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-17-local-eight-domain-complete-chain.md`

- [ ] **Step 1: Run both executors with `--apply=false` and current local-row preflight.** Produce one Item preview/input/manifest request and one Buff preview/input/manifest request. Refuse to produce a request if any row changed from the 2026-08-19 frozen scope.
- [ ] **Step 2: Verify the exact scopes.** Item must declare `2117` maint, `2117` relation, and `2117` local rows with the three provenance columns in each layer, with the two quarantined identities excluded. Buff must declare `388` `projection_buffs.image` updates and zero writes to every other table or column.
- [ ] **Step 3: Run local static tests, `git diff --check`, and report hashes.** No permit, packet authorization, DB update, external request, crawler, image transfer, staging, commit, cleanup, or discard is performed in this task.
- [ ] **Step 4: Record the two exact request hashes and the deliberate authorization pause in the active devlog.**

### Task 4: Authorized Execution And Runtime Readback

**Files:**
- Create: authorized packet/permit/result artifacts only after owner approval
- Create: dated post-apply reports under `reports/runtime/local-data-chain-closure/20260820/image-provenance-closure/`

- [ ] **Step 1: Stop until the owner explicitly authorizes the two new packet hashes.** Authorization is separate for Item provenance and Buff projection; either may be authorized without the other.
- [ ] **Step 2: Apply the authorized Item operation, then read back all 6,351 field updates.** Require all cache URLs/source file titles/landing lineage values unchanged and confirm the two quarantined records are untouched.
- [ ] **Step 3: Apply the authorized Buff operation, then read back all 388 projection values.** Require relation image evidence unchanged.
- [ ] **Step 4: Re-run `image-asset-readiness-audit`, `image-source-lineage-report`, focused API/proxy smoke, and the focused image suites.** The final report must distinguish resolved Item provenance from remaining Item asset, non-managed projection, NPC, Projectile, Armor, Biome, and quarantined-record gaps. Do not claim total image closure unless all entity contracts turn green.

## Plan Audit

- Goal lock: the measurable target is two bounded data corrections, not a broad image sync or total image closure.
- Source-chain lock: local raw Item page evidence and existing relation Buff image cache are authoritative; downstream consumers are maint/relation/local provenance, Buff projection, image readiness, APIs, and proxies.
- Boundary lock: no object download/replacement, no row creation/deletion, no full image writer, and no external source access.
- Evidence lock: unit contracts, stale-row/rollback tests, input/manifest hashes, transaction readback, and post-apply readiness/API checks are required.
- Continuity: any preflight drift invalidates the request and creates a fresh read-only preview; it never broadens the write scope.
- Multi-agent safety: schema/provenance/catalog reviews are read-only; the coordinator alone writes operation code, registry, reports, and devlog.

## Execution Status (2026-08-20)

- [x] Task 1: Item and Buff contracts, registries, and execution manifests implemented and focused-tested.
- [x] Task 2: Fail-closed transactional executors implemented; stale-row, drift, rollback, timestamp, and readback tests pass.
- [x] Task 3: Fresh no-write previews, inputs, manifests, policy bindings, and exact request hashes generated.
- [x] Task 4: Freshly authorized Item and Buff packets executed once; Item read back `6,351` row-layer updates / `19,053` provenance fields and Buff read back `388` projection values.
- [x] Post-apply local MinIO/object/API smoke and image/data readiness reruns recorded under `reports/runtime/local-data-chain-closure/20260820/`.
- [ ] Overall image closure remains open: Item projection evidence is invalid/missing, Biome has no maint/relation/projection image contract, and residual Item/NPC asset gaps remain. No additional write is authorized by this plan.
