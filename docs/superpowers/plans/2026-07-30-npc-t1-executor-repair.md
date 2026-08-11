# NPC T1 Executor Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the canonical NPC isolated T1 path so it can prove snapshot-bound rollback, restore, cleanup, and completion evidence without writing the formal databases.

**Architecture:** The runner reconstructs the owner-phase completion before it creates a temporary directory or isolated resource. A new NPC-only T1 executor validates the scrubbed copied snapshot and a four-hash `snapshotBinding` (`inputHash`, `completionHash`, `snapshotHash`, `verificationHash`). The generic live runner selects it only for `profile=t1`, retains its isolated transaction probe, then re-reads the completion after cleanup and rejects any generation drift before atomically writing the private artifact. The readiness writer independently recomputes the completion and validates the exact binding before accepting T1 flags. The shared 13-table contract remains a leaf module so T0, T1, and readiness have no ESM cycle.

**Tech Stack:** Node.js ESM, Node test runner, MySQL 8 isolated acceptance databases, Redis logical DB 1-14, and private `0600` JSON artifacts.

---

### Task 1: Add RED Scope And Evidence Tests

**Files:**
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-t1-acceptance.test.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.test.mjs`

- [x] **Step 1: Write the failing live-runner scope test**

Assert that an NPC T1 selection returns a distinct executor and that a T0
selection still returns the existing fixture executor:

```js
assert.equal(resolveAcceptanceExecutor({ profile: 't0', scope: 'npc-canonical' }), runNpcCanonicalT0Acceptance);
assert.equal(resolveAcceptanceExecutor({ profile: 't1', scope: 'npc-canonical' }), runNpcCanonicalT1Acceptance);
```

- [x] **Step 2: Run the scope test and verify RED**

Run:

```bash
node --test scripts/data/automation/run-live-automation-acceptance.test.mjs
```

Expected: the missing resolver/T1 executor makes the new assertion fail.

- [x] **Step 3: Write failing T1 evidence tests**

Create fixtures for a `t1` manifest containing a scrubbed `t2-readonly`
snapshot and `snapshotVerification.verified=true`. Prove the executor rejects
a non-T1 profile, an unverified copy, a missing required NPC table, and zero
source counts. Prove its success result carries exactly:

```js
{
  profile: 't1', status: 'passed',
  snapshot: { snapshotId, snapshotHash, verificationHash },
  snapshotBinding: { inputHash, completionHash, snapshotHash, verificationHash },
  npcSnapshot: { requiredTableCount: 13, sourceCounts },
}
```

- [x] **Step 4: Write failing readiness binding tests**

Give `writeNpcCanonicalReadinessReport` a private T1 artifact fixture. Assert
that matching `completionHash`, `inputHash`, `profile`, snapshot hashes,
`rollbackPassed`, `restorePassed`, and `cleanupPassed` produce valid T1 flags;
change each critical value once and assert the report is blocked.

### Task 2: Implement The Isolated T1 Executor

**Files:**
- Create: `scripts/data/npc-canonical/npc-canonical-t1-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`

- [x] **Step 1: Implement snapshot validation**

Export `runNpcCanonicalT1Acceptance({ profile, databases, manifest,
snapshotVerification, completion, snapshotBinding })`. Reject anything except `profile === 't1'`, a manifest
whose source snapshot is scrubbed/read-only/T2, and a verified copied snapshot.
Require the exact 13 NPC table pairs from `EXPECTED_NPC_T0_SCHEMA_EVIDENCE` to
exist in `manifest.sourceSnapshot.tables`, be source-available, and have a
positive `sourceCount`. Require the binding to match the provided completion
and copied-snapshot hashes exactly.

- [x] **Step 2: Implement profile/scope selection and result propagation**

Export a `resolveAcceptanceExecutor({ profile, scope })` helper. Pass
`snapshotVerification`, pre-read completion, and copied-snapshot binding to the selected executor. Keep the generic probe SQL
unchanged; it remains the only transaction mutation and is confined to the
run-key-isolated databases.

- [x] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
node --test \
  scripts/data/automation/run-live-automation-acceptance.test.mjs \
  scripts/data/npc-canonical/npc-canonical-t0-acceptance.test.mjs \
  scripts/data/npc-canonical/npc-canonical-t1-acceptance.test.mjs
```

Expected: all tests pass; T0 behavior is unchanged and T1 cannot target the
formal database names.

### Task 3: Persist And Consume Private T1 Evidence

**Files:**
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.test.mjs`

- [x] **Step 1: Add atomic private T1 result output**

For `--profile=t1 --scope=npc-canonical`, require an output below
`reports/canonical-migration/`. Write a mode-`0600` ordinary JSON file only
after the runner returns from cleanup. Store the run key, canonical completion
hash/input hash, source snapshot identity, copied-snapshot verification hash,
generic `rollback=[0,0,0]`, `restore=[0,0,0]`, `cleanupPassed=true`, and the
exact four-hash `snapshotBinding`. The runner must reject a missing pre-read
completion before it creates a temporary directory or isolated resource, and
must reject a changed post-cleanup completion before it writes evidence.

- [x] **Step 2: Bind readiness to the artifact**

Make the readiness writer read only a private ordinary T1 artifact at the fixed
canonical path. It must recompute the current owner-phase completion first,
compare the completion/input hashes, validate the four-hash snapshot binding,
all three isolation flags, and snapshot identities, and leave T1 false on any
mismatch or unreadable artifact.

- [x] **Step 3: Run readiness tests and verify GREEN**

Run:

```bash
node --test \
  scripts/data/npc-canonical/npc-canonical-readiness.test.mjs \
  scripts/data/automation/run-live-automation-acceptance.test.mjs \
  scripts/data/npc-canonical/npc-canonical-t1-acceptance.test.mjs
git diff --check
```

Expected: all tests pass and the report cannot claim T1 from fixture, forged,
public, stale, or cleanup-incomplete evidence.

### Task 4: Update The Closure Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Record the repaired prerequisite**

Keep Task 11 Step 5 unchecked. State that its isolated T1 execution is enabled
only after this repair's tests pass and a fresh, exact operation request binds
the final manifest/configuration bytes. Do not change the 86-step parent
denominator or mark any formal data work complete.

- [x] **Step 2: Validate documentation consistency**

Run:

```bash
git diff --check
rg -n "npc.*T1|isolated T1|T1 executor" \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md \
  docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md
```

Expected: all active records describe T1 as pending an isolated run, not as a
formal-data write or a completed milestone.
