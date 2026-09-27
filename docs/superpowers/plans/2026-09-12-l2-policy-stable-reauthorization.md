# L2 Policy-Stable Reauthorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit one fresh, per-domain, append-only `L2_PROMOTION` decision when an existing `L2/ACTIVE` policy's prior promotion decision has expired, without mutating that policy or replaying prior authorization.

**Architecture:** Add eight explicit `automation-<domain>-l2-reauthorization` operations. A fresh read-only capture binds the current L2 policy/H8 identity and one exact predecessor-L1 evidence identity; a proposal and packet bind those values. The decision runner locks and rechecks current policy, H8, stale predecessor, writer/fence state, and three committed L1/full-reconciliation evidence records before inserting a new immutable L2 decision. It never calls the policy update path.

**Tech Stack:** Node.js ESM, existing MySQL automation adapter, canonical authorization bundle/manifest contracts, Node test runner.

---

### Task 1: Define the Reauthorization Contract

**Files:**
- Create: `pipelines/automation/l2-policy-stable-reauthorization.mjs`
- Test: `pipelines/automation/l2-policy-stable-reauthorization.test.mjs`

- [ ] **Step 1: Write failing pure-contract tests**

  Cover a valid current `L2/ACTIVE` policy with current H8 and one expired
  prior L2 decision; reject an `L1` policy, a fresh prior decision, mismatched
  H8/current policy identity, fewer than three L1 runs, missing full
  reconciliation identity, and a target policy that differs from current L2.

- [ ] **Step 2: Run the focused test and observe RED**

  Run: `node --test pipelines/automation/l2-policy-stable-reauthorization.test.mjs`

- [ ] **Step 3: Implement the minimal immutable input/proposal validators**

  Require `reauthorization=true`, operation/domain pairing, current policy
  version/hash/H8, predecessor-L1 version/hash/policy-set, exact current L2
  target identity, prior decision expiry, and the minimum three-run/full-
  reconciliation requirement. Do not expose a policy-level transition field.

- [ ] **Step 4: Run the focused test and observe GREEN**

  Run: `node --test pipelines/automation/l2-policy-stable-reauthorization.test.mjs`

### Task 2: Capture and Authorize Fresh Inputs

**Files:**
- Create: `pipelines/automation/capture-l2-policy-stable-reauthorization-input.mjs`
- Create: `pipelines/automation/build-l2-policy-stable-reauthorization-proposal.mjs`
- Test: `pipelines/automation/capture-l2-policy-stable-reauthorization-input.test.mjs`
- Test: `pipelines/automation/build-l2-policy-stable-reauthorization-proposal.test.mjs`

- [ ] **Step 1: Write failing capture/proposal tests**

  Require `START TRANSACTION READ ONLY`; capture only the current L2 row,
  current H8 rows, server fingerprint, latest expired L2 decision identity,
  and one exact predecessor-L1 evidence tuple. Require all private outputs to
  be confined, `0600`, atomic, and no-overwrite. Proposal tests must prove the
  current L2 policy is both current and target and no policy update is planned.

- [ ] **Step 2: Run focused tests and observe RED**

  Run: `node --test pipelines/automation/capture-l2-policy-stable-reauthorization-input.test.mjs pipelines/automation/build-l2-policy-stable-reauthorization-proposal.test.mjs`

- [ ] **Step 3: Implement capture and proposal CLIs**

  Preserve existing canonical authorization paths and never copy historical
  packet, owner-input, request, result, or commit-marker files. Evidence
  references are read-only bindings and must remain exact at consumption.

- [ ] **Step 4: Run focused tests and observe GREEN**

  Run: `node --test pipelines/automation/capture-l2-policy-stable-reauthorization-input.test.mjs pipelines/automation/build-l2-policy-stable-reauthorization-proposal.test.mjs`

### Task 3: Consume Reauthorization Without Policy Mutation

**Files:**
- Modify: `pipelines/automation/run-automation-policy-decision.mjs`
- Test: `pipelines/automation/run-automation-policy-decision.test.mjs`

- [ ] **Step 1: Write failing runner tests**

  Verify a valid reauthorization inserts exactly one `L2_PROMOTION` decision
  with current L2 policy/H8 and performs no `updatePolicy`; verify rejection
  before insertion for fresh predecessor, current-policy/H8 drift, active
  attempt/reservation/fence, missing three L1 records, or invalid full
  reconciliation evidence.

- [ ] **Step 2: Run the selected tests and observe RED**

  Run: `node --test pipelines/automation/run-automation-policy-decision.test.mjs --test-name-pattern='reauthorization'`

- [ ] **Step 3: Implement the one new decision mode**

  Add only explicit reauthorization operation definitions. Reuse transaction,
  server fingerprint, Owner, data-bundle, fence, L1 evidence, pending-result,
  and commit-marker checks. Use predecessor-L1 identity for evidence lookup;
  use current L2 identity/H8 for the inserted decision. Keep the existing
  `L1 -> L2` promotion behavior byte-for-byte equivalent.

- [ ] **Step 4: Run runner tests and observe GREEN**

  Run: `node --test pipelines/automation/run-automation-policy-decision.test.mjs`

### Task 4: Register Canonical Operation and Manifest Bindings

**Files:**
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`
- Test: `pipelines/automation/canonical-operation-execution-manifest.test.mjs`
- Test: `pipelines/automation/build-canonical-cutover-authorization.test.mjs`

- [ ] **Step 1: Write failing catalog/manifest tests**

  Assert eight exact IDs, matching retry-label input/result paths, content-
  addressed private proposal data, and rejection of mixed operation/domain or
  label paths.

- [ ] **Step 2: Run focused tests and observe RED**

  Run: `node --test pipelines/automation/canonical-operation-execution-manifest.test.mjs pipelines/automation/build-canonical-cutover-authorization.test.mjs`

- [ ] **Step 3: Add only the eight explicit reauthorization entries**

  Bind the capture/proposal/runner code paths to each manifest; no generic
  wildcard operation ID may become executable.

- [ ] **Step 4: Run focused tests and observe GREEN**

  Run: `node --test pipelines/automation/canonical-operation-execution-manifest.test.mjs pipelines/automation/build-canonical-cutover-authorization.test.mjs`

### Task 5: Validate and Resume Runtime

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-31-automation-scheduler-activation-handoff.md`

- [ ] **Step 1: Run the focused new/changed Node suites and full automation suite**

  Run: `node --test pipelines/automation/*.test.mjs`

- [ ] **Step 2: Record the code checkpoint and fresh runtime boundary**

  Record only validation, residual risk, fresh H8/runtime identities, and the
  new reauthorization prerequisite. Do not commit generated reports or
  private authorization material.

- [ ] **Step 3: Capture, authorize, and consume eight fresh decisions serially**

  Generate fresh no-overwrite input/proposal/request/packet/result chains one
  domain at a time. Read back each inserted decision before proceeding. Stop
  on any policy/H8/evidence/fence drift; do not replay prior artifacts.

- [ ] **Step 4: Create a fresh scheduler preflight and continue Phase 3-7**

  Build a new scheduler packet only after all eight decisions are current.
  Enable only through the authenticated API, observe a natural tick, and keep
  the existing no-manual-sweep/no-synthetic-source-change rules.
