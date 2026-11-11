# Buff Variant Empty-Scope Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce identity-bound, revision-bound empty infliction evidence for shared NPC variants without weakening the Buff write fence.

**Architecture:** Add a pure parser/evidence helper beside the existing NPC page evidence code. It consumes the retained raw capture and target manifest, emits private read-only evidence rows, and passes only complete rows into the existing variant scope contract. Any missing or ambiguous field remains `unknown` and preserves baseline.

**Tech Stack:** Node.js ESM, existing NPC parser, Node test runner, SHA-256 evidence hashes, JSON artifacts under `.local/tmp/`.

---

### Task 1: Lock the empty-scope contract with failing tests

**Files:**
- Modify: `pipelines/fetch/buff-npc-variant-scope-contract.test.mjs`
- Test input: existing synthetic raw-page fixtures in the test file

- [x] **Step 1: Write the failing tests**

Add tests for a complete empty row that binds `npcSourceId`, `npcInternalName`, page/revision identity, raw hash, parsed field names, and an empty `debuffFieldNames` array. Add rejection tests for missing field completeness, target debuff fields, raw-hash drift, duplicate stable IDs, and positive facts assigned to the target.

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test pipelines/fetch/buff-npc-variant-scope-contract.test.mjs
```

Expected: the new complete-empty and rejection assertions fail because no producer-level empty evidence contract exists yet.

### Task 2: Implement the pure empty-scope evidence builder

**Files:**
- Create: `pipelines/fetch/buff-npc-variant-empty-scope-evidence.mjs`
- Test: `pipelines/fetch/buff-npc-variant-empty-scope-evidence.test.mjs`

- [x] **Step 1: Implement the smallest parser contract**

Export a pure builder that accepts raw page entries, target rows, and expected source hashes. It must select exactly one target infobox by stable `auto` ID, retain the complete normalized field-name set, reject malformed or incomplete blocks, report every `debuff*` field, and emit a row only when that list is empty. Include page/revision/raw hashes and the page-wide positive-owner diagnostics.

- [x] **Step 2: Run producer tests and verify GREEN**

Run:

```bash
node --test pipelines/fetch/buff-npc-variant-empty-scope-evidence.test.mjs pipelines/fetch/buff-npc-variant-scope-contract.test.mjs
```

Expected: all new contract tests pass and the existing safety tests remain green.

### Task 3: Generate a bounded read-only diagnostic from retained capture

**Files:**
- Create: `.local/tmp/build-buff-npc-variant-empty-scope-evidence-20261005.mjs`
- Create: `.local/tmp/buff-npc-variant-empty-scope-evidence-20261005.json`
- Modify: `docs/audits/2026-10-05-buff-variant-empty-scope-evidence.md`

- [x] **Step 1: Build from frozen inputs**

Read `.local/tmp/buff-npc-infliction-capture-20261001-v6-derived3/pages/capture.json`, its 443 raw pages, `targets.json`, and the verified 68-gap classification. Refuse any input hash drift, network request, database access, output collision, or missing page. Emit a private artifact with one row per gap, counts, input hashes, output hash, `databaseWrites=false`, `networkRequests=0`, and `executable=false`.

- [x] **Step 2: Replay the contract**

Feed only rows that pass the complete-empty evidence builder into
`buildBuffNpcVariantScopeContract`. Verify the report still preserves every
389-400 missing baseline and never produces an executable candidate.

### Task 4: Integrated validation and devlog update

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-09-29-automation-domain-buff.md`

- [x] **Step 1: Run validation**

Run:

```bash
node --test pipelines/fetch/buff-npc-variant-empty-scope-evidence.test.mjs pipelines/fetch/buff-npc-variant-scope-contract.test.mjs pipelines/fetch/buff-npc-page-evidence.test.mjs pipelines/fetch/buff-npc-infliction-evidence.test.mjs
node --check pipelines/fetch/buff-npc-variant-empty-scope-evidence.mjs
git diff --check
```

- [x] **Step 2: Record exact result and remaining blockers**

Record artifact hashes and counts. Keep canonical landing/maint/relation/
projection blocked unless every unresolved row has admissible evidence and an
independent owner authorization exists.
