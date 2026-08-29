# NPC Duplicate Relation Retirement Implementation Plan

> **For agentic workers:** Execute this plan inline with test-first validation. Database mutation remains forbidden until a fresh exact Owner approval binds the generated proposal, packet, and one-time permit.

**Goal:** Register a governed, fail-closed operation that can retire only the Item-admission crawler relation `item_npc_loot_relations.id=1551` while preserving canonical relation `id=609` for `UndeadMiner -> MiningHelmet`.

**Architecture:** Add a dedicated operation and executor with a read-only proposal builder, exact relation-row fingerprint checks, and one-row soft-disable apply. Register the operation in the canonical catalog and execution manifest so authorization hashes bind the new code and proposal. Generate the proposal and approval packet only; do not consume a permit in this run.

**Tech Stack:** Node.js ESM, Node test runner, mysql2 through existing repository helpers, canonical operation authorization/manifest utilities.

---

### Task 1: Contract and catalog registration

**Files:**
- Create: `pipelines/npc-canonical/npc-duplicate-relation-retirement.mjs`
- Create: `pipelines/npc-canonical/npc-duplicate-relation-retirement.test.mjs`
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`

- [x] Write a failing contract test proving the operation accepts one exact target, rejects relation/source/projection drift, and produces a read-only proposal.
- [x] Run the focused test and confirm it fails because the operation module and catalog entry do not exist.
- [x] Implement the smallest executor: read-only target/proposal builder, exact `status=1/deleted=0` checks, governed authorization context for apply, one relation soft-disable, and post-transaction readback.
- [x] Register operation ID `canonical-npc-loot-duplicate-relation-retirement`, its input/proposal paths, entrypoint, code bundle, write target, and command in the catalog/manifest.
- [x] Run the focused test and canonical manifest/authorization contract tests (`77/77`).

### Task 2: Fresh read-only proposal

**Files:**
- Create: `reports/runtime/local-data-chain-closure/20260825/parent-final-1055/npc-duplicate-relation-retirement.proposal.json`
- Create: `reports/authorization/canonical/canonical-npc-loot-duplicate-relation-retirement.input.json`
- Create: `reports/authorization/canonical/canonical-npc-loot-duplicate-relation-retirement.request.json`
- Create: bilingual owner approval sheet under the same closure run root.

- [x] Read current relation `1551`, canonical survivor `609`, and projection row `44` without DML.
- [x] Freeze exact before fingerprint, target/survivor keys, and scope hash.
- [x] Generate proposal with `applyAllowed=false`, `databaseWrites=false`, `externalRequests=false`, expected changed rows `1`, and write target `relation.item_npc_loot_relations.status_deleted`.
- [x] Generate an `AWAITING_OWNER` request whose packet/permit are not consumed or fabricated.

### Task 3: Validation and handoff

**Files:**
- Modify: `docs/devlog/entries/2026-08-23-session-handoff-remaining-closure.md`
- Modify: `docs/devlog/current.md`
- Create: fresh bilingual blocker/proposal index entries under `parent-final-1055`.

- [x] Validate proposal JSON and hashes, run `git diff --check`, and confirm zero staged paths.
- [x] Keep parent status `blocked` until the user provides exact approval and the governed apply/readback completes.
