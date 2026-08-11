# NPC T1 Governed Operation Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed governed operation path for isolated canonical NPC T1 acceptance without executing it.

**Architecture:** Register `canonical-npc-t1-acceptance` in the operation catalog. Its manifest freezes the CLI, private config hash, Redis DB, run ID, owner-completion/crawler evidence data bundle, and complete code bundle. The CLI accepts T1 only through a verified packet and one-time dispatch permit, and verifies the same private config hash before allocating resources.

**Tech Stack:** Node.js ESM, Node test runner, canonical authorization packet contracts, private `0600` artifacts.

---

### Task 1: Add RED Catalog And Manifest Coverage

**Files:**
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`

- [x] **Step 1: Add a failing governed-T1 manifest test**

Create a mode-`0600` temporary JSON config, build the manifest with
`canonical-npc-t1-acceptance`, and assert its command contains the fixed T1
profile/scope/output arguments, exact config path/hash, Redis DB, and run ID.
Assert `databaseWrites === false` and `isolatedResourceWrites === true`.

- [x] **Step 2: Add failing request/config-drift tests**

Assert the request requires only server fingerprint, data bundle, and execution
manifest hashes. Change the config bytes after manifest creation and assert
request construction rejects the manifest before authorization.

- [x] **Step 3: Run the focused tests and verify RED**

```bash
node --test \
  scripts/data/automation/canonical-operation-execution-manifest.test.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.test.mjs
```

Expected: the new operation is unsupported and its manifest cannot be built.

### Task 2: Register The Frozen Operation Contract

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`

- [x] **Step 1: Add the operation catalog and data evidence paths**

Register the operation with `run-live-automation-acceptance.mjs`. Bind the
canonical NPC input/completion artifacts and exact crawler evidence files via
the existing frozen-pair reader.

- [x] **Step 2: Add private config and isolated-resource manifest validation**

Require a private ordinary config file, hash its bytes, and freeze the absolute
path, SHA-256, Redis DB, and run ID. Rebuild and verify those values when a
request checks current technical input. Declare formal database writes false and
isolated resource writes true.

- [x] **Step 3: Tailor T1 technical fields**

Require `serverFingerprint`, `dataBundleSha256`, and
`executionManifestHash`. Retain full code bundle and argument contract checks;
do not add a schema or policy hash that does not govern this isolated operation.

- [x] **Step 4: Run manifest/request tests and verify GREEN**

Run the Task 1 command. Expected: all tests pass and config drift fails before
any Owner packet can be issued.

### Task 3: Require The Authorized Dispatch Boundary In The T1 CLI

**Files:**
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`

- [x] **Step 1: Add failing authorization/config-hash tests**

Exercise exported T1 CLI preflight helpers with a temporary private config.
Assert missing packet/permit, a symbolic-link or permissive config, and a hash
mismatch fail before the live acceptance function is called.

- [x] **Step 2: Implement the CLI-only T1 gate**

For `--profile=t1 --scope=npc-canonical`, require the operation ID
`canonical-npc-t1-acceptance`, load the authorized packet, consume its canonical
one-time permit, and verify `--config-sha256` against the private config bytes.
Keep T0's explicit environment gate unchanged and leave the reusable acceptance
function packet-agnostic for unit tests.

- [x] **Step 3: Run all T1 focused tests and verify GREEN**

```bash
node --test \
  scripts/data/automation/run-live-automation-acceptance.test.mjs \
  scripts/data/automation/canonical-operation-execution-manifest.test.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.test.mjs \
  scripts/data/npc-canonical/npc-canonical-t0-acceptance.test.mjs \
  scripts/data/npc-canonical/npc-canonical-t1-acceptance.test.mjs \
  scripts/data/npc-canonical/npc-canonical-readiness.test.mjs
git diff --check
```

Expected: all tests pass; no command creates an isolated resource.

### Task 4: Record The New Prerequisite

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

- [x] **Step 1: Keep Task 11 Step 5 unchecked**

Record that the new path can generate a request only after a fresh private
config and read-only server fingerprint are available. State that no request,
packet, isolated T1 run, or formal write occurred.

- [x] **Step 2: Validate the handoff**

Run `git diff --check` and scan active docs for `canonical-npc-t1-acceptance`.
Expected: the operation is described as request-ready, never as executed.

### Task 5: Repair Review-Found Packet Identity Gaps

**Files:**
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

- [x] **Step 1: Add failing child-side identity tests**

Prove that the manifest CLI forwards the private T1 config path, Redis DB, and
run ID. Prove a T1 child rejects a packet/config server-identity mismatch and a
packet/data-bundle mismatch before it consumes the permit or creates an
isolated resource.

- [x] **Step 2: Bind the private config and current completion to packet identity**

Freeze the normalized config endpoint identity in the manifest and require it
to match the authorized server fingerprint before permit consumption. Recompute
the current NPC completion/data-bundle identity in the child and require it to
match the packet-bound technical input before any isolated-resource allocation.
Only a future authorized CLI may make its bounded read-only server-UUID check
before permit consumption; this implementation task does not make that
connection.

- [x] **Step 3: Run focused repair tests and re-review**

Run the Task 3 focused suite plus the new negative cases, then syntax and diff
checks. A read-only re-review must find no remaining Critical or Important
packet-identity gap. Keep Task 11 Step 5 unchecked and do not generate a
request, packet, or T1 evidence artifact.

**Recorded result:** focused Node validation passed `57/57`; syntax and diff
checks passed; final read-only re-review found no Critical or Important issue.
No database, Redis, crawler, service, request, packet, isolated T1 run, formal
write, commit, or push occurred.
