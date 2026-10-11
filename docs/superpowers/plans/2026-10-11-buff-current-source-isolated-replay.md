# Buff Current-Source Isolated Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run current revision-bound Wiki source for Buffs `153/ShadowFlame` and `70/Venom` through parsing, landing, maint, relation/projection, and consumer readback using only Redis DB18 and run-derived T1 databases. The separate fixture test window remains on Redis DB13.

**Architecture:** Add a bounded manual capture path for `Template:GetBuffInfo`, `Module:Iteminfo/data`, and the two current Buff pages. Persist raw revision-bound inputs and normalized records under `.local/tmp`, publish monitor-visible canonical Buff progress, then pass the source replay into the existing isolated T1 executor with real Wiki landing metadata. Keep the existing fixture acceptance contract intact and make source replay an explicitly separate input type.

**Tech Stack:** Node.js ESM, MediaWiki API, existing Buff page parser, existing T1 isolated automation provisioner and Buff canonical import/maint/relation pipeline.

---

### Task 1: Build the bounded current-source capture contract

**Files:**
- Create: `pipelines/fetch/buff-current-source-replay.mjs`
- Test: `pipelines/fetch/buff-current-source-replay.test.mjs`
- Modify: `pipelines/fetch/fetch-wiki-buffs.mjs` only to export its existing Template parser if needed

- [x] Write tests proving the source scope is exactly `153:ShadowFlame` and `70:Venom`, every captured page/module has page ID, revision ID, timestamp and SHA-256, each parsed page is complete, source item names resolve uniquely through revision-bound Iteminfo rows, and fixture artifacts cannot pass as source replay.
- [x] Run the focused test and confirm it fails because the source replay contract is absent.
- [x] Implement revision-bound current-module capture, page revision-bound fetch, source parsing, source-item identity binding, immutable snapshot hashing, and rejection of IDs outside the fixed scope.
- [x] Implement atomic canonical progress at the existing shared-data path `sharedDataPath('generated', 'fetch-wiki-buffs-progress.latest.json')`, including a heartbeat before the first network request and terminal `completed`/`failed`; do not write crawler state to shared Redis.
- [x] Rerun the focused tests and syntax check.

### Task 2: Support real Wiki records in isolated Buff T1 acceptance

**Files:**
- Modify: `pipelines/buff/buff-canonical-t1-acceptance.mjs`
- Test: `pipelines/buff/buff-canonical-t1-acceptance.test.mjs`

- [x] Add tests that real-source landing uses `terraria.wiki.gg`, revision-bound page metadata, the source snapshot hash and `source_kind=revision_bound_wiki_pages`, while the fixture landing keeps its existing offline-fixture labels.
- [x] Add tests that real-source input requires both exact Buff identities, complete parser evidence, positive unique source item IDs, revision/hash bindings, and rejects formal databases and DB14/15/16.
- [x] Run the focused test and confirm the real-source path fails before implementation.
- [x] Generalize dependency closure and exact downstream/readback assertions to the actual record counts while retaining the frozen fixture assertions.
- [x] Rerun the focused T1 acceptance tests.

### Task 3: Add a manual replay entrypoint and run isolation

**Files:**
- Create: `platform/local/run-buff-current-source-replay.sh`
- Test: `platform/local/run-buff-current-source-replay.test.mjs`
- Create: runtime artifacts under `.local/tmp/`

- [x] Test that the shell wrapper accepts no arbitrary paths, databases, Redis DBs, or commands and invokes only the Node replay entrypoint.
- [x] Implement the runner to preflight empty Redis DB18, require loopback MySQL/Redis, capture and validate the real source snapshot, run existing T1 provisioning with an injected source-replay executor, retain source and failure artifacts, verify run-derived identity, and verify DB18 cleanup.
- [x] Run wrapper, source contract, T1 acceptance, and automation safety tests.
- [x] Execute the bounded current-source replay. Require source parser completeness, exact T1 Buff identity, landing/maint/relation/projection closure, consumer readback, cleanup, and a post-run readback confirming the production Buff scheduler remains disabled.

### Task 4: Record evidence and close the task state

**Files:**
- Update: `docs/devlog/entries/2026-09-29-automation-domain-buff.md`
- Update: `docs/devlog/current.md`
- Update: this plan

- [x] Record raw source page/revision/hash bindings, snapshot hash, run identity, database and Redis isolation, landing/maint/relation/consumer readback, cleanup, and production isolation evidence.
- [x] Run focused Node tests, `node --check`, `bash -n`, and `git diff --check`.
- [x] Leave production Buff automation disabled and report any source/acceptance mismatch as a failure with the retained artifact paths.

### Stop Conditions

- Stop if the live source does not resolve to exactly Buff IDs `153/ShadowFlame` and `70/Venom`.
- Stop if any source page/module lacks a stable page ID, revision ID, valid timestamp, content hash, or complete parser result.
- Stop if page source items cannot be mapped uniquely to the captured Iteminfo revision.
- Stop if Redis DB18 is non-empty, any target database is formal, any Redis DB other than 18 is selected for source replay, or production scheduler state would need to change. The fixture window's DB13 reservation is a separate workflow and is not reused here.
- Stop and retain artifacts on relation mismatch, non-terminal progress, failed cleanup, or any attempt to write a formal runtime table.
